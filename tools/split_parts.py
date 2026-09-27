#!/usr/bin/env python3
"""Cut the film into parts that join back without a seam.

GitHub refuses files over 100 MB and chat attachments are capped too, so the
film travels in parts. A naive keyframe split (ffmpeg's segment muxer) leaves
each part's sound tens of milliseconds longer or shorter than its picture and
shifted against it (the old parts: audio starting 60-80 ms before the cut,
lengths off by up to 74 ms), so wherever two parts meet a player or an editor
repeats or drops a little sound and holds a frame: an audible, visible hiccup.

Here every cut falls on a frame that is
  * a multiple of 64 frames, where the 24 fps picture grid and the
    1024-sample AAC frame grid (48 kHz) line up exactly (64/24 s = 125 AAC
    frames), and
  * an IDR frame of the source (tools/render.mjs --keyframes puts them there;
    `encode` does it while making a smaller copy).
Nothing is re-encoded. Each part's picture is the source's frames between two
cuts, stream-copied. Each part's sound is the source's own AAC packets for
exactly the same span, plus one packet before it as pre-roll: the MP4 edit
list tells the decoder to decode that packet and throw its output away, so
the part's first real sample decodes exactly as in the whole film (no
fade-in, no click), and the part ends with its picture on a whole AAC frame.
Played one after another, laid end to end in an editor, or re-joined with
ffmpeg, the parts give back every frame and every sample of the film;
`verify` checks it frame by frame (decoded picture checksums) and sample by
sample against the source.

usage:
  split_parts.py plan SRC.mp4 --max-mb 85
  split_parts.py split SRC.mp4 --cuts 1536,3072 --out video --prefix name
  split_parts.py encode SRC.mp4 --size 1280:720 --crf 22 --audio build/mix.wav --max-mb 28 --out DIR --prefix name
  split_parts.py verify DIR/parts.txt --src SRC.mp4
"""
import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

FPS = 24
SR = 48000
G = 64  # frames: the common grid of 24 fps and 1024-sample AAC frames at 48 kHz
SPF = SR // FPS  # samples per frame (2000)


def run(args, **kw):
    return subprocess.run(args, check=True, capture_output=True, **kw)


def video_packets(src):
    """(frame index, size, is_key) per video packet, frames by presentation time"""
    out = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=time_base', '-of', 'json', src]).stdout
    tb = json.loads(out)['streams'][0]['time_base'].split('/')
    tb = int(tb[0]) / int(tb[1])
    out = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts,size,flags', '-of', 'csv=p=0', src]).stdout.decode()
    pk = []
    for line in out.split():
        pts, size, flags = line.split(',')[:3]
        pk.append((round(int(pts) * tb * FPS), int(size), 'K' in flags))
    pk.sort()
    return pk


def shot_starts():
    try:
        tl = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'build', 'timeline.json')))
        return {s['start'] for s in tl['shots']}
    except OSError:
        return set()


def plan(src, max_bytes, audio_kbps):
    pk = video_packets(src)
    n = len(pk)
    per_frame = np.zeros(n)
    for f, size, _ in pk:
        per_frame[f] += size
    per_frame += audio_kbps * 1000 / 8 / FPS
    cum = np.concatenate([[0], np.cumsum(per_frame)])
    total = cum[-1]
    parts = max(1, math.ceil(total / (max_bytes * 0.92)))
    while True:
        cuts = []
        shots = {f for f in shot_starts() if f % G == 0}
        for k in range(1, parts):
            target = total * k / parts
            f = int(np.searchsorted(cum, target))
            c = int(round(f / G)) * G
            # a grid frame that is also a shot change, if one is close: a join
            # that falls on a cut is invisible even to a player that stumbles
            near = [x for x in shots if abs(cum[min(x, n)] - target) < total / parts * 0.18]
            if near:
                c = min(near, key=lambda x: abs(x - f))
            if 0 < c < n and (not cuts or c > cuts[-1]):
                cuts.append(c)
        bounds = [0] + cuts + [n]
        sizes = [cum[b] - cum[a] for a, b in zip(bounds, bounds[1:])]
        if max(sizes) <= max_bytes * 0.97:
            return cuts, sizes, n
        parts += 1


def keyframes(src):
    return {f for f, _, k in video_packets(src) if k}


def audio_packets(src):
    """presentation timestamps (in samples) of the source's AAC packets"""
    out = run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'packet=pts', '-of', 'csv=p=0', src]).stdout.decode()
    return [int(x.split(',')[0]) for x in out.split()]


def adts_frames(path):
    """byte ranges of the frames of an ADTS stream"""
    b = open(path, 'rb').read()
    fr, i = [], 0
    while i < len(b):
        if not (b[i] == 0xFF and (b[i + 1] & 0xF0) == 0xF0):
            sys.exit(f'{path}: lost ADTS sync at byte {i}')
        n = ((b[i + 3] & 3) << 11) | (b[i + 4] << 3) | ((b[i + 5] & 0xE0) >> 5)
        fr.append(b[i:i + n])
        i += n
    return fr


def split(src, cuts, out, prefix):
    pk = video_packets(src)
    n = len(pk)
    keys = {f for f, _, k in pk if k}
    bad = [c for c in cuts if c % G or c not in keys or not 0 < c < n]
    if bad:
        sys.exit(f'cuts must be multiples of {G} frames on IDR frames of the source; not usable: {bad}')
    apts = audio_packets(src)
    if any(b - a != 1024 for a, b in zip(apts, apts[1:])):
        sys.exit('the source audio is not a continuous stream of 1024-sample AAC frames')
    index = {p: i for i, p in enumerate(apts)}
    os.makedirs(out, exist_ok=True)
    bounds = [0] + list(cuts) + [n]
    names = []
    with tempfile.TemporaryDirectory() as tmp:
        allaac = os.path.join(tmp, 'all.aac')
        run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-map', '0:a:0', '-c', 'copy', '-f', 'adts', allaac])
        frames = adts_frames(allaac)
        if len(frames) != len(apts):
            sys.exit('ADTS frame count does not match the source packets')
        for k, (a, b) in enumerate(zip(bounds, bounds[1:]), 1):
            # the picture: stream-copied from IDR frame a, exactly b - a frames
            v = os.path.join(tmp, f'v{k}.mp4')
            run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{a / FPS + 0.001:.6f}', '-i', src, '-map', '0:v:0', '-c', 'copy',
                 '-frames:v', str(b - a), '-avoid_negative_ts', 'make_zero', v])
            # the sound: the source's packets for the same span, with one packet
            # of pre-roll in front (decoded, then dropped by the edit list)
            i0 = index[a * SPF]
            i1 = index[b * SPF] if b < n else len(apts)
            aac = os.path.join(tmp, f'a{k}.aac')
            with open(aac, 'wb') as fh:
                fh.write(b''.join(frames[i0 - 1:i1]))
            name = f'{prefix}_part{k}.mp4'
            run(['ffmpeg', '-y', '-v', 'error', '-i', v, '-itsoffset', f'{-1024 / SR:.9f}', '-i', aac, '-map', '0:v', '-map', '1:a',
                 '-c', 'copy', '-movflags', '+faststart', os.path.join(out, name)])
            names.append(name)
            print(f'  {name}: frames {a}..{b} ({(b - a) / FPS:.3f} s)  {os.path.getsize(os.path.join(out, name)) / 1e6:.1f} MB')
    with open(os.path.join(out, 'parts.txt'), 'w') as fh:
        fh.write(''.join(f"file '{nm}'\n" for nm in names))
    return names


def encode(src, size, crf, wav, max_bytes, out, prefix, audio_kbps, preset='slow', fixed=None):
    """a smaller copy (IDR frames on the planned cuts, the mix encoded once
    without noise substitution), then split it"""
    vf = f'scale={size}:flags=lanczos'
    with tempfile.TemporaryDirectory() as tmp:
        if fixed:
            cuts = list(fixed)
        else:
            probe = os.path.join(tmp, 'probe.mp4')
            run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-map', '0:v:0', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast',
                 '-crf', str(crf), '-tune', 'animation', probe])
            # plan on a fast probe encode (its sizes run a little high)
            cuts, _, _ = plan(probe, max_bytes * 0.92, audio_kbps)
        for attempt in range(4):
            # kept next to the parts (as the reference for `verify`)
            full = os.path.join(out, f'{prefix}_full.mp4')
            os.makedirs(out, exist_ok=True)
            times = ','.join(f'{c / FPS:.6f}' for c in cuts)
            run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-vf', vf,
                 '-c:v', 'libx264', '-preset', preset, '-crf', str(crf), '-tune', 'animation', '-x264-params', 'aq-mode=3',
                 '-force_key_frames', times, '-forced-idr', '1',
                 '-c:a', 'aac', '-b:a', f'{audio_kbps}k', '-aac_pns', '0', '-shortest', full])
            keys = keyframes(full)
            sizes = part_sizes(full, cuts)
            if all(c in keys for c in cuts) and max(sizes) <= max_bytes:
                return split(full, cuts, out, prefix)
            if fixed:
                sys.exit(f'parts too big with these cuts: {[round(x / 1e6, 1) for x in sizes]} MB')
            cuts, _, _ = plan(full, max_bytes * 0.95, audio_kbps)
        sys.exit('could not fit the parts under the size limit')


def part_sizes(src, cuts):
    """exact sizes of the parts cut from src (video + audio packet bytes)"""
    pk = video_packets(src)
    n = len(pk)
    per = np.zeros(n)
    for f, size, _ in pk:
        per[f] += size
    out = run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'packet=pts,size', '-of', 'csv=p=0', src]).stdout.decode()
    for line in out.split():
        pts, size = map(int, line.split(',')[:2])
        f = min(n - 1, max(0, pts // SPF))
        per[f] += size
    bounds = [0] + list(cuts) + [n]
    return [per[a:b].sum() * 1.004 + 60000 for a, b in zip(bounds, bounds[1:])]


def frame_md5(path):
    out = run(['ffmpeg', '-v', 'error', '-i', path, '-map', '0:v:0', '-f', 'framemd5', '-']).stdout.decode()
    return [line.split(',')[-1].strip() for line in out.splitlines() if line and not line.startswith('#')]


def decode_audio(path):
    raw = run(['ffmpeg', '-v', 'error', '-i', path, '-map', '0:a:0', '-f', 'f32le', '-']).stdout
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2)


def db(x):
    return 20 * np.log10(max(float(x), 1e-12))


def verify(parts_txt, src):
    base = os.path.dirname(os.path.abspath(parts_txt))
    names = [line.split("'")[1] for line in open(parts_txt) if line.strip()]
    ok = True
    ref = decode_audio(src)
    src_md5 = frame_md5(src)
    got_md5, got_audio = [], []
    pos = 0
    print(f'{"part":<36} {"frames":>6} {"picture s":>10} {"sound s":>10} {"starts":>11} {"sound vs film":>14}')
    for name in names:
        p = os.path.join(base, name)
        info = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,start_time,duration', '-of', 'json', p]).stdout)
        st = {s['codec_type']: s for s in info['streams']}
        md5 = frame_md5(p)
        nf = len(md5)
        got_md5 += md5
        a = decode_audio(p)
        got_audio.append(a)
        last = name == names[-1]
        want = ref[pos * SPF:] if last else ref[pos * SPF:(pos + nf) * SPF]
        n_ok = len(a) == len(want) and (len(a) == nf * SPF or (last and 0 <= len(a) - nf * SPF < 1024))
        m = min(len(a), len(want))
        same = np.array_equal(a[:m], want[:m])
        diff = 'identical' if same else f'{db(np.sqrt(np.mean((a[:m] - want[:m]) ** 2))):.1f} dBFS'
        sv, sa = float(st['video']['start_time']), float(st['audio']['start_time'])
        dv = float(st['video']['duration'])
        good = n_ok and same and abs(sv) < 1e-6 and abs(sa) < 1e-6 and abs(dv - nf / FPS) < 1e-6
        ok &= good
        print(f'{name:<36} {nf:>6} {dv:>10.4f} {len(a) / SR:>10.4f} {sv:>5.3f}/{sa:<5.3f} {diff:>14}  {"ok" if good else "BAD"}')
        pos += nf
    same_pic = got_md5 == src_md5
    joined = np.concatenate(got_audio)
    same_snd = len(joined) == len(ref) and np.array_equal(joined, ref)
    ok &= same_pic and same_snd
    print(f'laid end to end: {len(got_md5)} frames (film: {len(src_md5)}), every picture identical: {same_pic}; '
          f'{len(joined)} samples (film: {len(ref)}), every sample identical: {same_snd}')
    with tempfile.TemporaryDirectory() as tmp:
        j = os.path.join(tmp, 'joined.mp4')
        join(parts_txt, j)
        jm = frame_md5(j)
        ja = decode_audio(j)
        jsame = jm == src_md5 and len(ja) == len(ref) and np.array_equal(ja, ref)
        ok &= jsame
        print(f're-joined into one file (split_parts.py join): {len(jm)} frames, {len(ja)} samples, identical to the film: {jsame}')
    print('ALL JOINS SEAMLESS' if ok else 'PROBLEMS FOUND')
    return ok


def join(parts_txt, out):
    """rebuild the whole film from its parts, stream for stream"""
    base = os.path.dirname(os.path.abspath(parts_txt))
    names = [line.split("'")[1] for line in open(parts_txt) if line.strip()]
    with tempfile.TemporaryDirectory() as tmp:
        v = os.path.join(tmp, 'v.mp4')
        run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', os.path.abspath(parts_txt), '-map', '0:v', '-c', 'copy', v])
        frames = []
        for k, name in enumerate(names):
            a = os.path.join(tmp, f'a{k}.aac')
            run(['ffmpeg', '-y', '-v', 'error', '-i', os.path.join(base, name), '-map', '0:a:0', '-c', 'copy', '-f', 'adts', a])
            fr = adts_frames(a)
            # every part but the first opens with one packet of pre-roll that
            # repeats the previous part's last packet
            frames += fr if k == 0 else fr[1:]
        aac = os.path.join(tmp, 'a.aac')
        with open(aac, 'wb') as fh:
            fh.write(b''.join(frames))
        run(['ffmpeg', '-y', '-v', 'error', '-i', v, '-itsoffset', f'{-1024 / SR:.9f}', '-i', aac, '-map', '0:v', '-map', '1:a',
             '-c', 'copy', '-movflags', '+faststart', out])
    print(f'wrote {out}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['plan', 'split', 'encode', 'verify', 'join'])
    ap.add_argument('dest', nargs='?')
    ap.add_argument('path')
    ap.add_argument('--src')
    ap.add_argument('--audio', default='build/mix.wav')
    ap.add_argument('--cuts', default='')
    ap.add_argument('--out', default='video')
    ap.add_argument('--prefix', default='toward-the-sea_1080p')
    ap.add_argument('--max-mb', type=float, default=85)
    ap.add_argument('--audio-kbps', type=int, default=256)
    ap.add_argument('--size', default='1280:720')
    ap.add_argument('--crf', type=float, default=22)
    a = ap.parse_args()
    if a.cmd == 'plan':
        cuts, sizes, n = plan(a.path, a.max_mb * 1e6, a.audio_kbps)
        print(','.join(map(str, cuts)))
        print(' '.join(f'{s / 1e6:.1f}MB' for s in sizes), f'({n} frames)', file=sys.stderr)
    elif a.cmd == 'split':
        split(a.path, [int(c) for c in a.cuts.split(',') if c], a.out, a.prefix)
    elif a.cmd == 'encode':
        encode(a.path, a.size, a.crf, a.audio, a.max_mb * 1e6, a.out, a.prefix, a.audio_kbps,
               fixed=[int(c) for c in a.cuts.split(',') if c] or None)
    elif a.cmd == 'join':
        join(a.path, a.dest or 'joined.mp4')
    else:
        sys.exit(0 if verify(a.path, a.src) else 1)


if __name__ == '__main__':
    main()
