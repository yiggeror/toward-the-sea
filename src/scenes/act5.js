// Act V — the beach: the answer (docs/treatment_v2.md E1–E5 + end card).
import { shot } from '../film/shot.js';
import { TITLE, ITALIC } from '../film/fonts.js';
import { makeCat, follow, screenLayer, layer, at, standingPose } from '../film/kit.js';
import { viewCat, closeUp } from '../film/cast.js';
import { CardProp } from '../film/prop.js';
import { drawCard, cardArt, CARD } from '../film/postcard.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { tufts, windField } from '../env/nature.js';
import { glints, particles } from '../env/light.js';
import { BEACH, catMorning, beachGrade, beachPost, swashEdge } from './sea.js';
import { beachSet, beach3Post, clipAboveDune, onGround } from './beach3.js';
import { stageToWorld } from '../film/persp.js';
import { retime } from './v1.js';
import { Track } from '../core/tracks.js';
import { css, mix } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';

const waterC = 'rgb(235,245,250)';

// One beach, one sun (a morning sun low over the sea, to the right of the
// shore's run toward the headland). World: +x toward the sea, d along the shore.
const SUN = { az: 1.3, el: 0.13 };
const SEA_YAW = 1.32; // facing the sea, into the sun
const FOCAL = 1800;
const beachO = (o = {}) => Object.assign({ sun: SUN, slope: 0.25 }, o);
const backlit = { light: () => ({ tint: '#c3cde2', amt: 0.3, lift: '#0e0a08' }), rim: () => ({ color: '#fff3dc', dir: [0.15, -1], alpha: 0.95, width: 0.065 }) };
const frontlit = { light: () => ({ tint: '#fff2e2', amt: 0.08, lift: '#0e0a08' }), rim: () => ({ color: '#fff0d8', dir: [0.8, -0.6], alpha: 0.35, width: 0.05 }) };
// a camera standing at world (x, d), heading yaw; the stage plane `back` ahead
const camAt = (x, d, yaw, unit, back, o = {}) => {
  const D = FOCAL / unit;
  return Object.assign({ yaw, px: x + back * Math.sin(yaw), pd: d + back * Math.cos(yaw), dz: D - back, x: 0, z: 1 }, o);
};
const waveEvents = (waves, dur) => waves.filter((w) => w.t >= 0 && w.t < dur).map((w) => ({ t: w.t, type: 'wave_wash', dur: w.dur }));
// footfalls of a front/back-view cat as footprints for the beach
const viewPrints = (cat) => () => cat.events.filter((e) => e.type === 'step' && e.x3 !== undefined).map((e) => [e.x3, e.d3, e.t, 1]);
// a side-view performance on a (possibly turned) stage: step events and paws in world x, d
function stageMap(cam) {
  const yaw = cam.yaw || 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
  return (xs, k = 0) => [(cam.px || 0) + xs * cs + ((cam.dz || 0) + k) * sn, (cam.pd || 0) - xs * sn + ((cam.dz || 0) + k) * cs];
}
const stagePrints = (P, cam) => {
  const W = stageMap(cam);
  return () => P.events.filter((e) => e.type === 'step' && e.x !== undefined).map((e) => {
    const near = e.leg && e.leg[1] === 'n';
    const [x, d] = W(e.x + (e.leg && e.leg[0] === 'h' ? -0.04 : 0.04), near ? -0.14 : 0.14);
    return [x, d, e.t, 1];
  });
};
const stagePaws = (P, cam) => {
  const W = stageMap(cam);
  return (t) => {
    const p = P.poseAt(t, false);
    return [[p.fn[0], -0.14], [p.ff[0], 0.14], [p.hn[0], -0.14], [p.hf[0], 0.14]].map(([x, k]) => W(x, k));
  };
};
const viewPaws = (cat, dir) => (t) => {
  const k = cat.track.sample(t);
  const [fx, fd] = typeof dir === 'function' ? dir(t) : dir;
  return [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([side, fore]) => [k.x + fd * side * 0.18 + fx * fore * 0.3, k.d - fx * side * 0.18 + fd * fore * 0.3]);
};

// ---- E1 over the dune: it bursts over the crest into the light and races
// down the sand toward us, singing, and leaps at the lens -------------------
function E1() {
  const T = 92, dC = 0.4;
  const cam = { yaw: -Math.PI / 2, px: -12, pd: 0, dz: 18, x: 0, y: -0.55, z: 1, pitch: 0.2 };
  return shot({
    name: 'E1', dur: T, unit: 70, anchor: [0.5, 0.6], grade: beachGrade, xfade: 18,
    cam,
    setup(S) {
      const G = beachSet(S, beachO({ rest: 12, gulls: 2, fenceGap: (d) => Math.abs(d - dC) < 1.5, grassGap: (x, d) => Math.abs(d - dC) < 0.8 }));
      S.post = beach3Post(S, beachPost);
      const c = G.crest(dC);
      const hop = (u) => Math.sin(Math.PI * clamp(u, 0, 1));
      const pos = (t) => {
        if (t < 16) {
          const x = lerp(c - 3.2, c - 0.5, t / 16);
          return { x, y: G.gy(x, dC), air: 0, stride: 1.1 };
        }
        if (t < 26) {
          const u = (t - 16) / 10, x = lerp(c - 0.5, c + 2.4, u);
          return { x, y: G.gy(x, dC) - 0.9 * hop(u), air: hop(u * 1.1), stride: 1 };
        }
        if (t < 68) {
          const x = lerp(c + 2.4, -10.4, (t - 26) / 42);
          return { x, y: G.gy(x, dC), air: 0, stride: 1.2 };
        }
        if (t < 74) return { x: lerp(-10.4, -9.8, (t - 68) / 6), y: 0, air: 0, stride: 0.8, crouch: 0.3 * Math.sin(Math.PI * (t - 68) / 6) };
        const u = (t - 74) / 18;
        return { x: lerp(-9.8, -6.4, u), y: -0.42 * Math.sin(Math.PI * u * 0.9), air: 1, stride: 1, crouch: 0 };
      };
      const cat = viewCat(S, { z: 1, mode: 'front', gait: 'run', shadow: false, ...frontlit,
        clip: (ctx, view, t, k) => {
          if (k.x < c + 0.4) clipAboveDune(ctx);
        },
        init: Object.assign({ d: dC, happy: 0.6, smile: 0.8, mouth: 0.3, mouthW: 0.6, blush: 0.35, earRot: -0.1, tail: 0.9, crouch: 0 }, pos(0)) });
      for (let t = 2; t <= T; t += 2) cat.key(t, Object.assign({ d: dC, crouch: 0 }, pos(t)), 'linear');
      cat.emote(30, 'notes', { dur: 40 });
      cat.steps(0, T);
      S.camera.key(18, {}, 'inout');
      S.camera.key(62, { pitch: 0.05 }, 'inout');
      S.camera.key(T, { pitch: 0.02, y: -1.3 }, 'inout');
      S.extraEvents = [{ t: 0, type: 'amb', name: 'beach' }, { t: 0, type: 'music_beach' }, { t: 16, type: 'jump' }, { t: 26, type: 'land', strength: 0.8 }, { t: 73, type: 'jump' }];
    },
  });
}

// ---- E2 the reverse: behind it as it lands and runs on into the sun, down to
// the water; the first thin wave slides up to its toes ---------------------
function E2() {
  const T = 130, yaw = SEA_YAW;
  const f = [Math.sin(yaw), Math.cos(yaw)], r = [Math.cos(yaw), -Math.sin(yaw)];
  const unit = 70, D = FOCAL / unit;
  const back = 6.2;
  const C = [-back * f[0], -back * f[1]];
  const waves = [{ t: -70, dur: 110, reach: 7.4 }, { t: 58, dur: 110, reach: 5.6 }];
  return shot({
    name: 'E2', dur: T, unit, anchor: [0.5, 0.56], grade: beachGrade,
    cam: { yaw, px: 0, pd: 0, dz: D - back, x: 0, y: -1.05, z: 1, pitch: -0.02 },
    setup(S) {
      // it runs a little left of the sun's path, so both read
      const g = [Math.sin(yaw - 0.24), Math.cos(yaw - 0.24)];
      const at = (s, lat = -0.3) => ({ x: C[0] + s * g[0] + lat * r[0], d: C[1] + s * g[1] + lat * r[1] });
      let cat;
      const G = beachSet(S, beachO({ rest: 9, waves, gulls: 2, prints: () => viewPrints(cat)(), paws: (t) => viewPaws(cat, [Math.sin(yaw - 0.24), Math.cos(yaw - 0.24)])(t) }));
      S.post = beach3Post(S, beachPost);
      cat = viewCat(S, { z: 1, mode: 'back', gait: 'run', ...backlit, shadowColor: '#6a5a48',
        init: Object.assign({ y: -0.9, air: 1, stride: 1, tail: 0.9, tailSway: 0.6 }, at(2.2)) });
      cat.key(5, Object.assign({ y: 0, air: 0 }, at(3.4)), 'out');
      cat.key(30, Object.assign({ stride: 1.1 }, at(8.6)), 'linear');
      cat.key(31, { gait: 'trot' }, 'hold');
      cat.key(50, Object.assign({ stride: 0.9 }, at(11.2)), 'out');
      cat.key(51, { gait: 'walk' }, 'hold');
      cat.key(64, Object.assign({ stride: 0 }, at(12.3)), 'out');
      cat.key(70, { hPitch: -0.15 }, 'inout'); // looks out at it all
      // the water comes: ears up, a hop back, then a careful sniff after it
      cat.key(84, {}, 'hold');
      cat.key(86, { earRot: -0.3, crouch: 0.15 }, 'out');
      cat.emote(85, 'exclaim', { dur: 18 });
      cat.key(89, Object.assign({ y: -0.35, air: 0.7, crouch: 0 }, at(11.95)), 'out');
      cat.key(94, Object.assign({ y: 0, air: 0 }, at(11.7)), 'in');
      cat.key(106, { crouch: 0.35, hPitch: 0.35, earRot: 0 }, 'inout');
      cat.key(112, Object.assign({ stride: 0.3 }, at(12.0)), 'inout');
      cat.key(116, { stride: 0 }, 'inout');
      cat.emote(110, 'question', { dur: 20 });
      cat.steps(4, T);
      // the camera runs a little way after it, then lets it go on alone
      S.camera.key(4, {}, 'inout');
      S.camera.key(34, { dz: D - back + 1.4 }, 'in');
      S.camera.key(70, { dz: D - back + 2.6 }, 'out');
      S.extraEvents = [...waveEvents(waves, T), { t: 5, type: 'land' }];
    },
  });
}

// ---- E3 the wave game, three-quarter from the land: chase the water back to
// the sea and pounce on the foam; then here it comes — flee, leap, laugh ----
function E3() {
  const rest = 6;
  const waves = [{ t: -50, dur: 110, reach: -0.5 }, { t: 74, dur: 110, reach: -5.5 }];
  const cam = { yaw: 0.5, px: 0, pd: 0, dz: 0, x: 0, y: -1.1, z: 1, pitch: 0.03 };
  return shot({
    name: 'E3', dur: 280, unit: 104, anchor: [0.5, 0.62], grade: beachGrade,
    cam,
    setup(S) {
      let P;
      beachSet(S, beachO({ rest, waves, prints: () => stagePrints(P, cam)(), paws: (t) => stagePaws(P, cam)(t) }));
      S.post = beach3Post(S, beachPost);
      const cat = makeCat(S, { x: -3.5, facing: 1, ...catMorning, marks: false, waterColor: waterC, pose: { eyeWide: 0.3, earRot: -0.1, sparkle: 0.4 } });
      P = cat.perf;
      S.camera.follow = follow(P, { lag: 16, lead: 8, dx: 0.4, y: 0 });
      S.camera.key(0, { x: 1 });
      // beat 1: chase the water as it slides back to the sea
      P.key(6, { smile: 0.5, mouth: 0.2, mouthW: 0.4, blush: 0.25, sparkle: 0.7 }, 'inout');
      P.t = 8;
      locomote(P, { gait: 'trot', to: 2.8, accel: 5, decel: 8, surfaceAt: () => 'sand' });
      A.pounce(P, { dx: 1.4, wiggle: 1 }); // pounces on the foam as it goes
      P.emote(P.t - 4, 'notes', { dur: 30 });
      // beat 2: here it comes — turn and flee, with a leap; it only just escapes
      const t2 = Math.max(P.t, 86);
      P.holdAll(t2 - 6);
      P.key(t2 - 2, { eyeWide: 1, earRot: 0.4, mouth: 0.4, mouthW: 0.2, smile: 0, fluff: 0.3 }, 'out');
      P.emote(t2 - 4, 'exclaim', { dur: 16 });
      P.t = t2;
      A.turnAround(P);
      P.setTiming(P.t, 1);
      locomote(P, { gait: 'run', to: -3.5, accel: 2, decel: 4, surfaceAt: () => 'sand' });
      A.jump(P, { dx: 3.6, dy: 0, h: 1.0, antic: 1, hold: 0, flight: 9 });
      P.setTiming(P.t, 2);
      P.key(P.t + 4, { happy: 1, smile: 1, mouth: 0.45, mouthW: 0.8, blush: 0.5, eyeWide: 0, fluff: 0 }, 'inout'); // laughing
      // …and it turns back to face the sea (the brace plays in E3c)
      const t3 = Math.max(P.t + 8, 168);
      P.t = t3;
      A.turnAround(P);
      S.extraEvents = waveEvents(waves, 280);
      S.dur = P.t + 2;
    },
  });
}

// ---- E3c from the water: it walks back down, plants its paws, braces… and
// the sheet of water rushes past the lens and over its paws ------------------
function E3c() {
  const yaw = -Math.PI / 2 + 0.25;
  const f = [Math.sin(yaw), Math.cos(yaw)];
  const unit = 90, D = FOCAL / unit;
  const pv = [-1, 0], dz = 16;
  const C = [pv[0] + (dz - D) * f[0], pv[1] + (dz - D) * f[1]];
  const rest = 3;
  const waves = [{ t: -95, dur: 110, reach: -1.2 }, { t: 24, dur: 116, reach: -2.8 }];
  return shot({
    name: 'E3c', dur: 60, unit, anchor: [0.5, 0.6], grade: beachGrade,
    cam: { yaw, px: pv[0], pd: pv[1], dz, x: 0, y: -0.5, z: 1, pitch: -0.05 },
    setup(S) {
      let cat;
      const G = beachSet(S, beachO({ rest, waves, gulls: 1, paws: (t) => viewPaws(cat, [-f[0], -f[1]])(t) }));
      S.post = beach3Post(S, beachPost);
      const at = (s) => ({ x: C[0] + s * f[0], d: C[1] + s * f[1] });
      cat = viewCat(S, { z: 1, mode: 'front', gait: 'walk', ...frontlit, shadowColor: '#6a5a48',
        init: Object.assign({ stride: 1, happy: 0.4, smile: 0.5, blush: 0.3, earRot: -0.05 }, at(8.4)) });
      cat.key(20, Object.assign({ stride: 0.8 }, at(5.0)), 'linear');
      cat.key(26, Object.assign({ stride: 0 }, at(4.7)), 'out');
      // plants its paws, squeezes its eyes shut, braces
      cat.key(28, { happy: 0, smile: 0, blush: 0.2 }, 'inout');
      cat.key(33, { crouch: 0.3, squeeze: 1, earFlat: 0.4, earRot: 0.5, mouth: 0, fluff: 0.1 }, 'inout');
      // when does the front reach its forepaws?
      const paw = at(4.7 - 0.3);
      let tw = 40;
      for (let t = 26; t < 60; t += 0.5) if (G.shore(paw.d, t) < paw.x) { tw = Math.ceil(t); break; }
      cat.key(tw, {}, 'hold');
      cat.key(tw + 2, { squeeze: 0, eyeWide: 1, pupil: 0.9, mouth: 0.3, mouthW: 0, fluff: 0.5, earFlat: 0.1, earRot: 0.2 }, 'out');
      cat.steps(0, 28);
      S.extraEvents = [...waveEvents(waves, 60), { t: tw, type: 'wave_hit' }, { t: tw, type: 'splash', strength: 0.35 }, { t: tw + 5, type: 'splash', strength: 0.25 }];
      S.dur = tw + 6; // cut on the hit
    },
  });
}

// E3p insert at paw height: the sheet of water rushes in around its paws
function E3p() {
  const waves = [{ t: -8, dur: 130, reach: -6.5 }];
  const x0 = -3.2;
  return shot({
    name: 'E3p', dur: 54, unit: 360, anchor: [0.5, 0.56], grade: beachGrade,
    cam: { x: x0 + 0.9, y: -0.8, z: 1 },
    setup(S) {
      beachSet(S, beachO({ rest: 6, waves, slope: 0.3, gulls: 0 }));
      S.post = beach3Post(S, beachPost);
      const cat = makeCat(S, { x: x0, facing: 1, ...catMorning, marks: false, waterColor: waterC, pose: { hip: [x0 - 0.08, -0.86], archB: 0.25, squeeze: 0, eyeWide: 1, fluff: 0.5, tailA: 1.2, tailC: 0.1 } });
      const P = cat.perf;
      const fn = P.curPose().fn, ff = P.curPose().ff;
      // toes spread and curl as the cold water arrives
      P.key(4, { fnC: 0.4, ffC: 0.3 }, 'out');
      P.key(12, { fnC: 0.1, ffC: 0.1 }, 'inout');
      for (const k of [2, 6, 12, 20]) P.event(k, 'splash', { x: fn[0] + (k % 3) * 0.1, y: 0.05, strength: 0.3 });
      // water hugging the feet once the front has passed them: a translucent
      // collar around each paw and a ring of foam
      S.layers.push(screenLayer(1.2, (ctx, t, W, H, view) => {
        const edge = swashEdge(t, { rest: 6, waves });
        const sc = view.scaleAt(1);
        const X = (x) => view.ox + (x - view.cam.x) * sc, Y = (y) => view.oy + (y - view.cam.y) * sc;
        for (const [px, k] of [[fn[0], 0], [ff[0], 1], [P.curPose().hn[0], 2], [P.curPose().hf[0], 3]]) {
          if (px < edge + 0.05) continue;
          const a = smoothstep(edge + 0.05, edge + 0.6, px);
          const cx = X(px), cy = Y(0.02);
          const w = sc * (0.2 + 0.03 * Math.sin(t * 0.4 + k)), h = sc * 0.045;
          ctx.fillStyle = css('#cfe8ef', 0.55 * a);
          ctx.beginPath();
          ctx.ellipse(cx, cy - h * 0.4, w, h, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = css('#ffffff', 0.85 * a);
          ctx.lineWidth = Math.max(2, sc * 0.012);
          ctx.beginPath();
          ctx.ellipse(cx, cy - h * 0.4, w * 1.05, h * 1.1, 0, Math.PI * (0.9 + 0.1 * Math.sin(t * 0.3 + k)), Math.PI * 2.1);
          ctx.stroke();
        }
      }));
      S.extraEvents = [{ t: 0, type: 'wave_wash', dur: 54 }];
    },
  });
}
// E3b close: from stunned to delighted (the sea and the sun behind it)
function E3b() {
  return shot({
    name: 'E3b', dur: 84, unit: 100, anchor: [0.5, 0.52], grade: beachGrade,
    cam: camAt(-0.5, 0, SEA_YAW, 100, 3, { y: -1.3, pitch: 0.05 }),
    setup(S) {
      beachSet(S, beachO({ rest: 3, gulls: 2, waves: [{ t: -40, dur: 120, reach: 0.5 }] }));
      S.post = beach3Post(S, beachPost);
      for (const L of S.layers) Object.assign(L, { blur: 8, group: 'beach' });
      const cu = closeUp(S, {
        x: 0.5, y: 0.66, scale: 0.55, light: () => ({ tint: '#fff2e2', amt: 0.1, lift: '#0e0a08' }),
        init: { hYaw: -0.05, eyeWide: 1, pupil: 0.9, mouth: 0.3, mouthW: 0, fluff: 0.5, earRot: 0.1 },
        over(ctx, t, an, { s }) {
          // splashes flying up in front of it as it stomps
          if (t < 34) return;
          for (let i = 0; i < 18; i++) {
            const per = 20 + (i % 5) * 3;
            const a = ((t - 34 + i * 7) % per) / per;
            const x = ctx.canvas.width * (0.3 + 0.4 * hash01(i * 3 + Math.floor((t - 34 + i * 7) / per))), y0 = ctx.canvas.height * 1.02;
            ctx.fillStyle = css('#f2fbff', 0.85 * (1 - a));
            ctx.beginPath();
            ctx.arc(x + (hash01(i) - 0.5) * a * s * 0.6, y0 - Math.sin(a * Math.PI) * s * (0.4 + 0.5 * hash01(i * 7)), s * 0.015, 0, TAU);
            ctx.fill();
          }
        },
      });
      cu.key(14, {}, 'hold');
      cu.key(22, { eyeWide: 0.2, mouth: 0.1 }, 'inout'); // a beat…
      cu.key(30, { happy: 1, eye: 0, smile: 1, mouth: 0.6, mouthW: 0.8, tongue: 0.6, blush: 0.6, sparkle: 0, earRot: -0.1, hPitch: 0.15, hRoll: 0.12 }, 'out');
      cu.emote(32, 'notes', { dur: 50 });
      for (let k = 0; k < 4; k++) cu.key(38 + k * 10, { hRoll: k % 2 ? -0.1 : 0.14, low: k % 2 ? 0.04 : 0 }, 'inout');
    },
  });
}

// ---- E4 the card comes back — blank ----------------------------------------
function blankCard(g, w, h, t) {
  // paper swollen and grey-white, the picture washed out to a ghost
  g.fillStyle = '#efece4';
  g.fillRect(-w / 2, -h / 2, w, h);
  const b = w * 0.045;
  const gg = g.createLinearGradient(0, -h / 2, 0, h / 2);
  gg.addColorStop(0, 'rgba(150,190,220,0.18)');
  gg.addColorStop(0.45, 'rgba(160,200,225,0.1)');
  gg.addColorStop(1, 'rgba(90,140,180,0.16)');
  g.fillStyle = gg;
  g.fillRect(-w / 2 + b, -h / 2 + b, w - 2 * b, h - 2 * b);
  // the faintest trace of the lighthouse cap
  g.fillStyle = 'rgba(200,80,70,0.12)';
  g.fillRect(w * 0.28, -h * 0.26, w * 0.02, h * 0.02);
  // water stains, a torn corner, the fold
  g.strokeStyle = 'rgba(150,135,110,0.3)';
  g.lineWidth = w * 0.004;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.ellipse(-w * 0.2 + i * w * 0.14, h * (0.1 - 0.08 * i), w * (0.06 + 0.03 * i), h * (0.07 + 0.03 * i), 0, 0, TAU);
    g.stroke();
  }
  g.strokeStyle = 'rgba(120,110,95,0.35)';
  g.beginPath();
  g.moveTo(w * 0.12, -h / 2);
  g.lineTo(0, h / 2);
  g.stroke();
}
function E4a() {
  return shot({
    name: 'E4a', dur: 90, unit: 100, anchor: [0.5, 0.5], post: beachPost, grade: beachGrade,
    setup(S) {
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        const k = W / 1920;
        // wet sand from above, a film of water sliding over and back
        ctx.fillStyle = '#b89f80';
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 1400; i++) {
          ctx.fillStyle = hash01(i * 3) < 0.5 ? 'rgba(120,95,70,0.25)' : 'rgba(255,245,225,0.3)';
          ctx.fillRect(hash01(i * 7) * W, hash01(i * 11) * H, 2.5 * k, 2.5 * k);
        }
        const sweep = 0.5 + 0.5 * Math.sin((t / 90) * Math.PI * 2 - 1.2);
        const edgeY = H * (1.05 - 0.9 * sweep);
        const g = ctx.createLinearGradient(0, edgeY, 0, H);
        g.addColorStop(0, 'rgba(214,238,242,0.62)');
        g.addColorStop(1, 'rgba(143,207,200,0.45)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let i = 0; i <= 30; i++) ctx.lineTo((i / 30) * W, edgeY + Math.sin(i * 1.3 + t * 0.1) * 14 * k);
        ctx.lineTo(W, H);
        ctx.fill();
        // lacy foam at the edge
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 5 * k;
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const x = (i / 60) * W, y = edgeY + Math.sin(i * 1.3 + t * 0.1) * 14 * k;
          if (hash01(i * 3 + Math.floor(t / 6)) < 0.25) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // the card, lying in the wash, nudged by the water
        ctx.save();
        ctx.translate(W * 0.52 + sweep * 10 * k, H * 0.6 + sweep * 8 * k);
        ctx.rotate(0.12 + sweep * 0.03);
        const cw = W * 0.34, ch = cw * CARD.h / CARD.w;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(-cw / 2 + 6 * k, -ch / 2 + 8 * k, cw, ch);
        blankCard(ctx, cw, ch, t);
        ctx.restore();
        glints(ctx, 0, 0, W, H, t, { n: 20, seed: 9, size: 7 * k, speed: 0.2, alpha: 0.8 });
        // two white paws step in at the top of the frame
        const pin = smoothstep(30, 44, t);
        for (const sx of [-1, 1]) {
          const px = W * 0.5 + sx * W * 0.07, py = -H * 0.08 + pin * H * 0.2 + (sx > 0 ? 6 * k : 0);
          ctx.fillStyle = '#f7efe7';
          ctx.strokeStyle = '#3a3333';
          ctx.lineWidth = 3 * k;
          ctx.beginPath();
          ctx.ellipse(px, py, W * 0.045, H * 0.07, 0, 0, TAU);
          ctx.fill();
          ctx.stroke();
          for (const dx of [-0.35, 0, 0.35]) {
            ctx.beginPath();
            ctx.moveTo(px + dx * W * 0.045, py + H * 0.03);
            ctx.lineTo(px + dx * W * 0.042, py + H * 0.065);
            ctx.stroke();
          }
        }
      }));
      S.extraEvents = [{ t: 0, type: 'wave_wash', dur: 90 }, { t: 0, type: 'music_card_back' }];
    },
  });
}
// E4b close: it knows the card — its picture is gone; then it looks up, past
// us, at the real sea (behind the camera), and smiles
function E4b() {
  return shot({
    name: 'E4b', dur: 120, unit: 100, anchor: [0.5, 0.5], grade: beachGrade,
    cam: camAt(1.2, 0, -Math.PI / 2 + 0.35, 100, 3, { y: -1.6, pitch: 0.12 }),
    setup(S) {
      beachSet(S, beachO({ rest: 3, gulls: 1 }));
      S.post = beach3Post(S, beachPost);
      for (const L of S.layers) Object.assign(L, { blur: 8, group: 'beach' });
      const cu = closeUp(S, {
        x: 0.5, y: 0.66, scale: 0.55, light: () => ({ tint: '#fff2e2', amt: 0.1, lift: '#0e0a08' }),
        init: { hYaw: 0.1, hPitch: -0.4, lookY: -0.8, eyeWide: 0.4, earRot: 0 },
      });
      cu.key(20, { eyeWide: 0.6, sad: 0.2 }, 'inout'); // recognising it
      cu.key(40, { sad: 0.35, tear: 0.3 }, 'inout');
      cu.key(56, {}, 'hold');
      cu.key(74, { hPitch: 0.2, lookY: 0.4, lookX: 0.2, hYaw: -0.15, sad: 0, reflect: 0.9, sparkle: 0.5, tear: 0.5 }, 'inout'); // …up at the sea
      cu.key(96, { smile: 0.8, blush: 0.4, mouth: 0.12, mouthW: 0.6 }, 'inout');
      cu.key(118, { happy: 0.6, smile: 1 }, 'inout');
    },
  });
}
// E4c over its shoulder, facing the sea: the backwash draws the blank card out
// into the glitter; it watches it go, content
function E4c() {
  const T = 110, yaw = SEA_YAW;
  const f = [Math.sin(yaw), Math.cos(yaw)], r = [Math.cos(yaw), -Math.sin(yaw)];
  const unit = 110, D = FOCAL / unit;
  const pv = [3.4, 0], back = 5.6;
  const waves = [{ t: -30, dur: 120, reach: 3.85 }, { t: 78, dur: 110, reach: 5.4 }];
  const rest = 7.2;
  return shot({
    name: 'E4c', dur: T, unit, anchor: [0.5, 0.55], grade: beachGrade,
    cam: { yaw, px: pv[0], pd: pv[1], dz: D - back, x: 0, y: -2.3, z: 1, pitch: -0.12 },
    setup(S) {
      let cat;
      const G = beachSet(S, beachO({ rest, waves, gulls: 2, paws: (t) => viewPaws(cat, f)(t).slice(0, 2) }));
      S.post = beach3Post(S, beachPost);
      const cx = pv[0] - 1.05 * r[0], cd = pv[1] - 1.05 * r[1];
      cat = viewCat(S, { z: 1, mode: 'sitBack', ...backlit, shadowColor: '#6a5a48',
        init: { x: cx, d: cd, y: 0, tail: 0.6, hYaw: 0, hPitch: -0.1 } });
      cat.key(30, { hPitch: 0.05, hYaw: 0.08 }, 'inout');
      cat.key(70, { hPitch: 0.12, hYaw: 0.14 }, 'inout');
      cat.emote(64, 'sparkle', { dur: 30, n: 3 });
      // the card rides the backwash out, turning, and sinks into the glitter
      const c0 = [pv[0] + 1.0 * f[0] + 1.15 * r[0], pv[1] + 1.0 * f[1] + 1.15 * r[1]];
      const cardAt = (t) => {
        const u = smoothstep(10, 104, t);
        const s = Math.pow(u, 1.25) * 7.5;
        return { x: c0[0] + s * f[0] + Math.sin(t * 0.03) * 0.25, d: c0[1] + s * f[1] + 0.8 * u * r[1], ang: 0.3 + t * 0.006 + Math.sin(t * 0.05) * 0.1, vis: 1 - smoothstep(70, 108, t) };
      };
      S.layers.push(screenLayer(0.5, (ctx, t, W, H, view) => {
        const q = cardAt(t);
        if (q.vis <= 0.01) return;
        onGround(ctx, view, q.x, -0.01, q.d, (g) => {
          g.rotate(q.ang);
          g.globalAlpha = q.vis;
          const w = 1.7, h = (w * CARD.h) / CARD.w;
          // the water darkened around the soaked card, then the card
          g.fillStyle = 'rgba(40,90,110,0.22)';
          g.beginPath();
          g.ellipse(0.04, 0.05, w * 0.62, h * 0.66, 0, 0, TAU);
          g.fill();
          blankCard(g, w, h, t);
          g.strokeStyle = 'rgba(120,110,95,0.5)';
          g.lineWidth = 0.02;
          g.strokeRect(-w / 2, -h / 2, w, h);
          g.strokeStyle = 'rgba(255,255,255,0.85)';
          g.lineWidth = 0.035;
          g.beginPath();
          g.ellipse(0, 0, w * 0.64, h * 0.7, 0, Math.PI * (0.05 + 0.05 * Math.sin(t * 0.1)), Math.PI * 1.25);
          g.stroke();
        });
      }));
      S.extraEvents = waveEvents(waves, T);
    },
  });
}

// ---- E5 along the water's edge toward the lighthouse; the camera cranes up
// and away until it is a speck on the long beach ------------------------------
function E5() {
  const T = 300, unit = 70, D = FOCAL / unit;
  const rest = 7, slope = 0.25;
  const waves = [];
  for (let i = 0; i < 6; i++) waves.push({ t: -20 + i * 55, dur: 100, reach: 4.5 + (i % 2) * 0.8 });
  return shot({
    name: 'E5', dur: T, unit, anchor: [0.5, 0.58], fadeOut: 60, grade: beachGrade,
    cam: { yaw: 0, px: 3.8, pd: -3, dz: D - 5, x: 0, y: -1.3, z: 1, pitch: 0.02 },
    setup(S) {
      let cat;
      const G = beachSet(S, beachO({ rest, slope, waves, lag: 0.35, gulls: 3, prints: () => viewPrints(cat)(), paws: (t) => viewPaws(cat, [0, 1])(t) }));
      S.post = beach3Post(S, beachPost);
      const xOf = (d) => rest - 2.1 + d * slope + G.meander(d);
      const dOf = (t) => -1 + Math.pow(t / T, 1.1) * 64;
      cat = viewCat(S, { z: 1, mode: 'back', gait: 'trot', ...backlit, rim: () => ({ color: '#fff4e0', dir: [0.7, -0.7], alpha: 0.6, width: 0.05 }), shadowColor: '#8a7458',
        init: { x: xOf(dOf(0)), d: dOf(0), stride: 1, tail: 0.9, tailSway: 0.7, hYaw: 0.2 } });
      for (let k = 1; k <= 30; k++) {
        const t = (T * k) / 30, d = dOf(t);
        cat.key(t, { d, x: xOf(d) }, 'linear');
      }
      cat.key(40, { hYaw: 0.5 }, 'inout'); // a glance back
      cat.key(70, { hYaw: 0 }, 'inout');
      cat.steps(0, T);
      // crane up and back: the beach, the dunes, the sea, the headland
      S.camera.key(40, {}, 'inout');
      S.camera.key(T, { y: -30, pd: -44, px: -2, pitch: -0.42 }, 'inout');
      S.extraEvents = [...waveEvents(waves, T), { t: 150, type: 'music_end' }];
    },
  });
}

// ---- end card ----------------------------------------------------------------
function End() {
  return shot({
    name: 'end', dur: 264, unit: 60, anchor: [0.5, 0.5], fadeIn: 30, fadeOut: 60,
    setup(S) {
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        ctx.fillStyle = '#0d0c10';
        ctx.fillRect(0, 0, W, H);
        const u = W / 1920;
        const a = smoothstep(10, 50, t);
        ctx.textAlign = 'center';
        ctx.fillStyle = css('#efe6da', a);
        ctx.font = `${92 * u}px ${TITLE}`;
        ctx.fillText('去看海吧', W / 2, H * 0.42);
        ctx.font = `italic 500 ${38 * u}px ${ITALIC}`;
        ctx.fillStyle = css('#b9ad9f', a);
        ctx.fillText('There is a bigger world', W / 2, H * 0.495);
        const b = smoothstep(60, 100, t);
        ctx.font = `${26 * u}px ${TITLE}`;
        ctx.fillStyle = css('#8f8579', b);
        ctx.fillText('逐帧程序动画 · 每一帧画面都由代码绘制', W / 2, H * 0.62);
        ctx.fillText('原创配乐由程序作曲与合成 · 音效来自 Freesound 的 CC0 录音 · 详见 CREDITS', W / 2, H * 0.665);
      }));
    },
  });
}

export function shots() {
  return [E1(), E2(), E3(), E3c(), E3p(), E3b(), E4a(), E4b(), E4c(), E5(), End()];
}

// ---- lab: the 3D beach from four headings (temporary) -------------------------
function X(name, cam, o = {}) {
  return shot({
    name, dur: 48, unit: 80, anchor: [0.5, 0.6], grade: beachGrade,
    cam: Object.assign({ x: 0, y: -1.4, z: 1, dz: 0 }, cam),
    setup(S) {
      beachSet(S, Object.assign({ rest: 6, waves: [{ t: 0, dur: 110, reach: -2 }] }, o));
      S.post = beach3Post(S, beachPost);
    },
  });
}
export function labShots() {
  // cameras placed near the stage: C = pivot + (dz - D) f, D = 22.5 at unit 80
  return [X('X0', { yaw: 0 }), X('X1', { yaw: Math.PI / 2 - 0.25, dz: 20, px: 0 }, { sun: { az: 1.3, el: 0.16 } }), X('X2', { yaw: -Math.PI / 2, pitch: 0.12, dz: 16, y: -0.8 }), X('X3', { yaw: 0.7, dz: 12 }), X('X4', { yaw: 0, y: -12, pitch: -0.35 })];
}
