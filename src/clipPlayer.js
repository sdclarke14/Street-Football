// Plays the Blender-keyframed clips in src/clips.js on a player's bones.
//
// Same approach as the Catch_Reach_Tuck clip (see catchClip.js): the clip is
// NOT run through AnimationMixer. The mixer keeps playing the run cycle; after
// it (and after the procedural pose overlay) each frame, the sampled clip pose
// is slerped onto the bones it has tracks for, by a fade weight. Bones a clip
// doesn't list are left to the run cycle, which is how an upper-body throw
// keeps the legs running underneath it.
//
// Because the clip is applied last, its fade-out hands over to whatever the
// pose overlay wrote underneath - which is how a fall settles into the
// sprawled DOWN pose instead of snapping to it.

import { CLIPS } from './clips.js';

// Every bone any clip can drive. players.js looks these up once per rig.
export const CLIP_BONES = [
  'Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
];

export { CLIPS };

// Start (or restart) a clip on a player.
export function startClip(p, name) {
  if (!CLIPS[name]) return;
  p.clip = { name, t: 0 };
}

// Fade weight at time t. Clips that hold their last frame (the falls) play
// to the end at full weight, then fade out over fadeOut on top of the pose
// underneath. Others fade out inside their own duration.
export function clipWeight(def, t) {
  if (t < 0) return 0;
  const fadeIn = def.fadeIn ?? 0.08;
  const fadeOut = def.fadeOut ?? 0.18;
  const inW = Math.min(1, t / fadeIn);
  if (def.holdsEnd) {
    if (t <= def.duration) return inW;
    return Math.max(0, 1 - (t - def.duration) / fadeOut);
  }
  return Math.max(0, Math.min(inW, (def.duration - t) / fadeOut));
}

export function clipLength(def) {
  return def.holdsEnd ? def.duration + (def.fadeOut ?? 0.18) : def.duration;
}

export function makeClipPlayer(THREE) {
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const pos = new THREE.Vector3();

  // Sample `def` at time t and blend it onto the bones by weight w.
  function apply(def, t, bones, w) {
    const times = def.times;
    const tt = Math.max(0, Math.min(def.duration, t));
    let i = 1;
    while (i < times.length - 1 && times[i] < tt) i++;
    const p = i - 1;
    const a = times[i] > times[p] ? (tt - times[p]) / (times[i] - times[p]) : 0;
    for (const name of def.bones) {
      const bone = bones[name];
      const r = def.rot[name];
      if (!bone || !r) continue;
      qa.set(r[p * 4], r[p * 4 + 1], r[p * 4 + 2], r[p * 4 + 3]);
      qb.set(r[i * 4], r[i * 4 + 1], r[i * 4 + 2], r[i * 4 + 3]);
      qa.slerp(qb, a);
      bone.quaternion.slerp(qa, w);
    }
    const h = def.hipsPos;
    if (h && bones.Hips) {
      pos.set(
        h[p * 3] + (h[i * 3] - h[p * 3]) * a,
        h[p * 3 + 1] + (h[i * 3 + 1] - h[p * 3 + 1]) * a,
        h[p * 3 + 2] + (h[i * 3 + 2] - h[p * 3 + 2]) * a
      );
      bones.Hips.position.lerp(pos, w);
    }
  }

  // Advance a player's clip by dt and write it. Returns false when it ended.
  return function stepClip(p, dt) {
    if (!p.clip) return false;
    const def = CLIPS[p.clip.name];
    p.clip.t += dt;
    if (!def || p.clip.t > clipLength(def)) {
      p.clip = null;
      return false;
    }
    const w = clipWeight(def, p.clip.t);
    if (w > 0.001) apply(def, p.clip.t, p.clipBones, w);
    return true;
  };
}
