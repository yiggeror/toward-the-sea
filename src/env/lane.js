// A narrow city lane seen down its length (one-point perspective): building
// walls on both sides with windows, air-conditioner boxes, drainpipes, neon
// shop signs sticking out into the lane, wall lamps, laundry lines and wires
// across the gap, a brighter cross street at the far end, and a wet ground
// that mirrors all the lights. World: x across (lane centre 0), y down, d
// depth; the lane runs from d = dStart to d = dEnd.
import { P3, S3, fill3, path3, line3, wallX, floorY, faceD, billboard, nearD, camDist, toCam, projC, nearC, onPlane } from '../film/persp.js';
import { css, mix } from '../core/draw.js';
import { rng, hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';
import { lampGlow } from './light.js';
import { scratchBuffer } from '../film/post.js';

export const LANE_NIGHT = {
  sky: [[0, '#070a1c'], [0.5, '#141a3c'], [1, '#2c2550']],
  walls: ['#2b2f52', '#302f55', '#27294a', '#35325a', '#2d3350'],
  wallLit: '#4a4670',
  frame: '#171830',
  dark: '#10122a',
  lit: ['#ffc977', '#ffe2a6', '#ffb070', '#fff0c8', '#ffd59a'],
  cool: ['#8fb4ff', '#a9c4ff'],
  ac: '#646a90', acSide: '#474c70', acBot: '#2c2f4c',
  pipe: '#1c1e38',
  neon: ['#ff5fa2', '#58e1ff', '#ffb347', '#b57bff', '#ff6a5c', '#7dffb0'],
  ground: '#15182a', groundFar: '#2a2940', wet: '#1b2136',
  lamp: '#ffcf86',
  fog: '#3b3a62',
  endGlow: '#ffb77a',
};

/** Deterministic lane layout. o: { seed, width, dStart, dEnd, hMin, hMax } */
export function laneLayout(o = {}) {
  const R = rng(o.seed ?? 7);
  const half = (o.width ?? 36) / 2;
  const d0 = o.dStart ?? -40, d1 = o.dEnd ?? 900;
  const L = { half, d0, d1, segs: [], props: [], wires: [], laundry: [], pipes: [] };
  for (const side of [-1, 1]) {
    let d = d0;
    let i = 0;
    while (d < d1) {
      const len = R.range(38, 80);
      const h = R.range(o.hMin ?? 95, o.hMax ?? 190);
      const x = side * (half + (i % 3 === 1 ? R.range(-1.5, 2.5) : 0));
      const story = R.range(22, 27);
      const seg = { side, x, d0: d, d1: Math.min(d1 + 200, d + len), h, story, color: (o.walls || LANE_NIGHT.walls)[R.int(0, 4)], windows: [], seed: R.int(1, 1e6) };
      // windows: columns along d, rows up the wall
      const cols = Math.max(1, Math.floor(len / 17));
      const ww = R.range(7, 10), wh = R.range(9, 13);
      const ground = R() < 0.55 ? 'shop' : 'door';
      for (let r = 0; r * story + story < h - 6; r++) {
        if (r === 0 && ground === 'shop') continue;
        for (let c = 0; c < cols; c++) {
          const dc = d + (len * (c + 0.5)) / cols;
          const y1 = -(r * story + story * 0.28), y0 = y1 - wh;
          if (r === 0 && c !== 1) continue;
          const lit = R() < (o.litP ?? 0.36);
          seg.windows.push({ dc, w: ww, y0, y1, lit, col: lit ? LANE_NIGHT.lit[R.int(0, 4)] : null, curtain: lit && R() < 0.4, blind: R() < 0.3, ac: !lit && R() < 0.3 && r > 0, sil: lit && R() < 0.08 });
        }
      }
      if (ground === 'shop') seg.shop = { d0: d + len * 0.15, d1: d + len * 0.85, h: 16, col: R() < 0.5 ? LANE_NIGHT.lit[R.int(0, 4)] : LANE_NIGHT.cool[R.int(0, 1)], shutter: R() < 0.35 };
      // a drainpipe at the segment boundary
      L.pipes.push({ x: x - side * 0.4, d: d + 0.6, h });
      // a vertical neon sign sticking out
      if (R() < (o.signP ?? 0.55)) {
        const sh = R.range(18, 34);
        L.props.push({ type: 'sign', side, x, d: d + R.range(0.2, 0.8) * len, w: R.range(4.5, 7), y1: -R.range(20, 34), h: sh, col: LANE_NIGHT.neon[R.int(0, 5)], seed: R.int(1, 999), flick: R() < 0.2 });
      }
      // a wall lamp
      if (R() < 0.45) L.props.push({ type: 'lamp', side, x, d: d + R.range(0.3, 0.7) * len, y: -R.range(26, 34) });
      // an AC box on the wall at a random height
      for (const wdw of seg.windows) if (wdw.ac) L.props.push({ type: 'ac', side, x, d: wdw.dc - 4, len: 8, y0: wdw.y1 + 1.5, y1: wdw.y1 + 7.5, out: 4.5 });
      L.segs.push(seg);
      d += len;
      i++;
    }
  }
  // wires across the lane and laundry lines
  for (let d = d0 + 30; d < d1; d += R.range(40, 110)) {
    const n = R.int(1, 3);
    for (let k = 0; k < n; k++) L.wires.push({ d: d + k * 2.5, yl: -R.range(80, 110), yr: -R.range(80, 110), sag: R.range(4, 12) });
  }
  for (let k = 0; k < (o.laundry ?? 3); k++) {
    const d = lerp(d0 + 80, d1 * 0.6, (k + R()) / (o.laundry ?? 3));
    const clothes = [];
    for (let x = -half + 3; x < half - 3; x += R.range(3.5, 7)) if (R() < 0.7) clothes.push({ x, w: R.range(2.5, 4.5), h: R.range(4, 9), col: ['#8c6e8c', '#6d7fa6', '#b7a58a', '#7e9a8c', '#c7c0d8', '#a3606a'][R.int(0, 5)], seed: R.int(1, 999) });
    L.laundry.push({ d, y: -R.range(46, 62), sag: R.range(2, 4), clothes });
  }
  return L;
}

const fogMix = (col, d, fogCol, fogD) => mix(col, fogCol, clamp(1 - Math.exp(-Math.max(0, d) / fogD), 0, 0.85));

function catY(xa, xb, ya, yb, sag, u) {
  return lerp(ya, yb, u) + sag * 4 * u * (1 - u);
}

/**
 * Paint the lane. o: { t, pal, fogD, mirror (reflection pass), rainy, dim(d) }
 * Draw order: walls (far to near), protrusions (far to near), overhead.
 */
export function drawLane(ctx, view, L, o = {}) {
  const t = o.t || 0;
  const pal = o.pal || LANE_NIGHT;
  const fogD = o.fogD ?? 380;
  const mir = !!o.mirror;
  const F = (c, d) => css(fogMix(c, d, pal.fog, fogD));
  const dn = nearD(view);
  const cz = (x, d) => toCam(view, x, 0, d)[2];
  const segs = L.segs.filter((s) => s.d1 > dn).map((s) => [cz(s.x, (s.d0 + s.d1) / 2), s]).sort((a, b) => b[0] - a[0]).map((e) => e[1]);
  const opt = { mirror: mir };
  for (const s of segs) {
    const dm = Math.max(s.d0, dn);
    // wall
    fill3(ctx, view, wallX(s.x, dm, s.d1, 0, -s.h), F(s.color, (dm + s.d1) / 2), opt);
    if (mir && !o.full) {
      // the reflection pass only needs the lit bits
    } else {
      // storey lines and a darker band at the foot (wet splash zone)
      fill3(ctx, view, wallX(s.x, dm, s.d1, 0, -3.5), css('#0c0d1c', 0.45), opt);
      for (let y = -s.story; y > -s.h; y -= s.story) line3(ctx, view, [[s.x, y, dm], [s.x, y, s.d1]], css('#0b0c1c', 0.35), 0.35, opt);
      // cornice
      fill3(ctx, view, wallX(s.x, dm, s.d1, -s.h, -s.h + 2), F(mix(s.color, '#000000', 0.3), (dm + s.d1) / 2), opt);
    }
    // windows
    for (const w of s.windows) {
      const a = w.dc - w.w / 2, b = w.dc + w.w / 2;
      if (b < dn) continue;
      const aa = Math.max(a, dn);
      if (!w.lit && mir) continue;
      fill3(ctx, view, wallX(s.x, aa, b, w.y1 + 0.8, w.y0 - 0.8), F(pal.frame, w.dc), opt);
      const gl = w.lit ? fogMix(w.col, w.dc, pal.fog, fogD * 2.2) : fogMix(pal.dark, w.dc, pal.fog, fogD);
      fill3(ctx, view, wallX(s.x, aa + 0.5, b - 0.5, w.y1, w.y0), css(gl), opt);
      if (w.lit && !mir) {
        if (w.curtain) fill3(ctx, view, wallX(s.x, aa + 0.5, lerp(a, b, 0.42), w.y1, w.y0), css(mix(gl, '#b0506a', 0.45), 0.9), opt);
        if (w.blind) for (let y = w.y0 + 1.2; y < w.y1 - 0.4; y += 1.3) line3(ctx, view, [[s.x, y, aa + 0.5], [s.x, y, b - 0.5]], css('#6a4a3a', 0.35), 0.25, opt);
        if (w.sil) fill3(ctx, view, wallX(s.x, lerp(a, b, 0.55), lerp(a, b, 0.8), w.y1, lerp(w.y0, w.y1, 0.3)), css('#3a2a30', 0.8), opt);
        // mullion
        line3(ctx, view, [[s.x, w.y0, w.dc], [s.x, w.y1, w.dc]], F(pal.frame, w.dc), 0.4, opt);
      } else if (!mir) {
        // faint sky reflection in dark glass
        fill3(ctx, view, wallX(s.x, aa + 0.5, b - 0.5, lerp(w.y0, w.y1, 0.45), w.y0), css('#8a93c8', 0.07), opt);
      }
      // sill
      if (!mir) fill3(ctx, view, wallX(s.x, aa - 0.3, b + 0.3, w.y1 + 1.2, w.y1 + 0.5), F(mix(s.color, '#ffffff', 0.08), w.dc), opt);
    }
    // shop front at street level
    if (s.shop && s.shop.d1 > dn) {
      const a = Math.max(s.shop.d0, dn), b = s.shop.d1;
      if (s.shop.shutter) {
        fill3(ctx, view, wallX(s.x, a, b, 0, -s.shop.h), F('#343957', (a + b) / 2), opt);
        if (!mir) for (let y = -1; y > -s.shop.h; y -= 0.9) line3(ctx, view, [[s.x, y, a], [s.x, y, b]], css('#1e2238', 0.7), 0.18, opt);
        // a lit strip under the shutter
        fill3(ctx, view, wallX(s.x, a, b, 0, -0.5), css(fogMix(s.shop.col, a, pal.fog, fogD * 2)), opt);
      } else {
        const inner = mix(s.shop.col, '#402a38', 0.42);
        const top = P3(view, s.x, mir ? s.shop.h : -s.shop.h, (a + b) / 2), bot = P3(view, s.x, 0, (a + b) / 2);
        const sg = ctx.createLinearGradient(0, top[1], 0, bot[1]);
        sg.addColorStop(0, css(fogMix(mix(inner, '#ffffff', 0.25), (a + b) / 2, pal.fog, fogD * 2.4)));
        sg.addColorStop(1, css(fogMix(mix(inner, '#1a1020', 0.35), (a + b) / 2, pal.fog, fogD * 2.4)));
        fill3(ctx, view, wallX(s.x, a, b, -0.2, -s.shop.h), sg, opt);
        if (!mir) {
          // interior shelves with goods, a counter, window mullions
          for (let y = -3.5; y > -s.shop.h + 3; y -= 3.8) {
            fill3(ctx, view, wallX(s.x, a + 1, b - 1, y, y - 1.2), css('#5a3e36', 0.55), opt);
            for (let dd = a + 1.5; dd < b - 1.5; dd += 1.6) fill3(ctx, view, wallX(s.x, dd, dd + 0.9, y - 1.2, y - 2.3 - hash01(dd * 3 + y) * 0.8), css(['#e0c090', '#c07a70', '#8fb0d0', '#e8e0c8'][Math.floor(hash01(dd + y * 7) * 4)], 0.45), opt);
          }
          fill3(ctx, view, wallX(s.x, a, b, 0, -3), css('#20182a', 0.75), opt);
          for (let dd = a; dd <= b + 0.01; dd += (b - a) / 4) line3(ctx, view, [[s.x, 0, dd], [s.x, -s.shop.h, dd]], F(pal.frame, dd), 0.35, opt);
          line3(ctx, view, [[s.x, -s.shop.h * 0.62, a], [s.x, -s.shop.h * 0.62, b]], F(pal.frame, (a + b) / 2), 0.25, opt);
          fill3(ctx, view, wallX(s.x, a, b, -s.shop.h, -s.shop.h - 3.2), F('#1a1b33', (a + b) / 2), opt);
          // awning edge
          line3(ctx, view, [[s.x, -s.shop.h - 3.2, a], [s.x, -s.shop.h - 3.2, b]], css(mix(s.shop.col, '#ffffff', 0.3), 0.7), 0.3, opt);
        }
      }
    }
  }
  // drainpipes (vertical lines at the walls)
  if (!mir) for (const p of L.pipes) if (p.d > dn) line3(ctx, view, [[p.x, 0, p.d], [p.x, -p.h + 1, p.d]], F(pal.pipe, p.d), 0.7, opt);
  // protrusions, far to near
  const minD = o.minDist ?? 0;
  const props = L.props.filter((p) => p.d > dn + 1).map((p) => [cz(p.x - p.side * 3, p.d), p]).filter((e) => e[0] > minD).sort((a, b) => b[0] - a[0]).map((e) => e[1]);
  for (const p of props) {
    const inward = -p.side; // toward the lane centre
    if (p.type === 'sign') {
      const x0 = p.x + inward * 0.6, x1 = p.x + inward * (0.6 + p.w);
      const y0 = p.y1 - p.h, y1 = p.y1;
      // bracket
      if (!mir) line3(ctx, view, [[p.x, y0 + 1, p.d], [x0, y0 + 1, p.d]], F('#15162a', p.d), 0.4, opt);
      const on = p.flick ? (hash01(Math.floor((t + p.seed * 37) / 3) * 13 + p.seed) > 0.08 ? 1 : 0.2) : 1;
      const fog = clamp(1 - Math.exp(-p.d / (fogD * 1.8)), 0, 0.7);
      const xa = Math.min(x0, x1), w = Math.abs(x1 - x0);
      onPlane(ctx, view, 'd', xa, y0, p.d, (g) => {
        g.fillStyle = css(fogMix('#16172c', p.d, pal.fog, fogD));
        g.fillRect(0, 0, w, p.h);
        signGlyphs(g, 0, 0, w, p.h, p.col, on * (1 - fog * 0.6), p.seed, mir);
      }, { mirror: mir });
      // the sign's glowing edge (reads when seen side-on)
      line3(ctx, view, [[x1, y0, p.d], [x1, y1, p.d]], css(mix(p.col, '#ffffff', 0.3), 0.8 * on), 0.25, opt);
    } else if (p.type === 'lamp') {
      const x1 = p.x + inward * 3;
      if (!mir) line3(ctx, view, [[p.x, p.y, p.d], [x1, p.y - 0.4, p.d], [x1, p.y + 0.6, p.d]], F('#15162a', p.d), 0.35, opt);
      const [X, Y] = P3(view, x1, mir ? -(p.y + 1.1) : p.y + 1.1, p.d);
      const s = S3(view, p.d, x1);
      if (camDist(view, p.d, x1) < nearC(view)) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      lampGlow(ctx, X, Y, Math.max(2, 9 * s), pal.lamp, 0.9, 0.1);
      if (!mir) lampGlow(ctx, X, Y, Math.max(3, 26 * s), pal.lamp, 0.22, 0.05);
      ctx.restore();
    } else if (p.type === 'ac') {
      if (mir) continue;
      const xo = p.x + inward * p.out;
      const a = p.d, b = p.d + p.len;
      // underside (seen from below), inner side face, front face
      if (-view.cam.y > -p.y1) {} // camera above: top face visible (rare here)
      fill3(ctx, view, [[p.x, p.y1, a], [xo, p.y1, a], [xo, p.y1, b], [p.x, p.y1, b]], F(pal.acBot, a), opt);
      fill3(ctx, view, wallX(xo, a, b, p.y0, p.y1), F(pal.acSide, a), opt);
      fill3(ctx, view, faceD(a, Math.min(p.x, xo), Math.max(p.x, xo), p.y0, p.y1), F(pal.ac, a), opt);
      // fan grille
      const c = P3(view, (p.x + xo) / 2, (p.y0 + p.y1) / 2, a), s = S3(view, a, p.x);
      ctx.strokeStyle = css(fogMix('#30334f', a, pal.fog, fogD));
      ctx.lineWidth = Math.max(0.5, 0.25 * s);
      ctx.beginPath();
      ctx.arc(c[0], c[1], 2.1 * s, 0, TAU);
      ctx.stroke();
      // a drip line of rust / wet streak below
      line3(ctx, view, [[p.x + inward * 0.3, p.y1, a + 2], [p.x + inward * 0.3, p.y1 + 9, a + 2]], css('#0c0d1e', 0.35), 0.5, opt);
    }
  }
  // laundry lines and wires overhead (far to near)
  const over = [...L.laundry.map((l) => ({ k: 'l', d: l.d, l })), ...L.wires.map((w) => ({ k: 'w', d: w.d, w }))].filter((e) => e.d > dn).map((e) => [cz(0, e.d), e]).filter((e) => e[0] > minD).sort((a, b) => b[0] - a[0]).map((e) => e[1]);
  if (!mir) {
    for (const e of over) {
      if (e.k === 'w') {
        const w = e.w, pts = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push([lerp(-L.half, L.half, u), catY(0, 0, w.yl, w.yr, w.sag + Math.sin(t * 0.03 + w.d) * 0.3, u), w.d]);
        }
        line3(ctx, view, pts, F('#090b16', w.d), 0.28, opt);
      } else {
        const l = e.l, pts = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push([lerp(-L.half, L.half, u), l.y + l.sag * 4 * u * (1 - u), l.d]);
        }
        line3(ctx, view, pts, F('#0e0f1c', l.d), 0.2, opt);
        for (const c of l.clothes) {
          const u = (c.x + L.half) / (2 * L.half);
          const y = l.y + l.sag * 4 * u * (1 - u);
          const sway = Math.sin(t * 0.05 + c.seed) * 0.3;
          fill3(ctx, view, [[c.x, y, l.d], [c.x + c.w, y, l.d], [c.x + c.w + sway, y + c.h, l.d], [c.x + sway, y + c.h, l.d]], F(c.col, l.d), opt);
          fill3(ctx, view, [[c.x, y, l.d], [c.x + c.w, y, l.d], [c.x + c.w + sway, y + c.h, l.d], [c.x + sway, y + c.h, l.d]], css('#0a0a20', 0.35), opt);
        }
      }
    }
  }
}

// glyph-like neon strokes on a sign board (screen rect)
function signGlyphs(ctx, x, y, w, h, color, on, seed, mir) {
  const k = Math.min(w, h);
  const vertical = h > w * 1.3;
  const n = vertical ? Math.max(2, Math.round(h / w)) : Math.max(2, Math.round(w / h));
  const p = new Path2D();
  p.rect(x + k * 0.08, y + k * 0.08, w - k * 0.16, h - k * 0.16);
  for (let i = 0; i < n; i++) {
    const cx = vertical ? x + w / 2 : x + (w * (i + 0.5)) / n;
    const cy = vertical ? y + (h * (i + 0.5)) / n : y + h / 2;
    const s = k * 0.27;
    const g = hash01(seed * 31 + i * 7);
    if (g < 0.25) {
      p.moveTo(cx - s, cy - s * 0.7); p.lineTo(cx + s, cy - s * 0.7);
      p.moveTo(cx, cy - s); p.lineTo(cx, cy + s);
      p.moveTo(cx - s, cy + s * 0.3); p.lineTo(cx + s, cy + s * 0.3);
    } else if (g < 0.5) {
      p.moveTo(cx - s, cy - s); p.lineTo(cx - s, cy + s); p.lineTo(cx + s, cy + s); p.lineTo(cx + s, cy - s);
      p.moveTo(cx - s, cy); p.lineTo(cx + s, cy);
    } else if (g < 0.75) {
      p.moveTo(cx + s, cy); p.arc(cx, cy, s, 0, TAU);
      p.moveTo(cx - s * 0.5, cy - s * 0.3); p.lineTo(cx + s * 0.5, cy + s * 0.3);
    } else {
      p.moveTo(cx - s, cy + s); p.lineTo(cx - s * 0.3, cy - s); p.lineTo(cx + s * 0.3, cy + s * 0.2); p.lineTo(cx + s, cy - s);
    }
  }
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [wk, a, c] of [[0.36, 0.14, color], [0.16, 0.45, color], [0.065, 0.95, mix(color, '#ffffff', 0.65)]]) {
    ctx.strokeStyle = css(c, a * on * (mir ? 0.8 : 1));
    ctx.lineWidth = k * wk * (mir ? 1.6 : 1);
    ctx.stroke(p);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Ground of the lane with its wet reflection (call before drawLane).
 * o: { t, pal, puddles: [{x, d, rx, rz}], refl (0..1), fogD }
 */
export function drawLaneGround(ctx, view, L, o = {}) {
  const pal = o.pal || LANE_NIGHT;
  const W = view.W, H = view.H;
  const dn = nearD(view);
  const d0 = Math.max(L.d0, dn), d1 = L.d1;
  // asphalt, lighter toward the glowing far end
  const yFar = view.cam.yaw ? view.oy : P3(view, 0, 0, d1)[1];
  const yNear = view.cam.yaw ? H : Math.min(H, P3(view, 0, 0, d0)[1]);
  const g = ctx.createLinearGradient(0, yFar, 0, yNear);
  g.addColorStop(0, pal.groundFar);
  g.addColorStop(0.25, pal.wet);
  g.addColorStop(1, pal.ground);
  fill3(ctx, view, floorY(0, -L.half - 4, L.half + 4, d0, d1 + 100), g);
  // reflection: render the lit parts mirrored into a half-res buffer, blur,
  // and lay it on the ground (stronger in puddles)
  const refl = o.refl ?? 0.7;
  if (refl > 0) {
    const B = scratchBuffer('laneRefl', Math.round(W / 2), Math.round(H / 2));
    const b = B.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, B.width, B.height);
    b.setTransform(0.5, 0, 0, 0.5, 0, 0);
    if (o.endGlow !== false) drawLaneEnd(b, view, L, Object.assign({}, o, { mirror: true }));
    drawLane(b, view, L, Object.assign({}, o, { mirror: true }));
    const C = scratchBuffer('laneRefl2', Math.round(W / 2), Math.round(H / 2));
    const c = C.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'copy';
    c.filter = `blur(${(2.2 * W / 1920).toFixed(2)}px)`;
    c.drawImage(B, 0, 0);
    c.filter = 'none';
    c.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    path3(ctx, view, floorY(0, -L.half, L.half, d0, d1 + 100));
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    // smear vertically: a few offset copies (wet streaks)
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.2 * refl * (1 - i * 0.18);
      ctx.drawImage(C, 0, i * 4 * (W / 1920), W, H);
    }
    ctx.restore();
    // puddles: mirror-bright patches
    for (const pd of o.puddles || []) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const pts = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        const w = 1 + 0.12 * Math.sin(a * 3 + pd.x) + 0.08 * Math.sin(a * 5 + pd.d);
        pts.push([pd.x + Math.cos(a) * pd.rx * w, 0, pd.d + Math.sin(a) * pd.rz * w]);
      }
      if (path3(ctx, view, pts)) {
        ctx.fillStyle = css('#0b0e1c', 0.55);
        ctx.fill();
        ctx.clip();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.7 * refl;
        ctx.drawImage(C, 0, 0, W, H);
        // sky in the puddle
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#3a3f78';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }
  }
  // gutters along the walls
  for (const sd of [-1, 1]) line3(ctx, view, [[sd * (L.half - 1.2), 0, d0], [sd * (L.half - 1.2), 0, d1]], css('#0a0b16', 0.5), 0.5);
  // lamp pools on the ground
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const hc = Math.max(0.3, -view.cam.y);
  for (const p of L.props) {
    if (p.type !== 'lamp' && p.type !== 'sign') continue;
    if (p.d < dn + 2) continue;
    const x = p.x - p.side * (p.type === 'lamp' ? 5 : 4);
    if (camDist(view, p.d, x) < nearC(view) * 2) continue;
    const [X, Y] = P3(view, x, 0, p.d);
    const s = S3(view, p.d, x);
    const r = p.type === 'lamp' ? 11 : 7;
    const rx = r * s, ry = Math.max(0.5, (r * hc * s) / camDist(view, p.d, x));
    const col = p.type === 'lamp' ? (o.pal || LANE_NIGHT).lamp : p.col;
    const a = p.type === 'lamp' ? 0.32 : 0.22;
    const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    gg.addColorStop(0, css(col, a));
    gg.addColorStop(1, css(col, 0));
    ctx.save();
    ctx.translate(X, Y);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = gg;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }
  ctx.restore();
}

/** The bright cross street at the far end of the lane (a glowing gap). */
export function drawLaneEnd(ctx, view, L, o = {}) {
  const pal = o.pal || LANE_NIGHT;
  const t = o.t || 0;
  const mir = !!o.mirror;
  const d = L.d1;
  const A = P3(view, -L.half, mir ? 0 : -60, d), B = P3(view, L.half, mir ? 60 : 0, d);
  const x0 = A[0], x1 = B[0], y0 = Math.min(A[1], B[1]), y1 = Math.max(A[1], B[1]);
  const w = x1 - x0, h = y1 - y0;
  if (w < 1) return;
  const gy = mir ? y0 : y1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  const g = ctx.createLinearGradient(0, gy, 0, mir ? y1 : y0);
  g.addColorStop(0, css(pal.endGlow, mir ? 0.45 : 0.9));
  g.addColorStop(0.5, css('#8a5a7a', mir ? 0.3 : 0.6));
  g.addColorStop(1, css('#2a2a50', 0.3));
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, h);
  // blurred shop lights and a passing car
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 9; i++) {
    const u = hash01(i * 7 + 1), v = hash01(i * 13 + 2);
    const col = [pal.endGlow, '#ff7fb0', '#7fd8ff', '#ffe0a0'][i % 4];
    lampGlow(ctx, x0 + u * w, mir ? y0 + v * h * 0.6 : y1 - v * h * 0.6, w * (0.08 + 0.08 * hash01(i)), col, 0.5, 0.2);
  }
  const cp = ((t * 0.006 + 0.3) % 1.6) - 0.3;
  if (cp > -0.2 && cp < 1.2) {
    lampGlow(ctx, x0 + cp * w, gy + (mir ? h * 0.05 : -h * 0.05), w * 0.12, '#fff2d0', 0.7, 0.15);
    lampGlow(ctx, x0 + (cp - 0.12) * w, gy + (mir ? h * 0.05 : -h * 0.05), w * 0.06, '#ff5040', 0.5, 0.15);
  }
  ctx.restore();
}

/** Rain splashes on the lane floor (crowns and rings), stateless. */
export function laneRainHits(ctx, view, L, t, o = {}) {
  const n = o.n ?? 220;
  const life = 9;
  const dMax = o.dMax ?? 260;
  const cn = nearC(view);
  const K = view.base * view.cam.z * view.D;
  ctx.save();
  if (path3(ctx, view, floorY(0, -L.half, L.half, L.d0, L.d1))) ctx.clip();
  ctx.strokeStyle = css(o.color || '#cfd8f0', 0.5);
  for (let i = 0; i < n; i++) {
    const per = life + Math.floor(hash01(i * 3) * 10);
    const cyc = Math.floor((t + hash01(i * 7) * per) / per);
    const a = ((t + hash01(i * 7) * per) % per) / life;
    if (a > 1) continue;
    const u = hash01(i * 11 + cyc * 17), v = hash01(i * 19 + cyc * 23);
    const dc = cn + (o.dMin ?? 8) + Math.pow(v, 1.3) * dMax;
    const s = K / dc;
    const xc = (u - 0.5) * (view.W * 1.1) / s;
    const [X, Y] = projC(view, [xc, -view.cam.y, dc]);
    if (X < -20 || X > view.W + 20 || Y > view.H + 10) continue;
    const r = (0.1 + a * 0.4) * s;
    const hc = Math.max(0.3, -view.cam.y);
    const ry = Math.max(0.3, (r * hc) / dc);
    ctx.globalAlpha = (1 - a) * 0.8;
    ctx.lineWidth = Math.max(0.5, 0.05 * s);
    ctx.beginPath();
    ctx.ellipse(X, Y, r, ry, 0, 0, TAU);
    ctx.stroke();
    if (a < 0.3) {
      // crown droplets
      ctx.beginPath();
      ctx.moveTo(X - r * 0.6, Y);
      ctx.lineTo(X - r * 0.9, Y - r * 0.9);
      ctx.moveTo(X + r * 0.6, Y);
      ctx.lineTo(X + r * 0.9, Y - r * 0.9);
      ctx.stroke();
    }
  }
  ctx.restore();
}
