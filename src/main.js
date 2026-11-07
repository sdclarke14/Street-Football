import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { StaminaMeter, TIERS } from './stamina.js';
import { FIELD, buildField, buildLighting, createDriveLines } from './field.js';
import { createBall, holdBall, throwBall, updateBall } from './ball.js';
import { loadPlayerAssets, createPlayer, updatePlayerClip, aimBone } from './players.js';
import { createPowerups } from './powerups.js';
import { createFX } from './effects.js';

// Street football — arcade 5v5, down-and-distance, mystery boxes.
// Blue (user, green kit) attacks +X; red (red/white kit) attacks -X.
// Offense: QB (0), receivers A/S/D (1-3), Center (4). Defense: rusher (0),
// corners (1-3), spy (4). Carrier moves: Z spin, X juke, Shift breaks
// tackles; defense contests passes with E.

const TEAM = { BLUE: 0, RED: 1 };
const TEAM_NAMES = { [TEAM.BLUE]: 'BLUE', [TEAM.RED]: 'RED' };
const TEAM_COLORS = { [TEAM.BLUE]: 0x3b82f6, [TEAM.RED]: 0xef4444 };
const ATTACK_DIR = { [TEAM.BLUE]: 1, [TEAM.RED]: -1 };

const ROSTER_SIZE = 5;
const QB = 0;
const CENTER = 4;
const RECEIVER_SLOTS = [1, 2, 3];
const THROW_KEYS = { a: 1, s: 2, d: 3, f: 4 };
const ICON_LETTERS = { 1: 'A', 2: 'S', 3: 'D', 4: 'F' };

const DRIVE_START = FIELD.halfLength - 6;
const MARKER_1_X = 0;
const DOWNS_PER_SET = 4;
const TD_POINTS = 7;
const CENTER_RELEASES_ON_DOWN = (down) => down <= 2;

const WALK_SPEED = 4.2;
const SPRINT_SPEED = { [TIERS.TURBO]: 8, [TIERS.REGULAR]: 6.3, [TIERS.GASSED]: 4.8 };
const WR_SPEED = 6.2;
const DEF_SPEED = 5.9;
const BLOCKER_SPEED = 5.4;
const TURN_RATE = 12;
const TACKLE_DIST = 0.85;
const CATCH_DIST = 1.2;
const THROW_SPEED = 16;
const BLOCK_RADIUS = 0.95;

const SNAP_FLIGHT_TIME = 0.22;
const CENTER_RELEASE_AT = 1.25;
const AI_SNAP_DELAY = 1.3;
// Pass-rush delay rule: 3s protection on 1st/2nd/4th, 2s on 3rd.
const rushDelay = () => (drive.down === 3 ? 2 : 3);
const QB_MIN_HOLD = 1.1;
const QB_OPEN_DIST = 2.8;
const QB_SCRAMBLE_AT = 2.9;
const DEAD_PAUSE = 1.6;

// Powerups
const TURBO_DURATION = 4;
const STUN_DURATION = 1.5;
const SLIP_DURATION = 1.0;
const PICKUP_LABELS = {
  turbo: 'TURBO BOOST!',
  trap: 'ELECTRIC TRAP DROPPED!',
  oil: 'OIL SLICK DROPPED!',
};

// Tackle breaking / moves
const TACKLE_WINDOW = 0.3;
const TACKLE_DRAG = 0.35; // carrier speed multiplier while being grabbed
const TACKLE_BREAK_COST = 40; // stamina burned each time Shift busts a tackle
const SPIN_DURATION = 0.45;
const JUKE_DURATION = 0.28;
const MOVE_COOLDOWN = 1.5;
const MOVE_SELL_RADIUS = 3.0;
const BURST_DURATION = 0.32;

// Interception
const INT_RADIUS = 1.6;
const INT_CHANCE = 0.55;
const INT_LOCKOUT = 0.35;

const CAM_BACK = 8.5;
const CAM_HEIGHT = 6.2;
const CAM_SIDE = 2.5;
const CAM_LOOKAHEAD = 6;
const CAM_ROLL = 0.015;
const CAM_SMOOTHING = 4;

// Scene / renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.querySelector('#app').appendChild(renderer.domElement);

buildLighting(scene);
// Cool rim/back light for edge pop on the cel-shaded players (no shadows).
const rimLight = new THREE.DirectionalLight(0x9fd8ff, 0.5);
rimLight.position.set(-25, 16, 28);
scene.add(rimLight);

buildField(scene);
const { losLine, markerLine } = createDriveLines(scene);
const ball = createBall(scene);
const powerups = createPowerups(scene);
const fx = createFX(scene, camera);

// Subtle bloom so the acid-yellow pickups/flashes pop; high threshold keeps
// the rest of the golden-hour scene clean.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.3, 0.85
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// HUD
const stamina = new StaminaMeter({ regularBelow: 60, gassedBelow: 25 });
const staminaFill = document.querySelector('#stamina-fill');
const staminaLabel = document.querySelector('#stamina-label');
const scoreEl = document.querySelector('#score');
const downDistEl = document.querySelector('#downdist');
const bannerEl = document.querySelector('#banner');
const controlsEl = document.querySelector('#controls');
const targetsEl = document.querySelector('#targets');
const pickupEl = document.querySelector('#pickup');
const targetChips = {
  1: document.querySelector('#chip-a'),
  2: document.querySelector('#chip-s'),
  3: document.querySelector('#chip-d'),
  4: document.querySelector('#chip-f'),
};
const TIER_COLORS = {
  [TIERS.TURBO]: '#22c55e',
  [TIERS.REGULAR]: '#eab308',
  [TIERS.GASSED]: '#ef4444',
};
const DOWN_NAMES = ['1ST', '2ND', '3RD', '4TH'];

// Game state
const players = [];
let controlled = null;
const score = { [TEAM.BLUE]: 0, [TEAM.RED]: 0 };
const drive = { offense: TEAM.BLUE, los: -DRIVE_START, markerIdx: 0, down: 1 };
let phase = 'loading';
let deadTimer = 0;
let lineupTimer = 0;
let hitStopT = 0;
let pickupMsgT = 0;
let intLockout = 0;
let bannerT = 0; // transient banner during live play (e.g. INTERCEPTED!)
const play = {
  t: 0,
  routes: new Map(),
  assignments: new Map(),
  thrown: false,
  qbScrambled: false,
  snapping: false,
  centerReleased: false,
  tackle: null, // { defender, t, sprintHeld }
  intReturn: null, // team currently returning an interception, or null
};

const offAttack = () => ATTACK_DIR[drive.offense];
// Direction the action is heading: normally the offense's attack, but during
// an interception return it flips to the returning team's. Drives both the
// camera and the arrow-key frame.
const viewAttack = () =>
  play.intReturn !== null ? ATTACK_DIR[play.intReturn] : offAttack();
const markerX = () =>
  drive.markerIdx === 0 ? MARKER_1_X : offAttack() * FIELD.halfLength;
const teamPlayers = (team) => players.filter((p) => p.team === team);
const defenseTeam = () => (drive.offense === TEAM.BLUE ? TEAM.RED : TEAM.BLUE);
const offensePlayer = (slot) =>
  players.find((p) => p.team === drive.offense && p.slot === slot);
const defensePlayer = (slot) =>
  players.find((p) => p.team === defenseTeam() && p.slot === slot);
const incapacitated = (p) => p.stunT > 0 || p.slipT > 0;

function hitStop(seconds) {
  hitStopT = Math.max(hitStopT, seconds);
}

// Input
const keys = new Set();
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === ' ') {
    e.preventDefault();
    if (phase === 'lineup' && drive.offense === TEAM.BLUE) snap();
  }
  if (k in THROW_KEYS && phase === 'live' && drive.offense === TEAM.BLUE) {
    const slot = THROW_KEYS[k];
    if (slot === CENTER && !play.centerReleased) return;
    if (ball.carrier === controlled && controlled.role === 'qb') {
      throwToReceiver(offensePlayer(slot));
    }
  }
  if ((k === 'z' || k === 'x') && phase === 'live' && ball.carrier === controlled) {
    startMove(controlled, k === 'z' ? 'spin' : 'juke');
  }
  if (k === 'e') attemptInterception();
  if (k === 'q' && drive.offense === TEAM.RED) switchControl();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

function switchControl() {
  if (!controlled) return;
  const blues = teamPlayers(TEAM.BLUE);
  setControlled(blues[(blues.indexOf(controlled) + 1) % blues.length]);
}

function setControlled(p) {
  if (controlled) controlled.marker.visible = false;
  controlled = p;
  if (controlled) controlled.marker.visible = true;
}

// ---- Spin / juke ----

function startMove(p, type) {
  if (p.moveCooldown > 0 || p.moveState || incapacitated(p)) return;
  let dir = 0;
  if (type === 'juke') {
    const attack = ATTACK_DIR[p.team];
    if (keys.has('arrowleft')) dir = -attack;
    else if (keys.has('arrowright')) dir = attack;
    else {
      // no lateral input: juke away from the nearest defender
      let nearest = null;
      let nd = Infinity;
      for (const o of players) {
        if (o.team === p.team) continue;
        const d = o.group.position.distanceTo(p.group.position);
        if (d < nd) { nd = d; nearest = o; }
      }
      dir = nearest && nearest.group.position.z > p.group.position.z ? -1 : 1;
    }
  }
  p.moveState = { type, t: 0, dur: type === 'spin' ? SPIN_DURATION : JUKE_DURATION, dir };
  p.moveCooldown = MOVE_COOLDOWN;

  // Sell the move: nearby pursuing defenders overcommit, then stumble.
  for (const d of players) {
    if (d.team === p.team || incapacitated(d)) continue;
    if (d.group.position.distanceTo(p.group.position) > MOVE_SELL_RADIUS) continue;
    if (d.velocity.lengthSq() < 0.5) continue;
    d.commitTarget
      .copy(d.velocity)
      .normalize()
      .multiplyScalar(2.6)
      .add(p.group.position);
    d.commitT = 0.4;
    d.stumbleT = 0.85; // includes the commit beat; slow re-track after
  }
}

// ---- Interception ----

function attemptInterception() {
  if (phase !== 'live' || ball.state !== 'thrown' || play.snapping) return;
  if (!controlled || controlled.team !== defenseTeam() || intLockout > 0) return;
  if (controlled.group.position.distanceTo(ball.mesh.position) > INT_RADIUS) return;
  intLockout = INT_LOCKOUT;
  fx.hitFlash(ball.mesh.position.clone(), 0.9);
  if (Math.random() < INT_CHANCE) {
    // Live return: the picker keeps the ball and runs it back.
    hitStop(0.06);
    fx.shake(0.25);
    holdBall(ball, controlled);
    play.intReturn = controlled.team;
    play.tackle = null;
    showBanner('INTERCEPTED!', 1.4);
  }
}

// ---- Play lifecycle ----

function lineupPlay() {
  phase = 'lineup';
  lineupTimer = 0;
  play.t = 0;
  play.thrown = false;
  play.qbScrambled = false;
  play.snapping = false;
  play.centerReleased = false;
  play.tackle = null;
  play.intReturn = null;
  play.routes.clear();
  play.assignments.clear();

  const attack = offAttack();
  const offense = teamPlayers(drive.offense);
  const defense = teamPlayers(defenseTeam());

  const spots = {
    qb: [drive.los - attack * 2.8, 0],
    wr1: [drive.los - attack * 0.6, -6.5],
    wr2: [drive.los - attack * 0.6, 6.5],
    wr3: [drive.los - attack * 0.6, -3.5],
    center: [drive.los - attack * 0.5, 0],
    rusher: [drive.los + attack * 2.0, 0.8],
    corner1: [drive.los + attack * 1.8, -6.5],
    corner2: [drive.los + attack * 1.8, 6.5],
    corner3: [drive.los + attack * 1.8, -3.5],
    spy: [drive.los + attack * 4.5, 0],
  };
  const place = (p, [x, z], facing) => {
    p.group.position.set(x, 0, z);
    p.velocity.set(0, 0, 0);
    p.heading = facing;
    p.group.rotation.y = facing;
    p.rig.rotation.x = 0;
    p.rig.rotation.z = 0;
    p.stunT = p.slipT = p.stumbleT = p.commitT = p.burstT = 0;
    p.moveState = null;
    p.moveCooldown = 0;
    p.tackleCooldown = 0;
  };
  const offFacing = attack > 0 ? Math.PI / 2 : -Math.PI / 2;
  const OFF_SPOTS = ['qb', 'wr1', 'wr2', 'wr3', 'center'];
  const OFF_ROLES = ['qb', 'wr', 'wr', 'wr', 'center'];
  const DEF_SPOTS = ['rusher', 'corner1', 'corner2', 'corner3', 'spy'];
  const DEF_ROLES = ['rusher', 'corner', 'corner', 'corner', 'spy'];
  offense.forEach((p) => {
    p.role = OFF_ROLES[p.slot];
    place(p, spots[OFF_SPOTS[p.slot]], offFacing);
  });
  defense.forEach((p) => {
    p.role = DEF_ROLES[p.slot];
    place(p, spots[DEF_SPOTS[p.slot]], -offFacing);
  });

  for (let slot = 0; slot < ROSTER_SIZE; slot++) {
    play.assignments.set(defense[slot], offense[slot]);
  }

  holdBall(ball, offense[CENTER]);
  updateBall(ball, 0);

  setControlled(
    drive.offense === TEAM.BLUE ? offense[QB] : teamPlayers(TEAM.BLUE)[0]
  );

  losLine.position.x = drive.los;
  markerLine.position.x = markerX();
  markerLine.visible = drive.markerIdx === 0;
  updateScoreboard();
  updateTargetChips();
  controlsEl.textContent =
    drive.offense === TEAM.BLUE
      ? 'SPACE snap · Arrows move · Shift sprint · A/S/D (F) throw · Z spin · X juke'
      : 'Arrows move · Shift sprint · Q switch · E intercept';
}

function snap() {
  phase = 'live';
  play.t = 0;
  play.snapping = true;
  const attack = offAttack();
  const qb = offensePlayer(QB);
  const center = offensePlayer(CENTER);

  const from = center.group.position.clone();
  from.y = 0.9;
  const target = qb.group.position.clone();
  target.y = 1.2;
  throwBall(ball, from, target, SNAP_FLIGHT_TIME, qb);

  for (const slot of RECEIVER_SLOTS) {
    const wr = offensePlayer(slot);
    play.routes.set(wr, makeRoute(wr, attack));
  }
}

function makeRoute(wr, attack) {
  const z = wr.group.position.z;
  const deepX = attack * (FIELD.halfLength + FIELD.endZoneDepth - 1.5);
  if (Math.random() < 0.5) {
    return [new THREE.Vector3(deepX, 0, z)];
  }
  return [
    new THREE.Vector3(drive.los + attack * 3.5, 0, z),
    new THREE.Vector3(drive.los + attack * 12, 0, z * -0.35),
    new THREE.Vector3(deepX, 0, z * -0.35),
  ];
}

function makeCenterRoute(center, attack) {
  const side = center.group.position.z >= 0 ? 1 : -1;
  return [
    new THREE.Vector3(drive.los + attack * 2.5, 0, side * 1.5),
    new THREE.Vector3(drive.los + attack * 6, 0, side * 4),
    new THREE.Vector3(drive.los + attack * 11, 0, side * 5),
  ];
}

function throwToReceiver(wr) {
  if (ball.state !== 'held') return;
  const from = ball.mesh.position.clone();
  from.y = 1.4;
  const target = wr.group.position.clone();
  target.y = 1.15;
  const flightTime = THREE.MathUtils.clamp(from.distanceTo(target) / THROW_SPEED, 0.35, 1.3);
  target.addScaledVector(wr.velocity, flightTime * 0.9);
  throwBall(ball, from, target, flightTime, wr);
  play.thrown = true;
}

function endPlay(reason, spotX) {
  phase = 'dead';
  deadTimer = DEAD_PAUSE;
  ball.state = 'rest';
  ball.carrier = null;
  play.tackle = null;

  const attack = offAttack();
  let banner = '';
  if (reason === 'incomplete') {
    banner = 'INCOMPLETE';
  } else {
    const spot = THREE.MathUtils.clamp(spotX, -FIELD.halfLength + 0.5, FIELD.halfLength - 0.5);
    banner = reason === 'oob' ? 'OUT OF BOUNDS' : attack * (spot - drive.los) < 0 ? 'SACKED' : 'TACKLED';
    if (drive.markerIdx === 0 && attack * (spot - markerX()) >= 0) {
      drive.los = spot;
      drive.down = 1;
      drive.markerIdx = 1;
      showBanner('FIRST DOWN!');
      return;
    }
    drive.los = spot;
  }

  drive.down += 1;
  if (drive.down > DOWNS_PER_SET) {
    flipPossession();
    showBanner(`${banner} — TURNOVER ON DOWNS`);
  } else {
    showBanner(banner);
  }
}

function touchdownFor(team) {
  phase = 'dead';
  deadTimer = DEAD_PAUSE + 0.6;
  ball.state = 'rest';
  ball.carrier = null;
  play.tackle = null;
  score[team] += TD_POINTS;
  showBanner(`TOUCHDOWN ${TEAM_NAMES[team]}!`);
  // Ball goes to the team that got scored on, at their own line.
  const receiving = team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE;
  drive.offense = receiving;
  drive.los = -ATTACK_DIR[receiving] * DRIVE_START;
  drive.down = 1;
  drive.markerIdx = 0;
}

// An interception return ended short of the end zone: the returning team
// takes over on downs at the spot.
function endReturn(reason, spotX) {
  const team = play.intReturn;
  phase = 'dead';
  deadTimer = DEAD_PAUSE;
  ball.state = 'rest';
  ball.carrier = null;
  play.tackle = null;
  drive.offense = team;
  drive.los = THREE.MathUtils.clamp(spotX, -FIELD.halfLength + 0.5, FIELD.halfLength - 0.5);
  drive.down = 1;
  drive.markerIdx = ATTACK_DIR[team] * drive.los >= 0 ? 1 : 0;
  showBanner(reason === 'oob' ? 'RETURN OUT OF BOUNDS' : 'RETURNER DOWN!');
}

function flipPossession() {
  drive.offense = defenseTeam();
  drive.los = -offAttack() * DRIVE_START;
  drive.down = 1;
  drive.markerIdx = 0;
}

function showBanner(text, transientSeconds = 0) {
  bannerEl.textContent = text;
  bannerEl.style.display = 'block';
  bannerT = transientSeconds;
}

function showPickup(player, type) {
  pickupEl.textContent = `${PICKUP_LABELS[type]} — ${TEAM_NAMES[player.team]}`;
  pickupEl.style.opacity = '1';
  pickupMsgT = 2.2;
}

function updateScoreboard() {
  scoreEl.textContent = `BLUE ${score[TEAM.BLUE]} — ${score[TEAM.RED]} RED`;
  const dist = Math.max(1, Math.round(offAttack() * (markerX() - drive.los)));
  const distText = drive.markerIdx === 1 ? 'GOAL' : dist;
  downDistEl.textContent = `${TEAM_NAMES[drive.offense]} BALL · ${DOWN_NAMES[drive.down - 1]} & ${distText}`;
}

function updateTargetChips() {
  const userOffense = drive.offense === TEAM.BLUE;
  targetsEl.style.display = userOffense ? 'flex' : 'none';
  if (!userOffense) return;
  const live = phase === 'live' && !play.thrown && ball.carrier?.role === 'qb';
  for (const slot of RECEIVER_SLOTS) {
    targetChips[slot].className = live ? 'chip live' : 'chip';
  }
  const centerEligible = CENTER_RELEASES_ON_DOWN(drive.down);
  targetChips[CENTER].className = !centerEligible
    ? 'chip off'
    : live && play.centerReleased
      ? 'chip live'
      : 'chip';
}

function updateIcons() {
  const show =
    phase === 'live' &&
    drive.offense === TEAM.BLUE &&
    !play.thrown &&
    ball.carrier?.role === 'qb';
  for (const p of teamPlayers(TEAM.BLUE)) {
    if (!p.icon) continue;
    p.icon.visible =
      show && (p.slot === CENTER ? play.centerReleased : RECEIVER_SLOTS.includes(p.slot));
  }
}

// ---- Powerup effects ----

function onPickup(player, type) {
  showPickup(player, type);
  fx.hitFlash(player.group.position.clone().setY(1.2), 1.1);
  if (type === 'turbo') {
    player.turboT = TURBO_DURATION;
  } else {
    powerups.spawnHazard(type, player);
  }
}

function onHazardHit(hazard, victim) {
  fx.hitFlash(victim.group.position.clone().setY(1), hazard.type === 'trap' ? 1.4 : 1);
  if (hazard.type === 'trap') {
    victim.stunT = STUN_DURATION;
    fx.shake(0.18);
    hitStop(0.05);
  } else {
    victim.slipT = SLIP_DURATION;
  }
  victim.velocity.set(0, 0, 0);
}

// ---- Tackle attempts ----

function tryStartTackle(defender, carrier) {
  if (play.tackle || defender.tackleCooldown > 0 || incapacitated(defender)) return;
  play.tackle = { defender, t: TACKLE_WINDOW, sprintHeld: false };
  fx.hitFlash(
    carrier.group.position.clone().lerp(defender.group.position, 0.5).setY(1),
    0.9
  );
  hitStop(0.04);
}

function resolveTackle() {
  const { defender, sprintHeld } = play.tackle;
  const carrier = ball.carrier;
  play.tackle = null;
  if (!carrier) return;

  const isUser = carrier === controlled;
  // A powerup turbo is a guaranteed break. Otherwise the user shrugs off a
  // tackle only by *actively* sprinting (Shift) with stamina to spare — and
  // each break burns stamina, so a fresh carrier can bust ~2 hits before
  // getting dragged down. Just running into a defender = a completed tackle.
  let breaks = carrier.turboT > 0;
  if (!breaks && isUser && sprintHeld && stamina.tier !== TIERS.GASSED) {
    breaks = true;
    stamina.value = Math.max(0, stamina.value - TACKLE_BREAK_COST);
  }

  const contact = carrier.group.position.clone().lerp(defender.group.position, 0.5).setY(1.1);
  if (breaks) {
    // Defender lunges past the carrier and eats turf; carrier stumbles on.
    defender.commitTarget
      .copy(defender.velocity.lengthSq() > 0.2 ? defender.velocity : carrier.velocity)
      .normalize()
      .multiplyScalar(2.4)
      .add(carrier.group.position);
    defender.commitT = 0.35;
    defender.stumbleT = 1.0;
    defender.tackleCooldown = 1.2;
    carrier.stumbleT = 0.45;
    fx.hitFlash(contact, 1.3);
    fx.shake(0.22);
    hitStop(0.06);
  } else {
    // Completed tackle: dead ball, on returns too.
    fx.hitFlash(contact, 1.6);
    fx.shake(0.35);
    hitStop(0.08);
    if (play.intReturn !== null) endReturn('tackle', carrier.group.position.x);
    else endPlay('tackle', carrier.group.position.x);
  }
}

// ---- Per-frame AI ----

const scratch = new THREE.Vector3();
function updateReceiver(wr, speed = WR_SPEED) {
  const route = play.routes.get(wr);
  if (!route || !route.length) {
    wr.velocity.set(0, 0, 0);
    return;
  }
  scratch.copy(route[0]).sub(wr.group.position);
  scratch.y = 0;
  if (scratch.length() < 0.6 && route.length > 1) route.shift();
  wr.velocity.copy(scratch.normalize()).multiplyScalar(speed);
}

function updateBlocker(center) {
  const qb = offensePlayer(QB);
  const rusher = defensePlayer(0);
  scratch.copy(rusher.group.position).sub(qb.group.position).setLength(1.6);
  scratch.add(qb.group.position).sub(center.group.position);
  scratch.y = 0;
  if (scratch.length() < 0.2) {
    center.velocity.set(0, 0, 0);
    return;
  }
  center.velocity.copy(scratch.normalize()).multiplyScalar(BLOCKER_SPEED);
}

function resolveBlocks(center) {
  if (incapacitated(center)) return;
  for (const d of teamPlayers(defenseTeam())) {
    const dx = d.group.position.x - center.group.position.x;
    const dz = d.group.position.z - center.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0 && dist < BLOCK_RADIUS) {
      const push = (BLOCK_RADIUS - dist) / dist;
      d.group.position.x += dx * push;
      d.group.position.z += dz * push;
    }
  }
}

function nearestOpponentDist(p) {
  let best = Infinity;
  for (const o of players) {
    if (o.team === p.team) continue;
    best = Math.min(best, o.group.position.distanceTo(p.group.position));
  }
  return best;
}

function updateAICarrier(p) {
  const attack = ATTACK_DIR[p.team];
  scratch.set(attack, 0, 0);
  let nearest = null;
  let nd = Infinity;
  for (const o of players) {
    if (o.team === p.team) continue;
    const d = o.group.position.distanceTo(p.group.position);
    if (d < nd) {
      nd = d;
      nearest = o;
    }
  }
  if (nearest && nd < 3.5) {
    const dz = p.group.position.z - nearest.group.position.z;
    scratch.z = (dz >= 0 ? 1 : -1) * 0.8;
    scratch.normalize();
  }
  p.velocity.copy(scratch).multiplyScalar(p.turboT > 0 ? SPRINT_SPEED[TIERS.TURBO] : WR_SPEED);
}

function updateAIQuarterback(qb) {
  if (play.qbScrambled) {
    updateAICarrier(qb);
    return;
  }
  qb.velocity.set(0, 0, 0);
  if (play.thrown || ball.carrier !== qb) return;
  if (play.t > QB_MIN_HOLD) {
    const options = [...RECEIVER_SLOTS];
    if (play.centerReleased) options.push(CENTER);
    for (const slot of options) {
      const wr = offensePlayer(slot);
      if (nearestOpponentDist(wr) > QB_OPEN_DIST) {
        throwToReceiver(wr);
        return;
      }
    }
  }
  if (play.t > QB_SCRAMBLE_AT) play.qbScrambled = true;
}

function updateDefender(d) {
  // Sold by a juke/spin: keep charging the committed direction for a beat.
  if (d.commitT > 0) {
    scratch.copy(d.commitTarget).sub(d.group.position);
    scratch.y = 0;
    if (scratch.length() > 0.2) {
      d.velocity.copy(scratch.normalize()).multiplyScalar(DEF_SPEED);
      return;
    }
  }
  const qb = offensePlayer(QB);
  const carrier = ball.carrier;
  const attack = offAttack();
  const carrierRunning =
    carrier &&
    (carrier.role !== 'qb' || play.qbScrambled || attack * (carrier.group.position.x - drive.los) > 0);

  if (carrierRunning) {
    scratch.copy(carrier.group.position);
  } else if (d.role === 'rusher') {
    if (play.t < rushDelay()) {
      d.velocity.set(0, 0, 0);
      return;
    }
    scratch.copy(qb.group.position);
  } else if (d.role === 'spy') {
    const center = play.assignments.get(d);
    if (play.centerReleased) {
      scratch.copy(center.group.position);
      scratch.x += attack * 0.9;
    } else {
      scratch.set(drive.los + attack * 4.5, 0, 0);
    }
  } else {
    const man = play.assignments.get(d);
    scratch.copy(man.group.position);
    scratch.x += attack * 0.9;
  }
  scratch.sub(d.group.position);
  scratch.y = 0;
  if (scratch.length() < 0.3) {
    d.velocity.set(0, 0, 0);
    return;
  }
  const speed = d.stumbleT > 0 ? DEF_SPEED * 0.45 : DEF_SPEED;
  d.velocity.copy(scratch.normalize()).multiplyScalar(speed);
}

// ---- User control ----

const moveDir = new THREE.Vector3();
function updateControlled(dt) {
  const attack = viewAttack(); // arrow frame matches the camera
  moveDir.set(0, 0, 0);
  if (keys.has('arrowup')) moveDir.x += attack;
  if (keys.has('arrowdown')) moveDir.x -= attack;
  if (keys.has('arrowleft')) moveDir.z -= attack;
  if (keys.has('arrowright')) moveDir.z += attack;

  const canMove =
    phase === 'live' &&
    !(play.snapping && controlled.role === 'qb') &&
    !incapacitated(controlled) &&
    !controlled.moveState;
  const moving = moveDir.lengthSq() > 0 && canMove;
  const sprinting = moving && keys.has('shift') && controlled.turboT <= 0;
  let tier = stamina.update(dt, sprinting);
  if (controlled.turboT > 0) tier = TIERS.TURBO; // powerup: free turbo

  let speed;
  if (controlled.turboT > 0) speed = SPRINT_SPEED[TIERS.TURBO];
  else speed = sprinting ? SPRINT_SPEED[tier] : WALK_SPEED;
  if (controlled.stumbleT > 0) speed *= 0.6;
  if (controlled.burstT > 0) speed *= 1.3;
  if (play.tackle && ball.carrier === controlled) speed *= TACKLE_DRAG;

  if (moving) {
    moveDir.normalize();
    controlled.velocity.copy(moveDir).multiplyScalar(speed);
  } else if (canMove) {
    controlled.velocity.set(0, 0, 0);
  }
  return tier;
}

function updateHUD(tier) {
  staminaFill.style.width = `${stamina.percent}%`;
  staminaFill.style.backgroundColor = TIER_COLORS[tier];
  const turbo = controlled && controlled.turboT > 0;
  if (turbo) staminaFill.style.backgroundColor = '#d4f00f';
  staminaLabel.textContent = turbo
    ? `TURBO BOOST — ${controlled.turboT.toFixed(1)}s`
    : `${tier.toUpperCase()} — ${Math.round(stamina.value)} / ${stamina.max}`;
}

// ---- Live-play resolution ----

function updateLivePlay(dt) {
  play.t += dt;
  intLockout = Math.max(0, intLockout - dt);

  const attack = offAttack();
  const qb = offensePlayer(QB);
  const center = offensePlayer(CENTER);

  if (
    !play.centerReleased &&
    CENTER_RELEASES_ON_DOWN(drive.down) &&
    play.t > CENTER_RELEASE_AT
  ) {
    play.centerReleased = true;
    play.routes.set(center, makeCenterRoute(center, attack));
  }

  if (play.intReturn !== null) {
    // Interception return: the throwing team chases the returner; the
    // returner's teammates escort downfield.
    const carrier = ball.carrier;
    const retAttack = ATTACK_DIR[play.intReturn];
    for (const p of players) {
      if (p === controlled || incapacitated(p) || p.moveState || !carrier) continue;
      if (p.team !== play.intReturn) {
        scratch.copy(carrier.group.position).sub(p.group.position);
        scratch.y = 0;
        if (scratch.length() > 0.3) {
          const speed = p.stumbleT > 0 ? DEF_SPEED * 0.45 : DEF_SPEED;
          p.velocity.copy(scratch.normalize()).multiplyScalar(speed);
        } else {
          p.velocity.set(0, 0, 0);
        }
      } else if (p !== carrier) {
        scratch.set(
          carrier.group.position.x + retAttack * 4,
          0,
          p.group.position.z
        ).sub(p.group.position);
        scratch.y = 0;
        p.velocity.copy(scratch.length() > 0.5 ? scratch.normalize().multiplyScalar(DEF_SPEED * 0.9) : scratch.set(0, 0, 0));
      }
    }
  } else {
    // Offense AI
    for (const slot of [...RECEIVER_SLOTS, CENTER]) {
      const p = offensePlayer(slot);
      if (p === controlled || incapacitated(p) || p.moveState) continue;
      if (ball.carrier === p) {
        if (p.team === TEAM.RED) updateAICarrier(p);
      } else if (slot === CENTER && !play.centerReleased) {
        updateBlocker(p);
      } else {
        updateReceiver(p);
      }
    }
    if (qb !== controlled && !incapacitated(qb)) updateAIQuarterback(qb);

    // Defense AI
    for (const d of teamPlayers(defenseTeam())) {
      if (d === controlled || incapacitated(d)) continue;
      updateDefender(d);
    }
  }

  // Tackle window
  if (play.tackle) {
    play.tackle.t -= dt;
    play.tackle.sprintHeld ||= keys.has('shift');
    const d = play.tackle.defender;
    if (ball.carrier) {
      // grabber sticks to the carrier
      scratch.copy(ball.carrier.group.position).sub(d.group.position);
      scratch.y = 0;
      d.velocity.copy(scratch.normalize()).multiplyScalar(DEF_SPEED);
      if (ball.carrier.team === TEAM.RED) ball.carrier.velocity.multiplyScalar(TACKLE_DRAG);
    }
    if (play.tackle && play.tackle.t <= 0) resolveTackle();
  }

  // Thrown ball: catch or incompletion.
  if (ball.state === 'thrown') {
    const wr = ball.intended;
    scratch.copy(wr.group.position);
    scratch.y = 1.1;
    if (ball.airTime > 0.1 && ball.mesh.position.distanceTo(scratch) < CATCH_DIST) {
      holdBall(ball, wr);
      play.snapping = false;
      if (wr.team === TEAM.BLUE && wr !== controlled) setControlled(wr);
    } else if (ball.mesh.position.y < 0.18) {
      endPlay('incomplete', drive.los);
      return;
    }
  }

  // Carrier: touchdown, out of bounds, new tackle attempts. During a return
  // these resolve for the returning team instead of the offense.
  const carrier = ball.carrier;
  if (carrier) {
    const returning = play.intReturn !== null;
    const carrierAttack = returning ? ATTACK_DIR[carrier.team] : attack;
    const cx = carrier.group.position.x;
    if (carrierAttack * cx >= FIELD.halfLength) {
      touchdownFor(returning ? carrier.team : drive.offense);
      return;
    }
    if (Math.abs(carrier.group.position.z) > FIELD.halfWidth - 0.2) {
      if (returning) endReturn('oob', cx);
      else endPlay('oob', cx);
      return;
    }
    if (!play.tackle) {
      for (const d of players) {
        if (d.team === carrier.team) continue;
        if (d.group.position.distanceTo(carrier.group.position) < TACKLE_DIST) {
          tryStartTackle(d, carrier);
          break;
        }
      }
    }
  }
}

// ---- Boot ----

loadPlayerAssets().then((assets) => {
  for (const team of [TEAM.BLUE, TEAM.RED]) {
    for (let slot = 0; slot < ROSTER_SIZE; slot++) {
      const p = createPlayer(assets, {
        team,
        color: TEAM_COLORS[team],
        redJersey: team === TEAM.RED,
        iconLetter: team === TEAM.BLUE ? ICON_LETTERS[slot] ?? null : null,
      });
      p.slot = slot;
      p.role = 'wr';
      p.currentAction = p.actions[TIERS.REGULAR];
      p.currentAction.play();
      p.currentAction.paused = true;
      players.push(p);
      scene.add(p.group);
    }
  }
  window.__game = {
    players,
    ball,
    drive,
    score,
    snap,
    play,
    powerups,
    stamina,
    renderer,
    scene,
    camera,
    step,
    get phase() { return phase; },
    get controlled() { return controlled; },
  };
  lineupPlay();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

const BOUND_X = FIELD.halfLength + FIELD.endZoneDepth - 0.5;
const BOUND_Z = FIELD.halfWidth + FIELD.fenceMargin - 0.5;

const camPos = new THREE.Vector3(-20, 8, 0);
const camLook = new THREE.Vector3(0, 0, 0);
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
const reachTarget = new THREE.Vector3();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => step(Math.min(clock.getDelta(), 0.05)));

function step(dt) {
  if (phase === 'loading') return;

  // Hit-stop: freeze the world for a few frames, keep rendering.
  if (hitStopT > 0) {
    hitStopT -= dt;
    composer.render();
    return;
  }

  const tier = updateControlled(dt);

  if (phase === 'lineup') {
    lineupTimer += dt;
    if (drive.offense === TEAM.RED && lineupTimer > AI_SNAP_DELAY) snap();
  } else if (phase === 'live') {
    updateLivePlay(dt);
  } else if (phase === 'dead') {
    deadTimer -= dt;
    for (const p of players) p.velocity.set(0, 0, 0);
    if (deadTimer <= 0) {
      bannerEl.style.display = 'none';
      lineupPlay();
    }
  }

  for (const p of players) {
    // status timers
    p.turboT = Math.max(0, p.turboT - dt);
    p.stunT = Math.max(0, p.stunT - dt);
    p.slipT = Math.max(0, p.slipT - dt);
    p.stumbleT = Math.max(0, p.stumbleT - dt);
    p.commitT = Math.max(0, p.commitT - dt);
    p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
    p.moveCooldown = Math.max(0, p.moveCooldown - dt);
    p.burstT = Math.max(0, p.burstT - dt);
    if (incapacitated(p)) p.velocity.set(0, 0, 0);

    // spin/juke overlay: velocity + model rotation through the move
    if (p.moveState) {
      const m = p.moveState;
      m.t += dt;
      const k = m.t / m.dur;
      if (m.type === 'spin') {
        p.velocity.set(Math.sin(p.heading), 0, Math.cos(p.heading)).multiplyScalar(
          SPRINT_SPEED[TIERS.TURBO] * 0.95
        );
      } else {
        p.velocity
          .set(Math.sin(p.heading), 0, Math.cos(p.heading))
          .multiplyScalar(WALK_SPEED * 0.7);
        p.velocity.z += m.dir * 8.5 * Math.sin(Math.PI * Math.min(k, 1));
      }
      if (m.t >= m.dur) {
        p.moveState = null;
        p.burstT = BURST_DURATION;
        p.rig.rotation.z = 0;
      }
    }

    if (phase !== 'live') p.velocity.set(0, 0, 0);
    p.group.position.addScaledVector(p.velocity, dt);
    p.group.position.x = THREE.MathUtils.clamp(p.group.position.x, -BOUND_X, BOUND_X);
    p.group.position.z = THREE.MathUtils.clamp(p.group.position.z, -BOUND_Z, BOUND_Z);

    const speed = p.velocity.length();
    if (speed > 0.2 && !p.moveState) {
      const targetHeading = Math.atan2(p.velocity.x, p.velocity.z);
      let delta = targetHeading - p.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      p.heading += THREE.MathUtils.clamp(delta, -TURN_RATE * dt, TURN_RATE * dt);
    }
    // model rotation: spin adds a full 360 through the move; juke leans
    if (p.moveState?.type === 'spin') {
      p.group.rotation.y = p.heading + (p.moveState.t / p.moveState.dur) * Math.PI * 2;
    } else {
      p.group.rotation.y = p.heading;
    }
    p.rig.rotation.z = p.moveState?.type === 'juke'
      ? -p.moveState.dir * 0.35 * Math.sin(Math.PI * Math.min(p.moveState.t / p.moveState.dur, 1))
      : 0;
    // slip/stumble: pitch the model forward briefly
    let pitch = 0;
    if (p.slipT > 0) pitch = 0.8 * Math.sin(Math.PI * (1 - p.slipT / SLIP_DURATION));
    else if (p.stumbleT > 0) pitch = 0.35 * Math.sin(Math.PI * (1 - p.stumbleT / 1.0));
    p.rig.rotation.x = pitch;

    const clipTier = p === controlled ? tier : p.turboT > 0 ? TIERS.TURBO : TIERS.REGULAR;
    updatePlayerClip(p, clipTier, p.stunT > 0 ? 0 : speed);
    p.mixer.update(dt);

    // procedural catch reach: arms track the incoming ball
    if (ball.state === 'thrown' && ball.intended === p) {
      const d = ball.mesh.position.distanceTo(p.group.position);
      const reach = THREE.MathUtils.clamp(1.4 - d / 3.5, 0, 1);
      if (reach > 0.05) {
        reachTarget.copy(ball.mesh.position);
        aimBone(p.arms.r, p.arms.rf, reachTarget, reach * 0.9);
        aimBone(p.arms.l, p.arms.lf, reachTarget, reach * 0.75);
      }
    }
  }

  if (phase === 'live' && !play.centerReleased) {
    resolveBlocks(offensePlayer(CENTER));
  }
  if (phase === 'live') {
    powerups.update(dt, players, { onPickup, onHazardHit });
  }

  updateBall(ball, dt);
  updateHUD(tier);
  updateIcons();
  updateTargetChips();

  if (pickupMsgT > 0) {
    pickupMsgT -= dt;
    if (pickupMsgT <= 0.6) pickupEl.style.opacity = String(Math.max(pickupMsgT / 0.6, 0));
  }
  // Transient banner (INTERCEPTED!) hides itself while play continues.
  if (bannerT > 0 && phase === 'live') {
    bannerT -= dt;
    if (bannerT <= 0) bannerEl.style.display = 'none';
  }

  const attack = viewAttack(); // swings 180° on an interception return
  const bp = ball.mesh.position;
  desiredPos.set(bp.x - attack * CAM_BACK, CAM_HEIGHT, bp.z + CAM_SIDE);
  desiredLook.set(bp.x + attack * CAM_LOOKAHEAD, 1, bp.z);
  const k = 1 - Math.exp(-CAM_SMOOTHING * dt);
  camPos.lerp(desiredPos, k);
  camLook.lerp(desiredLook, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.rotateZ(CAM_ROLL);
  fx.update(dt); // flashes + camera shake (after camera placement)

  composer.render();
}
