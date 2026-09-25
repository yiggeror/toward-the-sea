// Phase-1 test clips: each builds a performance + stage props.
import { defaultPose } from '../cat/rig.js';
import { Perf } from '../anim/perf.js';
import { locomote } from '../anim/gaits.js';
import * as A from '../anim/actions.js';

function mk(opts = {}) {
  const p = Object.assign(defaultPose(), opts.pose || {});
  const perf = new Perf(p, { twos: 2, ground: opts.ground });
  perf.t = opts.lead ?? 8;
  return perf;
}
const flat = () => 0;

export const CLIPS = [
  { id: 'walk', title: '走 Walk', cam: 'follow', build() {
    const perf = mk(); locomote(perf, { gait: 'walk', dist: 9 }); A.wait(perf, 16); return { perf };
  } },
  { id: 'trot', title: '小跑 Trot', cam: 'follow', build() {
    const perf = mk(); locomote(perf, { gait: 'trot', dist: 12 }); A.wait(perf, 14); return { perf };
  } },
  { id: 'run', title: '奔跑 Run (gallop, on ones)', cam: 'follow', build() {
    const perf = mk(); perf.setTiming(0, 1); locomote(perf, { gait: 'run', dist: 22, accel: 16, decel: 14 }); A.wait(perf, 14); return { perf };
  } },
  { id: 'stalk', title: '潜行 Stalk', cam: 'follow', build() {
    const perf = mk(); locomote(perf, { gait: 'stalk', dist: 4.5 }); A.wait(perf, 20); return { perf };
  } },
  { id: 'jump', title: '跳跃 Jump (onto a ledge)', cam: 'static', camX: 2.9, zoom: 0.6, camY: -1.55, props: [{ type: 'box', x0: 3.6, x1: 8, h: 1.1 }], build() {
    const g = (x) => (x > 3.6 && x < 8 ? -1.1 : 0);
    const perf = mk({ ground: g }); A.wait(perf, 6); A.jump(perf, { dx: 4.1, dy: -1.1, h: 0.45, wiggle: 1, flight: 11 }); A.wait(perf, 20); return { perf };
  } },
  { id: 'pounce', title: '扑 Pounce (play)', cam: 'static', camX: 2.2, zoom: 0.72, camY: -1.25, build() {
    const perf = mk(); A.wait(perf, 4); A.pounce(perf, { dx: 2.6, wiggle: 3 }); A.wait(perf, 16); return { perf };
  } },
  { id: 'sit', title: '坐下 Sit down / stand', cam: 'static', camX: 0.6, zoom: 0.85, camY: -1.35, build() {
    const perf = mk(); A.wait(perf, 6); A.sit(perf); A.wait(perf, 10);
    A.look(perf, perf.t, 8, { yaw: 1.2, lookX: -0.2 }); perf.t += 20; A.blink(perf, perf.t); perf.t += 12;
    A.look(perf, perf.t, 8, { yaw: 0.35, lookX: 0.1 }); perf.t += 14; A.standUp(perf); A.wait(perf, 10); return { perf };
  } },
  { id: 'groom', title: '舔毛 Groom', cam: 'static', camX: 0.5, zoom: 0.85, camY: -1.35, build() {
    const perf = mk(); A.wait(perf, 4); A.sit(perf); A.wait(perf, 6); A.groom(perf, { licks: 4 }); A.wait(perf, 10); return { perf };
  } },
  { id: 'stretch', title: '伸懒腰 Stretch + yawn', cam: 'static', camX: 1.3, zoom: 0.85, build() {
    const perf = mk(); A.wait(perf, 6); A.stretch(perf); A.wait(perf, 12); return { perf };
  } },
  { id: 'sleep', title: '睡觉 Curl up & sleep', cam: 'static', camX: 0.8, build() {
    const perf = mk(); A.wait(perf, 6); A.sit(perf); A.wait(perf, 4); A.curlSleep(perf);
    const t0 = perf.t; A.wait(perf, 150); perf.overlays.push(A.breathing(t0, perf.t, 64));
    A.earTwitch(perf, t0 + 60, 'L', 0.7); A.earTwitch(perf, t0 + 110, 'R', 0.5); return { perf };
  } },
  { id: 'shake', title: '甩水 Shake off water', cam: 'static', camX: 0.6, build() {
    const perf = mk(); A.wait(perf, 6); A.pawFlick(perf, { n: 4 }); A.wait(perf, 6); A.shake(perf); A.wait(perf, 12); return { perf };
  } },
  { id: 'snow', title: '踩雪 First step into snow', cam: 'static', camX: 1.0, snow: true, build() {
    const perf = mk(); A.wait(perf, 6); A.snowFirstStep(perf, { depth: 0.16 }); A.wait(perf, 12); return { perf };
  } },
  { id: 'wind', title: '顶风 Walking into wind', cam: 'follow', wind: -1.2, build() {
    const perf = mk(); locomote(perf, { gait: 'wind', dist: 3.2 }); A.wait(perf, 12); return { perf, wind: (t) => [-1.2 - 0.4 * Math.sin(t * 0.13), 0.05] };
  } },
  { id: 'startle', title: '惊吓 Startled by thunder', cam: 'static', camX: 0.6, zoom: 0.8, camY: -1.45, build() {
    const perf = mk(); A.wait(perf, 12); A.startle(perf); A.wait(perf, 16); return { perf };
  } },
  { id: 'turn', title: '转身 Turn around', cam: 'static', camX: 0.6, build() {
    const perf = mk(); A.wait(perf, 8); A.turnAround(perf); A.wait(perf, 12); A.turnAround(perf); A.wait(perf, 8); return { perf };
  } },
];
export const clipById = (id) => CLIPS.find((c) => c.id === id);
