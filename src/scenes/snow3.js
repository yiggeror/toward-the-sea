// The snowfield in 3D (Act II, B16a): an open field of fresh snow under a pale
// sun, far peaks, wind-carved drifts, a few rocks and dry stalks poking
// through, drawn through the perspective camera so the field recedes. The
// side-view cat walks on a turned stage and sinks into the snow: the snow
// surface lies a little above the stage ground, and the part of it in front of
// the stage line is drawn again over the cat's paws.
import { shot } from '../film/shot.js';
import { makeCat, screenLayer, at, follow } from '../film/kit.js';
import { toCam, projC, nearC, fill3, camPos } from '../film/persp.js';
import { mountains } from '../env/terrain.js';
import { skyGradient, glow } from '../env/sky.js';
import { lampGlow, particles } from '../env/light.js';
import { snow } from '../env/weather.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { css, mix } from '../core/draw.js';
import { hash01, hash2, clamp, lerp, TAU, smoothstep } from '../core/math.js';

const SNOW = {
  sky: [[0, '#7fa9d6'], [0.5, '#cfe0f0'], [0.85, '#f2f6fb'], [1, '#fdfdfd']],
  mtn: '#b7c3d3', snow: '#fbfcfe',
};
export const SURF = -0.16; // the snow surface (the stage ground is y = 0: paws sink 0.16)
const catSnow = {
  light: () => ({ tint: '#e6edf8', amt: 0.18, lift: '#0c0e14' }),
  rim: () => ({ color: '#ffffff', dir: [0.4, -0.9], alpha: 0.35, width: 0.05 }),
};
const snowGrade = { vignette: 0.28, vignetteColor: '#7d8fae', grain: 0.3, lift: '#e8eef8', liftAmt: 0.05 };
const snowPost = { bloom: { threshold: 0.9, knee: 0.08, strength: 0.4, radius: 22, tint: '#f4f8ff' } };

// world-anchored scatter around the camera: fn(i, j, x, d)
function scatter(view, cell, radius, fn) {
  const [cx, cd] = camPos(view);
  const i0 = Math.floor((cx - radius) / cell), i1 = Math.floor((cx + radius) / cell);
  const j0 = Math.floor((cd - radius) / cell), j1 = Math.floor((cd + radius) / cell);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) fn(i, j, (i + hash2(i + 91, j)) * cell, (j + hash2(i, j + 37)) * cell);
}
function ellipse3(ctx, view, x, y, d, rx, rd, fill, n = 14) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    pts.push([x + Math.cos(a) * rx, y, d + Math.sin(a) * rd]);
  }
  fill3(ctx, view, pts, fill);
}

/**
 * The field. o: { stageMap(xs, k) -> [x, d] (for the cat's prints), prints(t)
 * -> [[xs, near, t0]] } Returns nothing; pushes the layers, including the
 * front lip (z 1.05) that buries the paws.
 */
export function snowField(S, o = {}) {
  // sky, the sun and its ice halo
  S.layers.push(screenLayer(0, (ctx, t, W, H) => {
    skyGradient(ctx, W, H, SNOW.sky);
    const sx = W * 0.78, sy = H * 0.1;
    glow(ctx, sx, sy, W * 0.55, '#ffffff', 0.55);
    lampGlow(ctx, sx, sy, W * 0.05, '#ffffff', 1, 0.3);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = W * 0.012;
    ctx.beginPath();
    ctx.arc(sx, sy, W * 0.16, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }));
  // far peaks (layer space: they only pan)
  S.layers.push(Object.assign(at(22000, 0.03, (ctx, t, view, S2, p) => mountains(ctx, view, p, { seed: 7, period: 4200, h: 3200, w: 2800, base: 0, color: SNOW.mtn, shade: '#8f9fbd', snow: SNOW.snow, snowShade: '#c9d5e8', snowLine: 0.62 })), { haze: { color: '#dbe6f3', amount: 0.45 }, blur: 1.6 }));
  S.layers.push(Object.assign(at(6000, 0.05, (ctx, t, view, S2, p) => mountains(ctx, view, p, { seed: 11, period: 1500, h: 700, w: 1100, base: 0, color: '#c8d3e0', shade: '#a6b5cc', snow: SNOW.snow, snowShade: '#d3ddeb', snowLine: 0.75 })), { haze: { color: '#e4ecf6', amount: 0.3 } }));
  // the field, far to near: surface, drifts, sparkle, rocks and stalks
  S.layers.push(screenLayer(0.1, (ctx, t, W, H, view) => {
    const [cx, cd] = camPos(view);
    const R = 3000;
    const hz = projC(view, toCam(view, cx + Math.sin(view.cam.yaw || 0) * 1e4, SURF, cd + Math.cos(view.cam.yaw || 0) * 1e4))[1];
    const g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, '#dfe7f3');
    g.addColorStop(0.25, '#f1f5fa');
    g.addColorStop(1, '#fbfcfe');
    fill3(ctx, view, [[cx - R, SURF, cd - R], [cx + R, SURF, cd - R], [cx + R, SURF, cd + R], [cx - R, SURF, cd + R]], g);
    // long soft wind drifts: pale blue troughs across the field
    scatter(view, 12, 140, (i, j, x, d) => {
      if (hash2(i * 3, j * 7) < 0.3) return;
      const q = toCam(view, x, SURF, d);
      if (q[2] < 2) return;
      const a = (0.07 + 0.08 * hash2(i, j * 3)) * (1 - smoothstep(60, 140, q[2]));
      const rx = 5 + 6 * hash2(i * 5, j), rd = 1 + 1.2 * hash2(i, j * 5);
      // soft-edged: three nested troughs
      for (const k of [1, 0.72, 0.45]) ellipse3(ctx, view, x, SURF, d + (1 - k) * rd * 0.4, rx * k, rd * k, css('#b3c4df', a), 20);
      // the lit crest on the far side of the trough
      ellipse3(ctx, view, x, SURF, d + rd * 0.9, rx * 0.8, rd * 0.25, css('#ffffff', a * 2.5), 16);
    });
    // far-side prints (behind the stage line)
    if (o.prints) drawPrints(ctx, view, o, t, false);
    // sparkle
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    scatter(view, 1.1, 30, (i, j, x, d) => {
      const tw = Math.sin(t * 0.18 + hash2(i, j) * 40);
      if (tw < 0.8) return;
      const q = toCam(view, x, SURF, d);
      if (q[2] < 1) return;
      const [X, Y] = projC(view, q);
      if (X < 0 || X > W || Y < 0 || Y > H) return;
      ctx.fillStyle = css('#ffffff', (tw - 0.8) * 5);
      ctx.beginPath();
      ctx.arc(X, Y, 1.8 * (W / 1920), 0, TAU);
      ctx.fill();
    });
    ctx.restore();
    // rocks and dry stalks poking through, sorted far to near
    const items = [];
    scatter(view, 6, 90, (i, j, x, d) => {
      const h = hash2(i * 7, j * 11);
      if (h > 0.5) return;
      const q = toCam(view, x, SURF, d);
      if (q[2] < 3) return;
      items.push([q, h < 0.07 ? 'rock' : 'stalks', i * 1000 + j]);
    });
    items.sort((a, b) => b[0][2] - a[0][2]);
    for (const [q, kind, seed] of items) {
      const s = (view.base * view.cam.z * view.D) / q[2];
      const [X, Y] = projC(view, q);
      if (X < -3 * s || X > W + 3 * s || Y > H + 2 * s) continue;
      const fk = smoothstep(20, 120, q[2]);
      ctx.save();
      ctx.setTransform(s, 0, 0, s, X, Y);
      if (kind === 'rock') {
        const w = 0.5 + 0.8 * hash01(seed), h2 = w * (0.3 + 0.2 * hash01(seed * 3));
        ctx.fillStyle = css(mix('#8d95a4', '#dfe7f3', 0.2 + fk * 0.7));
        ctx.beginPath();
        ctx.ellipse(0, 0.05, w, h2, 0, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = css(mix('#fbfcfe', '#eef3f9', fk));
        ctx.beginPath();
        ctx.ellipse(-0.1 * w, -h2 * 0.55, w * 0.8, h2 * 0.5, 0, Math.PI, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = css(mix('#8a7e68', '#dfe7f3', fk * 0.8));
        ctx.lineWidth = 0.035;
        ctx.lineCap = 'round';
        const n = 4 + Math.floor(hash01(seed * 5) * 5);
        for (let k = 0; k < n; k++) {
          const hh = 0.5 + 0.9 * hash01(seed * 7 + k), lean = (hash01(seed * 11 + k) - 0.5) * 0.5 + 0.12 * Math.sin(t * 0.05 + k + seed);
          ctx.beginPath();
          ctx.moveTo((k - n / 2) * 0.06, 0.02);
          ctx.quadraticCurveTo((k - n / 2) * 0.06 + lean * 0.3, -hh * 0.5, (k - n / 2) * 0.06 + lean, -hh);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }));
  // the front lip: the snow surface in front of the stage line, over the paws
  S.layers.push(screenLayer(1.05, (ctx, t, W, H, view) => {
    const [cx, cd] = camPos(view);
    const yaw = view.cam.yaw || 0;
    const f = [Math.sin(yaw), Math.cos(yaw)], r = [Math.cos(yaw), -Math.sin(yaw)];
    const a = view.D - 0.25, b = 0.3;
    const P = (k, s) => [cx + f[0] * k + r[0] * s, SURF, cd + f[1] * k + r[1] * s];
    const qa = toCam(view, ...P(a, 0)), qb = toCam(view, ...P(b + 2, 0));
    const Ya = projC(view, qa)[1], Yb = projC(view, qb)[1];
    const g = ctx.createLinearGradient(0, Ya, 0, Math.max(Ya + 1, Yb));
    g.addColorStop(0, '#f3f6fb');
    g.addColorStop(1, '#fbfcfe');
    fill3(ctx, view, [P(a, -400), P(a, 400), P(b, 400), P(b, -400)], g);
    // a soft rim where the paws broke the crust
    if (o.prints) drawPrints(ctx, view, o, t, true);
  }));
  // falling snow and big soft flakes right in front of the lens
  S.layers.push(screenLayer(2.5, (ctx, t, W, H, view) => snow(ctx, W, H, t, { density: o.density ?? 0.6, wind: 0.5, fall: 0.003, seed: 3, camX: view.cam.x * 0.02 })));
  S.layers.push(screenLayer(2.6, (ctx, t, W, H) => particles(ctx, W, H, t, { n: 8, seed: 21, color: '#ffffff', alpha: 0.3, size: 14, vx: 0.6, vy: 1.4, glow: 2.2, sway: 2 })));
}
function drawPrints(ctx, view, o, t, near) {
  for (const [xs, isNear, t0] of o.prints(t)) {
    if (isNear !== near || t0 > t) continue;
    const [x, d] = o.stageMap(xs, isNear ? -0.14 : 0.14);
    const age = Math.min(1, (t - t0) / 3);
    ellipse3(ctx, view, x, SURF - 0.002, d, 0.17, 0.12, css('#9fb2cf', 0.55 * age), 10);
    ellipse3(ctx, view, x - 0.03, SURF - 0.004, d - 0.03, 0.1, 0.06, css('#7f93b4', 0.4 * age), 8);
  }
}

// ---- B16a the first steps into the snow ---------------------------------------
// a turned stage: the field recedes to the far peaks behind the cat
export function B16a(o = {}) {
  const T = o.dur ?? 105;
  const cam = { yaw: -Math.PI / 2 + 0.5, px: 0, pd: 0, dz: 0, x: 1.0, y: SURF - 1.05, z: 1, pitch: 0.03 };
  const yaw = cam.yaw, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const stageMap = (xs, k = 0) => [xs * cs + k * sn, -xs * sn + k * cs];
  let P;
  return shot({
    name: 'B16a', dur: T, unit: 120, anchor: [0.5, 0.6], xfade: o.xfade ?? 20, grade: snowGrade, post: snowPost,
    cam,
    setup(S) {
      const prints = () => P.events.filter((e) => e.type === 'step' && e.x !== undefined).map((e) => [e.x + (e.leg && e.leg[0] === 'h' ? -0.04 : 0.04), !(e.leg && e.leg[1] === 'f'), e.t]);
      snowField(S, { stageMap, prints, density: 0.55 });
      const cat = makeCat(S, { x: -2.6, facing: 1, carry: { wear: 0.68 }, marks: false, ...catSnow });
      P = cat.perf;
      P.t = 0;
      locomote(P, { gait: 'walk', to: -0.2, accel: 6, decel: 10 });
      A.snowFirstStep(P, { depth: 0.2 });
      A.wait(P, 6);
      locomote(P, { gait: 'stalk', dist: 3.2, height: 0.95, override: { pulse: 0.35, S: 0.8, C: 26 }, surface: 'snow', pose: { neck: 0.4, hPitch: -0.35, lookY: -0.6, earRot: 0 } });
      S.camera.follow = follow(P, { lag: 12, lead: 6, dx: 0.8 });
      S.camera.key(0, { x: 0 });
      S.extraEvents = [{ t: 0, type: 'amb', name: 'snow' }];
    },
  });
}
