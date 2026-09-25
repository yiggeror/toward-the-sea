// Xiaohui (小灰) model constants. All lengths are in H = head height units.
// Proportions/colours follow reference/xiaohui-model-sheet.png.

export const PAL = {
  line: '#4a4240', // warm dark grey line
  lineSoft: '#6d6562',
  white: '#f7efe7', // warm off-white fur
  whiteShade: '#e0d5cd',
  grey: '#9b938f', // main grey fur (sheet swatch #9c9490)
  greyLight: '#b4aca7',
  greyShade: '#857d7a',
  stripe: '#8b8480', // tabby stripes (subtle, like the sheet)
  stripeDark: '#6b6461',
  pink: '#e8bfb6', // inner ear / nose (sheet swatch #e7c2b9)
  pinkDeep: '#d9a39b',
  pinkPad: '#e2a9a1',
  iris: '#8e9c9d',
  irisLight: '#b9c5c3',
  irisDark: '#5b676b',
  pupil: '#2c3033',
  mouth: '#6b3f3c',
  tongue: '#e6a39c',
  whisker: '#8d8481',
};

// Skeleton (rest pose, standing, facing +x, y-down world).
export const M = {
  spineLen: 1.06, // hip joint -> shoulder joint chord
  // fore leg
  humerus: 0.44,
  forearm: 0.46,
  foreMeta: 0.14, // wrist -> paw contact
  // hind leg
  femur: 0.5,
  tibia: 0.52,
  hindMeta: 0.35, // hock -> paw ball
  // neck / head
  neckLen: 0.3,
  headOffset: [0.2, 0.2, 0], // head centre relative to neck end (head-local, y-up)
  // tail
  tailLen: 1.9,
  tailSegs: 14,
  // body widths used for 3/4 tricks
  farLegShift: [-0.05, -0.05], // far legs root offset (x,y) in local frame (depth cheat)
};

// Torso + neck outline control points.
// anchor: 'H' hip (a = distance along hip tangent, H units), 'M' mid (a = u fraction),
// 'S' shoulder (a = distance along shoulder tangent), 'N' head-local 3D point.
// v = offset along dorsal normal (H units, + = back/up).
export const TORSO = [
  ['H', -0.36, 0.2],
  ['H', -0.1, 0.36],
  ['M', 0.22, 0.35],
  ['M', 0.5, 0.3],
  ['M', 0.78, 0.3],
  ['S', -0.08, 0.35],
  ['S', 0.1, 0.33],
  ['N', -0.32, -0.12, 0], // nape
  ['N', 0.02, -0.37, 0], // throat
  ['S', 0.3, 0.02],
  ['S', 0.37, -0.25],
  ['S', 0.23, -0.52],
  ['S', -0.04, -0.63],
  ['M', 0.68, -0.58],
  ['M', 0.44, -0.47],
  ['M', 0.2, -0.46],
  ['H', 0.02, -0.45],
  ['H', -0.3, -0.35],
  ['H', -0.47, -0.08],
];

// Grey saddle lower boundary (v) sampled along u (spine fraction, extended).
// The saddle covers everything dorsal of this line.
export const SADDLE = [
  [-0.5, -0.36],
  [-0.22, -0.32],
  [-0.02, -0.24],
  [0.1, -0.3],
  [0.2, -0.18],
  [0.36, -0.2],
  [0.44, -0.27],
  [0.56, -0.15],
  [0.7, -0.12],
  [0.8, -0.02],
  [0.9, -0.1],
  [0.98, 0.05],
  [1.08, 0.18],
  [1.2, 0.3],
  [1.45, 0.4],
];
// Tabby stripes on the torso: [u at top, u at bottom, v top, v bottom, width]
export const STRIPES = [
  [-0.16, -0.26, 0.34, -0.1, 0.085],
  [0.08, -0.02, 0.33, -0.06, 0.06],
  [0.28, 0.2, 0.31, -0.1, 0.075],
  [0.5, 0.46, 0.3, -0.02, 0.055],
  [0.68, 0.6, 0.31, -0.06, 0.07],
  [0.88, 0.86, 0.35, 0.06, 0.05],
];

// Head model (head-local 3D, y-up, x forward, z = cat's left side).
export const HEAD = {
  cranium: { c: [0, 0, 0], r: [0.47, 0.42, 0.49] },
  cheeks: { c: [0.06, -0.19, 0.3], r: [0.34, 0.28, 0.31] },
  muzzle: { c: [0.36, -0.175, 0], r: [0.18, 0.14, 0.185] },
  chin: { c: [0.3, -0.29, 0], r: [0.12, 0.075, 0.11] },
  eye: { c: [0.385, 0.0, 0.225], n: [1, 0.04, 0.52], r: 0.148 },
  nose: [0.515, -0.105, 0],
  earBase: { f: [0.2, 0.36, 0.1], b: [-0.16, 0.24, 0.39], tip: [0.03, 0.84, 0.47], depth: 0.13 },
};
