// Post-processing for the finished frame: bloom (threshold + two blur
// radii), crepuscular light rays (radial zoom blur of the bright areas around
// a light source), lens ghosts, and a soft halation. Work is done at 1/4
// resolution; only the final composite touches full-res pixels.
//
// post = {
//   bloom: { threshold 0..1, knee, strength, radius (px @1080p), wide (0..1), tint },
//   rays:  { x, y (0..1 screen, or fn(t) -> [x, y]), strength, length, threshold, tint, samples },
//   flare: { x, y (0..1 or fn), strength, tint },
// }
import { clamp, smoothstep } from '../core/math.js';
import { css, rgb } from '../core/draw.js';

const BUF = {};
function buf(name, w, h) {
  let c = BUF[name];
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (!c || c.width !== w || c.height !== h) {
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    BUF[name] = c;
  }
  return c;
}
export function scratchBuffer(name, w, h) {
  return buf(name, w, h);
}

const val = (v, t) => (typeof v === 'function' ? v(t) : v);

// quarter-res copy of the frame with everything below the threshold removed
function brightPass(src, W, H, th, knee, tint, name = 'bright') {
  const w = Math.round(W / 4), h = Math.round(H / 4);
  const A = buf(name, w, h);
  const a = A.getContext('2d', { willReadFrequently: true });
  a.globalCompositeOperation = 'copy';
  a.imageSmoothingEnabled = true;
  a.imageSmoothingQuality = 'high'; // area-filtered: small highlights must not flicker
  a.drawImage(src, 0, 0, w, h);
  a.globalCompositeOperation = 'source-over';
  const img = a.getImageData(0, 0, w, h);
  const d = img.data;
  const tr = tint ? rgb(tint) : null;
  const inv = 1 / Math.max(1e-3, knee);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const l = (Math.max(r, g, b) * 0.6 + (0.2126 * r + 0.7152 * g + 0.0722 * b) * 0.4) / 255;
    let k = (l - th) * inv;
    if (k <= 0) {
      d[i] = d[i + 1] = d[i + 2] = 0;
      continue;
    }
    if (k > 1) k = 1;
    k = k * k * (3 - 2 * k);
    if (tr) {
      d[i] = (r * k * (tr[0] + 255)) / 510;
      d[i + 1] = (g * k * (tr[1] + 255)) / 510;
      d[i + 2] = (b * k * (tr[2] + 255)) / 510;
    } else {
      d[i] = r * k;
      d[i + 1] = g * k;
      d[i + 2] = b * k;
    }
    d[i + 3] = 255;
  }
  a.putImageData(img, 0, 0);
  return A;
}

function blurInto(name, src, radius) {
  const B = buf(name, src.width, src.height);
  const b = B.getContext('2d');
  b.globalCompositeOperation = 'copy';
  b.filter = `blur(${radius.toFixed(2)}px)`;
  b.drawImage(src, 0, 0);
  b.filter = 'none';
  b.globalCompositeOperation = 'source-over';
  return B;
}

export function bloom(ctx, W, H, o) {
  const k = W / 1920;
  const A = brightPass(ctx.canvas, W, H, o.threshold ?? 0.75, o.knee ?? 0.2, o.tint);
  const r = (o.radius ?? 18) * k / 4;
  const B1 = blurInto('bloom1', A, r * 0.45);
  const B2 = blurInto('bloom2', A, r * 1.6);
  // mix the two radii into one quarter-res image
  const M = buf('bloomMix', A.width, A.height);
  const m = M.getContext('2d');
  m.globalCompositeOperation = 'copy';
  m.globalAlpha = 1;
  m.drawImage(B1, 0, 0);
  m.globalCompositeOperation = 'lighter';
  m.globalAlpha = o.wide ?? 0.8;
  m.drawImage(B2, 0, 0);
  m.globalAlpha = 1;
  m.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(o.strength ?? 0.6, 0, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(M, 0, 0, W, H);
  ctx.restore();
}

export function rays(ctx, W, H, o, t) {
  const pos = val(o.pos, t) || [0.5, 0.2];
  const w = Math.round(W / 4), h = Math.round(H / 4);
  const A = brightPass(ctx.canvas, W, H, o.threshold ?? 0.8, o.knee ?? 0.15, o.tint, 'rayMask');
  // only light near the source casts rays
  {
    const a = A.getContext('2d');
    const rr = (o.radius ?? 0.35) * w;
    const g = a.createRadialGradient(pos[0] * w, pos[1] * h, 0, pos[0] * w, pos[1] * h, rr);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    a.globalCompositeOperation = 'destination-in';
    a.fillStyle = g;
    a.fillRect(0, 0, w, h);
    a.globalCompositeOperation = 'source-over';
  }
  const R = buf('rays', w, h);
  const r = R.getContext('2d');
  r.globalCompositeOperation = 'copy';
  r.drawImage(A, 0, 0);
  r.globalCompositeOperation = 'lighter';
  const cx = pos[0] * w, cy = pos[1] * h;
  const n = o.samples ?? 14;
  const L = o.length ?? 0.45;
  for (let i = 1; i <= n; i++) {
    const s = 1 + (L * i) / n;
    r.globalAlpha = 0.9 * Math.pow(1 - i / (n + 1), 1.4) / (1 + i * 0.08);
    r.drawImage(A, cx - cx * s, cy - cy * s, w * s, h * s);
  }
  r.globalAlpha = 1;
  r.globalCompositeOperation = 'source-over';
  const B = blurInto('raysBlur', R, 1.2 * W / 1920);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(val(o.strength, t) ?? 0.4, 0, 1);
  ctx.drawImage(B, 0, 0, W, H);
  ctx.restore();
}

// lens ghosts along the line from the light through the frame centre
export function flare(ctx, W, H, o, t) {
  const pos = val(o.pos, t);
  if (!pos) return;
  const s = clamp(val(o.strength, t) ?? 0.3, 0, 1);
  if (s <= 0.01) return;
  const k = W / 1920;
  const lx = pos[0] * W, ly = pos[1] * H;
  const cx = W / 2, cy = H / 2;
  const col = o.tint || '#ffd9a8';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  const ghosts = [[0.35, 18, 0.3], [0.62, 40, 0.14], [0.85, 12, 0.35], [1.22, 60, 0.08], [1.5, 24, 0.18]];
  for (const [u, r, a] of ghosts) {
    const x = lx + (cx - lx) * u * 2, y = ly + (cy - ly) * u * 2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * k);
    g.addColorStop(0, css(col, a * s * 0.6));
    g.addColorStop(0.7, css(col, a * s * 0.35));
    g.addColorStop(1, css(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * k, 0, Math.PI * 2);
    ctx.fill();
  }
  // soft anamorphic streak through the light
  const g = ctx.createLinearGradient(lx - W * 0.45, 0, lx + W * 0.45, 0);
  g.addColorStop(0, css(col, 0));
  g.addColorStop(0.5, css(col, 0.22 * s));
  g.addColorStop(1, css(col, 0));
  ctx.fillStyle = g;
  ctx.fillRect(lx - W * 0.45, ly - 3 * k, W * 0.9, 6 * k);
  ctx.restore();
}

export function applyPost(ctx, W, H, post, t) {
  if (!post) return;
  if (post.rays) rays(ctx, W, H, post.rays, t);
  if (post.bloom) bloom(ctx, W, H, post.bloom);
  if (post.flare) flare(ctx, W, H, post.flare, t);
}
