// Sky painters (screen space or layer space). Deterministic in t.
import { css, mix, rgb } from '../core/draw.js';
import { hash01, noise1, fbm1, clamp, lerp, smoothstep, TAU } from '../core/math.js';

// vertical gradient over the whole screen; stops: [[pos, color], ...]
export function skyGradient(ctx, W, H, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [p, c] of stops) g.addColorStop(clamp(p, 0, 1), typeof c === 'string' ? c : css(c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// radial glow (sun / moon / lamp halo) in current transform
export function glow(ctx, x, y, r, color, a = 1, inner = 0) {
  const g = ctx.createRadialGradient(x, y, r * inner, x, y, r);
  g.addColorStop(0, css(color, a));
  g.addColorStop(1, css(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

export function stars(ctx, W, H, n, seed, yMax = 0.6, twinkleT = 0, alpha = 1) {
  for (let i = 0; i < n; i++) {
    const x = hash01(seed + i * 3) * W, y = Math.pow(hash01(seed + i * 5 + 1), 1.4) * H * yMax;
    const b = hash01(seed + i * 7 + 2);
    const tw = 0.7 + 0.3 * Math.sin(twinkleT * (0.05 + 0.1 * b) + i);
    ctx.fillStyle = css('#fffbe8', alpha * (0.3 + 0.7 * b) * tw);
    const r = (0.5 + b * 1.2) * (W / 1920);
    ctx.fillRect(x, y, r * 1.6, r * 1.6);
  }
}

export function moon(ctx, x, y, r, color = '#fdf6df', phase = 0.0) {
  glow(ctx, x, y, r * 6, color, 0.18);
  glow(ctx, x, y, r * 2.2, color, 0.3);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  if (phase > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x + r * phase * 1.3, y - r * 0.2, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Puffy flat clouds. Cloud i is a row of overlapping circles with a shaded
 * base. Positions in layer units; drift = t * speed (units/frame).
 * spec: { y, h, spread (x range), n, seed, speed, top, base, shade, alpha, wrap }
 */
export function clouds(ctx, view, p, t, spec) {
  const [x0, x1] = view.xRange(p, 0.3);
  const period = spec.wrap || 80;
  const n = spec.n || 6;
  for (let i = 0; i < n; i++) {
    const s = spec.seed * 101 + i * 17;
    const baseX = hash01(s) * period + (spec.speed || 0) * t;
    const w = (spec.w || 8) * (0.6 + 0.8 * hash01(s + 1));
    const hgt = (spec.h || 1.2) * (0.6 + 0.7 * hash01(s + 2));
    const y = (spec.y || -10) + (hash01(s + 3) - 0.5) * (spec.dy || 3);
    // wrap into view
    let cx = ((baseX - x0) % period + period) % period + x0;
    for (let k = -1; k <= Math.ceil((x1 - x0) / period); k++) {
      const X = cx + k * period;
      if (X + w < x0 || X - w > x1) continue;
      cloudShape(ctx, X, y, w, hgt, s, spec);
    }
  }
}
export function cloudShape(ctx, x, y, w, h, seed, spec) {
  const puffs = 5 + Math.floor(hash01(seed + 9) * 4);
  const a = spec.alpha ?? 1;
  const draw = (dy, k, col) => {
    ctx.fillStyle = typeof col === 'string' ? col : css(col, a);
    ctx.beginPath();
    for (let j = 0; j < puffs; j++) {
      const u = j / (puffs - 1);
      const px = x + (u - 0.5) * w;
      const r = h * k * (0.55 + 0.7 * Math.sin(u * Math.PI)) * (0.85 + 0.3 * hash01(seed + j * 3));
      const py = y + dy - r * 0.35;
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, TAU);
    }
    ctx.rect(x - w * 0.5, y + dy - h * 0.2, w, h * 0.4);
    ctx.fill();
  };
  if (spec.shade) draw(h * 0.12, 1.0, spec.shade);
  draw(0, 0.94, spec.top || '#ffffff');
  if (spec.rim) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    draw(-h * 0.1, 0.7, spec.rim);
    ctx.restore();
  }
}

// long soft stratus bands (dawn / storm) across the screen
export function bands(ctx, W, H, spec) {
  for (let i = 0; i < spec.n; i++) {
    const y = H * (spec.y0 + (spec.y1 - spec.y0) * (i / Math.max(1, spec.n - 1)));
    const hh = H * spec.h * (0.6 + 0.8 * hash01(spec.seed + i));
    const off = ((spec.t || 0) * (spec.speed || 0) * (1 + 0.3 * i)) % W;
    ctx.fillStyle = typeof spec.color === 'function' ? spec.color(i) : spec.color;
    ctx.beginPath();
    const N = 24;
    for (let k = 0; k <= N; k++) {
      const x = (k / N) * W * 1.4 - W * 0.2 + off - (off > W * 0.2 ? W * 0 : 0);
      const yy = y + fbm1(k * 0.35 + i * 7 + (spec.t || 0) * 0.002, 3, spec.seed + i) * hh * 0.8;
      if (k === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    for (let k = N; k >= 0; k--) {
      const x = (k / N) * W * 1.4 - W * 0.2 + off;
      const yy = y + hh + fbm1(k * 0.3 + i * 11, 3, spec.seed + i + 50) * hh * 0.5;
      ctx.lineTo(x, yy);
    }
    ctx.closePath();
    ctx.fill();
  }
}
