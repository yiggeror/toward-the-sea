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

1. Test page `web/test.html` (loopable clips, frame step, onion skin).
2. Polish pass on every clip with contact sheets (sleep curl, pounce, gallop).
3. Self-check, publish test page, send to user with a list of shortcomings.

Done in this phase so far: walk/trot/gallop/stalk/wind/tired gaits; actions
jump, pounce, sit/stand, groom, stretch+yawn, curl-sleep+breathing, shake,
paw flick, snow first step, startle, turn-around; front/back sitting views;
12 expressions; ground constraints (torso never sinks, tail lies on ground).

## Known issues

- Far legs read a little pale; lighting/rim-light pass not written yet.
- Torso stripes are simple; thigh patch reads as a separate disc.

## Key decisions

- **Design v2 (user feedback, 2026-09-25):** the realistic iris eyes read as
  uncanny. Switched to the simplified sheet `reference/xiaohui-model-sheet-v2-simplified.png`:
  solid black dot eyes (closed = arcs/dashes), round wide head (smoothed convex
  hull of the head ellipsoids), big pink ears, plump pear body, soft cloud-like
  grey patches instead of tabby stripes, thin clean lines, whiskers only
  outside the face. Body chubbiness is done in the drawing layer (bigger head
  `headScale`, deeper torso outline, thicker limbs) so all gaits/actions stay valid.

- Everything is procedural JS + Canvas 2D; the same code renders the web player
  (real-time) and the MP4 (headless Chromium, frame by frame → ffmpeg).
- World units: H = head height; y-down; frames at 24 fps.
- Characters animate mostly on twos (per-segment timing), camera on ones.
