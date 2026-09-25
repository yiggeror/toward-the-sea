// Xiaohui's head: a tiny 3D model (ellipsoids + features on a sphere) projected
// orthographically, drawn with flat colours and clean lines. Works from profile
// to front to back views so head turns/tilts are continuous.
import { HEAD, PAL } from './model.js';
import {
  add3, mul3, norm3, cross3, dot3, sub3, rotAxis3, clamp, lerp, DEG, TAU, smoothstep, add, sub, mul, norm, dist,
} from '../core/math.js';
import { smoothTo, brushLine, fillStroke, clipOutside, css, mix } from '../core/draw.js';

// ---------- projection helpers ----------
function ellipse2D(head, c, r) {
  const b = head.basis;
  const cols = [mul3(b.f, r[0]), mul3(b.u, r[1]), mul3(b.l, r[2])];
  // 2x3 matrix rows: x = col.x, y = -col.y
  let a = 0, bb = 0, cc = 0;
  for (const k of cols) {
    const x = k[0], y = -k[1];
    a += x * x; bb += x * y; cc += y * y;
  }
  const tr = (a + cc) / 2, df = Math.sqrt(((a - cc) / 2) ** 2 + bb * bb);
  const l1 = tr + df, l2 = Math.max(1e-8, tr - df);
  const ang = 0.5 * Math.atan2(2 * bb, a - cc);
  const p = head.proj(c);
  return { cx: p[0], cy: p[1], z: p[2], rx: Math.sqrt(l1), ry: Math.sqrt(l2), rot: ang, Q: [a, bb, cc] };
}
// inside test for projected ellipse (with margin factor)
function inEll(e, x, y, k = 1) {
  const dx = x - e.cx, dy = y - e.cy;
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const u = (dx * c + dy * s) / (e.rx * k), v = (-dx * s + dy * c) / (e.ry * k);
  return u * u + v * v < 1;
}
function ellPoint(e, t) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const x = Math.cos(t) * e.rx, y = Math.sin(t) * e.ry;
  return [e.cx + x * c - y * s, e.cy + x * s + y * c];
}
function ellNormal(e, t) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const x = Math.cos(t) / e.rx, y = Math.sin(t) / e.ry;
  return norm([x * c - y * s, x * s + y * c]);
}
// radial distance of ellipse boundary along 2D unit direction d
function ellRadius(e, d) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const u = (d[0] * c + d[1] * s) / e.rx, v = (-d[0] * s + d[1] * c) / e.ry;
  return 1 / Math.sqrt(u * u + v * v);
}

// sphere-ish surface point on cranium by azimuth lam (0 fwd, + toward left/z+) and elevation phi
function sph(lam, phi, r = HEAD.cranium.r) {
  const cp = Math.cos(phi);
  return [r[0] * cp * Math.cos(lam), r[1] * Math.sin(phi), r[2] * cp * Math.sin(lam)];
}
function sphN(p, r = HEAD.cranium.r) {
  return norm3([p[0] / (r[0] * r[0]), p[1] / (r[1] * r[1]), p[2] / (r[2] * r[2])]);
}

// Project marking polygon given in (lam, phi) degrees; back-facing points are
// pushed onto (and slightly past) the projected cranium limb.
function projMark(head, cran, pts, push = 1.4) {
  const out = [];
  for (const [lamD, phiD] of pts) {
    const p = sph(lamD * DEG, phiD * DEG);
    const nW = head.vec(sphN(p));
    const w = head.proj(p);
    if (nW[2] < 0.02) {
      const d = norm([w[0] - cran.cx, w[1] - cran.cy]);
      const r = ellRadius(cran, d) * push;
      out.push([cran.cx + d[0] * r, cran.cy + d[1] * r]);
    } else out.push([w[0], w[1]]);
  }
  return out;
}

// white face region boundary elevation (deg) as function of |azimuth| (deg)
const FACE_B = [
  [0, 6], [8, 0], [16, -6], [26, -12], [38, -18], [52, -24], [68, -31], [85, -40], [110, -55], [150, -72], [180, -80],
];
function faceB(lamAbs) {
  for (let i = 1; i < FACE_B.length; i++) {
    if (lamAbs <= FACE_B[i][0]) {
      const [a0, b0] = FACE_B[i - 1], [a1, b1] = FACE_B[i];
      return lerp(b0, b1, (lamAbs - a0) / (a1 - a0));
    }
  }
  return -80;
}
// blaze half-width (deg azimuth) as function of elevation (deg)
const BLAZE_W = [[-40, 28], [-10, 19], [4, 14], [16, 9.5], [30, 5.5], [44, 2.6], [56, 0.8]];
function blazeW(phi) {
  for (let i = 1; i < BLAZE_W.length; i++) {
    if (phi <= BLAZE_W[i][0]) {
      const [a0, b0] = BLAZE_W[i - 1], [a1, b1] = BLAZE_W[i];
      return lerp(b0, b1, (phi - a0) / (a1 - a0));
    }
  }
  return 0.5;
}

// ---------- ears ----------
function earGeom(head, side, pose) {
  // side: +1 left (z+), -1 right (z-)
  const eb = HEAD.earBase;
  const S = (p) => [p[0], p[1], p[2] * side];
  let bf = S(eb.f), bb = S(eb.b), tip = S(eb.tip);
  const base = mul3(add3(bf, bb), 0.5);
  const rotAmt = clamp(pose.earRot + (side > 0 ? pose.earLR : pose.earRR), -0.4, 1.3);
  const flat = clamp(pose.earFlat, 0, 1.2);
  // swivel about head up axis through base (opening turns outward/back)
  const up = [0, 1, 0];
  const swivel = rotAmt * 95 * DEG * side * -1; // rotate so opening goes toward side/back
  const R1 = (p) => add3(base, rotAxis3(sub3(p, base), up, swivel));
  bf = R1(bf); bb = R1(bb); tip = R1(tip);
  // flatten: rotate about the base line axis so the tip goes outward & down
  const axis = norm3(sub3(bf, bb));
  const flatA = flat * 70 * DEG * side;
  const R2 = (p) => add3(base, rotAxis3(sub3(p, base), axis, flatA));
  bf = R2(bf); bb = R2(bb); tip = R2(tip);
  // also tilt backward when flattening (pinned back)
  const side3 = [0, 0, 1];
  const back = flat * 25 * DEG * (rotAmt > 0.5 ? 1 : 0.4);
  const R3 = (p) => add3(base, rotAxis3(sub3(p, base), side3, back));
  bf = R3(bf); bb = R3(bb); tip = R3(tip);
  // opening normal (points toward the front face of the ear)
  let nrm = norm3(cross3(sub3(tip, bb), sub3(bf, bb)));
  if (side < 0) nrm = mul3(nrm, -1);
  // cone body: base ellipse (along base line x depth behind the opening)
  const a1 = mul3(sub3(bf, bb), 0.5), a2 = mul3(nrm, -eb.depth);
  const P = (p) => head.proj(p);
  const hull = [P(tip)];
  for (let i = 0; i < 14; i++) {
    const t = (i / 14) * TAU;
    // only the back half of the base bulges (front edge is the opening rim)
    const k = Math.max(0, Math.sin(t));
    hull.push(P(add3(add3(base, mul3(a1, Math.cos(t))), mul3(a2, k))));
  }
  // mid-height bulge of the back of the cone
  hull.push(P(add3(add3(base, mul3(sub3(tip, base), 0.45)), mul3(a2, 0.7))));
  const cup = add3(add3(base, mul3(sub3(tip, base), 0.3)), mul3(a2, 0.9));
  const nW = head.vec(nrm);
  return {
    hull: convexHull(hull.map((q) => [q[0], q[1]])),
    side, bf: P(bf), bb: P(bb), tip: P(tip), cup: P(cup), base: P(base),
    facing: nW[2], depth: P(base)[2],
    // points slightly inside for the pink inner ear
    in1: P(add3(mul3(bf, 0.78), mul3(tip, 0.22))),
    in2: P(add3(mul3(bb, 0.8), mul3(tip, 0.2))),
    inTip: P(add3(mul3(tip, 0.84), mul3(base, 0.16))),
    inBase: P(add3(mul3(base, 0.92), mul3(tip, 0.08))),
  };
}
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}
function earPath(e) {
  // convex cone silhouette; sharpen the tip by keeping it as a corner
  const p = new Path2D();
  const h = e.hull;
  const ti = h.findIndex((q) => Math.abs(q[0] - e.tip[0]) < 1e-9 && Math.abs(q[1] - e.tip[1]) < 1e-9);
  if (ti < 0) { smoothTo(p, h, true); return p; }
  // walk from tip around, smooth everything except the tip corner
  const ring = [];
  for (let i = 0; i < h.length; i++) ring.push(h[(ti + i) % h.length]);
  // add points near tip on both edges so the tip stays pointed but rounded slightly
  const t = ring[0], a = ring[1], b = ring[ring.length - 1];
  const near = (q, k) => [t[0] + (q[0] - t[0]) * k, t[1] + (q[1] - t[1]) * k];
  const pts = [near(b, 0.06), t, near(a, 0.06), ...ring.slice(1)];
  smoothTo(p, pts, true);
  return p;
}

// ---------- eyes ----------
function eyeFrame(head, side, pose) {
  const E = HEAD.eye;
  const c3 = [E.c[0], E.c[1], E.c[2] * side];
  const n3 = norm3([E.n[0], E.n[1], E.n[2] * side]);
  const out3 = norm3(sub3([0, 0, side], mul3(n3, n3[2] * side)));
  let up3 = norm3(sub3([0, 1, 0], mul3(n3, n3[1])));
  up3 = norm3(sub3(up3, mul3(out3, dot3(up3, out3))));
  const c = head.proj(c3);
  const ah = head.vec(out3), av = head.vec(up3), nW = head.vec(n3);
  const r = E.r * (1 + 0.12 * (pose.eyeWide || 0));
  return {
    side, c: [c[0], c[1]], z: c[2], r,
    ax: [ah[0] * r, ah[1] * r], ay: [-av[0] * r, -av[1] * r], // ay points "up" on screen for v+
    facing: nW[2],
  };
}
// eye outline in eye space (u: inner(-1) -> outer(+1), v up)
function eyeShape(k = 1) {
  const pts = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    let x = Math.cos(a), y = Math.sin(a);
    // flatter top, slight lift at outer corner
    if (y > 0) y *= 0.9 - 0.06 * x;
    else y *= 0.98;
    y += 0.05 * x;
    pts.push([x, y * k]);
  }
  return pts;
}
function upperLid(u, open, lid, side) {
  // v of the upper lid edge at u (eye space) — closes toward lower curve
  const top = 0.86 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.05 * u;
  const closedV = -0.1 - 0.12 * (1 - u * u);
  let v = lerp(closedV, top, open);
  // angry slant: inner corner (u=-1) lowered
  v -= lid * 0.55 * (1 - u) * 0.5 * open;
  return v;
}

// screen-space offset -> eye-space (u, v) using the eye's affine frame
function toEye(ef, dx, dy) {
  const ax = ef.ax, av = [-ef.ay[0], -ef.ay[1]];
  let det = ax[0] * av[1] - av[0] * ax[1];
  if (Math.abs(det) < 1e-6) det = det < 0 ? -1e-6 : 1e-6;
  return [(av[1] * dx - av[0] * dy) / det, (-ax[1] * dx + ax[0] * dy) / det];
}
function drawEye(ctx, ef, pose, st) {
  if (ef.facing < -0.15) return;
  const open = clamp(pose.eye, 0, 1) * (1 - clamp(pose.happy, 0, 1));
  const vis = smoothstep(-0.15, 0.2, ef.facing);
  ctx.save();
  ctx.transform(ef.ax[0], ef.ax[1], -ef.ay[0], -ef.ay[1], ef.c[0], ef.c[1]);
  // in this frame: (u, v) with v up -> screen
  const lw = st.lw / ef.r; // line width in eye units (approx)
  const shape = eyeShape();
  if (open > 0.04) {
    // clip to open region
    ctx.save();
    const clip = new Path2D();
    const N = 24;
    clip.moveTo(-1.2, -1.3);
    for (let i = 0; i <= N; i++) {
      const u = -1 + (2 * i) / N;
      clip.lineTo(u * 1.02, upperLid(u, open, pose.lid, ef.side));
    }
    clip.lineTo(1.2, -1.3);
    clip.closePath();
    ctx.clip(clip);
    const ep = new Path2D();
    smoothTo(ep, shape, true);
    ctx.clip(ep);
    // sclera hint + iris
    ctx.fillStyle = css(mix(PAL.iris, st.irisTint || PAL.iris, 0.5));
    ctx.fill(ep);
    const g = ctx.createRadialGradient(0, -0.25, 0.05, 0, 0, 1.05);
    g.addColorStop(0, css(PAL.irisLight));
    g.addColorStop(0.55, css(PAL.iris));
    g.addColorStop(0.9, css(PAL.irisDark));
    g.addColorStop(1, css(PAL.irisDark));
    ctx.fillStyle = g;
    ctx.fill(ep);
    // pupil
    const pw = lerp(0.14, 0.62, clamp(pose.pupil, 0, 1));
    const ph = lerp(0.78, 0.7, clamp(pose.pupil, 0, 1));
    // gaze given in screen-ish terms (lookX + = forward/right, lookY + = up)
    const gz = toEye(ef, (pose.lookX || 0) * ef.r, -(pose.lookY || 0) * ef.r);
    const gx = clamp(gz[0] * 0.3, -0.36, 0.36);
    const gy = clamp(gz[1] * 0.26, -0.3, 0.3);
    ctx.beginPath();
    if (pw < 0.35) {
      // vesica-shaped slit
      ctx.moveTo(gx, gy + ph);
      ctx.quadraticCurveTo(gx + pw * 1.9, gy, gx, gy - ph);
      ctx.quadraticCurveTo(gx - pw * 1.9, gy, gx, gy + ph);
    } else ctx.ellipse(gx, gy, pw, ph, 0, 0, TAU);
    ctx.fillStyle = css(PAL.pupil);
    ctx.fill();
    // soft shade under upper lid
    ctx.fillStyle = css('#3c4447', 0.28);
    ctx.beginPath();
    ctx.ellipse(0, 0.95, 1.3, 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // highlights (screen-space up-left offset expressed roughly in eye space)
    const hs = st.highlight ?? 1;
    if (hs > 0) {
      ctx.save();
      ctx.clip(clip);
      const h1 = toEye(ef, -0.3 * ef.r, -0.36 * ef.r), h2 = toEye(ef, 0.3 * ef.r, 0.38 * ef.r);
      ctx.fillStyle = css('#ffffff', 0.95 * hs);
      ctx.beginPath();
      ctx.ellipse(gx * 0.5 + clamp(h1[0], -0.5, 0.5), gy * 0.5 + clamp(h1[1], -0.5, 0.5), 0.21, 0.18, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = css('#ffffff', 0.7 * hs);
      ctx.beginPath();
      ctx.ellipse(gx * 0.5 + clamp(h2[0], -0.55, 0.55), gy * 0.5 + clamp(h2[1], -0.55, 0.55), 0.08, 0.07, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // upper lid line (thick), with a flick at the outer corner
    const lidPts = [];
    for (let i = 0; i <= 14; i++) {
      const u = -1.02 + (2.06 * i) / 14;
      lidPts.push([u, upperLid(clamp(u, -1, 1), open, pose.lid, ef.side) + 0.02]);
    }
    lidPts.push([1.22, upperLid(1, open, pose.lid, ef.side) + 0.16]);
    const w = Math.max(lw * 2.2, 0.12);
    fillStroke(ctx, lidPts, (i, t) => w * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5)) * (t > 0.9 ? (1 - t) * 10 * 0.8 + 0.2 : 1), css(PAL.line, vis));
    // lower lid thin line
    const low = [];
    for (let i = 0; i <= 10; i++) {
      const u = -0.75 + (1.6 * i) / 10;
      low.push([u, -0.98 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.05 * u - 0.02]);
    }
    fillStroke(ctx, low, (i, t) => lw * 0.9 * Math.sin(t * Math.PI), css(PAL.lineSoft, 0.8 * vis));
  } else {
    // closed eye: sleepy (downward arc) or happy (upward arc ^)
    const happy = clamp(pose.happy, 0, 1);
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = -0.95 + (1.9 * i) / 12;
      const sleepy = -0.12 - 0.22 * (1 - u * u);
      const hap = -0.3 + 0.42 * (1 - u * u);
      pts.push([u, lerp(sleepy, hap, happy)]);
    }
    const w = Math.max(lw * 2, 0.11);
    fillStroke(ctx, pts, (i, t) => w * Math.sin(0.15 + t * (Math.PI - 0.3)), css(PAL.line, vis));
  }
  ctx.restore();
}

// ---------- main ----------
export function buildHead(sk) {
  const head = sk.head, pose = sk.pose;
  const cran = ellipse2D(head, HEAD.cranium.c, HEAD.cranium.r);
  const cc = HEAD.cheeks.c;
  const cheekL = ellipse2D(head, [cc[0], cc[1], cc[2]], HEAD.cheeks.r);
  const cheekR = ellipse2D(head, [cc[0], cc[1], -cc[2]], HEAD.cheeks.r);
  const muz = ellipse2D(head, HEAD.muzzle.c, HEAD.muzzle.r);
  const chin = ellipse2D(head, HEAD.chin.c, HEAD.chin.r);
  const ells = [cran, cheekL, cheekR, muz, chin];
  const earL = earGeom(head, 1, pose), earR = earGeom(head, -1, pose);
  const eyeL = eyeFrame(head, 1, pose), eyeR = eyeFrame(head, -1, pose);
  return { head, pose, cran, cheekL, cheekR, muz, chin, ells, earL, earR, eyeL, eyeR };
}

function headUnionPath(g, fluff) {
  const p = new Path2D();
  for (const e of g.ells) {
    p.moveTo(e.cx + Math.cos(e.rot) * e.rx, e.cy + Math.sin(e.rot) * e.rx);
    p.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, TAU);
  }
  // cheek fur tufts on the silhouette (lower cheeks)
  const k = 1 + 0.5 * (fluff || 0);
  for (const e of [g.cheekL, g.cheekR]) {
    const cand = [];
    const N = 56;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * TAU;
      const pt = ellPoint(e, t);
      let sil = true;
      for (const o of g.ells) if (o !== e && inEll(o, pt[0], pt[1], 1.02)) { sil = false; break; }
      if (!sil) continue;
      const nrm = ellNormal(e, t);
      // lower & outward (lateral), not on top or straight under the jaw
      const lat = Math.abs(nrm[0]);
      if (nrm[1] < 0.1 || lat < 0.55) continue;
      cand.push({ pt, nrm, t });
    }
    // pick 2 evenly spaced
    if (cand.length >= 4) {
      const picks = [Math.floor(cand.length * 0.3), Math.floor(cand.length * 0.7)];
      for (const ix of picks) {
        const { pt, nrm } = cand[ix];
        const tan = [-nrm[1], nrm[0]];
        const sgn = tan[1] > 0 ? 1 : -1; // sweep downward
        const bw = 0.04;
        const a = [pt[0] + tan[0] * bw, pt[1] + tan[1] * bw];
        const b = [pt[0] - tan[0] * bw, pt[1] - tan[1] * bw];
        const tip = [pt[0] + nrm[0] * 0.05 * k + tan[0] * 0.045 * sgn, pt[1] + nrm[1] * 0.05 * k + tan[1] * 0.045 * sgn];
        const inner = [pt[0] - nrm[0] * 0.05, pt[1] - nrm[1] * 0.05];
        p.moveTo(a[0], a[1]);
        p.quadraticCurveTo(pt[0] + nrm[0] * 0.035 * k, pt[1] + nrm[1] * 0.035 * k, tip[0], tip[1]);
        p.quadraticCurveTo(pt[0] + nrm[0] * 0.01, pt[1] + nrm[1] * 0.01, b[0], b[1]);
        p.lineTo(inner[0], inner[1]);
        p.closePath();
      }
    }
  }
  return p;
}

function drawEar(ctx, e, st, headPath) {
  const path = earPath(e);
  ctx.save();
  if (headPath) clipOutside(ctx, headPath);
  ctx.lineJoin = 'round';
  ctx.lineWidth = st.lw * 2;
  ctx.strokeStyle = st.line;
  ctx.stroke(path);
  ctx.restore();
  ctx.fillStyle = st.grey;
  ctx.fill(path);
  // inner pink when opening faces viewer
  const f = e.facing;
  if (f > -0.05) {
    const a = smoothstep(-0.05, 0.35, f);
    ctx.save();
    ctx.clip(path);
    const ip = new Path2D();
    const mid = [(e.in1[0] + e.in2[0]) / 2, (e.in1[1] + e.in2[1]) / 2];
    const low = [e.inBase[0], e.inBase[1]];
    smoothTo(ip, [e.in1, e.inTip, e.in2, [lerp(mid[0], low[0], 0.6), lerp(mid[1], low[1], 0.6)]], true);
    ctx.globalAlpha = a;
    ctx.fillStyle = st.pink;
    ctx.fill(ip);
    // ear fur (white wisps from base)
    ctx.globalAlpha = a * 0.85;
    for (let i = 0; i < 3; i++) {
      const s0 = lerp(0.25, 0.75, i / 2);
      const root = [lerp(e.in1[0], e.in2[0], s0), lerp(e.in1[1], e.in2[1], s0)];
      const to = [lerp(root[0], e.inTip[0], 0.55 - i * 0.08), lerp(root[1], e.inTip[1], 0.55 - i * 0.08)];
      brushLine(ctx, [root, [lerp(root[0], to[0], 0.5) + (i - 1) * 0.01, lerp(root[1], to[1], 0.5)], to], st.lw * 1.4, st.white, { taperIn: 0.1, taperOut: 0.6, seed: i + 3 });
    }
    ctx.restore();
    // inner edge line (a thin line inside the front edge)
    ctx.globalAlpha = 1;
  }
}

function drawWhiskers(ctx, g, side, st) {
  const head = g.head, pose = g.pose;
  const wk = clamp(pose.whisk || 0, -1, 1);
  const specs = [
    [[0.43, -0.155, 0.12], [0.3, 0.16, 1], 0.64],
    [[0.425, -0.185, 0.13], [0.24, 0.02, 1], 0.7],
    [[0.415, -0.215, 0.12], [0.2, -0.12, 1], 0.6],
  ];
  const wind = st.whiskerWind || [0, 0];
  specs.forEach(([r, d, L], i) => {
    const root = [r[0], r[1], r[2] * side];
    const dd = norm3([d[0] + wk * 0.45, d[1] + wk * 0.05, d[2] * side]);
    const droop = [0, -0.05 - 0.02 * i, 0];
    const m3 = add3(add3(root, mul3(dd, L * 0.5)), mul3(droop, 0.4));
    const t3 = add3(add3(root, mul3(dd, L)), droop);
    const a = head.proj(root), b = head.proj(m3), c = head.proj(t3);
    const wob = st.whiskerWob ? st.whiskerWob(i + side * 3) : 0;
    const bb = [b[0] + wind[0] * 0.3 + wob * 0.01, b[1] + wind[1] * 0.3];
    const cb = [c[0] + wind[0] + wob * 0.03, c[1] + wind[1] + wob * 0.02];
    brushLine(ctx, [[a[0], a[1]], bb, cb], st.lw * 0.75, st.whisker, { taperIn: 0.05, taperOut: 0.85, minW: 0.1, seed: 11 + i + side });
  });
}

function drawMouth(ctx, g, st) {
  const head = g.head, pose = g.pose;
  const P = (p) => { const q = head.proj(p); return [q[0], q[1]]; };
  const N = HEAD.nose;
  const mo = clamp(pose.mouth || 0, 0, 1);
  const smile = pose.smile || 0;
  // facing of the muzzle front
  const fW = head.vec([1, -0.25, 0]);
  const vis = smoothstep(-0.5, 0.1, fW[2] + 0.55);
  // nose
  const nt = [N[0], N[1] + 0.012, 0];
  const nl = P([N[0] - 0.012, N[1] + 0.022, 0.048]);
  const nr = P([N[0] - 0.012, N[1] + 0.022, -0.048]);
  const nb = P([N[0] + 0.004, N[1] - 0.034, 0]);
  const ntp = P(nt);
  const nose = new Path2D();
  smoothTo(nose, [nl, [(nl[0] + nr[0]) / 2 + (ntp[0] - (nl[0] + nr[0]) / 2) * 0.3, (nl[1] + nr[1]) / 2 - 0.01], nr, nb], true);
  ctx.fillStyle = st.pink;
  ctx.fill(nose);
  ctx.lineWidth = st.lw * 0.9;
  ctx.strokeStyle = css(PAL.pinkDeep);
  ctx.stroke(nose);
  // mouth
  const top = [N[0] + 0.004, N[1] - 0.036, 0];
  const midp = [N[0] - 0.004, N[1] - 0.085 - mo * 0.02, 0];
  if (mo > 0.05) {
    const w = lerp(0.035, 0.085, pose.mouthW || 0);
    const h = 0.03 + mo * lerp(0.06, 0.1, pose.mouthW || 0);
    const cy = N[1] - 0.075 - h * 0.6;
    const pts = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      const yy = Math.sin(a) > 0 ? Math.sin(a) * h * 0.55 : Math.sin(a) * h;
      pts.push(P([N[0] - 0.01 - Math.max(0, -Math.sin(a)) * 0.02, cy + yy, Math.cos(a) * w]));
    }
    const mp = new Path2D();
    smoothTo(mp, pts, true);
    ctx.fillStyle = css(PAL.mouth);
    ctx.fill(mp);
    if (pose.tongue > 0 || mo > 0.3) {
      ctx.save();
      ctx.clip(mp);
      const tp = P([N[0] - 0.01, cy - h * 0.75, 0]);
      ctx.fillStyle = css(PAL.tongue);
      ctx.beginPath();
      ctx.ellipse(tp[0], tp[1], w * 0.9, h * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.lineWidth = st.lw * 1.1;
    ctx.strokeStyle = st.line;
    ctx.stroke(mp);
    brushLine(ctx, [P(top), P([N[0] - 0.002, cy + h * 0.5, 0])], st.lw * 1.1, st.line, { taperIn: 0.2, taperOut: 0.2 });
  } else {
    const arm = (s) => {
      const a = P(midp);
      const b = P([N[0] - 0.02, N[1] - 0.1 + smile * 0.03, 0.035 * s]);
      const c = P([N[0] - 0.05, N[1] - 0.098 + smile * 0.05, 0.062 * s]);
      return [a, b, c];
    };
    ctx.globalAlpha = vis;
    brushLine(ctx, [P(top), P(midp)], st.lw * 1.05, st.line, { taperIn: 0.1, taperOut: 0.1 });
    brushLine(ctx, arm(1), st.lw * 1.05, st.line, { taperIn: 0.05, taperOut: 0.5 });
    brushLine(ctx, arm(-1), st.lw * 1.05, st.line, { taperIn: 0.05, taperOut: 0.5 });
    ctx.globalAlpha = 1;
  }
}

export function drawHead(ctx, g, st) {
  const pose = g.pose;
  const headPath = headUnionPath(g, pose.fluff);
  const ears = [g.earL, g.earR].sort((a, b) => a.depth - b.depth);
  const cz = g.cran.z;
  // ears behind head
  for (const e of ears) if (e.depth < cz - 0.12) drawEar(ctx, e, st, null);
  // far whiskers (the side facing away)
  const farSide = g.head.basis.l[2] >= 0 ? -1 : 1;
  drawWhiskers(ctx, g, farSide, st);
  // head mass
  ctx.lineJoin = 'round';
  ctx.lineWidth = st.lw * 2;
  ctx.strokeStyle = st.line;
  ctx.stroke(headPath);
  ctx.fillStyle = st.grey;
  ctx.fill(headPath);
  // markings
  ctx.save();
  ctx.clip(headPath);
  const face = [];
  for (let lam = -178; lam <= 178; lam += 6) face.push([lam, faceB(Math.abs(lam))]);
  for (let lam = 178; lam >= -178; lam -= 30) face.push([lam, -88]);
  const facePoly = projMark(g.head, g.cran, face, 1.5);
  ctx.fillStyle = st.white;
  const fp = new Path2D();
  smoothTo(fp, facePoly, true);
  ctx.fill(fp);
  // blaze
  const bl = [];
  for (let ph = -40; ph <= 56; ph += 6) bl.push([blazeW(ph), ph]);
  bl.push([0, 60]);
  for (let ph = 56; ph >= -40; ph -= 6) bl.push([-blazeW(ph), ph]);
  const blp = projMark(g.head, g.cran, bl, 1.0);
  const bp = new Path2D();
  smoothTo(bp, blp, true);
  ctx.fill(bp);
  // soft grey transition shade on white under the chin
  // stripes
  const stripe = (pts, w) => {
    const pp = [];
    let minF = 1;
    for (const [lam, phi] of pts) {
      const p = sph(lam * DEG, phi * DEG);
      const f = g.head.vec(sphN(p))[2];
      minF = Math.min(minF, f);
      const q = g.head.proj(p);
      pp.push([q[0], q[1]]);
    }
    if (minF < 0.05) return;
    ctx.globalAlpha = smoothstep(0.05, 0.3, minF);
    brushLine(ctx, pp, w, st.stripe, { taperIn: 0.35, taperOut: 0.6, seed: pts.length });
    ctx.globalAlpha = 1;
  };
  for (const s of [1, -1]) {
    stripe([[11 * s, 44], [12 * s, 32], [13 * s, 22]], 0.05);
    stripe([[22 * s, 47], [24 * s, 36], [27 * s, 27]], 0.045);
    stripe([[34 * s, 44], [37 * s, 34], [41 * s, 27]], 0.04);
    stripe([[50 * s, -3], [66 * s, -8], [84 * s, -6]], 0.045);
    stripe([[54 * s, -15], [70 * s, -21], [88 * s, -21]], 0.04);
    stripe([[6 * s, 62], [9 * s, 74], [12 * s, 86]], 0.035);
  }
  ctx.restore();
  // ears in front
  for (const e of ears) if (e.depth >= cz - 0.12) drawEar(ctx, e, st, headPath);
  // eyes (clip to head)
  ctx.save();
  ctx.clip(headPath);
  const eyes = [g.eyeL, g.eyeR].sort((a, b) => a.z - b.z);
  for (const ef of eyes) drawEye(ctx, ef, pose, st);
  ctx.restore();
  drawMouth(ctx, g, st);
  drawWhiskers(ctx, g, -farSide, st);
  return headPath;
}
