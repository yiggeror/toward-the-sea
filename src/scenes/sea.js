// Sequence 7 — the cape before dawn: the postcard is torn away by the wind.
// Sequence 8 — the sea (the view matches the postcard).
// Sequence 9 — the beach at sunrise: first waves, play, pull back.
import { shot } from '../film/shot.js';
import { scratchBuffer } from '../film/post.js';
import { TITLE, ITALIC } from '../film/fonts.js';
import { makeCat, follow, ramp, screenLayer, at, standingPose, sittingPose } from '../film/kit.js';
import { CardProp } from '../film/prop.js';
import { drawCard, cardArt } from '../film/postcard.js';
import { drawSeaView, SEA, PALETTES } from '../film/seaview.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { skyGradient, glow, clouds } from '../env/sky.js';
import { profile, fillBelow, groundPlane, groundEllipse } from '../env/terrain.js';
import { grass, tufts, windField, rock, crag } from '../env/nature.js';
import { windStreaks, motes } from '../env/weather.js';
import { lampGlow, fogBand, particles, glints, lightPool, bokeh, wetReflection } from '../env/light.js';
import { stars } from '../env/sky.js';
import { gull, gullFar } from '../env/creatures.js';
import { drawCatBack, drawPortrait } from '../cat/views.js';
import { Track } from '../core/tracks.js';
import { drawEmotes } from '../fx/emote.js';
import { viewRim } from '../fx/rim.js';
import { idleFace } from '../anim/idle.js';
import { css, mix, DPX, rgb } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';

// ================================ 7. CAPE =====================================
const CAPE = {
  sky: (k) => [[0, css(mix('#1f2a5c', '#5a79bd', k))], [0.45, css(mix('#6a5f9e', '#b7a4cc', k))], [0.78, css(mix('#d98a8a', '#f5b9a0', k))], [1, css(mix('#f3b47f', '#ffd9a6', k))]],
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
const capeGrade = (k = 0) => ({ vignette: 0.38, vignetteColor: '#231f3c', grain: 0.38, topGlow: '#ffd9c0', topGlowAmt: 0.06 + 0.08 * k });
const capePost = (k = 0) => ({ bloom: { threshold: 0.84, knee: 0.12, strength: 0.5 + 0.2 * k, radius: 28, tint: '#ffcfa8' } });

function capeBackdrop(S, o = {}) {
  const k = o.dawn ?? 0.3;
  S.layers.push(screenLayer(0, (ctx, t, W, H) => {
    const kk = typeof k === 'function' ? k(t) : k;
    skyGradient(ctx, W, H, CAPE.sky(kk));
    // the last stars fading as the sky brightens
    stars(ctx, W, H, 70, 29, 0.45, t, 0.7 * (1 - kk));
    glow(ctx, W * 0.86, H * 0.78, W * 0.7, '#ffcf9c', 0.45 + 0.3 * kk);
    glow(ctx, W * 0.86, H * 0.82, W * 0.25, '#fff0d4', 0.35 + 0.35 * kk);
  }));
  S.layers.push(Object.assign(at(30000, 0.02, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, { seed: 21, n: 6, y: -6500, dy: 2000, w: 16000, h: 1300, speed: 10, wrap: 150000, top: '#e9b9b4', shade: '#6d628f', rim: '#ffe0cc', glow: '#ff9f7a', light: [0.8, 0.6], alpha: 0.9 })), { blur: 2.5 }));
  if (o.land === false) return;
  const far = profile({ base: 0, amp: 180, freq: 0.001, seed: 51 });
  S.layers.push(Object.assign(at(6000, 0.05, (ctx, t, view, S2, p) => fillBelow(ctx, view, p, far, CAPE.hillFar, 9000, 40)), { haze: { color: '#9a8fb0', amount: 0.3 } }));
  S.layers.push(screenLayer(0.1, (ctx, t, W, H, view) => {
    groundPlane(ctx, view, { y: 0, bands: [[-500, 1500, CAPE.ground]] });
    const yH = view.oy + (0 - view.cam.y) * view.scaleAt(view.pOf(1500));
    fogBand(ctx, W, H, yH, H * 0.08, '#f2c4b0', 0.35, t, { seed: 12, speed: 1.2 });
  }));
  S.layers.push(at(60, 0.2, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: () => 0, density: 2.2, h: 3.2, width: 0.35, colors: [...CAPE.grass, '#c9a98c'], seed: 3, wind: capeWind })));
  // warm sheen racing over the grass in the gusts
  S.layers.push(screenLayer(0.25, (ctx, t, W, H, view) => {
    const y0 = view.oy + (0 - view.cam.y) * view.scaleAt(view.pOf(1500));
    if (y0 >= H) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      const u = ((t * 0.008 * (1 + i * 0.35) + hash01(i * 5)) % 1.6) - 0.3;
      const x = W * u, w = W * (0.16 + 0.1 * i);
      const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, 'rgba(255,200,170,0)');
      g.addColorStop(0.5, css('#ffcfae', 0.14));
      g.addColorStop(1, 'rgba(255,200,170,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - w, y0, 2 * w, H - y0);
    }
    ctx.restore();
  }));
  S.layers.push(at(10, 0.3, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: o.ground || (() => 0), density: 5, h: 1.7, width: 0.16, colors: CAPE.grass, seed: 5, wind: capeWind })));
}
function capeFront(S, o = {}) {
  S.layers.push(at(-6, 2, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: () => 0.7, spacing: 2.2, h: 2.6, width: 0.2, colors: ['#39523b', '#446046'], seed: o.seed ?? 7, wind: capeWind, fill: 0.55 })));
  S.layers.push(screenLayer(2.4, (ctx, t, W, H) => windStreaks(ctx, W, H, t, { n: o.streaks ?? 10, seed: 13, alpha: 0.28, dir: 1, color: '#fff2e6' })));
}
// terrain drawn as a filled profile at the stage plane
function paintLand(ctx, g, x0, x1, col, t, step = 0.25, edge = null) {
  // body: vertical gradient from the sunlit top edge down into shadow
  let top = Infinity;
  for (let x = x0; x <= x1; x += 1) top = Math.min(top, g(x));
  const grd = ctx.createLinearGradient(0, top, 0, top + 14);
  grd.addColorStop(0, css(mix(col, '#9fb07f', 0.25)));
  grd.addColorStop(0.35, col);
  grd.addColorStop(1, css(mix(col, '#1c2233', 0.5)));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(x0, 40);
  for (let x = x0; x <= x1; x += step) ctx.lineTo(x, g(x));
  if (edge) for (const [x, y] of edge) ctx.lineTo(x, y); // ragged boundary (a cliff lip)
  else ctx.lineTo(x1, 40);
  ctx.closePath();
  ctx.fill();
  // mottled grass patches and brush-like turf strokes (denser near the crest)
  ctx.save();
  ctx.clip();
  const span = x1 - x0;
  for (let i = 0; i < Math.round(span * 1.2) + 40; i++) {
    const x = x0 + hash01(i * 7 + 1) * span;
    const y = g(x) + 0.4 + hash01(i * 3) * 9;
    ctx.fillStyle = css(hash01(i * 5) < 0.5 ? '#5d7a55' : '#3f5445', 0.16 + 0.1 * hash01(i * 17));
    ctx.beginPath();
    ctx.ellipse(x, y, 1.4 + 3 * hash01(i * 11), 0.18 + 0.3 * hash01(i * 13), 0, 0, TAU);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? 'rgba(150,172,120,0.22)' : 'rgba(42,58,46,0.22)';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    for (let i = 0; i < Math.round(span * 7); i++) {
      const h = (q) => hash01(i * 13 + pass * 7919 + q);
      const x = x0 + h(1) * span;
      const y = g(x) + 0.25 + Math.pow(h(2), 1.6) * 12;
      const L = 0.25 + 0.5 * h(3);
      ctx.moveTo(x, y);
      ctx.lineTo(x + L, y - L * (0.25 + 0.3 * h(4)));
    }
    ctx.stroke();
  }
  ctx.restore();
  // warm rim of dawn light along the crest
  ctx.strokeStyle = 'rgba(255,210,170,0.55)';
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += step) (x === x0 ? ctx.moveTo(x, g(x) + 0.04) : ctx.lineTo(x, g(x) + 0.04));
  ctx.stroke();
}
function terrainLayer(S, g, x0, x1, col, z = 0.85) {
  S.layers.push(at(0, z, (ctx, t) => paintLand(ctx, g, x0, x1, col, t)));
  S.layers.push(at(0, z + 0.001, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: g, spacing: 0.7, h: 1.1, width: 0.1, colors: ['#4d6a48', '#638058', '#8c9f73'], seed: 41, wind: capeWind, fill: 0.9 })));
}

function s7_1() {
  const slope = (x) => -x * 0.12;
  return shot({
    name: '7.1', dur: 180, unit: 24, anchor: [0.5, 0.66], fadeIn: 36, post: capePost(0), grade: capeGrade(0),
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
    name: '7.2', dur: 132, unit: 112, anchor: [0.5, 0.62], post: capePost(0.1), grade: capeGrade(0.1),
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
    name: '7.3', dur: 84, unit: 150, anchor: [0.5, 0.6], post: capePost(0.15), grade: capeGrade(0.15),
    cam: { x: 1.2, y: -1.8, z: 1 },
    setup(S) {
      capeBackdrop(S, { dawn: 0.2 });
      terrainLayer(S, slope, -30, 30, CAPE.ground[0]);
      const tSnatch = 30;
      const cat = makeCat(S, { x: 0, facing: 1, ground: slope, carry: { wear: 0.9, on: (t) => t < tSnatch }, wind: (t) => [t > 22 && t < 50 ? 2.4 : 0.9, -0.1], ...catDawn });
      const P = cat.perf;
      P.key(0, { mouth: 0 });
      P.key(20, { mouth: 0.35, mouthW: 0.3, lid: 0.4, sad: 0.2 }, 'inout'); // opens the mouth to pant...
      P.key(tSnatch, { mouth: 0.5 }, 'out');
      P.setTiming(tSnatch, 1);
      P.key(tSnatch + 2, { eyeWide: 1, eye: 1, lid: 0, sad: 0, pupil: 0.95, earRot: -0.3, earFlat: 0, hPitch: 0.3, neck: 0.8, fluff: 0.4, mouth: 0.45, mouthW: 0 }, 'out');
      P.emote(tSnatch + 1, 'exclaim', { dur: 26, size: 1.3 });
      P.emote(tSnatch + 1, 'surprise', { dur: 14 });
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
    name: '7.4', dur: 396, unit: 58, anchor: [0.42, 0.62], post: capePost(0.25), grade: capeGrade(0.25),
    cam: { x: 0, y: -1.5, z: 1 },
    setup(S) {
      capeBackdrop(S, { dawn: 0.3, ground: () => 0 });
      terrainLayer(S, chaseGround, -30, 46, CAPE.ground[0]);
      S.layers.push(at(0, 0.86, (ctx) => {
        // rocky outcrop: a rugged slanted face, a turf cap, the far end dropping away
        crag(ctx, [
          [30.1, 3.4, 0], [30.45, 1.3, 1], [30.95, -0.9, 1], [31.35, -2.15, 0.6], [31.95, -2.7, 0.15],
          [46.0, -2.98, 0.9], [46.5, -1.2, 1.2], [47.3, 1.2, 1.2], [47.8, 3.4, 0],
        ], { seed: 11, lit: '#b3a0a6', mid: '#77717f', dark: '#403b50', light: [0.8, -0.6], rough: 0.24, rim: 'rgba(255,212,178,0.6)', rimWidth: 0.07 });
        // turf cap with a ragged underside
        const top = (x) => lerp(-2.74, -3.0, (x - 31.95) / 14.05);
        ctx.fillStyle = CAPE.ground[0];
        ctx.beginPath();
        ctx.moveTo(31.8, top(31.8) - 0.04);
        for (let x = 31.8; x <= 46.1; x += 0.25) ctx.lineTo(x, top(x) - 0.06);
        for (let x = 46.1; x >= 31.8; x -= 0.25) ctx.lineTo(x, top(x) + 0.18 + 0.16 * hash01(Math.round(x * 4) * 7 + 3));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,214,170,0.5)';
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        for (let x = 31.8; x <= 46.1; x += 0.25) (x === 31.8 ? ctx.moveTo(x, top(x) - 0.05) : ctx.lineTo(x, top(x) - 0.05));
        ctx.stroke();
      }));
      S.layers.push(at(0, 0.861, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: (x) => (x > 32 && x < 45.8 ? chaseGround(x) - 0.02 : 90), spacing: 0.9, h: 0.9, width: 0.1, colors: ['#4d6a48', '#638058', '#8c9f73'], seed: 43, wind: capeWind, fill: 0.7 })));
      S.layers.push(at(0, 0.87, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: (x) => (x < 31 ? chaseGround(x) : 50), density: 7, h: 1.0, width: 0.12, colors: CAPE.grass, seed: 17, wind: capeWind })));
      const cat = makeCat(S, { x: -2, facing: 1, ground: chaseGround, wind: tailwind(1.0), ...catDawn });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 10, lead: 12, dx: 2.4, y: 0.8, dy: 0.2 });
      P.setTiming(0, 1);
      P.t = 0;
      // bolt after the card
      locomote(P, { gait: 'run', to: 14.6, accel: 8, decel: 3, speed: 0.9, pose: { earRot: -0.2, earFlat: 0, eyeWide: 0.6, lid: 0.15, lidTilt: 0.7, mouth: 0.2 } });
      // skid at the bank edge: front legs braced forward, body leaning back
      let t = P.t;
      const hx = P.curPose().hip[0];
      const g = chaseGround;
      P.key(t + 3, { hip: [hx + 0.6, g(hx + 0.6) - 0.8], pitch: 0.25, len: 0.95, archB: 0.4, fn: [hx + 2.1, g(hx + 2.1)], ff: [hx + 2.0, g(hx + 2.0)], fnC: 0, ffC: 0, fnF: 0.8, ffF: 0.8, hn: [hx + 0.2, g(hx + 0.2)], hf: [hx + 0.1, g(hx + 0.1)], neck: 0.9, hPitch: 0.2, earFlat: 0.4, squeeze: 1, lid: 0 }, 'out');
      P.emote(t + 4, 'sweat', { dur: 22 });
      P.event(t + 3, 'skid', { x: hx + 1.5, y: g(hx + 1.5), dur: 12 });
      // loses the footing and slides down the bank on the haunches
      P.key(t + 10, { hip: [hx + 1.6, g(hx + 1.6) - 0.6], pitch: 0.45, fn: [hx + 3.1, g(hx + 3.1)], ff: [hx + 3.0, g(hx + 3.0)], hn: [hx + 1.4, g(hx + 1.4)], hf: [hx + 1.3, g(hx + 1.3)], hnM: 0.8, hfM: 0.8, tailA: 1.2 }, 'in');
      P.key(t + 20, { hip: [hx + 4.6, g(hx + 4.6) - 0.6], pitch: 0.55, fn: [hx + 6.1, g(hx + 6.1)], ff: [hx + 5.9, g(hx + 5.9)], hn: [hx + 4.4, g(hx + 4.4)], hf: [hx + 4.2, g(hx + 4.2)], fluff: 0.6 }, 'linear');
      P.event(t + 10, 'slide', { dur: 12 });
      P.key(t + 24, { hip: [hx + 5.6, g(hx + 5.6) - 0.85], pitch: 0.05, hnM: 0, hfM: 0, archB: 0.35, tailA: 0.5, fnF: 0, ffF: 0, squeeze: 0, lid: 0.2, lidTilt: 0.8 }, 'out');
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
      P.key(t + 30, { hip: [x0 + 5.6, gy - 1.02], pitch: 0.12, len: 1, archB: 0.05, neck: 0.95, hPitch: 0.8, lookY: 0.9, eyeWide: 0.6, lid: 0, lidTilt: 0, mouth: 0.15 }, 'out');
      P.setTiming(t + 30, 2);
      const tLand = t + 30;
      // watches the card rise away
      P.key(tLand + 40, { hPitch: 1.0, neck: 1.05, sad: 0.6, eyeWide: 0.3, mouth: 0 }, 'inout');
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
    name: '7.5', dur: 156, unit: 60, anchor: [0.5, 0.5], post: capePost(0.35), grade: capeGrade(0.35),
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
  // the sea cliff below the crest: rock where the turf gives out
  const lipY = RIDGE(29.99);
  S.layers.push(at(0, 0.79, (ctx) => crag(ctx, [
    [21.5, 40, 0], [24.5, 12, 1], [27.2, 4.5, 1], [28.9, 0.4, 0.8], [29.7, lipY + 0.45, 0.4], [30.25, lipY + 0.2, 0.3],
    [30.9, -0.6, 1], [31.2, 2.6, 1.2], [30.7, 5.2, 1.3], [31.8, 9.5, 1.2], [32.3, 16, 1], [33.6, 26, 1], [34.2, 40, 0.5],
  ], { seed: 7, lit: '#b7a2a4', mid: '#7a7184', dark: '#3e3a4e', light: [0.85, -0.5], rough: 0.3, rim: 'rgba(255,207,174,0.55)', rimWidth: 0.1, ao: 0.45 })));
  const edge = [[30.15, lipY + 0.35], [29.6, 0.2], [28.3, 3.2], [26.6, 6.5], [24.2, 13], [21.6, 40]];
  S.layers.push(at(0, 0.8, (ctx, t) => paintLand(ctx, (x) => RIDGE(Math.max(10, x)) + (x < 10 ? (10 - x) * 0.02 : 0), -200, 29.9, CAPE.ground[0], t, 0.5, edge)));
  S.layers.push(at(0, 0.85, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: (x) => (x < 30 ? RIDGE(Math.max(10, x)) : 90), density: 6, h: 1.1, width: 0.12, colors: CAPE.grass, seed: 23, wind: capeWind })));
  // rocks breaking through the turf on the ridge face
  S.layers.push(at(0, 0.8005, (ctx) => {
    for (const [x, y, w, h, sd] of [[19.2, 2.2, 2.6, 1.3, 3], [24.6, 4.0, 1.8, 0.9, 5], [12.5, 5.2, 2.2, 1.0, 9], [27.4, 1.0, 1.2, 0.8, 13]]) {
      crag(ctx, [[x - w / 2, y + h * 0.3, 0], [x - w * 0.35, y - h * 0.6, 1], [x + w * 0.1, y - h, 1], [x + w / 2, y - h * 0.2, 1], [x + w * 0.45, y + h * 0.3, 0]],
        { seed: sd, lit: '#a99aa0', mid: '#6f6a79', dark: '#3e3a4c', light: [0.85, -0.5], rough: 0.12, rim: 'rgba(255,207,174,0.45)', rimWidth: 0.05, facets: 5, strata: 1, ao: 0.2 });
    }
  }));
  // turf hanging over the lip
  S.layers.push(at(0, 0.851, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: (x) => (x > 28.6 && x < 30.3 ? RIDGE(x) + 0.12 : 90), spacing: 0.35, h: 0.8, width: 0.1, colors: ['#4d6a48', '#638058', '#8c9f73'], seed: 29, wind: capeWind, fill: 1 })));
}
function s7_6() {
  return shot({
    name: '7.6', dur: 252, unit: 40, anchor: [0.5, 0.56], post: capePost(0.45), grade: capeGrade(0.45),
    cam: { x: 16, y: 1.5, z: 1 },
    setup(S) {
      ridgeScene(S, { dawn: 0.45 });
      const cat = makeCat(S, { x: 16, facing: 1, ground: RIDGE, wind: tailwind(0.8), ...catDawn, pose: { hPitch: 0.6, neck: 0.95, lookY: 0.7 } });
      const P = cat.perf;
      // stands still, looking where the card went; slowly the head, ears and tail sink
      P.key(40, {}, 'hold');
      P.key(110, { hPitch: -0.1, neck: 0.45, lookY: -0.2, earRot: 0.55, earFlat: 0.35, tailTone: 0.35, tailA: -0.4, tailC: 0.2, sad: 0.9, tear: 0.6, whiskDroop: 0.7 }, 'inout');
      A.blink(P, 150, 10);
      P.key(200, { hPitch: -0.2, tear: 0.8 }, 'inout');
      P.emote(120, 'gloom', { dur: 110 });
      S.layers.push(screenLayer(2.4, (ctx, t, W, H) => windStreaks(ctx, W, H, t, { n: 6, seed: 19, alpha: 0.2, dir: 1, color: '#fff2e6' })));
    },
  });
}

// ================================ 8. THE SEA ===================================
function s8_1() {
  return shot({
    name: '8.1', dur: 120, unit: 150, anchor: [0.5, 0.6], post: capePost(0.5), grade: capeGrade(0.5),
    cam: { x: 17.1, y: -3.8, z: 1 },
    setup(S) {
      ridgeScene(S, { dawn: 0.5 });
      const cat = makeCat(S, { x: 16, facing: 1, ground: RIDGE, wind: tailwind(0.6), ...catDawn,
        pose: { hPitch: -0.2, neck: 0.45, earRot: 0.55, earFlat: 0.35, tailTone: 0.35, tailA: -0.4, tailC: 0.2, sad: 0.8, tear: 0.5, whiskDroop: 0.6 } });
      const P = cat.perf;
      // the first sound of waves: one ear turns, then the other; the eyes open
      P.key(40, { earLR: -0.55, earFlat: 0.15 }, 'out');
      P.key(50, { earLR: -0.4 }, 'inout');
      P.key(64, { earRR: -0.5, earRot: 0.2, earFlat: 0, eye: 1, sad: 0.2, eyeWide: 0.35, whiskDroop: 0 }, 'out');
      P.emote(62, 'question', { dur: 40 });
      P.key(80, { hPitch: 0.05, neck: 0.6, tear: 0.3 }, 'inout');
      S.extraEvents = [{ t: 36, type: 'waves_first' }];
    },
  });
}
function s8_2() {
  return shot({
    name: '8.2', dur: 132, unit: 58, anchor: [0.5, 0.58], post: capePost(0.55), grade: capeGrade(0.55),
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
      P.key(80, { eyeWide: 0.5, sparkle: 1, sad: 0, tear: 0.4 }, 'inout');
      P.emote(84, 'sparkle', { dur: 48, n: 5 });
    },
  });
}
// ---- 8.3 the view (matches the postcard) ----------------------------------------
function s8_3() {
  return shot({
    name: '8.3', dur: 384, unit: 60, anchor: [0.5, 0.5], xfade: 24,
    post: (t) => {
      const sy = 0.42 - ramp(t, [[0, 0.0], [380, 0.07]]);
      return {
        rays: { pos: [0.36, sy], radius: 0.3, strength: 0.2 + 0.2 * smoothstep(60, 300, t), length: 0.5, threshold: 0.9, knee: 0.08, tint: '#ffd8a8' },
        bloom: { threshold: 0.86, knee: 0.12, strength: 0.45, radius: 30, tint: '#ffd9b4' },
        flare: { pos: [0.36, sy], strength: 0.12 * smoothstep(120, 300, t), tint: '#ffcfa0' },
        before: 1,
      };
    },
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
        // exposed rock where the turf gives out at the cliff lip
        const u = H / 40;
        ctx.save();
        ctx.scale(u, u);
        crag(ctx, [[(W * 0.43) / u, 41, 0], [(W * 0.5) / u, (H * 0.874) / u, 0.4], [(W * 0.521) / u, (H * 0.859) / u, 0.3],
          [(W * 0.533) / u, (H * 0.9) / u, 1], [(W * 0.547) / u, (H * 0.935) / u, 1.2], [(W * 0.541) / u, (H * 0.965) / u, 1.2], [(W * 0.558) / u, 41, 0]],
        { seed: 3, lit: '#a3949a', mid: '#5f5766', dark: '#2c2934', light: [0.35, -0.94], rough: 0.35, rim: 'rgba(255,207,158,0.6)', rimWidth: 0.09, strata: 4, facets: 10, ao: 0.35 });
        ctx.restore();
        const cg = ctx.createLinearGradient(0, H * 0.78, 0, H);
        cg.addColorStop(0, '#56654f');
        cg.addColorStop(0.3, '#3d4a45');
        cg.addColorStop(1, '#262d33');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.moveTo(0, H * 0.84);
        ctx.quadraticCurveTo(W * 0.25, H * 0.78, W * 0.52, H * 0.86);
        ctx.quadraticCurveTo(W * 0.505, H * 0.895, W * 0.497, H * 0.93);
        ctx.quadraticCurveTo(W * 0.482, H * 0.97, W * 0.47, H);
        ctx.lineTo(0, H);
        ctx.fill();
        // the sunrise catches the edge of the cliff top
        ctx.strokeStyle = css('#ffcf9e', 0.35 + 0.35 * smoothstep(0, 250, t));
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(0, H * 0.84);
        ctx.quadraticCurveTo(W * 0.25, H * 0.78, W * 0.52, H * 0.86);
        ctx.stroke();
        const wind = capeWind;
        grass(ctx, { xRange: () => [0, W * 0.56], W }, 1, t, { ground: (x) => H * 0.84 + (x / W) * H * 0.02, density: 0.15 / s, h: 26 * s, width: 5 * s, colors: ['#2f3b37', '#3c4a44'], seed: 5, wind: (x, tt) => wind(x / (30 * s), tt) * 0.6 });
        const hp = { hPitch: 0.05 + 0.05 * smoothstep(200, 300, t), earRot: 0.05, earLR: Math.sin(t * 0.02) * 0.1, tail: 0.5 + 0.1 * Math.sin(t * 0.02), breath: 0.5 + 0.5 * Math.sin(t * 0.08), hRoll: 0.08 * smoothstep(250, 320, t) };
        const co = { x: W * 0.28, y: H * 0.87, scale: 118 * s, light: { tint: '#b7acc7', amt: 0.35, lift: '#221a24' } };
        drawCatBack(ctx, hp, co);
        // the sunrise outlines the fur in gold
        viewRim(ctx, drawCatBack, hp, co, { dir: [0.35, -0.94], color: '#ffd9a8', alpha: 0.8 * smoothstep(0, 200, t) + 0.2 });
      }));
      S.extraEvents = [{ t: 0, type: 'amb', name: 'sea_dawn' }, { t: 60, type: 'music_in' }];
    },
  });
}
function s8_4() {
  return shot({
    name: '8.4', dur: 204, unit: 360, anchor: [0.5, 0.62],
    post: { rays: { pos: [0.2, 0.37], radius: 0.3, strength: 0.3, length: 0.5, threshold: 0.9, knee: 0.08, tint: '#ffd8a8' }, bloom: { threshold: 0.86, knee: 0.12, strength: 0.45, radius: 30, tint: '#ffd9b4' }, flare: { pos: [0.2, 0.37], strength: 0.1, tint: '#ffcfa0' } },
    grade: { vignette: 0.35, vignetteColor: '#3c3148', grain: 0.35, topGlow: '#ffe2c4', topGlowAmt: 0.2 },
    setup(S) {
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        drawSeaView(ctx, -W * 0.2, -H * 0.1, W * 1.6, H * 1.3, { palette: 'sunrise', t, sunRise: 0.06, sunU: 0.25 });
        ctx.fillStyle = 'rgba(255,230,210,0.15)';
        ctx.fillRect(0, 0, W, H);
      }));
      const tr = new Track({ hYaw: -0.55, hPitch: 0.1, hRoll: 0, eye: 1, eyeWide: 0.2, pupil: 0.5, lookX: 0.2, lookY: 0.1, happy: 0, smile: 0, earRot: 0.05, earLR: 0, earRR: 0, whisk: 0.2, mouth: 0.1, mouthW: 0,
        sparkle: 0.9, tear: 0.3, blush: 0.2, sad: 0, lid: 0, lidTilt: 0, squeeze: 0, wobble: 0, tongue: 0 });
      tr.key(0, {}, 'linear');
      tr.key(40, { tear: 0.85, sparkle: 1, mouth: 0 }, 'inout'); // eyes fill up
      tr.key(70, { tear: 1, smile: 0.25, blush: 0.4 }, 'inout');
      tr.key(96, { tear: 0.9 }, 'hold');
      tr.key(104, { happy: 1, eye: 0, tear: 0.4, smile: 0.7, blush: 0.55, hRoll: 0.06 }, 'inout'); // a warm, closed-eye smile
      tr.key(150, { smile: 0.85, hRoll: 0.1, hPitch: 0.14 }, 'inout');
      tr.key(190, { smile: 0.85 }, 'inout');
      const EV = [
        { type: 'emote', kind: 'tear', t: 84, dur: 30, side: -1 },
        { type: 'emote', kind: 'sparkle', t: 6, dur: 60, n: 4 },
      ];
      S.layers.push(screenLayer(1, (ctx, t, W, H) => {
        const tt = Math.floor(t / 2) * 2;
        const p = idleFace(Object.assign({}, tr.sample(tt)), tt, 84, { ears: true });
        p.breath = 0.5 + 0.5 * Math.sin(t * 0.08);
        p.earLR = (p.earLR || 0) + Math.sin(t * 0.05) * 0.08;
        const s = W / 1920;
        const po = { x: W * 0.62, y: H * 0.78, scale: 360 * s, light: { tint: '#e8d2cc', amt: 0.25, lift: '#20181c' } };
        const an = drawPortrait(ctx, p, po);
        viewRim(ctx, drawPortrait, p, po, { dir: [-0.9, -0.44], color: '#ffd4a0', alpha: 0.6, width: 360 * s * 0.03 });
        drawEmotes(ctx, EV, tt, an);
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
  sky: [[0, '#5d9ad6'], [0.5, '#a9cbe6'], [0.85, '#e8eef0'], [1, '#fdebd6']],
  sand: ['#dcc29a', '#efdfbf'], wet: '#b59d7e', sea: ['#3f7fb3', '#8fc0da'], foam: '#fdfdf9',
  dune: '#d7c19a', duneGrass: ['#8f9a6c', '#a7ae7c'],
};
const catMorning = {
  light: () => ({ tint: '#fff2e2', amt: 0.1, lift: '#0e0a08' }),
  rim: () => ({ color: '#fff0d8', dir: [-0.8, -0.6], alpha: 0.5, width: 0.05 }),
};
const beachGrade = { vignette: 0.28, vignetteColor: '#5a5060', grain: 0.3, topGlow: '#fff3e0', topGlowAmt: 0.1 };
const beachPost = { bloom: { threshold: 0.88, knee: 0.1, strength: 0.5, radius: 24, tint: '#fff4e0' }, rays: { pos: [0.18, 0.12], radius: 0.3, strength: 0.25, length: 0.5, threshold: 0.92, knee: 0.06, tint: '#fff0d0' } };
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
    glow(ctx, W * 0.18, H * 0.12, W * 0.6, '#fff6e2', 0.55);
    lampGlow(ctx, W * 0.18, H * 0.12, W * 0.05, '#ffffff', 1, 0.3);
  }));
  S.layers.push(Object.assign(at(30000, 0.02, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, { seed: 31, n: 5, y: -6000, dy: 2000, w: 12000, h: 1200, speed: 3, wrap: 150000, top: '#ffffff', shade: '#c9d3e2', rim: '#ffffff', light: [-0.6, -0.8] })), { blur: 2.2 }));
  S.layers.push(screenLayer(0.05, (ctx, t, W, H, view) => {
    const hz = view.oy;
    const g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, BEACH.sea[1]);
    g.addColorStop(1, BEACH.sea[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, hz, W, H - hz);
  }));
  // far headland with the lighthouse (right): a rocky cape in the morning haze
  S.layers.push(Object.assign(at(9000, 0.06, (ctx, t, view, S2, p) => {
    const X = o.capeX ?? 2600;
    crag(ctx, [
      [X - 950, 40, 0], [X - 800, -90, 1], [X - 640, -210, 1], [X - 430, -290, 0.6], [X - 200, -330, 0.4],
      [X + 4000, -362, 0], [X + 4000, 40, 0],
    ], { seed: 17, lit: '#c9b8b0', mid: '#a09490', dark: '#77707a', light: [-0.7, -0.7], rough: 26, strata: 5, facets: 22, rim: 'rgba(255,248,236,0.7)', rimWidth: 7, ao: 0.25, dip: 0.02 });
    // turf cap
    ctx.fillStyle = '#86a076';
    ctx.beginPath();
    ctx.moveTo(X - 560, -250);
    ctx.quadraticCurveTo(X - 330, -350, X - 120, -348);
    ctx.lineTo(X + 4000, -378);
    ctx.lineTo(X + 4000, -350);
    ctx.lineTo(X - 160, -322);
    ctx.quadraticCurveTo(X - 360, -318, X - 560, -250);
    ctx.fill();
    // lighthouse: tower with a gallery and lantern, a keeper's house beside it
    const lx = X + 300, ly = -356;
    ctx.fillStyle = '#e8e2d8';
    ctx.fillRect(lx + 70, ly - 70, 150, 70);
    ctx.fillStyle = '#b8574c';
    ctx.beginPath();
    ctx.moveTo(lx + 58, ly - 70);
    ctx.lineTo(lx + 145, ly - 118);
    ctx.lineTo(lx + 232, ly - 70);
    ctx.fill();
    const tg = ctx.createLinearGradient(lx - 40, 0, lx + 40, 0);
    tg.addColorStop(0, '#fffdf8');
    tg.addColorStop(0.6, '#f1ece2');
    tg.addColorStop(1, '#cfc7bd');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(lx - 42, ly);
    ctx.lineTo(lx + 42, ly);
    ctx.lineTo(lx + 28, ly - 330);
    ctx.lineTo(lx - 28, ly - 330);
    ctx.fill();
    ctx.fillStyle = '#c94f45';
    ctx.fillRect(lx - 36, ly - 205, 72, 34);
    ctx.fillStyle = '#3f3a44';
    ctx.fillRect(lx - 44, ly - 344, 88, 14);
    ctx.fillStyle = '#fff4c8';
    ctx.fillRect(lx - 22, ly - 392, 44, 48);
    ctx.fillStyle = '#c94f45';
    ctx.beginPath();
    ctx.moveTo(lx - 30, ly - 392);
    ctx.quadraticCurveTo(lx, ly - 440, lx + 30, ly - 392);
    ctx.fill();
  }), { haze: { color: '#dfe8ef', amount: 0.32 } }));
  // the beach is a strip of sand ending at depth `beachEnd`; the swash edge runs
  // diagonally (x = edge(t) + slope * depth + a slow meander); beyond is sea
  const slope = o.slope ?? 0.25;
  const beachEnd = o.beachEnd ?? 260;
  const waves = o.waves || [];
  const rest = o.rest ?? 6;
  const meander = (d) => smoothstep(4, 40, Math.abs(d)) * (noise1(d * 0.018, 5) * 7 + noise1(d * 0.07, 9) * 1.4);
  // the high-water mark: as far as the waves of this shot reach, a little ragged
  const wetTo = Math.min(rest - 2.4, ...waves.map((w) => w.reach - 0.6));
  const wetEdge = (d) => wetTo + noise1(d * 0.35, 21) * 0.5 + noise1(d * 1.4, 23) * 0.15;
  S.layers.push(screenLayer(0.1, (ctx, t, W, H, view) => {
    const hz = view.oy;
    const k = W / 1920;
    const edge = swashEdge(t, o);
    const dk = Math.max(1, view.D / S.D); // > 1 while the camera dollies back
    const P = (x, d) => {
      const p = view.pOf(d), sc = view.scaleAt(p);
      return [view.ox + (x - view.cam.x) * sc, view.oy + (0 - view.cam.y) * sc, sc];
    };
    // depth samples, from just in front of the lens to the end of the beach
    const dNear = -view.D * 0.82;
    const N = 140;
    const ds = [];
    for (let i = 0; i <= N; i++) ds.push(dNear + Math.pow(i / N, 1.9) * (beachEnd - dNear));
    const shore = (d) => edge + d * slope + meander(d); // the swash front (moves with the waves)
    const restShore = (d) => Math.max(rest, edge) + d * slope + meander(d); // where the sea begins
    const line = (fx) => ds.map((d) => P(fx(d), d));
    // a band between two x(d) curves as a closed path (extended below the frame)
    const band = (fa, fb) => {
      const A = line(fa), B = line(fb);
      const path = new Path2D();
      path.moveTo(A[0][0], Math.max(A[0][1], H + 20));
      A.forEach(([x, y]) => path.lineTo(x, y));
      for (let i = B.length - 1; i >= 0; i--) path.lineTo(B[i][0], B[i][1]);
      path.lineTo(B[0][0], Math.max(B[0][1], H + 20));
      path.closePath();
      return path;
    };
    // ---- the beach floor, painted one pixel row at a time: every row is a
    // single depth, so a horizontal gradient runs exactly across it (dry sand,
    // wet sand, the glossy edge, the sheet of water, the sea) without seams
    const far = P(0, beachEnd)[1];
    const seaStops = [[0, rgb(BEACH.sea[1])], [0.3, rgb('#79acd0')], [1, rgb('#3a78ab')]];
    const grad3 = (stops, u) => {
      u = clamp(u, 0, 1);
      for (let i = 1; i < stops.length; i++) {
        if (u <= stops[i][0]) {
          const [ua, ca] = stops[i - 1], [ub, cb] = stops[i];
          return mix(ca, cb, (u - ua) / Math.max(1e-6, ub - ua));
        }
      }
      return stops[stops.length - 1][1];
    };
    const sandA = rgb(BEACH.sand[1]), sandB = rgb(BEACH.sand[0]);
    const wetC = rgb(BEACH.wet), gloss = rgb('#d3e4ea');
    const base1 = view.scaleAt(1);
    const y0row = Math.max(0, Math.ceil(hz));
    if (view.cam.y < -1e-3) {
      for (let y = y0row; y < H; y++) {
        const yc = y + 0.5;
        const seaC = grad3(seaStops, (yc - hz) / Math.max(1, H - hz));
        const sc = (yc - view.oy) / -view.cam.y;
        if (sc <= 1e-6) continue;
        const d = view.D * base1 / sc - view.D;
        if (d > beachEnd || d < dNear) {
          ctx.fillStyle = css(seaC);
          ctx.fillRect(0, y, W, 1);
          continue;
        }
        const sandC = mix(sandA, sandB, clamp((yc - far) / Math.max(1, H - far), 0, 1));
        const X = (xw) => view.ox + (xw - view.cam.x) * sc;
        const xs = shore(d), xr = restShore(d);
        const xwet = Math.min(xs - 0.05, wetEdge(d) + d * slope + meander(d));
        const sheet = xr - xs; // width of the thin sheet of water run up over the sand
        const stops = [
          [X(xwet), sandC],
          [X(lerp(xwet, xs, 0.25)), mix(sandC, wetC, 0.35)],
          [X(lerp(xwet, xs, 0.55)), wetC],
          [X(lerp(xwet, xs, 0.88)), mix(wetC, gloss, 0.55)],
          [X(xs), gloss],
          [X(xs + Math.min(0.25, sheet * 0.3 + 0.05)), mix(wetC, rgb('#eef7f6'), 0.68)],
          [X(xs + sheet * 0.35 + 0.08), mix(wetC, rgb('#d5eceb'), 0.58)],
          [X(xs + sheet * 0.7 + 0.1), mix(wetC, rgb('#b8e3e0'), 0.55)],
          [X(xr + 0.2), mix(wetC, rgb('#a6dcd6'), 0.62)],
          [X(xr + 1.1), rgb('#a6dcd6')],
          [X(xr + 2.6), rgb('#6fb6cf')],
          [X(xr + 5.5), seaC],
        ];
        const xa = Math.min(0, stops[0][0]) - 1, xb = Math.max(W, stops[stops.length - 1][0]) + 1;
        const g = ctx.createLinearGradient(xa, 0, xb, 0);
        g.addColorStop(0, css(stops[0][0] > xa ? sandC : stops[0][1]));
        let last = 0;
        for (const [x, c] of stops) {
          const u = clamp((x - xa) / (xb - xa), 0, 1);
          if (u < last) continue;
          g.addColorStop(u, css(c));
          last = u;
        }
        g.addColorStop(1, css(seaC));
        ctx.fillStyle = g;
        ctx.fillRect(0, y, W, 1);
      }
    }
    // ---- the open sea: swell crests rolling in and breaking, glitter
    ctx.lineCap = 'round';
    const K = 9;
    for (let c = 0; c < K; c++) {
      const ph = (t * 0.0045 + c / K) % 1;
      const off = 3.2 + Math.pow(1 - ph, 1.4) * 60; // distance from the shore line
      const brk = 1 - smoothstep(3.2, 14, off); // breaking near the shore
      const fade = Math.sin(ph * Math.PI);
      if (fade < 0.02) continue;
      for (let i = 0; i < ds.length - 1; i += 1) {
        const d = ds[i];
        if (d > 170 * dk) break;
        if (hash01(c * 131 + i * 7 + Math.floor(t * 0.0045 + c / K) * 17) < 0.5 - 0.45 * brk) continue;
        const [xa, ya, sa] = P(restShore(d) + off + Math.sin(d * 0.3 + c) * 0.4, d);
        const [xb, yb] = P(restShore(ds[i + 1]) + off + Math.sin(ds[i + 1] * 0.3 + c) * 0.4, ds[i + 1]);
        if (ya > H + 40 && yb > H + 40) continue;
        const a = fade * (0.09 + 0.64 * brk) * (0.4 + 0.6 * smoothstep(0, 60, sa)) * (1 - 0.75 * smoothstep(120, 420, sa));
        ctx.strokeStyle = css('#f6fbfd', a);
        ctx.lineWidth = Math.max(0.8 * k, (0.05 + 0.1 * brk) * sa);
        ctx.beginPath();
        ctx.moveTo(xa, ya);
        ctx.lineTo(xb, yb);
        ctx.stroke();
        ctx.strokeStyle = css('#2d6a9c', 0.12 * fade);
        ctx.lineWidth = Math.max(0.8 * k, 0.12 * sa);
        ctx.beginPath();
        ctx.moveTo(xa - 0.25 * sa, ya);
        ctx.lineTo(xb - 0.25 * sa, yb);
        ctx.stroke();
      }
    }
    glints(ctx, 0, hz, W, (H - hz) * 0.6, t, { n: 90, seed: 5, size: 7 * k, sizeAt: (py) => 0.4 + 1.2 * (py - hz) / Math.max(1, H - hz), bias: 1.6, speed: 0.18, alpha: 0.95, alphaAt: (px) => 0.4 + 0.6 * Math.max(0, 1 - Math.abs(px / W - 0.3) * 1.5) });
    const hzg = ctx.createLinearGradient(0, hz - H * 0.03, 0, hz + H * 0.04);
    hzg.addColorStop(0, 'rgba(246,244,238,0)');
    hzg.addColorStop(0.45, 'rgba(246,244,238,0.6)');
    hzg.addColorStop(1, 'rgba(246,244,238,0)');
    ctx.fillStyle = hzg;
    ctx.fillRect(0, hz - H * 0.03, W, H * 0.07);
    // ---- dry sand texture: speckles, wind ripples, shells and pebbles
    const sandPath = new Path2D();
    const S0 = line((d) => Math.min(shore(d) - 0.05, wetEdge(d) + d * slope + meander(d)) + 0.6);
    sandPath.moveTo(-10, H + 20);
    sandPath.lineTo(S0[0][0], Math.max(S0[0][1], H + 20));
    S0.forEach(([x, y]) => sandPath.lineTo(x, y));
    sandPath.lineTo(-10, far);
    sandPath.closePath();
    ctx.save();
    ctx.clip(sandPath);
    for (let i = 0; i < 900; i++) {
      const d = -8 * dk + Math.pow(hash01(i * 5 + 1), 2.2) * 160 * dk;
      const [x, y, sc] = P(view.cam.x + (hash01(i * 9 + 2) - 0.5) * (W / Math.max(1e-3, view.scaleAt(view.pOf(d)))) * 1.3, d);
      if (y < hz || y > H + 4) continue;
      const r = Math.max(0.5 * k, (0.008 + 0.012 * hash01(i * 3)) * sc);
      ctx.fillStyle = hash01(i * 7) < 0.6 ? 'rgba(150,118,80,0.28)' : 'rgba(255,250,236,0.5)';
      ctx.fillRect(x, y, r * 2, r);
    }
    ctx.strokeStyle = 'rgba(160,125,85,0.2)';
    for (let i = 0; i < 70; i++) {
      const d = -30 * dk + Math.pow(hash01(i * 5), 1.8) * 200 * dk;
      const p = view.pOf(d), sc = view.scaleAt(p);
      const y = view.oy + (0 - view.cam.y) * sc;
      const x = W * hash01(i * 9) - W * 0.1;
      ctx.lineWidth = Math.max(k, 0.03 * sc);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sc * 1.5, y - sc * 0.06, x + sc * 3, y);
      ctx.quadraticCurveTo(x + sc * 4.5, y + sc * 0.05, x + sc * 6, y);
      ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const d = -4 * dk + Math.pow(hash01(i * 13 + 5), 1.5) * 60 * dk;
      const xw = (o.shellX ?? 0) + (hash01(i * 17) - 0.6) * 40 * dk;
      if (xw > shore(d) - 0.5) continue;
      const [x, y, sc] = P(xw, d);
      if (y > H + 10) continue;
      const r = (0.05 + 0.07 * hash01(i * 19)) * sc;
      const shell = hash01(i * 23) < 0.45;
      ctx.fillStyle = shell ? '#f3e6dc' : '#a39a90';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.5, (hash01(i * 29) - 0.5) * 0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = shell ? 'rgba(214,160,150,0.8)' : 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(x - r * 0.2, y - r * 0.15, r * 0.45, r * 0.18, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,95,70,0.25)';
      ctx.beginPath();
      ctx.ellipse(x + r * 0.2, y + r * 0.35, r * 0.9, r * 0.2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // the glossy strip at the water mirrors the cat (see the reflection layer)
    S.wetPath = band((d) => shore(d), (d) => lerp(shore(d), Math.min(shore(d) - 0.05, wetEdge(d) + d * slope + meander(d)), 0.6));
    S.wetTop = far;
    S.wetFrom = wetEdge(0); // the high-water mark at the stage
    // ---- footprints of the cat, washed away by the next wave that reaches them
    const cat = S.actors[0];
    if (cat && cat.perf) {
      for (const e of cat.perf.events) {
        if (e.type !== 'step' || e.t > t || e.x === undefined) continue;
        const near = e.leg && e.leg[1] === 'n';
        const d = near ? -0.14 : 0.14;
        const xw = e.x + (e.leg && e.leg[0] === 'h' ? -0.04 : 0.04);
        if (xw > shore(d) - 0.1) continue;
        const washed = waves.some((w) => w.t > e.t && t > w.t + w.dur * 0.25 && w.reach < xw);
        if (washed) continue;
        const age = t - e.t;
        const [x, y, sc] = P(xw, d);
        const wet = xw > wetEdge(d) + d * slope;
        ctx.fillStyle = css(wet ? '#8d7a62' : '#b89b73', (wet ? 0.5 : 0.42) * Math.min(1, age / 2));
        ctx.beginPath();
        ctx.ellipse(x, y, 0.075 * sc, 0.03 * sc, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = css('#fff6e6', 0.3 * Math.min(1, age / 2));
        ctx.beginPath();
        ctx.ellipse(x - 0.02 * sc, y - 0.012 * sc, 0.05 * sc, 0.012 * sc, 0, 0, TAU);
        ctx.fill();
      }
    }
    // ---- foam: broken lines of the incoming swash drifting landward, the
    // lacy front with small bubbles
    for (let kk = 0; kk < 9; kk++) {
      const ph = ((t * 0.012 + kk / 9) % 1);
      const offU = (1 - ph) * 7 + 0.25;
      const a = Math.sin(ph * Math.PI) * 0.7;
      for (let i = 0; i < ds.length - 1; i++) {
        const d = ds[i];
        if (d > 120 * dk) break;
        if (hash01(i * 7 + kk * 31 + Math.floor(t * 0.012 + kk / 9) * 3) < 0.45) continue;
        const wob = Math.sin(i * 0.7 + kk + t * 0.05) * 0.25;
        const xA = lerp(restShore(d) + 7, shore(d) + 0.25, ph), xB = lerp(restShore(ds[i + 1]) + 7, shore(ds[i + 1]) + 0.25, ph);
        const [xa, ya, sa] = P(xA + wob, d), [xb, yb] = P(xB + wob, ds[i + 1]);
        ctx.strokeStyle = css(BEACH.foam, a * (1 - 0.65 * smoothstep(140, 420, sa)));
        ctx.lineWidth = Math.max(0.8 * k, Math.min(4 * k, 0.045 * sa * (1.2 - ph * 0.6)));
        ctx.beginPath();
        ctx.moveTo(xa, ya);
        ctx.lineTo(xb, yb);
        ctx.stroke();
      }
    }
    const front = line((d) => shore(d) + Math.sin(d * 2.1 + t * 0.2) * 0.06);
    ctx.lineJoin = 'round';
    for (const [w, a, dx] of [[0.09, 0.95, 0], [0.04, 0.6, 0.22], [0.03, 0.45, 0.5]]) {
      ctx.strokeStyle = css(BEACH.foam, a);
      ctx.beginPath();
      let drawing = false;
      for (let i = 0; i < front.length; i++) {
        const [x, y, sc] = front[i];
        if (hash01(i * 3 + Math.round(dx * 10) + Math.floor(t / 8)) < (dx ? 0.35 : 0.04)) { drawing = false; continue; }
        const xx = x + dx * sc;
        if (drawing) ctx.lineTo(xx, y);
        else ctx.moveTo(xx, y);
        drawing = true;
      }
      ctx.lineWidth = Math.max(1.2 * k, w * view.scaleAt(1));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < front.length; i++) {
      const [x, y, sc] = front[i];
      if (y > H + 20) continue;
      for (let b = 0; b < 3; b++) {
        const r = Math.max(0.6 * k, sc * (0.01 + 0.018 * hash01(i * 3 + b + Math.floor(t / 6))));
        ctx.beginPath();
        ctx.arc(x + sc * (0.12 + 0.6 * hash01(i * 5 + b)), y + (hash01(i + b * 9) - 0.5) * sc * 0.06, r, 0, TAU);
        ctx.fill();
      }
    }
  }));
  if (o.dunes !== false) {
    S.layers.push(at(300, 0.2, (ctx, t, view, S2, p) => {
      const prof = profile({ base: 0, amp: 30, freq: 0.01, seed: 61 });
      const end = o.duneEnd ?? -60;
      const fall = (x) => 1 - smoothstep(end - 140, end, x);
      const dune = (x) => prof(x) * fall(x) - 6 * fall(x);
      const [x0, x1] = view.xRange(p, 0.15);
      let top = 0;
      for (let x = x0; x < x1; x += 10) top = Math.min(top, dune(x));
      const g = ctx.createLinearGradient(0, top, 0, 6);
      g.addColorStop(0, '#f1ddb8');
      g.addColorStop(0.5, BEACH.dune);
      g.addColorStop(1, '#c8ae86');
      fillBelow(ctx, view, p, dune, g, 6, 3);
      tufts(ctx, view, p, t, { ground: dune, spacing: 5, h: 4, width: 0.35, colors: BEACH.duneGrass, seed: 3, wind: windField({ base: 0.3, gust: 0.4, dir: 1 }), fill: 0.6 * 1, dy: 0.5 });
    }));
  }
  // the wet sand mirrors the cat standing on it (drawn just before the cat)
  S.layers.push(screenLayer(0.995, (ctx, t, W, H, view) => {
    const cat = S.actors[0] && S.actors[0].actor;
    if (!S.wetPath || !cat) return;
    const y0 = view.oy + (0 - view.cam.y) * view.scaleAt(view.pOf(0));
    if (y0 >= H) return;
    const B = scratchBuffer('beachRefl', W, H);
    const b = B.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.filter = 'none';
    b.clearRect(0, 0, W, H);
    b.translate(0, 2 * y0);
    b.scale(1, -1);
    const hipX = S.actors[0].perf.poseAt(t).hip[0];
    const onWet = smoothstep(S.wetFrom - 0.4, S.wetFrom + 0.6, hipX);
    if (onWet <= 0.01) return;
    const light = cat.opts.light ? cat.opts.light(t) : null;
    cat._draw(b, t, view.actorCam(1), { style: Object.assign({}, cat.opts.style || {}, light ? { light } : {}), noSmear: true });
    b.setTransform(1, 0, 0, 1, 0, 0);
    // fade with distance below the feet
    b.globalCompositeOperation = 'destination-in';
    const g = b.createLinearGradient(0, y0, 0, y0 + H * 0.22);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clip(S.wetPath);
    ctx.globalAlpha = onWet;
    ctx.filter = `blur(${(1.2 * W / 1920).toFixed(2)}px)`;
    ctx.drawImage(B, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
  }));
  S.layers.push(screenLayer(1.01, (ctx, t, W, H) => {
    if (!S.wetPath) return;
    ctx.save();
    ctx.clip(S.wetPath);
    glints(ctx, 0, S.wetTop, W, H - S.wetTop, t, { n: 30, seed: 41, size: 6 * W / 1920, speed: 0.2, alpha: 0.9 });
    ctx.restore();
  }));
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
    name: '9.1', dur: 156, unit: 20, anchor: [0.5, 0.6], xfade: 24, post: beachPost, grade: beachGrade,
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
    name: '9.2', dur: 204, unit: 60, anchor: [0.5, 0.62], post: beachPost, grade: beachGrade,
    cam: { x: -6, y: -2.4, z: 1 },
    setup(S) {
      beachWorld(S, { rest: 14 });
      S.layers.push(at(0, 0.8, (ctx, t, view, S2, p) => {
        // the dune face the cat walks down: it meets the beach at the stage line
        const g = ctx.createLinearGradient(0, -12, 0, 0.4);
        g.addColorStop(0, '#f0dcb6');
        g.addColorStop(0.7, BEACH.dune);
        g.addColorStop(1, '#cdb48c');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-40, 0.4);
        for (let x = -40; x <= 2; x += 0.5) ctx.lineTo(x, dune(x) + 0.02);
        ctx.quadraticCurveTo(4, 0.1, 6, 0.4);
        ctx.closePath();
        ctx.fill();
        // wind ripples on the dune face
        ctx.strokeStyle = 'rgba(170,135,95,0.25)';
        ctx.lineWidth = 0.05;
        for (let i = 0; i < 18; i++) {
          const x = -38 + i * 2.2;
          if (x > -7) break;
          const y = dune(x) + 0.6 + (i % 3) * 0.9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 0.8, y - 0.35, x + 1.6, y + 0.1);
          ctx.stroke();
        }
        tufts(ctx, view, p, t, { ground: (x) => (x < -8 ? dune(x) : 90), spacing: 2.2, h: 1.6, width: 0.12, colors: BEACH.duneGrass, seed: 13, wind: windField({ base: 0.3, gust: 0.4, dir: 1 }), fill: 0.7 });
      }));
      const cat = makeCat(S, { x: -18, facing: 1, ground: dune, ...catMorning });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 16, lead: 8, dx: 1.5, y: 0.7, dy: 0.2 });
      S.camera.key(0, { x: 0, y: -1.4 });
      P.t = 4;
      P.key(4, { sparkle: 0.8, blush: 0.25, smile: 0.3 }, 'inout');
      locomote(P, { gait: 'walk', dist: 20, accel: 10, decel: 16, surfaceAt: () => 'sand' });
      A.look(P, P.t, 10, { yaw: 0.25, pitch: 0.2 });
      P.emote(P.t + 4, 'notes', { dur: 40 });
    },
  });
}
function s9_3() {
  const waves = [{ t: 40, dur: 110, reach: 1.05 }, { t: 190, dur: 110, reach: 1.9 }];
  return shot({
    name: '9.3', dur: 312, unit: 130, anchor: [0.5, 0.6], post: beachPost, grade: beachGrade,
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
      P.key(tt + 3, { hip: [-1.3, -1.05], fn: [fn[0] - 0.6, -0.5], fnC: 1, ff: [fn[0] - 0.9, 0], eyeWide: 1, earRot: 0.5, earFlat: 0.2, fluff: 0.4, tailA: 1.0, tailC: 0.3, archB: 0.3, mouth: 0.35 }, 'out');
      P.emote(tt + 2, 'exclaim', { dur: 20 });
      P.event(tt + 1, 'splash', { x: fn[0], y: 0.1, strength: 0.25 });
      P.key(tt + 8, { fn: [fn[0] - 0.75, 0], fnC: 0 }, 'inout');
      P.setTiming(tt + 8, 2);
      // stares at the water: head tilt, sniff
      P.key(tt + 30, { hRoll: 0.35, hPitch: -0.4, lookY: -0.7, eyeWide: 0.4, earRot: -0.1, earFlat: 0, fluff: 0.1, tailA: 0.5, tailC: 0.8, mouth: 0 }, 'inout');
      P.emote(tt + 30, 'question', { dur: 40 });
      P.key(tt + 60, { hRoll: -0.1, neck: 0.3, neckLen: 1.2, hPitch: -0.55 }, 'inout');
      // then carefully reaches out a paw again as the second wave comes
      const t2 = 176;
      P.key(t2, { fn: [fn[0] - 0.4, -0.35], fnC: 0.8, neckLen: 1.1 }, 'inout');
      P.key(t2 + 16, { fn: [fn[0] + 0.3, -0.05], fnC: 0.2 }, 'inout');
      P.key(t2 + 26, { fn: [fn[0] + 0.35, 0.02], fnC: 0 }, 'in');
      P.event(t2 + 26, 'pat', { x: fn[0] + 0.35 });
      P.key(t2 + 40, { hRoll: 0.2, eyeWide: 0.2, neckLen: 1, sparkle: 0.9, blush: 0.35, smile: 0.4 }, 'inout');
      P.emote(t2 + 44, 'sparkle', { dur: 40, n: 4 });
      S.extraEvents = waves.map((w) => ({ t: w.t, type: 'wave_wash', dur: w.dur }));
    },
  });
}
function s9_4() {
  // waves: the cat chases the backwash, flees the run-up, then plays
  const waves = [{ t: 0, dur: 100, reach: -1 }, { t: 110, dur: 100, reach: -4 }, { t: 230, dur: 110, reach: -2 }];
  return shot({
    name: '9.4', dur: 396, unit: 70, anchor: [0.5, 0.6], post: beachPost, grade: beachGrade,
    cam: { x: 2, y: -1.6, z: 1 },
    setup(S) {
      beachWorld(S, { rest: 8, waves, slope: 0.3, dunes: false });
      const cat = makeCat(S, { x: -3, facing: 1, ...catMorning, waterColor: 'rgb(235,245,250)' });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 14, lead: 8, dx: 0, y: 0 });
      S.camera.key(0, { x: 2 });
      // chase the retreating water
      P.key(30, { sparkle: 0.6, smile: 0.6, mouth: 0.25, mouthW: 0.5, blush: 0.35 }, 'inout');
      P.t = 40;
      locomote(P, { gait: 'trot', to: 3, accel: 6, decel: 6, surfaceAt: () => 'sand' });
      // the next wave rushes in: turn and run (hop!)
      P.t = Math.max(P.t, 112);
      A.turnAround(P);
      P.emote(P.t - 4, 'exclaim', { dur: 16 });
      P.key(P.t, { eyeWide: 0.7, mouth: 0.45, mouthW: 0.3, smile: 0.4, sparkle: 0 }, 'out');
      P.setTiming(P.t, 1);
      locomote(P, { gait: 'run', to: -7, accel: 3, decel: 8 });
      P.setTiming(P.t, 2);
      A.jump(P, { dx: 2.2, dy: 0, h: 0.6, antic: 2, hold: 0, flight: 8 });
      // turn back and chase again, joyful
      P.t = Math.max(P.t, 200);
      P.key(P.t - 10, { eyeWide: 0, happy: 1, smile: 1, mouth: 0.35, mouthW: 0.7, blush: 0.5 }, 'inout');
      P.emote(P.t - 8, 'notes', { dur: 60 });
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
    name: '9.5', dur: 420, unit: 70, anchor: [0.5, 0.58], fadeOut: 72, post: beachPost, grade: beachGrade, dolly: true,
    cam: { x: 0, y: -2, z: 1 },
    setup(S) {
      // pull back: the lens widens until the cat is tiny; the height follows
      // the zoom so the shoreline (and the cat) stay in frame all the way
      S.camera.key(0, { y: 0 });
      S.camera.move(20, 400, { z: 0.06, x: 2 }, 'inout');
      S.camera.follow = (t, c) => [0, -1.15 / Math.max(0.05, c.z)];
      beachWorld(S, { rest: 9.5, waves, slope: 0.3, capeX: 2400, beachEnd: 5000 });
      const cat = makeCat(S, { x: -2, facing: 1, ...catMorning });
      const P = cat.perf;
      P.key(0, { happy: 0.6, smile: 0.9, mouth: 0.3, mouthW: 0.6, blush: 0.4 });
      P.emote(10, 'notes', { dur: 100 });
      P.t = 6;
      for (let k = 0; k < 4; k++) {
        // back and forth along the water's edge (locomote distances are absolute)
        locomote(P, { gait: 'trot', dist: (k % 2 ? -1 : 1) * (5 + k), accel: 5, decel: 5, surfaceAt: () => 'sand' });
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
        ctx.font = `${92 * u}px ${TITLE}`;
        ctx.fillText('去看海吧', W / 2, H * 0.42);
        ctx.font = `italic 500 ${38 * u}px ${ITALIC}`;
        ctx.fillStyle = '#b9ad9f';
        ctx.fillText('There is a bigger world', W / 2, H * 0.495);
        ctx.font = `${26 * u}px ${TITLE}`;
        ctx.fillStyle = '#8f8579';
        ctx.fillText('逐帧程序动画 · 每一帧画面都由代码绘制', W / 2, H * 0.62);
        ctx.fillText('原创配乐由程序合成 · 音效来自 Freesound 的 CC0 素材 · 详见 CREDITS', W / 2, H * 0.665);
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
