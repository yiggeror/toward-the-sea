// The v1 sequences, kept for reuse (retimed shots) and reference.
import * as city from './city.js';
import * as forest from './forest.js';
import * as storm from './storm.js';
import * as wild from './wild.js';
import * as sea from './sea.js';

export const V1 = [
  { id: 'city', shots: city.shots },
  { id: 'forest', shots: forest.shots },
  { id: 'storm', shots: storm.stormShots },
  { id: 'night', shots: storm.nightShots },
  { id: 'waste', shots: wild.wasteShots },
  { id: 'snow', shots: wild.snowShots },
  { id: 'cape', shots: sea.capeShots },
  { id: 'sea', shots: sea.seaShots },
  { id: 'beach', shots: sea.beachShots },
];
// one v1 shot by name (built fresh)
export function v1shot(name) {
  for (const sq of V1) for (const s of sq.shots()) if (s.name === name) return Object.assign(s, { seq: sq.id });
  throw new Error('no v1 shot ' + name);
}

/**
 * Reuse a v1 shot inside the new cut: rename it and show only frames
 * [from, from + dur·speed) (optionally faster/slower). Events are shifted and
 * trimmed with it.
 */
export function retime(name, o = {}) {
  const s = v1shot(name);
  const from = o.from ?? 0, speed = o.speed ?? 1;
  const build = s.build, draw = s.draw, events = s.events;
  s.name = o.name || name;
  if (o.xfade !== undefined) s.xfade = o.xfade;
  s.fadeIn = o.fadeIn ?? 0;
  s.fadeOut = o.fadeOut ?? 0;
  s.build = () => {
    build();
    s.dur = o.dur ?? Math.round((s.dur - from) / speed);
  };
  s.draw = (ctx, f, W, H) => draw(ctx, from + f * speed, W, H);
  s.events = () => events().map((e) => Object.assign({}, e, { t: (e.t - from) / speed })).filter((e) => (e.type === 'amb' ? true : e.t >= 0)).map((e) => (e.type === 'amb' && e.t < 0 ? Object.assign(e, { t: 0 }) : e));
  if (o.setup) o.setup(s);
  return s;
}
