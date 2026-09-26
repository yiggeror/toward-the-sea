// Sequence 2 — the forest in the morning: first taste of freedom. Butterfly,
// hiding in the grass, stream crossing, fishing (and getting splashed).
import { shot } from '../film/shot.js';
import { makeCat, follow, ramp, screenLayer, layer, at, standingPose, sittingPose } from '../film/kit.js';
import { CardProp } from '../film/prop.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { skyGradient, glow, clouds } from '../env/sky.js';
import { profile, fillBelow, groundPlane, groundEllipse } from '../env/terrain.js';
import { tree, treeRow, grass, tufts, rock, water, windField, leafyPlant } from '../env/nature.js';
import { lightShafts, motes } from '../env/weather.js';
import { lampGlow, fogBand, particles, glints, bokeh } from '../env/light.js';
import { butterfly, butterflyPos, fish } from '../env/creatures.js';
import { Track } from '../core/tracks.js';
import { css, mix, DPX } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';

export const FOREST = {
  sky: [[0, '#9fd3de'], [0.5, '#dcefd2'], [1, '#fff1c6']],
  far: '#a9cbbb', far2: '#8fb8a0',
  trunk: '#5e4a3d', trunkFar: '#7f8577',
  canopy: { dark: '#2f5b43', mid: '#4f8a4f', light: '#a6cf6a' },
  canopyFar: { dark: '#6f9e86', mid: '#86b394', light: null },
  ground: ['#6c9d46', '#a9cc72'],
  grass: ['#4f8238', '#74a948'],
  grassLight: ['#8db85d', '#b6d876'],
  flowers: ['#fbf6e8', '#f7d85e', '#f0a8bf', '#b8a4ef'],
  stone: ['#a19b8f', '#c3bdb0', null],
  moss: '#7da157',
  water: '#8ec5c7', waterDeep: '#4f8e9d',
  light: '#fff0b8',
};
const catDay = {
  light: () => ({ tint: '#fff2d8', amt: 0.12, lift: '#101008' }),
  rim: () => ({ color: '#fff3c8', dir: [-0.5, -0.86], alpha: 0.7, width: 0.06 }),
};
const dayGrade = { vignette: 0.34, vignetteColor: '#2f3d2c', grain: 0.3, topGlow: '#fff2c4', topGlowAmt: 0.1 };
const breeze = windField({ base: 0.12, gust: 0.3, speed: 0.12, wave: 0.08 });
// sun through the canopy: god rays from the bright sky between the leaves
const forestPost = (sunX = 0.2, sunY = 0.06) => ({
  rays: { pos: [sunX, sunY], strength: 0.42, length: 0.6, threshold: 0.9, knee: 0.08, samples: 16, tint: '#ffe9a8' },
  bloom: { threshold: 0.9, knee: 0.1, strength: 0.35, radius: 20, tint: '#fff2c8' },
});

// dappled sunlight on the ground: soft warm flecks that breathe as leaves move
function sunFlecks(ctx, view, t, o = {}) {
  const n = o.n ?? 26;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < n; i++) {
    const h = (q) => hash01((o.seed ?? 3) * 131 + i * 19 + q);
    const d = (o.d0 ?? -2) + h(1) * ((o.d1 ?? 60) - (o.d0 ?? -2));
    const p = view.pOf(d), sc = view.scaleAt(p);
    const [x0, x1] = view.xRange(p, 0.1);
    const span = x1 - x0;
    const x = x0 + ((h(2) * 400 + (o.drift ?? 0) * t) % 400) / 400 * span;
    const X = view.ox + (x - view.cam.x) * sc, Y = view.oy + ((o.y ?? 0) - view.cam.y) * sc;
    if (Y < 0 || Y > view.H + 50) continue;
    const r = (0.6 + 1.4 * h(3)) * sc * (o.size ?? 1);
    const a = (o.alpha ?? 0.3) * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.03 * (0.5 + h(4)) + h(5) * 6.28)));
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
    g.addColorStop(0, css(FOREST.light, a));
    g.addColorStop(0.6, css(FOREST.light, a * 0.5));
    g.addColorStop(1, css(FOREST.light, 0));
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(X, Y);
    ctx.scale(1, 0.28);
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  ctx.restore();
}

function forestBackdrop(S, o = {}) {
  const sunX = o.sunX ?? 0.2, sunY = o.sunY ?? 0.06;
  S.layers.push(screenLayer(0, (ctx, t, W, H) => {
    skyGradient(ctx, W, H, FOREST.sky);
    glow(ctx, W * sunX, H * sunY, W * 0.55, '#fff4cc', 0.7);
    lampGlow(ctx, W * sunX, H * sunY, W * 0.08, '#fffbe8', 1, 0.3);
  }));
  const far = profile({ base: 0, amp: 160, freq: 0.004, seed: 21 });
  S.layers.push(Object.assign(at(2200, 0.05, (ctx, t, view, S2, p) => {
    fillBelow(ctx, view, p, far, FOREST.far, 5000, 20);
    treeRow(ctx, view, p, t, { seed: 5, spacing: 90, h: 260, w: 170, ground: far, trunk: FOREST.far, dark: FOREST.far, mid: '#b9d6c4', light: null, fill: 0.9 });
  }), { blur: 2.2, haze: { color: '#cfe4d6', amount: 0.25 } }));
  const mid = profile({ base: 0, amp: 30, freq: 0.01, seed: 7 });
  S.layers.push(Object.assign(at(500, 0.1, (ctx, t, view, S2, p) => {
    fillBelow(ctx, view, p, mid, FOREST.far2, 3000, 8);
    treeRow(ctx, view, p, t, { seed: 9, spacing: 55, h: 210, w: 120, ground: mid, trunk: FOREST.trunkFar, dark: FOREST.canopyFar.dark, mid: FOREST.canopyFar.mid, light: '#b4d69c', fill: 0.95, wind: (x, tt) => breeze(x, tt) * 0.3 });
  }), { haze: { color: '#c9e0c8', amount: 0.15 } }));
  S.layers.push(screenLayer(0.15, (ctx, t, W, H, view) => {
    groundPlane(ctx, view, { y: 0, bands: [[-500, 3000, FOREST.ground]] });
    // a band of morning haze where the meadow meets the wood
    const yH = view.oy + (0 - view.cam.y) * view.scaleAt(view.pOf(400));
    fogBand(ctx, W, H, yH - H * 0.03, H * 0.14, '#eef3dc', 0.2, t, { seed: 6, speed: 0.2 });
  }));
  if (o.nearTrees !== false) {
    S.layers.push(at(90, 0.2, (ctx, t, view, S2, p) => treeRow(ctx, view, p, t, {
      seed: o.treeSeed ?? 13, spacing: 60, h: 230, w: 130, ground: () => 0, trunk: FOREST.trunk, trunkW: 7, dark: FOREST.canopy.dark, mid: FOREST.canopy.mid, light: FOREST.canopy.light, fill: 0.75, wind: (x, tt) => breeze(x, tt) * 0.4,
    })));
  }
  S.layers.push(screenLayer(0.25, (ctx, t, W, H) => lightShafts(ctx, W, H, t, { x0: o.shaftX ?? 0.1, spread: 0.7, n: 7, angle: 0.3, color: FOREST.light, alpha: 0.13, seed: o.shaftSeed ?? 7 })));
  // grass fields at mid depth, sunlit tips
  S.layers.push(at(30, 0.3, (ctx, t, view, S2, p) => {
    grass(ctx, view, p, t, { ground: () => 0, density: 4, h: 2.4, width: 0.25, colors: [FOREST.grass[0], FOREST.grass[1], FOREST.grassLight[1]], seed: 3, wind: breeze });
  }));
  S.layers.push(screenLayer(0.35, (ctx, t, W, H, view) => sunFlecks(ctx, view, t, { seed: o.shaftSeed ?? 7, n: 30, d0: -1, d1: 40, alpha: 0.32 })));
  S.layers.push(at(8, 0.4, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: () => 0, spacing: 1.1, h: 1.6, width: 0.12, colors: [...FOREST.grass, FOREST.grassLight[0]], seed: 5, wind: breeze, fill: 0.85, flowers: { p: 0.45, colors: FOREST.flowers, r: 0.11 } })));
  S.post = forestPost(sunX, sunY);
}
function foreground(S, o = {}) {
  S.layers.push(Object.assign(at(-6, 2, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: () => 0.6, spacing: 2.4, h: 2.6, width: 0.2, colors: ['#3f6a30', '#4d7a38'], seed: o.seed ?? 11, wind: breeze, fill: 0.6 })), { blur: 5 }));
  S.layers.push(screenLayer(2.5, (ctx, t, W, H) => {
    // pollen and dust drifting through the sunbeams
    particles(ctx, W, H, t, { n: 46, seed: 4, color: ['#fff6d8', '#fff0b0'], alpha: 0.75, size: 2.2, vx: 0.25, vy: -0.08, glow: 3, twinkle: 0.06 });
  }));
}

// ---- 2.1 wide: arriving at the meadow --------------------------------------
function s2_1() {
  return shot({
    name: '2.1', dur: 204, unit: 26, anchor: [0.5, 0.64], xfade: 24, grade: dayGrade,
    cam: { x: -10, y: -7, z: 1 },
    setup(S) {
      S.camera.move(0, 204, { x: 6 }, 'inout');
      forestBackdrop(S, { sunX: 0.25 });
      const cat = makeCat(S, { x: -30, facing: 1, carry: { wear: 0.03 }, ...catDay });
      const P = cat.perf;
      P.t = 6;
      P.emote(40, 'notes', { dur: 60 });
      locomote(P, { gait: 'walk', dist: 24, accel: 10, decel: 20 });
      A.look(P, P.t, 12, { yaw: 0.7, pitch: 0.55, lookY: 0.5 });
      P.key(P.t + 12, { sparkle: 0.7, eyeWide: 0.2 }, 'inout');
      A.earTwitch(P, P.t + 16, 'L', 0.4);
      P.key(P.t + 30, { hRoll: 0.25, happy: 1, smile: 0.7, sparkle: 0, eyeWide: 0, blush: 0.3 }, 'inout');
      P.key(P.t + 50, { hRoll: 0, hYaw: 0.35, hPitch: 0.1, happy: 0, smile: 0.2, blush: 0.1 }, 'inout');
      foreground(S);
      S.extraEvents = [{ t: 0, type: 'amb', name: 'forest' }];
    },
  });
}

// ---- 2.2 the mossy stone: leave the postcard there ---------------------------
function mossStone(ctx) {
  rock(ctx, 3.4, 0.1, 2.8, 1.25, [FOREST.stone[0], FOREST.stone[1]], 4);
  ctx.fillStyle = FOREST.moss;
  ctx.beginPath();
  ctx.ellipse(2.8, -1.05, 0.9, 0.18, -0.08, 0, TAU);
  ctx.ellipse(3.9, -1.1, 0.5, 0.13, 0.1, 0, TAU);
  ctx.fill();
}
const STONE_TOP = -1.12;
function s2_2() {
  return shot({
    name: '2.2', dur: 156, unit: 92, anchor: [0.5, 0.62], grade: dayGrade,
    cam: { x: 1.8, y: -1.6, z: 1 },
    setup(S) {
      forestBackdrop(S, { sunX: 0.3, treeSeed: 17 });
      S.layers.push(at(0, 0.9, (ctx) => mossStone(ctx)));
      const card = new CardProp({ x: 3.25, y: STONE_TOP, sx: 1, sy: 0.34, skew: -0.3, vis: 0 });
      let tRel = 0;
      const cat = makeCat(S, { x: -3.5, facing: 1, carry: { wear: 0.03, on: (t) => t < tRel }, ...catDay });
      const P = cat.perf;
      P.t = 4;
      locomote(P, { gait: 'walk', to: 1.1, accel: 8, decel: 14 });
      tRel = A.putDown(P);
      card.key(tRel - 1, { vis: 0 }, 'step');
      card.key(tRel, { vis: 1 }, 'step');
      // a little pat: "stay"
      const fn = P.curPose().fn;
      P.key(P.t + 6, { fn: [fn[0] + 0.4, -0.95], fnC: 0.7, hPitch: -0.35, lookY: -0.6 }, 'inout');
      P.key(P.t + 9, { fn: [fn[0] + 1.35, STONE_TOP], fnC: 0.1 }, 'in');
      P.event(P.t + 9, 'pat', {});
      P.key(P.t + 13, { fn: [fn[0] + 0.6, -0.8], fnC: 0.6 }, 'out');
      P.key(P.t + 18, { fn: fn, fnC: 0, hPitch: 0, lookY: 0, happy: 1, smile: 0.6, blush: 0.35 }, 'inout');
      P.key(P.t + 34, { happy: 0, smile: 0.2, blush: 0.1 }, 'inout');
      // a flutter to the right: ears, then head
      A.earTwitch(P, P.t + 44, 'R', 0.5);
      A.look(P, P.t + 48, 8, { yaw: 0.25, pitch: 0.35, lookY: 0.5, lookX: 0.4 });
      P.key(P.t + 56, { sparkle: 0.8, eyeWide: 0.3, pupil: 0.8 }, 'inout');
      S.layers.push(at(0, 0.95, (ctx, t) => card.draw(ctx, t)));
      foreground(S, { seed: 19 });
    },
  });
}

// ---- 2.3 butterfly: watch, hide in the grass, pounce, miss, swat -----------
function s2_3() {
  return shot({
    name: '2.3', dur: 348, unit: 96, anchor: [0.5, 0.64], grade: dayGrade,
    cam: { x: 3.4, y: -1.5, z: 1 },
    setup(S) {
      forestBackdrop(S, { sunX: 0.35, treeSeed: 23, shaftSeed: 11 });
      // butterfly guide path (world), keyed; wobble added by butterflyPos
      const g = new Track({ x: 14, y: -4.5 }, ['x', 'y']);
      g.key(0, {}, 'linear');
      g.key(40, { x: 8, y: -3.2 });
      g.key(70, { x: 5.8, y: -2.2 });
      g.key(92, { x: 6.1, y: -1.75 }, 'out'); // lands on the flower
      g.key(150, {}, 'hold');
      g.key(153, { x: 6.4, y: -2.6 }, 'out'); // escapes just in time
      g.key(170, { x: 5.2, y: -3.6 });
      g.key(196, { x: 4.6, y: -3.4 });
      g.key(230, { x: 2.0, y: -5.0 });
      g.key(300, { x: -6, y: -8 });
      const bpos = (t) => {
        const k = g.sample(t);
        const landed = t >= 92 && t < 151;
        return landed ? [k.x, k.y] : butterflyPos(t, () => [k.x, k.y], 3);
      };
      const cat = makeCat(S, { x: 0, facing: 1, ...catDay, pose: { hYaw: 0.5, hPitch: 0.3 } });
      const P = cat.perf;
      A.track(P, 4, 88, bpos, { step: 4 });
      P.key(20, { earRot: -0.25, eyeWide: 0.3, pupil: 0.8, sparkle: 0.8 }, 'inout');
      P.emote(24, 'sparkle', { dur: 40, n: 3 });
      P.key(80, { sparkle: 0.2, pupil: 1, lid: 0.15, lidTilt: 0.5 }, 'inout'); // focus
      // sink into the grass and creep forward
      P.t = 92;
      locomote(P, { gait: 'stalk', dist: 1.6, height: 0.72, override: { S: 0.9, C: 24, pulse: 0.3 }, pose: { neck: 0.15, hPitch: -0.1, earRot: -0.3, pupil: 1 } });
      A.track(P, P.t - 20, P.t, bpos, { step: 4, neck: 0.15 });
      A.pounce(P, { dx: 3.6, wiggle: 3 });
      // lands on the flower — butterfly gone. pop up, confused
      const t1 = P.t;
      P.key(t1 + 6, { hip: [P.curPose().hip[0], -1.05], pitch: 0.08, neck: 0.75, hPitch: 0.3, hRoll: 0.35, eyeWide: 0.5, lid: 0, earLR: 0.3, archB: 0.08, archF: 0.02, tailA: 0.5, tailC: 0.9 }, 'out');
      P.emote(t1 + 5, 'question', { dur: 30 });
      A.track(P, t1 + 12, t1 + 28, bpos, { step: 4 });
      P.t = t1 + 30;
      A.swatUp(P, { swats: 3 });
      A.track(P, P.t + 2, P.t + 60, bpos, { step: 6 });
      P.t += 16;
      A.sit(P);
      A.blink(P, P.t + 8, 6);
      P.key(P.t + 30, { happy: 1, eye: 0, smile: 0.9, mouth: 0.3, mouthW: 0.6, blush: 0.45, sparkle: 0 }, 'inout');
      P.emote(P.t + 30, 'notes', { dur: 44 });
      P.key(P.t + 58, { happy: 0, eye: 1, smile: 0.2, mouth: 0, blush: 0.15 }, 'inout');
      S.layers.push(at(0, 0.97, (ctx, t) => {
        // the flower the butterfly lands on
        ctx.strokeStyle = '#5f8b43';
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.moveTo(6.1, 0);
        ctx.quadraticCurveTo(6.0 + breeze(6, t) * 0.2, -0.8, 6.1 + breeze(6, t) * 0.3, -1.55);
        ctx.stroke();
        ctx.fillStyle = FOREST.flowers[1];
        ctx.beginPath();
        ctx.arc(6.1 + breeze(6, t) * 0.3, -1.6, 0.14, 0, TAU);
        ctx.fill();
      }));
      S.layers.push(at(-0.5, 1.5, (ctx, t) => {
        const [x, y] = bpos(t);
        const landed = t >= 92 && t < 151;
        butterfly(ctx, x, y, t, { size: 0.58, seed: 3, dir: -1, rate: landed ? 0.06 : 0.33 });
      }));
      // tall grass in front of the cat so it can hide
      S.layers.push(at(-1.2, 1.3, (ctx, t, view, S2, p) => {
        grass(ctx, view, p, t, { ground: () => 0.35, density: 7, h: 1.25, hVar: 0.4, width: 0.12, colors: ['#5c8a42', '#79a84f'], seed: 31, wind: breeze });
      }));
      foreground(S, { seed: 29 });
      S.extraEvents = [];
    },
  });
}

// ---- 2.4 stream crossing: stone to stone, a hind paw slips in --------------
function streamGround(x) {
  if (x < 0.4) return 0;
  // the two stepping stones (flat tops of the rocks drawn in 2.4)
  if (x >= 2.5 && x <= 4.7) return -0.55;
  if (x >= 6.8 && x <= 9.0) return -0.6;
  if (x >= 11) return 0;
  return 0.9; // water
}
function streamLayers(S, x0, x1, o = {}) {
  // the stream crossing the stage plane: a channel on the ground plane whose
  // banks meander (but stay put where the cat crosses, at depth ~0)
  const wob = (d, seed) => {
    const k = smoothstep(0.6, 6, Math.abs(d));
    return k * (noise1(d * 0.16, seed) * 1.1 + noise1(d * 0.55, seed + 7) * 0.16 + Math.sin(d * 0.08 + seed) * 1.2);
  };
  S.layers.push(screenLayer(0.16, (ctx, t, W, H, view) => {
    const N = 260;
    const pts = [];
    const dNear = Math.max(-60, -view.D * 0.88);
    for (let i = 0; i <= N; i++) {
      const d = dNear + Math.pow(i / N, 1.9) * (1500 - dNear);
      const p = view.pOf(d), sc = view.scaleAt(p);
      const bend = Math.sin(d * 0.01) * 6;
      pts.push([view.ox + (x0 + bend + wob(d, 3) - view.cam.x) * sc, view.ox + (x1 + bend + wob(d, 11) - view.cam.x) * sc, view.oy + (0.4 - view.cam.y) * sc, sc, d]);
    }
    const ch = new Path2D();
    pts.forEach(([a, , y], i) => (i ? ch.lineTo(a, y) : ch.moveTo(a, y)));
    for (let i = pts.length - 1; i >= 0; i--) ch.lineTo(pts[i][1], pts[i][2]);
    ch.closePath();
    const s1 = view.scaleAt(1);
    // earthy banks: a soft brown band, then a dark wet line at the water
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(120,112,70,0.35)';
    ctx.lineWidth = Math.max(3 * DPX, 0.9 * s1);
    ctx.stroke(ch);
    ctx.strokeStyle = 'rgba(92,86,52,0.55)';
    ctx.lineWidth = Math.max(2 * DPX, 0.42 * s1);
    ctx.stroke(ch);
    const g = ctx.createLinearGradient(0, view.oy, 0, H);
    g.addColorStop(0, FOREST.water);
    g.addColorStop(1, FOREST.waterDeep);
    ctx.fillStyle = g;
    ctx.fill(ch);
    ctx.save();
    ctx.clip(ch);
    // pebbles showing through the shallows along both banks
    for (let i = 0; i < 70; i++) {
      const d = -8 + Math.pow(hash01(i * 3 + 1), 1.7) * 90;
      const p = view.pOf(d), sc = view.scaleAt(p);
      if (sc <= 0) continue;
      const side = hash01(i * 5) < 0.5;
      const bend = Math.sin(d * 0.01) * 6;
      const xw = side ? x0 + bend + wob(d, 3) + 0.2 + hash01(i * 7) * 0.9 : x1 + bend + wob(d, 11) - 0.2 - hash01(i * 7) * 0.9;
      const x = view.ox + (xw - view.cam.x) * sc, y = view.oy + (0.4 - view.cam.y) * sc;
      const r = (0.07 + 0.12 * hash01(i * 11)) * sc;
      ctx.fillStyle = css(mix('#7f8f7c', '#b3b59c', hash01(i * 13)), 0.5);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.38, 0, 0, TAU);
      ctx.fill();
    }
    // lighter shallows along both banks, sky glare far away
    ctx.lineWidth = Math.max(2 * DPX, 0.9 * s1);
    ctx.strokeStyle = 'rgba(190,232,214,0.42)';
    ctx.stroke(ch);
    ctx.lineWidth = Math.max(DPX, 0.25 * s1);
    ctx.strokeStyle = 'rgba(236,250,240,0.35)';
    ctx.stroke(ch);
    const sg = ctx.createLinearGradient(0, view.oy + (0.4 - view.cam.y) * view.scaleAt(view.pOf(1500)), 0, H);
    sg.addColorStop(0, 'rgba(240,250,240,0.55)');
    sg.addColorStop(0.3, 'rgba(240,250,240,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    // tree reflections: long soft darker smears under the far trunks
    for (let i = 0; i < 9; i++) {
      const x = W * (0.05 + 0.1 * i + 0.04 * hash01(i * 17)) - (view.cam.x * view.scaleAt(view.pOf(60))) % (W * 0.1);
      const top = view.oy + (0.4 - view.cam.y) * view.scaleAt(view.pOf(300));
      const rg = ctx.createLinearGradient(0, top, 0, H * 0.95);
      rg.addColorStop(0, 'rgba(60,80,70,0.16)');
      rg.addColorStop(1, 'rgba(60,80,70,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x, top, W * 0.018 * (0.6 + hash01(i * 23)), H);
    }
    glints(ctx, 0, view.oy + (0.4 - view.cam.y) * view.scaleAt(view.pOf(400)), W, H, t, { n: 50, seed: 17, size: 5 * W / 1920, sizeAt: (py) => 0.5 + py / H, speed: 0.22, alpha: 0.95 });
    ctx.restore();
    // ripples and flowing highlights drifting toward the camera
    ctx.lineCap = 'round';
    for (let i = 0; i < 60; i++) {
      const u = hash01(i * 13);
      const d = 1500 - (((t * 3 + hash01(i * 7) * 1560) % 1560));
      const p = view.pOf(d), sc = view.scaleAt(p);
      if (sc <= 0) continue;
      const bend = Math.sin(d * 0.01) * 6;
      const xl = x0 + bend + wob(d, 3), xr = x1 + bend + wob(d, 11);
      const x = view.ox + (lerp(xl, xr, 0.12 + 0.76 * u) + (Math.sin(t * 0.04 + i) * 0.1) - view.cam.x) * sc;
      const y = view.oy + (0.4 - view.cam.y) * sc;
      const len = (0.3 + 0.5 * hash01(i * 19)) * sc;
      ctx.strokeStyle = i % 3 ? 'rgba(255,255,255,0.45)' : 'rgba(40,90,100,0.22)';
      ctx.lineWidth = Math.max(DPX, 0.05 * sc);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len * 0.5, y - len * 0.06, x + len, y);
      ctx.stroke();
    }
  }));
}

function s2_4() {
  return shot({
    name: '2.4', dur: 228, unit: 70, anchor: [0.5, 0.6], grade: dayGrade,
    cam: { x: 2, y: -1.8, z: 1 },
    setup(S) {
      forestBackdrop(S, { sunX: 0.5, treeSeed: 41, shaftSeed: 19 });
      streamLayers(S, 0.6, 10.8);
      S.layers.push(at(0, 0.95, (ctx, t) => {
        rock(ctx, 3.6, 0.9, 2.3, 1.45, [FOREST.stone[0], FOREST.stone[1], null, FOREST.moss], 8);
        rock(ctx, 7.9, 0.9, 2.3, 1.5, [FOREST.stone[0], FOREST.stone[1], null, FOREST.moss], 9);
        // water line around the stones
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        for (const x of [3.6, 7.9]) {
          const w = Math.sin(t * 0.2 + x) * 0.05;
          ctx.moveTo(x - 1.3, 0.55 + w);
          ctx.quadraticCurveTo(x, 0.45 - w, x + 1.3, 0.55 + w);
        }
        ctx.stroke();
      }));
      const cat = makeCat(S, { x: -4, facing: 1, ground: streamGround, carry: { wear: 0.04 }, ...catDay });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 10, lead: 8, dx: 1.2, y: 0.5 });
      S.camera.key(0, { x: 0 });
      P.t = 2;
      locomote(P, { gait: 'trot', to: -1.4, accel: 6, decel: 8 });
      A.look(P, P.t - 4, 6, { yaw: 0.3, pitch: -0.3, lookY: -0.6 });
      P.t += 2;
      A.jump(P, { dx: 4.35, dy: -0.55, h: 0.65, antic: 6, hold: 2, flight: 10 });
      A.wait(P, 2);
      A.jump(P, { dx: 4.3, dy: -0.05, h: 0.6, antic: 6, hold: 1, flight: 10 });
      // the hind paw slips off the back of the stone into the water
      const ts = P.t + 4;
      const hn = P.curPose().hn;
      P.key(ts, {}, 'hold');
      P.key(ts + 3, { hn: [hn[0] - 0.55, 0.3], hnC: 0.3, hip: [P.curPose().hip[0] - 0.1, -0.84], pitch: -0.1, archB: 0.2 }, 'in');
      P.event(ts + 3, 'splash', { x: hn[0] - 0.55, y: 0.4, strength: 0.5 });
      P.key(ts + 5, { eyeWide: 0.9, earRot: 0.7, earFlat: 0.3, fluff: 0.5, tailA: 1.0, tailC: 0.1, mouth: 0.3 }, 'out');
      P.emote(ts + 4, 'exclaim', { dur: 18 });
      P.key(ts + 16, {}, 'hold');
      P.key(ts + 24, { hYaw: 2.4, hPitch: -0.4, lookY: -0.5, mouth: 0, eyeWide: 0, lid: 0.35, sad: 0.4, smile: -0.5 }, 'inout'); // looks back at the wet paw
      P.emote(ts + 26, 'sweat', { dur: 30 });
      P.key(ts + 30, { hn: [hn[0] - 0.2, -0.3], hnC: 0.8, hip: [P.curPose().hip[0] + 0.1, -1.0], pitch: 0.05, archB: 0.1 }, 'out');
      P.t = ts + 32;
      A.pawFlick(P, { leg: 'hn', n: 3 });
      P.key(P.t + 4, { hYaw: 0.35, hPitch: 0, eyeWide: 0, lid: 0, sad: 0, smile: 0, earRot: 0.1, earFlat: 0, fluff: 0.1, tailA: 0.5, tailC: 0.9 }, 'inout');
      P.t += 6;
      A.jump(P, { dx: 4.4, dy: 0.6, h: 0.7, antic: 5, hold: 1, flight: 10 });
      locomote(P, { gait: 'trot', dist: 8, accel: 6 });
      foreground(S, { seed: 37 });
    },
  });
}

// ---- 2.5 fishing: a fish, a strike, a face full of water, a big shake -----
function s2_5() {
  return shot({
    name: '2.5', dur: 348, unit: 118, anchor: [0.5, 0.56], grade: dayGrade,
    cam: { x: 1.9, y: -1.2, z: 1 },
    setup(S) {
      forestBackdrop(S, { sunX: 0.6, nearTrees: true, treeSeed: 51, shaftSeed: 23 });
      // bank rock (cat) and the stream to the right, seen from the side
      const gnd = (x) => (x < 2.6 ? -0.2 : 1.2);
      S.layers.push(at(0, 0.9, (ctx, t) => {
        const stone = new Path2D();
        stone.moveTo(-12, -0.2);
        stone.lineTo(2.3, -0.2);
        stone.quadraticCurveTo(2.9, -0.1, 2.9, 0.6);
        stone.lineTo(2.9, 3);
        stone.lineTo(-12, 3);
        stone.closePath();
        const g = ctx.createLinearGradient(0, -0.3, 0, 2.2);
        g.addColorStop(0, '#b7ae9e');
        g.addColorStop(0.25, '#8f877a');
        g.addColorStop(1, '#5d574f');
        ctx.fillStyle = g;
        ctx.fill(stone);
        ctx.save();
        ctx.clip(stone);
        // strata, cracks and a wet band at the waterline
        ctx.strokeStyle = 'rgba(60,54,48,0.35)';
        ctx.lineWidth = 0.035;
        for (let i = 0; i < 6; i++) {
          const y = 0.25 + i * 0.32;
          ctx.beginPath();
          ctx.moveTo(-12, y + 0.05 * Math.sin(i));
          for (let x = -12; x <= 3; x += 0.8) ctx.lineTo(x, y + 0.06 * Math.sin(x * 1.3 + i * 2));
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,52,52,0.35)';
        ctx.fillRect(2.2, 0.45, 1, 3);
        // sunlit top face
        ctx.fillStyle = 'rgba(255,240,205,0.35)';
        ctx.fillRect(-12, -0.22, 14.4, 0.1);
        ctx.restore();
        // moss cushions along the top
        for (let i = 0; i < 14; i++) {
          const x = -11.5 + i * 0.75 + hash01(i) * 0.3;
          if (x > 2.1) break;
          const r = 0.25 + 0.2 * hash01(i * 3);
          ctx.fillStyle = hash01(i * 5) < 0.5 ? '#6f9a45' : '#86ad52';
          ctx.beginPath();
          ctx.ellipse(x, -0.22, r, r * 0.35, 0, Math.PI, 0);
          ctx.fill();
        }
      }));
      // water body with the fish, in front of the rock face
      const fishT = new Track({ x: 5.4, y: 1.1, dir: -1 }, ['x', 'y']);
      fishT.key(0, {}, 'linear');
      fishT.key(40, { x: 4.4, y: 1.0 });
      fishT.key(80, { x: 5.0, y: 1.15 });
      fishT.key(120, { x: 3.9, y: 0.95 });
      fishT.key(150, { x: 3.7, y: 0.95 }, 'hold');
      fishT.key(166, {}, 'hold');
      fishT.key(172, { x: 7.5, y: 1.4 }, 'out'); // darts away at the strike
      fishT.key(400, { x: 20, y: 1.4 });
      S.layers.push(at(0, 1.05, (ctx, t) => {
        const f = fishT.sample(Math.floor(t / 2) * 2);
        const dir = t < 168 ? (fishT.sample(t + 4).x < f.x ? -1 : 1) : 1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(2.9, 0.5, 20, 3);
        ctx.clip();
        const g = ctx.createLinearGradient(0, 0.5, 0, 3);
        g.addColorStop(0, 'rgba(160,214,210,0.92)');
        g.addColorStop(0.4, 'rgba(96,160,168,0.94)');
        g.addColorStop(1, 'rgba(46,92,106,0.97)');
        ctx.fillStyle = g;
        ctx.fillRect(2.9, 0.5, 20, 3);
        // pebbles on the stream bed
        for (let i = 0; i < 14; i++) {
          ctx.fillStyle = css(hash01(i) < 0.5 ? '#6f7f6f' : '#8a8a74', 0.55);
          ctx.beginPath();
          ctx.ellipse(3.2 + i * 0.9 + hash01(i * 3) * 0.5, 2.3 + hash01(i * 7) * 0.5, 0.2 + 0.2 * hash01(i * 5), 0.1, 0, 0, TAU);
          ctx.fill();
        }
        fish(ctx, f.x, f.y, t, { len: 0.6, dir, wig: t > 166 && t < 180 ? 1.5 : 0.45, color: '#4f6f7a' });
        // dancing caustic light under the surface
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = 'rgba(230,255,240,0.28)';
        ctx.lineWidth = 0.03;
        for (let k = 0; k < 7; k++) {
          ctx.beginPath();
          const y0 = 0.8 + k * 0.28;
          for (let x = 2.9; x < 16; x += 0.25) {
            const y = y0 + 0.08 * Math.sin(x * 3.1 + t * 0.09 + k * 1.7) + 0.05 * Math.sin(x * 7.3 - t * 0.13 + k);
            if (x === 2.9) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
        glints(ctx, 3, 0.42, 12, 0.2, t, { n: 16, seed: 9, size: 0.12, speed: 0.2, alpha: 0.9 });
        // surface line + ripples
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 0.035;
        ctx.beginPath();
        for (let x = 2.9; x < 16; x += 0.4) {
          const y = 0.5 + Math.sin(x * 2 + t * 0.15) * 0.02;
          if (x === 2.9) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }));
      const cat = makeCat(S, { x: 0.2, facing: 1, ground: gnd, ...catDay, waterColor: 'rgb(220,240,245)',
        pose: { hYaw: 0.35, hPitch: -0.3, lookY: -0.5, earRot: -0.2 } });
      const P = cat.perf;
      const target = (t) => { const f = fishT.sample(t); return [f.x, f.y]; };
      // crouch at the edge, watch
      P.key(10, { hip: [0.3, -0.95], archB: 0.2, neck: 0.3, hPitch: -0.45, pupil: 0.9, eyeWide: 0.3, sparkle: 0.7, tailA: -0.1, tailC: 0.4 }, 'inout');
      P.key(90, { sparkle: 0.2, lid: 0.2, lidTilt: 0.6, pupil: 1 }, 'inout'); // locks on
      A.track(P, 14, 150, target, { step: 6, neck: 0.3 });
      P.key(60, { tailWave: 0.35, tailWaveP: 0 }, 'inout');
      P.key(150, { tailWaveP: 22 }, 'linear');
      P.t = 152;
      const tsp = A.strike(P, { x: 3.8, y: 0.95 });
      P.emote(P.t + 1, 'surprise', { dur: 14 });
      P.key(P.t, { lid: 0, sparkle: 0 }, 'out');
      A.splashRecoil(P);
      // shake the paw, then the whole body
      A.pawFlick(P, { leg: 'fn', n: 4 });
      A.wait(P, 6);
      A.shake(P);
      // sulky, then licks the paw once
      P.key(P.t + 4, { lid: 0.3, sad: 0.8, smile: -0.6, wobble: 0.6, earRot: 0.5, earFlat: 0.3, whiskDroop: 0.5 }, 'inout');
      P.emote(P.t + 6, 'gloom', { dur: 40 });
      P.key(P.t + 48, { lid: 0, sad: 0, smile: 0, wobble: 0, earRot: 0.1, earFlat: 0, whiskDroop: 0 }, 'inout');
      S.extraEvents = [];
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => motes(ctx, W, H, t, { n: 30, seed: 4, color: '#fff6d8', alpha: 0.5, drift: 0.3 })));
    },
  });
}

// ---- 2.6 remembers the postcard, trots back, picks it up ---------------------
function s2_6() {
  return shot({
    name: '2.6', dur: 204, unit: 80, anchor: [0.5, 0.62], grade: dayGrade,
    cam: { x: 2.2, y: -1.6, z: 1 },
    setup(S) {
      forestBackdrop(S, { sunX: 0.3, treeSeed: 17 });
      S.layers.push(at(0, 0.9, (ctx) => mossStone(ctx)));
      let tPick = 1e9;
      const card = new CardProp({ x: 3.25, y: STONE_TOP, sx: 1, sy: 0.34, skew: -0.3 });
      const cat = makeCat(S, { x: 13, facing: -1, carry: { wear: 0.05, on: (t) => t >= tPick }, ...catDay, pose: { earRot: 0.1 } });
      const P = cat.perf;
      P.t = 6;
      P.emote(2, 'exclaim', { dur: 20 });
      P.key(2, { eyeWide: 0.7 }, 'out');
      P.key(20, { eyeWide: 0.1 }, 'inout');
      locomote(P, { gait: 'trot', to: 5.6, accel: 6, decel: 12 });
      // head dips to the card on the stone
      P.holdAll(P.t);
      P.key(P.t + 8, { neck: -0.1, neckLen: 1.1, hPitch: -0.6, mouth: 0.35 }, 'inout');
      tPick = P.t + 12;
      P.key(tPick, { mouth: 0.05 }, 'out');
      P.event(tPick, 'pickup', {});
      P.key(tPick + 10, { neck: 0.62, neckLen: 1, hPitch: 0.05, happy: 1, blush: 0.3 }, 'out');
      P.key(tPick + 26, { happy: 0, blush: 0.1 }, 'inout');
      card.key(tPick - 1, {}, 'linear');
      card.key(tPick, { vis: 0 }, 'step');
      P.t = tPick + 14;
      A.turnAround(P);
      locomote(P, { gait: 'trot', dist: 12, accel: 6 });
      S.layers.push(at(0, 0.95, (ctx, t) => card.draw(ctx, t, { wear: 0.05 })));
      foreground(S, { seed: 19 });
    },
  });
}

// ---- 2.7 leaving the woods; clouds gather on the horizon ---------------------
function s2_7() {
  return shot({
    name: '2.7', dur: 180, unit: 40, anchor: [0.5, 0.64], grade: (t) => Object.assign({}, dayGrade, { tint: '#c8ccd8', tintAmt: ramp(t, [[0, 0], [180, 0.2]]) }),
    cam: { x: -6, y: -3, z: 1 },
    setup(S) {
      S.camera.move(0, 180, { x: 6 }, 'linear');
      forestBackdrop(S, { sunX: 0.1, treeSeed: 61, nearTrees: false });
      // storm clouds building on the far horizon
      S.layers.push(at(20000, 0.06, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, { seed: 44, n: 8, y: -3800, dy: 1400, w: 16000, h: 2600, speed: 6, wrap: 90000, top: '#8e93a6', shade: '#6e7285', alpha: 0.9 })));
      const cat = makeCat(S, { x: -14, facing: 1, carry: { wear: 0.06 }, ...catDay });
      const P = cat.perf;
      P.t = 2;
      locomote(P, { gait: 'walk', dist: 22, accel: 6 });
      A.look(P, 90, 12, { yaw: 0.6, pitch: 0.45, lookY: 0.5 });
      P.key(104, { sad: 0.45, eyeWide: 0.15 }, 'inout');
      A.look(P, 140, 12, { yaw: 0.35, pitch: 0, lookY: 0 });
      P.key(152, { sad: 0.15, lid: 0.1, lidTilt: 0.4 }, 'inout');
      // big leaves sweep past close to the lens
      S.layers.push(at(-30, 3, (ctx, t) => {
        for (let i = 0; i < 4; i++) {
          const x = -40 + i * 26;
          leafyPlant(ctx, x, 4, 9 + 3 * hash01(i), i % 2 ? '#34583a' : '#2d4d33', 70 + i, breeze(x, t) * 0.8);
        }
      }));
      foreground(S, { seed: 67 });
    },
  });
}

export function shots() {
  return [s2_1(), s2_2(), s2_3(), s2_4(), s2_5(), s2_6(), s2_7()];
}
