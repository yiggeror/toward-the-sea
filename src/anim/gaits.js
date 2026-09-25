// Locomotion. Each gait is an authored table of key poses; the generator
// plants every paw in world space (no foot sliding), drives swing arcs through
// the gait's swing key poses, and keys the body/neck on the gait's body key
// poses. Phase advances with distance, so speed changes never slide feet.
import { clamp, lerp, ease as easeFn, smoothstep, fract } from '../core/math.js';
import { LEGS } from './perf.js';

// ---- gait tables -----------------------------------------------------------
// swing rows: [timeFrac, progressFrac, lift, curl, ease-to-next]
// body rows:  [phase, hipDy, shoulderDy, archB+, archF+, len*]
export const GAITS = {
  walk: {
    S: 1.3, C: 22, beta: 0.62, height: 1.0,
    phase: { hn: 0, fn: 0.25, hf: 0.5, ff: 0.75 },
    neutral: { fn: 1.1, ff: 1.0, hn: 0.05, hf: -0.05 },
    swing: {
      fore: [[0, 0, 0, 0], [0.16, 0.02, 0.05, 0.55], [0.48, 0.44, 0.17, 1.0], [0.8, 0.88, 0.07, 0.22], [1, 1, 0, 0]],
      hind: [[0, 0, 0, 0], [0.2, 0.03, 0.06, 0.6], [0.5, 0.5, 0.14, 0.9], [0.8, 0.9, 0.05, 0.15], [1, 1, 0, 0]],
    },
    body: [
      [0.0, 0.005, 0.0, 0, 0, 1], [0.06, 0.022, -0.005, 0.01, 0, 1], [0.19, 0.0, -0.012, 0, 0, 1],
      [0.31, -0.012, 0.028, -0.01, 0.01, 1], [0.44, 0.0, 0.0, 0, 0, 1], [0.56, 0.022, -0.005, 0.01, 0, 1],
      [0.69, 0.0, -0.012, 0, 0, 1], [0.81, -0.012, 0.028, -0.01, 0.01, 1], [0.94, 0.0, 0.0, 0, 0, 1],
    ],
    neck: [[0.0, 0], [0.31, -0.05], [0.5, 0], [0.81, -0.05]],
    pitchBase: 0.05,
    pose: { tailA: 0.55, tailC: 1.1, tailK: 0.9, tailTone: 1 },
  },
  trot: {
    S: 1.9, C: 14, beta: 0.46, height: 1.0,
    phase: { hn: 0, ff: 0.03, hf: 0.5, fn: 0.53 },
    neutral: { fn: 1.1, ff: 1.0, hn: 0.08, hf: -0.02 },
    swing: {
      fore: [[0, 0, 0, 0], [0.15, 0.03, 0.08, 0.65], [0.46, 0.45, 0.21, 1.0], [0.78, 0.9, 0.08, 0.2], [1, 1, 0, 0]],
      hind: [[0, 0, 0, 0], [0.18, 0.04, 0.09, 0.7], [0.5, 0.5, 0.18, 0.95], [0.8, 0.92, 0.06, 0.15], [1, 1, 0, 0]],
    },
    body: [
      [0.0, 0.03, 0.03, 0.02, 0, 0.99], [0.08, 0.04, 0.04, 0.03, 0.01, 0.98], [0.26, -0.03, -0.03, -0.02, -0.01, 1.02],
      [0.5, 0.03, 0.03, 0.02, 0, 0.99], [0.58, 0.04, 0.04, 0.03, 0.01, 0.98], [0.76, -0.03, -0.03, -0.02, -0.01, 1.02],
    ],
    neck: [[0.0, 0.0], [0.08, -0.05], [0.26, 0.03], [0.5, 0.0], [0.58, -0.05], [0.76, 0.03]],
    pitchBase: 0.04,
    pose: { tailA: 0.45, tailC: 0.9, tailK: 0.7, tailTone: 1 },
  },
  // rotary gallop: hinds land, push (extended flight), fores land, push (gathered flight)
  run: {
    S: 3.6, C: 12, beta: 0.26, height: 0.98, gallop: true,
    phase: { hf: 0, hn: 0.08, ff: 0.44, fn: 0.53 },
    neutral: { fn: 1.25, ff: 1.12, hn: 0.3, hf: 0.2 },
    swing: {
      fore: [[0, 0, 0, 0], [0.12, -0.04, 0.2, 0.95], [0.35, 0.2, 0.38, 1.0], [0.62, 0.66, 0.36, 0.3, 0.7], [0.85, 0.96, 0.16, 0.0, 1.0], [1, 1, 0, 0]],
      hind: [[0, 0, 0, 0], [0.14, -0.16, 0.3, 0.7], [0.42, 0.3, 0.42, 1.0], [0.7, 0.8, 0.26, 0.5], [0.9, 0.97, 0.08, 0.1], [1, 1, 0, 0]],
    },
    body: [
      // gathered at hind landing -> extending during hind stance -> extended flight -> fores land -> gather
      [0.0, 0.08, -0.06, 0.45, 0.12, 0.82],
      [0.12, 0.1, 0.02, 0.2, 0.05, 0.92],
      [0.28, -0.18, -0.14, -0.2, -0.08, 1.16],
      [0.4, -0.42, -0.3, -0.32, -0.12, 1.24],
      [0.5, -0.16, 0.02, -0.14, -0.04, 1.1],
      [0.62, 0.06, 0.1, 0.2, 0.06, 0.94],
      [0.78, -0.12, -0.14, 0.42, 0.15, 0.84],
      [0.9, -0.2, -0.26, 0.52, 0.18, 0.8],
    ],
    neck: [[0.0, -0.05], [0.3, 0.05], [0.5, -0.08], [0.78, 0.02]],
    pitchBase: 0.02,
    pose: { tailA: 0.12, tailC: 0.3, tailK: 0.25, tailTone: 1, tailWorld: 0.65, earRot: 0.45, earFlat: 0.15 },
  },
  stalk: {
    S: 0.78, C: 40, beta: 0.74, height: 0.8,
    phase: { hn: 0, fn: 0.25, hf: 0.5, ff: 0.75 },
    neutral: { fn: 1.22, ff: 1.12, hn: 0.0, hf: -0.1 },
    swing: {
      fore: [[0, 0, 0, 0], [0.2, 0.0, 0.07, 0.7], [0.55, 0.5, 0.12, 0.9], [0.85, 0.94, 0.04, 0.2], [1, 1, 0, 0]],
      hind: [[0, 0, 0, 0], [0.25, 0.02, 0.06, 0.55], [0.55, 0.5, 0.09, 0.7], [0.85, 0.95, 0.03, 0.1], [1, 1, 0, 0]],
    },
    body: [
      [0.0, 0.0, 0.0, -0.08, -0.06, 1.04], [0.25, 0.0, 0.02, -0.1, -0.06, 1.05],
      [0.5, 0.0, 0.0, -0.08, -0.06, 1.04], [0.75, 0.0, 0.02, -0.1, -0.06, 1.05],
    ],
    neck: [[0, 0]],
    pitchBase: -0.1,
    pulse: 0.42, // fraction of each quarter-cycle spent holding (stop-and-go)
    pose: { tailA: -0.1, tailC: 0.15, tailK: 0.6, tailTone: 1, neck: 0.12, hPitch: -0.12, earRot: -0.15, pupil: 0.8, whisk: 0.7 },
  },
  // leaning into a strong headwind: low, short effortful steps
  wind: {
    S: 0.7, C: 30, beta: 0.72, height: 0.72,
    phase: { hn: 0, fn: 0.25, hf: 0.5, ff: 0.75 },
    neutral: { fn: 1.18, ff: 1.08, hn: -0.06, hf: -0.16 },
    swing: {
      fore: [[0, 0, 0, 0], [0.2, 0.0, 0.05, 0.6], [0.55, 0.52, 0.09, 0.8], [0.85, 0.93, 0.03, 0.2], [1, 1, 0, 0]],
      hind: [[0, 0, 0, 0], [0.25, 0.0, 0.04, 0.5], [0.55, 0.5, 0.07, 0.6], [0.85, 0.95, 0.02, 0.1], [1, 1, 0, 0]],
    },
    body: [
      [0.0, 0.01, 0.02, -0.02, 0.02, 1.0], [0.25, -0.01, 0.03, 0.02, 0.04, 1.0],
      [0.5, 0.01, 0.02, -0.02, 0.02, 1.0], [0.75, -0.01, 0.03, 0.02, 0.04, 1.0],
    ],
    neck: [[0, -0.2], [0.25, -0.24], [0.5, -0.2], [0.75, -0.24]],
    pitchBase: -0.1,
    pulse: 0.25,
    pose: { tailA: -0.35, tailC: -0.2, tailK: 0, tailTone: 0.7, neck: 0.3, hPitch: -0.25, earRot: 0.8, earFlat: 0.6, eye: 0.45 },
  },
  // tired plodding walk (wasteland)
  tired: {
    S: 1.1, C: 26, beta: 0.65, height: 0.96,
    phase: { hn: 0, fn: 0.25, hf: 0.5, ff: 0.75 },
    neutral: { fn: 1.08, ff: 0.98, hn: 0.04, hf: -0.06 },
    swing: {
      fore: [[0, 0, 0, 0], [0.18, 0.02, 0.03, 0.4], [0.5, 0.46, 0.11, 0.8], [0.82, 0.9, 0.04, 0.15], [1, 1, 0, 0]],
      hind: [[0, 0, 0, 0], [0.22, 0.03, 0.04, 0.45], [0.5, 0.5, 0.1, 0.75], [0.82, 0.92, 0.03, 0.1], [1, 1, 0, 0]],
    },
    body: [
      [0.0, 0.01, 0.0, 0.02, 0, 1], [0.08, 0.035, 0.0, 0.03, 0, 1], [0.2, 0.0, -0.01, 0.02, 0, 1],
      [0.33, -0.005, 0.045, 0.02, 0.02, 1], [0.44, 0.0, 0.0, 0.02, 0, 1], [0.58, 0.035, 0.0, 0.03, 0, 1],
      [0.7, 0.0, -0.01, 0.02, 0, 1], [0.83, -0.005, 0.045, 0.02, 0.02, 1], [0.94, 0.0, 0.0, 0.02, 0, 1],
    ],
    neck: [[0.0, -0.3], [0.33, -0.38], [0.5, -0.3], [0.83, -0.38]],
    pitchBase: 0.02,
    pose: { tailA: -0.2, tailC: 0.3, tailK: 0.4, tailTone: 0.6, hPitch: -0.15, earRot: 0.35, eye: 0.7 },
  },
};

// sample periodic body table at phase p
function bodyAt(G, p) {
  const rows = G.body;
  const x = fract(p);
  let i = rows.length - 1;
  for (let k = 0; k < rows.length; k++) if (rows[k][0] <= x) i = k;
  const a = rows[i], b = rows[(i + 1) % rows.length];
  const span = (b[0] <= a[0] ? b[0] + 1 : b[0]) - a[0];
  const u = span > 0 ? ((x - a[0] + 1) % 1) / span : 0;
  const e = easeFn('sine', clamp(u));
  const out = [];
  for (let j = 1; j < a.length; j++) out.push(lerp(a[j], b[j], e));
  return out; // [hipDy, shDy, archB, archF, len]
}
function neckAt(G, p) {
  const rows = G.neck;
  const x = fract(p);
  let i = rows.length - 1;
  for (let k = 0; k < rows.length; k++) if (rows[k][0] <= x) i = k;
  const a = rows[i], b = rows[(i + 1) % rows.length];
  const span = (b[0] <= a[0] ? b[0] + 1 : b[0]) - a[0];
  const u = span > 0 ? ((x - a[0] + 1) % 1) / span : 0;
  return lerp(a[1], b[1], easeFn('sine', clamp(u)));
}

// Distance profile with accel/decel; optional stop-and-go pulses.
function makeProfile(D, vmax, Ta, Td, pulse = 0, S = 1) {
  const da = (vmax * Ta) / 2, dd = (vmax * Td) / 2;
  let Dc = D - da - dd;
  let k = 1;
  if (Dc < 0) {
    k = Math.sqrt(D / (da + dd));
    Ta *= k; Td *= k;
    Dc = 0;
  }
  const v = vmax * k;
  const Tc = Dc / vmax;
  const T = Ta + Tc + Td;
  const base = (t) => {
    if (t <= 0) return 0;
    if (t < Ta) return (v * t * t) / (2 * Ta);
    if (t < Ta + Tc) return (v * Ta) / 2 + v * (t - Ta);
    if (t < T) {
      const u = T - t;
      return D - (v * u * u) / (2 * Td);
    }
    return D;
  };
  if (!pulse) return { T, d: base };
  // stop-and-go: remap distance within each quarter stride
  const q = S / 4;
  return {
    T,
    d: (t) => {
      const x = base(t);
      const n = Math.floor(x / q), f = x / q - n;
      const hold = pulse;
      const g = f < hold ? 0 : easeFn('inout', (f - hold) / (1 - hold));
      return Math.min(D, (n + g) * q);
    },
  };
}
// invert a monotone function by bisection
function invert(fn, target, lo, hi) {
  if (fn(hi) < target) return hi;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (fn(m) < target) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/**
 * Locomote along x.
 * opts: { gait:'walk'|..., dist (signed) | to, t0, accel (frames), decel,
 *         speed (cycle-rate multiplier), strideScale, surface, liftScale, height }
 * A small stepping controller plans footfalls: legs lift on their nominal
 * phase, or early when over-extended; a girdle never lifts both legs at once
 * (except in the gallop); on stopping, settle steps bring paws under the body.
 * Returns end time. Keys are written into perf.
 */
export function locomote(perf, opts) {
  const G0 = typeof opts.gait === 'string' ? GAITS[opts.gait] : opts.gait;
  const G = Object.assign({}, G0, opts.override || {});
  const t0 = opts.t0 ?? perf.t;
  const pose = perf.curPose();
  const hip0 = pose.hip.slice();
  const target = opts.to ?? hip0[0] + opts.dist;
  const D = Math.abs(target - hip0[0]);
  const f = Math.sign(target - hip0[0]) || pose.facing || 1;
  const S = G.S * (opts.strideScale ?? 1);
  const C = G.C / (opts.speed ?? 1);
  const vmax = S / C;
  const Ta = opts.accel ?? C * 0.8, Td = opts.decel ?? C * 0.8;
  const prof = makeProfile(D, vmax, Ta, Td, G.pulse || 0, S);
  const T = prof.T;
  const ground = perf.ground;
  const hipX = (tau) => hip0[0] + f * prof.d(Math.min(tau, T));
  const height = opts.height ?? G.height;
  const ramp = (tau) => smoothstep(0, Ta * 0.8 + 1, tau) * (1 - smoothstep(T - Td * 0.8 - 1, T, tau));
  const gallop = !!G.gallop;
  const liftScale = opts.liftScale ?? 1;

  perf.holdAll(t0);
  if (pose.facing !== f) perf.key(t0, { facing: f }, 'hold');
  const gp = Object.assign({}, G.pose || {}, opts.pose || {});
  if (Object.keys(gp).length) {
    const blend = opts.poseBlend ?? 10;
    const neckGp = gp.neck;
    delete gp.neck;
    perf.move(t0, t0 + blend, gp, 'inout');
    if (neckGp !== undefined && opts.neck === undefined) opts = Object.assign({}, opts, { neck: neckGp });
  }

  // ---- stepping controller ----
  const swingDur = Math.max(4, (1 - G.beta) * C);
  const legs = {};
  // nominal first lift phases; shift so the first leg steps off right away
  let firstLift = Infinity;
  for (const leg of LEGS) {
    let nl = G.phase[leg] + G.beta;
    while (nl > 1) nl -= 1;
    while (nl <= 1e-6) nl += 1;
    firstLift = Math.min(firstLift, nl);
    legs[leg] = { leg, fore: leg[0] === 'f', pos: pose[leg].slice(), swing: null, nextLift: nl, phi: G.phase[leg] };
    perf.key(t0, { [leg]: pose[leg].slice(), [leg + 'C']: 0 }, 'linear');
  }
  const ph0 = Math.max(0, firstLift - (opts.startLead ?? 0.04));
  let lastLiftT = -1e9;
  const minGap = G.gallop ? 0 : swingDur * (opts.minGapK ?? 0.28);
  const partner = { fn: 'ff', ff: 'fn', hn: 'hf', hf: 'hn' };
  const writeSwing = (L, tl, from, to, dur) => {
    const sw = L.fore ? G.swing.fore : G.swing.hind;
    const cN = L.leg + 'C';
    perf.key(t0 + tl, { [L.leg]: from, [cN]: 0 }, 'linear');
    const liftK = clamp(Math.abs(to[0] - from[0]) / (S * 0.9), 0.3, 1.2) * liftScale;
    const rN = L.fore ? L.leg + 'F' : null;
    for (let r = 1; r < sw.length - 1; r++) {
      const [tf, pf, lift, curl, reach] = sw[r];
      const x = lerp(from[0], to[0], pf), gy = lerp(from[1], to[1], pf);
      const k = { [L.leg]: [x, gy - lift * liftK], [cN]: curl * clamp(liftK * 1.2, 0.4, 1) };
      if (rN) k[rN] = reach || 0;
      perf.key(t0 + tl + dur * tf, k, 'linear');
    }
    const kEnd = { [L.leg]: to, [cN]: 0 };
    if (rN) kEnd[rN] = 0;
    perf.key(t0 + tl + dur, kEnd, 'linear');
    perf.event(t0 + tl + dur, 'step', { leg: L.leg, x: to[0], y: to[1], gait: opts.gait, surface: opts.surface, strength: L.fore ? 0.8 : 1 });
  };
  const dt = 0.5;
  const settleEnd = T + swingDur * 5 + 20;
  const inSwing = () => LEGS.filter((k) => legs[k].swing).length;
  for (let tau = 0; tau <= settleEnd; tau += dt) {
    const ph = ph0 + prof.d(Math.min(tau, T)) / S;
    const hx = hipX(tau);
    // land swings
    for (const k of LEGS) {
      const L = legs[k];
      if (L.swing && tau >= L.swing.tEnd - 1e-9) {
        L.pos = L.swing.to;
        L.swing = null;
      }
    }
    const moving = tau < T;
    const order = ['hn', 'fn', 'hf', 'ff'].sort((a, b) => (legs[a].nextLift - legs[b].nextLift));
    for (const k of order) {
      const L = legs[k];
      if (L.swing) continue;
      const rel = (L.pos[0] - hx) * f;
      const back = G.neutral[k] - (G.beta * S) / 2;
      let want = false;
      if (moving) {
        if (ph >= L.nextLift - 1e-9) want = true;
        if (rel < back - 0.12 * S) want = true;
      } else {
        // settle: step if far from neutral
        if (Math.abs(rel - G.neutral[k]) > Math.max(0.12, 0.16 * S)) want = true;
      }
      if (!want) continue;
      if (!gallop) {
        if (legs[partner[k]].swing) continue;
        if (inSwing() >= 2) continue;
        if (tau - lastLiftT < minGap) continue;
      }
      if (!moving && inSwing() >= 1) continue;
      // plan landing
      const tl = tau;
      const dur = moving ? swingDur : Math.max(5, swingDur * 0.8);
      const tLand = tl + dur;
      let tx;
      if (tLand <= T) tx = hipX(tLand) + f * (G.neutral[k] + (G.beta * S) / 2 * clamp(ramp(tLand) * 1.2, 0.35, 1));
      else tx = hipX(T) + f * G.neutral[k];
      if ((tx - L.pos[0]) * f < 0.02) tx = L.pos[0] + f * 0.02;
      const to = [tx, ground(tx)];
      writeSwing(L, tl, L.pos.slice(), to, dur);
      L.swing = { to, tEnd: tLand };
      lastLiftT = tau;
      // schedule next nominal lift at least half a cycle later
      while (L.nextLift <= ph + 0.5) L.nextLift += 1;
    }
    if (!moving && tau > T + 2 && inSwing() === 0) {
      let done = true;
      for (const k of LEGS) {
        const rel = (legs[k].pos[0] - hx) * f;
        if (Math.abs(rel - G.neutral[k]) > Math.max(0.12, 0.16 * S)) done = false;
      }
      if (done) break;
    }
  }
  let tEnd = T;
  for (const k of LEGS) tEnd = Math.max(tEnd, perf.tracks[k].end - t0);

  // ---- body & neck keys ----
  const phEnd = D / S;
  const times = new Set([0, T]);
  for (let j = 0; j <= Math.ceil(phEnd * G.body.length) + 1; j++) {
    const ph = j / G.body.length;
    if (ph > phEnd) break;
    times.add(invert((tt) => prof.d(tt) / S, ph, 0, T));
  }
  const pitch0 = pose.pitch, arch0 = [pose.archB, pose.archF], len0 = pose.len;
  const neck0 = pose.neck;
  const h0 = ground(hip0[0]) - hip0[1];
  const sorted = [...times].sort((a, b) => a - b);
  for (const tau of sorted) {
    const ph = prof.d(tau) / S;
    const [hdy, sdy, ab, af, ln] = bodyAt(G, ph);
    const a = ramp(tau);
    const x = hipX(tau);
    const L = 1.06 * lerp(len0, ln, a);
    const gy = ground(x), gyF = ground(x + f * L);
    const slope = Math.atan2(gy - gyF, L);
    const hk = smoothstep(0, Ta + 1, tau);
    const hy = gy - lerp(h0, height, hk) + hdy * a;
    const pitch = lerp(pitch0, G.pitchBase, hk) + ((hdy - sdy) / L) * a + slope;
    perf.key(t0 + tau, {
      hip: [x, hy],
      pitch,
      archB: lerp(arch0[0], lerp(arch0[0], opts.archB ?? 0.08, hk) + ab, a),
      archF: lerp(arch0[1], lerp(arch0[1], opts.archF ?? 0.02, hk) + af, a),
      len: lerp(len0, ln, a),
    }, 'linear');
    perf.key(t0 + tau, { neck: lerp(neck0, opts.neck ?? neck0, hk) + neckAt(G, ph) * a }, 'linear');
  }
  perf.t = t0 + Math.max(T, tEnd) + 2;
  return perf.t;
}
