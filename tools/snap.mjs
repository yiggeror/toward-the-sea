// Render dev pages to PNG with headless Chromium.
// usage: node tools/snap.mjs out1.png "query1" [out2.png "query2" ...]
// The query is appended to web/dev.html?..., e.g. "view=model&w=1600&h=900".
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: node tools/snap.mjs out.png "query" [...]');
  process.exit(1);
}
const { srv, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning' || process.env.SNAP_LOG) console.log('[page]', m.type(), m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
try {
  for (let i = 0; i + 1 < args.length; i += 2) {
    const out = args[i], q = args[i + 1];
    const url = `http://127.0.0.1:${port}/web/dev.html?${q}`;
    const t0 = Date.now();
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 120000 });
    const err = await page.evaluate(() => window.__error);
    if (err) {
      console.error('render error:', err);
      continue;
    }
    const data = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
    const info = await page.evaluate(() => window.__info || '');
    console.log(`wrote ${out} (${Date.now() - t0} ms) ${info}`);
  }
} finally {
  await browser.close();
  srv.close();
}
