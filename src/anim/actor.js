// CatActor: evaluates a performance at a frame (with timing, follow-through)
// and draws it through a camera transform (stage units -> pixels).
import { drawCat } from '../cat/cat.js';
import { tailAngles, applyFaceDynamics } from './secondary.js';

export class CatActor {
  constructor(perf, opts = {}) {
    this.perf = perf;
    this.opts = opts;
    this.env = opts.env || {};
  }
  poseAt(f) {
    const perf = this.perf;
    const t = perf.drawTime(f);
    const pose = perf.poseAt(f);
    applyFaceDynamics(perf, t, pose, this.env);
    return { pose, t, tail: tailAngles(perf, t, this.env) };
  }
  // cam: { x, y, s } => screen = (stage - [x,y]) * s + [cx, cy]
  draw(ctx, f, cam, extra = {}) {
    const { pose, t, tail } = this.poseAt(f);
    const s = cam.s;
    const sk = drawCat(ctx, pose, Object.assign({
      x: cam.cx - cam.x * s,
      y: cam.cy - cam.y * s,
      scale: s,
      tailAngles: tail,
      boil: this.opts.boil ?? 0.006,
      boilSeed: Math.floor(t) + 1,
    }, this.opts.style || {}, extra));
    return { pose, sk, t };
  }
}
