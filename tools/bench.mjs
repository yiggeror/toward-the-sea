// Measure per-frame draw time of the film in headless Chromium.
import { chromium } from 'playwright';
import { startServer } from './server.mjs';
const [W = '1280', H = '720', step = '37'] = process.argv.slice(2);
const { srv, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/web/render/index.html?timeline=film&w=${W}&h=${H}`);
const t0 = Date.now();
await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 300000 });
console.log('build ms', Date.now() - t0, await page.evaluate(() => window.__error || ''));
const res = await page.evaluate((step) => {
  const out = [];
  const n = window.__length;
  for (let f = 0; f < n; f += step) window.renderFrame(f); // warm caches
  for (let f = 0; f < n; f += step) {
    const a = performance.now();
    window.renderFrame(f);
    out.push([f, performance.now() - a]);
  }
  return out;
}, +step);
const ms = res.map((r) => r[1]).sort((a, b) => a - b);
console.log(`frames ${res.length}  median ${ms[ms.length >> 1].toFixed(1)} ms  p90 ${ms[Math.floor(ms.length * 0.9)].toFixed(1)}  max ${ms[ms.length - 1].toFixed(1)}`);
const worst = res.sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('worst', worst.map(([f, t]) => `${f}:${t.toFixed(0)}`).join(' '));
await browser.close();
srv.close();
