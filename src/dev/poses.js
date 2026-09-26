// Candidate poses for the pose lab (web/dev.html?view=poselab). Each entry is
// a set of overrides on the default standing pose; x is 0 at the hip line.
const g = (x) => [x, 0];
const SIT = { pitch: 1.05, len: 0.82, archB: 0.34, archF: -0.08, neck: 0.42, neckLen: 1.0, hPitch: 0.02,
  hnM: 1, hfM: 1, fnC: 0, ffC: 0, tailA: -0.72, tailC: 2.3, tailK: 1.0 };
const sitAt = (hy, pitch, len, over = {}) => Object.assign({}, SIT, { hip: [-0.16, hy], pitch, len,
  hn: g(-0.16 + 0.42), hf: g(-0.16 + 0.34), fn: g(-0.16 + 0.62), ff: g(-0.16 + 0.52) }, over);
export const POSES = [
  { name: 'A  hip -0.32 p1.05 l0.82', pose: sitAt(-0.32, 1.05, 0.82) },
  { name: 'D  hip -0.44 p1.12 l0.74', pose: sitAt(-0.44, 1.12, 0.74, { hn: g(0.12), hf: g(0.05), fn: g(0.42), ff: g(0.33) }) },
  { name: 'E  hip -0.44 p1.12 l0.74 hnM0.6', pose: sitAt(-0.44, 1.12, 0.74, { hn: g(0.12), hf: g(0.05), fn: g(0.42), ff: g(0.33), hnM: 0.6, hfM: 0.6 }) },
  { name: 'F  hip -0.4 p1.0 l0.8', pose: sitAt(-0.4, 1.0, 0.8, { hn: g(0.18), hf: g(0.1), fn: g(0.5), ff: g(0.4) }) },
];

// portraits (drawPortrait params) for view=portraitlab
export const PORTRAITS = [
  { name: 'cross 0', p: { hYaw: -0.25, cross: 0, eyeWide: 0.3 } },
  { name: 'cross 1', p: { hYaw: -0.25, cross: 1, eyeWide: 0.3 } },
  { name: 'reflect sea', p: { hYaw: -0.2, reflect: 1, eyeWide: 0.35, sparkle: 0.3, mouth: 0.12, lookY: -0.3 } },
  { name: 'determined', p: { hYaw: -0.3, lid: 0.18, lidTilt: 0.5, mouth: 0, smile: 0.1, earRot: -0.15 } },
];
