// Weather & light effects, stateless (pure functions of t). Screen-space
// helpers take (ctx, W, H, t, spec); layer-space helpers take a view.
import { css } from '../core/draw.js';
import { hash01, noise1, clamp, lerp, TAU, smoothstep } from '../core/math.js';

/**
 * Rain streaks in screen space, in depth layers. spec: { density (0..1+),
 * angle (rad from vertical, + = toward +x), speed (screen heights/frame),
 * len, color, alpha, seed, camDX (px/frame camera motion for parallax) }
 */
export function rain(ctx, W, H, t, spec) {
  const layers = spec.layers || [[0.35, 0.55, 0.6], [0.65, 0.8, 0.85], [1.0, 1.0, 1.1]]; // [depth, alpha, width]
  const s = W / 1920;
  const ang = spec.angle || 0.15;
  const sin = Math.sin(ang), cos = Math.cos(ang);
  ctx.save();
  ctx.lineCap = 'round';
  for (let L = 0; L < layers.length; L++) {
    const [depth, a, wk] = layers[L];
    const n = Math.round((spec.density ?? 1) * 260 * depth);
    const speed = (spec.speed || 0.09) * H * (0.6 + 0.5 * depth);
    const len = (spec.len || 60) * s * (0.5 + 0.7 * depth) * (0.7 + 0.6 * speed / H / 0.09);
    ctx.strokeStyle = css(spec.color || '#c9d6e6', (spec.alpha ?? 0.5) * a);
    ctx.lineWidth = Math.max(0.6 * s, 1.3 * s * wk * depth);
    ctx.beginPath();
    const span = H + len + 200 * s;
    for (let i = 0; i < n; i++) {
      const seed = (spec.seed || 1) * 7919 + L * 104729 + i * 31;
      const x0 = hash01(seed) * (W + H * Math.abs(sin) * 2) - H * Math.max(0, sin) * 1.2;
      const phase = hash01(seed + 1) * span;
      const y = ((phase + t * speed) % span) - len - 100 * s;
      const x = x0 + (y + len) * sin / cos + (spec.camDX || 0) * t * depth * 0;
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * sin, y - len * cos);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Rain impacts on a ground line in layer space: little crowns + expanding
 * ripple rings (in puddles). spec: { ground(x), rate (impacts/unit/frame),
 * puddle(x) -> bool, color, seed }
 */
export function rainImpacts(ctx, view, p, t, spec) {
  const [x0, x1] = view.xRange(p, 0.05);
  const cell = 0.5;
  const life = 10;
  ctx.save();
  ctx.lineCap = 'round';
  const i0 = Math.floor(x0 / cell), i1 = Math.ceil(x1 / cell);
  ctx.strokeStyle = css(spec.color || '#dfe8f2', 0.55);
  ctx.lineWidth = spec.w || 0.02;
  ctx.beginPath();
  const rate = spec.rate ?? 0.06; // impacts per cell per frame
  const per = Math.max(1, Math.round(1 / rate));
  for (let i = i0; i <= i1; i++) {
    // each cell spawns an impact every `per` frames with a random phase
    const ph = Math.floor(hash01(i * 13 + (spec.seed || 1)) * per);
    for (let k = 0; k < Math.ceil(life / per) + 1; k++) {
      const n = Math.floor((t - ph) / per) - k;
      const t0 = n * per + ph;
      const age = t - t0;
      if (age < 0 || age > life) continue;
      const s = i * 7919 + n * 104729 + (spec.seed || 1);
      const x = (i + hash01(s)) * cell;
      const gy = spec.ground(x) + (hash01(s + 1) - 0.5) * (spec.spread || 0.3);
      const u = age / life;
      if (spec.puddle && spec.puddle(x)) {
        // ripple ring (ellipse)
        const r = 0.04 + 0.28 * Math.sqrt(u);
        ctx.moveTo(x + r, gy);
        ctx.ellipse(x, gy, r, r * 0.28, 0, 0, TAU);
      } else if (age < 4) {
        // small crown splash
        const h = 0.08 * (1 - age / 4);
        ctx.moveTo(x - 0.05, gy);
        ctx.lineTo(x - 0.08, gy - h);
        ctx.moveTo(x + 0.05, gy);
        ctx.lineTo(x + 0.08, gy - h);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Falling snow in screen space with depth layers & wind drift.
 * spec: { density, wind (px/frame at depth 1), fall (screen heights/frame), seed, color, alpha, camX (stage units) }
 */
export function snow(ctx, W, H, t, spec) {
  const s = W / 1920;
  const layers = spec.layers || [[0.3, 0.5], [0.6, 0.75], [1.0, 0.95], [1.8, 0.9]];
  for (let L = 0; L < layers.length; L++) {
    const [depth, a] = layers[L];
    const n = Math.round((spec.density ?? 1) * 120 * (L < 3 ? 1 : 0.25));
    const r = (1.4 + depth * 2.4) * s;
    const fall = (spec.fall || 0.0035) * H * (0.5 + 0.6 * depth);
    ctx.fillStyle = css(spec.color || '#ffffff', (spec.alpha ?? 0.9) * a);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const seed = (spec.seed || 3) * 7919 + L * 104729 + i * 31;
      const spanY = H + 40 * s;
      const y = ((hash01(seed) * spanY + t * fall) % spanY) - 20 * s;
      const drift = (spec.wind || 0) * t * depth - (spec.camX || 0) * depth * 30 * s;
      const wob = Math.sin(t * 0.05 * (0.6 + hash01(seed + 2)) + i) * 14 * s * depth;
      const spanX = W + 60 * s;
      const x = ((((hash01(seed + 1) * spanX + drift + wob) % spanX) + spanX) % spanX) - 30 * s;
      const rr = r * (0.6 + 0.6 * hash01(seed + 3));
      ctx.moveTo(x + rr, y);
      ctx.arc(x, y, rr, 0, TAU);
    }
    ctx.fill();
  }
}

// floating dust motes / pollen in light (screen space)
export function motes(ctx, W, H, t, spec) {
  const s = W / 1920;
  const n = spec.n || 40;
  for (let i = 0; i < n; i++) {
    const seed = (spec.seed || 5) * 131 + i * 17;
    const x = (hash01(seed) * W + Math.sin(t * 0.013 + i) * 40 * s + t * (spec.drift || 0.2) * s) % W;
    const y = (hash01(seed + 1) * H + Math.cos(t * 0.011 + i * 1.3) * 30 * s) % H;
    const tw = 0.5 + 0.5 * Math.sin(t * 0.07 + i * 2.1);
    const inBeam = spec.mask ? spec.mask(x / W, y / H) : 1;
    if (inBeam <= 0.02) continue;
    ctx.fillStyle = css(spec.color || '#fff6d8', (spec.alpha ?? 0.7) * tw * inBeam);
    ctx.beginPath();
    ctx.arc(x, y, (1 + 1.6 * hash01(seed + 2)) * s, 0, TAU);
    ctx.fill();
  }
}

/**
 * Light shafts through foliage (screen space, additive). spec: { x0 (top x
 * fraction), spread, n, angle, color, alpha, seed }
 */
export function lightShafts(ctx, W, H, t, spec) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < (spec.n || 5); i++) {
    const seed = (spec.seed || 7) * 37 + i * 11;
    const u = (spec.x0 ?? 0.2) + (spec.spread ?? 0.6) * hash01(seed);
    const w = W * (0.02 + 0.05 * hash01(seed + 1));
    const flick = 0.65 + 0.35 * (0.5 + 0.5 * noise1(t * 0.02 + i * 3, seed));
    const ang = spec.angle ?? 0.35;
    const x = u * W, len = H * 1.25;
    const g = ctx.createLinearGradient(x, 0, x + Math.sin(ang) * len, len);
    g.addColorStop(0, css(spec.color || '#fff3c4', (spec.alpha ?? 0.22) * flick));
    g.addColorStop(0.7, css(spec.color || '#fff3c4', (spec.alpha ?? 0.22) * flick * 0.35));
    g.addColorStop(1, css(spec.color || '#fff3c4', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.3, 0);
    ctx.lineTo(x + w * 0.3, 0);
    ctx.lineTo(x + Math.sin(ang) * len + w, len);
    ctx.lineTo(x + Math.sin(ang) * len - w, len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Lightning bolt (screen space) — jagged branching polyline with glow.
export function bolt(ctx, x, y0, y1, seed, amount, W) {
  const s = W / 1920;
  const pts = [[x, y0]];
  let px = x;
  const n = 14;
  for (let i = 1; i <= n; i++) {
    px += (hash01(seed + i * 7) - 0.5) * 70 * s;
    pts.push([px, lerp(y0, y1, i / n)]);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineJoin = 'round';
  for (const [w, a] of [[16, 0.12], [6, 0.35], [2.2, 1]]) {
    ctx.strokeStyle = css('#e8ecff', a * amount);
    ctx.lineWidth = w * s;
    ctx.beginPath();
    pts.forEach(([xx, yy], i) => (i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy)));
    // one branch
    const b = 5 + Math.floor(hash01(seed + 99) * 5);
    ctx.moveTo(pts[b][0], pts[b][1]);
    let bx = pts[b][0], by = pts[b][1];
    for (let i = 1; i < 5; i++) {
      bx += (hash01(seed + 200 + i) - 0.2) * 50 * s;
      by += (y1 - y0) / n * 0.9;
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Lightning envelope: returns flash amount (0..1) for strikes at given times.
export function flashAt(t, strikes) {
  let f = 0;
  for (const s of strikes) {
    const a = t - s.t;
    if (a < 0 || a > 14) continue;
    // double flicker then decay
    const k = a < 1 ? 1 : a < 2 ? 0.35 : a < 3 ? 0.85 : Math.exp(-(a - 3) * 0.45) * 0.7;
    f = Math.max(f, k * (s.amt ?? 1));
  }
  return f;
}

// wind streak lines (screen space) for strong wind
export function windStreaks(ctx, W, H, t, spec) {
  const s = W / 1920;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = css(spec.color || '#ffffff', spec.alpha ?? 0.35);
  ctx.lineWidth = 1.4 * s;
  ctx.beginPath();
  const n = spec.n || 14;
  const dir = spec.dir || -1;
  for (let i = 0; i < n; i++) {
    const seed = (spec.seed || 9) * 97 + i * 29;
    const life = 18 + 14 * hash01(seed);
    const ph = hash01(seed + 1) * life;
    const k = Math.floor((t + ph) / life);
    const a = ((t + ph) % life) / life;
    const y = H * (0.1 + 0.8 * hash01(seed + k * 7));
    const xs = W * hash01(seed + k * 13 + 2);
    const L = W * (0.08 + 0.12 * hash01(seed + 3));
    const x = xs + dir * a * W * 0.5;
    const vis = Math.sin(a * Math.PI);
    const len = L * vis;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - dir * len * 0.3, y - 6 * s, x - dir * len * 0.7, y + 6 * s, x - dir * len, y);
  }
  ctx.stroke();
  ctx.restore();
}

// dust / sand drift particles blown along the ground (screen space band)
export function dust(ctx, W, H, t, spec) {
  const s = W / 1920;
  const n = spec.n || 80;
  const dir = spec.dir || 1;
  for (let i = 0; i < n; i++) {
    const seed = (spec.seed || 11) * 71 + i * 23;
    const sp = (spec.speed || 6) * s * (0.5 + hash01(seed));
    const x = ((hash01(seed + 1) * W * 1.2 + dir * t * sp) % (W * 1.2) + W * 1.2) % (W * 1.2) - W * 0.1;
    const band = spec.y0 + (spec.y1 - spec.y0) * hash01(seed + 2);
    const y = H * band + Math.sin(t * 0.08 + i) * 10 * s;
    ctx.fillStyle = css(spec.color || '#d8c8a8', (spec.alpha ?? 0.4) * (0.4 + 0.6 * hash01(seed + 3)));
    ctx.beginPath();
    ctx.ellipse(x, y, (2 + 5 * hash01(seed + 4)) * s, (1 + 1.5 * hash01(seed + 5)) * s, 0, 0, TAU);
    ctx.fill();
  }
}
