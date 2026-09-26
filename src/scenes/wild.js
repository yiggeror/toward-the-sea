// Sequence 5 — the wasteland (tired, dusty, a long road).
// Sequence 6 — the snowfield (quiet, bright; first steps into snow).
import { shot } from '../film/shot.js';
import { makeCat, follow, ramp, screenLayer, at, standingPose, sittingPose } from '../film/kit.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { skyGradient, glow, clouds, cirrus } from '../env/sky.js';
import { lampGlow, fogBand, particles, glints, lightPool, bokeh } from '../env/light.js';
import { profile, fillBelow, groundPlane, groundEllipse, mountains } from '../env/terrain.js';
import { tufts, windField, rock, tree } from '../env/nature.js';
import { dust, snow, windStreaks } from '../env/weather.js';
import { tumbleweed } from '../env/creatures.js';
import { pole, wires } from '../env/city.js';
import { Track } from '../core/tracks.js';
import { css, mix } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';

// ================================ 5. WASTELAND ==============================
const WASTE = {
  sky: [[0, '#6597c4'], [0.42, '#b3cbd9'], [0.72, '#f0dcba'], [1, '#f6d3a2']],
  mesaFar: '#c7a99f', mesaMid: '#b88f72', hill: '#c6a984',
  ground: ['#b38a5f', '#dcbf90'], crack: 'rgba(110,78,50,0.4)',
  straw: ['#c2a771', '#a98f5d'], rock: ['#9d8b78', '#b8a692', null],
  pole: '#6b5b4b', wire: '#5d5044',
};
const catSun = {
  light: () => ({ tint: '#fff0dc', amt: 0.1, lift: '#141008' }),
  rim: () => ({ color: '#fff4dc', dir: [0.3, -0.95], alpha: 0.5, width: 0.05 }),
};
const dryWind = windField({ base: 0.2, gust: 0.5, speed: 0.2, wave: 0.05, dir: 1 });
const wasteGrade = { vignette: 0.34, vignetteColor: '#6b4a30', grain: 0.42, topGlow: '#fff0d0', topGlowAmt: 0.15, tint: '#f7e2c4', tintAmt: 0.1 };
const wastePost = { bloom: { threshold: 0.86, knee: 0.12, strength: 0.45, radius: 26, tint: '#ffe2b0' }, rays: { pos: [0.74, 0.07], radius: 0.3, strength: 0.3, length: 0.5, threshold: 0.9, knee: 0.08, tint: '#ffe0a8' } };

function wasteBackdrop(S, o = {}) {
  S.layers.push(screenLayer(0, (ctx, t, W, H) => {
    skyGradient(ctx, W, H, WASTE.sky);
    glow(ctx, W * 0.74, H * 0.07, W * 0.7, '#fff3d8', 0.7);
    lampGlow(ctx, W * 0.74, H * 0.07, W * 0.07, '#fffbee', 1, 0.3);
    cirrus(ctx, W, H, t, { n: 6, seed: 3, y0: 0.06, y1: 0.3, alpha: 0.45, color: '#fffaf0' });
  }));
  const far = profile({ base: 0, amp: 420, freq: 0.0006, seed: 41, peaks: 0.6 });
  const mid = profile({ base: 0, amp: 120, freq: 0.002, seed: 43 });
  S.layers.push(Object.assign(at(8000, 0.05, (ctx, t, view, S2, p) => fillBelow(ctx, view, p, far, WASTE.mesaFar, 12000, 50)), { haze: { color: '#d9c6c4', amount: 0.35 }, blur: 1.4 }));
  if (o.snowPeaks) S.layers.push(at(20000, 0.04, (ctx, t, view, S2, p) => mountains(ctx, view, p, { seed: 5, period: 5200, h: 2600, w: 3000, base: 0, color: '#aeb8c8', shade: '#98a3b6', snow: '#f4f6fa', snowShade: '#d8dfea', snowLine: 0.5 })));
  S.layers.push(Object.assign(at(1500, 0.08, (ctx, t, view, S2, p) => {
    fillBelow(ctx, view, p, mid, WASTE.mesaMid, 4000, 12);
    // sunlit rims on the mesa tops
    const [x0, x1] = view.xRange(p, 0.1);
    ctx.strokeStyle = 'rgba(255,226,180,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 8) (x === x0 ? ctx.moveTo(x, mid(x)) : ctx.lineTo(x, mid(x)));
    ctx.stroke();
  }), { haze: { color: '#e6cdb4', amount: 0.2 } }));
  S.layers.push(screenLayer(0.1, (ctx, t, W, H, view) => {
    const Y = groundPlane(ctx, view, { y: 0, bands: [[-500, 1500, WASTE.ground]] });
    // cracks (screen-space scribbles laid on the ground plane)
    ctx.strokeStyle = WASTE.crack;
    ctx.lineWidth = Math.max(1, W / 1920);
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const d = -20 + Math.pow(hash01(i * 3), 2) * 300;
      const p = view.pOf(d), sc = view.scaleAt(p);
      const xw = view.cam.x + (hash01(i * 7) - 0.5) * (W / sc) * 1.2;
      const x = view.ox + (xw - view.cam.x) * sc, y = Y(d);
      const L = (1.5 + 3 * hash01(i * 11)) * sc;
      ctx.moveTo(x, y);
      ctx.lineTo(x + L * 0.5, y + L * 0.06);
      ctx.lineTo(x + L, y - L * 0.03);
      ctx.moveTo(x + L * 0.5, y + L * 0.06);
      ctx.lineTo(x + L * 0.6, y + L * 0.2);
    }
    ctx.stroke();
    // heat shimmer: a bright band where the ground meets the far hills
    const yH = Y(1400);
    fogBand(ctx, W, H, yH, H * 0.07, '#fff1d8', 0.5, t, { seed: 2, speed: 1.5 });
  }));
  if (o.poles !== false) {
    S.layers.push(at(60, 0.2, (ctx, t, view, S2, p) => {
      const [x0, x1] = view.xRange(p, 0.3);
      const xs = [];
      for (let x = Math.floor(x0 / 70) * 70; x <= x1 + 70; x += 70) xs.push(x);
      // long shadows of the poles across the ground
      ctx.fillStyle = 'rgba(110,70,40,0.18)';
      for (const x of xs) {
        ctx.beginPath();
        ctx.moveTo(x - 0.6, 0);
        ctx.lineTo(x + 0.6, 0);
        ctx.lineTo(x - 26, 5.5);
        ctx.lineTo(x - 27.5, 5.5);
        ctx.fill();
      }
      for (const x of xs) pole(ctx, x, 0, 60, WASTE.pole, false);
      ctx.fillStyle = WASTE.pole;
      for (const x of xs) ctx.fillRect(x - 5, -57, 10, 0.8);
      wires(ctx, { poles: xs.map((x) => x - 4), topYAt: () => -57.2, wires: [0], sag: 0.35, color: WASTE.wire, width: 0.3 }, t);
      wires(ctx, { poles: xs.map((x) => x + 4), topYAt: () => -57.2, wires: [0], sag: 0.35, color: WASTE.wire, width: 0.3 }, t);
    }));
  }
  S.layers.push(at(20, 0.25, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: () => 0, spacing: 4, h: 1.3, width: 0.12, colors: WASTE.straw, seed: 5, wind: dryWind, fill: 0.5 })));
  S.layers.push(at(4, 0.3, (ctx, t, view, S2, p) => {
    tufts(ctx, view, p, t, { ground: () => 0, spacing: 3, h: 1.0, width: 0.1, colors: WASTE.straw, seed: 7, wind: dryWind, fill: 0.45 });
    const [x0, x1] = view.xRange(p, 0.2);
    for (let i = Math.floor(x0 / 9); i <= x1 / 9; i++) if (hash01(i * 13) < 0.3) rock(ctx, i * 9 + 3, 0.1, 0.9 + hash01(i) * 0.8, 0.5 + hash01(i * 2) * 0.3, WASTE.rock, i);
  }));
}
function wasteAir(S) {
  S.layers.push(screenLayer(2.5, (ctx, t, W, H) => {
    dust(ctx, W, H, t, { n: 70, y0: 0.45, y1: 0.98, speed: 9, color: '#e8d2a8', alpha: 0.35, seed: 5, dir: 1 });
    // sunlit dust motes hanging in the air
    particles(ctx, W, H, t, { n: 34, seed: 8, color: ['#fff0c8', '#ffe2a8'], alpha: 0.6, size: 2, vx: 0.8, vy: -0.05, glow: 3, twinkle: 0.05 });
  }));
}

function s5_1() {
  return shot({
    name: '5.1', dur: 204, unit: 30, anchor: [0.5, 0.66], fadeIn: 30, post: wastePost, grade: wasteGrade,
    cam: { x: -4, y: -4, z: 1 },
    setup(S) {
      S.camera.move(0, 204, { x: 8 }, 'linear');
      wasteBackdrop(S);
      const cat = makeCat(S, { x: -22, facing: 1, carry: { wear: 0.55 }, ...catSun, wind: () => [0.4, 0] });
      const P = cat.perf;
      P.t = 2;
      locomote(P, { gait: 'tired', dist: 26, accel: 8 });
      wasteAir(S);
      S.extraEvents = [{ t: 0, type: 'amb', name: 'wasteland' }];
    },
  });
}
function s5_2() {
  return shot({
    name: '5.2', dur: 312, unit: 100, anchor: [0.5, 0.62], post: wastePost, grade: wasteGrade,
    cam: { x: 0, y: -1.4, z: 1 },
    setup(S) {
      wasteBackdrop(S);
      const cat = makeCat(S, { x: -6, facing: 1, carry: { wear: 0.58 }, ...catSun, wind: () => [0.4, 0] });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 18, lead: 6, dx: 0.8 });
      S.camera.key(0, { x: 0 });
      P.t = 2;
      locomote(P, { gait: 'tired', dist: 4.2, accel: 8, decel: 14 });
      A.pant(P, 44);
      A.lickPaw(P, { licks: 2 });
      A.look(P, P.t + 2, 14, { yaw: 0.25, pitch: 0.15, lookY: 0.1 }); // looks down the long road
      P.key(P.t + 10, { sad: 0.5, lid: 0.25 }, 'inout');
      P.emote(P.t + 12, 'gloom', { dur: 26 });
      P.key(P.t + 30, { sad: 0, lid: 0.25, lidTilt: 0.7, whiskDroop: 0 }, 'inout'); // ...and keeps going
      P.t += 34;
      A.blink(P, P.t - 12, 7);
      locomote(P, { gait: 'tired', dist: 6, accel: 12 });
      wasteAir(S);
    },
  });
}
function s5_3() {
  return shot({
    name: '5.3', dur: 180, unit: 64, anchor: [0.5, 0.64], post: wastePost, grade: wasteGrade,
    cam: { x: 1, y: -2, z: 1 },
    setup(S) {
      wasteBackdrop(S);
      // a dust devil passing in the middle distance
      S.layers.push(at(80, 0.28, (ctx, t) => {
        const x = lerp(-60, 60, t / 180);
        for (let i = 0; i < 26; i++) {
          const h = i / 26;
          const w = 1.5 + h * 6;
          const y = -h * 38;
          const sw = Math.sin(t * 0.3 + h * 6) * w * 0.4;
          ctx.fillStyle = css('#d8c19a', 0.1 * (1 - h * 0.6));
          ctx.beginPath();
          ctx.ellipse(x + sw + Math.sin(h * 3) * 2, y, w, 1.6, 0, 0, TAU);
          ctx.fill();
        }
      }));
      const cat = makeCat(S, { x: -1, facing: 1, carry: { wear: 0.6 }, ...catSun, wind: (t) => [0.6 + (t > 70 && t < 120 ? 1.2 : 0), 0] });
      const P = cat.perf;
      P.key(0, { hYaw: 0.5 });
      A.look(P, 20, 12, { yaw: 1.3, pitch: 0.1 });
      // tumbleweed rolls past close: squint, turn the head away
      P.key(68, { squeeze: 1, wobble: 0.7, earRot: 0.7, earFlat: 0.3, hYaw: 0.1, hPitch: -0.3, whisk: -0.8 }, 'out');
      P.key(118, {}, 'hold');
      P.key(130, { squeeze: 0, wobble: 0, eye: 1, earRot: 0.2, earFlat: 0, hYaw: 1.2, hPitch: 0, whisk: 0, eyeWide: 0.25 }, 'inout'); // watches it roll away
      P.emote(134, 'question', { dur: 30 });
      A.blink(P, 150, 6);
      S.layers.push(at(-2, 1.4, (ctx, t) => {
        const a = (t - 60) / 90;
        if (a < 0 || a > 1.2) return;
        const x = lerp(-14, 22, a);
        const bounce = Math.abs(Math.sin(a * 9)) * 0.6;
        tumbleweed(ctx, x, 0.6 - bounce, 0.9, a * 18, '#8f7654');
      }));
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => {
        const g = t > 60 && t < 125 ? 1 : 0.3;
        dust(ctx, W, H, t, { n: Math.round(40 + 90 * g), y0: 0.4, y1: 0.98, speed: 14, color: '#e0cfaa', alpha: 0.4, seed: 9, dir: 1 });
        windStreaks(ctx, W, H, t, { n: Math.round(4 + 8 * g), seed: 11, alpha: 0.2, dir: 1, color: '#fff8ea' });
      }));
      S.extraEvents = [{ t: 60, type: 'tumbleweed', dur: 90 }, { t: 64, type: 'gust' }];
    },
  });
}
function s5_4() {
  return shot({
    name: '5.4', dur: 180, unit: 7, anchor: [0.5, 0.7], fadeOut: 24, post: wastePost, grade: wasteGrade,
    cam: { x: 0, y: -12, z: 1 },
    setup(S) {
      S.camera.move(0, 180, { x: 10 }, 'linear');
      wasteBackdrop(S, { snowPeaks: true });
      const cat = makeCat(S, { x: -10, facing: 1, carry: { wear: 0.62 }, ...catSun });
      const P = cat.perf;
      P.t = 2;
      locomote(P, { gait: 'tired', dist: 24, accel: 8 });
    },
  });
}

// ================================ 6. SNOW ==================================
const SNOW = {
  sky: [[0, '#7fa9d6'], [0.5, '#cfe0f0'], [0.85, '#f2f6fb'], [1, '#fdfdfd']],
  mtn: '#b7c3d3', mtnShade: '#a1afc3', snow: '#fbfcfe', snowShade: '#dde5ef',
  field: ['#e3ebf4', '#f7f9fc'], shadow: '#c9d6e6', lip: '#f5f8fb',
  pine: '#5d7282', pineSnow: '#eef3f8',
};
const catSnow = {
  light: () => ({ tint: '#e6edf8', amt: 0.18, lift: '#0c0e14' }),
  rim: () => ({ color: '#ffffff', dir: [0.4, -0.9], alpha: 0.35, width: 0.05 }),
};
const snowGrade = { vignette: 0.28, vignetteColor: '#7d8fae', grain: 0.3, lift: '#e8eef8', liftAmt: 0.05 };
const snowPost = { bloom: { threshold: 0.9, knee: 0.08, strength: 0.4, radius: 22, tint: '#f4f8ff' } };
function snowBackdrop(S, o = {}) {
  S.layers.push(screenLayer(0, (ctx, t, W, H) => {
    skyGradient(ctx, W, H, SNOW.sky);
    const sx = W * 0.76, sy = H * 0.09;
    glow(ctx, sx, sy, W * 0.55, '#ffffff', 0.55);
    lampGlow(ctx, sx, sy, W * 0.05, '#ffffff', 1, 0.3);
    // a faint 22-degree ice halo around the sun
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = W * 0.012;
    ctx.beginPath();
    ctx.arc(sx, sy, W * 0.16, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,236,220,0.12)';
    ctx.lineWidth = W * 0.004;
    ctx.beginPath();
    ctx.arc(sx, sy, W * 0.168, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }));
  S.layers.push(Object.assign(at(22000, 0.03, (ctx, t, view, S2, p) => mountains(ctx, view, p, { seed: 7, period: 4200, h: 3200, w: 2800, base: 0, color: SNOW.mtn, shade: '#8f9fbd', snow: SNOW.snow, snowShade: '#c9d5e8', snowLine: 0.62 })), { haze: { color: '#dbe6f3', amount: 0.4 }, blur: 1.4 }));
  S.layers.push(Object.assign(at(6000, 0.05, (ctx, t, view, S2, p) => mountains(ctx, view, p, { seed: 11, period: 1500, h: 700, w: 1100, base: 0, color: '#c8d3e0', shade: '#a6b5cc', snow: SNOW.snow, snowShade: '#d3ddeb', snowLine: 0.75 })), { haze: { color: '#e4ecf6', amount: 0.25 } }));
  const hill = profile({ base: 0, amp: 40, freq: 0.004, seed: 13 });
  S.layers.push(at(1200, 0.08, (ctx, t, view, S2, p) => {
    fillBelow(ctx, view, p, hill, '#eef3f9', 4000, 10);
    if (o.pines !== false) {
      const [x0, x1] = view.xRange(p, 0.2);
      for (let i = Math.floor(x0 / 30); i <= x1 / 30; i++) {
        if (hash01(i * 17) > 0.45) continue;
        const x = i * 30 + hash01(i) * 20, gy = hill(x), h = 30 + 30 * hash01(i * 3);
        for (let k = 0; k < 3; k++) {
          const top = gy - h + k * h * 0.26, bot = gy - h * 0.18 + k * h * 0.08, wv = h * (0.16 + 0.07 * k);
          ctx.fillStyle = SNOW.pine;
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x + wv, bot);
          ctx.lineTo(x - wv, bot);
          ctx.fill();
          ctx.fillStyle = SNOW.pineSnow;
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x + wv * 0.8, bot - h * 0.05);
          ctx.quadraticCurveTo(x, bot - h * 0.12, x - wv * 0.9, bot - h * 0.03);
          ctx.fill();
        }
      }
    }
  }));
  S.layers.push(screenLayer(0.1, (ctx, t, W, H, view) => {
    const Y = groundPlane(ctx, view, { y: 0, bands: [[-500, 1200, SNOW.field]], lines: [[400, 'rgba(160,180,205,0.25)', 3], [90, 'rgba(160,180,205,0.2)', 1]] });
    // soft blue shadows of drifts
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const d = 20 + Math.pow(hash01(i * 5), 1.5) * 600;
      const y = Y(d);
      if (y < 0 || y > H) continue;
      const sc = view.scaleAt(view.pOf(d));
      const x = view.ox + ((hash01(i * 3) - 0.5) * 3000 / (1 + d * 0.01) - view.cam.x * 0) * sc * 0.02 + W * hash01(i * 7);
      const rx = W * (0.25 + 0.3 * hash01(i)), ry = Math.max(3, sc * 1.5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
      g.addColorStop(0, 'rgba(150,175,215,0.22)');
      g.addColorStop(1, 'rgba(150,175,215,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / rx);
      ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx);
      ctx.restore();
    }
    ctx.restore();
    // sunlight sparkling on the snow crystals
    const yH = Math.max(0, Y(1200));
    glints(ctx, 0, yH, W, H - yH, t, { n: 90, seed: 13, size: 5 * W / 1920, sizeAt: (py) => 0.4 + 1.4 * (py - yH) / Math.max(1, H - yH), bias: 0.7, speed: 0.15, alpha: 0.9 });
  }));
}
// snow surface in front of the cat: paws sink into it
function snowLip(S, depthY = -0.16) {
  S.layers.push(screenLayer(1.05, (ctx, t, W, H, view) => {
    groundPlane(ctx, view, { y: depthY, bands: [[-500, -0.25, SNOW.lip]] });
  }));
}
function snowfall(S, o = {}) {
  S.layers.push(screenLayer(2.5, (ctx, t, W, H, view) => snow(ctx, W, H, t, { density: o.density ?? 0.8, wind: o.wind ?? 0.6, fall: o.fall ?? 0.003, seed: o.seed ?? 3, camX: view.cam.x * 0.02 })));
  // big out-of-focus flakes drifting right in front of the lens
  S.layers.push(screenLayer(2.6, (ctx, t, W, H) => particles(ctx, W, H, t, { n: 10, seed: 21, color: '#ffffff', alpha: 0.32, size: 14, vx: (o.wind ?? 0.6) * 1.2, vy: 1.4, glow: 2.2, sway: 2 })));
}
function s6_1() {
  return shot({
    name: '6.1', dur: 156, unit: 14, anchor: [0.5, 0.68], xfade: 36, post: snowPost, grade: snowGrade,
    cam: { x: 0, y: -10, z: 1 },
    setup(S) {
      S.camera.move(0, 156, { x: 6 }, 'linear');
      snowBackdrop(S);
      const cat = makeCat(S, { x: -16, facing: 1, carry: { wear: 0.66 }, ...catSnow });
      const P = cat.perf;
      P.t = 2;
      locomote(P, { gait: 'walk', dist: 18, accel: 8, surface: 'snow' });
      snowfall(S, { density: 0.6 });
      S.extraEvents = [{ t: 0, type: 'amb', name: 'snow' }];
    },
  });
}
function s6_2() {
  return shot({
    name: '6.2', dur: 348, unit: 120, anchor: [0.5, 0.6], post: snowPost, grade: snowGrade,
    cam: { x: 1.6, y: -1.3, z: 1 },
    setup(S) {
      snowBackdrop(S, { pines: true });
      const cat = makeCat(S, { x: -4.5, facing: 1, carry: { wear: 0.68 }, ...catSnow });
      const P = cat.perf;
      P.t = 2;
      locomote(P, { gait: 'walk', to: -0.2, accel: 8, decel: 12 });
      A.snowFirstStep(P, { depth: 0.2 });
      A.wait(P, 8);
      locomote(P, { gait: 'stalk', dist: 3.2, height: 0.95, override: { pulse: 0.35, S: 0.8, C: 26 }, surface: 'snow', pose: { neck: 0.4, hPitch: -0.35, lookY: -0.6, earRot: 0 } });
      snowLip(S);
      snowfall(S, { density: 0.7 });
    },
  });
}
function s6_3() {
  return shot({
    name: '6.3', dur: 204, unit: 90, anchor: [0.5, 0.62], post: snowPost, grade: snowGrade,
    cam: { x: 1.4, y: -1.8, z: 1 },
    setup(S) {
      snowBackdrop(S);
      const cat = makeCat(S, { x: -1, facing: 1, carry: { wear: 0.7 }, ...catSnow });
      const P = cat.perf;
      // one big flake drifting in front of the nose
      const flake = new Track({ x: 3.5, y: -5 }, ['x', 'y']);
      flake.key(0, {}, 'linear');
      flake.key(40, { x: 2.2, y: -3.6 });
      flake.key(70, { x: 1.4, y: -3.0 });
      flake.key(84, { x: 1.2, y: -2.8 });
      flake.key(120, { x: 0.0, y: -1.2 });
      flake.key(204, { x: -2, y: 0.2 });
      const fpos = (t) => { const k = flake.sample(t); return [k.x + Math.sin(t * 0.08) * 0.25, k.y]; };
      A.track(P, 4, 78, fpos, { step: 4 });
      P.key(10, { sparkle: 0.9, eyeWide: 0.3, blush: 0.25 }, 'inout');
      P.emote(16, 'sparkle', { dur: 40, n: 3 });
      P.t = 78;
      A.snapHop(P, { h: 0.9, surface: 'snow' });
      // lands in the snow face-first-ish; sneezes, shakes the head
      P.key(P.t + 4, { squeeze: 1, sparkle: 0, earFlat: 0.5, hPitch: -0.2 }, 'out');
      P.setTiming(P.t + 6, 1);
      [0.9, -0.2, 0.8, 0.3].forEach((y, i) => P.key(P.t + 8 + i * 2, { hYaw: y, earRot: i % 2 ? 0.8 : 0.2 }, 'inout'));
      P.setTiming(P.t + 16, 2);
      P.key(P.t + 20, { hYaw: 0.4, squeeze: 0, eye: 1, earFlat: 0, earRot: 0.1 }, 'out');
      P.key(P.t + 30, { happy: 1, smile: 0.8, mouth: 0.25, mouthW: 0.6, blush: 0.4 }, 'inout');
      P.emote(P.t + 30, 'notes', { dur: 40 });
      P.key(P.t + 60, { happy: 0, smile: 0.2, mouth: 0, blush: 0.2 }, 'inout');
      P.event(P.t + 6, 'sneeze', {});
      S.layers.push(at(-0.3, 1.5, (ctx, t) => {
        if (t > 88) return;
        const [x, y] = fpos(t);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 0.09, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 0.02;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI + t * 0.02;
          ctx.moveTo(x - Math.cos(a) * 0.16, y - Math.sin(a) * 0.16);
          ctx.lineTo(x + Math.cos(a) * 0.16, y + Math.sin(a) * 0.16);
        }
        ctx.stroke();
      }));
      snowLip(S);
      snowfall(S, { density: 0.7 });
    },
  });
}
function s6_4() {
  return shot({
    name: '6.4', dur: 168, unit: 110, anchor: [0.5, 0.6], post: snowPost, grade: (t) => Object.assign({}, snowGrade, { tint: '#d6e1f0', tintAmt: 0.15 }),
    cam: { x: 0, y: -1.3, z: 1 },
    setup(S) {
      snowBackdrop(S);
      const cold = () => [-0.7 - 0.3 * Math.sin(0), 0];
      const cat = makeCat(S, { x: -5, facing: 1, carry: { wear: 0.72 }, ...catSnow, wind: (t) => [-0.6 - 0.3 * Math.sin(t * 0.2), 0] });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 12, lead: 6, dx: 0.8 });
      P.key(0, { fluff: 0.8, neck: 0.25, hPitch: -0.2, tailA: -0.5, tailC: 0.3, earRot: 0.5, earFlat: 0.35, eye: 1, lid: 0.35, sad: 0.35, wobble: 1, blush: 0.65, whiskDroop: 0.3, hip: [-5, -0.9] });
      P.emote(8, 'puff', { dur: 160, color: 'rgba(246,250,255,0.95)' });
      P.emote(58, 'shiver', { dur: 36 });
      P.t = 2;
      // short, quick, hunched steps; shivers
      locomote(P, { gait: 'walk', dist: 7, strideScale: 0.55, speed: 1.35, height: 0.88, surface: 'snow', pose: { fluff: 0.8, neck: 0.25, hPitch: -0.2, tailA: -0.5, tailC: 0.3, earRot: 0.5, earFlat: 0.35, eye: 1 } });
      P.overlays.push((p, t) => {
        if (t > 60 && t < 90) p.hip = [p.hip[0] + Math.sin(t * 2.2) * 0.02, p.hip[1]];
      });
      P.event(60, 'shiver', { dur: 30 });
      snowLip(S);
      snowfall(S, { density: 1.0, wind: -1.2 });
    },
  });
}
function s6_5() {
  return shot({
    name: '6.5', dur: 204, unit: 6, anchor: [0.5, 0.72], fadeOut: 30, post: snowPost, grade: snowGrade,
    cam: { x: -2, y: -26, z: 1 },
    setup(S) {
      S.camera.move(0, 204, { x: 4, z: 0.92 }, 'inout');
      snowBackdrop(S);
      const cat = makeCat(S, { x: -30, facing: 1, carry: { wear: 0.74 }, ...catSnow });
      const P = cat.perf;
      P.t = 0;
      locomote(P, { gait: 'walk', dist: 40, accel: 2, surface: 'snow' });
      // pre-existing trail of footprints behind the cat
      S.layers.push(screenLayer(0.12, (ctx, t, W, H, view) => {
        for (let i = 0; i < 40; i++) {
          const x = -30 - i * 1.3;
          groundEllipse(ctx, view, x, (i % 2) * 0.4, 0.22, 0.15, 'rgba(160,180,210,0.7)');
        }
      }));
      snowfall(S, { density: 0.5, fall: 0.002 });
    },
  });
}

export function wasteShots() {
  return [s5_1(), s5_2(), s5_3(), s5_4()];
}
export function snowShots() {
  return [s6_1(), s6_2(), s6_3(), s6_4(), s6_5()];
}
