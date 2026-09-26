# 《去看海吧》There is a bigger world — production log

Hand-off document for the project, updated at every milestone so work can
resume in a new session.

## Status

**v1.0 — final film** (1920×1080, 24 fps, 11 826 frames = 8:12.75, every frame
drawn at 3840×2160 and filtered down). Mastered at CRF 16 (≈ 690 MB, kept out
of git), distributed at CRF 19 + AAC 256 kb/s (309 MB) in `video/` as four
keyframe-cut parts under 100 MB; a 720p copy (74 MB) was sent to the user in
three parts because attachments are limited to 30 MiB. Mix −18.1 LUFS
integrated, LRA 9.9 LU, −1.5 dBFS peak. Everything is reproducible from
source (README → Regenerate); a changed shot can be re-rendered alone and
spliced at its keyframes (done for 3.6).

## Phases

1. **Engine + character test** — core math/tracks/drawing, dev harness, the
   Xiaohui rig, gait engine and action library, test reel (`docs/phase1/`).
2. **Rough cut** — storyboard (`docs/storyboard.md`), film framework (shots,
   camera, depth layers, grading, the postcard prop with progressive wear, the
   shared sea-view composition), all 53 shots in 9 sequences with performances.
3. **Character redesign** — after feedback (below): black dot eyes, round
   body, new head geometry and markings.
4. **Expression + life** — 18 expressions, emotion marks, idle life.
5. **Lighting and atmosphere** — post pipeline and per-sequence art direction.
6. **Sound** — event-synced mix, synthesized foley, original score.
7. **Final render + docs.**

## User feedback and what was done

- *"The realistic eyes are uncanny, make the eyes black dots, the body round."*
  → simplified model sheet v2 (`reference/xiaohui-model-sheet-v2-simplified.png`):
  solid dot eyes with a highlight, closed eyes as arcs/dashes, plump pear body,
  soft cloud-like grey patches, thin clean lines.
- *"From the side there is a tuft under the chin, not cute; the portrait looks
  like a hamster."* → new head model (`src/cat/model.js` HEAD): taller cranium,
  smaller cheeks and jaw, a short muzzle set forward, big ears placed high and
  apart; markings projected from an enclosing shell so the white blaze and bib
  read as a cat's; the head outline is clipped where it meets the neck/body so
  no stroke makes a "chin tuft"; cheek fur tufts point down-back along the jaw;
  longer whiskers that fade on the far side.
- *"Too stiff, too few expressions, emotions not prominent."* → 18 expressions
  (`src/cat/views.js` EXPRESSIONS: happy, joy, curious, content, sulky, smile,
  surprised, squeeze, moved, angry, timid, cold, tired, sleepy, determined,
  wonder…) built from new face channels (lid tilt, sad brows via lid cut,
  squeeze chevrons, sparkle eyes, tears, blush, open smiling mouth, wobble
  mouth, puffed cheeks, whisker droop); emotion marks (`src/fx/emote.js`: !, ?,
  sparkles, notes, sweat drop, gloom lines, zzz, cold puff, shiver) placed at
  the story beats of every sequence; idle life on every cat (`src/anim/idle.js`:
  blinks incl. doubles, blink on big head turns, saccades, ear flicks, whisker
  twitches, breathing, weight shift and head drift when still, tail-tip wave).
- *"Environments not gorgeous or rich enough, no light effects or atmosphere."*
  → post pipeline (`src/film/post.js`: bloom from a quarter-res bright pass,
  radial light rays masked around the source, lens flare) and per-layer depth
  of field / aerial haze; neon signs, shop fronts, lamp cones, wet reflections,
  moonlit clouds and a dawn sky in the city; sun shafts, flecks, pollen and a
  stream with caustics in the forest; layered storm clouds, rain curtains and
  lightning; moonlight and stars at night; heat shimmer and dust in the
  wasteland; bokeh snow and sun halo in the snowfield; painterly clouds and a
  sunrise sea view; shallow water, foam and wet-sand reflections on the beach.
- *"The web player is optional, the video is required and must look good."*
  → effort went into the rendered film; the player still works from source.
- *"Real-time playback is not needed — don't lose image quality or detail for
  it."* → offline quality mode: `render.mjs --ss 2` draws every frame at 2×
  and filters it down (all half/quarter-size post buffers double with it);
  pixel-clamped widths, blurs and grain follow a per-frame `DPX` scale so the
  look is identical, only cleaner; reflections sample at twice the density;
  the bloom downsample is area-filtered (no flickering highlights); x264
  `aq-mode=3` keeps dark gradients clean. With render time no object, a
  detail pass followed: a meandering stream with banks, pebbles and
  reflections (2.4); rugged `crag()` rock for the chase outcrop, the ridge's
  sea-cliff edge and the 8.3 ledge; surf along the cape's waterline; and a
  rebuilt beach — its floor painted one pixel row at a time (seamless dry →
  wet → glossy → run-up sheet → shallows → sea), swell crests that roll in and
  break, lacy foam, shells, footprints the waves wash away, the cat mirrored
  in wet sand, a rocky headland with a proper lighthouse, and a true dolly-back
  for the last shot (the far coast keeps its size while the cat dwindles).
- Bugs found in the QA sweep and fixed: hind paws landing beside the stepping
  stones (legs stretched into the water, 2.4); the running cat cut off by the
  bottom of the frame (3.6); the cat trotting out to sea in 9.5 (locomote
  distances are absolute, jumps are facing-relative).

## Key decisions

- Everything is procedural JS + Canvas 2D; the same code draws the web player
  (real time) and the MP4 (headless Chromium frame by frame → raw RGBA over a
  WebSocket → ffmpeg). Rendering is deterministic.
- World units: H = head height; y-down; 24 fps. Characters animate mostly on
  twos (per-segment timing), cameras on ones.
- Depth model: each layer has a depth; screen scale p = D / (D + depth) with
  D = FOCAL / unit. Anything sampled behind the lens (D + depth ≤ 0) is clamped
  (shorelines, streams) — this caused white-outs before.
- Performance tracks: grouped keyframes; every new pose field needs a default
  (otherwise NaN). Overlays (idle life) read `perf.tracks` directly to avoid
  recursion through `poseAt`.
- Head: ellipsoid union → convex hull outline; markings from the `mark` shell;
  white base fill with grey painted outside the face/blaze masks (avoids grey
  fringes where white chin meets white chest).
- Glow passes run before characters (`post.before`) so the cat never blooms.
- Sound: all effects are placed from exported animation events
  (`tools/export_events.mjs` → `build/timeline.json`: 1 697 events: steps with
  surface/gait/strength, jumps, landings, splashes, shakes, paper, thunder,
  waves, emotion marks, ambience cues). Beds are levelled (bursts > +4 dB over
  the median pulled back) and set to loudness targets per layer; spiky beds
  (drips) are peak-normalised; one-shots are peak-normalised with levels in
  dBFS. Music ducks the beds by up to 3 dB. Per-shot trims let the wind die
  after the postcard is lost so the first sound of the sea can be heard.
- Score (`tools/music.py`): D major theme (64 bpm) on additive piano with pad
  and bell; cues: discovery motif (postcard found, 1.4), dawn (1.10), night pad
  (4.1), snow (6.1), loss in B minor (7.6), full theme at the sea (8.3), beach
  (9.3), reprise and final D add9 chord (9.5 → end card).

## Sound notes

Short story effects (the splash in the face, the can, gusts, shakes, the card
snatch) are levelled by their loudest 400 ms rather than their peak: peak
normalisation had left them 10–15 dB under the beds. The effects and foley
buses have their own limiters and the beds dip up to 4 dB under them, so the
master limiter only touches the thunder clap.

## Performance

1080p frame cost in headless Chromium (software raster): median ≈ 127 ms,
p90 ≈ 163 ms (`node tools/bench.mjs 1920 1080`); about 2.4× that when
supersampled. With 3 parallel pages and x264 `slow` on 4 cores the full film
renders at 6–11 fps plain, ≈ 3.5 fps at `--ss 2` (≈ 60 min).

## Known limitations / ideas for a next pass

- The cat is drawn in four views (side, front, back, portrait); true 3/4 body
  turns are cheated with cuts.
- Some background vegetation (distant trees) is still a stamped shape.
- The night insects are a cicada recording (the only CC0 field recording that
  fit); a single close cricket is layered on top.
- The web player loads the title fonts from `web/fonts/` and Google Fonts; it
  is not bundled.
