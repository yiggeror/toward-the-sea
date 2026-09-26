// Rim light for anything that can draw its own flat silhouette: render the
// silhouette into a scratch buffer, subtract a copy shifted toward the light,
// colour what is left (a thin crescent on the lit edge) and add it on top.
import { scratchBuffer } from '../film/post.js';

/**
 * ctx: target; box: [x0, y0, x1, y1] screen px that contains the drawing;
 * drawFlat(g, dx, dy): draw the silhouette into g translated by (dx, dy);
 * rim: { dir: [x, y] (unit, toward the light... the lit edge side), width px, color, alpha, mode }
 */
export function rimLight(ctx, box, drawFlat, rim) {
  if (!rim || (rim.alpha ?? 1) <= 0.01) return;
  const CW = ctx.canvas.width, CH = ctx.canvas.height;
  const x0 = Math.max(0, Math.floor(box[0])), y0 = Math.max(0, Math.floor(box[1]));
  const x1 = Math.min(CW, Math.ceil(box[2])), y1 = Math.min(CH, Math.ceil(box[3]));
  if (x1 - x0 < 4 || y1 - y0 < 4) return;
  const bw = Math.ceil((x1 - x0) / 64) * 64, bh = Math.ceil((y1 - y0) / 64) * 64;
  const A = scratchBuffer('rimA', Math.min(CW, bw), Math.min(CH, bh)), B = scratchBuffer('rimB', Math.min(CW, bw), Math.min(CH, bh));
  const a = A.getContext('2d'), b = B.getContext('2d');
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.globalCompositeOperation = 'source-over';
  a.globalAlpha = 1;
  a.clearRect(0, 0, A.width, A.height);
  drawFlat(a, -x0, -y0);
  const dx = rim.dir[0] * rim.width, dy = rim.dir[1] * rim.width;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'copy';
  b.drawImage(A, -dx, -dy);
  b.globalCompositeOperation = 'source-over';
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.globalCompositeOperation = 'destination-out';
  a.drawImage(B, 0, 0);
  a.globalCompositeOperation = 'source-in';
  a.fillStyle = rim.color;
  a.fillRect(0, 0, A.width, A.height);
  a.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = rim.mode || 'screen';
  ctx.globalAlpha = rim.alpha ?? 1;
  ctx.drawImage(A, x0, y0);
  ctx.restore();
}

// convenience for the static views (drawCatFront/Back/Portrait): opts.x/y/scale
export function viewRim(ctx, drawView, p, opts, rim) {
  const s = opts.scale;
  const box = [opts.x - s * 2.6, opts.y - s * 3.2, opts.x + s * 2.6, opts.y + s * 1.2];
  rimLight(ctx, box, (g, dx, dy) => drawView(g, p, Object.assign({}, opts, { x: opts.x + dx, y: opts.y + dy, flatColor: '#ffffff', light: null })), Object.assign({ width: s * 0.06 }, rim));
}
