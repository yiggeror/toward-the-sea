// Sequence 1 — the city on a rainy night: discovery of the postcard, the
// decision, and the run out of town (ending at dawn on the city's edge).
import { shot } from '../film/shot.js';
import { makeCat, follow, ramp, screenLayer, layer, at, inScale, scaled, sittingPose } from '../film/kit.js';
import { CardProp } from '../film/prop.js';
import { drawCard, cardArt } from '../film/postcard.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { skyGradient, glow, moon, clouds, stars } from '../env/sky.js';
import { lampGlow, lightCone, lightPool, fogBand, wetReflection, particles, bokeh } from '../env/light.js';
import { skyline, facades, wires, pole, streetLamp, car, wall, street, acUnit } from '../env/city.js';
import { can } from '../env/creatures.js';
import { profile, fillBelow, haze, groundPlane, groundEllipse } from '../env/terrain.js';
import { treeRow, tufts, grass, windField } from '../env/nature.js';
import { Track } from '../core/tracks.js';
import { drawPortrait, drawCatBack } from '../cat/views.js';
import { drawEmotes } from '../fx/emote.js';
import { idleFace } from '../anim/idle.js';
import { css, mix } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';

export const NIGHT = {
  sky: [[0, '#070a1c'], [0.45, '#131a3a'], [0.8, '#28244f'], [1, '#452c58']],
  far: '#1b1c3a', farWin: ['#ffc66e', '#8fb4ff', '#ffd28a', '#ff9fc0', '#ffe0a8'],
  mid: '#211f40', midWin: ['#ffcf7a', '#ffe0a0', '#9fc2ff', '#ff9ec4', '#ffd070'],
  fac: {
    walls: ['#2c2f55', '#34345c', '#2a2b4c', '#3a3560'], frame: '#1b1c36', dark: '#12132a',
    lit: ['#ffc977', '#ffe2a6', '#ffb070', '#fff0c8'], ac: '#6e7396', acShade: 'rgba(12,12,32,0.4)', pipe: '#1f2140',
    trim: '#44446e', shadow: 'rgba(6,6,20,0.35)', reflect: 'rgba(170,180,255,0.14)', sign: '#ffb05a',
  },
  street: { sidewalk: '#262846', curb: '#1a1b32', road: '#171a2e', joint: 'rgba(0,0,0,0.25)', puddle: '#27344f' },
  lamp: { pole: '#15162a', light: '#ffcf86' },
  car: { body: '#3b4570', glass: '#161a30', tire: '#0f1020', rim: '#58608a', hi: 'rgba(190,210,255,0.22)', tail: '#9e3a44', clr: 0.3, glassHi: 'rgba(200,215,255,0.1)' },
  wall: { wall: '#34355a', cap: '#4a4a74', line: 'rgba(0,0,0,0.18)', wet: 'rgba(200,215,255,0.12)' },
};
const catNight = {
  light: () => ({ tint: '#727cb6', amt: 0.5, lift: '#171a33' }),
  rim: () => ({ color: '#ffd89c', dir: [0.75, -0.66], alpha: 0.85, width: 0.07 }),
};
const nightGrade = { vignette: 0.5, vignetteColor: '#141228', grain: 0.45 };
const nightPost = { bloom: { threshold: 0.6, knee: 0.3, strength: 0.7, radius: 26, wide: 0.9 } };

// ---- shared night backdrop (depth model) ----------------------------------
// Street cross-section (depth behind the cat's line on the road, world H):
// road y=0 from the camera to depth 9; curb; sidewalk y=-1.4 from 9 to 32;
// facades at 32; wires/poles at 30; skylines at 700 and 2500.
export const STREET = { curb: 9, facade: 32, walk: -1.4 };
function nightBackdrop(S, o = {}) {
  const k = 11;
  S.layers.push(screenLayer(0, (ctx, t, W, H) => {
    S.frameLights = [];
    skyGradient(ctx, W, H, NIGHT.sky);
    // city light pollution: a warm magenta glow low in the sky
    const hy = S.view ? S.view.oy + (-60 - S.view.cam.y) * S.view.scaleAt(S.view.pOf(2500)) : H * 0.7;
    const g = ctx.createLinearGradient(0, hy - H * 0.55, 0, hy + H * 0.1);
    g.addColorStop(0, 'rgba(120,70,130,0)');
    g.addColorStop(0.7, 'rgba(170,90,120,0.28)');
    g.addColorStop(1, 'rgba(255,150,110,0.32)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    stars(ctx, W, H, 60, 7, 0.45, t, 0.7);
  }));
  S.layers.push(screenLayer(0.01, (ctx, t, W, H) => {
    const [mx, my] = o.moon || [0.18, 0.16];
    moon(ctx, W * mx, H * my + (S.view ? (S.view.cam.y + 30) * S.view.scaleAt(S.view.pOf(40000)) : 0), W * 0.012, '#f6efd6', 0.35);
  }));
  S.layers.push(at(9000, 0.02, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, {
    seed: 3, n: 6, y: -2400, dy: 600, w: 2600, h: 150, speed: 0.4, wrap: 12000, top: 'rgba(92,74,118,0.5)', shade: 'rgba(38,40,68,0.5)',
  })));
  S.layers.push(Object.assign(at(2500, 0.1, (ctx, t, view, S2, p) => skyline(ctx, view, p, t, {
    seed: 5, base: 0, hMin: 420, hMax: 1100, minW: 110, maxW: 260, color: NIGHT.far, win: NIGHT.farWin, winP: 0.14, winGap: 22, winGapY: 30, antenna: true, flick: true,
  })), { blur: 1.6, haze: { color: '#4a3f63', amount: 0.3 } }));
  S.layers.push(Object.assign(at(700, 0.2, (ctx, t, view, S2, p) => skyline(ctx, view, p, t, {
    seed: 9, base: 0, hMin: 230, hMax: 560, minW: 70, maxW: 150, color: NIGHT.mid, win: NIGHT.midWin, winP: 0.22, winGap: 16, winGapY: 22, flick: true, antenna: true,
  })), { haze: { color: '#3a3858', amount: 0.16 } }));
  // mist between the far city and the street
  S.layers.push(screenLayer(0.3, (ctx, t, W, H, view) => {
    const y0 = view.oy + (STREET.walk - view.cam.y) * view.scaleAt(view.pOf(STREET.facade));
    fogBand(ctx, W, H, y0 - H * 0.12, H * 0.35, '#5a5a86', 0.22, t, { seed: 4, speed: 0.4 });
  }));
  S.layers.push(at(STREET.facade, 0.4, (ctx, t, view, S2, p) => inScale(ctx, view, k, (v) => facades(ctx, v, p, t, {
    seed: o.facSeed ?? 21, base: STREET.walk / k, hMin: 10, hMax: 17.5, minW: 6, maxW: 10, palette: NIGHT.fac, litP: 0.34, acP: 0.4, balcony: true, shop: true, glowWin: true,
    neon: 0.4, lights: S.frameLights,
  }))));
  if (o.wires !== false) {
    S.layers.push(at(30, 0.45, (ctx, t, view) => {
      const poles = o.poles || [-230, 170, 570];
      for (const x of poles) pole(ctx, x, STREET.walk, 100, '#141926', false);
      ctx.fillStyle = '#141926';
      for (const x of poles) {
        ctx.fillRect(x - 9, -96, 18, 1.2);
        ctx.fillRect(x - 6, -90, 12, 1.0);
      }
      wires(ctx, { poles, topYAt: () => -96.5, wires: [0, 0, 6], sag: 0.5, color: '#0e121e', width: 0.5, sway: (tt) => Math.sin(tt * 0.02) }, t);
      wires(ctx, { poles: poles.map((x) => x + 7), topYAt: () => -96.5, wires: [0], sag: 0.55, color: '#0e121e', width: 0.45 }, t);
    }));
  }
}
function nightStreet(S, o = {}) {
  S.layers.push(screenLayer(0.5, (ctx, t, W, H, view) => {
    groundPlane(ctx, view, { y: STREET.walk, bands: [[STREET.curb, STREET.facade, [NIGHT.street.sidewalk, '#222838']]] });
    // curb face
    const Yc0 = view.oy + (STREET.walk - view.cam.y) * view.scaleAt(view.pOf(STREET.curb));
    const Yc1 = view.oy + (0 - view.cam.y) * view.scaleAt(view.pOf(STREET.curb));
    ctx.fillStyle = NIGHT.street.curb;
    ctx.fillRect(0, Yc0, W, Math.max(1, Yc1 - Yc0));
    groundPlane(ctx, view, { y: 0, bands: [[-2000, STREET.curb, [NIGHT.street.road, '#232838']]] });
  }));
  // the wet street mirrors the lit city
  S.layers.push(screenLayer(0.505, (ctx, t, W, H, view) => {
    const y0 = view.oy + (STREET.walk - view.cam.y) * view.scaleAt(view.pOf(STREET.facade));
    if (y0 < H) wetReflection(ctx, W, H, y0, { alpha: 0.62, stretch: 1.25, blur: 1.4, fadeAmt: 0.45, fadeColor: '#0e1120' });
    // light spilling from shops and signs onto the pavement
    for (const L of S.frameLights || []) {
      if (L.y < y0 - 40 || L.x < -L.r * 3 || L.x > W + L.r * 3) continue;
      lightPool(ctx, L.x, Math.max(L.y, y0) + L.r * 0.12, L.r * 1.6, L.r * 0.22, L.color, 0.22 * L.a);
    }
  }));
  S.layers.push(screenLayer(0.506, (ctx, t, W, H, view) => {
    for (const pd of o.puddles || []) {
      const e = groundEllipse(ctx, view, pd.x, pd.d ?? 0, pd.w, pd.dz ?? 1.4, 'rgba(20,28,48,0.35)');
      if (pd.glow) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(e.X, e.Y, e.rx, e.ry, 0, 0, TAU);
        ctx.clip();
        const gx = e.X + (pd.glow - pd.x) * view.scaleAt(view.pOf(pd.d ?? 0));
        const g = ctx.createRadialGradient(gx, e.Y, 0, gx, e.Y, e.rx * 0.9);
        g.addColorStop(0, css(NIGHT.lamp.light, 0.65));
        g.addColorStop(1, css(NIGHT.lamp.light, 0));
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = g;
        ctx.fillRect(e.X - e.rx, e.Y - e.ry, e.rx * 2, e.ry * 2);
        ctx.restore();
      }
      // ripples from drips
      ctx.save();
      ctx.strokeStyle = 'rgba(210,225,255,0.35)';
      ctx.lineWidth = Math.max(1, e.ry * 0.05);
      for (let i = 0; i < 3; i++) {
        const per = 34 + i * 9;
        const tt = t + i * 13 + Math.abs(pd.x) * 7;
        const a = (tt % per) / per;
        const cx = e.X + (hash01(i * 7 + Math.floor(tt / per)) - 0.5) * e.rx;
        ctx.globalAlpha = 1 - a;
        ctx.beginPath();
        ctx.ellipse(cx, e.Y, e.rx * 0.08 + a * e.rx * 0.3, (e.rx * 0.08 + a * e.rx * 0.3) * (e.ry / e.rx), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }));
}
// street lamp at (x, depth) on the sidewalk, with a misty cone and a pool
function lamp(S, x, depth = 26, h = 50) {
  S.layers.push(at(depth, 0.47, (ctx, t) => scaled(ctx, x, STREET.walk, h / 5, () => {
    const [hx, hy] = streetLamp(ctx, 0, 0, 5, NIGHT.lamp, 0, 0);
    // warm wash on the wall behind the lamp
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    glow(ctx, hx, hy + 1.2, 7, '#ff9a55', 0.22);
    ctx.restore();
    lightCone(ctx, hx, hy + 0.05, 0.5, 5.4, 0, NIGHT.lamp.light, 0.2);
    lampGlow(ctx, hx, hy + 0.06, 1.5, NIGHT.lamp.light, 0.95, 0.08);
    ctx.fillStyle = '#fff4d6';
    ctx.fillRect(hx - 0.3, hy, 0.6, 0.09);
  })));
  S.layers.push(screenLayer(0.51, (ctx, t, W, H, view) => {
    const g = groundEllipse(ctx, view, x + h * 0.21, depth - 6, h * 0.5, 10, 'rgba(0,0,0,0)', STREET.walk);
    lightPool(ctx, g.X, g.Y, g.rx, g.ry, NIGHT.lamp.light, 0.34);
  }));
}
// falling drips (from eaves / wires) with splash rings — stateless
function drips(ctx, t, spots, period = 40) {
  ctx.fillStyle = 'rgba(200,215,245,0.8)';
  ctx.strokeStyle = 'rgba(200,215,245,0.5)';
  ctx.lineWidth = 0.03;
  for (let i = 0; i < spots.length; i++) {
    const [x, y0, y1, per] = spots[i];
    const P = per || period;
    const ph = hash01(i * 17 + 3) * P;
    const a = (t + ph) % P;
    const g = 0.03;
    const fallT = Math.sqrt((2 * (y1 - y0)) / g);
    if (a < fallT) {
      const y = y0 + 0.5 * g * a * a;
      ctx.beginPath();
      ctx.ellipse(x, y, 0.06, 0.06 + Math.min(0.2, a * 0.012), 0, 0, TAU);
      ctx.fill();
    } else if (a < fallT + 10) {
      const u = (a - fallT) / 10;
      ctx.beginPath();
      ctx.ellipse(x, y1, 0.1 + u * 0.6, (0.1 + u * 0.6) * 0.25, 0, 0, TAU);
      ctx.globalAlpha = 1 - u;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
const SMALLCAR = Object.assign({}, NIGHT.car, { clr: 0.35 });
const CARK = 4.2; // car scale: 30 H long

// ---- 1.1 establishing: crane down from the rooftops to the wet street -------
function s1_1() {
  return shot({
    name: '1.1', dur: 216, unit: 12, anchor: [0.5, 0.42], fadeIn: 60, grade: nightGrade, post: nightPost,
    cam: { x: -10, y: -205, z: 1 },
    setup(S) {
      S.camera.move(20, 204, { y: -20, x: 6 }, 'inout');
      nightBackdrop(S, { facSeed: 21 });
      nightStreet(S, { puddles: [{ x: -8, d: 3, w: 12, glow: -6 }, { x: 40, d: 5, w: 8, glow: 38 }] });
      lamp(S, -24, 26, 50);
      S.layers.push(at(30, 0.46, (ctx, t) => drips(ctx, t, [[-60, -95, STREET.walk, 50], [-20, -95, STREET.walk, 70], [30, -95, STREET.walk, 44], [70, -95, STREET.walk, 64]], 50)));
      S.layers.push(at(0, 1.0, (ctx, t) => {
        car(ctx, 4, 0, SMALLCAR, 'back', CARK);
        car(ctx, 4, 0, SMALLCAR, 'front', CARK);
        const a = smoothstep(176, 196, t);
        if (a > 0) {
          ctx.fillStyle = css('#fff3c8', 0.85 * a);
          ctx.beginPath();
          ctx.arc(19.4, -0.62, 0.2, 0, TAU);
          ctx.arc(20.4, -0.64, 0.18, 0, TAU);
          ctx.fill();
        }
      }));
      S.extraEvents = [{ t: 0, type: 'amb', name: 'city_night' }];
    },
  });
}

// ---- 1.2 under the car: crawl out, drip, shake head, look around -----------
function s1_2() {
  return shot({
    name: '1.2', dur: 232, unit: 96, anchor: [0.5, 0.6], grade: nightGrade, post: nightPost,
    cam: { x: 2.6, y: -1.25, z: 1 },
    setup(S) {
      nightBackdrop(S, { facSeed: 23, wires: false });
      nightStreet(S, { puddles: [{ x: 12, d: 1.5, w: 2.6, dz: 0.8, glow: 13 }] });
      lamp(S, 16, 26, 50);
      const cat = makeCat(S, {
        x: -5, facing: 1, ...catNight, z: 1,
        pose: { hip: [-5, -0.55], pitch: -0.02, archB: -0.12, archF: -0.1, neck: 0.1, hPitch: -0.05, tailA: -0.35, tailC: 0.15, tailK: 0.2, earRot: 0.1, eye: 1 },
      });
      const P = cat.perf;
      P.key(0, { hip: [-5, -0.55], fn: [-3.85, 0], ff: [-4.0, 0], hn: [-4.9, 0], hf: [-5.1, 0], fnC: 0, len: 1.05 });
      A.blink(P, 12, 6);
      P.t = 24;
      // belly crawl: quick short steps, body skimming the ground
      locomote(P, { gait: 'stalk', dist: 11.6, height: 0.5, override: { pulse: 0.1, S: 0.95, C: 11, beta: 0.7, pitchBase: -0.02 }, pose: { neck: 0.1, hPitch: -0.05, earRot: 0.2, earFlat: 0.25, tailA: -0.45, tailC: 0.15 }, accel: 8, decel: 8 });
      const t1 = P.t + 2;
      const hx = P.curPose().hip[0];
      P.holdAll(t1);
      P.key(t1 + 4, { hip: [hx + 0.1, -0.48], len: 0.94, archB: 0.24 }, 'inout');
      P.key(t1 + 9, { hip: [hx + 0.18, -1.08], pitch: 0.1, len: 1.07, archB: -0.02, neck: 0.82, hPitch: 0.15, earFlat: 0, earRot: 0.0, tailA: 0.4, tailC: 0.8, tailK: 0.8 }, 'out');
      P.key(t1 + 14, { hip: [hx + 0.18, -1.0], pitch: 0.05, len: 1, neck: 0.62, hPitch: 0 }, 'inout');
      // a drip from the gutter above hits the head
      const td = t1 + 28;
      P.key(td, { earFlat: 0.7, earRot: 0.8, squeeze: 1, hPitch: -0.15, neck: 0.5, whisk: -0.6 }, 'out');
      P.emote(td, 'surprise', { dur: 16 });
      P.setTiming(td + 3, 1);
      const yaws = [0.9, -0.3, 1.0, -0.2, 0.8, 0.1, 0.5];
      yaws.forEach((y, i) => P.key(td + 4 + i * 2, { hYaw: y, hRoll: i % 2 ? -0.2 : 0.2, earRot: i % 2 ? 0.9 : 0.3 }, 'inout'));
      P.setTiming(td + 18, 2);
      P.key(td + 20, { hYaw: 0.4, hRoll: 0, eye: 1, squeeze: 0, earFlat: 0, earRot: 0.1, neck: 0.62, hPitch: 0, whisk: 0 }, 'out');
      P.key(td + 30, { lid: 0.25, smile: -0.3 }, 'inout'); // a little grumpy about it
      P.key(td + 50, { lid: 0, smile: 0, eyeWide: 0.15 }, 'inout');
      P.emote(td + 40, 'question', { dur: 34 });
      A.look(P, td + 34, 10, { yaw: 0.9, pitch: 0.45, lookY: 0.4 });
      A.earTwitch(P, td + 46, 'R', 0.5);
      A.look(P, td + 62, 12, { yaw: 1.35, pitch: 0.05, lookX: 0, lookY: 0 });
      A.blink(P, td + 80, 5);
      A.look(P, td + 94, 10, { yaw: 0.4, pitch: 0, lookX: 0.1 });
      S.extraEvents = [{ t: td - 10, type: 'drip_fall' }, { t: td, type: 'drip_hit' }, { t: td + 4, type: 'headshake' }];
      S.layers.push(at(0, 0.99, (ctx, t) => car(ctx, -27, 0, SMALLCAR, 'back', CARK)));
      S.layers.push(at(0, 1.1, (ctx, t) => car(ctx, -27, 0, SMALLCAR, 'front', CARK)));
      const headX = () => P.poseAt(td, true).hip[0] + 1.45;
      S.layers.push(at(0, 1.2, (ctx, t) => {
        const tt = t - (td - 10);
        if (tt >= 0 && tt < 10) {
          const y = -14 + (11.8 * tt * tt) / 100;
          ctx.fillStyle = 'rgba(210,225,255,0.9)';
          ctx.beginPath();
          ctx.ellipse(headX(), y, 0.07, 0.2, 0, 0, TAU);
          ctx.fill();
        }
        if (tt >= 10 && tt < 18) {
          const u = (tt - 10) / 8;
          ctx.fillStyle = css('#d2e1ff', 0.8 * (1 - u));
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI * (0.15 + 0.7 * (i / 4));
            ctx.beginPath();
            ctx.arc(headX() + Math.cos(a) * u * 0.6, -2.2 + Math.sin(a) * u * 0.5 + u * u * 0.4, 0.045, 0, TAU);
            ctx.fill();
          }
        }
      }));
    },
  });
}

// ---- 1.3 gust: the postcard tumbles in -------------------------------------
function s1_3() {
  return shot({
    name: '1.3', dur: 172, unit: 80, anchor: [0.5, 0.6], grade: nightGrade, post: nightPost,
    cam: { x: 0.8, y: -1.7, z: 1 },
    setup(S) {
      nightBackdrop(S, { facSeed: 27, wires: false });
      nightStreet(S, { puddles: [{ x: 6.2, d: 1.2, w: 2.4, dz: 0.8, glow: 7 }] });
      lamp(S, 9, 24, 50);
      const cat = makeCat(S, { x: -0.6, facing: 1, ...catNight, pose: { hYaw: 0.5 } });
      const P = cat.perf;
      const card = new CardProp({ x: -18, y: -5, ang: 0, sx: -1, scale: 1.2, wear: 0 });
      // tumbling path (twos)
      const path = [
        [24, -15, -4.6, 0.6, -1, 1], [30, -12.5, -3.2, 1.4, 0.6, 1], [34, -10.2, -1.2, 2.2, 1, 1],
        [37, -8.8, -0.02, 2.9, 0.3, 0.35], [41, -7.4, -1.6, 3.8, -0.7, 1], [46, -5.2, -2.9, 4.6, -1, 1],
        [51, -2.8, -3.3, 5.6, 0.2, 1], [56, -0.2, -2.8, 6.5, 1, 1], [61, 2.0, -1.7, 7.3, 0.4, 1],
        [66, 3.4, -0.3, 8.0, -0.6, 0.6], [69, 3.9, 0.12, 8.2, -1, 0.3],
      ];
      for (const [t, x, y, ang, sx, sy] of path) card.key(t, { x, y, ang: ang * 0.9, sx, sy, skew: sy < 0.5 ? -0.3 : 0, bend: 0.3 * Math.sin(t) }, 'linear');
      card.key(82, { x: 5.0, y: 0.18, ang: 0.02 * 0, sx: -1, sy: 0.3, skew: -0.3, bend: 0 }, 'out');
      card.key(90, { bend: 0.25 }, 'inout');
      card.key(98, { bend: 0 }, 'inout');
      card.key(106, { bend: 0.12 }, 'inout');
      card.key(116, { bend: 0 }, 'inout');
      S.layers.push(layer(1, 1.05, (ctx, t) => card.draw(ctx, t, { wear: 0 })));
      // performance: ears first, freeze, head tracks the card, crouch
      P.key(0, { hYaw: 0.45, earRot: 0.1 });
      A.blink(P, 8, 5);
      P.key(20, { earRot: 0.95, earLR: 0.2 }, 'out'); // ears swivel back toward the sound
      P.key(24, {}, 'hold');
      P.key(30, { hYaw: 2.3, neck: 0.72, hPitch: 0.1, eyeWide: 0.6, pupil: 0.8 }, 'out'); // looks back
      P.emote(29, 'exclaim', { dur: 22 });
      P.key(38, { hip: [-0.7, -0.84], archB: 0.28, len: 0.95, earFlat: 0.35, tailA: -0.2, tailC: 0.3, fluff: 0.3 }, 'out'); // ducks as it flies over
      P.key(44, { hYaw: 1.6, hPitch: 0.45, lookY: 0.4 }, 'inout');
      P.key(52, { hYaw: 0.9, hPitch: 0.3 }, 'inout');
      P.key(60, { hYaw: 0.45, hPitch: -0.15, lookY: -0.3 }, 'inout');
      P.key(70, { hYaw: 0.4, hPitch: -0.3, lookY: -0.6, earFlat: 0.1, earRot: -0.2, earLR: 0, eyeWide: 0.4, pupil: 0.9, sparkle: 0.35 }, 'out');
      P.emote(78, 'question', { dur: 40 });
      P.key(84, { hip: [-0.7, -0.78], neck: 0.35, archB: 0.2, fluff: 0.1, tailA: -0.1, tailC: 0.4, tailWave: 0.25 }, 'inout');
      P.key(100, { tailWaveP: 6 }, 'linear');
      P.key(130, { tailWaveP: 14, earRot: -0.28 }, 'linear');
      A.blink(P, 122, 5);
      P.key(150, { tailWaveP: 20 }, 'linear');
      S.extraEvents = [{ t: 16, type: 'gust' }, { t: 37, type: 'paper', strength: 0.6 }, { t: 66, type: 'paper', strength: 0.4 }, { t: 70, type: 'paper_slide' }];
      S.card = card;
    },
  });
}

// ---- 1.4 approach, sniff, pat — the card flips over -------------------------
function s1_4() {
  return shot({
    name: '1.4', dur: 196, unit: 118, anchor: [0.5, 0.6], grade: nightGrade, post: nightPost,
    cam: { x: 1.4, y: -1.35, z: 1 },
    setup(S) {
      nightBackdrop(S, { facSeed: 27, wires: false });
      nightStreet(S, { puddles: [{ x: 5.6, d: 1.2, w: 1.9, dz: 0.7, glow: 6.2 }] });
      lamp(S, 7.5, 24, 50);
      const cat = makeCat(S, {
        x: -1.6, facing: 1, ...catNight,
        pose: { hip: [-1.6, -0.78], archB: 0.2, neck: 0.35, hPitch: -0.3, lookY: -0.6, earRot: -0.28, eyeWide: 0.4, pupil: 0.9, tailA: -0.1, tailC: 0.4 },
      });
      const P = cat.perf;
      const card = new CardProp({ x: 3.3, y: 0.16, sx: -1, sy: 0.34, skew: -0.3, scale: 1.2 });
      P.t = 6;
      locomote(P, { gait: 'stalk', dist: 2.2, height: 0.78, override: { pulse: 0.35 }, pose: { neck: 0.2, hPitch: -0.3, earRot: -0.25, whisk: 0.7 }, accel: 10, decel: 12 });
      // sniff: neck extends, nose twitches
      let t = P.t + 2;
      P.move(t, t + 12, { neck: -0.05, neckLen: 1.3, hPitch: -0.6, whisk: 0.9, lookY: -0.8 }, 'inout');
      for (let i = 0; i < 4; i++) {
        P.key(t + 16 + i * 4, { hPitch: -0.66 }, 'out');
        P.key(t + 18 + i * 4, { hPitch: -0.58 }, 'in');
        P.event(t + 16 + i * 4, 'sniff', {});
      }
      t += 34;
      // pull back a bit, then a careful pat with the near forepaw
      P.move(t, t + 8, { neckLen: 1.0, neck: 0.3, hPitch: -0.4 }, 'inout');
      const fn0 = P.curPose().fn;
      P.key(t + 14, { fn: [fn0[0] + 0.25, -0.45], fnC: 0.8, hip: [P.curPose().hip[0] - 0.05, -0.8] }, 'inout');
      P.key(t + 18, {}, 'hold');
      P.key(t + 21, { fn: [fn0[0] + 0.95, 0.02], fnC: 0.1 }, 'in');
      const tPat = t + 21;
      P.event(tPat, 'pat', {});
      P.key(tPat + 3, { fn: [fn0[0] + 0.7, -0.3], fnC: 0.6 }, 'out');
      // the card flips: small startle hop back, ears back
      P.key(tPat + 5, { hip: [P.curPose().hip[0] - 0.35, -0.9], fn: fn0, fnC: 0, eyeWide: 0.9, earRot: 0.7, earFlat: 0.35, fluff: 0.35, neck: 0.5, hPitch: -0.1, mouth: 0.25 }, 'out');
      P.emote(tPat + 4, 'exclaim', { dur: 20 });
      P.key(tPat + 16, { hip: [P.curPose().hip[0] - 0.3, -0.84], earFlat: 0.1, earRot: 0.1, fluff: 0.1, mouth: 0 }, 'inout');
      // then leans in slowly to look, head tilts
      P.key(tPat + 40, { neck: 0.05, neckLen: 1.2, hPitch: -0.55, hRoll: 0.32, lookY: -0.8, eyeWide: 0.5, earRot: -0.2, sparkle: 0.8, mouth: 0.1 }, 'inout');
      P.emote(tPat + 46, 'sparkle', { dur: 60, n: 4 });
      A.blink(P, tPat + 58, 6);
      P.key(tPat + 80, { hRoll: 0.1 }, 'inout');
      const tf = tPat + 1;
      card.key(tf, { x: 3.3, y: 0.16, sx: -1, sy: 0.3, skew: -0.3 }, 'linear');
      card.key(tf + 4, { y: -0.4, sy: 0.75, sx: -0.9, skew: -0.1, ang: -0.1 }, 'out');
      card.key(tf + 8, { y: -0.75, sy: 1, sx: -0.1, skew: 0, ang: -0.18 }, 'linear');
      card.key(tf + 12, { y: -0.4, sy: 0.85, sx: 0.8, ang: -0.1 }, 'in');
      card.key(tf + 15, { y: 0.16, sy: 0.3, sx: 1, skew: -0.3, ang: 0 }, 'out');
      card.key(tf + 19, { y: 0.08, sy: 0.36 }, 'out');
      card.key(tf + 23, { y: 0.16, sy: 0.3 }, 'in');
      S.layers.push(layer(1, 1.05, (ctx, tt) => card.draw(ctx, tt)));
      S.extraEvents = [{ t: tf + 3, type: 'paper', strength: 0.5 }, { t: tf + 15, type: 'paper', strength: 0.35 }];
    },
  });
}

// ---- 1.5 insert: the postcard -----------------------------------------------
function s1_5() {
  return shot({
    name: '1.5', dur: 132, unit: 1500, anchor: [0.5, 0.5], grade: { vignette: 0.55, vignetteColor: '#1a1830', grain: 0.5 },
    cam: { x: 0, y: 0, z: 1 },
    setup(S) {
      S.camera.move(0, 132, { z: 1.07, x: 0.05, y: -0.02 }, 'inout');
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        ctx.fillStyle = '#161b28';
        ctx.fillRect(0, 0, W, H);
        // wet asphalt speckle + bokeh
        for (let i = 0; i < 26; i++) {
          const x = hash01(i * 7) * W, y = hash01(i * 11) * H, r = (10 + 30 * hash01(i * 13)) * W / 1920;
          ctx.fillStyle = css(i % 3 ? '#35425f' : '#6d5a42', 0.25);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        }
      }));
      S.layers.push(layer(1, 1, (ctx, t) => {
        ctx.save();
        ctx.rotate(-0.04);
        // soft shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-0.47, -0.3, 1.0, 0.68);
        drawCard(ctx, 0, 0, { wear: 0, scale: 0.92, px: 1400 });
        // a drop lands on the card and stays as a bead
        const td = 74;
        if (t >= td - 8 && t < td) {
          const u = (t - (td - 8)) / 8;
          ctx.fillStyle = 'rgba(220,235,255,0.7)';
          ctx.beginPath();
          ctx.ellipse(0.16, -0.5 + u * 0.55, 0.006, 0.014, 0, 0, TAU);
          ctx.fill();
        }
        if (t >= td) {
          const u = clamp((t - td) / 10, 0, 1);
          ctx.strokeStyle = css('#ffffff', 0.5 * (1 - u));
          ctx.lineWidth = 0.003;
          ctx.beginPath();
          ctx.ellipse(0.16, 0.05, 0.01 + u * 0.05, (0.01 + u * 0.05) * 0.7, 0, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = 'rgba(235,245,255,0.55)';
          ctx.beginPath();
          ctx.ellipse(0.16, 0.05, 0.012, 0.009, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(0.155, 0.046, 0.003, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }));
      S.layers.push(screenLayer(2, (ctx, t, W, H) => {
        // warm lamplight from the upper right across the card
        const g = ctx.createLinearGradient(W, 0, W * 0.3, H);
        g.addColorStop(0, 'rgba(255,210,140,0.28)');
        g.addColorStop(1, 'rgba(255,210,140,0)');
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(150,160,205,0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }));
      S.extraEvents = [{ t: 74, type: 'drop_on_card' }];
    },
  });
}

// ---- 1.6 close-up: curious face -------------------------------------------
function portraitTrack(init) {
  const tr = new Track(Object.assign({ hYaw: -0.15, hPitch: 0, hRoll: 0, eye: 1, eyeWide: 0, pupil: 0.5, lookX: 0, lookY: 0, lid: 0, lidTilt: 0, happy: 0, mouth: 0, mouthW: 0, smile: 0, earRot: 0.1, earFlat: 0, earLR: 0, earRR: 0, whisk: 0, breath: 0, low: 0, sparkle: 0, blush: 0, tear: 0, sad: 0, squeeze: 0, wobble: 0, tongue: 0 }, init));
  tr.key(0, {}, 'linear');
  return tr;
}
function s1_6() {
  return shot({
    name: '1.6', dur: 150, unit: 380, anchor: [0.5, 0.6], grade: nightGrade, post: nightPost,
    cam: { x: 0, y: -0.3, z: 1 },
    setup(S) {
      S.camera.move(10, 150, { z: 1.05 }, 'inout');
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        skyGradient(ctx, W, H, [[0, '#141a2c'], [1, '#2a3048']]);
        for (let i = 0; i < 14; i++) {
          const x = hash01(i * 7 + 1) * W, y = hash01(i * 11 + 2) * H * 0.7, r = (30 + 90 * hash01(i * 13)) * W / 1920;
          ctx.fillStyle = css(i % 3 ? '#f2c677' : '#7f93c2', 0.12 + 0.1 * hash01(i));
          ctx.beginPath();
          ctx.arc(x + Math.sin(t * 0.01 + i) * 4, y, r, 0, TAU);
          ctx.fill();
        }
      }));
      const tr = portraitTrack({ hYaw: -0.2, lookY: -0.5, hPitch: -0.12, eyeWide: 0.25 });
      tr.key(14, { hRoll: 0.34, eyeWide: 0.45, earLR: 0.2, lookX: 0.1 }, 'inout');
      tr.key(22, { hRoll: 0.3 }, 'inout');
      tr.key(52, { eye: 1 }, 'hold');
      tr.key(54, { eye: 0 }, 'in');
      tr.key(58, { eye: 1 }, 'out');
      tr.key(74, { hRoll: -0.22, hYaw: -0.05, earLR: -0.1, earRR: 0.3, lookX: -0.1 }, 'inout');
      tr.key(84, { hRoll: -0.18 }, 'inout');
      tr.key(104, { earRR: 0.6 }, 'out');
      tr.key(110, { earRR: 0.1 }, 'inout');
      tr.key(122, { hRoll: 0.05, hPitch: 0.05, lookY: -0.2, eyeWide: 0.5, pupil: 0.8, sparkle: 1, blush: 0.4, mouth: 0.12 }, 'inout');
      const EV = [{ type: 'emote', kind: 'question', t: 18, dur: 44 }, { type: 'emote', kind: 'sparkle', t: 114, dur: 36, n: 5 }];
      S.layers.push(layer(1, 1, (ctx, t) => {
        const tt = Math.floor(t / 2) * 2;
        const p = idleFace(Object.assign({}, tr.sample(tt)), tt, 16);
        p.breath = 0.5 + 0.5 * Math.sin(t * 0.09);
        ctx.save();
        const m = ctx.getTransform();
        const s = m.a;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const an = drawPortrait(ctx, p, { x: m.e, y: m.f, scale: s, light: { tint: '#7c86b6', amt: 0.35, lift: '#1b1f30' } });
        drawEmotes(ctx, EV, tt, an);
        ctx.restore();
      }));
      S.layers.push(screenLayer(2, (ctx, t, W, H) => {
        const g = ctx.createRadialGradient(W * 0.85, H * 0.05, 0, W * 0.85, H * 0.05, W * 0.6);
        g.addColorStop(0, 'rgba(255,214,150,0.2)');
        g.addColorStop(1, 'rgba(255,214,150,0)');
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }));
    },
  });
}

// ---- 1.7 looking up: the narrow sky between buildings ----------------------
function alleyUp(ctx, W, H, t, lift) {
  // perspective walls converging to a vanishing point far above
  const vx = W * 0.5, vy = -H * 1.6 + lift;
  const s = W / 1920;
  const wallL = [[-W * 0.1, H * 1.1], [W * 0.33, H * 1.1]];
  const wallR = [[W * 0.67, H * 1.1], [W * 1.1, H * 1.1]];
  const P = NIGHT.fac;
  const lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const toVP = (p, u) => lerp2(p, [vx, vy], u);
  const drawWall = (pts, col, side) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    const e0 = toVP(pts[1], 0.9), e1 = toVP(pts[0], 0.9);
    ctx.lineTo(e0[0], e0[1]);
    ctx.lineTo(e1[0], e1[1]);
    ctx.closePath();
    ctx.fill();
    // windows in perspective rows
    for (let r = 0; r < 26; r++) {
      const u0 = 1 - Math.pow(0.9, r * 1.0 + 1.5), u1 = 1 - Math.pow(0.9, r * 1.0 + 2.1);
      for (let c = 0; c < 3; c++) {
        const cu0 = (c + 0.25) / 3, cu1 = (c + 0.7) / 3;
        const a = lerp2(toVP(pts[0], u0), toVP(pts[1], u0), cu0), b = lerp2(toVP(pts[0], u0), toVP(pts[1], u0), cu1);
        const c2 = lerp2(toVP(pts[0], u1), toVP(pts[1], u1), cu1), d = lerp2(toVP(pts[0], u1), toVP(pts[1], u1), cu0);
        const lit = hash01(r * 7 + c * 3 + side * 101) < 0.3;
        ctx.fillStyle = lit ? P.lit[(r + c) % P.lit.length] : P.dark;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(c2[0], c2[1]);
        ctx.lineTo(d[0], d[1]);
        ctx.closePath();
        ctx.fill();
        if (!lit && hash01(r * 13 + c + side) < 0.25) {
          // AC unit sticking out below the window
          const e = lerp2(d, a, 1.25), f = lerp2(c2, b, 1.25);
          ctx.fillStyle = P.ac;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.lineTo(f[0], f[1]);
          ctx.lineTo(e[0], e[1]);
          ctx.fill();
        }
      }
    }
  };
  skyGradient(ctx, W, H, [[0, '#070b1f'], [0.5, '#1a2150'], [1, '#3a2d5c']]);
  // stars and a soft moon glow in the narrow strip of sky
  stars(ctx, W, H, 70, 77, 1.0, t, 0.8);
  glow(ctx, W * 0.56, H * 0.12 + lift * 0.3, W * 0.28, '#c9d4ff', 0.28);
  moon(ctx, W * 0.56, H * 0.12 + lift * 0.3, W * 0.014, '#f6efd6', 0.3);
  drawWall(wallL, '#2b3249', 0);
  drawWall(wallR, '#262d43', 1);
  // wires crossing the gap
  ctx.strokeStyle = '#0c0f1a';
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const y = lift * 0.9 + H * (-0.25 + i * 0.12) - 40 * s * i;
    ctx.lineWidth = (3 + i) * s;
    ctx.beginPath();
    ctx.moveTo(-10, y);
    ctx.quadraticCurveTo(W * 0.5, y + (30 + 12 * i) * s + Math.sin(t * 0.03 + i) * 3 * s, W + 10, y - 20 * s);
    ctx.stroke();
  }
}
function s1_7() {
  return shot({
    name: '1.7', dur: 172, unit: 60, anchor: [0.5, 0.5], grade: nightGrade, post: nightPost,
    setup(S) {
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        const lift = ramp(t, [[20, 0], [150, H * 0.95]]);
        alleyUp(ctx, W, H, t, lift);
      }));
      // Xiaohui from behind, sitting, looking up; slides down as the camera tilts
      const hp = new Track({ hPitch: 0.1, hYaw: 0, hRoll: 0, tail: 0.6, tailFlick: 0, earRot: 0.1, earLR: 0, earRR: 0 });
      hp.key(0, {}, 'linear');
      hp.key(26, { hPitch: 0.75, earRot: -0.05 }, 'inout');
      hp.key(70, { hRoll: 0.18 }, 'inout');
      hp.key(96, { earLR: 0.5 }, 'out');
      hp.key(102, { earLR: 0 }, 'inout');
      hp.key(120, { hRoll: -0.08, tailFlick: 0.5 }, 'inout');
      hp.key(132, { tailFlick: 0 }, 'inout');
      S.layers.push(screenLayer(1, (ctx, t, W, H) => {
        const lift = ramp(t, [[20, 0], [150, H * 0.95]]);
        const p = hp.sample(Math.floor(t / 2) * 2);
        p.breath = 0.5 + 0.5 * Math.sin(t * 0.09);
        drawCatBack(ctx, p, { x: W * 0.5, y: H * 1.02 + lift, scale: 150 * W / 1920, light: { tint: '#7c86b6', amt: 0.4, lift: '#1b1f30' } });
      }));
    },
  });
}

// ---- 1.8 picks up the postcard ------------------------------------------
function s1_8() {
  return shot({
    name: '1.8', dur: 104, unit: 108, anchor: [0.5, 0.6], grade: nightGrade, post: nightPost,
    cam: { x: 1.9, y: -1.4, z: 1 },
    setup(S) {
      nightBackdrop(S, { facSeed: 27, wires: false });
      nightStreet(S, { puddles: [{ x: 5.8, d: 1.2, w: 1.9, dz: 0.7, glow: 6.4 }] });
      lamp(S, 7.5, 24, 50);
      const tPick = 34;
      const cat = makeCat(S, { x: 0.4, facing: 1, ...catNight, carry: { wear: 0, on: (t) => t >= tPick } });
      const P = cat.perf;
      const card = new CardProp({ x: 2.95, y: 0.16, sx: 1, sy: 0.34, skew: -0.3, scale: 1.2 });
      P.key(0, { hYaw: 0.5, neck: 0.4, hPitch: -0.4, lookY: -0.6 });
      P.key(12, {}, 'hold');
      P.key(26, { neck: -0.2, neckLen: 1.15, hPitch: -0.85, hip: [0.55, -0.95], pitch: -0.05, mouth: 0.35, earRot: 0 }, 'inout');
      P.key(tPick, { mouth: 0.08, hPitch: -0.9 }, 'out');
      P.event(tPick, 'pickup', {});
      P.key(tPick + 12, { neck: 0.7, neckLen: 1.0, hPitch: 0.12, hip: [0.4, -1.02], pitch: 0.06, tailA: 0.7, tailC: 0.9, earRot: -0.1 }, 'out');
      P.key(tPick + 18, { neck: 0.6, hPitch: 0.0 }, 'inout');
      P.key(tPick + 22, { happy: 1, blush: 0.35 }, 'inout');
      P.key(tPick + 30, { hYaw: 0.25, eyeWide: 0.2, happy: 1 }, 'inout');
      P.key(tPick + 36, { happy: 0, blush: 0.15, lid: 0.12, lidTilt: 0.5 }, 'inout'); // determined
      P.t = tPick + 36;
      locomote(P, { gait: 'walk', dist: 4, accel: 12 });
      // the card lies on the ground until it is gripped; lift follows the mouth
      card.key(tPick - 1, {}, 'linear');
      card.key(tPick, { vis: 0 }, 'step');
      S.layers.push(layer(1, 0.999, (ctx, t) => card.draw(ctx, t)));
    },
  });
}

// ---- 1.9 the run: trot, a can falls, freeze, bolt, AC unit, wall, gap ------
function runGround(x) {
  if (x >= 36 && x <= 41.2) return -6;
  if (x >= 44 && x <= 70) return -13;
  if (x >= 77.5) return -10;
  return 0;
}
function s1_9() {
  return shot({
    name: '1.9', dur: 440, unit: 60, anchor: [0.45, 0.6], grade: nightGrade, post: nightPost,
    cam: { x: 0, y: -1.6, z: 1 },
    setup(S) {
      nightBackdrop(S, { facSeed: 31, poles: [-120, 160] });
      nightStreet(S, { puddles: [{ x: 18, d: 1.5, w: 3.5, dz: 1, glow: 20 }] });
      lamp(S, 22, 24, 50);
      const P0 = { x: 2, g: runGround };
      const cat = makeCat(S, { x: P0.x, facing: 1, ground: runGround, ...catNight, carry: { wear: 0 } });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 14, lead: 10, dx: 2.2, y: 0.85, dy: 0.2 });
      // props: trash bin + can, AC unit, the wall, the roof
      const tFall = 64;
      S.layers.push(layer(1, 0.98, (ctx, t) => {
        // bin
        ctx.fillStyle = '#2f3a4a';
        ctx.fillRect(-2.2, -3.1, 2.4, 3.1);
        ctx.fillStyle = '#3c4859';
        ctx.fillRect(-2.4, -3.35, 2.8, 0.3);
        // AC unit on brackets (a platform) against the building wall
        acUnit(ctx, 36, -6, 5.2, 3.6, NIGHT.fac);
        // wall with cap
        wall(ctx, 44, 70, 0, 13, NIGHT.wall);
        // lower roof beyond the gap
        ctx.fillStyle = '#2d3348';
        ctx.fillRect(77.5, -10, 60, 10);
        ctx.fillStyle = '#3f4661';
        ctx.fillRect(77.3, -10.25, 60, 0.3);
      }));
      // can: sits on the bin lid, falls, clatters, rolls
      const canT = new Track({ x: -0.8, y: -3.35, ang: 0, tip: 0 });
      canT.key(0, {}, 'linear');
      canT.key(tFall, {}, 'hold');
      canT.key(tFall + 3, { x: 0.2, y: -3.1, tip: 0.6 }, 'in');
      canT.key(tFall + 8, { x: 1.4, y: 0, ang: 2, tip: 1.2 }, 'in');
      canT.key(tFall + 11, { x: 1.9, y: -0.4, ang: 3 }, 'out');
      canT.key(tFall + 14, { x: 2.4, y: 0, ang: 4 }, 'in');
      canT.key(tFall + 60, { x: 7.5, ang: 16 }, 'out');
      S.layers.push(layer(1, 1.01, (ctx, t) => {
        const c = canT.sample(Math.floor(t / 2) * 2);
        can(ctx, c.x, c.y, c.ang, { tip: c.tip, color: '#a33e37' });
      }));
      // performance
      P.t = 4;
      locomote(P, { gait: 'trot', dist: 8, accel: 10, decel: 6 });
      const tStop = P.t; // stopped around x = 13, before the can falls
      // freeze on the clatter: ears first, one paw raised
      const tHear = Math.max(tStop, tFall + 9);
      P.holdAll(tHear);
      P.key(tHear + 2, { earRot: 0.95, earLR: 0.3, eyeWide: 0.8, pupil: 0.9 }, 'out');
      P.emote(tHear + 1, 'exclaim', { dur: 20 });
      const fn = P.curPose().fn;
      P.key(tHear + 4, { fn: [fn[0] - 0.1, fn[1] - 0.35], fnC: 0.8, hYaw: 1.2, neck: 0.72, hip: [P.curPose().hip[0], -1.05] }, 'out');
      P.key(tHear + 14, {}, 'hold');
      // bolt
      P.key(tHear + 16, { fn: fn, fnC: 0, hYaw: 0.3, hip: [P.curPose().hip[0] - 0.15, -0.85], archB: 0.3, earFlat: 0.3, tailA: 0.1, fluff: 0.3 }, 'out');
      P.t = tHear + 17;
      P.setTiming(P.t, 1);
      locomote(P, { gait: 'run', to: 31.2, accel: 6, decel: 3 });
      // running jump onto the AC unit
      A.jump(P, { dx: 5.8, dy: -6, h: 1.4, antic: 3, hold: 0, flight: 12 });
      // straight up to the wall top
      A.jump(P, { dx: 7.2, dy: -7, h: 1.6, antic: 4, hold: 1, flight: 14 });
      locomote(P, { gait: 'run', to: 66.5, accel: 6, decel: 3 });
      // leap across the gap
      A.jump(P, { dx: 11.5, dy: 3, h: 1.8, antic: 3, hold: 1, flight: 17 });
      P.setTiming(P.t, 2);
      locomote(P, { gait: 'trot', dist: 12, accel: 4, decel: 18 });
      S.extraEvents = [{ t: tFall + 2, type: 'can_fall' }, { t: tFall + 8, type: 'can_hit' }, { t: tFall + 14, type: 'can_roll', dur: 46 }];
    },
  });
}

// ---- 1.10 dawn at the edge of the city: title ------------------------------
const DAWN = {
  sky: [[0, '#4f64a0'], [0.38, '#8f9fcd'], [0.64, '#e9b9b0'], [0.82, '#ffd2a2'], [1, '#fff0cc']],
};
function s1_10() {
  return shot({
    name: '1.10', dur: 228, unit: 52, anchor: [0.5, 0.62], xfade: 30,
    grade: { vignette: 0.28, vignetteColor: '#4a3f5e', grain: 0.35 },
    post: { bloom: { threshold: 0.8, knee: 0.15, strength: 0.5, radius: 26, tint: '#ffd7a8' }, rays: { pos: [0.78, 0.44], strength: 0.45, length: 0.55, threshold: 0.84, knee: 0.1, tint: '#ffc890' } },
    cam: { x: 6.5, y: -7.5, z: 1 },
    setup(S) {
      S.camera.move(80, 228, { x: 13, y: -4 }, 'inout');
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        skyGradient(ctx, W, H, DAWN.sky);
        glow(ctx, W * 0.78, H * 0.44, W * 0.6, '#ffd9a8', 0.65);
        lampGlow(ctx, W * 0.78, H * 0.44, W * 0.07, '#fff4dc', 1, 0.3);
        ctx.fillStyle = '#fff8ea';
        ctx.beginPath();
        ctx.arc(W * 0.78, H * 0.44, W * 0.018, 0, TAU);
        ctx.fill();
      }));
      S.layers.push(at(20000, 0.02, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, { seed: 12, n: 7, y: -3200, dy: 1400, w: 5200, h: 520, speed: 1.2, wrap: 30000, top: '#fbe2d4', shade: '#a996b6', rim: '#fff4ea', glow: '#ffb487', light: [0.7, 0.45] })));
      const hills = profile({ base: 0, amp: 260, freq: 0.0012, seed: 4 });
      const forest = profile({ base: 0, amp: 30, freq: 0.004, seed: 8 });
      S.layers.push(at(3000, 0.1, (ctx, t, view, S2, p) => fillBelow(ctx, view, p, hills, '#a3aec8', 4000, 20)));
      S.layers.push(at(900, 0.2, (ctx, t, view, S2, p) => {
        fillBelow(ctx, view, p, forest, '#8ea0ac', 2000, 6);
        treeRow(ctx, view, p, t, { seed: 3, spacing: 26, h: 70, w: 44, ground: forest, trunk: '#76898f', dark: '#7d9299', mid: '#8ea3a4', light: null, fill: 0.95 });
      }));
      // fields between the city and the woods
      S.layers.push(screenLayer(0.3, (ctx, t, W, H, view) => {
        groundPlane(ctx, view, { y: 0.4, bands: [[-200, 900, ['#7e9366', '#a2af8a']]], lines: [[300, 'rgba(255,240,210,0.25)', 1.2], [120, 'rgba(90,110,70,0.25)', 0.8]] });
      }));
      S.layers.push(screenLayer(0.35, (ctx, t, W, H, view) => {
        const yH = view.oy + (0.4 - view.cam.y) * view.scaleAt(view.pOf(900));
        fogBand(ctx, W, H, yH, H * 0.12, '#ffe8d6', 0.4, t, { seed: 9, speed: 0.3 });
      }));
      S.layers.push(at(60, 0.4, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: () => 0.4, spacing: 6, h: 3, width: 0.3, colors: ['#879b6f', '#96a97c'], seed: 17, wind: windField({ base: 0.12, gust: 0.25 }), fill: 0.8 })));
      // the last buildings of the city on the left
      S.layers.push(at(140, 0.5, (ctx, t) => {
        ctx.fillStyle = '#5a5d78';
        ctx.fillRect(-260, -170, 150, 171);
        ctx.fillRect(-150, -120, 80, 121);
        ctx.fillStyle = '#4d5069';
        ctx.fillRect(-120, -186, 22, 16);
        ctx.fillRect(-116, -170, 2, 6);
        ctx.fillRect(-104, -170, 2, 6);
        for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
          ctx.fillStyle = hash01(r * 7 + c) < 0.18 ? '#f2c985' : '#474a63';
          ctx.fillRect(-250 + c * 20, -158 + r * 26, 9, 12);
        }
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
          ctx.fillStyle = hash01(r * 11 + c + 50) < 0.2 ? '#f2c985' : '#474a63';
          ctx.fillRect(-140 + c * 24, -108 + r * 26, 9, 12);
        }
      }));
      // the wall the cat sits on, and the ground ahead
      const gnd = (x) => (x < 3.2 ? -8.4 : 0.4);
      S.layers.push(at(0, 0.97, (ctx, t, view) => {
        const [x0] = view.xRange(1, 0.1);
        wall(ctx, x0 - 1, 3.2, 0.4, 8.8, { wall: '#5b5f77', cap: '#6d7290', line: 'rgba(0,0,0,0.12)' });
      }));
      S.layers.push(at(-4, 1.05, (ctx, t, view, S2, p) => {
        tufts(ctx, view, p, t, { ground: () => 0.5, spacing: 1.6, h: 1.4, width: 0.12, colors: ['#5f7550', '#6f8660'], seed: 7, wind: windField({ base: 0.12, gust: 0.25 }), fill: 0.6 });
      }));
      const cat = makeCat(S, {
        ground: gnd, carry: { wear: 0.02 },
        pose0: sittingPose(0.9, 1, gnd, { hYaw: 0.3, hPitch: 0.1 }),
        light: () => ({ tint: '#d8c7d6', amt: 0.25, lift: '#2a2230' }),
        rim: () => ({ color: '#ffe0b8', dir: [0.9, -0.4], alpha: 0.7, width: 0.06 }),
      });
      const P = cat.perf;
      P.key(24, { sparkle: 0.2 }, 'inout');
      P.key(40, { hPitch: 0.15, sparkle: 0.9, eyeWide: 0.25, blush: 0.3 }, 'inout');
      P.emote(38, 'sparkle', { dur: 36, n: 4 });
      A.earTwitch(P, 46, 'L', 0.4);
      P.key(64, { sparkle: 0.3, eyeWide: 0, lid: 0.1, lidTilt: 0.4 }, 'inout');
      P.t = 70;
      A.standUp(P);
      A.wait(P, 6);
      A.jump(P, { dx: 5.0, dy: 8.8, h: 0.6, antic: 6, hold: 2, flight: 14 });
      locomote(P, { gait: 'walk', dist: 9, accel: 14 });
      S.layers.push(screenLayer(3, (ctx, t, W, H) => {
        const a = smoothstep(70, 110, t) * (1 - smoothstep(190, 222, t));
        if (a <= 0) return;
        const u = W / 1920;
        ctx.fillStyle = css('#3e3548', 0.85 * a);
        ctx.font = `${96 * u}px "ZCOOL XiaoWei", "WenQuanYi Zen Hei", "Noto Serif SC", serif`;
        ctx.textAlign = 'left';
        ctx.fillText('去看海吧', 1180 * u, 260 * u);
        ctx.font = `italic ${34 * u}px Georgia, "Times New Roman", serif`;
        ctx.fillStyle = css('#4e4458', 0.8 * a);
        ctx.fillText('There is a bigger world', 1186 * u, 320 * u);
      }));
      S.extraEvents = [{ t: 0, type: 'amb', name: 'dawn_edge' }];
    },
  });
}

export function shots() {
  return [s1_1(), s1_2(), s1_3(), s1_4(), s1_5(), s1_6(), s1_7(), s1_8(), s1_9(), s1_10()];
}
