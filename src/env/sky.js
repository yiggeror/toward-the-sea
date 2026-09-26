// Sky painters (screen space or layer space). Deterministic in t.
import { css, mix, rgb, alphaOf } from '../core/draw.js';
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
// Painterly cumulus: a dome of overlapping puffs with a flat-ish base,
// shaded in passes — soft halo, shadow body, lit body offset toward the light,
// bright crown highlights and an optional warm underside glow.
// spec: { top (lit colour), shade (shadow colour), rim (highlight), glow
//         (underside tint), light: [dx, dy] toward the light, alpha }
export function cloudShape(ctx, x, y, w, h, seed, spec) {
  const a = spec.alpha ?? 1;
  const n = Math.max(6, Math.round((w / h) * 1.7)) + Math.floor(hash01(seed + 9) * 3);
  const puffs = [];
  for (let j = 0; j < n; j++) {
    const u = n === 1 ? 0.5 : j / (n - 1);
    const dome = Math.sin(u * Math.PI);
    const r = h * (0.32 + 0.58 * dome) * (0.8 + 0.4 * hash01(seed + j * 3));
    const px = x + (u - 0.5) * w * 0.84 + (hash01(seed + j * 7) - 0.5) * h * 0.2;
    const py = y - r * 0.55 - dome * h * 0.12 + (hash01(seed + j * 5) - 0.5) * h * 0.15;
    puffs.push([px, py, r]);
    // cauliflower detail on the crown
    if (dome > 0.45 && hash01(seed + j * 11) < 0.7) {
      const r2 = r * (0.45 + 0.2 * hash01(seed + j * 13));
      puffs.push([px + (hash01(seed + j * 17) - 0.5) * r, py - r * 0.62, r2]);
    }
  }
  const L = spec.light || [-0.35, -1];
  const ll = Math.hypot(L[0], L[1]) || 1;
  const lx = L[0] / ll, ly = L[1] / ll;
  const body = (k, dx, dy, grow = 0) => {
    ctx.beginPath();
    for (const [px, py, r] of puffs) {
      const rr = r * k + grow;
      if (rr <= 0) continue;
      ctx.moveTo(px + dx * r + rr, py + dy * r);
      ctx.arc(px + dx * r, py + dy * r, rr, 0, TAU);
    }
    // flat base
    ctx.moveTo(x - w * 0.44 + dx * h, y + dy * h * 0.3);
    ctx.ellipse(x + dx * h * 0.3, y + dy * h * 0.3, w * 0.46 * k, h * 0.22 * k, 0, 0, TAU);
  };
  const fill = (col, alpha) => {
    ctx.fillStyle = css(col, alpha * a * alphaOf(col));
    ctx.fill();
  };
  const top = spec.top || '#ffffff';
  const shade = spec.shade || css(mix(top, '#8890a8', 0.35), alphaOf(top));
  // soft halo
  body(1.08, 0, 0);
  fill(shade, 0.22);
  // shadow body
  body(1.0, 0, 0);
  fill(shade, 1);
  // lit body, shifted toward the light
  ctx.save();
  body(1.0, 0, 0);
  ctx.clip();
  body(0.9, lx * 0.14, ly * 0.14);
  fill(top, 1);
  // crown highlights
  body(0.62, lx * 0.3, ly * 0.3);
  fill(spec.rim || css(mix(top, '#ffffff', 0.6), alphaOf(top)), 0.55);
  // warm underside glow (sunrise / city light)
  if (spec.glow) {
    const g = ctx.createLinearGradient(0, y - h * 0.3, 0, y + h * 0.3);
    g.addColorStop(0, css(spec.glow, 0));
    g.addColorStop(1, css(spec.glow, 0.55 * a));
    ctx.fillStyle = g;
    ctx.fillRect(x - w, y - h * 0.3, w * 2, h * 0.7);
  }
  ctx.restore();
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

// high wispy cirrus: long thin feathered strokes across the sky (screen space)
export function cirrus(ctx, W, H, t, o = {}) {
  const n = o.n ?? 7;
  const seed = o.seed ?? 5;
  const col = o.color || '#ffffff';
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const h = (q) => hash01(seed * 53 + i * 29 + q);
    const y = H * ((o.y0 ?? 0.05) + h(1) * ((o.y1 ?? 0.35) - (o.y0 ?? 0.05)));
    const x = ((h(2) * 1.6 - 0.3 + t * (o.speed ?? 0.00015)) % 1.6) * W - W * 0.2;
    const len = W * (0.25 + 0.35 * h(3));
    const bend = (h(4) - 0.5) * H * 0.08;
    const strands = 5 + Math.floor(h(5) * 5);
    for (let k = 0; k < strands; k++) {
      const off = (k - strands / 2) * H * 0.006;
      const a = (o.alpha ?? 0.35) * (0.4 + 0.6 * h(10 + k));
      const g = ctx.createLinearGradient(x, 0, x + len, 0);
      g.addColorStop(0, css(col, 0));
      g.addColorStop(0.3 + 0.2 * h(20 + k), css(col, a));
      g.addColorStop(1, css(col, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = (1 + 3 * h(30 + k)) * (W / 1920);
      ctx.beginPath();
      ctx.moveTo(x + k * W * 0.01, y + off);
      ctx.quadraticCurveTo(x + len * 0.5, y + off + bend, x + len, y + off - bend * 0.3 + k * H * 0.004);
      ctx.stroke();
    }
  }
  ctx.restore();
}
