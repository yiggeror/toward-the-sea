// Core math helpers shared by every module.
// Conventions: 2D vectors are plain arrays [x, y]; world space is y-down
// (same as canvas), angles are radians measured with atan2(dy, dx).

export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
export const remap = (x, a, b, c, d) => c + (d - c) * invLerp(a, b, x);
export const remapC = (x, a, b, c, d) => c + (d - c) * clamp(invLerp(a, b, x));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const fract = (x) => x - Math.floor(x);
export const mod = (x, m) => ((x % m) + m) % m;
export const sq = (x) => x * x;
export const sign = (x) => (x < 0 ? -1 : 1);
export const wrapPi = (a) => mod(a + PI, TAU) - PI;
export const angLerp = (a, b, t) => a + wrapPi(b - a) * t;
// pulse that rises over [a,b] and falls over [c,d]
export const window4 = (x, a, b, c, d) => smoothstep(a, b, x) * (1 - smoothstep(c, d, x));
// triangle-ish bump centred at c with half width w (smooth)
export const bump = (x, c, w) => {
  const t = clamp(1 - Math.abs(x - c) / w);
  return t * t * (3 - 2 * t);
};

// ---------- vectors ----------
export const V = (x = 0, y = 0) => [x, y];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, s) => [a[0] * s, a[1] * s];
export const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const len = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const norm = (a) => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
export const rot = (a, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
};
export const perp = (a) => [-a[1], a[0]];
export const dir = (ang) => [Math.cos(ang), Math.sin(ang)];
export const angleOf = (a) => Math.atan2(a[1], a[0]);
export const lerpV = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const copy = (a) => [a[0], a[1]];

// point in local frame (origin o, x-axis ax, y-axis ay)
export const frame = (o, ax, ay, x, y) => [o[0] + ax[0] * x + ay[0] * y, o[1] + ax[1] * x + ay[1] * y];

// ---------- 3D (tiny) ----------
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
// rotate vector v around unit axis k by angle a (Rodrigues)
export const rotAxis3 = (v, k, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = cross3(k, v);
  const kd = dot3(k, v) * (1 - c);
  return [
    v[0] * c + kv[0] * s + k[0] * kd,
    v[1] * c + kv[1] * s + k[1] * kd,
    v[2] * c + kv[2] * s + k[2] * kd,
  ];
};

// ---------- easing ----------
// All easings map [0,1] -> [0,1] (overshooting ones may leave the range).
export const Ease = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inout: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  in3: (t) => t * t * t,
  out3: (t) => 1 - Math.pow(1 - t, 3),
  inout3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  in4: (t) => t * t * t * t,
  out4: (t) => 1 - Math.pow(1 - t, 4),
  sine: (t) => 0.5 - 0.5 * Math.cos(PI * t),
  outSine: (t) => Math.sin((PI * t) / 2),
  inSine: (t) => 1 - Math.cos((PI * t) / 2),
  outBack: (t) => {
    const c1 = 1.9, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outBackSoft: (t) => {
    const c1 = 1.1, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t) => {
    const c1 = 1.7, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  outElastic: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * PI) / 3.2)) + 1,
  // 'snap': holds, then moves quickly at the end (anticipation-like timing)
  snap: (t) => Math.pow(t, 5),
  // fast start, very long settle — the typical "zip then ease" of 2D animation
  zip: (t) => 1 - Math.pow(1 - t, 6),
  hold: () => 0,
  step: (t) => (t < 1 ? 0 : 1),
};
export function ease(name, t) {
  if (typeof name === 'function') return name(t);
  const f = Ease[name] || Ease.inout;
  return f(clamp(t));
}
// bias/gain style ease with adjustable slow-in / slow-out (a in (0,1))
export function biasEase(t, slowIn = 0.5, slowOut = 0.5) {
  // cubic hermite with tangents scaled by (1-slow)
  const m0 = 3 * (1 - slowIn) * 0.667, m1 = 3 * (1 - slowOut) * 0.667;
  const t2 = t * t, t3 = t2 * t;
  return (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) + (t3 - t2) * m1;
}

// ---------- deterministic random & noise ----------
export function hash32(n) {
  n = n | 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  n = n ^ (n >>> 16);
  return n >>> 0;
}
export const hash01 = (n) => hash32(n) / 4294967296;
export const hash2 = (x, y) => hash01(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ 0x5bd1e995);
export const hash3 = (x, y, z) =>
  hash01(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791));

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = f();
    while (v === 0) v = f();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  return f;
}

// 1D value noise, smooth, in [-1, 1]
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash01(i * 374761393 + seed * 668265263) * 2 - 1;
  const b = hash01((i + 1) * 374761393 + seed * 668265263) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
// 2D value noise in [-1, 1]
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const s = seed * 1013;
  const a = hash2(ix + s, iy) * 2 - 1;
  const b = hash2(ix + 1 + s, iy) * 2 - 1;
  const c = hash2(ix + s, iy + 1) * 2 - 1;
  const d = hash2(ix + 1 + s, iy + 1) * 2 - 1;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
export function fbm1(x, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise1(x * f, seed + i * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
export function fbm2(x, y, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f, seed + i * 31);
    n += a;
    a *= 0.5;
    f *= 2.01;
  }
  return s / n;
}

// ---------- curves ----------
export function bezier3(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}
export function bezier3d(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = 3 * u * u, b = 6 * u * t, c = 3 * t * t;
  return [
    a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]) + c * (p3[0] - p2[0]),
    a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]) + c * (p3[1] - p2[1]),
  ];
}
// Catmull-Rom (uniform) scalar/vec interpolation helper
export function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  if (typeof p1 === 'number') return f(p0, p1, p2, p3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

// Resample a polyline into n points evenly spaced by arc length.
export function resample(pts, n) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + dist(pts[i - 1], pts[i]));
  const total = L[L.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (total * k) / (n - 1);
    while (j < L.length - 2 && L[j + 1] < d) j++;
    const seg = L[j + 1] - L[j] || 1;
    out.push(lerpV(pts[j], pts[j + 1], (d - L[j]) / seg));
  }
  return out;
}
export function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

// Two-bone IK. Returns the middle joint. bendSign chooses the side (+1/-1).
export function ik2(root, target, l1, l2, bendSign) {
  let d = dist(root, target);
  const maxd = (l1 + l2) * 0.9995, mind = Math.abs(l1 - l2) * 1.0005 + 1e-6;
  const dd = clamp(d, mind, maxd);
  const toT = d > 1e-9 ? mul(sub(target, root), 1 / d) : [1, 0];
  const cosA = clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1);
  const a = Math.acos(cosA) * bendSign;
  const j = add(root, mul(rot(toT, a), l1));
  return { joint: j, end: add(root, mul(toT, dd)), reached: d <= maxd && d >= mind };
}

// signed area (for orientation)
export function polyArea(pts) {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}
export function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
