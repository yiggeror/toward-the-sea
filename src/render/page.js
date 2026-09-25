// In-page renderer used by tools/render.mjs. Loads a timeline by name, then
// renders requested frames and streams raw RGBA to the Node side over a
// WebSocket (binary, no encoding step).
const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1920), H = +(q.get('h') || 1080);
const cv = document.getElementById('c');
cv.width = W;
cv.height = H;
const ctx = cv.getContext('2d', { willReadFrequently: true });
let timeline;
async function load() {
  const what = q.get('timeline') || 'reel';
  if (what === 'reel') {
    const m = await import('../test/reel.js');
    timeline = m.buildReel();
  } else {
    const m = await import('../film/film.js');
    timeline = await m.buildFilm();
  }
  window.__length = timeline.length;
  window.__events = timeline.events();
}
window.renderFrame = (f) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  timeline.draw(ctx, f, W, H);
};
window.streamFrames = async (port, from, to) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.binaryType = 'arraybuffer';
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let acked = 0;
  ws.onmessage = () => acked++;
  for (let f = from; f < to; f++) {
    window.renderFrame(f);
    const img = ctx.getImageData(0, 0, W, H);
    ws.send(img.data.buffer);
    // backpressure: at most 2 frames in flight
    while (f - from + 1 - acked > 2) await new Promise((r) => setTimeout(r, 1));
  }
  while (acked < to - from) await new Promise((r) => setTimeout(r, 2));
  ws.close();
  return to - from;
};
load().then(() => (window.__ready = true)).catch((e) => (window.__error = String(e && e.stack || e)));
