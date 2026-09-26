#!/usr/bin/env python3
"""Soundtrack mixer for 去看海吧.

Everything is placed from the animation itself: build/timeline.json holds
every event the performances recorded (paw steps with their surface, jumps,
landings, splashes, shakes, the paper, thunder, waves...) plus ambience cues
per shot. This script lays down:

  * ambience beds per sequence (looped CC0 recordings, cross-faded at cuts),
  * spot effects on the exact frames of the events (recordings cut into
    one-shots by onset detection, or small synthesized sounds where no good
    recording exists: soft paw pads, sniffs, licks, a sneeze, a can),
  * delicate cues for the emotion marks (!, ?, sparkles, notes),
  * the score (tools/music.py) at the story beats,

then masters to about -16 LUFS with a gentle limiter.

usage: python3 tools/mix.py [--timeline build/timeline.json] [--out build/mix.wav]
"""
import argparse
import json
import os
import sys
import hashlib

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly, fftconvolve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'audio', 'src')
SR = 48000
sys.path.insert(0, os.path.join(ROOT, 'tools'))


def h01(*k):
    """deterministic hash -> [0, 1)"""
    s = hashlib.md5(repr(k).encode()).digest()
    return int.from_bytes(s[:4], 'little') / 2 ** 32


# ----------------------------------------------------------------- sources
_cache = {}


def load(name):
    if name in _cache:
        return _cache[name]
    path = os.path.join(SRC, name + '.ogg')
    if not os.path.exists(path):
        _cache[name] = None
        return None
    d, sr = sf.read(path, always_2d=True)
    if d.shape[1] == 1:
        d = np.repeat(d, 2, axis=1)
    d = d[:, :2]
    if sr != SR:
        g = np.gcd(sr, SR)
        d = resample_poly(d, SR // g, sr // g, axis=0)
    d = d - d.mean(axis=0)  # remove DC
    _cache[name] = d.astype(np.float64)
    return _cache[name]


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)) + 1e-12)


def filt(x, lo=None, hi=None, order=2):
    if lo and hi:
        sos = butter(order, [lo / (SR / 2), hi / (SR / 2)], btype='band', output='sos')
    elif lo:
        sos = butter(order, lo / (SR / 2), btype='high', output='sos')
    elif hi:
        sos = butter(order, hi / (SR / 2), btype='low', output='sos')
    else:
        return x
    return sosfilt(sos, x, axis=0)


def fade(x, fin=0.01, fout=0.05):
    n = len(x)
    a, b = int(fin * SR), int(fout * SR)
    env = np.ones(n)
    if a > 0:
        env[:min(a, n)] = np.linspace(0, 1, min(a, n))
    if b > 0:
        env[max(0, n - b):] *= np.linspace(1, 0, n - max(0, n - b))
    return x * env[:, None]


def loop_to(x, n, xf=1.5, offset=0.0):
    """loop a bed to n samples with equal-power cross-faded seams"""
    k = int(xf * SR)
    if len(x) < 2 * k + SR:
        reps = int(np.ceil(n / len(x))) + 1
        return np.tile(x, (reps, 1))[:n]
    fin = np.sin(np.linspace(0, np.pi / 2, k))[:, None]
    fout = np.cos(np.linspace(0, np.pi / 2, k))[:, None]
    out = np.zeros((n, 2))
    start = int(offset * len(x)) % max(1, len(x) - 2 * k)
    pos = 0
    first = True
    while pos < n:
        seg = x[start:]
        if not first:
            seg = seg.copy()
            seg[:k] *= fin
        L = min(len(seg), n - pos)
        out[pos:pos + L] += seg[:L]
        if pos + L >= n:
            break
        pos += L - k
        out[pos:pos + k] -= seg[L - k:L] * (1 - fout)  # fade the tail of what we just laid
        start = 0
        first = False
    return out[:n]


def onsets(x, thresh=0.25, min_gap=0.12, win=0.25):
    """cut a recording into one-shot snippets at its onsets"""
    m = np.abs(x).mean(axis=1)
    k = int(0.005 * SR)
    env = np.convolve(m, np.ones(k) / k, mode='same')
    env /= env.max() + 1e-12
    cuts = []
    i = 0
    gap = int(min_gap * SR)
    while i < len(env) - 1:
        if env[i] > thresh and (not cuts or i - cuts[-1] > gap):
            j = max(0, i - int(0.01 * SR))
            cuts.append(j)
            i += gap
        else:
            i += 1
    L = int(win * SR)
    out = []
    for c in cuts:
        s = x[c:c + L]
        if len(s) < L // 2:
            continue
        s = fade(s, 0.003, 0.08)
        out.append(s / (np.abs(s).max() + 1e-9))
    return out


_pools = {}


def pool(name, **kw):
    key = (name, tuple(sorted(kw.items())))
    if key not in _pools:
        x = load(name)
        _pools[key] = onsets(x, **kw) if x is not None else []
    return _pools[key]


# ----------------------------------------------------------------- synthesis
_rng = np.random.default_rng(11)


def noise(sec, seed=0):
    r = np.random.default_rng(seed)
    return r.standard_normal(int(sec * SR))


def st(x, pan=0.0):
    """mono -> stereo with constant-power pan (-1..1)"""
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def paw(surface, strength=1.0, seed=0):
    """a soft paw pad touching down"""
    n = int(0.12 * SR)
    x = noise(0.12, seed)
    if surface in ('pavement', 'wet'):
        body = filt(x, 900, 4200) * env_exp(n, 0.012) * 0.8
        if surface == 'wet':
            sp = filt(noise(0.12, seed + 7), 2500, 9000) * env_exp(n, 0.03) * 0.5
            sp[: int(0.008 * SR)] *= 0.2
            body = body + sp
    elif surface == 'grass':
        body = filt(x, 1500, 7000) * env_exp(n, 0.035) * 0.7
    elif surface == 'dirt':
        body = filt(x, 300, 2500) * env_exp(n, 0.02) * 0.9
    elif surface == 'wood':
        t = np.arange(n) / SR
        body = (np.sin(2 * np.pi * 420 * t) * 0.5 + filt(x, 600, 3000) * 0.5) * env_exp(n, 0.015)
    else:
        body = filt(x, 500, 3000) * env_exp(n, 0.015)
    thump = np.sin(2 * np.pi * 110 * np.arange(n) / SR) * env_exp(n, 0.01) * 0.4
    return (body + thump) * strength


def whoosh(sec=0.35, lo=400, hi=2500, seed=0):
    n = int(sec * SR)
    x = filt(noise(sec, seed), lo, hi)
    t = np.linspace(0, 1, n)
    return x * np.sin(np.pi * t) ** 2


def sniff(seed=0):
    x = filt(noise(0.09, seed), 2500, 8000)
    n = len(x)
    e = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5
    return x * e * 0.6


def lick(seed=0):
    n = int(0.08 * SR)
    x = filt(noise(0.08, seed), 1800, 6000) * env_exp(n, 0.02)
    t = np.arange(n) / SR
    x += np.sin(2 * np.pi * (900 - 3000 * t) * t) * env_exp(n, 0.015) * 0.3
    return x * 0.5


def sneeze(seed=0):
    # a tiny "tchi": a short tonal attack and a burst of air
    t = np.arange(int(0.25 * SR)) / SR
    tone = np.sin(2 * np.pi * (1700 + 600 * np.exp(-t * 40)) * t) * np.exp(-t * 60) * 0.3
    air = filt(noise(0.25, seed), 3000, 11000) * np.exp(-np.maximum(0, t - 0.02) * 25) * (t > 0.015)
    return tone + air * 0.7


def yawn(seed=0):
    """a tiny kitten yawn: a squeaky rising-falling glide with a breathy tail"""
    dur = 0.95
    t = np.arange(int(dur * SR)) / SR
    f0 = 520 + 260 * np.sin(np.pi * np.clip(t / 0.5, 0, 1)) - 160 * np.clip((t - 0.5) / 0.45, 0, 1)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    v = sum(np.sin(k * ph) / k ** 1.3 for k in range(1, 8))
    v = filt(v, 700, 2600)
    e = np.minimum(1, t / 0.08) * np.clip((dur - t) / 0.25, 0, 1) * (0.6 + 0.4 * np.sin(np.pi * t / dur))
    air = filt(noise(dur, seed), 1200, 6000) * np.clip((t - 0.55) / 0.1, 0, 1) * np.clip((dur - t) / 0.3, 0, 1) * 0.35
    return v * e * 0.7 + air


def thwap(seed=0, f=140):
    """a soft flat slap / bump (paper on a face, a bottom on the ground)"""
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.03)
    slap = filt(noise(0.18, seed), 400, 3500) * np.exp(-t / 0.012)
    return body * 0.7 + slap * 0.6


def sweep(dur, f0, f1, seed=0):
    """a filtered noise sweep (time slowing down / speeding up)"""
    n = int(dur * SR)
    x = noise(dur, seed)
    out = np.zeros(n)
    k = 8
    for i in range(k):
        a, b = i * n // k, (i + 1) * n // k
        fc = f0 * (f1 / f0) ** ((i + 0.5) / k)
        out[a:b] = filt(x, max(60, fc * 0.6), min(20000, fc * 1.6))[a:b]
    return out * np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5


def pant_breath(sec, seed=0):
    x = filt(noise(sec, seed), 700, 4000)
    t = np.arange(len(x)) / SR
    rate = 4.2
    e = np.maximum(0, np.sin(2 * np.pi * rate * t)) ** 2
    return x * e * 0.35


def clink(f0=1700, seed=0, dur=0.6):
    """metal can: inharmonic partials"""
    t = np.arange(int(dur * SR)) / SR
    r = np.random.default_rng(seed)
    x = np.zeros_like(t)
    for k, (ratio, a, tau) in enumerate([(1, 1, 0.18), (2.32, 0.6, 0.12), (3.9, 0.4, 0.08), (5.4, 0.25, 0.05)]):
        x += a * np.sin(2 * np.pi * f0 * ratio * (1 + r.uniform(-0.01, 0.01)) * t) * np.exp(-t / tau)
    x += filt(noise(dur, seed + 3), 2000, 9000) * np.exp(-t / 0.01) * 0.6
    return x * 0.5


def bell(f, dur=1.6, a=0.25):
    t = np.arange(int(dur * SR)) / SR
    x = np.zeros_like(t)
    for ratio, g, tau in ((1, 1, 0.9), (2.76, 0.35, 0.4), (5.4, 0.15, 0.18)):
        x += g * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / tau)
    return x * np.minimum(1, t / 0.002) * a


def pluck(f, dur=0.5, a=0.25):
    t = np.arange(int(dur * SR)) / SR
    x = np.zeros_like(t)
    for k in range(1, 6):
        x += np.sin(2 * np.pi * f * k * t) * np.exp(-t * (6 + 5 * k)) / k
    return x * np.minimum(1, t / 0.003) * a


def droplets(sec, n, seed=0):
    out = np.zeros(int(sec * SR))
    r = np.random.default_rng(seed)
    for i in range(n):
        at = int(r.uniform(0, sec - 0.05) * SR)
        f = r.uniform(1800, 4200)
        L = int(0.04 * SR)
        t = np.arange(L) / SR
        d = np.sin(2 * np.pi * (f + 2500 * t) * t) * np.exp(-t * 90) * r.uniform(0.3, 1)
        out[at:at + L] += d
    return out * 0.3


# ----------------------------------------------------------------- the mix
class Mix:
    def __init__(self, seconds):
        self.n = int(seconds * SR) + SR * 2
        self.bus = {k: np.zeros((self.n, 2)) for k in ('amb', 'fx', 'foley', 'music', 'ui')}

    def add(self, bus, x, at, gain=1.0, pan=0.0):
        if x is None:
            return
        if x.ndim == 1:
            x = st(x, pan)
        elif pan:
            a = (pan + 1) * np.pi / 4
            x = np.stack([x[:, 0] * np.cos(a) * 1.41, x[:, 1] * np.sin(a) * 1.41], axis=1)
        i = int(round(at * SR))
        if i >= self.n:
            return
        if i < 0:
            x = x[-i:]
            i = 0
        j = min(self.n, i + len(x))
        self.bus[bus][i:j] += x[: j - i] * gain


def db(x):
    return 10 ** (x / 20)


def pk(x):
    """normalise a one-shot to peak 1"""
    if x is None:
        return None
    return x / (np.abs(x).max() + 1e-12)


def lv(x, target):
    """scale a one-shot so its loudest 400 ms (K-weighted) sits at `target`
    LUFS: story sounds are set by how loud they are heard, not by their peak"""
    if x is None:
        return None
    y = x if x.ndim == 2 else st(x)
    blk, hop = int(0.4 * SR), int(0.05 * SR)
    z = kweight(np.vstack([y, np.zeros((blk, 2))]))
    c = np.cumsum(np.vstack([np.zeros((1, 2)), z ** 2]), axis=0)
    idx = np.arange(0, max(1, len(z) - blk), hop)
    ms = ((c[idx + blk] - c[idx]) / blk).sum(axis=1).max()
    return x * db(target - (-0.691 + 10 * np.log10(ms + 1e-12)))


# beds per ambience name: [(source, target LUFS, lowpass, highpass, mode)]
# Each layer is levelled (loud bursts tamed, dropouts lifted) and set to its
# loudness target; 'peak' layers (drips) are spiky and capped by peak instead.
BEDS = {
    'city_rain': [('rain_light', -24, 11000, 90), ('rain_heavy', -30, 5000, 80), ('city_night', -29, 6000, 60), ('drips', -31, 9000, 300, 'peak')],
    'roof_night': [('wind_light', -27, 7000, 80), ('city_night', -31, 2500, 60), ('rain_light', -36, 8000, 200)],
    'city_night': [('city_night', -23, None, 60), ('drips', -32, 9000, 300, 'peak')],
    'dream': [('waves_far', -31, 2200, 60), ('wind_soft', -38, 3000, 60)],
    'morning': [('birds_dawn', -25, None, 400), ('wind_soft', -36, 4000, 60), ('drips', -37, 9000, 300, 'peak')],
    'dawn_edge': [('wind_soft', -31, 6000, 80), ('birds_dawn', -27, None, 400), ('city_night', -34, 3000, 60)],
    'forest': [('forest_birds', -23, None, 150), ('wind_light', -30, 9000, 100)],
    'wind_hills': [('grass_wind', -22, 9000, 60), ('wind_strong', -28, 3000, 50)],
    'rain_shelter': [('rain_tin', -23, None, 80), ('rain_heavy', -26, 5000, 60), ('drips', -31, 9000, 300, 'peak')],
    'night_shelter': [('drips', -33, 9000, 300, 'peak'), ('crickets_night', -31, None, 1500), ('crickets_field', -34, None, 1500),
                      ('wind_soft', -35, 4000, 60)],
    'night_open': [('crickets_field', -29, None, 1500), ('crickets_night', -34, None, 1500), ('wind_soft', -32, 4000, 60)],
    'wasteland': [('desert_wind', -22, 8000, 60), ('dry_rustle', -33, None, 500)],
    'snow': [('snow_wind', -25, 7000, 80)],
    'cape_wind': [('grass_wind', -21, 9000, 60), ('wind_strong', -26, 3500, 50)],
    'sea_dawn': [('sea_gentle', -24, 7000, 50), ('waves_far', -30, 1800, 40), ('wind_soft', -32, 5000, 60)],
    'beach': [('waves_beach', -22, None, 50), ('sea_gentle', -26, None, 50), ('seagulls', -34, None, 600), ('wind_soft', -32, 6000, 60)],
}
# extra layers for single shots (the stream the cat crosses, the cliff wind)
SHOT_BEDS = {
    'B6': [('stream', -24, None, 120)],
    'B8': [('stream', -25, None, 120)],
    'C5': [('wind_strong', -24, 3000, 50)],
    'C6': [('wind_strong', -27, 3000, 50)],
}
# bed trims in dB for single shots
AMB_TRIM = {'B12': -1.5, 'B13': -1.5, 'C7': -4, 'D1': -11, 'D2': -11, 'D3': -6, 'B3': -3, 'A9': -3}
# fallbacks if a newly fetched source is missing
FALLBACK = {'wind_soft': 'wind_light', 'birds_dawn': 'forest_birds', 'rain_tin': 'rain_heavy', 'crickets_field': 'crickets',
            'crickets_night': 'crickets', 'dry_rustle': 'desert_wind', 'snow_wind': 'wind_light', 'sea_gentle': 'waves_beach',
            'rain_storm': 'rain_heavy'}


def level(x, up=8.0, down=4.0, win=0.8):
    """slow leveller for a bed: bursts more than `down` dB over the median
    are pulled back, dropouts more than `up` dB under it are lifted"""
    from scipy.ndimage import uniform_filter1d
    m = (x ** 2).mean(axis=1)
    e = np.sqrt(uniform_filter1d(m, int(win * SR)) + 1e-14)
    ref = np.median(e[:: 480])
    edb = 20 * np.log10(e / ref)
    g = np.where(edb > down, down - edb, 0.0) + np.clip(np.where(edb < -up, -up - edb, 0.0), 0, 10)
    g = uniform_filter1d(g, int(0.4 * SR))
    return x * (10 ** (g / 20))[:, None]


def bed_layer(name, dur, target, hi=None, lo=None, mode=None, offset=0.0):
    x = src(name)
    if x is None:
        return None
    b = loop_to(x, int(dur * SR), offset=offset)
    b = filt(b, lo, hi)
    if mode == 'peak':
        p = np.percentile(np.abs(b), 99.995) + 1e-9
        b = b / p * db(target + 14)  # drop peaks sit ~14 dB above the nominal level
        return limiter(b, db(target + 18))
    b = level(b)
    b = b * db(target - loudness(b))
    return limiter(b, db(target + 15))  # rain on tin, gust peaks: cap spikes in the bed itself


def src(name):
    x = load(name)
    if x is None and name in FALLBACK:
        x = load(FALLBACK[name])
    return x


SHOT_SURFACE = {'A16': 'pavement', 'A18': 'grass', 'B14': 'dirt', 'B16a': 'snow', 'B16b': 'snow', 'C4c': 'dirt', 'C4e': 'dirt'}
SURFACE = {'act1': 'wet', 'act2': 'grass', 'act3': 'grass', 'act5': 'sand', 'city': 'wet', 'forest': 'grass', 'storm': 'grass', 'night': 'wood', 'waste': 'dirt', 'snow': 'snow',
           'cape': 'grass', 'sea': 'grass', 'beach': 'sand'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--timeline', default=os.path.join(ROOT, 'build', 'timeline.json'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'build', 'mix.wav'))
    ap.add_argument('--no-music', action='store_true')
    ap.add_argument('--report', action='store_true', help='print per-shot loudness of every bus')
    a = ap.parse_args()
    tl = json.load(open(a.timeline))
    fps = tl['fps']
    L = tl['length'] / fps
    shots = tl['shots']
    ev = tl['events']
    shot_of = {s['name']: s for s in shots}
    seq_at = lambda t: next((s['seq'] for s in reversed(shots) if s['start'] / fps <= t + 1e-6), 'city')
    M = Mix(L)

    # ---------------- ambience beds (one per amb cue, until the next cue)
    ambs = sorted([e for e in ev if e['type'] == 'amb'], key=lambda e: e['t'])
    for i, e in enumerate(ambs):
        t0 = e['t'] / fps
        t1 = ambs[i + 1]['t'] / fps if i + 1 < len(ambs) else L
        xf = 1.2
        dur = t1 - t0 + xf
        for k, spec in enumerate(BEDS.get(e['name'], [])):
            name, target, hi, lo = spec[:4]
            bed = bed_layer(name, dur, target, hi, lo, spec[4] if len(spec) > 4 else None, offset=h01(e['name'], k))
            if bed is None:
                continue
            bed = fade(bed, xf if i > 0 else 0.8, xf)
            M.add('amb', bed, t0 - (xf / 2 if i > 0 else 0))
    for name, layers in SHOT_BEDS.items():
        s0 = shot_of.get(name)
        if not s0:
            continue
        t0, dur = s0['start'] / fps, s0['dur'] / fps
        for k, spec in enumerate(layers):
            bed = bed_layer(spec[0], dur + 0.6, spec[1], spec[2], spec[3], offset=h01(name, k))
            if bed is not None:
                M.add('amb', fade(bed, 0.3, 0.3), t0 - 0.3)

    # rain across the storm: starts at rain_start, heavy through 3.4-3.6
    rs = next((e for e in ev if e['type'] == 'rain_start'), None)
    shel = next((e['t'] for e in ev if e['type'] == 'shelter'), None)
    storm_end = shel if shel is not None else next((s['start'] + s['dur'] for s in shots if s['name'] in ('B13', '3.5')), None)
    if rs and storm_end:
        t0, t1 = rs['t'] / fps, storm_end / fps
        env = None
        for name, target, hi, lo in (('rain_storm', -21, 10000, 120), ('rain_heavy', -24, 5000, 100)):
            bed = bed_layer(name, t1 - t0 + 2, target, hi, lo, offset=0.3)
            if bed is None:
                continue
            if env is None:
                env = np.clip(np.linspace(0, (t1 - t0) / 4.0, len(bed)), 0, 1)[:, None] ** 1.5
            M.add('amb', fade(bed * env, 0.5, 1.5), t0)

    # ---------------- spot effects (gains are peak levels in dBFS)
    steps = pool('snow_steps', thresh=0.3, win=0.3)
    sand = pool('sand_steps', thresh=0.3, win=0.18)
    grass = pool('steps_grass', thresh=0.3, win=0.25) if load('steps_grass') is not None else []
    papers = pool('paper_rustle', thresh=0.2, win=0.35)
    flaps = pool('paper_flap', thresh=0.25, win=0.5) if load('paper_flap') is not None else papers
    splash = pk(src('splash'))
    drip = pk(load('drip_single'))
    cloth = pk(filt(load('cloth_shake'), 250, 9000))
    gust = pk(filt(load('wind_gust'), 80, 8000))
    for idx, e in enumerate(ev):
        t = e['t'] / fps
        ty = e['type']
        seq = seq_at(t)
        hsh = h01(idx, ty)
        if ty == 'step':
            surf = e.get('surface') or SHOT_SURFACE.get(e.get('shot')) or SURFACE.get(seq, 'pavement')
            gait = e.get('gait')
            s = e.get('strength', 1) * (1.25 if gait in ('run', 'gallop') else 0.7 if gait in ('stalk', 'sneak') else 0.85 if gait == 'tired' else 1.0)
            vary = db((h01(idx, 'v') - 0.5) * 3)
            if surf == 'snow' and steps:
                M.add('foley', filt(steps[int(hsh * len(steps))], 150, 9000), t - 0.01, db(-28) * s * vary)
            elif surf == 'sand' and sand:
                M.add('foley', filt(sand[int(hsh * len(sand))], 400, 7000), t - 0.01, db(-33) * s * vary)
            elif surf == 'water':
                if splash is not None:
                    M.add('foley', lv(filt(splash, 300, 9000), -27), t - 0.02, s * vary)
            elif surf == 'grass' and grass:
                M.add('foley', filt(grass[int(hsh * len(grass))], 400, 9000), t - 0.01, db(-31) * s * vary)
            else:
                M.add('foley', pk(paw('wet' if surf in ('wet', 'mud') else surf, 1.0, seed=idx)), t, db(-28) * s * vary)
        elif ty == 'jump':
            M.add('foley', pk(whoosh(0.28, 500, 3000, seed=idx)), t - 0.05, db(-34) * e.get('strength', 1))
            M.add('foley', pk(paw('dirt', 1, idx)), t, db(-32))
        elif ty == 'land':
            s = e.get('strength', 1)
            M.add('foley', pk(paw('dirt', 1, idx + 1)), t, db(-27) * s)
            if seq == 'snow' and steps:
                M.add('foley', steps[int(hsh * len(steps))], t, db(-26) * s)
            if seq == 'beach' and sand:
                M.add('foley', filt(sand[int(hsh * len(sand))], 200, 6000), t, db(-30) * s)
        elif ty in ('drip_hit', 'drop_nose', 'drop_on_card'):
            M.add('fx', lv(drip, -26 if ty != 'drop_on_card' else -29), t - 0.03)
        elif ty == 'headshake':
            M.add('foley', lv(cloth, -26), t)
            M.add('foley', lv(droplets(0.6, 10, idx), -28), t + 0.05)
        elif ty in ('gust', 'gust_big', 'wind_swell'):
            M.add('fx', lv(fade(gust, 0.4, 1.0), {'gust': -22, 'gust_big': -17, 'wind_swell': -19}[ty]), t - 0.6)
        elif ty in ('paper', 'paper_slide', 'pickup', 'putdown', 'pat'):
            pp = flaps if ty == 'paper' else papers
            if pp:
                x = pp[int(hsh * len(pp))]
                g = {'paper': -21, 'paper_slide': -26, 'pickup': -25, 'putdown': -27, 'pat': -29}[ty]
                M.add('foley', filt(x, 500, 10000), t, db(g) * e.get('strength', 1) ** 0.5)
            if ty == 'pat':
                M.add('foley', pk(paw('pavement', 1, idx)), t, db(-31))
        elif ty == 'sniff':
            M.add('foley', pk(sniff(idx)), t, db(-30))
        elif ty == 'can_hit':
            c = load('can_drop2')
            if c is not None:
                M.add('fx', lv(filt(c, 150, None), -17), t - 0.02, 1.0, 0.4)
            else:
                M.add('fx', pk(clink(1650, idx)), t, db(-14), 0.4)
                M.add('fx', pk(clink(1900, idx + 1)), t + 0.14, db(-20), 0.4)
        elif ty == 'can_roll':
            for k in range(9):
                M.add('fx', lv(clink(1500 + 200 * h01(idx, k), idx + k, 0.2), -25 - k * 1.3), t + k * 0.21 + 0.05 * h01(k, idx), 1.0, 0.45 + k * 0.03)
        elif ty in ('rear', 'swat', 'snap', 'near_miss', 'startle'):
            M.add('foley', pk(whoosh(0.22 if ty != 'near_miss' else 0.5, 600, 3500, idx)), t - 0.05, db(-31 if ty != 'near_miss' else -22))
        elif ty in ('sit', 'liedown'):
            M.add('foley', pk(paw('dirt', 1, idx)), t, db(-34))
        elif ty == 'splash' and splash is not None:
            sst = e.get('strength', 1)
            target = -24 + 7 * min(1.0, max(0.0, (sst - 0.25) / 0.95))
            M.add('fx', lv(filt(splash, 200, None), target), t - 0.02)
            if sst >= 1:  # a face full of water: a second burst and falling drops
                M.add('fx', lv(filt(splash, 600, None), target - 5), t + 0.06, 1.0, 0.25)
                M.add('fx', lv(droplets(0.7, 14, idx), target - 7), t + 0.15)
        elif ty == 'flick':
            M.add('foley', pk(droplets(0.25, 3, idx)), t, db(-30))
        elif ty == 'shake':
            M.add('foley', lv(cloth, -23), t)
            M.add('foley', lv(cloth, -25), t + 0.25)
            M.add('foley', lv(droplets(max(0.5, e.get('dur', 22) / fps + 0.3), 26, idx), -24), t + 0.1)
        elif ty == 'thunder_far':
            M.add('fx', pk(filt(load('thunder_far'), 30, 5000)), t, db(-10) * e.get('amt', 1), -0.3)
        elif ty == 'thunder_crack':
            M.add('fx', pk(load('thunder_crack')), t - 0.05, db(-4))
        elif ty == 'truck_pass':
            x = filt(load('truck_far'), 40, 3000)
            from scipy.ndimage import uniform_filter1d
            c = int(np.argmax(uniform_filter1d((x ** 2).mean(axis=1), SR)))
            a0, a1 = max(0, c - 7 * SR), min(len(x), c + 5 * SR)
            x = fade(x[a0:a1], 2.5, 2.5)
            M.add('fx', x * db(-29 - loudness(x)), t + e.get('dur', 110) / fps / 2 - (c - a0) / SR, 1.0, -0.4)
        elif ty == 'owl':
            M.add('fx', lv(filt(load('owl'), 200, None)[: int(4 * SR)], -25), t, 1.0, 0.6)
        elif ty == 'pant':
            M.add('foley', pk(pant_breath(e.get('dur', 44) / fps, idx)), t, db(-27))
        elif ty == 'lick':
            for k in range(3):
                M.add('foley', pk(lick(idx + k)), t + k * 0.22, db(-30))
        elif ty == 'tumbleweed':
            dur = e.get('dur', 90) / fps + 1
            x = fade(filt(loop_to(src('dry_rustle'), int(dur * SR)), 600, None), 0.8, 1.2)
            M.add('fx', x * db(-27 - loudness(x)), t, 1.0, 0.2)
        elif ty == 'snowpull' and steps:
            M.add('foley', steps[int(hsh * len(steps))], t, db(-24))
        elif ty == 'sneeze':
            M.add('foley', lv(sneeze(idx), -23), t)
        elif ty == 'crawl':
            dur = e.get('dur', 30) / fps
            for k in range(int(dur / 0.3)):
                M.add('foley', pk(paw('wet', 0.6, idx + k)), t + k * 0.3 + 0.08 * h01(idx, k), db(-36))
        elif ty == 'yawn':
            M.add('foley', lv(yawn(idx), -30), t + 0.1)
        elif ty == 'card_slap':
            if flaps:
                M.add('fx', lv(filt(flaps[int(hsh * len(flaps))], 500, None), -19), t - 0.02)
            M.add('fx', lv(thwap(idx), -21), t)
        elif ty == 'plop':
            M.add('foley', lv(thwap(idx + 3, 90), -25), t)
            M.add('foley', lv(cloth, -30), t + 0.02)
        elif ty == 'paw_swipe':
            M.add('foley', pk(whoosh(0.16, 900, 4000, idx)), t - 0.04, db(-35))
            if papers:
                M.add('foley', filt(papers[int(hsh * len(papers))], 800, 10000), t, db(-33))
        elif ty == 'whoosh':
            M.add('fx', lv(whoosh(0.55, 500, 5000, idx), -24), t - 0.35)
        elif ty == 'card_waves':
            # the sea heard from the postcard: far, dreamy, swelling in and out
            dur = e.get('dur', 260) / fps
            x = filt(loop_to(src('sea_gentle'), int(dur * SR), offset=0.3), 180, 2600)
            env = np.sin(np.pi * np.clip(np.linspace(0, 1, len(x)), 0, 1)) ** 0.8
            x = x * env[:, None]
            M.add('fx', fade(x * db(-27 - loudness(x)), 2.0, 2.5), t)
        elif ty == 'paper_flutter':
            # a card thrashing in a gale: rapid flaps, irregular
            if flaps:
                dur = e.get('dur', 48) / fps
                amt = e.get('amt', 1)
                k = 0
                tt = 0.0
                while tt < dur:
                    x = flaps[int(h01(idx, k) * len(flaps))]
                    M.add('fx', filt(x, 700, 11000), t + tt, db(-31 + 6 * amt - 5 * h01(k, idx)), 0.25)
                    tt += 0.07 + 0.12 * h01(idx, k, 'g')
                    k += 1
        elif ty == 'bird':
            b = src('birds_dawn')
            if b is not None:
                seg = fade(filt(b[int(3 * SR):int(4.6 * SR)], 1500, None), 0.05, 0.3)
                M.add('fx', lv(seg, -27), t, 1.0, 0.4)
        elif ty in ('flutter_land', 'flutter_off'):
            M.add('foley', pk(whoosh(0.18, 1800, 6000, idx)), t - 0.05, db(-40))
        elif ty == 'slowmo_in':
            M.add('fx', lv(sweep(0.9, 2600, 300, idx), -27), t - 0.2)
        elif ty == 'slowmo_out':
            M.add('fx', lv(sweep(0.5, 400, 2800, idx), -29), t - 0.35)
        elif ty == 'shiver':
            M.add('foley', pk(filt(noise(e.get('dur', 30) / fps, idx), 2000, 7000) * (0.5 + 0.5 * np.sin(np.linspace(0, 60, int(e.get('dur', 30) / fps * SR))))), t, db(-36))
        elif ty == 'card_snatch':
            if flaps:
                for k in range(4):
                    M.add('fx', lv(filt(flaps[int(h01(idx, k) * len(flaps))], 400, None), -20 - k * 3), t + k * 0.18, 1.0, 0.2 + 0.15 * k)
            M.add('fx', lv(fade(gust, 0.2, 1.0), -15), t - 0.3)
        elif ty in ('skid', 'slide'):
            dur = e.get('dur', 12) / fps + 0.2
            x = filt(noise(dur, idx), 300, 3000) * np.sin(np.pi * np.linspace(0, 1, int(dur * SR))) ** 0.5
            M.add('foley', pk(x), t, db(-29))
        elif ty == 'waves_first':
            # the sea heard before it is seen: distant, swelling as the cat climbs
            end = next((s0['start'] / fps for s0 in shots if s0['name'] in ('D4', '8.3')), t + 9) + 1.5
            dur = end - t
            x = filt(loop_to(src('sea_gentle'), int(dur * SR), offset=0.5), 60, 1400)
            x = x * db(-24 - loudness(x)) * np.linspace(0.45, 1.0, len(x))[:, None]
            M.add('fx', fade(x, 2.5, 1.5), t)
        elif ty == 'wave_wash':
            dur = e.get('dur', 100) / fps
            seg = fade(filt(loop_to(load('wave_wash'), int((dur + 1.5) * SR), offset=h01(idx)), 60, None), 0.6, 1.2)
            M.add('fx', seg * db(-27 - loudness(seg)), t - 0.3)
        elif ty == 'emote':
            k = e.get('kind')
            if k == 'exclaim':
                x = pluck(1318, 0.4, 0.4) + np.pad(pluck(1760, 0.4, 0.3), (int(0.06 * SR), 0))[: int(0.4 * SR)]
                M.add('ui', pk(x), t, db(-29) * e.get('size', 1) ** 0.5)
            elif k == 'question':
                M.add('ui', pk(pluck(988, 0.3, 0.3)), t, db(-31))
                M.add('ui', pk(pluck(1318, 0.4, 0.3)), t + 0.14, db(-31))
            elif k == 'sparkle':
                for j in range(e.get('n', 4)):
                    M.add('ui', pk(bell(2093 + 350 * j, 1.2, 0.15)), t + 0.12 * j, db(-33), -0.3 + 0.2 * j)
            elif k == 'notes':
                for j, f in enumerate((784, 988, 1175)):
                    M.add('ui', pk(pluck(f, 0.5, 0.25)), t + 0.25 * j, db(-33))
            elif k == 'surprise':
                M.add('ui', pk(pluck(1568, 0.25, 0.3)), t, db(-33))
            elif k == 'sweat':
                M.add('ui', pk(droplets(0.2, 1, idx)), t, db(-31))
            elif k == 'gloom':
                M.add('ui', pk(pluck(330, 0.9, 0.3) + np.pad(pluck(311, 0.9, 0.3), (int(0.3 * SR), 0))[: int(0.9 * SR)]), t, db(-33))

    # ---------------- per-shot trims of the beds
    trim = np.zeros(M.n)
    for s0 in shots:
        if s0['name'] in AMB_TRIM:
            i, j = int(s0['start'] / fps * SR), int((s0['start'] + s0['dur']) / fps * SR)
            trim[i:j] = AMB_TRIM[s0['name']]
    from scipy.ndimage import uniform_filter1d
    M.bus['amb'] *= db(uniform_filter1d(trim, int(1.2 * SR)))[:, None]
    # muffled / slowed stretches: the beds go dull and quiet (looking up at the
    # sky; the slow-motion leap)
    spans = [(e['t'] / fps, e['t'] / fps + e.get('dur', 96) / fps, 0.55, 1300) for e in ev if e['type'] == 'city_muffle']
    si = [e['t'] / fps for e in ev if e['type'] == 'slowmo_in']
    so = [e['t'] / fps for e in ev if e['type'] == 'slowmo_out']
    for a0, b0 in zip(si, so):
        spans.append((a0, b0, 0.9, 700))
    for a0, b0, amt, fc in spans:
        mix_env = np.zeros(M.n)
        i, j = int(a0 * SR), int(b0 * SR)
        mix_env[i:j] = amt
        mix_env = uniform_filter1d(mix_env, int(0.5 * SR))
        dull = filt(M.bus['amb'], None, fc) * db(-5)
        M.bus['amb'] = M.bus['amb'] * (1 - mix_env[:, None]) + dull * mix_env[:, None]

    # ---------------- music: the score composed to this timeline (tools/score.py)
    if not a.no_music:
        import score
        tl2, T = score.load_timeline(a.timeline)
        x = score.compose(tl2, T)
        x = x[: M.n]
        M.add('music', x * db(-19 - loudness(x)), 0.0)
        # duck the beds a little under the music (trims per shot come first)
        me = uniform_filter1d((M.bus['music'] ** 2).mean(axis=1), int(1.0 * SR))
        mdb = 10 * np.log10(me + 1e-12)
        duck = -3.0 * np.clip((mdb + 42) / 12, 0, 1)
        M.bus['amb'] *= db(uniform_filter1d(duck, int(0.5 * SR)))[:, None]

    # ---------------- sum, master
    gains = {'amb': 1.0, 'fx': 1.0, 'foley': 1.0, 'music': 1.0, 'ui': db(4)}
    # spot effects and foley get their own peak limiters so a clatter or a
    # splash is contained on its bus and never pumps the ambience or the score
    M.bus['fx'] = limiter(M.bus['fx'], db(-5.0), release_db_s=60.0)
    M.bus['foley'] = limiter(M.bus['foley'], db(-8.0), release_db_s=60.0)
    # and the beds dip a little under them (a sidechain: quick attack, slow release)
    from scipy.ndimage import uniform_filter1d, maximum_filter1d
    fxe = uniform_filter1d((M.bus['fx'] ** 2 + M.bus['foley'] ** 2 * 0.5).mean(axis=1), int(0.05 * SR))
    fdb = 10 * np.log10(fxe + 1e-12)
    dip = -4.0 * np.clip((fdb + 34) / 12, 0, 1)
    dip = -maximum_filter1d(-dip, int(0.35 * SR))  # hold through the sound
    dip = uniform_filter1d(dip, int(0.25 * SR))
    M.bus['amb'] *= db(dip)[:, None]
    mix = sum(M.bus[k] * gains[k] for k in M.bus)
    mix = mix[: int(L * SR)]
    # final fades: in from black, out at the end
    mix[: int(1.5 * SR)] *= np.linspace(0, 1, int(1.5 * SR))[:, None]
    mix[-int(3 * SR):] *= np.linspace(1, 0, int(3 * SR))[:, None]
    lufs = loudness(mix)
    target = -18.0
    mix *= db(target - lufs)
    pre = mix.copy() if a.report else None
    mix = limiter(mix, db(-1.5))  # headroom for the AAC encode
    if a.report:
        report(M, gains, db(target - lufs), pre, mix, shots, fps)
    print(f'integrated loudness {lufs:.1f} LUFS -> {loudness(mix):.1f}; peak {20 * np.log10(np.abs(mix).max() + 1e-9):.1f} dBFS')
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    sf.write(a.out, mix.astype(np.float32), SR, subtype='FLOAT')
    print('wrote', a.out, f'{len(mix) / SR:.1f}s')
    # record which recordings the mix actually used (tools/credits.py lists them)
    used = sorted(k for k, v in _cache.items() if v is not None)
    with open(os.path.join(ROOT, 'audio', 'used.json'), 'w') as f:
        json.dump(used, f, indent=1)
        f.write('\n')


def report(M, gains, master, pre, post, shots, fps):
    """per-shot loudness (LUFS, after master gain) of every bus: mean and
    loudest 400 ms block, plus the most gain reduction the limiter applied"""
    def blocks(x):
        y = kweight(x)
        blk, hop = int(0.4 * SR), int(0.1 * SR)
        if len(y) < blk:
            return np.array([1e-12])
        idx = np.arange(0, len(y) - blk, hop)
        c = np.cumsum(np.vstack([np.zeros((1, 2)), y ** 2]), axis=0)
        return ((c[idx + blk] - c[idx]) / blk).sum(axis=1)
    def lu(v):
        return -0.691 + 10 * np.log10(v + 1e-12)
    names = list(M.bus)
    print('shot  ' + ''.join(f'{k:>12s}' for k in names) + '      master  limit')
    for s in shots:
        i, j = int(s['start'] / fps * SR), int((s['start'] + s['dur']) / fps * SR)
        row = f"{s['name']:5s} "
        for k in names:
            b = blocks(M.bus[k][i:j] * gains[k] * master)
            row += f'{lu(b.mean()):6.1f}/{lu(b.max()):5.1f}'
        b = blocks(post[i:j])
        gr = 20 * np.log10((np.abs(pre[i:j]).max() + 1e-12) / (np.abs(post[i:j]).max() + 1e-12))
        row += f'  {lu(b.mean()):6.1f}/{lu(b.max()):5.1f} {gr:5.1f}'
        print(row)


def kweight(x):
    # ITU-R BS.1770 K-weighting at 48 kHz
    from scipy.signal import sosfilt
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    sos = np.array([b1 + a1, b2 + a2])
    return sosfilt(sos, x, axis=0)


def loudness(x):
    y = kweight(x)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = []
    for i in range(0, len(y) - blk, hop):
        ms.append(np.mean(y[i:i + blk] ** 2, axis=0).sum())
    ms = np.array(ms)
    l = -0.691 + 10 * np.log10(ms + 1e-12)
    ms = ms[l > -70]
    rel = -0.691 + 10 * np.log10(ms.mean() + 1e-12) - 10
    l2 = -0.691 + 10 * np.log10(ms + 1e-12)
    return -0.691 + 10 * np.log10(ms[l2 > rel].mean() + 1e-12)


def limiter(x, ceil, release_db_s=30.0):
    """look-ahead peak limiter. Works on the needed gain reduction in dB:
    spread it back over the look-ahead window, let it decay at a fixed rate
    (a running max of r + d*i, minus d*i: an instant-attack, linear-in-dB
    release), then round the attack with a short moving average."""
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    peak = np.abs(x).max(axis=1)
    r = np.maximum(0.0, 20 * np.log10((peak + 1e-12) / ceil))
    w = int(0.004 * SR)
    r = maximum_filter1d(r, size=2 * w + 1)
    d = release_db_s / SR
    ramp = d * np.arange(len(r))
    r = np.maximum.accumulate(r + ramp) - ramp
    r = uniform_filter1d(r, size=w)
    return x * (10 ** (-r / 20))[:, None]


if __name__ == '__main__':
    main()
