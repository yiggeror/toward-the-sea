// Draws Xiaohui from a pose. Handles scale, facing, draw order and styling.
import { computeSkeleton, tailPoints } from './rig.js';
import { buildHead, drawHead } from './head.js';
import { drawTorso, drawLeg, drawTail } from './body.js';
import { PAL, M } from './model.js';
import { css, mix, rgb } from '../core/draw.js';
import { angLerp, clamp, smoothstep, PI, lerp } from '../core/math.js';

export function makeStyle(scale, opts = {}) {
  const lwPx = opts.lwPx ?? clamp(scale * 0.0145, 1.05, 3.2);
  const tint = opts.tint; // optional multiply tint for far parts
  const c = (hexc) => (tint ? css(mix(hexc, mix(hexc, tint, 1), opts.tintAmt ?? 0.18)) : css(hexc));
  return {
    lw: lwPx / scale,
    line: css(opts.lineColor || PAL.line),
    lineRGB: rgb(opts.lineColor || PAL.line),
    lineSoftC: css(PAL.lineSoft, 0.8),
    white: c(PAL.white),
    grey: c(PAL.grey),
    stripe: c(PAL.stripe),
    stripeDark: c(PAL.stripeDark),
    pink: c(PAL.pink),
    pinkPad: c(PAL.pinkPad),
    whisker: css(opts.whiskerColor || PAL.whisker, 0.9),
    shade: opts.shade === false ? null : css('#6f6a7a', 0.13),
    boil: opts.boil ?? 0,
    boilSeed: opts.boilSeed ?? 1,
    whiskerWind: opts.whiskerWind,
    whiskerWob: opts.whiskerWob,
    highlight: opts.highlight,
  };
}

// Static tail shape from the pose's intention parameters (no dynamics).
export function tailTargetAngles(sk, pose) {
  const N = M.tailSegs;
  const base = angLerp(sk.tailBaseAng, PI, clamp(pose.tailWorld || 0, 0, 1)) + pose.tailA;
  const out = new Array(N);
  const tone = clamp(pose.tailTone ?? 1, 0, 1);
  for (let i = 0; i < N; i++) {
    const s = (i + 0.5) / N;
    let a = base + pose.tailC * s + pose.tailK * s * s * s;
    if (pose.tailWave) a += pose.tailWave * Math.sin(pose.tailWaveP - s * 4.2) * s;
    // gravity for low tone: pull toward straight down (PI/2 in y-down)
    if (tone < 1) a = angLerp(a, PI / 2, (1 - tone) * s * 0.85);
    out[i] = a;
  }
  return out;
}
export function tailSegLens() {
  const N = M.tailSegs;
  return new Array(N).fill(M.tailLen / N);
}

// Keep the tail above the ground: segments that would dip under it are laid
// along the ground surface instead (tail radius clearance).
export function tailOnGround(pts, ground, seg) {
  const out = [pts[0].slice()];
  const r = 0.1;
  for (let i = 1; i < pts.length; i++) {
    const prev = out[i - 1];
    let dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
    let p = [prev[0] + dx, prev[1] + dy];
    const gy = ground(p[0]) - r;
    if (p[1] > gy) {
      // slide along the ground keeping the segment length
      const L = seg[i - 1];
      const hx = Math.sign(dx || 1) * Math.sqrt(Math.max(1e-6, L * L - Math.min(L * L, (gy - prev[1]) ** 2)));
      p = [prev[0] + hx, Math.min(gy, prev[1] + Math.abs(dy))];
      if (p[1] > gy) p[1] = gy;
    }
    out.push(p);
  }
  return out;
}

// opts: { x, y, scale, tailAngles?, ground?, style overrides }
export function drawCat(ctx, pose, opts = {}) {
  const sk = computeSkeleton(pose);
  const scale = opts.scale || 60;
  const st = makeStyle(scale, opts);
  const stFar = makeStyle(scale, Object.assign({}, opts, { tint: '#5d5a68', tintAmt: 0.28 }));
  const angles = opts.tailAngles || tailTargetAngles(sk, sk.pose);
  let tpts = tailPoints(sk.tailRoot, angles, tailSegLens());
  if (opts.ground) tpts = tailOnGround(tpts, (xl) => opts.ground(xl * sk.facing), tailSegLens());
  ctx.save();
  ctx.translate(opts.x || 0, opts.y || 0);
  ctx.scale(scale * sk.facing, scale);
  const tailFront = opts.tailFront ?? (sk.pose.tailFront > 0.5);
  const fnTop = sk.pose.fnTop > 0.5;
  drawLeg(ctx, sk.legs.hf, stFar);
  drawLeg(ctx, sk.legs.ff, stFar);
  if (!tailFront) drawTail(ctx, tpts, st, sk.pose.fluff);
  const torsoPath = drawTorso(ctx, sk, st);
  drawLeg(ctx, sk.legs.hn, st, { bodyPath: torsoPath, saddle: torsoPath.saddle });
  if (!fnTop) drawLeg(ctx, sk.legs.fn, st, { bodyPath: torsoPath, saddle: torsoPath.saddle });
  const hg = buildHead(sk);
  drawHead(ctx, hg, st);
  if (fnTop) drawLeg(ctx, sk.legs.fn, st, { bodyPath: torsoPath, saddle: torsoPath.saddle });
  if (tailFront) drawTail(ctx, tpts, st, sk.pose.fluff);
  ctx.restore();
  return sk;
}
