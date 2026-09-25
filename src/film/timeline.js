// A timeline is a list of shots laid end to end. Each shot draws itself for a
// local frame. Shots are built lazily (on first draw) so seeking is cheap.
// Transitions: shot.fadeIn (frames, from black), shot.xfade (frames, dissolve
// from the previous shot), shot.fadeOut (frames, to black).

export class Timeline {
  constructor(shots, opts = {}) {
    this.fps = opts.fps || 24;
    this.shots = shots;
    let f = 0;
    for (const s of shots) {
      s.start = f;
      f += s.dur;
    }
    this.length = f;
    this._off = null;
  }
  shotIndexAt(f) {
    const S = this.shots;
    let lo = 0, hi = S.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (S[m].start <= f) lo = m;
      else hi = m - 1;
    }
    return lo;
  }
  ensure(shot) {
    if (!shot._built) {
      if (shot.build) shot.build();
      shot._built = true;
    }
    return shot;
  }
  offscreen(W, H) {
    if (!this._off || this._off.width !== W || this._off.height !== H) {
      this._off = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    }
    return this._off;
  }
  draw(ctx, f, W, H) {
    f = Math.max(0, Math.min(this.length - 1, Math.floor(f)));
    const i = this.shotIndexAt(f);
    const shot = this.ensure(this.shots[i]);
    const local = f - shot.start;
    ctx.save();
    shot.draw(ctx, local, W, H);
    ctx.restore();
    // dissolve from the previous shot
    if (shot.xfade && local < shot.xfade && i > 0) {
      const prev = this.ensure(this.shots[i - 1]);
      const off = this.offscreen(W, H);
      const g = off.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.save();
      prev.draw(g, prev.dur - 1 + Math.min(local, prev.hold ?? 0), W, H);
      g.restore();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1 - (local + 0.5) / shot.xfade;
      ctx.drawImage(off, 0, 0);
      ctx.restore();
    }
    let black = 0;
    if (shot.fadeIn && local < shot.fadeIn) black = Math.max(black, 1 - (local + 0.5) / shot.fadeIn);
    if (shot.fadeOut && local >= shot.dur - shot.fadeOut) black = Math.max(black, (local - (shot.dur - shot.fadeOut) + 0.5) / shot.fadeOut);
    if (black > 0) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = Math.min(1, black);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    return { shot, local };
  }
  // all events in global frames (for the sound design / FX export)
  events() {
    const out = [];
    for (const s of this.shots) {
      this.ensure(s);
      for (const e of s.events ? s.events() : []) out.push(Object.assign({}, e, { t: e.t + s.start, shot: s.name }));
    }
    return out.sort((a, b) => a.t - b.t);
  }
}
