// Act I — the city on a rainy night: meeting the postcard (docs/treatment_v2.md
// A1–A18). The lane is one 3D set seen from many angles: down its length
// (one-point perspective), across it (the opposite wall), from the ground,
// from above.
import { shot } from '../film/shot.js';
import { TITLE, ITALIC } from '../film/fonts.js';
import { makeCat, follow, ramp, screenLayer, layer, at, inScale, scaled, sittingPose, standingPose } from '../film/kit.js';
import { viewCat, closeUp } from '../film/cast.js';
import { P3, S3, fill3, path3, line3, wallX, floorY, faceD, billboard, nearD, camDist, onPlane, toCam, projC } from '../film/persp.js';
import { laneLayout, drawLane, drawLaneGround, drawLaneEnd, laneRainHits, LANE_NIGHT } from '../env/lane.js';
import { CardProp } from '../film/prop.js';
import { drawCard, cardArt, CARD } from '../film/postcard.js';
import { drawSeaView } from '../film/seaview.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';
import { skyGradient, glow, moon, clouds, stars } from '../env/sky.js';
import { lampGlow, lightCone, lightPool, fogBand, wetReflection, particles, bokeh } from '../env/light.js';
import { rain } from '../env/weather.js';
import { NIGHT, catNight, nightGrade, nightPost, nightBackdrop, nightStreet, lamp, drips, alleyUp, SMALLCAR, CARK, DAWN } from './city.js';
import { car, wall } from '../env/city.js';
import { profile, fillBelow, groundPlane } from '../env/terrain.js';
import { treeRow, tufts, windField } from '../env/nature.js';
import { Track } from '../core/tracks.js';
import { css, mix, DPX } from '../core/draw.js';
import { hash01, clamp, lerp, TAU, smoothstep, noise1 } from '../core/math.js';

// ---- the lane --------------------------------------------------------------
export const LANE = laneLayout({ seed: 11, width: 36, dStart: -80, dEnd: 760, hMin: 100, hMax: 185, laundry: 3 });
// a wall lamp by the parked car lights the first scene
LANE.props.push({ type: 'lamp', side: -1, x: -18, d: 9, y: -27 });
// across from where the card lands: a lit noodle shop and a sign (the warm
// background of the side shots)
for (const sg of LANE.segs) {
  if (sg.side < 0 && sg.d0 <= 14 && sg.d1 > 14) {
    sg.x = -18;
    sg.shop = { d0: -6, d1: 34, h: 17, col: '#ffcf8a', shutter: false };
    sg.windows = sg.windows.filter((w) => w.y1 < -20);
  }
  if (sg.side < 0 && sg.d0 <= 44 && sg.d1 > 44) sg.shop = { d0: sg.d0 + 2, d1: sg.d1 - 4, h: 16, col: '#9fd0ff', shutter: false };
}
LANE.props.push({ type: 'sign', side: -1, x: -18, d: 30, w: 5.5, y1: -22, h: 24, col: '#ff6a5c', seed: 77, flick: false });
LANE.props.push({ type: 'lamp', side: -1, x: -18, d: 38, y: -24 });
// the parked car: rear toward the camera, on the left of the lane
export const CAR = { x0: -16.5, x1: -1.5, d: 18, len: 36 };
const PUDDLES = [{ x: 4, d: 30, rx: 6, rz: 9 }, { x: -6, d: 70, rx: 5, rz: 12 }, { x: 8, d: 140, rx: 7, rz: 16 }, { x: -3, d: 8, rx: 3.5, rz: 3 }];

// sky strip between the rooftops, moon and rain clouds (screen space)
function laneSky(S, o = {}) {
  S.layers.push(screenLayer(0, (ctx, t, W, H, view) => {
    skyGradient(ctx, W, H, LANE_NIGHT.sky);
    stars(ctx, W, H, 40, 5, 0.5, t, 0.5);
    const [mx, my] = o.moon || [0.58, 0.14];
    const lift = view ? (view.cam.y + 20) * view.scaleAt(view.pOf(20000)) : 0;
    glow(ctx, W * mx, H * my + lift, W * 0.22, '#9fb0ff', 0.22);
    moon(ctx, W * mx, H * my + lift, W * 0.016, '#f6efd6', 0.3);
  }));
  S.layers.push(at(9000, 0.02, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, {
    seed: 3, n: 7, y: -2600, dy: 700, w: 2600, h: 160, speed: 0.5, wrap: 12000, top: 'rgba(92,74,118,0.55)', shade: 'rgba(38,40,68,0.55)',
  })));
}

// the car seen from behind (billboard face at CAR.d) and its side receding
const CARP = { body: '#2c3456', bodyLit: '#48527e', dark: '#161a2e', glass: '#0f1224', tire: '#0b0c14', tail: '#6e2530', chrome: '#6c7090' };
function drawCarRear(ctx, view, o = {}) {
  const P = CARP;
  const { x0, x1, d, len } = CAR;
  const w = x1 - x0, cx = (x0 + x1) / 2;
  const t = o.t || 0;
  // right flank (visible from the lane centre): body, windows, wheel arches
  const fg = (() => {
    const a = P3(view, x1, -8.4, d + len / 2), b = P3(view, x1, -1.4, d + len / 2);
    const g = ctx.createLinearGradient(0, a[1], 0, b[1]);
    g.addColorStop(0, P.bodyLit);
    g.addColorStop(0.25, P.body);
    g.addColorStop(1, P.dark);
    return g;
  })();
  fill3(ctx, view, wallX(x1, d, d + len, -1.4, -8.4), fg);
  fill3(ctx, view, wallX(x1, d, d + len, -7.9, -8.15), css('#9aa2d0', 0.25));
  fill3(ctx, view, [[x1, -8.4, d + 2], [x1, -8.4, d + len - 6], [x1 - 1.6, -13.2, d + len - 10], [x1 - 1.6, -13.2, d + 6]], P.glass);
  line3(ctx, view, [[x1 - 0.8, -10.8, d + 4], [x1 - 0.8, -10.8, d + len - 8]], css('#7a82b8', 0.18), 0.2);
  for (const dw of [d + 6.5, d + len - 7]) {
    fill3(ctx, view, wallX(x1 + 0.05, dw - 3.4, dw + 3.4, -0.2, -3.4), '#07080e');
    fill3(ctx, view, wallX(x1 + 0.1, dw - 2.6, dw + 2.6, 0, -2.7), P.tire);
    fill3(ctx, view, wallX(x1 + 0.12, dw - 1.2, dw + 1.2, -0.75, -1.95), P.chrome);
  }
  if (-view.cam.y > 8.6) {
    fill3(ctx, view, floorY(-8.6, x0, x1, d, d + 7), P.body);
    fill3(ctx, view, floorY(-8.6, x0, x1, d + len - 8, d + len), P.body);
    fill3(ctx, view, [[x0 + 1.4, -8.6, d + 7], [x1 - 1.4, -8.6, d + 7], [x1 - 1.8, -13.2, d + 11], [x0 + 1.8, -13.2, d + 11]], P.glass);
    fill3(ctx, view, floorY(-13.2, x0 + 1.8, x1 - 1.8, d + 11, d + len - 12), P.body);
    fill3(ctx, view, floorY(-13.2, x0 + 1.8, x1 - 1.8, d + 11, d + len - 12), css('#9aa6d8', 0.1));
    fill3(ctx, view, [[x0 + 1.8, -13.2, d + len - 12], [x1 - 1.8, -13.2, d + len - 12], [x1 - 1.4, -8.6, d + len - 8], [x0 + 1.4, -8.6, d + len - 8]], P.glass);
  }
  // the space under the car: dark floor and belly, light from the far end
  fill3(ctx, view, floorY(0, x0 + 0.6, x1 - 0.6, d, d + len), '#090a14');
  fill3(ctx, view, faceD(d + len, x0 + 0.6, x1 - 0.6, 0, -1.55), '#2b2c4a');
  fill3(ctx, view, floorY(-0.2, x0 + 0.6, x1 - 0.6, d + len - 3, d + len), css('#4a4a70', 0.5));
  for (const xw of [x0 + 1.2, x1 - 1.2]) fill3(ctx, view, faceD(d + len - 7, xw - 1.1, xw + 1.1, 0, -2.7), '#07070d');
  fill3(ctx, view, floorY(-1.55, x0 + 0.6, x1 - 0.6, d, d + len), '#04050a');
  fill3(ctx, view, wallX(x0 + 4, d, d + 12, -1.1, -1.5), '#1a1b26');
  // rear face, drawn in its own plane
  onPlane(ctx, view, 'd', cx, 0, d, (g) => {
    const hw = w / 2;
    // tyres
    g.fillStyle = P.tire;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.roundRect(sx * (hw - 1.1) - 1.1, -2.7, 2.2, 2.7, 0.6);
      g.fill();
    }
    // body with a soft vertical gradient (lamp light from above-left)
    const body = new Path2D();
    body.moveTo(-hw + 0.3, -1.5);
    body.lineTo(-hw, -3.6);
    body.lineTo(-hw, -7.4);
    body.quadraticCurveTo(-hw, -8.7, -hw + 1.2, -8.7);
    body.lineTo(hw - 1.2, -8.7);
    body.quadraticCurveTo(hw, -8.7, hw, -7.4);
    body.lineTo(hw, -3.6);
    body.lineTo(hw - 0.3, -1.5);
    body.closePath();
    const bg = g.createLinearGradient(0, -8.7, 0, -1.5);
    bg.addColorStop(0, P.bodyLit);
    bg.addColorStop(0.35, P.body);
    bg.addColorStop(1, P.dark);
    g.fillStyle = bg;
    g.fill(body);
    // cabin and rear window
    g.beginPath();
    g.moveTo(-hw + 1.4, -8.7);
    g.quadraticCurveTo(-hw + 2.2, -12.4, -hw + 3, -13.2);
    g.lineTo(hw - 3, -13.2);
    g.quadraticCurveTo(hw - 2.2, -12.4, hw - 1.4, -8.7);
    g.closePath();
    g.fillStyle = P.body;
    g.fill();
    const win = new Path2D();
    win.moveTo(-hw + 2.3, -9.0);
    win.quadraticCurveTo(-hw + 2.9, -12.0, -hw + 3.5, -12.7);
    win.lineTo(hw - 3.5, -12.7);
    win.quadraticCurveTo(hw - 2.9, -12.0, hw - 2.3, -9.0);
    win.closePath();
    const wg = g.createLinearGradient(0, -12.7, 0, -9);
    wg.addColorStop(0, '#1d2340');
    wg.addColorStop(1, P.glass);
    g.fillStyle = wg;
    g.fill(win);
    // neon smeared in the rear window, raindrops running down
    g.save();
    g.clip(win);
    g.fillStyle = css('#ff6fb0', 0.12);
    g.fillRect(-hw + 4, -12.6, 2.5, 3.6);
    g.fillStyle = css('#6fd8ff', 0.1);
    g.fillRect(hw - 7, -12.6, 1.8, 3.6);
    for (let i = 0; i < 40; i++) {
      const u = hash01(i * 3), v = (hash01(i * 5) + (hash01(i * 7) > 0.8 ? t * 0.004 : 0)) % 1;
      g.fillStyle = css('#c8d4ff', 0.25 + 0.3 * hash01(i * 11));
      g.beginPath();
      g.arc(-hw + 3 + u * (w - 6), -12.6 + v * 3.6, 0.06 + 0.09 * hash01(i), 0, TAU);
      g.fill();
    }
    g.restore();
    // trunk seam, bumper, plate, tail lights (off), reflections
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 0.08;
    g.beginPath();
    g.moveTo(-hw + 3.2, -8.3);
    g.lineTo(-hw + 3.2, -4.4);
    g.quadraticCurveTo(-hw + 3.2, -4.1, -hw + 3.6, -4.1);
    g.lineTo(hw - 3.6, -4.1);
    g.quadraticCurveTo(hw - 3.2, -4.1, hw - 3.2, -4.4);
    g.lineTo(hw - 3.2, -8.3);
    g.stroke();
    g.fillStyle = P.dark;
    g.beginPath();
    g.roundRect(-hw - 0.15, -3.5, w + 0.3, 2.0, 0.5);
    g.fill();
    g.fillStyle = css('#8a90b8', 0.25);
    g.fillRect(-hw + 0.3, -3.45, w - 0.6, 0.12);
    g.fillStyle = '#6d6c68';
    g.beginPath();
    g.roundRect(-2.1, -3.25, 4.2, 1.4, 0.15);
    g.fill();
    g.fillStyle = '#26283a';
    g.fillRect(-1.7, -2.72, 3.4, 0.36);
    for (const sx of [-1, 1]) {
      const x = sx > 0 ? hw - 3.0 : -hw + 0.35;
      const tg = g.createLinearGradient(0, -7.3, 0, -5.8);
      tg.addColorStop(0, '#8a3440');
      tg.addColorStop(1, P.tail);
      g.fillStyle = tg;
      g.beginPath();
      g.roundRect(x, -7.3, 2.65, 1.5, 0.25);
      g.fill();
      g.fillStyle = 'rgba(255,200,200,0.22)';
      g.fillRect(x + 0.25, -7.1, 1.1, 0.3);
    }
    // wet specular sheen along the top edge, the lamp's glint on the trunk
    g.fillStyle = css('#b8c0f0', 0.22);
    g.fillRect(-hw + 1.2, -8.66, w - 2.4, 0.16);
    const sp = g.createRadialGradient(-hw + 4, -7.8, 0, -hw + 4, -7.8, 3);
    sp.addColorStop(0, css('#ffe2b0', 0.35));
    sp.addColorStop(1, css('#ffe2b0', 0));
    g.fillStyle = sp;
    g.fillRect(-hw, -10.8, 7, 6);
    // rain streaks running down the trunk
    g.strokeStyle = css('#aab4e0', 0.18);
    g.lineWidth = 0.05;
    for (let i = 0; i < 14; i++) {
      const x = -hw + 1 + hash01(i * 13) * (w - 2);
      g.beginPath();
      g.moveTo(x, -8.4);
      g.lineTo(x + 0.05, -8.4 + 1 + hash01(i * 17) * 3.5);
      g.stroke();
    }
  });
}

// the dead end: a low wall across the lane with crates in front of it
export const END = { d: 236, h: 15, crates: [{ x: -4, d: 232, w: 5, h: 4.6, dd: 4 }, { x: -3, d: 234.5, w: 4.4, h: 9.4, dd: 1.5, y0: -4.6 }] };
function drawEndWall(ctx, view, o = {}) {
  const mir = !!o.mirror;
  const opt = { mirror: mir };
  const { d, h } = END;
  // wall face toward the camera, cap, far side hidden
  fill3(ctx, view, faceD(d, -LANE.half, LANE.half, 0, -h), '#2e3052', opt);
  if (mir) return;
  fill3(ctx, view, faceD(d, -LANE.half, LANE.half, 0, -2.5), css('#0c0d1c', 0.4));
  for (let y = -1.6; y > -h; y -= 1.6) line3(ctx, view, [[-LANE.half, y, d], [LANE.half, y, d]], css('#1c1d38', 0.6), 0.1);
  for (let x = -LANE.half; x < LANE.half; x += 3.2) for (let y = 0; y > -h; y -= 3.2) line3(ctx, view, [[x + ((y / 1.6) % 2 ? 1.6 : 0), y, d], [x + ((y / 1.6) % 2 ? 1.6 : 0), y - 1.6, d]], css('#1c1d38', 0.5), 0.08);
  fill3(ctx, view, floorY(-h, -LANE.half, LANE.half, d - 0.8, d + 1.6), '#4a4c78');
  fill3(ctx, view, faceD(d - 0.8, -LANE.half, LANE.half, -h, -h - 0.9), '#3c3e66');
  // crates (wooden, wet)
  for (const c of END.crates) {
    const y0 = c.y0 || 0, y1 = y0 - c.h;
    fill3(ctx, view, floorY(y1, c.x - c.w / 2, c.x + c.w / 2, c.d - c.dd, c.d + 1), '#8a6a52');
    fill3(ctx, view, wallX(c.x + c.w / 2, c.d - c.dd, c.d + 1, y0, y1), '#4e3a30');
    fill3(ctx, view, faceD(c.d - c.dd, c.x - c.w / 2, c.x + c.w / 2, y0, y1), '#6e5242');
    for (let k = 1; k < 4; k++) line3(ctx, view, [[c.x - c.w / 2, lerp(y0, y1, k / 4), c.d - c.dd], [c.x + c.w / 2, lerp(y0, y1, k / 4), c.d - c.dd]], css('#3a2a22', 0.8), 0.12);
    line3(ctx, view, [[c.x - c.w / 2, y0, c.d - c.dd], [c.x + c.w / 2, y1, c.d - c.dd]], css('#3a2a22', 0.6), 0.14);
  }
}

// the complete lane set (sky, far glow, ground + reflections, walls, props);
// o.blur softens the whole set (close-ups)
function laneSet(S, o = {}) {
  const n0 = S.layers.length;
  laneSky(S, o);
  S.layers.push(screenLayer(0.2, (ctx, t, W, H, view) => {
    drawLaneEnd(ctx, view, LANE, { t });
    drawLaneGround(ctx, view, LANE, { t, puddles: o.puddles ?? PUDDLES, refl: o.refl ?? 0.8 });
  }));
  S.layers.push(screenLayer(0.4, (ctx, t, W, H, view) => {
    drawLane(ctx, view, LANE, { t });
    if (o.endWall) drawEndWall(ctx, view);
    // mist toward the far end
    fogBand(ctx, W, H, view.oy - H * 0.05, H * 0.3, '#5a5686', 0.18, t, { seed: 4, speed: 0.4 });
  }));
  if (o.car !== false) S.layers.push(screenLayer(0.6, (ctx, t, W, H, view) => drawCarRear(ctx, view, { t })));
  if (o.rain !== false) S.layers.push(screenLayer(0.95, (ctx, t, W, H, view) => laneRainHits(ctx, view, LANE, t, { n: o.hits ?? 240 })));
  if (o.blur) for (let i = n0; i < S.layers.length; i++) Object.assign(S.layers[i], { blur: o.blur, group: 'lane' });
  if (o.rain !== false) S.layers.push(screenLayer(3, (ctx, t, W, H) => rain(ctx, W, H, t, { density: o.rainDensity ?? 0.8, angle: 0.08, speed: 0.07, len: 50, color: '#aebde0', alpha: 0.35, seed: 3 })));
}

// ---- A1 establishing: crane down between the roofs to the wet lane ---------
function A1() {
  return shot({
    name: 'A1', dur: 150, unit: 30, anchor: [0.5, 0.5], fadeIn: 36, grade: nightGrade, post: nightPost,
    cam: { x: -4, y: -168, z: 1, ty: -0.3 },
    setup(S) {
      S.camera.move(6, 146, { y: -6, x: -7, ty: -0.04, dz: 28 }, 'inout');
      laneSet(S, {});
      S.extraEvents = [{ t: 0, type: 'amb', name: 'city_rain' }];
    },
  });
}

// ---- A2 under the car: two eyes open in the dark ---------------------------
function A2() {
  return shot({
    name: 'A2', dur: 96, unit: 150, anchor: [0.5, 0.5], grade: nightGrade, post: nightPost,
    cam: { x: -6.5, y: -0.8, z: 1, dz: 9 },
    setup(S) {
      S.camera.move(0, 96, { dz: 12.5, x: -7.2 }, 'inout');
      laneSet(S, { hits: 120 });
      // eyes in the dark gap under the rear bumper
      S.layers.push(screenLayer(0.7, (ctx, t, W, H, view) => {
        const open = smoothstep(26, 34, t) * (1 - (t > 60 && t < 66 ? 1 : 0));
        if (open <= 0) return;
        for (const sx of [-1, 1]) {
          const [X, Y] = P3(view, -9.2 + sx * 0.36, -0.72, CAR.d + 2.5);
          const s = S3(view, CAR.d + 2.5);
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          lampGlow(ctx, X, Y, 0.5 * s, '#c8f0a0', 0.5 * open, 0.2);
          ctx.restore();
          ctx.fillStyle = css('#e6ffc8', open);
          ctx.beginPath();
          ctx.ellipse(X, Y, 0.1 * s, 0.13 * s * open, 0, 0, TAU);
          ctx.fill();
        }
      }));
      S.extraEvents = [{ t: 28, type: 'eyes_open' }];
    },
  });
}

const lampLight = () => ({ tint: '#7d80b8', amt: 0.6, lift: '#1c1a30' });
const cuLight = () => ({ tint: '#8a8cc4', amt: 0.5, lift: '#1c1a30' });
// where the cat stands in front of the car after crawling out
const SPOT = { x: -8.6, d: 12.5 };

// ---- A3 wide: crawls out from under the car and stands up -----------------
function A3() {
  return shot({
    name: 'A3', dur: 78, unit: 100, anchor: [0.5, 0.6], grade: nightGrade, post: nightPost,
    cam: { x: -1.8, y: -1.4, z: 1, dz: 8 },
    setup(S) {
      S.camera.move(10, 78, { dz: 10, x: -2.6 }, 'inout');
      laneSet(S, { hits: 160 });
      const bodyTop = (view) => [P3(view, CAR.x0, -13.4, CAR.d), P3(view, CAR.x1, -1.55, CAR.d)];
      const cat = viewCat(S, {
        z: 0.7, mode: 'front', gait: 'walk', light: lampLight, shadowFlat: 0.12,
        init: { x: -9, d: CAR.d + 4, crouch: 1.7, stride: 0.55, hPitch: -0.12, earRot: 0.35, earFlat: 0.45, lookY: -0.2, tail: 0.3 },
        clip(ctx, view, t, k) {
          if (k.d < CAR.d - 0.2) return;
          const [a, b] = bodyTop(view);
          ctx.beginPath();
          ctx.rect(0, 0, view.W, view.H);
          ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
          ctx.clip('evenodd');
        },
      });
      cat.key(4, {}, 'linear');
      cat.key(40, { d: SPOT.d + 1.5, x: SPOT.x }, 'out');
      cat.key(42, { crouch: 1.7 }, 'linear');
      cat.key(54, { crouch: 0, stride: 0, earFlat: 0, earRot: 0.1, hPitch: 0.05, lookY: 0.1, tail: 0.8 }, 'out');
      cat.key(66, { d: SPOT.d, stride: 0.6 }, 'inout');
      cat.key(72, { stride: 0 }, 'inout');
      cat.event(6, 'crawl', { dur: 34 });
    },
  });
}

// ---- A3b medium: a big yawn, then looks around the rainy lane -------------
function A3b() {
  return shot({
    name: 'A3b', dur: 100, unit: 100, anchor: [0.5, 0.64], grade: nightGrade, post: nightPost,
    cam: { x: SPOT.x + 0.6, y: -1.55, z: 1, dz: 21.5 },
    setup(S) {
      S.camera.move(0, 100, { dz: 22.4 }, 'linear');
      laneSet(S, { hits: 120, blur: 1.2 });
      const cat = viewCat(S, { z: 0.7, mode: 'front', light: lampLight, shadowFlat: 0.1, init: { x: SPOT.x, d: SPOT.d, tail: 0.8 } });
      cat.key(6, { hPitch: 0.1 }, 'inout');
      cat.key(16, { mouth: 1, mouthW: 0.55, squeeze: 1, tongue: 1, hPitch: 0.32, earRot: 0.55, earFlat: 0.2, crouch: -0.1, whisk: 0.8 }, 'out');
      cat.key(34, { mouth: 0.9 }, 'inout');
      cat.key(40, { mouth: 0, mouthW: 0, squeeze: 0, tongue: 0, hPitch: 0, earRot: 0.1, earFlat: 0, crouch: 0, whisk: 0 }, 'inout');
      cat.key(44, { mouth: 0.15 }, 'inout');
      cat.key(47, { mouth: 0 }, 'inout');
      cat.key(58, { hYaw: -0.75, lookX: -0.4 }, 'inout');
      cat.key(70, { hYaw: -0.7 }, 'inout');
      cat.key(82, { hYaw: 0.55, lookX: 0.35, hPitch: 0.08 }, 'inout');
      cat.key(100, { hYaw: 0.45 }, 'inout');
      cat.event(14, 'yawn');
    },
  });
}

// ---- A4 close-up: a drop lands on the nose — cross-eyed — sneeze ----------
function A4() {
  return shot({
    name: 'A4', dur: 124, unit: 100, anchor: [0.5, 0.5], grade: nightGrade, post: nightPost,
    cam: { x: SPOT.x - 1.2, y: -1.9, z: 1, dz: 6 },
    setup(S) {
      laneSet(S, { hits: 80, blur: 7, car: false });
      const tHit = 30, tSneeze = 74;
      const cu = closeUp(S, { x: 0.5, y: 0.6, scale: 0.46, light: cuLight, drift: 1, init: { hYaw: 0.3, lookX: 0.3, hPitch: 0.06, earRot: 0.15 } });
      cu.key(14, { hYaw: 0.05, lookX: 0, lookY: 0.2 }, 'inout');
      // the drop hits: eyes pop, then go cross-eyed on the bead
      cu.key(tHit, {}, 'hold');
      cu.key(tHit + 2, { eyeWide: 0.6, earRot: -0.1, earFlat: 0, hPitch: -0.03 }, 'out');
      cu.key(tHit + 12, { cross: 1, lookY: -0.4, hPitch: -0.08, eyeWide: 0.3, mouth: 0.08, earLR: 0.3, earRR: 0.3 }, 'inout');
      cu.key(tHit + 30, { cross: 1 }, 'hold');
      // the nose tickles: ah… ah…
      cu.key(tSneeze - 12, { cross: 0.3, squeeze: 0.6, hPitch: 0.22, mouth: 0.25, mouthW: 0.2, earRot: 0.4, whisk: 0.7 }, 'inout');
      cu.key(tSneeze - 3, { squeeze: 1, hPitch: 0.3, mouth: 0.35 }, 'in');
      cu.key(tSneeze, { cross: 0, hPitch: -0.3, mouth: 0.75, mouthW: 0.4, earFlat: 0.6, earRot: 0.7, whisk: -0.8 }, 'out');
      cu.key(tSneeze + 5, { mouth: 0.1, hPitch: -0.2 }, 'inout');
      // shakes it off (fast, on ones)
      const sh = [0.45, -0.4, 0.4, -0.3, 0.22, -0.1];
      sh.forEach((y, i) => cu.key(tSneeze + 8 + i * 2, { hYaw: y, hRoll: -y * 0.4, earLR: i % 2 ? 0.6 : 0, earRR: i % 2 ? 0 : 0.6 }, 'inout'));
      cu.key(tSneeze + 24, { hYaw: 0.05, hRoll: 0, squeeze: 0, earFlat: 0.1, earRot: 0.2, earLR: 0, earRR: 0, whisk: 0, hPitch: 0, mouth: 0 }, 'out');
      cu.key(tSneeze + 32, { lid: 0.28, smile: -0.35, puff: 0.6 }, 'inout'); // a little offended
      cu.key(tSneeze + 50, { lid: 0.2 }, 'inout');
      cu.emote(tSneeze + 30, 'sweat', { dur: 30 });
      // the drop: falls, beads on the nose, flies off in the sneeze
      S.layers.push(screenLayer(2, (ctx, t, W, H) => {
        const an = cu.anchor;
        if (!an) return;
        const nose = an.P([0.49, -0.1, 0]);
        const u = an.u / 0.36;
        if (t < tHit) {
          const k = (t - (tHit - 10)) / 10;
          if (k < 0) return;
          const y = lerp(-H * 0.1, nose[1] - u * 0.06, k * k);
          ctx.fillStyle = 'rgba(215,228,255,0.85)';
          ctx.beginPath();
          ctx.ellipse(nose[0], y, u * 0.035, u * 0.08, 0, 0, TAU);
          ctx.fill();
        } else if (t < tSneeze) {
          // bead sitting on the nose, catching the light
          const wob = 1 + 0.15 * Math.sin((t - tHit) * 0.9) * Math.exp(-(t - tHit) / 8);
          ctx.fillStyle = 'rgba(205,220,255,0.75)';
          ctx.beginPath();
          ctx.ellipse(nose[0], nose[1] - u * 0.045, u * 0.05 * wob, u * 0.04 / wob, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.beginPath();
          ctx.arc(nose[0] - u * 0.018, nose[1] - u * 0.06, u * 0.012, 0, TAU);
          ctx.fill();
          if (t < tHit + 6) {
            const k = (t - tHit) / 6;
            ctx.fillStyle = css('#d8e4ff', 0.8 * (1 - k));
            for (let i = 0; i < 6; i++) {
              const a = -Math.PI * (0.1 + 0.8 * (i / 5));
              ctx.beginPath();
              ctx.arc(nose[0] + Math.cos(a) * k * u * 0.25, nose[1] - u * 0.05 + Math.sin(a) * k * u * 0.2 + k * k * u * 0.1, u * 0.012, 0, TAU);
              ctx.fill();
            }
          }
        } else if (t < tSneeze + 14) {
          // spray
          const k = (t - tSneeze) / 14;
          ctx.fillStyle = css('#d8e4ff', 0.85 * (1 - k));
          for (let i = 0; i < 14; i++) {
            const a = Math.PI * (0.15 + 0.7 * hash01(i * 7)) , v = 0.4 + 0.8 * hash01(i * 3);
            ctx.beginPath();
            ctx.arc(nose[0] + Math.cos(a) * (hash01(i) - 0.5) * 2 * k * u * v, nose[1] + Math.sin(a) * k * u * v * 0.6 + k * k * u * 0.3, u * (0.008 + 0.012 * hash01(i * 5)), 0, TAU);
            ctx.fill();
          }
        }
      }));
      S.extraEvents = [{ t: tHit, type: 'drop_nose' }, { t: tSneeze, type: 'sneeze' }, { t: tSneeze + 8, type: 'headshake' }];
      S.camera.key(tSneeze, {}, 'linear');
      S.camera.key(tSneeze + 1, { shake: 2.5 }, 'out');
      S.camera.key(tSneeze + 8, { shake: 0 }, 'inout');
    },
  });
}

// ---- A5 over the shoulder: a gust comes down the lane, the card in it -----
// debris tumbling toward the camera in the wind (newspaper sheets, leaves)
function debrisLayer(S, items, z) {
  S.layers.push(screenLayer(z, (ctx, t, W, H, view) => {
    const list = items.map((it) => ({ it, q: it.at(t) })).filter((e) => e.q).sort((a, b) => b.q.d - a.q.d);
    for (const { it, q } of list) {
      onPlane(ctx, view, 'd', q.x, q.y, q.d, (g) => {
        g.rotate(q.ang);
        g.scale(Math.max(0.05, Math.abs(Math.cos(q.flip))), 1);
        it.draw(g, q, t);
      });
    }
  }));
}
function paperItem(seed, t0, x0, y0, d0, speed, kind) {
  const col = kind === 'leaf' ? ['#c98a3e', '#a8703a', '#d9a650', '#8a6a3a'][seed % 4] : '#cfcbbd';
  return {
    at(t) {
      const tt = t - t0;
      if (tt < 0) return null;
      const d = d0 - tt * speed;
      if (d < -40) return null;
      return {
        x: x0 + Math.sin(tt * 0.07 + seed) * 2.5,
        y: Math.min(-0.1, y0 + Math.sin(tt * 0.11 + seed * 3) * 2.2 - Math.max(0, 10 - tt) * 0),
        d,
        ang: tt * (0.08 + 0.05 * hash01(seed)) * (seed % 2 ? 1 : -1),
        flip: tt * 0.12 + seed,
      };
    },
    draw(g) {
      g.fillStyle = col;
      if (kind === 'leaf') {
        g.beginPath();
        g.ellipse(0, 0, 0.5, 0.26, 0, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(80,50,30,0.6)';
        g.lineWidth = 0.04;
        g.beginPath();
        g.moveTo(-0.5, 0);
        g.lineTo(0.5, 0);
        g.stroke();
      } else {
        g.fillRect(-1.6, -1.1, 3.2, 2.2);
        g.fillStyle = 'rgba(60,60,70,0.45)';
        for (let i = 0; i < 6; i++) g.fillRect(-1.4, -0.9 + i * 0.32, 1.2 + (i % 2) * 0.9, 0.12);
        g.fillRect(0.2, -0.9, 1.1, 0.9);
      }
    },
  };
}
function A5() {
  return shot({
    name: 'A5', dur: 84, unit: 100, anchor: [0.5, 0.52], grade: nightGrade, post: nightPost,
    cam: { x: SPOT.x + 2.4, y: -2.0, z: 1, dz: SPOT.d + 18 - 4.5 },
    setup(S) {
      laneSet(S, { hits: 160, car: false });
      // Xiaohui from behind, sitting, in the left foreground
      const cat = viewCat(S, { z: 2, mode: 'sitBack', light: lampLight, shadow: false, rim: () => ({ color: '#ffc9e8', dir: [0.5, -0.86], alpha: 0.8, width: 0.035 }), init: { x: SPOT.x, d: SPOT.d + 1.5, tail: 0.6, hYaw: 0.35, hPitch: 0.05 } });
      cat.key(10, { earRot: 0.1 }, 'inout');
      cat.key(18, { earRot: -0.15, hYaw: 0.05, hPitch: 0.1 }, 'out'); // ears forward: something coming
      cat.key(40, { hYaw: 0.0, hPitch: 0.15, tail: 0.3, tailFlick: 0.6 }, 'inout');
      cat.key(62, { earFlat: 0.35, earRot: 0.5, fluff: 0.5 }, 'out');
      // the gust: papers and leaves along the lane, the postcard among them
      const items = [];
      for (let i = 0; i < 16; i++) items.push(paperItem(i + 1, 4 + i * 3, -10 + hash01(i * 7) * 20, -1 - hash01(i * 3) * 6, 170 + hash01(i * 11) * 60, 2.6 + hash01(i * 5) * 1.2, i % 3 ? 'leaf' : 'paper'));
      debrisLayer(S, items, 1);
      // the card: flips end over end straight at the cat's face
      const card = new CardProp({ x: 0, y: 0, scale: 1.2, wear: 0 });
      const cardD = new Track({ x: -2, y: -6, d: 150, ang: 0, flip: 0 });
      cardD.key(0, {}, 'linear');
      cardD.key(20, {}, 'linear');
      cardD.key(56, { x: SPOT.x + 1.2, y: -3.2, d: 40, ang: 5, flip: 9 }, 'linear');
      cardD.key(78, { x: SPOT.x + 0.2, y: -2.2, d: SPOT.d + 2.4, ang: 7.8, flip: 12.6 }, 'in');
      S.layers.push(screenLayer(1.5, (ctx, t, W, H, view) => {
        if (t >= 80) return;
        const q = cardD.sample(Math.floor(t / 2) * 2 + (t >= 64 ? t % 2 : 0));
        onPlane(ctx, view, 'd', q.x, q.y, q.d, (g) => {
          g.rotate(q.ang);
          const c = Math.cos(q.flip);
          drawCard(g, 0, 0, { sx: Math.sign(c) * Math.max(0.06, Math.abs(c)), wear: 0, scale: 1.2, px: 512, bend: 0.25 * Math.sin(q.flip * 1.3) });
        });
      }));
      S.layers.push(screenLayer(2.5, (ctx, t, W, H) => {
        // wind streaks
        const a = smoothstep(8, 24, t);
        ctx.strokeStyle = css('#c6cdf0', 0.12 * a);
        ctx.lineWidth = 1.2 * W / 1920;
        for (let i = 0; i < 18; i++) {
          const y = H * hash01(i * 3), x = ((hash01(i * 7) + t * 0.03 * (1 + hash01(i))) % 1.4 - 0.2) * W;
          ctx.beginPath();
          ctx.moveTo(W - x, y);
          ctx.quadraticCurveTo(W - x - 60 * W / 1920, y - 8, W - x - 160 * W / 1920, y + 4);
          ctx.stroke();
        }
      }));
      S.extraEvents = [{ t: 6, type: 'gust' }, { t: 20, type: 'paper', strength: 0.4 }, { t: 60, type: 'paper', strength: 0.7 }, { t: 78, type: 'whoosh' }];
    },
  });
}

// ---- A6 side: the card slaps onto its face ---------------------------------
// side views look across the lane at its left wall (camera turned to −x);
// screen right is down the lane (+d)
const SIDE = { px: SPOT.x, pd: SPOT.d };
function sideCam(o = {}) {
  return Object.assign({ yaw: -Math.PI / 2, px: SIDE.px, pd: SIDE.pd, x: 0, y: -1.6, z: 1, dz: 0 }, o);
}
function A6() {
  return shot({
    name: 'A6', dur: 64, unit: 150, anchor: [0.5, 0.6], grade: nightGrade, post: nightPost,
    cam: sideCam({ x: 0.9, y: -1.5 }),
    setup(S) {
      laneSet(S, { hits: 120, blur: 2.5, car: false });
      const tHit = 10;
      const cat = makeCat(S, {
        x: 0, facing: 1, ...catNight, z: 1,
        carry: { wear: 0, on: () => false, face: (t) => (t >= tHit ? { slide: 0, ang: 0.08 * Math.sin(t * 0.7) * Math.exp(-(t - tHit) / 10), bend: 0.2 * Math.exp(-(t - tHit) / 6) } : null) },
        pose: { hYaw: 0.25, earRot: -0.1, eyeWide: 0.3 },
      });
      const P = cat.perf;
      // the card flies in from the right
      const card = new CardProp({ x: 7, y: -3.2, ang: -0.6, sx: 0.8, scale: 1.2, wear: 0 });
      card.key(0, {}, 'linear');
      card.key(tHit, { x: 1.9, y: -2.05, ang: -0.1, sx: -1 }, 'in');
      card.key(tHit + 1, { vis: 0 }, 'step');
      S.layers.push(layer(1, 1.2, (ctx, t) => card.draw(ctx, t, { px: 512 })));
      // knocked back: the front rears up, the head snaps back — and it plops
      // down on its bottom
      P.holdAll(tHit);
      P.setTiming(tHit, 1);
      const F = A.frameOf(P);
      P.key(tHit + 3, { hip: F.P(-0.3, -0.98), pitch: 0.5, archB: 0.2, neck: 0.95, hPitch: 0.35, fn: F.P(0.8, -0.45), ff: F.P(0.66, -0.3), fnC: 0.7, ffC: 0.6, earRot: 0.9, earFlat: 0.5, fluff: 0.8, tailA: 0.2, tailC: 0.2 }, 'out');
      const G = Object.assign({}, F, { P: (dx, dy) => F.P(dx - 0.45, dy), Pg: (dx, dy = 0) => F.Pg(dx - 0.45, dy) });
      P.key(tHit + 8, Object.assign(A.sitPose(G), { hip: G.P(-0.16, -0.36), neck: 0.55, hPitch: 0.22, earRot: 0.85, earFlat: 0.45, fluff: 0.6, fnC: 0, ffC: 0, tailA: -0.3, tailC: 0.6 }), 'in');
      P.event(tHit + 8, 'plop', { x: G.x0 - 0.6, y: 0 });
      P.setTiming(tHit + 9, 2);
      P.key(tHit + 13, Object.assign(A.sitPose(G), { neck: 0.45, hPitch: 0.18, earRot: 0.8, earFlat: 0.4, fluff: 0.4 }), 'out');
      P.key(tHit + 30, { fluff: 0.2, hPitch: 0.25, hRoll: 0.12 }, 'inout');
      P.key(tHit + 50, { hRoll: -0.08 }, 'inout');
      P.emote(tHit + 1, 'surprise', { dur: 16 });
      S.extraEvents = [{ t: tHit, type: 'card_slap' }];
    },
  });
}

// ---- A7 closer: paws the card off its face ---------------------------------
function A7() {
  return shot({
    name: 'A7', dur: 100, unit: 240, anchor: [0.5, 0.62], grade: nightGrade, post: nightPost,
    cam: sideCam({ x: 0.3, y: -1.5, dz: 0 }),
    setup(S) {
      laneSet(S, { hits: 90, blur: 5, car: false });
      const x0 = -0.45;
      const tOff = 64;
      const cat = makeCat(S, {
        x: x0, facing: 1, ...catNight, z: 1,
        pose0: sittingPose(x0, 1, () => 0, { hYaw: 0.3, hPitch: 0.2, earRot: 0.7, earFlat: 0.4 }),
        carry: { wear: 0, on: () => false, face: (t) => (t < tOff ? { slide: smoothstep(20, tOff, t) * 0.35 + 0.05 * Math.sin(t * 0.8) * (t > 20 ? 1 : 0), ang: 0.1 * Math.sin(t * 0.33) } : null) },
      });
      const P = cat.perf;
      const F = A.frameOf(P);
      // alternate paws swiping at the face
      const swipes = [[8, 'fn'], [18, 'ff'], [28, 'fn'], [38, 'ff'], [48, 'fn'], [56, 'ff']];
      for (const [t, leg] of swipes) {
        const up = [x0 + 0.72, -1.55 + (leg === 'ff' ? 0.1 : 0)];
        P.key(t, { [leg]: up, [leg + 'C']: 0.8 }, 'out');
        P.key(t + 5, { [leg]: [x0 + 0.55, -1.25], [leg + 'C']: 0.5 }, 'in');
        P.key(t + 9, { [leg]: [x0 + (leg === 'fn' ? 0.42 : 0.33), 0], [leg + 'C']: 0 }, 'inout');
        P.event(t + 4, 'paw_swipe', {});
      }
      P.key(10, { hPitch: 0.1, hRoll: 0.15 }, 'inout');
      P.key(30, { hPitch: 0.28, hRoll: -0.15 }, 'inout');
      P.key(50, { hPitch: 0.05, hRoll: 0.1 }, 'inout');
      // off! the card flops to the ground
      P.key(tOff, { hPitch: -0.1, earRot: 0.2, earFlat: 0, whisk: 0.9, eyeWide: 0.3, hRoll: 0 }, 'out');
      P.key(tOff + 10, { whisk: -0.4, whiskDroop: 0.6, eyeWide: 0.1, hPitch: -0.25, lookY: -0.6, hYaw: 0.2 }, 'inout');
      P.emote(tOff + 12, 'question', { dur: 40 });
      A.blink(P, tOff + 20, 6);
      const card = new CardProp({ x: x0 + 1.45, y: -1.35, ang: 0.1, sx: -1, scale: 1.2, wear: 0, vis: 0 });
      card.key(tOff - 1, {}, 'linear');
      card.key(tOff, { vis: 1 }, 'step');
      card.key(tOff + 6, { x: x0 + 1.9, y: -0.6, ang: 0.8, sx: -0.6 }, 'in');
      card.key(tOff + 10, { x: x0 + 2.1, y: 0.05, ang: 0, sx: 1, sy: 0.3, skew: -0.3 }, 'in');
      card.key(tOff + 13, { y: -0.02, sy: 0.36 }, 'out');
      card.key(tOff + 16, { y: 0.05, sy: 0.3 }, 'in');
      S.layers.push(layer(1, 1.1, (ctx, t) => card.draw(ctx, t, { px: 512 })));
      S.extraEvents = [{ t: tOff, type: 'paper', strength: 0.5 }, { t: tOff + 10, type: 'paper_slide' }];
    },
  });
}

// ---- A8 insert, from above: the postcard — and the sea in it moves ---------
function A8() {
  return shot({
    name: 'A8', dur: 144, unit: 100, anchor: [0.5, 0.5], grade: { vignette: 0.6, vignetteColor: '#10101e', grain: 0.45 },
    post: { bloom: { threshold: 0.7, knee: 0.25, strength: 0.5, radius: 24 } },
    setup(S) {
      const zoom = new Track({ z: 1, rot: -0.05, live: 0 });
      zoom.key(0, {}, 'linear');
      zoom.key(144, { z: 1.55, rot: -0.02 }, 'inout');
      zoom.key(30, { live: 0 }, 'linear');
      zoom.key(60, { live: 1 }, 'inout');
      S.layers.push(screenLayer(0, (ctx, t, W, H) => {
        const k = W / 1920;
        const zz = zoom.sample(t);
        // wet asphalt from above: dark, speckled, neon smeared in the water film
        ctx.fillStyle = '#12151f';
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(zz.z, zz.z);
        ctx.rotate(zz.rot);
        for (let i = 0; i < 700; i++) {
          const x = (hash01(i * 7) - 0.5) * W * 1.4, y = (hash01(i * 11) - 0.5) * H * 1.4;
          ctx.fillStyle = css(hash01(i * 3) < 0.5 ? '#2a2f40' : '#0a0c14', 0.6);
          ctx.fillRect(x, y, 3 * k * (0.5 + hash01(i)), 3 * k * (0.5 + hash01(i * 5)));
        }
        ctx.globalCompositeOperation = 'screen';
        glow(ctx, -W * 0.35, -H * 0.3, W * 0.3, '#ff5fa2', 0.16);
        glow(ctx, W * 0.4, H * 0.35, W * 0.28, '#58e1ff', 0.12);
        glow(ctx, W * 0.1, -H * 0.45, W * 0.35, '#ffcf86', 0.14);
        ctx.globalCompositeOperation = 'source-over';
        // the card
        const cw = W * 0.5, ch = cw * CARD.h / CARD.w;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-cw / 2 + 8 * k, -ch / 2 + 10 * k, cw, ch);
        ctx.fillStyle = '#f6f2ea';
        ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
        const b = cw * 0.045;
        ctx.save();
        ctx.beginPath();
        ctx.rect(-cw / 2 + b, -ch / 2 + b, cw - 2 * b, ch - 2 * b);
        ctx.clip();
        // the picture comes alive: the sea shimmers, clouds drift, the beam turns
        const tl = t * zz.live;
        drawSeaView(ctx, -cw / 2 + b, -ch / 2 + b, cw - 2 * b, ch - 2 * b, { palette: 'postcard', t: 40 + tl * 3, cloudDrift: tl * 0.08 });
        liveSea(ctx, -cw / 2 + b, -ch / 2 + b, cw - 2 * b, ch - 2 * b, tl, zz.live);
        ctx.restore();
        // the night light on the paper; rain beads
        ctx.fillStyle = 'rgba(40,50,100,0.28)';
        ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
        ctx.fillStyle = css('#ffffff', 0.05 + 0.1 * zz.live);
        ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
        for (let i = 0; i < 18; i++) {
          const x = (hash01(i * 13) - 0.5) * cw * 0.95, y = (hash01(i * 17) - 0.5) * ch * 0.9;
          const r = (3 + 7 * hash01(i * 3)) * k;
          ctx.fillStyle = 'rgba(220,232,255,0.3)';
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.85, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath();
          ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, TAU);
          ctx.fill();
        }
        // raindrops landing around (rings)
        for (let i = 0; i < 30; i++) {
          const per = 20 + Math.floor(hash01(i) * 16);
          const a = ((t + hash01(i * 3) * per) % per) / per;
          const cyc = Math.floor((t + hash01(i * 3) * per) / per);
          const x = (hash01(i * 7 + cyc * 3) - 0.5) * W * 1.2, y = (hash01(i * 5 + cyc * 7) - 0.5) * H * 1.2;
          if (Math.abs(x) < cw / 2 && Math.abs(y) < ch / 2) continue;
          ctx.strokeStyle = css('#c8d4f0', 0.5 * (1 - a));
          ctx.lineWidth = 1.5 * k;
          ctx.beginPath();
          ctx.ellipse(x, y, a * 26 * k, a * 22 * k, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }));
      S.extraEvents = [{ t: 30, type: 'card_waves' }, { t: 36, type: 'music_card' }];
    },
  });
}
// the living postcard: travelling wave crests, a turning lighthouse beam, gulls
function liveSea(ctx, x, y, w, h, t, a) {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = a;
  const hz = y + h * 0.42;
  // swell lines rolling in toward the viewer
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 7; i++) {
    const u = ((t * 0.006 + i / 7) % 1);
    const yy = hz + Math.pow(u, 1.8) * (h * 0.58);
    ctx.lineWidth = Math.max(1, h * 0.004 * (0.4 + u * 2));
    ctx.globalAlpha = a * Math.sin(Math.PI * u) * 0.8;
    ctx.beginPath();
    for (let k = 0; k <= 20; k++) {
      const xx = x + (w * 0.66 * k) / 20;
      const yw = yy + Math.sin(k * 0.9 + t * 0.05 + i) * h * 0.004 * (1 + u * 3);
      if (k) ctx.lineTo(xx, yw);
      else ctx.moveTo(xx, yw);
    }
    ctx.stroke();
  }
  // lighthouse beam sweeping
  const lx = x + 0.79 * w, ly = y + (0.337 - 0.1) * h;
  const ang = t * 0.045;
  const sweep = Math.cos(ang);
  ctx.globalAlpha = a * (0.25 + 0.5 * Math.max(0, sweep));
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, w * 0.5);
  g.addColorStop(0, 'rgba(255,248,210,0.9)');
  g.addColorStop(1, 'rgba(255,248,210,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  const dir = sweep > 0 ? -1 : 1;
  const spread = 0.05 + 0.05 * Math.abs(Math.sin(ang));
  ctx.lineTo(lx + dir * w * 0.5 * Math.abs(sweep), ly - h * spread);
  ctx.lineTo(lx + dir * w * 0.5 * Math.abs(sweep), ly + h * spread);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = a;
  lampGlow(ctx, lx, ly, w * 0.02, '#fff4c8', 0.9, 0.3);
  // two gulls gliding
  ctx.strokeStyle = 'rgba(60,70,90,0.8)';
  ctx.lineWidth = Math.max(1, w * 0.0025);
  for (let i = 0; i < 2; i++) {
    const gx = x + ((0.2 + i * 0.25 + t * 0.0015 * (1 + i * 0.3)) % 1) * w, gy = y + h * (0.2 + i * 0.07) + Math.sin(t * 0.05 + i) * h * 0.01;
    const fl = Math.sin(t * 0.25 + i * 2) * w * 0.004;
    ctx.beginPath();
    ctx.moveTo(gx - w * 0.015, gy - fl);
    ctx.quadraticCurveTo(gx - w * 0.006, gy - w * 0.008, gx, gy);
    ctx.quadraticCurveTo(gx + w * 0.006, gy - w * 0.008, gx + w * 0.015, gy - fl);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- A9 extreme close-up: the sea in its eyes -----------------------------
function A9() {
  return shot({
    name: 'A9', dur: 120, unit: 100, anchor: [0.5, 0.5], grade: nightGrade, post: { bloom: { threshold: 0.7, knee: 0.3, strength: 0.5, radius: 22 } },
    cam: { x: SPOT.x - 0.6, y: -3.5, z: 1, dz: 4 },
    setup(S) {
      laneSet(S, { hits: 60, blur: 9, car: false, rain: true });
      const cu = closeUp(S, {
        x: 0.5, y: 0.7, scale: 0.95, drift: 0.6, idle: { saccades: false },
        light: () => ({ tint: '#8fb0e8', amt: 0.4, lift: '#141c34' }),
        init: { hYaw: -0.08, hPitch: -0.28, lookY: -0.55, eyeWide: 0.25, reflect: 0.2, earRot: 0.3, earFlat: 0.25 },
        under(ctx, t, { x, y, s }) {},
        over(ctx, t, an, { x, y, s }) {
          // cool light from the card below
          const g = ctx.createLinearGradient(0, y + s * 0.8, 0, y - s * 0.5);
          g.addColorStop(0, 'rgba(120,180,255,0.28)');
          g.addColorStop(1, 'rgba(120,180,255,0)');
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          ctx.restore();
        },
      });
      cu.key(30, { reflect: 1, eyeWide: 0.4, sparkle: 0.3 }, 'inout');
      cu.key(60, { earRot: -0.05, earFlat: 0, mouth: 0.12, eyeWide: 0.5, sparkle: 0.6 }, 'inout');
      cu.key(100, { hPitch: -0.22, earRot: -0.12 }, 'inout');
      S.camera.move(0, 120, { z: 1.08 }, 'inout');
      S.extraEvents = [{ t: 0, type: 'music_card_hold' }];
    },
  });
}

// ---- A10 its point of view, looking up: walls, wires, a strip of night sky -
function A10() {
  return shot({
    name: 'A10', dur: 96, unit: 60, anchor: [0.5, 0.5], grade: nightGrade, post: nightPost,
    cam: { x: 0, y: -1.9, z: 1, dz: SPOT.d + 30 - 1, pitch: 0.95 },
    setup(S) {
      S.camera.move(0, 96, { pitch: 1.3 }, 'inout');
      laneSky(S, { moon: [0.55, 0.16] });
      S.layers.push(screenLayer(0.4, (ctx, t, W, H, view) => drawLane(ctx, view, LANE, { t, minDist: 30 })));
      // rain falling toward the lens from the strip of sky
      S.layers.push(screenLayer(2, (ctx, t, W, H, view) => {
        const K = view.base * view.cam.z * view.D;
        const cx = W * 0.5, cy = view.oy - K / Math.tan(view.cam.pitch);
        ctx.save();
        ctx.lineCap = 'round';
        for (let i = 0; i < 180; i++) {
          const per = 14 + Math.floor(hash01(i * 3) * 12);
          const a = ((t + hash01(i * 7) * per) % per) / per;
          const cyc = Math.floor((t + hash01(i * 7) * per) / per);
          const ang = Math.PI / 2 + (hash01(i * 11 + cyc) - 0.5) * 1.6;
          const r0 = H * (0.05 + Math.pow(a, 2.4) * 2.4) + Math.max(0, H * 0.2 - cy);
          const len = H * 0.03 * (0.3 + a * 3);
          const x = cx + Math.cos(ang) * r0, y = cy + Math.sin(ang) * r0;
          ctx.strokeStyle = css('#c8d4f0', 0.55 * Math.min(1, a * 3));
          ctx.lineWidth = (0.6 + a * 3.2) * W / 1920;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
          ctx.stroke();
        }
        ctx.restore();
      }));
      S.extraEvents = [{ t: 0, type: 'city_muffle', dur: 96 }];
    },
  });
}

// ---- A11 close-up: looks down at the card — and decides --------------------
function A11() {
  return shot({
    name: 'A11', dur: 76, unit: 100, anchor: [0.5, 0.5], grade: nightGrade, post: nightPost,
    cam: { x: SPOT.x - 1.2, y: -1.9, z: 1, dz: 6 },
    setup(S) {
      laneSet(S, { hits: 80, blur: 7, car: false });
      const cu = closeUp(S, { x: 0.46, y: 0.62, scale: 0.5, light: cuLight, init: { hYaw: -0.2, hPitch: 0.12, lookY: 0.3, earRot: 0.2, sparkle: 0.2 } });
      cu.key(14, { hPitch: -0.25, lookY: -0.6, hYaw: -0.3 }, 'inout');
      cu.key(34, {}, 'hold');
      cu.key(46, { lid: 0.2, lidTilt: 0.6, earRot: -0.12, hPitch: -0.1, lookY: -0.2, smile: 0.05, sparkle: 0 }, 'inout');
      cu.key(60, { hPitch: 0.02, lookY: 0.1, hYaw: -0.35 }, 'inout');
      S.extraEvents = [{ t: 44, type: 'music_run' }];
    },
  });
}

// ---- A12 side: picks the card up --------------------------------------------
function A12() {
  return shot({
    name: 'A12', dur: 74, unit: 140, anchor: [0.46, 0.62], grade: nightGrade, post: nightPost,
    cam: sideCam({ x: 0.8, y: -1.5 }),
    setup(S) {
      laneSet(S, { hits: 120, blur: 2.5, car: false });
      const tPick = 26;
      const cat = makeCat(S, { x: -0.6, facing: 1, ...catNight, carry: { wear: 0, on: (t) => t >= tPick } });
      const P = cat.perf;
      const card = new CardProp({ x: 1.95, y: 0.05, sx: 1, sy: 0.3, skew: -0.3, scale: 1.2 });
      P.key(0, { hYaw: 0.3, neck: 0.4, hPitch: -0.35, lookY: -0.5, lid: 0.15, lidTilt: 0.5 });
      P.key(18, { neck: -0.2, neckLen: 1.15, hPitch: -0.85, hip: [-0.45, -0.95], pitch: -0.05, mouth: 0.35, earRot: 0 }, 'inout');
      P.key(tPick, { mouth: 0.08, hPitch: -0.9 }, 'out');
      P.event(tPick, 'pickup', {});
      P.key(tPick + 10, { neck: 0.7, neckLen: 1.0, hPitch: 0.12, hip: [-0.6, -1.02], pitch: 0.06, tailA: 0.7, tailC: 0.9, earRot: -0.12 }, 'out');
      P.key(tPick + 16, { neck: 0.6, hPitch: 0.02, hYaw: 0.15 }, 'inout');
      P.t = tPick + 22;
      locomote(P, { gait: 'trot', dist: 5, accel: 8 });
      card.key(tPick - 1, {}, 'linear');
      card.key(tPick, { vis: 0 }, 'step');
      S.layers.push(layer(1, 0.999, (ctx, t) => card.draw(ctx, t, { px: 512 })));
      S.camera.follow = (t) => [smoothstep(tPick + 20, 74, t) * 3.5, 0];
    },
  });
}

// ---- A13 insert: running paws smash the neon in a puddle -------------------
function A13() {
  return shot({
    name: 'A13', dur: 48, unit: 520, anchor: [0.5, 0.62], grade: nightGrade, post: nightPost,
    cam: sideCam({ x: 0, y: -0.45, pd: SIDE.pd + 30 }),
    setup(S) {
      laneSet(S, { hits: 60, blur: 4, car: false, puddles: [{ x: SIDE.px + 0.5, d: SIDE.pd + 30 + 1.5, rx: 3.2, rz: 5 }] });
      const cat = makeCat(S, { x: -9, facing: 1, ...catNight, carry: { wear: 0 }, waterColor: '#b8c8f0' });
      const P = cat.perf;
      P.setTiming(0, 1);
      locomote(P, { gait: 'run', dist: 22, accel: 1, decel: 1, surfaceAt: (x) => (x > -3.5 && x < 6.5 ? 'water' : 'wet') });
      S.camera.follow = follow(P, { lag: 2, lead: 2, dx: 0.6, y: 0 });
    },
  });
}

// ---- A14 behind it: down the lane, onto the crates, up onto the wall -------
function A14() {
  const d0 = 150;
  return shot({
    name: 'A14', dur: 150, unit: 100, anchor: [0.5, 0.58], grade: nightGrade, post: nightPost,
    cam: { x: -1.5, y: -2.2, z: 1, dz: d0 - 8 },
    setup(S) {
      laneSet(S, { hits: 200, car: false, endWall: true });
      const c1 = END.crates[0], c2 = END.crates[1];
      const cat = viewCat(S, { z: 0.7, mode: 'back', gait: 'run', light: lampLight, card: { wear: 0 }, shadowFlat: 0.15, rim: () => ({ color: '#ffd0a0', dir: [0, -1], alpha: 0.7, width: 0.05 }), init: { x: -1, d: d0 + 2, stride: 1.1, tail: 0.6 } });
      // run away down the lane
      cat.key(0, {}, 'linear');
      cat.key(64, { d: c1.d - c1.dd - 3.5, x: c1.x + 0.2 }, 'linear');
      // hop onto the low crate
      const tj1 = 66;
      cat.key(tj1, { push: 1, stride: 0 }, 'out');
      cat.key(tj1 + 4, { y: -3.6, d: c1.d - c1.dd - 1.5, air: 1, push: 0 }, 'out');
      cat.key(tj1 + 9, { y: -c1.h, d: c1.d - 1.2, air: 0, crouch: 0.6 }, 'in');
      cat.key(tj1 + 14, { crouch: 0 }, 'out');
      // then the tall crate
      const tj2 = tj1 + 20;
      cat.key(tj2, { push: 1, crouch: 0.4 }, 'out');
      cat.key(tj2 + 5, { y: -c2.h - 4.6 - 2.4, d: c2.d - c2.dd - 0.3, air: 1, push: 0, crouch: 0 }, 'out');
      cat.key(tj2 + 10, { y: -c2.h - 4.6, d: c2.d - 0.4, air: 0, crouch: 0.5 }, 'in');
      cat.key(tj2 + 15, { crouch: 0 }, 'out');
      // and up onto the wall
      const tj3 = tj2 + 22;
      cat.key(tj3, { push: 1, crouch: 0.4 }, 'out');
      cat.key(tj3 + 6, { y: -END.h - 3.4, d: END.d - 0.2, air: 1, push: 0, crouch: 0 }, 'out');
      cat.key(tj3 + 12, { y: -END.h, d: END.d + 0.4, air: 0, crouch: 0.6 }, 'in');
      cat.key(tj3 + 18, { crouch: 0, hYaw: 0.5 }, 'out'); // a glance back
      cat.key(tj3 + 26, { hYaw: 0 }, 'inout');
      cat.key(150, { d: END.d + 1.2 }, 'inout');
      for (const t of [tj1, tj2, tj3]) cat.event(t, 'jump', {});
      for (const t of [tj1 + 9, tj2 + 10, tj3 + 12]) cat.event(t, 'land', {});
      S.camera.move(0, 66, { dz: c1.d - c1.dd - 15, y: -2.6 }, 'linear');
      S.camera.move(66, 150, { dz: END.d - 24, y: -9, ty: 0.1 }, 'inout');
    },
  });
}

// ---- A16 rooftops: the leap across the gap before the moon (speed ramp) ----
function roofSet(S) {
  S.layers.push(screenLayer(0, (ctx, t, W, H) => {
    skyGradient(ctx, W, H, [[0, '#0a0e26'], [0.5, '#1c2450'], [1, '#3a3060']]);
    stars(ctx, W, H, 90, 13, 0.8, t, 0.8);
    // the huge moon (a long lens)
    const mx = W * 0.56, my = H * 0.42, r = H * 0.36;
    glow(ctx, mx, my, r * 2.4, '#b8c4ff', 0.3);
    const g = ctx.createRadialGradient(mx - r * 0.25, my - r * 0.25, r * 0.1, mx, my, r);
    g.addColorStop(0, '#fffbea');
    g.addColorStop(1, '#efe6c8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, TAU);
    ctx.fill();
    // maria
    ctx.fillStyle = 'rgba(190,180,150,0.35)';
    for (const [u, v, rr] of [[-0.3, -0.2, 0.22], [0.15, -0.35, 0.16], [0.2, 0.15, 0.26], [-0.2, 0.35, 0.14]]) {
      ctx.beginPath();
      ctx.arc(mx + u * r, my + v * r, rr * r, 0, TAU);
      ctx.fill();
    }
  }));
  S.layers.push(at(6000, 0.05, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, { seed: 21, n: 5, y: -1400, dy: 500, w: 1600, h: 90, speed: 0.6, wrap: 9000, top: 'rgba(120,120,170,0.45)', shade: 'rgba(40,40,80,0.5)' })));
  // distant skyline silhouettes
  const sky = (seed, base, hMin, hMax, col, depth, z) => S.layers.push(at(depth, z, (ctx, t, view, S2, p) => {
    const [x0, x1] = view.xRange(p, 0.1);
    ctx.fillStyle = col;
    let x = Math.floor(x0 / 20) * 20;
    let i = 0;
    while (x < x1) {
      const w = 12 + hash01(seed + i * 3) * 30, h = hMin + hash01(seed + i * 7) * (hMax - hMin);
      ctx.fillRect(x, base - h, w + 0.5, h + 60);
      if (hash01(seed + i * 11) < 0.3) ctx.fillRect(x + w * 0.4, base - h - 8, 1.2, 8);
      for (let r = 0; r < h / 6; r++) for (let c = 0; c < w / 5; c++) if (hash01(seed * 7 + i * 31 + r * 13 + c) < 0.07) {
        ctx.fillStyle = css('#ffcf86', 0.5);
        ctx.fillRect(x + 1.5 + c * 5, base - h + 3 + r * 6, 1.6, 2.2);
        ctx.fillStyle = col;
      }
      x += w + 2 + hash01(seed + i) * 6;
      i++;
    }
  }));
  sky(3, 60, 40, 140, '#1a1c3c', 900, 0.2);
  sky(9, 30, 20, 70, '#12132c', 300, 0.3);
}
function roofTop(ctx, x0, x1, y, P = {}) {
  ctx.fillStyle = P.col || '#0d0e20';
  ctx.fillRect(x0, y, x1 - x0, 60);
  ctx.fillRect(x0, y - 0.9, x1 - x0, 0.9);
  ctx.fillStyle = P.cap || '#2a2c50';
  ctx.fillRect(x0, y - 0.9, x1 - x0, 0.16);
}
function A16() {
  const gnd = (x) => (x < 3 ? 0 : x < 15.5 ? 60 : 1.2);
  return shot({
    name: 'A16', dur: 150, unit: 70, anchor: [0.46, 0.62], grade: { vignette: 0.45, vignetteColor: '#0c0c20', grain: 0.45 },
    post: { bloom: { threshold: 0.75, knee: 0.2, strength: 0.6, radius: 30, tint: '#dfe4ff' } },
    cam: { x: -2, y: -3, z: 1 },
    setup(S) {
      roofSet(S);
      // water tank and antenna on the near roof, the next roof across the gap
      S.layers.push(at(0, 0.9, (ctx) => {
        roofTop(ctx, -60, 3, 0);
        roofTop(ctx, 15.5, 80, 1.2);
        ctx.fillStyle = '#0d0e20';
        ctx.fillRect(-14, -9, 5, 9);
        ctx.fillRect(-15, -12.5, 7, 3.6);
        ctx.fillRect(30, -18, 0.4, 19);
        ctx.fillRect(28, -14, 4.4, 0.25);
      }));
      const rim = () => ({ color: '#fff4dc', dir: [0.2, -0.98], alpha: 0.95, width: 0.07 });
      const cat = makeCat(S, { x: -12, facing: 1, ground: gnd, carry: { wear: 0 }, style: { flatColor: '#0e0f22' }, rim, light: null, z: 1 });
      const P = cat.perf;
      P.setTiming(0, 1);
      locomote(P, { gait: 'run', to: 0.8, accel: 4, decel: 2 });
      const tJ = P.t;
      A.jump(P, { dx: 16, dy: 1.2, h: 3.4, antic: 2, hold: 0, flight: 18 });
      const tL = P.t;
      locomote(P, { gait: 'run', dist: 20, accel: 3, decel: 3 });
      // speed ramp: normal → ×0.22 over the gap → normal
      const f0 = tJ + 1, slow = 4.5;
      const f1 = f0 + (tL - 2 - (tJ + 1)) * slow;
      S.warp = [[0, 0], [f0, tJ + 1], [f1, tL - 2], [f1 + 200, tL - 2 + 200]];
      S.dur = Math.min(150, Math.round(f1 + 34));
      S.camera.follow = follow(P, { lag: 6, lead: 6, dx: 1.5, y: 0.35 });
      S.extraEvents = [{ t: tJ + 1, type: 'slowmo_in' }, { t: tL - 2, type: 'slowmo_out' }];
    },
  });
}

// ---- A18 dawn: the edge of the city, the fields, the sun — the title -------
function A18() {
  return shot({
    name: 'A18', dur: 228, unit: 60, anchor: [0.5, 0.58], xfade: 36,
    grade: { vignette: 0.28, vignetteColor: '#4a3f5e', grain: 0.35 },
    post: { bloom: { threshold: 0.8, knee: 0.15, strength: 0.55, radius: 28, tint: '#ffd7a8' }, rays: { pos: [0.5, 0.42], strength: 0.5, length: 0.6, threshold: 0.84, knee: 0.1, tint: '#ffc890' } },
    cam: { x: 0.9, y: -11.3, z: 1, dz: 19.5 },
    setup(S) {
      S.camera.move(112, 228, { y: -19, dz: 14, x: 0.3, ty: -0.2 }, 'inout');
      S.layers.push(screenLayer(0, (ctx, t, W, H, view) => {
        skyGradient(ctx, W, H, DAWN.sky);
        const sy = view.oy - H * (0.13 + 0.05 * smoothstep(0, 228, t));
        glow(ctx, W * 0.5, sy, W * 0.7, '#ffd9a8', 0.65);
        lampGlow(ctx, W * 0.5, sy, W * 0.08, '#fff4dc', 1, 0.3);
        ctx.fillStyle = '#fff8ea';
        ctx.beginPath();
        ctx.arc(W * 0.5, sy, W * 0.02, 0, TAU);
        ctx.fill();
      }));
      S.layers.push(at(20000, 0.02, (ctx, t, view, S2, p) => clouds(ctx, view, p, t, { seed: 12, n: 7, y: -3000, dy: 1400, w: 5200, h: 520, speed: 1.2, wrap: 30000, top: '#fbe2d4', shade: '#a996b6', rim: '#fff4ea', glow: '#ffb487', light: [0.5, 0.5] })));
      const hills = profile({ base: 0, amp: 200, freq: 0.0012, seed: 4 });
      const forest = profile({ base: 0, amp: 24, freq: 0.004, seed: 8 });
      S.layers.push(at(3000, 0.1, (ctx, t, view, S2, p) => fillBelow(ctx, view, p, hills, '#a9b1c8', 4000, 20)));
      S.layers.push(at(700, 0.2, (ctx, t, view, S2, p) => {
        fillBelow(ctx, view, p, forest, '#94a2ac', 2000, 6);
        treeRow(ctx, view, p, t, { seed: 3, spacing: 22, h: 60, w: 40, ground: forest, trunk: '#7a8a90', dark: '#8295a0', mid: '#91a4a8', light: null, fill: 0.95 });
      }));
      // fields with a path running toward the sun
      S.layers.push(screenLayer(0.3, (ctx, t, W, H, view) => {
        groundPlane(ctx, view, { y: 0, bands: [[4, 700, ['#7e9366', '#b0b88c']]], lines: [[200, 'rgba(255,240,210,0.25)', 1.2], [90, 'rgba(90,110,70,0.2)', 0.8]] });
        // the path: a strip converging on the sun
        fill3(ctx, view, [[-1.8, 0, 6], [1.8, 0, 6], [0.4, 0, 700], [-0.4, 0, 700]], css('#d9c7a0', 0.55));
        fill3(ctx, view, [[-1.2, 0, 6], [1.2, 0, 6], [0.25, 0, 700], [-0.25, 0, 700]], css('#f3dfb8', 0.35));
      }));
      S.layers.push(screenLayer(0.35, (ctx, t, W, H, view) => fogBand(ctx, W, H, view.oy + H * 0.02, H * 0.1, '#ffe8d6', 0.45, t, { seed: 9, speed: 0.3 })));
      // grass tufts along the field near the wall
      S.layers.push(at(12, 0.4, (ctx, t, view, S2, p) => tufts(ctx, view, p, t, { ground: () => 0, spacing: 1.6, h: 2.2, width: 0.2, colors: ['#71865c', '#8a9c6c'], seed: 17, wind: windField({ base: 0.12, gust: 0.25 }), fill: 0.8 })));
      // the wall top in the foreground (the last of the city)
      S.layers.push(screenLayer(1.2, (ctx, t, W, H, view) => {
        fill3(ctx, view, faceD(3.5, -60, 60, 0, -9), '#5d5f7a');
        fill3(ctx, view, floorY(-9, -60, 60, -1, 3.5), '#8a8ca8');
        fill3(ctx, view, floorY(-9, -60, 60, -1, 0.2), css('#ffd9b0', 0.25));
        fill3(ctx, view, faceD(-1, -60, 60, -9, -8.2), '#6f7190');
      }));
      // Xiaohui: sitting on the wall, back to us, looking at the sunrise;
      // then down into the field and away along the path
      const cat = viewCat(S, {
        z: 1.3, mode: 'sitBack', gait: 'trot', card: { wear: 0.03 }, shadowColor: '#5a4a50', rim: () => ({ color: '#ffe6c0', dir: [0, -1], alpha: 0.9, width: 0.05 }),
        clip(ctx, view, t, k) {
          if (k.d < 3.4) return;
          const e = P3(view, 0, -9, 3.5);
          ctx.beginPath();
          ctx.rect(0, 0, view.W, e[1]);
          ctx.clip();
        },
        modes: [[0, 'sitBack'], [118, 'back']],
        light: () => ({ tint: '#d8c7d6', amt: 0.3, lift: '#2a2230' }),
        init: { x: 0.6, y: -9, d: 1.5, tail: 0.6, hYaw: 0.25, hPitch: 0.1 },
      });
      cat.key(30, { hYaw: 0.05, hPitch: 0.18 }, 'inout');
      cat.key(60, { tailFlick: 0.5 }, 'inout');
      cat.key(76, { tailFlick: 0 }, 'inout');
      cat.key(96, { hYaw: 0.35, hPitch: 0.05 }, 'inout'); // a last look back at the city
      cat.key(112, { hYaw: 0, hPitch: 0.1 }, 'inout');
      cat.key(118, { push: 1, crouch: 0.4 }, 'out');
      cat.key(124, { y: -4.5, d: 5.5, air: 1, push: 0, crouch: 0 }, 'out');
      cat.key(130, { y: 0, d: 7.5, air: 0, crouch: 0.7 }, 'in');
      cat.key(138, { crouch: 0, stride: 1 }, 'out');
      cat.key(228, { d: 52, x: 0.2 }, 'linear');
      cat.event(118, 'jump');
      cat.event(130, 'land', { surface: 'grass' });
      S.layers.push(screenLayer(3, (ctx, t, W, H) => {
        const a = smoothstep(140, 176, t);
        if (a <= 0) return;
        const u = W / 1920;
        ctx.textAlign = 'center';
        ctx.fillStyle = css('#3e3548', 0.85 * a);
        ctx.font = `${108 * u}px ${TITLE}`;
        ctx.fillText('去看海吧', W / 2, 210 * u);
        ctx.font = `italic 500 ${40 * u}px ${ITALIC}`;
        ctx.fillStyle = css('#4e4458', 0.8 * a);
        ctx.fillText('There is a bigger world', W / 2, 272 * u);
      }));
      S.extraEvents = [{ t: 0, type: 'amb', name: 'dawn_edge' }, { t: 0, type: 'music_title' }];
    },
  });
}

export function shots() {
  return [A1(), A2(), A3(), A3b(), A4(), A5(), A6(), A7(), A8(), A9(), A10(), A11(), A12(), A13(), A14(), A16(), A18()];
}
