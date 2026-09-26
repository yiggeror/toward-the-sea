// Skeleton solver for Xiaohui. Input: a pose (flat object, H units, y-down).
// Output: world-space joints for spine, neck, head frame, legs and tail.
// Everything is solved in a local frame where the cat faces +x; facing = -1
// mirrors x at the end (the drawing layer applies the mirror transform).
import { M } from './model.js';
import {
  add, sub, mul, dot, rot, dir, norm, len, lerp, lerpV, clamp, ik2, bezier3, bezier3d, DEG,
  v3, add3, mul3, norm3, cross3, dot3,
} from '../core/math.js';

export function defaultPose() {
  return {
    facing: 1,
    hip: [0, -1.02],
    pitch: 0.06, // chord angle, + = front up
    len: 1, // spine length multiplier
    archB: 0.08, // tangent deviation at hip (+ = arched back)
    archF: 0.02,
    chest: 0, // chest turn toward viewer 0..1
    neck: 0.62, // neck elevation (rad) above shoulder tangent
    neckLen: 1,
    hYaw: 0.35, // head turn toward viewer (rad)
    hPitch: 0, // + = nose up
    hRoll: 0, // + = tilt (top toward back)
    // paw digit centres (ground contact) and curl 0..1
    fn: [1.12, 0], ff: [1.02, 0], hn: [0.04, 0], hf: [-0.06, 0],
    fnC: 0, ffC: 0, hnC: 0, hfC: 0,
    hnM: 0, hfM: 0, // hind metatarsus flat on the ground (sitting) 0..1
    fnF: 0, ffF: 0, // fore "reach": straighten wrist forward (for reaching/pounce) 0..1
    // tail intention
    tailA: 0.5, tailC: 0.9, tailK: 0.9, tailTone: 1, tailWave: 0, tailWaveP: 0, tailWorld: 0, tailFront: 0,
    fnTop: 0, // draw near foreleg over the head (grooming)
    smear: 0, // smear/multiples amount for fast frames
    // ears: swivel (0 fwd .. 1 side/back), flatten (0 up .. 1 flat), per-ear offsets
    earRot: 0.1, earFlat: 0, earLR: 0, earRR: 0,
    // face
    eye: 1, // eyelid openness (1 open, 0 closed)
    eyeWide: 0, // extra wide (surprise)
    pupil: 0.45, // pupil width 0..1
    lookX: 0.1, lookY: 0,
    lid: 0, // angry lid slant 0..1
    happy: 0, // closed ^^ eyes
    mouth: 0, // open amount 0..1
    mouthW: 0, // 0 small 'o' .. 1 wide laugh
    smile: 0, // corner lift
    tongue: 0,
    whisk: 0, // -1 back .. 1 forward
    fluff: 0, // fur puff 0..1
    squash: 0, // + squash / - stretch of the whole body
    breath: 0, // breathing inflate 0..1
    // expression extras
    lidTilt: 0, // + angry (inner corner low) .. - sad (outer corner low)
    wink: 0, // + closes the left eye, - the right one
    sparkle: 0, // shiny wide "wonder" eyes
    tear: 0, // watery eyes (0.6+: a tear rolls)
    squeeze: 0, // > < eyes
    sad: 0, // worried slant + droop
    blush: 0, // pink cheeks
    wobble: 0, // wavy nervous mouth
    puff: 0, // cheek puff
    whiskDroop: 0, // whiskers hang (sad / tired)
  };
}

// Spine: cubic bezier from hip P to shoulder S, arc-length sampled.
function buildSpine(pose) {
  const L = M.spineLen * pose.len;
  const P = pose.hip;
  const d = [Math.cos(pose.pitch), -Math.sin(pose.pitch)];
  const n = [d[1], -d[0]];
  const S = add(P, mul(d, L));
  const t0 = norm(add(mul(d, Math.cos(pose.archB)), mul(n, Math.sin(pose.archB))));
  const t1 = norm(sub(mul(d, Math.cos(pose.archF)), mul(n, Math.sin(pose.archF))));
  const c1 = add(P, mul(t0, L * 0.36));
  const c2 = sub(S, mul(t1, L * 0.36));
  const K = 32;
  const pts = [], cum = [0];
  for (let i = 0; i <= K; i++) {
    pts.push(bezier3(P, c1, c2, S, i / K));
    if (i > 0) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  }
  const total = cum[K];
  const spine = { P, S, c1, c2, t0, t1, n0: [t0[1], -t0[0]], n1: [t1[1], -t1[0]], L, arc: total };
  // u in [0,1] by arc length -> bezier param
  spine.param = (u) => {
    const target = clamp(u, 0, 1) * total;
    let j = 0;
    while (j < K - 1 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    return (j + (target - cum[j]) / seg) / K;
  };
  spine.at = (u) => {
    if (u < 0) {
      const p = add(P, mul(t0, u * total));
      return { p, t: t0, n: spine.n0 };
    }
    if (u > 1) {
      const p = add(S, mul(t1, (u - 1) * total));
      return { p, t: t1, n: spine.n1 };
    }
    const s = spine.param(u);
    const p = bezier3(P, c1, c2, S, s);
    const t = norm(bezier3d(P, c1, c2, S, s));
    return { p, t, n: [t[1], -t[0]] };
  };
  return spine;
}

// Head orientation basis (3D, y-up, z toward viewer). yaw then pitch then roll.
export function headBasis(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  let f = [cy, 0, sy], u = [0, 1, 0], l = [-sy, 0, cy];
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const f2 = add3(mul3(f, cp), mul3(u, sp));
  const u2 = add3(mul3(f, -sp), mul3(u, cp));
  f = f2; u = u2;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const u3 = add3(mul3(u, cr), mul3(l, sr));
  const l3 = add3(mul3(u, -sr), mul3(l, cr));
  return { f, u: u3, l: l3 };
}

export function computeSkeleton(pose) {
  const facing = pose.facing < 0 ? -1 : 1;
  // local copy with mirrored x if needed
  const mx = (p) => [p[0] * facing, p[1]];
  const lp = Object.assign({}, pose, {
    hip: mx(pose.hip), fn: mx(pose.fn), ff: mx(pose.ff), hn: mx(pose.hn), hf: mx(pose.hf),
  });
  const sp = buildSpine(lp);
  // volume preservation: thinner when stretched
  const vScale = clamp(1 / Math.sqrt(Math.max(0.3, lp.len)), 0.75, 1.35) * (1 + 0.04 * lp.breath);

  const chestK = lp.chest || 0;
  const anchor = (kind, a, v) => {
    if (kind === 'H') return add(add(sp.P, mul(sp.t0, a)), mul(sp.n0, v));
    if (kind === 'S') {
      // twisting the chest toward the viewer bulges the front/under chest
      const bulge = v < 0.05 ? chestK * 0.07 * Math.min(1, (0.05 - v) * 3) : 0;
      return add(add(sp.S, mul(sp.t1, a + bulge)), mul(sp.n1, v));
    }
    const f = sp.at(a);
    return add(f.p, mul(f.n, v * vScale));
  };

  // ---- neck & head ----
  const neckBase = anchor('S', 0.1, 0.14);
  const nd = rot(sp.t1, -lp.neck);
  const neckEnd = add(neckBase, mul(nd, M.neckLen * lp.neckLen));
  const hb = headBasis(lp.hYaw + (lp.chest || 0) * 0.35, lp.hPitch, lp.hRoll);
  const HS = M.headScale || 1;
  const ho = M.headOffset;
  const off3 = mul3(add3(add3(mul3(hb.f, ho[0]), mul3(hb.u, ho[1])), mul3(hb.l, ho[2])), HS);
  const headC = [neckEnd[0] + off3[0], neckEnd[1] - off3[1]];
  const head = { c: headC, basis: hb, depth: off3[2], s: HS };
  // project head-local 3D point to world 2D (and depth); scaled by head size
  head.proj = (p) => {
    const w = add3(add3(mul3(hb.f, p[0] * HS), mul3(hb.u, p[1] * HS)), mul3(hb.l, p[2] * HS));
    return [headC[0] + w[0], headC[1] - w[1], w[2]];
  };
  head.vec = (p) => {
    const w = add3(add3(mul3(hb.f, p[0]), mul3(hb.u, p[1])), mul3(hb.l, p[2]));
    return [w[0], -w[1], w[2]];
  };

  // ---- legs ----
  const shoulderJ = anchor('S', 0.0, -0.1);
  const hipJ = anchor('H', 0.0, 0.0);
  const farShift = M.farLegShift;
  const legs = {};
  const fore = (name, root, T, c, reach) => {
    const pawAng = lerp(0, 170 * DEG, c) - reach * 20 * DEG;
    const metaAng = lerp(82 * DEG, 140 * DEG, c) - reach * 55 * DEG;
    const B = sub(T, rot([0.06, 0], pawAng));
    const W = sub(B, mul(dir(metaAng), 0.14));
    const r = ik2(root, W, M.humerus, M.forearm, 1);
    legs[name] = { root, elbow: r.joint, wrist: r.end, ball: add(r.end, sub(B, W)), paw: add(r.end, sub(T, W)), pawAng, metaAng, c, fore: true };
  };
  const hind = (name, root, T, c, flat) => {
    const pawAng = lerp(0, 105 * DEG, c);
    const B = sub(T, rot([0.07, 0], pawAng));
    // pantograph solution (metatarsus parallel to femur)
    const r1 = ik2(root, B, M.femur + M.hindMeta, M.tibia, -1);
    const u = norm(sub(r1.joint, root));
    const Ap = sub(r1.end, mul(u, M.hindMeta));
    const Af = add(B, [-M.hindMeta * 0.98, -0.02]);
    const A = lerpV(Ap, Af, clamp(flat));
    const r2 = ik2(root, A, M.femur, M.tibia, -1);
    // the ball follows the hock if the leg could not reach
    const ball = r2.reached ? B : add(r2.end, sub(B, A));
    const paw = add(ball, sub(T, B));
    legs[name] = { root, knee: r2.joint, hock: r2.end, ball, paw, pawAng, c, fore: false, flat: clamp(flat, 0, 1) };
  };
  // chest twist toward viewer spreads the fore pair (far leg shows more)
  const fs = [farShift[0] - (lp.chest || 0) * 0.14, farShift[1] - Math.abs(lp.chest || 0) * 0.03];
  fore('fn', shoulderJ, lp.fn, lp.fnC, lp.fnF || 0);
  fore('ff', add(shoulderJ, fs), lp.ff, lp.ffC, lp.ffF || 0);
  hind('hn', hipJ, lp.hn, lp.hnC, lp.hnM);
  hind('hf', add(hipJ, fs), lp.hf, lp.hfC, lp.hfM);

  // scapula roll: when a foreleg's elbow rises toward the shoulder the blade
  // pokes above the back line (strong when stalking / pushing into wind)
  const scap = (L) => {
    const drop = (L.elbow[1] - L.root[1]) * Math.cos(0) ;
    return clamp((0.36 - drop) * 0.9, 0, 0.22);
  };
  const scapN = scap(legs.fn), scapF = scap(legs.ff);

  // ---- tail root frame ----
  const tailRoot = anchor('H', -0.33, 0.13);
  const back = mul(sp.t0, -1);
  const tailBaseAng = Math.atan2(back[1], back[0]); // pointing backwards

  return {
    pose: lp, facing, spine: sp, anchor, vScale, neckBase, neckEnd, neckDir: nd, head, legs, scapN, scapF,
    shoulderJ, hipJ, tailRoot, tailBaseAng,
  };
}

// Build tail centreline from segment world angles (local frame).
export function tailPoints(root, angles, segLen) {
  const pts = [root.slice()];
  let p = root;
  for (let i = 0; i < angles.length; i++) {
    p = add(p, mul(dir(angles[i]), segLen[i]));
    pts.push(p);
  }
  return pts;
}
