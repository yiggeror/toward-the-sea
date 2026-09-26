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


# beds per ambience name: [(source, target LUFS, lowpass, highpass, mode)]
# Each layer is levelled (loud bursts tamed, dropouts lifted) and set to its
# loudness target; 'peak' layers (drips) are spiky and capped by peak instead.
BEDS = {
    'city_night': [('city_night', -23, None, 60), ('drips', -32, 9000, 300, 'peak')],
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
    '2.4': [('stream', -24, None, 120)],
    '2.5': [('stream', -23, None, 120)],
    '7.5': [('wind_strong', -24, 3000, 50)],
}
# bed trims in dB for single shots
AMB_TRIM = {'3.4': -1.5, '3.5': -1.5, '7.6': -5, '8.1': -11, '8.2': -11}
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


SURFACE = {'city': 'wet', 'forest': 'grass', 'storm': 'grass', 'night': 'wood', 'waste': 'dirt', 'snow': 'snow',
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
    storm_end = next((s['start'] + s['dur'] for s in shots if s['name'] == '3.5'), None)
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
            surf = e.get('surface') or SURFACE.get(seq, 'pavement')
            gait = e.get('gait')
            s = e.get('strength', 1) * (1.25 if gait in ('run', 'gallop') else 0.7 if gait in ('stalk', 'sneak') else 0.85 if gait == 'tired' else 1.0)
            vary = db((h01(idx, 'v') - 0.5) * 3)
            if surf == 'snow' and steps:
                M.add('foley', filt(steps[int(hsh * len(steps))], 150, 9000), t - 0.01, db(-28) * s * vary)
            elif surf == 'sand' and sand:
                M.add('foley', filt(sand[int(hsh * len(sand))], 400, 7000), t - 0.01, db(-33) * s * vary)
            elif surf == 'water':
                if splash is not None:
                    M.add('foley', filt(splash, 300, 9000), t - 0.02, db(-26) * s * vary)
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
            M.add('fx', drip, t - 0.03, db(-19 if ty != 'drop_on_card' else -23))
        elif ty == 'headshake':
            M.add('foley', cloth, t, db(-24))
            M.add('foley', pk(droplets(0.6, 10, idx)), t + 0.05, db(-27))
        elif ty in ('gust', 'gust_big', 'wind_swell'):
            M.add('fx', fade(gust, 0.4, 1.0), t - 0.6, db({'gust': -17, 'gust_big': -12, 'wind_swell': -14}[ty]))
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
                M.add('fx', pk(filt(c, 150, None)), t - 0.02, db(-13), 0.4)
            else:
                M.add('fx', pk(clink(1650, idx)), t, db(-14), 0.4)
                M.add('fx', pk(clink(1900, idx + 1)), t + 0.14, db(-20), 0.4)
        elif ty == 'can_roll':
            for k in range(9):
                M.add('fx', pk(clink(1500 + 200 * h01(idx, k), idx + k, 0.2)), t + k * 0.21 + 0.05 * h01(k, idx), db(-25 - k * 1.3), 0.45 + k * 0.03)
        elif ty in ('rear', 'swat', 'snap', 'near_miss', 'startle'):
            M.add('foley', pk(whoosh(0.22 if ty != 'near_miss' else 0.5, 600, 3500, idx)), t - 0.05, db(-31 if ty != 'near_miss' else -22))
        elif ty in ('sit', 'liedown'):
            M.add('foley', pk(paw('dirt', 1, idx)), t, db(-34))
        elif ty == 'splash' and splash is not None:
            M.add('fx', filt(splash, 200, None), t - 0.02, db(-15) * max(0.5, min(1.2, e.get('strength', 1))))
        elif ty == 'flick':
            M.add('foley', pk(droplets(0.25, 3, idx)), t, db(-30))
        elif ty == 'shake':
            M.add('foley', cloth, t, db(-21))
            M.add('foley', cloth, t + 0.25, db(-23))
            M.add('foley', pk(droplets(max(0.5, e.get('dur', 22) / fps + 0.3), 26, idx)), t + 0.1, db(-22))
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
            M.add('fx', pk(filt(load('owl'), 200, None)[: int(4 * SR)]), t, db(-20), 0.6)
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
            M.add('foley', pk(sneeze(idx)), t, db(-21))
        elif ty == 'shiver':
            M.add('foley', pk(filt(noise(e.get('dur', 30) / fps, idx), 2000, 7000) * (0.5 + 0.5 * np.sin(np.linspace(0, 60, int(e.get('dur', 30) / fps * SR))))), t, db(-36))
        elif ty == 'card_snatch':
            if flaps:
                for k in range(4):
                    M.add('fx', filt(flaps[int(h01(idx, k) * len(flaps))], 400, None), t + k * 0.18, db(-17 - k * 3), 0.2 + 0.15 * k)
            M.add('fx', fade(gust, 0.2, 1.0), t - 0.3, db(-11))
        elif ty in ('skid', 'slide'):
            dur = e.get('dur', 12) / fps + 0.2
            x = filt(noise(dur, idx), 300, 3000) * np.sin(np.pi * np.linspace(0, 1, int(dur * SR))) ** 0.5
            M.add('foley', pk(x), t, db(-29))
        elif ty == 'waves_first':
            # the sea heard before it is seen: distant, swelling as the cat climbs
            end = next((s0['start'] / fps for s0 in shots if s0['name'] == '8.3'), t + 9) + 1.5
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

    # ---------------- music
    if not a.no_music:
        import music
        cues = music.cues()
        def at_shot(name, off=0.0):
            s = shot_of.get(name)
            return s['start'] / fps + off if s else None
        ev_t = lambda ty, kind=None, i=0: ([e['t'] / fps for e in ev if e['type'] == ty and (kind is None or e.get('kind') == kind)] + [None] * (i + 1))[i]
        # (cue, start s, target loudness LUFS)
        plan = [('discover', ev_t('emote', 'sparkle'), -24), ('dawn', at_shot('1.10', 2.0), -21), ('night', at_shot('4.1', 3.0), -24),
                ('snow', at_shot('6.1', 1.0), -24), ('loss', at_shot('7.6', 1.2), -24),
                ('sea', ev_t('music_in') or at_shot('8.3', 2.5), -18), ('beach', at_shot('9.3', 0.0), -20),
                ('end', ev_t('music_end') or at_shot('end', 0.5), -19)]
        for name, t, target in plan:
            if t is None or name not in cues:
                continue
            x = cues[name]
            M.add('music', x * db(target - loudness(x)), t)
        # duck the beds a little under the music (trims per shot come first)
        from scipy.ndimage import uniform_filter1d
        me = uniform_filter1d((M.bus['music'] ** 2).mean(axis=1), int(1.0 * SR))
        mdb = 10 * np.log10(me + 1e-12)
        duck = -3.0 * np.clip((mdb + 42) / 12, 0, 1)
        M.bus['amb'] *= db(uniform_filter1d(duck, int(0.5 * SR)))[:, None]

    # ---------------- sum, master
    gains = {'amb': 1.0, 'fx': 1.0, 'foley': 1.0, 'music': 1.0, 'ui': db(4)}
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
