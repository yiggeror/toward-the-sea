// CatActor: evaluates a performance at a frame (with timing, follow-through)
// and draws it through a camera transform (stage units -> pixels).
import { drawCat } from '../cat/cat.js';
import { computeSkeleton } from '../cat/rig.js';
import { torsoPoints } from '../cat/body.js';
import { tailAngles, applyFaceDynamics, cardSwing } from './secondary.js';
import { drawCard } from '../film/postcard.js';

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
  _off(i, W, H) {
    this._offs ||= [];
    let c = this._offs[i];
    if (!c || c.width !== W || c.height !== H) {
      c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
      this._offs[i] = c;
    }
    return c;
  }
  // cam: { x, y, s } => screen = (stage - [x,y]) * s + [cx, cy]
  draw(ctx, f, cam, extra = {}) {
    const t0 = this.perf.drawTime(f);
    const light = this.opts.light ? this.opts.light(t0) : null;
    const rim = this.opts.rim ? this.opts.rim(t0) : null;
    const style = Object.assign({}, this.opts.style || {}, light ? { light } : {}, extra.style || {});
    const sk = this._draw(ctx, f, cam, Object.assign({}, extra, { style }));
    if (rim && rim.alpha > 0.01) {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const A = this._off(0, W, H), B = this._off(1, W, H);
      const a = A.getContext('2d'), b = B.getContext('2d');
      a.setTransform(1, 0, 0, 1, 0, 0);
      a.clearRect(0, 0, W, H);
      a.setTransform(ctx.getTransform());
      this._draw(a, f, cam, Object.assign({}, extra, { noSmear: true, style: Object.assign({}, style, { flatColor: '#ffffff', light: null }) }));
      const dx = rim.dir[0] * cam.s * (rim.width || 0.06), dy = rim.dir[1] * cam.s * (rim.width || 0.06);
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, W, H);
      b.drawImage(A, -dx, -dy);
      a.setTransform(1, 0, 0, 1, 0, 0);
      a.globalCompositeOperation = 'destination-out';
      a.drawImage(B, 0, 0);
      a.globalCompositeOperation = 'source-in';
      a.fillStyle = rim.color;
      a.fillRect(0, 0, W, H);
      a.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = rim.mode || 'screen';
      ctx.globalAlpha = rim.alpha;
      ctx.drawImage(A, 0, 0);
      ctx.restore();
    }
    return sk;
  }
  _draw(ctx, f, cam, extra = {}) {
    const { pose, t, tail } = this.poseAt(f);
    if ((pose.smear || 0) > 0.05 && !extra.noSmear) this.drawSmear(ctx, t, cam, pose.smear);
    const s = cam.s;
    // held postcard (drawn behind the head so the mouth grips it)
    const carry = this.opts.carry;
    let beforeHead;
    if (carry && (typeof carry.on === 'function' ? carry.on(t) : carry.on !== false)) {
      const sw = cardSwing(this.perf, t, this.env);
      const wear = typeof carry.wear === 'function' ? carry.wear(t) : carry.wear || 0;
      beforeHead = (g, sk) => {
        const grip = sk.head.proj([0.44, -0.24, 0.02]);
        const yawK = Math.cos(Math.min(1.45, Math.abs(sk.pose.hYaw || 0)));
        drawCard(g, grip[0], grip[1], { ang: sw.ang, ax: 0.16, ay: 0.04, sx: Math.max(0.18, yawK), bend: sw.bend, wear, scale: carry.scale ?? 1.2, px: Math.min(512, Math.max(96, Math.round(s * 1.2))) });
      };
    }
    const sk = drawCat(ctx, pose, Object.assign({ beforeHead,
      x: cam.cx - cam.x * s,
      y: cam.cy - cam.y * s,
      scale: s,
      tailAngles: tail,
      ground: this.perf.ground,
      boil: this.opts.boil ?? 0.006,
      boilSeed: Math.floor(t) + 1,
    }, extra.style || this.opts.style || {}, extra.over || {}));
    return { pose, sk, t };
  }
}
