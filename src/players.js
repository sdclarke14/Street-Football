import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { TIERS } from './stamina.js';

import { teamMaterials, skinMaterial } from './materials.js';

// Flag football player built by tools/build_player.py: one GLB with the
// 24-joint rig, a ~27k-triangle body + clothing, and three run clips. Mesh
// parts are keyed by material name so each team gets its own kit.
const PLAYER_HEIGHT = 1.8;

// Flag belt attachment points (model space, from the build script's belt fit).
const BELT = { rx: 0.187, y: 0.872, zBack: -0.172, zSide: -0.024 };
const FLAG_ANCHORS = [
  { pos: [BELT.rx, BELT.y, BELT.zSide], yaw: Math.PI / 2 },
  { pos: [-BELT.rx, BELT.y, BELT.zSide], yaw: Math.PI / 2 },
  { pos: [0, BELT.y, BELT.zBack], yaw: 0 },
];

export async function loadPlayerAssets() {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/player_flag.glb');
  const bbox = new THREE.Box3().setFromObject(gltf.scene);
  const size = bbox.getSize(new THREE.Vector3());
  const scale = PLAYER_HEIGHT / size.y;
  const clip = (name) => gltf.animations.find((a) => a.name === name);
  return {
    template: gltf.scene,
    scale,
    yOffset: -bbox.min.y * scale,
    clips: {
      [TIERS.GASSED]: clip('Run_Gassed'), // Lean_Forward_Sprint, played slow
      [TIERS.TURBO]: clip('Run_Turbo'),
      [TIERS.REGULAR]: clip('Run_Regular'),
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
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2);
  g.fillStyle = '#ffd54a';
  g.fill();
  g.lineWidth = 9;
  g.strokeStyle = '#1a1a1a';
  g.stroke();
  g.font = 'bold 72px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#1a1a1a';
  g.fillText(letter, S / 2, S / 2 + 4);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
  );
  sprite.scale.setScalar(0.6);
  sprite.position.y = 2.5;
  sprite.renderOrder = 10;
  sprite.visible = false;
  return sprite;
}

export function createPlayer(assets, { team, color, skinTone = 0, iconLetter = null }) {
  const rig = cloneSkinned(assets.template);
  const kit = teamMaterials(team);
  rig.traverse((c) => {
    if (!c.isMesh) return;
    const name = c.material.name;
    c.material = name === 'Skin' ? skinMaterial(skinTone) : kit[name] ?? c.material;
    c.castShadow = true;
    c.receiveShadow = true;
  });
  rig.scale.setScalar(assets.scale);
  rig.position.y = assets.yOffset;

  const group = new THREE.Group();
  group.add(rig);

  // Flags: anchors ride the Hips bone; the visible flag hangs from the anchor
  // in player space so it can trail and flutter with speed.
  const hips = rig.getObjectByName('Hips');
  const flagGeo = new THREE.PlaneGeometry(0.06, 0.34, 1, 4);
  flagGeo.translate(0, -0.17, 0);
  group.updateMatrixWorld(true);
  const flags = FLAG_ANCHORS.map(({ pos, yaw }, i) => {
    const anchor = new THREE.Object3D();
    anchor.position.set(pos[0], pos[1], pos[2]).multiplyScalar(assets.scale);
    anchor.position.y += assets.yOffset;
    group.add(anchor);
    anchor.updateMatrixWorld(true);
    hips.attach(anchor);
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(flagGeo, kit.Flag);
    mesh.rotation.y = yaw;
    mesh.scale.setScalar(assets.scale);
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return { anchor, pivot, phase: i * 2.1 };
  });

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
    flags,
    marker,
    icon,
    mixer,
    actions,
    currentAction: null,
    velocity: new THREE.Vector3(),
    heading: 0,
    touchCooldown: 0,
    home: new THREE.Vector3(),
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

// Keep flags hanging from the belt: trail back with speed, flutter a little.
const _fv = new THREE.Vector3();
export function updateFlags(player, speed, time) {
  player.group.updateMatrixWorld(true);
  const trail = THREE.MathUtils.clamp(speed / 7, 0, 1);
  for (const f of player.flags) {
    f.anchor.getWorldPosition(_fv);
    player.group.worldToLocal(_fv);
    f.pivot.position.copy(_fv);
    const flutter = Math.sin(time * (6 + speed * 1.6) + f.phase);
    f.pivot.rotation.set(0.15 + trail * 1.05 + flutter * 0.12 * trail, 0, flutter * (0.05 + 0.18 * trail));
  }
}
