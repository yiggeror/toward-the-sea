// Xiaohui in the non-side views, staged in the shot's 3D space: walking or
// trotting toward/away from the camera, sitting front/back, and close-up
// portraits. Each is a keyed Track (on twos by default) + idle face life +
// emotion marks.
import { Track } from '../core/tracks.js';
import { drawCatWalkFront, drawCatWalkBack, drawCatFront, drawCatBack, drawPortrait, fullFace } from '../cat/views.js';
import { drawEmotes } from '../fx/emote.js';
import { idleFace } from '../anim/idle.js';
import { drawCard } from './postcard.js';
import { css } from '../core/draw.js';
import { TAU, clamp } from '../core/math.js';
import { toCam, projC, nearC } from './persp.js';
import { scratchBuffer } from './post.js';

const FACE = {
  eye: 1, eyeWide: 0, pupil: 0.45, lookX: 0, lookY: 0, lid: 0, lidTilt: 0, happy: 0, mouth: 0, mouthW: 0, smile: 0, tongue: 0,
  whisk: 0, fluff: 0, earRot: 0.1, earFlat: 0, earLR: 0, earRR: 0, wink: 0, sparkle: 0, tear: 0, squeeze: 0, sad: 0, blush: 0,
  wobble: 0, puff: 0, whiskDroop: 0, cross: 0, reflect: 0, hYaw: 0, hPitch: 0, hRoll: 0, breath: 0,
};
// distance per gait cycle (H)
export const CYCLE = { walk: 1.3, trot: 1.75, run: 2.7 };

let seedN = 101;

/**
 * A cat drawn in a front/back view at a world position (x, y, d).
 * o: { init: {...}, mode: 'front'|'back'|'sitFront'|'sitBack', modes: [[t, mode]],
 *      gait, z, light(t), card: {wear, on(t)}, shadow, ones }
 * returns { track, key(t, part, ease), emote(t, kind, o), events }
 */
export function viewCat(S, o = {}) {
  const tr = new Track(Object.assign({ x: 0, y: 0, d: 0, stride: 0, crouch: 0, tail: 0.7, tailSway: 0.5, lift: 0, lean: 0, tailFlick: 0, cardSwing: 0, cardBend: 0, bob: 0, air: 0, push: 0 }, FACE, o.init || {}));
  tr.key(0, {}, 'linear');
  const events = [];
  const seed = o.seed ?? seedN++;
  const modes = o.modes || [[0, o.mode || 'front']];
  const gait = o.gait || 'walk';
  // cumulative path length at integer frames -> gait phase
  const cum = [0];
  const distAt = (t) => {
    const n = Math.ceil(t);
    while (cum.length <= n) {
      const i = cum.length;
      const a = tr.sample(i - 1), b = tr.sample(i);
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.d - a.d) * (o.stepK ?? 1));
    }
    const i = Math.floor(t);
    return cum[i] + (cum[Math.min(n, i + 1)] - cum[i]) * (t - i);
  };
  const modeAt = (t) => {
    let m = modes[0][1];
    for (const [tt, mm] of modes) if (t >= tt) m = mm;
    return m;
  };
  const cat = {
    track: tr,
    events,
    key(t, part, ease = 'inout') {
      tr.key(t, part, ease);
      return cat;
    },
    emote(t, kind, e = {}) {
      events.push(Object.assign({ t, type: 'emote', kind, dur: 30 }, e));
      return cat;
    },
    event(t, type, e = {}) {
      events.push(Object.assign({ t, type }, e));
      return cat;
    },
    pose(t) {
      const tt = o.ones ? t : Math.floor(t / 2) * 2;
      const k = tr.sample(tt);
      const g = k.gait || gait;
      k.phase = distAt(tt) / (CYCLE[g] || 1.3) + (o.phase0 || 0);
      k.gait = g;
      idleFace(k, tt, seed, o.idle || {});
      k.breath = 0.5 + 0.5 * Math.sin(tt * 0.09);
      return { k, tt };
    },
  };
  S.actors.push({ perf: { events: [] }, view: cat });
  S.extraEvents = S.extraEvents || [];
  S.layers.push({
    p: 1,
    z: o.z ?? 1,
    draw(ctx, t, view) {
      const { k, tt } = cat.pose(t);
      if (o.visible && !o.visible(t)) return;
      const q = toCam(view, k.x, k.y, k.d);
      if (q[2] < nearC(view)) return;
      const s = (view.base * view.cam.z * view.D) / q[2];
      const [X, Y] = projC(view, q);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (o.shadow !== false) {
        const rx = 0.62 * s, ry = rx * (o.shadowFlat ?? 0.2);
        const g = ctx.createRadialGradient(X, Y, 0, X, Y, rx);
        g.addColorStop(0, css(o.shadowColor || '#000000', 0.32));
        g.addColorStop(1, css(o.shadowColor || '#000000', 0));
        ctx.save();
        ctx.translate(X, Y);
        ctx.scale(1, ry / rx);
        ctx.translate(-X, -Y);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(X, Y, rx, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      if (o.clip) o.clip(ctx, view, t, k);
      const mode = modeAt(t);
      const card = o.card && (!o.card.on || o.card.on(tt)) ? { wear: typeof o.card.wear === 'function' ? o.card.wear(tt) : o.card.wear || 0, sx: o.card.sx } : null;
      const p = Object.assign({}, k, { card });
      const style = Object.assign({ x: X, y: Y, scale: s }, o.style || {}, o.light ? { light: o.light(tt) } : {});
      const fn = mode === 'back' ? drawCatWalkBack : mode === 'sitFront' ? drawCatFront : mode === 'sitBack' ? drawCatBack : drawCatWalkFront;
      const rim = o.rim ? o.rim(tt) : null;
      const shade = o.shade ?? 0.22;
      let an;
      if (rim || shade > 0) {
        // draw into a buffer around the cat: soft top-light / bottom shade, and a rim
        const W = view.W, H = view.H;
        const x0 = Math.max(0, Math.floor(X - s * 2.4)), y0 = Math.max(0, Math.floor(Y - s * 3.4));
        const x1 = Math.min(W, Math.ceil(X + s * 2.4)), y1 = Math.min(H, Math.ceil(Y + s * 0.4));
        if (x1 - x0 < 2 || y1 - y0 < 2) {
          ctx.restore();
          return;
        }
        const bw = Math.ceil((x1 - x0) / 32) * 32, bh = Math.ceil((y1 - y0) / 32) * 32;
        const A = scratchBuffer('vcA', bw, bh), a = A.getContext('2d');
        a.setTransform(1, 0, 0, 1, 0, 0);
        a.clearRect(0, 0, bw, bh);
        a.setTransform(1, 0, 0, 1, -x0, -y0);
        an = fn(a, p, style);
        a.setTransform(1, 0, 0, 1, 0, 0);
        if (shade > 0) {
          a.globalCompositeOperation = 'source-atop';
          const g = a.createLinearGradient(0, Y - s * 2.6 - y0, 0, Y - y0);
          g.addColorStop(0, css('#ffffff', 0));
          g.addColorStop(0.55, css('#000000', 0));
          g.addColorStop(1, css(o.shadeColor || '#1a1830', shade));
          a.fillStyle = g;
          a.fillRect(0, 0, bw, bh);
          a.globalCompositeOperation = 'source-over';
        }
        if (rim && rim.alpha > 0.01) {
          const B = scratchBuffer('vcB', bw, bh), b = B.getContext('2d');
          b.setTransform(1, 0, 0, 1, 0, 0);
          b.globalCompositeOperation = 'copy';
          b.drawImage(A, 0, 0);
          b.globalCompositeOperation = 'source-in';
          b.fillStyle = '#fff';
          b.fillRect(0, 0, bw, bh);
          const C = scratchBuffer('vcC', bw, bh), c = C.getContext('2d');
          c.setTransform(1, 0, 0, 1, 0, 0);
          c.globalCompositeOperation = 'copy';
          c.drawImage(B, 0, 0);
          c.globalCompositeOperation = 'destination-out';
          c.drawImage(B, -rim.dir[0] * s * (rim.width || 0.06), -rim.dir[1] * s * (rim.width || 0.06));
          c.globalCompositeOperation = 'source-in';
          c.fillStyle = rim.color;
          c.fillRect(0, 0, bw, bh);
          c.globalCompositeOperation = 'source-over';
          a.globalCompositeOperation = rim.mode || 'screen';
          a.globalAlpha = rim.alpha;
          a.drawImage(C, 0, 0);
          a.globalAlpha = 1;
          a.globalCompositeOperation = 'source-over';
        }
        ctx.drawImage(A, x0, y0);
      } else an = fn(ctx, p, style);
      if (events.length) drawEmotes(ctx, events, tt, an);
      ctx.restore();
    },
  });
  return cat;
}

/**
 * Close-up portrait layer. o: { init, x, y (screen fractions of W/H for the
 * head anchor), scale (fraction of H per H unit), light(t), card: {wear, on(t),
 * ang, sx}, over(ctx, t, anchor) }
 */
export function closeUp(S, o = {}) {
  const tr = new Track(Object.assign({ ax: o.x ?? 0.5, ay: o.y ?? 0.62, sc: o.scale ?? 0.5, low: 0, shrug: 0, cardAng: 0, cardY: 0 }, FACE, { hYaw: -0.15 }, o.init || {}));
  tr.key(0, {}, 'linear');
  const events = [];
  const seed = o.seed ?? seedN++;
  const cu = {
    track: tr,
    events,
    key(t, part, ease = 'inout') {
      tr.key(t, part, ease);
      return cu;
    },
    emote(t, kind, e = {}) {
      events.push(Object.assign({ t, type: 'emote', kind, dur: 30 }, e));
      return cu;
    },
    anchor: null,
  };
  S.actors.push({ perf: { events: [] }, view: cu });
  S.layers.push({
    screen: true,
    z: o.z ?? 1,
    draw(ctx, t, view) {
      const W = view.W, H = view.H;
      const tt = o.ones ? t : Math.floor(t / 2) * 2;
      const k = tr.sample(tt);
      if (o.idle !== false) idleFace(k, tt, seed, o.idle || {});
      k.breath = 0.5 + 0.5 * Math.sin(t * 0.09);
      // camera drift in close-ups (handheld feel), optional
      const dr = o.drift ?? 0;
      const dx = dr * W * 0.004 * Math.sin(t * 0.021 + 1), dy = dr * H * 0.004 * Math.sin(t * 0.017 + 2);
      const x = W * k.ax + dx, y = H * k.ay + dy, s = H * k.sc;
      const style = Object.assign({ x, y, scale: s }, o.style || {}, o.light ? { light: o.light(tt) } : {});
      if (o.under) o.under(ctx, t, { x, y, s, k });
      const an = drawPortrait(ctx, fullFace(k), style);
      cu.anchor = an;
      // the postcard gripped in the mouth, hanging toward the camera side
      if (o.card && (!o.card.on || o.card.on(tt))) {
        const m = an.P([0.44, -0.32, -0.02]);
        const wear = typeof o.card.wear === 'function' ? o.card.wear(tt) : o.card.wear || 0;
        drawCard(ctx, m[0], m[1] + k.cardY * s, { ang: (o.card.ang ?? 0.3) + k.cardAng, ax: 0.06, ay: 0.08, sx: o.card.sx ?? 0.55, wear, scale: s * 1.05, px: s > 300 ? 1024 : 512, bend: k.cardBend || 0 });
      }
      if (o.over) o.over(ctx, t, an, { x, y, s, k });
      if (events.length) drawEmotes(ctx, events, tt, an);
    },
  });
  return cu;
}
