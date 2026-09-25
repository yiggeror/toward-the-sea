// Phase-1 character & action test page. Every frame is computed live by the
// same engine that renders the film.
import { CLIPS } from './clips.js';
import { drawStage } from './stage.js';
import { CatActor } from '../anim/actor.js';
import { drawCat } from '../cat/cat.js';
import { defaultPose } from '../cat/rig.js';
import { drawCatFront, drawCatBack, drawPortrait, EXPRESSIONS } from '../cat/views.js';
import { drawEventFX, drawGroundMarks } from '../fx/events.js';

const FPS = 24;
const DPR = () => Math.min(2, window.devicePixelRatio || 1);

function sizeCanvas(cv) {
  const r = cv.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * DPR())), h = Math.max(1, Math.round(r.height * DPR()));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
    return true;
  }
  return false;
}

// ------------------------------------------------------------ model sheet
function drawModelSheet(cv) {
  sizeCanvas(cv);
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#f9faf8';
  ctx.fillRect(0, 0, W, H);
  const u = W / 1200; // layout unit
  const gy = 330 * u, s = 78 * u;
  ctx.strokeStyle = 'rgba(40,50,60,0.14)';
  ctx.lineWidth = Math.max(1, u);
  ctx.beginPath(); ctx.moveTo(30 * u, gy); ctx.lineTo(W - 30 * u, gy); ctx.stroke();
  drawCatFront(ctx, {}, { x: 170 * u, y: gy, scale: s });
  const p = defaultPose();
  Object.assign(p, { hip: [-0.16, -0.47], pitch: 1.27, len: 1.1, neckLen: 1.05, archB: 0.34, archF: -0.18, neck: 0.28, hYaw: 0.55,
    hnM: 1, hfM: 1, hn: [0.32, 0], hf: [0.24, 0], fn: [0.54, 0], ff: [0.44, 0], tailA: -0.72, tailC: 2.3, tailK: 1.0 });
  drawCat(ctx, p, { x: 440 * u, y: gy, scale: s, ground: () => 0 });
  drawCatBack(ctx, { tail: 0.6 }, { x: 720 * u, y: gy, scale: s });
  drawCatFront(ctx, { hYaw: -0.45 }, { x: 990 * u, y: gy, scale: s });
  ctx.fillStyle = '#5b636b';
  ctx.font = `${14 * u}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  [['正面 front', 170], ['侧面 side', 430], ['背面 back', 720], ['3/4', 990]].forEach(([t, x]) => ctx.fillText(t, x * u, gy + 24 * u));
  // expressions
  const ex = EXPRESSIONS;
  const cw = (W - 40 * u) / ex.length;
  ex.forEach((e, i) => {
    const cx = 20 * u + cw * (i + 0.5), cy = 470 * u;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - cw / 2, cy - 110 * u, cw, 160 * u); ctx.clip();
    drawPortrait(ctx, Object.assign({ noBody: true }, e.p), { x: cx, y: cy, scale: Math.min(62 * u, cw * 0.62) });
    ctx.restore();
    ctx.fillStyle = '#5b636b';
    ctx.fillText(e.zh, cx, cy + 72 * u);
  });
}

// ------------------------------------------------------------ clip cards
class ClipCard {
  constructor(clip, grid) {
    this.clip = clip;
    this.playing = true;
    this.speed = 1;
    this.onion = false;
    this.frame = 0;
    this.acc = 0;
    const fig = document.createElement('figure');
    fig.className = 'clip';
    fig.id = 'clip-' + clip.id;
    const [zh, ...en] = clip.title.split(' ');
    fig.innerHTML = `
      <div class="stage"><canvas aria-label="${clip.title} animation"></canvas></div>
      <canvas class="xsheet" aria-label="timing strip: click to seek"></canvas>
      <figcaption>
        <div class="cap-title"><span class="zh">${zh}</span><span class="en">${en.join(' ')}</span></div>
        <div class="ctrl">
          <button type="button" class="b-play" id="play-${clip.id}" aria-label="pause">❚❚</button>
          <button type="button" class="b-prev" id="prev-${clip.id}" aria-label="previous frame">‹</button>
          <button type="button" class="b-next" id="next-${clip.id}" aria-label="next frame">›</button>
          <select class="b-speed" id="speed-${clip.id}" aria-label="speed">
            <option value="1">1×</option><option value="0.5">½×</option><option value="0.25">¼×</option>
          </select>
          <label class="b-onion"><input type="checkbox" id="onion-${clip.id}"> 洋葱皮</label>
          <span class="counter" aria-live="off">f 000</span>
        </div>
      </figcaption>`;
    grid.appendChild(fig);
    this.el = fig;
    this.cv = fig.querySelector('.stage canvas');
    this.xs = fig.querySelector('canvas.xsheet');
    this.counter = fig.querySelector('.counter');
    const playBtn = fig.querySelector('.b-play');
    playBtn.onclick = () => {
      this.playing = !this.playing;
      playBtn.textContent = this.playing ? '❚❚' : '▶';
      playBtn.setAttribute('aria-label', this.playing ? 'pause' : 'play');
    };
    fig.querySelector('.b-prev').onclick = () => this.step(-1);
    fig.querySelector('.b-next').onclick = () => this.step(1);
    fig.querySelector('.b-speed').onchange = (e) => (this.speed = +e.target.value);
    fig.querySelector('.b-onion input').onchange = (e) => {
      this.onion = e.target.checked;
      this.render();
    };
    this.xs.addEventListener('pointerdown', (e) => {
      const r = this.xs.getBoundingClientRect();
      this.ensure();
      this.frame = Math.max(0, Math.min(this.len - 1, Math.floor(((e.clientX - r.left) / r.width) * this.len)));
      this.render();
    });
  }
  ensure() {
    if (this.perf) return;
    const b = this.clip.build();
    this.perf = b.perf;
    this.actor = new CatActor(b.perf, { env: { wind: b.wind } });
    this.len = Math.ceil(b.perf.end) + 8;
    this.drawStarts = [];
    let prev = null;
    for (let f = 0; f < this.len; f++) {
      const d = this.perf.drawTime(f);
      this.drawStarts.push(d !== prev);
      prev = d;
    }
    this.xsDirty = true;
  }
  step(d) {
    this.ensure();
    this.playing = false;
    const btn = this.el.querySelector('.b-play');
    btn.textContent = '▶';
    this.frame = (this.frame + d + this.len) % this.len;
    this.render();
  }
  tick(dt) {
    if (!this.playing) return;
    this.ensure();
    this.acc += dt * FPS * this.speed;
    const n = Math.floor(this.acc);
    if (n > 0) {
      this.acc -= n;
      this.frame = (this.frame + n) % this.len;
      this.render();
    }
  }
  cam(f, s, W, H) {
    const c = this.clip;
    const pose = this.perf.poseAt(f);
    const x = c.cam === 'follow' ? pose.hip[0] + 0.45 : c.camX ?? 0.6;
    return { x, y: c.camY ?? -1.05, s, cx: W / 2, cy: H * 0.56 };
  }
  render() {
    this.ensure();
    const resized = sizeCanvas(this.cv);
    const ctx = this.cv.getContext('2d');
    const W = this.cv.width, H = this.cv.height;
    const s = (H / 3.3) * (this.clip.zoom ?? 1);
    const f = this.frame;
    const cam = this.cam(f, s, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawStage(ctx, this.clip, cam, f, [0, 0, W, H], 'back');
    if (this.onion) {
      const d = this.perf.drawTime(f);
      let prev = d - 1;
      while (prev > 0 && this.perf.drawTime(prev) === d) prev--;
      const prevD = this.perf.drawTime(Math.max(0, prev));
      let next = f + 1;
      while (next < this.len - 1 && this.perf.drawTime(next) === d) next++;
      this.ghost(ctx, prevD, cam, '#2d6cb0', W, H);
      this.ghost(ctx, next, cam, '#c4473d', W, H);
    }
    const t = this.perf.drawTime(f);
    const env = { ground: this.perf.ground, facing: this.perf.poseAt(f).facing };
    drawGroundMarks(ctx, this.perf.events, t, cam, env);
    this.actor.draw(ctx, f, cam);
    drawStage(ctx, this.clip, cam, f, [0, 0, W, H], 'front', this.perf);
    drawEventFX(ctx, this.perf.events, t, cam, env);
    this.counter.textContent = `f ${String(f).padStart(3, '0')} · d ${String(this.perf.drawTime(f)).padStart(3, '0')}`;
    this.drawXsheet(resized);
  }
  ghost(ctx, f, cam, color, W, H) {
    if (!this.ghostCv || this.ghostCv.width !== W || this.ghostCv.height !== H) {
      this.ghostCv = document.createElement('canvas');
      this.ghostCv.width = W;
      this.ghostCv.height = H;
    }
    const g = this.ghostCv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    this.actor.draw(g, f, cam, { noSmear: true });
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.drawImage(this.ghostCv, 0, 0);
    ctx.restore();
  }
  drawXsheet() {
    const cv = this.xs;
    sizeCanvas(cv);
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const css = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, W, H);
    const n = this.len;
    const cw = W / n;
    ctx.fillStyle = css.getPropertyValue('--xs-hold').trim() || '#d6dde3';
    for (let i = 0; i < n; i++) {
      const x = i * cw;
      if (this.drawStarts[i]) {
        ctx.fillStyle = css.getPropertyValue('--xs-draw').trim() || '#7d8b97';
        ctx.fillRect(x, H * 0.25, Math.max(1, cw - 0.5), H * 0.5);
      } else {
        ctx.fillStyle = css.getPropertyValue('--xs-hold').trim() || '#d6dde3';
        ctx.fillRect(x, H * 0.42, Math.max(1, cw - 0.5), H * 0.16);
      }
    }
    // events: steps (dots), jumps/lands (red)
    for (const e of this.perf.events) {
      const x = e.t * cw;
      if (e.type === 'step') {
        ctx.fillStyle = css.getPropertyValue('--muted').trim();
        ctx.fillRect(x, H * 0.82, Math.max(1, cw * 0.8), H * 0.14);
      } else {
        ctx.fillStyle = css.getPropertyValue('--red').trim();
        ctx.fillRect(x, H * 0.0, Math.max(2, cw), H * 0.2);
      }
    }
    ctx.fillStyle = css.getPropertyValue('--accent').trim();
    ctx.fillRect(this.frame * cw, 0, Math.max(2, cw), H);
  }
}

export function main() {
  const sheet = document.getElementById('modelsheet');
  const grid = document.getElementById('clips');
  const cards = CLIPS.map((c) => new ClipCard(c, grid));
  const visible = new Set();
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      const card = cards.find((c) => c.el === e.target);
      if (e.isIntersecting) {
        visible.add(card);
        card.render();
      } else visible.delete(card);
    }
  }, { rootMargin: '120px' });
  cards.forEach((c) => io.observe(c.el));
  const drawSheet = () => drawModelSheet(sheet);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawSheet);
  drawSheet();
  let last = performance.now();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) cards.forEach((c) => { c.playing = false; c.el.querySelector('.b-play').textContent = '▶'; });
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const c of visible) c.tick(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      drawSheet();
      for (const c of visible) c.render();
    }, 150);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('select,input')) return;
    const c = [...visible][0];
    if (!c) return;
    if (e.key === 'ArrowRight') c.step(1);
    if (e.key === 'ArrowLeft') c.step(-1);
  });
}
main();
