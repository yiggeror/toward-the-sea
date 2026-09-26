// Xiaohui (小灰) model constants. All lengths are in H = head height units.
// Proportions/colours follow reference/xiaohui-model-sheet.png.

export const PAL = {
  line: '#3a3333', // clean dark line (simplified sheet)
  lineSoft: '#6d6562',
  white: '#f7efe7', // warm off-white fur
  whiteShade: '#e0d5cd',
  grey: '#9b938f', // main grey fur (sheet swatch #9c9490)
  greyLight: '#b4aca7',
  greyShade: '#857d7a',
  stripe: '#8a8380', // darker grey patches (soft)
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
  whisker: '#3f3838',
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
  headScale: 1.2, // simplified design: bigger head relative to the body
  // tail
  tailLen: 1.75,
  tailSegs: 14,
  // body widths used for 3/4 tricks
  farLegShift: [-0.05, -0.05], // far legs root offset (x,y) in local frame (depth cheat)
};

// Torso + neck outline control points.
// anchor: 'H' hip (a = distance along hip tangent, H units), 'M' mid (a = u fraction),
// 'S' shoulder (a = distance along shoulder tangent), 'N' head-local 3D point.
// v = offset along dorsal normal (H units, + = back/up).
export const TORSO = [
  ['H', -0.4, 0.24],
  ['H', -0.12, 0.43],
  ['M', 0.22, 0.43],
  ['M', 0.5, 0.39],
  ['M', 0.78, 0.39],
  ['S', -0.22, 0.4],
  ['W', -0.02, 0.4, 'f'], // far scapula
  ['W', 0.1, 0.38, 'n'], // near scapula
  ['N', -0.3, -0.12, 0], // nape
  ['N', 0.0, -0.34, 0], // throat
  ['S', 0.36, 0.0],
  ['S', 0.43, -0.28],
  ['S', 0.29, -0.58],
  ['S', -0.02, -0.68],
  ['M', 0.66, -0.64],
  ['M', 0.42, -0.6],
  ['M', 0.18, -0.58],
  ['H', 0.0, -0.56],
  ['H', -0.32, -0.44],
  ['H', -0.53, -0.1],
];

// Grey saddle lower boundary (v) sampled along u (spine fraction, extended).
// The saddle covers everything dorsal of this line.
export const SADDLE = [
  [-0.5, -0.42],
  [-0.24, -0.36],
  [-0.06, -0.26],
  [0.08, -0.34],
  [0.22, -0.22],
  [0.36, -0.26],
  [0.5, -0.18],
  [0.62, -0.24],
  [0.74, -0.1],
  [0.86, -0.16],
  [0.96, 0.02],
  [1.08, 0.18],
  [1.2, 0.3],
  [1.45, 0.4],
];
// soft darker patches inside the grey (simplified sheet): [u, v, rx(u units), ry(H)]
export const PATCHES = [
  [0.02, 0.2, 0.2, 0.18],
  [0.4, 0.26, 0.16, 0.14],
  [0.74, 0.22, 0.14, 0.15],
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
// A broad round cranium, cheeks that are widest a little below the eyes, a
// soft jaw that rounds the bottom of the face, and a small muzzle. Markings are
// projected from the `mark` shell (it encloses every part, so a boundary drawn
// on it always reaches the silhouette).
export const HEAD = {
  cranium: { c: [0, 0.03, 0], r: [0.46, 0.43, 0.5] },
  cheeks: { c: [0.07, -0.1, 0.27], r: [0.33, 0.3, 0.31] },
  jaw: { c: [0.15, -0.25, 0], r: [0.24, 0.19, 0.25] },
  muzzle: { c: [0.33, -0.13, 0], r: [0.165, 0.12, 0.185] },
  mark: { c: [0.03, -0.03, 0], r: [0.5, 0.49, 0.6] },
  eye: { c: [0.37, -0.03, 0.27], n: [1, -0.08, 0.68], r: 0.098 },
  nose: [0.49, -0.1, 0],
  earBase: { f: [0.1, 0.42, 0.12], b: [-0.22, 0.14, 0.5], tip: [-0.03, 0.75, 0.51], depth: 0.13 },
};
