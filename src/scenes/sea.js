// Sequence 7 — the cape before dawn: the postcard is torn away by the wind.
// Sequence 8 — the sea (the view matches the postcard).
// Sequence 9 — the beach at sunrise: first waves, play, pull back.
import { shot } from '../film/shot.js';
import { makeCat, follow, ramp, screenLayer, at, standingPose, sittingPose } from '../film/kit.js';
import { CardProp } from '../film/prop.js';
import { drawCard, cardArt } from '../film/postcard.js';
import { drawSeaView, SEA, PALETTES } from '../film/seaview.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { skyGradient, glow, clouds } from '../env/sky.js';
import { profile, fillBelow, groundPlane, groundEllipse } from '../env/terrain.js';
import { grass, tufts, windField, rock } from '../env/nature.js';
import { windStreaks, motes } from '../env/weather.js';
import { gull, gullFar } from '../env/creatures.js';
import { drawCatBack, drawPortrait } from '../cat/views.js';
import { Track } from '../core/tracks.js';
import { css, mix } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';

// ================================ 7. CAPE =====================================
const CAPE = {
  sky: (k) => [[0, css(mix('#2d3a66', '#6f8cc4', k))], [0.55, css(mix('#7d7aa6', '#c9b6c8', k))], [1, css(mix('#e2a98f', '#f6d2b0', k))]],
  hillFar: '#51597a', hillMid: '#4f6660', ground: ['#4d6450', '#6b8067'],
  grass: ['#4f6b4c', '#62805a'], grassLight: ['#7b9a6c', '#8faa7c'],
  rock: ['#6c6a76', '#8a8793', null],
};
const catDawn = {
  light: () => ({ tint: '#c9c6dc', amt: 0.3, lift: '#1c1822' }),
  rim: () => ({ color: '#ffd9b8', dir: [0.85, -0.5], alpha: 0.75, width: 0.06 }),
};
const tailwind = (base = 0.9) => (t) => [base + 0.4 * Math.sin(t * 0.17) + 0.3 * noise1(t * 0.05, 3), -0.05];
const capeWind = windField({ base: 0.5, gust: 0.9, speed: 0.35, wave: 0.07, dir: 1 });
const capeGrade = (k = 0) => ({ vignette: 0.35, vignetteColor: '#2b2640', grain: 0.4, topGlow: '#ffd9c0', topGlowAmt: 0.1 + 0.1 * k });

function capeBackdrop(S, o = {}) {
  const k = o.dawn ?? 0.3;
  S.layers.push(screenLayer(0, (ctx, t, W, H) => {
    skyGradient(ctx, W, H, CAPE.sky(typeof k === 'function' ? k(t) : k));
    glow(ctx, W * 0.85, H * 0.75, W * 0.5, '#ffd6b0', 0.35);
  }));
  S.layers.push(at(30000, 0.02, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, { seed: 21, n: 6, y: -6500, dy: 2000, w: 16000, h: 1200, speed: 10, wrap: 150000, top: 'rgba(240,200,190,0.55)', shade: 'rgba(120,110,150,0.35)' })));
  if (o.land === false) return;
  const far = profile({ base: 0, amp: 180, freq: 0.001, seed: 51 });
  S.layers.push(at(6000, 0.05, (ctx, t, view, S2, p) => fillBelow(ctx, view, p, far, CAPE.hillFar, 9000, 40)));
  S.layers.push(screenLayer(0.1, (ctx, t, W, H, view) => groundPlane(ctx, view, { y: 0, bands: [[-500, 1500, CAPE.ground]] })));
  S.layers.push(at(60, 0.2, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: () => 0, density: 2.2, h: 3.2, width: 0.35, colors: CAPE.grass, seed: 3, wind: capeWind })));
  S.layers.push(at(10, 0.3, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: o.ground || (() => 0), density: 5, h: 1.7, width: 0.16, colors: CAPE.grass, seed: 5, wind: capeWind })));
}
function capeFront(S, o = {}) {
  S.layers.push(at(-6, 2, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: () => 0.7, spacing: 2.2, h: 2.6, width: 0.2, colors: ['#39523b', '#446046'], seed: o.seed ?? 7, wind: capeWind, fill: 0.55 })));
  S.layers.push(screenLayer(2.4, (ctx, t, W, H) => windStreaks(ctx, W, H, t, { n: o.streaks ?? 10, seed: 13, alpha: 0.28, dir: 1, color: '#fff2e6' })));
}
// terrain drawn as a filled profile at the stage plane
function terrainLayer(S, g, x0, x1, col, z = 0.85) {
  S.layers.push(at(0, z, (ctx) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x0, 40);
    for (let x = x0; x <= x1; x += 0.25) ctx.lineTo(x, g(x));
    ctx.lineTo(x1, 40);
    ctx.closePath();
    ctx.fill();
  }));
}

function s7_1() {
  const slope = (x) => -x * 0.12;
  return shot({
    name: '7.1', dur: 180, unit: 24, anchor: [0.5, 0.66], fadeIn: 36, grade: capeGrade(0),
    cam: { x: -4, y: -4, z: 1 },
    setup(S) {
      S.camera.move(0, 180, { x: 10, y: -6 }, 'linear');
      capeBackdrop(S, { dawn: 0.1 });
      terrainLayer(S, slope, -80, 80, CAPE.ground[0]);
      S.layers.push(at(0, 0.87, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: slope, density: 5, h: 1.4, width: 0.14, colors: CAPE.grass, seed: 9, wind: capeWind })));
      const cat = makeCat(S, { x: -22, facing: 1, ground: slope, carry: { wear: 0.86 }, wind: tailwind(0.8), ...catDawn });
      const P = cat.perf;
      P.t = 2;
      locomote(P, { gait: 'tired', dist: 30, accel: 8 });
      capeFront(S, { seed: 9, streaks: 8 });
      S.extraEvents = [{ t: 0, type: 'amb', name: 'cape_wind' }];
    },
  });
}
function s7_2() {
  const slope = (x) => -x * 0.16;
  return shot({
    name: '7.2', dur: 132, unit: 112, anchor: [0.5, 0.62], grade: capeGrade(0.1),
    cam: { x: 0.6, y: -1.4, z: 1 },
    setup(S) {
      capeBackdrop(S, { dawn: 0.15 });
      terrainLayer(S, slope, -30, 30, CAPE.ground[0]);
      S.layers.push(at(0, 0.87, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: slope, density: 9, h: 0.9, width: 0.1, colors: CAPE.grass, seed: 11, wind: capeWind })));
      const cat = makeCat(S, { x: -3, facing: 1, ground: slope, carry: { wear: 0.88 }, wind: tailwind(0.9), ...catDawn });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 14, lead: 6, dx: 0.8, y: 0.6 });
      S.camera.key(0, { x: 0, y: -0.4 });
      P.t = 2;
      locomote(P, { gait: 'tired', dist: 3.2, accel: 6, decel: 10 });
      A.pant(P, 40, { period: 9 });
      capeFront(S, { seed: 11 });
    },
  });
}
function s7_3() {
  const slope = (x) => -x * 0.16;
  return shot({
    name: '7.3', dur: 84, unit: 150, anchor: [0.5, 0.6], grade: capeGrade(0.15),
    cam: { x: 1.2, y: -1.8, z: 1 },
    setup(S) {
      capeBackdrop(S, { dawn: 0.2 });
      terrainLayer(S, slope, -30, 30, CAPE.ground[0]);
      const tSnatch = 30;
      const cat = makeCat(S, { x: 0, facing: 1, ground: slope, carry: { wear: 0.9, on: (t) => t < tSnatch }, wind: (t) => [t > 22 && t < 50 ? 2.4 : 0.9, -0.1], ...catDawn });
      const P = cat.perf;
      P.key(0, { mouth: 0 });
      P.key(20, { mouth: 0.35, mouthW: 0.3, eye: 0.6 }, 'inout'); // opens the mouth to pant...
      P.key(tSnatch, { mouth: 0.5 }, 'out');
      P.setTiming(tSnatch, 1);
      P.key(tSnatch + 2, { eyeWide: 1, eye: 1, earRot: -0.3, earFlat: 0, hPitch: 0.3, neck: 0.8, fluff: 0.4, mouth: 0.25 }, 'out');
      P.key(tSnatch + 8, { hPitch: 0.6, hYaw: 0.2, lookY: 0.8 }, 'out');
      P.setTiming(tSnatch + 10, 2);
      // the card rips out of the mouth, flips over the head and away (+x, up)
      const card = new CardProp({ x: 0, y: 0, vis: 0, twos: 1 });
      const grip = () => {
        const p = P.poseAt(tSnatch);
        return [p.hip[0] + 2.0, p.hip[1] - 1.25];
      };
      const g0 = grip();
      card.key(tSnatch - 1, { x: g0[0], y: g0[1], vis: 0 }, 'step');
      card.key(tSnatch, { x: g0[0], y: g0[1], ang: 0.4, vis: 1 }, 'linear');
      card.key(tSnatch + 4, { x: g0[0] + 1.2, y: g0[1] - 1.4, ang: -0.8, sx: -0.3, bend: 0.6 }, 'linear');
      card.key(tSnatch + 8, { x: g0[0] + 2.8, y: g0[1] - 2.6, ang: -2.2, sx: -1, bend: -0.5 }, 'linear');
      card.key(tSnatch + 14, { x: g0[0] + 5.5, y: g0[1] - 3.2, ang: -3.8, sx: 0.4, bend: 0.4 }, 'linear');
      card.key(tSnatch + 24, { x: g0[0] + 10, y: g0[1] - 2.4, ang: -5.4, sx: 1, bend: -0.3 }, 'linear');
      S.layers.push(at(0, 1.3, (ctx, t) => card.draw(ctx, t, { wear: 0.9 })));
      capeFront(S, { seed: 13, streaks: 16 });
      S.extraEvents = [{ t: tSnatch - 2, type: 'gust_big' }, { t: tSnatch, type: 'card_snatch' }];
    },
  });
}

// ---- 7.4 the chase ------------------------------------------------------------
function chaseGround(x) {
  if (x < 16) return -x * 0.08; // up the slope
  if (x < 19.5) return lerp(-1.28, 1.6, (x - 16) / 3.5); // a steep bank down
  if (x < 31) return lerp(1.6, 1.0, (x - 19.5) / 11.5); // hollow
  if (x < 31.8) return lerp(1.0, -2.6, (x - 31) / 0.8); // rock face
  if (x < 46) return -2.6 - (x - 31.8) * 0.02; // ridge top
  return 20; // edge
}
function s7_4() {
  return shot({
    name: '7.4', dur: 396, unit: 58, anchor: [0.42, 0.62], grade: capeGrade(0.25),
    cam: { x: 0, y: -1.5, z: 1 },
    setup(S) {
      capeBackdrop(S, { dawn: 0.3, ground: () => 0 });
      terrainLayer(S, chaseGround, -30, 46, CAPE.ground[0]);
      S.layers.push(at(0, 0.86, (ctx, t) => {
        // rocky outcrop: a slanted face with ledges, grass on top
        ctx.fillStyle = CAPE.rock[0];
        ctx.beginPath();
        ctx.moveTo(30.4, 1.4);
        ctx.lineTo(31.0, -1.2);
        ctx.lineTo(31.5, -2.4);
        ctx.lineTo(32.4, -2.75);
        ctx.lineTo(46, -3.0);
        ctx.lineTo(46, 3);
        ctx.lineTo(30.4, 3);
        ctx.fill();
        ctx.fillStyle = CAPE.rock[1];
        ctx.beginPath();
        ctx.moveTo(31.0, -1.2);
        ctx.lineTo(31.5, -2.4);
        ctx.lineTo(32.4, -2.75);
        ctx.lineTo(33.2, -2.4);
        ctx.lineTo(32.2, -1.6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,36,56,0.35)';
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        ctx.moveTo(31.3, -0.2);
        ctx.lineTo(33.5, -0.6);
        ctx.moveTo(34, 0.8);
        ctx.lineTo(37, 0.4);
        ctx.stroke();
        ctx.fillStyle = CAPE.ground[0];
        ctx.fillRect(32.2, -3.05, 13.8, 0.35);
      }));
      S.layers.push(at(0, 0.87, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: (x) => (x < 31 ? chaseGround(x) : 50), density: 7, h: 1.0, width: 0.12, colors: CAPE.grass, seed: 17, wind: capeWind })));
      const cat = makeCat(S, { x: -2, facing: 1, ground: chaseGround, wind: tailwind(1.0), ...catDawn });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 10, lead: 12, dx: 2.4, y: 0.8, dy: 0.2 });
      P.setTiming(0, 1);
      P.t = 0;
      // bolt after the card
      locomote(P, { gait: 'run', to: 14.6, accel: 8, decel: 3, speed: 0.9, pose: { earRot: -0.2, earFlat: 0, eyeWide: 0.6 } });
      // skid at the bank edge: front legs braced forward, body leaning back
      let t = P.t;
      const hx = P.curPose().hip[0];
      const g = chaseGround;
      P.key(t + 3, { hip: [hx + 0.6, g(hx + 0.6) - 0.8], pitch: 0.25, len: 0.95, archB: 0.4, fn: [hx + 2.1, g(hx + 2.1)], ff: [hx + 2.0, g(hx + 2.0)], fnC: 0, ffC: 0, fnF: 0.8, ffF: 0.8, hn: [hx + 0.2, g(hx + 0.2)], hf: [hx + 0.1, g(hx + 0.1)], neck: 0.9, hPitch: 0.2, earFlat: 0.4 }, 'out');
      P.event(t + 3, 'skid', { x: hx + 1.5, y: g(hx + 1.5), dur: 12 });
      // loses the footing and slides down the bank on the haunches
      P.key(t + 10, { hip: [hx + 1.6, g(hx + 1.6) - 0.6], pitch: 0.45, fn: [hx + 3.1, g(hx + 3.1)], ff: [hx + 3.0, g(hx + 3.0)], hn: [hx + 1.4, g(hx + 1.4)], hf: [hx + 1.3, g(hx + 1.3)], hnM: 0.8, hfM: 0.8, tailA: 1.2 }, 'in');
      P.key(t + 20, { hip: [hx + 4.6, g(hx + 4.6) - 0.6], pitch: 0.55, fn: [hx + 6.1, g(hx + 6.1)], ff: [hx + 5.9, g(hx + 5.9)], hn: [hx + 4.4, g(hx + 4.4)], hf: [hx + 4.2, g(hx + 4.2)], fluff: 0.6 }, 'linear');
      P.event(t + 10, 'slide', { dur: 12 });
      P.key(t + 24, { hip: [hx + 5.6, g(hx + 5.6) - 0.85], pitch: 0.05, hnM: 0, hfM: 0, archB: 0.35, tailA: 0.5, fnF: 0, ffF: 0 }, 'out');
      P.event(t + 24, 'land', { x: hx + 5.6, y: g(hx + 5.6), strength: 0.6 });
      P.t = t + 26;
      // push off again
      locomote(P, { gait: 'run', to: 27.2, accel: 5, decel: 2 });
      // leap onto the rock, scramble up
      A.jump(P, { dx: 5.2, dy: -3.6, h: 1.0, antic: 2, hold: 0, flight: 11 });
      locomote(P, { gait: 'run', to: 36.5, accel: 4, decel: 2 });
      // the full-stretch leap: everything reaching for the card
      t = P.t;
      const x0 = P.curPose().hip[0];
      const gy = chaseGround(x0);
      P.key(t + 2, { hip: [x0 - 0.1, gy - 0.72], len: 0.9, archB: 0.4, neck: 0.7, hPitch: 0.4 }, 'out');
      P.key(t + 5, { hip: [x0 + 1.2, gy - 1.9], pitch: 0.55, len: 1.3, archB: -0.35, archF: -0.2, neck: 1.0, hPitch: 0.7,
        fn: [x0 + 3.5, gy - 3.9], ff: [x0 + 3.1, gy - 3.3], fnC: 0.2, ffC: 0.5, fnF: 1, ffF: 1, hn: [x0 - 0.6, gy - 0.4], hf: [x0 - 0.8, gy - 0.2], hnC: 0.9, hfC: 0.9,
        eyeWide: 1, mouth: 0.4, tailA: -0.2, smear: 0.7 }, 'out');
      P.event(t + 5, 'jump', { x: x0, y: gy, strength: 1.2 });
      P.key(t + 12, { hip: [x0 + 3.2, gy - 2.3], pitch: 0.35, smear: 0 }, 'inout'); // the hang: paw a hair short
      P.key(t + 18, { hip: [x0 + 5.0, gy - 1.1], pitch: -0.3, len: 1.05, archB: 0.05, fn: [x0 + 6.4, gy], ff: [x0 + 6.3, gy], fnC: 0, ffC: 0, fnF: 0.2, ffF: 0.2, hn: [x0 + 4.2, gy - 0.6], hf: [x0 + 4.0, gy - 0.5], mouth: 0 }, 'in');
      P.event(t + 18, 'land', { x: x0 + 6.4, y: gy, part: 'fore', strength: 1 });
      P.key(t + 22, { hip: [x0 + 5.5, gy - 0.72], pitch: -0.05, len: 0.92, archB: 0.35, hn: [x0 + 5.6, gy], hf: [x0 + 5.5, gy], hnC: 0, hfC: 0, fnF: 0 }, 'out');
      P.key(t + 30, { hip: [x0 + 5.6, gy - 1.02], pitch: 0.12, len: 1, archB: 0.05, neck: 0.95, hPitch: 0.8, lookY: 0.9, eyeWide: 0.6 }, 'out');
      P.setTiming(t + 30, 2);
      const tLand = t + 30;
      // watches the card rise away
      P.key(tLand + 40, { hPitch: 1.0, neck: 1.05 }, 'inout');
      // the card: tumbling ahead, just out of reach at the leap, then lifted away
      const card = new CardProp({ x: 6, y: -1, twos: 1 });
      const cardPath = [
        [0, 6, -2.5, 0], [10, 9, -0.8, 1.5], [18, 11.5, -1.2, 3], [26, 14, -0.6, 4.2], [36, 17.5, -1.8, 5.6], [48, 21, -0.4, 7],
        [60, 24.5, -2.2, 8.4], [72, 28.5, -3.6, 9.4], [84, 32, -4.8, 10.6], [98, 35.5, -5.4, 11.8],
      ];
      for (const [tt, x, y, a] of cardPath) card.key(tt, { x, y, ang: a, sx: Math.cos(a * 1.7), bend: Math.sin(a * 2) * 0.5 }, 'linear');
      const tl = t + 12; // the moment the paw is closest
      card.key(tl - 6, { x: x0 + 4.4, y: gy - 4.6, ang: 13, sx: 0.8 }, 'linear');
      card.key(tl, { x: x0 + 4.9, y: gy - 4.5, ang: 13.4, sx: 1 }, 'out');
      card.key(tl + 6, { x: x0 + 6.6, y: gy - 6.8, ang: 14.6, sx: -0.6 }, 'in');
      card.key(tl + 30, { x: x0 + 9, y: gy - 16, ang: 17, sx: 0.4 }, 'linear');
      card.key(tl + 90, { x: x0 + 14, y: gy - 40, ang: 22, sx: -1 }, 'linear');
      S.layers.push(at(0, 1.3, (ctx, tt) => card.draw(ctx, tt, { wear: 0.9 })));
      capeFront(S, { seed: 15, streaks: 14 });
      S.extraEvents = [{ t: tl, type: 'near_miss' }];
      S.dur = tLand + 64;
    },
  });
}
// ---- 7.5 the card disappears into the sky --------------------------------------
function s7_5() {
  return shot({
    name: '7.5', dur: 156, unit: 60, anchor: [0.5, 0.5], grade: capeGrade(0.35),
    setup(S) {
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        skyGradient(ctx, W, H, CAPE.sky(0.4));
        glow(ctx, W * 0.8, H * 1.0, W * 0.6, '#ffd6b0', 0.4);
      }));
      S.layers.push(at(30000, 0.02, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, { seed: 22, n: 6, y: -1500, dy: 3000, w: 14000, h: 1400, speed: 12, wrap: 150000, top: 'rgba(245,205,195,0.6)' })));
      S.layers.push(screenLayer(1, (ctx, t, W, H) => {
        const u = t / 156;
        const x = W * (0.45 + 0.25 * u + 0.05 * Math.sin(t * 0.12)), y = H * (0.7 - 0.62 * Math.pow(u, 0.8));
        const s = (W / 1920) * 170 * (1 - 0.93 * Math.pow(u, 0.7));
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, s);
        ctx.globalAlpha = 1 - smoothstep(0.85, 1, u);
        drawCard(ctx, 0, 0, { ang: t * 0.21, sx: Math.cos(t * 0.33), bend: Math.sin(t * 0.4) * 0.4, wear: 0.9, px: 256 });
        ctx.restore();
      }));
      // silhouette of ears at the bottom of the frame (the cat looking up)
      S.layers.push(screenLayer(2, (ctx, t, W, H) => {
        const p = { hPitch: 0.9, earRot: 0.1 + 0.4 * smoothstep(100, 150, t), earFlat: 0.25 * smoothstep(100, 150, t) };
        drawCatBack(ctx, p, { x: W * 0.3, y: H * 1.75, scale: 260 * W / 1920, light: { tint: '#6f6a8a', amt: 0.6, lift: '#141220' } });
      }));
      S.layers.push(screenLayer(2.4, (ctx, t, W, H) => windStreaks(ctx, W, H, t, { n: 10, seed: 17, alpha: 0.25, dir: 1, color: '#fff2e6' })));
      S.extraEvents = [{ t: 0, type: 'wind_swell' }];
    },
  });
}
// ---- 7.6 alone on the ridge ------------------------------------------------------
const RIDGE = (x) => (x < 30 ? -2.6 - (x - 10) * 0.02 : 20);
function ridgeScene(S, o = {}) {
  capeBackdrop(S, { dawn: o.dawn ?? 0.45, land: false });
  // the sea beyond the ridge (hidden until the camera rises above the crest)
  S.layers.push(screenLayer(0.05, (ctx, t, W, H, view) => {
    // horizon for distant things is the eye level (view.oy)
    const hz = view.oy;
    const g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, '#e9b99c');
    g.addColorStop(0.2, '#8391b2');
    g.addColorStop(1, '#3d5a86');
    ctx.fillStyle = g;
    ctx.fillRect(0, hz, W, H - hz);
    // sun path glints
    ctx.fillStyle = 'rgba(255,228,190,0.5)';
    for (let i = 0; i < 16; i++) {
      const v = (i / 16) ** 1.7;
      const y = hz + 2 + v * (H - hz) * 0.5;
      const w = W * (0.01 + 0.05 * v) * (0.6 + 0.8 * hash01(i + Math.floor(t / 6) * 7));
      ctx.fillRect(W * 0.62 - w / 2, y, w, Math.max(1, H * 0.003));
    }
  }));
  S.layers.push(at(0, 0.8, (ctx) => {
    ctx.fillStyle = CAPE.ground[0];
    ctx.beginPath();
    ctx.moveTo(-200, 60);
    for (let x = -200; x <= 30; x += 1) ctx.lineTo(x, RIDGE(Math.max(10, x)) + (x < 10 ? (10 - x) * 0.02 : 0));
    ctx.lineTo(30, 60);
    ctx.fill();
  }));
  S.layers.push(at(0, 0.85, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: (x) => (x < 30 ? RIDGE(Math.max(10, x)) : 90), density: 6, h: 1.1, width: 0.12, colors: CAPE.grass, seed: 23, wind: capeWind })));
}
function s7_6() {
  return shot({
    name: '7.6', dur: 252, unit: 40, anchor: [0.5, 0.56], grade: capeGrade(0.45),
    cam: { x: 16, y: 1.5, z: 1 },
    setup(S) {
      ridgeScene(S, { dawn: 0.45 });
      const cat = makeCat(S, { x: 16, facing: 1, ground: RIDGE, wind: tailwind(0.8), ...catDawn, pose: { hPitch: 0.6, neck: 0.95, lookY: 0.7 } });
      const P = cat.perf;
      // stands still, looking where the card went; slowly the head, ears and tail sink
      P.key(40, {}, 'hold');
      P.key(110, { hPitch: -0.1, neck: 0.45, lookY: -0.2, earRot: 0.55, earFlat: 0.35, tailTone: 0.35, tailA: -0.4, tailC: 0.2, eye: 0.8 }, 'inout');
      A.blink(P, 150, 10);
      P.key(200, { hPitch: -0.2, eye: 0.7 }, 'inout');
      S.layers.push(screenLayer(2.4, (ctx, t, W, H) => windStreaks(ctx, W, H, t, { n: 6, seed: 19, alpha: 0.2, dir: 1, color: '#fff2e6' })));
    },
  });
}

// ================================ 8. THE SEA ===================================
function s8_1() {
  return shot({
    name: '8.1', dur: 120, unit: 150, anchor: [0.5, 0.6], grade: capeGrade(0.5),
    cam: { x: 17.1, y: -3.8, z: 1 },
    setup(S) {
      ridgeScene(S, { dawn: 0.5 });
      const cat = makeCat(S, { x: 16, facing: 1, ground: RIDGE, wind: tailwind(0.6), ...catDawn,
        pose: { hPitch: -0.2, neck: 0.45, earRot: 0.55, earFlat: 0.35, tailTone: 0.35, tailA: -0.4, tailC: 0.2, eye: 0.7 } });
      const P = cat.perf;
      // the first sound of waves: one ear turns, then the other; the eyes open
      P.key(40, { earLR: -0.55, earFlat: 0.15 }, 'out');
      P.key(50, { earLR: -0.4 }, 'inout');
      P.key(64, { earRR: -0.5, earRot: 0.2, earFlat: 0, eye: 1 }, 'out');
      P.key(80, { hPitch: 0.05, neck: 0.6 }, 'inout');
      S.extraEvents = [{ t: 36, type: 'waves_first' }];
    },
  });
}
function s8_2() {
  return shot({
    name: '8.2', dur: 132, unit: 58, anchor: [0.5, 0.58], grade: capeGrade(0.55),
    cam: { x: 16.6, y: -1.6, z: 1 },
    setup(S) {
      // crane up past the cat: the sea appears over the ridge
      S.camera.move(30, 132, { y: -16, z: 0.9 }, 'inout');
      ridgeScene(S, { dawn: 0.55 });
      const cat = makeCat(S, { x: 16, facing: 1, ground: RIDGE, wind: tailwind(0.6), ...catDawn,
        pose: { hPitch: 0.05, neck: 0.6, earRot: 0.2, earLR: -0.4, earRR: -0.5, eye: 1, tailTone: 0.5, tailA: -0.2 } });
      const P = cat.perf;
      // turns the head toward the sea (away from the camera)
      P.key(10, { hYaw: -0.8, hPitch: 0.1, earLR: 0, earRR: 0, earRot: -0.1 }, 'inout');
      P.key(30, { hYaw: -1.4, hPitch: 0.15, tailTone: 1, tailA: 0.3, tailC: 0.8 }, 'inout');
      P.key(80, { eyeWide: 0.3 }, 'inout');
    },
  });
}
// ---- 8.3 the view (matches the postcard) ----------------------------------------
function s8_3() {
  return shot({
    name: '8.3', dur: 384, unit: 60, anchor: [0.5, 0.5], xfade: 24,
    grade: (t) => ({ vignette: 0.3, vignetteColor: '#3c3148', grain: 0.35, topGlow: '#ffe2c4', topGlowAmt: ramp(t, [[0, 0.05], [380, 0.2]]) }),
    setup(S) {
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        const rise = ramp(t, [[0, 0.0], [380, 0.07]]);
        const pal = Object.assign({}, PALETTES.sunrise);
        // pre-sunrise -> sunrise palette shift
        const k = ramp(t, [[0, 0], [300, 1]]);
        pal.skyTop = css(mix('#5b6aa0', '#79a2d6', k));
        pal.skyBot = css(mix('#f0b894', '#fbe0c2', k));
        drawSeaView(ctx, 0, 0, W, H, { palette: 'sunrise', colors: pal, t, sunRise: rise, sunU: 0.36, cloudDrift: t * 0.004, beam: 1 - k * 0.8 });
      }));
      // the postcard memory dissolving into the real view
      S.layers.push(screenLayer(0.5, (ctx, t, W, H) => {
        const a = 0.85 * (1 - smoothstep(30, 110, t));
        if (a <= 0.01) return;
        ctx.globalAlpha = a;
        const art = cardArt(0.9, 1024);
        const b = art.width * 0.045;
        ctx.drawImage(art, b, b * (art.height / art.width) * 1.47, art.width - 2 * b, art.height - 2 * b * 1.47, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }));
      // gulls crossing
      S.layers.push(screenLayer(0.6, (ctx, t, W, H) => {
        const s = W / 1920;
        for (let i = 0; i < 3; i++) {
          const x = W * (0.1 + ((t * 0.0012 * (1 + i * 0.2) + i * 0.3) % 1.2)), y = H * (0.22 + i * 0.05) + Math.sin(t * 0.03 + i) * 6 * s;
          gullFar(ctx, x, y, t + i * 20, 10 * s, 'rgba(70,64,80,0.7)', i);
        }
      }));
      // foreground: the cliff top grass and Xiaohui from behind, sitting
      S.layers.push(screenLayer(1, (ctx, t, W, H) => {
        const s = W / 1920;
        ctx.fillStyle = '#3d4a45';
        ctx.beginPath();
        ctx.moveTo(0, H * 0.84);
        ctx.quadraticCurveTo(W * 0.25, H * 0.78, W * 0.52, H * 0.86);
        ctx.lineTo(W * 0.56, H);
        ctx.lineTo(0, H);
        ctx.fill();
        const wind = capeWind;
        grass(ctx, { xRange: () => [0, W * 0.56], W }, 1, t, { ground: (x) => H * 0.84 + (x / W) * H * 0.02, density: 0.15 / s, h: 26 * s, width: 5 * s, colors: ['#2f3b37', '#3c4a44'], seed: 5, wind: (x, tt) => wind(x / (30 * s), tt) * 0.6 });
        const hp = { hPitch: 0.05 + 0.05 * smoothstep(200, 300, t), earRot: 0.05, earLR: Math.sin(t * 0.02) * 0.1, tail: 0.5 + 0.1 * Math.sin(t * 0.02), breath: 0.5 + 0.5 * Math.sin(t * 0.08), hRoll: 0.08 * smoothstep(250, 320, t) };
        drawCatBack(ctx, hp, { x: W * 0.28, y: H * 0.87, scale: 118 * s, light: { tint: '#b7acc7', amt: 0.35, lift: '#221a24' } });
      }));
      S.extraEvents = [{ t: 0, type: 'amb', name: 'sea_dawn' }, { t: 60, type: 'music_in' }];
    },
  });
}
function s8_4() {
  return shot({
    name: '8.4', dur: 204, unit: 360, anchor: [0.5, 0.62],
    grade: { vignette: 0.35, vignetteColor: '#3c3148', grain: 0.35, topGlow: '#ffe2c4', topGlowAmt: 0.2 },
    setup(S) {
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        drawSeaView(ctx, -W * 0.2, -H * 0.1, W * 1.6, H * 1.3, { palette: 'sunrise', t, sunRise: 0.06, sunU: 0.25 });
        ctx.fillStyle = 'rgba(255,230,210,0.15)';
        ctx.fillRect(0, 0, W, H);
      }));
      const tr = new Track({ hYaw: -0.55, hPitch: 0.1, hRoll: 0, eye: 1, eyeWide: 0, pupil: 0.5, lookX: 0.2, lookY: 0.1, happy: 0, smile: 0, earRot: 0.05, earLR: 0, earRR: 0, whisk: 0.2, mouth: 0 });
      tr.key(0, {}, 'linear');
      tr.key(50, { eye: 1 }, 'hold');
      tr.key(56, { eye: 0.55 }, 'inout'); // softening
      tr.key(90, { eye: 0.5, smile: 0.4 }, 'inout');
      tr.key(120, { happy: 0.6, eye: 0.2 }, 'inout');
      tr.key(150, { happy: 0.8, smile: 0.6, hRoll: 0.08 }, 'inout');
      tr.key(190, { happy: 0.8 }, 'inout');
      S.layers.push(screenLayer(1, (ctx, t, W, H) => {
        const p = tr.sample(Math.floor(t / 2) * 2);
        p.breath = 0.5 + 0.5 * Math.sin(t * 0.08);
        p.earLR = Math.sin(t * 0.05) * 0.08;
        const s = W / 1920;
        drawPortrait(ctx, p, { x: W * 0.62, y: H * 0.78, scale: 360 * s, light: { tint: '#e8d2cc', amt: 0.25, lift: '#20181c' } });
        // warm rim from the sun on the left
        const g = ctx.createRadialGradient(W * 0.2, H * 0.55, 0, W * 0.2, H * 0.55, W * 0.7);
        g.addColorStop(0, 'rgba(255,214,170,0.22)');
        g.addColorStop(1, 'rgba(255,214,170,0)');
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }));
    },
  });
}

// ================================ 9. THE BEACH =================================
const BEACH = {
  sky: [[0, '#8fb5dc'], [0.6, '#dfe6ec'], [1, '#fbe8d4']],
  sand: ['#e0c9a3', '#ecdcbd'], wet: '#bfa889', sea: ['#6f9fc4', '#9cc3d9'], foam: '#fbfbf7',
  dune: '#d7c19a', duneGrass: ['#8f9a6c', '#a7ae7c'],
};
const catMorning = {
  light: () => ({ tint: '#fff2e2', amt: 0.1, lift: '#0e0a08' }),
  rim: () => ({ color: '#fff0d8', dir: [-0.8, -0.6], alpha: 0.5, width: 0.05 }),
};
const beachGrade = { vignette: 0.25, vignetteColor: '#6a5a58', grain: 0.35, topGlow: '#fff3e0', topGlowAmt: 0.15 };
// the water edge along the stage (x of the swash front at depth 0) as a function of time
function swashEdge(t, o = {}) {
  const waves = o.waves || [];
  let x = o.rest ?? 6;
  for (const w of waves) {
    const a = t - w.t;
    if (a < 0 || a > w.dur) continue;
    const u = a / w.dur;
    // quick run-up, pause, slower backwash
    const k = u < 0.35 ? Math.sin((u / 0.35) * Math.PI / 2) : u < 0.45 ? 1 : Math.cos(((u - 0.45) / 0.55) * Math.PI / 2);
    x = Math.min(x, lerp(o.rest ?? 6, w.reach, k));
  }
  return x + Math.sin(t * 0.05) * 0.15;
}
function beachWorld(S, o = {}) {
  S.layers.push(screenLayer(0, (ctx, t, W, H) => {
    skyGradient(ctx, W, H, BEACH.sky);
    glow(ctx, W * 0.25, H * 0.5, W * 0.5, '#fff0dc', 0.5);
  }));
  S.layers.push(at(30000, 0.02, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, { seed: 31, n: 5, y: -6000, dy: 2000, w: 12000, h: 900, speed: 3, wrap: 150000, top: '#fdf6ee', shade: '#e9d8d0' })));
  // far headland with the lighthouse (right), sea to the horizon
  S.layers.push(screenLayer(0.05, (ctx, t, W, H, view) => {
    const hz = view.oy;
    const g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, BEACH.sea[1]);
    g.addColorStop(1, BEACH.sea[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, hz, W, H - hz);
  }));
  S.layers.push(at(9000, 0.06, (ctx, t, view, S2, p) => {
    // headland (cliff + grass cap) and lighthouse, far right
    const X = o.capeX ?? 2600;
    ctx.fillStyle = '#9a8d86';
    ctx.beginPath();
    ctx.moveTo(X - 900, 30);
    ctx.quadraticCurveTo(X - 700, -260, X - 200, -330);
    ctx.lineTo(X + 4000, -360);
    ctx.lineTo(X + 4000, 30);
    ctx.fill();
    ctx.fillStyle = '#7f9a70';
    ctx.beginPath();
    ctx.moveTo(X - 520, -250);
    ctx.quadraticCurveTo(X - 300, -345, X - 120, -345);
    ctx.lineTo(X + 4000, -375);
    ctx.lineTo(X + 4000, -330);
    ctx.lineTo(X - 200, -318);
    ctx.fill();
    const lx = X + 300, ly = -352;
    ctx.fillStyle = '#f7f4ee';
    ctx.beginPath();
    ctx.moveTo(lx - 40, ly);
    ctx.lineTo(lx + 40, ly);
    ctx.lineTo(lx + 27, ly - 330);
    ctx.lineTo(lx - 27, ly - 330);
    ctx.fill();
    ctx.fillStyle = '#c94f45';
    ctx.fillRect(lx - 40, ly - 345, 80, 18);
    ctx.fillStyle = '#fff4c8';
    ctx.fillRect(lx - 22, ly - 385, 44, 40);
    ctx.fillStyle = '#c94f45';
    ctx.beginPath();
    ctx.moveTo(lx - 32, ly - 385);
    ctx.lineTo(lx, ly - 420);
    ctx.lineTo(lx + 32, ly - 385);
    ctx.fill();
  }));
  // the beach is a strip of sand ending at depth `beachEnd`; the swash edge runs
  // diagonally (x = edge(t) + slope * depth); everything else is sea
  const slope = o.slope ?? 0.25;
  const beachEnd = o.beachEnd ?? 260;
  S.layers.push(screenLayer(0.1, (ctx, t, W, H, view) => {
    const hz = view.oy;
    // open sea on the whole ground plane
    const g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, BEACH.sea[1]);
    g.addColorStop(0.35, '#86b3cf');
    g.addColorStop(1, BEACH.sea[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, hz, W, H - hz);
    // far wave lines + glints
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, W / 1920);
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const d = 300 + Math.pow(hash01(i * 7), 2) * 6000;
      const p = view.pOf(d), sc = view.scaleAt(p);
      const y = view.oy + (0 - view.cam.y) * sc;
      const x = W * hash01(i * 13 + Math.floor(t / 40)) + ((t % 40) / 40) * 20;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (6 + 20 * sc / view.scaleAt(1)) * (W / 1920) * 4, y);
    }
    ctx.stroke();
    const edge = swashEdge(t, o);
    const N = 36;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const d = -40 + Math.pow(i / N, 1.6) * (beachEnd + 40);
      const p = view.pOf(d), sc = view.scaleAt(p);
      const xe = edge + d * slope;
      pts.push([view.ox + (xe - view.cam.x) * sc, view.oy + (0 - view.cam.y) * sc, sc]);
    }
    const last = pts[pts.length - 1];
    // sand (left of the shoreline, nearer than beachEnd)
    const sg = ctx.createLinearGradient(0, last[1], 0, H);
    sg.addColorStop(0, BEACH.sand[1]);
    sg.addColorStop(1, BEACH.sand[0]);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(-10, last[1]);
    ctx.closePath();
    ctx.fill();
    // wet sand band just landward of the edge
    ctx.fillStyle = BEACH.wet;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0] - 2.4 * pts[i][2], pts[i][1]);
    ctx.fill();
    // foam edge
    ctx.strokeStyle = BEACH.foam;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.5, 0.2 * view.scaleAt(1));
    ctx.beginPath();
    pts.forEach(([x, y, sc], i) => {
      const wob = Math.sin(i * 1.7 + t * 0.2) * 0.12 * sc;
      i ? ctx.lineTo(x + wob, y) : ctx.moveTo(x + wob, y);
    });
    ctx.stroke();
    // incoming wave lines beyond the edge
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    for (let k = 1; k <= 3; k++) {
      ctx.lineWidth = Math.max(1, (0.12 * view.scaleAt(1)) / k);
      ctx.beginPath();
      pts.forEach(([x, y, sc], i) => {
        const off = (k * 3 + ((t * 0.05 + k * 0.33) % 1) * 3) * sc;
        i ? ctx.lineTo(x + off, y) : ctx.moveTo(x + off, y);
      });
      ctx.stroke();
    }
  }));
  if (o.dunes !== false) {
    S.layers.push(at(300, 0.2, (ctx, t, view, S2, p) => {
      const dune = profile({ base: 0, amp: 30, freq: 0.01, seed: 61 });
      ctx.save();
      ctx.beginPath();
      ctx.rect(-5000, -500, 5000 + (o.duneEnd ?? -60), 600);
      ctx.clip();
      fillBelow(ctx, view, p, dune, BEACH.dune, 400, 3);
      tufts(ctx, view, p, t, { ground: dune, spacing: 5, h: 4, width: 0.35, colors: BEACH.duneGrass, seed: 3, wind: windField({ base: 0.3, gust: 0.4, dir: 1 }), fill: 0.6 });
      ctx.restore();
    }));
  }
  S.layers.push(screenLayer(2.2, (ctx, t, W, H) => {
    const s = W / 1920;
    for (let i = 0; i < 3; i++) {
      const x = W * (((t * 0.0015 * (1 + i * 0.3) + i * 0.37) % 1.3) - 0.15), y = H * (0.15 + 0.07 * i) + Math.sin(t * 0.04 + i) * 8 * s;
      gull(ctx, x, y, t + i * 13, { size: (28 + 8 * i) * s, dir: 1, glide: (t + i * 40) % 90 < 50, rate: 0.35 });
    }
  }));
}
function s9_1() {
  return shot({
    name: '9.1', dur: 156, unit: 20, anchor: [0.5, 0.6], xfade: 24, grade: beachGrade,
    cam: { x: -20, y: -5, z: 1 },
    setup(S) {
      S.camera.move(0, 156, { x: -8 }, 'linear');
      beachWorld(S, { rest: 20, duneEnd: 0 });
      S.extraEvents = [{ t: 0, type: 'amb', name: 'beach' }];
    },
  });
}
function s9_2() {
  const dune = (x) => (x < -6 ? -(-6 - x) * 0.35 : 0);
  return shot({
    name: '9.2', dur: 204, unit: 60, anchor: [0.5, 0.62], grade: beachGrade,
    cam: { x: -6, y: -2.4, z: 1 },
    setup(S) {
      beachWorld(S, { rest: 14 });
      S.layers.push(at(0, 0.8, (ctx) => {
        ctx.fillStyle = BEACH.dune;
        ctx.beginPath();
        ctx.moveTo(-40, 30);
        for (let x = -40; x <= 2; x += 0.5) ctx.lineTo(x, dune(x) + 0.02);
        ctx.lineTo(2, 30);
        ctx.fill();
      }));
      const cat = makeCat(S, { x: -18, facing: 1, ground: dune, ...catMorning });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 16, lead: 8, dx: 1.5, y: 0.7, dy: 0.2 });
      S.camera.key(0, { x: 0, y: -1.4 });
      P.t = 4;
      locomote(P, { gait: 'walk', dist: 20, accel: 10, decel: 16, surfaceAt: () => 'sand' });
      A.look(P, P.t, 10, { yaw: 0.25, pitch: 0.2 });
    },
  });
}
function s9_3() {
  const waves = [{ t: 40, dur: 110, reach: 1.05 }, { t: 190, dur: 110, reach: 1.9 }];
  return shot({
    name: '9.3', dur: 312, unit: 130, anchor: [0.5, 0.6], grade: beachGrade,
    cam: { x: 1.2, y: -1.3, z: 1 },
    setup(S) {
      beachWorld(S, { rest: 4.5, waves, slope: 0.3, dunes: false });
      const cat = makeCat(S, { x: -0.6, facing: 1, ...catMorning, waterColor: 'rgb(235,245,250)', pose: { hPitch: -0.3, lookY: -0.5, earRot: -0.1 } });
      const P = cat.perf;
      // the first touch: the wave reaches the forepaws at ~ t 70
      const tt = 76;
      P.key(tt, {}, 'hold');
      P.setTiming(tt, 1);
      const fn = P.curPose().fn;
      P.key(tt + 3, { hip: [-1.3, -1.05], fn: [fn[0] - 0.6, -0.5], fnC: 1, ff: [fn[0] - 0.9, 0], eyeWide: 1, earRot: 0.5, earFlat: 0.2, fluff: 0.4, tailA: 1.0, tailC: 0.3, archB: 0.3 }, 'out');
      P.event(tt + 1, 'splash', { x: fn[0], y: 0.1, strength: 0.25 });
      P.key(tt + 8, { fn: [fn[0] - 0.75, 0], fnC: 0 }, 'inout');
      P.setTiming(tt + 8, 2);
      // stares at the water: head tilt, sniff
      P.key(tt + 30, { hRoll: 0.35, hPitch: -0.4, lookY: -0.7, eyeWide: 0.4, earRot: -0.1, earFlat: 0, fluff: 0.1, tailA: 0.5, tailC: 0.8 }, 'inout');
      P.key(tt + 60, { hRoll: -0.1, neck: 0.3, neckLen: 1.2, hPitch: -0.55 }, 'inout');
      // then carefully reaches out a paw again as the second wave comes
      const t2 = 176;
      P.key(t2, { fn: [fn[0] - 0.4, -0.35], fnC: 0.8, neckLen: 1.1 }, 'inout');
      P.key(t2 + 16, { fn: [fn[0] + 0.3, -0.05], fnC: 0.2 }, 'inout');
      P.key(t2 + 26, { fn: [fn[0] + 0.35, 0.02], fnC: 0 }, 'in');
      P.event(t2 + 26, 'pat', { x: fn[0] + 0.35 });
      P.key(t2 + 40, { hRoll: 0.2, eyeWide: 0.2, neckLen: 1 }, 'inout');
      S.extraEvents = waves.map((w) => ({ t: w.t, type: 'wave_wash', dur: w.dur }));
    },
  });
}
function s9_4() {
  // waves: the cat chases the backwash, flees the run-up, then plays
  const waves = [{ t: 0, dur: 100, reach: -1 }, { t: 110, dur: 100, reach: -4 }, { t: 230, dur: 110, reach: -2 }];
  return shot({
    name: '9.4', dur: 396, unit: 70, anchor: [0.5, 0.6], grade: beachGrade,
    cam: { x: 2, y: -1.6, z: 1 },
    setup(S) {
      beachWorld(S, { rest: 8, waves, slope: 0.3, dunes: false });
      const cat = makeCat(S, { x: -3, facing: 1, ...catMorning, waterColor: 'rgb(235,245,250)' });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 14, lead: 8, dx: 0, y: 0 });
      S.camera.key(0, { x: 2 });
      // chase the retreating water
      P.t = 40;
      locomote(P, { gait: 'trot', to: 3, accel: 6, decel: 6, surfaceAt: () => 'sand' });
      // the next wave rushes in: turn and run (hop!)
      P.t = Math.max(P.t, 112);
      A.turnAround(P);
      P.setTiming(P.t, 1);
      locomote(P, { gait: 'run', to: -7, accel: 3, decel: 8 });
      P.setTiming(P.t, 2);
      A.jump(P, { dx: 2.2, dy: 0, h: 0.6, antic: 2, hold: 0, flight: 8 });
      // turn back and chase again, joyful
      P.t = Math.max(P.t, 200);
      A.turnAround(P);
      locomote(P, { gait: 'trot', to: 0, accel: 5, decel: 4 });
      A.pounce(P, { dx: 2.2, wiggle: 1 });
      P.t = Math.max(P.t, 250);
      A.turnAround(P);
      P.setTiming(P.t, 1);
      locomote(P, { gait: 'run', to: -9, accel: 3, decel: 10 });
      P.setTiming(P.t, 2);
      S.extraEvents = waves.map((w) => ({ t: w.t, type: 'wave_wash', dur: w.dur }));
    },
  });
}
function s9_5() {
  const waves = [];
  for (let i = 0; i < 6; i++) waves.push({ t: i * 70, dur: 100, reach: i % 2 ? -3 : 0 });
  return shot({
    name: '9.5', dur: 420, unit: 70, anchor: [0.5, 0.58], fadeOut: 72, grade: beachGrade,
    cam: { x: 0, y: -2, z: 1 },
    setup(S) {
      // pull back: the camera rises and the lens widens until the cat is tiny
      S.camera.move(20, 400, { z: 0.06, y: -28, x: 60 }, 'inout');
      beachWorld(S, { rest: 7, waves, slope: 0.3, capeX: 2400 });
      const cat = makeCat(S, { x: -2, facing: 1, ...catMorning });
      const P = cat.perf;
      P.t = 6;
      for (let k = 0; k < 4; k++) {
        locomote(P, { gait: 'trot', dist: 5 + k, accel: 5, decel: 5, surfaceAt: () => 'sand' });
        if (k % 2 === 0) A.jump(P, { dx: 2, dy: 0, h: 0.8, antic: 3, hold: 0, flight: 8 });
        A.turnAround(P);
      }
      S.extraEvents = [{ t: 200, type: 'music_end' }];
    },
  });
}
function credits() {
  return shot({
    name: 'end', dur: 300, unit: 60, anchor: [0.5, 0.5], fadeIn: 24, fadeOut: 48,
    setup(S) {
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        ctx.fillStyle = '#0d0c10';
        ctx.fillRect(0, 0, W, H);
        const u = W / 1920;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#efe6da';
        ctx.font = `${84 * u}px "ZCOOL XiaoWei", "WenQuanYi Zen Hei", serif`;
        ctx.fillText('去看海吧', W / 2, H * 0.42);
        ctx.font = `italic ${30 * u}px Georgia, serif`;
        ctx.fillStyle = '#b9ad9f';
        ctx.fillText('There is a bigger world', W / 2, H * 0.49);
        ctx.font = `${22 * u}px "WenQuanYi Zen Hei", sans-serif`;
        ctx.fillStyle = '#8f8579';
        ctx.fillText('逐帧程序动画 · 全部画面由代码实时绘制', W / 2, H * 0.62);
        ctx.fillText('声音素材见 CREDITS', W / 2, H * 0.66);
      }));
    },
  });
}

export function capeShots() {
  return [s7_1(), s7_2(), s7_3(), s7_4(), s7_5(), s7_6()];
}
export function seaShots() {
  return [s8_1(), s8_2(), s8_3(), s8_4()];
}
export function beachShots() {
  return [s9_1(), s9_2(), s9_3(), s9_4(), s9_5(), credits()];
}
