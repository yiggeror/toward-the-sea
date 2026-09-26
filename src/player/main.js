// Web player: renders the film live with the same engine used for the MP4.
// The soundtrack is the master clock; frames are drawn at 24 fps from it.
import { buildFilm } from '../film/film.js';

const FPS = 24;
const CHAPTERS = { city: '城市', forest: '森林', storm: '风雨', night: '夜', waste: '荒原', snow: '雪原', cape: '海岬', sea: '大海', beach: '海边' };
const $ = (id) => document.getElementById(id);

function fmt(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function main() {
  const stage = $('stage');
  const cv = $('film');
  const ctx = cv.getContext('2d', { alpha: false });
  const audio = $('snd');
  const tl = await buildFilm();
  const total = tl.length / FPS;
  $('dur').textContent = fmt(total);
  $('bar').setAttribute('aria-valuemax', String(Math.round(total)));

  // chapters on the progress bar
  const bar = $('bar');
  const seen = new Set();
  for (const s of tl.shots) {
    if (seen.has(s.seq)) continue;
    seen.add(s.seq);
    const m = document.createElement('button');
    m.className = 'chap';
    m.type = 'button';
    m.style.left = `${(s.start / tl.length) * 100}%`;
    m.title = CHAPTERS[s.seq] || s.seq;
    m.setAttribute('aria-label', `跳到：${m.title}`);
    m.addEventListener('click', (e) => {
      e.stopPropagation();
      seek(s.start / FPS + 0.01);
    });
    bar.appendChild(m);
  }

  // ---- clock: audio when available, wall clock otherwise
  let audioOK = true;
  audio.addEventListener('error', () => (audioOK = false), true);
  let playing = false;
  let wallT0 = 0, wallBase = 0;
  const now = () => {
    if (audioOK && audio.readyState >= 1) return audio.currentTime;
    return playing ? wallBase + (performance.now() - wallT0) / 1000 : wallBase;
  };

  // ---- rendering with adaptive resolution
  let quality = matchMedia('(max-width: 700px)').matches ? 0.6 : 1;
  let ema = 16, lastFrame = -1, dirty = true;
  function size() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = Math.round(r.width * dpr * quality), h = Math.round((w * 9) / 16);
    if (w > 1920) (w = 1920), (h = 1080);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
      dirty = true;
    }
  }
  function draw(f) {
    const t0 = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cv.width, cv.height);
    tl.draw(ctx, f, cv.width, cv.height);
    const dt = performance.now() - t0;
    ema = ema * 0.9 + dt * 0.1;
    if (playing) {
      if (ema > 34 && quality > 0.45) {
        quality = Math.max(0.45, quality * 0.85);
        ema = 20;
        size();
      } else if (ema < 12 && quality < 1) {
        quality = Math.min(1, quality * 1.08);
        ema = 16;
        size();
      }
    }
  }
  function tick() {
    const t = now();
    if (playing && t >= total - 0.05) end();
    const f = Math.min(tl.length - 1, Math.floor(t * FPS));
    if (f !== lastFrame || dirty) {
      draw(f);
      lastFrame = f;
      dirty = false;
    }
    $('cur').textContent = fmt(t);
    $('fill').style.width = `${(t / total) * 100}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(t)));
    requestAnimationFrame(tick);
  }

  // ---- controls
  const setPlaying = (p) => {
    playing = p;
    document.body.classList.toggle('playing', p);
    $('play').setAttribute('aria-label', p ? '暂停' : '播放');
    $('play').textContent = p ? '❚❚' : '▶';
    poke();
  };
  async function play() {
    $('poster').hidden = true;
    if (now() >= total - 0.1) seek(0);
    if (audioOK) {
      try {
        await audio.play();
      } catch (e) {
        audioOK = false;
      }
    }
    wallT0 = performance.now();
    setPlaying(true);
  }
  function pause() {
    if (audioOK) audio.pause();
    wallBase = now();
    setPlaying(false);
  }
  function end() {
    pause();
    wallBase = total;
    $('replay').hidden = false;
  }
  function seek(t) {
    t = Math.max(0, Math.min(total - 0.05, t));
    if (audioOK && audio.readyState >= 1) audio.currentTime = t;
    wallBase = t;
    wallT0 = performance.now();
    $('replay').hidden = true;
    dirty = true;
  }
  $('play').addEventListener('click', (e) => {
    e.stopPropagation();
    playing ? pause() : play();
  });
  $('bigplay').addEventListener('click', () => {
    seek(0);
    play();
  });
  $('replay').addEventListener('click', () => {
    seek(0);
    play();
  });
  cv.addEventListener('click', () => (playing ? pause() : play()));
  const barSeek = (e) => {
    const r = bar.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * total);
  };
  let dragging = false;
  bar.addEventListener('pointerdown', (e) => {
    dragging = true;
    bar.setPointerCapture(e.pointerId);
    barSeek(e);
  });
  bar.addEventListener('pointermove', (e) => {
    if (dragging) barSeek(e);
    const r = bar.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * total;
    const f = Math.floor(t * FPS);
    const shot = tl.shots[tl.shotIndexAt(Math.max(0, Math.min(tl.length - 1, f)))];
    $('tip').textContent = `${CHAPTERS[shot.seq] || ''} · ${fmt(t)}`;
    $('tip').style.left = `${Math.max(0, Math.min(r.width, e.clientX - r.left))}px`;
  });
  bar.addEventListener('pointerup', () => (dragging = false));
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') seek(now() + 5);
    if (e.key === 'ArrowLeft') seek(now() - 5);
  });
  $('mute').addEventListener('click', (e) => {
    e.stopPropagation();
    audio.muted = !audio.muted;
    $('mute').textContent = audio.muted ? '🔇' : '🔊';
    $('mute').setAttribute('aria-label', audio.muted ? '取消静音' : '静音');
  });
  $('fs').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch (err) {
      /* fullscreen not available */
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input,button')) return;
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      playing ? pause() : play();
    }
    if (e.key === 'ArrowRight') seek(now() + 5);
    if (e.key === 'ArrowLeft') seek(now() - 5);
    if (e.key === 'f') $('fs').click();
    if (e.key === 'm') $('mute').click();
  });
  // auto-hide controls while playing
  let hideT;
  function poke() {
    document.body.classList.add('ui');
    clearTimeout(hideT);
    hideT = setTimeout(() => playing && document.body.classList.remove('ui'), 2600);
  }
  stage.addEventListener('pointermove', poke);
  stage.addEventListener('touchstart', poke, { passive: true });

  window.addEventListener('resize', () => {
    size();
    dirty = true;
  });
  document.addEventListener('fullscreenchange', () => setTimeout(() => {
    size();
    dirty = true;
  }, 50));
  size();
  // poster frame: the title at the edge of the city
  const titleShot = tl.shots.find((s) => s.name === '1.10');
  seek(titleShot ? (titleShot.start + 110) / FPS : 0);
  draw(Math.floor(now() * FPS));
  $('loading').hidden = true;
  $('poster').hidden = false;
  requestAnimationFrame(tick);
}

main().catch((e) => {
  console.error(e);
  const l = $('loading');
  l.hidden = false;
  l.textContent = '加载失败：' + e.message;
});
