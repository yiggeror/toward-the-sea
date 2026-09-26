// Dump single film frames as PNG, exactly as the offline renderer draws them.
// usage: node tools/frame.mjs --frames 1000,2400 [--w 1920] [--h 1080] [--ss 2]
//          [--shots 1.4,2.5 --u 0.5] [--out build/frames] [--timeline film]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer, ROOT } from './server.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? argv[i + 1] : d;
};
const W = +arg('w', 1920), H = +arg('h', 1080), ss = +arg('ss', 1);
const out = path.resolve(arg('out', path.join(ROOT, 'build', 'frames')));
fs.mkdirSync(out, { recursive: true });
const { srv, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/web/render/index.html?timeline=${arg('timeline', 'film')}&w=${W}&h=${H}&ss=${ss}`);
await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 300000 });
const err = await page.evaluate(() => window.__error);
if (err) throw new Error(err);
let frames = (arg('frames', '') || '').split(',').filter(Boolean).map(Number);
if (arg('shots')) {
  const shots = await page.evaluate(() => window.__shots);
  const u = +arg('u', 0.5);
  for (const name of arg('shots').split(',')) {
    const s = shots.find((x) => x.name === name);
    if (s) frames.push(s.start + Math.round((s.dur - 1) * u));
  }
}
for (const f of frames) {
  const t0 = Date.now();
  const url = await page.evaluate((f) => {
    window.renderFrame(f);
    return document.getElementById('c').toDataURL('image/png');
  }, f);
  const file = path.join(out, `f${String(f).padStart(5, '0')}_${W}x${H}${ss > 1 ? `_ss${ss}` : ''}.png`);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${path.relative(ROOT, file)}  ${Date.now() - t0} ms`);
}
await browser.close();
srv.close();
