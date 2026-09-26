// Act III — the cape before dawn: losing the postcard (C1–C7).
// Act IV — the sea (D1–D6). docs/treatment_v2.md
import { shot } from '../film/shot.js';
import { makeCat, follow, ramp, screenLayer, layer, at, sittingPose, standingPose } from '../film/kit.js';
import { viewCat, closeUp } from '../film/cast.js';
import { P3, S3, fill3, floorY, faceD, onPlane, toCam, projC } from '../film/persp.js';
import { woodsLayout, drawWoods } from '../env/woods.js';
import { CardProp } from '../film/prop.js';
import { drawCard } from '../film/postcard.js';
import { drawSeaView } from '../film/seaview.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { skyGradient, glow, clouds, stars } from '../env/sky.js';
import { lampGlow, fogBand, particles } from '../env/light.js';
import { windStreaks } from '../env/weather.js';
import { crag } from '../env/nature.js';
import { CAPE, catDawn, tailwind, capeWind, capeGrade, capePost, capeBackdrop } from './sea.js';
import { retime } from './v1.js';
import { Track } from '../core/tracks.js';
import { css, mix } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';

// ---- the cape in 3D: a long grass slope rising toward the crest ------------
// rising to a crest at d = 150, beyond which the land falls away (to the sea)
export const capeGy = (x, d) => -0.12 * clamp(d, -80, 150) + 0.35 * Math.max(0, d - 152);
const CAPE3 = woodsLayout({ seed: 33, d0: -80, d1: 320, density: 0, cover: 2400, coverScale: 1.35, kinds: { grass: 0.96, flower: 0.04 }, noPath: true, gy: capeGy });
const CAPEPAL = {
  haze: '#9a8fb0', hazeFar: '#c9b0bc', ground: '#4a5f4e', groundFar: '#7d7f93', path: '#6b6a60',
  grass: ['#4f6b4c', '#62805a', '#7b9a6c', '#8faa7c'], flowers: ['#e8d8e0', '#f2c9a0', '#c9b3e6', '#ffffff'],
  sun: '#ffcfa8', moss: '#5a6a50', stone: '#6c6a76', stoneLit: '#9a96a6', fern: ['#3f5a40', '#4d6a48', '#62805a'],
};
const gustWind = (x, t) => 0.55 + 0.45 * Math.max(0, Math.sin(x * 0.07 - t * 0.35)) + 0.12 * Math.sin(t * 0.9 + x);
function capeSet(S, o = {}) {
  capeBackdrop(S, { dawn: o.dawn ?? 0.25, land: false });
  const n0 = S.layers.length;
  S.layers.push(screenLayer(0.2, (ctx, t, W, H, view) => {
    drawWoods(ctx, view, CAPE3, { t, wind: gustWind, pal: CAPEPAL, fogD: 220, flecks: 0, only: o.split ? 'far' : undefined, splitD: o.split, clearNear: o.clearNear, clearItems: o.clearItems, edgeKeep: o.edgeKeep });
    fogBand(ctx, W, H, view.oy, H * 0.08, '#f2c4b0', 0.25, t, { seed: 12, speed: 1.2 });
  }));
  if (o.blur) for (let i = n0; i < S.layers.length; i++) Object.assign(S.layers[i], { blur: o.blur, group: 'cape' });
  if (o.split) S.layers.push(Object.assign(screenLayer(1.5, (ctx, t, W, H, view) => drawWoods(ctx, view, CAPE3, { t, wind: gustWind, pal: CAPEPAL, only: 'near', splitD: o.split, clearNear: o.clearNear, clearItems: o.clearItems, edgeKeep: o.edgeKeep })), { blur: o.nearBlur ?? 5 }));
  if (o.streaks !== false) S.layers.push(screenLayer(2.4, (ctx, t, W, H) => windStreaks(ctx, W, H, t, { n: o.streaks ?? 10, seed: 13, alpha: 0.26, dir: o.windDir ?? 1, color: '#fff2e6' })));
  S.layers.push(screenLayer(2.45, (ctx, t, W, H) => particles(ctx, W, H, t, { n: 24, seed: 21, color: ['#fff2e6', '#ffd9c0'], alpha: 0.5, size: 1.8, vx: 1.6 * (o.windDir ?? 1), vy: -0.1, sway: 0.4 })));
}
// side views across the slope: screen right = up the slope toward the sea (+d)
function capeSide(pd, o = {}) {
  return Object.assign({ yaw: -Math.PI / 2, px: 0, pd, x: 0, y: -1.6 + capeGy(0, pd), z: 1, dz: 0 }, o);
}
const gAt = (pd) => (x) => capeGy(0, pd + x);
const catRim = () => ({ color: '#ffd9b8', dir: [0.85, -0.5], alpha: 0.8, width: 0.06 });
const dawnLight = () => ({ tint: '#c9c6dc', amt: 0.32, lift: '#1c1822' });

// ---- C1 side, low: climbing into the dawn, the grass flattened by the gale -
function C1() {
  const pd = 10;
  return shot({
    name: 'C1', dur: 120, unit: 95, anchor: [0.46, 0.66], fadeIn: 24, grade: capeGrade(0.1), post: capePost(0),
    cam: capeSide(pd, { x: -2.5, pitch: 0.06, y: -1.3 + capeGy(0, pd - 2.5) }),
    setup(S) {
      capeSet(S, { dawn: 0.12, split: 9, clearNear: 12, clearItems: 16 });
      const cat = makeCat(S, { x: -5, facing: 1, ground: gAt(pd), carry: { wear: 0.86 }, wind: tailwind(1.0), light: dawnLight, rim: catRim });
      const P = cat.perf;
      P.t = 2;
      locomote(P, { gait: 'tired', dist: 7, accel: 8 });
      S.camera.follow = (t) => {
        const h = P.poseAt(t, false).hip;
        return [(h[0] + 5) * 0.8, (capeGy(0, pd + h[0]) - capeGy(0, pd - 5)) * 0.8];
      };
      S.extraEvents = [{ t: 0, type: 'amb', name: 'cape_wind' }, { t: 0, type: 'music_cape' }, { t: 6, type: 'paper_flutter', dur: 110, amt: 0.6 }];
    },
  });
}

// ---- C2/C3 close: the card thrashes in its mouth — the gust tears it away --
function capeCU(S, o = {}) {
  capeBackdrop(S, { dawn: 0.2, land: false });
  S.layers.push(Object.assign(screenLayer(0.2, (ctx, t, W, H, view) => drawWoods(ctx, view, CAPE3, { t, wind: gustWind, pal: CAPEPAL, fogD: 220, flecks: 0 })), { blur: 9, group: 'cape' }));
  S.layers.push(screenLayer(2.4, (ctx, t, W, H) => windStreaks(ctx, W, H, t, { n: 12, seed: 17, alpha: 0.3, dir: 1, color: '#fff2e6' })));
}
function C2() {
  const tSnatch = 58;
  return shot({
    name: 'C2', dur: 84, unit: 100, anchor: [0.5, 0.5], grade: capeGrade(0.15), post: capePost(0),
    cam: { x: 0, y: -2.2 + capeGy(0, 30), z: 1, dz: 30, yaw: -0.3 },
    setup(S) {
      capeCU(S);
      const cu = closeUp(S, {
        x: 0.42, y: 0.58, scale: 0.55, drift: 1.2,
        light: () => ({ tint: '#d4cde0', amt: 0.3, lift: '#1c1822' }),
        card: { wear: 0.86, ang: 0.2, sx: 0.66, on: (t) => t < tSnatch },
        init: { hYaw: -0.35, hPitch: 0.05, lid: 0.45, lidTilt: 0.2, earRot: 0.75, earFlat: 0.7, fluff: 0.8, whisk: -0.8, cardAng: 0, cardBend: 0 },
        over(ctx, t, an, { s }) {
          // torn away: the card whips up and out of frame, spinning
          if (t < tSnatch) return;
          const u = (t - tSnatch) / 14;
          if (u > 1.2) return;
          const m = an.P([0.44, -0.32, -0.02]);
          ctx.save();
          ctx.translate(m[0] + u * u * 1.4 * s, m[1] - u * 1.1 * s);
          ctx.rotate(0.3 + u * 5);
          drawCard(ctx, 0, 0, { sx: Math.cos(u * 7), wear: 0.86, scale: s * 1.05, px: 512, bend: 0.5 * Math.sin(u * 9) });
          ctx.restore();
        },
      });
      // the card thrashing: fast angle and bend flutter, on ones
      for (let k = 0; k < tSnatch; k += 3) cu.key(k, { cardAng: 0.25 * Math.sin(k * 1.9) + 0.12 * Math.sin(k * 0.7), cardBend: 0.6 * Math.sin(k * 2.3) }, 'linear');
      cu.key(36, { hYaw: -0.25, lid: 0.55, squeeze: 0.2 }, 'inout');
      // the snatch: head yanked round after it, eyes and mouth wide
      cu.key(tSnatch, { squeeze: 0 }, 'hold');
      cu.key(tSnatch + 3, { hYaw: 0.35, hPitch: 0.3, lookX: 0.6, lookY: 0.6, eyeWide: 1, lid: 0, mouth: 0.6, mouthW: 0.2, earFlat: 0.1, earRot: -0.1 }, 'out');
      cu.emote(tSnatch + 2, 'exclaim', { dur: 20 });
      S.extraEvents = [{ t: 0, type: 'paper_flutter', dur: tSnatch, amt: 1 }, { t: tSnatch, type: 'card_snatch' }, { t: tSnatch, type: 'music_chase' }];
    },
  });
}

// ---- C4 the chase ----------------------------------------------------------
// the outcrop the cat will leap from: stage coords of the chase side views
const CH = { pd: 36 };
const ROCK = { x0: 9, x1: 15.5, top: -2.6 };
const chaseG = (x) => {
  const g = capeGy(0, CH.pd + x);
  if (x >= ROCK.x0 && x <= ROCK.x1) return g + ROCK.top + 0.4 * Math.sin((x - ROCK.x0) * 0.7);
  return g;
};
function rockLayer(S) {
  S.layers.push(at(0, 0.95, (ctx) => {
    const x0 = ROCK.x0, x1 = ROCK.x1;
    const gy0 = capeGy(0, CH.pd + x0), gy1 = capeGy(0, CH.pd + x1);
    const out = [[x0 - 1.6, gy0 + 0.6, 0], [x0 - 0.6, gy0 - 1.2, 1], [x0 + 0.2, chaseG(x0 + 0.2) - 0.05, 1], [x0 + 3, chaseG(x0 + 3) - 0.05, 0.6], [x1 - 0.4, chaseG(x1 - 0.4) - 0.05, 0.8], [x1 + 0.6, gy1 - 0.8, 1], [x1 + 1.4, gy1 + 0.8, 0]];
    crag(ctx, out, { seed: 5, lit: '#8a8793', mid: '#6c6a76', dark: '#4a4858', light: [0.8, -0.6], rough: 0.25, strata: 3, facets: 10, rim: 'rgba(255,214,184,0.8)', rimWidth: 0.08, ao: 0.3 });
  }));
}
// the card blown along ahead of the cat (stage coords), keyed per shot
function blownCard(S, keys, o = {}) {
  const tr = new Track({ x: 0, y: -3, ang: 0, flip: 0, s: 1.2 });
  tr.key(0, keys[0][1], 'linear');
  for (const [t, v, e] of keys.slice(1)) tr.key(t, v, e || 'inout');
  S.layers.push(layer(1, o.z ?? 1.3, (ctx, t) => {
    const q = tr.sample(t);
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(q.ang);
    const c = Math.cos(q.flip);
    drawCard(ctx, 0, 0, { sx: Math.sign(c || 1) * Math.max(0.05, Math.abs(c)), wear: 0.86, scale: q.s, px: 512, bend: 0.4 * Math.sin(t * 0.9) });
    ctx.restore();
  }));
  return tr;
}
function C4a() {
  return shot({
    name: 'C4a', dur: 60, unit: 110, anchor: [0.46, 0.64], grade: capeGrade(0.18), post: capePost(0.1),
    cam: capeSide(CH.pd, { x: -6, y: -2.2 + capeGy(0, CH.pd - 6) }),
    setup(S) {
      capeSet(S, { dawn: 0.18, split: 8, clearNear: 12, clearItems: 20 });
      const cat = makeCat(S, { x: -12, facing: 1, ground: chaseG, wind: tailwind(1.0), light: dawnLight, rim: catRim, pose: { eyeWide: 0.6, earRot: -0.1 } });
      const P = cat.perf;
      P.setTiming(0, 1);
      locomote(P, { gait: 'run', dist: 14, accel: 3, decel: 1 });
      S.camera.follow = (t) => {
        const h = P.poseAt(t, false).hip;
        return [(h[0] + 12) * 0.85, (chaseG(h[0]) - chaseG(-12)) * 0.85];
      };
      blownCard(S, [[0, { x: -7, y: chaseG(-7) - 3.5, ang: 0, flip: 0 }], [30, { x: -1, y: chaseG(-1) - 4.4, ang: 2.5, flip: 5 }, 'linear'], [60, { x: 5, y: chaseG(5) - 3.8, ang: 5, flip: 11 }, 'linear']]);
    },
  });
}
// C4b: head-on, low in the grass: it runs at us, the card sails over the lens
function C4b() {
  const T = 40;
  return shot({
    name: 'C4b', dur: T, unit: 90, anchor: [0.5, 0.6], grade: capeGrade(0.2), post: capePost(0.1),
    cam: { yaw: Math.PI, x: 0, y: -0.5 + capeGy(0, 64), z: 1, dz: 0, px: 0, pd: 44, pitch: 0.02 },
    setup(S) {
      capeSet(S, { dawn: 0.2, split: 6, windDir: -1, clearItems: 7, edgeKeep: 0.2 });
      // the camera looks back down the slope (toward −d); d grows toward us
      const cat = viewCat(S, { z: 1, mode: 'front', gait: 'run', light: dawnLight, rim: catRim, shadowColor: '#2a2638',
        init: { x: 0.3, d: 44 + 20 - 22, y: capeGy(0, 44 + 20 - 22), stride: 1.2, eyeWide: 0.7, earRot: -0.1, hPitch: 0.35, lookY: 0.7 } });
      for (let k = 1; k <= 4; k++) {
        const d = 44 + 20 - 22 + (k / 4) * 15;
        cat.key((T * k) / 4, { d, y: capeGy(0, d) }, 'linear');
      }
      // the card flies from behind the cat, over it, over the camera
      S.layers.push(screenLayer(1.4, (ctx, t, W, H, view) => {
        const u = t / T;
        const d = lerp(44 + 20 - 32, 44 + 20 - 3, u);
        const y = capeGy(0, d) - 3.2 - u * 3.2;
        onPlane(ctx, view, 'd', 0.8 - u * 2, y, d, (g) => {
          g.rotate(t * 0.35);
          const c = Math.cos(t * 0.5);
          drawCard(g, 0, 0, { sx: Math.sign(c || 1) * Math.max(0.05, Math.abs(c)), wear: 0.86, scale: 1.2, px: 512, bend: 0.3 });
        });
      }));
      S.extraEvents = [{ t: 20, type: 'whoosh' }];
    },
  });
}
// C4c: onto the rock and a leap at the card — slow motion at the top
function C4c() {
  return shot({
    name: 'C4c', dur: 150, unit: 75, anchor: [0.5, 0.66], grade: capeGrade(0.22), post: capePost(0.15),
    cam: capeSide(CH.pd, { x: 8, y: -3.4 + capeGy(0, CH.pd + 8) }),
    setup(S) {
      capeSet(S, { dawn: 0.22, split: 8, clearNear: 12, clearItems: 22 });
      rockLayer(S);
      const cat = makeCat(S, { x: 2, facing: 1, ground: chaseG, wind: tailwind(1.0), light: dawnLight, rim: catRim, pose: { eyeWide: 0.6 } });
      const P = cat.perf;
      P.setTiming(0, 1);
      locomote(P, { gait: 'run', to: ROCK.x0 - 2.2, accel: 1, decel: 3 });
      A.jump(P, { dx: 3.4, dy: chaseG(ROCK.x0 + 1.2) - chaseG(ROCK.x0 - 2.2), h: 0.6, antic: 2, hold: 0, flight: 8 });
      locomote(P, { gait: 'run', to: ROCK.x1 - 3.4, accel: 1, decel: 2 });
      // the leap: up and forward, forepaws reaching for the card overhead
      const tJ = P.t;
      A.jump(P, { dx: 1.6, dy: 0, h: 2.6, antic: 3, hold: 0, flight: 16 });
      const tOff = P.events.filter((e) => e.type === 'jump').pop().t;
      const tLand = P.events.find((e) => e.type === 'land' && e.t > tOff).t;
      // reach: forelegs up, head up, during the top of the leap
      const apex = (tOff + tLand) / 2;
      const hip = P.poseAt(apex, false).hip;
      P.key(apex - 3, { fn: [hip[0] + 0.9, hip[1] - 1.9], ff: [hip[0] + 0.7, hip[1] - 1.6], fnF: 1, ffF: 1, fnC: 0.3, ffC: 0.3, hPitch: 0.7, neck: 0.9, lookY: 0.8, eyeWide: 1, mouth: 0.4, pitch: 0.7 }, 'out');
      P.key(apex + 3, {}, 'hold');
      const slow = 3.6;
      const f0 = tOff + 2, f1 = f0 + (tLand - 2 - f0) * slow;
      S.warp = [[0, 0], [f0, tOff + 2], [f1, tLand - 2], [f1 + 200, tLand + 198]];
      S.dur = Math.round(f1 + 6);
      S.camera.follow = (t) => [0, Math.min(0, (P.poseAt(t, false).hip[1] - chaseG(ROCK.x0)) * 0.35)];
      // the card: skimming just above the paws at the apex, then away
      blownCard(S, [[0, { x: 4, y: chaseG(4) - 5.5, ang: 0, flip: 0 }], [apex - 6, { x: hip[0] + 0.8, y: hip[1] - 2.9, ang: 3.2, flip: 7 }, 'linear'], [apex + 8, { x: hip[0] + 4, y: hip[1] - 4.6, ang: 4.4, flip: 10 }, 'linear'], [apex + 40, { x: hip[0] + 16, y: hip[1] - 12, ang: 7, flip: 16 }, 'linear']]);
      S.extraEvents = [{ t: tOff + 2, type: 'slowmo_in' }, { t: tLand - 2, type: 'slowmo_out' }, { t: apex, type: 'near_miss' }];
      void tJ;
    },
  });
}
// C4d: its face in slow motion, reaching — the card slides away past the lens
function C4d() {
  return shot({
    name: 'C4d', dur: 48, unit: 100, anchor: [0.5, 0.5], grade: capeGrade(0.22), post: capePost(0.15),
    cam: { x: 0, y: -4 + capeGy(0, 50), z: 1, dz: 50, yaw: -0.4, pitch: 0.3 },
    setup(S) {
      capeCU(S);
      const cu = closeUp(S, {
        x: 0.46, y: 0.62, scale: 0.6, ones: true,
        light: () => ({ tint: '#e0d4dc', amt: 0.25, lift: '#1c1822' }),
        init: { hYaw: 0.2, hPitch: 0.5, lookY: 0.9, lookX: 0.3, eyeWide: 1, pupil: 1, mouth: 0.45, mouthW: 0.2, earRot: -0.15, fluff: 0.6 },
        over(ctx, t, an, { s }) {
          // the card, huge and soft in the foreground, sliding up and out
          const u = t / 48;
          ctx.save();
          ctx.filter = `blur(${(6 * ctx.canvas.width / 1920).toFixed(1)}px)`;
          ctx.translate(ctx.canvas.width * (0.62 + 0.25 * u), ctx.canvas.height * (0.35 - 0.6 * u));
          ctx.rotate(-0.4 + u * 1.2);
          drawCard(ctx, 0, 0, { sx: Math.cos(u * 3), wear: 0.86, scale: s * 1.3, px: 1024 });
          ctx.restore();
        },
      });
      cu.key(30, { hPitch: 0.55, eyeWide: 1 }, 'inout');
      cu.key(47, { eyeWide: 0.7, mouth: 0.6, sad: 0.3 }, 'inout');
    },
  });
}
// C4e: it lands on the lip of the rock and skids to a stop; the card is gone
function C4e() {
  return shot({
    name: 'C4e', dur: 60, unit: 90, anchor: [0.5, 0.64], grade: capeGrade(0.25), post: capePost(0.15),
    cam: capeSide(CH.pd, { x: ROCK.x1 - 1.5, y: -3 + capeGy(0, CH.pd + ROCK.x1) }),
    setup(S) {
      capeSet(S, { dawn: 0.25, split: 8, clearNear: 12, clearItems: 18 });
      rockLayer(S);
      const cat = makeCat(S, { x: ROCK.x1 - 3.4, facing: 1, ground: chaseG, wind: tailwind(0.9), light: dawnLight, rim: catRim, pose: { eyeWide: 0.8, hPitch: 0.5, lookY: 0.6 } });
      const P = cat.perf;
      P.setTiming(0, 1);
      // skid to the edge: front paws braced, body pitched back
      const F = A.frameOf(P);
      P.key(6, { hip: F.P(1.0, -0.8), pitch: -0.15, fn: F.Pg(2.4), ff: F.Pg(2.3), archB: 0.25, fluff: 0.5, earFlat: 0.3 }, 'out');
      P.event(4, 'skid', { dur: 10 });
      P.key(14, { hip: F.P(1.3, -0.95), pitch: 0.05, archB: 0.1, hPitch: 0.6, neck: 0.8, lookY: 0.9, eyeWide: 0.6 }, 'inout');
      P.setTiming(16, 2);
      P.key(36, { hPitch: 0.8, lookY: 1, mouth: 0.25 }, 'inout');
      blownCard(S, [[0, { x: ROCK.x1 + 3, y: chaseG(ROCK.x1) - 8, ang: 0, flip: 0, s: 1.1 }], [60, { x: ROCK.x1 + 10, y: chaseG(ROCK.x1) - 18, ang: 4, flip: 12, s: 1.0 }, 'linear']]);
      S.extraEvents = [{ t: 12, type: 'music_stop' }];
    },
  });
}

// ---- C5 its point of view: the card rising into the dawn sky ----------------
function C5() {
  return shot({
    name: 'C5', dur: 120, unit: 100, anchor: [0.5, 0.5], grade: capeGrade(0.3), post: capePost(0.2),
    setup(S) {
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        skyGradient(ctx, W, H, CAPE.sky(0.3).slice(0, 3));
        stars(ctx, W, H, 50, 41, 0.8, t, 0.4);
        glow(ctx, W * 0.9, H * 1.05, W * 0.6, '#ffcf9c', 0.5);
      }));
      S.layers.push(Object.assign(at(30000, 0.02, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, { seed: 23, n: 6, y: -4500, dy: 3500, w: 16000, h: 1500, speed: 14, wrap: 150000, top: '#e9b9b4', shade: '#6d628f', rim: '#ffe0cc', glow: '#ff9f7a', light: [0.8, 0.6], alpha: 0.85 })), { blur: 3 }));
      S.layers.push(screenLayer(1, (ctx, t, W, H) => {
        const u = t / 120;
        const s = H * 0.28 * Math.pow(1 - u, 1.6) + H * 0.01;
        const x = W * (0.45 + 0.18 * u + 0.03 * Math.sin(t * 0.1)), y = H * (0.62 - 0.45 * u);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 0.08);
        const c = Math.cos(t * 0.14);
        drawCard(ctx, 0, 0, { sx: Math.sign(c || 1) * Math.max(0.05, Math.abs(c)), wear: 0.86, scale: s, px: s > 150 ? 512 : 256, bend: 0.3 * Math.sin(t * 0.3) });
        ctx.restore();
      }));
      S.layers.push(screenLayer(2.4, (ctx, t, W, H) => windStreaks(ctx, W, H, t, { n: 8, seed: 19, alpha: 0.2, dir: 1, color: '#fff2e6' })));
      S.extraEvents = [{ t: 0, type: 'wind_swell' }];
    },
  });
}

// ---- C6 extreme wide: a tiny figure on the rock under an enormous sky -------
function C6() {
  return shot({
    name: 'C6', dur: 192, unit: 14, anchor: [0.5, 0.82], grade: capeGrade(0.3), post: capePost(0.2),
    cam: capeSide(CH.pd, { x: ROCK.x1 - 10, y: -4 + capeGy(0, CH.pd + ROCK.x1), dz: 0 }),
    setup(S) {
      S.camera.move(0, 192, { x: ROCK.x1 - 12 }, 'linear');
      capeSet(S, { dawn: 0.3, streaks: 5 });
      rockLayer(S);
      const gnd = chaseG;
      const cat = makeCat(S, { ground: gnd, pose0: standingPose(ROCK.x1 - 1.4, 1, gnd, { hPitch: 0.6, lookY: 0.8 }), wind: tailwind(0.7), light: dawnLight, rim: catRim });
      const P = cat.perf;
      P.t = 60;
      A.sit(P);
      P.key(P.t + 6, { hPitch: -0.2, lookY: -0.3, earRot: 0.5, earFlat: 0.35 }, 'inout');
    },
  });
}

// ---- C7 close: tears -------------------------------------------------------
function C7() {
  return shot({
    name: 'C7', dur: 132, unit: 100, anchor: [0.5, 0.5], grade: capeGrade(0.3), post: capePost(0.2),
    cam: { x: 0, y: -2.5 + capeGy(0, 60), z: 1, dz: 60, yaw: -0.2 },
    setup(S) {
      capeCU(S);
      const cu = closeUp(S, {
        x: 0.5, y: 0.62, scale: 0.55, drift: 0.3,
        light: () => ({ tint: '#cfc8dc', amt: 0.32, lift: '#1c1822' }),
        init: { hYaw: -0.1, hPitch: -0.2, lookY: -0.4, sad: 0.5, earRot: 0.6, earFlat: 0.45, whiskDroop: 0.6 },
      });
      cu.key(30, { tear: 0.6, sad: 0.8, wobble: 0.6, smile: -0.4 }, 'inout');
      cu.key(70, { tear: 1, eye: 0.35, earFlat: 0.7, earRot: 0.8, hPitch: -0.3 }, 'inout');
      cu.key(100, { eye: 0.05 }, 'inout');
      cu.key(132, { eye: 0 }, 'inout');
      S.extraEvents = [{ t: 20, type: 'music_loss' }];
    },
  });
}

// ---- D1 extreme close: an ear turns toward a new sound ----------------------
function D1() {
  return shot({
    name: 'D1', dur: 96, unit: 100, anchor: [0.5, 0.5], grade: capeGrade(0.35), post: capePost(0.2),
    cam: { x: 0, y: -2.5 + capeGy(0, 60), z: 1, dz: 60, yaw: -0.2 },
    setup(S) {
      capeCU(S);
      const cu = closeUp(S, {
        x: 0.62, y: 1.35, scale: 1.2, idle: { ears: false },
        light: () => ({ tint: '#d8cfe0', amt: 0.3, lift: '#1c1822' }),
        init: { hYaw: -0.1, hPitch: -0.3, eye: 0, sad: 0.8, tear: 0.8, earRot: 0.7, earFlat: 0.6 },
      });
      cu.key(30, {}, 'hold');
      cu.key(34, { earRR: -0.5, earFlat: 0.35, earRot: 0.35 }, 'out'); // twitch toward the sound
      cu.key(40, { earRR: -0.2 }, 'inout');
      cu.key(60, {}, 'hold');
      cu.key(64, { earRR: -0.6, earLR: -0.3, earFlat: 0.1, earRot: 0.1 }, 'out');
      S.extraEvents = [{ t: 20, type: 'waves_first' }];
    },
  });
}
// ---- D2 close: eyes open, the head lifts toward the sound ------------------
function D2() {
  return shot({
    name: 'D2', dur: 72, unit: 100, anchor: [0.5, 0.5], grade: capeGrade(0.4), post: capePost(0.25),
    cam: { x: 0, y: -2.5 + capeGy(0, 60), z: 1, dz: 60, yaw: -0.2 },
    setup(S) {
      capeCU(S);
      const cu = closeUp(S, {
        x: 0.5, y: 0.64, scale: 0.55,
        light: () => ({ tint: '#e8d8d8', amt: 0.25, lift: '#1c1822' }),
        init: { hYaw: -0.1, hPitch: -0.3, eye: 0, sad: 0.6, tear: 0.7, earRot: 0.1, earFlat: 0.1 },
      });
      cu.key(10, { eye: 0 }, 'hold');
      cu.key(20, { eye: 1, sad: 0.2, eyeWide: 0.3 }, 'inout');
      cu.key(40, { hPitch: 0.25, hYaw: 0.25, lookX: 0.5, lookY: 0.5, eyeWide: 0.5, earRot: -0.1, sad: 0 }, 'inout');
    },
  });
}
// ---- D3 low, behind: the last climb; the crest glows ahead -----------------
function D3() {
  const T = 132;
  const d0 = 136, d1 = 149;
  return shot({
    name: 'D3', dur: T, unit: 90, anchor: [0.5, 0.7], grade: capeGrade(0.5), post: capePost(0.4),
    cam: { x: 0.5, y: -1.1 + capeGy(0, d0 - 7), z: 1, dz: d0 - 7 + 20, pitch: 0.16 },
    setup(S) {
      capeSet(S, { dawn: (t) => 0.45 + 0.25 * (t / T), streaks: 4, clearItems: 5, edgeKeep: 0.25 });
      // the dawn light pouring over the crest
      S.layers.push(screenLayer(0.21, (ctx, t, W, H, view) => {
        const [, Y] = P3(view, 0, capeGy(0, 152), 152);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        glow(ctx, W * 0.5, Y, W * 0.55, '#ffd8a8', 0.4 + 0.3 * (t / T));
        glow(ctx, W * 0.5, Y, W * 0.18, '#fff2d8', 0.35 + 0.3 * (t / T));
        ctx.restore();
      }));
      const cat = viewCat(S, { z: 1, mode: 'back', gait: 'walk', light: () => ({ tint: '#e0d0d8', amt: 0.25, lift: '#1c1822' }), rim: () => ({ color: '#ffe6c0', dir: [0, -1], alpha: 0.95, width: 0.06 }), shadow: false,
        init: { x: 0.2, d: d0, y: capeGy(0, d0), stride: 0.8, tail: 0.6, tailLow: 1, tailSway: 0.25, hPitch: 0.25, earRot: -0.1 } });
      for (let k = 1; k <= 6; k++) {
        const d = lerp(d0, d1, k / 6);
        cat.key((T * k) / 6, { d, y: capeGy(0, d) }, 'linear');
      }
      cat.key(T * 0.8, { stride: 0.5 }, 'inout');
      cat.key(T, { stride: 0 }, 'inout');
      S.camera.move(0, T, { dz: d1 - 9 + 20, y: -1.1 + capeGy(0, d1 - 9) }, 'linear');
    },
  });
}

// ---- D4 the reveal: the postcard's sea becomes the real one -----------------
function withPostcard(s, o = {}) {
  // lay the postcard image over the first frames and dissolve it away: the same
  // composition, painted then real
  const draw = s.draw;
  s.draw = (ctx, f, W, H) => {
    draw(ctx, f, W, H);
    const a = 1 - smoothstep(o.from ?? 16, o.to ?? 100, f);
    if (a <= 0.001) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = a;
    const b = W * 0.02 * a;
    ctx.fillStyle = '#f6f2ea';
    ctx.fillRect(0, 0, W, H);
    drawSeaView(ctx, b, b, W - 2 * b, H - 2 * b, { palette: 'postcard', t: f });
    ctx.restore();
  };
  return s;
}

export function shots() {
  return [
    C1(), C2(), C4a(), C4b(), C4c(), C4d(), C4e(), C5(), C6(), C7(),
    D1(), D2(), D3(),
    withPostcard(retime('8.3', { name: 'D4', from: 0, dur: 240, xfade: 0 }), { from: 30, to: 120 }),
    retime('8.4', { name: 'D5', from: 10, dur: 150 }),
    retime('8.3', { name: 'D6', from: 240, dur: 144 }),
  ];
}
