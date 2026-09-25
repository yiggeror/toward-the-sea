// CatActor: evaluates a performance at a frame (with timing, follow-through)
// and draws it through a camera transform (stage units -> pixels).
import { drawCat } from '../cat/cat.js';
import { computeSkeleton } from '../cat/rig.js';
import { torsoPoints } from '../cat/body.js';
import { tailAngles, applyFaceDynamics } from './secondary.js';

// raise the body if the torso would sink into the ground
export function groundClamp(pose, ground, tol = 0.02) {
  if (!ground) return pose;
  const sk = computeSkeleton(pose);
  let pen = 0;
  for (const q of torsoPoints(sk)) {
    const xw = q[0] * sk.facing;
    pen = Math.max(pen, q[1] - ground(xw) + tol);
  }
  if (pen > 0) pose.hip = [pose.hip[0], pose.hip[1] - pen];
  return pose;
}

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
    groundClamp(pose, perf.ground);
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
      ground: this.perf.ground,
      boil: this.opts.boil ?? 0.006,
      boilSeed: Math.floor(t) + 1,
    }, this.opts.style || {}, extra));
    return { pose, sk, t };
  }
}
