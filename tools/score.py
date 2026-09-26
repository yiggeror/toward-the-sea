#!/usr/bin/env python3
"""The v2 score for 去看海吧 — composed to picture, synthesized in code.

The film's timeline (build/timeline.json: shot starts and story events) is the
click track: cues start on cuts, stingers land on the frames of the gags, the
run's downbeat falls on the cut to the pick-up, the music holds its breath in
the slow-motion leap and lands with the cat.

Instruments (all synthesized): piano (additive), string ensemble (detuned
saws; sustained, swelling or tremolo), cello line, pizzicato and harp
(Karplus–Strong), marimba (modal bar), celesta and glockenspiel (inharmonic
partials), flute (sine + breath + delayed vibrato, with glides), soft
percussion (shaker, kick, woodblock, brush, reverse cymbal, timpani).
Each family goes to its own bus with its own reverb send.

usage: python3 tools/score.py [--timeline build/timeline.json] [--out build/score.wav]
"""
import json
import os
import sys

import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt, lfilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from music import piano, pad, reverb_ir, mtof, n as note, SR  # noqa: E402

R = np.random.default_rng(23)


def N(x):
    """note name or midi -> midi"""
    return note(x) if isinstance(x, str) else x


def env_ar(n, a, r_tau, sr=SR):
    t = np.arange(n) / sr
    return np.minimum(1, t / max(1e-4, a)) * np.exp(-t / r_tau)


def stereo(x, pan=0.0, width=0):
    a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    L, Rr = x * np.cos(a), x * np.sin(a)
    if width:
        Rr = np.roll(Rr, int(width))
    return np.stack([L, Rr], axis=1)


def lp(x, f, order=2):
    sos = butter(order, min(0.99, f / (SR / 2)), output='sos')
    return sosfilt(sos, x, axis=0)


def hp(x, f, order=2):
    sos = butter(order, min(0.99, f / (SR / 2)), btype='high', output='sos')
    return sosfilt(sos, x, axis=0)


def bp(x, f0, f1, order=2):
    sos = butter(order, [f0 / (SR / 2), min(0.99, f1 / (SR / 2))], btype='band', output='sos')
    return sosfilt(sos, x, axis=0)


# ------------------------------------------------------------ instruments
def ks(m, dur, vel=0.5, bright=0.5, decay=0.996, body=True):
    """Karplus–Strong plucked string (pizzicato / harp)"""
    f = mtof(N(m))
    L = int(SR / f)
    n = int(dur * SR)
    buf = R.uniform(-1, 1, L)
    buf = lp(buf, 800 + 7000 * bright, 1)
    # y[i] = x[i] + decay * (a*y[i-L] + (1-a)*y[i-L-1]), excited by one period of noise
    a = 0.5 + 0.45 * bright
    x = np.zeros(n)
    x[:L] = buf
    den = np.zeros(L + 2)
    den[0] = 1
    den[L] = -decay * a
    den[L + 1] = -decay * (1 - a)
    out = lfilter([1.0], den, x)
    out *= np.minimum(1, np.arange(n) / (0.002 * SR))
    if body:
        out = out + 0.5 * bp(out, 180, 1400)
    return out * vel


def pizz(m, vel=0.5, pan=0.0):
    f = mtof(N(m))
    dur = 0.35 + 0.5 * max(0, (72 - N(m)) / 36)
    x = ks(m, dur, vel, bright=0.35, decay=0.992 if f > 300 else 0.996)
    x *= np.exp(-np.arange(len(x)) / (0.18 * SR))
    return stereo(x, pan, 6)


def harp(m, vel=0.5, pan=0.0):
    x = ks(m, 2.6, vel, bright=0.6, decay=0.9985, body=False)
    return stereo(x, pan, 9)


def marimba(m, vel=0.5, pan=0.0):
    f = mtof(N(m))
    dur = 1.2
    t = np.arange(int(dur * SR)) / SR
    k = 1 + max(0, (N(m) - 60)) / 24
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t / (0.55 / k))
         + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / (0.09 / k))
         + 0.12 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.02))
    mallet = bp(R.standard_normal(int(0.01 * SR)), 800, 4000) * np.exp(-np.arange(int(0.01 * SR)) / (0.002 * SR)) * 0.25
    x[: len(mallet)] += mallet
    return stereo(x * vel * np.minimum(1, t / 0.001), pan, 5)


def celesta(m, vel=0.5, pan=0.0, dur=1.6):
    f = mtof(N(m))
    t = np.arange(int(dur * SR)) / SR
    x = np.zeros_like(t)
    for ratio, a, tau in ((1, 1, 0.9), (2, 0.45, 0.35), (3, 0.2, 0.15), (4.1, 0.12, 0.06)):
        x += a * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / tau)
    return stereo(x * vel * np.minimum(1, t / 0.0015), pan, 7)


def glock(m, vel=0.5, pan=0.0, dur=2.6):
    f = mtof(N(m))
    t = np.arange(int(dur * SR)) / SR
    x = np.zeros_like(t)
    for ratio, a, tau in ((1, 1, 1.6), (2.76, 0.45, 0.5), (5.4, 0.22, 0.15), (8.93, 0.1, 0.05)):
        x += a * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / tau)
    return stereo(x * vel * np.minimum(1, t / 0.001), pan, 11)


def flute(m, dur, vel=0.5, pan=0.0, glide=None, vib=1.0, attack=0.06):
    """sine-ish breathy lead. glide: (to_midi, start_frac) slides the pitch"""
    n = int((dur + 0.25) * SR)
    t = np.arange(n) / SR
    m0 = N(m)
    mm = np.full(n, float(m0))
    if glide:
        to, s0 = glide
        i0 = int(s0 * dur * SR)
        mm[i0:] = m0 + (N(to) - m0) * np.minimum(1, (t[i0:] - t[i0]) / max(0.05, dur * (1 - s0)))
    vibd = np.minimum(1, np.maximum(0, t - 0.25) / 0.4) * 0.12 * vib
    f = 440 * 2 ** ((mm - 69 + vibd * np.sin(2 * np.pi * 5.3 * t)) / 12)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    breath = bp(R.standard_normal(n), 900, 5000) * 0.05
    e = np.minimum(1, t / attack) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.07))
    e *= 0.85 + 0.15 * np.minimum(1, t / 0.4)
    return stereo((x + breath) * e * vel, pan, 13)


def strings(ms, dur, vel=0.4, attack=0.8, release=1.5, swell=0.0, trem=0.0, bright=2600, pan=0.0):
    """string ensemble chord: detuned saws; swell = crescendo over the note,
    trem = bowed tremolo amount"""
    ms = [N(m) for m in ms]
    x = pad(ms, dur, vel, attack=attack, release=release)
    n = len(x)
    t = np.arange(n) / SR
    if swell:
        x *= (1 - swell + swell * np.minimum(1, t / max(0.1, dur)) ** 2)[:, None]
    if trem:
        am = 1 - trem * (0.5 + 0.5 * np.sin(2 * np.pi * (11.5 + 0.7 * np.sin(t * 1.3)) * t))
        x *= am[:, None]
    if bright != 2600:
        x = lp(x, bright)
    if pan:
        x = x * np.array([np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)]) * 1.41
    return x


def cello(m, dur, vel=0.5, attack=0.12):
    n = int((dur + 0.5) * SR)
    t = np.arange(n) / SR
    f0 = mtof(N(m))
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.0 * t) * np.minimum(1, t / 0.5)
    ph = np.cumsum(f0 * vib) / SR
    saw = 2 * (ph % 1) - 1
    x = lp(saw, 1400, 2) + 0.15 * bp(R.standard_normal(n), 300, 3000) * np.exp(-t / 0.08)
    e = np.minimum(1, t / attack) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.15))
    return stereo(x * e * vel * 0.6, -0.15, 20)


def shaker(vel=0.3, pan=0.3):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    x = hp(R.standard_normal(n), 5000) * np.minimum(1, t / 0.02) * np.exp(-t / 0.025)
    return stereo(x * vel, pan)


def kick(vel=0.5):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = 50 + 70 * np.exp(-t / 0.03)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)
    return stereo(x * vel)


def wood(m=76, vel=0.4, pan=-0.2):
    f = mtof(m)
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    x = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.7 * t)) * np.exp(-t / 0.025)
    return stereo(x * vel, pan)


def brush(vel=0.3, dur=0.25, pan=0.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = bp(R.standard_normal(n), 2000, 9000) * np.sin(np.pi * np.minimum(1, t / dur)) ** 2
    return stereo(x * vel, pan)


def cym_swell(dur=1.5, vel=0.3):
    """reverse cymbal: rising shimmer that cuts off"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = bp(R.standard_normal(n), 3500, 14000) * (t / dur) ** 3
    return stereo(x * vel, 0, 17)


def timp(m, vel=0.5, dur=1.8):
    f = mtof(N(m))
    n = int(dur * SR)
    t = np.arange(n) / SR
    ff = f * (1 + 0.04 * np.exp(-t / 0.05))
    x = np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.6) + 0.3 * lp(R.standard_normal(n), 600) * np.exp(-t / 0.04)
    return stereo(x * vel)


def gliss(m0, m1, dur, vel=0.3, kind='harp'):
    """a run of plucked notes up/down a scale"""
    scale = [0, 2, 4, 6, 7, 9, 11]  # D major pitch classes relative to D (2)
    a, b = N(m0), N(m1)
    step = 1 if b > a else -1
    notes = [m for m in range(a, b + step, step) if (m - 2) % 12 in scale]
    out = []
    for i, m in enumerate(notes):
        out.append((i * dur / max(1, len(notes)), m))
    return out


# ------------------------------------------------------------ the score object
class Score:
    BUSES = {'piano': 0.28, 'strings': 0.42, 'pluck': 0.3, 'mallet': 0.34, 'wind': 0.3, 'perc': 0.12, 'low': 0.2}

    def __init__(self, seconds):
        self.n = int((seconds + 8) * SR)
        self.bus = {k: np.zeros((self.n, 2)) for k in self.BUSES}

    def put(self, bus, x, at, gain=1.0):
        if x is None or at is None:
            return
        i = int(round(at * SR))
        if i < 0:
            x = x[-i:]
            i = 0
        if i >= self.n:
            return
        j = min(self.n, i + len(x))
        self.bus[bus][i:j] += x[: j - i] * gain

    def render(self):
        ir = reverb_ir(3.4)
        out = np.zeros((self.n, 2))
        for k, send in self.BUSES.items():
            x = self.bus[k]
            if not np.any(x):
                continue
            w = np.stack([fftconvolve(x[:, c], ir[:, c])[: self.n] for c in range(2)], axis=1)
            out += x * (1 - send * 0.35) + w * send
        return out


# ------------------------------------------------------------ Act I
def act1(S, T):
    """T: helpers (shot start, event time)"""
    sh, ev = T['shot'], T['ev']
    # ---- M1 the rain lane (A1–A3b): slow broken chords in B minor, 72 bpm
    t0 = 0.9
    bar = 60 / 72 * 4
    prog = [('B1', ['F#3', 'B3', 'D4', 'C#5']), ('G1', ['D3', 'G3', 'B3', 'F#4']), ('D2', ['F#3', 'A3', 'D4', 'E4']), ('E2', ['G3', 'B3', 'D4', 'F#4']),
            ('A1', ['E3', 'A3', 'D4', 'E4'])]
    for i, (bass, tones) in enumerate(prog):
        at = t0 + i * bar
        S.put('piano', piano(N(bass) + 12, bar * 0.95, 0.26), at)
        S.put('low', strings([N(bass) + 12, N(bass) + 19], bar, 0.2, attack=1.5, release=2.5), at)
        seq = [tones[0], tones[1], tones[2], tones[3], tones[2], tones[1]]
        for k, nm in enumerate(seq):
            S.put('piano', piano(N(nm), bar / 6 * 1.6, 0.16 + 0.04 * (k == 3)), at + (k + 0.5) * bar / 6 + R.uniform(-0.01, 0.01))
    # a lonely melody over it: two falling phrases
    for at, nm, d in ((t0 + 1.2 * bar, 'F#5', 1.2), (t0 + 1.2 * bar + 0.9, 'E5', 0.8), (t0 + 1.2 * bar + 1.6, 'D5', 2.2),
                      (t0 + 3.2 * bar, 'B4', 1.0), (t0 + 3.2 * bar + 0.8, 'C#5', 0.7), (t0 + 3.2 * bar + 1.4, 'A4', 2.6)):
        S.put('piano', piano(N(nm), d, 0.22), at)
    # eyes open in the dark: two celesta notes
    e = ev('eyes_open')
    if e:
        S.put('mallet', celesta('F#6', 0.18, -0.2), e)
        S.put('mallet', celesta('A6', 0.15, 0.2), e + 0.18)
    # the yawn: a flute sighs down
    e = ev('yawn')
    if e:
        S.put('wind', flute('A5', 1.1, 0.16, 0.1, glide=('D5', 0.35), vib=0.3), e + 0.15)
    # looking around: two pizz notes left and right
    a3b = sh('A3b')
    if a3b is not None:
        S.put('pluck', pizz('D5', 0.35, -0.5), a3b + 58 / 24)
        S.put('pluck', pizz('A5', 0.3, 0.5), a3b + 82 / 24)

    # ---- A4: the drop, the crossed eyes, the sneeze
    e = ev('drop_nose')
    if e:
        S.put('mallet', celesta('B6', 0.28, 0), e)
        # crossed eyes: a wobbling two-note "hmm" on marimba
        for k, nm in enumerate(['F5', 'E5', 'F5', 'E5', 'F5']):
            S.put('mallet', marimba(nm, 0.2, 0.0), e + 0.5 + k * 0.16)
    e = ev('sneeze')
    if e:
        for k, nm in enumerate(['A4', 'C5', 'E5']):
            S.put('pluck', pizz(nm, 0.3 + 0.06 * k, 0.1), e - 0.9 + k * 0.28)
        S.put('perc', brush(0.5, 0.18), e)
        S.put('pluck', pizz('A3', 0.5, 0), e + 0.02)
    e = ev('headshake')
    if e:
        for k in range(8):
            S.put('mallet', marimba('D5' if k % 2 else 'E5', 0.14, -0.4 + 0.1 * k), e + k * 0.07)
    e = ev('emote', 'sweat')
    if e:
        S.put('pluck', pizz('D4', 0.35, -0.2), e + 0.1)
        S.put('pluck', pizz('A3', 0.35, 0.2), e + 0.45)

    # ---- A5 the gust: tremolo strings swell and rise
    a5 = sh('A5')
    if a5 is not None:
        d5 = sh('A6') - a5
        S.put('strings', strings(['B3', 'F#4', 'B4'], d5 * 0.55, 0.28, attack=0.4, release=0.3, swell=0.9, trem=0.5), a5 + 0.1)
        S.put('strings', strings(['D4', 'A4', 'D5', 'E5'], d5 * 0.45, 0.34, attack=0.2, release=0.2, swell=0.9, trem=0.6), a5 + 0.1 + d5 * 0.55)
        S.put('perc', cym_swell(d5 * 0.5, 0.22), a5 + d5 * 0.5)
    # ---- A6 the slap: a comic orchestral hit, then silence; the plop
    e = ev('card_slap')
    if e:
        for nm in ('D3', 'A3', 'F4', 'C5'):
            S.put('pluck', pizz(nm, 0.45, R.uniform(-0.4, 0.4)), e)
        S.put('perc', wood(79, 0.5), e)
        S.put('perc', kick(0.35), e)
    e = ev('plop')
    if e:
        S.put('mallet', marimba('D3', 0.5, 0), e)
        S.put('mallet', marimba('A2', 0.35, 0), e + 0.12)
    # ---- A7 pawing: staccato struggle on every swipe, then the card falls off
    for k, e in enumerate(T['evs']('paw_swipe')):
        S.put('pluck', pizz(['D5', 'C#5', 'D5', 'E5', 'D5', 'F#5'][k % 6], 0.34, -0.3 if k % 2 else 0.3), e)
    e = ev('emote', 'question')
    if e:
        for k, nm in enumerate(['A4', 'B4', 'C#5', 'E5']):
            S.put('pluck', harp(nm, 0.2, 0.1), e - 0.55 + k * 0.05)

    # ---- A8 the card: M2, the motif on glockenspiel over a harp run and strings
    e = ev('music_card')
    if e:
        S.put('strings', strings(['D3', 'A3', 'E4', 'F#4'], 11, 0.2, attack=2.5, release=3), e - 0.4)
        for i, (tt, m) in enumerate(gliss('D4', 'A5', 1.2)):
            S.put('pluck', harp(m, 0.18, -0.4 + i * 0.08), e - 0.4 + tt)
        mot = [('A5', 0.0), ('D6', 0.75), ('E6', 1.3), ('F#6', 2.1)]
        for nm, dt in mot:
            S.put('mallet', glock(nm, 0.22, 0.15), e + 1.0 + dt)
            S.put('mallet', celesta(N(nm) - 12, 0.12, -0.15), e + 1.0 + dt)
        for nm, dt in mot:
            S.put('mallet', glock(N(nm) + 12, 0.12, -0.2), e + 4.2 + dt * 0.9)
            S.put('wind', flute(nm, 0.6 if nm != 'F#6' else 1.6, 0.1, 0.2), e + 4.2 + dt * 0.9)
    # ---- A9 the sea in its eyes: the theme's first phrase, strings bloom
    e = ev('music_card_hold')
    if e:
        chords = [('D3', ['D4', 'F#4', 'A4', 'E5']), ('C#3', ['E4', 'A4', 'C#5']), ('B2', ['D4', 'F#4', 'B4']), ('G2', ['D4', 'G4', 'B4'])]
        cb = 1.25
        for i, (bass, tones) in enumerate(chords):
            S.put('strings', strings([bass] + tones, cb * 1.1, 0.2 + 0.03 * i, attack=0.6, release=1.6), e + i * cb)
            S.put('piano', piano(N(bass), cb, 0.24), e + i * cb)
        for tt, nm, d in ((0.0, 'A4', 0.6), (0.6, 'D5', 0.3), (0.95, 'E5', 0.6), (1.6, 'F#5', 0.6), (2.5, 'E5', 1.1), (3.3, 'C#5', 0.6), (3.9, 'A4', 1.2)):
            S.put('piano', piano(N(nm), d, 0.32), e + 0.1 + tt)
    # ---- A10 looking up: everything thins to one long high note and a low drone
    e = ev('city_muffle')
    if e:
        S.put('strings', strings(['E2', 'B2'], 3.6, 0.22, attack=0.8, release=1.5, bright=900), e)
        S.put('strings', strings(['A5'], 3.4, 0.12, attack=1.0, release=1.2), e + 0.3)
        S.put('mallet', celesta('E6', 0.08, 0.3), e + 1.6)
    # ---- A11 → the run: pizz pick-up, M3 starts on the cut to the pick-up
    e = ev('music_run')
    run0 = sh('A12')
    if e and run0 is not None:
        for k, nm in enumerate(['D4', 'F#4', 'A4', 'D5']):
            S.put('pluck', pizz(nm, 0.3 + 0.05 * k, -0.2 + 0.13 * k), run0 - 4 * 0.268 + k * 0.268)
    sm_in, sm_out = ev('slowmo_in'), ev('slowmo_out')
    title = sh('A18')
    if run0 is not None:
        beat = 60 / 112
        end = sm_in if sm_in else run0 + 16 * beat
        prog = [('D2', ['D4', 'F#4', 'A4']), ('B1', ['D4', 'F#4', 'B4']), ('G1', ['D4', 'G4', 'B4']), ('A1', ['C#4', 'E4', 'A4'])]
        mel = [('A5', 0, 1.5), ('D6', 1.5, 0.5), ('E6', 2, 1), ('F#6', 3, 1), ('E6', 4, 1.5), ('D6', 5.5, 0.5), ('B5', 6, 1), ('A5', 7, 1)]
        b = 0
        while True:
            at = run0 + b * beat
            if at >= end - 0.05:
                break
            bar_i = (b // 4) % 4
            bass, tones = prog[bar_i]
            pos = b % 4
            # ostinato: eighths on pizz, root-fifth-octave pattern
            for h in range(2):
                tt = at + h * beat / 2
                if tt >= end:
                    break
                pat = [tones[0], tones[2], tones[1], tones[2]]
                S.put('pluck', pizz(N(pat[(pos * 2 + h) % 4]) + 12, 0.24 + 0.06 * (h == 0), 0.25 if h else -0.25), tt)
                S.put('perc', shaker(0.13 if h else 0.09), tt)
            if pos == 0:
                S.put('low', cello(N(bass) + 12, beat * 3.6, 0.32), at)
                S.put('perc', kick(0.3), at)
            if pos == 2:
                S.put('perc', kick(0.2), at)
                S.put('perc', wood(81, 0.14, 0.3), at)
            # marimba counter-line from the second phrase
            if b >= 8 and pos in (1, 3):
                S.put('mallet', marimba(N(tones[2]) + 12 - (pos == 3) * 2, 0.18, 0.35), at)
            # the melody (the card motif) on flute + glock from bar 3 (the run proper)
            if b >= 12:
                bb = (b - 12) % 8
                for nm, st_, d in mel:
                    if st_ == bb:
                        S.put('wind', flute(nm, d * beat * 0.95, 0.14, 0.05), at)
                        S.put('mallet', glock(nm, 0.06, 0.1, 1.2), at)
            b += 1
        # the slow-motion leap: the pulse stops, a chord hangs in the air
        if sm_in and sm_out:
            hold = sm_out - sm_in
            S.put('strings', strings(['D4', 'A4', 'E5', 'F#5', 'A5'], hold, 0.26, attack=0.3, release=1.2, swell=0.4), sm_in)
            S.put('low', strings(['D2', 'A2'], hold, 0.2, attack=0.5, release=1.0), sm_in)
            for k in range(int(hold / 0.42)):
                S.put('mallet', celesta(['A5', 'D6', 'E6', 'F#6', 'A6'][k % 5], 0.1, -0.4 + 0.2 * (k % 5), 2.2), sm_in + 0.2 + k * 0.42)
            S.put('perc', cym_swell(min(2.0, hold), 0.25), sm_out - min(2.0, hold))
            # landing: the downbeat returns
            S.put('perc', timp('D2', 0.55), sm_out)
            S.put('strings', strings(['D3', 'A3', 'D4', 'F#4', 'A4'], 1.2, 0.34, attack=0.03, release=0.8), sm_out)
            S.put('pluck', pizz('D5', 0.4, 0), sm_out)
            b2 = 0
            while title is None or sm_out + (b2 + 1) * beat < title + 0.5:
                at = sm_out + (b2 + 1) * beat
                for h in range(2):
                    S.put('pluck', pizz(['A5', 'F#5', 'D5', 'F#5'][(b2 * 2 + h) % 4], 0.2 * (1 - b2 / 8), 0.25 if h else -0.25), at + h * beat / 2)
                b2 += 1
                if b2 > 7:
                    break
    # ---- A18 dawn, the title: the theme's first phrase, warm and open
    if title is not None:
        q = 60 / 66
        t0 = title + 0.8
        melody = [('A4', 1.5), ('D5', 0.5), ('E5', 1), ('F#5', 1), ('E5', 2), ('C#5', 1), ('A4', 1), ('D5', 4)]
        tt = t0
        for nm, bts in melody:
            S.put('piano', piano(N(nm), bts * q * 0.95, 0.36), tt)
            S.put('wind', flute(nm, bts * q * 0.9, 0.07, 0.15), tt)
            tt += bts * q
        for i, (bass, tones) in enumerate([('D2', ['D4', 'F#4', 'A4']), ('A1', ['C#4', 'E4', 'A4']), ('D2', ['D4', 'F#4', 'A4', 'E5'])]):
            at = t0 + i * 4 * q
            S.put('piano', piano(N(bass) + 12, 4 * q, 0.3), at)
            S.put('strings', strings([N(bass) + 12] + tones, 4 * q, 0.22, attack=1.2, release=2.5), at)
            for k in range(6):
                S.put('pluck', harp(N(tones[k % len(tones)]) + (12 if k > 2 else 0), 0.1, -0.3 + 0.12 * k), at + k * q * 0.66)


# ------------------------------------------------------------ helpers for the acts
def melody(S, bus, inst, notes, t0, beat, vel=0.3, pan=0.0, legato=0.95, until=None, **kw):
    """notes: [(name|None, beats)]; inst(m, dur, vel, pan) or (m, vel, pan)"""
    t = t0
    for nm, b in notes:
        if until is not None and t >= until:
            break
        if nm is not None:
            if inst in (flute,):
                S.put(bus, inst(nm, b * beat * legato, vel, pan, **kw), t)
            elif inst is piano:
                S.put(bus, piano(N(nm), b * beat * legato, vel), t)
            else:
                S.put(bus, inst(nm, vel, pan), t)
        t += b * beat
    return t


def chord_pad(S, t0, bass, tones, dur, vel=0.22, attack=0.8, release=1.6, bus='strings', trem=0.0, swell=0.0, bright=2600):
    S.put(bus, strings([bass] + tones, dur, vel, attack=attack, release=release, trem=trem, swell=swell, bright=bright), t0)


JOURNEY_CH = [('D2', ['D4', 'F#4', 'A4']), ('B1', ['D4', 'F#4', 'B4']), ('G1', ['D4', 'G4', 'B4']), ('A1', ['C#4', 'E4', 'A4']),
              ('D2', ['D4', 'F#4', 'A4']), ('F#1', ['C#4', 'F#4', 'A4']), ('G1', ['D4', 'G4', 'B4']), ('A1', ['C#4', 'E4', 'A4'])]
JOURNEY_MEL = [
    [('A4', 1), ('D5', 0.5), ('E5', 0.5), ('F#5', 1), ('A5', 1)],
    [('F#5', 1.5), ('E5', 0.5), ('D5', 1), ('B4', 1)],
    [('G4', 0.5), ('B4', 0.5), ('D5', 1), ('E5', 1), ('D5', 1)],
    [('C#5', 2), ('E5', 1), ('A4', 1)],
    [('A4', 1), ('D5', 0.5), ('E5', 0.5), ('F#5', 1), ('A5', 1)],
    [('B5', 1.5), ('A5', 0.5), ('F#5', 1), ('E5', 1)],
    [('D5', 1), ('E5', 0.5), ('F#5', 0.5), ('G5', 1), ('B4', 1)],
    [('A4', 2), ('E5', 1), ('C#5', 1)],
]


def groove_bar(S, t, beat, bi, level=1.0, minor=False, drums=True, bass=True, offbeats=True):
    """one bar of the journey groove (bar index bi picks the chord)"""
    ch = JOURNEY_CH if not minor else [('B1', ['D4', 'F#4', 'B4']), ('G1', ['D4', 'G4', 'B4']), ('E1', ['E4', 'G4', 'B4']), ('F#1', ['C#4', 'F#4', 'A#4'])]
    root, tones = ch[bi % len(ch)]
    if bass:
        S.put('pluck', pizz(N(root) + 12, 0.42 * level, -0.1), t)
        S.put('pluck', pizz(N(root) + 19, 0.3 * level, -0.1), t + 2 * beat)
        S.put('low', cello(N(root) + 12, beat * 3.7, 0.18 * level), t)
    if offbeats:
        for k in range(4):
            for j, nm in enumerate(tones):
                S.put('mallet', marimba(N(nm) + (12 if minor else 0), 0.08 * level, -0.3 + 0.3 * j), t + (k + 0.5) * beat + j * 0.008)
    if drums:
        for k in range(8):
            S.put('perc', shaker(0.07 * level if k % 2 else 0.1 * level, 0.35), t + k * beat / 2)
        S.put('perc', kick(0.26 * level), t)
        S.put('perc', kick(0.16 * level), t + 2 * beat)
        S.put('perc', brush(0.16 * level, 0.16), t + beat)
        S.put('perc', brush(0.16 * level, 0.16), t + 3 * beat)
    return tones


# ------------------------------------------------------------ Act II: the journey
def act2(S, T):
    sh, evin = T['shot'], T['evin']
    t0 = sh('B1')
    if t0 is None:
        return
    beat = 60 / 96
    bar = 4 * beat
    # B1: the groove comes in under the trotting (no melody yet)
    groove_bar(S, t0, beat, 0, 0.7, drums=False)
    groove_bar(S, t0 + bar, beat, 1, 0.85)
    S.put('mallet', glock('A5', 0.1, 0.2), t0 + bar * 1.5)
    # B2: the melody enters on flute + marimba
    t = sh('B2')
    groove_bar(S, t, beat, 2)
    melody(S, 'wind', flute, JOURNEY_MEL[0], t, beat, 0.12, 0.1)
    melody(S, 'mallet', marimba, JOURNEY_MEL[0], t, beat, 0.14, 0.2)
    # B3: the butterfly lands on the card — everything tiptoes; crossed eyes wobble
    t = sh('B3')
    land, off = evin('flutter_land', 'B3'), evin('flutter_off', 'B3')
    groove_bar(S, t, beat, 3, 0.5, drums=False, offbeats=False)
    for k in range(8):
        S.put('mallet', marimba(['E6', 'F#6'][k % 2], 0.07, 0.3), t + k * beat / 2)
    if land:
        S.put('mallet', glock('A6', 0.12, 0.1), land)
        for k in range(6):
            S.put('mallet', glock(['F#6', 'G6'][k % 2], 0.07, 0.0, 0.9), land + 0.6 + k * 0.22)
        chord_pad(S, land, 'D3', ['A3', 'E4', 'F#4'], (off or land + 3) - land, 0.12, attack=0.4, release=0.6)
    if off:
        for k, nm in enumerate(['D6', 'E6', 'F#6', 'A6', 'D7']):
            S.put('mallet', glock(nm, 0.08, -0.4 + 0.2 * k, 1.2), off + k * 0.07)
    # B4: sneaking… the pounce… the miss
    t = sh('B4')
    for k in range(6):
        S.put('pluck', pizz(['D3', 'F3', 'D3', 'G#3', 'A3', 'C4'][k], 0.3, -0.2), t + k * beat * 0.5 + beat)
    j = evin('jump', 'B4')
    if j:
        for k, nm in enumerate(['D4', 'F#4', 'A4', 'D5', 'F#5']):
            S.put('pluck', pizz(nm, 0.32, -0.2 + 0.1 * k), j - 0.3 + k * 0.06)
        S.put('perc', brush(0.3, 0.3), j)
        S.put('wind', flute('A5', 0.9, 0.12, 0.2, glide=('D5', 0.25), vib=0.2), j + 0.45)
    q = evin('emote', 'B4', 'question')
    if q:
        S.put('pluck', pizz('B4', 0.3, 0.2), q)
        S.put('pluck', pizz('E5', 0.3, 0.2), q + 0.18)
    # B5 → B6: back to the groove, the melody's second phrase; the stones
    for name, bi0, mel0 in (('B5', 4, 4), ('B6', 5, 5)):
        t = sh(name)
        end = T['end'](name)
        stop = evin('music_stop', name) if name == 'B6' else None
        b = 0
        while t + b * bar < (stop or end) - 0.05:
            groove_bar(S, t + b * bar, beat, bi0 + b)
            melody(S, 'wind', flute, JOURNEY_MEL[(mel0 + b) % 8], t + b * bar, beat, 0.12, 0.1, until=stop)
            melody(S, 'mallet', marimba, JOURNEY_MEL[(mel0 + b) % 8], t + b * bar, beat, 0.12, 0.2, until=stop)
            b += 1
    for j in [e for e in T['evs']('jump') if sh('B6') <= e < (T['end']('B6') or 0)]:
        S.put('mallet', glock('A6', 0.1, 0.2, 1.0), j)
    stop = evin('music_stop', 'B6')
    if stop:
        S.put('perc', brush(0.5, 0.35), stop)
        S.put('pluck', pizz('A2', 0.5, 0), stop)
    # B8: wet and sad: a low sigh; the shake; then the pick-up back into the groove
    t = sh('B8')
    if t is not None:
        S.put('low', cello('D3', 1.4, 0.28), t + 0.4)
        S.put('low', cello('C#3', 1.4, 0.24), t + 1.8)
        hs = evin('headshake', 'B8')
        if hs:
            for k in range(10):
                S.put('mallet', marimba('D5' if k % 2 else 'E5', 0.1, -0.3 + 0.06 * k), hs + k * 0.06)
        res = evin('music_resume', 'B8')
        if res:
            t9 = sh('B9a')
            for k, nm in enumerate(['A3', 'C#4', 'E4', 'A4']):
                S.put('pluck', pizz(nm, 0.28 + 0.04 * k, 0.1), t9 - (4 - k) * beat / 2)
    # B9: four inserts on the beat, a bell on each cut (rising)
    t = sh('B9a')
    if t is not None:
        for b in range(2):
            groove_bar(S, t + b * bar, beat, b)
            melody(S, 'wind', flute, JOURNEY_MEL[b], t + b * bar, beat, 0.12, 0.1)
        for k, nm in enumerate(['D6', 'E6', 'F#6', 'A6']):
            S.put('mallet', glock(nm, 0.14, -0.3 + 0.2 * k, 1.6), t + k * 2 * beat)
    # B10–B13: the storm (B minor, the same pulse, darker)
    t = sh('B10')
    if t is not None:
        for b in range(2):
            groove_bar(S, t + b * bar, beat, b, 0.8, minor=True, offbeats=False)
            chord_pad(S, t + b * bar, ['B1', 'G1'][b], ['F#3', 'B3', 'D4'] if b == 0 else ['D3', 'G3', 'B3'], bar, 0.16, attack=0.3, release=0.6, trem=0.4)
        melody(S, 'wind', flute, [('F#5', 1.5), ('E5', 0.5), ('D5', 1), ('C#5', 1), ('D5', 2), ('B4', 2)], t, beat, 0.1, 0.1)
    d = evin('drop_on_card', 'B11')
    if d:
        S.put('strings', strings(['B3', 'D4', 'F#4', 'B4'], 0.25, 0.35, attack=0.01, release=0.3), d)
        S.put('perc', timp('B1', 0.45), d)
        chord_pad(S, d + 0.3, 'E2', ['G3', 'B3', 'E4'], 1.6, 0.16, attack=0.2, trem=0.5)
    t = sh('B12')
    if t is not None:
        for b in range(2):
            tb = t + b * bar
            groove_bar(S, tb, beat, 2 + b, 1.0, minor=True, offbeats=False)
            for k in range(8):
                S.put('strings', strings([['B2', 'F#3'], ['C#3', 'F#3']][b], beat / 2 * 0.9, 0.16, attack=0.01, release=0.08), tb + k * beat / 2)
    st = evin('startle', 'B13') or sh('B13')
    if st:
        S.put('perc', cym_swell(0.8, 0.25), st - 0.8)
        S.put('perc', timp('F#1', 0.6), st)
        S.put('strings', strings(['F#3', 'A#3', 'C#4', 'E4'], 0.3, 0.4, attack=0.01, release=0.4), st)
    # B14: under the roof: the pulse stops; soft piano chords with the rain
    t = sh('B14')
    if t is not None:
        for i, (bs, tones) in enumerate([('B1', ['D4', 'F#4', 'C#5']), ('G1', ['D4', 'F#4', 'B4']), ('D2', ['D4', 'F#4', 'A4']), ('A1', ['C#4', 'E4', 'A4'])]):
            at = t + 1.2 + i * bar * 0.9
            S.put('piano', piano(N(bs) + 12, bar, 0.2), at)
            for k, nm in enumerate(tones):
                S.put('piano', piano(N(nm), bar * 0.8, 0.14), at + 0.05 + k * 0.12)
    # B15: night — a lonely celesta; then the DREAM: the theme's first phrase
    t = sh('B15a')
    if t is not None:
        S.put('low', strings(['B2', 'F#3'], 7, 0.12, attack=2, release=3, bright=1400), t)
        for k, (dt, nm) in enumerate(((1.0, 'F#5'), (2.6, 'D5'), (4.2, 'C#5'), (5.4, 'B4'))):
            S.put('mallet', celesta(nm, 0.12, 0.2 - 0.1 * k, 2.4), t + dt)
    t = sh('B15d')
    if t is not None:
        chord_pad(S, t - 0.3, 'D3', ['A3', 'E4', 'F#4', 'A4'], 5.6, 0.18, attack=1.2, release=2.5)
        for k in range(12):
            S.put('pluck', harp(['D4', 'A4', 'E5', 'F#5', 'A5', 'D6'][k % 6], 0.12, -0.4 + 0.08 * k), t + k * beat / 2)
        melody(S, 'mallet', celesta, [('A5', 1.5), ('D6', 0.5), ('E6', 1), ('F#6', 1), ('E6', 2), ('C#6', 1), ('A5', 1)], t, beat, 0.16, 0.1)
        melody(S, 'wind', flute, [('A4', 1.5), ('D5', 0.5), ('E5', 1), ('F#5', 1), ('E5', 2), ('C#5', 1), ('A4', 1)], t, beat, 0.08, -0.1)
    t = sh('B15w')
    if t is not None:
        for k in range(3):
            S.put('wind', flute('E6', 0.12, 0.08, 0.4, glide=('A6', 0.3), vib=0), t + 0.3 + k * 0.5)
        for k, nm in enumerate(['D4', 'F#4', 'A4', 'D5', 'F#5', 'A5']):
            S.put('pluck', harp(nm, 0.12, -0.2 + 0.1 * k), t + 0.9 + k * 0.1)
    # B16: snow — high bells in a white silence
    t = sh('B16a')
    if t is not None:
        chord_pad(S, t, 'D4', ['A4', 'E5'], 10, 0.1, attack=2.5, release=3, bright=3500)
        for dt, nm in ((0.5, 'A6'), (2.2, 'E6'), (4.0, 'F#6'), (6.0, 'D6'), (7.6, 'A5'), (8.4, 'D6'), (9.0, 'E6'), (9.6, 'F#6')):
            S.put('mallet', glock(nm, 0.1, -0.3 + 0.1 * (dt % 3), 2.4), t + dt)


# ------------------------------------------------------------ Act III: the cape, the loss
def act3(S, T):
    sh, evin = T['shot'], T['evin']
    t = sh('C1')
    if t is None:
        return
    snatch = evin('card_snatch', 'C2')
    # the wind ostinato: a pulsing low B, piano octaves, a thin high note of worry
    b8 = 60 / 112 / 2
    end = snatch or t + 8
    k = 0
    while t + k * b8 < end:
        S.put('low', cello('B2', b8 * 0.8, 0.16 + 0.05 * (k % 2 == 0)), t + k * b8)
        if k % 4 == 0:
            S.put('piano', piano(N('B3') + (7 if (k // 4) % 2 else 0), 0.5, 0.14), t + k * b8)
        k += 1
    S.put('strings', strings(['F#5'], end - t, 0.07, attack=2, release=0.5), t)
    c2 = sh('C2')
    S.put('strings', strings(['B3', 'D4', 'F#4'], (end - c2), 0.14, attack=0.8, release=0.2, trem=0.6, swell=0.8), c2)
    # the snatch: a hit — and the chase (144 bpm, driving)
    if snatch:
        S.put('perc', timp('B1', 0.6), snatch)
        S.put('strings', strings(['B2', 'F#3', 'B3', 'D4', 'F#4'], 0.4, 0.4, attack=0.01, release=0.3), snatch)
        sm_in = evin('slowmo_in', 'C4c')
        beat = 60 / 144
        k = 0
        pat = ['B3', 'D4', 'F#4', 'D4', 'B3', 'E4', 'G4', 'E4', 'A3', 'C#4', 'F#4', 'C#4', 'B3', 'D4', 'F#4', 'A4']
        roots = ['B1', 'G1', 'F#1', 'B1']
        while snatch + 0.5 + k * beat / 2 < (sm_in or snatch + 8) - 0.05:
            tt = snatch + 0.5 + k * beat / 2
            S.put('strings', strings([pat[k % 16]], beat / 2 * 0.85, 0.13, attack=0.01, release=0.05), tt)
            if k % 8 == 0:
                S.put('perc', timp(roots[(k // 8) % 4], 0.35), tt)
                S.put('low', cello(N(roots[(k // 8) % 4]) + 12, beat * 3.6, 0.22), tt)
            if k % 4 == 2:
                S.put('perc', brush(0.22, 0.14), tt)
            k += 1
        # the motif, urgent, climbing
        for i, nm in enumerate(['A5', 'D6', 'E6', 'F#6', 'A5', 'D6', 'E6', 'G6', 'B5', 'E6', 'F#6', 'A6']):
            at = snatch + 1.2 + i * beat
            if sm_in and at >= sm_in:
                break
            S.put('wind', flute(nm, beat * 0.8, 0.12, 0.1), at)
        sm_out = evin('slowmo_out', 'C4c')
        if sm_in and sm_out:
            hold = sm_out - sm_in
            S.put('strings', strings(['B4', 'C#5', 'F#5', 'G5'], hold + 2.5, 0.2, attack=0.5, release=0.8, swell=0.5), sm_in)
            for i in range(int((hold + 2) / 0.75)):
                S.put('perc', kick(0.25), sm_in + i * 0.75)
            for i in range(int(hold / 0.5)):
                S.put('mallet', celesta(['F#6', 'E6', 'D6', 'C#6', 'B5'][i % 5], 0.08, 0.2, 2.0), sm_in + 0.3 + i * 0.5)
        stop = evin('music_stop', 'C4e')
        if stop:
            S.put('perc', timp('B1', 0.5, 2.5), stop)
    loss = evin('music_loss', 'C7')
    if loss:
        S.put('piano', piano(N('B1'), 5, 0.4), loss)
        for i, nm in enumerate(['B2', 'F#3', 'D4', 'C#5']):
            S.put('piano', piano(N(nm), 5, 0.12), loss + 0.02 + i * 0.03)
        for i, (dt, nm, d) in enumerate(((1.6, 'F#5', 1.2), (2.8, 'E5', 1.0), (3.9, 'D5', 1.3), (5.4, 'C#5', 3.0))):
            S.put('piano', piano(N(nm), d, 0.24), loss + dt)


# ------------------------------------------------------------ Act IV: the sea
THEME72 = [('A4', 1.5), ('D5', 0.5), ('E5', 1), ('F#5', 1), ('E5', 2), ('C#5', 1), ('A4', 1), ('D5', 1.5), ('C#5', 0.5), ('B4', 1), ('F#5', 1),
           ('E5', 3), ('D5', 1), ('D5', 1), ('F#5', 1), ('A5', 2), ('G5', 1.5), ('F#5', 0.5), ('E5', 1), ('D5', 1), ('E5', 1), ('C#5', 1), ('D5', 2)]
THEME72_CH = [('D2', ['D4', 'F#4', 'A4']), ('C#2', ['E4', 'A4', 'C#5']), ('B1', ['D4', 'F#4', 'B4']), ('G1', ['D4', 'G4', 'B4']),
              ('F#1', ['D4', 'F#4', 'A4']), ('G1', ['E4', 'G4', 'B4']), ('A1', ['C#4', 'E4', 'G4']), ('D2', ['D4', 'F#4', 'A4', 'E5'])]


def act4(S, T):
    sh, evin = T['shot'], T['evin']
    t = sh('D2')
    if t is None:
        return
    # eyes open: a harp rises; a high violin holds a note of hope
    for k, (tt, m) in enumerate(gliss('D4', 'A5', 1.4)):
        S.put('pluck', harp(m, 0.12, -0.4 + 0.08 * k), t + 0.7 + tt)
    S.put('strings', strings(['A5'], 4, 0.07, attack=1.5, release=1.5), t + 1)
    # D3: the climb — everything gathers on the dominant, a timpani roll
    t3 = sh('D3')
    t4 = sh('D4')
    if t3 is not None and t4 is not None:
        L = t4 - t3
        S.put('strings', strings(['A2', 'E3', 'A3', 'C#4', 'E4', 'A4'], L, 0.28, attack=L * 0.9, release=0.4, swell=0.9), t3)
        for i in range(int(L / 0.09)):
            S.put('perc', timp('A1', 0.05 + 0.25 * (i * 0.09 / L) ** 2, 0.4), t3 + L * 0.35 + i * 0.09 * 0.65)
        S.put('perc', cym_swell(2.2, 0.3), t4 - 1.9)
    if t4 is None:
        return
    # D4 → D6: the theme, at last, in full
    q = 60 / 72
    t0 = t4 + 0.5
    S.put('perc', timp('D2', 0.55, 3), t0)
    tt = t0
    for i, (nm, b) in enumerate(THEME72):
        S.put('piano', piano(N(nm), b * q * 0.95, 0.4), tt)
        S.put('mallet', glock(N(nm) + 12, 0.05, 0.2, 1.8), tt)
        S.put('wind', flute(nm, b * q * 0.9, 0.08, -0.15), tt)
        tt += b * q
    for i, (bass, tones) in enumerate(THEME72_CH):
        at = t0 + i * 4 * q
        S.put('piano', piano(N(bass) + 12, 4 * q, 0.26), at)
        chord_pad(S, at, N(bass) + 12, tones, 4 * q, 0.2 + 0.03 * min(i, 4), attack=0.6, release=2.2)
        S.put('low', cello(N(bass) + 12, 4 * q * 0.95, 0.2), at)
        for k in range(8):
            S.put('pluck', harp(N(tones[k % len(tones)]) + (12 if k >= 4 else 0), 0.08, -0.3 + 0.08 * k), at + k * q / 2)


# ------------------------------------------------------------ Act V: the beach
def act5(S, T):
    sh, evin = T['shot'], T['evin']
    t1 = sh('E1')
    if t1 is None:
        return
    beat = 60 / 112
    bar = 4 * beat
    tb = t1 + 1.6
    # the beach groove (bright, light), melody in glock + flute
    def bars(t_from, n, mel_from=0, level=1.0, melody_on=True):
        for b in range(n):
            groove_bar(S, t_from + b * bar, beat, mel_from + b, 0.8 * level)
            if melody_on:
                melody(S, 'mallet', glock, JOURNEY_MEL[(mel_from + b) % 8], t_from + b * bar, beat, 0.07 * level, 0.25)
                melody(S, 'wind', flute, JOURNEY_MEL[(mel_from + b) % 8], t_from + b * bar, beat, 0.08 * level, 0.1)
    e2 = sh('E2')
    n1 = int((e2 - tb) / bar)
    bars(tb, max(1, n1))
    ex = evin('emote', 'E2', 'exclaim')
    if ex:
        S.put('pluck', pizz('A5', 0.35, 0.2), ex)
        S.put('pluck', pizz('E6', 0.3, 0.2), ex + 0.07)
    qn = evin('emote', 'E2', 'question')
    if qn:
        for k, nm in enumerate(['D5', 'F#5', 'B5']):
            S.put('pluck', pizz(nm, 0.26, 0.1), qn + k * 0.2)
    # E3: the game — groove, the flight, the brace, the wash (freeze!)
    t3 = sh('E3')
    hit = T['ev']('wave_hit')
    freeze = hit if hit is not None else t3 + 214 / 24
    k = 0
    while t3 + (k + 1) * bar < freeze - 1.4:
        groove_bar(S, t3 + k * bar, beat, k, 0.85)
        melody(S, 'mallet', marimba, JOURNEY_MEL[(k + 4) % 8], t3 + k * bar, beat, 0.1, 0.25)
        k += 1
    # the brace: a held, rising question
    brace = t3 + k * bar
    S.put('strings', strings(['A3', 'D4', 'E4', 'A4'], freeze - brace + 0.3, 0.18, attack=0.6, release=0.2, trem=0.4, swell=0.8), brace)
    S.put('mallet', glock('A6', 0.16, 0.0, 2.4), freeze)
    S.put('strings', strings(['A5'], 2.2, 0.08, attack=0.05, release=1.2), freeze + 0.1)
    # E3b: the laugh — a burst of joy
    tb3 = sh('E3b')
    if tb3 is not None:
        joy = tb3 + 30 / 24
        for k2, nm in enumerate(['D5', 'F#5', 'A5', 'D6', 'F#6', 'A6']):
            S.put('mallet', glock(nm, 0.12, -0.4 + 0.16 * k2, 1.6), joy + k2 * 0.06)
        chord_pad(S, joy, 'D3', ['D4', 'F#4', 'A4', 'D5'], 2.2, 0.26, attack=0.05, release=1.2)
        groove_bar(S, joy + 0.1, beat, 0, 1.0)
    # E4: the card comes back — the motif, tender; then resolved at last
    t4a = sh('E4a')
    if t4a is not None:
        chord_pad(S, t4a, 'D3', ['A3', 'E4', 'F#4'], 12, 0.14, attack=1.5, release=3)
        for dt, nm in ((0.6, 'A5'), (1.5, 'D6'), (2.2, 'E6'), (3.2, 'F#6')):
            S.put('mallet', celesta(nm, 0.16, 0.1, 2.6), t4a + dt)
    t4b = sh('E4b')
    if t4b is not None:
        melody(S, 'piano', piano, [('A4', 1.5), ('D5', 0.5), ('E5', 1), ('F#5', 1), ('A5', 2), ('F#5', 1), ('D5', 3)], t4b + 0.4, 60 / 76, 0.34)
        for i, (bass, tones) in enumerate([('D2', ['D4', 'F#4', 'A4']), ('G1', ['D4', 'G4', 'B4']), ('A1', ['C#4', 'E4', 'A4']), ('D2', ['D4', 'F#4', 'A4', 'E5'])]):
            at = t4b + 0.4 + i * 2.4
            S.put('piano', piano(N(bass) + 12, 2.4, 0.2), at)
            chord_pad(S, at, N(bass) + 12, tones, 2.6, 0.16, attack=0.8, release=2)
    t4c = sh('E4c')
    if t4c is not None:
        for k2 in range(16):
            S.put('pluck', harp(['D4', 'F#4', 'A4', 'D5', 'E5', 'F#5', 'A5', 'D6'][k2 % 8], 0.1, -0.4 + 0.05 * k2), t4c + 0.2 + k2 * 0.22)
    # E5: the finale — the theme's last phrase, broad; the final D add9
    t5 = sh('E5')
    if t5 is not None:
        q = 60 / 66
        t0 = t5 + 0.8
        last = [('D5', 1), ('F#5', 1), ('A5', 2), ('G5', 1.5), ('F#5', 0.5), ('E5', 1), ('D5', 1), ('E5', 2), ('C#5', 1), ('A4', 1), ('D5', 4)]
        tt = t0
        for nm, b in last:
            S.put('piano', piano(N(nm), b * q * 0.95, 0.38), tt)
            S.put('wind', flute(nm, b * q * 0.92, 0.09, -0.1), tt)
            S.put('mallet', glock(N(nm) + 12, 0.045, 0.2, 2.0), tt)
            tt += b * q
        for i, (bass, tones) in enumerate([('F#1', ['D4', 'F#4', 'A4']), ('G1', ['E4', 'G4', 'B4']), ('A1', ['C#4', 'E4', 'A4']), ('D2', ['D4', 'F#4', 'A4', 'E5'])]):
            at = t0 + i * 4 * q
            dur = 4 * q if i < 3 else 10
            S.put('piano', piano(N(bass) + 12, dur, 0.22), at)
            chord_pad(S, at, N(bass) + 12, tones, dur, 0.18, attack=0.7, release=4 if i == 3 else 2)
            S.put('low', cello(N(bass) + 12, dur * 0.95, 0.16), at)
            for k2 in range(8):
                S.put('pluck', harp(N(tones[k2 % len(tones)]) + (12 if k2 >= 4 else 0), 0.08, -0.3 + 0.08 * k2), at + k2 * q / 2)
        fin = t0 + 12 * q
        S.put('perc', timp('D2', 0.22, 3.5), fin)
        for k2, nm in enumerate(['D3', 'A3', 'D4', 'F#4', 'E5']):
            S.put('piano', piano(N(nm), 8, 0.17), fin + 0.02 * k2)
    te = sh('end')
    if te is not None:
        for dt, nm, d in ((2.0, 'A4', 0.9), (2.9, 'D5', 0.6), (3.5, 'E5', 0.9), (4.4, 'F#5', 5.0)):
            S.put('piano', piano(N(nm), d, 0.26), te + dt)
        S.put('piano', piano(N('D3'), 6, 0.18), te + 4.4)


def load_timeline(path):
    tl = json.load(open(path))
    fps = tl['fps']
    shots = {s['name']: s['start'] / fps for s in tl['shots']}
    evs = tl['events']

    def ev(ty, kind=None):
        for e in evs:
            if e['type'] == ty and (kind is None or e.get('kind') == kind):
                return e['t'] / fps
        return None

    def evs_(ty):
        return [e['t'] / fps for e in evs if e['type'] == ty]

    def evin(ty, shot, kind=None):
        for e in evs:
            if e['type'] == ty and e.get('shot') == shot and (kind is None or e.get('kind') == kind):
                return e['t'] / fps
        return None
    ends = {s['name']: (s['start'] + s['dur']) / fps for s in tl['shots']}
    T = {'shot': lambda name: shots.get(name), 'end': lambda name: ends.get(name), 'ev': ev, 'evs': evs_, 'evin': evin}
    return tl, T


def compose(tl, T):
    S = Score(tl['length'] / tl['fps'])
    act1(S, T)
    act2(S, T)
    act3(S, T)
    act4(S, T)
    act5(S, T)
    return S.render()[: int(tl['length'] / tl['fps'] * SR) + 6 * SR]


if __name__ == '__main__':
    import argparse
    import soundfile as sf
    ap = argparse.ArgumentParser()
    ap.add_argument('--timeline', default=os.path.join(ROOT, 'build', 'timeline.json'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'build', 'score.wav'))
    a = ap.parse_args()
    tl, T = load_timeline(a.timeline)
    x = compose(tl, T)
    x = x / (np.abs(x).max() + 1e-9) * 0.8
    sf.write(a.out, x.astype(np.float32), SR)
    print('wrote', a.out, f'{len(x) / SR:.1f}s')
