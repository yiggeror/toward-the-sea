// Light & atmosphere painters shared by all sequences: glowing sources,
// volumetric cones, light pools, neon, twinkling glints, fog bands, a
// screen-space wet-surface reflection, and floating particles. All are pure
// functions of time.
import { css, rgb, mix } from '../core/draw.js';
import { hash01, noise1, fbm1, clamp, lerp, smoothstep, TAU } from '../core/math.js';
import { scratchBuffer } from '../film/post.js';

// bright core + halo (the bloom pass spreads it further)
export function lampGlow(ctx, x, y, r, color, a = 1, core = 0.18) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(mix(color, '#ffffff', 0.7), a));
  g.addColorStop(core, css(color, 0.75 * a));
  g.addColorStop(core * 2.2, css(color, 0.25 * a));
  g.addColorStop(1, css(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

// soft cone of light from (x, y) spreading down to y2 (in the current transform)
export function lightCone(ctx, x, y, w0, w1, y2, color, a = 0.3) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const g = ctx.createLinearGradient(0, y, 0, y2);
  g.addColorStop(0, css(color, a));
  g.addColorStop(0.6, css(color, a * 0.35));
  g.addColorStop(1, css(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w0 / 2, y);
  ctx.lineTo(x + w0 / 2, y);
  ctx.lineTo(x + w1 / 2, y2);
  ctx.lineTo(x - w1 / 2, y2);
  ctx.closePath();
  ctx.fill();
  // brighter core down the middle
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - w0 * 0.3, y);
  ctx.lineTo(x + w0 * 0.3, y);
  ctx.lineTo(x + w1 * 0.22, y2);
  ctx.lineTo(x - w1 * 0.22, y2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// elliptical pool of light on a surface (screen blend)
export function lightPool(ctx, x, y, rx, ry, color, a = 0.4) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, css(color, a));
  g.addColorStop(0.5, css(color, a * 0.45));
  g.addColorStop(1, css(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

// a neon sign: glowing tube outline and a few glyph strokes (no real text)
export function neonSign(ctx, x, y, w, h, color, t, seed = 1, o = {}) {
  const on = o.flicker ? (hash01(Math.floor((t + seed * 37) / 3) * 13 + seed) > 0.06 ? 1 : 0.25) : 1;
  const k = Math.min(w, h);
  ctx.save();
  // backing board
  if (o.board !== false) {
    ctx.fillStyle = o.board || 'rgba(14,16,28,0.85)';
    ctx.fillRect(x, y, w, h);
  }
  const tube = (path, width, col, alpha) => {
    ctx.strokeStyle = css(col, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  };
  const p = new Path2D();
  const r = k * 0.18;
  p.roundRect ? p.roundRect(x + k * 0.12, y + k * 0.12, w - k * 0.24, h - k * 0.24, r) : p.rect(x + k * 0.12, y + k * 0.12, w - k * 0.24, h - k * 0.24);
  // glyph-like strokes, stacked vertically for tall signs, else in a row
  const vertical = h > w * 1.4;
  const n = vertical ? Math.max(2, Math.round(h / w)) : Math.max(2, Math.round(w / h));
  for (let i = 0; i < n; i++) {
    const cx = vertical ? x + w / 2 : x + (w * (i + 0.5)) / n;
    const cy = vertical ? y + (h * (i + 0.5)) / n : y + h / 2;
    const s = k * 0.26;
    const g = hash01(seed * 31 + i * 7);
    if (g < 0.33) {
      p.moveTo(cx - s, cy - s);
      p.lineTo(cx + s, cy - s);
      p.moveTo(cx, cy - s);
      p.lineTo(cx, cy + s);
      p.moveTo(cx - s, cy + s * 0.2);
      p.lineTo(cx + s, cy + s * 0.2);
    } else if (g < 0.66) {
      p.moveTo(cx + s, cy);
      p.arc(cx, cy, s, 0, TAU);
      p.moveTo(cx - s * 0.5, cy - s * 0.3);
      p.lineTo(cx + s * 0.5, cy + s * 0.3);
    } else {
      p.moveTo(cx - s, cy + s);
      p.lineTo(cx - s * 0.4, cy - s);
      p.lineTo(cx + s * 0.4, cy + s * 0.2);
      p.lineTo(cx + s, cy - s);
    }
  }
  ctx.globalCompositeOperation = 'screen';
  tube(p, k * 0.34, color, 0.16 * on);
  tube(p, k * 0.16, color, 0.45 * on);
  tube(p, k * 0.07, mix(color, '#ffffff', 0.65), 0.95 * on);
  ctx.restore();
  return on;
}

// twinkling star-shaped glints scattered over a region (water / snow / sand)
// region: (x, y, w, h) in current units; size in current units
export function glints(ctx, x, y, w, h, t, o = {}) {
  const n = o.n ?? 40;
  const seed = o.seed ?? 1;
  const col = o.color || '#ffffff';
  ctx.save();
  ctx.globalCompositeOperation = o.mode || 'screen';
  for (let i = 0; i < n; i++) {
    const hx = hash01(seed * 97 + i * 13), hy = hash01(seed * 61 + i * 29);
    const px = x + hx * w, py = y + (o.bias ? Math.pow(hy, o.bias) : hy) * h;
    const ph = hash01(seed + i * 7) * TAU;
    const sp = (o.speed ?? 0.12) * (0.6 + 0.8 * hash01(seed + i * 3));
    let tw = Math.sin(t * sp + ph);
    tw = tw > 0 ? Math.pow(tw, o.sharp ?? 3) : 0;
    if (tw < 0.02) continue;
    const s = (o.size ?? 1) * (0.5 + hash01(seed + i * 11)) * (o.sizeAt ? o.sizeAt(py) : 1) * tw;
    const a = (o.alpha ?? 1) * tw * (o.alphaAt ? o.alphaAt(px, py) : 1);
    if (a < 0.02) continue;
    ctx.fillStyle = css(col, a);
    ctx.beginPath();
    ctx.moveTo(px, py - s);
    ctx.quadraticCurveTo(px, py, px + s * 0.8, py);
    ctx.quadraticCurveTo(px, py, px, py + s);
    ctx.quadraticCurveTo(px, py, px - s * 0.8, py);
    ctx.quadraticCurveTo(px, py, px, py - s);
    ctx.fill();
    ctx.fillStyle = css(col, a * 0.35);
    ctx.beginPath();
    ctx.arc(px, py, s * 0.45, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// horizontal fog band (screen space): soft top and bottom, wavy, drifting
export function fogBand(ctx, W, H, y, h, color, a, t, o = {}) {
  const seed = o.seed ?? 3;
  const drift = (o.speed ?? 0.3) * t;
  const N = 16;
  ctx.save();
  ctx.globalCompositeOperation = o.mode || 'source-over';
  for (let layer = 0; layer < 3; layer++) {
    const yy = y + (layer - 1) * h * 0.22;
    const g = ctx.createLinearGradient(0, yy - h / 2, 0, yy + h / 2);
    g.addColorStop(0, css(color, 0));
    g.addColorStop(0.5, css(color, a * (0.5 + 0.25 * layer)));
    g.addColorStop(1, css(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * W;
      const w = fbm1(i * 0.45 + drift * 0.004 * (1 + layer) + layer * 10, 3, seed + layer) * h * 0.35;
      if (i === 0) ctx.moveTo(x, yy - h / 2 + w);
      else ctx.lineTo(x, yy - h / 2 + w);
    }
    for (let i = N; i >= 0; i--) {
      const x = (i / N) * W;
      const w = fbm1(i * 0.4 + drift * 0.003 * (1 + layer) + layer * 20, 3, seed + layer + 7) * h * 0.35;
      ctx.lineTo(x, yy + h / 2 + w);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Screen-space reflection on a wet surface: mirror what has been drawn so far
 * above screen line y0 into the region below it, smeared vertically (long wet
 * streaks), dimmed with distance, tinted, masked to [y0, y1].
 * Call as a screen layer after the backdrop and the ground are painted.
 */
export function wetReflection(ctx, W, H, y0, o = {}) {
  const src = ctx.canvas;
  const y1 = Math.min(H, o.y1 ?? H);
  const hgt = y1 - y0;
  if (hgt <= 2 || y0 <= 2) return;
  const span = Math.min(y0, hgt / (o.stretch ?? 1.6));
  // strip above the line, squeezed (vertical smear) and blurred
  const sw = Math.max(8, Math.round(W / 4)), sh = Math.max(4, Math.round(span / 8));
  const A = scratchBuffer('reflA', sw, sh);
  const a = A.getContext('2d');
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.globalCompositeOperation = 'copy';
  a.filter = `blur(${(o.blur ?? 1.2).toFixed(2)}px)`;
  a.drawImage(src, 0, y0 - span, W, span, 0, 0, sw, sh);
  a.filter = 'none';
  a.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (o.clipPath) ctx.clip(o.clipPath);
  ctx.beginPath();
  ctx.rect(0, y0, W, hgt);
  ctx.clip();
  // flipped: row just above the line lands just below it
  ctx.globalCompositeOperation = o.mode || 'screen';
  ctx.globalAlpha = o.alpha ?? 0.5;
  ctx.translate(0, y0);
  ctx.scale(1, -1);
  ctx.drawImage(A, 0, -hgt * 1.0, W, hgt);
  ctx.restore();
  // fade out with distance from the line (darken toward the bottom)
  if (o.fade !== false) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (o.clipPath) ctx.clip(o.clipPath);
    ctx.beginPath();
    ctx.rect(0, y0, W, hgt);
    ctx.clip();
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    const fc = o.fadeColor || '#10131f';
    g.addColorStop(0, css(fc, 0));
    g.addColorStop(1, css(fc, o.fadeAmt ?? 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, W, hgt);
    ctx.restore();
  }
}

// floating particles (dust motes in sunbeams, pollen, fireflies, drifting mist
// specks). Screen space; wraps around the frame.
export function particles(ctx, W, H, t, o = {}) {
  const n = o.n ?? 40;
  const seed = o.seed ?? 5;
  const k = W / 1920;
  ctx.save();
  ctx.globalCompositeOperation = o.mode || 'screen';
  for (let i = 0; i < n; i++) {
    const h = (q) => hash01(seed * 131 + i * 17 + q);
    const vx = (o.vx ?? 0.2) * (0.5 + h(1)), vy = (o.vy ?? -0.1) * (0.5 + h(2));
    let x = h(3) * W + t * vx * k * 2 + Math.sin(t * 0.02 * (0.5 + h(4)) + i) * 30 * k * (o.sway ?? 1);
    let y = h(5) * H + t * vy * k * 2 + Math.cos(t * 0.017 * (0.5 + h(6)) + i) * 20 * k * (o.sway ?? 1);
    x = ((x % W) + W) % W;
    y = ((y % H) + H) % H;
    if (o.region && !o.region(x / W, y / H)) continue;
    const r = (o.size ?? 2.5) * k * (0.4 + h(7) * 1.2);
    let a = (o.alpha ?? 0.6) * (0.4 + 0.6 * h(8));
    if (o.twinkle) a *= 0.35 + 0.65 * Math.max(0, Math.sin(t * o.twinkle * (0.6 + h(9)) + h(10) * TAU));
    if (o.alphaAt) a *= o.alphaAt(x / W, y / H);
    if (a < 0.01) continue;
    const col = Array.isArray(o.color) ? o.color[Math.floor(h(11) * o.color.length)] : o.color || '#fff6dc';
    if (o.glow) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * o.glow);
      g.addColorStop(0, css(col, a));
      g.addColorStop(0.25, css(col, a * 0.5));
      g.addColorStop(1, css(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r * o.glow, y - r * o.glow, 2 * r * o.glow, 2 * r * o.glow);
    } else {
      ctx.fillStyle = css(col, a);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// large out-of-focus discs (bokeh) near the lens
export function bokeh(ctx, W, H, t, o = {}) {
  const n = o.n ?? 10;
  const seed = o.seed ?? 9;
  const k = W / 1920;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < n; i++) {
    const h = (q) => hash01(seed * 71 + i * 23 + q);
    const x = (h(1) * 1.2 - 0.1) * W + Math.sin(t * 0.004 + i) * 20 * k + (o.vx ?? 0) * t * k;
    const y = (o.y0 ?? 0) * H + h(2) * ((o.y1 ?? 1) - (o.y0 ?? 0)) * H + Math.cos(t * 0.005 + i) * 12 * k;
    const r = (o.r ?? 60) * k * (0.5 + h(3));
    const col = Array.isArray(o.color) ? o.color[Math.floor(h(4) * o.color.length)] : o.color || '#ffd9a0';
    const a = (o.alpha ?? 0.12) * (0.5 + 0.5 * h(5));
    const xx = ((x % (W * 1.2)) + W * 1.2) % (W * 1.2) - W * 0.1;
    const g = ctx.createRadialGradient(xx, y, r * 0.6, xx, y, r);
    g.addColorStop(0, css(col, a));
    g.addColorStop(0.85, css(col, a * 1.25));
    g.addColorStop(1, css(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(xx, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
