// Xiaohui's head: a tiny 3D model (ellipsoids + features on a sphere) projected
// orthographically, drawn with flat colours and clean lines. Works from profile
// to front to back views so head turns/tilts are continuous.
import { HEAD, PAL } from './model.js';
import {
  add3, mul3, norm3, cross3, dot3, sub3, rotAxis3, clamp, lerp, DEG, TAU, smoothstep, add, sub, mul, norm, dist,
} from '../core/math.js';
import { smoothTo, brushLine, fillStroke, clipOutside, css, mix } from '../core/draw.js';
import { polyArea } from '../core/math.js';

// ---------- projection helpers ----------
function ellipse2D(head, c, r) {
  const b = head.basis;
  const k = head.s || 1;
  const cols = [mul3(b.f, r[0] * k), mul3(b.u, r[1] * k), mul3(b.l, r[2] * k)];
  // 2x3 matrix rows: x = col.x, y = -col.y
  let a = 0, bb = 0, cc = 0;
  for (const k of cols) {
    const x = k[0], y = -k[1];
    a += x * x; bb += x * y; cc += y * y;
  }
  const tr = (a + cc) / 2, df = Math.sqrt(((a - cc) / 2) ** 2 + bb * bb);
  const l1 = tr + df, l2 = Math.max(1e-8, tr - df);
  const ang = 0.5 * Math.atan2(2 * bb, a - cc);
  const p = head.proj(c);
  return { cx: p[0], cy: p[1], z: p[2], rx: Math.sqrt(l1), ry: Math.sqrt(l2), rot: ang, Q: [a, bb, cc] };
}
// inside test for projected ellipse (with margin factor)
function inEll(e, x, y, k = 1) {
  const dx = x - e.cx, dy = y - e.cy;
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const u = (dx * c + dy * s) / (e.rx * k), v = (-dx * s + dy * c) / (e.ry * k);
  return u * u + v * v < 1;
}
function ellPoint(e, t) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const x = Math.cos(t) * e.rx, y = Math.sin(t) * e.ry;
  return [e.cx + x * c - y * s, e.cy + x * s + y * c];
}
function ellNormal(e, t) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const x = Math.cos(t) / e.rx, y = Math.sin(t) / e.ry;
  return norm([x * c - y * s, x * s + y * c]);
}
// radial distance of ellipse boundary along 2D unit direction d
function ellRadius(e, d) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const u = (d[0] * c + d[1] * s) / e.rx, v = (-d[0] * s + d[1] * c) / e.ry;
  return 1 / Math.sqrt(u * u + v * v);
}

// point on the marking shell by azimuth lam (0 fwd, + toward left/z+) and elevation phi
const MK = HEAD.mark;
function sph(lam, phi) {
  const cp = Math.cos(phi);
  return [MK.c[0] + MK.r[0] * cp * Math.cos(lam), MK.c[1] + MK.r[1] * Math.sin(phi), MK.c[2] + MK.r[2] * cp * Math.sin(lam)];
}
function sphN(p) {
  const q = sub3(p, MK.c), r = MK.r;
  return norm3([q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2])]);
}

// Project a marking region given in (lam, phi) degrees, clipped to the visible
// hemisphere: hidden runs are replaced by the short arc along the (pushed)
// projected cranium limb between the exit and re-entry crossings.
function projMark(head, cran, pts, push = 1.4) {
  const n = pts.length;
  const P3 = pts.map(([lamD, phiD]) => sph(lamD * DEG, phiD * DEG));
  const vis = P3.map((p) => head.vec(sphN(p))[2]);
  if (vis.every((z) => z <= 0)) return null;
  const limbPt = (w) => {
    // w: world direction (screen coords from head.vec) of a limb crossing
    const d = norm([w[0], w[1]]);
    const r = ellRadius(cran, d) * push;
    return [cran.cx + d[0] * r, cran.cy + d[1] * r];
  };
  const out = [];
  let start = vis.findIndex((z) => z > 0);
  let exitW = null;
  for (let k = 0; k <= n; k++) {
    const i = (start + k) % n, j = (start + k + 1) % n;
    const a = P3[i], b = P3[j];
    const za = vis[i], zb = vis[j];
    if (za > 0 && k < n) {
      const q = head.proj(a);
      if (pts[i][1] <= -84) {
        // bottom cap: extend past the cranium so chin/cheeks are covered
        const d = norm([q[0] - cran.cx, q[1] - cran.cy]);
        const r = ellRadius(cran, d) * push;
        out.push([cran.cx + d[0] * r, cran.cy + d[1] * r]);
      } else out.push([q[0], q[1]]);
    }
    if (k === n) break;
    if ((za > 0) !== (zb > 0)) {
      const t = za / (za - zb);
      const c3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const w = head.vec(sphN(c3));
      if (za > 0) exitW = w;
      else if (exitW) {
        // arc along the limb from exit to entry (short way)
        const a0 = Math.atan2(exitW[1], exitW[0]), a1 = Math.atan2(w[1], w[0]);
        let da = a1 - a0;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const steps = Math.max(2, Math.ceil(Math.abs(da) / 0.2));
        for (let s2 = 0; s2 <= steps; s2++) {
          const ang = a0 + (da * s2) / steps;
          out.push(limbPt([Math.cos(ang), Math.sin(ang)]));
        }
        exitW = null;
      }
    }
  }
  return out.length >= 3 ? out : null;
}

// white face region boundary elevation (deg) as function of |azimuth| (deg):
// grey mask over the eyes and upper cheeks, white below (simplified sheet)
const FACE_B = [
  [0, 4], [10, -3], [20, -10], [33, -14], [50, -18], [70, -22], [90, -27], [115, -37], [145, -52], [180, -64],
];
function faceB(lamAbs) {
  for (let i = 1; i < FACE_B.length; i++) {
    if (lamAbs <= FACE_B[i][0]) {
      const [a0, b0] = FACE_B[i - 1], [a1, b1] = FACE_B[i];
      return lerp(b0, b1, (lamAbs - a0) / (a1 - a0));
    }
  }
  return -80;
}
// blaze half-width (deg azimuth) as function of elevation (deg)
const BLAZE_W = [[-40, 32], [-10, 24], [0, 20], [12, 13.5], [24, 7.5], [36, 3.4], [46, 0.9]];
function blazeW(phi) {
  for (let i = 1; i < BLAZE_W.length; i++) {
    if (phi <= BLAZE_W[i][0]) {
      const [a0, b0] = BLAZE_W[i - 1], [a1, b1] = BLAZE_W[i];
      return lerp(b0, b1, (phi - a0) / (a1 - a0));
    }
  }
  return 0.5;
}

// ---------- ears ----------
function earGeom(head, side, pose) {
  // side: +1 left (z+), -1 right (z-)
  const eb = HEAD.earBase;
  const S = (p) => [p[0], p[1], p[2] * side];
  let bf = S(eb.f), bb = S(eb.b), tip = S(eb.tip);
  const base = mul3(add3(bf, bb), 0.5);
  const rotAmt = clamp(pose.earRot + (side > 0 ? pose.earLR : pose.earRR), -0.4, 1.3);
  const flat = clamp(pose.earFlat, 0, 1.2);
  // swivel about head up axis through base (opening turns outward/back)
  const up = [0, 1, 0];
  const swivel = rotAmt * 95 * DEG * side * -1; // rotate so opening goes toward side/back
  const R1 = (p) => add3(base, rotAxis3(sub3(p, base), up, swivel));
  bf = R1(bf); bb = R1(bb); tip = R1(tip);
  // flatten: rotate about the base line axis so the tip goes outward & down
  const axis = norm3(sub3(bf, bb));
  const flatA = flat * 70 * DEG * side;
  const R2 = (p) => add3(base, rotAxis3(sub3(p, base), axis, flatA));
  bf = R2(bf); bb = R2(bb); tip = R2(tip);
  // also tilt backward when flattening (pinned back)
  const side3 = [0, 0, 1];
  const back = flat * 25 * DEG * (rotAmt > 0.5 ? 1 : 0.4);
  const R3 = (p) => add3(base, rotAxis3(sub3(p, base), side3, back));
  bf = R3(bf); bb = R3(bb); tip = R3(tip);
  // opening normal (points toward the front face of the ear)
  let nrm = norm3(cross3(sub3(tip, bb), sub3(bf, bb)));
  if (side > 0) nrm = mul3(nrm, -1);
  // cone body: base ellipse (along base line x depth behind the opening)
  const a1 = mul3(sub3(bf, bb), 0.5), a2 = mul3(nrm, -eb.depth);
  const P = (p) => head.proj(p);
  const hull = [P(tip)];
  for (let i = 0; i < 14; i++) {
    const t = (i / 14) * TAU;
    // only the back half of the base bulges (front edge is the opening rim)
    const k = Math.max(0, Math.sin(t));
    hull.push(P(add3(add3(base, mul3(a1, Math.cos(t))), mul3(a2, k))));
  }
  // mid-height bulge of the back of the cone
  hull.push(P(add3(add3(base, mul3(sub3(tip, base), 0.45)), mul3(a2, 0.7))));
  const cup = add3(add3(base, mul3(sub3(tip, base), 0.3)), mul3(a2, 0.9));
  const nW = head.vec(nrm);
  return {
    hull: convexHull(hull.map((q) => [q[0], q[1]])),
    side, bf: P(bf), bb: P(bb), tip: P(tip), cup: P(cup), base: P(base),
    facing: nW[2], depth: P(base)[2],
    // points slightly inside for the pink inner ear
    in1: P(add3(mul3(bf, 0.9), mul3(tip, 0.1))),
    in2: P(add3(add3(mul3(bb, 0.7), mul3(tip, 0.18)), mul3(bf, 0.12))),
    inTip: P(add3(mul3(tip, 0.9), mul3(base, 0.1))),
    inBase: P(add3(mul3(base, 0.96), mul3(tip, 0.04))),
  };
}
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}
function earPath(e) {
  // convex cone silhouette; sharpen the tip by keeping it as a corner
  const p = new Path2D();
  const h = e.hull;
  const ti = h.findIndex((q) => Math.abs(q[0] - e.tip[0]) < 1e-9 && Math.abs(q[1] - e.tip[1]) < 1e-9);
  if (ti < 0) { smoothTo(p, h, true); return p; }
  // walk from tip around, smooth everything except the tip corner
  const ring = [];
  for (let i = 0; i < h.length; i++) ring.push(h[(ti + i) % h.length]);
  // add points near tip on both edges so the tip stays pointed but rounded slightly
  const t = ring[0], a = ring[1], b = ring[ring.length - 1];
  const near = (q, k) => [t[0] + (q[0] - t[0]) * k, t[1] + (q[1] - t[1]) * k];
  const tipC = [(near(a, 0.1)[0] + near(b, 0.1)[0]) / 2 * 0.35 + t[0] * 0.65, (near(a, 0.1)[1] + near(b, 0.1)[1]) / 2 * 0.35 + t[1] * 0.65];
  const pts = [near(b, 0.14), tipC, near(a, 0.14), ...ring.slice(1)];
  smoothTo(p, pts, true);
  return p;
}

// ---------- eyes ----------
function eyeFrame(head, side, pose) {
  const E = HEAD.eye;
  const c3 = [E.c[0], E.c[1], E.c[2] * side];
  const n3 = norm3([E.n[0], E.n[1], E.n[2] * side]);
  const out3 = norm3(sub3([0, 0, side], mul3(n3, n3[2] * side)));
  let up3 = norm3(sub3([0, 1, 0], mul3(n3, n3[1])));
  up3 = norm3(sub3(up3, mul3(out3, dot3(up3, out3))));
  const c = head.proj(c3);
  const ah = head.vec(out3), av = head.vec(up3), nW = head.vec(n3);
  const r = E.r * (head.s || 1) * (1 + 0.12 * (pose.eyeWide || 0));
  return {
    side, c: [c[0], c[1]], z: c[2], r,
    ax: [ah[0] * r, ah[1] * r], ay: [-av[0] * r, -av[1] * r], // ay points "up" on screen for v+
    facing: nW[2],
  };
}
// eye outline in eye space (u: inner(-1) -> outer(+1), v up)
function eyeShape(k = 1) {
  const pts = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    let x = Math.cos(a), y = Math.sin(a);
    // flatter top, slight lift at outer corner
    if (y > 0) y *= 0.9 - 0.06 * x;
    else y *= 0.98;
    y += 0.05 * x;
    pts.push([x, y * k]);
  }
  return pts;
}
function upperLid(u, open, lid, side) {
  // v of the upper lid edge at u (eye space) — closes toward lower curve
  const top = 0.86 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.05 * u;
  const closedV = -0.1 - 0.12 * (1 - u * u);
  let v = lerp(closedV, top, open);
  // angry slant: inner corner (u=-1) lowered
  v -= lid * 0.55 * (1 - u) * 0.5 * open;
  return v;
}

// screen-space offset -> eye-space (u, v) using the eye's affine frame
function toEye(ef, dx, dy) {
  const ax = ef.ax, av = [-ef.ay[0], -ef.ay[1]];
  let det = ax[0] * av[1] - av[0] * ax[1];
  if (Math.abs(det) < 1e-6) det = det < 0 ? -1e-6 : 1e-6;
  return [(av[1] * dx - av[0] * dy) / det, (-ax[1] * dx + ax[0] * dy) / det];
}
// 4-point star glint (eye space)
function glint(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.fill();
}
// Eyes are glossy black dots (simplified sheet). Everything else is a shape
// change of the dot: blink squash, upper-lid cut (lid / lidTilt / sad), > <
// squeeze, ^ ^ happy arcs, relaxed closed arcs, a watery tear line, and extra
// highlights for "sparkle". Eye space: x outward (+) / inward (-), y up.
function drawEye(ctx, ef, pose, st) {
  if (ef.facing < -0.12) return;
  const vis = smoothstep(-0.12, 0.18, ef.facing);
  const wink = pose.wink || 0;
  const wk = ef.side > 0 ? clamp(wink, 0, 1) : clamp(-wink, 0, 1);
  const happy = clamp(pose.happy || 0, 0, 1);
  const squeeze = clamp(pose.squeeze || 0, 0, 1);
  const sad = clamp(pose.sad || 0, 0, 1);
  const sparkle = clamp(pose.sparkle || 0, 0, 1);
  const tear = clamp(pose.tear || 0, 0, 1);
  const open = clamp(pose.eye, 0, 1) * (1 - happy) * (1 - wk) * (1 - squeeze);
  const lid = clamp((pose.lid || 0) + sad * 0.2, 0, 1);
  const ink = st.eyeColor || '#2b2727';
  ctx.save();
  ctx.transform(ef.ax[0], ef.ax[1], -ef.ay[0], -ef.ay[1], ef.c[0], ef.c[1]);
  const lw = st.lw / ef.r;
  ctx.globalAlpha *= vis;
  const gz = toEye(ef, (pose.lookX || 0) * ef.r, -(pose.lookY || 0) * ef.r);
  // cross-eyed: each pupil slides toward the nose
  const cross = clamp(pose.cross || 0, 0, 1);
  const gx = clamp(gz[0] * 0.18 - cross * 0.85, -1, 0.5), gy = clamp(gz[1] * 0.16 - cross * 0.22, -0.4, 0.2);
  const size = (1 + 0.28 * (pose.eyeWide || 0) + 0.14 * sparkle + 0.06 * tear) * (0.92 + 0.2 * clamp(pose.pupil ?? 0.45, 0, 1));
  const rx = 0.62 * size, ry = 0.8 * size;
  const arc = (pts, w) => fillStroke(ctx, pts, (i, t) => w * Math.sin(0.2 + t * (Math.PI - 0.4)), ink);
  if (squeeze > 0.45) {
    // > < : a chevron pointing at the nose
    const k = smoothstep(0.45, 0.8, squeeze);
    const a = 0.5 + 0.12 * k;
    arc([[0.62, a], [-0.48, 0.02], [0.62, -a]], Math.max(lw * 2.6, 0.36));
  } else if (open > 0.12) {
    // upper-lid cut: y = top + slope * x  (angry: inner low; sad: outer low)
    const tilt = (pose.lidTilt || 0) * Math.min(1, lid * 2.5) - sad * 1.5;
    const top = ry * (1.05 - 2.0 * lid * (lid > 0.02 ? 1 : 0));
    const slope = tilt * 0.42 * ry;
    const k = Math.min(1, open * 1.15);
    const cy = gy - (1 - k) * 0.25, ey = Math.max(0.12, ry * k);
    const thin = top + Math.abs(slope) * 0.3 - (cy - ey);
    if (lid > 0.02 && thin < 0.34) {
      // nearly shut: a flat, slightly tilted dash
      const tl = (pose.lidTilt || 0) * 0.25 - sad * 0.2;
      arc([[-0.75, cy - ey + 0.18 - tl], [0, cy - ey + 0.12], [0.75, cy - ey + 0.18 + tl]], 0.4);
    } else {
      if (lid > 0.02 || sad > 0.02) {
        ctx.beginPath();
        ctx.moveTo(-3, -3);
        ctx.lineTo(3, -3);
        ctx.lineTo(3, top + slope * 3);
        ctx.lineTo(-3, top - slope * 3);
        ctx.closePath();
        ctx.clip();
      }
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.ellipse(gx, cy, rx, ey, 0, 0, TAU);
      ctx.fill();
      // watery lower rim
      if (tear > 0.02) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(gx, cy, rx, ey, 0, 0, TAU);
        ctx.clip();
        ctx.fillStyle = css('#a8c8e8', 0.55 * tear);
        ctx.beginPath();
        ctx.ellipse(gx, cy - ey * 0.95, rx * 1.1, ey * (0.25 + 0.3 * tear), 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      // a reflection in the eye (the sea on the card): sky above a horizon, sea
      // below, a bright sun and the white fleck of a lighthouse
      const refl = clamp(pose.reflect || 0, 0, 1);
      if (refl > 0.02) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(gx, cy, rx, ey, 0, 0, TAU);
        ctx.clip();
        const hz = cy + ey * 0.05;
        const sg = ctx.createLinearGradient(0, cy + ey, 0, hz);
        sg.addColorStop(0, css('#5f86b8', 0.5 * refl));
        sg.addColorStop(1, css('#b9dcf0', 0.75 * refl));
        ctx.fillStyle = sg;
        ctx.fillRect(gx - rx, hz, rx * 2, ey * 1.2);
        const wg = ctx.createLinearGradient(0, hz, 0, cy - ey);
        wg.addColorStop(0, css('#7fb8dc', 0.8 * refl));
        wg.addColorStop(1, css('#1d3f6a', 0.5 * refl));
        ctx.fillStyle = wg;
        ctx.fillRect(gx - rx, cy - ey, rx * 2, hz - (cy - ey));
        ctx.fillStyle = css('#ffffff', 0.85 * refl);
        ctx.fillRect(gx + rx * 0.3, hz, rx * 0.07, ey * 0.22);
        ctx.fillStyle = css('#e8f6ff', 0.6 * refl);
        ctx.fillRect(gx - rx, hz - ey * 0.02, rx * 2, ey * 0.04);
        ctx.restore();
      }
      // highlights: key light upper-left (screen), a small bounce lower-right
      const hl = (st.highlight ?? 1) * k;
      if (hl > 0.02) {
        const h1 = toEye(ef, -0.22 * ef.r, -0.3 * ef.r), h2 = toEye(ef, 0.2 * ef.r, 0.26 * ef.r);
        const big = 0.22 + 0.1 * sparkle + 0.05 * tear;
        ctx.fillStyle = css('#ffffff', 0.95 * hl);
        ctx.beginPath();
        ctx.ellipse(gx + clamp(h1[0], -0.34, 0.34) * size, cy + clamp(h1[1], -0.34, 0.34) * size, big * size, (big + 0.03) * size, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = css('#ffffff', (0.55 + 0.4 * sparkle) * hl);
        ctx.beginPath();
        ctx.ellipse(gx + clamp(h2[0], -0.4, 0.4) * size, cy + clamp(h2[1], -0.45, 0.45) * size, (0.09 + 0.05 * sparkle) * size, (0.09 + 0.05 * sparkle) * size, 0, 0, TAU);
        ctx.fill();
        if (sparkle > 0.05) {
          ctx.fillStyle = css('#ffffff', sparkle * hl);
          const h3 = toEye(ef, 0.18 * ef.r, -0.22 * ef.r);
          glint(ctx, gx + clamp(h3[0], -0.4, 0.4) * size, cy + clamp(h3[1], -0.4, 0.4) * size, 0.2 * size * sparkle);
        }
      }
    }
  } else {
    // closed: happy arch (^ ^) or relaxed/sleepy arc; a wink is a happy arch
    const hap = Math.max(happy, wk > 0.5 ? 1 : 0, squeeze * 0.6);
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = -0.95 + (1.9 * i) / 12;
      const sleepy = -0.05 - 0.32 * (1 - u * u);
      const hp = -0.35 + 0.55 * (1 - u * u);
      pts.push([u, lerp(sleepy, hp, clamp(hap, 0, 1))]);
    }
    arc(pts, Math.max(lw * 2.4, 0.34));
  }
  // tear line under a watery eye, and a drop at the outer corner
  if (tear > 0.3 && squeeze < 0.45) {
    const a = smoothstep(0.3, 0.7, tear);
    ctx.globalAlpha *= a;
    brushLine(ctx, [[-0.55, -ry - 0.08], [0, -ry - 0.16], [0.6, -ry - 0.06]], lw * 1.3, css('#cfe3f5', 0.9), { taperIn: 0.4, taperOut: 0.4 });
  }
  ctx.restore();
}

// Pink cheeks with three little hatch strokes (anime blush).
function drawBlush(ctx, g, st) {
  const b = clamp(g.pose.blush || 0, 0, 1);
  if (b < 0.02) return;
  const head = g.head;
  for (const side of [1, -1]) {
    const lam = 47 * DEG * side, phi = -17 * DEG;
    const c3 = sph(lam, phi);
    const n3 = sphN(c3);
    const f = head.vec(n3)[2];
    if (f < 0.05) continue;
    const t1 = norm3(cross3([0, 1, 0], n3)), t2 = norm3(cross3(n3, t1));
    const c = head.proj(c3), a = head.proj(add3(c3, mul3(t1, 0.12))), v = head.proj(add3(c3, mul3(t2, 0.068)));
    ctx.save();
    ctx.globalAlpha *= b * smoothstep(0.05, 0.35, f);
    ctx.transform(a[0] - c[0], a[1] - c[1], v[0] - c[0], v[1] - c[1], c[0], c[1]);
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, css(st.blush || '#f4979d', 0.95));
    gr.addColorStop(0.55, css(st.blush || '#f4979d', 0.7));
    gr.addColorStop(1, css(st.blush || '#f4979d', 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    if (b > 0.4) {
      ctx.globalAlpha *= smoothstep(0.4, 0.8, b);
      for (let i = -1; i <= 1; i++) {
        ctx.strokeStyle = css('#e9787c', 0.8);
        ctx.lineWidth = 0.14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(i * 0.35 - 0.12 * side, 0.35);
        ctx.lineTo(i * 0.35 + 0.12 * side, -0.35);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ---------- main ----------
export function buildHead(sk) {
  const head = sk.head, pose = sk.pose;
  const cran = ellipse2D(head, HEAD.cranium.c, HEAD.cranium.r);
  const cc = HEAD.cheeks.c;
  const puff = 1 + 0.08 * clamp(pose.puff || 0, -1, 1); // cheek puff (smile / pout)
  const cr = [HEAD.cheeks.r[0], HEAD.cheeks.r[1], HEAD.cheeks.r[2] * puff];
  const cheekL = ellipse2D(head, [cc[0], cc[1], cc[2]], cr);
  const cheekR = ellipse2D(head, [cc[0], cc[1], -cc[2]], cr);
  const muz = ellipse2D(head, HEAD.muzzle.c, HEAD.muzzle.r);
  // the jaw drops a little when the mouth opens wide
  const jo = clamp(pose.mouth || 0, 0, 1) * 0.035;
  const jaw = ellipse2D(head, [HEAD.jaw.c[0], HEAD.jaw.c[1] - jo, 0], HEAD.jaw.r);
  const mark = ellipse2D(head, HEAD.mark.c, HEAD.mark.r);
  const ells = [cran, cheekL, cheekR, muz, jaw];
  const earL = earGeom(head, 1, pose), earR = earGeom(head, -1, pose);
  const eyeL = eyeFrame(head, 1, pose), eyeR = eyeFrame(head, -1, pose);
  return { head, pose, cran, cheekL, cheekR, muz, jaw, mark, ells, earL, earR, eyeL, eyeR };
}

function resampleClosed(pts, n) {
  const L = [0];
  for (let i = 1; i <= pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i % pts.length][0] - pts[i - 1][0], pts[i % pts.length][1] - pts[i - 1][1]));
  const total = L[L.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (total * k) / n;
    while (j < pts.length - 1 && L[j + 1] < d) j++;
    const a = pts[j], b = pts[(j + 1) % pts.length];
    const u = (d - L[j]) / ((L[j + 1] - L[j]) || 1);
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}
export function headOutline(g) {
  const pts = [];
  for (const e of g.ells) for (let i = 0; i < 40; i++) pts.push(ellPoint(e, (i / 40) * TAU));
  const hull = convexHull(pts);
  return resampleClosed(hull, 30);
}
function headUnionPath(g, fluff, tufts = true) {
  const p = new Path2D();
  const out = headOutline(g);
  smoothTo(p, out, true);
  if (!tufts) return p;
  // cheek fur: two small tufts where the lower cheek turns into the silhouette
  // (placed from the 3D cheek direction, so they never land under the chin)
  const k = (1 + 0.7 * clamp(fluff || 0, 0, 1.5)) * (g.head.s || 1);
  const cx = g.cran.cx, cy = g.cran.cy;
  const n = out.length;
  const area = polyArea(out);
  for (const side of [1, -1]) {
    const w = g.head.vec(norm3([0.1, -0.34, side]));
    const sil = 1 - smoothstep(0.3, 0.72, Math.abs(w[2]));
    if (sil <= 0.02) continue;
    const d = norm([w[0], w[1]]);
    let best = -1e9, bi = 0;
    for (let i = 0; i < n; i++) {
      const v = (out[i][0] - cx) * d[0] + (out[i][1] - cy) * d[1];
      if (v > best) { best = v; bi = i; }
    }
    // walk a little along the outline in the downward direction for the 2nd tuft
    const down = out[(bi + 1) % n][1] > out[(bi - 1 + n) % n][1] ? 1 : -1;
    for (const [off, L] of [[-1, 0.05], [1, 0.042]]) {
      const i = (bi + off * down + n) % n;
      const pt = out[i];
      const a = out[(i - 1 + n) % n], b = out[(i + 1) % n];
      let tan = norm([b[0] - a[0], b[1] - a[1]]);
      let nrm = [tan[1], -tan[0]];
      if ((pt[0] - cx) * nrm[0] + (pt[1] - cy) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
      if (tan[1] < 0) tan = [-tan[0], -tan[1]]; // sweep downward
      const len = L * k * sil, bw = 0.03 * (g.head.s || 1);
      const q = (u, v) => [pt[0] + tan[0] * u + nrm[0] * v, pt[1] + tan[1] * u + nrm[1] * v];
      // small pointed flick: base on the outline, tip out and a little down
      const quad = (a, c, b, m) => {
        const r = [];
        for (let j = 1; j <= m; j++) {
          const t = j / m, u = 1 - t;
          r.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
        }
        return r;
      };
      const b0 = q(-bw, 0), tip = q(len * 0.45, len), b1 = q(bw, 0);
      const poly = [q(0, -0.05), b0, ...quad(b0, q(-bw * 0.1, len * 0.7), tip, 5), ...quad(tip, q(bw * 0.45, len * 0.35), b1, 5)];
      if (Math.sign(polyArea(poly)) !== Math.sign(area)) poly.reverse();
      p.moveTo(poly[0][0], poly[0][1]);
      for (let j = 1; j < poly.length; j++) p.lineTo(poly[j][0], poly[j][1]);
      p.closePath();
    }
  }
  return p;
}

function drawEar(ctx, e, st, headPath) {
  const path = earPath(e);
  ctx.save();
  if (headPath) clipOutside(ctx, headPath);
  ctx.lineJoin = 'round';
  ctx.lineWidth = st.lw * 2;
  ctx.strokeStyle = st.line;
  ctx.stroke(path);
  ctx.restore();
  ctx.fillStyle = st.grey;
  ctx.fill(path);
  // inner pink when opening faces viewer
  const f = e.facing;
  if (f > -0.05) {
    const a = smoothstep(-0.05, 0.35, f);
    ctx.save();
    ctx.clip(path);
    const ip = new Path2D();
    const mid = [(e.in1[0] + e.in2[0]) / 2, (e.in1[1] + e.in2[1]) / 2];
    const low = [e.inBase[0], e.inBase[1]];
    smoothTo(ip, [e.in1, e.inTip, e.in2, [lerp(mid[0], low[0], 0.6), lerp(mid[1], low[1], 0.6)]], true);
    ctx.globalAlpha = a;
    ctx.fillStyle = st.pink;
    ctx.fill(ip);
    // ear fur (white wisps from base)
    ctx.globalAlpha = a * 0.85;
    for (let i = 0; i < 3; i++) {
      const s0 = lerp(0.25, 0.75, i / 2);
      const root = [lerp(e.in1[0], e.in2[0], s0), lerp(e.in1[1], e.in2[1], s0)];
      const to = [lerp(root[0], e.inTip[0], 0.55 - i * 0.08), lerp(root[1], e.inTip[1], 0.55 - i * 0.08)];
      brushLine(ctx, [root, [lerp(root[0], to[0], 0.5) + (i - 1) * 0.01, lerp(root[1], to[1], 0.5)], to], st.lw * 1.4, st.white, { taperIn: 0.1, taperOut: 0.6, seed: i + 3 });
    }
    ctx.restore();
    // inner edge line (a thin line inside the front edge)
    ctx.globalAlpha = 1;
  }
}

function drawWhiskers(ctx, g, side, st) {
  const head = g.head, pose = g.pose;
  // whiskers of the far cheek only show while the face is roughly frontal;
  // otherwise they would poke out under the chin like a goatee
  const vz = head.vec([0, 0, side])[2];
  const vis = smoothstep(-0.5, -0.12, vz) * smoothstep(-0.85, -0.35, head.vec([1, 0, 0])[2]);
  if (vis <= 0.01) return;
  const wk = clamp(pose.whisk || 0, -1, 1);
  const specs = [
    [[0.425, -0.135, 0.12], [0.24, 0.13, 1], 0.9],
    [[0.418, -0.165, 0.13], [0.2, 0.0, 1], 0.98],
    [[0.405, -0.195, 0.12], [0.16, -0.14, 1], 0.86],
  ];
  const wind = st.whiskerWind || [0, 0];
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * vis;
  specs.forEach(([r, d, L], i) => {
    const root = [r[0], r[1], r[2] * side];
    const dd = norm3([d[0] + wk * 0.45, d[1] + wk * 0.08 - (pose.whiskDroop || 0) * 0.3, d[2] * side]);
    const droop = [0, -0.04 - 0.025 * i, 0];
    const m3 = add3(add3(root, mul3(dd, L * 0.5)), mul3(droop, 0.35));
    const t3 = add3(add3(root, mul3(dd, L)), droop);
    const a = head.proj(root), b = head.proj(m3), c = head.proj(t3);
    const wob = st.whiskerWob ? st.whiskerWob(i + side * 3) : 0;
    const bb = [b[0] + wind[0] * 0.3 + wob * 0.01, b[1] + wind[1] * 0.3];
    const cb = [c[0] + wind[0] + wob * 0.03, c[1] + wind[1] + wob * 0.02];
    brushLine(ctx, [[a[0], a[1]], bb, cb], st.lw * 0.7, st.whisker, { taperIn: 0.05, taperOut: 0.9, minW: 0.08, seed: 11 + i + side });
  });
  ctx.globalAlpha = a0;
}

function drawMouth(ctx, g, st) {
  const head = g.head, pose = g.pose;
  const P = (p) => { const q = head.proj(p); return [q[0], q[1]]; };
  const N = HEAD.nose;
  const mo = clamp(pose.mouth || 0, 0, 1);
  const smile = pose.smile || 0;
  // facing of the muzzle front
  const fW = head.vec([1, -0.25, 0]);
  if (fW[2] < -0.35) return; // muzzle faces away: no nose/mouth
  const vis = smoothstep(-0.5, 0.1, fW[2] + 0.55);
  // nose
  const nt = [N[0], N[1] + 0.012, 0];
  const nl = P([N[0] - 0.01, N[1] + 0.018, 0.038]);
  const nr = P([N[0] - 0.01, N[1] + 0.018, -0.038]);
  const nb = P([N[0] + 0.004, N[1] - 0.026, 0]);
  const ntp = P(nt);
  const nose = new Path2D();
  smoothTo(nose, [nl, [(nl[0] + nr[0]) / 2 + (ntp[0] - (nl[0] + nr[0]) / 2) * 0.3, (nl[1] + nr[1]) / 2 - 0.01], nr, nb], true);
  ctx.fillStyle = st.pink;
  ctx.fill(nose);
  ctx.lineWidth = st.lw * 0.9;
  ctx.strokeStyle = css(PAL.pinkDeep);
  ctx.stroke(nose);
  // mouth
  const top = [N[0] + 0.004, N[1] - 0.036, 0];
  const midp = [N[0] - 0.004, N[1] - 0.085 - mo * 0.02, 0];
  const wob = clamp(pose.wobble || 0, 0, 1);
  if (mo > 0.05) {
    // open: small "o" .. wide laugh; smiling flattens the top and lifts the corners
    const sm = clamp(smile, 0, 1);
    const w = lerp(0.035, 0.085, pose.mouthW || 0) * (1 + 0.25 * sm);
    const h = 0.03 + mo * lerp(0.06, 0.1, pose.mouthW || 0);
    const cy = N[1] - 0.075 - h * 0.6;
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const c = Math.cos(a), sn = Math.sin(a);
      let yy = sn > 0 ? sn * h * lerp(0.55, 0.12, sm) : sn * h * (1 - 0.15 * sm);
      yy += sm * h * 0.45 * c * c; // corners up
      yy += wob * 0.012 * Math.sin(c * 9) * (sn > 0 ? 1 : 0);
      pts.push(P([N[0] - 0.01 - Math.max(0, -sn) * 0.02, cy + yy, c * w]));
    }
    const mp = new Path2D();
    smoothTo(mp, pts, true);
    ctx.fillStyle = css(PAL.mouth);
    ctx.fill(mp);
    if (pose.tongue > 0 || mo > 0.3) {
      ctx.save();
      ctx.clip(mp);
      const tp = P([N[0] - 0.01, cy - h * 0.8, 0]);
      ctx.fillStyle = css(PAL.tongue);
      ctx.beginPath();
      ctx.ellipse(tp[0], tp[1], w * 0.85 * (head.s || 1), h * 0.6 * (head.s || 1), 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.lineWidth = st.lw * 1.1;
    ctx.strokeStyle = st.line;
    ctx.stroke(mp);
    brushLine(ctx, [P(top), P([N[0] - 0.002, cy + h * lerp(0.5, 0.12, sm), 0])], st.lw * 1.1, st.line, { taperIn: 0.2, taperOut: 0.2 });
  } else if (wob > 0.3) {
    // nervous / cold: a small wavy line
    ctx.globalAlpha = vis;
    brushLine(ctx, [P(top), P([N[0] - 0.003, N[1] - 0.07, 0])], st.lw * 1.05, st.line, { taperIn: 0.1, taperOut: 0.1 });
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const z = -0.07 + (0.14 * i) / 8;
      pts.push(P([N[0] - 0.012 - Math.abs(z) * 0.3, N[1] - 0.088 + (i % 2 ? 0.012 : -0.004) * wob, z]));
    }
    brushLine(ctx, pts, st.lw * 1.0, st.line, { taperIn: 0.15, taperOut: 0.15 });
    ctx.globalAlpha = 1;
  } else {
    const arm = (s) => {
      const a = P(midp);
      const b = P([N[0] - 0.02, N[1] - 0.1 + smile * 0.012, (0.035 + smile * 0.012) * s]);
      const c = P([N[0] - 0.05, N[1] - 0.098 + smile * 0.05, (0.062 + smile * 0.02) * s]);
      return [a, b, c];
    };
    ctx.globalAlpha = vis;
    brushLine(ctx, [P(top), P(midp)], st.lw * 1.05, st.line, { taperIn: 0.1, taperOut: 0.1 });
    brushLine(ctx, arm(1), st.lw * 1.05, st.line, { taperIn: 0.05, taperOut: 0.5 });
    brushLine(ctx, arm(-1), st.lw * 1.05, st.line, { taperIn: 0.05, taperOut: 0.5 });
    ctx.globalAlpha = 1;
  }
}

// opts.under: region (the neck/chest) where the head outline is not inked, so
// the face flows into the chest the way it does on the model sheet.
export function drawHead(ctx, g, st, opts = {}) {
  const pose = g.pose;
  const headPath = headUnionPath(g, pose.fluff, st.tufts ?? true);
  const ears = [g.earL, g.earR].sort((a, b) => a.depth - b.depth);
  const cz = g.cran.z;
  // ears behind head
  for (const e of ears) if (e.depth < cz - 0.12) drawEar(ctx, e, st, null);
  const farSide = g.head.basis.l[2] >= 0 ? -1 : 1;
  // head mass
  ctx.save();
  if (opts.under) clipOutside(ctx, opts.under);
  ctx.lineJoin = 'round';
  ctx.lineWidth = st.lw * 2;
  ctx.strokeStyle = st.line;
  ctx.stroke(headPath);
  ctx.restore();
  ctx.fillStyle = st.white;
  ctx.fill(headPath);
  // markings: the head is white underneath; grey is painted around the white
  // face and blaze, so the white chin melts into the white chest without a fringe
  ctx.save();
  ctx.clip(headPath);
  const face = [];
  for (let lam = -178; lam <= 178; lam += 6) face.push([lam, faceB(Math.abs(lam))]);
  for (let lam = 178; lam >= -178; lam -= 30) face.push([lam, -88]);
  const facePoly = projMark(g.head, g.mark, face, 1.25);
  const bl = [];
  for (let ph = -40; ph <= 56; ph += 6) bl.push([blazeW(ph), ph]);
  bl.push([0, 60]);
  for (let ph = 56; ph >= -40; ph -= 6) bl.push([-blazeW(ph), ph]);
  const blp = projMark(g.head, g.mark, bl, 1.0);
  ctx.save();
  if (facePoly) {
    const fp = new Path2D();
    smoothTo(fp, facePoly, true);
    clipOutside(ctx, fp);
  }
  if (blp) {
    const bp = new Path2D();
    smoothTo(bp, blp, true);
    clipOutside(ctx, bp);
  }
  ctx.fillStyle = st.grey;
  ctx.fill(headPath);
  ctx.restore();
  // soft grey transition shade on white under the chin
  // stripes
  const stripe = (pts, w) => {
    const pp = [];
    let minF = 1;
    for (const [lam, phi] of pts) {
      const p = sph(lam * DEG, phi * DEG);
      const f = g.head.vec(sphN(p))[2];
      minF = Math.min(minF, f);
      const q = g.head.proj(p);
      pp.push([q[0], q[1]]);
    }
    if (minF < 0.05) return;
    ctx.globalAlpha = smoothstep(0.05, 0.3, minF);
    brushLine(ctx, pp, w, st.stripe, { taperIn: 0.35, taperOut: 0.6, seed: pts.length });
    ctx.globalAlpha = 1;
  };
  if (st.faceStripes) {
    for (const s of [1, -1]) {
      stripe([[11 * s, 44], [12 * s, 32], [13 * s, 22]], 0.05);
      stripe([[22 * s, 47], [24 * s, 36], [27 * s, 27]], 0.045);
    }
  }
  ctx.restore();
  // ears in front
  for (const e of ears) if (e.depth >= cz - 0.12) drawEar(ctx, e, st, headPath);
  // eyes (clip to head)
  ctx.save();
  ctx.clip(headPath);
  drawBlush(ctx, g, st);
  const eyes = [g.eyeL, g.eyeR].sort((a, b) => a.z - b.z);
  for (const ef of eyes) drawEye(ctx, ef, pose, st);
  ctx.restore();
  drawMouth(ctx, g, st);
  // whiskers emerge from the cheek edge: only the part outside the face shows
  ctx.save();
  clipOutside(ctx, headPath);
  drawWhiskers(ctx, g, farSide, st);
  drawWhiskers(ctx, g, -farSide, st);
  ctx.restore();
  return headPath;
}
