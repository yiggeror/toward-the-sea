// Offline, frame-by-frame renderer.
// Each frame is drawn by the same engine as the web player inside headless
// Chromium, read back as raw RGBA, streamed over a local WebSocket and piped
// into ffmpeg (libx264). Several pages render disjoint frame ranges in
// parallel; the segments are then concatenated without re-encoding.
//
// usage: node tools/render.mjs --timeline film|reel --w 1920 --h 1080 \
//          --out build/film_1080p.mp4 [--jobs 3] [--crf 17] [--preset slow]
//          [--from 0] [--to N] [--audio build/mix.wav] [--ss 2]
//
// --ss draws every frame at ss× resolution and filters it down (supersampling).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { chromium } from 'playwright';
import { startServer, ROOT } from './server.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? argv[i + 1] : d;
};
const W = +arg('w', 1920), H = +arg('h', 1080);
const timeline = arg('timeline', 'film');
const out = path.resolve(arg('out', `build/${timeline}_${H}p.mp4`));
const jobs = +arg('jobs', 3);
const crf = arg('crf', '17');
const preset = arg('preset', 'slow');
const audio = arg('audio', null);
const ss = +arg('ss', 1);
const x264 = arg('x264', 'aq-mode=3:aq-strength=0.9');
const tmpDir = path.join(path.dirname(out), `.segments_${path.basename(out, '.mp4')}`);
fs.mkdirSync(tmpDir, { recursive: true });

const { srv, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--disable-gpu', '--force-color-profile=srgb', '--js-flags=--max-old-space-size=4096'] });

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/web/render/index.html?timeline=${timeline}&w=${W}&h=${H}&ss=${ss}`);
  await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 300000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  return page;
}

const probe = await openPage();
const length = await probe.evaluate(() => window.__length);
const events = await probe.evaluate(() => window.__events);
await probe.close();
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(path.dirname(out), `events_${timeline}.json`), JSON.stringify({ fps: 24, length, events }, null, 0));
const from = +arg('from', 0), to = Math.min(+arg('to', length), length);
console.log(`timeline "${timeline}": ${length} frames (${(length / 24).toFixed(1)} s); rendering ${from}..${to} at ${W}x${H}${ss > 1 ? ` (supersampled ${ss}x)` : ''} with ${jobs} jobs`);

const total = to - from;
const per = Math.ceil(total / jobs);
let done = 0;
const t0 = Date.now();
const segs = [];

async function runJob(k) {
  const a = from + k * per, b = Math.min(to, a + per);
  if (a >= b) return;
  const seg = path.join(tmpDir, `seg_${String(k).padStart(2, '0')}.mp4`);
  segs[k] = seg;
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', '24', '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', preset, '-crf', crf, '-tune', 'animation', '-x264-params', x264,
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-r', '24', seg,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((r) => ff.on('close', r));
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', maxPayload: W * H * 4 + 1024 });
  await new Promise((r) => wss.on('listening', r));
  const wport = wss.address().port;
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const ok = ff.stdin.write(data);
      const ack = () => {
        ws.send('1');
        done++;
        if (done % 48 === 0 || done === total) {
          const el = (Date.now() - t0) / 1000;
          process.stdout.write(`\r  ${done}/${total} frames  ${(done / el).toFixed(1)} fps  eta ${((total - done) / (done / el)).toFixed(0)} s   `);
        }
      };
      if (ok) ack();
      else ff.stdin.once('drain', ack);
    });
  });
  const page = await openPage();
  await page.evaluate(([p, x, y]) => window.streamFrames(p, x, y), [wport, a, b]);
  await page.close();
  wss.close();
  ff.stdin.end();
  await ffDone;
}

await Promise.all([...Array(jobs).keys()].map(runJob));
console.log(`\nrendered ${total} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await browser.close();
srv.close();

// concatenate segments (and mux audio if given)
const list = path.join(tmpDir, 'list.txt');
fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
if (audio) args.push('-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-shortest');
args.push('-c:v', 'copy', '-movflags', '+faststart', out);
await new Promise((r, j) => spawn('ffmpeg', args, { stdio: 'inherit' }).on('close', (c) => (c === 0 ? r() : j(new Error('concat failed')))));
for (const s of segs.filter(Boolean)) fs.unlinkSync(s);
fs.unlinkSync(list);
fs.rmdirSync(tmpDir);
const mb = (fs.statSync(out).size / 1e6).toFixed(1);
console.log(`wrote ${path.relative(ROOT, out)} (${mb} MB)`);
