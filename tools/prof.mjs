import { chromium } from 'playwright';
import { startServer } from './server.mjs';
const frames = process.argv.slice(2).map(Number);
const { srv, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/web/render/index.html?timeline=film&w=1280&h=720`);
await page.waitForFunction(() => window.__ready === true);
for (const f of frames) {
  const r = await page.evaluate((f) => {
    const times = [];
    for (let k = 0; k < 3; k++) { const a = performance.now(); window.renderFrame(f); times.push(performance.now() - a); }
    return times;
  }, f);
  console.log(f, r.map((x) => x.toFixed(0)).join(' '));
}
// profile one frame with per-layer timing
const detail = await page.evaluate((f) => {
  return window.__profile ? window.__profile(f) : null;
}, frames[0]);
console.log(detail);
await browser.close(); srv.close();
