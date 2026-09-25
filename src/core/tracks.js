// Keyframe tracks. Time unit = frames (24 fps). Each key stores a full value
// object (partial keys inherit from the previous key), and the easing of the
// interval that *starts* at that key. Props listed in `splineProps` are
// interpolated with Catmull-Rom through neighbouring keys (for arcs);
// everything else is eased linear interpolation. Strings/booleans step.
import { ease as easeFn, lerp } from './math.js';

function cloneVal(v) {
  if (Array.isArray(v)) return v.slice();
  return v;
}
function mergeVals(prev, part) {
  const out = {};
  for (const k in prev) out[k] = cloneVal(prev[k]);
  for (const k in part) if (part[k] !== undefined) out[k] = cloneVal(part[k]);
  return out;
}

export class Track {
  constructor(defaults = {}, splineProps = []) {
    this.defaults = defaults;
    this.keys = [];
    this.splineProps = new Set(splineProps);
  }
  get last() {
    return this.keys.length ? this.keys[this.keys.length - 1] : null;
  }
  lastValue() {
    return this.keys.length ? this.keys[this.keys.length - 1].v : this.defaults;
  }
  // Add a key at time t. Keys must be added in non-decreasing time order;
  // a key at the same time as the previous one replaces/merges it.
  key(t, part = {}, ease = 'inout') {
    const prev = this.lastValue();
    const v = mergeVals(prev, part);
    const last = this.last;
    if (last && Math.abs(last.t - t) < 1e-6) {
      last.v = mergeVals(last.v, part);
      last.ease = ease;
      return last;
    }
    if (last && t < last.t) {
      // insert in order (rare; used by overlay authoring)
      let i = this.keys.length - 1;
      while (i >= 0 && this.keys[i].t > t) i--;
      const base = i >= 0 ? this.keys[i].v : this.defaults;
      const k = { t, v: mergeVals(base, part), ease };
      this.keys.splice(i + 1, 0, k);
      return k;
    }
    const k = { t, v, ease };
    this.keys.push(k);
    return k;
  }
  // set the ease of the interval starting at the last key
  setEase(ease) {
    if (this.last) this.last.ease = ease;
  }
  find(t) {
    const ks = this.keys;
    let lo = 0, hi = ks.length - 1;
    if (t < ks[0].t) return -1;
    if (t >= ks[hi].t) return hi;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (ks[m].t <= t) lo = m;
      else hi = m;
    }
    return lo;
  }
  sample(t) {
    const ks = this.keys;
    if (!ks.length) return this.defaults;
    const i = this.find(t);
    if (i < 0) return ks[0].v;
    if (i >= ks.length - 1) return ks[ks.length - 1].v;
    const a = ks[i], b = ks[i + 1];
    const span = b.t - a.t;
    const u = span > 1e-9 ? (t - a.t) / span : 1;
    const e = a.ease === 'hold' ? 0 : easeFn(a.ease, u);
    const out = {};
    const va = a.v, vb = b.v;
    for (const k in va) {
      const x = va[k], y = vb[k];
      if (typeof x === 'number' && typeof y === 'number') {
        if (this.splineProps.has(k)) {
          const p0 = i > 0 ? ks[i - 1].v[k] : x, p3 = i + 2 < ks.length ? ks[i + 2].v[k] : y;
          out[k] = cr1(p0, x, y, p3, e, ks, i);
        } else out[k] = x + (y - x) * e;
      } else if (Array.isArray(x) && Array.isArray(y)) {
        if (this.splineProps.has(k)) {
          const p0 = i > 0 ? ks[i - 1].v[k] : x, p3 = i + 2 < ks.length ? ks[i + 2].v[k] : y;
          const r = new Array(x.length);
          for (let j = 0; j < x.length; j++) r[j] = cr1(p0[j], x[j], y[j], p3[j], e, ks, i);
          out[k] = r;
        } else {
          const r = new Array(x.length);
          for (let j = 0; j < x.length; j++) r[j] = x[j] + (y[j] - x[j]) * e;
          out[k] = r;
        }
      } else out[k] = e >= 1 ? y : x;
    }
    return out;
  }
  get end() {
    return this.keys.length ? this.keys[this.keys.length - 1].t : 0;
  }
}

// Non-uniform Catmull-Rom (time-scaled tangents) for scalars.
function cr1(p0, p1, p2, p3, t, ks, i) {
  const t0 = i > 0 ? ks[i - 1].t : ks[i].t - 1;
  const t1 = ks[i].t, t2 = ks[i + 1].t;
  const t3 = i + 2 < ks.length ? ks[i + 2].t : t2 + 1;
  const dt = t2 - t1 || 1;
  // cardinal tangents scaled to the interval length
  const m1 = (((p2 - p0) / Math.max(1e-6, t2 - t0)) * dt) * 1.0;
  const m2 = (((p3 - p1) / Math.max(1e-6, t3 - t1)) * dt) * 1.0;
  const tt = t * t, ttt = tt * t;
  return (2 * ttt - 3 * tt + 1) * p1 + (ttt - 2 * tt + t) * m1 + (-2 * ttt + 3 * tt) * p2 + (ttt - tt) * m2;
}

// A procedural channel: value = f(t). Used for overlays.
export const lerpObj = (a, b, t) => {
  const o = {};
  for (const k in a) {
    const x = a[k], y = b[k];
    if (typeof x === 'number' && typeof y === 'number') o[k] = lerp(x, y, t);
    else if (Array.isArray(x) && Array.isArray(y)) o[k] = x.map((v, j) => lerp(v, y[j], t));
    else o[k] = t < 0.5 ? x : y;
  }
  return o;
};
