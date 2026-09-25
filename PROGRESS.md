# 《去看海吧》There is a bigger world — production log

This file is the hand-off document for the project. It is updated at every
milestone so work can resume in a new session.

## Current phase

**Phase 1 — character & action test** (in progress)

## Done

- Engine core: `src/core/` (math/easing/noise, keyframe tracks with holds and
  spline paths, canvas helpers: smooth curves, tapered brush strokes,
  stroke-then-fill outlines).
- Dev harness: `tools/server.mjs` (static server), `tools/snap.mjs`
  (headless Chromium → PNG of `web/dev.html?view=...`), contact-sheet view
  `view=sheet&gait=...&a=<first frame>&n=<count>`.
- Xiaohui rig (`src/cat/`):
  - body silhouette generated from a bendable spine (cubic bezier hip→shoulder,
    arch at both ends, stretch with volume preservation); outline points are
    anchored to hip/mid/shoulder frames and to the head (neck).
  - digitigrade legs: fore = humerus/forearm IK + paw (curl folds the wrist);
    hind = pantograph IK (femur ∥ metatarsus) with a "flat metatarsus" mode for
    sitting; far legs darker and offset (depth cheat).
  - head = small 3D model (ellipsoid union + cone ears) projected
    orthographically: yaw/pitch/roll turn continuously profile→3/4→front→back;
    markings (white muzzle/blaze, forehead M, cheek stripes) live on the head
    sphere and are limb-clamped; eyes are drawn in their own foreshortened frame
    (iris gradient, slit↔round pupil, highlights, lids for blink/angry/happy).
  - tail = 14-segment chain with tabby rings and dark tip.
- Animation (`src/anim/`):
  - `Perf`: grouped keyframe tracks (body, neck, head, each leg, tail, ears,
    eyes, mouth, misc), per-segment drawing timing (ones/twos/threes),
    events (steps etc.) for FX and sound sync.
  - `locomote()`: gait tables (walk, trot, run/gallop, stalk, wind, tired) +
    a stepping controller (nominal phase lifts, early lift when over-extended,
    girdle constraint, settle steps). Paws are planted in world space → no
    sliding; phase advances with distance.
  - secondary motion is *stateless*: damped-spring responses computed by
    convolving the target history (tail, ears, whiskers) → seekable/deterministic.

## Next

1. Remaining gaits verified by contact sheets: trot, run (gallop), stalk.
2. Actions (key-pose sequences): jump, pounce, sit down, groom, stretch, sleep
   curl, shake-off (water), snow step, wind walk, startle.
3. Front / back sitting views, expressions sheet (9 expressions).
4. Test page `web/test.html` (loopable clips, frame step, onion skin).
5. Self-check contact sheets, then send to user.

## Known issues

- Far legs read a little pale; lighting/rim-light pass not written yet.
- Torso stripes are simple; thigh patch reads as a separate disc.

## Key decisions

- Everything is procedural JS + Canvas 2D; the same code renders the web player
  (real-time) and the MP4 (headless Chromium, frame by frame → ffmpeg).
- World units: H = head height; y-down; frames at 24 fps.
- Characters animate mostly on twos (per-segment timing), camera on ones.
