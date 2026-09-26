// The beach in 3D, for Act V: dry and wet sand, the swash sheet running up and
// back, the surf and the open sea to the horizon, a dune ridge inland, the far
// headland with its lighthouse, the sun, fair-weather clouds and gulls — all
// through the perspective camera (film/persp.js), so the one beach can be shot
// down the dune, from the water, facing the sea or along the shore.
//
// World (same as the v1 beach): +x across the beach toward the sea, d along the
// shore (toward the headland), y down, sea level y = 0. The water's edge runs
// along d, slanting seaward by `slope` per unit d: the swash front is at
// x = shore(d, t), the still water begins at x = still(d, t).
import { screenLayer } from '../film/kit.js';
import { toCam, projC, nearC, camPos } from '../film/persp.js';
import { scratchBuffer } from '../film/post.js';
import { css, mix, rgb } from '../core/draw.js';
import { hash01, hash2, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';
import { cloudShape } from '../env/sky.js';
import { lampGlow, glints } from '../env/light.js';
import { gull } from '../env/creatures.js';
import { BEACH, swashEdge } from './sea.js';

const SEA_STOPS = [[0, rgb(BEACH.sea[1])], [0.3, rgb('#79acd0')], [1, rgb('#3a78ab')]];
const SKY_STOPS = [[0, '#edf0ec'], [0.03, '#dde9ef'], [0.12, '#b0cfe7'], [0.3, '#76a9dc'], [0.75, '#4f8bcb']];

// camera basis for rays: screen (X, Y) -> world direction
function rayBasis(view) {
  const c = view.cam;
  const yaw = c.yaw || 0, pitch = c.pitch || 0;
  const [Cx, Cd] = camPos(view);
  return { F: view.base * c.z * view.D, cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch), Cx, Cd, Cy: c.y, ox: view.ox, oy: view.oy };
}
// world direction -> screen (null when behind the lens)
function dirToScreen(view, dx, dy, dd) {
  const [Cx, Cd] = camPos(view);
  const R = 1e4;
  const q = toCam(view, Cx + dx * R, view.cam.y + dy * R, Cd + dd * R);
  if (q[2] <= 1) return null;
  return projC(view, q);
}
// screen y of the elevation angle e (centre column)
function elevY(view, e) {
  const p = view.cam.pitch || 0;
  return view.oy - view.base * view.cam.z * view.D * Math.tan(clamp(e - p, -1.45, 1.45));
}
function grad3(stops, u) {
  u = clamp(u, 0, 1);
  for (let i = 1; i < stops.length; i++) {
    if (u <= stops[i][0]) {
      const [ua, ca] = stops[i - 1], [ub, cb] = stops[i];
      const k = (u - ua) / Math.max(1e-6, ub - ua);
      return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * The beach's geometry for a shot. o: { rest, slope, waves, lag, dune }
 * - rest: x of the still-water line at d = 0; waves: [{ t, dur, reach }] as in
 *   the v1 swash (reach = x the run-up reaches at d = 0)
 * - lag: frames per unit d, so a wave peels along the shore
 * - dune: { toe, w, h } (x of the dune's foot at d = 0, width to the crest,
 *   height) or false
 */
export function beachGeo(o = {}) {
  const slope = o.slope ?? 0.25;
  const rest = o.rest ?? 6;
  const waves = o.waves || [];
  const lag = o.lag ?? 0;
  const m0 = o.m0 ?? 0;
  const meander = (d) => smoothstep(4, 40, Math.abs(d - m0)) * (noise1(d * 0.018, 5) * 7 + noise1(d * 0.07, 9) * 1.4);
  const wetTo = Math.min(rest - 2.4, ...waves.map((w) => w.reach - 0.6));
  const wetEdge = (d) => wetTo + noise1(d * 0.35, 21) * 0.5 + noise1(d * 1.4, 23) * 0.15;
  const edge = (t, d = 0) => swashEdge(t - lag * d, { rest, waves });
  const G = {
    slope, rest, waves, lag, meander, wetEdge, edge,
    shore: (d, t) => edge(t, d) + d * slope + meander(d),
    still: (d, t) => Math.max(rest, edge(t, d)) + d * slope + meander(d),
    wetLine: (d, t) => Math.min(G.shore(d, t) - 0.05, wetEdge(d) + d * slope + meander(d)),
    dune: o.dune === false ? null : Object.assign({ toe: -14, w: 12, h: 6.5 }, o.dune || {}),
  };
  const D = G.dune;
  if (D) {
    G.duneH = (d) => D.h * (1 + 0.22 * noise1(d * 0.03, 3) + 0.08 * noise1(d * 0.13, 7));
    G.toe = (d) => D.toe + d * slope + noise1(d * 0.021, 11) * 2.5;
    G.crest = (d) => G.toe(d) - D.w * (1 + 0.15 * noise1(d * 0.05, 13));
  }
  // ground height (y, negative = up) at (x, d)
  G.gy = (x, d) => {
    if (!D) return 0;
    const a = G.toe(d);
    if (x >= a) return 0;
    const c = G.crest(d), h = G.duneH(d);
    if (x >= c) {
      const u = (a - x) / (a - c);
      return -h * u * u * (3 - 2 * u);
    }
    return -h * (1 - 0.34 * smoothstep(c, c - 5, x) - 0.2 * smoothstep(c - 5, c - 30, x));
  };
  G.inWater = (x, d, t) => x > G.shore(d, t) + 0.02;
  return G;
}

// ---- the set -----------------------------------------------------------------
/**
 * Push the beach layers onto shot S. Returns the geometry. o (plus beachGeo's):
 * { sun: { az, el } (az from +d toward +x), clouds, gulls, headland: { x, d } |
 *   false, fence, paws(t) -> [[x, d, y?]], prints(t) -> [[x, d, t0, s]],
 *   grain (floor cell px at 1080p) }
 */
export function beachSet(S, o = {}) {
  const G = beachGeo(o);
  const sun = Object.assign({ az: 1.3, el: 0.42 }, o.sun || {});
  const Ls = [Math.cos(sun.el) * Math.sin(sun.az), -Math.sin(sun.el), Math.cos(sun.el) * Math.cos(sun.az)];
  S.beach = G;
  // ---------------------------------------------------------------- sky
  S.layers.push(screenLayer(0, (ctx, t, W, H, view) => {
    const y0 = elevY(view, SKY_STOPS[SKY_STOPS.length - 1][0]), yh = elevY(view, 0);
    const g = ctx.createLinearGradient(0, y0, 0, yh);
    for (const [e, c] of SKY_STOPS) g.addColorStop(clamp((elevY(view, e) - y0) / Math.max(1, yh - y0), 0, 1), c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // the sun (by world direction); its screen position steers the light rays
    const P = dirToScreen(view, Ls[0], Ls[1], Ls[2]);
    S.sunScreen = null;
    if (P) {
      S.sunScreen = [P[0] / W, P[1] / H];
      const k = W / 1920;
      const g2 = ctx.createRadialGradient(P[0], P[1], 0, P[0], P[1], W * 0.6);
      g2.addColorStop(0, 'rgba(255,246,226,0.55)');
      g2.addColorStop(1, 'rgba(255,246,226,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, W, H);
      if (P[0] > -W * 0.2 && P[0] < W * 1.2 && P[1] > -H * 0.3) lampGlow(ctx, P[0], P[1], 96 * k, '#ffffff', 1, 0.3);
    }
    // fair-weather clouds at fixed directions, drifting slowly
    const n = o.clouds ?? 9;
    for (let i = 0; i < n; i++) {
      const az = hash01(i * 7 + 3) * TAU + t * 0.00004 * (1 + hash01(i));
      const el = 0.05 + 0.2 * Math.pow(hash01(i * 11 + 5), 1.5);
      const R = 5000;
      const [Cx, Cd] = camPos(view);
      const q = toCam(view, Cx + Math.sin(az) * R, view.cam.y - Math.tan(el) * R, Cd + Math.cos(az) * R);
      if (q[2] < 100) continue;
      const [X, Y] = projC(view, q);
      const s = (view.base * view.cam.z * view.D) / q[2];
      const w = R * (0.07 + 0.09 * hash01(i * 13)), h = w * (0.16 + 0.1 * hash01(i * 17));
      if (X + w * s < -50 || X - w * s > W + 50 || Y - h * 2 * s > H) continue;
      ctx.save();
      ctx.setTransform(s, 0, 0, s, X, Y);
      cloudShape(ctx, 0, 0, w, h, 31 + i * 17, { top: '#ffffff', shade: '#c9d3e2', rim: '#ffffff', light: [-Ls[0] * 0.6, -0.8], alpha: 0.9 });
      ctx.restore();
    }
  }));
  // ---------------------------------------------------------------- the floor
  S.layers.push(screenLayer(0.1, (ctx, t, W, H, view) => drawFloor(ctx, view, t, G, Ls, o)));
  // far headland with the lighthouse, hazed
  if (o.headland !== false) S.layers.push(Object.assign(screenLayer(0.12, (ctx, t, W, H, view) => drawHeadland(ctx, view, o.headland || {})), { haze: { color: '#dfe8ef', amount: 0.32 } }));
  // haze on the horizon line
  S.layers.push(screenLayer(0.13, (ctx, t, W, H, view) => {
    const hz = elevY(view, 0);
    const g = ctx.createLinearGradient(0, hz - H * 0.02, 0, hz + H * 0.015);
    g.addColorStop(0, 'rgba(246,244,238,0)');
    g.addColorStop(0.6, 'rgba(246,244,238,0.45)');
    g.addColorStop(1, 'rgba(246,244,238,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, hz - H * 0.02, W, H * 0.035);
  }));
  // surf, swash foam
  S.layers.push(screenLayer(0.14, (ctx, t, W, H, view) => drawFoam(ctx, view, t, G)));
  // the dune ridge
  if (G.dune) S.layers.push(screenLayer(0.16, (ctx, t, W, H, view) => drawDune(ctx, view, t, G, o)));
  // sand texture, shells, footprints
  S.layers.push(screenLayer(0.2, (ctx, t, W, H, view) => drawSandDetail(ctx, view, t, G, o)));
  // water around the paws that stand in it
  if (o.paws) S.layers.push(screenLayer(1.2, (ctx, t, W, H, view) => drawPawWater(ctx, view, t, G, o.paws(t, view))));
  // gulls wheeling
  const ng = o.gulls ?? 3;
  if (ng) {
    S.layers.push(screenLayer(2.2, (ctx, t, W, H, view) => {
      const [Cx, Cd] = camPos(view);
      const list = [];
      for (let i = 0; i < ng; i++) {
        const c = o.gullAt ? o.gullAt(i) : [Cx + 10 + 16 * hash01(i * 5), Cd + 30 + 40 * hash01(i * 9)];
        const r = 10 + 14 * hash01(i * 3), w = 0.004 + 0.003 * hash01(i * 7);
        const a = t * w * (hash01(i * 13) < 0.5 ? 1 : -1) + i * 2.1;
        const x = c[0] + Math.cos(a) * r, d = c[1] + Math.sin(a) * r, y = -(9 + 6 * hash01(i * 17)) + Math.sin(t * 0.03 + i) * 0.6;
        const q = toCam(view, x, y, d);
        if (q[2] < nearC(view) * 4) continue;
        const q2 = toCam(view, x - Math.sin(a) * 0.1, y, d + Math.cos(a) * 0.1);
        list.push([q, q2, i]);
      }
      list.sort((A, B) => B[0][2] - A[0][2]);
      for (const [q, q2, i] of list) {
        const [X, Y] = projC(view, q);
        const s = (view.base * view.cam.z * view.D) / q[2];
        const dir = projC(view, q2)[0] >= X ? 1 : -1;
        gull(ctx, X, Y, t + i * 13, { size: 0.9 * s, dir, glide: (t + i * 40) % 90 < 50, rate: 0.35 });
      }
    }));
  }
  return G;
}

// ---- the floor: every cell of a coarse grid is a ray to the ground plane,
// shaded as dry sand, wet sand, the glossy edge, the swash sheet, the surf or
// the sea (with the sun's glitter), then scaled up smoothly
const _img = new Map();
function drawFloor(ctx, view, t, G, Ls, o) {
  const W = view.W, H = view.H;
  const cs = Math.max(2, Math.round(((o.grain ?? 3) * W) / 1920));
  const gw = Math.ceil(W / cs), gh = Math.ceil(H / cs);
  const B = scratchBuffer('beachFloor', gw, gh);
  const g = B.getContext('2d');
  const key = gw + 'x' + gh;
  let img = _img.get(key);
  if (!img) {
    img = g.createImageData(gw, gh);
    _img.set(key, img);
  }
  const px = img.data;
  const R = rayBasis(view);
  const { F, cy, sy, cp, sp, Cx, Cd, Cy } = R;
  // d-tables for the shore curves (they only depend on d this frame)
  const dLo = Cd - 700, dStep = 0.25, nT = Math.ceil(1400 / dStep) + 1;
  const tabS = new Float32Array(nT), tabR = new Float32Array(nT), tabW = new Float32Array(nT);
  for (let i = 0; i < nT; i++) {
    const d = dLo + i * dStep;
    const m = G.meander(d), e = G.edge(t, d), sl = d * G.slope;
    tabS[i] = e + sl + m;
    tabR[i] = Math.max(G.rest, e) + sl + m;
    tabW[i] = Math.min(tabS[i] - 0.05, G.wetEdge(d) + sl + m);
  }
  const look = (tab, d) => {
    let u = (d - dLo) / dStep;
    if (u <= 0) return tab[0];
    if (u >= nT - 1) return tab[nT - 1];
    const i = u | 0;
    u -= i;
    return tab[i] + (tab[i + 1] - tab[i]) * u;
  };
  const sandA = rgb(BEACH.sand[1]), sandB = rgb(BEACH.sand[0]);
  const wetC = rgb(BEACH.wet), gloss = rgb('#d3e4ea');
  const teal = rgb('#8fcfc8'), skyR = rgb('#e9f3f6'), skyR2 = rgb('#c4e0ee');
  const surf1 = rgb('#a6dcd6'), surf2 = rgb('#6fb6cf');
  const tq = Math.floor(t / 3);
  const col = [0, 0, 0];
  const set = (c) => {
    col[0] = c[0]; col[1] = c[1]; col[2] = c[2];
  };
  const blend = (a, b, u) => {
    col[0] = a[0] + (b[0] - a[0]) * u; col[1] = a[1] + (b[1] - a[1]) * u; col[2] = a[2] + (b[2] - a[2]) * u;
  };
  const sandC = [0, 0, 0];
  for (let j = 0; j < gh; j++) {
    const qy = ((j + 0.5) * cs - R.oy) / F;
    const y1 = qy * cp - sp, z1 = qy * sp + cp;
    let p = j * gw * 4;
    if (y1 <= 1e-5 || Cy >= 0) {
      for (let i = 0; i < gw; i++, p += 4) px[p + 3] = 0;
      continue;
    }
    const tau = -Cy / y1;
    for (let i = 0; i < gw; i++, p += 4) {
      const qx = ((i + 0.5) * cs - R.ox) / F;
      const wx = qx * cy + z1 * sy, wd = -qx * sy + z1 * cy;
      const dx = wx * tau, dd = wd * tau;
      const x = Cx + dx, d = Cd + dd;
      const hd = Math.sqrt(dx * dx + dd * dd);
      const xs = look(tabS, d), xr = look(tabR, d), xw = look(tabW, d);
      // dry sand: lighter and hazier with distance, a faint mottling
      const uS = clamp(10 / Math.max(1, hd), 0, 1);
      const mot = 1 + 0.035 * Math.sin(x * 0.37 + Math.sin(d * 0.21) * 2) * Math.sin(d * 0.29 + x * 0.05);
      sandC[0] = (sandA[0] + (sandB[0] - sandA[0]) * uS) * mot;
      sandC[1] = (sandA[1] + (sandB[1] - sandA[1]) * uS) * mot;
      sandC[2] = (sandA[2] + (sandB[2] - sandA[2]) * uS) * mot;
      let water = 0;
      if (x < xw) set(sandC);
      else if (x < xs) {
        const u = (x - xw) / Math.max(1e-4, xs - xw);
        if (u < 0.25) blend(sandC, mix(sandC, wetC, 0.35), u / 0.25);
        else if (u < 0.55) blend(mix(sandC, wetC, 0.35), wetC, (u - 0.25) / 0.3);
        else if (u < 0.88) blend(wetC, mix(wetC, gloss, 0.55), (u - 0.55) / 0.33);
        else blend(mix(wetC, gloss, 0.55), gloss, (u - 0.88) / 0.12);
        water = 0.35 * u;
      } else {
        const sheet = xr - xs, s = x - xs;
        const seaC = grad3(SEA_STOPS, clamp(12 / Math.max(1, hd), 0, 1));
        const a5 = sheet + 1.1, a6 = sheet + 2.6, a7 = sheet + 5.5;
        if (s < a5) {
          // a thin clear sheet over wet sand: the sand shows through, tinted as
          // it deepens, and the sky shines off it more the lower we look
          const dep = clamp(s / (sheet + 1.1), 0, 1);
          const L0 = Math.sqrt(hd * hd + Cy * Cy);
          const cz = -Cy / Math.max(1e-3, L0);
          const fr = 0.12 + 0.88 * Math.pow(1 - cz, 4);
          const e0 = Math.min(1, s / 0.12);
          const rip = 1 + 0.05 * Math.sin(x * 1.7 + Math.sin(d * 0.9) * 1.5) * (1 - smoothstep(8, 30, hd));
          const patch = clamp(fr * (0.75 + 0.35 * dep) * (1 + 0.12 * noise1(d * 0.11 + x * 0.07 + t * 0.004, 12)), 0, 0.92);
          for (let c = 0; c < 3; c++) {
            const under = (wetC[c] + (teal[c] - wetC[c]) * (0.25 + 0.65 * dep)) * rip;
            const refl = skyR[c] + (skyR2[c] - skyR[c]) * dep;
            const v = under + (refl - under) * patch;
            col[c] = gloss[c] + (v - gloss[c]) * e0;
          }
          if (s > sheet + 0.2) {
            const u = (s - sheet - 0.2) / 0.9;
            for (let c = 0; c < 3; c++) col[c] += (surf1[c] - col[c]) * u * 0.8;
          }
        } else if (s < a6) blend(surf1, surf2, (s - a5) / (a6 - a5));
        else if (s < a7) blend(surf2, seaC, (s - a6) / (a7 - a6));
        else set(seaC);
        // swells rolling in: soft light/dark bands parallel to the shore
        if (s > a5) {
          const k = smoothstep(a5, a7 + 4, s) * (1 - smoothstep(60, 260, hd));
          const b = Math.sin((x - xr) * 0.55 - t * 0.075 + noise1(d * 0.03, 4) * 2.5);
          const m = 1 + 0.06 * k * b;
          col[0] *= m; col[1] *= m; col[2] *= m;
        }
        water = s < a5 ? 0.45 : 1;
      }
      if (water > 0) {
        // the sun's glitter: reflected view ray against the sun direction
        const L = Math.sqrt(dx * dx + dd * dd + Cy * Cy);
        const rx = dx / L, ry = Cy / L, rz = dd / L; // reflected ray points up (y < 0)
        const c = rx * Ls[0] + ry * Ls[1] + rz * Ls[2];
        if (c > 0.6) {
          const broad = Math.pow(c, 12) * 0.3, core = Math.pow(c, 90);
          const gcell = Math.max(0.02, (cs * 1.6 * L) / F);
          const hh = hash2(Math.floor(x / gcell) + tq * 7, Math.floor(d / gcell) - tq * 3);
          const sparkle = hh > 0.82 ? (hh - 0.82) * 5.5 : 0;
          const e = water * (broad + core * (0.4 + 1.6 * sparkle));
          col[0] += (255 - col[0]) * Math.min(1, e);
          col[1] += (250 - col[1]) * Math.min(1, e);
          col[2] += (236 - col[2]) * Math.min(1, e);
        }
      }
      px[p] = col[0];
      px[p + 1] = col[1];
      px[p + 2] = col[2];
      px[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(B, 0, 0, gw, gh, 0, 0, gw * cs, gh * cs);
  ctx.restore();
  // sparkles over the glitter path
  const P = dirToScreen(view, Ls[0], -Ls[1], Ls[2]); // the sun's mirror point below the horizon
  if (P) {
    const hz = elevY(view, 0);
    const k = W / 1920;
    glints(ctx, 0, hz, W, H - hz, t, { n: 110, seed: 5, size: 8 * k, sizeAt: (py) => 0.3 + 1.3 * (py - hz) / Math.max(1, H - hz), bias: 1.5, speed: 0.2, alpha: 0.95, alphaAt: (px2) => Math.exp(-Math.pow((px2 - P[0]) / (W * 0.13), 2)) });
  }
}

// ---- 3D polylines along the shore: sample d near to far around the camera
function shoreDs(view, span = 260) {
  const [, Cd] = camPos(view);
  const ds = [];
  for (let u = -1; u <= 1.0001; u += 1 / 150) ds.push(Cd + Math.sign(u) * Math.pow(Math.abs(u), 2) * span);
  return ds;
}
function strokeSegs(ctx, view, pts, style, wWorld, alphaAt, gapAt) {
  const dn = nearC(view);
  const F = view.base * view.cam.z * view.D;
  const k = view.W / 1920;
  let prev = null;
  for (let i = 0; i < pts.length; i++) {
    const q = toCam(view, pts[i][0], pts[i][1], pts[i][2]);
    if (prev && !(gapAt && gapAt(i))) {
      let a = prev, b = q;
      if (!(a[2] < dn && b[2] < dn)) {
        if (a[2] < dn) a = lerpQ(a, b, (dn - a[2]) / (b[2] - a[2]));
        else if (b[2] < dn) b = lerpQ(b, a, (dn - b[2]) / (a[2] - b[2]));
        const A = projC(view, a), Bp = projC(view, b);
        if (!((A[1] > view.H + 50 && Bp[1] > view.H + 50) || (A[0] < -200 && Bp[0] < -200) || (A[0] > view.W + 200 && Bp[0] > view.W + 200))) {
          const s = F / ((a[2] + b[2]) / 2);
          const al = alphaAt ? alphaAt(i, s) : 1;
          if (al > 0.01) {
            ctx.lineCap = al < 0.9 ? 'butt' : 'round';
            ctx.strokeStyle = css(style, al);
            ctx.lineWidth = Math.max(0.8 * k, wWorld * s);
            ctx.beginPath();
            ctx.moveTo(A[0], A[1]);
            ctx.lineTo(Bp[0], Bp[1]);
            ctx.stroke();
          }
        }
      }
    }
    prev = q;
  }
}
function lerpQ(a, b, u) {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

function drawFoam(ctx, view, t, G) {
  const ds = shoreDs(view);
  ctx.save();
  ctx.lineCap = 'round';
  // surf crests rolling in and breaking
  const K = 9;
  for (let c = 0; c < K; c++) {
    const ph = (t * 0.0045 + c / K) % 1;
    const off = 3.2 + Math.pow(1 - ph, 1.4) * 60;
    const brk = 1 - smoothstep(3.2, 14, off);
    const fade = Math.sin(ph * Math.PI);
    if (fade < 0.02) continue;
    const cyc = Math.floor(t * 0.0045 + c / K);
    const pts = ds.map((d) => [G.still(d, t) + off + Math.sin(d * 0.21 + c) * 0.12 + noise1(d * 0.04 + c * 5, 2) * 0.35, 0, d]);
    const on = ds.map((d) => smoothstep(0.1 - 0.35 * brk, 0.55 - 0.3 * brk, 0.5 + 0.5 * noise1(d * 0.12 + c * 7.3 + cyc * 3.1, 8)));
    strokeSegs(ctx, view, pts, '#f6fbfd', 0.05 + 0.1 * brk, (i, s) => on[i] * fade * (0.09 + 0.6 * brk) * (0.4 + 0.6 * smoothstep(0, 60, s)) * (1 - 0.6 * smoothstep(120, 420, s)));
    strokeSegs(ctx, view, pts.map(([x, y, d]) => [x + 0.25, y, d]), '#2d6a9c', 0.12, (i) => 0.1 * fade * on[i]);
  }
  // foam lines of the incoming swash drifting landward
  for (let kk = 0; kk < 6; kk++) {
    const ph = (t * 0.012 + kk / 6) % 1;
    const a = Math.sin(ph * Math.PI) * 0.5 * (1 - smoothstep(0.55, 0.95, ph));
    const cyc = Math.floor(t * 0.012 + kk / 6);
    const pts = ds.map((d) => [lerp(G.still(d, t) + 7, G.shore(d, t) + 0.25, ph) + noise1(d * 0.22 + kk * 3, 6) * 0.1, 0, d]);
    const on = ds.map((d) => smoothstep(0.5, 0.8, 0.5 + 0.5 * noise1(d * 0.5 + kk * 5.1 + cyc * 2.3, 9)));
    strokeSegs(ctx, view, pts, BEACH.foam, 0.035 * (1.2 - ph * 0.6), (i, s) => on[i] * a * (1 - 0.65 * smoothstep(140, 420, s)));
  }
  // the lacy front of the swash, and bubbles
  const tq = Math.floor(t / 8);
  for (const [w, a, dx] of [[0.09, 0.95, 0], [0.04, 0.6, 0.22], [0.03, 0.45, 0.5]]) {
    const pts = ds.map((d) => [G.shore(d, t) + Math.sin(d * 2.1 + t * 0.2) * 0.06 + dx, 0, d]);
    strokeSegs(ctx, view, pts, BEACH.foam, w, () => a, (i) => hash01(Math.round(ds[i] * 4) * 3 + Math.round(dx * 10) + tq) < (dx ? 0.35 : 0.04));
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const F = view.base * view.cam.z * view.D;
  const k = view.W / 1920;
  const tb = Math.floor(t / 6);
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i];
    for (let b = 0; b < 3; b++) {
      const q = toCam(view, G.shore(d, t) + 0.12 + 0.6 * hash01(i * 5 + b), 0, d + (hash01(i + b * 9) - 0.5) * 0.4);
      if (q[2] < nearC(view)) continue;
      const [X, Y] = projC(view, q);
      if (X < -20 || X > view.W + 20 || Y > view.H + 20) continue;
      const s = F / q[2];
      const r = Math.max(0.6 * k, s * (0.01 + 0.018 * hash01(i * 3 + b + tb)));
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---- the dune: filled between its toe line and its silhouette ---------------
// the silhouette of the last dune drawn (for clipping things behind the crest)
const S_SIL = { step: 1, top: null, W: 0 };
export function clipAboveDune(ctx) {
  if (!S_SIL.top) return;
  const { step, top } = S_SIL;
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  ctx.lineTo(S_SIL.W + 10, -10);
  for (let i = top.length - 1; i >= 0; i--) ctx.lineTo(i * step, Number.isFinite(top[i]) ? top[i] : 1e5);
  ctx.closePath();
  ctx.clip();
}
function drawDune(ctx, view, t, G, o) {
  const W = view.W, H = view.H;
  const [Cx, Cd] = camPos(view);
  const F = view.base * view.cam.z * view.D;
  const dn = nearC(view);
  const step = Math.max(2, Math.round(W / 960));
  const n = Math.ceil(W / step) + 1;
  const top = new Float64Array(n).fill(Infinity);
  const bot = new Float64Array(n).fill(-Infinity);
  const raster = (pts, arr, better) => {
    let prev = null;
    for (const p of pts) {
      const q = toCam(view, p[0], p[1], p[2]);
      if (prev) {
        let a = prev, b = q;
        if (!(a[2] < dn && b[2] < dn)) {
          if (a[2] < dn) a = lerpQ(a, b, (dn - a[2]) / (b[2] - a[2]));
          else if (b[2] < dn) b = lerpQ(b, a, (dn - b[2]) / (a[2] - b[2]));
          let A = projC(view, a), Bp = projC(view, b);
          if (A[0] > Bp[0]) [A, Bp] = [Bp, A];
          const put = (i, y) => {
            if (i >= 0 && i < n && better(y, arr[i])) arr[i] = y;
          };
          put(Math.round(A[0] / step), A[1]);
          put(Math.round(Bp[0] / step), Bp[1]);
          const dxs = Bp[0] - A[0];
          if (dxs > 1e-9) {
            const i0 = Math.max(0, Math.ceil(A[0] / step)), i1 = Math.min(n - 1, Math.floor(Bp[0] / step));
            for (let i = i0; i <= i1; i++) put(i, A[1] + ((Bp[1] - A[1]) * (i * step - A[0])) / dxs);
          }
        }
      }
      prev = q;
    }
  };
  // d samples: dense near the camera, sparse far along the shore
  const ds = [];
  for (let u = -1; u <= 1.0001; u += 1 / 70) ds.push(Cd + Math.sign(u) * Math.pow(Math.abs(u), 2.2) * 1400);
  const lo = (a, b) => a < b, hi = (a, b) => a > b;
  // profiles across the dune, and lines along it
  for (const d of ds) {
    const a = G.toe(d), c = G.crest(d);
    const prof = [];
    for (let u = 0; u <= 1.0001; u += 1 / 14) {
      const x = lerp(a, c - 18, u);
      prof.push([x, G.gy(x, d), d]);
    }
    raster(prof, top, lo);
  }
  for (const f of [0.1, 0.3, 0.5, 0.7, 0.85, 1, 1.15, 1.6]) raster(ds.map((d) => {
    const x = lerp(G.toe(d), G.crest(d), f);
    return [x, G.gy(x, d), d];
  }), top, lo);
  // the foot of the dune: its lower boundary on screen
  raster(ds.map((d) => [G.toe(d), 0, d]), bot, hi);
  // spans where the face is visible
  let minY = Infinity;
  const spans = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    const tp = top[i];
    const bt = bot[i] === -Infinity ? H + 4 : Math.min(H + 4, bot[i]);
    if (tp < bt && tp < H + 4) {
      if (!cur) {
        cur = [];
        spans.push(cur);
      }
      cur.push([i * step, Math.max(-4, tp), bt]);
      minY = Math.min(minY, tp);
    } else cur = null;
  }
  S_SIL.step = step;
  S_SIL.top = top;
  S_SIL.W = W;
  if (!spans.length) return;
  minY = Math.max(-4, minY);
  const g = ctx.createLinearGradient(0, minY, 0, H);
  g.addColorStop(0, '#f6e7ca');
  g.addColorStop(0.35, '#ead5ae');
  g.addColorStop(1, BEACH.sand[0]);
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  for (const sp of spans) {
    ctx.moveTo(sp[0][0], sp[0][1]);
    for (const [X, tp] of sp) ctx.lineTo(X, tp);
    for (let i = sp.length - 1; i >= 0; i--) ctx.lineTo(sp[i][0], sp[i][2]);
    ctx.closePath();
  }
  ctx.fill();
  ctx.clip();
  // the lee of the crest in soft shade, wind ripples across the face
  const k = W / 1920;
  ctx.lineCap = 'round';
  for (const d0 of ds) {
    if (Math.abs(d0 - Cd) > 160) continue;
    for (let r = 0; r < 3; r++) {
      const hh = hash01(Math.round(d0 * 3) * 7 + r);
      if (hh < 0.45) continue;
      const f = 0.15 + 0.75 * hash01(Math.round(d0 * 3) * 13 + r);
      const pts = [];
      for (let u = -1; u <= 1.001; u += 0.25) {
        const d = d0 + u * 1.6;
        const x = lerp(G.toe(d), G.crest(d), f) + Math.sin(u * 3 + d0) * 0.12;
        pts.push([x, G.gy(x, d), d]);
      }
      strokeSegs(ctx, view, pts, '#b79a70', 0.035, (i, s) => 0.25 * (1 - smoothstep(60, 300, s * 0 + Math.abs(d0 - Cd) * 2)));
    }
  }
  ctx.restore();
  // marram grass along the crest and on the face, a weathered sand fence
  const items = [];
  for (let i = 0; i < 520; i++) {
    const d = Cd - 60 + Math.pow(hash01(i * 3 + 1), 1.6) * 360;
    const f = 0.55 + 0.75 * hash01(i * 7 + 2);
    const x = lerp(G.toe(d), G.crest(d), f) + (hash01(i * 11) - 0.5) * 2;
    if (o.grassGap && o.grassGap(x, d)) continue;
    const q = toCam(view, x, G.gy(x, d), d);
    if (q[2] < dn * 3) continue;
    items.push([q, 'tuft', i]);
  }
  if (o.fence !== false) {
    for (let d = Math.floor((Cd - 60) / 2.6) * 2.6; d < Cd + 300; d += 2.6) {
      if (o.fenceGap && o.fenceGap(d)) continue;
      const x = G.crest(d) - 1.2;
      const q = toCam(view, x, G.gy(x, d), d);
      if (q[2] < dn * 3) continue;
      items.push([q, 'post', Math.round(d * 10), x, d]);
    }
  }
  items.sort((A, B) => B[0][2] - A[0][2]);
  const wind = (t2, i) => 0.25 + 0.2 * Math.sin(t2 * 0.05 + i * 0.7) + 0.1 * Math.sin(t2 * 0.13 + i);
  for (const it of items) {
    const q = it[0];
    const s = F / q[2];
    const [X, Y] = projC(view, q);
    if (X < -60 * s || X > W + 60 * s || Y - 3 * s > H || Y < -H) continue;
    ctx.save();
    ctx.setTransform(s, 0, 0, s, X, Y);
    if (it[1] === 'tuft') marram(ctx, it[2], wind(t, it[2]), q[2]);
    else fencePost(ctx, it[2], q[2]);
    ctx.restore();
  }
}
function marram(ctx, seed, w, dist) {
  const n = 5 + Math.floor(hash01(seed * 5) * 5);
  const hz = clamp(dist / 220, 0, 0.6);
  for (let b = 0; b < n; b++) {
    const hb = 0.8 + 0.9 * hash01(seed * 13 + b);
    const lean = (hash01(seed * 17 + b) - 0.5) * 0.9 + w * 0.8;
    const c = BEACH.duneGrass[b % 2];
    ctx.fillStyle = css(mix(mix(c, '#6f7a4c', hash01(seed + b * 3) * 0.4), '#e9eef0', hz));
    const x0 = (b - n / 2) * 0.05;
    ctx.beginPath();
    ctx.moveTo(x0 - 0.035, 0.02);
    ctx.quadraticCurveTo(x0 + lean * 0.35, -hb * 0.55, x0 + lean * hb * 0.7, -hb);
    ctx.quadraticCurveTo(x0 + lean * 0.3 + 0.02, -hb * 0.5, x0 + 0.035, 0.02);
    ctx.closePath();
    ctx.fill();
  }
}
function fencePost(ctx, seed, dist) {
  const hz = clamp(dist / 220, 0, 0.6);
  const h = 1.1 + 0.4 * hash01(seed);
  const lean = (hash01(seed * 3) - 0.5) * 0.25;
  ctx.fillStyle = css(mix('#8a7560', '#e9eef0', hz));
  ctx.beginPath();
  ctx.moveTo(-0.05, 0.05);
  ctx.lineTo(0.05, 0.05);
  ctx.lineTo(0.05 + lean * h, -h);
  ctx.lineTo(-0.05 + lean * h, -h + 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = css(mix('#6f5f50', '#e9eef0', hz), 0.8);
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  ctx.moveTo(lean * h * 0.4, -h * 0.4);
  ctx.lineTo(1.3 + lean * h * 0.4, -h * 0.35 + 0.08 * Math.sin(seed));
  ctx.moveTo(lean * h * 0.75, -h * 0.75);
  ctx.lineTo(1.3 + lean * h * 0.75, -h * 0.7 + 0.08 * Math.cos(seed));
  ctx.stroke();
}

// ---- sand detail: speckles, wind ripples, shells; footprints -----------------
function drawSandDetail(ctx, view, t, G, o) {
  const W = view.W, H = view.H;
  const [Cx, Cd] = camPos(view);
  const F = view.base * view.cam.z * view.D;
  const dn = nearC(view);
  const k = W / 1920;
  // world-anchored scatter on a grid around the camera
  const scatter = (cell, radius, fn) => {
    const i0 = Math.floor((Cx - radius) / cell), i1 = Math.floor((Cx + radius) / cell);
    const j0 = Math.floor((Cd - radius) / cell), j1 = Math.floor((Cd + radius) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) fn(i, j, cell);
  };
  ctx.save();
  scatter(0.8, 34, (i, j, cell) => {
    const h = hash2(i, j);
    const x = (i + hash2(i + 91, j)) * cell, d = (j + hash2(i, j + 37)) * cell;
    if (x > G.wetLine(d, t) - 0.1) return;
    if (G.dune && x < G.toe(d)) return;
    const q = toCam(view, x, 0, d);
    if (q[2] < dn * 2) return;
    const s = F / q[2];
    const r = (0.012 + 0.016 * hash2(i + 5, j + 3)) * s;
    if (r < 0.35 * k) return;
    const [X, Y] = projC(view, q);
    if (X < -5 || X > W + 5 || Y < 0 || Y > H + 5) return;
    ctx.fillStyle = h < 0.6 ? 'rgba(150,118,80,0.28)' : 'rgba(255,250,236,0.5)';
    ctx.fillRect(X - r, Y - r * 0.4, r * 2, r * 0.8);
  });
  // wind ripples on the dry sand
  ctx.lineCap = 'round';
  scatter(2.2, 40, (i, j, cell) => {
    if (hash2(i * 3, j * 5) < 0.55) return;
    const x = (i + hash2(i, j + 11)) * cell, d = (j + hash2(i + 13, j)) * cell;
    if (x > G.wetLine(d, t) - 0.6) return;
    if (G.dune && x < G.toe(d)) return;
    const pts = [];
    for (let u = -1; u <= 1.001; u += 0.34) pts.push([x + Math.sin(u * 2.4 + i) * 0.06, 0, d + u * (0.8 + 0.6 * hash2(i, j))]);
    strokeSegs(ctx, view, pts, '#a07d55', 0.03, (m, s) => 0.2 * smoothstep(10, 40, s));
  });
  // shells and pebbles strewn along the tide line
  scatter(1.6, 30, (i, j, cell) => {
    if (hash2(i * 7, j * 3) < 0.9) return;
    const d = (j + hash2(i + 3, j + 9)) * cell;
    const x = G.wetEdge(d) + d * G.slope + G.meander(d) - 4 + hash2(i, j + 5) * 5.5;
    if (x > G.shore(d, t) - 0.3) return;
    const q = toCam(view, x, 0, d);
    if (q[2] < dn * 2) return;
    const s = F / q[2];
    const [X, Y] = projC(view, q);
    if (X < -20 || X > W + 20 || Y > H + 10) return;
    const r = (0.035 + 0.05 * hash2(i + 1, j)) * s;
    const flat = clamp(-view.cam.y / Math.max(1, q[2]) * 3, 0.25, 0.8);
    const shell = hash2(i, j * 3) < 0.45;
    ctx.fillStyle = shell ? '#f3e6dc' : '#a39a90';
    ctx.beginPath();
    ctx.ellipse(X, Y, r, r * flat, (hash2(i * 5, j) - 0.5) * 0.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = shell ? 'rgba(214,160,150,0.8)' : 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(X - r * 0.2, Y - r * flat * 0.3, r * 0.45, r * flat * 0.36, 0, 0, TAU);
    ctx.fill();
  });
  // footprints: pressed dimples, darker on wet sand, washed out by the waves
  if (o.prints) {
    for (const [x, d, t0, sz] of o.prints(t)) {
      if (t0 > t) continue;
      if (G.waves.some((w) => w.t > t0 && t > w.t + w.dur * 0.25 && G.shore(d, w.t + w.dur * 0.35) < x)) continue;
      if (x > G.shore(d, t) - 0.05) continue;
      const y = G.gy(x, d);
      const q = toCam(view, x, y, d);
      if (q[2] < dn * 2) continue;
      const s = F / q[2];
      const [X, Y] = projC(view, q);
      if (X < -20 || X > W + 20 || Y > H + 20) continue;
      const age = Math.min(1, (t - t0) / 2);
      const wet = x > G.wetLine(d, t) - 0.1;
      const flat = clamp(-(view.cam.y - y) / Math.max(1, q[2]) * 3, 0.2, 0.8);
      const r = (sz ?? 1) * 0.075 * s;
      ctx.fillStyle = css(wet ? '#8d7a62' : '#b89b73', (wet ? 0.5 : 0.42) * age);
      ctx.beginPath();
      ctx.ellipse(X, Y, r, r * flat, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = css('#fff6e6', 0.3 * age);
      ctx.beginPath();
      ctx.ellipse(X - r * 0.25, Y - r * flat * 0.35, r * 0.65, r * flat * 0.35, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---- water hugging the paws that stand in the swash -------------------------
function drawPawWater(ctx, view, t, G, paws) {
  const F = view.base * view.cam.z * view.D;
  const dn = nearC(view);
  ctx.save();
  let k = 0;
  for (const [x, d] of paws || []) {
    k++;
    const e = G.shore(d, t);
    if (x < e + 0.03) continue;
    const a = smoothstep(e + 0.03, e + 0.5, x) * (1 - smoothstep(G.still(d, t) + 1.5, G.still(d, t) + 3, x));
    if (a < 0.02) continue;
    const q = toCam(view, x, 0, d);
    if (q[2] < dn * 2) continue;
    const s = F / q[2];
    const [X, Y] = projC(view, q);
    const flat = clamp(-view.cam.y / Math.max(0.5, q[2]) * 2.2, 0.12, 0.6);
    const w = s * (0.2 + 0.03 * Math.sin(t * 0.4 + k)), h = w * flat;
    ctx.fillStyle = css('#cfe8ef', 0.55 * a);
    ctx.beginPath();
    ctx.ellipse(X, Y - h * 0.3, w, h, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = css('#ffffff', 0.85 * a);
    ctx.lineWidth = Math.max(1.5 * view.W / 1920, s * 0.014);
    ctx.beginPath();
    ctx.ellipse(X, Y - h * 0.3, w * 1.05, h * 1.1, 0, Math.PI * (0.9 + 0.1 * Math.sin(t * 0.3 + k)), Math.PI * 2.1);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- the headland across the bay: a promontory from its tip (with the
// lighthouse) running away seaward, in world coordinates ---------------------
const HL_TOP = [[0, 40], [0.012, -110], [0.035, -250], [0.07, -318], [0.18, -342], [0.45, -362], [0.7, -352], [0.84, -300], [0.93, -170], [0.975, -40], [1, 40]];
function hlTop(u) {
  for (let i = 1; i < HL_TOP.length; i++) {
    if (u <= HL_TOP[i][0]) {
      const [ua, ya] = HL_TOP[i - 1], [ub, yb] = HL_TOP[i];
      const k = (u - ua) / (ub - ua);
      return ya + (yb - ya) * k * k * (3 - 2 * k);
    }
  }
  return 40;
}
function drawHeadland(ctx, view, o) {
  const T = o.tip || [1400, 9000], E = o.end || [9800, 12600];
  const P = (u, y) => {
    const q = toCam(view, T[0] + (E[0] - T[0]) * u, y, T[1] + (E[1] - T[1]) * u);
    return q[2] > 50 ? projC(view, q) : null;
  };
  const N = 120;
  const top = [], base = [], turf = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const y = hlTop(u) + noise1(u * 60, 17) * 7 + noise1(u * 190, 19) * 2.5;
    const a = P(u, y), b = P(u, 0), c = P(u, y + 16 + 6 * noise1(u * 80, 23));
    if (!a || !b) return;
    top.push(a);
    base.push(b);
    turf.push(c);
  }
  const xs = top.map((p) => p[0]);
  if (Math.max(...xs) < -50 || Math.min(...xs) > view.W + 50) return;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of top) y0 = Math.min(y0, p[1]);
  for (const p of base) y1 = Math.max(y1, p[1]);
  const face = new Path2D();
  top.forEach(([x, y], i) => (i ? face.lineTo(x, y) : face.moveTo(x, y)));
  for (let i = base.length - 1; i >= 0; i--) face.lineTo(base[i][0], base[i][1]);
  face.closePath();
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#c9b8b0');
  g.addColorStop(0.5, '#a09490');
  g.addColorStop(1, '#8a8390');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fill(face);
  ctx.clip(face);
  // strata and a few gullies
  const k = view.W / 1920;
  ctx.lineWidth = Math.max(0.6, 1.1 * k);
  for (const f of [0.28, 0.46, 0.63, 0.8]) {
    ctx.strokeStyle = css('#6f6874', 0.22);
    ctx.beginPath();
    let on = false;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      if (noise1(u * 14 + f * 40, 29) < -0.2) {
        on = false;
        continue;
      }
      const p = P(u, hlTop(u) * f + noise1(u * 70 + f * 9, 31) * 6);
      if (!p) continue;
      on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
      on = true;
    }
    ctx.stroke();
  }
  ctx.restore();
  // turf along the top, then the sunlit rim
  ctx.fillStyle = '#86a076';
  ctx.beginPath();
  for (let i = 3; i <= N - 7; i++) i === 3 ? ctx.moveTo(top[i][0], top[i][1]) : ctx.lineTo(top[i][0], top[i][1]);
  for (let i = N - 7; i >= 3; i--) ctx.lineTo(turf[i][0], turf[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,248,236,0.7)';
  ctx.lineWidth = Math.max(0.8, 1.6 * k);
  ctx.beginPath();
  top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  // the lighthouse and the keeper's house near the tip
  const ul = 0.075, yl = hlTop(ul) + 2;
  const q = toCam(view, T[0] + (E[0] - T[0]) * ul, yl, T[1] + (E[1] - T[1]) * ul);
  if (q[2] > 50) {
    const s = (view.base * view.cam.z * view.D) / q[2];
    const [X, Y] = projC(view, q);
    ctx.save();
    ctx.setTransform(s, 0, 0, s, X, Y);
    lighthouse(ctx);
    ctx.restore();
  }
}
function lighthouse(ctx) {
  ctx.fillStyle = '#e8e2d8';
  ctx.fillRect(70, -70, 150, 70);
  ctx.fillStyle = '#b8574c';
  ctx.beginPath();
  ctx.moveTo(58, -70);
  ctx.lineTo(145, -118);
  ctx.lineTo(232, -70);
  ctx.fill();
  const tg = ctx.createLinearGradient(-40, 0, 40, 0);
  tg.addColorStop(0, '#fffdf8');
  tg.addColorStop(0.6, '#f1ece2');
  tg.addColorStop(1, '#cfc7bd');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(-42, 0);
  ctx.lineTo(42, 0);
  ctx.lineTo(28, -330);
  ctx.lineTo(-28, -330);
  ctx.fill();
  ctx.fillStyle = '#c94f45';
  ctx.fillRect(-36, -205, 72, 34);
  ctx.fillStyle = '#3f3a44';
  ctx.fillRect(-44, -344, 88, 14);
  ctx.fillStyle = '#fff4c8';
  ctx.fillRect(-22, -392, 44, 48);
  ctx.fillStyle = '#c94f45';
  ctx.beginPath();
  ctx.moveTo(-30, -392);
  ctx.quadraticCurveTo(0, -440, 30, -392);
  ctx.fill();
}

// post-processing for the 3D beach: the light rays follow the sun on screen
export function beach3Post(S, base) {
  return () => {
    const p = S.sunScreen;
    const on = p ? clamp(1.4 - Math.max(Math.abs(p[0] - 0.5) - 0.5, -p[1], p[1] - 1, 0) * 3, 0, 1) : 0;
    return Object.assign({}, base, { rays: Object.assign({}, base.rays, { pos: p ? [clamp(p[0], -0.3, 1.3), clamp(p[1], -0.3, 1.3)] : [0.5, -0.5], strength: Math.min(0.18, base.rays ? base.rays.strength : 0.18) * on }) });
  };
}

// draw fn in the local frame of the ground plane at (x, y, d): u = +x, v = +d
// (affine around the point) — for things lying flat on the sand or the water
export function onGround(ctx, view, x, y, d, fn, e = 0.5) {
  const P0 = toCam(view, x, y, d), U = toCam(view, x + e, y, d), V = toCam(view, x, y, d + e);
  const dn = nearC(view);
  if (P0[2] < dn * 1.5 || U[2] < dn || V[2] < dn) return false;
  const p0 = projC(view, P0), pu = projC(view, U), pv = projC(view, V);
  ctx.save();
  ctx.setTransform((pu[0] - p0[0]) / e, (pu[1] - p0[1]) / e, (pv[0] - p0[0]) / e, (pv[1] - p0[1]) / e, p0[0], p0[1]);
  fn(ctx);
  ctx.restore();
  return true;
}
