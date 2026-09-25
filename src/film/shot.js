// Shot = camera + ordered layers (+ actors) + grade. Built lazily.
//
// def: {
//   name, dur, unit (px per H at 1080p), anchor [ax, ay],
//   fadeIn, fadeOut, xfade,
//   setup(S) -> called once; may create S.camera, S.layers, S.actors, S.wind...
// }
// Each layer: { p (parallax), draw(ctx, t, view, S) , screen?: true }
import { Camera, makeView, FOCAL } from './view.js';
import { applyGrade } from './grade.js';

export function shot(def) {
  const S = {
    name: def.name,
    dur: def.dur,
    fadeIn: def.fadeIn || 0,
    fadeOut: def.fadeOut || 0,
    xfade: def.xfade || 0,
    unit: def.unit || 110,
    anchor: def.anchor || [0.5, 0.56],
    layers: [],
    actors: [],
    grade: def.grade || null,
    camera: new Camera(def.cam || {}),
    def,
    D: def.D || FOCAL / (def.unit || 110),
    build() {
      if (def.setup) def.setup(S);
      // default ordering: far to near
      const zOf = (L) => L.z ?? (L.depth !== undefined ? -L.depth * 1e-4 + 1 : L.p ?? 1);
      S.layers.sort((a, b) => zOf(a) - zOf(b));
    },
    events() {
      const out = [];
      for (const a of S.actors) if (a.perf) for (const e of a.perf.events) out.push(e);
      if (S.extraEvents) for (const e of S.extraEvents) out.push(e);
      return out;
    },
    draw(ctx, f, W, H) {
      const t = f;
      const cam = S.camera.at(t);
      const view = makeView(cam, W, H, S.unit, S.anchor, S.D);
      S.view = view;
      for (const L of S.layers) {
        if (L.from !== undefined && t < L.from) continue;
        if (L.to !== undefined && t >= L.to) continue;
        ctx.save();
        const p = L.depth !== undefined ? view.pOf(L.depth) : L.p ?? 1;
        if (L.screen) ctx.setTransform(1, 0, 0, 1, 0, 0);
        else view.apply(ctx, p);
        L.draw(ctx, t, view, S, p);
        ctx.restore();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (S.grade) applyGrade(ctx, W, H, typeof S.grade === 'function' ? S.grade(t) : S.grade, t);
    },
  };
  return S;
}

// helper: a layer that draws a CatActor on the stage plane
export function actorLayer(actor, z = 1, extra = {}) {
  return {
    p: 1,
    z,
    draw(ctx, t, view) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      actor.draw(ctx, t, view.actorCam(1), typeof extra === 'function' ? extra(t) : extra);
    },
  };
}
