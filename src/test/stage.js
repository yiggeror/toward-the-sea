// Simple test stage: ground line with world ticks, boxes, snow.
export function drawStage(ctx, clip, cam, fr, rect, layer, perf) {
  const [x0, y0, w, h] = rect;
  const s = cam.s;
  const sx = (x) => cam.cx + (x - cam.x) * s;
  const sy = (y) => cam.cy + (y - cam.y) * s;
  if (layer === 'back') {
    ctx.fillStyle = clip.snow ? '#e9eef3' : '#efe8df';
    ctx.fillRect(x0, y0, w, h);
    const gy = sy(0);
    ctx.fillStyle = clip.snow ? '#f7f9fb' : '#e4dbd0';
    ctx.fillRect(x0, gy, w, y0 + h - gy);
    ctx.strokeStyle = 'rgba(60,50,50,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0 + w, gy); ctx.stroke();
    for (let x = Math.floor(cam.x - w / s); x <= cam.x + w / s; x += 0.5) {
      ctx.beginPath(); ctx.moveTo(sx(x), gy); ctx.lineTo(sx(x), gy + (Math.abs(x % 1) < 1e-9 ? 9 : 4)); ctx.stroke();
    }
    for (const p of clip.props || []) {
      if (p.type === 'box') {
        ctx.fillStyle = '#cdbfae'; ctx.strokeStyle = '#6b5f55'; ctx.lineWidth = 1.5;
        ctx.fillRect(sx(p.x0), sy(-p.h), (p.x1 - p.x0) * s, p.h * s);
        ctx.strokeRect(sx(p.x0), sy(-p.h), (p.x1 - p.x0) * s, p.h * s);
      }
    }
  } else if (layer === 'front' && clip.snow) {
    // snow lip in front of sunk paws
    const gy = sy(0);
    ctx.fillStyle = '#f7f9fb';
    ctx.fillRect(x0, gy + 1, w, y0 + h - gy);
    ctx.strokeStyle = 'rgba(120,140,160,0.35)';
    ctx.beginPath(); ctx.moveTo(x0, gy + 1); ctx.lineTo(x0 + w, gy + 1); ctx.stroke();
  }
}
