// Action library: every action is authored pose-to-pose (anticipation,
// extremes, contacts, overshoot, holds) in the cat's local frame and written
// as keys into a Perf starting at perf.t. Positions are world (stage) units.
import { clamp, lerp, DEG, rot, add, mul } from '../core/math.js';
import { LEGS } from './perf.js';

// local frame helper at the current authoring cursor
export function frameOf(perf, pose = perf.curPose()) {
  const f = pose.facing < 0 ? -1 : 1;
  const x0 = pose.hip[0];
  const gy = perf.ground(x0);
  const P = (dx, dy) => [x0 + f * dx, gy + dy];
  const Pg = (dx, dy = 0) => { const x = x0 + f * dx; return [x, perf.ground(x) + dy]; };
  return { f, x0, gy, P, Pg, pose };
}
// point relative to a hip position with body pitch (dx forward, dy down)
function bodyRel(f, hip, pitch, dx, dy) {
  const r = rot([dx, dy], -pitch);
  return [hip[0] + f * r[0], hip[1] + r[1]];
}

export const STAND = {
  pitch: 0.05, len: 1, archB: 0.08, archF: 0.02, chest: 0,
  neck: 0.62, neckLen: 1, hYaw: 0.35, hPitch: 0, hRoll: 0,
  fnC: 0, ffC: 0, hnC: 0, hfC: 0, hnM: 0, hfM: 0, fnF: 0, ffF: 0,
  tailA: 0.5, tailC: 0.9, tailK: 0.9, tailTone: 1, tailWave: 0, tailWorld: 0, tailFront: 0,
  earRot: 0.1, earFlat: 0, earLR: 0, earRR: 0,
  eye: 1, eyeWide: 0, pupil: 0.45, lookX: 0.1, lookY: 0, lid: 0, lidTilt: 0, happy: 0,
  wink: 0, sparkle: 0, tear: 0, squeeze: 0, sad: 0,
  mouth: 0, mouthW: 0, smile: 0, tongue: 0, whisk: 0, wobble: 0, blush: 0, puff: 0, whiskDroop: 0,
  fluff: 0, fnTop: 0, smear: 0,
};
export function standPose(F, dx = 0) {
  return Object.assign({}, STAND, {
    hip: F.P(dx, -1.0),
    fn: F.Pg(dx + 1.12), ff: F.Pg(dx + 1.02), hn: F.Pg(dx + 0.04), hf: F.Pg(dx - 0.06),
  });
}

// ---------------------------------------------------------------- acting bits
export function look(perf, t, dur, { yaw, pitch, roll, lookX, lookY, ease = 'inout' } = {}) {
  const part = {};
  if (yaw !== undefined) part.hYaw = yaw;
  if (pitch !== undefined) part.hPitch = pitch;
  if (roll !== undefined) part.hRoll = roll;
  perf.move(t, t + dur, part, ease);
  const e = {};
  if (lookX !== undefined) e.lookX = lookX;
  if (lookY !== undefined) e.lookY = lookY;
  if (Object.keys(e).length) perf.move(t, t + Math.max(2, dur * 0.5), e, 'out');
}
export function blink(perf, t, len = 5) {
  const open = perf.tracks.eyes.sample(t).eye;
  perf.move(t, t + 1.5, { eye: 0 }, 'in');
  perf.move(t + 1.5 + Math.max(0, len - 4), t + len, { eye: open }, 'out');
}
export function earTwitch(perf, t, which = 'L', amt = 0.6) {
  const k = which === 'L' ? 'earLR' : 'earRR';
  const v0 = perf.tracks.ears.sample(t)[k];
  perf.move(t, t + 2, { [k]: v0 + amt }, 'out');
  perf.move(t + 3, t + 7, { [k]: v0 }, 'inout');
}
export function set(perf, t, part, ease = 'inout') {
  perf.key(t, part, ease);
}

// ---------------------------------------------------------------- jump
/**
 * jump(perf, { dx, dy, h, wiggle, crouch })
 * dx: horizontal distance (along facing), dy: landing height change (negative = up).
 */
export function jump(perf, o = {}) {
  const F = frameOf(perf);
  const { f, P } = F;
  const t = perf.t;
  const dx = o.dx ?? 3, dy = o.dy ?? 0, h = o.h ?? 0.8;
  perf.holdAll(t);
  const up = Math.atan2(-dy + h * 0.6, dx);
  // anticipation: crouch & aim
  const a = t + (o.antic ?? 8);
  perf.key(a, {
    hip: P(-0.1, -0.7), pitch: 0.06 + up * 0.25, len: 0.93, archB: 0.26, archF: 0.02,
    neck: 0.3, hPitch: up * 0.6 - 0.05, hYaw: 0.25, earRot: -0.2, pupil: 0.85, eyeWide: 0.15, whisk: 0.6,
    tailA: -0.25, tailC: 0.25, tailK: 0.3,
  }, 'inout');
  let tc = a;
  if (o.wiggle) {
    for (let i = 0; i < o.wiggle; i++) {
      perf.key(tc + 3, { hip: P(-0.13, -0.68), hn: F.Pg(0.02 - 0.03 * (i % 2)), hnC: 0.15 * (i % 2) }, 'inout');
      perf.key(tc + 6, { hip: P(-0.08, -0.7), hnC: 0 }, 'inout');
      tc += 6;
    }
  }
  // cocked: deepest compression, brief hold
  const c = tc + 3;
  perf.key(c, { hip: P(-0.14, -0.62), len: 0.9, archB: 0.32, neck: 0.22, tailA: -0.35 }, 'hold');
  const c2 = c + (o.hold ?? 2);
  perf.key(c2, {}, 'out');
  // push: hind legs extend, fores tuck
  const push = c2 + 2;
  const pitchL = clamp(up * 0.9, -0.3, 0.9);
  const hipPush = P(0.3, -1.05 - Math.max(0, -dy) * 0.08);
  perf.key(push, {
    hip: hipPush, pitch: pitchL, len: 1.14, archB: -0.16, archF: -0.08, neck: 0.75, hPitch: up * 0.5,
    fn: bodyRel(f, hipPush, pitchL, 1.25, 0.45), ff: bodyRel(f, hipPush, pitchL, 1.15, 0.5), fnC: 1, ffC: 1,
    tailA: -0.1, tailC: 0.1, earRot: 0.25, smear: 0.6,
  }, 'linear');
  // takeoff
  const to = push + 2;
  const hipTo = P(0.62, -1.3 - Math.max(0, -dy) * 0.15);
  perf.key(to, {
    hip: hipTo, len: 1.18, archB: -0.22, archF: -0.1, smear: 0.4,
    hn: bodyRel(f, hipTo, pitchL, -0.42, 0.95), hf: bodyRel(f, hipTo, pitchL, -0.5, 0.9), hnC: 0.9, hfC: 0.9,
    fn: bodyRel(f, hipTo, pitchL, 1.45, 0.35), ff: bodyRel(f, hipTo, pitchL, 1.35, 0.4), fnC: 0.6, ffC: 0.6, fnF: 0.6, ffF: 0.6,
  }, 'linear');
  perf.event(to, 'jump', { x: hipTo[0], y: F.gy, strength: clamp(dx / 3, 0.4, 1.2) });
  // ballistic flight of the hip from takeoff to fore contact
  const L0 = hipTo;
  const landX = F.x0 + f * dx;
  const gAt = (x) => [x, perf.ground(x)];
  // landing surface height: take the ground under the fore/hind landing spots
  const landG = Math.min(perf.ground(landX + f * 1.2), perf.ground(landX + f * 0.1));
  const hipLand = [landX + f * 0.3, landG - 0.9];
  const T = o.flight ?? Math.round(clamp(6 + dx * 1.6 + h * 4, 8, 20));
  const steps = Math.max(3, Math.round(T / 2));
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const x = lerp(L0[0], hipLand[0], u);
    const yLin = lerp(L0[1], hipLand[1], u);
    const y = yLin - 4 * h * u * (1 - u);
    const hip = [x, y];
    const pitchU = lerp(pitchL, -0.35, Math.pow(u, 1.4));
    const k = {
      hip, pitch: pitchU,
      len: lerp(1.18, 1.0, u), archB: lerp(-0.22, 0.05, u), archF: lerp(-0.1, 0.05, u),
      neck: lerp(0.75, 0.5, u), hPitch: lerp(up * 0.5, -0.35, u),
      tailA: lerp(-0.1, 0.45, u), tailC: lerp(0.1, 0.4, u), smear: 0,
    };
    // fores reach forward toward the landing, hinds trail back then gather
    const reach = lerp(1.9, 1.55, u * u);
    k.fn = bodyRel(f, hip, pitchU, reach, lerp(0.3, 0.72, u));
    k.ff = bodyRel(f, hip, pitchU, reach - 0.1, lerp(0.35, 0.76, u));
    k.fnC = lerp(0.35, 0.05, u); k.ffC = k.fnC;
    k.fnF = lerp(1.0, 0.3, u); k.ffF = k.fnF;
    const g = Math.pow(u, 1.6);
    k.hn = bodyRel(f, hip, pitchU, lerp(-0.8, 0.08, g), lerp(0.62, 0.74, u));
    k.hf = bodyRel(f, hip, pitchU, lerp(-0.86, 0.0, g), lerp(0.6, 0.72, u));
    k.hnC = lerp(1.0, 0.45, u); k.hfC = k.hnC;
    perf.key(to + T * u, k, i === steps ? 'out' : 'linear');
  }
  const land = to + T;
  // fore contact: paws planted, front squashes
  const fnP = gAt(landX + f * 1.28), ffP = gAt(landX + f * 1.18);
  perf.key(land, { fn: fnP, ff: ffP, fnC: 0, ffC: 0, fnF: 0, ffF: 0 }, 'linear');
  perf.event(land, 'land', { x: fnP[0], y: landG, part: 'fore', strength: clamp(0.5 + h * 0.5, 0.5, 1.4) });
  const sq = land + 2;
  const hipSq = [landX + f * 0.2, landG - 0.66];
  perf.key(sq, {
    hip: hipSq, pitch: -0.12, len: 0.9, archB: 0.34, archF: 0.08, neck: 0.3, hPitch: -0.15,
    hn: gAt(landX + f * 0.12), hf: gAt(landX + f * 0.02), hnC: 0, hfC: 0,
    earRot: 0.3, tailA: 0.3, tailC: 0.6, smear: 0,
  }, 'out');
  perf.event(sq, 'land', { x: landX, y: landG, part: 'hind', strength: clamp(0.4 + h * 0.4, 0.4, 1.2) });
  // recover with overshoot
  const r1 = sq + 4;
  perf.key(r1, { hip: [landX + f * 0.12, landG - 1.06], pitch: 0.08, len: 1.03, archB: 0.02, neck: 0.72, hPitch: 0.05, earRot: 0.0 }, 'inout');
  const r2 = r1 + 5;
  const hipEnd = [landX + f * 0.08, landG - 1.0];
  perf.key(r2, { hip: hipEnd, pitch: 0.05, len: 1, archB: 0.08, archF: 0.02, neck: 0.62, hPitch: 0, pupil: 0.5, eyeWide: 0, tailA: 0.5, tailC: 0.9, whisk: 0 }, 'inout');
  // settle feet under body
  perf.t = r2 + 2;
  return perf.t;
}

// ---------------------------------------------------------------- pounce
/** pounce(perf, { dx, wiggle }) playful pounce landing with paws pinning the target */
export function pounce(perf, o = {}) {
  const F = frameOf(perf);
  const { f, P } = F;
  const t = perf.t;
  const dx = o.dx ?? 2.4;
  perf.holdAll(t);
  // lower into stalk crouch, eyes locked
  perf.key(t + 8, {
    hip: P(-0.12, -0.76), pitch: 0.02, len: 1.0, archB: -0.02, archF: -0.1, neck: 0.16, hPitch: -0.08, hYaw: 0.2,
    earRot: -0.25, pupil: 0.95, eyeWide: 0.2, whisk: 0.8, tailA: -0.15, tailC: 0.2, tailK: 0.5,
    fn: F.Pg(1.2), ff: F.Pg(1.08),
  }, 'inout');
  // butt wiggle: hips up & shifting, hind paws treading
  let tc = t + 8;
  const n = o.wiggle ?? 3;
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1;
    perf.key(tc + 3, { hip: P(-0.12 + 0.03 * s, -0.86), pitch: -0.06, hn: F.Pg(0.03 + 0.04 * (s > 0 ? 1 : 0), 0), hf: F.Pg(-0.07 + 0.04 * (s < 0 ? 1 : 0), 0), tailK: 0.5 + 0.7 * s, tailWave: 0.35, tailWaveP: i * 2 }, 'inout');
    perf.key(tc + 6, { hip: P(-0.12, -0.8), pitch: -0.02 }, 'inout');
    tc += 6;
  }
  perf.key(tc + 2, {}, 'hold');
  perf.key(tc + 4, { hip: P(-0.16, -0.7), len: 0.92, archB: 0.22, pitch: 0.04 }, 'out');
  const push = tc + 6;
  const hp = P(0.35, -0.95);
  perf.key(push, { hip: hp, pitch: 0.18, len: 1.16, archB: -0.2, archF: -0.1, neck: 0.4, hPitch: -0.05,
    fn: bodyRel(f, hp, 0.18, 1.35, 0.35), ff: bodyRel(f, hp, 0.18, 1.25, 0.4), fnC: 0.9, ffC: 0.9, smear: 0.7, tailA: 0.1 }, 'linear');
  const to = push + 2;
  const hipTo = P(0.8, -1.25);
  perf.key(to, { hip: hipTo, len: 1.2, pitch: 0.1, archB: -0.28, archF: -0.14,
    hn: bodyRel(f, hipTo, 0.1, -0.5, 0.9), hf: bodyRel(f, hipTo, 0.1, -0.58, 0.86), hnC: 1, hfC: 1,
    fn: bodyRel(f, hipTo, 0.1, 1.55, 0.2), ff: bodyRel(f, hipTo, 0.1, 1.45, 0.24), fnC: 0.2, ffC: 0.2, fnF: 1, ffF: 1, smear: 0.3, mouth: 0.25 }, 'linear');
  perf.event(to, 'jump', { x: hipTo[0], y: F.gy, strength: 0.8 });
  // apex & dive
  const landX = F.x0 + f * dx;
  const gL = perf.ground(landX);
  const apexHip = [lerp(hipTo[0], landX, 0.5), gL - 1.42];
  perf.key(to + 4, { hip: apexHip, pitch: -0.05, len: 1.22, smear: 0,
    fn: bodyRel(f, apexHip, -0.05, 1.6, 0.4), ff: bodyRel(f, apexHip, -0.05, 1.5, 0.45),
    hn: bodyRel(f, apexHip, -0.05, -0.6, 0.75), hf: bodyRel(f, apexHip, -0.05, -0.66, 0.72), tailA: 0.35, tailC: 0.5 }, 'inout');
  const land = to + 8;
  const fp = [landX + f * 1.2, gL], fp2 = [landX + f * 1.1, gL];
  const hipL = [landX + f * 0.1, gL - 1.0];
  perf.key(land, { hip: hipL, pitch: -0.28, len: 1.08, archB: -0.1, archF: 0.1, fn: fp, ff: fp2, fnC: 0, ffC: 0, fnF: 0.2, ffF: 0.2, neck: 0.3, hPitch: -0.4, mouth: 0 }, 'linear');
  perf.event(land, 'land', { x: fp[0], y: gL, part: 'fore', strength: 0.7 });
  // hind comes down: butt up, paws pinning
  const pin = land + 3;
  perf.key(pin, { hip: [landX + f * 0.05, gL - 0.98], pitch: -0.2, len: 1.02, archB: 0.1, archF: 0.2, neck: 0.2, hPitch: -0.5, lookY: -0.6,
    hn: [landX + f * 0.18, gL], hf: [landX + f * 0.08, gL], hnC: 0, hfC: 0, tailA: 0.9, tailC: 0.7, earRot: -0.1, fnF: 0 }, 'out');
  perf.event(pin, 'land', { x: landX, y: gL, part: 'hind', strength: 0.5 });
  perf.key(pin + 8, {}, 'inout');
  perf.t = pin + 8;
  return perf.t;
}

// ---------------------------------------------------------------- sit down / stand up
export function sit(perf, o = {}) {
  const F = frameOf(perf);
  const { P, Pg } = F;
  const t = perf.t;
  perf.holdAll(t);
  // weight shifts forward slightly (anticipation) then hips drop back
  perf.key(t + 4, { hip: P(0.04, -0.98), pitch: 0.0, archB: 0.04 }, 'inout');
  const d = t + 12;
  perf.key(d, { hip: P(-0.18, -0.6), pitch: 0.55, len: 0.96, archB: 0.18, archF: -0.05, neck: 0.5,
    hnM: 0.6, hfM: 0.6, hn: Pg(0.18), hf: Pg(0.1), tailA: -0.2, tailC: 0.3 }, 'inout');
  const d2 = t + 17;
  perf.key(d2, { hip: P(-0.16, -0.46), pitch: 1.24, len: 1.1, neckLen: 1.05, archB: 0.34, archF: -0.18, neck: 0.3, hPitch: 0.02,
    hnM: 1, hfM: 1, hn: Pg(0.32), hf: Pg(0.24), fn: Pg(0.54), ff: Pg(0.44), tailA: -0.55, tailC: 1.2, tailK: 0.6 }, 'out');
  perf.event(d2, 'sit', { x: F.x0, y: F.gy });
  // overshoot & settle; tail curls forward around the paws
  perf.key(d2 + 4, { pitch: 1.3, hip: P(-0.16, -0.48), neck: 0.26, neckLen: 1.05 }, 'inout');
  perf.key(d2 + 9, { pitch: 1.27, hip: P(-0.16, -0.47), neck: 0.28 }, 'inout');
  perf.key(d2 + 16, { tailA: -0.72, tailC: 2.3, tailK: 1.0, tailFront: o.tailFront ? 1 : 0 }, 'inout');
  perf.t = d2 + 16;
  return perf.t;
}
export function sitPose(F) {
  return {
    hip: F.P(-0.16, -0.47), pitch: 1.27, len: 1.1, neckLen: 1.05, archB: 0.34, archF: -0.18, neck: 0.28, hPitch: 0.02,
    hnM: 1, hfM: 1, hn: F.Pg(0.32), hf: F.Pg(0.24), fn: F.Pg(0.54), ff: F.Pg(0.44),
    tailA: -0.72, tailC: 2.3, tailK: 1.0,
  };
}
export function standUp(perf, o = {}) {
  const pose = perf.curPose();
  const F = frameOf(perf);
  const t = perf.t;
  perf.holdAll(t);
  // hips up first, then front
  const x = pose.hip[0] + F.f * 0.16;
  const Fx = { P: (dx, dy) => [x + F.f * dx, F.gy + dy], Pg: (dx) => [x + F.f * dx, perf.ground(x + F.f * dx)] };
  perf.key(t + 6, { hip: Fx.P(0.02, -0.72), pitch: 0.5, hnM: 0.3, hfM: 0.3, archB: 0.25, tailA: 0, tailC: 0.5, tailFront: 0 }, 'inout');
  perf.key(t + 12, Object.assign({}, { hip: Fx.P(0, -1.02), pitch: 0.02, len: 1, neckLen: 1, archB: 0.1, archF: 0.02, neck: 0.62, hnM: 0, hfM: 0,
    hn: Fx.Pg(0.04), hf: Fx.Pg(-0.06), fn: Fx.Pg(1.12), ff: Fx.Pg(1.02), tailA: 0.5, tailC: 0.9, tailK: 0.9 }), 'out');
  perf.key(t + 16, { hip: Fx.P(0, -1.0), pitch: 0.05 }, 'inout');
  perf.t = t + 16;
  return perf.t;
}

// ---------------------------------------------------------------- grooming (sitting)
export function groom(perf, o = {}) {
  const F = frameOf(perf);
  const pose = F.pose;
  const t = perf.t;
  perf.holdAll(t);
  const sh = pose.hip; // sitting hip
  const f = F.f;
  const lick = o.licks ?? 4;
  // lift near paw toward mouth, head dips to meet it
  const pawUp = [sh[0] + f * 0.62, sh[1] - 0.72];
  perf.key(t + 6, { fn: pawUp, fnC: 1, fnTop: 1, hYaw: 0.75, hPitch: -0.35, hRoll: 0.1, neck: 0.05, eye: 0.35, earRot: 0.25 }, 'inout');
  let tc = t + 8;
  for (let i = 0; i < lick; i++) {
    perf.key(tc, { mouth: 0.35, tongue: 1, hPitch: -0.45, eye: 0.15 }, 'out');
    perf.key(tc + 2, { mouth: 0.1, tongue: 0, hPitch: -0.3, eye: 0.25 }, 'inout');
    perf.event(tc, 'lick', { x: pawUp[0], y: pawUp[1] });
    tc += 4;
  }
  // wipe: paw goes over the cheek/ear, head tilts into it
  const wipe = [sh[0] + f * 0.72, sh[1] - 1.12];
  perf.key(tc + 2, { fn: [sh[0] + f * 0.78, sh[1] - 0.95], hRoll: 0.3, hPitch: -0.1, hYaw: 0.9, eye: 0, earRot: 0.5, earFlat: 0.3 }, 'inout');
  perf.key(tc + 6, { fn: wipe, hRoll: 0.45, hPitch: -0.3 }, 'inout');
  perf.key(tc + 10, { fn: [sh[0] + f * 0.7, sh[1] - 0.85], hRoll: 0.2, hPitch: -0.2 }, 'inout');
  perf.key(tc + 14, { fn: wipe, hRoll: 0.42, hPitch: -0.28 }, 'inout');
  perf.key(tc + 18, { fn: [sh[0] + f * 0.66, sh[1] - 0.8], hRoll: 0.1, earFlat: 0, earRot: 0.15 }, 'inout');
  // paw back down
  perf.key(tc + 24, { fn: F.Pg((pose.fn[0] - F.x0) * f), fnC: 0, fnTop: 0, hYaw: 0.35, hPitch: 0.02, hRoll: 0, eye: 1, mouth: 0 }, 'inout');
  perf.t = tc + 26;
  return perf.t;
}

// ---------------------------------------------------------------- stretch
export function stretch(perf, o = {}) {
  const F = frameOf(perf);
  const { P, Pg } = F;
  const t = perf.t;
  perf.holdAll(t);
  // front stretch: paws walk forward, chest down, butt up, yawn
  perf.key(t + 6, { fn: Pg(1.5), fnC: 0, hip: P(0.0, -1.02) }, 'inout');
  perf.key(t + 10, { ff: Pg(1.45) }, 'inout');
  const low = t + 20;
  perf.key(low, { hip: P(0.02, -1.1), pitch: -0.5, len: 1.12, archB: -0.35, archF: -0.25, neck: 0.55, hPitch: 0.35,
    fn: Pg(1.95), ff: Pg(1.85), fnF: 1, ffF: 1, tailA: 1.1, tailC: 0.6, tailK: 0.4, eye: 0.3, earRot: 0.35 }, 'inout');
  perf.key(low + 6, { mouth: 1, mouthW: 0.6, tongue: 1, eye: 0, hPitch: 0.5, earFlat: 0.35, earRot: 0.5 }, 'inout');
  perf.event(low + 6, 'yawn', {});
  perf.key(low + 16, { mouth: 0.9 }, 'inout');
  perf.key(low + 22, { mouth: 0, tongue: 0, eye: 0.5, hPitch: 0.2, earFlat: 0, earRot: 0.2 }, 'inout');
  // shift forward: back stretch with one hind leg extended behind
  const b = low + 30;
  perf.key(b, { hip: P(0.55, -0.95), pitch: 0.1, len: 1.1, archB: -0.1, archF: 0, fnF: 0, ffF: 0, neck: 0.7, hPitch: 0.1,
    fn: Pg(1.95), ff: Pg(1.85), tailA: 0.3, tailC: 0.5 }, 'inout');
  perf.key(b + 8, { hn: [F.x0 + F.f * -0.55, F.gy - 0.3], hnC: 0.1, hip: P(0.62, -0.92), pitch: 0.16 }, 'inout');
  perf.key(b + 20, { hn: [F.x0 + F.f * -0.62, F.gy - 0.34], tailK: 1.2 }, 'inout');
  perf.key(b + 26, { hn: Pg(0.6), hnC: 0, hip: P(0.62, -1.0), pitch: 0.05 }, 'inout');
  perf.key(b + 30, { hf: Pg(0.52), eye: 1 }, 'inout');
  perf.t = b + 32;
  return perf.t;
}

// ---------------------------------------------------------------- lie down & curl to sleep
export function curlSleep(perf, o = {}) {
  const F = frameOf(perf);
  const { P, Pg } = F;
  const t = perf.t;
  perf.holdAll(t);
  // lower into a loaf, then curl: spine bends into a C, head tucks, tail wraps
  perf.key(t + 10, { hip: P(0.1, -0.5), pitch: 0.0, len: 0.95, archB: 0.2, archF: 0.1, hnM: 1, hfM: 1,
    hn: Pg(0.5), hf: Pg(0.42), fn: Pg(1.05), ff: Pg(0.98), fnC: 0.5, ffC: 0.5, neck: 0.3, hPitch: -0.1, eye: 0.6 }, 'inout');
  perf.key(t + 22, { hip: P(0.25, -0.42), pitch: -0.1, len: 0.88, archB: 0.85, archF: 0.9, neck: -0.35, hPitch: -0.55, hYaw: 0.7, hRoll: 0.25,
    fn: Pg(0.72, -0.02), ff: Pg(0.62, -0.02), fnC: 0.8, ffC: 0.8, eye: 0.2, earRot: 0.4,
    tailA: -1.25, tailC: -2.5, tailK: -0.6, tailFront: 1 }, 'inout');
  perf.key(t + 30, { eye: 0, earRot: 0.3, earFlat: 0.1 }, 'inout');
  perf.event(t + 22, 'liedown', {});
  perf.t = t + 34;
  return perf.t;
}

// breathing overlay for sleeping/resting: add as perf.overlays.push(breathing(...))
export function breathing(t0, t1, period = 70, amt = 1) {
  return (p, t) => {
    if (t < t0 || t > t1) return;
    const k = Math.min(1, (t - t0) / 20) * Math.min(1, (t1 - t) / 20);
    const s = Math.sin(((t - t0) / period) * Math.PI * 2);
    p.breath = (p.breath || 0) + (0.5 + 0.5 * s) * 1.6 * amt * k;
    p.hip = [p.hip[0], p.hip[1] - 0.012 * s * amt * k];
    p.archB += 0.02 * s * amt * k;
  };
}

// ---------------------------------------------------------------- shake off water (standing)
export function shake(perf, o = {}) {
  const t = perf.t;
  const F = frameOf(perf);
  perf.holdAll(t);
  // brace: legs spread slightly, eyes shut, ears back
  perf.key(t + 4, { eye: 0.2, earRot: 0.5, earFlat: 0.2, neck: 0.55, hip: F.P(0, -0.96), fluff: 0.1 }, 'inout');
  perf.setTiming(t + 4, 1);
  let tc = t + 5;
  // head whip (fast, on ones), wave travels to body then tail
  const yaws = [1.25, -0.55, 1.35, -0.6, 1.2, -0.4, 0.9];
  yaws.forEach((y, i) => {
    perf.key(tc + i * 2, { hYaw: y, hRoll: i % 2 ? -0.25 : 0.25, earRot: i % 2 ? 0.9 : 0.3, earFlat: i % 2 ? 0.5 : 0.1, squeeze: 1 }, 'inout');
  });
  perf.event(tc, 'shake', { x: F.x0, y: F.gy, dur: 22 });
  // body shiver: chest twist + fluff pulses + hip jitter
  for (let i = 0; i < 9; i++) {
    const s = i % 2 ? 1 : -1;
    perf.key(tc + 3 + i * 2, { chest: 0.5 + 0.35 * s, fluff: 0.55 + 0.2 * (i % 2), hip: F.P(0.02 * s, -0.97 + 0.02 * (i % 2)), archB: 0.08 + 0.08 * s }, 'inout');
  }
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1;
    perf.key(tc + 8 + i * 2, { tailWave: 0.9, tailWaveP: i * 3.1, tailA: 0.3 + 0.2 * s }, 'inout');
  }
  const e = tc + 22;
  perf.key(e, { hYaw: 0.35, hRoll: 0, chest: 0, fluff: 0.15, hip: F.P(0, -1.0), archB: 0.08, tailWave: 0, tailA: 0.5, eye: 1, squeeze: 0, earRot: 0.2, earFlat: 0 }, 'out');
  perf.setTiming(e, 2);
  perf.key(e + 6, { fluff: 0.05 }, 'inout');
  perf.t = e + 8;
  return perf.t;
}

// ---------------------------------------------------------------- flick a wet paw
export function pawFlick(perf, o = {}) {
  const t = perf.t;
  const F = frameOf(perf);
  const leg = o.leg || 'fn';
  const base = perf.curPose()[leg];
  perf.holdAll(t);
  perf.key(t + 4, { [leg]: [base[0] + F.f * 0.05, base[1] - 0.3], [leg + 'C']: 0.7, hPitch: -0.25, lookY: -0.5, hip: F.P(-0.04, -0.98) }, 'inout');
  perf.setTiming(t + 4, 1);
  for (let i = 0; i < (o.n ?? 4); i++) {
    perf.key(t + 5 + i * 2, { [leg]: [base[0] + F.f * 0.12, base[1] - 0.38], [leg + 'C']: 0.1 }, 'out');
    perf.key(t + 6 + i * 2, { [leg]: [base[0] + F.f * 0.0, base[1] - 0.26], [leg + 'C']: 1 }, 'in');
    perf.event(t + 5 + i * 2, 'flick', { x: base[0], y: base[1] - 0.35 });
  }
  const e = t + 6 + (o.n ?? 4) * 2;
  perf.setTiming(e, 2);
  perf.key(e + 5, { [leg]: base, [leg + 'C']: 0, hPitch: 0, lookY: 0, hip: F.P(0, -1.0) }, 'inout');
  perf.t = e + 6;
  return perf.t;
}

// ---------------------------------------------------------------- startle (thunder)
export function startle(perf, o = {}) {
  const t = perf.t;
  const F = frameOf(perf);
  const { P, Pg } = F;
  perf.holdAll(t);
  perf.setTiming(t, 1);
  // instant: eyes wide, ears flat — then straight-up leap with arched back
  perf.key(t + 1, { eyeWide: 1, pupil: 0.95, earFlat: 0.8, earRot: 0.9, hip: P(0, -0.9), archB: 0.2 }, 'linear');
  perf.emote(t + 1, 'exclaim', { dur: 22, size: 1.2 });
  perf.emote(t + 1, 'surprise', { dur: 12 });
  perf.key(t + 3, {
    hip: P(-0.05, -1.95), pitch: 0.05, len: 0.92, archB: 0.62, archF: 0.55, neck: 0.3, hPitch: -0.05, hYaw: 0.6,
    fn: Pg(1.05, -0.55), ff: Pg(0.98, -0.6), hn: Pg(0.0, -0.55), hf: Pg(-0.08, -0.6), fnC: 0.1, ffC: 0.1, hnC: 0.1, hfC: 0.1,
    fluff: 1, tailA: 1.3, tailC: 0.1, tailK: -0.2, mouth: 0.6, mouthW: 0.2, smear: 1,
  }, 'out');
  perf.event(t + 2, 'startle', { x: F.x0, y: F.gy });
  perf.key(t + 7, { hip: P(-0.05, -2.05), smear: 0 }, 'in');
  perf.key(t + 11, { hip: P(-0.02, -0.95), fn: Pg(1.1), ff: Pg(1.0), hn: Pg(0.02), hf: Pg(-0.08), fnC: 0, ffC: 0, hnC: 0, hfC: 0, archB: 0.45, archF: 0.35 }, 'in');
  perf.event(t + 11, 'land', { x: F.x0, y: F.gy, part: 'all', strength: 0.9 });
  perf.key(t + 13, { hip: P(0, -0.82), len: 0.94 }, 'out');
  perf.setTiming(t + 13, 2);
  perf.key(t + 19, { hip: P(0, -0.9), archB: 0.3, archF: 0.2, mouth: 0, fluff: 0.7, len: 0.97 }, 'inout');
  perf.t = t + 20;
  return perf.t;
}

// ---------------------------------------------------------------- snow: first step into deep snow
export function snowFirstStep(perf, o = {}) {
  const t = perf.t;
  const F = frameOf(perf);
  const { P, Pg } = F;
  const depth = o.depth ?? 0.16;
  perf.holdAll(t);
  // reach the near forepaw out, place it, it sinks
  perf.key(t + 6, { fn: Pg(1.35, -0.16), fnC: 0.8, hip: P(0.05, -1.0), hPitch: -0.3, lookY: -0.6 }, 'inout');
  perf.key(t + 12, { fn: Pg(1.5, -0.02), fnC: 0.1 }, 'inout');
  perf.key(t + 16, { fn: Pg(1.5, depth), fnC: 0, hip: P(0.1, -0.96), pitch: -0.02 }, 'in');
  perf.event(t + 16, 'step', { leg: 'fn', x: F.x0 + F.f * 1.5, y: F.gy, surface: 'snow', strength: 0.7, sink: depth });
  // freeze: ears up, eyes wide — hold
  perf.key(t + 18, { eyeWide: 0.8, pupil: 0.75, earRot: -0.2, hPitch: -0.45, lookY: -0.8, fluff: 0.2, mouth: 0.2 }, 'out');
  perf.emote(t + 17, 'exclaim', { dur: 18 });
  perf.key(t + 30, {}, 'hold');
  // pull it out high, look at the paw, shake it
  perf.key(t + 33, { fn: Pg(1.35, -0.42), fnC: 0.9, hip: P(0.0, -1.02), pitch: 0.08, hPitch: -0.2, lookY: -0.3 }, 'out');
  perf.event(t + 32, 'snowpull', { x: F.x0 + F.f * 1.5, y: F.gy });
  perf.key(t + 38, { fn: Pg(1.3, -0.5), hYaw: 0.75, hPitch: -0.35, hRoll: 0.2, eyeWide: 0.3, mouth: 0 }, 'inout');
  perf.emote(t + 36, 'question', { dur: 26 });
  perf.key(t + 46, {}, 'hold');
  perf.setTiming(t + 46, 1);
  for (let i = 0; i < 3; i++) {
    perf.key(t + 47 + i * 2, { fn: Pg(1.38, -0.56), fnC: 0.2 }, 'out');
    perf.key(t + 48 + i * 2, { fn: Pg(1.3, -0.44), fnC: 1 }, 'in');
    perf.event(t + 47 + i * 2, 'flick', { x: F.x0 + F.f * 1.35, y: F.gy - 0.5, surface: 'snow' });
  }
  perf.setTiming(t + 54, 2);
  // careful second attempt: place gently
  perf.key(t + 62, { fn: Pg(1.42, -0.1), fnC: 0.5, hYaw: 0.35, hRoll: 0, hPitch: -0.35, lookY: -0.6, eyeWide: 0, fluff: 0.1, lid: 0.15, lidTilt: 0.4 }, 'inout');
  perf.key(t + 70, { fn: Pg(1.45, depth * 0.8), fnC: 0, hip: P(0.08, -0.98) }, 'inout');
  perf.event(t + 70, 'step', { leg: 'fn', x: F.x0 + F.f * 1.45, y: F.gy, surface: 'snow', strength: 0.4, sink: depth * 0.8 });
  perf.t = t + 76;
  return perf.t;
}

// ---------------------------------------------------------------- turn around in place
export function turnAround(perf, o = {}) {
  const t = perf.t;
  const F = frameOf(perf);
  const { f, x0, gy } = F;
  perf.holdAll(t);
  // head leads toward camera, body gathers & foreshortens
  perf.key(t + 4, { hYaw: 1.3, neck: 0.5, len: 0.85, hip: [x0, gy - 0.95], archB: 0.3 }, 'inout');
  perf.key(t + 7, { len: 0.55, hip: [x0 + f * 0.35, gy - 0.92], fn: [x0 + f * 0.75, gy], ff: [x0 + f * 0.62, gy], hn: [x0 + f * 0.2, gy], hf: [x0 + f * 0.08, gy], hYaw: 1.55, archB: 0.35 }, 'inout');
  // flip facing on the most gathered drawing
  const nf = -f;
  const cx = x0 + f * 0.45;
  perf.key(t + 7.5, { smear: 0.7 }, 'linear');
  perf.key(t + 8, { facing: nf, hip: [cx - nf * -0.1, gy - 0.93], hYaw: 1.55 }, 'hold');
  perf.key(t + 10, { smear: 0 }, 'linear');
  perf.key(t + 9, { len: 0.6, fn: [cx + nf * 0.5, gy], ff: [cx + nf * 0.4, gy], hn: [cx - nf * 0.2, gy], hf: [cx - nf * 0.3, gy] }, 'inout');
  // unfold into new direction
  const hx = cx - nf * 0.45;
  perf.key(t + 14, { len: 1, hip: [hx, gy - 1.0], fn: [hx + nf * 1.12, gy], ff: [hx + nf * 1.02, gy], hn: [hx + nf * 0.04, gy], hf: [hx - nf * 0.06, gy], hYaw: 0.4, archB: 0.08, neck: 0.62 }, 'inout');
  perf.event(t + 12, 'step', { leg: 'fn', x: hx + nf * 1.12, y: gy, strength: 0.4 });
  perf.t = t + 16;
  return perf.t;
}

export function wait(perf, n) {
  perf.holdAll(perf.t);
  perf.t += n;
  perf.holdAll(perf.t);
  return perf.t;
}

// ---------------------------------------------------------------- head tracking
/**
 * Key the head (yaw/pitch) and eyes to follow a moving world target from t0 to
 * t1. target(t) -> [x, y]. Keys every `step` frames (on twos by default).
 */
export function track(perf, t0, t1, target, o = {}) {
  const step = o.step ?? 4;
  for (let t = t0; t <= t1 + 1e-6; t += step) {
    const p = perf.poseAt(t, false);
    const f = p.facing < 0 ? -1 : 1;
    const hx = p.hip[0] + f * 1.55, hy = p.hip[1] - 1.1;
    const [tx, ty] = target(t);
    const dx = (tx - hx) * f, dy = ty - hy;
    const d = Math.hypot(dx, dy) || 1;
    let yaw, pitch;
    if (dx > -0.2) {
      yaw = (o.baseYaw ?? 0.3) + clamp(-dx / d, 0, 0.6) * 0.6;
      pitch = clamp(Math.atan2(-dy, Math.max(0.3, dx)) * 0.8, -0.8, 0.9);
    } else {
      // behind: turn the head over the shoulder toward the camera side
      yaw = lerp(1.4, 2.5, clamp(-dx / (d + 1e-6), 0, 1));
      pitch = clamp(Math.atan2(-dy, Math.abs(dx)) * 0.6, -0.6, 0.8);
    }
    const k = { hYaw: yaw, hPitch: pitch, lookY: clamp(-dy / d, -1, 1) * 0.7, lookX: clamp(dx / d, -1, 1) * 0.3 };
    if (o.neck !== undefined) k.neck = o.neck;
    perf.key(t, k, 'inout');
  }
}

// ---------------------------------------------------------------- put the card down
/** head dips to (x, y) (world), mouth opens; returns release time */
export function putDown(perf, o = {}) {
  const t = perf.t;
  const F = frameOf(perf);
  perf.holdAll(t);
  perf.key(t + 10, { neck: -0.25, neckLen: 1.15, hPitch: -0.8, hip: F.P(0.12, -0.95), pitch: -0.06, earRot: 0.1 }, 'inout');
  perf.key(t + 14, { mouth: 0.4 }, 'out');
  const tr = t + 14;
  perf.event(tr, 'putdown', {});
  perf.key(t + 24, { neck: 0.62, neckLen: 1, hPitch: 0, mouth: 0, hip: F.P(0, -1.0), pitch: 0.05 }, 'inout');
  perf.t = t + 26;
  return tr;
}

// ---------------------------------------------------------------- rear up and swat
export function swatUp(perf, o = {}) {
  const t = perf.t;
  const F = frameOf(perf);
  const { P, Pg } = F;
  perf.holdAll(t);
  const n = o.swats ?? 3;
  // gather
  perf.key(t + 5, { hip: P(-0.1, -0.8), pitch: 0.25, archB: 0.3, hn: Pg(0.1), hf: Pg(0.0), neck: 0.5, hPitch: 0.4, lookY: 0.6 }, 'inout');
  // rise onto the hind legs
  perf.key(t + 10, { hip: P(0.0, -1.0), pitch: 1.35, len: 1.1, archB: -0.1, archF: -0.1, neck: 0.3, hPitch: 0.55, hnM: 0.5, hfM: 0.5,
    fn: [F.x0 + F.f * 0.9, F.gy - 2.3], ff: [F.x0 + F.f * 0.8, F.gy - 2.1], fnC: 0.9, ffC: 0.9, tailA: -0.3, tailC: 0.5 }, 'out');
  perf.event(t + 10, 'rear', {});
  let tc = t + 12;
  for (let i = 0; i < n; i++) {
    const a = i % 2 === 0;
    perf.key(tc + 2, { [a ? 'fn' : 'ff']: [F.x0 + F.f * 1.25, F.gy - 2.9], [a ? 'fnC' : 'ffC']: 0.3, [a ? 'ff' : 'fn']: [F.x0 + F.f * 0.75, F.gy - 2.0], [a ? 'ffC' : 'fnC']: 1, hPitch: 0.65 }, 'out');
    perf.key(tc + 5, { [a ? 'fn' : 'ff']: [F.x0 + F.f * 0.95, F.gy - 2.4], [a ? 'fnC' : 'ffC']: 0.9 }, 'in');
    perf.event(tc + 2, 'swat', {});
    tc += 6;
  }
  // drop back down on all fours
  perf.key(tc + 4, { hip: P(0.05, -0.9), pitch: 0.1, len: 1, archB: 0.2, neck: 0.55, hPitch: 0.1, hnM: 0, hfM: 0,
    fn: Pg(1.2), ff: Pg(1.1), hn: Pg(0.08), hf: Pg(-0.02), fnC: 0, ffC: 0, tailA: 0.4, tailC: 0.8 }, 'in');
  perf.event(tc + 4, 'land', { x: F.x0 + F.f * 1.2, y: F.gy, part: 'fore', strength: 0.5 });
  perf.key(tc + 9, { hip: P(0.05, -1.0), archB: 0.08, neck: 0.62 }, 'out');
  perf.t = tc + 10;
  return perf.t;
}

// ---------------------------------------------------------------- fishing strike + splash recoil
/** crouched on a rock; strikes down with the near forepaw at world x; returns splash time */
export function strike(perf, o = {}) {
  const t = perf.t;
  const F = frameOf(perf);
  const { P, Pg } = F;
  const wx = o.x ?? F.x0 + F.f * 1.8, wy = o.y ?? F.gy + 0.8;
  perf.holdAll(t);
  // coil
  perf.key(t + 4, { fn: [F.x0 + F.f * 1.0, F.gy - 0.55], fnC: 1, hip: P(-0.1, -0.78), archB: 0.25, neck: 0.25, hPitch: -0.55, pupil: 1, eyeWide: 0.3, earRot: -0.25 }, 'inout');
  perf.key(t + 7, {}, 'hold');
  perf.setTiming(t + 7, 1);
  // the strike (smear)
  perf.key(t + 9, { fn: [wx, wy], fnC: 0.2, fnF: 1, hip: P(0.15, -0.72), pitch: -0.25, neck: 0.05, hPitch: -0.7, smear: 0.8 }, 'in');
  const ts = t + 9;
  perf.event(ts, 'splash', { x: wx, y: F.gy + 0.3, strength: 1.2, face: true });
  perf.t = t + 10;
  return ts;
}
export function splashRecoil(perf, o = {}) {
  const t = perf.t;
  const F = frameOf(perf);
  const { P, Pg } = F;
  perf.holdAll(t);
  perf.key(t + 2, { smear: 0, squeeze: 1, earFlat: 0.9, earRot: 0.9, whisk: -0.8, hip: P(-0.55, -0.95), pitch: 0.3, neck: 0.75, hPitch: 0.35, hYaw: 0.9,
    fn: [F.x0 + F.f * 0.9, F.gy - 0.8], fnC: 1, fnF: 0, archB: 0.4, fluff: 0.6, tailA: 0.9, tailC: 0.2, mouth: 0.3 }, 'out');
  perf.key(t + 6, { hip: P(-0.65, -0.9) }, 'inout');
  perf.setTiming(t + 6, 2);
  // blink-squint, shake the paw
  perf.key(t + 12, { fn: Pg(0.6), fnC: 0, hip: P(-0.6, -0.95), pitch: 0.12, mouth: 0, fluff: 0.3, hYaw: 0.6, squeeze: 0.3, whisk: 0 }, 'inout');
  perf.key(t + 16, { squeeze: 0, eye: 1 }, 'inout');
  perf.t = t + 14;
  return perf.t;
}

// ---------------------------------------------------------------- tired panting
/** pant for n frames (mouth open/close fast, flanks heaving) */
export function pant(perf, n = 48, o = {}) {
  const t = perf.t;
  perf.holdAll(t);
  perf.key(t + 4, { mouth: 0.45, mouthW: 0.3, tongue: 0.6, lid: 0.45, sad: 0.3, whiskDroop: 0.5, earRot: 0.35, neck: (o.neck ?? 0.35), hPitch: -0.1 }, 'inout');
  perf.emote(t + 6, 'sweat', { dur: Math.min(40, n) });
  const period = o.period ?? 10;
  for (let k = t + 4; k < t + n; k += period) {
    perf.key(k + period * 0.5, { mouth: 0.3, breath: 1 }, 'inout');
    perf.key(k + period, { mouth: 0.45, breath: 0 }, 'inout');
  }
  perf.key(t + n + 6, { mouth: 0, mouthW: 0, tongue: 0, lid: 0.2, sad: 0.15, whiskDroop: 0.2, breath: 0 }, 'inout');
  perf.event(t, 'pant', { dur: n });
  perf.t = t + n + 6;
  return perf.t;
}

// ---------------------------------------------------------------- lick a forepaw (standing)
export function lickPaw(perf, o = {}) {
  const t = perf.t;
  const F = frameOf(perf);
  const fn = perf.curPose().fn;
  perf.holdAll(t);
  perf.key(t + 6, { fn: [F.x0 + F.f * 1.25, F.gy - 0.75], fnC: 1, fnTop: 1, neck: 0.1, hPitch: -0.55, hYaw: 0.6, eye: 0.3, hip: F.P(-0.08, -0.95) }, 'inout');
  for (let i = 0; i < (o.licks ?? 2); i++) {
    perf.key(t + 8 + i * 5, { mouth: 0.35, tongue: 1, hPitch: -0.65 }, 'out');
    perf.key(t + 11 + i * 5, { mouth: 0.1, tongue: 0, hPitch: -0.5 }, 'inout');
    perf.event(t + 8 + i * 5, 'lick', {});
  }
  const e = t + 12 + (o.licks ?? 2) * 5;
  perf.key(e + 6, { fn, fnC: 0, fnTop: 0, neck: 0.5, hPitch: 0, hYaw: 0.35, eye: 1, mouth: 0, hip: F.P(0, -1.0) }, 'inout');
  perf.t = e + 8;
  return perf.t;
}

// ---------------------------------------------------------------- snap at a snowflake (hop)
export function snapHop(perf, o = {}) {
  const t = perf.t;
  const F = frameOf(perf);
  const { P, Pg } = F;
  perf.holdAll(t);
  perf.key(t + 5, { hip: P(-0.05, -0.8), archB: 0.25, neck: 0.8, hPitch: 0.7, lookY: 0.9, eyeWide: 0.3 }, 'inout');
  const up = t + 9;
  const hy = -1.0 - (o.h ?? 1.0);
  perf.key(up, { hip: P(0.25, hy), pitch: 0.7, len: 1.12, archB: -0.15, neck: 0.95, hPitch: 0.9, mouth: 0.55, fn: [F.x0 + F.f * 1.1, F.gy - 1.6 - (o.h ?? 1.0) * 0.6], ff: [F.x0 + F.f * 1.0, F.gy - 1.5 - (o.h ?? 1.0) * 0.6], fnC: 0.8, ffC: 0.8, hn: Pg(0.1, -0.2), hf: Pg(0.0, -0.1), smear: 0.4 }, 'out');
  perf.event(t + 7, 'jump', { x: F.x0, y: F.gy, strength: 0.5 });
  perf.key(up + 3, { mouth: 0.05, smear: 0 }, 'out');
  perf.event(up + 3, 'snap', {});
  const land = up + 9;
  perf.key(land, { hip: P(0.45, -0.75), pitch: -0.1, len: 1, archB: 0.3, neck: 0.4, hPitch: -0.2, mouth: 0, fn: Pg(1.6, 0.1), ff: Pg(1.5, 0.1), fnC: 0, ffC: 0, hn: Pg(0.5, 0.1), hf: Pg(0.4, 0.1) }, 'in');
  perf.event(land, 'land', { x: F.x0 + F.f * 1.6, y: F.gy, part: 'all', strength: 0.8, surface: o.surface });
  perf.key(land + 8, { hip: P(0.45, -0.95), pitch: 0.05, archB: 0.1, neck: 0.6, hPitch: 0.1, eyeWide: 0.2 }, 'out');
  perf.t = land + 10;
  return perf.t;
}
