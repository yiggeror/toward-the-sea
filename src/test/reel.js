// Phase-1 test reel: every clip played once, back to back, with captions.
import { CLIPS } from './clips.js';
import { drawStage } from './stage.js';
import { CatActor } from '../anim/actor.js';
import { drawEventFX, drawGroundMarks } from '../fx/events.js';
import { Timeline } from '../film/timeline.js';

export function buildReel() {
  const shots = CLIPS.map((clip) => {
    const shot = {
      name: clip.id,
      clip,
      build() {
        const b = clip.build();
        this.perf = b.perf;
        this.actor = new CatActor(b.perf, { env: { wind: b.wind } });
      },
      events() { return this.perf.events; },
      draw(ctx, f, W, H) {
        const perf = this.perf;
        const s = (H / 3.3) * (clip.zoom ?? 1);
        const pose = perf.poseAt(f);
        const x = clip.cam === 'follow' ? pose.hip[0] + 0.45 : clip.camX ?? 0.6;
        const cam = { x, y: clip.camY ?? -1.05, s, cx: W / 2, cy: H * 0.56 };
        drawStage(ctx, clip, cam, f, [0, 0, W, H], 'back');
        const t = perf.drawTime(f);
        const env = { ground: perf.ground, facing: pose.facing };
        drawGroundMarks(ctx, perf.events, t, cam, env);
        this.actor.draw(ctx, f, cam);
        drawStage(ctx, clip, cam, f, [0, 0, W, H], 'front', perf);
        drawEventFX(ctx, perf.events, t, cam, env);
        // caption
        const u = H / 1080;
        ctx.fillStyle = 'rgba(40,36,36,0.8)';
        ctx.font = `${44 * u}px "WenQuanYi Zen Hei", "Noto Sans SC", sans-serif`;
        ctx.textBaseline = 'alphabetic';
        const [zh, ...en] = clip.title.split(' ');
        ctx.fillText(zh, 56 * u, H - 64 * u);
        ctx.font = `${26 * u}px "WenQuanYi Zen Hei", "Noto Sans SC", sans-serif`;
        ctx.fillStyle = 'rgba(40,36,36,0.55)';
        ctx.fillText(en.join(' '), 56 * u + ctx.measureText(zh).width * 1.7 + 24 * u, H - 64 * u);
        ctx.font = `${22 * u}px monospace`;
        ctx.fillText(`f ${String(f).padStart(3, '0')}  d ${String(t).padStart(3, '0')}`, W - 250 * u, H - 64 * u);
      },
    };
    // length: natural clip length
    const tmp = clip.build();
    shot.dur = Math.ceil(tmp.perf.end) + 8;
    shot.fadeIn = 6;
    shot.fadeOut = 6;
    return shot;
  });
  return new Timeline(shots);
}
