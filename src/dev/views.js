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

import { CLIPS, clipById } from '../test/clips.js';
import { drawEventFX, drawGroundMarks } from '../fx/events.js';
import { drawStage } from '../test/stage.js';
export function clip(ctx, W, H, q) {
  const c = clipById(q.get('id') || 'jump');
  const built = c.build();
  const perf = built.perf;
  const actor = new CatActor(perf, { env: { wind: built.wind } });
  const a = +(q.get('a') || 0), n = +(q.get('n') || 12), cols = +(q.get('cols') || 4), step = +(q.get('step') || 1);
  const rows = Math.ceil(n / cols);
  const cw = W / cols, ch = H / rows;
  const s = +(q.get('s') || Math.min(cw, ch) / 3.4);
  ctx.font = '14px sans-serif';
  window.__info = `end=${perf.end.toFixed(0)}`;
  for (let i = 0; i < n; i++) {
    const fr = a + i * step;
    const cx0 = (i % cols) * cw, cy0 = Math.floor(i / cols) * ch;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx0, cy0, cw, ch); ctx.clip();
    const pose = perf.poseAt(fr);
    const camX = c.cam === 'follow' ? pose.hip[0] + 0.5 : (c.camX ?? 0.6);
    const cam = { x: camX, y: +(q.get('camy') || c.camY || -1.1), s: s * (c.zoom || 1), cx: cx0 + cw / 2, cy: cy0 + ch * 0.55 };
    drawStage(ctx, c, cam, fr, [cx0, cy0, cw, ch], 'back');
    const env = { ground: perf.ground, facing: pose.facing };
    drawGroundMarks(ctx, perf.events, perf.drawTime(fr), cam, env);
    actor.draw(ctx, fr, cam);
    drawStage(ctx, c, cam, fr, [cx0, cy0, cw, ch], 'front', perf);
    drawEventFX(ctx, perf.events, perf.drawTime(fr), cam, env);
    ctx.fillStyle = '#655'; ctx.fillText(`f${fr} (d${perf.drawTime(fr)})`, cx0 + 6, cy0 + 16);
    ctx.restore();
  }
}

import { drawCatFront, drawCatBack, drawPortrait, EXPRESSIONS } from '../cat/views.js';
export function exprs(ctx, W, H, q) {
  const s = +(q.get('s') || 150);
  const n = EXPRESSIONS.length;
  const cols = +(q.get('cols') || 5);
  const cw = W / cols, ch = H / Math.ceil(n / cols);
  ctx.font = '18px sans-serif'; ctx.fillStyle = '#655';
  EXPRESSIONS.forEach((e, i) => {
    const cx = (i % cols) * cw + cw / 2, cy = Math.floor(i / cols) * ch + ch * 0.52;
    drawPortrait(ctx, e.p, { x: cx, y: cy, scale: s });
    ctx.fillStyle = '#655'; ctx.fillText(e.zh + ' ' + e.id, cx - 50, Math.floor(i / cols) * ch + ch - 12);
  });
}
export function turnaround(ctx, W, H, q) {
  const s = +(q.get('s') || 150);
  const gy = H * 0.86;
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  drawCatFront(ctx, { breath: 0 }, { x: W * 0.13, y: gy, scale: s });
  // side sitting via rig
  const p = defaultPose();
  Object.assign(p, { hip: [-0.16, -0.47], pitch: 1.27, len: 1.1, neckLen: 1.05, archB: 0.34, archF: -0.18, neck: 0.28, hPitch: 0.02, hYaw: 0.25,
    hnM: 1, hfM: 1, hn: [0.32, 0], hf: [0.24, 0], fn: [0.54, 0], ff: [0.44, 0], tailA: -0.72, tailC: 2.3, tailK: 1.0 });
  drawCat(ctx, p, { x: W * 0.36, y: gy, scale: s, ground: () => 0 });
  drawCatBack(ctx, { tail: 0.6 }, { x: W * 0.62, y: gy, scale: s });
  drawCatFront(ctx, { hYaw: -0.45 }, { x: W * 0.86, y: gy, scale: s });
}

// preview board for the user: turnaround + expressions + motion strip
export async function board(ctx, W, H, q) {
  ctx.fillStyle = '#f4efe7'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#4a4040'; ctx.font = '28px serif';
  ctx.fillText('小灰 Hui — 简化版重绘（程序生成）', 30, 44);
  // row 1 turnaround
  const s1 = 92, gy = 400;
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.moveTo(20, gy); ctx.lineTo(W - 20, gy); ctx.stroke();
  drawCatFront(ctx, {}, { x: 160, y: gy, scale: s1 });
  const p = defaultPose();
  Object.assign(p, { hip: [-0.16, -0.47], pitch: 1.27, len: 1.1, neckLen: 1.05, archB: 0.34, archF: -0.18, neck: 0.28, hYaw: 0.55,
    hnM: 1, hfM: 1, hn: [0.32, 0], hf: [0.24, 0], fn: [0.54, 0], ff: [0.44, 0], tailA: -0.72, tailC: 2.3, tailK: 1.0 });
  drawCat(ctx, p, { x: 420, y: gy, scale: s1, ground: () => 0 });
  drawCatBack(ctx, { tail: 0.6 }, { x: 700, y: gy, scale: s1 });
  drawCatFront(ctx, { hYaw: -0.45 }, { x: 960, y: gy, scale: s1 });
  ctx.font = '18px serif'; ctx.fillStyle = '#5a5050';
  ['正面', '侧面', '背面', '3/4 视角'].forEach((t, i) => ctx.fillText(t, [140, 400, 680, 930][i], gy + 30));
  // row 2 expressions
  const ex = EXPRESSIONS.slice(0, 8);
  ex.forEach((e, i) => {
    const cx = 90 + i * 140, cy = 560;
    ctx.save(); ctx.beginPath(); ctx.rect(cx - 70, cy - 130, 140, 190); ctx.clip();
    drawPortrait(ctx, Object.assign({ noBody: true }, e.p), { x: cx, y: cy, scale: 88 });
    ctx.restore();
    ctx.fillStyle = '#5a5050'; ctx.fillText(e.zh, cx - 20, cy + 95);
  });
  // row 3 motion strip: walk frames
  const perf = buildGait('walk', 9);
  const actor = new CatActor(perf);
  for (let i = 0; i < 6; i++) {
    const fr = 56 + i * 2;
    const pose = perf.poseAt(fr);
    const cam = { x: pose.hip[0] + 0.5, y: -0.9, s: 60, cx: 110 + i * 190, cy: 820 };
    actor.draw(ctx, fr, cam);
  }
  ctx.fillStyle = '#5a5050'; ctx.fillText('走路（连续 12 帧中每隔 1 帧，一拍二）', 30, 900);
}

// 12 consecutive frames per row for several clips (self-check evidence)
export function strips(ctx, W, H, q) {
  const rows = (q.get('rows') || 'walk:56,run:44,jump:44,pounce:44,shake:48,snow:26').split(',').map((r) => r.split(':'));
  const n = 12;
  const rh = H / rows.length, cw = W / n;
  ctx.fillStyle = '#f4f1ec'; ctx.fillRect(0, 0, W, H);
  ctx.font = '13px sans-serif';
  rows.forEach(([id, a], ri) => {
    const c = clipById(id);
    const built = c.build();
    const perf = built.perf;
    const actor = new CatActor(perf, { env: { wind: built.wind } });
    for (let i = 0; i < n; i++) {
      const fr = +a + i;
      const x0 = i * cw, y0 = ri * rh;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, cw, rh); ctx.clip();
      const pose = perf.poseAt(fr);
      const s = rh / 3.1 * (c.zoom ?? 1) * 0.9;
      const camX = c.cam === 'follow' ? pose.hip[0] + 0.45 : (c.camX ?? 0.6);
      const cam = { x: camX, y: c.camY ?? -1.05, s, cx: x0 + cw / 2, cy: y0 + rh * 0.58 };
      drawStage(ctx, c, cam, fr, [x0, y0, cw, rh], 'back');
      const env = { ground: perf.ground, facing: pose.facing };
      drawGroundMarks(ctx, perf.events, perf.drawTime(fr), cam, env);
      actor.draw(ctx, fr, cam);
      drawStage(ctx, c, cam, fr, [x0, y0, cw, rh], 'front', perf);
      drawEventFX(ctx, perf.events, perf.drawTime(fr), cam, env);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.strokeRect(x0 + 0.5, y0 + 0.5, cw - 1, rh - 1);
      ctx.fillStyle = '#5a5050';
      ctx.fillText(`${i === 0 ? c.title.split(' ')[0] + '  ' : ''}f${fr}${perf.drawTime(fr) !== fr ? ' =' : ''}`, x0 + 5, y0 + 15);
      ctx.restore();
    }
  });
}

import { cardArt } from '../film/postcard.js';
export function carry(ctx, W, H, q) {
  const perf = buildGait(q.get('gait') || 'walk', 9);
  const wears = [0, 0.4, 0.65, 0.95];
  for (let i = 0; i < 4; i++) {
    const actor = new CatActor(perf, { carry: { wear: wears[i] } });
    const fr = 50 + i * 3;
    const pose = perf.poseAt(fr);
    actor.draw(ctx, fr, { x: pose.hip[0] + 0.6, y: -1.0, s: 95, cx: 220 + i * 390, cy: 330 });
    ctx.fillStyle = '#655'; ctx.font = '16px sans-serif'; ctx.fillText('wear ' + wears[i], 120 + i * 390, 470);
  }
  // card art sheet
  const ws = [0, 0.2, 0.35, 0.5, 0.6, 0.75, 0.9];
  ws.forEach((w, i) => {
    const art = cardArt(w, 320);
    ctx.drawImage(art, 30 + i * 225, 520, 210, 210 * art.height / art.width);
    ctx.fillText('wear ' + w, 30 + i * 225, 700);
  });
}

// shot preview: contact sheet of one shot (or the whole film) at chosen frames
import { buildFilm } from '../film/film.js';
export async function shotsheet(ctx, W, H, q) {
  const tl = await buildFilm();
  const name = q.get('shot');
  const cols = +(q.get('cols') || 4), rows = +(q.get('rows') || 3);
  const n = cols * rows;
  const cw = Math.floor(W / cols), ch = Math.floor(cw * 9 / 16);
  let frames = [];
  if (name) {
    const s = tl.shots.find((x) => x.name === name);
    const a = +(q.get('a') ?? 0), b = +(q.get('b') ?? s.dur - 1);
    const step = q.get('step') ? +q.get('step') : (b - a) / (n - 1);
    for (let i = 0; i < n; i++) frames.push(Math.round(s.start + a + i * step));
  } else {
    const a = +(q.get('a') ?? 0), step = +(q.get('step') || Math.floor(tl.length / n));
    for (let i = 0; i < n; i++) frames.push(Math.min(tl.length - 1, a + i * step));
  }
  const off = new OffscreenCanvas(cw, ch);
  const g = off.getContext('2d');
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
  frames.forEach((f, i) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
    const r = tl.draw(g, f, cw, ch);
    const x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + 22);
    ctx.drawImage(off, x, y);
    ctx.fillStyle = '#ddd'; ctx.font = '14px sans-serif';
    ctx.fillText(`${r.shot.name}  f${r.local} (g${f})`, x + 4, y + ch + 16);
  });
  window.__info = `film ${tl.length} frames ${(tl.length / 24).toFixed(1)}s`;
}

// head lab: big heads at several yaws/pitches (+ optional expression) for design work
export function headlab(ctx, W, H, q) {
  const s = +(q.get('s') || 200);
  const bg = q.get('dark') ? '#1d2233' : '#efe8df';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const yaws = (q.get('yaws') || '0,0.5,1.0,1.57').split(',').map(Number);
  const pitches = (q.get('pitches') || '0').split(',').map(Number);
  const ex = q.get('ex') ? EXPRESSIONS.find((e) => e.id === q.get('ex')).p : {};
  const body = !q.get('nobody');
  const cols = yaws.length, rows = pitches.length;
  const cw = W / cols, ch = H / rows;
  pitches.forEach((pt, r) => yaws.forEach((y, c) => {
    const p = Object.assign({}, ex, { hYaw: y - Math.PI / 2, hPitch: pt + (ex.hPitch || 0), noBody: !body });
    ctx.save(); ctx.beginPath(); ctx.rect(c * cw, r * ch, cw, ch); ctx.clip();
    const an = drawPortrait(ctx, p, { x: c * cw + cw / 2, y: r * ch + ch * 0.5, scale: s });
    if (q.get('emote')) {
      const kinds = q.get('emote').split(',');
      const age = +(q.get('age') || 10);
      drawEmotes(ctx, kinds.map((k, i) => ({ type: 'emote', kind: k, t: 0, dur: 60 })), age, an);
    }
    ctx.restore();
  }));
}
import { drawEmotes } from '../fx/emote.js';

// micro-benchmarks for post effects (canvas 2D in headless chromium)
export function postbench(ctx, W, H, q) {
  const mk = (w, h) => new OffscreenCanvas(w, h);
  // fill with something non-trivial
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `hsl(${i * 37 % 360},60%,${30 + (i * 13) % 60}%)`;
    ctx.fillRect((i * 97) % W, (i * 53) % H, 200, 120);
  }
  const T = {};
  const flush = (c) => c.getContext('2d').getImageData(0, 0, 1, 1);
  let tgt = null;
  const time = (k, fn, n = 5) => { fn(); flush(tgt); const t0 = performance.now(); for (let i = 0; i < n; i++) { fn(); flush(tgt); } T[k] = ((performance.now() - t0) / n).toFixed(1); };
  const A = mk(W / 4, H / 4), a = A.getContext('2d');
  const B = mk(W / 4, H / 4), b = B.getContext('2d');
  const F = mk(W, H), f = F.getContext('2d');
  tgt = A;
  time('down4', () => a.drawImage(ctx.canvas, 0, 0, W / 4, H / 4));
  time('getImg4', () => a.getImageData(0, 0, W / 4, H / 4));
  const img = a.getImageData(0, 0, W / 4, H / 4);
  time('putImg4', () => a.putImageData(img, 0, 0));
  tgt = B;
  time('blur4_8', () => { b.filter = 'blur(8px)'; b.drawImage(A, 0, 0); b.filter = 'none'; });
  tgt = ctx.canvas;
  time('up4screen', () => { ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.01; ctx.drawImage(B, 0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; });
  time('up4over', () => { ctx.globalAlpha = 0.01; ctx.drawImage(B, 0, 0, W, H); ctx.globalAlpha = 1; });
  time('up4lighter', () => { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.01; ctx.drawImage(B, 0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; });
  time('up4lowq', () => { ctx.imageSmoothingQuality = 'low'; ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.01; ctx.drawImage(B, 0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; });
  const B2 = mk(W / 2, H / 2), b2 = B2.getContext('2d');
  time('up2over', () => { ctx.globalAlpha = 0.01; ctx.drawImage(B2, 0, 0, W, H); ctx.globalAlpha = 1; });
  time('up2screen', () => { ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.01; ctx.drawImage(B2, 0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; });
  time('fullOver', () => { ctx.globalAlpha = 0.01; ctx.drawImage(F, 0, 0); ctx.globalAlpha = 1; });
  time('fullScreen', () => { ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.01; ctx.drawImage(F, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; });
  tgt = B2;
  time('blur2_6', () => { b2.filter = 'blur(6px)'; b2.drawImage(ctx.canvas, 0, 0, W / 2, H / 2); b2.filter = 'none'; });
  time('down2', () => { b2.drawImage(ctx.canvas, 0, 0, W / 2, H / 2); });
  tgt = F;
  time('copyFull', () => f.drawImage(ctx.canvas, 0, 0));
  time('blurFull4', () => { f.filter = 'blur(4px)'; f.drawImage(ctx.canvas, 0, 0); f.filter = 'none'; });
  time('blurFull12', () => { f.filter = 'blur(12px)'; f.drawImage(ctx.canvas, 0, 0); f.filter = 'none'; });
  time('blurHalf6', () => { const h2 = mk(W / 2, H / 2); const g2 = h2.getContext('2d'); g2.drawImage(ctx.canvas, 0, 0, W / 2, H / 2); f.filter = 'blur(6px)'; f.drawImage(h2, 0, 0, W, H); f.filter = 'none'; });
  time('contrastSat', () => { f.filter = 'contrast(1.06) saturate(1.1)'; f.drawImage(ctx.canvas, 0, 0); f.filter = 'none'; });
  time('clearFull', () => f.clearRect(0, 0, W, H));
  time('gradFull', () => { const g = f.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#fff'); g.addColorStop(1, '#000'); f.fillStyle = g; f.fillRect(0, 0, W, H); });
  time('radialFull', () => { const g = f.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W); g.addColorStop(0, '#fff'); g.addColorStop(1, '#000'); f.fillStyle = g; f.fillRect(0, 0, W, H); });
  tgt = B;
  time('zoom8', () => { b.globalCompositeOperation = 'lighter'; for (let i = 0; i < 8; i++) { const s = 1 + i * 0.05; b.globalAlpha = 0.12; b.drawImage(A, W / 8 - W / 8 * s, H / 8 - H / 8 * s, W / 4 * s, H / 4 * s); } b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1; });
  window.__info = JSON.stringify(T);
}

// one frame (at fraction u of each shot) for every shot of a sequence
export async function seqsheet(ctx, W, H, q) {
  const tl = await buildFilm();
  const seq = q.get('seq');
  const u = +(q.get('u') ?? 0.5);
  const shots = tl.shots.filter((s) => !seq || seq.split(',').includes(s.seq) || seq.split(',').includes(s.name));
  const cols = +(q.get('cols') || 3);
  const cw = Math.floor(W / cols), ch = Math.floor(cw * 9 / 16);
  const off = new OffscreenCanvas(cw, ch);
  const g = off.getContext('2d');
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
  shots.forEach((s, i) => {
    const f = s.start + Math.round((s.dur - 1) * u);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
    tl.draw(g, f, cw, ch);
    const x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + 22);
    ctx.drawImage(off, x, y);
    ctx.fillStyle = '#ddd'; ctx.font = '14px sans-serif';
    ctx.fillText(`${s.name}  f${f - s.start}`, x + 4, y + ch + 16);
  });
}

// debug: draw one frame of a shot layer by layer (cumulative thumbnails)
export async function layerdebug(ctx, W, H, q) {
  const tl = await buildFilm();
  const s = tl.shots.find((x) => x.name === q.get('shot'));
  tl.ensure(s);
  const f = +(q.get('f') || 0);
  const cols = +(q.get('cols') || 4);
  const cw = Math.floor(W / cols), ch = Math.floor(cw * 9 / 16);
  const off = new OffscreenCanvas(cw, ch);
  const g = off.getContext('2d');
  const all = s.layers.slice();
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
  ctx.font = '12px sans-serif';
  const post = s.post;
  s.post = null;
  for (let n = 1; n <= all.length; n++) {
    s.layers = all.slice(0, n);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
    s.draw(g, f, cw, ch);
    const i = n - 1, x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + 16);
    ctx.drawImage(off, x, y);
    const L = all[n - 1];
    ctx.fillStyle = '#ddd';
    ctx.fillText(`${n}: z=${(L._z ?? 0).toFixed(3)} ${L.blur ? 'blur' : ''}${L.haze ? ' haze' : ''}${L.screen ? ' scr' : ''}`, x + 4, y + ch + 12);
  }
  s.layers = all;
  s.post = post;
}
