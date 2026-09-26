// "Idle life": the small involuntary things a living cat does all the time —
// blinks (sometimes double), ear flicks, whisker twitches, breathing and a
// lazy tail tip. Pure functions of time (seeded), layered on top of the keyed
// performance so no shot ever holds a dead frame.
import { hash01, clamp, smoothstep } from '../core/math.js';

function blinkAmount(t, seed) {
  // one blink per ~3.5 s cell, placed at a random offset; 20% double blinks
  const L = 84;
  const c = Math.floor(t / L);
  let m = 1;
  for (const cell of [c - 1, c]) {
    const b0 = cell * L + 8 + hash01(seed * 131 + cell * 17) * 58;
    const starts = [b0];
    if (hash01(seed * 71 + cell * 29) > 0.8) starts.push(b0 + 9);
    for (const b of starts) {
      const d = t - b;
      if (d < 0 || d >= 6) continue;
      const v = d < 1.5 ? 0.3 : d < 3.5 ? 0.0 : d < 5 ? 0.55 : 0.9;
      m = Math.min(m, v);
    }
  }
  return m;
}

function flick(t, seed, L, prob, off) {
  const c = Math.floor(t / L);
  let out = 0, which = 0;
  for (const cell of [c - 1, c]) {
    if (hash01(seed * 53 + cell * 13 + off) > prob) continue;
    const b = cell * L + 15 + hash01(seed * 97 + cell * 7 + off) * (L - 35);
    const d = t - b;
    if (d < 0 || d > 12) continue;
    const a = d < 2 ? d / 2 : d < 3 ? 1 : Math.exp(-(d - 3) / 2.5);
    out = Math.max(out, a * (0.35 + 0.3 * hash01(seed + cell * 3 + off)));
    which = hash01(seed * 19 + cell * 11 + off) > 0.5 ? 1 : -1;
  }
  return { a: out, which };
}

/** Face-only idle (blinks, ear flicks, whisker twitch). Mutates p. */
export function idleFace(p, t, seed = 1, o = {}) {
  if (o.blink !== false && (p.eye ?? 1) > 0.6 && (p.happy || 0) < 0.3 && (p.lid || 0) < 0.5 && (p.squeeze || 0) < 0.3 && !(p.wink)) {
    p.eye = (p.eye ?? 1) * blinkAmount(t, seed);
  }
  if (o.ears !== false) {
    const e = flick(t, seed, 132, 0.6, 1);
    if (e.a > 0) {
      if (e.which > 0) p.earLR = (p.earLR || 0) + e.a;
      else p.earRR = (p.earRR || 0) + e.a;
    }
  }
  const w = flick(t, seed, 110, 0.45, 2);
  if (w.a > 0) p.whisk = (p.whisk || 0) + w.a * 0.35 * w.which;
  return p;
}

/** Perf overlay: idle face + breathing + a lazy tail tip. */
export function idleLife(seed = 1, o = {}) {
  return (p, t) => {
    if (o.from !== undefined && t < o.from) return;
    idleFace(p, t, seed, o);
    const br = 0.5 + 0.5 * Math.sin((t / (o.breathPeriod || 78)) * Math.PI * 2 + seed);
    p.breath = (p.breath || 0) + br * (o.breath ?? 0.45);
    if ((p.tailTone ?? 1) > 0.5 && o.tail !== false) {
      p.tailWave = (p.tailWave || 0) + 0.09 * (0.6 + 0.4 * Math.sin(t * 0.021 + seed));
      p.tailWaveP = (p.tailWaveP || 0) + t * 0.065;
    }
  };
}
