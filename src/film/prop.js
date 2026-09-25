// Keyframed props (the postcard when it is not in Xiaohui's mouth).
import { Track } from '../core/tracks.js';
import { drawCard } from './postcard.js';

export class CardProp {
  constructor(init = {}) {
    this.track = new Track(Object.assign({ x: 0, y: 0, ang: 0, sx: 1, sy: 1, skew: 0, bend: 0, scale: 1.2, ax: 0.5, ay: 0.5, vis: 1 }, init), ['x', 'y']);
    this.track.key(0, {}, 'linear');
    this.wear = init.wear || 0;
    this.twos = init.twos ?? 2;
  }
  key(t, part, ease = 'inout') {
    this.track.key(t, part, ease);
    return this;
  }
  at(t) {
    const tt = this.twos > 1 ? Math.floor(t / this.twos) * this.twos : t;
    return this.track.sample(tt);
  }
  draw(ctx, t, o = {}) {
    const k = this.at(t);
    if (k.vis <= 0.01) return;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, k.vis);
    drawCard(ctx, k.x, k.y, { ang: k.ang, sx: k.sx, sy: k.sy, skew: k.skew, bend: k.bend, wear: o.wear ?? this.wear, scale: k.scale, ax: k.ax, ay: k.ay, px: o.px || 320 });
    ctx.restore();
  }
}
