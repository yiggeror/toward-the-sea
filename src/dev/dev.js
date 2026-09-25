// Dev views rendered by tools/snap.mjs (web/dev.html?view=...)
import { drawCat } from '../cat/cat.js';
import { defaultPose } from '../cat/rig.js';

export async function devMain(canvas, q) {
  const W = +(q.get('w') || 1600), H = +(q.get('h') || 900);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = q.get('bg') || '#efe8df';
  ctx.fillRect(0, 0, W, H);
  const view = q.get('view') || 'model';
  const mod = await import('./views.js?' + Date.now());
  await mod[view](ctx, W, H, q);
}
