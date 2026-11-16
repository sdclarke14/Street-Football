import * as THREE from 'three';

// Procedural pose overlays.
//
// The rig ships with three run cycles and nothing else, so a standing player
// was a run clip paused mid-stride. Rather than author keyframes blind
// against a rig whose bind orientation isn't visible, poses are declared as
// directions each bone should point, in the character's own frame, and
// solved onto whatever the animation mixer just wrote.
//
// Measured rest pose of this rig, in model space:
//   +Y up, +Z forward, +X is the character's LEFT (the right arm runs -X).
//   Spine chain points straight up; arms hang down and out in an A-pose.

// Logical name -> [bone, its child]. The pair defines the bone's direction.
export const BONE_PAIRS = {
  spineLow: ['Spine02', 'Spine01'],
  spineMid: ['Spine01', 'Spine'],
  chest: ['Spine', 'neck'],
  head: ['neck', 'Head'],
  lArm: ['LeftArm', 'LeftForeArm'],
  lFore: ['LeftForeArm', 'LeftHand'],
  rArm: ['RightArm', 'RightForeArm'],
  rFore: ['RightForeArm', 'RightHand'],
  lUpLeg: ['LeftUpLeg', 'LeftLeg'],
  lLeg: ['LeftLeg', 'LeftFoot'],
  rUpLeg: ['RightUpLeg', 'RightLeg'],
  rLeg: ['RightLeg', 'RightFoot'],
};

export function captureRig(rig) {
  const refs = {};
  for (const [key, [a, b]] of Object.entries(BONE_PAIRS)) {
    const bone = rig.getObjectByName(a);
    const child = rig.getObjectByName(b);
    if (bone && child) refs[key] = { bone, child };
  }
  return refs;
}

// ---- Pose library --------------------------------------------------------
// Vectors are "point this bone this way" in model space. They do not need to
// be normalised. A pose is a function of phase so a throw can wind up and
// release from one definition.

const lerpPose = (a, b, t) => {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[k] ?? b[k];
    const vb = b[k] ?? a[k];
    out[k] = [
      va[0] + (vb[0] - va[0]) * t,
      va[1] + (vb[1] - va[1]) * t,
      va[2] + (vb[2] - va[2]) * t,
    ];
  }
  return out;
};

const IDLE = {
  lArm: [0.30, -0.94, 0.06],
  lFore: [0.18, -0.95, 0.22],
  rArm: [-0.30, -0.94, 0.06],
  rFore: [-0.18, -0.95, 0.22],
  lUpLeg: [0.10, -0.99, 0.02],
  lLeg: [0.06, -0.99, 0.04],
  rUpLeg: [-0.10, -0.99, 0.02],
  rLeg: [-0.06, -0.99, 0.04],
  spineLow: [0, 0.995, 0.08],
  chest: [0, 0.99, 0.10],
};

// Ready stance: knees bent, weight forward, hands up. Used pre-snap.
// Kept close to IDLE on purpose: aiming the upper arm far from where the
// run clip left it makes the solve swing wide, which read as arms held out
// horizontally rather than a ready crouch.
const BRACE = {
  lArm: [0.26, -0.90, 0.34],
  lFore: [0.16, -0.72, 0.68],
  rArm: [-0.26, -0.90, 0.34],
  rFore: [-0.16, -0.72, 0.68],
  lUpLeg: [0.12, -0.96, 0.22],
  lLeg: [0.08, -0.98, -0.16],
  rUpLeg: [-0.12, -0.96, 0.22],
  rLeg: [-0.08, -0.98, -0.16],
  spineLow: [0, 0.96, 0.26],
  chest: [0, 0.95, 0.30],
};

const THROW_COCK = {
  rArm: [-0.45, 0.42, -0.79],
  rFore: [-0.35, 0.80, -0.49],
  lArm: [0.55, -0.25, 0.79],
  lFore: [0.35, -0.15, 0.92],
  chest: [0.18, 0.96, -0.20],
  spineMid: [0.12, 0.98, -0.12],
};
const THROW_RELEASE = {
  rArm: [-0.25, 0.15, 0.96],
  rFore: [-0.15, -0.25, 0.95],
  lArm: [0.50, -0.60, 0.60],
  lFore: [0.30, -0.80, 0.50],
  chest: [-0.12, 0.96, 0.25],
  spineMid: [-0.08, 0.98, 0.16],
};

const CATCH = {
  lArm: [0.40, 0.30, 0.86],
  lFore: [0.22, 0.25, 0.94],
  rArm: [-0.40, 0.30, 0.86],
  rFore: [-0.22, 0.25, 0.94],
  chest: [0, 0.97, 0.24],
  head: [0, 0.96, 0.28],
};

const DIVE = {
  lArm: [0.35, -0.20, 0.91],
  lFore: [0.20, -0.25, 0.95],
  rArm: [-0.35, -0.20, 0.91],
  rFore: [-0.20, -0.25, 0.95],
  spineLow: [0, 0.80, 0.60],
  spineMid: [0, 0.78, 0.63],
  chest: [0, 0.75, 0.66],
  head: [0, 0.88, 0.47],
};

const TRUCK = {
  chest: [0, 0.82, 0.57],
  spineMid: [0, 0.88, 0.47],
  lArm: [0.40, -0.55, 0.74],
  rArm: [-0.30, -0.75, 0.59],
  lFore: [0.28, -0.30, 0.91],
  head: [0, 0.90, 0.44],
};

const CELEBRATE = {
  lArm: [0.55, 0.82, 0.15],
  lFore: [0.45, 0.89, 0.10],
  rArm: [-0.55, 0.82, 0.15],
  rFore: [-0.45, 0.89, 0.10],
  head: [0, 0.95, -0.30],
  chest: [0, 0.99, -0.12],
};

// Each entry: duration, whether it loops, and the pose at a given phase.
export const POSES = {
  idle: { dur: Infinity, loop: true, at: (t) => IDLE, breathe: true },
  brace: { dur: Infinity, loop: true, at: () => BRACE, breathe: true },
  throw: {
    dur: 0.5,
    at: (t) => (t < 0.35 ? THROW_COCK : lerpPose(THROW_COCK, THROW_RELEASE, (t - 0.35) / 0.65)),
  },
  catch: { dur: 0.45, at: () => CATCH },
  dive: { dur: 0.55, at: () => DIVE },
  truck: { dur: 0.4, at: () => TRUCK },
  celebrate: { dur: 1.8, at: () => CELEBRATE },
};

// ---- Solving -------------------------------------------------------------

const _bonePos = new THREE.Vector3();
const _childPos = new THREE.Vector3();
const _have = new THREE.Vector3();
const _want = new THREE.Vector3();
const _qCorrect = new THREE.Quaternion();
const _qWorld = new THREE.Quaternion();
const _qTarget = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();

// Rotate `bone` so the line to `child` points along `dirModel`, expressed in
// the character's own frame. Same idea as the catch reach, but aiming at a
// direction instead of a world point — which makes it independent of where
// the player is standing or which way he is facing.
function aimLocal(bone, child, dirModel, rigQuat, strength) {
  if (!bone || !child || strength <= 0.001) return;
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  _bonePos.setFromMatrixPosition(bone.matrixWorld);
  _childPos.setFromMatrixPosition(child.matrixWorld);
  _have.copy(_childPos).sub(_bonePos);
  if (_have.lengthSq() < 1e-8) return;
  _have.normalize();
  _want.set(dirModel[0], dirModel[1], dirModel[2]).normalize().applyQuaternion(rigQuat);
  _qCorrect.setFromUnitVectors(_have, _want);
  bone.getWorldQuaternion(_qWorld);
  _qTarget.copy(_qCorrect).multiply(_qWorld);
  bone.parent.getWorldQuaternion(_qParent).invert();
  _qTarget.premultiply(_qParent);
  bone.quaternion.slerp(_qTarget, strength);
}

// Apply a pose on top of whatever the mixer wrote this frame. Bones are
// solved in hierarchy order so a spine change carries into the arms.
const ORDER = [
  'spineLow', 'spineMid', 'chest', 'head',
  'lArm', 'lFore', 'rArm', 'rFore',
  'lUpLeg', 'lLeg', 'rUpLeg', 'rLeg',
];

export function applyPose(refs, poseMap, rigQuat, weight) {
  if (weight <= 0.001) return;
  for (const key of ORDER) {
    const dir = poseMap[key];
    const ref = refs[key];
    if (dir && ref) aimLocal(ref.bone, ref.child, dir, rigQuat, weight);
  }
}

// Per-player pose state: what is playing, and how strongly.
export function createPoseState() {
  return { name: null, t: 0, weight: 0, hold: null };
}

export function playPose(state, name) {
  const def = POSES[name];
  if (!def) return;
  state.name = name;
  state.t = 0;
}

const _breatheDir = [0, 1, 0];

// Advance the pose clock and return { map, weight } for this frame, or null.
export function stepPose(state, dt, { wantIdle, idleName = 'idle', clock = 0 } = {}) {
  const active = state.name && POSES[state.name];
  if (active) {
    const def = POSES[state.name];
    state.t += dt;
    if (def.dur !== Infinity && state.t >= def.dur) {
      state.name = null;
    } else {
      const phase = def.dur === Infinity ? 0 : state.t / def.dur;
      // Ease in fast, ease out over the tail so the pose never pops.
      const easeIn = Math.min(1, state.t / 0.12);
      const easeOut =
        def.dur === Infinity ? 1 : Math.min(1, (def.dur - state.t) / 0.16);
      state.weight = Math.min(easeIn, easeOut);
      const map = def.at(phase);
      if (def.breathe) {
        // A little life so a held pose isn't a statue.
        const s = Math.sin(clock * 1.7) * 0.025;
        const b = { ...map };
        b.chest = [(map.chest?.[0] ?? 0) + s * 0.4, map.chest?.[1] ?? 1, (map.chest?.[2] ?? 0) + s];
        b.head = map.head ?? _breatheDir;
        return { map: b, weight: state.weight };
      }
      return { map, weight: state.weight };
    }
  }
  // Nothing playing: fall back to idle when the player is standing still.
  if (wantIdle) {
    state.weight = Math.min(1, state.weight + dt * 6);
    const def = POSES[idleName];
    const map = def.at(0);
    const s = Math.sin(clock * 1.7) * 0.03;
    const b = { ...map };
    b.chest = [map.chest[0] + s * 0.4, map.chest[1], map.chest[2] + s];
    return { map: b, weight: state.weight };
  }
  state.weight = Math.max(0, state.weight - dt * 7);
  if (state.weight > 0.001) {
    const def = POSES[idleName];
    return { map: def.at(0), weight: state.weight };
  }
  return null;
}
