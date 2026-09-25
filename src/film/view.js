// Camera & perspective view.
//
// World units are H (Xiaohui's head height, about 11 cm). Each shot has a
// stage unit `unit` (pixels per H on the stage plane at 1920 width) and a
// camera distance D = F / unit (F = focal constant). A layer at `depth`
// (world units behind the stage plane; negative = foreground) has parallax
// p = D / (D + depth) and is drawn at scale unit * p, so distant things keep
// their apparent size between shots and slide by p times the camera motion.
// Layer content is authored in world coordinates.
//
// Camera track: x, y (eye position, world), z (lens zoom), rot (roll),
// tx, ty (screen-space pan/tilt as a fraction of W/H), shake.
import { Track } from '../core/tracks.js';
import { noise1 } from '../core/math.js';

export const FOCAL = 1800; // unit * D at 1920 px width

export class Camera {
  constructor(init = {}) {
    this.track = new Track(Object.assign({ x: 0, y: -1, z: 1, rot: 0, tx: 0, ty: 0, shake: 0 }, init));
    this.track.key(0, {}, 'linear');
    this.follow = null; // (t, c) => [x, y]: absolute world position overrides (added)
  }
  key(t, part, ease = 'inout') {
    this.track.key(t, part, ease);
    return this;
  }
  move(t0, t1, part, ease = 'inout') {
    if (this.track.end < t0 - 1e-6) this.track.key(t0, {}, ease);
    else this.track.setEase(ease);
    this.track.key(t1, part, 'inout');
    return this;
  }
  at(t) {
    const c = Object.assign({}, this.track.sample(t));
    if (this.follow) {
      const [fx, fy] = this.follow(t, c);
      c.x += fx;
      c.y += fy;
    }
    if (c.shake > 0) {
      c.x += noise1(t * 0.9, 5) * 0.05 * c.shake;
      c.y += noise1(t * 1.1, 9) * 0.04 * c.shake;
      c.rot += noise1(t * 0.7, 13) * 0.004 * c.shake;
    }
    return c;
  }
}

export function makeView(cam, W, H, unit, anchor = [0.5, 0.5], D = FOCAL / unit) {
  const base = unit * (W / 1920);
  const ox = W * (anchor[0] + (cam.tx || 0)), oy = H * (anchor[1] + (cam.ty || 0));
  const view = {
    W, H, cam, base, D, unit, ox, oy,
    pOf(depth) {
      return D / Math.max(1e-3, D + depth);
    },
    scaleAt(p) {
      return base * cam.z * p;
    },
    apply(ctx, p = 1) {
      const sc = view.scaleAt(p);
      if (cam.rot) {
        const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
        // rotate around the screen anchor
        const tx = ox - (cam.x * c - cam.y * s) * sc;
        const ty = oy - (cam.x * s + cam.y * c) * sc;
        ctx.setTransform(sc * c, sc * s, -sc * s, sc * c, tx, ty);
      } else ctx.setTransform(sc, 0, 0, sc, ox - cam.x * sc, oy - cam.y * sc);
    },
    toScreen(x, y, p = 1) {
      const sc = view.scaleAt(p);
      return [ox + (x - cam.x) * sc, oy + (y - cam.y) * sc];
    },
    xRange(p = 1, margin = 0.1) {
      const sc = view.scaleAt(p);
      return [cam.x - (ox + W * margin) / sc, cam.x + (W - ox + W * margin) / sc];
    },
    yRange(p = 1, margin = 0.1) {
      const sc = view.scaleAt(p);
      return [cam.y - (oy + H * margin) / sc, cam.y + (H - oy + H * margin) / sc];
    },
    actorCam(p = 1) {
      return { x: cam.x, y: cam.y, s: view.scaleAt(p), cx: ox, cy: oy };
    },
  };
  return view;
}
