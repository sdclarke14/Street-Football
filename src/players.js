import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { TIERS } from './stamina.js';
import { toonifyTree, addOutlines, RAMPS, setOutlineWidth } from './toon.js';
import { captureRig, createPoseState } from './anim.js';
import { toMultipliers } from './roster.js';

// All three GLBs share an identical 24-joint skeleton (verified), so the
// turbo/regular clips bind by bone name onto clones of the base rig.
const PLAYER_HEIGHT = 1.8;

// The body texture is one baked atlas (not separable materials), but the
// jersey green is chroma-distinct from skin/white/black — so the away kit is
// made by swapping R/G on green-dominant pixels: green jersey -> red jersey,
// everything else untouched.
// One pass over the baked atlas does two jobs: push saturation and contrast
// so the kit reads as cartoon rather than photographic, and (for the away
// team) swap the green jersey to red. The green is chroma-distinct from
// skin/white/black, so swapping R and G on green-dominant pixels recolours
// the jersey and nothing else.
const SATURATION = 1.38; // applied in proportion to a pixel's own chroma
const CONTRAST = 1.1;

function processAtlas(map, { toRed = false } = {}) {
  const SIZE = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  g.drawImage(map.image, 0, 0, SIZE, SIZE);
  const imageData = g.getImageData(0, 0, SIZE, SIZE);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let gr = d[i + 1];
    let b = d[i + 2];
    if (toRed && gr > r * 1.15 && gr > b * 1.05) {
      // Swapping R and G on the green jersey lands on a dull maroon, which
      // reads as brown at gameplay distance. Push it toward a bright kit red.
      const t = r;
      r = gr;
      gr = t;
      r = Math.min(255, r * 1.35 + 28);
      gr *= 0.72;
      b *= 0.72;
    }
    // Saturate around luminance — but scale the boost by how colourful the
    // pixel already is, so the jersey pops while skin, white and black stay
    // where they are. A flat boost turns every skin tone orange.
    const lum = 0.299 * r + 0.587 * gr + 0.114 * b;
    const chroma = Math.max(r, gr, b) - Math.min(r, gr, b);
    const sat = 1 + (SATURATION - 1) * Math.min(1, chroma / 110);
    r = lum + (r - lum) * sat;
    gr = lum + (gr - lum) * sat;
    b = lum + (b - lum) * sat;
    r = (r - 128) * CONTRAST + 128;
    gr = (gr - 128) * CONTRAST + 128;
    b = (b - 128) * CONTRAST + 128;
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = gr < 0 ? 0 : gr > 255 ? 255 : gr;
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  g.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = map.flipY;
  tex.colorSpace = map.colorSpace;
  tex.wrapS = map.wrapS;
  tex.wrapT = map.wrapT;
  tex.anisotropy = map.anisotropy;
  return tex;
}

export async function loadPlayerAssets() {
  const loader = new GLTFLoader();
  const [base, turbo, regular] = await Promise.all([
    loader.loadAsync(import.meta.env.BASE_URL + 'models/hero_gassed_run.glb'),
    loader.loadAsync(import.meta.env.BASE_URL + 'models/hero_turbo_run.glb'),
    loader.loadAsync(import.meta.env.BASE_URL + 'models/hero_regular_run.glb'),
  ]);

  const bbox = new THREE.Box3().setFromObject(base.scene);
  const size = bbox.getSize(new THREE.Vector3());
  const scale = PLAYER_HEIGHT / size.y;

  let baseMap = null;
  base.scene.traverse((c) => {
    if (c.isMesh && c.material.map) baseMap = c.material.map;
  });

  return {
    template: base.scene,
    scale,
    yOffset: -bbox.min.y * scale,
    homeMap: processAtlas(baseMap),
    redMap: processAtlas(baseMap, { toRed: true }),
    clips: {
      [TIERS.GASSED]: base.animations[0], // Lean_Forward_Sprint, played slow
      [TIERS.TURBO]: turbo.animations[0],
      [TIERS.REGULAR]: regular.animations[0],
    },
  };
}

// Floating throw-target letter icon, flat cel style: yellow disc, bold
// outline, black letter. Rendered on top of everything (depthTest off).
function makeTargetIcon(letter) {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  // Drop shadow + heavy outline so the letter stays readable against a lit
  // field; tone mapping and bloom wash out a flat pastel disc.
  g.beginPath();
  g.arc(S / 2, S / 2 + 3, S / 2 - 10, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fill();
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 12, 0, Math.PI * 2);
  g.fillStyle = '#ffc21a';
  g.fill();
  g.lineWidth = 11;
  g.strokeStyle = '#141414';
  g.stroke();
  g.font = 'bold 74px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#1a1a1a';
  g.fillText(letter, S / 2, S / 2 + 4);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
  );
  sprite.scale.setScalar(0.85);
  sprite.position.y = 2.7;
  sprite.renderOrder = 10;
  sprite.visible = false;
  return sprite;
}

export function createPlayer(assets, { team, color, redJersey = false, iconLetter = null, build = null }) {
  const rig = cloneSkinned(assets.template);
  const kit = redJersey ? assets.redMap : assets.homeMap;
  rig.traverse((c) => {
    if (!c.isMesh) return;
    c.material = c.material.clone();
    // The asset carries its look in BOTH map and emissiveMap; toonify()
    // drops emissive so the toon ramp can actually shade the model, and
    // both slots point at the processed atlas either way.
    c.material.map = kit;
    c.material.emissiveMap = kit;
  });
  const bh = build?.height ?? 1;
  const bg = build?.girth ?? 1;
  rig.traverse((c) => {
    if (c.isMesh) c.castShadow = true;
  });

  // Cel pass: hard-banded toon ramp, then an inverted-hull ink outline.
  // Build scaling is applied by applyBuild() once the rig exists.
  // The shell lives inside the rig's own scale, so the width has to be
  // divided by that scale to come out a fixed thickness on screen.
  toonifyTree(rig, { ramp: RAMPS.character });
  addOutlines(rig, { color: 0x0e100f, width: 0.04 / assets.scale });

  const group = new THREE.Group();
  group.add(rig);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.62, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  // Extra marker shown only on the user-controlled player.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.68, 0.78, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.03;
  marker.visible = false;
  group.add(marker);

  const icon = iconLetter ? makeTargetIcon(iconLetter) : null;
  if (icon) group.add(icon);

  const mixer = new THREE.AnimationMixer(rig);
  const actions = {};
  for (const [tier, clip] of Object.entries(assets.clips)) {
    actions[tier] = mixer.clipAction(clip);
  }

  return {
    team,
    group,
    rig,
    marker,
    icon,
    mixer,
    actions,
    currentAction: null,
    velocity: new THREE.Vector3(),
    heading: 0,
    touchCooldown: 0,
    home: new THREE.Vector3(),
    // Procedural pose overlays: the rig has only run cycles, so idle,
    // throw, catch, dive and celebrate are solved on top of it.
    poseRefs: captureRig(rig),
    pose: createPoseState(),
    poseOffset: Math.random() * 10, // desync the breathing
    restRigY: assets.yOffset, // restored when a knocked-down player gets up
    down: false,
    downT: 0,
    fallDir: 1,
    // bones for ball socketing and procedural catch-reach
    hand: rig.getObjectByName('RightHand'),
    arms: {
      l: rig.getObjectByName('LeftArm'),
      lf: rig.getObjectByName('LeftForeArm'),
      r: rig.getObjectByName('RightArm'),
      rf: rig.getObjectByName('RightForeArm'),
    },
    // status timers (seconds remaining)
    turboT: 0, // powerup: forced turbo, free sprint
    stunT: 0, // electric trap: frozen
    slipT: 0, // oil slick: stumbling
    stumbleT: 0, // post-juke/tackle-break off-balance (slow)
    commitT: 0, // defender overcommitting in a sold direction
    commitTarget: new THREE.Vector3(),
    tackleCooldown: 0,
    moveCooldown: 0, // juke/spin cooldown
    moveState: null, // { type: 'spin'|'juke', t, dur, dir }
    burstT: 0, // momentum burst coming out of a move
  };
}

// Re-shape an existing player to a character's build. Called when a squad
// is drafted, so the 14 rigs are built once and re-used rather than cloned
// again every game.
export function applyBuild(player, assets, character) {
  const bh = character?.build?.height ?? 1;
  const bg = character?.build?.girth ?? 1;
  player.rig.scale.set(assets.scale * bg, assets.scale * bh, assets.scale * bg);
  player.rig.position.y = assets.yOffset * bh;
  player.restRigY = player.rig.position.y;
  // The shell is pushed a fixed distance in rig-local space, so a wide
  // character would get proportionally wider ink. Divide by the largest
  // build factor to keep the outline an even weight across the roster.
  setOutlineWidth(player.rig, 0.04 / (assets.scale * Math.max(bh, bg)));
  player.character = character;
  Object.assign(player, toMultipliers(character));
  // Stamina is a per-character trait too: who can keep the turbo down.
  player.stam.drainRate = 22 / player.staminaMul;
  player.stam.regenRate = 14 * player.staminaMul;
}

// Aim a bone (world-space) so it points from its joint toward targetWorld.
// Axis-independent: rotates the current bone direction onto the wanted one,
// slerped by strength — used for the procedural catch reach.
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
export function aimBone(bone, child, targetWorld, strength) {
  if (!bone || !child) return;
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  _v1.setFromMatrixPosition(bone.matrixWorld);
  _v2.setFromMatrixPosition(child.matrixWorld).sub(_v1).normalize();
  _v3.copy(targetWorld).sub(_v1).normalize();
  _q1.setFromUnitVectors(_v2, _v3); // world-space corrective rotation
  bone.getWorldQuaternion(_q2);
  _q3.copy(_q1).multiply(_q2); // desired world orientation
  bone.parent.getWorldQuaternion(_q1).invert();
  _q3.premultiply(_q1); // to local space
  bone.quaternion.slerp(_q3, strength);
}

// Play the tier clip scaled to movement speed; freeze mid-stride when idle.
export function updatePlayerClip(player, tier, speed) {
  if (speed < 0.2) {
    if (player.currentAction) player.currentAction.paused = true;
    return;
  }
  const next = player.actions[tier];
  if (player.currentAction !== next) {
    next.reset().play();
    if (player.currentAction) {
      player.currentAction.paused = false;
      player.currentAction.crossFadeTo(next, 0.25, false);
    }
    player.currentAction = next;
  }
  next.paused = false;
  const base = tier === TIERS.GASSED ? 0.5 : 1;
  next.timeScale = base * THREE.MathUtils.clamp(speed / 6, 0.6, 1.4);
}
