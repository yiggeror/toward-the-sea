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
import { BEACH, catMorning, beachGrade, beachPost, beachWorld, swashEdge } from './sea.js';
import { retime } from './v1.js';
import { Track } from '../core/tracks.js';
import { css, mix } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';

const waterC = 'rgb(235,245,250)';

// ---- E1 down the dune at a run, singing --------------------------------------
function E1() {
  const dune = (x) => (x < -6 ? -(-6 - x) * 0.35 : 0);
  return shot({
    name: 'E1', dur: 108, unit: 64, anchor: [0.5, 0.62], post: beachPost, grade: beachGrade, xfade: 18,
    cam: { x: -10, y: -3, z: 1 },
    setup(S) {
      beachWorld(S, { rest: 14 });
      S.layers.push(at(0, 0.8, (ctx, t, view, S2, p) => {
        const g = ctx.createLinearGradient(0, -12, 0, 0.4);
        g.addColorStop(0, '#f0dcb6');
        g.addColorStop(0.7, BEACH.dune);
        g.addColorStop(1, '#cdb48c');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-60, 0.4);
        for (let x = -60; x <= 2; x += 0.5) ctx.lineTo(x, dune(x) + 0.02);
        ctx.quadraticCurveTo(4, 0.1, 6, 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(170,135,95,0.25)';
        ctx.lineWidth = 0.05;
        for (let i = 0; i < 28; i++) {
          const x = -58 + i * 2.2;
          if (x > -7) break;
          const y = dune(x) + 0.6 + (i % 3) * 0.9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 0.8, y - 0.35, x + 1.6, y + 0.1);
          ctx.stroke();
        }
        tufts(ctx, view, p, t, { ground: (x) => (x < -8 ? dune(x) : 90), spacing: 2.2, h: 1.6, width: 0.12, colors: BEACH.duneGrass, seed: 13, wind: windField({ base: 0.3, gust: 0.4, dir: 1 }), fill: 0.7 });
      }));
      const cat = makeCat(S, { x: -30, facing: 1, ground: dune, ...catMorning, pose: { happy: 0.6, smile: 0.8, mouth: 0.3, mouthW: 0.6, blush: 0.35, earRot: -0.1 } });
      const P = cat.perf;
      P.setTiming(0, 1);
      locomote(P, { gait: 'run', dist: 34, accel: 4, decel: 14, surfaceAt: () => 'sand' });
      P.emote(10, 'notes', { dur: 60 });
      S.camera.follow = follow(P, { lag: 10, lead: 8, dx: 2, y: 0.8, dy: 0.2 });
      S.camera.key(0, { x: 0, y: -1.2 });
      S.extraEvents = [{ t: 0, type: 'amb', name: 'beach' }, { t: 0, type: 'music_beach' }];
    },
  });
}

// ---- E3 the wave game, in three beats ---------------------------------------
// (the sea is to the right, +x; a wave's `reach` is how far up the sand it runs)
function E3() {
  const waves = [{ t: -50, dur: 110, reach: -0.5 }, { t: 74, dur: 110, reach: -5.5 }, { t: 196, dur: 130, reach: -6.5 }];
  return shot({
    name: 'E3', dur: 280, unit: 80, anchor: [0.5, 0.62], post: beachPost, grade: beachGrade,
    cam: { x: 0, y: -1.5, z: 1 },
    setup(S) {
      beachWorld(S, { rest: 6, waves, slope: 0.3, dunes: false });
      const cat = makeCat(S, { x: -3.5, facing: 1, ...catMorning, waterColor: waterC, pose: { eyeWide: 0.3, earRot: -0.1, sparkle: 0.4 } });
      const P = cat.perf;
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
      locomote(P, { gait: 'run', to: -3.5, accel: 2, decel: 4 });
      A.jump(P, { dx: 3.6, dy: 0, h: 1.0, antic: 1, hold: 0, flight: 9 });
      P.setTiming(P.t, 2);
      P.key(P.t + 4, { happy: 1, smile: 1, mouth: 0.45, mouthW: 0.8, blush: 0.5, eyeWide: 0, fluff: 0 }, 'inout'); // laughing
      // beat 3: it turns back to face the sea, plants its paws, braces…
      const t3 = Math.max(P.t + 8, 168);
      P.t = t3;
      A.turnAround(P);
      locomote(P, { gait: 'walk', to: -3.2, accel: 6, decel: 6, surfaceAt: () => 'sand' });
      const F = A.frameOf(P);
      P.key(P.t + 6, { hip: F.P(-0.08, -0.86), archB: 0.25, happy: 0, squeeze: 1, earFlat: 0.4, earRot: 0.5, smile: 0, mouth: 0, tailA: 0.9, tailC: 0.4 }, 'inout');
      // …and the wave washes right over its paws: frozen, eyes round
      const tw = 214;
      P.key(tw, {}, 'hold');
      P.setTiming(tw, 1);
      P.key(tw + 3, { squeeze: 0, eyeWide: 1, pupil: 0.9, mouth: 0.3, mouthW: 0, fluff: 0.5, tailA: 1.2, tailC: 0.1 }, 'out');
      P.setTiming(tw + 6, 2);
      for (const k of [0, 5, 11]) P.event(tw + k, 'splash', { x: F.x0 + 1.1, y: 0.1, strength: 0.35 });
      S.extraEvents = waves.filter((w) => w.t >= 0).map((w) => ({ t: w.t, type: 'wave_wash', dur: w.dur }));
      S.dur = tw + 6; // cut on the hit
    },
  });
}
// E3p insert at paw height: the sheet of water rushes in around its paws
function E3p() {
  const waves = [{ t: -8, dur: 130, reach: -6.5 }];
  const x0 = -3.2;
  return shot({
    name: 'E3p', dur: 54, unit: 360, anchor: [0.5, 0.56], post: beachPost, grade: beachGrade,
    cam: { x: x0 + 0.9, y: -0.8, z: 1 },
    setup(S) {
      beachWorld(S, { rest: 6, waves, slope: 0.3, dunes: false });
      const cat = makeCat(S, { x: x0, facing: 1, ...catMorning, waterColor: waterC, pose: { hip: [x0 - 0.08, -0.86], archB: 0.25, squeeze: 0, eyeWide: 1, fluff: 0.5, tailA: 1.2, tailC: 0.1 } });
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
// E3b close: from stunned to delighted
function E3b() {
  return shot({
    name: 'E3b', dur: 84, unit: 100, anchor: [0.5, 0.5], post: beachPost, grade: beachGrade,
    cam: { x: 3, y: -2, z: 1 },
    setup(S) {
      beachWorld(S, { rest: 3, slope: 0.3, dunes: false });
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
        ctx.fillStyle = '#b8a07e';
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 1400; i++) {
          ctx.fillStyle = hash01(i * 3) < 0.5 ? 'rgba(120,95,70,0.25)' : 'rgba(255,245,225,0.3)';
          ctx.fillRect(hash01(i * 7) * W, hash01(i * 11) * H, 2.5 * k, 2.5 * k);
        }
        const sweep = 0.5 + 0.5 * Math.sin((t / 90) * Math.PI * 2 - 1.2);
        const edgeY = H * (1.05 - 0.9 * sweep);
        const g = ctx.createLinearGradient(0, edgeY, 0, H);
        g.addColorStop(0, 'rgba(210,235,240,0.55)');
        g.addColorStop(1, 'rgba(160,205,220,0.35)');
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
function E4b() {
  return shot({
    name: 'E4b', dur: 120, unit: 100, anchor: [0.5, 0.5], post: beachPost, grade: beachGrade,
    cam: { x: 3, y: -2, z: 1 },
    setup(S) {
      beachWorld(S, { rest: 3, slope: 0.3, dunes: false });
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
function E4c() {
  const waves = [{ t: -30, dur: 120, reach: -1 }];
  return shot({
    name: 'E4c', dur: 96, unit: 90, anchor: [0.5, 0.62], post: beachPost, grade: beachGrade,
    cam: { x: 0.5, y: -1.5, z: 1 },
    setup(S) {
      beachWorld(S, { rest: 7, waves, slope: 0.3, dunes: false });
      const cat = makeCat(S, { x: -2.2, facing: 1, ...catMorning, pose: { happy: 0.5, smile: 0.9, hPitch: -0.25, lookY: -0.4, blush: 0.3 } });
      const P = cat.perf;
      // the backwash draws the blank card away; it watches it go, content
      const card = new CardProp({ x: 0.9, y: 0.06, sx: 1, sy: 0.42, skew: -0.25, scale: 1.5 });
      card.key(14, {}, 'linear');
      card.key(60, { x: 5.2, y: 0.1, ang: 0.25 }, 'in');
      card.key(96, { x: 8.6, y: 0.16, ang: 0.45, vis: 0.5 }, 'out');
      S.layers.push(layer(1, 0.999, (ctx, t) => {
        const q = card.at(t);
        ctx.save();
        ctx.globalAlpha *= q.vis;
        ctx.translate(q.x, q.y);
        ctx.transform(1, 0, q.skew, q.sy, 0, 0);
        ctx.rotate(q.ang);
        blankCard(ctx, CARD.w * q.scale, CARD.h * q.scale, t);
        // foam lacing around it as the water pulls
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.ellipse(0, 0, CARD.w * q.scale * 0.62, CARD.h * q.scale * 0.66, 0, Math.PI * 0.1, Math.PI * 1.2);
        ctx.stroke();
        ctx.restore();
      }));
      P.key(30, { hPitch: -0.05, lookY: 0, lookX: 0.3 }, 'inout');
      P.key(60, { hPitch: 0.15, lookY: 0.2, tailA: 0.9, tailC: 0.9 }, 'inout');
      A.blink(P, 70, 6);
      P.emote(64, 'sparkle', { dur: 30, n: 3 });
    },
  });
}

// ---- E5 along the water's edge toward the lighthouse; the camera pulls away -
function E5() {
  const T = 300;
  const rest = 7, slope = 0.3;
  const waves = [];
  for (let i = 0; i < 6; i++) waves.push({ t: i * 55, dur: 100, reach: 4.5 + (i % 2) * 0.8 });
  const shoreX = (d) => rest - 1.6 + d * slope;
  return shot({
    name: 'E5', dur: T, unit: 70, anchor: [0.5, 0.6], fadeOut: 60, post: beachPost, grade: beachGrade, dolly: true,
    cam: { x: 3.2, y: -1.8, z: 1 },
    setup(S) {
      beachWorld(S, { rest, waves, slope, capeX: 2400, beachEnd: 5000 });
      const dOf = (t) => -4 + Math.pow(t / T, 1.15) * 70;
      const cat = viewCat(S, { z: 1, mode: 'back', gait: 'trot', shadowColor: '#9a8468', rim: () => ({ color: '#fff4e0', dir: [-0.5, -0.86], alpha: 0.6, width: 0.05 }),
        light: () => ({ tint: '#fff2e2', amt: 0.08, lift: '#0e0a08' }), init: { x: shoreX(-4), d: -4, stride: 1, tail: 0.9, tailSway: 0.7, hYaw: 0.2 } });
      for (let k = 1; k <= 10; k++) {
        const t = (T * k) / 10, d = dOf(t);
        cat.key(t, { d, x: shoreX(d) }, 'linear');
      }
      cat.key(40, { hYaw: 0.5 }, 'inout'); // a glance back
      cat.key(70, { hYaw: 0 }, 'inout');
      // pull back and up: the lens widens (dolly), the shore stays in frame
      S.camera.key(0, { y: 0 });
      S.camera.move(60, T, { z: 0.14, x: 6 }, 'inout');
      S.camera.follow = (t, c) => [0, -1.8 / Math.max(0.05, c.z)];
      S.extraEvents = [{ t: 150, type: 'music_end' }];
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
  return [
    E1(),
    retime('9.3', { name: 'E2', from: 44, dur: 106 }),
    E3(), E3p(), E3b(), E4a(), E4b(), E4c(), E5(), End(),
  ];
}
