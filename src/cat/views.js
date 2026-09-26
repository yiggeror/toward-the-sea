// Front / back sitting views and head-only portraits. These share the 3D head
// with the side rig; the body is drawn as front/back specific shapes driven by
// a small parameter set (breath, lean, paw lift, tail curl, head angles).
import { PAL } from './model.js';
import { headBasis } from './rig.js';
import { buildHead, drawHead } from './head.js';
import { makeStyle } from './cat.js';
import { M } from './model.js';
import { add3, mul3, lerp, clamp, TAU, rot, noise1, smoothstep } from '../core/math.js';
import { drawCard } from '../film/postcard.js';
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
  drawHead(ctx, buildHead(g), st, { under: bp });
  ctx.restore();
  return viewAnchor(g, opts);
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
  drawHead(ctx, buildHead(g), st, { under: bp });
  backHeadMarks(ctx, g, st);
  ctx.restore();
  return viewAnchor(g, opts);
}
// the back of the head: a darker cap between the ears, soft bands
function backHeadMarks(ctx, g, st) {
  const f = g.head.vec([1, 0, 0]);
  if (f[2] > -0.3) return; // only when the head faces away
  const k = Math.min(1, (-f[2] - 0.3) / 0.4);
  const c = g.head.proj([-0.25, 0.32, 0]);
  ctx.save();
  ctx.globalAlpha *= 0.55 * k;
  cloud(ctx, c[0], c[1], 0.2, 0.11, 3, st.stripe);
  const c2 = g.head.proj([-0.35, 0.1, 0]);
  cloud(ctx, c2[0], c2[1], 0.26, 0.07, 5, st.stripe);
  ctx.restore();
}

// fill defaults for face fields
export function fullFace(p) {
  return Object.assign({
    eye: 1, eyeWide: 0, pupil: 0.45, lookX: 0, lookY: 0, lid: 0, lidTilt: 0, happy: 0, mouth: 0, mouthW: 0, smile: 0, tongue: 0,
    whisk: 0, fluff: 0, earRot: 0.1, earFlat: 0, earLR: 0, earRR: 0,
    wink: 0, sparkle: 0, tear: 0, squeeze: 0, sad: 0, blush: 0, wobble: 0, puff: 0, whiskDroop: 0, cross: 0, reflect: 0,
  }, p);
}

/** Head-and-shoulders portrait (expression sheets & close-ups). */
export function drawPortrait(ctx, p, opts) {
  const s = opts.scale;
  const st = makeStyle(s, opts);
  ctx.save();
  ctx.translate(opts.x, opts.y);
  ctx.scale(s, s);
  const low = p.low || 0;
  const br = 1 + 0.018 * (p.breath || 0);
  const hc = [0, -0.15 + low - 0.012 * (p.breath || 0)];
  let bp = null;
  if (!p.noBody) {
    // neck rising into the head, sloping shoulders, white bib
    const sh = (p.shrug || 0) * 0.12;
    const body = [
      [-0.3, 0.1 + low], [-0.36, 0.3 + low * 0.6], [-0.54 * br, 0.52 - sh], [-0.7 * br, 0.8 - sh], [-0.8 * br, 1.2], [-0.84 * br, 1.8],
      [0.84 * br, 1.8], [0.8 * br, 1.2], [0.7 * br, 0.8 - sh], [0.54 * br, 0.52 - sh], [0.36, 0.3 + low * 0.6], [0.3, 0.1 + low],
    ];
    bp = new Path2D();
    smoothTo(bp, body, true);
    ctx.lineJoin = 'round';
    ctx.lineWidth = st.lw * 2; ctx.strokeStyle = st.line; ctx.stroke(bp);
    ctx.fillStyle = st.grey; ctx.fill(bp);
    ctx.save(); ctx.clip(bp);
    // bib: white from the chin down the chest
    const bib = new Path2D();
    smoothTo(bib, [[-0.3, 0.08 + low], [-0.38, 0.45], [-0.4, 0.9], [-0.26, 1.4], [0, 1.6], [0.26, 1.4], [0.4, 0.9], [0.38, 0.45], [0.3, 0.08 + low]], true);
    ctx.fillStyle = st.white; ctx.fill(bib);
    // soft shade the head casts on the chest
    if (st.shade) {
      ctx.save();
      ctx.translate(0, 0.44 + low);
      ctx.scale(1, 0.45);
      const g = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 0.42);
      g.addColorStop(0, css('#5d566a', 0.16));
      g.addColorStop(1, css('#5d566a', 0));
      ctx.fillStyle = g;
      ctx.fillRect(-0.6, -0.6, 1.2, 1.2);
      ctx.restore();
    }
    ctx.restore();
  }
  const g = headFrame(hc, Math.PI / 2 + (p.hYaw || 0), p.hPitch || 0, p.hRoll || 0, fullFace(p));
  drawHead(ctx, buildHead(g), st, { under: bp });
  ctx.restore();
  return viewAnchor(g, opts);
}

// screen anchor for emotion marks around a view's head (see fx/emote.js)
export function viewAnchor(g, opts) {
  const s = opts.scale;
  const P = (hp) => {
    const q = g.head.proj(hp);
    return [opts.x + s * q[0], opts.y + s * q[1]];
  };
  const fx = g.head.vec([1, 0, 0])[0];
  return { P, u: s * 0.36, facing: Math.abs(fx) < 0.15 ? 1 : Math.sign(fx) };
}

// Expression presets (simplified model sheet 表情参考 + film needs)
export const EXPRESSIONS = [
  { id: 'normal', zh: '普通', p: { hYaw: -0.1 } },
  { id: 'happy', zh: '开心', p: { hYaw: -0.15, happy: 1, eye: 0, smile: 0.9, mouth: 0.3, mouthW: 0.6, blush: 0.45 } },
  { id: 'joy', zh: '惊喜', p: { hYaw: -0.25, hPitch: 0.12, eyeWide: 0.35, sparkle: 1, mouth: 0.75, mouthW: 0.55, smile: 0.7, tongue: 1, earRot: -0.1, blush: 0.4 } },
  { id: 'curious', zh: '好奇', p: { hYaw: 0.2, hRoll: -0.36, eyeWide: 0.2, earLR: 0.25, lookX: 0.3, lookY: 0.2 } },
  { id: 'blink', zh: '眨眼', p: { hYaw: -0.05, wink: 1, smile: 0.6, hRoll: 0.1 } },
  { id: 'content', zh: '满足', p: { hYaw: 0.05, happy: 1, eye: 0, smile: 0.4, blush: 0.35 } },
  { id: 'sulky', zh: '委屈', p: { hYaw: 0, hPitch: -0.12, sad: 1, tear: 0.55, smile: -0.7, wobble: 0.5, earRot: 0.5, earFlat: 0.35, whiskDroop: 0.6, lookY: -0.2 } },
  { id: 'smile', zh: '治愈的微笑', p: { hYaw: -0.2, hRoll: 0.14, happy: 1, eye: 0, smile: 1, mouth: 0.14, mouthW: 0.7, blush: 0.7 } },
  { id: 'surprised', zh: '惊讶', p: { hYaw: 0, eyeWide: 1, pupil: 0.9, mouth: 0.5, mouthW: 0, earRot: -0.2 } },
  { id: 'squeeze', zh: '眯眼', p: { hYaw: 0.1, squeeze: 1, earRot: 0.6, earFlat: 0.45, mouth: 0.25, mouthW: 0.35, whisk: -0.6 } },
  { id: 'moved', zh: '感动', p: { hYaw: -0.15, hPitch: 0.1, tear: 1, sparkle: 0.7, smile: 0.5, blush: 0.6, earRot: 0.2 } },
  { id: 'angry', zh: '生气', p: { hYaw: 0, hPitch: -0.1, lid: 0.45, lidTilt: 1, earRot: 0.8, earFlat: 0.55, smile: -0.4 } },
  { id: 'timid', zh: '胆小', p: { hYaw: 0, hPitch: -0.22, pupil: 1, eyeWide: 0.35, sad: 0.6, earRot: 0.9, earFlat: 0.95, lookY: 0.55, low: 0.2, wobble: 0.8 } },
  { id: 'cold', zh: '好冷', p: { hYaw: -0.1, hPitch: -0.12, lid: 0.35, sad: 0.3, wobble: 1, blush: 0.65, earRot: 0.55, earFlat: 0.4, fluff: 1, whiskDroop: 0.3 } },
  { id: 'tired', zh: '累了', p: { hYaw: -0.2, hPitch: -0.15, lid: 0.55, sad: 0.35, mouth: 0.35, mouthW: 0.3, tongue: 1, whiskDroop: 0.7, earRot: 0.55, earFlat: 0.25 } },
  { id: 'sleepy', zh: '困倦', p: { hYaw: -0.15, hPitch: -0.2, hRoll: 0.18, eye: 0, earRot: 0.45, earFlat: 0.15, low: 0.12 } },
  { id: 'determined', zh: '坚定', p: { hYaw: -0.3, hPitch: 0.05, lid: 0.22, lidTilt: 0.6, eyeWide: 0.1, earRot: -0.1, smile: -0.1 } },
  { id: 'wonder', zh: '憧憬', p: { hYaw: -0.2, hPitch: 0.2, sparkle: 1, eyeWide: 0.3, mouth: 0.12, mouthW: 0, blush: 0.35, earRot: -0.12, lookY: 0.4 } },
];

// ---- walking toward / away from the camera ---------------------------------
// Leg state in a gait cycle: lift (0..1 during swing) and reach (1 = paw
// furthest forward). off = the leg's phase offset, sw = swing fraction.
function legCycle(ph, off, sw) {
  const u = (((ph - off) % 1) + 1) % 1;
  if (u < sw) {
    const k = u / sw;
    return { lift: Math.sin(Math.PI * k), reach: k * k * (3 - 2 * k), swing: true };
  }
  const k = (u - sw) / (1 - sw);
  return { lift: 0, reach: 1 - k, swing: false };
}
const OFFS = {
  walk: { lf: 0, rf: 0.5, lh: 0.75, rh: 0.25, sw: 0.4, bob: 0.03 },
  trot: { lf: 0, rf: 0.5, lh: 0.5, rh: 0, sw: 0.45, bob: 0.055 },
  run: { lf: 0, rf: 0.12, lh: 0.55, rh: 0.45, sw: 0.5, bob: 0.1 },
};
// a leg as a soft column from a hip/shoulder point to the paw
function legColumn(ctx, st, top, paw, w0, w1, fill) {
  const dx = paw[0] - top[0], dy = paw[1] - top[1], l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  const pts = [
    [top[0] + nx * w0, top[1] + ny * w0],
    [lerp(top[0], paw[0], 0.55) + nx * lerp(w0, w1, 0.6), lerp(top[1], paw[1], 0.55) + ny * lerp(w0, w1, 0.6)],
    [paw[0] + nx * w1, paw[1] + ny * w1],
    [paw[0] - nx * w1, paw[1] - ny * w1],
    [lerp(top[0], paw[0], 0.55) - nx * lerp(w0, w1, 0.6), lerp(top[1], paw[1], 0.55) - ny * lerp(w0, w1, 0.6)],
    [top[0] - nx * w0, top[1] - ny * w0],
  ];
  return fillOutlined(ctx, pts, st, fill);
}
// the underside of a lifted paw: pink pads (seen when a paw flips up)
function padsUp(ctx, st, cx, cy, w, h, k) {
  roundPaw(ctx, st, cx, cy, w, h, false);
  ctx.fillStyle = st.pinkPad;
  ctx.globalAlpha *= clamp(k, 0, 1);
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.15, w * 0.42, h * 0.38, 0, 0, TAU);
  ctx.fill();
  for (const [dx, dy] of [[-0.6, -0.55], [-0.2, -0.8], [0.2, -0.8], [0.6, -0.55]]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx * w, cy + dy * h, w * 0.17, h * 0.2, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha /= clamp(k, 0.001, 1);
}

/**
 * Walking/trotting toward the camera. (opts.x, opts.y) = the ground point
 * under the chest. p: { phase (gait cycle, any real), gait: walk|trot|run,
 * stride 0..1 (0 = standing), crouch, hYaw, hPitch, hRoll, tail, tailSway,
 * card: {wear} (in the mouth), face fields... }
 */
export function drawCatWalkFront(ctx, p, opts) {
  const s = opts.scale;
  const st = makeStyle(s, opts);
  ctx.save();
  ctx.translate(opts.x, opts.y);
  ctx.scale(s, s);
  const G = OFFS[p.gait || 'walk'];
  const A = clamp(p.stride ?? 1, 0, 1.4);
  const ph = p.phase || 0;
  const bob = -G.bob * A * (0.5 - 0.5 * Math.cos(ph * TAU * 2)) + (p.crouch || 0) * 0.34;
  const sway = 0.03 * A * Math.sin(ph * TAU);
  const L = (off) => legCycle(ph, off, G.sw);
  const lf = L(G.lf), rf = L(G.rf), lh = L(G.lh), rh = L(G.rh);
  const lift = (c, k) => c.lift * A * k;
  // tail behind, rising above the back on the cat's left, swaying
  const tw = p.tail ?? 0.7;
  const tsw = (p.tailSway ?? 0.5) * Math.sin(ph * TAU + 1);
  const tailPts = tailLine([0.22 + sway, -1.18 + bob], -Math.PI / 2 + 0.12 + tsw * 0.15, (0.9 + tsw * 0.5) * tw, 1.25);
  drawRingedTail(ctx, tailPts, st);
  // hind legs (further away: higher on screen, a little smaller)
  for (const [sgn, c] of [[-1, lh], [1, rh]]) {
    const px = sgn * 0.3 + sway * 0.5, py = -0.1 - lift(c, 0.22) + c.reach * 0.03;
    legColumn(ctx, st, [sgn * 0.33 + sway, -0.72 + bob], [px, py - 0.06], 0.13, 0.09, st.grey);
    roundPaw(ctx, st, px, py - 0.04, 0.11, 0.06, false);
  }
  // body behind the chest: back and haunches
  const back = [
    [-0.5, -1.2], [-0.56, -0.95], [-0.52, -0.62], [-0.4, -0.46], [0, -0.42], [0.4, -0.46], [0.52, -0.62], [0.56, -0.95], [0.5, -1.2], [0.2, -1.42], [-0.2, -1.42],
  ].map(([x, y]) => [x + sway, y + bob]);
  const bp = fillOutlined(ctx, back, st, st.grey);
  ctx.save();
  ctx.clip(bp);
  cloud(ctx, -0.5 + sway, -0.8 + bob, 0.16, 0.24, 3, st.stripe);
  cloud(ctx, 0.52 + sway, -0.78 + bob, 0.15, 0.22, 5, st.stripe);
  cloud(ctx, sway, -0.5 + bob, 0.3, 0.1, 2, st.white);
  ctx.restore();
  // front legs: white columns from under the chest; a lifted paw rises and
  // comes toward the camera (a touch larger)
  for (const [sgn, c] of [[-1, lf], [1, rf]]) {
    const up = lift(c, 0.34);
    const near = c.reach * 0.05 * A;
    const px = sgn * 0.19 + sway * 0.3, py = -up + near;
    const w = 0.12 * (1 + near * 0.8);
    legColumn(ctx, st, [sgn * 0.2 + sway, -0.78 + bob], [px, py - 0.07], 0.12, 0.1, st.white);
    roundPaw(ctx, st, px, py - 0.05, w, 0.075 * (1 + near * 0.6), up < 0.12);
  }
  // chest: white bib with grey shoulders
  const chest = [
    [0, -1.5], [0.3, -1.44], [0.42, -1.22], [0.42, -0.95], [0.34, -0.7], [0.18, -0.58], [0, -0.55], [-0.18, -0.58], [-0.34, -0.7], [-0.42, -0.95], [-0.42, -1.22], [-0.3, -1.44],
  ].map(([x, y]) => [x + sway, y + bob]);
  const cp = fillOutlined(ctx, chest, st, st.white);
  ctx.save();
  ctx.clip(cp);
  for (const sgn of [-1, 1]) cloud(ctx, sgn * 0.46 + sway, -1.24 + bob, 0.18, 0.3, 1 + sgn, st.grey);
  ctx.restore();
  // head (and the postcard gripped in the mouth, turned a little so it reads)
  const hc = [sway * 1.2, -1.66 + bob * 1.1 - (p.crouch || 0) * 0.05];
  const g = headFrame(hc, Math.PI / 2 + (p.hYaw || 0), p.hPitch || 0, p.hRoll || 0, fullFace(p));
  const hd = buildHead(g);
  drawHead(ctx, hd, st, { under: cp });
  if (p.card) {
    const m = g.head.proj([0.44, -0.3, -0.06]);
    drawCard(ctx, m[0], m[1], { ang: 0.42 + (p.cardSwing || 0) * 0.1 + 0.05 * Math.sin(ph * TAU * 2), ax: 0.04, ay: 0.08, sx: p.card.sx ?? 0.42, wear: p.card.wear || 0, scale: 1.05, px: s > 250 ? 512 : 256, bend: p.cardBend || 0 });
  }
  ctx.restore();
  return viewAnchor(g, opts);
}

/** Walking/trotting away from the camera (rump, tail up, pads flashing). */
export function drawCatWalkBack(ctx, p, opts) {
  const s = opts.scale;
  const st = makeStyle(s, opts);
  ctx.save();
  ctx.translate(opts.x, opts.y);
  ctx.scale(s, s);
  const G = OFFS[p.gait || 'walk'];
  const A = clamp(p.stride ?? 1, 0, 1.4);
  const ph = p.phase || 0;
  const bob = -G.bob * A * (0.5 - 0.5 * Math.cos(ph * TAU * 2)) + (p.crouch || 0) * 0.34;
  const sway = 0.035 * A * Math.sin(ph * TAU);
  const L = (off) => legCycle(ph, off, G.sw);
  const lf = L(G.lf), rf = L(G.rf), lh = L(G.lh), rh = L(G.rh);
  // front legs, far: small, between/behind the hind legs
  for (const [sgn, c] of [[-1, lf], [1, rf]]) {
    const up = c.lift * A * 0.16;
    const px = sgn * 0.17 + sway * 0.4, py = -0.16 - up;
    legColumn(ctx, st, [sgn * 0.18 + sway, -0.7 + bob], [px, py - 0.04], 0.09, 0.075, st.white);
    roundPaw(ctx, st, px, py - 0.03, 0.09, 0.05, false);
  }
  // head beyond the back
  const hc = [sway * 1.3, -1.64 + bob * 1.1 - (p.crouch || 0) * 0.08];
  const g = headFrame(hc, -Math.PI / 2 + (p.hYaw || 0), p.hPitch || 0, p.hRoll || 0, fullFace(p), (M.headScale || 1) * 0.86);
  const hd = buildHead(g);
  // back and rump
  const back = [
    [-0.42, -1.36], [-0.54, -1.12], [-0.58, -0.8], [-0.52, -0.45], [-0.3, -0.34], [0, -0.38], [0.3, -0.34], [0.52, -0.45], [0.58, -0.8], [0.54, -1.12], [0.42, -1.36], [0, -1.44],
  ].map(([x, y]) => [x + sway, y + bob]);
  const path = new Path2D();
  smoothTo(path, back, true);
  drawHead(ctx, hd, st, { under: path });
  if (p.card) {
    // a corner of the postcard sticking out beside the head
    const m = g.head.proj([0.44, -0.3, 0.1]);
    drawCard(ctx, m[0], m[1], { ang: -0.2, ax: 0.12, ay: 0.1, sx: -(p.card.sx ?? 0.5), wear: p.card.wear || 0, scale: 1.1, px: 256 });
  }
  const bp = fillOutlined(ctx, back, st, st.grey);
  ctx.save();
  ctx.clip(bp);
  cloud(ctx, -0.05 + sway, -1.25 + bob, 0.3, 0.1, 1, st.stripe);
  cloud(ctx, 0.04 + sway, -0.98 + bob, 0.4, 0.11, 2, st.stripe);
  for (const sgn of [-1, 1]) cloud(ctx, sgn * 0.34 + sway, -0.4 + bob, 0.2, 0.14, 4 + sgn, st.white);
  ctx.restore();
  // hind legs, near: thighs, hocks and white paws; a lifting paw flips its
  // pink pads toward the camera
  const air = clamp(p.air || 0, 0, 1), push = clamp(p.push || 0, 0, 1);
  for (const [sgn, c] of [[-1, lh], [1, rh]]) {
    let up = c.lift * A * 0.3;
    let px = sgn * 0.3 + sway * 0.6, py = -up - c.reach * 0.02 * A;
    // airborne: paws drawn up under the rump; push-off: legs long, paws low
    py = lerp(py, -0.34 + bob, air) + push * 0.12;
    px = lerp(px, sgn * 0.22, air);
    legColumn(ctx, st, [sgn * 0.3 + sway, -0.62 + bob], [px, py - 0.08], 0.15, 0.1, st.grey);
    const pads = Math.max(c.swing ? smoothstep(0.25, 0.6, c.lift * A) : 0, air, push);
    if (pads > 0.05) padsUp(ctx, st, px, py - 0.08, 0.12, 0.09, pads);
    else roundPaw(ctx, st, px, py - 0.05, 0.12, 0.07, false);
  }
  // tail up from the rump, swaying
  const tw = p.tail ?? 0.7;
  const tsw = (p.tailSway ?? 0.5) * Math.sin(ph * TAU + 1);
  drawRingedTail(ctx, tailLine([sway, -0.95 + bob], -Math.PI / 2 + 0.28 + tsw * 0.2, -(1.1 + tsw * 0.5) * tw, 1.5), st);
  ctx.restore();
  return viewAnchor(g, opts);
}
