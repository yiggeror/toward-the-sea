// "Idle life": the small involuntary things a living cat does all the time —
// blinks (sometimes double), ear flicks, whisker twitches, breathing and a
// lazy tail tip. Pure functions of time (seeded), layered on top of the keyed
// performance so no shot ever holds a dead frame.
import { hash01, clamp, smoothstep, noise1 } from '../core/math.js';

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
  // eye saccades: the gaze darts to a new spot and holds there a moment
  if (o.saccades !== false && (p.eye ?? 1) > 0.3) {
    const L = 30;
    const c = Math.floor((t + seed * 7) / L);
    const k = smoothstep(0, 2, (t + seed * 7) - c * L);
    const gx = (hash01(seed * 17 + c * 5) - 0.5) * 0.3, gy = (hash01(seed * 29 + c * 3) - 0.5) * 0.22;
    const px = (hash01(seed * 17 + (c - 1) * 5) - 0.5) * 0.3, py = (hash01(seed * 29 + (c - 1) * 3) - 0.5) * 0.22;
    p.lookX = (p.lookX || 0) + px + (gx - px) * k;
    p.lookY = (p.lookY || 0) + py + (gy - py) * k;
  }
  return p;
}

/** Perf overlay: idle face + breathing + a lazy tail tip + small weight
 * shifts and head drift while the body is still, and a blink whenever the
 * head makes a big turn (as cats do). */
export function idleLife(seed = 1, o = {}) {
  return (p, t, perf) => {
    if (o.from !== undefined && t < o.from) return;
    idleFace(p, t, seed, o);
    if (perf && perf.tracks) {
      // blink on big head turns
      const h0 = perf.tracks.head.sample(t), h1 = perf.tracks.head.sample(t - 4);
      const turn = Math.abs(h0.hYaw - h1.hYaw) + Math.abs(h0.hPitch - h1.hPitch) * 0.7;
      if (turn > 0.35 && (p.eye ?? 1) > 0.6 && (p.happy || 0) < 0.3 && (p.squeeze || 0) < 0.3) p.eye *= 0.15;
      // still? then shift weight a little and let the head drift
      const b0 = perf.tracks.body.sample(t).hip, b1 = perf.tracks.body.sample(t - 8).hip;
      const still = 1 - smoothstep(0.01, 0.06, Math.hypot(b0[0] - b1[0], b0[1] - b1[1]));
      if (still > 0.01 && o.sway !== false) {
        p.hip = [p.hip[0] + noise1(t * 0.012, seed + 3) * 0.035 * still, p.hip[1] + noise1(t * 0.017, seed + 5) * 0.012 * still];
        p.hPitch = (p.hPitch || 0) + noise1(t * 0.02, seed + 7) * 0.05 * still;
        p.hRoll = (p.hRoll || 0) + noise1(t * 0.015, seed + 9) * 0.05 * still;
        p.hYaw = (p.hYaw || 0) + noise1(t * 0.01, seed + 11) * 0.06 * still;
      }
    }
    const br = 0.5 + 0.5 * Math.sin((t / (o.breathPeriod || 78)) * Math.PI * 2 + seed);
    p.breath = (p.breath || 0) + br * (o.breath ?? 0.45);
    if ((p.tailTone ?? 1) > 0.5 && o.tail !== false) {
      p.tailWave = (p.tailWave || 0) + 0.09 * (0.6 + 0.4 * Math.sin(t * 0.021 + seed));
      p.tailWaveP = (p.tailWaveP || 0) + t * 0.065;
    }
  };
}
