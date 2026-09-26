// Emotion marks (manga "keifu"): ! ? ♪ ♥ sweat, zzz, sparkles, shiver lines,
// breath puffs, gloom lines, surprise lines, a rolling tear. They are events
// on a performance (perf.emote(t, kind, {dur})) and are pure functions of
// time, drawn in screen space around the head.
//
// anchor: { P(headLocal3D) -> [x, y] screen px, u: px size unit (~ 1/3 head), facing }
import { clamp, lerp, smoothstep, hash01, TAU } from '../core/math.js';
import { css } from '../core/draw.js';

const INK = '#3b3336';
const HALO = 'rgba(255,255,255,0.92)';

function backOut(x) {
  const c = 2.2;
  x = clamp(x, 0, 1) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}
// envelope: pop-in over `inF` frames with overshoot, fade over `outF`
function env(age, dur, inF = 4, outF = 7) {
  if (age < 0 || age > dur) return null;
  return { s: backOut(age / inF), a: 1 - smoothstep(dur - outF, dur, age) };
}

function withHalo(ctx, u, draw) {
  // halo pass (thick white) then ink pass
  ctx.save();
  ctx.strokeStyle = HALO;
  ctx.fillStyle = HALO;
  draw(true);
  ctx.restore();
  draw(false);
}

function exclaim(ctx, u, halo) {
  ctx.beginPath();
  ctx.moveTo(-0.17 * u, -1.05 * u);
  ctx.quadraticCurveTo(0, -1.18 * u, 0.17 * u, -1.05 * u);
  ctx.lineTo(0.07 * u, 0.2 * u);
  ctx.quadraticCurveTo(0, 0.27 * u, -0.07 * u, 0.2 * u);
  ctx.closePath();
  ctx.moveTo(0.14 * u, 0.55 * u);
  ctx.arc(0, 0.55 * u, 0.14 * u, 0, TAU);
  if (halo) {
    ctx.lineWidth = 0.22 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else {
    ctx.fillStyle = INK;
    ctx.fill();
  }
}
function question(ctx, u, halo) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.36 * u, -0.5 * u);
  ctx.bezierCurveTo(-0.36 * u, -1.1 * u, 0.42 * u, -1.1 * u, 0.4 * u, -0.55 * u);
  ctx.bezierCurveTo(0.38 * u, -0.2 * u, 0.02 * u, -0.22 * u, 0.02 * u, 0.18 * u);
  ctx.lineWidth = (halo ? 0.44 : 0.2) * u;
  ctx.strokeStyle = halo ? HALO : INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0.02 * u, 0.56 * u, (halo ? 0.24 : 0.13) * u, 0, TAU);
  ctx.fillStyle = halo ? HALO : INK;
  ctx.fill();
}
function note(ctx, u, halo, double) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const hw = halo ? 0.12 * u : 0;
  ctx.fillStyle = halo ? HALO : INK;
  ctx.strokeStyle = halo ? HALO : INK;
  const head = (x, y) => {
    ctx.beginPath();
    ctx.ellipse(x, y, 0.24 * u + hw, 0.17 * u + hw, -0.4, 0, TAU);
    ctx.fill();
  };
  head(0, 0);
  if (double) head(0.62 * u, -0.12 * u);
  ctx.lineWidth = 0.09 * u + hw * 2;
  ctx.beginPath();
  ctx.moveTo(0.21 * u, -0.05 * u);
  ctx.lineTo(0.21 * u, -0.95 * u);
  if (double) {
    ctx.lineTo(0.83 * u, -1.07 * u);
    ctx.lineTo(0.83 * u, -0.17 * u);
  } else {
    ctx.quadraticCurveTo(0.3 * u, -0.6 * u, 0.58 * u, -0.5 * u);
  }
  ctx.stroke();
  ctx.restore();
}
function heart(ctx, u, halo) {
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * TAU;
    const x = 16 * Math.sin(t) ** 3, y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const k = u / 26;
    if (i === 0) ctx.moveTo(x * k, y * k);
    else ctx.lineTo(x * k, y * k);
  }
  ctx.closePath();
  if (halo) {
    ctx.lineWidth = 0.2 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else {
    ctx.fillStyle = '#f2828f';
    ctx.fill();
    ctx.lineWidth = 0.06 * u;
    ctx.strokeStyle = '#b2485a';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(-0.28 * u, -0.22 * u, 0.1 * u, 0.07 * u, -0.6, 0, TAU);
    ctx.fill();
  }
}
function drop(ctx, u, halo, fill = '#bfe2f7') {
  ctx.beginPath();
  ctx.moveTo(0, -0.62 * u);
  ctx.bezierCurveTo(0.12 * u, -0.3 * u, 0.3 * u, -0.1 * u, 0.3 * u, 0.1 * u);
  ctx.arc(0, 0.1 * u, 0.3 * u, 0, Math.PI);
  ctx.bezierCurveTo(-0.3 * u, -0.1 * u, -0.12 * u, -0.3 * u, 0, -0.62 * u);
  ctx.closePath();
  if (halo) {
    ctx.lineWidth = 0.18 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 0.06 * u;
    ctx.strokeStyle = '#5e8fb5';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-0.1 * u, 0.08 * u, 0.06 * u, 0.1 * u, 0.3, 0, TAU);
    ctx.fill();
  }
}
function zee(ctx, u, halo) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.3 * u, -0.3 * u);
  ctx.lineTo(0.3 * u, -0.3 * u);
  ctx.lineTo(-0.3 * u, 0.3 * u);
  ctx.lineTo(0.3 * u, 0.3 * u);
  ctx.lineWidth = (halo ? 0.34 : 0.14) * u;
  ctx.strokeStyle = halo ? HALO : INK;
  ctx.stroke();
}
function star(ctx, u, fill, edge) {
  ctx.beginPath();
  ctx.moveTo(0, -u);
  ctx.quadraticCurveTo(0.1 * u, -0.1 * u, u, 0);
  ctx.quadraticCurveTo(0.1 * u, 0.1 * u, 0, u);
  ctx.quadraticCurveTo(-0.1 * u, 0.1 * u, -u, 0);
  ctx.quadraticCurveTo(-0.1 * u, -0.1 * u, 0, -u);
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) {
    ctx.lineWidth = 0.08 * u;
    ctx.strokeStyle = edge;
    ctx.stroke();
  }
}

// one mark at (x, y), rotation r, scale s (all screen)
function place(ctx, x, y, r, s, a, fn) {
  if (a <= 0.01 || s <= 0.01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(r);
  ctx.scale(s, s);
  ctx.globalAlpha *= clamp(a, 0, 1);
  fn();
  ctx.restore();
}

export function drawEmotes(ctx, events, t, anchor) {
  if (!events || !events.length) return;
  const { P, u, facing = 1 } = anchor;
  const top = P([-0.05, 0.62, 0]);
  const back = P([-0.4, 0.5, 0]);
  const mouth = P([0.52, -0.2, 0]);
  // "up" on screen from the head (follows head tilt a little)
  const up = [top[0] - P([-0.05, 0, 0])[0], top[1] - P([-0.05, 0, 0])[1]];
  const ul = Math.hypot(up[0], up[1]) || 1;
  const U = [up[0] / ul, up[1] / ul];
  const side = facing; // the side the face points to on screen
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type !== 'emote') continue;
    const age = t - e.t, dur = e.dur ?? 30;
    if (age < 0 || age > dur) continue;
    const k = e.kind;
    const seed = i * 131 + 7;
    const sz = u * (e.size ?? 1);
    if (k === 'exclaim') {
      const v = env(age, dur, 4, 6);
      const x = top[0] + U[0] * sz * 1.2 + side * sz * 0.9, y = top[1] + U[1] * sz * 1.2;
      const shake = age < 8 ? Math.sin(age * 2.6) * 0.12 * (1 - age / 8) : 0;
      place(ctx, x, y, 0.18 * side + shake, v.s, v.a, () => withHalo(ctx, sz, (h) => exclaim(ctx, sz, h)));
      // two pop lines beside it
      const la = v.a * (1 - smoothstep(4, 12, age));
      for (const sgn of [-1, 1]) {
        place(ctx, x + sgn * sz * 0.55, y - sz * 0.5, sgn * 0.6, 1, la, () => {
          ctx.lineCap = 'round';
          ctx.strokeStyle = INK;
          ctx.lineWidth = 0.1 * sz;
          ctx.beginPath();
          ctx.moveTo(0, -0.3 * sz);
          ctx.lineTo(0, 0.05 * sz);
          ctx.stroke();
        });
      }
    } else if (k === 'surprise') {
      // three short lines radiating over the head (sheet: 惊喜)
      const v = env(age, dur, 3, 6);
      for (let j = -1; j <= 1; j++) {
        const ang = Math.atan2(U[1], U[0]) + j * 0.45;
        const r0 = sz * (1.1 + 0.25 * v.s), r1 = r0 + sz * 0.55 * v.s;
        ctx.save();
        ctx.globalAlpha *= v.a;
        ctx.lineCap = 'round';
        for (const hl of [true, false]) {
          ctx.strokeStyle = hl ? HALO : INK;
          ctx.lineWidth = (hl ? 0.26 : 0.1) * sz;
          ctx.beginPath();
          ctx.moveTo(top[0] + Math.cos(ang) * r0, top[1] + Math.sin(ang) * r0);
          ctx.lineTo(top[0] + Math.cos(ang) * r1, top[1] + Math.sin(ang) * r1);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (k === 'question') {
      const v = env(age, dur, 5, 8);
      const bob = Math.sin(age * 0.25) * 0.08 * sz;
      const x = back[0] - side * sz * 0.6 + U[0] * sz * 1.0, y = back[1] + U[1] * sz * 1.0 + bob;
      place(ctx, x, y, -0.2 * side + Math.sin(age * 0.18) * 0.1, v.s, v.a, () => withHalo(ctx, sz, (h) => question(ctx, sz, h)));
    } else if (k === 'notes') {
      // notes rise and sway, a new one every 14 frames
      for (let j = 0; j < 4; j++) {
        const a0 = age - j * 14;
        if (a0 < 0 || a0 > 30 || j * 14 > dur - 10) continue;
        const v = env(a0, 30, 4, 10);
        const x = top[0] + side * sz * (0.8 + a0 * 0.03) + Math.sin(a0 * 0.3 + j) * sz * 0.25;
        const y = top[1] - sz * (0.3 + a0 * 0.06);
        place(ctx, x, y, 0.2 * Math.sin(a0 * 0.2 + j), v.s * 0.9, v.a, () => withHalo(ctx, sz, (h) => note(ctx, sz, h, j % 2 === 1)));
      }
    } else if (k === 'heart') {
      const v = env(age, dur, 5, 10);
      const pulse = 1 + 0.08 * Math.sin(age * 0.5);
      const x = top[0] + side * sz * 0.9, y = top[1] - sz * (0.5 + age * 0.02);
      place(ctx, x, y, 0.15 * side, v.s * pulse, v.a, () => withHalo(ctx, sz, (h) => heart(ctx, sz, h)));
    } else if (k === 'sweat') {
      // on the upper side of the head, away from where the face points
      const v = env(age, dur, 4, 8);
      const c0 = P([0, 0.05, 0]);
      const a1 = P([-0.05, 0.3, 0.62]), a2 = P([-0.05, 0.3, -0.62]);
      let q = Math.abs(a1[0] - c0[0]) > Math.abs(a2[0] - c0[0]) ? a1 : a2;
      if (Math.abs(Math.abs(a1[0] - c0[0]) - Math.abs(a2[0] - c0[0])) < sz * 0.3) q = (a1[0] - c0[0]) * side < 0 ? a1 : a2;
      const sx = Math.sign(q[0] - c0[0]) || 1;
      const x = q[0] + sx * sz * 0.35, y = q[1] + sz * (smoothstep(4, dur, age) * 0.35);
      place(ctx, x, y, 0.3 * sx, v.s * 0.85, v.a, () => withHalo(ctx, sz, (h) => drop(ctx, sz, h)));
    } else if (k === 'zzz') {
      for (let j = 0; j < 3; j++) {
        const cyc = 54;
        const a0 = (age + j * 18) % cyc;
        const v = { s: smoothstep(0, 8, a0) * (0.6 + a0 / cyc * 0.6), a: (1 - smoothstep(cyc - 14, cyc, a0)) * smoothstep(0, dur * 0.1 + 1, age) * (1 - smoothstep(dur - 12, dur, age)) };
        const x = top[0] + side * sz * (0.6 + a0 * 0.025), y = top[1] - sz * (0.1 + a0 * 0.04);
        place(ctx, x, y, 0.2, v.s, v.a, () => withHalo(ctx, sz * 0.8, (h) => zee(ctx, sz * 0.8, h)));
      }
    } else if (k === 'sparkle') {
      const n = e.n ?? 5;
      for (let j = 0; j < n; j++) {
        const h = (q) => hash01(seed + j * 17 + q);
        const ph = age * (0.22 + 0.1 * h(1)) + h(2) * TAU;
        const tw = Math.max(0, Math.sin(ph));
        const ang = -Math.PI / 2 + (h(3) - 0.5) * 2.6;
        const r = sz * (1.3 + h(4) * 1.1);
        const cx = (top[0] + P([0.2, -0.1, 0])[0]) / 2, cy = (top[1] + P([0.2, -0.1, 0])[1]) / 2;
        const x = cx + Math.cos(ang) * r * 1.2, y = cy + Math.sin(ang) * r;
        const a = tw * (1 - smoothstep(dur - 10, dur, age)) * smoothstep(0, 6, age);
        place(ctx, x, y, 0, (0.18 + 0.2 * h(5)) * (0.5 + 0.5 * tw), a, () => {
          star(ctx, sz, 'rgba(255,246,200,0.97)', 'rgba(222,168,70,0.7)');
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha *= 0.35;
          ctx.beginPath();
          ctx.arc(0, 0, sz * 0.8, 0, TAU);
          ctx.fillStyle = 'rgba(255,236,170,0.5)';
          ctx.fill();
        });
      }
    } else if (k === 'shiver') {
      // ( ) brackets on both sides, jittering on twos
      const a = (1 - smoothstep(dur - 8, dur, age)) * smoothstep(0, 4, age);
      const on = Math.floor(age / 2) % 2;
      const base = P([-0.05, 0.05, 0]);
      const R = sz * 0.9;
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.lineCap = 'round';
      for (const sgn of [-1, 1]) {
        for (let j = 0; j < 2; j++) {
          const x = base[0] + sgn * sz * (1.9 + j * 0.35 + (on ? 0.07 : 0)), y = base[1] + sz * (0.3 + j * 0.2);
          for (const hl of [true, false]) {
            ctx.strokeStyle = hl ? HALO : INK;
            ctx.lineWidth = (hl ? 0.22 : 0.08) * sz;
            ctx.beginPath();
            if (sgn > 0) ctx.arc(x - R, y, R, -0.35, 0.35);
            else ctx.arc(x + R, y, R, Math.PI - 0.35, Math.PI + 0.35);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    } else if (k === 'puff') {
      // breath clouds in the cold, one every 30 frames
      for (let j = 0; j < 6; j++) {
        const a0 = age - j * 30;
        if (a0 < 0 || a0 > 26) continue;
        const g = smoothstep(0, 26, a0);
        const x = mouth[0] + side * sz * (0.3 + g * 1.1), y = mouth[1] - sz * g * 0.35;
        ctx.save();
        ctx.globalAlpha *= (1 - g) * 0.7 * (1 - smoothstep(dur - 8, dur, age));
        ctx.fillStyle = e.color || 'rgba(244,248,255,0.9)';
        for (let q = 0; q < 3; q++) {
          ctx.beginPath();
          ctx.arc(x + side * q * sz * 0.2 * (0.5 + g), y - q * sz * 0.08, sz * (0.18 + 0.35 * g) * (1 - q * 0.2), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    } else if (k === 'gloom') {
      const a = (1 - smoothstep(dur - 10, dur, age)) * smoothstep(0, 10, age);
      ctx.save();
      ctx.globalAlpha *= a * 0.7;
      ctx.strokeStyle = '#6f78a8';
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.07 * sz;
      const b = P([0.2, 0.42, 0]);
      for (let j = -2; j <= 2; j++) {
        ctx.beginPath();
        ctx.moveTo(b[0] + j * sz * 0.22, b[1] - sz * 0.35);
        ctx.lineTo(b[0] + j * sz * 0.22, b[1] + sz * (0.1 + 0.12 * (2 - Math.abs(j))));
        ctx.stroke();
      }
      ctx.restore();
    } else if (k === 'tear') {
      // a drop leaves the outer eye corner and rolls down the cheek
      const eye = P([0.36, -0.1, 0.3 * (e.side ?? 1)]);
      const g = smoothstep(4, dur - 4, age);
      const v = env(age, dur, 5, 6);
      place(ctx, eye[0] - side * sz * 0.1, eye[1] + sz * (0.15 + g * 0.9), 0, v.s * 0.45, v.a, () => withHalo(ctx, sz, (h) => drop(ctx, sz, h, '#d9eefb')));
    }
  }
  ctx.restore();
}
