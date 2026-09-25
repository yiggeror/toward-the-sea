// Bundle web pages with esbuild: web/<page>/index.html + src entry -> dist/<page>/
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './server.mjs';

const PAGES = {
  test: { entry: 'src/test/page.js', html: 'web/test/index.html' },
};
const which = process.argv.slice(2);
for (const [name, cfg] of Object.entries(PAGES)) {
  if (which.length && !which.includes(name)) continue;
  const out = path.join(ROOT, 'dist', name);
  fs.mkdirSync(out, { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, cfg.entry)],
    bundle: true,
    format: 'esm',
    minify: true,
    target: ['es2020'],
    outfile: path.join(out, 'bundle.js'),
    logLevel: 'warning',
  });
  fs.copyFileSync(path.join(ROOT, cfg.html), path.join(out, 'index.html'));
  const kb = (fs.statSync(path.join(out, 'bundle.js')).size / 1024).toFixed(1);
  console.log(`built dist/${name}/ (bundle ${kb} KB)`);
}
