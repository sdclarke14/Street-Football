import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { StaminaMeter, TIERS } from './stamina.js';
import { FIELD, buildWorld, createDriveLines, SURFACES } from './field.js';
import { createBall, holdBall, throwBall, updateBall } from './ball.js';
import { loadPlayerAssets, createPlayer, updatePlayerClip, aimBone, applyBuild } from './players.js';
import { createPowerups } from './powerups.js';
import { createFX } from './effects.js';
import { createUI } from './ui.js';
import { createTouchControls, lockViewport } from './touch.js';
import { createAudio } from './audio.js';
import { toonify, addOutlines, RAMPS } from './toon.js';
import { applyPose, stepPose, playPose } from './anim.js';
import { CHARACTERS } from './roster.js';
import { createDraft } from './draft.js';
import {
  SLOT, ROSTER_SIZE, TARGET_SLOTS, TARGET_KEYS, TARGET_LETTERS,
  OFFENSE_PLAYS, DEFENSE_PLAYS, ZONE_SPOTS,
  alignmentFor, routeWaypoints, runWaypoints,
  pickOffensivePlay, pickDefensivePlay,
} from './playbook.js';

// ---------------------------------------------------------------------------
// Street Football — 7-on-7, street rules.
//
// Real 7-on-7: 40-yard field, 10-yard end zones, first down at midfield,
// four downs to get there and four more to score, no kicking, a pass clock
// and a counted rush. Street rules on top of that: designed runs, blocking,
// spin/juke/truck, and a style meter that cashes in as a GAMEBREAKER.
// ---------------------------------------------------------------------------

const TEAM = { HOME: 0, AWAY: 1 };
const TEAM_NAMES = { [TEAM.HOME]: 'HOME', [TEAM.AWAY]: 'AWAY' };
const TEAM_COLORS = { [TEAM.HOME]: 0xb9f227, [TEAM.AWAY]: 0xff3b30 };
const ATTACK_DIR = { [TEAM.HOME]: 1, [TEAM.AWAY]: -1 };
const USER_TEAM = TEAM.HOME;

// Rules
const DOWNS_PER_SET = 4;
const TD_POINTS = 6;
const START_FROM_OWN = 10; // yards out from your own goal line
const PASS_CLOCK = 4.0; // seconds the QB gets before it's a sack
const CONV_SPOT = { 1: 5, 2: 10 }; // conversion distance from the goal line
const GAME_SECONDS = 300;
const RUNOFF_PER_PLAY = 7; // clock burned between snaps

// Movement
const WALK_SPEED = 5.0;
const SPRINT_SPEED = { [TIERS.TURBO]: 9.2, [TIERS.REGULAR]: 7.4, [TIERS.GASSED]: 5.6 };
const WR_SPEED = 7.4;
const DEF_SPEED = 7.1;
const BLOCKER_SPEED = 6.4;
const TURN_RATE = 12;
const SEPARATION = 0.72;
// Momentum. Every AI and input function writes a *desired* velocity each
// frame; the real one chases it at these rates, so players build speed,
// carry it through a cut and cannot reverse on a dime at full sprint.
// Tunable: higher = snappier, lower = heavier. At DECEL 17 a sprinter
// stopped in ~0.2s, which still read as a puppet; 12 gives ~0.35s.
const ACCEL = 9;       // approach rate when speeding up
const DECEL = 12;      // approach rate when slowing down
const CUT_FLOOR = 0.42; // how much of the rate survives a full reversal
const TURN_AT_SPEED = 0.52; // fraction of turn rate lost at top speed

// Contact
const TACKLE_DIST = 0.95;
const CATCH_DIST = 1.55;
const DIVE_CATCH_DIST = 2.1;
const THROW_SPEED = 19;
const BLOCK_RADIUS = 1.25;
const TACKLE_WINDOW = 0.3;
// Contact
const GANG_RADIUS = 1.6;   // a second defender this close piles on
const FALL_DURATION = 0.7; // how long going to ground takes
const FALL_FORWARD = 0.8;  // yards the carrier gains falling forward
const TACKLE_DRAG = 0.38;
const TACKLE_BREAK_COST = 34;
const SNAP_FLIGHT_TIME = 0.24;

// Moves
const SPIN_DURATION = 0.45;
const JUKE_DURATION = 0.28;
const TRUCK_DURATION = 0.4;
const MOVE_COOLDOWN = 1.3;
const MOVE_SELL_RADIUS = 3.4;
const BURST_DURATION = 0.32;

// Style / gamebreaker
const STYLE_MAX = 100;
const GB_DURATION = 7.5;
const STYLE = {
  completion: 7, bigGain: 11, brokenTackle: 13, soldMove: 6,
  touchdown: 26, interception: 22, sack: 14, stop: 8,
};

// Powerups
const TURBO_DURATION = 4;
const STUN_DURATION = 1.5;
const SLIP_DURATION = 1.0;
const PICKUP_LABELS = { turbo: 'TURBO BOOST!', trap: 'ELECTRIC TRAP DROPPED!', oil: 'OIL SLICK DROPPED!' };

// AI timing
const AI_SNAP_DELAY = 1.1;
const QB_MIN_HOLD = 0.75;
const QB_OPEN_DIST = 3.1;
const DEAD_PAUSE = 1.7;
// Catch system. Modelled on how the big football games do it: a timing
// window on the ball's arrival, three catch types, and a contested catch
// resolved between receiver and defender with three possible outcomes —
// caught, broken up, or picked. The 0.24 contested-interception base is a
// community figure for Madden, not an official number, so treat it as a
// starting point for tuning rather than gospel.
const CATCH_WINDOW = 0.8;     // seconds before arrival that the window opens
const GREEN_LO = 0.08;        // tap inside this band for a clean catch
const GREEN_HI = 0.40;
const CONTEST_RADIUS = 2.6;   // a defender this close makes it contested
const BASE_INT_CONTESTED = 0.24;
const TIP_RADIUS = 1.3;       // anyone can grab a tipped ball inside this
const INT_RADIUS = 1.9;
const INT_CHANCE = 0.5;
const INT_LOCKOUT = 0.35;

// Camera
const CAM_BACK = 11;
const CAM_HEIGHT = 7.6;
const CAM_SIDE = 3.0;
const CAM_LOOKAHEAD = 7;
const CAM_ROLL = 0.012;
const CAM_SMOOTHING = 4;

// ---- Quality --------------------------------------------------------------
// A phone GPU does not want 3x supersampling, a 2k shadow map and a
// full-resolution bloom pass. Pick a tier once and build to it.
const IS_MOBILE =
  (window.matchMedia?.('(pointer: coarse)').matches ?? false) ||
  Math.min(screen.width, screen.height) < 820;
const QUALITY = IS_MOBILE
  ? { pixelRatio: 1.5, shadow: 1024, crowdFill: 0.62, crowdStride: 2, bloomScale: 0.55 }
  : { pixelRatio: 2, shadow: 2048, crowdFill: 1, crowdStride: 1, bloomScale: 1 };

// ---- Renderer -------------------------------------------------------------

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 400);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.pixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping; // flat, saturated, cartoon
renderer.toneMappingExposure = 1;
document.querySelector('#app').appendChild(renderer.domElement);

const { losLine, markerLine } = createDriveLines(scene);
const ball = createBall(scene);
ball.mesh.material = toonify(ball.mesh.material, { ramp: RAMPS.character });
addOutlines(ball.mesh, { color: 0x111413, width: 0.012 });
const powerups = createPowerups(scene);
const fx = createFX(scene, camera);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(
    window.innerWidth * QUALITY.bloomScale,
    window.innerHeight * QUALITY.bloomScale
  ),
  0.4, 0.3, 0.85
);
// composer.setSize() would push the full canvas size into every pass. Keep
// the scene sharp and let only the bloom blur chain run at a lower
// resolution — that is where the fill-rate cost actually is.
if (QUALITY.bloomScale < 1) {
  const baseSetSize = bloomPass.setSize.bind(bloomPass);
  bloomPass.setSize = (w, h) =>
    baseSetSize(
      Math.max(1, Math.round(w * QUALITY.bloomScale)),
      Math.max(1, Math.round(h * QUALITY.bloomScale))
    );
  bloomPass.setSize(window.innerWidth, window.innerHeight);
}
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

let world = null;
function setSurface(key) {
  world?.dispose();
  world = buildWorld(scene, key, QUALITY);
}

// ---- Shell: UI, touch, audio ---------------------------------------------

lockViewport();
const BASE = import.meta.env.BASE_URL;
const audio = createAudio();
const ui = createUI({
  surfaces: Object.values(SURFACES),
  art: {
    title: `${BASE}art/title-key.jpg`,
    fields: {
      grass: `${BASE}art/thumb-field-grass.jpg`,
      concrete: `${BASE}art/thumb-field-concrete.jpg`,
      dirt: `${BASE}art/thumb-field-dirt.jpg`,
    },
    cards: Object.fromEntries(
      CHARACTERS.map((c) => [c.art, `${BASE}art/roster/card-${c.art}.jpg`])
    ),
  },
});

const touch = createTouchControls({
  onFirstTouch: () => audio.start(),
  onSnap: () => userSnap(),
  onThrow: (slot, lob) => userThrow(slot, lob),
  onMove: (type) => userMove(type),
  onSwitch: () => switchControl(),
  onPick: () => userContest(),
  onGamebreaker: () => activateGamebreaker(),
  onCatch: (aggressive) => userCatch(aggressive),
  onMenu: () => toggleSound(),
});

// ---- State ----------------------------------------------------------------

const players = [];
let controlled = null;
let assets = null;
let phase = 'loading';

const score = { [TEAM.HOME]: 0, [TEAM.AWAY]: 0 };
const drive = { offense: TEAM.HOME, los: 0, lineToGain: 0, down: 1, goalToGo: false };
const meta = {
  clock: GAME_SECONDS, options: { pickups: true, sound: true }, over: false,
  lastResult: null, // { reason, spot, gain } — the reason the last play ended
  lastTackle: null, // { type, gang, extra, spot } — how the last tackle went
  catchLog: [],     // every catch resolution, for tuning
};

const play = {
  off: null, def: null, t: 0,
  routes: new Map(),
  coverage: new Map(), // defender -> { mode:'man'|'zone'|'rush'|'spy', target }
  blockers: new Set(),
  thrown: false, snapping: false, handoffDone: false,
  qbFree: false, passClock: PASS_CLOCK, clockRunning: false,
  carrierSlot: null, startX: 0,
  tackle: null, intReturn: null, lastThrowAt: 0,
};

const style = { value: 0, active: 0 };
let deadTimer = 0;
let lineupTimer = 0;
let hitStopT = 0;
let intLockout = 0;
let bannerT = 0;
let conversion = null; // { team, points } while a conversion try is live
let pendingCall = null;

// ---- Small helpers --------------------------------------------------------

const offAttack = () => ATTACK_DIR[drive.offense];
const viewAttack = () => (play.intReturn !== null ? ATTACK_DIR[play.intReturn] : offAttack());
const defenseTeam = () => (drive.offense === TEAM.HOME ? TEAM.AWAY : TEAM.HOME);
const teamPlayers = (team) => players.filter((p) => p.team === team);
const offensePlayer = (slot) => players.find((p) => p.team === drive.offense && p.slot === slot);
const defensePlayer = (slot) => players.find((p) => p.team === defenseTeam() && p.slot === slot);
const incapacitated = (p) => p.stunT > 0 || p.slipT > 0;
const userOnOffense = () => drive.offense === USER_TEAM;
const gbActive = () => style.active > 0;

function hitStop(seconds) {
  hitStopT = Math.max(hitStopT, seconds);
}
function cheer(amount) {
  world?.crowd.cheer(amount);
}
function addStyle(amount) {
  if (!userOnOffense() && !play.intReturn) amount *= 0.9;
  style.value = Math.min(STYLE_MAX, style.value + amount);
}
function clockText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function yardsOut(x, team) {
  return Math.round(FIELD.halfLength - ATTACK_DIR[team] * x);
}
function ballOnText() {
  const out = yardsOut(drive.los, drive.offense);
  return out <= 20 ? `OPP ${out}` : `OWN ${40 - out}`;
}
function toGoYards() {
  return Math.max(1, Math.round(offAttack() * (drive.lineToGain - drive.los)));
}

// ---- Input ----------------------------------------------------------------

const keys = new Set();
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!audio.started) audio.start();
  if (k === ' ') e.preventDefault();
  if (keys.has(k)) return;
  keys.add(k);
  if (k === ' ') userSnap();
  const ti = TARGET_KEYS.indexOf(k);
  if (ti >= 0) userThrow(TARGET_SLOTS[ti], keys.has('shift'));
  if (k === 'z') userMove('spin');
  if (k === 'x') userMove('juke');
  if (k === 'c') userMove('truck');
  if (k === 'e') userContest();
  if (k === 'q') switchControl();
  if (k === 'v') activateGamebreaker();
  if (k === 'm') toggleSound();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

function toggleSound() {
  audio.setMuted(!audio.muted);
  ui.hud.toast(audio.muted ? 'SOUND OFF' : 'SOUND ON');
}

function userSnap() {
  if (phase === 'lineup' && userOnOffense()) snap();
}

function userThrow(slot, lob) {
  if (phase !== 'live' || !userOnOffense()) return;
  if (ball.carrier !== controlled) return;
  const carrier = ball.carrier;
  // Only the quarterback throws, and only from behind the line — except on
  // an option keep, where the carrier can still pull up and sling it.
  const behindLOS = offAttack() * (carrier.group.position.x - drive.los) <= 0.5;
  const mayThrow = carrier.slot === SLOT.QB || (play.off?.keepPass && behindLOS);
  if (!behindLOS) {
    ui.hud.toast('PAST THE LINE — RUN IT');
    return;
  }
  if (!mayThrow) return;
  const target = offensePlayer(slot);
  if (!target || target === carrier) return;
  throwToReceiver(target, lob);
}

function userMove(type) {
  if (phase !== 'live' || !controlled) return;
  if (ball.carrier === controlled || controlled.team !== drive.offense) startMove(controlled, type);
}

function userContest() {
  if (phase !== 'live' || !controlled) return;
  if (controlled.team === drive.offense && ball.state === 'thrown') {
    userCatch(false);
    return;
  }
  attemptInterception();
}

// Tap inside the green band for a clean, secure catch; hold to go up and
// high-point it, which wins more contested balls and drops more of them.
function userCatch(aggressive) {
  const cw = play.catch;
  if (!cw || cw.tapAt !== null || cw.wr !== controlled) return;
  cw.tapAt = cw.tta;
  const covered = nearestOpponentDist(cw.wr) < 3;
  cw.type = aggressive ? 'aggressive' : covered ? 'possession' : 'rac';
  cw.wr.diveT = 0.35;
  playPose(cw.wr.pose, aggressive ? 'jumpCatch' : 'secureCatch');
  if (aggressive) hop(cw.wr, 0.55);
  audio.uiTap();
}

function switchControl() {
  if (!controlled || phase === 'menu') return;
  const mine = teamPlayers(USER_TEAM).filter((p) => p !== ball.carrier || p.team !== drive.offense);
  if (!mine.length) return;
  // Switch to whoever is closest to the ball that isn't the current guy.
  let best = null;
  let bd = Infinity;
  for (const p of mine) {
    if (p === controlled) continue;
    const d = p.group.position.distanceTo(ball.mesh.position);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) setControlled(best);
}

function setControlled(p) {
  if (controlled) controlled.marker.visible = false;
  controlled = p;
  if (controlled) controlled.marker.visible = true;
}

function activateGamebreaker() {
  if (style.value < STYLE_MAX || gbActive() || phase !== 'live') return;
  style.value = 0;
  style.active = GB_DURATION;
  bloomPass.strength = 1.1;
  fx.shake(0.4);
  hitStop(0.12);
  cheer(1.4);
  audio.touchdown();
  ui.hud.banner('GAMEBREAKER', 'TAKE IT TO THE HOUSE');
  bannerT = 1.5;
}

// ---- Moves ---------------------------------------------------------------

function startMove(p, type) {
  if (p.moveCooldown > 0 || p.moveState || incapacitated(p)) return;
  if (type === 'truck' && p.stam.value < 20) return;
  let dir = 0;
  if (type === 'juke') {
    const attack = ATTACK_DIR[p.team];
    const lateral = stickLateral();
    if (lateral !== 0) dir = lateral * attack;
    else {
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
  const dur = type === 'spin' ? SPIN_DURATION : type === 'truck' ? TRUCK_DURATION : JUKE_DURATION;
  p.moveState = { type, t: 0, dur, dir };
  p.moveCooldown = MOVE_COOLDOWN;
  if (type === 'truck') playPose(p.pose, 'truck');
  if (type === 'truck') p.stam.value = Math.max(0, p.stam.value - 18);

  let sold = false;
  for (const d of players) {
    if (d.team === p.team || incapacitated(d)) continue;
    const dist = d.group.position.distanceTo(p.group.position);
    if (dist > MOVE_SELL_RADIUS * p.agilityMul) continue;
    if (type === 'truck') {
      // Power move: run through the guy instead of around him.
      if (dist < 2.0 && p.powerMul > d.tackleMul * 0.85) {
        knockDown(d, -1); // run straight through him
        d.tackleCooldown = 1.3;
        fx.hitFlash(d.group.position.clone().setY(1.1), 1.3);
        fx.shake(0.22);
        hitStop(0.05);
        audio.hit(1.2);
        sold = true;
      }
      continue;
    }
    if (d.velocity.lengthSq() < 0.5) continue;
    d.commitTarget.copy(d.velocity).normalize().multiplyScalar(2.8).add(p.group.position);
    d.commitT = 0.4;
    d.stumbleT = 0.85;
    sold = true;
  }
  if (sold && p === controlled) {
    addStyle(STYLE.soldMove);
    if (type !== 'truck') audio.catchBall();
  }
}

// ---- Interception / contest ----------------------------------------------

function attemptInterception() {
  if (phase !== 'live' || ball.state !== 'thrown' || play.snapping) return;
  if (!controlled || controlled.team === drive.offense || intLockout > 0) return;
  if (controlled.group.position.distanceTo(ball.mesh.position) > INT_RADIUS) return;
  intLockout = INT_LOCKOUT;
  fx.hitFlash(ball.mesh.position.clone(), 0.9);
  if (Math.random() < INT_CHANCE) {
    hitStop(0.07);
    fx.shake(0.28);
    audio.hit(1.1);
    cheer(1.2);
    holdBall(ball, controlled);
    play.intReturn = controlled.team;
    play.tackle = null;
    play.clockRunning = false;
    if (controlled.team === USER_TEAM) addStyle(STYLE.interception);
    ui.hud.banner('INTERCEPTED!');
    bannerT = 1.4;
  } else {
    // Broken up instead of picked.
    ball.velocity.multiplyScalar(0.25);
    ball.velocity.y = -2;
    audio.hit(0.6);
  }
}

// ---- Drive bookkeeping ----------------------------------------------------

function startDrive(team, losX) {
  drive.offense = team;
  const attack = ATTACK_DIR[team];
  drive.los = THREE.MathUtils.clamp(losX, -FIELD.halfLength + 1, FIELD.halfLength - 1);
  drive.down = 1;
  setSeriesTarget();
  conversion = null;
}

// Line to gain is midfield until you cross it, then it's the goal line.
function setSeriesTarget() {
  const attack = offAttack();
  if (attack * drive.los < 0) {
    drive.lineToGain = 0;
    drive.goalToGo = false;
  } else {
    drive.lineToGain = attack * FIELD.halfLength;
    drive.goalToGo = true;
  }
}

function spotBall(spotX) {
  const attack = offAttack();
  drive.los = THREE.MathUtils.clamp(spotX, -FIELD.halfLength + 1, FIELD.halfLength - 1);
  if (attack * (drive.los - drive.lineToGain) >= 0 && !drive.goalToGo) {
    drive.down = 1;
    setSeriesTarget();
    return true; // first down
  }
  return false;
}

// ---- Play lifecycle -------------------------------------------------------

function toPlayCall() {
  phase = 'playcall';
  touch.setMode('menu');
  const side = userOnOffense() ? 'offense' : 'defense';
  ui.showPlayCall({
    side,
    down: drive.down,
    toGo: drive.goalToGo ? 'GOAL' : toGoYards(),
    ballOn: conversion ? `${CONV_SPOT[conversion.points]} YD CONVERSION` : ballOnText(),
    clock: clockText(meta.clock),
    score: [score[TEAM.HOME], score[TEAM.AWAY]],
    onPick: (chosen) => {
      audio.uiTap();
      if (side === 'offense') {
        pendingCall = {
          off: chosen,
          def: pickDefensivePlay(drive.down, drive.goalToGo ? 3 : toGoYards()),
        };
      } else {
        pendingCall = {
          off: pickOffensivePlay(drive.down, drive.goalToGo ? 3 : toGoYards(), drive.goalToGo),
          def: chosen,
        };
      }
      ui.showGame();
      lineupPlay();
    },
  });
}

function lineupPlay() {
  phase = 'lineup';
  lineupTimer = 0;
  play.off = pendingCall.off;
  play.def = pendingCall.def;
  play.t = 0;
  play.thrown = false;
  play.snapping = false;
  play.handoffDone = false;
  play.handoffAt = 0;
  play.qbFree = !!play.off.qbFree;
  play.qbScrambling = false;
  play.passClock = PASS_CLOCK;
  play.clockRunning = false;
  play.tackle = null;
  play.intReturn = null;
  play.catch = null;
  ball.tipped = false;
  play.startX = drive.los;
  play.routes.clear();
  play.coverage.clear();
  play.blockers.clear();
  play.carrierSlot = Object.entries(play.off.assign).find(([, a]) => a.carry)?.[0];
  if (play.carrierSlot !== undefined) play.carrierSlot = Number(play.carrierSlot);

  const attack = offAttack();
  const offense = teamPlayers(drive.offense);
  const defense = teamPlayers(defenseTeam());
  const offFacing = attack > 0 ? Math.PI / 2 : -Math.PI / 2;

  const reset = (p, x, z, facing) => {
    p.group.position.set(x, 0, z);
    p.velocity.set(0, 0, 0);
    p.actual.set(0, 0, 0);
    p.heading = facing;
    p.group.rotation.y = facing;
    p.rig.rotation.set(0, 0, 0);
    p.stunT = p.slipT = p.stumbleT = p.commitT = p.burstT = p.diveT = 0;
    p.moveState = null;
    p.moveCooldown = 0;
    p.tackleCooldown = 0;
    p.blockedBy = null; // stale block assignments would carry between plays
    p.playingBall = false;
    p.hop = null;
    p.group.position.y = 0;
    p.down = false;
    p.downT = 0;
    p.rig.position.y = p.restRigY; // get up off the floor
    p.stam.value = Math.min(p.stam.max, p.stam.value + 34); // breathe between plays
  };

  for (const p of offense) {
    const spot = alignmentFor(play.off, p.slot, drive.los, attack);
    reset(p, spot.x, spot.z, offFacing);
  }

  // Defense mirrors the offensive alignment, then takes its assignment.
  assignDefense(defense, offense, attack, offFacing, reset);

  holdBall(ball, offensePlayer(SLOT.C));
  updateBall(ball, 0);

  setControlled(
    userOnOffense()
      ? offensePlayer(SLOT.QB)
      : nearestTo(teamPlayers(USER_TEAM), offensePlayer(SLOT.QB).group.position)
  );

  losLine.position.x = drive.los;
  markerLine.position.x = drive.lineToGain;
  markerLine.visible = !drive.goalToGo;
  refreshHUD();
  touch.setMode(userOnOffense() ? 'lineup' : 'defense');
  ui.hud.setPlayName(`${play.off.name}  vs  ${play.def.name}`);
}

function nearestTo(list, pos) {
  let best = list[0];
  let bd = Infinity;
  for (const p of list) {
    const d = p.group.position.distanceTo(pos);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// Defensive alignment + per-defender job for the called coverage.
function assignDefense(defense, offense, attack, offFacing, reset) {
  const eligibles = TARGET_SLOTS.map((s) => offense.find((p) => p.slot === s)).filter(Boolean);
  const rushers = play.def.rushers;
  const spies = play.def.spies ?? 0;
  const pool = [...defense];

  // Edge rushers line up over the ball.
  for (let i = 0; i < rushers; i++) {
    const d = pool.shift();
    const side = i === 0 ? 1 : -1;
    reset(d, drive.los + attack * 1.6, side * 2.2, -offFacing);
    play.coverage.set(d, { mode: 'rush' });
  }
  for (let i = 0; i < spies; i++) {
    const d = pool.shift();
    reset(d, drive.los + attack * 4.5, i === 0 ? -2.5 : 2.5, -offFacing);
    play.coverage.set(d, { mode: 'spy' });
  }

  // Everyone left covers: man takes a body, zone takes a landmark, and any
  // spare defender plays free safety over the top.
  const covering = [...eligibles];
  for (const d of pool) {
    const man = covering.shift();
    if (man) {
      const spot = alignmentFor(play.off, man.slot, drive.los, attack);
      const depth = man.slot === SLOT.RB ? 3.5 : 5.5;
      reset(d, drive.los + attack * depth, spot.z * 0.92, -offFacing);
      play.coverage.set(
        d,
        play.def.coverage === 'zone'
          ? { mode: 'zone', spot: ZONE_SPOTS[man.slot], target: man }
          : { mode: 'man', target: man }
      );
    } else {
      reset(d, drive.los + attack * 13, 0, -offFacing);
      play.coverage.set(d, { mode: 'free' });
    }
  }
}

function snap() {
  phase = 'live';
  play.t = 0;
  play.snapping = true;
  audio.snapHike();
  const attack = offAttack();
  const qb = offensePlayer(SLOT.QB);
  const center = offensePlayer(SLOT.C);

  const from = center.group.position.clone();
  from.y = 0.9;
  const target = qb.group.position.clone();
  target.y = 1.2;
  throwBall(ball, from, target, SNAP_FLIGHT_TIME, qb);

  // Routes and blocking assignments straight off the called play.
  for (const p of teamPlayers(drive.offense)) {
    const a = play.off.assign[p.slot];
    if (!a) continue;
    if (a.route) {
      const start = { x: p.group.position.x, z: p.group.position.z };
      play.routes.set(p, routeWaypoints(a.route, start, attack));
    } else if (a.carry) {
      const start = { x: p.group.position.x, z: p.group.position.z };
      play.routes.set(p, runWaypoints(a, start, drive.los, attack));
    } else if (a.block) {
      play.blockers.add(p);
    }
  }
  // Pass plays run on a clock; run plays don't.
  play.clockRunning = play.off.type !== 'run' && !play.off.qbFree;
}

function throwToReceiver(wr, lob = false) {
  if (ball.state !== 'held') return;
  const from = ball.mesh.position.clone();
  from.y = 1.5;
  const target = wr.group.position.clone();
  target.y = 1.15;
  const dist = from.distanceTo(target);
  const speed = lob ? THROW_SPEED * 0.72 : THROW_SPEED;
  const flightTime = THREE.MathUtils.clamp(dist / speed, 0.3, 1.6);
  target.addScaledVector(wr.velocity, flightTime * 0.92); // lead the receiver

  // Accuracy falls off with distance and with pressure in the pocket.
  const qb = ball.carrier;
  const pressure = qb ? THREE.MathUtils.clamp(2.6 - nearestOpponentDist(qb), 0, 2.6) / 2.6 : 0;
  const err = (dist / 55 + pressure * 0.45) * (lob ? 0.8 : 1);
  target.x += (Math.random() - 0.5) * err * 2.2;
  target.z += (Math.random() - 0.5) * err * 2.6;

  if (qb) playPose(qb.pose, 'throw');
  throwBall(ball, from, target, flightTime, wr);
  play.thrown = true;
  play.clockRunning = false;
  play.lastThrowAt = play.t;
  audio.throwBall();
}

// ---- Play endings ---------------------------------------------------------

function freezePlay() {
  phase = 'dead';
  deadTimer = DEAD_PAUSE;
  ball.state = 'rest';
  ball.carrier = null;
  play.tackle = null;
  play.clockRunning = false;
  style.active = 0;
  bloomPass.strength = 0.4;
  meta.clock = Math.max(0, meta.clock - RUNOFF_PER_PLAY);
  touch.setMode('menu');
}

function endPlay(reason, spotX) {
  const attack = offAttack();
  const gained = attack * (spotX - play.startX);
  meta.lastResult = { reason, spot: +spotX.toFixed(1), gain: +gained.toFixed(1) };
  freezePlay();
  audio.whistle();

  if (conversion) {
    showBanner(reason === 'incomplete' ? 'NO GOOD' : 'CONVERSION STOPPED');
    afterConversion(false);
    return;
  }

  let head = '';
  let sub = '';
  if (reason === 'incomplete') {
    head = 'INCOMPLETE';
  } else if (reason === 'sack') {
    head = 'SACK';
    sub = 'PASS CLOCK EXPIRED';
    if (!userOnOffense()) addStyle(STYLE.sack);
    spotBallAndDown(spotX, head, sub);
    return;
  } else {
    head = reason === 'oob' ? 'OUT OF BOUNDS' : gained < 0 ? 'DROPPED FOR A LOSS' : 'TACKLED';
    sub = `${gained >= 0 ? '+' : ''}${Math.round(gained)} YARDS`;
    if (userOnOffense() && gained >= 15) addStyle(STYLE.bigGain);
    if (!userOnOffense() && gained <= 1) addStyle(STYLE.stop);
    spotBallAndDown(spotX, head, sub);
    return;
  }
  // Incompletion: ball stays put, down burns.
  advanceDown(head, sub);
}

function spotBallAndDown(spotX, head, sub) {
  const first = spotBall(spotX);
  if (first) {
    showBanner('FIRST DOWN', sub);
    cheer(0.8);
    return;
  }
  advanceDown(head, sub);
}

function advanceDown(head, sub) {
  drive.down += 1;
  if (drive.down > DOWNS_PER_SET) {
    showBanner('TURNOVER ON DOWNS', head);
    cheer(0.6);
    const next = defenseTeam();
    startDrive(next, -ATTACK_DIR[next] * (FIELD.halfLength - START_FROM_OWN));
  } else {
    showBanner(head, sub);
  }
}

function touchdownFor(team) {
  freezePlay();
  score[team] += TD_POINTS;
  cheer(1.5);
  audio.touchdown();
  fx.shake(0.4);
  showBanner(`TOUCHDOWN ${TEAM_NAMES[team]}!`, `${TD_POINTS} POINTS`);
  if (team === USER_TEAM) addStyle(STYLE.touchdown);
  deadTimer = DEAD_PAUSE + 0.8;
  conversion = { team, points: null };
}

// After the score: a 1-point try from the 5 or a 2-point try from the 10.
function startConversion(points) {
  conversion.points = points;
  const team = conversion.team;
  drive.offense = team;
  drive.down = 1;
  drive.goalToGo = true;
  const attack = ATTACK_DIR[team];
  drive.los = attack * (FIELD.halfLength - CONV_SPOT[points]);
  drive.lineToGain = attack * FIELD.halfLength;
  toPlayCall();
}

function afterConversion(good) {
  const team = conversion.team;
  if (good) {
    score[team] += conversion.points;
    cheer(1);
  }
  conversion = null;
  const receiving = team === TEAM.HOME ? TEAM.AWAY : TEAM.HOME;
  startDrive(receiving, -ATTACK_DIR[receiving] * (FIELD.halfLength - START_FROM_OWN));
}

function endReturn(reason, spotX) {
  const team = play.intReturn;
  freezePlay();
  audio.whistle();
  if (conversion) {
    showBanner('TURNOVER');
    afterConversion(false);
    return;
  }
  showBanner(reason === 'oob' ? 'RETURN OUT OF BOUNDS' : 'RETURNER DOWN', 'TAKEOVER');
  startDrive(team, spotX);
}

function showBanner(text, sub = '') {
  ui.hud.banner(text, sub);
  bannerT = 0;
}

// ---- Powerups -------------------------------------------------------------

function onPickup(player, type) {
  ui.hud.toast(`${PICKUP_LABELS[type]} — ${TEAM_NAMES[player.team]}`);
  fx.hitFlash(player.group.position.clone().setY(1.2), 1.1);
  audio.pickup();
  if (type === 'turbo') player.turboT = TURBO_DURATION;
  else powerups.spawnHazard(type, player);
}

function onHazardHit(hazard, victim) {
  if (gbActive() && victim === ball.carrier && victim.team === USER_TEAM) return;
  fx.hitFlash(victim.group.position.clone().setY(1), hazard.type === 'trap' ? 1.4 : 1);
  audio.hit(0.8);
  if (hazard.type === 'trap') {
    victim.stunT = STUN_DURATION;
    fx.shake(0.18);
    hitStop(0.05);
  } else {
    victim.slipT = SLIP_DURATION;
  }
  victim.velocity.set(0, 0, 0);
}

// ---- Tackling -------------------------------------------------------------

// Put a player on the ground. dir +1 falls forward, -1 goes over backwards.
// He stays down until the next lineup resets him.
// A short vertical hop. Nothing else writes group.position.y, so a jump
// ball can simply own it for half a second.
function hop(p, height = 0.5, dur = 0.55) {
  p.hop = { t: 0, dur, height };
}

function knockDown(p, dir) {
  p.down = true;
  p.downT = 0;
  p.fallDir = dir;
  p.pose.name = null; // the down pose takes over from whatever was playing
  p.velocity.set(0, 0, 0);
  p.actual.set(0, 0, 0);
}

function tryStartTackle(defender, carrier) {
  if (play.tackle || defender.tackleCooldown > 0 || incapacitated(defender) || defender.down) return;

  // Classify by how the defender's approach lines up with the carrier's
  // momentum: chasing from behind is a drag-down, meeting him head-on is a
  // wrap, anything in between is a shoestring hit at an angle.
  scratch.copy(carrier.group.position).sub(defender.group.position);
  scratch.y = 0;
  scratch.normalize();
  scratch2.copy(carrier.actual);
  scratch2.y = 0;
  let type = 'wrap';
  const runSpeed = scratch2.length();
  if (runSpeed > 0.6) {
    scratch2.normalize();
    const dot = scratch.dot(scratch2);
    type = dot > 0.5 ? 'drag' : dot < -0.35 ? 'wrap' : 'shoestring';
  }

  play.tackle = {
    defender,
    helpers: new Set(),
    t: TACKLE_WINDOW,
    sprintHeld: false,
    type,
    // Read the carrier's speed at contact: by the time the tackle resolves
    // the drag has bled it off, which zeroed the fall-forward bonus.
    speed0: carrier.actual.length(),
    // Forward progress: remember the furthest point he actually reached.
    best: carrier.group.position.x,
  };
  playPose(defender.pose, 'dive');
  fx.hitFlash(carrier.group.position.clone().lerp(defender.group.position, 0.5).setY(1), 0.9);
  hitStop(0.04);
  audio.hit(type === 'wrap' ? 0.9 : 0.7);
}

// When the window opens, every defender near the arrival point decides
// whether to go for the ball or stay on the man. Going for it wins picks
// and loses leverage: a defender who gambles and misses is out of the play.
function decideBallPlay() {
  const spot = ballLandingSpot();
  for (const d of teamPlayers(defenseTeam())) {
    d.playingBall = false;
    if (incapacitated(d) || d.down) continue;
    const toSpot = d.group.position.distanceTo(spot);
    const toWr = ball.intended ? d.group.position.distanceTo(ball.intended.group.position) : 99;
    if (Math.min(toSpot, toWr) > 6.5) continue;
    meta.ballPlayConsidered = (meta.ballPlayConsidered ?? 0) + 1;
    const skill =
      (d.character?.attr.tackling ?? 60) * 0.6 + (d.character?.attr.hands ?? 50) * 0.4;
    // Roughly half of defenders in range commit. Below this the defence
    // essentially never attacked the ball and picks did not happen.
    d.playingBall = Math.random() < THREE.MathUtils.clamp((skill - 30) / 80, 0.15, 0.85);
    if (d.playingBall) meta.ballPlayCommitted = (meta.ballPlayCommitted ?? 0) + 1;
  }
}

// Caught, broken up, or picked. Resolved once, at the ball.
function resolveCatch(wr) {
  const cw = play.catch;
  let db = null;
  let gap = CONTEST_RADIUS;
  for (const d of teamPlayers(defenseTeam())) {
    if (incapacitated(d) || d.down) continue;
    const dist = d.group.position.distanceTo(wr.group.position);
    if (dist >= CONTEST_RADIUS) continue;
    // A defender who went up for the ball is the one contesting it, even if
    // someone else ended up a half step nearer the receiver.
    const better = !db || (d.playingBall && !db.playingBall) ||
      (d.playingBall === db.playingBall && dist < gap);
    if (better) { db = d; gap = dist; }
  }

  const timing =
    cw?.tapAt == null ? 'auto' : cw.tapAt >= GREEN_LO && cw.tapAt <= GREEN_HI ? 'green' : 'yellow';
  const type = cw?.type ?? 'possession';

  // How well the receiver attacks the ball.
  let wrScore = (wr.character?.attr.hands ?? 70) * 0.012 + wr.handsMul * 0.5;
  if (timing === 'green') wrScore += 0.38;
  else if (timing === 'yellow') wrScore += 0.12;
  if (type === 'aggressive') wrScore += 0.22;
  else if (type === 'possession') wrScore += 0.12;

  const finish = (caught, outcome) => {
    meta.catchLog.push({
      outcome, type, timing, contested: !!db,
      gap: db ? +gap.toFixed(2) : null,
      playingBall: db ? !!db.playingBall : null,
      wr: wr.character?.name ?? null,
      db: db?.character?.name ?? null,
    });
    play.catch = null;
    for (const d of players) d.playingBall = false;
    return caught;
  };

  if (!db) {
    // Uncontested: only his hands can beat him.
    let drop = wr.dropChance;
    drop *= timing === 'green' ? 0.25 : timing === 'yellow' ? 0.7 : 1;
    if (type === 'aggressive') drop *= 1.6;
    if (Math.random() < drop) {
      tipBall(0.6);
      ui.hud.toast(`DROPPED BY ${wr.character?.name ?? ''}`);
      audio.hit(0.4);
      return finish(false, 'drop');
    }
    completeCatch(wr, type, timing);
    return finish(true, 'catch');
  }

  // Contested. Closer defender and a defender playing the ball both matter.
  let dbScore = (db.character?.attr.tackling ?? 60) * 0.009 + db.handsMul * 0.38;
  dbScore *= db.playingBall ? 1.3 : 0.8;
  dbScore *= THREE.MathUtils.clamp(1.45 - gap / CONTEST_RADIUS, 0.45, 1.45);

  const total = wrScore + dbScore || 1;
  let pInt = BASE_INT_CONTESTED * (dbScore / total) * (db.playingBall ? 2.2 : 0.5);
  if (type === 'possession') pInt *= 0.75;      // securing it protects the ball
  else if (type === 'aggressive') pInt *= 1.15; // going up for it risks more
  pInt = THREE.MathUtils.clamp(pInt, 0, 0.6);
  const pCatch = Math.min(1 - pInt, (wrScore / total) * (type === 'aggressive' ? 1.08 : 1));

  const roll = Math.random();
  playPose(db.pose, db.playingBall ? 'jumpCatch' : 'deflect');
  hop(db, db.playingBall ? 0.45 : 0.3);

  if (roll < pInt) {
    interceptBall(db);
    return finish(false, 'interception');
  }
  if (roll < pInt + pCatch) {
    completeCatch(wr, type, timing, true);
    return finish(true, 'contested catch');
  }
  // Broken up: the ball comes loose and is live until it lands.
  tipBall(1.0);
  fx.hitFlash(wr.group.position.clone().setY(1.6), 1.2);
  audio.hit(0.7);
  cheer(0.5);
  ui.hud.toast('BROKEN UP');
  if (db.team === USER_TEAM) addStyle(STYLE.stop);
  return finish(false, 'broken up');
}

function completeCatch(wr, type, timing, contested = false) {
  holdBall(ball, wr);
  ball.tipped = false;
  playPose(wr.pose, type === 'aggressive' ? 'jumpCatch' : 'secureCatch');
  if (type === 'aggressive') hop(wr, 0.55);
  // Run-after-catch keeps the momentum he had; the others cost a beat.
  if (type !== 'rac') wr.actual.multiplyScalar(type === 'possession' ? 0.45 : 0.7);
  audio.catchBall();
  cheer(contested ? 0.9 : 0.5);
  if (wr.team === USER_TEAM) addStyle(contested ? STYLE.bigGain : STYLE.completion);
  const label = contested
    ? 'CONTESTED CATCH!'
    : type === 'aggressive' ? 'HIGH POINT!'
      : type === 'rac' ? 'CAUGHT IN STRIDE' : 'CAUGHT';
  ui.hud.toast(timing === 'green' ? `${label} (CLEAN)` : label);
  if (wr.team === USER_TEAM && wr !== controlled) setControlled(wr);
}

// Knock the ball loose. It stays live until it hits the ground, so a tipped
// pass can still be come down with — by either side.
function tipBall(power) {
  ball.state = 'thrown';
  ball.carrier = null;
  ball.intended = null;
  ball.tipped = true;
  ball.velocity.set(
    (Math.random() - 0.5) * 4 * power,
    2.4 * power + 1,
    (Math.random() - 0.5) * 4 * power
  );
  ball.airTime = 0;
}

function interceptBall(db) {
  holdBall(ball, db);
  ball.tipped = false;
  play.intReturn = db.team;
  play.tackle = null;
  play.clockRunning = false;
  hitStop(0.08);
  fx.shake(0.3);
  fx.hitFlash(db.group.position.clone().setY(1.6), 1.5);
  audio.hit(1.1);
  cheer(1.3);
  if (db.team === USER_TEAM) {
    addStyle(STYLE.interception);
    setControlled(db);
  }
  ui.hud.banner('INTERCEPTED!', db.character?.name ?? '');
  bannerT = 1.4;
}

function resolveTackle() {
  const { defender, sprintHeld, type, helpers, best, speed0 } = play.tackle;
  const carrier = ball.carrier;
  play.tackle = null;
  if (!carrier) return;

  const isUser = carrier === controlled;
  const pile = helpers.size;
  // One extra man drags you down but can still be run through; two or more
  // is a genuine gang tackle. Blocking breaks on a single helper killed the
  // running game outright — a 7-on-7 field almost always has a second
  // defender nearby.
  const gang = pile >= 2;
  // Gamebreaker and powerup turbo are automatic breaks. Otherwise the user
  // has to be actively on the turbo with gas left, and it costs stamina —
  // but nobody shrugs off two or three men without a gamebreaker.
  const unstoppable = gbActive() && carrier.team === USER_TEAM;
  let breaks = unstoppable || (carrier.turboT > 0 && !gang);
  if (!breaks && !gang && isUser && sprintHeld && carrier.stam.tier !== TIERS.GASSED) {
    breaks = true;
    carrier.stam.value = Math.max(
      0,
      carrier.stam.value - (TACKLE_BREAK_COST * defender.tackleMul) / carrier.powerMul
    );
  }
  if (!breaks && !gang && !isUser && carrier.team !== USER_TEAM) {
    // A drag-down from behind is the easiest to run through.
    breaks = Math.random() < ((type === 'drag' ? 0.34 : 0.24) * carrier.powerMul) / defender.tackleMul;
  }

  const contact = carrier.group.position.clone().lerp(defender.group.position, 0.5).setY(1.1);

  if (breaks) {
    defender.commitTarget
      .copy(defender.actual.lengthSq() > 0.2 ? defender.actual : carrier.actual)
      .normalize().multiplyScalar(2.6).add(carrier.group.position);
    defender.commitT = 0.35;
    defender.tackleCooldown = 1.2;
    // Running straight through a man puts him on his back; slipping a
    // shoestring grab just leaves him stumbling.
    if (unstoppable || type === 'wrap') knockDown(defender, -1);
    else defender.stumbleT = 1.0;
    carrier.stumbleT = unstoppable ? 0 : 0.45;
    fx.hitFlash(contact, 1.35);
    fx.shake(0.24);
    hitStop(0.06);
    audio.hit(1);
    cheer(0.55);
    if (carrier.team === USER_TEAM) addStyle(STYLE.brokenTackle);
    return;
  }

  // Tackle sticks. Who goes which way depends on the hit.
  const attack = ATTACK_DIR[play.intReturn ?? drive.offense];
  const headOn = type === 'wrap';
  knockDown(carrier, headOn ? -1 : 1);
  knockDown(defender, headOn ? 1 : -1);
  for (const h of helpers) knockDown(h, headOn ? 1 : -1);

  // Forward progress, plus the yard or so you get falling forward. A
  // head-on wrap stops him where he stood; being dragged down from behind
  // carries him on.
  const momentum = Math.min(1, speed0 / SPRINT_SPEED[TIERS.TURBO]);
  const extra = headOn ? 0 : FALL_FORWARD * momentum * (type === 'drag' ? 1 : 0.6);
  const progress = attack > 0 ? Math.max(best, carrier.group.position.x) : Math.min(best, carrier.group.position.x);
  const spot = progress + attack * extra;

  meta.lastTackle = {
    type, gang: pile, extra: +extra.toFixed(2),
    spot: +spot.toFixed(2), contact: +carrier.group.position.x.toFixed(2),
  };
  const power = gang ? 1.5 : headOn ? 1.3 : 1;
  fx.hitFlash(contact, 1.5 * power);
  fx.shake(0.3 * power);
  hitStop(0.07 * power);
  audio.hit(1.2 * power);
  cheer(gang ? 0.7 : 0.4);
  if (gang) ui.hud.toast('GANG TACKLE');
  else if (headOn) ui.hud.toast('WRAPPED UP');
  else if (type === 'drag') ui.hud.toast('DRAGGED DOWN');

  if (play.intReturn !== null) endReturn('tackle', spot);
  else endPlay('tackle', spot);
}

// ---- AI -------------------------------------------------------------------

const scratch = new THREE.Vector3();
const scratch2 = new THREE.Vector3();

// Direction toward grass: push away from every nearby opponent, add a
// bias, and stay off the sideline. Used by receivers once their route is
// run and during a scramble drill.
const _open = new THREE.Vector3();
function openSpaceDir(p, biasX, biasZ) {
  _open.set(biasX, 0, biasZ);
  for (const d of players) {
    if (d.team === p.team || d.down) continue;
    const dx = p.group.position.x - d.group.position.x;
    const dz = p.group.position.z - d.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 9 || dist < 0.01) continue;
    const w = ((9 - dist) / 9) ** 2;
    _open.x += (dx / dist) * w * 2.4;
    _open.z += (dz / dist) * w * 2.4;
  }
  const z = p.group.position.z;
  const edge = FIELD.halfWidth - 3;
  if (Math.abs(z) > edge) _open.z -= Math.sign(z) * (Math.abs(z) - edge) * 1.6;
  if (_open.lengthSq() < 0.0001) _open.set(biasX || 1, 0, 0);
  return _open.normalize();
}

// Closest any defender gets to the line from the passer to the receiver.
// A low number means the ball gets batted down on the way.
function laneClearance(from, wr) {
  const ax = from.group.position.x;
  const az = from.group.position.z;
  const vx = wr.group.position.x - ax;
  const vz = wr.group.position.z - az;
  const len2 = vx * vx + vz * vz || 1;
  let worst = Infinity;
  for (const d of teamPlayers(defenseTeam())) {
    if (incapacitated(d) || d.down) continue;
    // Only the middle of the flight path counts. Sampling the whole segment
    // always caught the defender draped on the receiver, which made every
    // throw look blocked and left the quarterback taking sacks instead.
    const t = THREE.MathUtils.clamp(
      ((d.group.position.x - ax) * vx + (d.group.position.z - az) * vz) / len2,
      0.12, 0.82
    );
    const px = ax + vx * t;
    const pz = az + vz * t;
    worst = Math.min(worst, Math.hypot(d.group.position.x - px, d.group.position.z - pz));
  }
  return worst;
}

function coverageCount(wr, radius = 4) {
  let n = 0;
  for (const d of teamPlayers(defenseTeam())) {
    if (incapacitated(d) || d.down) continue;
    if (d.group.position.distanceTo(wr.group.position) < radius) n++;
  }
  return n;
}

function nearestOpponentDist(p) {
  let best = Infinity;
  for (const o of players) {
    if (o.team === p.team) continue;
    best = Math.min(best, o.group.position.distanceTo(p.group.position));
  }
  return best;
}

// Where a thrown ball will cross catching height, from its current state.
const landing = new THREE.Vector3();
function ballLandingSpot() {
  const g = 20; // matches GRAVITY in ball.js
  const { x, y, z } = ball.mesh.position;
  const v = ball.velocity;
  const catchY = 1.1;
  const disc = v.y * v.y - 2 * g * (catchY - y);
  const t = disc <= 0
    ? Math.max(0, v.y / g) // never gets that high: use the apex
    : (v.y + Math.sqrt(disc)) / g;
  return landing.set(x + v.x * t, catchY, z + v.z * t);
}

// Seconds until the ball falls back to catching height.
function ballArrivalTime() {
  const g = 20;
  const v = ball.velocity;
  const disc = v.y * v.y - 2 * g * (1.1 - ball.mesh.position.y);
  if (disc <= 0) return Math.max(0, v.y / g);
  return Math.max(0, (v.y + Math.sqrt(disc)) / g);
}

function trackBall(p) {
  const spot = ballLandingSpot();
  scratch.set(spot.x - p.group.position.x, 0, spot.z - p.group.position.z);
  const d = scratch.length();
  if (d < 0.2) {
    p.velocity.set(0, 0, 0);
    return;
  }
  // Sprint to the spot, then settle under it.
  p.velocity.copy(scratch.normalize()).multiplyScalar(d > 1 ? WR_SPEED * 1.12 : WR_SPEED * 0.5);
}

function followRoute(p, speed = WR_SPEED) {
  const route = play.routes.get(p);
  const attack = ATTACK_DIR[p.team];
  const qb = offensePlayer(SLOT.QB);

  // Scramble drill: once the quarterback breaks the pocket the route is
  // dead. Work back across into his vision and find grass.
  if (play.qbScrambling && qb && ball.carrier === qb) {
    const toward = Math.sign(qb.group.position.z - p.group.position.z) || 1;
    p.velocity
      .copy(openSpaceDir(p, attack * 0.4, toward * 0.9))
      .multiplyScalar(speed * 0.95);
    return;
  }
  if (!route || !route.length) {
    // Route run: uncover rather than standing still or drifting blindly.
    p.velocity.copy(openSpaceDir(p, attack * 1.2, 0)).multiplyScalar(speed * 0.7);
    return;
  }
  scratch.set(route[0].x - p.group.position.x, 0, route[0].z - p.group.position.z);
  if (scratch.length() < 0.7 && route.length > 1) route.shift();
  p.velocity.copy(scratch.normalize()).multiplyScalar(speed);
}

function updateBlocker(p) {
  // Blockers pick up the nearest threat to whoever they're protecting.
  const a = play.off.assign[p.slot];
  const protectee = a?.block === 'carrier' && ball.carrier ? ball.carrier : offensePlayer(SLOT.QB);
  if (!protectee) return;
  // Block the man in the way of where the carrier is headed.
  let threat = null;
  let bd = Infinity;
  const attack = ATTACK_DIR[p.team];
  scratch2.copy(protectee.group.position);
  scratch2.x += attack * 4;
  for (const d of teamPlayers(defenseTeam())) {
    if (incapacitated(d) || d.down) continue;
    if (d.blockedBy && d.blockedBy !== p && d.blockedBy.group.position.distanceTo(d.group.position) < 2.5) continue;
    // Pick by who gets there first, not who is nearest: a fast man eight
    // yards out is a bigger problem than a slow one at five.
    const eta =
      d.group.position.distanceTo(scratch2) / (DEF_SPEED * (d.speedMul ?? 1));
    if (eta < bd) { bd = eta; threat = d; }
  }
  if (!threat) {
    p.velocity.set(0, 0, 0);
    return;
  }
  threat.blockedBy = p;
  // Stand between the threat and the man being protected.
  scratch.copy(threat.group.position).sub(protectee.group.position).setLength(1.5);
  scratch.add(protectee.group.position).sub(p.group.position);
  scratch.y = 0;
  if (scratch.length() < 0.2) {
    p.velocity.set(0, 0, 0);
    return;
  }
  p.velocity.copy(scratch.normalize()).multiplyScalar(BLOCKER_SPEED * (0.8 + 0.3 * p.blockMul));
}

function resolveBlocks() {
  for (const b of play.blockers) {
    if (incapacitated(b)) continue;
    for (const d of teamPlayers(defenseTeam())) {
      const dx = d.group.position.x - b.group.position.x;
      const dz = d.group.position.z - b.group.position.z;
      const dist = Math.hypot(dx, dz);
      const radius = BLOCK_RADIUS * b.blockMul;
      if (dist > 0.001 && dist < radius) {
        const push = (radius - dist) / dist;
        d.group.position.x += dx * push;
        d.group.position.z += dz * push;
        // A good blocker stones his man; a poor one barely slows him.
        d.velocity.multiplyScalar(THREE.MathUtils.clamp(0.9 - 0.45 * b.blockMul, 0.2, 0.85));
      }
    }
  }
}

function updateAICarrier(p) {
  const attack = ATTACK_DIR[p.team];
  // Follow the designed lane until it runs out, then read the field.
  const route = play.routes.get(p);
  if (route && route.length > 1) {
    followRoute(p, SPRINT_SPEED[TIERS.REGULAR]);
    return;
  }
  scratch.set(attack, 0, 0);
  let nearest = null;
  let nd = Infinity;
  for (const o of players) {
    if (o.team === p.team) continue;
    const d = o.group.position.distanceTo(p.group.position);
    if (d < nd) { nd = d; nearest = o; }
  }
  if (nearest && nd < 4.5) {
    const dz = p.group.position.z - nearest.group.position.z;
    scratch.z = (dz >= 0 ? 1 : -1) * 0.9;
    // Hug the open sideline rather than running into the boundary.
    if (Math.abs(p.group.position.z) > FIELD.halfWidth - 3) scratch.z = -Math.sign(p.group.position.z) * 0.9;
    scratch.normalize();
  }
  p.velocity.copy(scratch).multiplyScalar(p.turboT > 0 ? SPRINT_SPEED[TIERS.TURBO] : WR_SPEED);
}

function updateAIQuarterback(qb) {
  if (play.qbScrambling) {
    updateAICarrier(qb);
    return;
  }
  // Slide in the pocket away from pressure.
  const pressure = nearestOpponentDist(qb);
  if (pressure < 3) {
    let threat = null;
    let bd = Infinity;
    for (const d of teamPlayers(defenseTeam())) {
      const dist = d.group.position.distanceTo(qb.group.position);
      if (dist < bd) { bd = dist; threat = d; }
    }
    scratch.copy(qb.group.position).sub(threat.group.position);
    scratch.y = 0;
    qb.velocity.copy(scratch.normalize()).multiplyScalar(WALK_SPEED * 0.9);
  } else {
    qb.velocity.set(0, 0, 0);
  }
  if (play.thrown || ball.carrier !== qb) return;

  if (play.t > QB_MIN_HOLD) {
    // Read the field rather than just picking whoever has the most air:
    // throwing lane, how many bodies are around him, how far he has to
    // heave it, whose hands he trusts, and whether the down needs yards.
    const late = play.clockRunning && play.passClock < 1.6;
    const needed = drive.down >= 3 && !drive.goalToGo ? toGoYards() : 0;
    let best = null;
    let bestScore = -Infinity;
    for (const slot of TARGET_SLOTS) {
      const wr = offensePlayer(slot);
      if (!wr || incapacitated(wr) || wr.down) continue;
      const open = nearestOpponentDist(wr);
      const lane = laneClearance(qb, wr);
      const depth = offAttack() * (wr.group.position.x - drive.los);
      const dist = wr.group.position.distanceTo(qb.group.position);
      if (lane < 0.9 && !late) continue;     // it gets batted down
      if (open < QB_OPEN_DIST && !late) continue;
      let score = open * 1.5 + lane * 0.9 + depth * 0.5;
      score += (wr.character?.attr.hands ?? 70) * 0.035; // trust good hands
      score -= coverageCount(wr) * 2.4;                  // never into a crowd
      score -= Math.max(0, dist - 24) * 0.7;             // don't heave it
      if (needed > 0 && depth < needed) score -= 4;      // get the sticks
      if (late) score += Math.max(0, 9 - dist) * 0.8;    // take the checkdown
      if (score > bestScore) { bestScore = score; best = wr; }
    }
    if (!best && late) {
      // Clock gone and nobody is open: get rid of it at the shortest,
      // cleanest option rather than eating the sack.
      let fallback = null;
      let fbScore = -Infinity;
      for (const slot of TARGET_SLOTS) {
        const wr = offensePlayer(slot);
        if (!wr || incapacitated(wr) || wr.down) continue;
        const sc =
          laneClearance(qb, wr) * 1.5 +
          nearestOpponentDist(wr) -
          wr.group.position.distanceTo(qb.group.position) * 0.35;
        if (sc > fbScore) { fbScore = sc; fallback = wr; }
      }
      best = fallback;
    }
    if (best) {
      throwToReceiver(best, best.group.position.distanceTo(qb.group.position) > 16);
      return;
    }
  }
  // Clock about to pop: take off and run.
  if (play.clockRunning && play.passClock < 1.35) play.qbScrambling = true;
}

function updateDefender(d) {
  const job = play.coverage.get(d) || { mode: 'man' };
  if (d.commitT > 0) {
    scratch.copy(d.commitTarget).sub(d.group.position);
    scratch.y = 0;
    if (scratch.length() > 0.2) {
      d.velocity.copy(scratch.normalize()).multiplyScalar(DEF_SPEED);
      return;
    }
  }
  const attack = offAttack();
  const carrier = ball.carrier;
  const qb = offensePlayer(SLOT.QB);
  const carrierLoose =
    carrier && (carrier.slot !== SLOT.QB || play.qbScrambling || attack * (carrier.group.position.x - drive.los) > 0);

  // Everyone converges once the ball is loose — on a reaction delay, and on
  // an angle, so there's an actual running lane to find.
  if (carrierLoose && shouldPursue(d, carrier)) {
    pursueCarrier(d, carrier);
    return;
  }
  if (ball.state === 'thrown' && play.t - play.lastThrowAt > 0.12) {
    // A defender who committed to the ball attacks where it is coming down,
    // not where the receiver happens to be. This is what gives the defence
    // a genuine shot at an interception.
    if (d.playingBall || ball.tipped) {
      pursue(d, ballLandingSpot());
      return;
    }
    if (ball.intended) {
      const dist = d.group.position.distanceTo(ball.intended.group.position);
      if (dist < 12 || job.target === ball.intended) {
        pursue(d, ball.intended.group.position);
        return;
      }
    }
  }

  if (job.mode === 'rush') {
    if (play.t < play.def.rushAt) {
      // Hold the edge until the count is up.
      scratch.set(drive.los + attack * 1.4, 0, d.group.position.z);
      pursue(d, scratch, DEF_SPEED * 0.5);
      return;
    }
    // Rush to a point just outside the quarterback's near shoulder rather
    // than straight at him, so he can't simply step around the charge.
    aimAt.copy(qb.group.position);
    const side = Math.sign(d.group.position.z - qb.group.position.z) || 1;
    aimAt.z += side * 0.9;
    aimAt.x -= attack * 0.4;
    pursue(d, aimAt);
    return;
  }
  if (job.mode === 'spy') {
    // A spy contains: he mirrors the ball across the field but holds his own
    // side of the line until it crosses. He is not a free rusher — walking
    // him into the backfield turned RUN CONTAIN into a two-man sack party.
    const mark = carrier ?? qb;
    const markPast = attack * (mark.group.position.x - drive.los) > 0;
    scratch.set(
      markPast ? mark.group.position.x : drive.los + attack * 2.0,
      0,
      mark.group.position.z
    );
    pursue(d, scratch, DEF_SPEED * 0.92);
    return;
  }
  if (job.mode === 'zone') {
    scratch.set(drive.los + attack * job.spot[0], 0, job.spot[1] * attack);
    // Carry the deepest receiver who enters the zone, and hand him off —
    // sinking back to the landmark — once he runs out of it.
    let claim = null;
    let deepest = -Infinity;
    for (const slot of TARGET_SLOTS) {
      const wr = offensePlayer(slot);
      if (!wr || wr.down || incapacitated(wr)) continue;
      if (wr.group.position.distanceTo(scratch) > 7.5) continue;
      const depth = attack * (wr.group.position.x - drive.los);
      if (depth > deepest) { deepest = depth; claim = wr; }
    }
    if (claim) {
      aimAt.copy(claim.group.position);
      aimAt.x += attack * 0.8;
      aimAt.addScaledVector(claim.actual, 0.12);
      pursue(d, aimAt);
    } else {
      pursue(d, scratch);
    }
    return;
  }
  if (job.mode === 'free') {
    // Free safety: sit on top of the deepest receiver.
    let deepest = null;
    let best = -Infinity;
    for (const slot of TARGET_SLOTS) {
      const wr = offensePlayer(slot);
      if (!wr) continue;
      const depth = attack * (wr.group.position.x - drive.los);
      if (depth > best) { best = depth; deepest = wr; }
    }
    scratch.copy(deepest ? deepest.group.position : qb.group.position);
    scratch.x += attack * 5;
    pursue(d, scratch);
    return;
  }
  // Man: trail the receiver, a step toward your own goal.
  const man = job.target;
  if (!man) {
    pursue(d, qb.group.position);
    return;
  }
  // Leverage: a defender slower than his man has to play off him, a faster
  // one can sit on top of him. Cushion is yards toward his own goal.
  const gap = (man.speedMul ?? 1) - (d.speedMul ?? 1);
  const cushion = THREE.MathUtils.clamp(0.9 + gap * 7, 0.3, 3.4);
  scratch.copy(man.group.position);
  scratch.x += attack * cushion;
  scratch.addScaledVector(man.actual, 0.14); // jump the route a little
  pursue(d, scratch);
}

// Chase the carrier where he's going to be, not where he is. Without this
// every defender runs at his current spot and the whole pile collapses on
// the handoff, which is what made designed runs unplayable.
const leadPos = new THREE.Vector3();
const aimAt = new THREE.Vector3();
function pursueCarrier(d, carrier, speed = DEF_SPEED) {
  // Solve for where the carrier will be when this defender can actually
  // get there, iterating once on the time. A slow man has to aim much
  // further ahead than a fast one — that's the whole idea of an angle.
  const mySpeed = Math.max(0.1, speed * (d.speedMul ?? 1));
  let t = d.group.position.distanceTo(carrier.group.position) / mySpeed;
  for (let i = 0; i < 2; i++) {
    leadPos.copy(carrier.group.position).addScaledVector(carrier.actual, t);
    t = d.group.position.distanceTo(leadPos) / mySpeed;
  }
  leadPos.copy(carrier.group.position).addScaledVector(carrier.actual, Math.min(t, 1.2));
  leadPos.z = THREE.MathUtils.clamp(leadPos.z, -FIELD.halfWidth, FIELD.halfWidth);
  pursue(d, leadPos, speed);
}

// A coverage defender doesn't abandon his man the instant the ball moves:
// he needs the carrier to cross the line, get close, or beat the clock.
function shouldPursue(d, carrier) {
  const job = play.coverage.get(d);
  if (job?.mode === 'rush' || job?.mode === 'spy') return true;
  const attack = offAttack();
  if (attack * (carrier.group.position.x - drive.los) > -0.5) return true;
  if (job?.mode === 'free') return false; // safety stays on top
  const gap = d.group.position.distanceTo(carrier.group.position);
  return gap < 9 && play.t > (play.handoffAt ?? 0) + 0.4;
}

function pursue(d, targetPos, speed = DEF_SPEED) {
  scratch2.copy(targetPos).sub(d.group.position);
  scratch2.y = 0;
  if (scratch2.length() < 0.25) {
    d.velocity.set(0, 0, 0);
    return;
  }
  const s = d.stumbleT > 0 ? speed * 0.45 : speed;
  d.velocity.copy(scratch2.normalize()).multiplyScalar(s);
}

// ---- User movement --------------------------------------------------------

const moveDir = new THREE.Vector3();

function stickLateral() {
  if (touch.stick.x > 0.35) return 1;
  if (touch.stick.x < -0.35) return -1;
  if (keys.has('arrowright') || keys.has('d')) return 1;
  if (keys.has('arrowleft') || keys.has('a')) return -1;
  return 0;
}

function readMoveInput(attack) {
  moveDir.set(0, 0, 0);
  // The stick and the arrows are both read in camera space: up is downfield.
  if (touch.stick.active) {
    moveDir.x += -touch.stick.y * attack;
    moveDir.z += touch.stick.x * attack;
  }
  if (keys.has('arrowup') || keys.has('w')) moveDir.x += attack;
  if (keys.has('arrowdown') || keys.has('s')) moveDir.x -= attack;
  if (keys.has('arrowleft')) moveDir.z -= attack;
  if (keys.has('arrowright')) moveDir.z += attack;
  if (moveDir.lengthSq() > 1) moveDir.normalize();
  return moveDir;
}

function updateControlled(dt) {
  if (!controlled) return TIERS.REGULAR;
  const attack = viewAttack();
  const dir = readMoveInput(attack);

  const canMove =
    phase === 'live' &&
    !(play.snapping && controlled.slot === SLOT.QB && controlled.team === drive.offense) &&
    !incapacitated(controlled) &&
    !controlled.moveState;
  const moving = dir.lengthSq() > 0.0001 && canMove;
  const wantSprint = keys.has('shift') || touch.sprintHeld;
  const sprinting = moving && wantSprint && controlled.turboT <= 0 && !gbActive();
  const tier = controlled.stam.update(dt, sprinting);

  let speed;
  if (gbActive() && controlled.team === USER_TEAM) speed = SPRINT_SPEED[TIERS.TURBO] * 1.15;
  else if (controlled.turboT > 0) speed = SPRINT_SPEED[TIERS.TURBO];
  else speed = sprinting ? SPRINT_SPEED[tier] : WALK_SPEED;
  speed *= world?.surface.grip ?? 1;
  if (controlled.stumbleT > 0) speed *= 0.6;
  if (controlled.burstT > 0) speed *= 1.3;
  if (play.tackle && ball.carrier === controlled && !gbActive()) speed *= TACKLE_DRAG;

  if (moving) {
    // Analog on a thumbstick, but full speed by ~80% deflection — squaring
    // the magnitude (which copy+scale-by-length does) feels like mud.
    const mag = THREE.MathUtils.clamp(dir.length() * 1.25, 0, 1);
    controlled.velocity.copy(dir).normalize().multiplyScalar(speed * mag);
  } else if (canMove) controlled.velocity.set(0, 0, 0);
  return controlled.turboT > 0 || gbActive() ? TIERS.TURBO : tier;
}

// ---- Live play ------------------------------------------------------------

function updateLivePlay(dt) {
  play.t += dt;
  intLockout = Math.max(0, intLockout - dt);
  meta.clock = Math.max(0, meta.clock - dt);

  const attack = offAttack();
  const qb = offensePlayer(SLOT.QB);

  // Pass clock: 7-on-7's answer to a pass rush. Crossing the line turns the
  // play into a run, so the clock stops rather than charging a phantom sack.
  if (play.clockRunning && ball.carrier === qb && !play.thrown) {
    if (attack * (qb.group.position.x - drive.los) > 0.5) {
      play.clockRunning = false;
      play.qbScrambling = true;
    } else {
      play.passClock -= dt;
      if (play.passClock <= 0) {
        endPlay('sack', qb.group.position.x);
        return;
      }
    }
  }

  // Automatic handoff / pitch on a designed run.
  if (!play.handoffDone && play.carrierSlot != null && play.off.handoff != null) {
    if (play.t >= play.off.handoff && ball.carrier === qb) {
      const back = offensePlayer(play.carrierSlot);
      if (back && back !== qb) {
        holdBall(ball, back);
        audio.catchBall();
        if (back.team === USER_TEAM) setControlled(back);
            } else if (back === qb) {
            }
      play.handoffDone = true;
      play.handoffAt = play.t;
      play.snapping = false;
    }
  }

  if (play.intReturn !== null) {
    const carrier = ball.carrier;
    const retAttack = ATTACK_DIR[play.intReturn];
    for (const p of players) {
      if (p === controlled || incapacitated(p) || p.moveState || !carrier) continue;
      if (p === carrier) {
        updateAICarrier(p);
      } else if (p.team !== play.intReturn) {
        pursueCarrier(p, carrier);
      } else {
        scratch.set(carrier.group.position.x + retAttack * 5, 0, p.group.position.z);
        pursue(p, scratch, DEF_SPEED * 0.9);
      }
    }
  } else {
    for (const p of teamPlayers(drive.offense)) {
      if (p === controlled || incapacitated(p) || p.moveState) continue;
      if (ball.carrier === p) {
        if (p.slot === SLOT.QB && !play.qbScrambling && !play.handoffDone) updateAIQuarterback(p);
        else updateAICarrier(p);
      } else if (p.slot === SLOT.QB) {
        updateAIQuarterback(p);
      } else if (ball.state === 'thrown' && ball.intended === p && !play.snapping) {
        trackBall(p);
      } else if (play.blockers.has(p)) {
        updateBlocker(p);
      } else {
        followRoute(p);
      }
    }
    for (const d of teamPlayers(defenseTeam())) {
      if (d === controlled || incapacitated(d) || d.moveState) continue;
      updateDefender(d);
    }
  }

  // Tackle window: the grab, then the resolve.
  if (play.tackle) {
    play.tackle.t -= dt;
    play.tackle.sprintHeld ||= keys.has('shift') || touch.sprintHeld;
    const d = play.tackle.defender;
    const carrier = ball.carrier;
    if (carrier) {
      pursue(d, carrier.group.position, DEF_SPEED);
      // Furthest point reached — the spot comes off this, not off wherever
      // the body ends up once everyone has fallen over.
      const cx = carrier.group.position.x;
      play.tackle.best = attack > 0
        ? Math.max(play.tackle.best, cx)
        : Math.min(play.tackle.best, cx);
      // Anyone else in range piles on, and each extra man drags harder.
      for (const o of players) {
        if (o.team === carrier.team || o === d || incapacitated(o) || o.down) continue;
        if (o.group.position.distanceTo(carrier.group.position) < GANG_RADIUS) {
          play.tackle.helpers.add(o);
        }
      }
      if (carrier !== controlled && !gbActive()) {
        const drag = TACKLE_DRAG / (1 + play.tackle.helpers.size * 0.6);
        carrier.velocity.multiplyScalar(drag);
      }
    }
    if (play.tackle && play.tackle.t <= 0) resolveTackle();
  }

  // Ball in the air.
  if (ball.state === 'thrown') {
    const wr = ball.intended;

    // A tipped ball belongs to nobody: first man there comes down with it.
    if (!wr || ball.tipped) {
      if (ball.mesh.position.y < 0.2) {
        if (play.intReturn !== null) endReturn('tackle', ball.mesh.position.x);
        else endPlay('incomplete', drive.los);
        return;
      }
      if (ball.tipped && ball.airTime > 0.15) {
        for (const p of players) {
          if (incapacitated(p) || p.down) continue;
          scratch.copy(p.group.position);
          scratch.y = 1.1;
          if (ball.mesh.position.distanceTo(scratch) > TIP_RADIUS) continue;
          if (p.team === drive.offense) {
            completeCatch(p, 'possession', 'auto');
            ui.hud.toast('TIPPED AND CAUGHT!');
          } else {
            interceptBall(p);
          }
          ball.tipped = false;
          break;
        }
      }
    } else {
      scratch.copy(wr.group.position);
      scratch.y = 1.1;
      const reach = (wr.diveT > 0 ? DIVE_CATCH_DIST : CATCH_DIST) * wr.handsMul;

      // Hand control to the receiver late so the user can adjust to the ball.
      if (
        !play.snapping && wr.team === USER_TEAM && wr !== controlled &&
        ball.mesh.position.distanceTo(scratch) < 9
      ) {
        setControlled(wr);
      }

      // Open the catch window on the ball's arrival, once. Both sides get
      // their chance here: the receiver to time his catch, the defence to
      // decide whether to go up for the ball.
      if (!play.snapping) {
        const tta = ballArrivalTime();
        if (!play.catch && tta < CATCH_WINDOW) {
          play.catch = { wr, tapAt: null, type: null, tta };
          decideBallPlay();
        }
        if (play.catch) play.catch.tta = tta;
      }

      if (ball.airTime > 0.1 && ball.mesh.position.distanceTo(scratch) < reach) {
        if (play.snapping) {
          holdBall(ball, wr);
          play.snapping = false;
        } else {
          const caught = resolveCatch(wr);
          if (!caught && !ball.tipped) {
            endPlay('incomplete', drive.los);
            return;
          }
        }
      } else if (ball.mesh.position.y < 0.2) {
        play.catch = null;
        if (play.intReturn !== null) endReturn('tackle', ball.mesh.position.x);
        else endPlay('incomplete', drive.los);
        return;
      }
    }
  }

  // Carrier: scoring, boundaries, new contact.
  const carrier = ball.carrier;
  if (carrier && !play.snapping) {
    const returning = play.intReturn !== null;
    const carrierTeam = returning ? carrier.team : drive.offense;
    const carrierAttack = ATTACK_DIR[carrierTeam];
    const cx = carrier.group.position.x;
    if (carrierAttack * cx >= FIELD.halfLength) {
      playPose(carrier.pose, 'celebrate'); // before freezePlay clears the carrier
      if (conversion && !returning) {
        freezePlay();
        showBanner('CONVERSION GOOD!', `+${conversion.points}`);
        audio.touchdown();
        afterConversion(true);
      } else {
        touchdownFor(carrierTeam);
      }
      return;
    }
    if (Math.abs(carrier.group.position.z) > FIELD.halfWidth - 0.25) {
      if (returning) endReturn('oob', cx);
      else endPlay('oob', cx);
      return;
    }
    if (!play.tackle) {
      for (const d of players) {
        if (d.team === carrier.team || incapacitated(d) || d.down) continue;
        if (d.group.position.distanceTo(carrier.group.position) < TACKLE_DIST) {
          tryStartTackle(d, carrier);
          break;
        }
      }
    }
  }
}

// ---- HUD ------------------------------------------------------------------

function refreshHUD() {
  ui.hud.setScore(score[TEAM.HOME], score[TEAM.AWAY]);
  ui.hud.setClock(clockText(meta.clock));
  const toGo = drive.goalToGo ? 'GOAL' : toGoYards();
  const label = conversion?.points
    ? `${conversion.points}-POINT TRY`
    : `${['1ST', '2ND', '3RD', '4TH'][drive.down - 1]} & ${toGo} · ${ballOnText()}`;
  ui.hud.setDown(`${TEAM_NAMES[drive.offense]} BALL · ${label}`);
}

// The touch layout is derived from game state every frame. It used to be
// set at a dozen scattered event points, and the snap — which is itself a
// throw from the centre to the quarterback — ran the same catch path as a
// completed pass and swapped the receiver chips for the ball-carrier
// buttons. On a phone that made it impossible to ever throw.
function refreshTouchMode() {
  if (phase === 'lineup') {
    touch.setMode(userOnOffense() ? 'lineup' : 'defense');
    return;
  }
  if (phase !== 'live') {
    touch.setMode('menu');
    return;
  }
  const userHasBall = ball.carrier && ball.carrier === controlled && controlled.team === USER_TEAM;
  if (play.intReturn !== null) {
    touch.setMode(userHasBall ? 'carry' : 'defense');
    return;
  }
  if (!userOnOffense()) {
    touch.setMode('defense');
    return;
  }
  // On offence: show the receiver chips whenever the man you are driving is
  // actually allowed to throw — including while the snap is still in the
  // air toward him, so the chips never blink out at the worst moment.
  const behindLOS =
    controlled && offAttack() * (controlled.group.position.x - drive.los) <= 0.5;
  const eligible = controlled && (controlled.slot === SLOT.QB || play.off?.keepPass);
  const holding = ball.state === 'held' && ball.carrier === controlled;
  const snapIncoming = play.snapping && controlled?.slot === SLOT.QB;
  // On a designed run the quarterback is a runner, not a passer. Without
  // this he met every throwing condition — QB, behind the line, holding it
  // — so a QB DRAW came up with the receiver chips and hid spin, juke and
  // truck until he had already crossed the line. The option keeps its
  // chips, because choosing is the whole point of the play.
  // An open catch window takes priority over everything else.
  if (play.catch && play.catch.wr === controlled && play.catch.tapAt === null) {
    touch.setMode('catching');
    const t = play.catch.tta;
    touch.setCatchQuality?.(t >= GREEN_LO && t <= GREEN_HI ? 'green' : t > GREEN_HI ? 'yellow' : 'red');
    return;
  }
  const designedRun = play.off?.type === 'run' && !play.off?.keepPass;
  const canThrow =
    !play.thrown && behindLOS && eligible && !designedRun && (holding || snapIncoming);
  touch.setMode(canThrow ? 'qb' : 'carry');
}

function updateTargets() {
  if (!userOnOffense()) {
    touch.setTargets([]);
    for (const p of teamPlayers(USER_TEAM)) if (p.icon) p.icon.visible = false;
    return;
  }
  const live =
    phase === 'live' && !play.thrown && ball.carrier?.team === drive.offense &&
    (ball.carrier.slot === SLOT.QB || play.off?.keepPass) &&
    offAttack() * (ball.carrier.group.position.x - drive.los) <= 0.5;
  touch.setTargets(
    TARGET_SLOTS.map((slot) => {
      const p = offensePlayer(slot);
      const open = p ? nearestOpponentDist(p) : 0;
      return {
        slot,
        letter: TARGET_LETTERS[slot],
        live: live && !!p,
        tag: live && open > QB_OPEN_DIST ? 'OPEN' : '',
      };
    })
  );
  for (const p of teamPlayers(USER_TEAM)) {
    if (!p.icon) continue;
    p.icon.visible = live && TARGET_SLOTS.includes(p.slot) && p !== ball.carrier;
  }
}

// ---- Boot -----------------------------------------------------------------

function buildTeams() {
  // The 14 rigs are built once. Who they are is decided by the draft, and
  // applyBuild() re-shapes them per character rather than cloning again.
  for (const team of [TEAM.HOME, TEAM.AWAY]) {
    for (let slot = 0; slot < ROSTER_SIZE; slot++) {
      const p = createPlayer(assets, {
        team,
        color: TEAM_COLORS[team],
        iconLetter: team === USER_TEAM ? TARGET_LETTERS[slot] ?? null : null,
      });
      p.slot = slot;
      p.actual = new THREE.Vector3(); // real velocity, carried across frames
      p.stam = new StaminaMeter({ regularBelow: 60, gassedBelow: 25 });
      p.diveT = 0;
      p.blockedBy = null;
      p.currentAction = p.actions[TIERS.REGULAR];
      p.currentAction.play();
      p.currentAction.paused = true;
      players.push(p);
      scene.add(p.group);
    }
  }
}

let draft = null;
let pendingStart = null;

function applySquads(homeSquad, awaySquad) {
  for (const p of players) {
    const squad = p.team === TEAM.HOME ? homeSquad : awaySquad;
    applyBuild(p, assets, squad[p.slot] ?? CHARACTERS[0], TEAM_COLORS[p.team]);
  }
}

const draftHandlers = {
  onPick(character) {
    if (!draft || draft.done || draft.turn !== 'home' || !character) return;
    draft.pick(character);
    audio.uiTap();
    ui.refreshDraft(draft, draftHandlers);
    stepDraft();
  },
  onAuto() {
    if (!draft) return;
    audio.uiTap();
    draft.autoFill();
    ui.refreshDraft(draft, draftHandlers);
    stepDraft();
  },
};

// Let the CPU take its turn on a beat so a pick is readable, then hand the
// board back. Recurses until it is your pick again or the board is full.
function stepDraft() {
  if (!draft) return;
  if (draft.done) {
    setTimeout(() => {
      const { surfaceKey, options } = pendingStart;
      newGame(surfaceKey, options, draft.home, draft.away);
    }, 650);
    return;
  }
  if (draft.turn !== 'away') return;
  setTimeout(() => {
    if (!draft || draft.done || draft.turn !== 'away') return;
    draft.pick(draft.cpuChoice());
    audio.catchBall();
    ui.refreshDraft(draft, draftHandlers);
    stepDraft();
  }, 620);
}

function startDraft(surfaceKey, options) {
  pendingStart = { surfaceKey, options };
  draft = createDraft();
  phase = 'draft';
  touch.setMode('menu');
  if (!world || world.surface.key !== surfaceKey) setSurface(surfaceKey);
  ui.showDraft(draft, draftHandlers);
  stepDraft();
}

function newGame(surfaceKey, options, homeSquad, awaySquad) {
  applySquads(homeSquad, awaySquad);
  meta.options = options;
  meta.clock = GAME_SECONDS;
  meta.over = false;
  score[TEAM.HOME] = 0;
  score[TEAM.AWAY] = 0;
  style.value = 0;
  style.active = 0;
  conversion = null;
  audio.setMuted(!options.sound);
  if (options.sound) audio.start();
  powerups.setEnabled?.(options.pickups);
  if (!world || world.surface.key !== surfaceKey) setSurface(surfaceKey);
  ui.showGame();
  ui.hud.setKeys(
    'ARROWS move · SHIFT turbo · SPACE snap · A S D F G throw (hold = lob) · Z spin · X juke · C truck · E dive/pick · Q switch · V gamebreaker'
  );
  startDrive(TEAM.HOME, -ATTACK_DIR[TEAM.HOME] * (FIELD.halfLength - START_FROM_OWN));
  toPlayCall();
}

ui.handlers.onStart = (surfaceKey, options) => {
  audio.start();
  audio.uiTap();
  startDraft(surfaceKey, options);
};
ui.handlers.onRestart = () => {
  ui.showTitle();
  phase = 'menu';
  touch.setMode('menu');
};
ui.handlers.onSurfacePreview = (key) => {
  if (phase === 'menu' || phase === 'loading') setSurface(key);
};
// The draft camera just orbits the empty lot behind the board.
ui.handlers.onToggle = (key, value) => {
  if (key === 'sound') audio.setMuted(!value);
  if (key === 'pickups') powerups.setEnabled?.(value);
};

setSurface('concrete');
loadPlayerAssets().then((loaded) => {
  assets = loaded;
  buildTeams();
  phase = 'menu';
  ui.showTitle();
  touch.setMode('menu');
  const boot = document.querySelector('#boot');
  boot?.classList.add('gone');
  setTimeout(() => boot?.remove(), 500);
  window.__game = {
    THREE, // debug handle: lets a harness build vectors in page context
    anim: { applyPose, stepPose, playPose }, // pose preview harness
    players, ball, drive, score, meta, play, style, powerups, renderer, scene, camera,
    snap, newGame, step,
    get phase() { return phase; },
    get controlled() { return controlled; },
    get world() { return world; },
  };
});

// A landscape phone is very wide and very short: the fixed vertical FOV
// would bury the action at the bottom of the frame, so pull back and up.
let camScale = 1;
function fitCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  camScale = THREE.MathUtils.clamp(camera.aspect / 1.6, 1, 1.2);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
fitCamera();
window.addEventListener('resize', fitCamera);
window.addEventListener('orientationchange', () => setTimeout(fitCamera, 150));

// ---- Frame ----------------------------------------------------------------

const BOUND_X = FIELD.halfLength + FIELD.endZoneDepth - 0.6;
const BOUND_Z = FIELD.halfWidth + FIELD.fenceMargin - 1;

const camPos = new THREE.Vector3(-24, 9, 0);
const camLook = new THREE.Vector3(0, 0, 0);
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
const reachTarget = new THREE.Vector3();
const sep = new THREE.Vector3();
const desiredVel = new THREE.Vector3();
const rigQuat = new THREE.Quaternion();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => step(Math.min(clock.getDelta(), 0.05)));

function step(dt) {
  if (phase === 'loading') {
    composer.render();
    return;
  }
  if (hitStopT > 0) {
    hitStopT -= dt;
    world?.crowd.update(dt * 0.2);
    composer.render();
    return;
  }

  const tier = phase === 'live' ? updateControlled(dt) : TIERS.REGULAR;

  if (phase === 'lineup') {
    lineupTimer += dt;
    if (!userOnOffense() && lineupTimer > AI_SNAP_DELAY) snap();
  } else if (phase === 'live') {
    updateLivePlay(dt);
  } else if (phase === 'dead') {
    deadTimer -= dt;
    for (const p of players) p.velocity.set(0, 0, 0);
    if (deadTimer <= 0) {
      ui.hud.hideBanner();
      if (meta.clock <= 0 && !conversion) {
        endGame();
      } else if (conversion && conversion.points === null) {
        // Score happened: pick the try. AI goes for 2 when it's chasing.
        if (conversion.team === USER_TEAM) askConversion();
        else startConversion(score[conversion.team] < score[USER_TEAM] ? 2 : 1);
      } else {
        toPlayCall();
      }
    }
  }

  // Gamebreaker burn-down.
  if (style.active > 0) {
    style.active = Math.max(0, style.active - dt);
    bloomPass.strength = 0.4 + 0.7 * Math.min(1, style.active / GB_DURATION);
    if (style.active === 0) bloomPass.strength = 0.4;
  }

  for (const p of players) {
    p.turboT = Math.max(0, p.turboT - dt);
    p.stunT = Math.max(0, p.stunT - dt);
    p.slipT = Math.max(0, p.slipT - dt);
    p.stumbleT = Math.max(0, p.stumbleT - dt);
    p.commitT = Math.max(0, p.commitT - dt);
    p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
    p.moveCooldown = Math.max(0, p.moveCooldown - dt);
    p.burstT = Math.max(0, p.burstT - dt);
    p.diveT = Math.max(0, p.diveT - dt);
    if (p !== controlled) p.stam.update(dt, p.velocity.lengthSq() > 45);
    if (incapacitated(p)) p.velocity.set(0, 0, 0);

    // What the AI or the stick asked for this frame...
    desiredVel.copy(p.velocity);
    // ...and the momentum actually being carried.
    p.velocity.copy(p.actual);
    if (p.down) desiredVel.set(0, 0, 0); // nobody runs while they're on the floor

    if (p.moveState) {
      const m = p.moveState;
      m.t += dt;
      const k = m.t / m.dur;
      const fwd = scratch.set(Math.sin(p.heading), 0, Math.cos(p.heading));
      if (m.type === 'spin') {
        p.velocity.copy(fwd).multiplyScalar(SPRINT_SPEED[TIERS.TURBO] * 0.95);
      } else if (m.type === 'truck') {
        p.velocity.copy(fwd).multiplyScalar(SPRINT_SPEED[TIERS.TURBO] * 1.05);
      } else {
        p.velocity.copy(fwd).multiplyScalar(WALK_SPEED * 0.7);
        p.velocity.z += m.dir * 9 * Math.sin(Math.PI * Math.min(k, 1));
      }
      if (m.t >= m.dur) {
        p.moveState = null;
        p.burstT = BURST_DURATION;
        p.rig.rotation.z = 0;
      }
      // Spin/juke/truck are impulses: they set velocity outright.
      p.actual.copy(p.velocity);
    } else {
      if (p.speedMul !== 1) desiredVel.multiplyScalar(p.speedMul);
      const dsq = desiredVel.lengthSq();
      const vsq = p.velocity.lengthSq();
      let rate = (dsq >= vsq ? ACCEL : DECEL) * p.accelMul;
      if (dsq > 0.01 && vsq > 0.5) {
        // Cutting against your own momentum is slow; running straight is not.
        const dot =
          (desiredVel.x * p.velocity.x + desiredVel.z * p.velocity.z) /
          Math.sqrt(dsq * vsq);
        rate *= CUT_FLOOR + (1 - CUT_FLOOR) * Math.max(0, dot);
      }
      rate *= world?.surface.grip ?? 1; // loose dirt bleeds grip
      p.velocity.lerp(desiredVel, 1 - Math.exp(-rate * dt));
      if (p.velocity.lengthSq() < 0.02) p.velocity.set(0, 0, 0);
      p.actual.copy(p.velocity);
    }

    if (phase !== 'live') {
      p.velocity.set(0, 0, 0);
      p.actual.set(0, 0, 0);
    }

    // Vertical hop for a jump ball. Nothing else writes group.position.y.
    if (p.hop) {
      p.hop.t += dt;
      const k = p.hop.t / p.hop.dur;
      if (k >= 1) { p.hop = null; p.group.position.y = 0; }
      else p.group.position.y = Math.sin(Math.PI * k) * p.hop.height;
    }
    p.group.position.addScaledVector(p.velocity, dt);
    p.group.position.x = THREE.MathUtils.clamp(p.group.position.x, -BOUND_X, BOUND_X);
    p.group.position.z = THREE.MathUtils.clamp(p.group.position.z, -BOUND_Z, BOUND_Z);

    const speed = p.velocity.length();
    if (speed > 0.2 && !p.moveState) {
      const targetHeading = Math.atan2(p.velocity.x, p.velocity.z);
      let delta = targetHeading - p.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      // A sprinting player turns in a wide arc; a walking one pivots.
      const frac = Math.min(1, speed / SPRINT_SPEED[TIERS.TURBO]);
      const turn = TURN_RATE * (1 - TURN_AT_SPEED * frac) * p.agilityMul * dt;
      p.heading += THREE.MathUtils.clamp(delta, -turn, turn);
    }
    if (p.moveState?.type === 'spin') {
      p.group.rotation.y = p.heading + (p.moveState.t / p.moveState.dur) * Math.PI * 2;
    } else {
      p.group.rotation.y = p.heading;
    }
    p.rig.rotation.z = p.moveState?.type === 'juke'
      ? -p.moveState.dir * 0.35 * Math.sin(Math.PI * Math.min(p.moveState.t / p.moveState.dur, 1))
      : 0;
    let pitch = 0;
    if (p.down) {
      // Going to ground: pitch over and drop toward the turf, then hold
      // there until the next lineup picks him back up.
      p.downT += dt;
      const k = Math.min(1, p.downT / FALL_DURATION);
      const e = 1 - (1 - k) ** 3; // ease out
      pitch = p.fallDir * 1.45 * e;
      p.rig.position.y = p.restRigY - 0.45 * e;
    } else {
      if (p.rig.position.y !== p.restRigY) p.rig.position.y = p.restRigY;
      if (p.slipT > 0) pitch = 0.8 * Math.sin(Math.PI * (1 - p.slipT / SLIP_DURATION));
      else if (p.stumbleT > 0) pitch = 0.35 * Math.sin(Math.PI * (1 - p.stumbleT / 1.0));
      else if (p.diveT > 0) pitch = 0.5;
      else if (p.moveState?.type === 'truck') pitch = 0.3;
    }
    p.rig.rotation.x = pitch;

    const clipTier =
      p === controlled ? tier : p.turboT > 0 ? TIERS.TURBO : p.stam.tier;
    updatePlayerClip(p, clipTier, p.stunT > 0 ? 0 : speed);
    p.mixer.update(dt);

    // Pose overlay. A paused run clip still writes its frozen stride, so a
    // standing player used to be a runner mid-step; idle/brace solve over it.
    const poseOut = stepPose(p.pose, dt, {
      wantIdle: p.down || (speed < 0.45 && p.stunT <= 0),
      idleName: p.down ? 'down' : phase === 'lineup' ? 'brace' : 'idle',
      clock: clock.elapsedTime + p.poseOffset,
    });
    if (poseOut) {
      p.rig.getWorldQuaternion(rigQuat);
      applyPose(p.poseRefs, poseOut.map, rigQuat, poseOut.weight);
    }

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

  // Keep bodies out of each other so a pile doesn't become one player.
  if (phase === 'live') {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i].group.position;
        const b = players[j].group.position;
        sep.set(b.x - a.x, 0, b.z - a.z);
        const d = sep.length();
        if (d > 0.001 && d < SEPARATION) {
          sep.multiplyScalar(((SEPARATION - d) / d) * 0.5);
          a.sub(sep);
          b.add(sep);
        }
      }
    }
    resolveBlocks();
    if (meta.options.pickups) powerups.update(dt, players, { onPickup, onHazardHit });
  }

  updateBall(ball, dt);
  refreshTouchMode();
  updateTargets();
  refreshHUD();

  // Stamina + style meters.
  if (controlled) {
    const st = controlled.stam;
    const gb = gbActive();
    ui.hud.setStamina(
      st.percent,
      gb ? '#ffd54a' : controlled.turboT > 0 ? '#d4f00f'
        : st.tier === TIERS.TURBO ? '#22c55e' : st.tier === TIERS.REGULAR ? '#eab308' : '#ef4444',
      gb ? `GAMEBREAKER ${style.active.toFixed(1)}s`
        : controlled.turboT > 0 ? `TURBO BOOST ${controlled.turboT.toFixed(1)}s`
          : `${controlled.character?.name ?? ''} · ${st.tier.toUpperCase()} ${Math.round(st.value)}`
    );
  }
  ui.hud.setStyle(
    (style.value / STYLE_MAX) * 100,
    style.value >= STYLE_MAX,
    style.value >= STYLE_MAX ? 'GAMEBREAKER READY — V / BUTTON' : 'STYLE'
  );
  touch.setGamebreaker?.(style.value >= STYLE_MAX && phase === 'live' && !gbActive());
  ui.hud.setPassClock(
    phase === 'live' && play.clockRunning && !play.thrown ? play.passClock / PASS_CLOCK : null
  );
  ui.hud.tick(dt);

  if (bannerT > 0) {
    bannerT -= dt;
    if (bannerT <= 0 && phase === 'live') ui.hud.hideBanner();
  }

  // Crowd reacts to the moment, and the audio follows the crowd.
  const crowd = world?.crowd;
  if (crowd) {
    if (phase === 'live' && ball.carrier) {
      const attack = ATTACK_DIR[play.intReturn ?? drive.offense];
      const toGoal = FIELD.halfLength - attack * ball.carrier.group.position.x;
      if (toGoal < 12) crowd.cheer(dt * 1.4); // getting close, they stand up
    }
    crowd.update(dt);
    audio.setExcitement(crowd.excitement);
  }

  const attack = viewAttack();
  const bp = ball.mesh.position;
  const shot = phase === 'playcall' || phase === 'menu' || phase === 'draft';
  if (shot) {
    // Slow orbit over the field behind the menus.
    const a = clock.elapsedTime * 0.12;
    desiredPos.set(Math.cos(a) * 34, 15, Math.sin(a) * 34);
    desiredLook.set(0, 1.5, 0);
  } else {
    desiredPos.set(
      bp.x - attack * CAM_BACK * camScale,
      CAM_HEIGHT * camScale,
      bp.z + CAM_SIDE
    );
    desiredLook.set(bp.x + attack * CAM_LOOKAHEAD * camScale, 1.2, bp.z);
  }
  const k = 1 - Math.exp(-(shot ? 1.4 : CAM_SMOOTHING) * dt);
  camPos.lerp(desiredPos, k);
  camLook.lerp(desiredLook, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (!shot) camera.rotateZ(CAM_ROLL);
  fx.update(dt);

  composer.render();
}

// ---- Conversions + game over ---------------------------------------------

function askConversion() {
  phase = 'convert';
  // Never leave the game sitting on a prompt: the try clock runs down and
  // defaults to the single point, the way a play clock would.
  let left = 8;
  const paint = () =>
    ui.hud.banner('EXTRA POINT?', `1 FROM THE 5  ·  2 FROM THE 10  ·  ${Math.ceil(left)}s`);
  paint();
  const countdown = setInterval(() => {
    left -= 1;
    if (left <= 0) pick(1);
    else paint();
  }, 1000);
  const pick = (points) => {
    clearInterval(countdown);
    ui.hud.hideBanner();
    window.removeEventListener('keydown', onKey);
    touchPick.forEach((fn) => fn());
    startConversion(points);
  };
  const onKey = (e) => {
    if (e.key === '1') pick(1);
    if (e.key === '2') pick(2);
  };
  window.addEventListener('keydown', onKey);
  // Touch: two taps on the banner halves.
  const touchPick = [];
  const makeBtn = (label, points, left) => {
    const b = document.createElement('div');
    b.textContent = label;
    b.style.cssText = `position:fixed;z-index:50;top:52%;${left ? 'left:28%' : 'left:62%'};
      transform:translateX(-50%);padding:14px 26px;border-radius:999px;background:#b9f227;color:#10130f;
      font:900 16px system-ui;letter-spacing:1px;box-shadow:0 6px 20px rgba(0,0,0,0.5)`;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pick(points);
    });
    document.body.appendChild(b);
    touchPick.push(() => b.remove());
  };
  makeBtn('GO FOR 1', 1, true);
  makeBtn('GO FOR 2', 2, false);
}

function endGame() {
  phase = 'over';
  meta.over = true;
  touch.setMode('menu');
  const h = score[TEAM.HOME];
  const a = score[TEAM.AWAY];
  ui.showResult(
    `${h} — ${a}`,
    h > a ? 'YOU TOOK THE BLOCK.' : h < a ? 'THEY RAN YOU OFF THE LOT.' : 'DEAD EVEN. RUN IT BACK.'
  );
}
