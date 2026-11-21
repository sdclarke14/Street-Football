# Street Football — portal submission kit

Everything needed to put Street Football on the game portals. The builds are
made by `python3 tools/package_portals.py` (or the **Portal builds** GitHub
Action, which attaches the three zips to the run as a download).

| File | Use it for |
|---|---|
| `street-football-crazygames.zip` | CrazyGames (CrazyGames SDK v3 inside) |
| `street-football-poki.zip` | Poki (Poki SDK v2 inside) |
| `street-football-itch.zip` | itch.io, Newgrounds, anywhere else (no SDK, no ads) |
| `images/cover-*.jpg` | Covers / thumbnails (1920x1080, 1280x720, 800x800, 800x1200, 630x500) |
| `images/shot-*.jpg` | Screenshots, 1920x1080, from the real game |

Each zip is about 1.7 MB, with `index.html` at the top level and relative
paths only.

## Listing text

**Title:** Street Football

**Short description (one line):**
Arcade 7-on-7 street football — draft your crew, call the play, juke, truck
and high-point your way to the end zone. No punts. No mercy.

**Description:**
Pick your field — cut grass at The Park, cracked concrete on The Block or the
loose dirt of The Dust Bowl — and draft a 7-man crew from 21 street players,
each with a real strength and a real flaw. Then call it like a playbook:
Four Verts, Slot Flood, Counter Left, Jet Sweep, or throw out the rules with
Street Ball.

On the field it's arcade football with weight to it. Spin, juke and truck
through tacklers, tap CATCH for a clean grab or hold to go up and high-point
it, and fill your style meter to unleash a GAMEBREAKER. Mystery boxes drop
turbo boosts, electric traps and oil slicks. Four downs to midfield, four more
to score, a 4-second pass clock and no kicking — go for 1 from the 5 or 2 from
the 10. Easy, Normal or Hard; your record is saved.

**Controls:**
- Keyboard: Arrows move · Shift turbo · Space snap · A S D F G throw to a
  receiver (Shift + letter for a lob) · Z spin · X juke · C truck · E catch
  (hold to high-point) / pick on defense · Q switch defender · V gamebreaker ·
  1 / 2 extra point · Esc or P pause · M mute
- Touch (phones and tablets, landscape): thumbstick on the left; turbo, spin,
  juke, truck and receiver buttons on the right — tap to throw a bullet, hold
  for a lob; one big CATCH button when the ball is coming to you.

**Genre / tags:** Sports, Football, American Football, Arcade, 3D, Multiplayer:
no (single-player vs CPU), Mobile: yes (landscape)

**Age:** everyone (cartoon tackles, no blood, no text chat, no data collected
beyond the portal SDK's own events)

## Step by step

### 1. CrazyGames (start here: it takes new games through Basic Launch)
1. Sign in at https://developer.crazygames.com/games and choose to submit a
   game.
2. Upload `street-football-crazygames.zip`. Use the portal's preview tool to
   play it once.
3. Fill in the description, controls and covers from this kit.
4. What happens next (from the CrazyGames docs): QA reviews it, then it runs
   in **Basic Launch** for 7–21 days (at least 7 days and 500 plays). Ads are
   switched off in Basic Launch even though the SDK is in. If it does well it
   moves to **Full Launch**, where ads and revenue share turn on. The build
   already does what Full Implementation asks for: gameplayStart/Stop, ads only
   through the SDK, the site's mute setting respected, and it still works with
   an ad blocker.

### 2. Poki
1. Sign in at https://app.poki.dev/signin/ (Poki for Developers).
2. Optional but recommended: drop the zip on https://inspector.poki.dev/ first.
3. Upload `street-football-poki.zip` as a web build; send the review request.
4. Poki moderates content, then playtests. They require **web exclusivity**
   (open web only — app stores and Steam are fine). That rules out also putting
   it on CrazyGames and itch.io while it's with Poki. **Decide CrazyGames or
   Poki before uploading to both.**
5. Read their terms first:
   https://app.poki.dev/2024.03.13_Terms_and_Conditions_Poki_for_Developers.pdf

### 3. itch.io (no review, live in minutes)
1. https://itch.io/game/new → Kind of project: **HTML**.
2. Upload `street-football-itch.zip` and tick **This file will be played in
   the browser**.
3. Embed options: **Embed in page**, viewport **1280 x 720**, tick
   **Mobile friendly** (orientation: landscape) and **Fullscreen button**.
4. Cover image: `images/cover-630x500.jpg`; screenshots: `images/shot-*.jpg`.

### 4. Newgrounds
Upload `street-football-itch.zip` as an HTML5 game at newgrounds.com (Portal →
submit). Their help pages couldn't be read from here, so check their size and
format rules on the upload form.

## Not verified (check on the form)
- Exact cover sizes each portal asks for. The kit covers the common ones.
- Whether Poki needs an application before the upload is accepted.
- Newgrounds rules (their help pages blocked automated reading).

## What's in the portal builds (for reviewers)
- No external requests except the portal's own SDK script.
- No external links, no purchases, no logins, no chat.
- Ads only through the SDK, at natural breaks: before a new game and after a
  touchdown (the portal decides whether one actually shows). Audio is muted
  and input ignored while an ad plays.
- Arrow keys, space and the mouse wheel never scroll the host page.
- localStorage is wrapped so incognito mode works.
- No debug handles in portal builds.
