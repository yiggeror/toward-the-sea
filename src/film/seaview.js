// The one composition shared by the postcard illustration and the real sea at
// the end of the film: horizon at 42%, headland entering from the right with
// a white lighthouse near its tip, a small island far left, a few clouds.
// drawSeaView(ctx, x, y, w, h, opts) paints it into a rectangle.
import { css, mix, smoothTo } from '../core/draw.js';
import { lerp, hash01, noise1, clamp } from '../core/math.js';

export const SEA = {
  horizon: 0.42,
  // headland outline (normalised), from far right along the top, down the cliff to the water
  cape: [[1.02, 0.305], [0.93, 0.315], [0.84, 0.33], [0.765, 0.352], [0.725, 0.378], [0.705, 0.405], [0.695, 0.43], [0.69, 0.452]],
  lighthouse: { u: 0.79, v: 0.337, h: 0.115, w: 0.022 },
  island: { u: 0.13, v: 0.42, w: 0.07, h: 0.018 },
  clouds: [[0.2, 0.17, 0.2, 0.05], [0.56, 0.1, 0.24, 0.045], [0.86, 0.2, 0.16, 0.04]],
};

export const PALETTES = {
  postcard: {
    skyTop: '#7fb4de', skyBot: '#d6ebf5', cloud: '#ffffff', cloudShade: '#dde8f1',
    seaFar: '#6fa6cf', seaNear: '#2f6f9f', glint: '#ffffff',
    land: '#6f9a63', landDark: '#557e4f', cliff: '#b7a58e', cliffShade: '#8f7f6e',
    tower: '#ffffff', towerShade: '#d9dde2', cap: '#c94f45', lamp: '#fff7d6', island: '#6d93a6', sun: null,
  },
  sunrise: {
    skyTop: '#6f86b8', skyBot: '#f6c9a0', cloud: '#fbe3cf', cloudShade: '#d7a79a',
    seaFar: '#e7b89a', seaNear: '#3b5f8d', glint: '#ffe4b8',
    land: '#4f6b58', landDark: '#394f45', cliff: '#8a7266', cliffShade: '#62524c',
    tower: '#f4efe9', towerShade: '#b9a9a8', cap: '#8e4a45', lamp: '#fff2c4', island: '#8a88a3', sun: '#fff1d0',
  },
};

function P(x, y, w, h, u, v) {
  return [x + u * w, y + v * h];
}

export function drawSeaView(ctx, x, y, w, h, opts = {}) {
  const pal = Object.assign({}, PALETTES[opts.palette || 'postcard'], opts.colors || {});
  const t = opts.t || 0;
  const hz = y + SEA.horizon * h;
  // sky
  const sky = ctx.createLinearGradient(0, y, 0, hz);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(1, pal.skyBot);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, hz - y + 1);
  // sun
  if (pal.sun) {
    const sx = x + (opts.sunU ?? 0.36) * w, sy = hz - (opts.sunRise ?? 0.03) * h;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.5);
    g.addColorStop(0, css(pal.sun, 0.9));
    g.addColorStop(0.12, css(pal.sun, 0.5));
    g.addColorStop(1, css(pal.sun, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, hz - y);
    ctx.clip();
    ctx.fillStyle = pal.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, h * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // clouds
  for (const [cu, cv, cw, ch] of SEA.clouds) {
    const cx = x + (cu + (opts.cloudDrift || 0) * 0.02) * w, cy = y + cv * h;
    const puffs = 6;
    ctx.fillStyle = pal.cloudShade;
    ctx.beginPath();
    for (let i = 0; i < puffs; i++) {
      const px = cx + (i / (puffs - 1) - 0.5) * cw * w;
      const r = ch * h * (0.7 + 0.6 * Math.sin((i / (puffs - 1)) * Math.PI));
      ctx.moveTo(px + r, cy + ch * h * 0.25);
      ctx.arc(px, cy + ch * h * 0.25, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = pal.cloud;
    ctx.beginPath();
    for (let i = 0; i < puffs; i++) {
      const px = cx + (i / (puffs - 1) - 0.5) * cw * w;
      const r = ch * h * (0.62 + 0.55 * Math.sin((i / (puffs - 1)) * Math.PI));
      ctx.moveTo(px + r, cy);
      ctx.arc(px, cy, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  // sea
  const sea = ctx.createLinearGradient(0, hz, 0, y + h);
  sea.addColorStop(0, pal.seaFar);
  sea.addColorStop(1, pal.seaNear);
  ctx.fillStyle = sea;
  ctx.fillRect(x, hz, w, y + h - hz);
  // sun path on water
  if (pal.sun) {
    const sx = x + (opts.sunU ?? 0.36) * w;
    for (let i = 0; i < 26; i++) {
      const v = SEA.horizon + 0.01 + (i / 26) ** 1.6 * (1 - SEA.horizon);
      const yy = y + v * h;
      const ww = w * (0.01 + 0.09 * (v - SEA.horizon)) * (0.6 + 0.8 * hash01(i * 7 + Math.floor(t / 6)));
      ctx.fillStyle = css(pal.glint, 0.55 * (1 - (v - SEA.horizon) * 1.2));
      ctx.fillRect(sx - ww / 2 + (hash01(i * 13 + Math.floor(t / 6)) - 0.5) * w * 0.03, yy, ww, Math.max(1, h * 0.004));
    }
  }
  // wave lines
  ctx.strokeStyle = css(pal.glint, 0.28);
  ctx.lineWidth = Math.max(1, h * 0.003);
  for (let i = 0; i < 14; i++) {
    const v = SEA.horizon + 0.03 + (i / 14) * (1 - SEA.horizon - 0.05);
    const yy = y + v * h;
    const len = w * (0.03 + 0.08 * (v - SEA.horizon));
    const u = hash01(i * 31 + 3) + (opts.t ? (t * 0.0006 * (1 + i * 0.1)) % 1 : 0);
    const xx = x + (u % 1) * w * 0.66;
    ctx.beginPath();
    ctx.moveTo(xx, yy);
    ctx.lineTo(xx + len, yy);
    ctx.stroke();
  }
  // island
  const is = SEA.island;
  ctx.fillStyle = pal.island;
  ctx.beginPath();
  ctx.ellipse(x + is.u * w, y + is.v * h, is.w * w, is.h * h, 0, Math.PI, 0);
  ctx.fill();
  // headland
  const pts = SEA.cape.map(([u, v]) => P(x, y, w, h, u, v));
  const land = [...pts, P(x, y, w, h, 0.72, 0.5), P(x, y, w, h, 0.9, 0.62), P(x, y, w, h, 1.02, 0.72)];
  ctx.fillStyle = pal.cliff;
  const lp = new Path2D();
  smoothTo(lp, land, true);
  ctx.fill(lp);
  // grass cap on top of the headland
  ctx.save();
  ctx.clip(lp);
  ctx.fillStyle = pal.land;
  const top = [...pts.slice(0, 6), P(x, y, w, h, 0.72, 0.4), P(x, y, w, h, 0.82, 0.37), P(x, y, w, h, 1.02, 0.35)];
  const tp = new Path2D();
  smoothTo(tp, top, true);
  ctx.fill(tp);
  ctx.fillStyle = pal.cliffShade;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(x + 0.69 * w, y + 0.45 * h);
  ctx.lineTo(x + 0.76 * w, y + 0.46 * h);
  ctx.lineTo(x + 0.74 * w, y + 0.52 * h);
  ctx.fill();
  ctx.restore();
  // foam at the cliff foot
  ctx.strokeStyle = css('#ffffff', 0.6);
  ctx.lineWidth = Math.max(1, h * 0.004);
  ctx.beginPath();
  ctx.moveTo(x + 0.688 * w, y + 0.455 * h);
  ctx.quadraticCurveTo(x + 0.71 * w, y + 0.47 * h, x + 0.74 * w, y + 0.5 * h);
  ctx.stroke();
  // lighthouse
  const L = SEA.lighthouse;
  const bx = x + L.u * w, by = y + L.v * h, lh = L.h * h, lw = L.w * w;
  // keeper's house
  ctx.fillStyle = pal.towerShade;
  ctx.fillRect(bx + lw * 0.8, by - lh * 0.18, lw * 1.6, lh * 0.18);
  ctx.fillStyle = pal.cap;
  ctx.beginPath();
  ctx.moveTo(bx + lw * 0.65, by - lh * 0.18);
  ctx.lineTo(bx + lw * 1.6, by - lh * 0.3);
  ctx.lineTo(bx + lw * 2.55, by - lh * 0.18);
  ctx.fill();
  // tower (tapered)
  ctx.fillStyle = pal.tower;
  ctx.beginPath();
  ctx.moveTo(bx - lw * 0.55, by);
  ctx.lineTo(bx + lw * 0.55, by);
  ctx.lineTo(bx + lw * 0.38, by - lh * 0.82);
  ctx.lineTo(bx - lw * 0.38, by - lh * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.towerShade;
  ctx.beginPath();
  ctx.moveTo(bx + lw * 0.1, by);
  ctx.lineTo(bx + lw * 0.55, by);
  ctx.lineTo(bx + lw * 0.38, by - lh * 0.82);
  ctx.lineTo(bx + lw * 0.06, by - lh * 0.82);
  ctx.closePath();
  ctx.fill();
  // gallery + lantern + cap
  ctx.fillStyle = pal.cap;
  ctx.fillRect(bx - lw * 0.55, by - lh * 0.86, lw * 1.1, lh * 0.05);
  ctx.fillStyle = pal.lamp;
  ctx.fillRect(bx - lw * 0.3, by - lh * 0.96, lw * 0.6, lh * 0.1);
  ctx.fillStyle = pal.cap;
  ctx.beginPath();
  ctx.moveTo(bx - lw * 0.42, by - lh * 0.96);
  ctx.lineTo(bx, by - lh * 1.06);
  ctx.lineTo(bx + lw * 0.42, by - lh * 0.96);
  ctx.fill();
  if (opts.beam) {
    const g = ctx.createRadialGradient(bx, by - lh * 0.91, 0, bx, by - lh * 0.91, h * 0.08);
    g.addColorStop(0, css(pal.lamp, 0.9 * opts.beam));
    g.addColorStop(1, css(pal.lamp, 0));
    ctx.fillStyle = g;
    ctx.fillRect(bx - h * 0.08, by - lh * 0.91 - h * 0.08, h * 0.16, h * 0.16);
  }
}
