// Act II's storm in 3D (docs/treatment_v2.md B12–B14): the open hill plateau
// in the gale, the thunder crack, and the bus shelter in the rain — seen from
// ahead, from the side, from behind as the cat runs for its light, and from
// inside looking back out at the storm.
import { shot } from '../film/shot.js';
import { makeCat, screenLayer, follow } from '../film/kit.js';
import { viewCat } from '../film/cast.js';
import { toCam, projC, nearC, fill3, path3, camPos } from '../film/persp.js';
import { woodsLayout, drawWoods } from '../env/woods.js';
import { rain, flashAt } from '../env/weather.js';
import { lampGlow } from '../env/light.js';
import { stormSky, catStorm, SHELTER_DAY, headwind } from './storm.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { css, mix } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep } from '../core/math.js';

const FOCAL = 1800;
// the hill: a long slope up to a plateau at d = 120
export const HILL = woodsLayout({ seed: 21, d0: -60, d1: 520, density: 0, treeGap: 25, cover: 1500, kinds: { grass: 0.9, flower: 0.04, stone: 0.06 }, pathAmp: 1.5, pathW: 2.2, gy: (x, d) => -0.16 * clamp(d, 0, 120) });
export const STORMPAL = { haze: '#8e97a6', hazeFar: '#a4acb8', ground: '#4f6145', groundFar: '#7c8a7a', path: '#8a8068', grass: ['#566a47', '#6b8058', '#7a8f63', '#8ea173'], flowers: ['#d8d4c8', '#cfc27a', '#b7a0b0', '#a9a0c8'], sun: '#dfe6ff', moss: '#5a6a44', stone: '#7a7a74', stoneLit: '#9a9a92' };
export const gale = (x, t) => -0.9 - 0.4 * Math.max(0, Math.sin(x * 0.05 + t * 0.2)) - 0.1 * Math.sin(t * 0.7 + x);
const TOP = -0.16 * 120; // the plateau

// the bus shelter on the plateau, its open front facing back down the path (−d)
export const SH = { d: 214, w: 7, deep: 7, h: 16, bench: 3.9 };
SH.x = HILL.pathX(SH.d) + 0.6;
// no grass growing through the floor
HILL.items = HILL.items.filter((it) => !(Math.abs(it.x - SH.x) < SH.w + 2.5 && it.d > SH.d - 3 && it.d < SH.d + SH.deep + 3));

const stormGrade = (strikes, k = 0.55) => (t) => ({ vignette: 0.45, vignetteColor: '#1d2129', grain: 0.5, tint: '#aab2c2', tintAmt: 0.22, flash: flashAt(t, strikes || []) * k });
const stormPost = { bloom: { threshold: 0.82, knee: 0.12, strength: 0.5, radius: 24, tint: '#dfe6ff' } };
// a camera standing at world (x, d) with its eye `h` above the plateau
const camAt = (x, d, yaw, unit, back, h, o = {}) => {
  const D = FOCAL / unit;
  return Object.assign({ yaw, px: x + back * Math.sin(yaw), pd: d + back * Math.cos(yaw), dz: D - back, x: 0, y: TOP - h, z: 1 }, o);
};

function hillSet(S, o = {}) {
  stormSky(S, { cloudSpeed: o.cloudSpeed ?? 24, dark: true, strikes: o.strikes, curtains: 5 });
  S.layers.push(screenLayer(0.2, (ctx, t, W, H, view) => drawWoods(ctx, view, HILL, { t, wind: gale, pal: STORMPAL, fogD: 200, flecks: 0, clearNear: o.clearNear, clearItems: o.clearItems, edgeKeep: o.edgeKeep })));
  if (o.shelter !== false) S.layers.push(screenLayer(0.3, (ctx, t, W, H, view) => drawShelter(ctx, view, t, o.lamp ?? 1)));
  // gusts: pale streaks racing low over the grass
  S.layers.push(screenLayer(2.4, (ctx, t, W, H) => {
    ctx.strokeStyle = 'rgba(220,228,240,0.16)';
    ctx.lineWidth = 1.2 * W / 1920;
    const dir = o.windDir ?? 1;
    for (let i = 0; i < 22; i++) {
      const y = H * (0.35 + 0.6 * hash01(i * 3)), x = ((hash01(i * 7) + t * 0.035 * (1 + hash01(i))) % 1.3 - 0.15) * W;
      const X = dir > 0 ? W - x : x;
      ctx.beginPath();
      ctx.moveTo(X, y);
      ctx.quadraticCurveTo(X - dir * 70 * W / 1920, y - 6, X - dir * 180 * W / 1920, y + 3);
      ctx.stroke();
    }
  }));
  if (o.rain !== false) S.layers.push(Object.assign(screenLayer(2.5, (ctx, t, W, H, view) => {
    ctx.save();
    if (o.rainClip) o.rainClip(ctx, view, t);
    rain(ctx, W, H, t, { density: o.rainDensity ?? 1.2, angle: o.rainAngle ?? -0.3, speed: 0.12, color: '#c9d3e1', alpha: 0.5, seed: o.seed ?? 5 });
    ctx.restore();
  })));
}

// ---- the shelter in 3D ---------------------------------------------------------
function drawShelter(ctx, view, t, lamp) {
  const P = SHELTER_DAY;
  const { x, d, w, deep, h, bench } = SH;
  const g = TOP, f = g - 0.5; // ground, floor slab top
  const [cx, cd] = camPos(view);
  const inside = Math.abs(cx - x) < w && cd > d - 1 && cd < d + deep;
  const K = view.W / 1920;
  // floor slab
  fill3(ctx, view, [[x - w - 1, f, d - 1], [x + w + 1, f, d - 1], [x + w + 1, f, d + deep + 0.5], [x - w - 1, f, d + deep + 0.5]], css(mix(P.floor, '#d9a86c', 0.3 * lamp)));
  fill3(ctx, view, [[x - w - 1, f, d - 1], [x + w + 1, f, d - 1], [x + w + 1, g, d - 1], [x - w - 1, g, d - 1]], css(mix(P.floor, '#1c2029', 0.3)));
  // back wall: corrugated panels, damp, a timetable
  const back = d + deep;
  const warm = (c, k) => css(mix(c, '#e8b878', k * lamp));
  const wg = ctx.createLinearGradient(0, projC(view, toCam(view, x, f - h, back))[1], 0, projC(view, toCam(view, x, f, back))[1]);
  wg.addColorStop(0, warm(P.wall, 0.5));
  wg.addColorStop(0.55, warm(P.wall, 0.3));
  wg.addColorStop(1, warm(P.wall, 0.15));
  fill3(ctx, view, [[x - w, f, back], [x + w, f, back], [x + w, f - h, back], [x - w, f - h, back]], wg);
  for (let u = x - w; u < x + w; u += 1.2) fill3(ctx, view, [[u, f, back - 0.01], [u + 0.45, f, back - 0.01], [u + 0.45, f - h, back - 0.01], [u, f - h, back - 0.01]], warm(P.wallShade, 0.25));
  fill3(ctx, view, [[x - 3.5, f - 13, back - 0.02], [x + 1, f - 13, back - 0.02], [x + 1, f - 7.2, back - 0.02], [x - 3.5, f - 7.2, back - 0.02]], P.poster);
  for (let i = 0; i < 5; i++) fill3(ctx, view, [[x - 3, f - 12.2 + i * 1.0, back - 0.03], [x - (i % 2) * 1.2, f - 12.2 + i * 1.0, back - 0.03], [x - (i % 2) * 1.2, f - 11.9 + i * 1.0, back - 0.03], [x - 3, f - 11.9 + i * 1.0, back - 0.03]], P.posterInk);
  // bench along the back
  const b0 = x - 5.5, b1 = x + 5.5, bd0 = back - 2.4, bd1 = back - 0.3, by = f - bench;
  for (const bx of [b0 + 1, b1 - 1.5]) fill3(ctx, view, [[bx, f, bd0 + 0.4], [bx + 0.5, f, bd0 + 0.4], [bx + 0.5, by, bd0 + 0.4], [bx, by, bd0 + 0.4]], P.benchShade);
  fill3(ctx, view, [[b0, by, bd0], [b1, by, bd0], [b1, by, bd1], [b0, by, bd1]], warm(P.bench, 0.35));
  fill3(ctx, view, [[b0, by, bd0], [b1, by, bd0], [b1, by + 0.7, bd0], [b0, by + 0.7, bd0]], P.benchShade);
  // side walls: framed panes of scratched glass
  for (const sx of [x - w, x + w]) {
    fill3(ctx, view, [[sx, f, d], [sx, f, back], [sx, f - h, back], [sx, f - h, d]], css('#9aa6b8', 0.18));
    for (const [yy, hh] of [[0, 0.8], [h * 0.45, 0.4], [h - 0.8, 0.8]]) fill3(ctx, view, [[sx, f - yy, d], [sx, f - yy, back], [sx, f - yy - hh, back], [sx, f - yy - hh, d]], P.post);
  }
  // the lamp: a tube under the roof; warm light on the floor, the bench, the wall
  const ly = f - h + 2.2, ld = d + deep * 0.4;
  if (lamp > 0.01) {
    const q = toCam(view, x + 2, ly, ld);
    if (q[2] > nearC(view)) {
      const s = (view.base * view.cam.z * view.D) / q[2];
      const [X, Y] = projC(view, q);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      lampGlow(ctx, X, Y, 9 * s, '#ffd9a0', 0.75 * lamp, 0.05);
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const [yy, a] of [[f - 0.02, 0.32], [by - 0.02, 0.28]]) {
      const qq = toCam(view, x + 1, yy, ld + 1);
      if (qq[2] <= nearC(view)) continue;
      const s = (view.base * view.cam.z * view.D) / qq[2];
      const [X, Y] = projC(view, qq);
      const r = 12 * s;
      const gg = ctx.createRadialGradient(X, Y, 0, X, Y, r);
      gg.addColorStop(0, css('#ffcf90', a * lamp));
      gg.addColorStop(1, css('#ffcf90', 0));
      ctx.save();
      ctx.translate(X, Y);
      ctx.scale(1, 0.35);
      ctx.translate(-X, -Y);
      ctx.fillStyle = gg;
      ctx.fillRect(X - r, Y - r, 2 * r, 2 * r);
      ctx.restore();
    }
    // light spilling out of the front onto the wet ground
    const qo = toCam(view, x + 1, g - 0.02, d - 3);
    if (qo[2] > nearC(view)) {
      const s = (view.base * view.cam.z * view.D) / qo[2];
      const [X, Y] = projC(view, qo);
      const r = 14 * s;
      const gg = ctx.createRadialGradient(X, Y, 0, X, Y, r);
      gg.addColorStop(0, css('#ffcf90', 0.22 * lamp));
      gg.addColorStop(1, css('#ffcf90', 0));
      ctx.save();
      ctx.translate(X, Y);
      ctx.scale(1, 0.3);
      ctx.translate(-X, -Y);
      ctx.fillStyle = gg;
      ctx.fillRect(X - r, Y - r, 2 * r, 2 * r);
      ctx.restore();
    }
    ctx.restore();
    // a warm wash over the inside (screen-space, bounded by the back wall's outline)
    ctx.save();
    if (path3(ctx, view, [[x - w, f, back - 0.05], [x + w, f, back - 0.05], [x + w, f - h, back - 0.05], [x - w, f - h, back - 0.05]])) {
      ctx.clip();
      const qw = toCam(view, x + 2, ly + 4, back);
      if (qw[2] > nearC(view)) {
        const s = (view.base * view.cam.z * view.D) / qw[2];
        const [X, Y] = projC(view, qw);
        const gg = ctx.createRadialGradient(X, Y, 0, X, Y, 20 * s);
        gg.addColorStop(0, css('#ffd9a0', 0.55 * lamp));
        gg.addColorStop(0.6, css('#ffcf90', 0.16 * lamp));
        gg.addColorStop(1, css('#ffcf90', 0));
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = gg;
        ctx.fillRect(X - 20 * s, Y - 20 * s, 40 * s, 40 * s);
      }
    }
    ctx.restore();
    fill3(ctx, view, [[x - 0.4, ly - 0.35, ld], [x + 4.4, ly - 0.35, ld], [x + 4.4, ly, ld], [x - 0.4, ly, ld]], '#2a2d36');
    fill3(ctx, view, [[x - 0.1, ly, ld], [x + 4.1, ly, ld], [x + 4.1, ly + 0.28, ld], [x - 0.1, ly + 0.28, ld]], css('#fff1cf', lamp));
  }
  // posts at the open front
  for (const sx of [x - w, x + w]) fill3(ctx, view, [[sx - 0.35, f, d], [sx + 0.35, f, d], [sx + 0.35, f - h, d], [sx - 0.35, f - h, d]], P.post);
  // the roof, a slab with a corrugated edge, overhanging the front
  const r0 = f - h, r1 = r0 - 1.2;
  if (!inside || true) {
    fill3(ctx, view, [[x - w - 2.5, r0, d - 2], [x + w + 2.5, r0, d - 2], [x + w + 2.5, r0, back + 1], [x - w - 2.5, r0, back + 1]], P.roofEdge);
    fill3(ctx, view, [[x - w - 2.5, r1, d - 2], [x + w + 2.5, r1, d - 2], [x + w + 2.5, r1, back + 1], [x - w - 2.5, r1, back + 1]], P.roof);
    fill3(ctx, view, [[x - w - 2.5, r0, d - 2], [x + w + 2.5, r0, d - 2], [x + w + 2.5, r1, d - 2], [x - w - 2.5, r1, d - 2]], P.roofEdge);
  }
  // drips off the front edge of the roof
  ctx.strokeStyle = css('#dfe6f2', 0.7);
  ctx.lineWidth = Math.max(1 * K, 1.8 * K);
  ctx.beginPath();
  for (let i = 0; i < 90; i++) {
    const xx = x - w - 2.3 + (i / 90) * (2 * w + 4.6);
    const ph = hash01(i * 7) * 30;
    const yy = r0 + ((t * 2.2 + ph * 3) % 18);
    if (yy > g) continue;
    const a = toCam(view, xx, yy, d - 2), b = toCam(view, xx, yy + 1.6, d - 2);
    if (a[2] <= nearC(view) || b[2] <= nearC(view)) continue;
    const A2 = projC(view, a), B2 = projC(view, b);
    ctx.moveTo(A2[0], A2[1]);
    ctx.lineTo(B2[0], B2[1]);
  }
  ctx.stroke();
  // the stop sign on its pole
  const px = x + w + 4, pd = d - 1.5;
  fill3(ctx, view, [[px - 0.2, g, pd], [px + 0.2, g, pd], [px + 0.2, g - 20, pd], [px - 0.2, g - 20, pd]], P.post);
  const qs = toCam(view, px, g - 21, pd);
  if (qs[2] > nearC(view)) {
    const s = (view.base * view.cam.z * view.D) / qs[2];
    const [X, Y] = projC(view, qs);
    ctx.fillStyle = P.sign;
    ctx.beginPath();
    ctx.arc(X, Y, 1.6 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = P.signInk;
    ctx.fillRect(X - 0.9 * s, Y - 0.3 * s, 1.8 * s, 0.6 * s);
  }
}

// the open front of the shelter as a screen clip (what is seen out of it)
function clipToOpening(ctx, view) {
  const { x, d, w, h } = SH;
  const f = TOP - 0.5;
  if (!path3(ctx, view, [[x - w, f + 0.5, d - 0.1], [x + w, f + 0.5, d - 0.1], [x + w, f - h, d - 0.1], [x - w, f - h, d - 0.1]])) return;
  ctx.clip();
}

// ---- B12 ahead of it: it runs at us through the gale; lightning ------------------
export function B12() {
  const T = 108;
  const strikes = [{ t: 58, x: 0.28, y: 0.35, amt: 0.85 }];
  const d0 = 166, d1 = 186;
  const cam = camAt(HILL.pathX(d1 + 6) + 1.3, d1 + 6, Math.PI + 0.26, 80, 4, 0.75, { pitch: 0.05 });
  return shot({
    name: 'B12', dur: T, unit: 80, anchor: [0.5, 0.6], grade: stormGrade(strikes), post: stormPost,
    cam,
    setup(S) {
      hillSet(S, { strikes, clearNear: 5, clearItems: 7, edgeKeep: 0.18, windDir: 1 });
      const cat = viewCat(S, { z: 1, mode: 'front', gait: 'run', card: { wear: 0.28 }, ...catStorm, shadow: false,
        init: { x: HILL.pathX(d0), d: d0, y: TOP, stride: 1.1, crouch: 0.15, earFlat: 0.55, earRot: 0.6, lid: 0.45, fluff: 0.6, hPitch: -0.1 } });
      for (let k = 1; k <= 12; k++) {
        const t = (T * k) / 12, d = lerp(d0, d1, k / 12);
        cat.key(t, { d, x: HILL.pathX(d) - 0.6 * (k / 12) }, 'linear');
      }
      // the flash: it flinches, eyes shut, then runs on
      cat.key(57, {}, 'hold');
      cat.key(60, { lid: 1, squeeze: 1, earFlat: 0.9, crouch: 0.3 }, 'out');
      cat.key(74, { lid: 0.45, squeeze: 0, earFlat: 0.55, crouch: 0.15 }, 'inout');
      cat.steps(0, T);
      S.extraEvents = strikes.map((s) => ({ t: s.t, type: 'thunder_far', amt: s.amt }));
    },
  });
}

// ---- B13 the thunder crack, from the side: it leaps in fright, then bolts ------
export function B13() {
  const strikes = [{ t: 22, x: 0.62, y: 0.55, amt: 1 }];
  // a turned stage: stage +x runs up the path toward the shelter
  const yaw = -Math.PI / 2 + 0.32, unit = 100;
  const px = HILL.pathX(192), pd = 192;
  return shot({
    name: 'B13', dur: 84, unit, anchor: [0.5, 0.64], grade: stormGrade(strikes, 0.85), post: stormPost,
    cam: { yaw, px, pd, dz: 0, x: 0, y: TOP - 1.3, z: 1, pitch: 0.04 },
    setup(S) {
      hillSet(S, { strikes, clearNear: 7, clearItems: 10, edgeKeep: 0.2, windDir: 1, seed: 7 });
      const cat = makeCat(S, { x: -6, facing: 1, ground: () => TOP, carry: { wear: 0.3 }, wind: headwind(0.6), ...catStorm, marks: false });
      const P = cat.perf;
      P.setTiming(0, 1);
      P.t = 0;
      locomote(P, { gait: 'trot', to: -0.2, accel: 1, decel: 6 });
      P.t = Math.max(P.t, 22);
      A.startle(P);
      P.setTiming(P.t, 1);
      locomote(P, { gait: 'run', dist: 14, accel: 4 });
      S.camera.follow = follow(P, { lag: 10, lead: 6, dx: 1.2 });
      S.camera.key(0, { shake: 0 });
      S.camera.key(22, { shake: 0 }, 'linear');
      S.camera.key(24, { shake: 3 }, 'linear');
      S.camera.key(40, { shake: 0 }, 'out');
      S.extraEvents = [{ t: 22, type: 'thunder_crack' }];
    },
  });
}

// ---- B14 behind it, running for the light of the shelter; under the roof it
// stops, shakes the rain off and lets out a breath — we stay out in the rain --
export function B14() {
  const T = 156;
  const d0 = SH.d - 32, dIn = SH.d + 1.4;
  const unit = 70;
  const cam = camAt(HILL.pathX(SH.d - 37) + 0.3, SH.d - 37, 0.02, unit, 4, 1.0, { pitch: 0.06 });
  const tArr = 72, sh0 = 86, sh1 = 104;
  return shot({
    name: 'B14', dur: T, unit, anchor: [0.5, 0.62], grade: stormGrade([]), post: stormPost,
    cam,
    setup(S) {
      hillSet(S, { clearNear: 5, clearItems: 6, edgeKeep: 0.2, windDir: -1, seed: 9 });
      const f = TOP - 0.5;
      const cat = viewCat(S, { z: 1, mode: 'back', gait: 'run', card: { wear: 0.33 }, ...catStorm, shadowColor: '#1e1a18',
        light: (t) => ({ tint: t > tArr ? '#e8c9a0' : '#aab4c8', amt: t > tArr ? 0.2 : 0.35, lift: '#15181e' }),
        init: { x: HILL.pathX(d0), d: d0, y: TOP, stride: 1.1, crouch: 0.12, earFlat: 0.5, tail: 0.3, tailLow: 0.7, fluff: 0.6 } });
      const path = (u) => {
        const d = lerp(d0, dIn, u);
        return { d, x: lerp(HILL.pathX(d), SH.x - 0.8, smoothstep(0.4, 1, u)) };
      };
      for (let k = 1; k <= 10; k++) {
        const u = k / 10, t = tArr * u;
        const p = path(u);
        cat.key(t, Object.assign({ y: p.d > SH.d - 0.8 ? f : TOP }, p), 'linear');
      }
      cat.key(tArr + 8, Object.assign({ stride: 0 }, path(1), { d: dIn + 0.6 }), 'out');
      cat.key(tArr + 9, { gait: 'walk' }, 'hold');
      // the shake: a shiver from head to tail, water flying off
      cat.key(sh0, { lid: 1, squeeze: 1, earFlat: 0.2 }, 'out');
      for (let t = sh0 + 2, k = 0; t < sh1; t += 2, k++) cat.key(t, { hRoll: k % 2 ? -0.24 : 0.24, lean: k % 2 ? -0.1 : 0.1, fluff: 1, tailSway: 1 }, 'linear');
      cat.key(sh1, { hRoll: 0, lean: 0, fluff: 1.1, squeeze: 0, lid: 0.3, tailSway: 0.4 }, 'out');
      cat.emote(sh1 + 6, 'sweat', { dur: 26 });
      cat.key(sh1 + 14, { fluff: 0.8, tail: 0.6, tailLow: 0 }, 'inout'); // phew: the tail comes up
      cat.key(T - 20, { hYaw: 0.35 }, 'inout'); // a glance back at the rain
      cat.steps(0, tArr + 8);
      // droplets flung off during the shake
      S.layers.push(screenLayer(1.02, (ctx, t, W, H, view) => {
        if (t < sh0 || t > sh1 + 8) return;
        const k = cat.track.sample(t);
        const q = toCam(view, k.x, k.y - 0.8, k.d);
        if (q[2] < nearC(view)) return;
        const s = (view.base * view.cam.z * view.D) / q[2];
        const [X, Y] = projC(view, q);
        ctx.fillStyle = 'rgba(230,236,250,0.85)';
        for (let i = 0; i < 44; i++) {
          const t0 = sh0 + hash01(i * 3) * (sh1 - sh0);
          const a = (t - t0) / 10;
          if (a < 0 || a > 1) continue;
          const ang = hash01(i * 7) * TAU;
          const r = (0.5 + 1.5 * a) * s;
          ctx.beginPath();
          ctx.arc(X + Math.cos(ang) * r, Y + Math.sin(ang) * r * 0.7 + a * a * 0.9 * s, Math.max(1, 0.035 * s * (1 - a * 0.5)), 0, TAU);
          ctx.fill();
        }
      }));
      // the camera drifts after it, stopping out in the rain short of the roof
      S.camera.key(0, {}, 'in');
      S.camera.key(tArr + 12, { dz: FOCAL / unit - 4 + 25 }, 'out');
      S.camera.key(T, { dz: FOCAL / unit - 4 + 27, y: TOP - 1.2 }, 'inout');
      S.extraEvents = [{ t: tArr, type: 'shelter' }, { t: tArr, type: 'amb', name: 'rain_shelter' }, { t: sh0, type: 'shake' }];
    },
  });
}
