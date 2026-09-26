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
import { applyPost, scratchBuffer } from './post.js';
import { setDPX } from '../core/draw.js';

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
    post: def.post || null,
    camera: new Camera(def.cam || {}),
    def,
    D: def.D || FOCAL / (def.unit || 110),
    build() {
      if (def.setup) def.setup(S);
      S.dur = Math.round(S.dur);
      // default ordering: far to near
      const zOf = (L) => L.z ?? (L.depth !== undefined ? -L.depth * 1e-4 + 1 : L.p ?? 1);
      for (const L of S.layers) L._z = zOf(L);
      S.layers.sort((a, b) => a._z - b._z);
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
      // dolly: the camera moves back as the lens widens, so distant things keep
      // their size while the stage shrinks (a real pull-back, not a zoom)
      const view = makeView(cam, W, H, S.unit, S.anchor, def.dolly ? S.D / Math.max(1e-3, cam.z) : S.D);
      S.view = view;
      const k = W / 1920;
      setDPX(k);
      const live = S.layers.filter((L) => !((L.from !== undefined && t < L.from) || (L.to !== undefined && t >= L.to)));
      const drawLayer = (g, L) => {
        g.save();
        const p = L.depth !== undefined ? view.pOf(L.depth) : L.p ?? 1;
        if (L.screen) g.setTransform(1, 0, 0, 1, 0, 0);
        else view.apply(g, p);
        L.draw(g, t, view, S, p);
        g.restore();
      };
      const post = S.post ? (typeof S.post === 'function' ? S.post(t) : S.post) : null;
      // glow passes happen before the characters are drawn (the cat's white
      // fur must not bloom); flares go on top of everything
      const before = post ? post.before ?? 1 : Infinity;
      let glowDone = !post;
      const doGlow = () => {
        if (glowDone) return;
        glowDone = true;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        applyPost(ctx, W, H, { rays: post.rays, bloom: post.bloom }, t);
        ctx.restore();
      };
      for (let i = 0; i < live.length; i++) {
        const L = live[i];
        if (!glowDone && L._z >= before) doGlow();
        const blur = typeof L.blur === 'function' ? L.blur(t) : L.blur || 0;
        const haze = typeof L.haze === 'function' ? L.haze(t) : L.haze;
        if (blur <= 0.05 && !haze) {
          drawLayer(ctx, L);
          continue;
        }
        // depth-of-field / aerial haze: render this layer (and following
        // layers with the same settings) into a buffer, tint, blur, composite
        const group = [L];
        while (i + 1 < live.length && live[i + 1].blur === L.blur && live[i + 1].haze === L.haze && live[i + 1].group === L.group && L.group !== undefined) group.push(live[++i]);
        const B = scratchBuffer('layer', W, H);
        const b = B.getContext('2d');
        b.setTransform(1, 0, 0, 1, 0, 0);
        b.globalCompositeOperation = 'source-over';
        b.globalAlpha = 1;
        b.clearRect(0, 0, W, H);
        for (const G of group) drawLayer(b, G);
        b.setTransform(1, 0, 0, 1, 0, 0);
        if (haze && haze.amount > 0) {
          b.globalCompositeOperation = 'source-atop';
          b.globalAlpha = Math.min(1, haze.amount);
          b.fillStyle = haze.color;
          b.fillRect(0, 0, W, H);
          b.globalCompositeOperation = 'source-over';
          b.globalAlpha = 1;
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (blur > 0.05) {
          // blur at half resolution, then scale back up
          const h2 = scratchBuffer('layerHalf', W / 2, H / 2);
          const g2 = h2.getContext('2d');
          g2.setTransform(1, 0, 0, 1, 0, 0);
          g2.globalCompositeOperation = 'copy';
          g2.filter = `blur(${((blur * k) / 2).toFixed(2)}px)`;
          g2.drawImage(B, 0, 0, W / 2, H / 2);
          g2.filter = 'none';
          g2.globalCompositeOperation = 'source-over';
          ctx.drawImage(h2, 0, 0, W, H);
        } else ctx.drawImage(B, 0, 0);
        ctx.restore();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      doGlow();
      if (post && post.flare) applyPost(ctx, W, H, { flare: post.flare }, t);
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
