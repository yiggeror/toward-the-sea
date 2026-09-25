// Screenshot a page served from the repo: node tools/shot.mjs <path> <out.png> [w] [h] [full] [scheme]
import { chromium } from 'playwright';
import { startServer } from './server.mjs';
const [p, out, w = '1280', h = '900', full = '1', scheme = 'light'] = process.argv.slice(2);
const { srv, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, colorScheme: scheme });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/${p}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: out, fullPage: full === '1' });
await browser.close();
srv.close();
console.log('wrote', out);
