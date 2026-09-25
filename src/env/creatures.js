// Secondary animals, animated with the same care: flapping cycles with
// asymmetric timing, erratic flight paths, tail wiggles. All stateless in t.
import { css } from '../core/draw.js';
import { hash01, noise1, clamp, lerp, TAU, smoothstep } from '../core/math.js';

// Butterfly flight path: wandering around a guide path with sudden flutters.
export function butterflyPos(t, guide, seed = 1) {
  const [gx, gy] = guide(t);
  const x = gx + noise1(t * 0.035, seed) * 0.9 + noise1(t * 0.11, seed + 3) * 0.25;
  const y = gy + noise1(t * 0.04, seed + 7) * 0.6 + Math.sin(t * 0.55) * 0.08;
  return [x, y];
}
/**
 * Butterfly (side/3-4 view). Wing flap: fast downstroke, slower upstroke,
 * occasional glides. size in H units.
 */
export function butterfly(ctx, x, y, t, o = {}) {
  const size = o.size || 0.34;
  const seed = o.seed || 1;
  const glide = noise1(t * 0.05, seed + 11) > 0.45;
  const cyc = (t * (o.rate || 0.32)) % 1; // ~ 3 frames per flap at 24fps
  let open = glide ? 0.35 + 0.1 * Math.sin(t * 0.3) : cyc < 0.35 ? cyc / 0.35 : 1 - (cyc - 0.35) / 0.65;
  open = clamp(open, 0, 1);
  const dir = o.dir || 1;
  const col = o.color || '#f3e6a0', col2 = o.color2 || '#e0b65a', edge = o.edge || '#5a4a3a';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * size, size);
  ctx.rotate(-0.15 + (o.tilt || 0));
  // far wings (darker), near wings
  const wing = (k, far) => {
    const sy = lerp(0.12, 1, k);
    ctx.save();
    ctx.scale(1, far ? -sy * 0.8 : -sy);
    ctx.fillStyle = far ? css(col2) : css(col);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-0.2, 0.9, 0.7, 1.1, 0.75, 0.55);
    ctx.bezierCurveTo(0.8, 0.25, 0.4, 0.05, 0, 0);
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-0.55, 0.55, -0.1, 0.9, 0.1, 0.62);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 0.05;
    ctx.stroke();
    ctx.restore();
  };
  wing(open, true);
  // body
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.ellipse(0.05, 0.02, 0.36, 0.07, -0.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(0.38, -0.02);
  ctx.quadraticCurveTo(0.55, -0.25, 0.62, -0.32);
  ctx.moveTo(0.38, -0.02);
  ctx.quadraticCurveTo(0.58, -0.18, 0.68, -0.2);
  ctx.stroke();
  wing(open * 0.96, false);
  ctx.restore();
}

// Small fish seen from the side through water (tail wiggle, darting).
export function fish(ctx, x, y, t, o = {}) {
  const L = o.len || 0.55;
  const dir = o.dir || 1;
  const w = Math.sin(t * (o.wig || 0.5)) * 0.35;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.globalAlpha = o.alpha ?? 0.85;
  ctx.fillStyle = o.color || '#5f7f8c';
  ctx.beginPath();
  ctx.moveTo(L * 0.5, 0);
  ctx.quadraticCurveTo(L * 0.2, -L * 0.2, -L * 0.25, -L * 0.05 + w * 0.05);
  ctx.lineTo(-L * 0.5, -L * 0.18 + w * 0.2);
  ctx.lineTo(-L * 0.45, w * 0.1);
  ctx.lineTo(-L * 0.5, L * 0.18 + w * 0.2);
  ctx.lineTo(-L * 0.25, L * 0.05 + w * 0.05);
  ctx.quadraticCurveTo(L * 0.2, L * 0.2, L * 0.5, 0);
  ctx.fill();
  ctx.fillStyle = o.belly || 'rgba(230,240,240,0.5)';
  ctx.beginPath();
  ctx.ellipse(L * 0.12, L * 0.06, L * 0.25, L * 0.05, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * Seagull. Side view; flap cycle with strong downstroke; glide pose.
 * For far birds use gullFar (a simple "m" stroke).
 */
export function gull(ctx, x, y, t, o = {}) {
  const s = o.size || 0.8;
  const dir = o.dir || 1;
  const flap = o.glide ? Math.sin(t * 0.05) * 0.15 : Math.sin(t * (o.rate || 0.35));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * s, s);
  const body = o.body || '#f4f2ee', shade = o.shade || '#c9ccd2', dark = o.dark || '#4a4f57', beak = o.beak || '#e2b04a';
  // far wing
  const wingPath = (k, far) => {
    const up = -k * 0.9;
    ctx.beginPath();
    ctx.moveTo(-0.1, -0.05);
    ctx.quadraticCurveTo(0.1, -0.05 + up * 0.6 - 0.1, -0.2, up * 1.1 - 0.15);
    ctx.quadraticCurveTo(-0.6, up * 1.2 - 0.05, -0.85, up * 1.25 + 0.05);
    ctx.quadraticCurveTo(-0.5, up * 0.5 + 0.05, -0.35, 0.05);
    ctx.closePath();
    ctx.fillStyle = far ? shade : body;
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-0.85, up * 1.25 + 0.05);
    ctx.quadraticCurveTo(-0.7, up * 1.18, -0.6, up * 1.1 + 0.02);
    ctx.lineTo(-0.66, up * 1.15 + 0.12);
    ctx.fill();
  };
  wingPath(flap * 0.9, true);
  // body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.5, 0.14, -0.05, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.42, -0.08, 0.12, 0, TAU);
  ctx.fill();
  ctx.fillStyle = beak;
  ctx.beginPath();
  ctx.moveTo(0.52, -0.08);
  ctx.lineTo(0.7, -0.05);
  ctx.lineTo(0.52, -0.03);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0.46, -0.11, 0.02, 0, TAU);
  ctx.fill();
  // tail
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(-0.45, -0.02);
  ctx.lineTo(-0.7, -0.06);
  ctx.lineTo(-0.68, 0.06);
  ctx.closePath();
  ctx.fill();
  wingPath(flap, false);
  ctx.restore();
}
export function gullFar(ctx, x, y, t, s, color, seed = 1) {
  const f = Math.sin(t * 0.3 + seed) * 0.5 + 0.3;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s, y - f * s * 0.6);
  ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.5 - f * s * 0.3, x, y);
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.5 - f * s * 0.3, x + s, y - f * s * 0.6);
  ctx.stroke();
}

// Soda can (side view, rolling). ang = roll angle.
export function can(ctx, x, y, ang, o = {}) {
  const r = o.r || 0.16, L = o.len || 0.46;
  ctx.save();
  ctx.translate(x, y - r);
  ctx.rotate(o.tip || 0);
  ctx.fillStyle = o.color || '#b8433b';
  ctx.fillRect(-L / 2, -r, L, 2 * r);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const band = ((ang % TAU) + TAU) % TAU / TAU;
  ctx.fillRect(-L / 2, -r + band * 2 * r * 0.8, L, r * 0.25);
  ctx.fillStyle = o.metal || '#c9ccd2';
  ctx.beginPath();
  ctx.ellipse(L / 2, 0, r * 0.25, r, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Tumbleweed: a tangle of arcs rotating as it rolls.
export function tumbleweed(ctx, x, y, r, ang, color) {
  ctx.save();
  ctx.translate(x, y - r);
  ctx.rotate(ang);
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = hash01(i * 7) * TAU, b = a + 1 + hash01(i * 11) * 2.5;
    const rr = r * (0.55 + 0.45 * hash01(i * 13));
    ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    ctx.arc(0, 0, rr, a, b);
  }
  ctx.stroke();
  ctx.restore();
}
