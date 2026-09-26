// Act II — the journey, a montage cut to the music (docs/treatment_v2.md B1–B16).
import { shot } from '../film/shot.js';
import { makeCat, follow, ramp, screenLayer, layer, at, sittingPose, standingPose } from '../film/kit.js';
import { viewCat, closeUp } from '../film/cast.js';
import { P3, S3, fill3, path3, line3, wallX, floorY, faceD, onPlane, toCam, projC, nearC } from '../film/persp.js';
import { woodsLayout, drawWoods, woodsFar, WOODS, streamD } from '../env/woods.js';
import { rock } from '../env/nature.js';
import { retime } from './v1.js';
import { drawSeaView, SEA } from '../film/seaview.js';
import { drawCatBack } from '../cat/views.js';
import { stars, moon } from '../env/sky.js';
import { rain, snow } from '../env/weather.js';
import { stormSky, STORM } from './storm.js';
import { HILL, STORMPAL, gale, B12, B13, B14 } from './storm3.js';
import { CardProp } from '../film/prop.js';
import { drawCard } from '../film/postcard.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { skyGradient, glow, clouds } from '../env/sky.js';
import { lampGlow, fogBand, particles, bokeh } from '../env/light.js';
import { lightShafts } from '../env/weather.js';
import { windField } from '../env/nature.js';
import { butterfly, butterflyPos } from '../env/creatures.js';
import { Track } from '../core/tracks.js';
import { css, mix } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep } from '../core/math.js';

const BPM = 96, BEAT = (60 / BPM) * 24; // frames per beat (15)
export const STREAM = { d: 230, w: 10.6 };
export const WOOD = woodsLayout({ seed: 7, d0: -80, d1: 460, stream: STREAM });
const breeze = windField({ base: 0.12, gust: 0.3, speed: 0.12, wave: 0.08 });
const dayGrade = { vignette: 0.34, vignetteColor: '#2f3d2c', grain: 0.3, topGlow: '#fff2c4', topGlowAmt: 0.1 };
const catDay = () => ({ tint: '#fff2d8', amt: 0.1, lift: '#101008' });
const sunRim = () => ({ color: '#fff3c8', dir: [-0.5, -0.86], alpha: 0.75, width: 0.05 });

function woodsSet(S, o = {}) {
  const n0 = S.layers.length;
  const sunX = o.sunX ?? 0.22;
  S.layers.push(screenLayer(0, (ctx, t, W, H, view) => {
    skyGradient(ctx, W, H, WOODS.sky);
    woodsFar(ctx, view, { t });
    glow(ctx, W * sunX, H * 0.05, W * 0.5, '#fff4cc', 0.6);
  }));
  S.layers.push(screenLayer(0.2, (ctx, t, W, H, view) => {
    drawWoods(ctx, view, WOOD, { t, wind: breeze, only: o.split ? 'far' : undefined, splitD: o.split, clearNear: o.clearNear, clearItems: o.clearItems ?? o.split, edgeKeep: o.edgeKeep ?? 0 });
    fogBand(ctx, W, H, view.oy - H * 0.04, H * 0.2, '#eef3dc', 0.22, t, { seed: 6, speed: 0.2 });
  }));
  S.layers.push(screenLayer(0.25, (ctx, t, W, H) => lightShafts(ctx, W, H, t, { x0: sunX - 0.1, spread: 0.7, n: 7, angle: 0.3, color: WOODS.sun, alpha: 0.12, seed: 7 })));
  if (o.blur) for (let i = n0; i < S.layers.length; i++) Object.assign(S.layers[i], { blur: o.blur, group: 'woods' });
  if (o.split) {
    // the nearest plants, in front of the cat and softly out of focus
    // (only a few, kept to the frame edges — no big blurred blades across the picture)
    S.layers.push(Object.assign(screenLayer(1.5, (ctx, t, W, H, view) => drawWoods(ctx, view, WOOD, { t, wind: breeze, only: 'near', splitD: o.split, clearNear: o.clearNear, clearItems: o.clearItems ?? o.split, edgeKeep: o.edgeKeep ?? 0 })), { blur: o.nearBlur ?? 3 }));
  }
  S.layers.push(screenLayer(2.5, (ctx, t, W, H) => particles(ctx, W, H, t, { n: 40, seed: 4, color: ['#fff6d8', '#fff0b0'], alpha: 0.7, size: 2.2, vx: 0.25, vy: -0.08, glow: 3, twinkle: 0.06 })));
  S.post = { rays: { pos: [sunX, 0.04], strength: 0.4, length: 0.6, threshold: 0.9, knee: 0.08, samples: 16, tint: '#ffe9a8' }, bloom: { threshold: 0.9, knee: 0.1, strength: 0.35, radius: 20, tint: '#fff2c8' } };
}

// ---- B1 low in the grass: Xiaohui trots toward us down the forest path ----
function B1() {
  const dA = 33, dB = -10;
  return shot({
    name: 'B1', dur: BEAT * 8, unit: 100, anchor: [0.5, 0.62], grade: dayGrade,
    cam: { x: WOOD.pathX(dB - 8) + 1.8, y: -1.3, z: 1, dz: 0 },
    setup(S) {
      S.camera.move(0, BEAT * 8, { dz: 2, x: WOOD.pathX(dB - 8) + 0.9 }, 'inout');
      woodsSet(S, { split: 9 });
      const cat = viewCat(S, { z: 1, mode: 'front', gait: 'trot', card: { wear: 0.06 }, light: catDay, rim: sunRim, shadowColor: '#2c3a20',
        init: { x: WOOD.pathX(dA), d: dA, stride: 1, tail: 0.8, hYaw: 0.1, hPitch: 0.05 } });
      const T = BEAT * 8;
      for (let k = 1; k <= 8; k++) {
        const u = k / 8, d = lerp(dA, dB, u);
        cat.key(T * u, { d, x: WOOD.pathX(d) }, 'linear');
      }
      cat.key(T * 0.6, { hYaw: -0.25, lookX: -0.3 }, 'inout');
      cat.key(T * 0.8, { hYaw: 0.15, lookX: 0.1, sparkle: 0.4 }, 'inout');
      S.extraEvents = [{ t: 0, type: 'amb', name: 'forest' }, { t: 0, type: 'music_journey' }];
    },
  });
}

// side views of the wood look across the path (camera turned to −x); screen
// right is further along the path (+d)
function woodSide(dP, o = {}) {
  return Object.assign({ yaw: -Math.PI / 2, px: WOOD.pathX(dP), pd: dP, x: 0, y: -1.6, z: 1, dz: 0 }, o);
}
// butterfly around a guide path (stage coords)
function flutter(S, guide, o = {}) {
  S.layers.push(layer(1, o.z ?? 1.3, (ctx, t) => {
    if (o.from !== undefined && t < o.from) return;
    if (o.to !== undefined && t >= o.to) return;
    const [x, y] = o.pos ? o.pos(t) : butterflyPos(t, guide, o.seed ?? 3);
    const [x2] = o.pos ? o.pos(t + 2) : butterflyPos(t + 2, guide, o.seed ?? 3);
    butterfly(ctx, x, y, t, { size: o.size ?? 0.34, dir: x2 >= x ? 1 : -1, color: '#f6e7a6', color2: '#e6b85a' });
  }));
}

// ---- B2 side: a butterfly circles its head as it trots ----------------------
function B2() {
  const dP = 60;
  return shot({
    name: 'B2', dur: BEAT * 4, unit: 165, anchor: [0.46, 0.62], grade: dayGrade,
    cam: woodSide(dP, { x: -2, y: -1.25, yaw: -Math.PI / 2 + 0.45 }),
    setup(S) {
      woodsSet(S, { split: 8, sunX: 0.7, clearNear: 14 });
      const cat = makeCat(S, { x: -6, facing: 1, carry: { wear: 0.06 }, light: catDay, rim: sunRim });
      const P = cat.perf;
      locomote(P, { gait: 'trot', dist: 12, accel: 1, decel: 1 });
      S.camera.follow = follow(P, { lag: 8, lead: 6, dx: 0.8 });
      // the butterfly loops around its head; the head (not the body) follows it
      const hx = (t) => P.poseAt(t, false).hip[0] + 1.7;
      const pos = (t) => [hx(t) + Math.cos(t * 0.11) * 1.1, -2.9 + Math.sin(t * 0.22) * 0.6];
      flutter(S, null, { pos, size: 0.45 });
      for (let k = 0; k < 4; k++) P.key(8 + k * 12, { hYaw: 0.35 + 0.35 * Math.sin(k * 1.6), hPitch: 0.25 + 0.2 * Math.cos(k * 1.6), lookY: 0.5, lookX: 0.3 * Math.sin(k * 1.6) }, 'inout');
      P.key(56, { eyeWide: 0.3, sparkle: 0.5 }, 'inout');
    },
  });
}

// ---- B3 extreme close-up: it lands on the card — crossed eyes -------------
function B3() {
  return shot({
    name: 'B3', dur: BEAT * 8, unit: 100, anchor: [0.5, 0.5], grade: dayGrade,
    cam: { x: WOOD.pathX(70) + 0.8, y: -1.8, z: 1, dz: 50 },
    setup(S) {
      woodsSet(S, { blur: 9 });
      const land = 30, off = 96;
      const cu = closeUp(S, {
        x: 0.44, y: 0.56, scale: 0.52, drift: 0.5, card: { wear: 0.06, ang: 0.35, sx: 0.6 },
        light: () => ({ tint: '#fff2d8', amt: 0.08, lift: '#100c08' }),
        init: { hYaw: -0.18, hPitch: 0.1, lookY: 0.4, lookX: 0.35, earRot: 0.1 },
        over(ctx, t, an, { s }) {
          // the butterfly: flutters down, lands on the card's top edge, opens
          // and closes its wings, then lifts off toward us
          const m = an.P([0.44, -0.32, -0.02]);
          const a = 0.35, ex = m[0] + Math.cos(a) * 0.42 * s, ey = m[1] + Math.sin(a) * 0.42 * s - 0.03 * s;
          let x, y, tt = t, size = 0.34 * s;
          if (t < land) {
            const u = t / land;
            x = lerp(ex + 0.6 * s, ex, u) + Math.sin(t * 0.4) * 0.05 * s;
            y = lerp(ey - 0.9 * s, ey, u * u) + Math.sin(t * 0.7) * 0.04 * s;
          } else if (t < off) {
            x = ex;
            y = ey;
            tt = land + (t - land) * 0.12; // slow wing breathing while perched
          } else {
            const u = (t - off) / 24;
            x = ex + u * 0.3 * s;
            y = ey - u * u * 1.2 * s;
            size = 0.34 * s * (1 + u * 0.8);
          }
          butterfly(ctx, x, y, tt, { size, dir: 1, color: '#f6e7a6', color2: '#e6b85a', tilt: t < off && t >= land ? 0.1 : 0 });
        },
      });
      cu.key(land - 6, { lookY: -0.1, lookX: 0.1 }, 'inout');
      cu.key(land + 6, { cross: 1, lookY: -0.45, lookX: 0, eyeWide: 0.1, lid: 0.12, hPitch: -0.05, earRot: -0.1, earLR: 0.2 }, 'inout');
      cu.key(land + 30, { cross: 1, whisk: 0.5 }, 'inout');
      cu.key(land + 40, { whisk: -0.2, earRR: 0.4 }, 'inout');
      cu.key(land + 52, { earRR: 0, whisk: 0.3 }, 'inout');
      cu.key(off - 2, { cross: 1 }, 'hold');
      cu.key(off + 6, { cross: 0, lid: 0, lookY: 0.7, lookX: 0.3, hPitch: 0.35, eyeWide: 0.5, sparkle: 0.6 }, 'out');
      cu.key(BEAT * 8, { hPitch: 0.4 }, 'inout');
      S.extraEvents = [{ t: land, type: 'flutter_land' }, { t: off, type: 'flutter_off' }];
    },
  });
}

// ---- B4 side: drops the card, pounces — misses — sits, looks up ------------
function B4() {
  const dP = 80;
  return shot({
    name: 'B4', dur: BEAT * 8, unit: 150, anchor: [0.46, 0.66], grade: dayGrade,
    cam: woodSide(dP, { x: 1.5, y: -1.8, yaw: -Math.PI / 2 + 0.3 }),
    setup(S) {
      woodsSet(S, { split: 7, sunX: 0.7, clearNear: 16 });
      let tRel = 1e9;
      const cat = makeCat(S, { x: -1.5, facing: 1, carry: { wear: 0.06, on: (t) => t < tRel }, light: catDay, rim: sunRim, pose: { hYaw: 0.5, hPitch: 0.35, lookY: 0.6 } });
      const P = cat.perf;
      const card = new CardProp({ x: 0, y: 0.05, sx: 1, sy: 0.3, skew: -0.3, scale: 1.2, vis: 0 });
      P.t = 2;
      tRel = A.putDown(P);
      card.key(tRel - 1, { vis: 0 }, 'step');
      card.key(tRel, { vis: 1, x: P.poseAt(tRel).hip[0] + 1.9 }, 'step');
      S.layers.push(layer(1, 0.999, (ctx, t) => card.draw(ctx, t, { wear: 0.06, px: 512 })));
      P.key(P.t, { hYaw: 0.5, hPitch: 0.3, lookY: 0.5 }, 'inout');
      const tp = P.t;
      A.pounce(P, { dx: 2.6, wiggle: 2 });
      // lands on nothing: it looks at its empty paws, then up
      P.key(P.t + 4, { hPitch: -0.3, lookY: -0.6, eyeWide: 0.3 }, 'inout');
      P.t += 8;
      A.sit(P);
      P.key(P.t + 2, { hPitch: 0.45, lookY: 0.8, hYaw: 0.55, earRot: -0.05 }, 'inout');
      P.emote(P.t + 4, 'question', { dur: 30 });
      // the butterfly: low over the card, lifts just as the cat leaps
      const bx0 = P.poseAt(0).hip[0] + 3.6;
      const pos = (t) => {
        const u = smoothstep(tp + 20, tp + 40, t);
        return [bx0 + Math.sin(t * 0.09) * 0.5 + u * 1.5, -1.1 - u * 3.2 + Math.sin(t * 0.3) * 0.15];
      };
      flutter(S, null, { pos, size: 0.42 });
    },
  });
}

// ---- B5 closer: picks the card back up as if nothing happened --------------
function B5() {
  const dP = 84;
  return shot({
    name: 'B5', dur: BEAT * 4, unit: 150, anchor: [0.5, 0.62], grade: dayGrade,
    cam: woodSide(dP, { x: 1.2, y: -1.5, yaw: -Math.PI / 2 + 0.55 }),
    setup(S) {
      woodsSet(S, { blur: 3, sunX: 0.6, clearNear: 10 });
      const tPick = 22;
      const cat = makeCat(S, { x: -0.4, facing: 1, carry: { wear: 0.06, on: (t) => t >= tPick }, light: catDay, rim: sunRim, pose: { lid: 0.3, hYaw: 0.1 } });
      const P = cat.perf;
      const card = new CardProp({ x: 2.15, y: 0.05, sx: 1, sy: 0.3, skew: -0.3, scale: 1.2 });
      P.key(4, { hYaw: 0.9, lookX: 0.6, lid: 0.25 }, 'inout'); // a glance around: nobody saw
      P.key(12, { hYaw: 0.2, lookX: 0 }, 'inout');
      P.key(19, { neck: -0.2, neckLen: 1.15, hPitch: -0.85, hip: [-0.25, -0.95], pitch: -0.05, mouth: 0.35 }, 'inout');
      P.key(tPick, { mouth: 0.08, hPitch: -0.9 }, 'out');
      P.event(tPick, 'pickup', {});
      P.key(tPick + 8, { neck: 0.7, neckLen: 1.0, hPitch: 0.2, hip: [-0.4, -1.02], pitch: 0.06, tailA: 0.8, tailC: 0.9, lid: 0, smile: 0.3 }, 'out');
      P.t = tPick + 12;
      locomote(P, { gait: 'trot', dist: 5, accel: 6 });
      card.key(tPick - 1, {}, 'linear');
      card.key(tPick, { vis: 0 }, 'step');
      S.layers.push(layer(1, 0.999, (ctx, t) => card.draw(ctx, t, { wear: 0.06, px: 512 })));
    },
  });
}

// ---- B6 the stream: stone to stone — a hind paw slips in --------------------
// stage x 0 = the stream's near bank at the path crossing
const sGround = (x) => (x < 0.4 ? 0 : x >= 2.5 && x <= 4.7 ? -0.55 : x >= 6.8 && x <= 9.0 ? -0.6 : x >= 11 ? 0 : 0.9);
function stones(S) {
  S.layers.push(at(0, 0.95, (ctx, t) => {
    rock(ctx, 3.6, 0.9, 2.3, 1.45, ['#a19b8f', '#c3bdb0', null, '#7da157'], 8);
    rock(ctx, 7.9, 0.9, 2.3, 1.5, ['#a19b8f', '#c3bdb0', null, '#7da157'], 9);
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
}
const bankD = () => streamD(STREAM, WOOD.pathX(STREAM.d)) - STREAM.w / 2 - 0.2;
function B6() {
  return shot({
    name: 'B6', dur: BEAT * 10, unit: 80, anchor: [0.5, 0.6], grade: dayGrade,
    cam: woodSide(0, { pd: bankD() + 0.4, x: 2, y: -1.9 }),
    setup(S) {
      woodsSet(S, { split: 6, sunX: 0.5, clearNear: 18 });
      stones(S);
      const cat = makeCat(S, { x: -4, facing: 1, ground: sGround, carry: { wear: 0.06 }, light: catDay, rim: sunRim });
      const P = cat.perf;
      S.camera.follow = follow(P, { lag: 10, lead: 8, dx: 1.0, y: 0.4 });
      P.t = 2;
      locomote(P, { gait: 'trot', to: -1.4, accel: 6, decel: 8 });
      A.look(P, P.t - 4, 6, { yaw: 0.3, pitch: -0.3, lookY: -0.6 });
      P.t += 2;
      A.jump(P, { dx: 4.35, dy: -0.55, h: 0.65, antic: 6, hold: 2, flight: 10 });
      A.wait(P, 2);
      A.jump(P, { dx: 4.3, dy: -0.05, h: 0.6, antic: 6, hold: 1, flight: 10 });
      // the hind paw slips off the back of the stone into the water
      const ts = P.t + 3;
      const hn = P.curPose().hn;
      P.key(ts, {}, 'hold');
      P.setTiming(ts, 1);
      P.key(ts + 3, { hn: [hn[0] - 0.55, 0.3], hnC: 0.3, hip: [P.curPose().hip[0] - 0.1, -0.84], pitch: -0.1, archB: 0.2 }, 'in');
      P.event(ts + 3, 'splash', { x: hn[0] - 0.55, y: 0.4, strength: 0.8 });
      P.key(ts + 5, { eyeWide: 0.9, earRot: 0.7, earFlat: 0.3, fluff: 0.8, tailA: 1.0, tailC: 0.1, mouth: 0.3 }, 'out');
      P.emote(ts + 4, 'exclaim', { dur: 18 });
      P.setTiming(ts + 8, 2);
      S.extraEvents = [{ t: ts + 3, type: 'music_stop' }];
      S.dur = Math.min(S.dur, ts + 20);
    },
  });
}

// ---- B8 close-up: wet, offended, shakes it off -----------------------------
function B8() {
  return shot({
    name: 'B8', dur: BEAT * 6, unit: 100, anchor: [0.5, 0.5], grade: dayGrade,
    cam: { x: WOOD.pathX(STREAM.d + 12) - 1, y: -1.6, z: 1, dz: STREAM.d + 5 },
    setup(S) {
      woodsSet(S, { blur: 10 });
      const tShake = 34;
      const cu = closeUp(S, {
        x: 0.5, y: 0.62, scale: 0.55, drift: 0.4, card: { wear: 0.1, ang: 0.4, sx: 0.55 },
        light: () => ({ tint: '#f4f0e0', amt: 0.1, lift: '#100c08' }),
        init: { hYaw: 0.05, hPitch: -0.12, sad: 0.8, lid: 0.25, earRot: 0.7, earFlat: 0.6, fluff: 0.7, whiskDroop: 0.8, smile: -0.5, wobble: 0.4, lookY: -0.2 },
        over(ctx, t, an, { s }) {
          // drops running off the chin and whiskers
          ctx.fillStyle = 'rgba(210,235,255,0.8)';
          for (let i = 0; i < 6; i++) {
            const per = 14 + i * 3;
            const a = ((t + i * 7) % per) / per;
            const base = an.P([0.3 + 0.05 * i, -0.45, (i - 2.5) * 0.12]);
            if (t > tShake && t < tShake + 18) continue;
            ctx.beginPath();
            ctx.ellipse(base[0], base[1] + a * a * 0.5 * s, 0.012 * s, 0.022 * s, 0, 0, TAU);
            ctx.fill();
          }
          if (t >= tShake && t < tShake + 20) {
            const u = (t - tShake) / 20;
            const c = an.P([0, 0, 0]);
            for (let i = 0; i < 26; i++) {
              const ang = hash01(i * 3) * TAU, v = 0.6 + hash01(i * 7);
              ctx.fillStyle = css('#d8ecff', 0.85 * (1 - u));
              ctx.beginPath();
              ctx.arc(c[0] + Math.cos(ang) * u * v * 1.1 * s, c[1] + Math.sin(ang) * u * v * 0.7 * s + u * u * 0.4 * s, 0.012 * s, 0, TAU);
              ctx.fill();
            }
          }
        },
      });
      cu.key(12, { wobble: 0.6, tear: 0.35 }, 'inout');
      cu.key(tShake - 4, { squeeze: 1, earFlat: 0.8 }, 'inout');
      const sh = [0.5, -0.45, 0.45, -0.35, 0.25, -0.1];
      sh.forEach((y, i) => cu.key(tShake + i * 2, { hYaw: y, hRoll: -y * 0.4 }, 'inout'));
      cu.key(tShake + 16, { hYaw: 0.05, hRoll: 0, squeeze: 0, fluff: 1, earFlat: 0.2, earRot: 0.3, sad: 0.2, lid: 0.3, lidTilt: 0.4, tear: 0, wobble: 0, smile: -0.2, puff: 0.7 }, 'out');
      cu.key(tShake + 40, { puff: 0.3, lid: 0.1, lidTilt: 0.6, earRot: 0, sad: 0, hPitch: 0.05 }, 'inout'); // …onward
      S.extraEvents = [{ t: tShake, type: 'headshake' }, { t: tShake + 20, type: 'music_resume' }];
    },
  });
}// ---- B9 four inserts on the beat: paws on grass, leaves, mud, gravel -------
const GROUNDS = {
  grass: { ground: '#5d8a3e', far: '#9fbf7a', bits: ['#4b7c35', '#6a9e43', '#8cbc58'], kind: 'blade', surface: 'grass' },
  leaves: { ground: '#7a6a45', far: '#b9a979', bits: ['#c98a3e', '#a8703a', '#d9a650', '#8a5a2a', '#e0b860'], kind: 'leaf', surface: 'leaves' },
  mud: { ground: '#5a4a38', far: '#8c7a62', bits: ['#3f3328', '#6f5c48'], kind: 'mud', surface: 'mud' },
  gravel: { ground: '#8d8a82', far: '#bdb8ac', bits: ['#6f6b64', '#a6a198', '#c9c4b8', '#57534d'], kind: 'pebble', surface: 'gravel' },
};
function B9(kind, i) {
  const G = GROUNDS[kind];
  return shot({
    name: 'B9' + 'abcd'[i], dur: BEAT * 2, unit: 520, anchor: [0.5, 0.45], grade: dayGrade,
    cam: { x: 0, y: -0.2, z: 1 },
    setup(S) {
      S.layers.push(screenLayer(0, (ctx, t, W, H, view) => {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, css(kind === 'gravel' ? '#c8d0cc' : '#cfe0c0'));
        g.addColorStop(0.33, css(G.far));
        g.addColorStop(1, css(G.ground));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // ground cover scattered on the plane, far to near (camera tracks the paws)
        const K = view.base * view.cam.z * view.D;
        const items = [];
        for (let k = 0; k < 900; k++) {
          const d = -view.D * 0.62 + Math.pow(hash01(k * 3 + i * 7), 2.6) * 30;
          const x = view.cam.x + (hash01(k * 7 + i) - 0.5) * 40 + Math.floor((view.cam.x - 0) / 40) * 0;
          items.push([d, x, k]);
        }
        items.sort((a, b) => b[0] - a[0]);
        for (const [d, xx, k] of items) {
          const q = toCam(view, xx, 0, d);
          if (q[2] < view.D * 0.1) continue;
          const s = K / q[2];
          const [X, Y] = projC(view, q);
          if (X < -50 || X > W + 50 || Y < 0) continue;
          const col = G.bits[k % G.bits.length];
          ctx.fillStyle = col;
          if (G.kind === 'blade') {
            const h = (0.25 + 0.4 * hash01(k)) * s, b = (hash01(k * 5) - 0.5) * 0.6 + 0.1 * Math.sin(t * 0.1 + k);
            ctx.beginPath();
            ctx.moveTo(X - 0.02 * s, Y);
            ctx.quadraticCurveTo(X + b * h * 0.3, Y - h * 0.6, X + b * h, Y - h);
            ctx.quadraticCurveTo(X + b * h * 0.3 + 0.02 * s, Y - h * 0.6, X + 0.02 * s, Y);
            ctx.fill();
          } else if (G.kind === 'leaf') {
            const r = Math.min(0.075 * s, 40 * (W / 1920));
            const a = hash01(k) * 3;
            ctx.beginPath();
            ctx.ellipse(X, Y, r, r * 0.42, a * 0.3, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(90,50,20,0.45)';
            ctx.lineWidth = Math.max(0.6, r * 0.06);
            ctx.beginPath();
            ctx.moveTo(X - r * 0.9, Y);
            ctx.lineTo(X + r * 0.9, Y);
            ctx.stroke();
          } else if (G.kind === 'mud') {
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.ellipse(X, Y, 0.18 * s, 0.03 * s, 0, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = 1;
          } else {
            ctx.beginPath();
            ctx.ellipse(X, Y, (0.03 + 0.05 * hash01(k)) * s, (0.02 + 0.02 * hash01(k * 3)) * s, 0, 0, TAU);
            ctx.fill();
          }
        }
        if (kind === 'mud') {
          // wet sheen
          const sh = ctx.createLinearGradient(0, H * 0.35, 0, H);
          sh.addColorStop(0, 'rgba(255,245,220,0.25)');
          sh.addColorStop(1, 'rgba(255,245,220,0)');
          ctx.fillStyle = sh;
          ctx.fillRect(0, H * 0.35, W, H * 0.65);
        }
      }));
      const cat = makeCat(S, { x: -4 + 0.5 * i, facing: 1, carry: { wear: 0.1 + 0.05 * i }, light: catDay, dustColor: kind === 'mud' ? '#4a3a2a' : undefined });
      const P = cat.perf;
      locomote(P, { gait: 'walk', dist: 9, accel: 1, decel: 1, surface: G.surface });
      S.camera.follow = follow(P, { lag: 3, lead: 3, dx: 0.6 });
    },
  });
}

// ---- B10 behind it, climbing into the wind; the sky darkens ----------------
function B10() {
  return shot({
    name: 'B10', dur: BEAT * 8, unit: 90, anchor: [0.5, 0.64], grade: { vignette: 0.42, vignetteColor: '#1f2530', grain: 0.4, tint: '#b3bccb', tintAmt: 0.2 },
    post: { bloom: { threshold: 0.85, knee: 0.1, strength: 0.4, radius: 22, tint: '#dfe6ff' } },
    cam: { x: HILL.pathX(0) + 0.4, y: -1.9, z: 1, dz: 18, pitch: 0.08 },
    setup(S) {
      stormSky(S, { cloudSpeed: 22 });
      S.layers.push(screenLayer(0.2, (ctx, t, W, H, view) => drawWoods(ctx, view, HILL, { t, wind: gale, pal: STORMPAL, fogD: 260, flecks: 0 })));
      const gyAt = (d) => HILL.gy(0, d);
      const cat = viewCat(S, { z: 1, mode: 'back', gait: 'walk', card: { wear: 0.18 }, light: () => ({ tint: '#aeb6c8', amt: 0.35, lift: '#15181e' }), rim: () => ({ color: '#e1e8ff', dir: [0, -1], alpha: 0.4, width: 0.04 }), shadow: false,
        init: { x: HILL.pathX(8), d: 8, y: gyAt(8), stride: 0.8, crouch: 0.15, earFlat: 0.5, earRot: 0.5, tail: 0.3, tailSway: 0.2, tailLow: 0.85, fluff: 0.6 } });
      const T = BEAT * 8;
      for (let k = 1; k <= 8; k++) {
        const d = 8 + 18 * (k / 8);
        cat.key(T * (k / 8), { d, x: HILL.pathX(d), y: gyAt(d) }, 'linear');
      }
      cat.key(T * 0.5, { hYaw: -0.25 }, 'inout'); // squints into the gust
      cat.key(T * 0.75, { hYaw: 0 }, 'inout');
      S.camera.move(0, T, { dz: 36, y: -1.9 - 0.16 * 16 }, 'linear');
      S.layers.push(screenLayer(2.4, (ctx, t, W, H) => {
        // wind streaks and flying grass seeds
        ctx.strokeStyle = 'rgba(220,228,240,0.18)';
        ctx.lineWidth = 1.2 * W / 1920;
        for (let i = 0; i < 26; i++) {
          const y = H * hash01(i * 3), x = ((hash01(i * 7) + t * 0.035 * (1 + hash01(i))) % 1.3 - 0.15) * W;
          ctx.beginPath();
          ctx.moveTo(W - x, y);
          ctx.quadraticCurveTo(W - x - 70 * W / 1920, y - 6, W - x - 180 * W / 1920, y + 3);
          ctx.stroke();
        }
      }));
      S.extraEvents = [{ t: 0, type: 'amb', name: 'wind_hills' }, { t: 0, type: 'music_storm' }];
    },
  });
}

// ---- B11 extreme close-up: a big drop smacks onto the card -----------------
function B11() {
  return shot({
    name: 'B11', dur: BEAT * 4, unit: 100, anchor: [0.5, 0.5], grade: { vignette: 0.5, vignetteColor: '#1f2530', grain: 0.45, tint: '#b3bccb', tintAmt: 0.25 },
    cam: { x: 0, y: -2, z: 1 },
    setup(S) {
      stormSky(S, { cloudSpeed: 26, dark: true });
      const tHit = 20;
      const cu = closeUp(S, {
        x: 0.4, y: 0.52, scale: 0.6, card: { wear: 0.2, ang: 0.45, sx: 0.62 },
        light: () => ({ tint: '#aeb6c8', amt: 0.35, lift: '#15181e' }),
        init: { hYaw: -0.2, hPitch: 0.2, lookY: 0.5, earRot: 0.5, earFlat: 0.3, fluff: 0.4 },
        over(ctx, t, an, { s }) {
          const m = an.P([0.44, -0.32, -0.02]);
          const hx = m[0] + Math.cos(0.45) * 0.3 * s, hy = m[1] + Math.sin(0.45) * 0.3 * s + 0.1 * s;
          if (t < tHit) {
            const u = t / tHit;
            ctx.fillStyle = 'rgba(220,232,255,0.85)';
            ctx.beginPath();
            ctx.ellipse(hx, lerp(-0.2 * s, hy, u * u), 0.02 * s, 0.05 * s, 0, 0, TAU);
            ctx.fill();
          } else {
            const u = clamp((t - tHit) / 10, 0, 1);
            ctx.fillStyle = css('#dfe8ff', 0.8 * (1 - u));
            for (let i = 0; i < 10; i++) {
              const a = -Math.PI * (0.1 + 0.8 * (i / 9));
              ctx.beginPath();
              ctx.arc(hx + Math.cos(a) * u * 0.18 * s, hy + Math.sin(a) * u * 0.14 * s + u * u * 0.08 * s, 0.008 * s, 0, TAU);
              ctx.fill();
            }
            // a spreading wet stain on the picture
            ctx.fillStyle = css('#6a7aa8', 0.25 * smoothstep(0, 16, t - tHit));
            ctx.beginPath();
            ctx.ellipse(hx, hy + 0.02 * s, 0.05 * s * (1 + u), 0.035 * s * (1 + u), 0.45, 0, TAU);
            ctx.fill();
          }
        },
      });
      cu.key(tHit - 2, {}, 'hold');
      cu.key(tHit + 3, { hPitch: -0.25, lookY: -0.6, eyeWide: 0.6, earRot: 0.2, sad: 0.4 }, 'out');
      cu.key(tHit + 20, { sad: 0.7, lid: 0.1, earFlat: 0.5 }, 'inout');
      cu.key(BEAT * 4, { hPitch: 0.1, lookY: 0.2, sad: 0.3, lid: 0.25, lidTilt: 0.5 }, 'inout');
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => rain(ctx, W, H, t, { density: smoothstep(tHit, BEAT * 4, t) * 0.8 + 0.1, angle: -0.2, speed: 0.12, color: '#c9d3e1', alpha: 0.4, seed: 5 })));
      S.extraEvents = [{ t: tHit, type: 'drop_on_card' }, { t: tHit + 6, type: 'rain_start' }];
    },
  });
}

// ---- B15 the dream: the card's sea under the moon, a tiny cat on the shore -
function B15dream() {
  return shot({
    name: 'B15d', dur: BEAT * 8, unit: 100, anchor: [0.5, 0.5], xfade: 30, fadeOut: 0,
    grade: { vignette: 0.7, vignetteColor: '#050818', grain: 0.4 },
    post: { bloom: { threshold: 0.7, knee: 0.3, strength: 0.7, radius: 30, tint: '#dfe6ff' } },
    setup(S) {
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        const k = 1.08 - 0.06 * smoothstep(0, BEAT * 8, t);
        const w = W * k, h = H * k, x = (W - w) / 2, y = (H - h) / 2;
        drawSeaView(ctx, x, y, w, h, { palette: 'dream', t: 200 + t * 2, sunU: 0.36, sunRise: 0.16, rich: true, cloudDrift: t * 0.02 });
        // stars over the dream sea
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h * SEA.horizon);
        ctx.clip();
        stars(ctx, W, H * SEA.horizon, 140, 29, 1, t, 0.9);
        ctx.restore();
        // the lighthouse lamp turning
        const lx = x + SEA.lighthouse.u * w, ly = y + (SEA.lighthouse.v - SEA.lighthouse.h * 0.86) * h;
        const sweep = Math.cos(t * 0.05);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, w * 0.5);
        g.addColorStop(0, 'rgba(255,244,210,0.55)');
        g.addColorStop(1, 'rgba(255,244,210,0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.3 + 0.5 * Math.max(0, sweep);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        const dir = sweep > 0 ? -1 : 1;
        ctx.lineTo(lx + dir * w * 0.5 * Math.abs(sweep), ly - h * 0.06);
        ctx.lineTo(lx + dir * w * 0.5 * Math.abs(sweep), ly + h * 0.06);
        ctx.fill();
        ctx.globalAlpha = 1;
        lampGlow(ctx, lx, ly, w * 0.02, '#fff2c4', 0.9, 0.3);
        ctx.restore();
        // the tiny dreamer on the shore: a sand strip at the bottom, the cat from behind
        ctx.fillStyle = '#0d1430';
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(0, H * 0.9);
        ctx.quadraticCurveTo(W * 0.5, H * 0.86, W, H * 0.91);
        ctx.lineTo(W, H);
        ctx.fill();
        drawCatBack(ctx, { tail: 0.7, hYaw: 0.1, hPitch: 0.15, breath: 0.5 + 0.5 * Math.sin(t * 0.08) }, { x: W * 0.45, y: H * 0.905, scale: H * 0.05, flatColor: '#0b1028' });
        // a soft card-edge frame dissolving (we are inside the postcard)
        const e = 1 - smoothstep(0, 40, t);
        if (e > 0) {
          ctx.strokeStyle = css('#f6f2ea', e);
          ctx.lineWidth = W * 0.03;
          ctx.strokeRect(W * 0.015, W * 0.015, W - W * 0.03, H - W * 0.03);
        }
      }));
      S.layers.push(screenLayer(2, (ctx, t, W, H) => particles(ctx, W, H, t, { n: 30, seed: 9, color: ['#dfe6ff', '#fff4d0'], alpha: 0.5, size: 2, vx: 0.05, vy: -0.05, twinkle: 0.08 })));
      S.extraEvents = [{ t: 0, type: 'amb', name: 'dream' }, { t: 0, type: 'music_dream' }];
    },
  });
}

// ---- B15 morning: birds; it wakes on the bench ------------------------------
function B15wake() {
  return shot({
    name: 'B15w', dur: BEAT * 4, unit: 100, anchor: [0.5, 0.5], xfade: 24,
    grade: { vignette: 0.35, vignetteColor: '#4a4030', grain: 0.35, topGlow: '#fff2c4', topGlowAmt: 0.12 },
    post: { bloom: { threshold: 0.8, knee: 0.15, strength: 0.45, radius: 24, tint: '#ffe6b8' } },
    setup(S) {
      // the shelter's corrugated back wall, the low morning sun slanting across
      // it, softly out of focus; the bench plank sharp in front
      S.layers.push(Object.assign(screenLayer(0, (ctx, t, W, H) => {
        ctx.fillStyle = '#7d828e';
        ctx.fillRect(0, 0, W, H);
        for (let x = 0; x < W; x += W / 40) {
          const g = ctx.createLinearGradient(x, 0, x + W / 40, 0);
          g.addColorStop(0, 'rgba(40,44,56,0.25)');
          g.addColorStop(0.5, 'rgba(255,255,255,0.08)');
          g.addColorStop(1, 'rgba(40,44,56,0.25)');
          ctx.fillStyle = g;
          ctx.fillRect(x, 0, W / 40, H);
        }
        ctx.fillStyle = '#c9c3b2';
        ctx.fillRect(W * 0.06, H * 0.05, W * 0.14, H * 0.22);
        ctx.fillStyle = '#8a8474';
        for (let i = 0; i < 5; i++) ctx.fillRect(W * 0.075, H * (0.08 + i * 0.035), W * (0.09 - (i % 2) * 0.03), H * 0.01);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const b = ctx.createLinearGradient(W * 0.2, 0, W * 0.75, H);
        b.addColorStop(0, 'rgba(255,214,150,0)');
        b.addColorStop(0.45, 'rgba(255,214,150,0.55)');
        b.addColorStop(0.7, 'rgba(255,214,150,0.15)');
        b.addColorStop(1, 'rgba(255,214,150,0)');
        ctx.fillStyle = b;
        ctx.beginPath();
        ctx.moveTo(W * 0.35, 0);
        ctx.lineTo(W * 0.62, 0);
        ctx.lineTo(W * 0.95, H);
        ctx.lineTo(W * 0.55, H);
        ctx.fill();
        ctx.restore();
      }), { blur: 7 }));
      S.layers.push(screenLayer(0.5, (ctx, t, W, H) => {
        ctx.fillStyle = '#6b5a49';
        ctx.fillRect(0, H * 0.82, W, H * 0.2);
        ctx.fillStyle = '#8a7560';
        ctx.fillRect(0, H * 0.8, W, H * 0.03);
        ctx.fillStyle = 'rgba(255,220,160,0.35)';
        ctx.fillRect(W * 0.5, H * 0.8, W * 0.35, H * 0.025);
      }));
      S.layers.push(screenLayer(2.2, (ctx, t, W, H) => particles(ctx, W, H, t, { n: 30, seed: 12, color: ['#fff6d8', '#ffe8b0'], alpha: 0.6, size: 2, vx: 0.08, vy: -0.04, region: (u, v) => u > 0.35 && u < 0.95, twinkle: 0.05 })));
      const cu = closeUp(S, {
        x: 0.5, y: 0.78, scale: 0.5, light: () => ({ tint: '#fff0d8', amt: 0.15, lift: '#14100a' }),
        init: { hYaw: -0.3, hPitch: -0.35, hRoll: 0.25, eye: 0, low: 0.25, earRot: 0.3, earFlat: 0.2 }, idle: { blink: false },
      });
      cu.key(16, { eye: 0 }, 'hold');
      cu.key(24, { eye: 0.5, earRot: 0.1, earFlat: 0, earLR: 0.4 }, 'inout'); // a bird: an ear turns first
      cu.key(30, { eye: 0.1 }, 'inout');
      cu.key(40, { eye: 1, hPitch: 0.05, hRoll: 0.05, low: 0.1, lookX: 0.3, lookY: 0.3, earLR: 0 }, 'inout');
      cu.key(60, { hYaw: -0.15, hPitch: 0.15, sparkle: 0.3 }, 'inout');
      S.extraEvents = [{ t: 0, type: 'amb', name: 'morning' }, { t: 20, type: 'bird' }];
    },
  });
}

// ---- B16b from high above: a line of small footprints across the white -----
const trailX = (d) => 7 * Math.sin(d * 0.045) + 2 * Math.sin(d * 0.13);
// ---- B16s close-up in the snow: a flake lands on its nose — crossed eyes, as
// with the butterfly — a sneeze, and then delight: it looks up into the snow
function B16s() {
  const T = 84, tLand = 20, tSneeze = 48;
  return shot({
    name: 'B16s', dur: T, unit: 100, anchor: [0.5, 0.5],
    grade: { vignette: 0.3, vignetteColor: '#7d8fae', grain: 0.3, lift: '#e8eef8', liftAmt: 0.05 },
    post: { bloom: { threshold: 0.88, knee: 0.1, strength: 0.4, radius: 22, tint: '#f4f8ff' } },
    setup(S) {
      // the snowfield behind, soft: pale sky, a line of far peaks, white ground
      S.layers.push(Object.assign(screenLayer(0, (ctx, t, W, H) => {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#a9c2e2');
        g.addColorStop(0.55, '#e4ecf7');
        g.addColorStop(0.62, '#f4f7fc');
        g.addColorStop(1, '#ffffff');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#c3d1e6';
        ctx.beginPath();
        ctx.moveTo(0, H * 0.6);
        for (let i = 0; i <= 16; i++) ctx.lineTo((i / 16) * W, H * (0.6 - 0.05 - 0.07 * Math.abs(Math.sin(i * 1.3) * Math.cos(i * 0.7))));
        ctx.lineTo(W, H * 0.6);
        ctx.fill();
        ctx.fillStyle = 'rgba(160,180,210,0.35)';
        for (let i = 0; i < 6; i++) ctx.fillRect(0, H * (0.68 + i * 0.05), W, H * 0.012);
      }), { blur: 10 }));
      S.layers.push(Object.assign(screenLayer(0.4, (ctx, t, W, H) => snow(ctx, W, H, t, { density: 0.5, wind: 0.15, seed: 9, alpha: 0.7, layers: [[0.3, 0.5], [0.6, 0.7]] })), { blur: 3 }));
      const cu = closeUp(S, { x: 0.5, y: 0.62, scale: 0.5, drift: 0.6,
        light: () => ({ tint: '#eef3ff', amt: 0.12, lift: '#101420' }),
        init: { hYaw: 0.15, hPitch: 0.25, lookY: 0.6, lookX: 0.2, earRot: 0.1, eyeWide: 0.2 } });
      // watching the flake come down…
      cu.key(tLand - 4, { hPitch: 0.05, lookY: -0.1, lookX: 0 }, 'inout');
      // …onto its nose: crossed eyes
      cu.key(tLand, {}, 'hold');
      cu.key(tLand + 8, { cross: 1, lookY: -0.45, hPitch: -0.06, eyeWide: 0.35, earLR: 0.25, earRR: 0.25, mouth: 0.06 }, 'inout');
      cu.key(tSneeze - 12, { cross: 1 }, 'hold');
      // ah… ah…
      cu.key(tSneeze - 6, { cross: 0.3, squeeze: 0.7, hPitch: 0.22, mouth: 0.25, mouthW: 0.2, earRot: 0.4, whisk: 0.7 }, 'inout');
      cu.key(tSneeze - 1, { squeeze: 1, hPitch: 0.3, mouth: 0.35 }, 'in');
      cu.key(tSneeze + 1, { cross: 0, hPitch: -0.3, mouth: 0.7, mouthW: 0.4, earFlat: 0.6, earRot: 0.7, whisk: -0.8 }, 'out');
      cu.key(tSneeze + 6, { mouth: 0.1, hPitch: -0.15 }, 'inout');
      // then it looks up into the falling snow, delighted
      cu.key(tSneeze + 16, { squeeze: 0, earFlat: 0, earRot: 0, whisk: 0, hPitch: 0.35, lookY: 0.7, happy: 1, smile: 1, mouth: 0.35, mouthW: 0.7, tongue: 0.4, blush: 0.45 }, 'out');
      cu.emote(tSneeze + 18, 'sparkle', { dur: 26, n: 3 });
      // the flake, and the puff of crystals in the sneeze
      S.layers.push(screenLayer(2, (ctx, t, W, H) => {
        const an = cu.anchor;
        if (!an) return;
        const nose = an.P([0.49, -0.1, 0]);
        const u = an.u / 0.36;
        const flake = (x, y, r, a) => {
          ctx.strokeStyle = css('#ffffff', a);
          ctx.lineWidth = Math.max(1, r * 0.22);
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const ang = (i / 3) * Math.PI + t * 0.03;
            ctx.moveTo(x - Math.cos(ang) * r, y - Math.sin(ang) * r);
            ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
          }
          ctx.stroke();
          ctx.fillStyle = css('#ffffff', a);
          ctx.beginPath();
          ctx.arc(x, y, r * 0.3, 0, TAU);
          ctx.fill();
        };
        if (t < tLand) {
          const k = t / tLand;
          flake(nose[0] + Math.sin(t * 0.25) * u * 0.12 * (1 - k), lerp(-H * 0.05, nose[1] - u * 0.07, k), u * 0.055, 0.95);
        } else if (t < tSneeze) {
          flake(nose[0], nose[1] - u * 0.07, u * 0.055 * (1 - 0.35 * smoothstep(tLand, tSneeze, t)), 0.95);
        } else if (t < tSneeze + 12) {
          const k = (t - tSneeze) / 12;
          for (let i = 0; i < 14; i++) {
            const a = -Math.PI * (0.05 + 0.9 * hash01(i * 3)), sp = 0.3 + 0.5 * hash01(i * 7);
            ctx.fillStyle = css('#ffffff', 0.9 * (1 - k));
            ctx.beginPath();
            ctx.arc(nose[0] + Math.cos(a) * k * u * sp, nose[1] + Math.sin(a) * k * u * sp * 0.8 + k * k * u * 0.15, u * 0.012, 0, TAU);
            ctx.fill();
          }
        }
      }));
      S.extraEvents = [{ t: tLand, type: 'drop_nose' }, { t: tSneeze, type: 'sneeze' }];
    },
  });
}

function B16b() {
  const T = BEAT * 8;
  return shot({
    name: 'B16b', dur: T, unit: 60, anchor: [0.5, 0.45], fadeOut: 0,
    grade: { vignette: 0.3, vignetteColor: '#7d8fae', grain: 0.3, lift: '#e8eef8', liftAmt: 0.05 },
    post: { bloom: { threshold: 0.9, knee: 0.08, strength: 0.4, radius: 22, tint: '#f4f8ff' } },
    cam: { x: 2, y: -14, z: 1, dz: 0, pitch: -0.3 },
    setup(S) {
      S.camera.move(0, T, { y: -24, dz: -4, pitch: -0.3, x: 0 }, 'inout');
      const dCat = (t) => 12 + (t / T) * 16;
      S.layers.push(screenLayer(0, (ctx, t, W, H, view) => {
        // sky (mostly above the frame when looking down), far peaks at the horizon
        const K = view.base * view.cam.z * view.D;
        const hz = view.oy - K * Math.tan(view.cam.pitch); // horizon line
        const g = ctx.createLinearGradient(0, hz - H, 0, hz);
        g.addColorStop(0, '#9fbbe0');
        g.addColorStop(1, '#eaf1fa');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, Math.max(0, hz));
        ctx.fillStyle = '#c9d6ea';
        ctx.beginPath();
        ctx.moveTo(0, hz);
        for (let i = 0; i <= 24; i++) {
          const x = (i / 24) * W;
          ctx.lineTo(x, hz - H * (0.03 + 0.05 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6))));
        }
        ctx.lineTo(W, hz);
        ctx.fill();
        // the snowfield
        const sg = ctx.createLinearGradient(0, hz, 0, H);
        sg.addColorStop(0, '#dfe7f3');
        sg.addColorStop(0.3, '#f3f6fb');
        sg.addColorStop(1, '#ffffff');
        ctx.fillStyle = sg;
        fill3(ctx, view, floorY(0, -600, 600, -40, 2000), sg);
        // wind-carved drifts: long soft blue shadows
        for (let i = 0; i < 26; i++) {
          const d = hash01(i * 3) * 160 - 10, x = (hash01(i * 7) - 0.5) * 160;
          const pts = [];
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * TAU;
            pts.push([x + Math.cos(a) * 18, 0, d + Math.sin(a) * 2.2]);
          }
          fill3(ctx, view, pts, css('#b9c9e2', 0.22));
        }
        // the trail of little prints, fresh near the cat, softer behind
        const dc = dCat(t);
        for (let d = -30; d < dc - 1; d += 0.62) {
          const k = Math.round(d / 0.62);
          const side = k % 2 ? 1 : -1;
          const x = trailX(d) + side * 0.28;
          const pts = [];
          for (let j = 0; j < 8; j++) {
            const a = (j / 8) * TAU;
            pts.push([x + Math.cos(a) * 0.17, 0, d + Math.sin(a) * 0.24]);
          }
          fill3(ctx, view, pts, css('#8fa6c8', 0.55 - 0.25 * smoothstep(dc - 40, dc - 60, d)));
        }
        // sparkle
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 90; i++) {
          const d = hash01(i * 13) * 120, x = (hash01(i * 17) - 0.5) * 120;
          const tw = Math.max(0, Math.sin(t * 0.2 + i * 2.1));
          if (tw < 0.7) continue;
          const [X, Y] = P3(view, x, 0, d);
          ctx.fillStyle = css('#ffffff', (tw - 0.7) * 3);
          ctx.beginPath();
          ctx.arc(X, Y, 2.2 * (W / 1920), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }));
      const cat = viewCat(S, { z: 1, mode: 'back', gait: 'walk', card: { wear: 0.4 }, shadowColor: '#7890b8', shade: 0.15,
        light: () => ({ tint: '#e8eef8', amt: 0.15, lift: '#101418' }),
        init: { x: trailX(12), d: 12, stride: 0.9, crouch: 0.25, tail: 0.5, fluff: 0.5 } });
      for (let k = 1; k <= 8; k++) {
        const t = (T * k) / 8, d = dCat(t);
        cat.key(t, { d, x: trailX(d) }, 'linear');
      }
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => snow(ctx, W, H, t, { density: 0.7, wind: 0.3, seed: 5, alpha: 0.85 })));
      S.extraEvents = [];
    },
  });
}

export function shots() {
  return [
    B1(), B2(), B3(), B4(), B5(), B6(), B8(),
    B9('grass', 0), B9('leaves', 1), B9('mud', 2), B9('gravel', 3),
    B10(), B11(),
    B12(), B13(), B14(),
    retime('4.1', { name: 'B15a', from: 70, dur: BEAT * 6 }),
    retime('4.2', { name: 'B15b', from: 90, dur: BEAT * 4 }),
    B15dream(), B15wake(),
    retime('6.2', { name: 'B16a', from: 30, dur: BEAT * 7, xfade: 20, setup: (s) => { const ev = s.events; s.events = () => [{ t: 0, type: 'amb', name: 'snow' }, ...ev()]; } }),
    B16s(),
    B16b(),
  ];
}
