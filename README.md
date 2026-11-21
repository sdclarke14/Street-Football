# Street Football — 7 on 7

Arcade street football in the browser. Three.js + Vite, no backend, runs on an
iPhone in landscape or on a desktop keyboard.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
```

## The rules it actually plays

Real 7-on-7, with street rules layered on top.

| Rule | Implementation |
|---|---|
| Field | 40 yards goal-to-goal, 10-yard end zones, 30 yards wide (1 unit = 1 yard) |
| Roster | 7 a side — QB, Center, RB, TE, X, Y, Z |
| Possession | Starts on your own 10 |
| First downs | Midfield is the line to gain; cross it and it's goal-to-go |
| Downs | 4 to reach midfield, 4 more to score |
| Pass clock | 4.0 seconds on pass plays — hold it longer and it's a sack |
| Rush | A counted rush, released by the defensive call (3s, or instantly on a blitz) |
| Scoring | TD = 6, then choose 1 point from the 5 or 2 from the 10 |
| Kicking | None. No punts, no field goals — turnover on downs |
| Game | 5:00 running clock, 7 seconds of runoff between snaps |

Street rules on top: designed runs with blockers, spin/juke/truck, mystery
boxes (toggleable), and a style meter that cashes in as a **Gamebreaker**.

## Playbook

Every play is data in `src/playbook.js`, and the chalkboard diagram on the
play-call card is drawn from that same data — so a diagram can never lie about
what the play does.

**Pass** — Four Verts, Slot Flood, All Curls, Slant & Drag, Screen + Wheel
**Run** — Dive, Sweep Right, Counter Left, QB Draw, Jet Sweep
**Trick** — Street Ball (everyone improvises, QB runs free), Run/Pass Option

**Defense** — Man Press, Cover 3 Zone, Double Blitz, Run Contain

Routes are stored as `[yards downfield, yards inward]` pairs so one definition
mirrors correctly on both sides of the formation and in both directions.

## Controls

**iPhone / touch** — floating thumbstick bottom-left; TURBO / SPIN / JUKE /
TRUCK bottom-right. While the QB has the ball, the action cluster is replaced
by five receiver chips: **tap for a bullet, hold for a lob.** On defense you
get SWITCH and PICK. The Gamebreaker button only appears when the meter fills.
When a pass is coming to you, one big CATCH button takes over: **tap for a
secure catch, hold to high-point it.** The ☰ button pauses.

**Keyboard** — Arrows move · Shift turbo · Space snap · `A S D F G` throw
(Shift + letter for a lob) · `Z` spin · `X` juke · `C` truck · `E` catch (tap
secure, hold past 0.26 s to high-point) / contest on defense · `Q` switch
defender · `V` gamebreaker · `1` / `2` extra point · `Esc` or `P` pause ·
`M` mute.

## Difficulty, pause and your record

- **EASY / NORMAL / HARD** on the title screen. It scales the CPU side only:
  how fast CPU players run, how often a CPU carrier breaks a tackle and how
  wild the CPU quarterback throws, plus what it costs you to break one.
- **Pause** (Esc, P or ☰) stops everything, the extra-point timer included,
  with RESUME / SOUND / QUIT GAME. Leaving the tab pauses too.
- **Your record** is saved in the browser (`localStorage`, `src/record.js`):
  wins, losses, ties, touchdowns, high score, best win and streak, split by
  difficulty, plus your last field, difficulty and toggles. The result screen
  calls out a new high score, biggest win or best streak.

## Animation: keyframed clips from Blender

The run cycles come from the model. The big moments are hand-keyed clips
authored in Blender on the game's own rig, so they bind by bone name with no
retargeting:

| Clip | Bones | Notes |
|---|---|---|
| Catch_Reach_Tuck | upper body | secure catch (`src/catchClip.js`) |
| throw | upper body | the ball leaves the hand on the release frame (0.17 s) |
| spin | upper body | ball tucked, off arm out, inside the 360 turn |
| jukeLeft / jukeRight | full body | plant and push off, mirrored |
| truck | upper body | shoulder down, off forearm driven forward |
| fallForward / fallBack / fallShoestring | full body | one per tackle type, ending in the down pose |

`tools/anim/author_clips.py` builds them: it imports the rig with Blender's
Python module (`pip install bpy`), turns each key pose into bone rotations,
lets Blender's Bezier easing run between keys, exports every frame at 30 fps
through the glTF exporter and reads the values back into `src/clips.js`.
A round-trip check against the rig's bind pose runs first. `src/clipPlayer.js`
plays them after the mixer and the pose overlay, with a fade, so the run cycle
keeps any bones a clip doesn't list.

## The model file

`public/models/hero.glb` (about 0.8 MB) is the rig, mesh, texture and all three
run clips in one file, packed by `python3 tools/pack_hero.py` from the three
source GLBs in `assets-src/models/` (about 21 MB, not deployed). Each source was
6.7 MB of the same PNG texture; the pack keeps one copy as a JPEG.

## Fields

Three venues, each with its own ground paint, lighting, skyline and traction:

- **The Park** — cut grass, mower stripes, crisp chalk, full bleachers (grip 1.00)
- **The Block** — cracked concrete, slab joints, graffiti, city backdrop (grip 1.06)
- **The Dust Bowl** — light brown dirt, dead-grass clumps, bald worn patches,
  sagging fence, half-empty rusted stands (grip 0.93 — it slides)

Ground textures are painted procedurally to canvas at runtime (`src/field.js`),
so there are no texture files to ship and each surface is tunable by numbers.
The crowd is two `InstancedMesh` draws (bodies + heads) with per-fan colour,
idle sway, and a cheer response that spikes on big plays and drives the
procedural crowd audio in `src/audio.js`.

## How the art was made (the actual pipeline)

The concept art (`public/art/`, plus the style options and unused key art in
`assets-src/art/`, which isn't deployed) was generated with **Higgsfield**, then used
the way a studio uses concept art — as a visual target, not as shipped assets.

1. **Generate concept art** (Higgsfield) — three field moods, a character
   lineup, a hero render, title key art.
2. **Read values off the art by hand** — the dirt field's browns, how patchy
   the dead grass is, the height of the bleachers, how warm the sun is.
3. **Author the real asset procedurally** to match those values. The in-engine
   dust bowl is canvas-painted dirt + clumps + bald patches tuned against the
   generated image. It tiles, it's 40 KB of code instead of 2 MB of PNG, and
   every value is adjustable.
4. **Ship the generated images only where a flat image genuinely belongs** —
   the title screen backdrop and the field-select thumbnails.

Generated stills can't be dropped in as game assets directly: they have baked
lighting and perspective, they don't tile, there's no normal/roughness map, and
nothing is UV-mapped to a model. That's why step 3 exists.

### Files

| File | Role |
|---|---|
| `src/main.js` | Game loop, rules, AI, play lifecycle |
| `src/playbook.js` | Plays, routes, formations, chalkboard diagrams |
| `src/field.js` | Three surfaces, fence, bleachers, instanced crowd, lighting |
| `src/touch.js` | iOS thumbstick + buttons, safe areas, gesture locking |
| `src/ui.js` | Title, play-call board, HUD, result screen |
| `src/audio.js` | Procedural crowd bed, roar, hits, whistle |
| `src/players.js` | Rig loading, kit recolour, throw-target icons |
| `src/clips.js` `src/clipPlayer.js` `src/catchClip.js` | Blender clips (generated) and the code that plays them |
| `src/anim.js` | Procedural poses (idle, brace, down, jump catch...) |
| `src/record.js` | Saved record and menu preferences |
| `tools/anim/author_clips.py` `tools/pack_hero.py` | Clip authoring in Blender; model packing |
| `src/ball.js` `src/effects.js` `src/powerups.js` `src/stamina.js` | Ball flight, hit flashes, mystery boxes, turbo tiers |
