import { drawCat } from '../cat/cat.js';
import { defaultPose } from '../cat/rig.js';

function ground(ctx, W, y) {
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
}
export function mirror(p) {
  p.facing = -p.facing;
  for (const k of ['hip', 'fn', 'ff', 'hn', 'hf']) p[k] = [-p[k][0], p[k][1]];
  return p;
}
export function model(ctx, W, H, q) {
  const s = +(q.get('s') || 150);
  ground(ctx, W, H * 0.8);
  const p = defaultPose();
  drawCat(ctx, p, { x: W * 0.28, y: H * 0.8, scale: s });
  const p2 = mirror(defaultPose()); p2.hYaw = 0;
  drawCat(ctx, p2, { x: W * 0.75, y: H * 0.8, scale: s });
}
export function heads(ctx, W, H, q) {
  const s = +(q.get('s') || 130);
  const yaws = [0, 0.4, 0.8, 1.2, 1.57, 2.2];
  yaws.forEach((y, i) => {
    const p = defaultPose(); p.hYaw = y; p.tailA = -0.9; p.tailC = -0.3; p.tailK = 0;
    const col = i % 3, row = Math.floor(i / 3);
    const cw = W / 3;
    drawCat(ctx, p, { x: col * cw + cw * 0.18, y: (row + 1) * (H / 2) - 20, scale: s });
  });
}

import { Perf } from '../anim/perf.js';
import { locomote } from '../anim/gaits.js';
import { CatActor } from '../anim/actor.js';

export function buildGait(name, dist = 8) {
  const p0 = defaultPose();
  const perf = new Perf(p0, { twos: 2 });
  perf.t = 6;
  locomote(perf, { gait: name, dist });
  return perf;
}
// contact sheet: frames a..a+n-1 in a grid, camera follows hip (at draw time)
export function sheet(ctx, W, H, q) {
  const gait = q.get('gait') || 'walk';
  const a = +(q.get('a') || 30), n = +(q.get('n') || 12), cols = +(q.get('cols') || 4);
  const perf = buildGait(gait, +(q.get('dist') || 8));
  if (q.get('ones')) perf.setTiming(0, 1);
  const actor = new CatActor(perf);
  const rows = Math.ceil(n / cols);
  const cw = W / cols, ch = H / rows;
  const s = +(q.get('s') || Math.min(cw, ch) / 3.2);
  ctx.font = '14px sans-serif';
  for (let i = 0; i < n; i++) {
    const fr = a + i;
    const cx0 = (i % cols) * cw, cy0 = Math.floor(i / cols) * ch;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx0, cy0, cw, ch); ctx.clip();
    ctx.fillStyle = i % 2 ? '#f3ede4' : '#efe8df';
    ctx.fillRect(cx0, cy0, cw, ch);
    const camX = +(q.get('camx') ?? NaN);
    const pose = perf.poseAt(fr);
    const cam = { x: isNaN(camX) ? pose.hip[0] + 0.5 : camX, y: -0.9, s, cx: cx0 + cw / 2, cy: cy0 + ch * 0.55 };
    // ground + world ticks
    const gy = cam.cy + (0 - cam.y) * s;
    ctx.strokeStyle = 'rgba(60,50,50,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx0, gy); ctx.lineTo(cx0 + cw, gy); ctx.stroke();
    for (let x = Math.floor(cam.x - 4); x <= cam.x + 4; x += 0.5) {
      const sx = cam.cx + (x - cam.x) * s;
      ctx.beginPath(); ctx.moveTo(sx, gy); ctx.lineTo(sx, gy + (x % 1 === 0 ? 10 : 5)); ctx.stroke();
    }
    actor.draw(ctx, fr, cam);
    ctx.fillStyle = '#655'; ctx.fillText(`f${fr} (d${perf.drawTime(fr)})`, cx0 + 6, cy0 + 16);
    ctx.restore();
  }
}
