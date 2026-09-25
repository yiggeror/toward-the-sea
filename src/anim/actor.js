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
  // Smear "multiples": translucent silhouettes of the in-between positions
  // behind a fast drawing (drawn only where the pose keys ask for it).
  drawSmear(ctx, t, cam, amt) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (!this._sm || this._sm.width !== W || this._sm.height !== H) {
      this._sm = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    }
    const g = this._sm.getContext('2d');
    const m = ctx.getTransform();
    for (const [dt, a] of [[2.6, 0.16], [1.3, 0.3]]) {
      const p = this.perf.poseAt(t - dt, false);
      groundClamp(p, this.perf.ground);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      g.setTransform(m);
      drawCat(g, p, Object.assign({
        x: cam.cx - cam.x * cam.s, y: cam.cy - cam.y * cam.s, scale: cam.s,
        tailAngles: tailAngles(this.perf, t - dt, this.env), ground: this.perf.ground,
      }, this.opts.style || {}));
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = this.opts.smearColor || 'rgba(170,164,160,1)';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = a * Math.min(1, amt);
      ctx.drawImage(this._sm, 0, 0);
      ctx.restore();
    }
  }
  // cam: { x, y, s } => screen = (stage - [x,y]) * s + [cx, cy]
  draw(ctx, f, cam, extra = {}) {
    const { pose, t, tail } = this.poseAt(f);
    if ((pose.smear || 0) > 0.05 && !extra.noSmear) this.drawSmear(ctx, t, cam, pose.smear);
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
