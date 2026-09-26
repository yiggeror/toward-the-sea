// Scene-authoring helpers shared by all sequences.
import { defaultPose } from '../cat/rig.js';
import { Perf } from '../anim/perf.js';
import { CatActor } from '../anim/actor.js';
import { STAND } from '../anim/actions.js';
import { actorLayer } from './shot.js';
import { drawEventFX, drawGroundMarks } from '../fx/events.js';
import { lerp, clamp } from '../core/math.js';
import { idleLife } from '../anim/idle.js';

let catSeed = 1;

// Standing pose at hip x (stage), facing f, on ground g.
export function standingPose(x, f = 1, ground = () => 0, over = {}) {
  const p = Object.assign(defaultPose(), STAND);
  const gy = (dx) => ground(x + f * dx);
  Object.assign(p, {
    facing: f,
    hip: [x, gy(0) - 1.0],
    fn: [x + f * 1.12, gy(1.12)], ff: [x + f * 1.02, gy(1.02)],
    hn: [x + f * 0.04, gy(0.04)], hf: [x - f * 0.06, gy(-0.06)],
  }, over);
  return p;
}

// Sitting pose (side view) with the hip at x.
export function sittingPose(x, f = 1, ground = () => 0, over = {}) {
  const p = Object.assign(defaultPose(), STAND);
  const gy = (dx) => ground(x + f * dx);
  Object.assign(p, {
    facing: f,
    hip: [x - f * 0.16, gy(0) - 0.44], pitch: 1.12, len: 0.74, neckLen: 1.0, archB: 0.34, archF: -0.08, neck: 0.42, hPitch: 0.02,
    hnM: 1, hfM: 1, hn: [x + f * 0.12, gy(0.12)], hf: [x + f * 0.05, gy(0.05)], fn: [x + f * 0.42, gy(0.42)], ff: [x + f * 0.33, gy(0.33)],
    tailA: -0.72, tailC: 2.3, tailK: 1.0,
  }, over);
  return p;
}

/**
 * Create the cat for a shot. o: { x, facing, ground, pose (overrides),
 * carry: {wear, on}, light(t), rim(t), wind(t), twos, z, fx:true }
 * Adds an actor layer (with ground marks + event FX) and returns { perf, actor }.
 */
export function makeCat(S, o = {}) {
  const ground = o.ground || (() => 0);
  const pose = o.pose0 || standingPose(o.x ?? 0, o.facing ?? 1, ground, o.pose || {});
  const perf = new Perf(pose, { twos: o.twos ?? 2, ground, name: o.name || 'cat' });
  perf.t = 0;
  // blinks, ear flicks, breathing, tail tip: never a dead frame
  if (o.idle !== false) perf.overlays.push(idleLife(o.seed ?? catSeed++, o.idle || {}));
  const actor = new CatActor(perf, {
    env: { wind: o.wind },
    carry: o.carry,
    light: o.light,
    rim: o.rim,
    style: o.style,
    boil: o.boil,
  });
  const dOf = typeof o.depth === 'function' ? o.depth : () => o.depth || 0;
  const cat = { perf, actor, ground, depth: dOf };
  S.actors.push(cat);
  if (o.layer !== false) {
    const camAt = (view, t) => {
      const d = dOf(t);
      return view.actorCam(d ? view.pOf(d) : 1);
    };
    // marks under the cat
    if (o.marks !== false) S.layers.push({
      p: 1, z: (o.z ?? 1) - 0.001,
      draw(ctx, t, view) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const cam = camAt(view, t);
        drawGroundMarks(ctx, perf.events, perf.drawTime(t), cam, { ground });
      },
    });
    S.layers.push(actorLayer(actor, o.z ?? 1, o.extra || {}, dOf));
    if (o.fx !== false) {
      S.layers.push({
        p: 1, z: (o.z ?? 1) + 0.002,
        draw(ctx, t, view) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          const cam = camAt(view, t);
          const pose = perf.poseAt(t);
          drawEventFX(ctx, perf.events, perf.drawTime(t), cam, { ground, facing: pose.facing, waterColor: o.waterColor, dustColor: o.dustColor });
        },
      });
    }
  }
  return cat;
}

/**
 * Stateless follow: camera offset = weighted average of the cat's hip over a
 * window (lag/lead in frames) plus an offset. Returns (t, c) => [dx, dy].
 */
export function follow(perf, o = {}) {
  const lag = o.lag ?? 10, lead = o.lead ?? 6;
  const n = 9;
  const ox = o.dx ?? 0.6, oy = o.dy ?? 0;
  const fy = o.y ?? 0; // vertical follow amount 0..1
  return (t) => {
    let sx = 0, sy = 0, sw = 0;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const tt = t - lag + (lag + lead) * u;
      const w = Math.sin(Math.PI * (0.1 + 0.8 * u));
      const h = perf.poseAt(tt, false).hip;
      sx += h[0] * w;
      sy += h[1] * w;
      sw += w;
    }
    const f = perf.poseAt(t, false).facing < 0 ? -1 : 1;
    return [sx / sw + ox * f * (o.faceLead ?? 1), (sy / sw + 1.0) * fy + oy];
  };
}

// linear ramp helper for time-varying params: ramp(t, [[t0, v0], [t1, v1], ...])
export function ramp(t, pts) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [a, va] = pts[i - 1], [b, vb] = pts[i];
      const u = (t - a) / (b - a);
      const e = u * u * (3 - 2 * u);
      if (typeof va === 'number') return va + (vb - va) * e;
      return va.map((v, k) => v + (vb[k] - v) * e);
    }
  }
  return pts[pts.length - 1][1];
}

// screen-space layer helper
export function screenLayer(z, draw) {
  return { screen: true, z, draw: (ctx, t, view, S) => draw(ctx, t, view.W, view.H, view, S) };
}
// layer-space layer helper (parallax factor p given directly)
export function layer(p, z, draw) {
  return { p, z: z ?? p, draw };
}
// layer at a world depth behind the stage plane; draw(ctx, t, view, S, p)
export function at(depth, z, draw) {
  return { depth, z, draw };
}

// draw a painter at a different unit scale (k stage units per painter unit)
export function scaledView(view, k) {
  return Object.assign({}, view, {
    xRange: (p, m) => view.xRange(p, m).map((x) => x / k),
    yRange: (p, m) => view.yRange(p, m).map((y) => y / k),
  });
}
// world x range visible for a layer with parallax p
export function range(view, p, margin = 0.1) {
  return view.xRange(p, margin);
}
export function inScale(ctx, view, k, fn) {
  ctx.save();
  ctx.scale(k, k);
  fn(scaledView(view, k));
  ctx.restore();
}

// draw fn in a local frame at (x, y) scaled by k
export function scaled(ctx, x, y, k, fn) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  fn();
  ctx.restore();
}
