// The postcard prop. Front = drawSeaView('postcard') inside a white border;
// back = stamp box and address lines. Wear 0..1 adds fading, water stains, a
// crease, a torn corner, frayed edges and dirt, step by step.
import { drawSeaView } from './seaview.js';
import { css, mix, smoothTo, makeCanvas } from '../core/draw.js';
import { hash01, rng, clamp, lerp, noise1, smoothstep } from '../core/math.js';

export const CARD = { w: 1.0, h: 0.68 }; // H units (stage)
const cache = new Map();

// outline of the card in unit coords (0..1), with tear + fray by wear
function cardOutline(wear, seed = 7) {
  const pts = [];
  const fray = smoothstep(0.65, 1, wear) * 0.012;
  const tear = smoothstep(0.5, 0.62, wear);
  const edge = (a, b, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t);
      const j = fray ? (hash01(seed * 97 + pts.length * 13) - 0.5) * fray * 2 : 0;
      pts.push([x + (a[1] === b[1] ? 0 : j), y + (a[0] === b[0] ? 0 : j)]);
    }
  };
  // torn top-left corner (a jagged diagonal)
  if (tear > 0) {
    const k = 0.17 * tear;
    pts.push([k * 1.25, 0]);
    edge([k * 1.25, 0], [1, 0], 18);
    edge([1, 0], [1, 1], 12);
    edge([1, 1], [0, 1], 18);
    edge([0, 1], [0, k * 1.6], 12);
    // jagged tear line
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push([lerp(0, k * 1.25, t) + (hash01(seed + i * 5) - 0.5) * 0.02 * tear, lerp(k * 1.6, 0, t) + (hash01(seed + i * 7) - 0.5) * 0.025 * tear]);
    }
  } else {
    edge([0, 0], [1, 0], 18);
    edge([1, 0], [1, 1], 12);
    edge([1, 1], [0, 1], 18);
    edge([0, 1], [0, 0], 12);
  }
  return pts;
}

export function cardArt(wear = 0, px = 320, side = 'front') {
  const wq = Math.round(wear * 20) / 20;
  px = px > 700 ? 1024 : px > 380 ? 512 : px > 190 ? 256 : 128;
  const key = `${side}:${wq}:${px}`;
  let c = cache.get(key);
  if (c) return c;
  const W = px, H = Math.round(px * CARD.h / CARD.w);
  c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const out = cardOutline(wq);
  const path = new Path2D();
  path.moveTo(out[0][0] * W, out[0][1] * H);
  for (const [x, y] of out) path.lineTo(x * W, y * H);
  path.closePath();
  g.save();
  g.clip(path);
  const paper = mix('#fbf8f1', '#e3d8c6', wq * 0.6);
  g.fillStyle = css(paper);
  g.fillRect(0, 0, W, H);
  if (side === 'front') {
    const b = W * 0.045;
    drawSeaView(g, b, b, W - 2 * b, H - 2 * b, { palette: 'postcard' });
    // fading: wash the picture toward the paper color
    g.fillStyle = css(paper, 0.08 + wq * 0.38);
    g.fillRect(b, b, W - 2 * b, H - 2 * b);
  } else {
    g.strokeStyle = css('#9a9185', 0.8);
    g.lineWidth = Math.max(1, W * 0.004);
    g.strokeRect(W * 0.78, H * 0.1, W * 0.14, H * 0.24);
    g.beginPath();
    g.moveTo(W * 0.52, H * 0.12);
    g.lineTo(W * 0.52, H * 0.9);
    for (let i = 0; i < 3; i++) {
      g.moveTo(W * 0.58, H * (0.5 + i * 0.13));
      g.lineTo(W * 0.92, H * (0.5 + i * 0.13));
    }
    g.stroke();
  }
  // water stains (rings) after the storm
  const st = smoothstep(0.25, 0.4, wq);
  if (st > 0) {
    const R = rng(11);
    for (let i = 0; i < 3; i++) {
      const x = W * R.range(0.15, 0.85), y = H * R.range(0.2, 0.8), r = W * R.range(0.07, 0.16);
      const gr = g.createRadialGradient(x, y, r * 0.6, x, y, r);
      gr.addColorStop(0, css('#c9b48f', 0.1 * st));
      gr.addColorStop(0.85, css('#a88f68', 0.28 * st));
      gr.addColorStop(1, css('#a88f68', 0));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  // crease (a fold line with a light and a dark side)
  const cr = smoothstep(0.4, 0.5, wq);
  if (cr > 0) {
    g.lineWidth = Math.max(1, W * 0.006);
    g.strokeStyle = css('#ffffff', 0.45 * cr);
    g.beginPath();
    g.moveTo(W * 0.62, 0);
    g.lineTo(W * 0.5, H);
    g.stroke();
    g.strokeStyle = css('#6f6454', 0.3 * cr);
    g.beginPath();
    g.moveTo(W * 0.62 + W * 0.006, 0);
    g.lineTo(W * 0.5 + W * 0.006, H);
    g.stroke();
  }
  // dirt specks
  const dt = smoothstep(0.5, 0.9, wq);
  if (dt > 0) {
    const R = rng(23);
    for (let i = 0; i < 40 * dt; i++) {
      g.fillStyle = css('#7a6a55', R.range(0.1, 0.35));
      g.beginPath();
      g.arc(W * R(), H * R(), W * R.range(0.002, 0.008), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  // thin edge line for readability
  g.strokeStyle = css('#8c8275', 0.55);
  g.lineWidth = Math.max(1, W * 0.004);
  g.stroke(path);
  cache.set(key, c);
  return c;
}

/**
 * Draw the card in the current transform (units: H). (x, y) = anchor point of
 * the card in stage units, `ax, ay` = anchor inside the card (0..1),
 * `ang` = rotation, `sx` = horizontal foreshortening (negative shows the back),
 * `bend` = paper bend (-1..1), `scale` = size multiplier.
 */
export function drawCard(ctx, x, y, o = {}) {
  const wear = o.wear ?? 0;
  const sx = o.sx ?? 1;
  const side = sx >= 0 ? 'front' : 'back';
  const w = CARD.w * (o.scale ?? 1), h = CARD.h * (o.scale ?? 1);
  const px = o.px || 256;
  const art = cardArt(wear, px, side);
  const ax = o.ax ?? 0.5, ay = o.ay ?? 0.5;
  ctx.save();
  ctx.translate(x, y);
  // lying on the ground: vertical squash + skew (ground seen from slightly above)
  if (o.sy !== undefined && o.sy !== 1) ctx.transform(1, 0, o.skew || 0, o.sy, 0, 0);
  ctx.rotate(o.ang || 0);
  ctx.scale(Math.max(0.04, Math.abs(sx)) * (side === 'back' ? -1 : 1), 1);
  const bend = o.bend || 0;
  if (Math.abs(bend) < 0.02) {
    ctx.drawImage(art, -ax * w, -ay * h, w, h);
  } else {
    // draw in vertical strips with a sinusoidal offset for a paper bend
    const N = 10;
    for (let i = 0; i < N; i++) {
      const u0 = i / N;
      const off = Math.sin(u0 * Math.PI) * bend * h * 0.12;
      ctx.drawImage(art, (u0 * art.width) | 0, 0, Math.ceil(art.width / N) + 1, art.height, -ax * w + u0 * w, -ay * h + off, w / N + 0.01, h);
    }
  }
  ctx.restore();
}
