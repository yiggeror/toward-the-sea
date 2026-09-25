// Front / back sitting views and head-only portraits. These share the 3D head
// with the side rig; the body is drawn as front/back specific shapes driven by
// a small parameter set (breath, lean, paw lift, tail curl, head angles).
import { PAL } from './model.js';
import { headBasis } from './rig.js';
import { buildHead, drawHead } from './head.js';
import { makeStyle } from './cat.js';
import { M } from './model.js';
import { add3, mul3, lerp, clamp, TAU, rot, noise1 } from '../core/math.js';
import { smoothTo, brushLine, css, clipOutside } from '../core/draw.js';

// pseudo skeleton carrying just a head frame at position c (y-down)
export function headFrame(c, yaw, pitch, roll, pose, HS = M.headScale || 1) {
  const hb = headBasis(yaw, pitch, roll);
  const head = { c, basis: hb, depth: 0, s: HS };
  head.proj = (p) => {
    const w = add3(add3(mul3(hb.f, p[0] * HS), mul3(hb.u, p[1] * HS)), mul3(hb.l, p[2] * HS));
    return [c[0] + w[0], c[1] - w[1], w[2]];
  };
  head.vec = (p) => {
    const w = add3(add3(mul3(hb.f, p[0]), mul3(hb.u, p[1])), mul3(hb.l, p[2]));
    return [w[0], -w[1], w[2]];
  };
  return { head, pose };
}

function fillOutlined(ctx, pts, st, fill, closed = true) {
  const p = new Path2D();
  smoothTo(p, pts, closed);
  ctx.lineJoin = 'round';
  ctx.lineWidth = st.lw * 2;
  ctx.strokeStyle = st.line;
  ctx.stroke(p);
  ctx.fillStyle = fill;
  ctx.fill(p);
  return p;
}
function tailPath(pts, w0, w1) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, w = lerp(w0, w1, i / (n - 1)) / 2;
    L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    R.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  const tip = pts[n - 1], pre = pts[n - 2];
  const d = [tip[0] - pre[0], tip[1] - pre[1]], dl = Math.hypot(d[0], d[1]) || 1;
  const tp = [tip[0] + (d[0] / dl) * w1 * 0.5, tip[1] + (d[1] / dl) * w1 * 0.5];
  return { outline: [...L, tp, ...R.reverse()], L, R: R.reverse() };
}
function drawRingedTail(ctx, pts, st) {
  const { outline, L, R } = tailPath(pts, 0.27, 0.3);
  const path = fillOutlined(ctx, outline, st, st.grey);
  ctx.save();
  ctx.clip(path);
  const n = pts.length;
  const ring = (t0, t1, color) => {
    const i0 = Math.max(0, Math.floor(t0 * (n - 1))), i1 = Math.min(n - 1, Math.ceil(t1 * (n - 1)));
    const poly = [];
    for (let i = i0; i <= i1; i++) poly.push(L[i]);
    for (let i = i1; i >= i0; i--) poly.push(R[i]);
    const p = new Path2D();
    smoothTo(p, poly, true);
    ctx.fillStyle = color;
    ctx.fill(p);
  };
  for (const c of [0.4, 0.6, 0.78]) ring(c - 0.06, c + 0.05, st.stripe);
  ring(0.9, 1, st.stripeDark);
  ctx.beginPath();
  ctx.arc(pts[n - 1][0], pts[n - 1][1], 0.16, 0, TAU);
  ctx.fillStyle = st.stripeDark;
  ctx.fill();
  ctx.restore();
}
// tail centreline from a start point: heading angle a0 (rad, y-down), curl k
function tailLine(p0, a0, k, len = 1.9, n = 14, wave = 0) {
  const pts = [p0.slice()];
  let a = a0, p = p0;
  for (let i = 0; i < n; i++) {
    const s = i / n;
    a += (k / n) * (0.6 + 0.8 * s) + wave * Math.sin(s * 5) * 0.05;
    p = [p[0] + Math.cos(a) * (len / n), p[1] + Math.sin(a) * (len / n)];
    pts.push(p);
  }
  return pts;
}

// shared pear-shaped sitting body outline (front/back), H units, y-down
export const SIT_H = 1.62; // chin height of the sitting body (front/back views)
function pearBody(b, lean = 0) {
  const k = SIT_H / 1.26;
  const P = (x, y) => [x * b + lean * -y * 0.12, y * (y < -0.5 ? k : 1 + (k - 1) * (-y / 0.5))];
  return [
    P(0, -1.26), P(0.34, -1.22), P(0.45, -1.0), P(0.55, -0.7), P(0.66, -0.4), P(0.68, -0.16), P(0.52, -0.02),
    P(0, 0.0), P(-0.52, -0.02), P(-0.68, -0.16), P(-0.66, -0.4), P(-0.55, -0.7), P(-0.45, -1.0), P(-0.34, -1.22),
  ];
}
function cloud(ctx, cx, cy, rx, ry, seed, fill) {
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const w = 1 + 0.14 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 5 + seed * 2);
    pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
  }
  const p = new Path2D();
  smoothTo(p, pts, true);
  ctx.fillStyle = fill;
  ctx.fill(p);
}
function roundPaw(ctx, st, cx, cy, w, h, toes = true) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    pts.push([cx + Math.cos(a) * w, cy + Math.sin(a) * (Math.sin(a) < 0 ? h : h * 0.8)]);
  }
  fillOutlined(ctx, pts, st, st.white);
  if (toes) for (const dx of [-0.36, 0.36]) brushLine(ctx, [[cx + dx * w, cy - h * 0.95], [cx + dx * w * 1.05, cy - h * 0.35]], st.lw * 0.9, st.line, { taperIn: 0.1, taperOut: 0.7 });
}

/**
 * Front sitting view. p: { breath, lean, lift (right paw 0..1), tail (wrap 0..1),
 * tailFlick, hYaw (0 = facing viewer), hPitch, hRoll, face fields... }
 */
export function drawCatFront(ctx, p, opts) {
  const s = opts.scale;
  const st = makeStyle(s, opts);
  ctx.save();
  ctx.translate(opts.x, opts.y);
  ctx.scale(s, s);
  const b = 1 + 0.025 * (p.breath || 0);
  // tail peeking behind on the right, curling up
  const tw = p.tail ?? 0.6;
  const tailBack = tailLine([0.42, -0.14], -0.25, -2.4 * tw - (p.tailFlick || 0), 1.45).map(([x, y]) => [x, Math.min(y, -0.12)]);
  drawRingedTail(ctx, tailBack, st);
  // hind paws at the sides
  for (const sgn of [-1, 1]) roundPaw(ctx, st, 0.52 * sgn * b, -0.07, 0.15, 0.078, false);
  const body = pearBody(b, p.lean || 0);
  const bp = fillOutlined(ctx, body, st, st.white);
  ctx.save();
  ctx.clip(bp);
  // grey on shoulders and haunches (soft clouds), like the sheet
  for (const sgn of [-1, 1]) {
    cloud(ctx, 0.6 * sgn * b, -1.22, 0.24, 0.42, 1 + sgn, st.grey);
    cloud(ctx, 0.66 * sgn * b, -0.36, 0.25, 0.34, 4 + sgn, st.grey);
    cloud(ctx, 0.7 * sgn * b, -0.4, 0.12, 0.15, 7 + sgn, st.stripe);
  }
  ctx.restore();
  // front legs: two inner lines + outer contour lines down the chest, round paws
  for (const sgn of [-1, 1]) {
    const lift = sgn > 0 ? clamp(p.lift || 0, 0, 1) : 0;
    const px = 0.17 * sgn, py = -0.07 - lift * 0.3;
    brushLine(ctx, [[px + 0.13 * sgn, -0.95], [px + 0.13 * sgn, -0.5], [px + 0.12 * sgn, py - 0.06]], st.lw * 1.1, st.line, { taperIn: 0.5, taperOut: 0.05 });
    brushLine(ctx, [[px - 0.12 * sgn, -0.8], [px - 0.12 * sgn, -0.4], [px - 0.115 * sgn, py - 0.06]], st.lw * 1.1, st.line, { taperIn: 0.5, taperOut: 0.05 });
    if (lift > 0) {
      ctx.fillStyle = st.white;
      ctx.fillRect(px - 0.11, py - 0.05, 0.22, 0.06 + lift * 0.3);
    }
    roundPaw(ctx, st, px, py, 0.13, 0.08);
  }
  // head
  const g = headFrame([0, -SIT_H - 0.42 - (p.breath || 0) * 0.01], Math.PI / 2 + (p.hYaw || 0), p.hPitch || 0, p.hRoll || 0, fullFace(p));
  drawHead(ctx, buildHead(g), st);
  ctx.restore();
}

/** Back sitting view: grey back with soft darker cloud bands, tail curling on the ground. */
export function drawCatBack(ctx, p, opts) {
  const s = opts.scale;
  const st = makeStyle(s, opts);
  ctx.save();
  ctx.translate(opts.x, opts.y);
  ctx.scale(s, s);
  const b = 1 + 0.025 * (p.breath || 0);
  for (const sgn of [-1, 1]) roundPaw(ctx, st, 0.46 * sgn * b, -0.06, 0.14, 0.07, false);
  const body = pearBody(b);
  const bp = fillOutlined(ctx, body, st, st.grey);
  ctx.save();
  ctx.clip(bp);
  for (const sgn of [-1, 1]) cloud(ctx, 0.6 * sgn * b, -0.12, 0.2, 0.26, 3 + sgn, st.white);
  // darker soft bands across the back
  cloud(ctx, -0.05, -1.28, 0.28, 0.11, 1, st.stripe);
  cloud(ctx, 0.04, -0.95, 0.36, 0.12, 2, st.stripe);
  cloud(ctx, -0.02, -0.6, 0.42, 0.13, 3, st.stripe);
  ctx.restore();
  // tail: from the base, lying on the ground to the right and curling up
  const tw = p.tail ?? 0.6;
  const tpts = tailLine([0.06, -0.12], 0.05, -1.6 * tw - (p.tailFlick || 0), 1.75).map(([x, y]) => [x, Math.min(y, -0.13)]);
  drawRingedTail(ctx, tpts, st);
  const g = headFrame([0, -SIT_H - 0.42], -Math.PI / 2 + (p.hYaw || 0), p.hPitch || 0, p.hRoll || 0, fullFace(p));
  drawHead(ctx, buildHead(g), st);
  ctx.restore();
}

// fill defaults for face fields
export function fullFace(p) {
  return Object.assign({
    eye: 1, eyeWide: 0, pupil: 0.45, lookX: 0, lookY: 0, lid: 0, happy: 0, mouth: 0, mouthW: 0, smile: 0, tongue: 0,
    whisk: 0, fluff: 0, earRot: 0.1, earFlat: 0, earLR: 0, earRR: 0,
  }, p);
}

/** Head-only portrait with a bit of neck/chest (for expression sheets & close-ups). */
export function drawPortrait(ctx, p, opts) {
  const s = opts.scale;
  const st = makeStyle(s, opts);
  ctx.save();
  ctx.translate(opts.x, opts.y);
  ctx.scale(s, s);
  // shoulders/chest blob under the head
  const low = p.low || 0;
  const body = [[-0.62, 0.9], [-0.55, 0.35], [-0.32, 0.08], [0, 0.02], [0.32, 0.08], [0.55, 0.35], [0.62, 0.9]];
  const bp = new Path2D();
  smoothTo(bp, body, false);
  bp.lineTo(0.62, 1.2); bp.lineTo(-0.62, 1.2); bp.closePath();
  if (!p.noBody) {
    ctx.lineWidth = st.lw * 2; ctx.strokeStyle = st.line; ctx.stroke(bp);
    ctx.fillStyle = st.grey; ctx.fill(bp);
    ctx.save(); ctx.clip(bp);
    ctx.fillStyle = st.white; ctx.beginPath(); ctx.ellipse(0, 0.55, 0.36, 0.62, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  const g = headFrame([0, -0.15 + low], Math.PI / 2 + (p.hYaw || 0), p.hPitch || 0, p.hRoll || 0, fullFace(p));
  drawHead(ctx, buildHead(g), st);
  ctx.restore();
}

// Expression presets (simplified model sheet 表情参考 + film needs)
export const EXPRESSIONS = [
  { id: 'normal', zh: '普通', p: { hYaw: -0.1 } },
  { id: 'happy', zh: '开心', p: { hYaw: -0.15, happy: 1, eye: 0, smile: 0.9, mouth: 0.12, mouthW: 0.8 } },
  { id: 'joy', zh: '惊喜', p: { hYaw: -0.25, hPitch: 0.12, eyeWide: 0.45, mouth: 0.75, mouthW: 0.55, tongue: 1, earRot: -0.1 } },
  { id: 'curious', zh: '好奇', p: { hYaw: 0.2, hRoll: -0.42, eyeWide: 0.15, earLR: 0.25, lookX: 0.3, lookY: 0.2 } },
  { id: 'blink', zh: '眨眼', p: { hYaw: -0.05, lid: 1, lidTilt: 0.2 } },
  { id: 'content', zh: '满足', p: { hYaw: 0.05, happy: 1, eye: 0, smile: 0.35 } },
  { id: 'sulky', zh: '委屈', p: { hYaw: 0, lid: 1, lidTilt: -0.8, smile: -0.5, earRot: 0.45, earFlat: 0.25 } },
  { id: 'smile', zh: '治愈的微笑', p: { hYaw: -0.2, hRoll: 0.14, happy: 1, eye: 0, smile: 1, mouth: 0.08, mouthW: 0.8 } },
  { id: 'surprised', zh: '惊讶', p: { hYaw: 0, eyeWide: 1, pupil: 0.9, mouth: 0.5, mouthW: 0, earRot: -0.2 } },
  { id: 'angry', zh: '生气', p: { hYaw: 0, hPitch: -0.1, lid: 1, lidTilt: 1, earRot: 0.8, earFlat: 0.55, smile: -0.4 } },
  { id: 'timid', zh: '胆小', p: { hYaw: 0, hPitch: -0.22, pupil: 1, eyeWide: 0.35, earRot: 0.9, earFlat: 0.95, lookY: 0.55, low: 0.2 } },
  { id: 'sleepy', zh: '困倦', p: { hYaw: -0.15, hPitch: -0.2, hRoll: 0.18, eye: 0, earRot: 0.45, earFlat: 0.15, low: 0.12 } },
];
