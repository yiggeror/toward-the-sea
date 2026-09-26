// Perspective helpers on top of the shot's depth model. A world point
// (x, y, d) — x across, y down, d depth behind the stage plane — is moved into
// camera space (the camera sits at x = cam.x, d = cam.dz − D and may turn by
// cam.yaw about the vertical axis, + = to its right), then projected:
// screen = anchor + (x', y − cam.y) · s with s = base·z·D / d'. With yaw = 0
// this is exactly the layer model (s = scaleAt(pOf(d))). Polygons are clipped
// against a near plane so nothing explodes when it passes the lens.

// Camera placement: a world pivot (px, pd), the heading yaw, and the camera
// track's truck (x) and dolly (dz) measured in the camera's own frame:
// right r = (cos yaw, −sin yaw), forward f = (sin yaw, cos yaw) in (x, d);
// camera C = pivot + x·r + (dz − D)·f. The side-view stage plane (p = 1) is
// then the plane through pivot + dz·f facing the camera, and a stage x maps to
// world pivot + x·r (+ dz·f) — so side-view actors and the 3D set agree.
export function toCam(view, x, y, d) {
  const c = view.cam;
  const yaw = c.yaw || 0;
  const px = c.px || 0, pd = c.pd || 0;
  const yr = y - c.y;
  let q;
  if (!yaw) q = [x - px - c.x, yr, d - pd - ((c.dz || 0) - view.D)];
  else {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const f = (c.dz || 0) - view.D;
    const Cx = px + c.x * cs + f * sn, Cd = pd - c.x * sn + f * cs;
    const dx = x - Cx, dd = d - Cd;
    q = [dx * cs - dd * sn, yr, dx * sn + dd * cs];
  }
  // pitch (+ = looking up) about the camera's horizontal axis
  const pitch = c.pitch || 0;
  if (pitch) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    q = [q[0], q[1] * cp + q[2] * sp, -q[1] * sp + q[2] * cp];
  }
  return q;
}
// camera space -> screen
export function projC(view, q) {
  const s = (view.base * view.cam.z * view.D) / Math.max(1e-4, q[2]);
  return [view.ox + q[0] * s, view.oy + q[1] * s];
}
export function P3(view, x, y, d) {
  return projC(view, toCam(view, x, y, d));
}
// world (x, d) of a side-view stage x (on the stage plane)
export function stageToWorld(view, xs) {
  const c = view.cam;
  const yaw = c.yaw || 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
  return [(c.px || 0) + xs * cs + (c.dz || 0) * sn, (c.pd || 0) - xs * sn + (c.dz || 0) * cs];
}
// screen scale (px per world unit) at a world point (x defaults to the camera line)
export function S3(view, d, x) {
  const q = toCam(view, x ?? view.cam.x, 0, d);
  return (view.base * view.cam.z * view.D) / Math.max(1e-4, q[2]);
}
// camera-space near plane
export function nearC(view) {
  return view.D * 0.06;
}
// world-depth prefilter bound (only meaningful when the camera looks down +d)
export function nearD(view) {
  if (view.cam.yaw) return -Infinity;
  return -view.D * 0.94 + (view.cam.dz || 0) + (view.cam.pd || 0);
}
// distance from the camera to world depth d along the view axis
export function camDist(view, d, x) {
  return toCam(view, x ?? view.cam.x, 0, d)[2];
}
// clip a camera-space polygon against d' >= dn (Sutherland–Hodgman)
export function clipNear(pts, dn) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ia = a[2] >= dn, ib = b[2] >= dn;
    if (ia) out.push(a);
    if (ia !== ib) {
      const u = (dn - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, dn]);
    }
  }
  return out;
}
// trace a 3D polygon as a screen path (returns false if fully clipped)
export function path3(ctx, view, pts, o = {}) {
  const cam = pts.map((p) => toCam(view, p[0], o.mirror ? -p[1] : p[1], p[2]));
  const q = clipNear(cam, o.near ?? nearC(view));
  if (q.length < 3) return false;
  if (!o.keep) ctx.beginPath();
  for (let i = 0; i < q.length; i++) {
    const [X, Y] = projC(view, q[i]);
    if (i) ctx.lineTo(X, Y);
    else ctx.moveTo(X, Y);
  }
  ctx.closePath();
  return true;
}
export function fill3(ctx, view, pts, fill, o = {}) {
  if (!path3(ctx, view, pts, o)) return false;
  ctx.fillStyle = fill;
  ctx.fill();
  return true;
}
// rectangles on the three plane families
export function wallX(x, d0, d1, y0, y1) {
  return [[x, y0, d0], [x, y0, d1], [x, y1, d1], [x, y1, d0]];
}
export function floorY(y, x0, x1, d0, d1) {
  return [[x0, y, d0], [x1, y, d0], [x1, y, d1], [x0, y, d1]];
}
export function faceD(d, x0, x1, y0, y1) {
  return [[x0, y0, d], [x1, y0, d], [x1, y1, d], [x0, y1, d]];
}
// a 3D polyline, width in world units
export function line3(ctx, view, pts, color, w, o = {}) {
  const dn = o.near ?? nearC(view);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const q = pts.map((p) => toCam(view, p[0], o.mirror ? -p[1] : p[1], p[2]));
  for (let i = 0; i < q.length - 1; i++) {
    let a = q[i], b = q[i + 1];
    if (a[2] < dn && b[2] < dn) continue;
    if (a[2] < dn) a = lerp3(a, b, (dn - a[2]) / (b[2] - a[2]));
    if (b[2] < dn) b = lerp3(b, a, (dn - b[2]) / (a[2] - b[2]));
    const A = projC(view, a), B = projC(view, b);
    const s = (view.base * view.cam.z * view.D) / ((a[2] + b[2]) / 2);
    ctx.lineWidth = Math.max(0.6, w * s);
    ctx.beginPath();
    ctx.moveTo(A[0], A[1]);
    ctx.lineTo(B[0], B[1]);
    ctx.stroke();
  }
}
// camera position in world (x, d)
export function camPos(view) {
  const c = view.cam;
  const yaw = c.yaw || 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const f = (c.dz || 0) - view.D;
  return [(c.px || 0) + c.x * cs + f * sn, (c.pd || 0) - c.x * sn + f * cs];
}
/**
 * Fill everything under the silhouette of a set of 3D polylines (profile
 * slices of a heightfield): per screen column the highest projected point
 * wins. Right for terrain seen from any heading, where one outline polygon is
 * only right looking straight along the slope.
 */
export function fillUnder(ctx, view, lines, fill, o = {}) {
  const W = view.W, H = view.H;
  const step = o.step ?? Math.max(2, Math.round(W / 960));
  const n = Math.ceil(W / step) + 1;
  const top = new Float64Array(n).fill(Infinity);
  const dn = o.near ?? nearC(view);
  const hit = (i, y) => {
    if (i >= 0 && i < n && y < top[i]) top[i] = y;
  };
  const seg = (a, b) => {
    if (a[2] < dn && b[2] < dn) return;
    if (a[2] < dn) a = lerp3(a, b, (dn - a[2]) / (b[2] - a[2]));
    else if (b[2] < dn) b = lerp3(b, a, (dn - b[2]) / (a[2] - b[2]));
    let A = projC(view, a), B = projC(view, b);
    if (A[0] > B[0]) [A, B] = [B, A];
    hit(Math.round(A[0] / step), A[1]);
    hit(Math.round(B[0] / step), B[1]);
    const dx = B[0] - A[0];
    if (dx < 1e-9) return;
    const i0 = Math.max(0, Math.ceil(A[0] / step)), i1 = Math.min(n - 1, Math.floor(B[0] / step));
    for (let i = i0; i <= i1; i++) hit(i, A[1] + ((B[1] - A[1]) * (i * step - A[0])) / dx);
  };
  for (const pts of lines) {
    let prev = null;
    for (const p of pts) {
      const q = toCam(view, p[0], p[1], p[2]);
      if (prev) seg(prev, q);
      prev = q;
    }
  }
  ctx.beginPath();
  ctx.moveTo(-4, H + 4);
  for (let i = 0; i < n; i++) ctx.lineTo(i * step, clamp(top[i], -4, H + 4));
  ctx.lineTo(W + 4, H + 4);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function lerp3(a, b, u) {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
// draw fn in a local frame standing at (x, y, d) facing the camera (billboard),
// k = extra scale; returns the screen scale
export function billboard(ctx, view, x, y, d, fn, k = 1) {
  const q = toCam(view, x, y, d);
  if (q[2] < nearC(view)) return 0;
  const s = (view.base * view.cam.z * view.D) / q[2];
  const [X, Y] = projC(view, q);
  ctx.save();
  ctx.setTransform(s * k, 0, 0, s * k, X, Y);
  fn(ctx, s * k);
  ctx.restore();
  return s * k;
}
/**
 * Draw fn in the local 2D frame of a plane (affine approximation around the
 * origin): plane 'd' (constant depth: u = +x, v = +y) or 'x' (constant x:
 * u = +d, v = +y). Good for signs, car faces and other small flat things.
 */
export function onPlane(ctx, view, plane, x, y, d, fn, o = {}) {
  const P0 = toCam(view, x, o.mirror ? -y : y, d);
  if (P0[2] < nearC(view) * 1.5) return false;
  const e = o.step ?? 1;
  const U = plane === 'd' ? toCam(view, x + e, o.mirror ? -y : y, d) : toCam(view, x, o.mirror ? -y : y, d + e);
  const V = toCam(view, x, o.mirror ? -(y + e) : y + e, d);
  if (U[2] <= 0 || V[2] <= 0) return false;
  const p0 = projC(view, P0), pu = projC(view, U), pv = projC(view, V);
  ctx.save();
  ctx.setTransform((pu[0] - p0[0]) / e, (pu[1] - p0[1]) / e, (pv[0] - p0[0]) / e, (pv[1] - p0[1]) / e, p0[0], p0[1]);
  fn(ctx);
  ctx.restore();
  return true;
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
