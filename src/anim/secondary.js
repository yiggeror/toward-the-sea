// Stateless secondary motion. Each output is a damped-spring response to the
// target history, computed by convolving past samples of the (pure-function)
// performance with the spring's impulse response. Deterministic and seekable:
// the value at frame t never depends on how playback got there.
import { M } from '../cat/model.js';
import { clamp, angLerp, PI, wrapPi, noise1 } from '../core/math.js';

const W_CACHE = new Map();
export function springWeights(omega, zeta, K = 30, dt = 1 / 24) {
  const key = omega + ':' + zeta + ':' + K;
  let w = W_CACHE.get(key);
  if (w) return w;
  const wd = omega * Math.sqrt(Math.max(1e-4, 1 - zeta * zeta));
  w = [];
  let sum = 0;
  for (let k = 0; k < K; k++) {
    const tau = (k + 0.35) * dt;
    const h = Math.exp(-zeta * omega * tau) * Math.sin(wd * tau);
    w.push(h);
    sum += h;
  }
  w = w.map((x) => x / sum);
  W_CACHE.set(key, w);
  return w;
}

// Scalar field with spring follow-through
export function springField(perf, t, field, omega = 18, zeta = 0.4, K = 24) {
  const w = springWeights(omega, zeta, K);
  let s = 0;
  for (let k = 0; k < K; k++) s += w[k] * perf.poseAt(t - k, false)[field];
  return s;
}

// light-weight tail frame (hip tangent + tail root) from a pose, local coords
function tailFrame(p) {
  const facing = p.facing < 0 ? -1 : 1;
  const P = [p.hip[0] * facing, p.hip[1]];
  const d = [Math.cos(p.pitch), -Math.sin(p.pitch)];
  const n = [d[1], -d[0]];
  const c = Math.cos(p.archB), s = Math.sin(p.archB);
  const t0 = [d[0] * c + n[0] * s, d[1] * c + n[1] * s];
  const n0 = [t0[1], -t0[0]];
  const root = [P[0] - t0[0] * 0.33 + n0[0] * 0.13, P[1] - t0[1] * 0.33 + n0[1] * 0.13];
  return { root, base: Math.atan2(-t0[1], -t0[0]), facing };
}

function targetAngles(p, base, out) {
  const N = out.length;
  const tone = clamp(p.tailTone ?? 1, 0, 1);
  // tailWorld: stabilise the tail base in world space (fast gaits)
  const b = angLerp(base, PI, clamp(p.tailWorld || 0, 0, 1)) + p.tailA;
  for (let i = 0; i < N; i++) {
    const s = (i + 0.5) / N;
    let a = b + p.tailC * s + p.tailK * s * s * s;
    if (p.tailWave) a += p.tailWave * Math.sin(p.tailWaveP - s * 4.2) * s;
    if (tone < 1) a = angLerp(a, PI / 2, (1 - tone) * s * 0.85);
    out[i] = a;
  }
  return out;
}

// Tail segment world angles (local frame) at frame t.
// env.wind(t) -> [wx, wy] (stage units, |w| ~ 0..1.5), env.gust for flutter.
export function tailAngles(perf, t, env = {}) {
  const N = M.tailSegs;
  const K = 30;
  const now = perf.poseAt(t, true);
  const fr0 = tailFrame(now);
  const samples = [];
  for (let k = 0; k < K + 2; k++) {
    const p = k === 0 ? now : perf.poseAt(t - k + 0.0, false);
    const fr = tailFrame(p);
    const ang = targetAngles(p, fr.base, new Array(N));
    samples.push({ fr, ang, same: fr.facing === fr0.facing });
  }
  // unwrap relative to the current target to avoid wrap jumps
  const cur = samples[0].ang;
  for (let k = 1; k < samples.length; k++) {
    const a = samples[k].ang;
    for (let i = 0; i < N; i++) a[i] = cur[i] + wrapPi(a[i] - cur[i]);
  }
  const out = new Array(N);
  const wind = env.wind ? env.wind(t) : null;
  for (let i = 0; i < N; i++) {
    const s = (i + 0.5) / N;
    const omega = 26 - 17 * s; // stiff root, loose tip
    const zeta = 0.34 + 0.06 * (1 - s);
    const w = springWeights(Math.round(omega * 10) / 10, zeta, K);
    let acc = 0, wsum = 0;
    for (let k = 0; k < K; k++) {
      const smp = samples[k];
      if (!smp.same) continue;
      let a = smp.ang[i];
      // inertia: root acceleration swings the tail opposite
      if (k >= 1 && k + 1 < samples.length) {
        const r0 = samples[k - 1].fr.root, r1 = smp.fr.root, r2 = samples[k + 1].fr.root;
        const ax = r0[0] - 2 * r1[0] + r2[0], ay = r0[1] - 2 * r1[1] + r2[1];
        const dx = Math.cos(a), dy = Math.sin(a);
        const cr = dx * ay - dy * ax;
        a += -clamp(cr * 26 * s, -0.45, 0.45);
      }
      acc += w[k] * a;
      wsum += w[k];
    }
    let a = acc / (wsum || 1);
    if (wind) {
      const wx = wind[0] * fr0.facing, wy = wind[1];
      const mag = Math.hypot(wx, wy);
      if (mag > 1e-3) {
        const wa = Math.atan2(wy, wx);
        const flutter = noise1(t * 0.35 + i * 0.4, 77) * 0.25 * mag;
        a = angLerp(a, wa, clamp(mag * 0.55 * s, 0, 0.85)) + flutter * s;
      }
    }
    out[i] = a;
  }
  return out;
}

// Ears / whiskers follow-through on top of the keyed values.
export function applyFaceDynamics(perf, t, pose, env = {}) {
  pose.earRot = springField(perf, t, 'earRot', 30, 0.32, 16);
  pose.earFlat = springField(perf, t, 'earFlat', 28, 0.34, 16);
  pose.whisk = springField(perf, t, 'whisk', 22, 0.4, 14);
  if (env.wind) {
    const w = env.wind(t);
    const mag = Math.hypot(w[0], w[1]);
    // strong wind pushes ears back/flat when facing into it
    const into = -w[0] * (pose.facing < 0 ? -1 : 1);
    if (into > 0) {
      pose.earRot = Math.max(pose.earRot, clamp(into * 0.55, 0, 0.9));
      pose.earFlat = Math.max(pose.earFlat, clamp(into * 0.35 - 0.1, 0, 0.6));
    }
    pose.fluff = Math.max(pose.fluff || 0, clamp(mag * 0.25, 0, 0.35));
  }
  return pose;
}
