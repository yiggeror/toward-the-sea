// The one composition shared by the postcard illustration and the real sea at
// the end of the film: horizon at 42%, headland entering from the right with
// a white lighthouse near its tip, a small island far left, a few clouds.
// drawSeaView(ctx, x, y, w, h, opts) paints it into a rectangle.
//  - palette 'postcard': a bright daytime watercolour for the card;
//  - palette 'sunrise': the real view at dawn — glowing sun, lit clouds, a
//    glittering sun path, mist, foam, and the lighthouse lamp still burning.
import { css, mix, smoothTo } from '../core/draw.js';
import { lerp, hash01, noise1, clamp, smoothstep, TAU } from '../core/math.js';
import { cloudShape } from '../env/sky.js';
import { scratchBuffer } from './post.js';

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
    skyTop: '#5fa3d8', skyMid: '#a3cdea', skyBot: '#e2f1f7', horizonGlow: '#f4fbff', cloud: '#ffffff', cloudShade: '#c9dbea', cloudRim: '#ffffff', cloudGlow: null,
    seaFar: '#86bddb', seaMid: '#4b8dbd', seaNear: '#2a6699', glint: '#ffffff', mist: '#eef6fa',
    land: '#78a660', landDark: '#557f4c', cliff: '#c4ae90', cliffShade: '#957f6b', cliffLit: '#dac7a8',
    tower: '#ffffff', towerShade: '#d3dae2', cap: '#c94f45', lamp: '#fff7d6', island: '#7a9db0', foam: '#ffffff', sun: null,
  },
  sunrise: {
    skyTop: '#5b6aa0', skyMid: '#c49ab4', skyBot: '#fbd6a8', horizonGlow: '#ffe2b0', cloud: '#ffd8c4', cloudShade: '#8f78a0', cloudRim: '#fff1de', cloudGlow: '#ff9d6e',
    seaFar: '#f3c9a3', seaMid: '#8e8db2', seaNear: '#2f4a78', glint: '#fff0c8', mist: '#f7cfb6',
    land: '#4a6a52', landDark: '#33483e', cliff: '#8a6e66', cliffShade: '#55474b', cliffLit: '#e3a687',
    tower: '#f6efe8', towerShade: '#b6a3a8', cap: '#8e4a45', lamp: '#fff2c4', island: '#8a7ea2', foam: '#ffe8da', sun: '#fff4d8',
  },
};

function P(x, y, w, h, u, v) {
  return [x + u * w, y + v * h];
}
function radial(ctx, cx, cy, r, stops) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
}

export function drawSeaView(ctx, x, y, w, h, opts = {}) {
  const pal = Object.assign({}, PALETTES[opts.palette || 'postcard'], opts.colors || {});
  const t = opts.t || 0;
  const rich = opts.rich ?? !!pal.sun;
  const hz = y + SEA.horizon * h;
  const sunU = opts.sunU ?? 0.36;
  const sx = x + sunU * w, sy = hz - (opts.sunRise ?? 0.03) * h;
  const tq = Math.floor(t / 2) * 2; // shimmer on twos
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // ---- sky
  const sky = ctx.createLinearGradient(0, y, 0, hz);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(0.55, pal.skyMid || pal.skyTop);
  sky.addColorStop(1, pal.skyBot);
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, hz - y + 1);
  // glow along the horizon
  const hg = ctx.createLinearGradient(0, hz - h * 0.16, 0, hz);
  hg.addColorStop(0, css(pal.horizonGlow, 0));
  hg.addColorStop(1, css(pal.horizonGlow, rich ? 0.75 : 0.5));
  ctx.fillStyle = hg;
  ctx.fillRect(x, hz - h * 0.16, w, h * 0.16 + 1);

  // ---- sun and its glow
  if (pal.sun) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    radial(ctx, sx, sy, h * 0.7, [[0, css(pal.sun, 0.3)], [0.15, css(pal.horizonGlow, 0.18)], [0.5, css(pal.horizonGlow, 0.06)], [1, css(pal.horizonGlow, 0)]]);
    radial(ctx, sx, sy, h * 0.1, [[0, css('#ffffff', 0.9)], [0.3, css(pal.sun, 0.6)], [1, css(pal.sun, 0)]]);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, hz - y);
    ctx.clip();
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.arc(sx, sy, h * 0.034, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ---- clouds, lit toward the sun (softened when painted for the film)
  const drawClouds = (g, ox = 0, oy = 0, k = 1) => {
    for (let i = 0; i < SEA.clouds.length; i++) {
      const [cu, cv, cw, ch] = SEA.clouds[i];
      const cx = x + (cu + (opts.cloudDrift || 0) * 0.02) * w, cy = y + cv * h;
      const lx = pal.sun ? sx - cx : -0.3 * w, ly = pal.sun ? sy - cy : -h;
      g.save();
      g.setTransform(k, 0, 0, k, ox, oy);
      cloudShape(g, cx, cy + ch * h * 0.6, cw * w, ch * h * 1.6, 17 + i * 13, {
        top: pal.cloud, shade: pal.cloudShade, rim: pal.cloudRim, glow: pal.cloudGlow, light: [lx, ly], alpha: 0.95,
      });
      g.restore();
    }
  };
  if (rich && typeof OffscreenCanvas !== 'undefined') {
    const m = ctx.getTransform();
    const CW = ctx.canvas.width, CH = ctx.canvas.height;
    const B = scratchBuffer('seaClouds', CW / 2, CH / 2);
    const b = B.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, B.width, B.height);
    b.save();
    b.setTransform(m.a / 2, m.b / 2, m.c / 2, m.d / 2, m.e / 2, m.f / 2);
    drawClouds(b, m.e / 2, m.f / 2, m.a / 2);
    b.restore();
    const S2 = scratchBuffer('seaClouds2', CW / 2, CH / 2);
    const s2 = S2.getContext('2d');
    s2.setTransform(1, 0, 0, 1, 0, 0);
    s2.globalCompositeOperation = 'copy';
    s2.filter = `blur(${(CW / 1920) * 2.2}px)`;
    s2.drawImage(B, 0, 0);
    s2.filter = 'none';
    s2.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(S2, 0, 0, CW, CH);
    ctx.restore();
  } else drawClouds(ctx, ctx.getTransform().e, ctx.getTransform().f, ctx.getTransform().a);

  // ---- sea
  const sea = ctx.createLinearGradient(0, hz, 0, y + h);
  sea.addColorStop(0, pal.seaFar);
  sea.addColorStop(0.25, pal.seaMid || pal.seaFar);
  sea.addColorStop(1, pal.seaNear);
  ctx.fillStyle = sea;
  ctx.fillRect(x, hz, w, y + h - hz);
  // the sky's glow reflected in a broad band under the sun
  if (pal.sun) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(sx, hz);
    ctx.scale(1, 2.6);
    radial(ctx, 0, 0, h * 0.26, [[0, css(pal.glint, 0.35)], [0.4, css(pal.horizonGlow, 0.12)], [1, css(pal.horizonGlow, 0)]]);
    ctx.restore();
  }
  // wave texture: thin lines, dense and short near the horizon
  const rows = rich ? 60 : 16;
  for (let i = 0; i < rows; i++) {
    const r = (i + 0.5) / rows;
    const v = SEA.horizon + 0.004 + Math.pow(r, 1.8) * (1 - SEA.horizon);
    const yy = y + v * h;
    const depth = (v - SEA.horizon) / (1 - SEA.horizon);
    const n = rich ? 5 : 1;
    for (let k = 0; k < n; k++) {
      const s = i * 31 + k * 7;
      const len = w * (0.02 + 0.12 * depth) * (0.5 + hash01(s));
      const u = (hash01(s + 3) + t * 0.0004 * (0.5 + depth)) % 1;
      const xx = x + u * (w + len) - len;
      const light = hash01(s + 5) < 0.6;
      ctx.strokeStyle = light ? css(pal.glint, (rich ? 0.12 : 0.28) * (1 - depth * 0.5)) : css(pal.seaNear, 0.18);
      ctx.lineWidth = Math.max(1, h * (0.0015 + 0.004 * depth));
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.quadraticCurveTo(xx + len * 0.5, yy - h * 0.002 * (1 + depth * 3), xx + len, yy);
      ctx.stroke();
    }
  }
  // sun path: shimmering dashes widening toward the viewer
  if (pal.sun) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const N = rich ? 70 : 26;
    for (let i = 0; i < N; i++) {
      const v = SEA.horizon + 0.003 + Math.pow(i / N, 1.7) * (1 - SEA.horizon);
      const depth = (v - SEA.horizon) / (1 - SEA.horizon);
      const yy = y + v * h;
      const pw = w * (0.015 + 0.16 * depth);
      const m = rich ? 3 : 1;
      for (let k = 0; k < m; k++) {
        const s = i * 13 + k * 101 + tq * 7;
        const off = (hash01(s) - 0.5) * pw * (1.2 + depth);
        const ww = pw * (0.12 + 0.4 * hash01(s + 1)) * (k === 0 ? 1.6 : 1);
        const a = (0.75 - depth * 0.45) * (0.5 + 0.5 * hash01(s + 2));
        ctx.fillStyle = css(pal.glint, a);
        ctx.fillRect(sx + off - ww / 2, yy, ww, Math.max(1, h * (0.002 + 0.004 * depth)));
      }
    }
    // a few star-like glints on the path
    if (rich) {
      for (let i = 0; i < 18; i++) {
        const ph = hash01(i * 17) * TAU;
        let tw = Math.sin(t * (0.15 + 0.1 * hash01(i * 3)) + ph);
        if (tw <= 0.3) continue;
        tw = (tw - 0.3) / 0.7;
        const depth = Math.pow(hash01(i * 7), 1.4);
        const yy = hz + depth * (y + h - hz) * 0.9 + h * 0.01;
        const pw = w * (0.015 + 0.16 * depth);
        const xx = sx + (hash01(i * 11) - 0.5) * pw * 1.5;
        const r = h * (0.006 + 0.014 * depth) * tw;
        ctx.fillStyle = css('#ffffff', 0.9 * tw);
        ctx.beginPath();
        ctx.moveTo(xx - r * 2.2, yy);
        ctx.quadraticCurveTo(xx, yy, xx, yy - r * 1.4);
        ctx.quadraticCurveTo(xx, yy, xx + r * 2.2, yy);
        ctx.quadraticCurveTo(xx, yy, xx, yy + r * 1.4);
        ctx.quadraticCurveTo(xx, yy, xx - r * 2.2, yy);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  // soft mist lying on the water at the horizon
  const mg = ctx.createLinearGradient(0, hz - h * 0.02, 0, hz + h * 0.06);
  mg.addColorStop(0, css(pal.mist, 0));
  mg.addColorStop(0.35, css(pal.mist, rich ? 0.55 : 0.35));
  mg.addColorStop(1, css(pal.mist, 0));
  ctx.fillStyle = mg;
  ctx.fillRect(x, hz - h * 0.02, w, h * 0.08);

  // ---- island (hazy)
  const is = SEA.island;
  ctx.fillStyle = pal.island;
  ctx.beginPath();
  ctx.ellipse(x + is.u * w, y + is.v * h, is.w * w, is.h * h, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = css(pal.mist, 0.35);
  ctx.beginPath();
  ctx.ellipse(x + is.u * w, y + is.v * h, is.w * w * 1.05, is.h * h * 0.6, 0, Math.PI, 0);
  ctx.fill();

  // ---- headland
  const pts = SEA.cape.map(([u, v]) => P(x, y, w, h, u, v));
  const land = [...pts, P(x, y, w, h, 0.72, 0.5), P(x, y, w, h, 0.9, 0.62), P(x, y, w, h, 1.02, 0.72)];
  const lp = new Path2D();
  smoothTo(lp, land, true);
  const cg = ctx.createLinearGradient(x + 0.68 * w, 0, x + 0.9 * w, 0);
  cg.addColorStop(0, pal.cliffLit || pal.cliff);
  cg.addColorStop(0.35, pal.cliff);
  cg.addColorStop(1, pal.cliffShade);
  ctx.fillStyle = cg;
  ctx.fill(lp);
  ctx.save();
  ctx.clip(lp);
  // strata / crevices
  ctx.strokeStyle = css(pal.cliffShade, 0.55);
  ctx.lineWidth = Math.max(1, h * 0.002);
  for (let i = 0; i < (rich ? 9 : 4); i++) {
    const v0 = 0.39 + i * 0.022;
    ctx.beginPath();
    ctx.moveTo(x + (0.69 + 0.01 * i) * w, y + v0 * h);
    ctx.quadraticCurveTo(x + 0.8 * w, y + (v0 + 0.01) * h, x + 1.02 * w, y + (v0 + 0.03 + 0.01 * hash01(i)) * h);
    ctx.stroke();
  }
  // grass cap with a lit edge
  const top = [...pts.slice(0, 6), P(x, y, w, h, 0.72, 0.4), P(x, y, w, h, 0.82, 0.37), P(x, y, w, h, 1.02, 0.35)];
  const tp = new Path2D();
  smoothTo(tp, top, true);
  const lg = ctx.createLinearGradient(0, y + 0.3 * h, 0, y + 0.4 * h);
  lg.addColorStop(0, pal.land);
  lg.addColorStop(1, pal.landDark || pal.land);
  ctx.fillStyle = lg;
  ctx.fill(tp);
  ctx.strokeStyle = css(pal.sun ? '#ffd2a6' : '#d9f0b0', rich ? 0.6 : 0.45);
  ctx.lineWidth = Math.max(1, h * 0.004);
  ctx.beginPath();
  pts.slice(0, 6).forEach(([px, py], i) => (i ? ctx.lineTo(px, py + h * 0.002) : ctx.moveTo(px, py + h * 0.002)));
  ctx.stroke();
  ctx.fillStyle = css(pal.cliffShade, 0.5);
  ctx.beginPath();
  ctx.moveTo(x + 0.69 * w, y + 0.45 * h);
  ctx.lineTo(x + 0.76 * w, y + 0.46 * h);
  ctx.lineTo(x + 0.74 * w, y + 0.52 * h);
  ctx.fill();
  ctx.restore();
  // rocks and restless surf at the cliff foot
  // the waterline: the lower edge of the cliff, from the tip down to the frame edge
  const FOOT = [[0.689, 0.456], [0.705, 0.482], [0.725, 0.503], [0.8, 0.558], [0.9, 0.623], [1.02, 0.72]];
  const footLen = [0];
  for (let i = 1; i < FOOT.length; i++) footLen.push(footLen[i - 1] + Math.hypot((FOOT[i][0] - FOOT[i - 1][0]) * w, (FOOT[i][1] - FOOT[i - 1][1]) * h));
  const foot = (u) => {
    const L = u * footLen[footLen.length - 1];
    let i = 1;
    while (i < FOOT.length - 1 && footLen[i] < L) i++;
    const k = clamp((L - footLen[i - 1]) / Math.max(1e-6, footLen[i] - footLen[i - 1]), 0, 1);
    return [x + lerp(FOOT[i - 1][0], FOOT[i][0], k) * w, y + lerp(FOOT[i - 1][1], FOOT[i][1], k) * h + h * 0.002];
  };
  ctx.fillStyle = pal.cliffShade;
  for (let i = 0; i < 12; i++) {
    const [fx, fy] = foot(0.02 + 0.08 * i + 0.04 * hash01(i * 3));
    ctx.beginPath();
    ctx.ellipse(fx, fy + h * 0.001, w * (0.003 + 0.004 * hash01(i)), h * (0.004 + 0.004 * hash01(i + 9)), 0, Math.PI, 0);
    ctx.fill();
  }
  const surge = 0.5 + 0.5 * Math.sin(t * 0.05);
  // soft white water hugging the foot of the cliff
  for (const [lw2, a] of [[0.012, 0.12], [0.007, 0.22], [0.0035, 0.5]]) {
    ctx.strokeStyle = css(pal.foam, a * (0.6 + 0.4 * surge));
    ctx.lineWidth = Math.max(1, h * lw2 * (0.8 + 0.4 * surge));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k <= 60; k++) {
      const [fx, fy] = foot(k / 60);
      const j = Math.sin(k * 1.7 + t * 0.1) * h * 0.0015;
      k ? ctx.lineTo(fx, fy + j) : ctx.moveTo(fx, fy + j);
    }
    ctx.stroke();
  }
  if (rich) {
    // foam clumps that bloom and dissolve with each surge
    for (let i = 0; i < 70; i++) {
      const [fx, fy] = foot(hash01(i * 7 + 1));
      const life = (t * 0.03 + hash01(i * 11)) % 1;
      const a = Math.sin(life * Math.PI) * (0.35 + 0.5 * surge);
      const r = h * (0.0015 + 0.003 * hash01(i * 5)) * (0.6 + 0.8 * life);
      ctx.fillStyle = css(pal.foam, a);
      ctx.beginPath();
      ctx.ellipse(fx + (hash01(i * 13) - 0.5) * w * 0.006, fy - h * 0.003 * life * surge + (hash01(i * 17) - 0.5) * h * 0.004, r * 1.6, r, 0, 0, TAU);
      ctx.fill();
    }
  }

  // ---- lighthouse
  const L = SEA.lighthouse;
  const bx = x + L.u * w, by = y + L.v * h, lh = L.h * h, lw = L.w * w;
  ctx.fillStyle = pal.towerShade;
  ctx.fillRect(bx + lw * 0.8, by - lh * 0.18, lw * 1.6, lh * 0.18);
  ctx.fillStyle = pal.cap;
  ctx.beginPath();
  ctx.moveTo(bx + lw * 0.65, by - lh * 0.18);
  ctx.lineTo(bx + lw * 1.6, by - lh * 0.3);
  ctx.lineTo(bx + lw * 2.55, by - lh * 0.18);
  ctx.fill();
  // a warm window in the keeper's house
  if (rich) {
    ctx.fillStyle = css(pal.lamp, 0.9);
    ctx.fillRect(bx + lw * 1.3, by - lh * 0.12, lw * 0.35, lh * 0.06);
  }
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
  // painted band
  ctx.fillStyle = css(pal.cap, 0.85);
  ctx.beginPath();
  ctx.moveTo(bx - lw * 0.47, by - lh * 0.42);
  ctx.lineTo(bx + lw * 0.47, by - lh * 0.42);
  ctx.lineTo(bx + lw * 0.45, by - lh * 0.5);
  ctx.lineTo(bx - lw * 0.45, by - lh * 0.5);
  ctx.fill();
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
    const ly = by - lh * 0.91;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    radial(ctx, bx, ly, h * 0.1, [[0, css(pal.lamp, 0.95 * opts.beam)], [0.2, css(pal.lamp, 0.45 * opts.beam)], [1, css(pal.lamp, 0)]]);
    // the slowly turning beam
    const ang = t * 0.035;
    const sweep = Math.cos(ang);
    const len = w * 0.45 * Math.abs(sweep);
    if (len > 2) {
      const dir = sweep > 0 ? -1 : 1;
      const g = ctx.createLinearGradient(bx, ly, bx + dir * len, ly);
      g.addColorStop(0, css(pal.lamp, 0.35 * opts.beam * Math.abs(sweep)));
      g.addColorStop(1, css(pal.lamp, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx, ly - lh * 0.03);
      ctx.lineTo(bx + dir * len, ly - lh * 0.25);
      ctx.lineTo(bx + dir * len, ly + lh * 0.2);
      ctx.lineTo(bx, ly + lh * 0.03);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}
