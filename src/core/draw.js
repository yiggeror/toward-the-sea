// Canvas drawing helpers: smooth curves through points, tapered brush strokes,
// "stroke-then-fill" outlines, and colour utilities.
import { clamp, lerp, dist, norm, sub, add, mul, noise1, TAU } from './math.js';

// ---------- colour ----------
const _cc = new Map();
export function rgb(hex) {
  if (Array.isArray(hex)) return hex;
  let c = _cc.get(hex);
  if (c) return c;
  if (hex.startsWith('rgb')) {
    const m = hex.match(/[\d.]+/g).map(Number);
    c = [m[0], m[1], m[2]];
    _cc.set(hex, c);
    return c;
  }
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  _cc.set(hex, c);
  return c;
}
export function css(c, a = 1) {
  c = rgb(c);
  const r = Math.round(clamp(c[0], 0, 255)), g = Math.round(clamp(c[1], 0, 255)), b = Math.round(clamp(c[2], 0, 255));
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(4)})`;
}
// alpha of a colour string ('rgba(...)' -> its alpha, anything else -> 1)
export function alphaOf(c) {
  if (typeof c === 'string' && c.startsWith('rgba')) return +c.match(/[\d.]+/g)[3];
  return 1;
}
export function mix(a, b, t) {
  a = rgb(a); b = rgb(b);
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
export function mulc(a, b) {
  a = rgb(a); b = rgb(b);
  return [(a[0] * b[0]) / 255, (a[1] * b[1]) / 255, (a[2] * b[2]) / 255];
}
export function scalec(a, k) {
  a = rgb(a);
  return [a[0] * k, a[1] * k, a[2] * k];
}
export function screenc(a, b) {
  a = rgb(a); b = rgb(b);
  return [255 - ((255 - a[0]) * (255 - b[0])) / 255, 255 - ((255 - a[1]) * (255 - b[1])) / 255, 255 - ((255 - a[2]) * (255 - b[2])) / 255];
}
export const hex = (c) => '#' + rgb(c).map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

// ---------- smooth curves ----------
// Centripetal Catmull-Rom -> cubic bezier control points for segment p1->p2.
function crCtrl(p0, p1, p2, p3) {
  const d1 = Math.sqrt(dist(p0, p1)) , d2 = Math.sqrt(dist(p1, p2)), d3 = Math.sqrt(dist(p2, p3));
  let b1, b2;
  if (d1 < 1e-6 || d2 < 1e-6) b1 = [p1[0] + (p2[0] - p1[0]) / 3, p1[1] + (p2[1] - p1[1]) / 3];
  else {
    const a2 = d1 * d1, b2s = d2 * d2, k = 2 * a2 + 3 * d1 * d2 + b2s, den = 3 * d1 * (d1 + d2);
    b1 = [(a2 * p2[0] - b2s * p0[0] + k * p1[0]) / den, (a2 * p2[1] - b2s * p0[1] + k * p1[1]) / den];
  }
  if (d3 < 1e-6 || d2 < 1e-6) b2 = [p2[0] + (p1[0] - p2[0]) / 3, p2[1] + (p1[1] - p2[1]) / 3];
  else {
    const c2 = d3 * d3, b2s = d2 * d2, k = 2 * c2 + 3 * d3 * d2 + b2s, den = 3 * d3 * (d3 + d2);
    b2 = [(c2 * p1[0] - b2s * p3[0] + k * p2[0]) / den, (c2 * p1[1] - b2s * p3[1] + k * p2[1]) / den];
  }
  return [b1, b2];
}
function ghost(a, b) {
  // reflected point beyond a (used for open curve ends)
  return [2 * a[0] - b[0], 2 * a[1] - b[1]];
}
// Append a smooth curve through pts to a path (CanvasRenderingContext2D or Path2D).
export function smoothTo(path, pts, closed = false, moveTo = true) {
  const n = pts.length;
  if (n < 2) return path;
  if (moveTo) path.moveTo(pts[0][0], pts[0][1]);
  else path.lineTo(pts[0][0], pts[0][1]);
  if (n === 2 && !closed) {
    path.lineTo(pts[1][0], pts[1][1]);
    return path;
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % n];
    const p0 = closed ? pts[(i - 1 + n) % n] : i === 0 ? ghost(p1, p2) : pts[i - 1];
    const p3 = closed ? pts[(i + 2) % n] : i + 2 >= n ? ghost(p2, p1) : pts[i + 2];
    const [c1, c2] = crCtrl(p0, p1, p2, p3);
    path.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]);
  }
  if (closed) path.closePath();
  return path;
}
export function smoothPath(pts, closed = true) {
  const p = new Path2D();
  smoothTo(p, pts, closed, true);
  return p;
}
// Dense polyline sampling of the same smooth curve (for tapered strokes etc.)
export function smoothPoints(pts, closed = false, per = 6) {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const out = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % n];
    const p0 = closed ? pts[(i - 1 + n) % n] : i === 0 ? ghost(p1, p2) : pts[i - 1];
    const p3 = closed ? pts[(i + 2) % n] : i + 2 >= n ? ghost(p2, p1) : pts[i + 2];
    const [c1, c2] = crCtrl(p0, p1, p2, p3);
    const steps = Math.max(2, Math.ceil(per));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([
        a * p1[0] + b * c1[0] + c * c2[0] + d * p2[0],
        a * p1[1] + b * c1[1] + c * c2[1] + d * p2[1],
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1].slice());
  return out;
}

// ---------- strokes ----------
// Build a filled polygon for a variable-width stroke along pts.
// width(i, t) -> full width at point i (t = normalised arc position 0..1)
export function strokePolygon(pts, width) {
  const n = pts.length;
  if (n < 2) return null;
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + dist(pts[i - 1], pts[i]));
  const total = L[n - 1] || 1;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const t = norm(sub(b, a));
    const nx = -t[1], ny = t[0];
    const w = Math.max(0, width(i, L[i] / total)) * 0.5;
    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  return { left, right };
}
export function fillStroke(ctx, pts, width, color, roundCaps = true) {
  const sp = strokePolygon(pts, width);
  if (!sp) return;
  const { left, right } = sp;
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
  if (roundCaps) {
    const e = pts[pts.length - 1];
    const r = dist(left[left.length - 1], right[right.length - 1]) / 2;
    if (r > 0.3) {
      const a0 = Math.atan2(left[left.length - 1][1] - e[1], left[left.length - 1][0] - e[0]);
      ctx.arc(e[0], e[1], r, a0, a0 - Math.PI, true);
    }
  }
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  if (roundCaps) {
    const s = pts[0];
    const r = dist(left[0], right[0]) / 2;
    if (r > 0.3) {
      const a0 = Math.atan2(right[0][1] - s[1], right[0][0] - s[0]);
      ctx.arc(s[0], s[1], r, a0, a0 - Math.PI, true);
    }
  }
  ctx.closePath();
  if (color) ctx.fillStyle = color;
  ctx.fill();
}
// Tapered line (thin ends, thick middle) through control points, with a
// little hand-drawn width wobble.
export function brushLine(ctx, ctrl, w, color, opts = {}) {
  const pts = opts.dense ? ctrl : smoothPoints(ctrl, false, opts.per || 5);
  const t0 = opts.taperIn ?? 0.25, t1 = opts.taperOut ?? 0.25;
  const minW = opts.minW ?? 0.15;
  const seed = opts.seed ?? 1, wob = opts.wobble ?? 0.12;
  fillStroke(
    ctx,
    pts,
    (i, t) => {
      let k = 1;
      if (t0 > 0 && t < t0) k = minW + (1 - minW) * Math.sin(((t / t0) * Math.PI) / 2);
      if (t1 > 0 && t > 1 - t1) k = Math.min(k, minW + (1 - minW) * Math.sin((((1 - t) / t1) * Math.PI) / 2));
      return w * k * (1 + wob * noise1(t * 6, seed));
    },
    color,
    opts.caps ?? true
  );
}

// ---------- shapes ----------
export function ellipsePath(path, cx, cy, rx, ry, rot = 0) {
  path.moveTo(cx + Math.cos(rot) * rx, cy + Math.sin(rot) * rx);
  path.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  return path;
}
export function polyPath(path, pts, closed = true) {
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
  if (closed) path.closePath();
  return path;
}
// "Stroke then fill" outline: draws a union shape with an outer contour only.
export function outlined(ctx, path, fill, line, lw) {
  if (lw > 0 && line) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = lw * 2;
    ctx.strokeStyle = line;
    ctx.stroke(path);
  }
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(path);
  }
}
// clip to the outside of a path (evenodd with a huge rect)
export function clipOutside(ctx, path, R = 1e5) {
  const p = new Path2D();
  p.rect(-R, -R, 2 * R, 2 * R);
  p.addPath(path);
  ctx.clip(p, 'evenodd');
}

// offscreen canvas factory (works in browsers and in workers)
export function makeCanvas(w, h) {
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
