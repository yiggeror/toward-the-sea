// A forest in 3D: trunks, canopies, ferns, grass clumps, flowers, stones and a
// winding path, laid out on the ground plane and drawn through the shared
// perspective camera (film/persp.js), so the same wood can be seen down the
// path, across it, from the grass, or looking up. Painter's order by camera
// distance; aerial haze by distance.
import { toCam, projC, P3, S3, fill3, path3, line3, floorY, nearC } from '../film/persp.js';
import { css, mix } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';

export const WOODS = {
  sky: [[0, '#b7e0e6'], [0.5, '#e6f3d8'], [1, '#fff4cc']],
  haze: '#d6e6c8', hazeFar: '#e8efd0',
  trunk: '#5a4636', trunkLit: '#8a6f55', trunkDark: '#3a2d25', moss: '#6f8f45',
  canopy: ['#2f5a3f', '#3f7447', '#5d9451', '#8fbf62'],
  ground: '#5d8a3e', groundFar: '#9fbf7a', path: '#b39a6c', pathLit: '#d8c08c',
  grass: ['#4b7c35', '#6a9e43', '#8cbc58', '#b0d474'],
  fern: ['#3f7440', '#5a9448', '#7fb45a'],
  flowers: ['#fbf6e8', '#f7d85e', '#f0a8bf', '#b8a4ef'],
  stone: '#9c968a', stoneLit: '#c8c1b2',
  sun: '#fff0b8',
};

/** o: { seed, d0, d1, pathAmp, pathW, treeGap, density } */
export function woodsLayout(o = {}) {
  const seed = o.seed ?? 5;
  const d0 = o.d0 ?? -60, d1 = o.d1 ?? 420;
  const amp = o.pathAmp ?? 5, pw = o.pathW ?? 5;
  const pathX = (d) => amp * Math.sin(d * 0.012 + seed) + amp * 0.4 * Math.sin(d * 0.031 + seed * 2);
  const gy = o.gy || (() => 0);
  const L = { d0, d1, pathX, pathW: pw, trees: [], items: [], gy, noPath: !!o.noPath, stream: o.stream || null };
  const inStream = (x, d, m = 0) => L.stream && Math.abs(d - streamD(L.stream, x)) < L.stream.w / 2 + m;
  let k = 0;
  for (let d = d0; d < d1; d += 5 + hash01(seed * 7 + k) * 7) {
    for (const side of [-1, 1]) {
      k++;
      const h = (q) => hash01(seed * 131 + k * 17 + q);
      if (h(1) > (o.density ?? 0.75)) continue;
      const off = (o.treeGap ?? 7) + Math.pow(h(2), 1.3) * 60;
      const r = 1.2 + h(3) * 2.6;
      const tx = pathX(d) + side * (off + r), td = d + h(4) * 4;
      if (inStream(tx, td, r + 3)) continue;
      L.trees.push({ x: tx, d: td, r: r * (o.treeScale ?? 1), h: (90 + h(5) * 120) * (o.treeScale ?? 1), seed: seed * 1000 + k, lean: (h(6) - 0.5) * 0.06 });
    }
  }
  // ground cover: grass clumps, ferns, flowers, stones, fallen leaves
  for (let i = 0; i < (o.cover ?? 900); i++) {
    const h = (q) => hash01(seed * 977 + i * 31 + q);
    const d = d0 + Math.pow(h(1), 1.7) * (d1 - d0);
    const side = h(2) < 0.5 ? -1 : 1;
    const off = pw * 0.5 + 0.3 + Math.pow(h(3), 1.4) * 40;
    const wts = o.kinds || { grass: 0.5, fern: 0.22, flower: 0.18, stone: 0.06, log: 0.04 };
    let acc = 0, kind = 'grass';
    const tot = Object.values(wts).reduce((a, b) => a + b, 0);
    for (const kk in wts) {
      acc += wts[kk] / tot;
      if (h(4) < acc) {
        kind = kk;
        break;
      }
    }
    if (kind === 'log' && off < 6) continue;
    const ix = pathX(d) + side * off;
    if (inStream(ix, d, 0.5)) continue;
    L.items.push({ kind, x: ix, d, s: (0.7 + h(5) * 0.9) * (o.coverScale ?? 1), seed: seed * 50 + i, col: Math.floor(h(6) * 4) });
  }
  // a few clumps right on the path edges (they frame it)
  return L;
}

export function streamD(st, x) {
  return st.d + 6 * Math.sin(x * 0.045 + 1) + 2 * Math.sin(x * 0.13);
}
const fogK = (dist, fd) => clamp(1 - Math.exp(-Math.max(0, dist) / fd), 0, 0.92);

// ---- painters (local frame: origin at the base, units H, y down) -----------
function trunk(g, r, h, t, seed, P, lean) {
  const flare = r * 1.5;
  g.beginPath();
  g.moveTo(-flare, 0);
  g.quadraticCurveTo(-r * 1.02, -r * 1.2, -r + lean * -h * 0.2, -h);
  g.lineTo(r + lean * -h * 0.2, -h);
  g.quadraticCurveTo(r * 1.02, -r * 1.2, flare, 0);
  g.closePath();
  const gr = g.createLinearGradient(-r, 0, r, 0);
  gr.addColorStop(0, P.lit);
  gr.addColorStop(0.45, P.mid);
  gr.addColorStop(1, P.dark);
  g.fillStyle = gr;
  g.fill();
  // bark furrows and a mossy foot
  g.strokeStyle = P.line;
  g.lineWidth = r * 0.06;
  for (let i = 0; i < 5; i++) {
    const x = (hash01(seed + i * 7) - 0.5) * r * 1.5;
    g.beginPath();
    g.moveTo(x, -r * 0.3);
    g.bezierCurveTo(x + r * 0.1, -h * 0.2, x - r * 0.1, -h * 0.5, x + lean * -h * 0.1, -h * (0.6 + 0.3 * hash01(seed + i)));
    g.stroke();
  }
  g.fillStyle = P.moss;
  g.beginPath();
  g.ellipse(-r * 0.3, -r * 0.35, r * 1.1, r * 0.55, 0, Math.PI, TAU);
  g.fill();
}
function canopyBlob(g, w, h, seed, cols, sun) {
  for (let layer = 0; layer < cols.length; layer++) {
    g.fillStyle = cols[layer];
    g.beginPath();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = hash01(seed * 17 + i + layer * 29) * TAU;
      const rr = hash01(seed * 19 + i + layer * 13);
      const bx = Math.cos(a) * w * 0.4 * rr - layer * w * 0.07 * sun;
      const by = Math.sin(a) * h * 0.3 * rr - layer * h * 0.08;
      const r = w * (0.22 + 0.14 * hash01(seed * 23 + i + layer)) * (1 - layer * 0.18);
      g.moveTo(bx + r, by);
      g.arc(bx, by, r, 0, TAU);
    }
    g.fill();
  }
}
function grassClump(g, s, t, wind, cols) {
  const n = 7;
  for (let j = 0; j < n; j++) {
    const a = (j / (n - 1) - 0.5) * 1.3;
    const hh = s * (1.1 + 0.8 * Math.abs(Math.sin(j * 2.3)));
    const bend = a * 0.55 + wind * (0.7 + 0.3 * Math.sin(j));
    g.fillStyle = cols[j % cols.length];
    g.beginPath();
    g.moveTo(-0.07 * s + a * 0.1, 0);
    g.quadraticCurveTo(bend * hh * 0.2, -hh * 0.55, bend * hh * 0.6, -hh + Math.abs(bend) * hh * 0.2);
    g.quadraticCurveTo(bend * hh * 0.2 + 0.08 * s, -hh * 0.55, 0.07 * s + a * 0.1, 0);
    g.fill();
  }
}
function fern(g, s, t, wind, cols, seed) {
  const n = 6;
  for (let j = 0; j < n; j++) {
    const a = -Math.PI / 2 + (j / (n - 1) - 0.5) * 2.4 + wind * 0.2;
    const len = s * (1.6 + 0.6 * hash01(seed + j));
    g.strokeStyle = cols[0];
    g.lineWidth = s * 0.05;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const aa = a + u * u * (a < -Math.PI / 2 ? -0.9 : 0.9);
      pts.push([Math.cos(aa) * len * u, Math.sin(aa) * len * u * (1 - 0.3 * u)]);
    }
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    for (let k = 1; k < 8; k++) {
      const [x, y] = pts[k];
      const lw = s * 0.26 * (1 - k / 9);
      g.fillStyle = cols[1 + (k % 2)];
      for (const sd of [-1, 1]) {
        g.beginPath();
        g.ellipse(x + sd * lw * 0.5, y + lw * 0.3, lw * 0.55, lw * 0.2, sd * 0.6 + a, 0, TAU);
        g.fill();
      }
    }
  }
}
function flower(g, s, t, wind, col) {
  g.strokeStyle = '#5f8f3f';
  g.lineWidth = s * 0.04;
  const tx = wind * s * 0.4, ty = -s * 1.2;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(tx * 0.2, ty * 0.6, tx, ty);
  g.stroke();
  g.fillStyle = col;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    g.beginPath();
    g.arc(tx + Math.cos(a) * s * 0.11, ty + Math.sin(a) * s * 0.11, s * 0.09, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#f2c14e';
  g.beginPath();
  g.arc(tx, ty, s * 0.06, 0, TAU);
  g.fill();
}
function stone(g, s, seed, P) {
  const pts = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    const r = s * (0.8 + 0.3 * hash01(seed + i));
    pts.push([Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.75]);
  }
  g.fillStyle = P.dark;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  g.fillStyle = P.lit;
  g.beginPath();
  g.ellipse(-s * 0.3, -s * 0.5, s * 0.7, s * 0.25, -0.2, 0, TAU);
  g.fill();
  g.fillStyle = P.moss;
  g.beginPath();
  g.ellipse(s * 0.2, -s * 0.62, s * 0.5, s * 0.14, 0.1, 0, TAU);
  g.fill();
}

/**
 * Draw the wood: ground + path + sun patches, then every tree / plant far to
 * near. o: { t, wind(x,t), fogD, sun (screen x 0..1: light side), maxDist,
 * minDist, only: 'near'|'far' (split for depth-of-field passes), splitD }
 */
export function drawWoods(ctx, view, L, o = {}) {
  const t = o.t || 0;
  const P = Object.assign({}, WOODS, o.pal || {});
  const fd = o.fogD ?? 170;
  const wind = o.wind || (() => 0.15);
  const K = view.base * view.cam.z * view.D;
  const nc = nearC(view);
  const hz = (col, dist, k = 1) => mix(col, P.haze, fogK(dist, fd) * k);
  // ---- ground (only in the far/all pass)
  if (o.only !== 'near') {
    const H = view.H;
    const g = ctx.createLinearGradient(0, view.oy, 0, H);
    g.addColorStop(0, css(P.groundFar));
    g.addColorStop(0.2, css(mix(P.ground, P.groundFar, 0.4)));
    g.addColorStop(1, css(P.ground));
    const flat = L.gy(0, L.d0) === 0 && L.gy(0, (L.d0 + L.d1) / 2) === 0 && L.gy(0, L.d1) === 0;
    if (flat) fill3(ctx, view, floorY(0, -400, 400, L.d0, L.d1 + 400), g);
    else {
      // sloped ground: strips between depth samples, far to near
      // one polygon (no seams between strips): the left edge out, the right back
      const ds = [];
      for (let d = L.d0; d <= L.d1 + 200; d += 4) ds.push(d);
      const poly = [...ds.map((d) => [-400, L.gy(0, d), d]), ...ds.slice().reverse().map((d) => [400, L.gy(0, d), d])];
      fill3(ctx, view, poly, g);
    }
    if (L.stream) drawStream(ctx, view, L, t, P);
    // the path: a strip following pathX(d)
    const left = [], right = [];
    for (let d = L.d0; d <= L.d1; d += 2) {
      const w = L.pathW * (0.5 + 0.08 * Math.sin(d * 0.2));
      if (L.stream && Math.abs(d - streamD(L.stream, L.pathX(d))) < L.stream.w / 2 + 0.8) {
        left.push([L.pathX(d) - w, L.gy(0, d) + 0.02, d]);
        right.push([L.pathX(d) + w, L.gy(0, d) + 0.02, d]);
        continue;
      }
      left.push([L.pathX(d) - w, L.gy(0, d), d]);
      right.push([L.pathX(d) + w, L.gy(0, d), d]);
    }
    const strip = [...left, ...right.reverse()];
    // fill in pieces so the near-plane clip stays convex-ish
    for (let i = 0; i < left.length - 1 && !L.noPath; i += 4) {
      const a = left.slice(i, i + 5), b = right.slice(right.length - 1 - Math.min(right.length - 1, i + 4), right.length - i);
      const pc = hz(P.path, toCam(view, a[0][0], 0, a[0][2])[2], 0.8);
      fill3(ctx, view, [...a, ...b], css(pc));
    }
    // dappled sun patches on the ground
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < (o.flecks ?? 60); i++) {
      const d = L.d0 + 10 + Math.pow(hash01(i * 3 + 7), 1.3) * 200;
      const x = L.pathX(d) + (hash01(i * 7 + 1) - 0.5) * 50;
      const q = toCam(view, x, 0, d);
      if (q[2] < nc * 2) continue;
      const [X, Y] = projC(view, q);
      const s = K / q[2];
      const r = (1.5 + 3 * hash01(i * 11)) * s;
      if (X < -r || X > view.W + r || Y > view.H + 20) continue;
      const a = 0.28 * (0.5 + 0.5 * Math.sin(t * 0.025 * (0.5 + hash01(i)) + i));
      const hcam = Math.max(0.3, -view.cam.y);
      const ry = Math.max(1, (r * hcam) / q[2]);
      const gg = ctx.createRadialGradient(X, Y, 0, X, Y, r);
      gg.addColorStop(0, css(P.sun, a));
      gg.addColorStop(1, css(P.sun, 0));
      ctx.save();
      ctx.translate(X, Y);
      ctx.scale(1, ry / r);
      ctx.translate(-X, -Y);
      ctx.fillStyle = gg;
      ctx.fillRect(X - r, Y - r, 2 * r, 2 * r);
      ctx.restore();
    }
    ctx.restore();
  }
  // ---- objects, far to near
  const list = [];
  const maxD = o.maxDist ?? 1e9, minD = o.minDist ?? nc * 1.2;
  const split = o.splitD ?? 0;
  for (const tr of L.trees) {
    const q = toCam(view, tr.x, L.gy(tr.x, tr.d), tr.d);
    if (q[2] < minD - tr.r * 2 || q[2] > maxD) continue;
    if (o.clearNear && q[2] < o.clearNear) continue;
    if (o.only === 'near' && q[2] >= split) continue;
    if (o.only === 'far' && q[2] < split) continue;
    list.push([q, tr, 'tree']);
  }
  for (const it of L.items) {
    const q = toCam(view, it.x, L.gy(it.x, it.d), it.d);
    if (q[2] < minD || q[2] > Math.min(maxD, 320)) continue;
    // keep a clear zone in front of the lens (except a few plants at the frame edges)
    if (o.clearItems && q[2] < o.clearItems) {
      const [X] = projC(view, q);
      const e = (o.edgeKeep ?? 0.12) * view.W;
      if (!(X < e || X > view.W - e) || hash01(it.seed * 3) < 0.6) continue;
    }
    if (o.only === 'near' && q[2] >= split) continue;
    if (o.only === 'far' && q[2] < split) continue;
    list.push([q, it, it.kind]);
  }
  list.sort((a, b) => b[0][2] - a[0][2]);
  for (const [q, it, kind] of list) {
    const s = K / q[2];
    const [X, Y] = projC(view, q);
    if (kind === 'tree') {
      const topY = projC(view, [q[0], q[1] - it.h, q[2]])[1];
      if (X + it.r * 3 * s < -view.W * 0.3 || X - it.r * 3 * s > view.W * 1.3) continue;
      const fk = fogK(q[2], fd);
      const pal = {
        lit: css(mix(mix(P.trunkLit, P.haze, fk), P.sun, 0.05)), mid: css(mix(P.trunk, P.haze, fk)), dark: css(mix(P.trunkDark, P.haze, fk)),
        line: css(mix(P.trunkDark, P.haze, fk), 0.5), moss: css(mix(P.moss, P.haze, fk)),
      };
      ctx.save();
      ctx.setTransform(s, 0, 0, s, X, Y);
      trunk(ctx, it.r, it.h, t, it.seed, pal, it.lean);
      // canopy clusters up the trunk (only when their bottom is on screen)
      const sway = wind(it.x, t) * 0.8;
      for (let c = 0; c < 3; c++) {
        const cy = -it.h * (0.55 + c * 0.16);
        if (Y + cy * s > view.H + 40 * s) continue;
        const cw = it.h * (0.32 - c * 0.05);
        const cols = P.canopy.map((cc) => css(mix(cc, P.haze, fk * 0.95)));
        ctx.save();
        ctx.translate(sway * (c + 1) * 0.8, cy);
        canopyBlob(ctx, cw, cw * 0.7, it.seed + c * 7, cols, 1);
        ctx.restore();
      }
      ctx.restore();
      void topY;
    } else {
      const fk = fogK(q[2], fd);
      if (X < -60 * s || X > view.W + 60 * s || Y > view.H + 60 * s) continue;
      ctx.save();
      ctx.setTransform(s, 0, 0, s, X, Y);
      const w = wind(it.x, t);
      if (kind === 'grass') grassClump(ctx, it.s * 1.3, t, w, P.grass.slice(it.col % 2, it.col % 2 + 3).map((c) => css(mix(c, P.haze, fk))));
      else if (kind === 'fern') fern(ctx, it.s * 1.2, t, w, P.fern.map((c) => css(mix(c, P.haze, fk))), it.seed);
      else if (kind === 'flower') flower(ctx, it.s * 0.9, t, w, css(mix(P.flowers[it.col], P.haze, fk)));
      else if (kind === 'stone') stone(ctx, it.s * 0.9, it.seed, { dark: css(mix(P.stone, P.haze, fk)), lit: css(mix(P.stoneLit, P.haze, fk)), moss: css(mix(P.moss, P.haze, fk)) });
      else if (kind === 'log') {
        ctx.fillStyle = css(mix(P.trunk, P.haze, fk));
        ctx.beginPath();
        ctx.roundRect(-4 * it.s, -1.4 * it.s, 8 * it.s, 1.4 * it.s, 0.7 * it.s);
        ctx.fill();
        ctx.fillStyle = css(mix(P.moss, P.haze, fk));
        ctx.fillRect(-3.6 * it.s, -1.4 * it.s, 7 * it.s, 0.35 * it.s);
      }
      ctx.restore();
    }
  }
}

/** Distant wood at the end of the path: a hazy wall of trunks and leaves. */
export function woodsFar(ctx, view, o = {}) {
  const P = Object.assign({}, WOODS, o.pal || {});
  const W = view.W, H = view.H, t = o.t || 0;
  const hy = view.oy - (view.cam.y + 0) * 0; // horizon
  const g = ctx.createLinearGradient(0, hy - H * 0.5, 0, hy + H * 0.05);
  g.addColorStop(0, css(mix(P.canopy[1], P.hazeFar, 0.55)));
  g.addColorStop(0.7, css(mix(P.canopy[2], P.hazeFar, 0.7)));
  g.addColorStop(1, css(P.hazeFar));
  ctx.fillStyle = g;
  ctx.fillRect(0, hy - H * 0.5, W, H * 0.56);
  // faint far trunks
  for (let i = 0; i < 60; i++) {
    const x = hash01(i * 7 + 3) * W;
    const w = (2 + 5 * hash01(i * 3)) * (W / 1920);
    ctx.fillStyle = css(mix(P.trunk, P.hazeFar, 0.75 + 0.2 * hash01(i)), 0.8);
    ctx.fillRect(x, hy - H * (0.3 + 0.3 * hash01(i * 5)), w, H * (0.3 + 0.3 * hash01(i * 5)) + 2);
  }
}

// a stream crossing the wood (across x at depth ~st.d): water below the bank,
// wet banks, pebbles, ripples drifting downstream, sky glints
export function drawStream(ctx, view, L, t, P) {
  const st = L.stream;
  const K = view.base * view.cam.z * view.D;
  const xs = [];
  for (let x = -260; x <= 260; x += 3) xs.push(x);
  const bank = (x, sd) => streamD(st, x) + sd * (st.w / 2 + 0.6 * Math.sin(x * 0.3 + sd));
  // wet earth banks, then water surface (a touch below the ground)
  for (const [m, col] of [[1.4, '#5c5a3c'], [0.5, '#4a4a34']]) {
    const pts = [...xs.map((x) => [x, 0.02, bank(x, -1) - m]), ...xs.slice().reverse().map((x) => [x, 0.02, bank(x, 1) + m])];
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1];
      fill3(ctx, view, [[a, 0.02, bank(a, -1) - m], [b, 0.02, bank(b, -1) - m], [b, 0.02, bank(b, 1) + m], [a, 0.02, bank(a, 1) + m]], css(col, 0.55));
    }
    void pts;
  }
  const g = ctx.createLinearGradient(0, view.oy, 0, view.H);
  g.addColorStop(0, '#d8eee6');
  g.addColorStop(0.15, st.col || '#8ec5c7');
  g.addColorStop(1, st.deep || '#4f8e9d');
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    fill3(ctx, view, [[a, 0.35, bank(a, -1)], [b, 0.35, bank(b, -1)], [b, 0.35, bank(b, 1)], [a, 0.35, bank(a, 1)]], g);
  }
  // pebbles in the shallows
  for (let i = 0; i < 120; i++) {
    const x = (hash01(i * 3 + 1) - 0.5) * 120;
    const sd = hash01(i * 5) < 0.5 ? -1 : 1;
    const d = bank(x, sd) - sd * (0.3 + hash01(i * 7) * 1.4);
    const q = toCam(view, x, 0.36, d);
    if (q[2] < nearC(view) * 2) continue;
    const [X, Y] = projC(view, q);
    const s = K / q[2];
    const r = (0.08 + 0.14 * hash01(i * 11)) * s;
    ctx.fillStyle = css(mix('#7f8f7c', '#c1c3a8', hash01(i * 13)), 0.6);
    ctx.beginPath();
    ctx.ellipse(X, Y, r, Math.max(0.5, r * 0.35), 0, 0, TAU);
    ctx.fill();
  }
  // ripples drifting downstream (+x) and bright glints
  ctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = ((hash01(i * 7) * 200 + t * 0.12 * (0.6 + hash01(i))) % 200) - 100;
    const v = 0.1 + 0.8 * hash01(i * 13);
    const d = lerp(bank(x, -1), bank(x, 1), v);
    const q = toCam(view, x, 0.34, d);
    if (q[2] < nearC(view) * 2) continue;
    const [X, Y] = projC(view, q);
    const s = K / q[2];
    const len = (0.4 + 0.6 * hash01(i * 19)) * s;
    ctx.strokeStyle = i % 3 ? 'rgba(255,255,255,0.5)' : 'rgba(40,90,100,0.25)';
    ctx.lineWidth = Math.max(0.6, 0.05 * s);
    ctx.beginPath();
    ctx.moveTo(X - len / 2, Y);
    ctx.quadraticCurveTo(X, Y - len * 0.05, X + len / 2, Y);
    ctx.stroke();
    if (i % 4 === 0) {
      const tw = Math.max(0, Math.sin(t * 0.3 + i * 1.7));
      if (tw > 0.6) {
        ctx.fillStyle = css('#ffffff', (tw - 0.6) * 2);
        ctx.beginPath();
        ctx.arc(X, Y, Math.max(0.8, 0.06 * s), 0, TAU);
        ctx.fill();
      }
    }
  }
}
