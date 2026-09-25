// A Performance: grouped keyframe tracks for every pose field, drawing timing
// (ones/twos/threes per segment), recorded events (steps, jumps, landings…)
// and procedural overlays. Time unit: frames at 24 fps.
import { Track } from '../core/tracks.js';
import { defaultPose } from '../cat/rig.js';

export const GROUPS = {
  body: ['hip', 'pitch', 'len', 'archB', 'archF', 'chest', 'squash'],
  neck: ['neck', 'neckLen'],
  head: ['hYaw', 'hPitch', 'hRoll'],
  fn: ['fn', 'fnC', 'fnF'],
  ff: ['ff', 'ffC', 'ffF'],
  hn: ['hn', 'hnC', 'hnM'],
  hf: ['hf', 'hfC', 'hfM'],
  tail: ['tailA', 'tailC', 'tailK', 'tailTone', 'tailWave', 'tailWaveP', 'tailWorld', 'tailFront'],
  ears: ['earRot', 'earFlat', 'earLR', 'earRR'],
  eyes: ['eye', 'eyeWide', 'pupil', 'lookX', 'lookY', 'lid', 'happy'],
  mouth: ['mouth', 'mouthW', 'smile', 'tongue', 'whisk'],
  misc: ['fluff', 'breath', 'facing', 'fnTop', 'smear'],
};
const SPLINE = { body: ['hip'], fn: ['fn'], ff: ['ff'], hn: ['hn'], hf: ['hf'] };
export const LEGS = ['fn', 'ff', 'hn', 'hf'];

export class Perf {
  constructor(pose0 = defaultPose(), opts = {}) {
    this.tracks = {};
    this.fieldGroup = {};
    for (const g in GROUPS) {
      const def = {};
      for (const f of GROUPS[g]) {
        def[f] = Array.isArray(pose0[f]) ? pose0[f].slice() : pose0[f];
        this.fieldGroup[f] = g;
      }
      this.tracks[g] = new Track(def, SPLINE[g] || []);
      this.tracks[g].key(0, def, 'linear');
    }
    this.timing = [{ t: 0, n: opts.twos ?? 2 }];
    this.events = [];
    this.smears = []; // {t0, t1, amount, dir}
    this.t = 0; // authoring cursor (frames)
    this.overlays = [];
    this.ground = opts.ground || (() => 0); // ground height function y(x) in stage units
    this.name = opts.name || 'cat';
  }
  cur(field) {
    return this.tracks[this.fieldGroup[field]].lastValue()[field];
  }
  curPose() {
    const p = {};
    for (const g in this.tracks) Object.assign(p, this.tracks[g].lastValue());
    return p;
  }
  groupEnd(g) {
    return this.tracks[g].end;
  }
  // add keys at time t for the given fields (grouped)
  key(t, part, ease = 'inout') {
    const byGroup = {};
    for (const f in part) {
      const g = this.fieldGroup[f];
      if (!g) continue;
      (byGroup[g] ||= {})[f] = part[f];
    }
    for (const g in byGroup) this.tracks[g].key(t, byGroup[g], ease);
    return this;
  }
  // hold the affected groups until t0, then move to `part` arriving at t1
  move(t0, t1, part, ease = 'inout', arriveEase = 'inout') {
    const groups = new Set();
    for (const f in part) if (this.fieldGroup[f]) groups.add(this.fieldGroup[f]);
    for (const g of groups) {
      const tr = this.tracks[g];
      if (tr.end < t0 - 1e-6) tr.key(t0, {}, ease);
      else tr.setEase(ease);
    }
    this.key(t1, part, arriveEase);
    return this;
  }
  // hold all groups (or given) at time t with current values
  holdAll(t, groups = Object.keys(GROUPS)) {
    for (const g of groups) {
      const tr = this.tracks[g];
      if (tr.end < t - 1e-6) tr.key(t, {}, 'inout');
    }
    return this;
  }
  setTiming(t, n) {
    this.timing = this.timing.filter((s) => s.t < t);
    this.timing.push({ t, n });
    return this;
  }
  event(t, type, data = {}) {
    this.events.push(Object.assign({ t, type, who: this.name }, data));
  }
  drawTime(f) {
    let seg = this.timing[0];
    for (const s of this.timing) {
      if (s.t <= f + 1e-9) seg = s;
      else break;
    }
    if (seg.n <= 1) return f;
    return seg.t + Math.floor((f - seg.t) / seg.n + 1e-9) * seg.n;
  }
  poseAt(f, quantize = true) {
    const t = quantize ? this.drawTime(f) : f;
    const p = {};
    for (const g in this.tracks) Object.assign(p, this.tracks[g].sample(t));
    for (const ov of this.overlays) ov(p, t, this);
    return p;
  }
  get end() {
    let e = 0;
    for (const g in this.tracks) e = Math.max(e, this.tracks[g].end);
    return e;
  }
  smearAt(t) {
    for (const s of this.smears) if (t >= s.t0 && t < s.t1) return s;
    return null;
  }
}
