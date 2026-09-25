// Torso, legs, paws and tail drawing for the side-view rig.
import { M, TORSO, SADDLE, STRIPES, PAL } from './model.js';
import {
  add, sub, mul, norm, rot, dir, lerp, lerpV, clamp, smoothstep, DEG, TAU, dist, angLerp, noise1, hash01,
} from '../core/math.js';
import { smoothTo, smoothPoints, brushLine, clipOutside, css, mix } from '../core/draw.js';

// small deterministic line boil
function boil(pts, seed, amp) {
  if (!amp) return pts;
  return pts.map((p, i) => [p[0] + (hash01(seed * 131 + i * 7) - 0.5) * amp, p[1] + (hash01(seed * 173 + i * 11 + 3) - 0.5) * amp]);
}

export function torsoPoints(sk) {
  const pts = [];
  for (const e of TORSO) {
    if (e[0] === 'N') {
      const q = sk.head.proj([e[1], e[2], e[3]]);
      pts.push([q[0], q[1]]);
    } else pts.push(sk.anchor(e[0], e[1], e[2]));
  }
  return pts;
}

export function drawTorso(ctx, sk, st) {
  const pts = boil(torsoPoints(sk), st.boilSeed, st.boil);
  const path = new Path2D();
  smoothTo(path, pts, true);
  ctx.lineJoin = 'round';
  ctx.lineWidth = st.lw * 2;
  ctx.strokeStyle = st.line;
  ctx.stroke(path);
  ctx.fillStyle = st.white;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  const sad = saddlePath(sk);
  ctx.fillStyle = st.grey;
  ctx.fill(sad);
  // stripes inside saddle
  ctx.save();
  ctx.clip(sad);
  for (const [u0, u1, v0, v1, w] of STRIPES) {
    const a = sk.anchor('M', u0, v0 + 0.1), b = sk.anchor('M', (u0 + u1) / 2 + 0.015, (v0 + v1) / 2), c = sk.anchor('M', u1, v1);
    brushLine(ctx, [a, b, c], w * sk.vScale, st.stripe, { taperIn: 0.05, taperOut: 0.7, seed: Math.round(u0 * 100) });
  }
  // dorsal darker line
  const dl = [];
  for (let u = -0.2; u <= 1.02; u += 0.12) dl.push(sk.anchor('M', u, 0.27));
  brushLine(ctx, dl, 0.07 * sk.vScale, st.stripe, { taperIn: 0.2, taperOut: 0.25, seed: 5 });
  ctx.restore();
  // belly shade (soft cel shadow near the ventral edge)
  if (st.shade) {
    const sh = [];
    for (let u = -0.35; u <= 1.25; u += 0.08) sh.push(sk.anchor('M', u, -0.5));
    for (let u = 1.25; u >= -0.35; u -= 0.16) sh.push(sk.anchor('M', u, -1.2));
    const sp = new Path2D();
    smoothTo(sp, sh, true);
    ctx.fillStyle = st.shade;
    ctx.fill(sp);
  }
  ctx.restore();
  path.saddle = sad;
  return path;
}

function saddlePath(sk) {
  const pts = [];
  pts.push(sk.anchor('H', -0.7, 0.4));
  pts.push(sk.anchor('H', -0.3, 0.9));
  for (let u = 0; u <= 1.0001; u += 0.25) pts.push(sk.anchor('M', u, 0.9));
  pts.push(sk.anchor('S', 0.1, 1.0));
  const P = (p) => { const q = sk.head.proj(p); return [q[0], q[1]]; };
  pts.push(P([-0.55, 0.25, 0]));
  pts.push(P([-0.34, -0.12, 0]));
  pts.push(P([-0.16, -0.3, 0]));
  pts.push(sk.anchor('S', 0.2, 0.14));
  pts.push(sk.anchor('S', 0.04, 0.04));
  for (let i = SADDLE.length - 1; i >= 0; i--) {
    const [u, v] = SADDLE[i];
    if (u > 0.98) continue;
    pts.push(sk.anchor('M', u, v));
  }
  pts.push(sk.anchor('H', -0.7, -0.45));
  const p = new Path2D();
  smoothTo(p, pts, true);
  return p;
}

// ---------- legs ----------
const FORE_PTS = [
  ['h', 0.02, 0.19], ['h', 0.55, 0.15], ['f', 0.06, 0.1], ['f', 0.5, 0.078], ['f', 0.93, 0.066],
  ['m', 0.55, 0.058], ['m', 0.55, -0.062],
  ['f', 0.95, -0.072], ['f', 0.52, -0.085], ['f', 0.14, -0.1],
  ['h', 0.98, -0.14], ['h', 0.55, -0.18], ['h', 0.05, -0.2],
];
const HIND_PTS = [
  ['fe', 0.1, 0.3], ['fe', 0.68, 0.2], ['ti', 0.03, 0.11], ['ti', 0.5, 0.074], ['ti', 0.95, 0.062],
  ['me', 0.35, 0.054], ['me', 0.86, 0.05],
  ['me', 0.86, -0.054], ['me', 0.35, -0.058], ['me', 0.03, -0.085],
  ['ti', 0.9, -0.095], ['ti', 0.62, -0.1], ['ti', 0.28, -0.15],
  ['fe', 0.92, -0.22], ['fe', 0.58, -0.3], ['fe', 0.18, -0.33], ['fe', -0.14, -0.12],
];
function bonePt(A, B, t, off) {
  const d = norm(sub(B, A));
  const front = [d[1], -d[0]];
  return [A[0] + (B[0] - A[0]) * t + front[0] * off, A[1] + (B[1] - A[1]) * t + front[1] * off];
}
export function legPoints(leg) {
  const out = [];
  if (leg.fore) {
    for (const [b, t, o] of FORE_PTS) {
      const [A, B] = b === 'h' ? [leg.root, leg.elbow] : b === 'f' ? [leg.elbow, leg.wrist] : [leg.wrist, leg.ball];
      out.push(bonePt(A, B, t, o));
    }
  } else {
    for (const [b, t, o] of HIND_PTS) {
      const [A, B] = b === 'fe' ? [leg.root, leg.knee] : b === 'ti' ? [leg.knee, leg.hock] : [leg.hock, leg.ball];
      out.push(bonePt(A, B, t, o));
    }
  }
  return out;
}
function pawShape(leg) {
  // digit pad oval + toe bumps, oriented by pawAng
  const a = leg.pawAng;
  const L = leg.fore ? 0.118 : 0.128, Hh = leg.fore ? 0.074 : 0.07;
  const c = leg.paw;
  const R = (x, y) => { const r = rot([x, y], a); return [c[0] + r[0], c[1] + r[1]]; };
  // outline: sole flat-ish, top rounded with toes
  const pts = [
    R(-L * 0.85, Hh * 0.2), R(-L * 0.4, Hh * 0.95), R(L * 0.2, Hh * 0.98), R(L * 0.8, Hh * 0.72), R(L * 1.02, Hh * 0.1),
    R(L * 0.85, -Hh * 0.62), R(L * 0.35, -Hh * 1.0), R(-L * 0.2, -Hh * 1.02), R(-L * 0.75, -Hh * 0.75),
  ];
  return { pts, R, L, Hh };
}

export function drawLeg(ctx, leg, st, opts = {}) {
  const pts = boil(legPoints(leg), st.boilSeed + (leg.fore ? 3 : 7), st.boil);
  const path = new Path2D();
  smoothTo(path, pts, true);
  const paw = pawShape(leg);
  smoothTo(path, boil(paw.pts, st.boilSeed + 9, st.boil), true);
  // stroke: full outside the body, fading inside it near the root
  ctx.lineJoin = 'round';
  ctx.lineWidth = st.lw * 2;
  if (opts.bodyPath) {
    ctx.save();
    clipOutside(ctx, opts.bodyPath);
    ctx.strokeStyle = st.line;
    ctx.stroke(path);
    ctx.restore();
    ctx.save();
    ctx.clip(opts.bodyPath);
    const r0 = leg.fore ? 0.2 : 0.24, r1 = leg.fore ? 0.36 : 0.42;
    const g = ctx.createRadialGradient(leg.root[0], leg.root[1], r0, leg.root[0], leg.root[1], r1);
    g.addColorStop(0, css(st.lineRGB, 0));
    g.addColorStop(1, css(st.lineRGB, 1));
    ctx.strokeStyle = g;
    ctx.stroke(path);
    ctx.restore();
  } else {
    ctx.strokeStyle = st.line;
    ctx.stroke(path);
  }
  ctx.fillStyle = st.white;
  ctx.fill(path);
  // markings
  ctx.save();
  ctx.clip(path);
  if (!leg.fore) {
    // grey haunch (upper thigh) in femur space with a wavy lower edge
    const g = [];
    const A = leg.root, B = leg.knee;
    g.push(bonePt(A, B, -0.7, 0.5));
    g.push(bonePt(A, B, -0.7, -0.7));
    g.push(bonePt(A, B, 0.45, -0.5));
    g.push(bonePt(A, B, 0.72, -0.3));
    g.push(bonePt(A, B, 0.62, -0.12));
    g.push(bonePt(A, B, 0.7, 0.04));
    g.push(bonePt(A, B, 0.52, 0.22));
    g.push(bonePt(A, B, 0.3, 0.5));
    const gp = new Path2D();
    smoothTo(gp, g, true);
    ctx.fillStyle = st.grey;
    ctx.fill(gp);
    if (opts.saddle) ctx.fill(opts.saddle);
    ctx.save();
    ctx.clip(gp);
    for (const [t, w] of [[0.2, 0.07], [0.45, 0.06]]) {
      brushLine(ctx, [bonePt(A, B, t - 0.14, 0.34), bonePt(A, B, t + 0.02, 0.0), bonePt(A, B, t + 0.08, -0.32)], w, st.stripe, { taperIn: 0.2, taperOut: 0.6, seed: 9 + t * 10 });
    }
    ctx.restore();
  } else if (opts.saddle) {
    ctx.fillStyle = st.grey;
    ctx.fill(opts.saddle);
  }
  // toe beans when the sole faces the viewer/back (curled paws)
  if (leg.c > 0.45 && st.showPads !== false) {
    const k = smoothstep(0.45, 0.8, leg.c);
    ctx.globalAlpha = k;
    ctx.fillStyle = st.pinkPad;
    const R = paw.R, L = paw.L, Hh = paw.Hh;
    const main = R(-L * 0.05, -Hh * 0.55);
    ctx.beginPath();
    ctx.ellipse(main[0], main[1], L * 0.34, Hh * 0.34, leg.pawAng, 0, TAU);
    ctx.fill();
    for (const x of [-0.45, 0.05, 0.5]) {
      const q = R(L * x, -Hh * 0.95);
      ctx.beginPath();
      ctx.ellipse(q[0], q[1], L * 0.13, Hh * 0.18, leg.pawAng, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // toe separation lines on top of the paw
  const R = paw.R, L = paw.L, Hh = paw.Hh;
  for (const x of [0.3, 0.62]) {
    brushLine(ctx, [R(L * x, Hh * 0.95), R(L * (x - 0.04), Hh * 0.45)], st.lw * 0.9, st.lineSoftC, { taperIn: 0.1, taperOut: 0.7, seed: 21 });
  }
  return path;
}

// ---------- tail ----------
export function tailWidth(t) {
  // full width (H units) along the tail (0 root .. 1 tip)
  return lerp(0.22, 0.25, smoothstep(0, 0.35, t)) * (1 - 0.16 * smoothstep(0.55, 1, t));
}
export function tailOutline(pts, fluff = 0) {
  const n = pts.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const d = norm(sub(b, a));
    const nx = -d[1], ny = d[0];
    const w = (tailWidth(i / (n - 1)) * (1 + 0.45 * fluff)) / 2;
    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  return { left, right };
}
export function drawTail(ctx, pts, st, fluff = 0) {
  const n = pts.length;
  const { left, right } = tailOutline(pts, fluff);
  const tip = pts[n - 1], pre = pts[n - 2];
  const d = norm(sub(tip, pre));
  const wTip = (tailWidth(1) * (1 + 0.45 * fluff)) / 2;
  const tipPt = [tip[0] + d[0] * wTip * 0.95, tip[1] + d[1] * wTip * 0.95];
  const outline = [...left, tipPt, ...right.reverse()];
  // start slightly inside the rump: extend root backwards
  const path = new Path2D();
  smoothTo(path, boil(outline, st.boilSeed + 17, st.boil), true);
  ctx.lineJoin = 'round';
  ctx.lineWidth = st.lw * 2;
  ctx.strokeStyle = st.line;
  ctx.stroke(path);
  ctx.fillStyle = st.grey;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  // rings
  const { left: L2, right: R2 } = tailOutline(pts, fluff + 0.3);
  const ring = (t0, t1, color) => {
    const i0 = Math.max(0, Math.floor(t0 * (n - 1))), i1 = Math.min(n - 1, Math.ceil(t1 * (n - 1)));
    const poly = [];
    for (let i = i0; i <= i1; i++) poly.push(L2[i]);
    for (let i = i1; i >= i0; i--) poly.push(R2[i]);
    const p = new Path2D();
    smoothTo(p, poly, true);
    ctx.fillStyle = color;
    ctx.fill(p);
  };
  for (const c of [0.34, 0.48, 0.61, 0.73, 0.84]) ring(c - 0.035, c + 0.035, st.stripe);
  ring(0.92, 1.0, st.stripeDark);
  ctx.beginPath();
  ctx.arc(tip[0], tip[1], wTip * 1.3, 0, TAU);
  ctx.fillStyle = st.stripeDark;
  ctx.fill();
  ctx.restore();
  return path;
}
