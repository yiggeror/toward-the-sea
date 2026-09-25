// Ground / ridge / hill painters in layer units.
import { css, mix, smoothTo } from '../core/draw.js';
import { fbm1, noise1, hash01, clamp, lerp, smoothstep } from '../core/math.js';

// A height profile: y(x) = base + amp * fbm(x * freq)  (y-down: smaller = higher)
export function profile({ base = 0, amp = 1, freq = 0.1, oct = 4, seed = 1, peaks = 0 }) {
  return (x) => {
    let y = base - amp * (0.5 + 0.5 * fbm1(x * freq, oct, seed));
    if (peaks) y -= peaks * Math.pow(Math.max(0, fbm1(x * freq * 0.5, 2, seed + 7)), 2) * amp;
    return y;
  };
}

// fill the area below a profile across the visible range
export function fillBelow(ctx, view, p, fn, color, bottom = 60, step = 0.25) {
  const [x0, x1] = view.xRange(p, 0.15);
  const st = Math.max(step, (x1 - x0) / 400);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  for (let x = x0; x <= x1 + st; x += st) ctx.lineTo(x, fn(x));
  ctx.lineTo(x1 + st, bottom);
  ctx.closePath();
  ctx.fill();
}

// stroke along a profile (a ridge line / grass top line)
export function strokeProfile(ctx, view, p, fn, color, width, step = 0.25) {
  const [x0, x1] = view.xRange(p, 0.15);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = x0; x <= x1 + step; x += step) {
    if (x === x0) ctx.moveTo(x, fn(x));
    else ctx.lineTo(x, fn(x));
  }
  ctx.stroke();
}

// snowy mountain range: silhouette + snow caps + shaded side planes
export function mountains(ctx, view, p, spec) {
  const [x0, x1] = view.xRange(p, 0.3);
  const period = spec.period || 18;
  const k0 = Math.floor(x0 / period) - 1, k1 = Math.ceil(x1 / period) + 1;
  for (let k = k0; k <= k1; k++) {
    const s = spec.seed * 131 + k * 7;
    const cx = k * period + (hash01(s) - 0.5) * period * 0.6;
    const h = spec.h * (0.6 + 0.6 * hash01(s + 1));
    const w = spec.w * (0.7 + 0.6 * hash01(s + 2));
    const base = spec.base;
    const peak = [cx + (hash01(s + 3) - 0.5) * w * 0.3, base - h];
    const L = [cx - w, base], R = [cx + w, base];
    // body
    ctx.fillStyle = spec.color;
    ctx.beginPath();
    ctx.moveTo(L[0], L[1]);
    const jag = (a, b, n, amp) => {
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t);
        ctx.lineTo(x + (hash01(s + i * 11) - 0.5) * amp, y + (hash01(s + i * 13) - 0.5) * amp);
      }
      ctx.lineTo(b[0], b[1]);
    };
    jag(L, peak, 5, h * 0.06);
    jag(peak, R, 5, h * 0.06);
    ctx.closePath();
    ctx.fill();
    // shaded right plane
    if (spec.shade) {
      ctx.fillStyle = spec.shade;
      ctx.beginPath();
      ctx.moveTo(peak[0], peak[1]);
      ctx.lineTo(R[0], R[1]);
      ctx.lineTo(peak[0] + w * 0.15, base);
      ctx.closePath();
      ctx.fill();
    }
    // snow cap
    if (spec.snow) {
      const sl = spec.snowLine ?? 0.45;
      const yS = peak[1] + h * sl;
      const lx = lerp(peak[0], L[0], sl), rx = lerp(peak[0], R[0], sl);
      ctx.fillStyle = spec.snow;
      ctx.beginPath();
      ctx.moveTo(peak[0], peak[1]);
      ctx.lineTo(rx, yS);
      const n = 6;
      for (let i = n - 1; i >= 1; i--) {
        const x = lerp(lx, rx, i / n);
        ctx.lineTo(x, yS - h * (0.05 + 0.12 * hash01(s + i * 5)) * (i % 2 ? 1 : 0.3));
      }
      ctx.lineTo(lx, yS);
      ctx.closePath();
      ctx.fill();
      if (spec.snowShade) {
        ctx.fillStyle = spec.snowShade;
        ctx.beginPath();
        ctx.moveTo(peak[0], peak[1]);
        ctx.lineTo(rx, yS);
        ctx.lineTo(peak[0] + w * 0.08, yS - h * 0.05);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

// soft haze band (aerial perspective) in screen space
export function haze(ctx, W, H, y0, y1, color, a0, a1) {
  const g = ctx.createLinearGradient(0, H * y0, 0, H * y1);
  g.addColorStop(0, css(color, a0));
  g.addColorStop(1, css(color, a1));
  ctx.fillStyle = g;
  ctx.fillRect(0, H * y0, W, H * (y1 - y0));
}

/**
 * Perspective ground plane drawn in screen space. bands: [[d0, d1, color], ...]
 * (depths, near < far), lines: [[depth, color, width(H)], ...]. Everything is
 * at world height y (default 0).
 */
export function groundPlane(ctx, view, spec) {
  const y = spec.y || 0;
  const Y = (d) => view.oy + (y - view.cam.y) * view.scaleAt(view.pOf(d));
  const W = view.W, H = view.H;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const [d0, d1, col] of spec.bands) {
    const ya = Math.min(H + 2, Y(d0)), yb = Math.max(-2, Y(d1));
    if (ya <= yb) continue;
    if (Array.isArray(col)) {
      const g = ctx.createLinearGradient(0, yb, 0, ya);
      g.addColorStop(0, col[1]);
      g.addColorStop(1, col[0]);
      ctx.fillStyle = g;
    } else ctx.fillStyle = col;
    ctx.fillRect(0, yb, W, ya - yb + 1);
  }
  for (const [d, col, w] of spec.lines || []) {
    const yy = Y(d);
    if (yy < -5 || yy > H + 5) continue;
    ctx.fillStyle = col;
    ctx.fillRect(0, yy, W, Math.max(1, (w || 0.1) * view.scaleAt(view.pOf(d))));
  }
  ctx.restore();
  return Y;
}
// place a flat ellipse (puddle, shadow, footprint) on the ground at (x, depth)
export function groundEllipse(ctx, view, x, depth, rx, rz, fill, y = 0) {
  const p = view.pOf(depth);
  const sc = view.scaleAt(p);
  const X = view.ox + (x - view.cam.x) * sc, Yy = view.oy + (y - view.cam.y) * sc;
  // apparent depth squash: difference in Y across +-rz depth
  const y1 = view.oy + (y - view.cam.y) * view.scaleAt(view.pOf(depth - rz));
  const y2 = view.oy + (y - view.cam.y) * view.scaleAt(view.pOf(depth + rz));
  const ry = Math.max(0.5, Math.abs(y1 - y2) / 2);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(X, (y1 + y2) / 2, rx * sc, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return { X, Y: (y1 + y2) / 2, rx: rx * sc, ry };
}
