#!/usr/bin/env python3
"""The score for 去看海吧, composed in code and synthesized (no samples).

Instruments: an additive piano (inharmonic partials, per-partial decay, hammer
noise, stereo chorus), a warm string pad, and a soft bell. A synthetic
convolution reverb glues them together. Cues are placed on the film timeline
by tools/mix.py.
"""
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt

SR = 48000


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def n(name):
    """'F#5' -> midi"""
    acc = 0
    base = NOTE[name[0]]
    rest = name[1:]
    while rest and rest[0] in '#b':
        acc += 1 if rest[0] == '#' else -1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + base + acc


# ------------------------------------------------------------------ instruments
_rng = np.random.default_rng(7)


def piano(m, dur, vel=0.6, sr=SR):
    """one piano note: returns stereo array (N, 2)"""
    f0 = mtof(m)
    tail = min(6.0, 2.5 + 3.5 * max(0, (72 - m) / 36))
    N = int((dur + tail) * sr)
    t = np.arange(N) / sr
    B = 0.00035 * (1 + max(0, m - 60) / 30)
    out = np.zeros(N)
    bright = 0.35 + 0.65 * vel
    tau0 = 1.6 + 3.0 * max(0, (84 - m) / 48)
    for k in range(1, 13):
        fk = k * f0 * np.sqrt(1 + B * k * k)
        if fk > sr * 0.45:
            break
        a = (1 / k ** 1.15) * (bright ** (k - 1) * 0.9 + 0.1)
        tau = tau0 / (1 + 0.35 * (k - 1))
        # two-stage decay (prompt + aftersound)
        env = 0.72 * np.exp(-t / (tau * 0.35)) + 0.28 * np.exp(-t / tau)
        out += a * env * np.sin(2 * np.pi * fk * t + _rng.uniform(0, 2 * np.pi))
    # damper at note off
    off = int(dur * sr)
    if off < N:
        out[off:] *= np.exp(-(np.arange(N - off) / sr) / 0.18)
    # attack + hammer noise
    att = np.minimum(1, t / 0.004)
    out *= att
    hn = _rng.standard_normal(int(0.03 * sr)) * np.exp(-np.arange(int(0.03 * sr)) / (0.006 * sr))
    sos = butter(2, [min(0.99, 1500 / (sr / 2)), min(0.99, 6000 / (sr / 2))], btype='band', output='sos')
    hn = sosfilt(sos, hn) * 0.15 * vel
    out[: len(hn)] += hn
    out *= vel
    # stereo: pan by pitch + slight chorus
    pan = np.clip((m - 60) / 40, -0.6, 0.6)
    L = out * np.sqrt(0.5 * (1 - pan))
    R = np.roll(out, 12) * np.sqrt(0.5 * (1 + pan))
    return np.stack([L, R], axis=1)


def pad(ms, dur, vel=0.3, sr=SR, attack=1.6, release=2.4):
    """string-like pad chord (list of midi notes)"""
    N = int((dur + release) * sr)
    t = np.arange(N) / sr
    out = np.zeros((N, 2))
    for m in ms:
        for det, side in ((-0.06, 0), (0.07, 1), (0.0, None)):
            f = mtof(m) * 2 ** (det / 12)
            vib = 1 + 0.0025 * np.sin(2 * np.pi * 5.2 * t + _rng.uniform(0, 6))
            ph = 2 * np.pi * np.cumsum(f * vib) / sr
            s = np.zeros(N)
            for k in range(1, 9):
                if f * k > 9000:
                    break
                s += np.sin(k * ph) / k * (0.75 ** (k - 1))
            if side is None:
                out[:, 0] += s * 0.5
                out[:, 1] += s * 0.5
            else:
                out[:, side] += s
    env = np.minimum(1, t / attack) * np.where(t < dur, 1, np.exp(-(t - dur) / (release / 3)))
    out *= env[:, None] * vel / (len(ms) * 2.5)
    sos = butter(2, 2600 / (sr / 2), output='sos')
    return sosfilt(sos, out, axis=0)


def bell(m, vel=0.3, sr=SR):
    f = mtof(m)
    N = int(3.0 * sr)
    t = np.arange(N) / sr
    s = np.zeros(N)
    for ratio, a, tau in ((1, 1, 1.4), (2.76, 0.4, 0.6), (5.4, 0.2, 0.25), (8.93, 0.08, 0.12)):
        s += a * np.exp(-t / tau) * np.sin(2 * np.pi * f * ratio * t)
    s *= np.minimum(1, t / 0.002) * vel
    return np.stack([s * 0.8, np.roll(s, 30) * 0.8], axis=1)


def reverb_ir(sec=3.2, sr=SR, seed=3):
    r = np.random.default_rng(seed)
    N = int(sec * sr)
    t = np.arange(N) / sr
    ir = r.standard_normal((N, 2)) * np.exp(-t / (sec / 5.5))[:, None]
    sos = butter(1, 5200 / (sr / 2), output='sos')
    ir = sosfilt(sos, ir, axis=0)
    pre = int(0.022 * sr)
    ir = np.vstack([np.zeros((pre, 2)), ir])
    # a few early reflections
    for d, g in ((0.011, 0.5), (0.019, 0.35), (0.031, 0.25)):
        k = int(d * sr)
        ir[k, 0] += g
        ir[k + 17, 1] += g
    return ir / np.sqrt((ir ** 2).sum() / 2)


def place(buf, x, at):
    i = max(0, int(at * SR))
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i]


# ------------------------------------------------------------------ the score
BPM = 64
Q = 60 / BPM  # quarter note seconds

# melody of the theme: (note, beats); None = rest
THEME = [
    ('A4', 1.5), ('D5', 0.5), ('E5', 1), ('F#5', 1),
    ('E5', 2), ('C#5', 1), ('A4', 1),
    ('D5', 1.5), ('C#5', 0.5), ('B4', 1), ('F#5', 1),
    ('E5', 3), ('D5', 1),
    ('D5', 1), ('F#5', 1), ('A5', 2),
    ('G5', 1.5), ('F#5', 0.5), ('E5', 1), ('D5', 1),
    ('E5', 2), ('G5', 1), ('F#5', 1),
    ('E5', 3), ('C#5', 1),
    ('D5', 4),
]
# chord per bar: bass note + chord tones
CHORDS = [
    ('D3', ['D4', 'F#4', 'A4']), ('C#3', ['E4', 'A4', 'C#5']), ('B2', ['D4', 'F#4', 'B4']), ('G2', ['D4', 'G4', 'B4']),
    ('F#2', ['D4', 'F#4', 'A4']), ('G2', ['E4', 'G4', 'B4']), ('E2', ['D4', 'G4', 'B4']), ('A2', ['D4', 'E4', 'A4']),
    ('D3', ['D4', 'F#4', 'A4', 'E5']),
]


def theme(bars=9, vel=0.55, octave=0, arpeggio='broken', pad_vel=0.0, start_bar=0, bell_top=False):
    """render bars [start_bar, start_bar+bars) of the theme; returns (dry stereo, length s)"""
    total = bars * 4 * Q + 7
    buf = np.zeros((int(total * SR), 2))
    # melody
    beat = 0
    for name, beats in THEME:
        bar = int(beat // 4)
        if start_bar <= bar < start_bar + bars:
            at = (beat - start_bar * 4) * Q
            m = n(name) + 12 * octave
            human = _rng.uniform(-0.012, 0.012)
            v = vel * (0.9 + 0.2 * _rng.random())
            place(buf, piano(m, beats * Q * 0.95, v), at + human)
            if bell_top:
                place(buf, bell(m + 12, 0.08), at + human)
        beat += beats
    # accompaniment
    for b in range(start_bar, min(len(CHORDS), start_bar + bars)):
        bass, tones = CHORDS[b]
        at = (b - start_bar) * 4 * Q
        place(buf, piano(n(bass), 4 * Q * 0.9, vel * 0.55), at)
        if arpeggio == 'broken':
            seq = [tones[0], tones[1], tones[2], tones[1]]
            for k, name in enumerate((seq * 2)[:7]):
                place(buf, piano(n(name) - 12 + (12 if k % 4 == 2 else 0), Q * 0.45, vel * 0.3), at + (k + 1) * 0.5 * Q)
        elif arpeggio == 'block':
            for name in tones:
                place(buf, piano(n(name) - 12, 4 * Q * 0.8, vel * 0.28), at + 0.02 * _rng.random())
        if pad_vel > 0:
            place(buf, pad([n(bass) + 12] + [n(t) for t in tones], 4 * Q, pad_vel, attack=1.2, release=2.0), at)
    return buf


def sparse_notes(notes, vel=0.4):
    """a few lonely notes: list of (time s, note name, dur s)"""
    total = max(t for t, _, _ in notes) + 8
    buf = np.zeros((int(total * SR), 2))
    for t, name, d in notes:
        place(buf, piano(n(name), d, vel), t)
    return buf


def wet(buf, amount=0.35, ir=None):
    ir = reverb_ir() if ir is None else ir
    w = np.stack([fftconvolve(buf[:, c], ir[:, c])[: len(buf)] for c in range(2)], axis=1)
    return buf * (1 - amount * 0.4) + w * amount


def cues():
    """name -> stereo buffer (already reverberated)"""
    ir = reverb_ir()
    out = {}
    # dawn at the edge of the city: first half of the theme, piano alone, soft
    out['dawn'] = wet(theme(bars=4, vel=0.42, arpeggio='broken'), 0.42, ir)
    # the night: a lonely pad chord (B minor add9) and two high notes
    night = np.zeros((int(26 * SR), 2))
    place(night, pad([n('B2'), n('F#3'), n('D4'), n('C#5')], 16, 0.22, attack=5, release=6), 0)
    place(night, sparse_notes([(5.0, 'F#5', 2.5), (9.5, 'C#5', 3.0), (14.5, 'D5', 4.0)], 0.22), 0)
    out['night'] = wet(night, 0.55, ir)
    # snow: tiny figure in a big white world — three echoing high notes
    out['snow'] = wet(sparse_notes([(0, 'A5', 2), (2.2, 'E6', 2.5), (4.6, 'F#5', 4)], 0.18), 0.6, ir)
    # the sea: full theme with pad and gentle bell doubling
    out['sea'] = wet(theme(bars=9, vel=0.5, arpeggio='broken', pad_vel=0.35, bell_top=True), 0.38, ir)
    # the beach: brighter, an octave up, block chords, lighter
    out['beach'] = wet(theme(bars=8, vel=0.38, octave=1, arpeggio='block', pad_vel=0.18), 0.4, ir)
    # the postcard found: the theme's first four notes on piano and bell,
    # over a faint D add9 pad (a promise of the melody that comes at the sea)
    disc = np.zeros((int(14 * SR), 2))
    place(disc, pad([n('D3'), n('A3'), n('E4'), n('F#4')], 6.5, 0.16, attack=2.2, release=4), 0)
    for t0, name, d in ((0.6, 'A4', 0.9), (1.35, 'D5', 0.6), (1.95, 'E5', 0.9), (2.9, 'F#5', 3.4)):
        place(disc, piano(n(name), d, 0.34), t0)
        place(disc, bell(n(name) + 12, 0.05), t0)
    out['discover'] = wet(disc, 0.5, ir)
    # the postcard lost: the same four notes falling, in B minor, left unresolved
    loss = np.zeros((int(20 * SR), 2))
    place(loss, pad([n('B2'), n('F#3'), n('D4')], 9, 0.18, attack=3, release=6), 0)
    for t0, name, d in ((1.2, 'F#5', 1.4), (2.8, 'E5', 1.2), (4.2, 'D5', 1.6), (6.4, 'C#5', 4.0)):
        place(loss, piano(n(name), d, 0.3), t0)
    place(loss, piano(n('B3'), 5, 0.22), 6.4)
    out['loss'] = wet(loss, 0.55, ir)
    # end credits: solo piano reprise ending on D add9
    end = theme(bars=4, vel=0.4, arpeggio='broken')
    tail = np.zeros((int(10 * SR), 2))
    for name in ('D3', 'A3', 'D4', 'F#4', 'E5'):
        place(tail, piano(n(name), 6, 0.35), 0.02 * _rng.random())
    end = np.vstack([end[: int(16 * Q * SR)], tail])
    out['end'] = wet(end, 0.45, ir)
    return out


if __name__ == '__main__':
    import soundfile as sf
    import os
    c = cues()
    os.makedirs('build/music', exist_ok=True)
    for k, v in c.items():
        v = v / max(1e-9, np.abs(v).max()) * 0.8
        sf.write(f'build/music/{k}.wav', v.astype(np.float32), SR)
        print(k, f'{len(v) / SR:.1f}s')
