// City painters (layer units, y-down, ground at y = 0 unless given).
import { css, mix, smoothTo } from '../core/draw.js';
import { hash01, noise1, clamp, lerp, TAU, smoothstep } from '../core/math.js';
import { glow } from './sky.js';
import { neonSign, lampGlow } from './light.js';

export const NEON = ['#ff5f9e', '#4fe3ff', '#ffb347', '#8dff9a', '#c98bff', '#ff7a5c'];
// screen-space light registry: painters push {x, y, r, color, a} for later pools/reflections
function pushLight(ctx, list, x, y, r, color, a = 1) {
  if (!list) return;
  const m = ctx.getTransform();
  list.push({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, r: r * Math.hypot(m.a, m.b), color, a });
}

// deterministic building segmentation along x
export function buildingsIn(x0, x1, seed, minW, maxW) {
  const out = [];
  // fixed grid of slots to keep things stable: slot width = maxW
  const k0 = Math.floor(x0 / maxW) - 1, k1 = Math.ceil(x1 / maxW) + 1;
  for (let k = k0; k <= k1; k++) {
    const s = seed * 1009 + k * 131;
    const w = lerp(minW, maxW, hash01(s));
    const x = k * maxW + (maxW - w) * hash01(s + 1);
    out.push({ x, w, s });
  }
  return out;
}

/**
 * Far skyline silhouettes: flat blocks with sparse warm windows.
 * spec: { base, hMin, hMax, minW, maxW, color, win, winP, seed, antenna }
 */
export function skyline(ctx, view, p, t, spec) {
  const [x0, x1] = view.xRange(p, 0.2);
  const bs = buildingsIn(x0, x1, spec.seed, spec.minW, spec.maxW);
  for (const b of bs) {
    const h = lerp(spec.hMin, spec.hMax, hash01(b.s + 2));
    const top = spec.base - h;
    ctx.fillStyle = spec.color;
    ctx.fillRect(b.x, top, b.w, h + 600);
    // rooftop details
    if (hash01(b.s + 3) < 0.4) ctx.fillRect(b.x + b.w * 0.2, top - h * 0.06, b.w * 0.25, h * 0.06 + 0.01);
    if (spec.antenna && hash01(b.s + 4) < 0.35) {
      ctx.fillRect(b.x + b.w * 0.7, top - h * 0.18, Math.max(0.03, b.w * 0.02), h * 0.18);
      // blinking red aviation light
      const on = Math.sin(t * 0.09 + b.s) > 0.2;
      if (on) {
        glow(ctx, b.x + b.w * 0.7 + b.w * 0.01, top - h * 0.18, b.w * 0.09, '#ff4a3d', 0.55);
        ctx.fillStyle = '#ffb0a0';
        ctx.fillRect(b.x + b.w * 0.7 - b.w * 0.005, top - h * 0.18 - b.w * 0.01, b.w * 0.03, b.w * 0.02);
        ctx.fillStyle = spec.color;
      }
    }
    // windows
    if (spec.win) {
      const cols = Math.max(1, Math.floor(b.w / (spec.winGap || 0.8)));
      const rows = Math.max(1, Math.floor(h / (spec.winGapY || 0.9)));
      const ww = (b.w / cols) * 0.42, wh = (spec.winGapY || 0.9) * 0.4;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const hs = hash01(b.s * 7 + r * 31 + c * 7);
          if (hs > (spec.winP || 0.2)) continue;
          // occasional lights turning off/on over time
          const flick = spec.flick ? hash01(b.s + r * 5 + c + Math.floor((t + hs * 400) / 400)) > 0.08 : true;
          if (!flick) continue;
          ctx.fillStyle = spec.win[Math.floor(hash01(hs * 991) * spec.win.length)];
          ctx.fillRect(b.x + (c + 0.29) * (b.w / cols), top + (r + 0.35) * (spec.winGapY || 0.9), ww, wh);
        }
      }
    }
  }
}

/**
 * Near facades with detail: windows (lit/dark/curtained), sills, AC units,
 * pipes, balconies, signs. Returns list of AC unit platforms for staging.
 * spec: { base (ground y), hMin, hMax, minW, maxW, seed, palette:{walls[], frame, dark, lit[], ac, pipe, trim, shadow}, floorH }
 */
export function facades(ctx, view, p, t, spec) {
  const [x0, x1] = view.xRange(p, 0.2);
  const bs = buildingsIn(x0, x1, spec.seed, spec.minW, spec.maxW);
  const P = spec.palette;
  const fh = spec.floorH || 2.4;
  for (const b of bs) {
    const h = lerp(spec.hMin, spec.hMax, hash01(b.s + 2));
    const top = spec.base - h;
    const wall = P.walls[Math.floor(hash01(b.s + 5) * P.walls.length)];
    ctx.fillStyle = wall;
    ctx.fillRect(b.x, top, b.w, h + 0.02);
    // vertical shadow on one side (volume)
    ctx.fillStyle = P.shadow;
    ctx.fillRect(b.x + b.w * 0.94, top, b.w * 0.06, h);
    // roof trim
    ctx.fillStyle = P.trim;
    ctx.fillRect(b.x - 0.08, top - 0.12, b.w + 0.16, 0.18);
    // floors
    const floors = Math.floor((h - 1.2) / fh);
    const cols = Math.max(1, Math.floor(b.w / 2.2));
    const cw = b.w / cols;
    for (let f = 0; f < floors; f++) {
      const fy = spec.base - 1.4 - (f + 1) * fh + 0.4;
      for (let c = 0; c < cols; c++) {
        const s = b.s * 13 + f * 71 + c * 17;
        const wx = b.x + c * cw + cw * 0.22, ww = cw * 0.56, wh = fh * 0.5;
        const kind = hash01(s);
        // frame
        ctx.fillStyle = P.frame;
        ctx.fillRect(wx - 0.06, fy - 0.06, ww + 0.12, wh + 0.12);
        if (kind < (spec.litP ?? 0.3)) {
          const lc = P.lit[Math.floor(hash01(s + 1) * P.lit.length)];
          ctx.fillStyle = lc;
          ctx.fillRect(wx, fy, ww, wh);
          // curtain / silhouette inside
          if (hash01(s + 2) < 0.5) {
            ctx.fillStyle = css(mix(lc, '#6b4a3a', 0.35));
            ctx.fillRect(wx, fy, ww * 0.3, wh);
          }
          if (spec.glowWin) glow(ctx, wx + ww / 2, fy + wh / 2, ww * 1.3, lc, 0.28);
        } else {
          ctx.fillStyle = P.dark;
          ctx.fillRect(wx, fy, ww, wh);
          // cold reflection streak
          ctx.fillStyle = P.reflect || 'rgba(160,190,230,0.12)';
          ctx.beginPath();
          ctx.moveTo(wx + ww * 0.2, fy);
          ctx.lineTo(wx + ww * 0.45, fy);
          ctx.lineTo(wx + ww * 0.15, fy + wh);
          ctx.lineTo(wx, fy + wh);
          ctx.lineTo(wx, fy + wh * 0.6);
          ctx.fill();
        }
        // mullion
        ctx.fillStyle = P.frame;
        ctx.fillRect(wx + ww / 2 - 0.03, fy, 0.06, wh);
        // sill
        ctx.fillStyle = P.trim;
        ctx.fillRect(wx - 0.12, fy + wh + 0.06, ww + 0.24, 0.1);
        // AC unit under some windows
        if (hash01(s + 3) < (spec.acP ?? 0.35)) {
          const ax = wx + ww * (hash01(s + 4) < 0.5 ? 0 : 0.35), ay = fy + wh + 0.3;
          acUnit(ctx, ax, ay, 1.1, 0.75, P, s);
        }
        // balcony railing
        if (spec.balcony && hash01(s + 6) < 0.18) {
          ctx.fillStyle = P.frame;
          ctx.fillRect(wx - 0.3, fy + wh * 0.55, ww + 0.6, 0.08);
          for (let k = 0; k <= 6; k++) ctx.fillRect(wx - 0.3 + (k / 6) * (ww + 0.6) - 0.02, fy + wh * 0.55, 0.04, wh * 0.45 + 0.12);
        }
      }
    }
    // drain pipe
    if (hash01(b.s + 8) < 0.7) {
      ctx.fillStyle = P.pipe;
      const px = b.x + b.w * (hash01(b.s + 9) < 0.5 ? 0.03 : 0.9);
      ctx.fillRect(px, top + 0.1, 0.16, h - 0.1);
      for (let y = top + 1; y < spec.base; y += 2.3) ctx.fillRect(px - 0.05, y, 0.26, 0.08);
    }
    // ground-floor: door / shutter
    ctx.fillStyle = P.dark;
    const dx = b.x + b.w * (0.2 + 0.4 * hash01(b.s + 10));
    ctx.fillRect(dx, spec.base - 2.1, 1.1, 2.1);
    ctx.fillStyle = P.frame;
    ctx.fillRect(dx - 0.1, spec.base - 2.2, 1.3, 0.12);
    if (spec.shop && hash01(b.s + 11) < 0.55) {
      // lit shop front: warm interior, shelves, awning, sign board
      const sx = b.x + b.w * (0.12 + 0.3 * hash01(b.s + 12)), sw = Math.min(b.w * 0.5, 4.2);
      const warm = hash01(b.s + 13) < 0.7 ? '#ffd79a' : '#dff4ff';
      const g = ctx.createLinearGradient(0, spec.base - 2.5, 0, spec.base);
      g.addColorStop(0, css(warm, 0.95));
      g.addColorStop(1, css(mix(warm, '#ff9f5a', 0.35), 0.95));
      ctx.fillStyle = g;
      ctx.fillRect(sx, spec.base - 2.5, sw, 2.5);
      ctx.fillStyle = 'rgba(60,40,40,0.35)';
      for (let k = 0; k < 3; k++) ctx.fillRect(sx + 0.2, spec.base - 2.2 + k * 0.72, sw - 0.4, 0.12);
      ctx.fillStyle = P.frame;
      ctx.fillRect(sx + sw * 0.5 - 0.05, spec.base - 2.5, 0.1, 2.5);
      const aw = NEON[Math.floor(hash01(b.s + 14) * NEON.length)];
      ctx.fillStyle = css(mix(aw, '#2a2030', 0.45));
      ctx.beginPath();
      ctx.moveTo(sx - 0.3, spec.base - 2.6);
      ctx.lineTo(sx + sw + 0.3, spec.base - 2.6);
      ctx.lineTo(sx + sw + 0.1, spec.base - 3.2);
      ctx.lineTo(sx - 0.1, spec.base - 3.2);
      ctx.fill();
      if (spec.glowWin) glow(ctx, sx + sw / 2, spec.base - 1.2, sw * 0.9, warm, 0.35);
      pushLight(ctx, spec.lights, sx + sw / 2, spec.base, sw * 0.9, warm, 0.9);
      if (spec.neon !== undefined) neonSign(ctx, sx, spec.base - 4.1, sw, 0.8, aw, t, b.s, { flicker: hash01(b.s + 15) < 0.25 });
    }
    // vertical neon sign hanging off the wall
    if (spec.neon && hash01(b.s + 20) < spec.neon) {
      const col = NEON[Math.floor(hash01(b.s + 21) * NEON.length)];
      const nx = b.x + b.w * (hash01(b.s + 22) < 0.5 ? 0.04 : 0.8);
      const ny = spec.base - 5.2 - 4.5 * hash01(b.s + 23);
      const nh = 3.2 + 2.2 * hash01(b.s + 24);
      ctx.fillStyle = P.frame;
      ctx.fillRect(nx + 0.45, ny - 0.3, 0.12, 0.3);
      neonSign(ctx, nx, ny, 1.05, nh, col, t, b.s * 3, { flicker: hash01(b.s + 25) < 0.3 });
      pushLight(ctx, spec.lights, nx + 0.5, ny + nh / 2, nh * 0.9, col, 0.7);
    }
  }
}

export function acUnit(ctx, x, y, w, h, P, s = 1) {
  ctx.fillStyle = P.ac;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.acShade || 'rgba(0,0,0,0.18)';
  ctx.fillRect(x, y + h * 0.82, w, h * 0.18);
  // fan grille
  ctx.strokeStyle = P.acShade || 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.arc(x + w * 0.62, y + h * 0.45, h * 0.3, 0, TAU);
  ctx.moveTo(x + w * 0.1, y + h * 0.25);
  ctx.lineTo(x + w * 0.3, y + h * 0.25);
  ctx.moveTo(x + w * 0.1, y + h * 0.45);
  ctx.lineTo(x + w * 0.3, y + h * 0.45);
  ctx.stroke();
  // bracket
  ctx.fillStyle = P.frame;
  ctx.fillRect(x + w * 0.1, y + h, 0.05, 0.25);
  ctx.fillRect(x + w * 0.85, y + h, 0.05, 0.25);
}

/**
 * Power / telephone wires: catenaries between poles at given x positions.
 * spec: { poles:[x...], topY, wires:[dy...], sag, color, width, sway(t) }
 */
export function wires(ctx, spec, t = 0) {
  ctx.strokeStyle = spec.color;
  ctx.lineWidth = spec.width || 0.035;
  ctx.lineCap = 'round';
  const sway = spec.sway ? spec.sway(t) : 0;
  ctx.beginPath();
  for (let i = 0; i + 1 < spec.poles.length; i++) {
    const a = spec.poles[i], b = spec.poles[i + 1];
    for (let k = 0; k < spec.wires.length; k++) {
      const dy = spec.wires[k];
      const y0 = (spec.topYAt ? spec.topYAt(a) : spec.topY) + dy, y1 = (spec.topYAt ? spec.topYAt(b) : spec.topY) + dy;
      const sag = (spec.sag || 0.8) * (1 + 0.15 * k) * (b - a) / 10;
      const mx = (a + b) / 2 + sway * (b - a) * 0.01, my = (y0 + y1) / 2 + sag * 2;
      ctx.moveTo(a, y0);
      ctx.quadraticCurveTo(mx, my, b, y1);
    }
  }
  ctx.stroke();
}

export function pole(ctx, x, base, h, color, arm = true) {
  ctx.fillStyle = color;
  ctx.fillRect(x - 0.14, base - h, 0.28, h);
  if (arm) {
    ctx.fillRect(x - 1.1, base - h + 0.5, 2.2, 0.14);
    ctx.fillRect(x - 0.8, base - h + 1.2, 1.6, 0.12);
    for (const dx of [-1, -0.5, 0.5, 1]) ctx.fillRect(x + dx - 0.04, base - h + 0.36, 0.08, 0.16);
  }
}

// street lamp with light cone + halo. on = 0..1
export function streetLamp(ctx, x, base, h, P, on = 1, flicker = 0) {
  ctx.fillStyle = P.pole;
  ctx.fillRect(x - 0.1, base - h, 0.2, h);
  ctx.beginPath();
  ctx.moveTo(x, base - h);
  ctx.quadraticCurveTo(x + 0.2, base - h - 0.6, x + 1.0, base - h - 0.5);
  ctx.lineWidth = 0.14;
  ctx.strokeStyle = P.pole;
  ctx.stroke();
  const hx = x + 1.05, hy = base - h - 0.45;
  ctx.fillStyle = P.pole;
  ctx.beginPath();
  ctx.moveTo(hx - 0.45, hy);
  ctx.lineTo(hx + 0.45, hy);
  ctx.lineTo(hx + 0.3, hy - 0.2);
  ctx.lineTo(hx - 0.3, hy - 0.2);
  ctx.fill();
  if (on > 0) {
    const a = on * (1 - flicker);
    ctx.fillStyle = css(P.light, a);
    ctx.fillRect(hx - 0.32, hy, 0.64, 0.08);
    // cone
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createLinearGradient(0, hy, 0, base);
    g.addColorStop(0, css(P.light, 0.32 * a));
    g.addColorStop(1, css(P.light, 0.03 * a));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(hx - 0.3, hy);
    ctx.lineTo(hx + 0.3, hy);
    ctx.lineTo(hx + 2.8, base);
    ctx.lineTo(hx - 2.8, base);
    ctx.closePath();
    ctx.fill();
    glow(ctx, hx, hy + 0.1, 1.6, P.light, 0.5 * a);
    // pool of light on the ground
    const pg = ctx.createRadialGradient(hx, base, 0, hx, base, 3.2);
    pg.addColorStop(0, css(P.light, 0.35 * a));
    pg.addColorStop(1, css(P.light, 0));
    ctx.fillStyle = pg;
    ctx.save();
    ctx.translate(hx, base);
    ctx.scale(1, 0.22);
    ctx.translate(-hx, -base);
    ctx.fillRect(hx - 3.2, base - 3.2, 6.4, 6.4);
    ctx.restore();
    ctx.restore();
  }
  return [hx, hy];
}

/**
 * Parked hatchback (side view). Returns parts to draw in two passes:
 * back (far wheels) and front (body + near wheels). x = rear bumper, base = ground.
 */
export function car(ctx, x, base, P, pass = 'front', scale = 1) {
  const L = 7.2 * scale, H = 2.9 * scale, clr = (P.clr ?? 0.95) * scale, wr = 0.62 * scale;
  const w1 = x + L * 0.2, w2 = x + L * 0.8;
  if (pass === 'back') {
    ctx.fillStyle = P.tire;
    for (const wx of [w1 + 0.15 * scale, w2 + 0.15 * scale]) {
      ctx.beginPath();
      ctx.arc(wx, base - wr, wr, 0, TAU);
      ctx.fill();
    }
    return;
  }
  // body
  ctx.fillStyle = P.body;
  ctx.beginPath();
  ctx.moveTo(x, base - clr);
  ctx.lineTo(x, base - H * 0.55);
  ctx.quadraticCurveTo(x + L * 0.02, base - H * 0.62, x + L * 0.12, base - H * 0.64);
  ctx.lineTo(x + L * 0.22, base - H * 0.97);
  ctx.quadraticCurveTo(x + L * 0.26, base - H * 1.02, x + L * 0.34, base - H * 1.02);
  ctx.lineTo(x + L * 0.62, base - H * 1.0);
  ctx.quadraticCurveTo(x + L * 0.68, base - H * 0.98, x + L * 0.74, base - H * 0.7);
  ctx.lineTo(x + L * 0.96, base - H * 0.62);
  ctx.quadraticCurveTo(x + L * 1.0, base - H * 0.58, x + L, base - H * 0.42);
  ctx.lineTo(x + L, base - clr);
  // wheel arches
  for (const wx of [w2, w1]) {
    ctx.lineTo(wx + wr * 1.2, base - clr);
    ctx.arc(wx, base - wr, wr * 1.2, 0, Math.PI, true);
  }
  ctx.closePath();
  ctx.fill();
  // windows
  ctx.fillStyle = P.glass;
  ctx.beginPath();
  ctx.moveTo(x + L * 0.25, base - H * 0.93);
  ctx.lineTo(x + L * 0.61, base - H * 0.93);
  ctx.quadraticCurveTo(x + L * 0.66, base - H * 0.9, x + L * 0.7, base - H * 0.68);
  ctx.lineTo(x + L * 0.17, base - H * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = P.body;
  ctx.fillRect(x + L * 0.43, base - H * 0.95, 0.12 * scale, H * 0.3);
  // reflection on glass
  ctx.fillStyle = P.glassHi || 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(x + L * 0.3, base - H * 0.93);
  ctx.lineTo(x + L * 0.36, base - H * 0.93);
  ctx.lineTo(x + L * 0.3, base - H * 0.68);
  ctx.lineTo(x + L * 0.24, base - H * 0.68);
  ctx.fill();
  // beltline highlight (wet roof reflection)
  ctx.fillStyle = P.hi;
  ctx.fillRect(x + L * 0.26, base - H * 1.02, L * 0.36, 0.06 * scale);
  ctx.fillRect(x + L * 0.02, base - H * 0.62, L * 0.96, 0.05 * scale);
  // lights
  ctx.fillStyle = P.tail || '#b0473f';
  ctx.fillRect(x - 0.02, base - H * 0.55, 0.14 * scale, 0.3 * scale);
  // near wheels
  for (const wx of [w1, w2]) {
    ctx.fillStyle = P.tire;
    ctx.beginPath();
    ctx.arc(wx, base - wr, wr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = P.rim;
    ctx.beginPath();
    ctx.arc(wx, base - wr, wr * 0.55, 0, TAU);
    ctx.fill();
  }
}

// brick / concrete wall block with a cap (walkable top at base - h)
export function wall(ctx, x0, x1, base, h, P) {
  ctx.fillStyle = P.wall;
  ctx.fillRect(x0, base - h, x1 - x0, h);
  ctx.fillStyle = P.cap;
  ctx.fillRect(x0 - 0.1, base - h - 0.18, x1 - x0 + 0.2, 0.22);
  ctx.strokeStyle = P.line || 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  for (let y = base - h + 0.45; y < base; y += 0.45) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    const off = (Math.round((y - base) / 0.45) % 2) * 0.45;
    for (let x = x0 + off; x < x1; x += 0.9) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 0.45);
    }
  }
  ctx.stroke();
  ctx.fillStyle = P.wet || 'rgba(255,255,255,0.08)';
  ctx.fillRect(x0 - 0.1, base - h - 0.18, x1 - x0 + 0.2, 0.05);
}

// wet street: asphalt band + curb + puddles (with reflected lights)
export function street(ctx, view, p, t, spec) {
  const [x0, x1] = view.xRange(p, 0.1);
  const P = spec.palette;
  const base = spec.base || 0;
  ctx.fillStyle = P.sidewalk;
  ctx.fillRect(x0, base, x1 - x0, 1.2);
  ctx.fillStyle = P.curb;
  ctx.fillRect(x0, base + 1.2, x1 - x0, 0.2);
  ctx.fillStyle = P.road;
  ctx.fillRect(x0, base + 1.4, x1 - x0, 40);
  // tile joints
  ctx.strokeStyle = P.joint;
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  for (let x = Math.floor(x0); x < x1; x += 1.5) {
    ctx.moveTo(x, base);
    ctx.lineTo(x - 0.3, base + 1.2);
  }
  ctx.stroke();
  // puddles
  if (spec.puddles) {
    for (const pd of spec.puddles) {
      if (pd.x + pd.w < x0 || pd.x - pd.w > x1) continue;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(pd.x, pd.y, pd.w, pd.h, 0, 0, TAU);
      ctx.clip();
      ctx.fillStyle = P.puddle;
      ctx.fillRect(pd.x - pd.w, pd.y - pd.h, pd.w * 2, pd.h * 2);
      if (pd.reflect) pd.reflect(ctx, t);
      // shimmer
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const yy = pd.y - pd.h * 0.6 + i * pd.h * 0.35;
        const off = Math.sin(t * 0.05 + i * 2) * pd.w * 0.2;
        ctx.moveTo(pd.x - pd.w * 0.5 + off, yy);
        ctx.lineTo(pd.x + pd.w * 0.1 + off, yy);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}
