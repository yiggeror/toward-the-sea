// Event-driven effects that are pure functions of (event, time): water
// droplets from a shake or a paw flick, dust puffs on take-off/landing,
// snow holes and crumbs, water splashes. Nothing is simulated incrementally,
// so any frame can be rendered in isolation (web seek == offline render).
import { hash01, clamp, lerp, smoothstep } from '../core/math.js';
import { css } from '../core/draw.js';

const G = 0.011; // gravity, H per frame^2

function toScreen(cam, x, y) {
  return [cam.cx + (x - cam.x) * cam.s, cam.cy + (y - cam.y) * cam.s];
}
function drop(ctx, cam, x, y, vx, vy, r, alpha, col) {
  const [sx, sy] = toScreen(cam, x, y);
  const sp = Math.hypot(vx, vy);
  const ang = Math.atan2(vy, vx);
  const len = r * (1 + Math.min(2.2, sp * 14));
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ang);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(0, 0, len * cam.s, r * cam.s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawEventFX(ctx, events, t, cam, env = {}) {
  const ground = env.ground || (() => 0);
  const water = env.waterColor || 'rgb(214,231,242)';
  const dust = env.dustColor || 'rgb(214,203,188)';
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const age = t - e.t;
    if (age < -30) continue;
    const seed = i * 977 + Math.round(e.t * 13);
    if (e.type === 'shake' && age >= 0 && age < (e.dur || 22) + 30) {
      const n = 70;
      for (let j = 0; j < n; j++) {
        const h = (k) => hash01(seed + j * 31 + k);
        const tb = (e.dur || 22) * h(1);
        const a = age - tb;
        if (a < 1.5 || a > 26) continue;
        // spray leaves from the fur surface along the back / chest / rump
        const u = h(2);
        const ox = e.x + (u - 0.3) * 1.5, oy = (e.y ?? 0) - 1.25 - 0.25 * Math.sin(u * Math.PI) + h(3) * 0.2;
        const side = u < 0.2 ? -1 : u > 0.85 ? 1 : 0;
        const ang = -Math.PI / 2 + (h(4) - 0.5) * 2.2 + side * 0.9;
        const sp = 0.1 + 0.13 * h(5);
        const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
        const x = ox + vx * a, y = oy + vy * a + 0.5 * G * a * a;
        if (y > ground(x)) continue;
        drop(ctx, cam, x, y, vx, vy + G * a, 0.016 + 0.018 * h(6), 0.9 * (1 - smoothstep(18, 26, a)), water);
      }
    } else if (e.type === 'flick' && age >= 0 && age < 24) {
      for (let j = 0; j < 7; j++) {
        const h = (k) => hash01(seed + j * 17 + k);
        const vx = (h(1) - 0.3) * 0.12 * (env.facing || 1), vy = -0.05 - 0.08 * h(2);
        const x = e.x + vx * age, y = e.y + vy * age + 0.5 * G * age * age;
        if (y > ground(x)) continue;
        drop(ctx, cam, x, y, vx, vy + G * age, 0.012 + 0.01 * h(3), 0.9 * (1 - smoothstep(14, 24, age)), e.surface === 'snow' ? 'rgb(245,248,252)' : water);
      }
    } else if ((e.type === 'land' || e.type === 'jump') && age >= 0 && age < 18) {
      const col = e.surface === 'snow' ? 'rgb(246,249,252)' : e.surface === 'water' ? water : dust;
      const n = 6;
      for (let j = 0; j < n; j++) {
        const h = (k) => hash01(seed + j * 13 + k);
        const dir = j < n / 2 ? -1 : 1;
        const u = age / 18;
        const x = e.x + dir * (0.1 + 0.5 * h(1)) * Math.pow(u, 0.5) * (e.strength || 1);
        const y = ground(e.x) - 0.04 - 0.18 * h(2) * Math.pow(u, 0.6);
        const [sx, sy] = toScreen(cam, x, y);
        ctx.globalAlpha = 0.55 * (1 - u) * clamp(e.strength || 1, 0.3, 1);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(sx, sy, (0.05 + 0.12 * u) * cam.s * (0.6 + 0.6 * h(3)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (e.type === 'step' && e.surface === 'water' && age >= 0 && age < 20) {
      for (let j = 0; j < 9; j++) {
        const h = (k) => hash01(seed + j * 19 + k);
        const vx = (h(1) - 0.5) * 0.1, vy = -0.04 - 0.07 * h(2);
        const x = e.x + vx * age, y = e.y + vy * age + 0.5 * G * age * age;
        if (y > e.y) continue;
        drop(ctx, cam, x, y, vx, vy + G * age, 0.012 + 0.012 * h(3), 0.85, water);
      }
    } else if (e.type === 'snowpull' && age >= 0 && age < 24) {
      for (let j = 0; j < 8; j++) {
        const h = (k) => hash01(seed + j * 23 + k);
        const vx = (h(1) - 0.5) * 0.08, vy = -0.06 - 0.06 * h(2);
        const x = e.x + vx * age, y = e.y - 0.1 + vy * age + 0.5 * G * age * age;
        if (y > e.y) continue;
        drop(ctx, cam, x, y, vx * 0.2, 0.001, 0.02 + 0.02 * h(3), 0.95, 'rgb(248,250,253)');
      }
    }
  }
}

// persistent ground marks (snow holes, footprints), drawn under the cat
export function drawGroundMarks(ctx, events, t, cam, env = {}) {
  for (const e of events) {
    if (e.type !== 'step' || e.t > t) continue;
    if (e.surface === 'snow') {
      const w = 0.2, d = Math.max(0.05, e.sink || 0.08);
      const [sx, sy] = toScreen(cam, e.x, e.y);
      ctx.fillStyle = css('#b9c7d6', 0.85);
      ctx.beginPath();
      ctx.ellipse(sx, sy + 0.01 * cam.s, w * cam.s * 0.55, d * cam.s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.surface === 'sand' || e.surface === 'mud') {
      const [sx, sy] = toScreen(cam, e.x, e.y);
      ctx.fillStyle = css(e.surface === 'sand' ? '#b89d7b' : '#6b5d52', 0.35);
      ctx.beginPath();
      ctx.ellipse(sx, sy + 0.01 * cam.s, 0.09 * cam.s, 0.025 * cam.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
