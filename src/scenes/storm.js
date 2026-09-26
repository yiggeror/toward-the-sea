// Sequence 3 — wind and storm on the open hills; shelter at a bus stop.
// Sequence 4 — the night at the bus stop.
import { shot } from '../film/shot.js';
import { makeCat, follow, ramp, screenLayer, layer, at, standingPose, sittingPose } from '../film/kit.js';
import { CardProp } from '../film/prop.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { skyGradient, glow, clouds, cloudShape, stars, moon, bands } from '../env/sky.js';
import { profile, fillBelow, groundPlane, groundEllipse } from '../env/terrain.js';
import { grass, tufts, windField, treeRow, tree } from '../env/nature.js';
import { rain, rainImpacts, windStreaks, bolt, flashAt, dust } from '../env/weather.js';
import { css, mix } from '../core/draw.js';
import { lampGlow, lightCone, lightPool, fogBand, wetReflection, particles, glints } from '../env/light.js';
import { hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';

const STORM = {
  sky: [[0, '#2c3342'], [0.45, '#4d5669'], [0.8, '#8a8d8a'], [1, '#c2b98f']],
  skyDark: [[0, '#151a26'], [0.5, '#2b3243'], [0.85, '#4a5160'], [1, '#6c6e6c']],
  hillFar: '#6a7682', hillMid: '#5b6a5c', hillNear: '#56674f',
  grass: ['#566a47', '#6b8058'], grassLight: ['#7a8f63', '#8ea173'],
  ground: ['#4f6145', '#6a7b5c'], mud: '#4a4a3e', puddle: '#6f7b8c',
  cloud: '#5e6678', cloudDark: '#474e5e',
  rain: '#c9d3e1',
};
const stormPost = { bloom: { threshold: 0.82, knee: 0.12, strength: 0.55, radius: 24, tint: '#dfe6ff' } };
const moonPost = { bloom: { threshold: 0.62, knee: 0.25, strength: 0.6, radius: 26, tint: '#e6ecff' } };
const catStorm = {
  light: () => ({ tint: '#a9b2c6', amt: 0.35, lift: '#15181e' }),
  rim: () => ({ color: '#e1e8ff', dir: [0.2, -0.98], alpha: 0.35, width: 0.05 }),
};
const headwind = (base = 1.1, gustAt = []) => (t) => {
  let g = 0;
  for (const [a, b] of gustAt) g = Math.max(g, smoothstep(a, a + 8, t) * (1 - smoothstep(b - 8, b, t)));
  return [-(base + 0.25 * Math.sin(t * 0.21) + 0.9 * g), 0.06];
};

// flash level of the strikes at time t (for lighting clouds and the scene)
function strikeLight(strikes, t) {
  let k = 0;
  for (const s of strikes || []) {
    const a = t - s.t;
    if (a < 0 || a > 6) continue;
    k = Math.max(k, (a < 1 ? 1 : a < 2 ? 0.35 : a < 3 ? 0.85 : a < 4 ? 0.3 : 0.12) * (s.amt ?? 1));
  }
  return k;
}
function stormSky(S, o = {}) {
  S.layers.push(screenLayer(0, (ctx, t, W, H) => {
    skyGradient(ctx, W, H, o.dark ? STORM.skyDark : STORM.sky);
    // a pale band of light low under the storm
    const g = ctx.createLinearGradient(0, H * 0.35, 0, H * 0.75);
    g.addColorStop(0, 'rgba(230,220,170,0)');
    g.addColorStop(0.7, css('#e8dcae', o.dark ? 0.12 : 0.28));
    g.addColorStop(1, 'rgba(230,220,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }));
  const cloudLayer = (seed, y, h, w, speed, top, shade, alpha, n) => (ctx, t, view, S2, p) => {
    const fl = strikeLight(o.strikes, t);
    clouds(ctx, view, p, t, { seed, n, y, dy: h * 0.6, w, h, speed, wrap: 120000, top: fl > 0.05 ? css(mix(top, '#dfe6ff', fl * 0.6)) : top, shade, rim: fl > 0.05 ? '#f4f6ff' : undefined, glow: fl > 0.05 ? '#cfd8ff' : undefined, light: [0.1, 1], alpha });
  };
  S.layers.push(Object.assign(at(25000, 0.03, cloudLayer(71, -5600, 3600, 30000, -(o.cloudSpeed ?? 18), '#5f677a', '#363c4b', 0.95, 5)), { blur: 3, group: 'sky' }));
  S.layers.push(Object.assign(at(25000, 0.031, cloudLayer(73, -3000, 2600, 26000, -(o.cloudSpeed ?? 18) * 1.3, '#4c5364', '#2b303d', 0.92, 5)), { blur: 3, group: 'sky' }));
  // distant rain curtains hanging from the cloud base
  S.layers.push(screenLayer(0.035, (ctx, t, W, H) => {
    const n = o.curtains ?? 4;
    for (let i = 0; i < n; i++) {
      const x = ((hash01(i * 7 + 3) * 1.4 - 0.2 + t * 0.0006 * (1 + i * 0.3)) % 1.4) * W;
      const w = W * (0.12 + 0.12 * hash01(i * 5 + 1));
      const g = ctx.createLinearGradient(0, H * 0.25, 0, H * 0.7);
      g.addColorStop(0, css('#8a93a8', 0));
      g.addColorStop(0.3, css('#8a93a8', 0.28));
      g.addColorStop(1, css('#8a93a8', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, H * 0.25);
      ctx.lineTo(x + w, H * 0.25);
      ctx.lineTo(x + w * 0.8 - W * 0.05, H * 0.72);
      ctx.lineTo(x - W * 0.05, H * 0.72);
      ctx.fill();
    }
  }));
  if (o.strikes) {
    S.layers.push(screenLayer(0.04, (ctx, t, W, H) => {
      for (const s of o.strikes) {
        const a = t - s.t;
        if (a < 0 || a > 5) continue;
        const k = a < 1 ? 1 : a < 2 ? 0.3 : a < 3 ? 0.9 : 0.4;
        // the cloud lights up around the bolt
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        lampGlow(ctx, W * s.x, H * 0.15, W * 0.35, '#b9c6ff', 0.45 * k, 0.05);
        ctx.restore();
        bolt(ctx, W * s.x, -10, H * (s.y ?? 0.35), 101 + s.t, k * (s.amt ?? 1), W);
      }
    }));
  }
}
function hills(S, o = {}) {
  const far = profile({ base: 0, amp: 300, freq: 0.0009, seed: 31 });
  const mid = profile({ base: 0, amp: 60, freq: 0.004, seed: 33 });
  const wind = o.wind || windField({ base: -0.3, gust: -0.9, speed: 0.3, wave: 0.05, dir: -1 });
  S.layers.push(Object.assign(at(5000, 0.05, (ctx, t, view, S2, p) => fillBelow(ctx, view, p, far, STORM.hillFar, 9000, 40)), { haze: { color: '#8f98a6', amount: 0.35 }, blur: 1.5 }));
  S.layers.push(at(900, 0.1, (ctx, t, view, S2, p) => {
    fillBelow(ctx, view, p, mid, STORM.hillMid, 3000, 8);
    if (o.trees !== false) treeRow(ctx, view, p, t, { seed: 5, spacing: 120, h: 110, w: 70, ground: mid, trunk: '#4d5a4f', dark: '#4f5f52', mid: '#5b6c5c', light: null, fill: 0.35, wind: (x, tt) => wind(x, tt) * 0.4 });
  }));
  S.layers.push(screenLayer(0.12, (ctx, t, W, H, view) => groundPlane(ctx, view, { y: 0, bands: [[-500, 900, STORM.ground]] })));
  S.layers.push(at(120, 0.14, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: () => 0, density: 1.2, h: 5, width: 0.7, colors: STORM.grass, seed: 7, wind })));
  S.layers.push(at(25, 0.2, (ctx, t, view, S2, p) => grass(ctx, view, p, t, { ground: () => 0, density: 4, h: 2.6, width: 0.24, colors: [...STORM.grass, STORM.grassLight[1]], seed: 9, wind })));
  // silvery sheen where gusts flatten the grass, racing across the field
  S.layers.push(screenLayer(0.21, (ctx, t, W, H, view) => {
    const y0 = view.oy + (0 - view.cam.y) * view.scaleAt(view.pOf(900));
    const y1 = H;
    if (y0 >= y1) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      const u = ((t * 0.006 * (1 + i * 0.4) + hash01(i * 3)) % 1.6) - 0.3;
      const x = W * (1 - u);
      const w = W * (0.18 + 0.1 * i);
      const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, 'rgba(200,215,190,0)');
      g.addColorStop(0.5, css('#c9d6bc', 0.16));
      g.addColorStop(1, 'rgba(200,215,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - w, y0, 2 * w, y1 - y0);
    }
    ctx.restore();
  }));
  S.layers.push(at(6, 0.3, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: () => 0, spacing: 1.4, h: 1.7, width: 0.12, colors: STORM.grassLight, seed: 11, wind, fill: 0.8 })));
  return wind;
}
function stormFront(S, o = {}) {
  const wind = o.wind;
  S.layers.push(at(-8, 2, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: () => 0.8, spacing: 2.6, h: 2.8, width: 0.2, colors: ['#3e5134', '#48593b'], seed: o.seed ?? 13, wind, fill: 0.55 })));
}

// ---- 3.1 wide: the hills, wind rising ------------------------------------
function s3_1() {
  return shot({
    name: '3.1', dur: 204, unit: 26, anchor: [0.5, 0.66], xfade: 12,
    post: stormPost, grade: { vignette: 0.35, vignetteColor: '#2a2e38', grain: 0.4, tint: '#c3c9d6', tintAmt: 0.12 },
    cam: { x: -6, y: -5, z: 1 },
    setup(S) {
      S.camera.move(0, 204, { x: 8 }, 'linear');
      stormSky(S, { cloudSpeed: 14 });
      const wind = hills(S);
      const env = headwind(0.8);
      const cat = makeCat(S, { x: -24, facing: 1, carry: { wear: 0.1 }, wind: env, ...catStorm });
      const P = cat.perf;
      P.t = 2;
      locomote(P, { gait: 'walk', dist: 28, accel: 6, pose: { earRot: 0.4, earFlat: 0.2 } });
      stormFront(S, { wind, seed: 17 });
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => windStreaks(ctx, W, H, t, { n: 10, seed: 3, alpha: 0.25, dir: -1 })));
      S.extraEvents = [{ t: 0, type: 'amb', name: 'wind_hills' }];
    },
  });
}

// ---- 3.2 into the wind: one step at a time -------------------------------
function s3_2() {
  const gust = [[120, 196]];
  return shot({
    name: '3.2', dur: 300, unit: 104, anchor: [0.5, 0.62],
    post: stormPost, grade: { vignette: 0.4, vignetteColor: '#2a2e38', grain: 0.45, tint: '#c3c9d6', tintAmt: 0.14 },
    cam: { x: 1, y: -1.3, z: 1 },
    setup(S) {
      stormSky(S, { cloudSpeed: 22 });
      const env = headwind(1.15, gust);
      const wind = hills(S, { wind: (x, t) => -0.4 - 0.9 * Math.max(0, Math.sin(x * 0.06 + t * 0.3)) - 0.8 * (env(t)[0] < -1.6 ? 1 : 0) });
      const cat = makeCat(S, { x: -4.5, facing: 1, carry: { wear: 0.12 }, wind: env, ...catStorm });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 16, lead: 8, dx: 0.8 });
      S.camera.key(0, { x: 0 });
      P.t = 2;
      locomote(P, { gait: 'wind', dist: 3.4, accel: 8, decel: 8 });
      // brace against the gust: crouch, claws in, eyes squeezed
      const tb = Math.max(P.t, gust[0][0] - 4);
      P.holdAll(tb);
      P.key(tb + 6, { hip: [P.curPose().hip[0] - 0.05, -0.62], pitch: -0.18, archB: -0.15, archF: -0.1, neck: 0.05, hPitch: -0.35, squeeze: 1, wobble: 0.8, earFlat: 1, earRot: 1, fluff: 0.5, tailA: -0.4, fnC: 0.2, ffC: 0.2, whisk: -1 }, 'out');
      P.key(tb + 40, { hip: [P.curPose().hip[0] - 0.1, -0.6] }, 'inout');
      P.key(gust[0][1] - 4, {}, 'hold');
      P.key(gust[0][1] + 6, { hip: [P.curPose().hip[0], -0.7], squeeze: 0, wobble: 0, lid: 0.3, lidTilt: 0.6, eye: 1, fluff: 0.25, whisk: -0.4 }, 'inout'); // grits on, determined
      P.t = gust[0][1] + 8;
      locomote(P, { gait: 'wind', dist: 3.2, accel: 8 });
      S.layers.push(screenLayer(2.4, (ctx, t, W, H) => {
        const g = env(t)[0] < -1.6 ? 1 : 0.4;
        windStreaks(ctx, W, H, t, { n: Math.round(12 + 14 * g), seed: 5, alpha: 0.3, dir: -1 });
        dust(ctx, W, H, t, { n: Math.round(20 + 60 * g), y0: 0.55, y1: 0.95, speed: -18, color: '#a9a58e', alpha: 0.35, seed: 3, dir: -1 });
      }));
      stormFront(S, { wind, seed: 19 });
      S.extraEvents = [{ t: gust[0][0], type: 'gust_big' }];
    },
  });
}

// ---- 3.3 the first drop --------------------------------------------------
function s3_3() {
  return shot({
    name: '3.3', dur: 132, unit: 120, anchor: [0.5, 0.6],
    post: stormPost, grade: { vignette: 0.42, vignetteColor: '#262a33', grain: 0.45, tint: '#b9c0ce', tintAmt: 0.18 },
    cam: { x: 1.4, y: -1.4, z: 1 },
    setup(S) {
      stormSky(S, { cloudSpeed: 20, dark: true });
      const env = headwind(0.9);
      const wind = hills(S, { trees: false });
      const cat = makeCat(S, { x: 0, facing: 1, carry: { wear: 0.14 }, wind: env, ...catStorm, pose: { earRot: 0.5, earFlat: 0.3 } });
      const P = cat.perf;
      const td = 18;
      P.key(td, { eye: 1 }, 'hold');
      P.key(td + 2, { squeeze: 1, hPitch: -0.1, earFlat: 0.5 }, 'out');
      P.emote(td + 1, 'surprise', { dur: 12 });
      P.key(td + 7, { squeeze: 0, eye: 1 }, 'in');
      P.key(td + 16, { hPitch: 0.65, neck: 0.8, lookY: 0.8, hYaw: 0.5, eyeWide: 0.35, sad: 0.5 }, 'inout');
      P.emote(td + 24, 'sweat', { dur: 36 });
      P.key(td + 50, {}, 'hold');
      A.blink(P, td + 56, 4);
      P.key(td + 70, { hPitch: 0.3, neck: 0.62, lookY: 0.2, earFlat: 0.6, earRot: 0.8 }, 'inout');
      S.extraEvents = [{ t: td, type: 'drop_nose' }, { t: 40, type: 'rain_start' }];
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => {
        const d = ramp(t, [[30, 0], [120, 0.9]]);
        if (d > 0.01) rain(ctx, W, H, t, { density: d, angle: -0.25, speed: 0.1, color: STORM.rain, alpha: 0.45, seed: 3 });
      }));
      // the single drop that hits the nose
      S.layers.push(at(0, 1.3, (ctx, t) => {
        const a = t - (td - 8);
        if (a < 0 || a > 8) return;
        const nose = P.poseAt(td, true);
        const x = nose.hip[0] + 2.1, y = -2.4 - 5 + (a * a * 5) / 64;
        ctx.fillStyle = 'rgba(220,230,245,0.9)';
        ctx.beginPath();
        ctx.ellipse(x, y, 0.05, 0.14, 0, 0, TAU);
        ctx.fill();
      }));
      stormFront(S, { wind, seed: 23 });
    },
  });
}

// ---- 3.4 running through the downpour -------------------------------------
const PUDDLES = [[6, 9], [15, 18.5], [27, 30], [38, 41]];
const inPuddle = (x) => PUDDLES.some(([a, b]) => x >= a && x <= b);
function s3_4() {
  const strikes = [{ t: 70, x: 0.72, y: 0.4, amt: 0.8 }, { t: 210, x: 0.25, y: 0.35, amt: 0.7 }];
  return shot({
    name: '3.4', dur: 300, unit: 74, anchor: [0.46, 0.64],
    post: stormPost, grade: (t) => ({ vignette: 0.45, vignetteColor: '#1d2129', grain: 0.5, tint: '#aab2c2', tintAmt: 0.22, flash: flashAt(t, strikes) * 0.55 }),
    cam: { x: 0, y: -1.1, z: 1 },
    setup(S) {
      stormSky(S, { cloudSpeed: 26, dark: true, strikes });
      const wind = hills(S, { trees: false });
      S.layers.push(screenLayer(0.5, (ctx, t, W, H, view) => {
        for (const [a, b] of PUDDLES) {
          const e = groundEllipse(ctx, view, (a + b) / 2, 1.2, (b - a) / 2 + 0.4, 1.2, STORM.puddle);
          ctx.fillStyle = 'rgba(210,220,235,0.18)';
          ctx.fillRect(e.X - e.rx * 0.6, e.Y - e.ry * 0.2, e.rx * 0.8, Math.max(1, e.ry * 0.2));
        }
      }));
      S.layers.push(at(0, 0.6, (ctx, t, view, S2, p) => rainImpacts(ctx, view, p, t, { ground: () => 0.3, rate: 0.3, puddle: inPuddle, seed: 3, spread: 1.2 })));
      const cat = makeCat(S, { x: -4, facing: 1, carry: { wear: 0.25 }, wind: headwind(0.6), ...catStorm, waterColor: 'rgb(210,222,238)' });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 8, lead: 12, dx: 2.4 });
      P.setTiming(0, 1);
      P.t = 2;
      locomote(P, { gait: 'run', dist: 52, accel: 10, surfaceAt: (x) => (inPuddle(x) ? 'water' : 'mud'), pose: { earFlat: 0.5, earRot: 0.7, eye: 0.7 } });
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => rain(ctx, W, H, t, { density: 1.3, angle: -0.3, speed: 0.12, color: STORM.rain, alpha: 0.5, seed: 5 })));
      stormFront(S, { wind, seed: 29 });
      S.extraEvents = strikes.map((s) => ({ t: s.t, type: 'thunder_far', amt: s.amt }));
    },
  });
}

// ---- 3.5 thunder crack: startle ------------------------------------------
function s3_5() {
  const strikes = [{ t: 22, x: 0.6, y: 0.55, amt: 1 }];
  return shot({
    name: '3.5', dur: 108, unit: 100, anchor: [0.5, 0.6],
    post: stormPost, grade: (t) => ({ vignette: 0.45, vignetteColor: '#1d2129', grain: 0.5, tint: '#aab2c2', tintAmt: 0.22, flash: flashAt(t, strikes) * 0.85 }),
    cam: { x: 0.8, y: -1.4, z: 1 },
    setup(S) {
      stormSky(S, { cloudSpeed: 26, dark: true, strikes });
      const wind = hills(S, { trees: false });
      const cat = makeCat(S, { x: -6, facing: 1, carry: { wear: 0.28 }, wind: headwind(0.6), ...catStorm });
      const P = cat.perf;
      P.setTiming(0, 1);
      P.t = 0;
      locomote(P, { gait: 'trot', to: -0.2, accel: 1, decel: 6 });
      P.t = Math.max(P.t, 22);
      A.startle(P);
      P.setTiming(P.t, 1);
      locomote(P, { gait: 'run', dist: 14, accel: 4 });
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => rain(ctx, W, H, t, { density: 1.2, angle: -0.3, speed: 0.12, color: STORM.rain, alpha: 0.5, seed: 7 })));
      S.camera.key(0, { shake: 0 });
      S.camera.key(22, { shake: 0 }, 'linear');
      S.camera.key(24, { shake: 3 }, 'linear');
      S.camera.key(40, { shake: 0 }, 'out');
      stormFront(S, { wind, seed: 31 });
      S.extraEvents = [{ t: 22, type: 'thunder_crack' }];
    },
  });
}

// ---- the bus stop -----------------------------------------------------------
export const SHELTER = { x0: -10, x1: 10, roof: -24, bench: -3.9, benchX0: -7.5, benchX1: 7.5 };
function shelterGround(x) {
  return x >= SHELTER.benchX0 && x <= SHELTER.benchX1 ? SHELTER.bench : 0;
}
function shelterBack(ctx, P, lampOn = 0) {
  // back wall (inside), bench, side walls — drawn behind the cat
  const { x0, x1, roof, bench, benchX0, benchX1 } = SHELTER;
  ctx.fillStyle = P.wall;
  ctx.fillRect(x0, roof, x1 - x0, -roof);
  // corrugated panels
  ctx.fillStyle = P.wallShade;
  for (let x = x0; x < x1; x += 1.2) ctx.fillRect(x, roof, 0.45, -roof);
  // rust streaks and a damp lower edge
  for (let i = 0; i < 9; i++) {
    const x = x0 + 1 + hash01(i * 7) * (x1 - x0 - 2);
    const g = ctx.createLinearGradient(0, roof + 1, 0, roof + 6 + 8 * hash01(i));
    g.addColorStop(0, css('#8a5a3c', 0.35));
    g.addColorStop(1, css('#8a5a3c', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x, roof + 1, 0.25 + 0.3 * hash01(i + 3), 6 + 8 * hash01(i));
  }
  const dmp = ctx.createLinearGradient(0, -4, 0, 0);
  dmp.addColorStop(0, css('#1c2029', 0));
  dmp.addColorStop(1, css('#1c2029', 0.35));
  ctx.fillStyle = dmp;
  ctx.fillRect(x0, -4, x1 - x0, 4);
  ctx.fillStyle = P.wallShade;
  ctx.fillRect(x0, roof, x1 - x0, 3);
  // old timetable / poster
  ctx.fillStyle = P.poster;
  ctx.fillRect(-3.5, -16, 5, 6.5);
  ctx.fillStyle = P.posterInk;
  for (let i = 0; i < 5; i++) ctx.fillRect(-3, -15 + i * 1.1, 3.5 - (i % 2) * 1.2, 0.35);
  // bench
  ctx.fillStyle = P.bench;
  ctx.fillRect(benchX0, bench, benchX1 - benchX0, 0.7);
  ctx.fillStyle = P.benchShade;
  ctx.fillRect(benchX0, bench + 0.7, benchX1 - benchX0, 0.25);
  ctx.fillRect(benchX0 + 0.8, bench + 0.9, 0.5, -bench - 0.9);
  ctx.fillRect(benchX1 - 1.3, bench + 0.9, 0.5, -bench - 0.9);
  // floor slab
  ctx.fillStyle = P.floor;
  ctx.fillRect(x0 - 1, 0, x1 - x0 + 2, 0.6);
  // a small tube lamp under the roof
  const lx = (x0 + x1) / 2 + 2, ly = roof + 3.4;
  ctx.fillStyle = '#2a2d36';
  ctx.fillRect(lx - 2.4, ly - 0.35, 4.8, 0.4);
  if (lampOn > 0.01) {
    ctx.fillStyle = css('#fff1cf', lampOn);
    ctx.fillRect(lx - 2.1, ly + 0.02, 4.2, 0.28);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    lampGlow(ctx, lx, ly + 0.2, 6, '#ffd9a0', 0.8 * lampOn, 0.06);
    lightCone(ctx, lx, ly + 0.3, 4.2, 22, 0.4, '#ffd9a0', 0.16 * lampOn);
    lightPool(ctx, lx - 1, bench + 0.2, 10, 1.2, '#ffcf90', 0.35 * lampOn);
    lightPool(ctx, lx, 0.2, 13, 1.5, '#ffcf90', 0.3 * lampOn);
    ctx.restore();
  }
}
function shelterFront(ctx, P, t, rainAmt) {
  const { x0, x1, roof } = SHELTER;
  // posts + roof (corrugated edge)
  ctx.fillStyle = P.post;
  ctx.fillRect(x0 - 0.6, roof, 0.7, -roof);
  ctx.fillRect(x1 - 0.1, roof, 0.7, -roof);
  ctx.fillStyle = P.roof;
  ctx.beginPath();
  ctx.moveTo(x0 - 3, roof - 0.3);
  ctx.lineTo(x1 + 3, roof - 1.4);
  ctx.lineTo(x1 + 3, roof + 0.3);
  ctx.lineTo(x0 - 3, roof + 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = P.roofEdge;
  for (let x = x0 - 3; x < x1 + 3; x += 0.8) ctx.fillRect(x, roof + 1.2 - ((x - x0 + 3) / (x1 - x0 + 6)) * 1.1, 0.4, 0.3);
  // sign pole outside
  ctx.fillStyle = P.post;
  ctx.fillRect(x1 + 5, -26, 0.4, 26);
  ctx.fillStyle = P.sign;
  ctx.beginPath();
  ctx.arc(x1 + 5.2, -27, 1.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = P.signInk;
  ctx.fillRect(x1 + 4.3, -27.3, 1.8, 0.6);
  // curtain of drips from the roof edge
  if (rainAmt > 0) {
    ctx.strokeStyle = css('#cfd8e6', 0.55 * rainAmt);
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const x = x0 - 2.5 + (i / 60) * (x1 - x0 + 5);
      const yEdge = roof + 1.2 - ((x - x0 + 3) / (x1 - x0 + 6)) * 1.1;
      const ph = hash01(i * 7) * 30;
      const y = yEdge + ((t * 2.2 + ph * 3) % 26);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 1.6);
    }
    ctx.stroke();
  }
}
const SHELTER_DAY = { wall: '#6d7380', wallShade: '#5b606c', poster: '#c9c3b2', posterInk: '#7a7466', bench: '#8a7560', benchShade: '#6b5a49', floor: '#6f7079', post: '#4d525d', roof: '#5f6572', roofEdge: '#4a4f5a', sign: '#3e6fa3', signInk: '#f2f2f2' };
const SHELTER_NIGHT = { wall: '#2c3242', wallShade: '#23283a', poster: '#4b4a50', posterInk: '#3a3940', bench: '#3d3634', benchShade: '#2e2927', floor: '#2a2e3a', post: '#1c202b', roof: '#262b38', roofEdge: '#1b1f29', sign: '#24344c', signInk: '#8a93a6' };

function s3_6() {
  return shot({
    name: '3.6', dur: 232, unit: 36, anchor: [0.5, 0.64],
    post: stormPost, grade: { vignette: 0.45, vignetteColor: '#1d2129', grain: 0.5, tint: '#aab2c2', tintAmt: 0.22 },
    cam: { x: 7, y: -9.4, z: 1 }, // the ground stays in frame while the cat runs in
    setup(S) {
      stormSky(S, { cloudSpeed: 20, dark: true });
      const wind = hills(S, { trees: true });
      S.layers.push(at(0, 0.9, (ctx) => shelterBack(ctx, SHELTER_DAY, 0.9)));
      let tRel = 1e9;
      const card = new CardProp({ x: 2.2, y: SHELTER.bench, sx: 1, sy: 0.34, skew: -0.3, vis: 0 });
      const cat = makeCat(S, { x: 26, facing: -1, ground: shelterGround, carry: { wear: 0.33, on: (t) => t < tRel }, wind: headwind(0.3), ...catStorm });
      const P = cat.perf;
      P.setTiming(0, 1);
      P.t = 0;
      locomote(P, { gait: 'run', to: 10.5, accel: 1, decel: 10 });
      P.setTiming(P.t, 2);
      A.wait(P, 4);
      A.shake(P);
      P.key(P.t + 2, { lid: 0.3, sad: 0.3, smile: -0.2 }, 'inout'); // phew
      P.emote(P.t + 2, 'sweat', { dur: 28 });
      A.wait(P, 6);
      A.jump(P, { dx: 5.4, dy: SHELTER.bench, h: 0.5, antic: 5, hold: 1, flight: 10 });
      tRel = A.putDown(P);
      card.key(tRel - 1, { vis: 0 }, 'step');
      card.key(tRel, { vis: 1, x: P.poseAt(tRel).hip[0] - 1.9 }, 'step');
      A.sit(P);
      S.layers.push(at(0, 0.95, (ctx, t) => card.draw(ctx, t, { wear: 0.35 })));
      S.layers.push(at(0, 1.2, (ctx, t) => shelterFront(ctx, SHELTER_DAY, t, 1)));
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => rain(ctx, W, H, t, { density: 1.1, angle: -0.25, speed: 0.12, color: STORM.rain, alpha: 0.45, seed: 9 })));
      stormFront(S, { wind, seed: 37 });
      S.extraEvents = [{ t: 0, type: 'amb', name: 'rain_shelter' }];
    },
  });
}

// ---- 3.7 watching the rain from inside ------------------------------------
function s3_7() {
  const strikes = [{ t: 96, x: 0.8, y: 0.3, amt: 0.5 }];
  return shot({
    name: '3.7', dur: 156, unit: 92, anchor: [0.5, 0.6],
    post: stormPost, grade: (t) => ({ vignette: 0.5, vignetteColor: '#1a1d26', grain: 0.5, tint: '#a1a9ba', tintAmt: 0.28, flash: flashAt(t, strikes) * 0.35 }),
    cam: { x: 1.5, y: -5.2, z: 1 },
    setup(S) {
      stormSky(S, { cloudSpeed: 16, dark: true, strikes });
      hills(S, { trees: true });
      S.layers.push(at(0, 0.9, (ctx) => shelterBack(ctx, SHELTER_DAY, 0.9)));
      const card = new CardProp({ x: -0.4, y: SHELTER.bench, sx: 1, sy: 0.34, skew: -0.3 });
      S.layers.push(at(0, 0.95, (ctx, t) => card.draw(ctx, t, { wear: 0.35 })));
      const gnd = shelterGround;
      const cat = makeCat(S, { ground: gnd, pose0: sittingPose(1.6, -1, gnd, { hYaw: 0.4, hPitch: 0.15 }), ...catStorm });
      const P = cat.perf;
      // watching the rain (facing out = toward -x here), ears twitch at the thunder
      P.key(20, { sad: 0.45, lid: 0.15, whiskDroop: 0.3 }, 'inout');
      A.blink(P, 30, 6);
      A.earTwitch(P, 98, 'R', 0.6);
      P.key(100, { eyeWide: 0.4, sad: 0.2 }, 'out');
      P.key(116, { eyeWide: 0 }, 'inout');
      P.key(130, { hYaw: 0.9, hPitch: -0.2, lookY: -0.4, sad: 0.7, tear: 0.3 }, 'inout'); // glances at the wet card
      S.layers.push(at(0, 1.2, (ctx, t) => shelterFront(ctx, SHELTER_DAY, t, 1)));
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => rain(ctx, W, H, t, { density: 0.9, angle: -0.2, speed: 0.12, color: STORM.rain, alpha: 0.35, seed: 11 })));
      S.extraEvents = [{ t: 96, type: 'thunder_far', amt: 0.5 }];
    },
  });
}

// =============================== 4. NIGHT ===================================
const NIGHTS = {
  sky: [[0, '#050a1c'], [0.5, '#101d44'], [0.85, '#1f2c58'], [1, '#2e3a66']],
};
const catMoon = {
  light: () => ({ tint: '#7c87b2', amt: 0.5, lift: '#12162a' }),
  rim: () => ({ color: '#cfdcff', dir: [-0.6, -0.8], alpha: 0.55, width: 0.05 }),
};
function nightSky(S, o = {}) {
  S.layers.push(screenLayer(0, (ctx, t, W, H) => {
    skyGradient(ctx, W, H, NIGHTS.sky);
    stars(ctx, W, H, o.stars ?? 120, 17, 0.7, t, o.starAlpha ?? 0.8);
  }));
  if (o.moon) S.layers.push(screenLayer(0.01, (ctx, t, W, H) => moon(ctx, W * o.moon[0], H * o.moon[1], W * 0.018, '#f3f0de', 0)));
  // night clouds lit from above by the moon: silver edges
  S.layers.push(Object.assign(at(25000, 0.03, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, { seed: 91, n: 5, y: -5200, dy: 1600, w: 22000, h: 2400, speed: -4, wrap: 120000, top: '#39415e', shade: '#1c2236', rim: '#8d9ac2', light: [-0.3, -1], alpha: 0.9 })), { blur: 3 }));
  const far = profile({ base: 0, amp: 300, freq: 0.0009, seed: 31 });
  S.layers.push(at(5000, 0.05, (ctx, t, view, S2, p) => fillBelow(ctx, view, p, far, '#1b2233', 9000, 40)));
  S.layers.push(screenLayer(0.12, (ctx, t, W, H, view) => groundPlane(ctx, view, { y: 0, bands: [[-500, 900, ['#151a24', '#1d2330']]] })));
}
function s4_1() {
  return shot({
    name: '4.1', dur: 252, unit: 110, anchor: [0.5, 0.58], xfade: 36,
    post: moonPost, grade: { vignette: 0.55, vignetteColor: '#0d1020', grain: 0.5 },
    cam: { x: 0.8, y: -5.4, z: 1 },
    setup(S) {
      nightSky(S, { stars: 40, starAlpha: 0.3 });
      S.layers.push(at(0, 0.9, (ctx, t) => shelterBack(ctx, SHELTER_NIGHT, t < 150 ? 0.55 * (hash01(Math.floor(t / 3) * 7) > 0.08 ? 1 : 0.2) : t < 168 ? (hash01(Math.floor(t / 2) * 13) > 0.5 ? 0.5 : 0) : 0)));
      const card = new CardProp({ x: -0.4, y: SHELTER.bench, sx: 1, sy: 0.34, skew: -0.3 });
      S.layers.push(at(0, 0.95, (ctx, t) => card.draw(ctx, t, { wear: 0.45 })));
      const gnd = shelterGround;
      const cat = makeCat(S, { ground: gnd, pose0: sittingPose(1.6, -1, gnd, { hYaw: 0.6, hPitch: -0.25, lookY: -0.5, eye: 0.75, earRot: 0.3 }), ...catMoon });
      const P = cat.perf;
      A.blink(P, 24, 8);
      P.key(40, { hYaw: 0.9, hPitch: -0.45, lookY: -0.7, sad: 0.5, tear: 0.35 }, 'inout'); // looks at the card
      P.key(70, { smile: 0.35, sad: 0.3, blush: 0.25 }, 'inout'); // still wants to go
      P.key(90, {}, 'hold');
      A.blink(P, 96, 10);
      P.key(112, { tear: 0, sad: 0.1, smile: 0.3, blush: 0.15 }, 'inout');
      P.t = 118;
      A.curlSleep(P);
      const t0 = P.t;
      P.emote(t0 + 20, 'zzz', { dur: 200 });
      A.wait(P, 100);
      P.overlays.push(A.breathing(t0, t0 + 400, 64));
      S.layers.push(at(0, 1.2, (ctx, t) => shelterFront(ctx, SHELTER_NIGHT, t, 0.35)));
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => rain(ctx, W, H, t, { density: 0.35, angle: -0.1, speed: 0.1, color: '#8d98b6', alpha: 0.3, seed: 13 })));
      S.extraEvents = [{ t: 0, type: 'amb', name: 'night_shelter' }];
    },
  });
}
function s4_2() {
  return shot({
    name: '4.2', dur: 348, unit: 170, anchor: [0.5, 0.56],
    post: moonPost, grade: { vignette: 0.6, vignetteColor: '#0b0e1c', grain: 0.5 },
    cam: { x: 0.2, y: -4.6, z: 1 },
    setup(S) {
      nightSky(S, { stars: 20, starAlpha: 0.2 });
      S.layers.push(at(0, 0.9, (ctx) => shelterBack(ctx, SHELTER_NIGHT)));
      const card = new CardProp({ x: -0.4, y: SHELTER.bench, sx: 1, sy: 0.34, skew: -0.3 });
      S.layers.push(at(0, 0.95, (ctx, t) => card.draw(ctx, t, { wear: 0.45 })));
      const gnd = shelterGround;
      // start already curled up: compute the curled pose on a scratch performance
      const tmp = makeCat({ actors: [], layers: [] }, { ground: gnd, pose0: sittingPose(1.6, -1, gnd), layer: false });
      A.curlSleep(tmp.perf);
      const endPose = tmp.perf.curPose();
      const c2 = makeCat(S, { ground: gnd, pose0: Object.assign({}, endPose), ...catMoon });
      const Q = c2.perf;
      Q.overlays.push(A.breathing(0, 400, 66));
      Q.emote(0, 'zzz', { dur: 110 });
      Q.emote(230, 'zzz', { dur: 118 });
      // truck passes: ear turns toward it, tail tip twitch, relaxes
      A.earTwitch(Q, 120, 'L', 0.7);
      Q.key(126, { earRot: 0.55 }, 'out');
      Q.key(170, { earRot: 0.3 }, 'inout');
      Q.key(200, { tailK: 1.3 }, 'out');
      Q.key(214, { tailK: endPose.tailK }, 'inout');
      A.earTwitch(Q, 260, 'R', 0.35);
      // headlight sweep across the back wall (moving light band)
      S.layers.push(at(0, 0.92, (ctx, t) => {
        const a = (t - 100) / 90;
        if (a < 0 || a > 1) return;
        const x = lerp(12, -14, a);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const g = ctx.createLinearGradient(x - 4, 0, x + 4, 0);
        g.addColorStop(0, 'rgba(255,230,180,0)');
        g.addColorStop(0.5, css('#ffe6b4', 0.35 * Math.sin(a * Math.PI)));
        g.addColorStop(1, 'rgba(255,230,180,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 4, SHELTER.roof, 8, -SHELTER.roof);
        ctx.restore();
      }));
      S.layers.push(at(0, 1.2, (ctx, t) => shelterFront(ctx, SHELTER_NIGHT, t, 0.2)));
      S.extraEvents = [{ t: 90, type: 'truck_pass', dur: 110 }, { t: 240, type: 'owl' }];
    },
  });
}
function s4_3() {
  return shot({
    name: '4.3', dur: 228, unit: 80, anchor: [0.5, 0.6],
    post: moonPost, grade: (t) => ({ vignette: 0.5, vignetteColor: '#0d1020', grain: 0.45, lift: '#1a2238', liftAmt: ramp(t, [[40, 0], [180, 0.35]]) }),
    cam: { x: 1, y: -6, z: 1 },
    setup(S) {
      nightSky(S, { stars: 60, starAlpha: 0.5, moon: [0.82, 0.18] });
      S.layers.push(at(0, 0.9, (ctx) => shelterBack(ctx, SHELTER_NIGHT)));
      const card = new CardProp({ x: -0.4, y: SHELTER.bench, sx: 1, sy: 0.34, skew: -0.3 });
      S.layers.push(at(0, 0.95, (ctx, t) => card.draw(ctx, t, { wear: 0.45 })));
      const gnd = shelterGround;
      const tmp = makeCat({ actors: [], layers: [] }, { ground: gnd, pose0: sittingPose(1.6, -1, gnd), layer: false });
      A.curlSleep(tmp.perf);
      const cat = makeCat(S, { ground: gnd, pose0: tmp.perf.curPose(), ...catMoon });
      cat.perf.overlays.push(A.breathing(0, 400, 66));
      // moonlight shadow of the post sliding across
      S.layers.push(at(0, 1.1, (ctx, t) => {
        const a = ramp(t, [[30, 0], [200, 1]]);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = css('#9fb3e0', 0.16 * a);
        ctx.beginPath();
        const sx = lerp(-3, 1, a);
        ctx.moveTo(sx - 8, SHELTER.roof);
        ctx.lineTo(sx + 6, SHELTER.roof);
        ctx.lineTo(sx + 12, 0);
        ctx.lineTo(sx - 2, 0);
        ctx.fill();
        ctx.restore();
      }));
      S.layers.push(at(0, 1.2, (ctx, t) => shelterFront(ctx, SHELTER_NIGHT, t, 0)));
    },
  });
}
function s4_4() {
  return shot({
    name: '4.4', dur: 180, unit: 14, anchor: [0.5, 0.66], fadeOut: 48,
    post: moonPost, grade: { vignette: 0.5, vignetteColor: '#0d1020', grain: 0.45 },
    cam: { x: 0, y: -20, z: 1 },
    setup(S) {
      S.camera.move(0, 180, { z: 0.94 }, 'inout');
      nightSky(S, { stars: 220, starAlpha: 1, moon: [0.2, 0.2] });
      S.layers.push(at(0, 0.9, (ctx) => shelterBack(ctx, SHELTER_NIGHT)));
      S.layers.push(at(0, 1.2, (ctx, t) => shelterFront(ctx, SHELTER_NIGHT, t, 0)));
      // tiny curled cat on the bench (drawn simply at this size)
      S.layers.push(at(0, 1.0, (ctx) => {
        ctx.fillStyle = '#9aa0b8';
        ctx.beginPath();
        ctx.ellipse(1.5, SHELTER.bench - 0.7, 1.4, 0.75, 0, 0, TAU);
        ctx.fill();
      }));
      S.extraEvents = [{ t: 0, type: 'amb', name: 'night_open' }];
    },
  });
}

export function stormShots() {
  return [s3_1(), s3_2(), s3_3(), s3_4(), s3_5(), s3_6(), s3_7()];
}
export function nightShots() {
  return [s4_1(), s4_2(), s4_3(), s4_4()];
}
