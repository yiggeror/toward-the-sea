// Full-frame grading: tint (multiply), lift (screen), vignette, light leaks,
// flash (lightning), and a subtle paper grain. All deterministic in t.
import { css, rgb } from '../core/draw.js';
import { hash01, clamp } from '../core/math.js';

let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const N = 192;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = 128 + (hash01(i * 7919 + 13) - 0.5) * 60;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/**
 * g: { tint: '#rrggbb', tintAmt, lift: '#rrggbb', liftAmt, vignette (0..1),
 *      vignetteColor, flash (0..1), flashColor, grain (0..1), top/bottom gradient }
 */
export function applyGrade(ctx, W, H, g, t) {
  if (!g) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (g.tint && g.tintAmt > 0) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = clamp(g.tintAmt, 0, 1);
    ctx.fillStyle = g.tint;
    ctx.fillRect(0, 0, W, H);
  }
  if (g.lift && g.liftAmt > 0) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(g.liftAmt, 0, 1);
    ctx.fillStyle = g.lift;
    ctx.fillRect(0, 0, W, H);
  }
  if (g.topGlow) {
    // soft light from the top (sky light) or a colored wash
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, css(g.topGlow, g.topGlowAmt ?? 0.25));
    gr.addColorStop(0.6, css(g.topGlow, 0));
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 1;
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
  }
  if (g.flash > 0) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(g.flash, 0, 1);
    ctx.fillStyle = g.flashColor || '#cfd8ff';
    ctx.fillRect(0, 0, W, H);
  }
  if (g.vignette > 0) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1;
    const r = Math.hypot(W, H) / 2;
    const vg = ctx.createRadialGradient(W / 2, H / 2, r * 0.45, W / 2, H / 2, r * 1.05);
    vg.addColorStop(0, 'rgba(255,255,255,1)');
    vg.addColorStop(1, css(g.vignetteColor || '#3a3440', 1 - clamp(g.vignette, 0, 1) * 0.0));
    ctx.globalAlpha = clamp(g.vignette, 0, 1);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
  if (g.grain > 0) {
    // one grain cell per output pixel at 1080p: scaled (unsmoothed) with the
    // frame so a supersampled render keeps the same grain after filtering
    const tile = grain();
    const k = W / 1920;
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = clamp(g.grain, 0, 1) * 0.35;
    const ox = Math.floor(hash01(Math.floor(t / 2) * 31 + 1) * 192), oy = Math.floor(hash01(Math.floor(t / 2) * 57 + 2) * 192);
    const pat = ctx.createPattern(tile, 'repeat');
    if (k !== 1 && pat.setTransform) pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    ctx.imageSmoothingEnabled = false;
    ctx.translate(-ox * k, -oy * k);
    ctx.fillStyle = pat;
    ctx.fillRect(ox * k, oy * k, W, H);
  }
  ctx.restore();
}
