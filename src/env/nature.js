// Vegetation, rocks and water painters (layer units). Everything that moves
// in the wind takes a wind field w(x, t) -> signed bend amount (-1.5..1.5).
import { css, mix, smoothTo } from '../core/draw.js';
import { hash01, noise1, fbm1, clamp, lerp, TAU, smoothstep } from '../core/math.js';

// A travelling-gust wind field: base + gust waves moving along +x or -x.
export function windField({ base = 0.2, gust = 0.5, speed = 0.18, wave = 0.12, dir = 1, seed = 3 } = {}) {
  return (x, t) => {
    const ph = x * wave - dir * t * speed;
    const g = Math.max(0, Math.sin(ph) * 0.6 + noise1(ph * 0.5, seed) * 0.8);
    return dir * (base + gust * g) + noise1(t * 0.05 + x * 0.3, seed + 5) * 0.08;
  };
}

/**
 * Grass: blades rooted along a ground profile. Batched into 2 paths (dark back
 * blades, light front blades). spec: { ground(x), density (blades/unit),
 * h (blade height), hVar, width, colors:[back, front], seed, wind, lean }
 */
export function grass(ctx, view, p, t, spec) {
  const [x0, x1] = view.xRange(p, 0.1);
  const dens = spec.density || 12;
  const step = 1 / dens;
  const i0 = Math.floor(x0 / step), i1 = Math.ceil(x1 / step);
  const cols = spec.colors;
  for (let layer = 0; layer < cols.length; layer++) {
    ctx.fillStyle = cols[layer];
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const hs = hash01(i * 7 + layer * 1013 + spec.seed * 31);
      if (layer > 0 && hs < 0.35) continue;
      const x = i * step + (hash01(i * 13 + layer * 7 + spec.seed) - 0.5) * step;
      const gy = spec.ground(x) + (layer === 0 ? -0.0 : 0.02);
      const h = spec.h * (1 - (spec.hVar ?? 0.5) + (spec.hVar ?? 0.5) * hash01(i * 3 + layer + spec.seed * 5)) * (layer === 0 ? 1.1 : 0.9);
      const w = spec.width || 0.06;
      const bend = (spec.wind ? spec.wind(x, t) : 0) + (spec.lean || 0) + (hs - 0.5) * 0.5;
      const bx = bend * h * 0.55, by = Math.abs(bend) * h * 0.18;
      // blade: quadratic curve from root (w wide) to tip
      const tipX = x + bx, tipY = gy - h + by;
      const cX = x + bx * 0.35, cY = gy - h * 0.55;
      ctx.moveTo(x - w * 0.5, gy);
      ctx.quadraticCurveTo(cX - w * 0.3, cY, tipX, tipY);
      ctx.quadraticCurveTo(cX + w * 0.3, cY, x + w * 0.5, gy);
    }
    ctx.fill();
  }
}

// grass tufts (clumps of 3-5 blades) scattered on the ground, for nearer layers
export function tufts(ctx, view, p, t, spec) {
  const [x0, x1] = view.xRange(p, 0.1);
  const step = spec.spacing || 0.8;
  const i0 = Math.floor(x0 / step) - 1, i1 = Math.ceil(x1 / step) + 1;
  for (let i = i0; i <= i1; i++) {
    const s = i * 31 + spec.seed * 7;
    if (hash01(s) > (spec.fill ?? 0.7)) continue;
    const x = i * step + (hash01(s + 1) - 0.5) * step;
    const gy = spec.ground(x) + (spec.dy || 0);
    const n = 3 + Math.floor(hash01(s + 2) * 4);
    const H = spec.h * (0.6 + 0.8 * hash01(s + 3));
    const col = spec.colors[Math.floor(hash01(s + 4) * spec.colors.length)];
    ctx.fillStyle = col;
    ctx.beginPath();
    const wv = spec.wind ? spec.wind(x, t) : 0;
    for (let j = 0; j < n; j++) {
      const a = (j / (n - 1) - 0.5) * 1.1;
      const h = H * (0.7 + 0.4 * hash01(s + 10 + j));
      const bend = a * 0.6 + wv * (0.8 + 0.4 * hash01(s + 20 + j));
      const tipX = x + bend * h * 0.6, tipY = gy - h + Math.abs(bend) * h * 0.2;
      const w = spec.width || 0.07;
      ctx.moveTo(x - w * 0.5 + a * 0.05, gy);
      ctx.quadraticCurveTo(x + bend * h * 0.2 - w * 0.2, gy - h * 0.55, tipX, tipY);
      ctx.quadraticCurveTo(x + bend * h * 0.2 + w * 0.2, gy - h * 0.55, x + w * 0.5 + a * 0.05, gy);
    }
    ctx.fill();
    if (spec.flowers && hash01(s + 5) < spec.flowers.p) {
      const fx = x + wv * H * 0.5, fy = gy - H * 1.05;
      ctx.fillStyle = spec.flowers.colors[Math.floor(hash01(s + 6) * spec.flowers.colors.length)];
      ctx.beginPath();
      ctx.arc(fx, fy, spec.flowers.r || 0.06, 0, TAU);
      ctx.fill();
    }
  }
}

/**
 * Stylised tree: trunk + canopy of overlapping blobs, lit from one side.
 * spec: { x, ground, h, w, trunk, dark, mid, light, seed, sway(t) }
 */
export function tree(ctx, spec, t = 0) {
  const { x, h, w } = spec;
  const gy = spec.ground;
  const s = spec.seed || 1;
  const sway = spec.sway ? spec.sway(t) : 0;
  // trunk
  const tw = spec.trunkW || w * 0.09;
  ctx.fillStyle = spec.trunk;
  ctx.beginPath();
  ctx.moveTo(x - tw * 1.4, gy);
  ctx.quadraticCurveTo(x - tw * 0.6, gy - h * 0.3, x - tw * 0.5 + sway * 0.3, gy - h * 0.72);
  ctx.lineTo(x + tw * 0.5 + sway * 0.3, gy - h * 0.72);
  ctx.quadraticCurveTo(x + tw * 0.6, gy - h * 0.3, x + tw * 1.4, gy);
  ctx.closePath();
  ctx.fill();
  // branches
  ctx.strokeStyle = spec.trunk;
  ctx.lineCap = 'round';
  ctx.lineWidth = tw * 0.5;
  for (let i = 0; i < 3; i++) {
    const by = gy - h * (0.45 + 0.1 * i);
    const dir = i % 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x + sway * 0.2, by);
    ctx.quadraticCurveTo(x + dir * w * 0.15 + sway * 0.5, by - h * 0.08, x + dir * w * 0.3 + sway * 0.7, by - h * 0.15);
    ctx.stroke();
  }
  // canopy blobs
  const cy = gy - h * 0.72;
  const blobs = spec.blobs || 9;
  const layers = [[spec.dark, 0.06, 1.0], [spec.mid, -0.02, 0.9], [spec.light, -0.1, 0.62]];
  for (const [col, dy, k] of layers) {
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < blobs; i++) {
      const a = hash01(s * 17 + i) * TAU;
      const rr = hash01(s * 19 + i + 3);
      const bx = x + Math.cos(a) * w * 0.34 * rr + sway * (0.8 + 0.4 * rr) + (col === spec.light ? -w * 0.08 : 0);
      const by = cy + Math.sin(a) * h * 0.2 * rr + dy * h - h * 0.08;
      const r = w * (0.2 + 0.12 * hash01(s * 23 + i)) * k;
      ctx.moveTo(bx + r, by);
      ctx.arc(bx, by, r, 0, TAU);
    }
    ctx.fill();
  }
}

// a row of trees with deterministic variety across the visible range
export function treeRow(ctx, view, p, t, spec) {
  const [x0, x1] = view.xRange(p, 0.3);
  const step = spec.spacing;
  const i0 = Math.floor(x0 / step) - 1, i1 = Math.ceil(x1 / step) + 1;
  for (let i = i0; i <= i1; i++) {
    const s = spec.seed * 97 + i * 13;
    if (hash01(s) > (spec.fill ?? 1)) continue;
    const x = i * step + (hash01(s + 1) - 0.5) * step * 0.7;
    const h = spec.h * (0.75 + 0.5 * hash01(s + 2));
    const w = spec.w * (0.75 + 0.5 * hash01(s + 3));
    const wind = spec.wind ? spec.wind(x, t) : 0;
    tree(ctx, Object.assign({}, spec, {
      x, h, w, ground: spec.ground(x), seed: s,
      sway: () => wind * h * 0.04 + Math.sin(t * 0.05 + i) * h * 0.005,
    }), t);
  }
}

// rounded rock with a lit top plane
export function rock(ctx, x, y, w, h, colors, seed = 1) {
  const pts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    const r = 0.85 + 0.25 * hash01(seed * 7 + i);
    pts.push([x + Math.cos(a) * w * 0.5 * r, y + Math.sin(a) * h * r]);
  }
  pts.push([x + w * 0.5, y], [x - w * 0.5, y]);
  const p = new Path2D();
  smoothTo(p, pts, true);
  ctx.fillStyle = colors[0];
  ctx.fill(p);
  if (colors[1]) {
    ctx.save();
    ctx.clip(p);
    ctx.fillStyle = colors[1];
    ctx.beginPath();
    ctx.ellipse(x - w * 0.12, y - h * 0.82, w * 0.42, h * 0.38, -0.1, 0, TAU);
    ctx.fill();
    // shadowed underside
    ctx.fillStyle = 'rgba(40,40,50,0.22)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.1, y, w * 0.6, h * 0.35, 0, 0, TAU);
    ctx.fill();
    if (colors[3]) {
      // moss cushion on the crown
      ctx.fillStyle = colors[3];
      ctx.beginPath();
      ctx.ellipse(x - w * 0.05, y - h * 1.02, w * 0.36, h * 0.22, 0.05, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(210,235,150,0.45)';
      ctx.beginPath();
      ctx.ellipse(x - w * 0.12, y - h * 1.08, w * 0.2, h * 0.08, 0.05, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  if (colors[2]) {
    ctx.strokeStyle = colors[2];
    ctx.lineWidth = Math.min(w, h) * 0.05;
    ctx.stroke(p);
  }
  return p;
}

/**
 * Water body between two profiles with moving highlight dashes.
 * spec: { top(x), bottom(x), color, deep, hi, speed, seed }
 */
export function water(ctx, view, p, t, spec) {
  const [x0, x1] = view.xRange(p, 0.1);
  const st = 0.3;
  const g = ctx.createLinearGradient(0, spec.top(x0), 0, spec.bottom(x0));
  g.addColorStop(0, spec.color);
  g.addColorStop(1, spec.deep || spec.color);
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let x = x0; x <= x1 + st; x += st) {
    if (x === x0) ctx.moveTo(x, spec.top(x));
    else ctx.lineTo(x, spec.top(x));
  }
  for (let x = x1 + st; x >= x0 - st; x -= st) ctx.lineTo(x, spec.bottom(x));
  ctx.closePath();
  ctx.fill();
  // flowing highlight dashes
  ctx.strokeStyle = spec.hi || 'rgba(255,255,255,0.5)';
  ctx.lineCap = 'round';
  ctx.lineWidth = spec.hiW || 0.035;
  ctx.beginPath();
  const n = Math.ceil((x1 - x0) * (spec.density || 2.5));
  for (let i = 0; i < n; i++) {
    const s = (spec.seed || 1) * 71 + i * 13;
    const lane = hash01(s);
    const period = x1 - x0 + 4;
    const xx = x0 - 2 + ((hash01(s + 1) * period + t * (spec.speed || 0.03) * (0.6 + 0.8 * lane)) % period);
    const top = spec.top(xx), bot = spec.bottom(xx);
    const yy = lerp(top, bot, 0.15 + 0.75 * lane);
    const L = (spec.dash || 0.5) * (0.5 + hash01(s + 2));
    const vis = Math.sin(((t * 0.02 + hash01(s + 3)) % 1) * Math.PI);
    if (vis < 0.2) continue;
    ctx.moveTo(xx, yy);
    ctx.lineTo(xx + L * vis, yy);
  }
  ctx.stroke();
}

// fern / leafy plant silhouette for foregrounds
export function leafyPlant(ctx, x, gy, h, color, seed, bend = 0) {
  ctx.fillStyle = color;
  const n = 5 + Math.floor(hash01(seed) * 4);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.2 + bend * 0.4;
    const L = h * (0.6 + 0.5 * hash01(seed + i));
    const tx = x + Math.cos(a) * L, ty = gy + Math.sin(a) * L * 0.9;
    const mx = x + Math.cos(a) * L * 0.5, my = gy + Math.sin(a) * L * 0.5 - L * 0.1;
    const w = L * 0.22;
    const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.quadraticCurveTo(mx + nx, my + ny, tx, ty);
    ctx.quadraticCurveTo(mx - nx, my - ny, x, gy);
    ctx.fill();
  }
}

/**
 * A rugged rock mass (outcrop, sea cliff). `outline` is a closed polygon in
 * world units: [[x, y, rough], ...], where `rough` scales the noise applied to
 * the edge that starts at that point (0 keeps an edge exact, e.g. a walkable
 * top). Filled with a lit-to-shadow gradient, then facets, strata and a lit rim.
 * o: { lit, mid, dark (colours), light: [dx, dy] toward the light, seed,
 *      rough (amplitude, H), strata (count), rim (colour), facets (count) }
 */
export function crag(ctx, outline, o = {}) {
  const seed = o.seed ?? 1;
  const amp = o.rough ?? 0.22;
  // subdivide and roughen
  const pts = [];
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay, r = 1] = outline[i], [bx, by] = outline[(i + 1) % n];
    const L = Math.hypot(bx - ax, by - ay);
    const m = Math.max(1, Math.ceil(L / 0.18));
    const nx = -(by - ay) / (L || 1), ny = (bx - ax) / (L || 1);
    for (let k = 0; k < m; k++) {
      const u = k / m;
      const s = (i * 7.31 + u * L) * 0.9;
      const off = r * amp * (noise1(s, seed) * 0.8 + noise1(s * 3.1, seed + 5) * 0.35 + (hash01(seed * 13 + i * 97 + k) - 0.5) * 0.25);
      const edge = k === 0 ? 0 : 1; // corners stay put
      pts.push([ax + (bx - ax) * u + nx * off * edge, ay + (by - ay) * u + ny * off * edge]);
    }
  }
  const path = new Path2D();
  pts.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  path.closePath();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const [lx, ly] = o.light || [-0.6, -0.8];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) * 0.6;
  const g = ctx.createLinearGradient(cx + lx * R, cy + ly * R, cx - lx * R, cy - ly * R);
  g.addColorStop(0, o.lit || '#9c97a6');
  g.addColorStop(0.45, o.mid || '#7a7686');
  g.addColorStop(1, o.dark || '#4a4658');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.clip(path);
  // facets: broken planes catching more or less light
  const nf = o.facets ?? Math.round((x1 - x0) * (y1 - y0) * 0.35) + 4;
  for (let i = 0; i < nf; i++) {
    const h = (q) => hash01(seed * 31 + i * 17 + q);
    const fx = x0 + h(1) * (x1 - x0), fy = y0 + h(2) * (y1 - y0);
    const s = 0.5 + h(3) * 1.6;
    const a = h(4) * TAU;
    const lit = h(5) < 0.55;
    ctx.fillStyle = lit ? css(o.lit || '#9c97a6', 0.18 + 0.2 * h(6)) : css(o.dark || '#4a4658', 0.14 + 0.2 * h(6));
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const aa = a + k * (TAU / 4) + (h(10 + k) - 0.5) * 0.9;
      const rr = s * (0.5 + 0.6 * h(20 + k));
      const px = fx + Math.cos(aa) * rr, py = fy + Math.sin(aa) * rr * 0.7;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  // strata / cracks: jagged, roughly parallel lines
  const ns = o.strata ?? Math.round((y1 - y0) * 0.8) + 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < ns; i++) {
    const h = (q) => hash01(seed * 53 + i * 29 + q);
    let x = x0 + h(1) * (x1 - x0) * 0.8, y = y0 + (i + 0.5 + (h(2) - 0.5) * 0.6) * ((y1 - y0) / ns);
    const len = (0.3 + 0.7 * h(3)) * (x1 - x0) * 0.6;
    ctx.strokeStyle = css(o.dark || '#4a4658', 0.35 + 0.25 * h(4));
    ctx.lineWidth = 0.05 + 0.05 * h(5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = Math.max(3, Math.round(len / 0.5));
    for (let k = 0; k < steps; k++) {
      x += len / steps;
      y += (hash01(seed * 7 + i * 11 + k) - 0.45) * 0.35 + (o.dip ?? 0.08) * (len / steps);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    // a lit lip above each crack
    ctx.strokeStyle = css(o.lit || '#9c97a6', 0.25);
    ctx.lineWidth = 0.035;
    ctx.stroke();
  }
  // ambient occlusion toward the base
  const ao = ctx.createLinearGradient(0, y0, 0, y1);
  ao.addColorStop(0, 'rgba(20,18,30,0)');
  ao.addColorStop(1, `rgba(20,18,30,${o.ao ?? 0.35})`);
  ctx.fillStyle = ao;
  ctx.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
  ctx.restore();
  // lit rim along the edges that face the light
  if (o.rim) {
    ctx.strokeStyle = o.rim;
    ctx.lineWidth = o.rimWidth ?? 0.08;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      const nx = (by - ay), ny = -(bx - ax); // outward normal for a clockwise outline
      const L = Math.hypot(nx, ny) || 1;
      if ((nx * lx + ny * ly) / L > 0.25) {
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
    }
    ctx.stroke();
  }
  return path;
}
