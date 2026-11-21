"""Author Street Football's keyframed clips in Blender and bake them for the game.

Run with Blender's Python module (pip install bpy, Blender 5.x):

    python tools/anim/author_clips.py            # writes src/clips.js
    python tools/anim/author_clips.py --check    # round-trip check only

How it works
------------
1. Imports assets-src/models/hero_regular_run.glb, the game's own rig, so every
   bone binds by name in game with no retargeting (the same route the
   Catch_Reach_Tuck clip took).
2. Each clip is a handful of key poses. A pose says which way each bone
   should point, as a direction in the character's frame - the same
   convention src/anim.js uses (+Y up, +Z forward, +X the character's LEFT).
   The script turns each direction into a pose-bone rotation in Blender,
   bone by bone down the hierarchy, and keys it.
3. Blender interpolates between the keys with its Bezier easing, then the
   glTF exporter samples EVERY frame at 30 fps. Shipping every frame is what
   keeps that easing: Three.js would interpolate sparse keys linearly.
4. The exported values are read back out of the exporter's own output, so
   they are already in the glTF / Three.js node-local convention. Nothing is
   converted by hand.

A clip only carries the bones it lists. Upper-body clips have no leg tracks,
so the run cycle keeps the legs striding underneath them.
"""

import json
import math
import os
import struct
import sys
import tempfile

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RIG = os.path.join(ROOT, 'assets-src', 'models', 'hero_regular_run.glb')
OUT = os.path.join(ROOT, 'src', 'clips.js')
FPS = 30

UPPER = ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head',
         'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
         'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']
LEGS = ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']
FULL = UPPER + LEGS

# Logical name -> (bone, child whose head the bone should point at).
# Solved in this order so a spine change carries into the arms.
CHAIN = [
    ('spineLow', 'Spine02', 'Spine01'),
    ('spineMid', 'Spine01', 'Spine'),
    ('chest', 'Spine', 'neck'),
    ('head', 'neck', 'Head'),
    ('lArm', 'LeftArm', 'LeftForeArm'),
    ('lFore', 'LeftForeArm', 'LeftHand'),
    ('rArm', 'RightArm', 'RightForeArm'),
    ('rFore', 'RightForeArm', 'RightHand'),
    ('lUpLeg', 'LeftUpLeg', 'LeftLeg'),
    ('lLeg', 'LeftLeg', 'LeftFoot'),
    ('lFoot', 'LeftFoot', 'LeftToeBase'),
    ('rUpLeg', 'RightUpLeg', 'RightLeg'),
    ('rLeg', 'RightLeg', 'RightFoot'),
    ('rFoot', 'RightFoot', 'RightToeBase'),
]


def model_to_arm(v):
    """Character frame (Three.js: +Y up, +Z fwd, +X left) -> Blender armature
    space (+Z up, -Y fwd, +X left)."""
    x, y, z = v
    return Vector((x, -z, y)).normalized()


# ---- Poses ---------------------------------------------------------------
# Every pose starts from CARRY (ball tucked in the right arm, athletic lean)
# and overrides what it needs. Hips: 'pitch' leans the body forward, 'yaw'
# turns it toward the character's left, 'roll' tips it toward his left, all
# in degrees; 'drop' lowers the hips in rig units (cm).

CARRY = {
    'spineLow': (0, 0.97, 0.22),
    'spineMid': (0, 0.97, 0.24),
    'chest': (0, 0.96, 0.28),
    'head': (0, 0.98, 0.18),
    'lArm': (0.32, -0.90, 0.30),
    'lFore': (0.16, -0.40, 0.90),
    'rArm': (-0.26, -0.92, 0.28),
    'rFore': (0.30, -0.10, 0.95),   # forearm across the belly: the tuck
    'lUpLeg': (0.10, -0.98, 0.12),
    'lLeg': (0.06, -0.99, -0.08),
    'lFoot': (0, -0.15, 1),
    'rUpLeg': (-0.10, -0.98, 0.12),
    'rLeg': (-0.06, -0.99, -0.08),
    'rFoot': (0, -0.15, 1),
}


def P(**over):
    pose = dict(CARRY)
    hips = over.pop('hips', {})
    pose.update(over)
    pose['_hips'] = hips
    return pose


def mirror(pose):
    """Left-right mirror of a pose (for the juke and anything sided)."""
    swap = {'l': 'r', 'r': 'l'}
    out = {}
    for k, v in pose.items():
        if k == '_hips':
            h = dict(v)
            if 'yaw' in h:
                h['yaw'] = -h['yaw']
            if 'roll' in h:
                h['roll'] = -h['roll']
            out[k] = h
            continue
        nk = swap[k[0]] + k[1:] if k[0] in swap and k[1].isupper() else k
        out[nk] = (-v[0], v[1], v[2])
    return out


# THROW - right-handed. The ball leaves the hand at RELEASE (0.17 s): the
# game holds the ball until that frame, so the clip and the flight agree.
THROW_SET = P(
    rArm=(-0.70, 0.10, -0.70), rFore=(-0.10, 0.95, -0.30),
    lArm=(0.45, -0.45, 0.77), lFore=(0.25, -0.05, 0.97),
    chest=(0.10, 0.97, 0.12), spineMid=(0.06, 0.99, 0.08), head=(0, 0.97, 0.22),
    hips={'yaw': 22},
)
THROW_COCK = P(
    rArm=(-0.78, 0.30, -0.55), rFore=(-0.05, 0.85, -0.52),
    lArm=(0.55, -0.15, 0.82), lFore=(0.30, 0.10, 0.95),
    chest=(0.16, 0.96, -0.10), spineMid=(0.10, 0.98, -0.06), head=(0, 0.97, 0.22),
    hips={'yaw': 32},
)
THROW_RELEASE = P(
    rArm=(-0.30, 0.55, 0.78), rFore=(-0.10, 0.55, 0.83),
    lArm=(0.45, -0.70, 0.55), lFore=(0.30, -0.80, 0.50),
    chest=(-0.08, 0.95, 0.30), spineMid=(-0.05, 0.97, 0.24), head=(0, 0.96, 0.26),
    hips={'yaw': -6, 'pitch': 6},
)
THROW_FOLLOW = P(
    rArm=(0.20, -0.45, 0.87), rFore=(0.55, -0.55, 0.62),
    lArm=(0.40, -0.85, -0.10), lFore=(0.20, -0.95, 0.05),
    chest=(-0.12, 0.88, 0.45), spineMid=(-0.08, 0.92, 0.38), head=(0, 0.95, 0.30),
    hips={'yaw': -18, 'pitch': 10},
)
THROW_SETTLE = P(
    rArm=(-0.30, -0.88, 0.36), rFore=(-0.10, -0.60, 0.80),
    lArm=(0.32, -0.90, 0.30), lFore=(0.16, -0.50, 0.85),
    hips={'yaw': -4, 'pitch': 3},
)

# SPIN - the body already turns 360 in game. The clip is the athlete inside
# it: ball tucked tight, shoulders dipped, off arm flung out for balance.
SPIN_LOAD = P(
    chest=(0.10, 0.85, 0.52), spineMid=(0.06, 0.90, 0.42), head=(0.05, 0.94, 0.33),
    lArm=(0.55, -0.70, 0.45), lFore=(0.40, -0.30, 0.86),
    rArm=(-0.20, -0.90, 0.38), rFore=(0.45, 0.05, 0.89),
    hips={'pitch': 8, 'drop': 7},
)
SPIN_WHIP = P(
    chest=(-0.20, 0.90, 0.38), spineMid=(-0.12, 0.94, 0.30), head=(-0.12, 0.96, 0.25),
    lArm=(0.95, -0.20, -0.20), lFore=(0.90, 0.20, -0.38),
    rArm=(-0.15, -0.92, 0.36), rFore=(0.50, 0.10, 0.86),
    hips={'pitch': 6, 'drop': 9, 'roll': -6},
)
SPIN_OUT = P(
    chest=(0, 0.90, 0.44), spineMid=(0, 0.93, 0.36),
    lArm=(0.45, -0.75, 0.48), lFore=(0.25, -0.30, 0.92),
    hips={'pitch': 7, 'drop': 4},
)

# JUKE - authored cutting to his RIGHT (plant the left foot wide, push off);
# the left cut is the exact mirror.
JUKE_PLANT_R = P(
    lUpLeg=(0.42, -0.88, 0.20), lLeg=(0.48, -0.86, -0.10), lFoot=(0.2, -0.1, 1),
    rUpLeg=(-0.05, -0.90, 0.42), rLeg=(-0.05, -0.95, -0.30),
    chest=(-0.25, 0.92, 0.30), spineMid=(-0.15, 0.95, 0.27), head=(-0.20, 0.95, 0.24),
    lArm=(0.65, -0.60, 0.45), lFore=(0.45, -0.20, 0.87),
    hips={'roll': -10, 'drop': 9, 'yaw': -10},
)
JUKE_PUSH_R = P(
    lUpLeg=(0.30, -0.82, -0.48), lLeg=(0.30, -0.70, -0.65), lFoot=(0.2, -0.6, 0.8),
    rUpLeg=(-0.25, -0.80, 0.55), rLeg=(-0.15, -0.92, -0.35),
    chest=(-0.32, 0.88, 0.34), spineMid=(-0.20, 0.93, 0.30), head=(-0.28, 0.92, 0.27),
    lArm=(0.75, -0.40, 0.52), lFore=(0.55, 0.00, 0.83),
    hips={'roll': -14, 'drop': 6, 'yaw': -16},
)
JUKE_RUN_R = P(
    chest=(-0.10, 0.95, 0.30), spineMid=(-0.06, 0.97, 0.25),
    hips={'roll': -4, 'yaw': -6},
)

# TRUCK - lower the right shoulder into him, ball arm locked in, off forearm
# driven forward like a battering ram, eyes up.
TRUCK_LOAD = P(
    chest=(-0.05, 0.80, 0.60), spineMid=(-0.03, 0.86, 0.52), spineLow=(0, 0.90, 0.44),
    head=(0, 0.94, 0.35),
    lArm=(0.35, -0.55, 0.76), lFore=(0.20, 0.10, 0.97),
    rArm=(-0.20, -0.90, 0.40), rFore=(0.55, 0.05, 0.83),
    hips={'pitch': 12, 'drop': 10, 'yaw': 10},
)
TRUCK_HIT = P(
    chest=(-0.18, 0.66, 0.73), spineMid=(-0.10, 0.76, 0.64), spineLow=(0, 0.86, 0.51),
    head=(-0.05, 0.92, 0.40),
    lArm=(0.25, -0.20, 0.95), lFore=(0.10, 0.20, 0.97),
    rArm=(-0.25, -0.85, 0.46), rFore=(0.55, 0.10, 0.83),
    hips={'pitch': 16, 'drop': 12, 'yaw': 18},
)
TRUCK_DRIVE = P(
    chest=(-0.08, 0.78, 0.62), spineMid=(-0.05, 0.84, 0.54),
    lArm=(0.40, -0.70, 0.60), lFore=(0.25, -0.20, 0.95),
    hips={'pitch': 10, 'drop': 6, 'yaw': 6},
)

# FALLS - the game tips the whole rig over (forward or back) while these
# play, so the directions are in the character's own frame: "forward" here
# becomes "down at the turf" as he goes over. Each ends close to the game's
# sprawled DOWN pose so the hand-off at the end is invisible.
DOWN_END = P(
    lArm=(0.50, -0.10, 0.86), lFore=(0.35, -0.15, 0.92),
    rArm=(-0.50, -0.10, 0.86), rFore=(-0.35, -0.15, 0.92),
    lUpLeg=(0.16, -0.90, -0.40), lLeg=(0.10, -0.84, -0.53), lFoot=(0, -0.6, 0.6),
    rUpLeg=(-0.16, -0.90, -0.40), rLeg=(-0.10, -0.84, -0.53), rFoot=(0, -0.6, 0.6),
    chest=(0, 0.90, 0.44), head=(0, 0.86, 0.51),
)
# On his back after a head-on wrap. The rig is tipped over backwards, so the
# character's "forward" now points at the sky: legs run out along the turf
# with the knees a little up, arms flung wide. anim.js has the same pose as
# DOWN_BACK so the hand-off matches.
DOWN_BACK_END = P(
    lArm=(0.85, -0.45, -0.05), lFore=(0.75, -0.25, 0.30),
    rArm=(-0.85, -0.45, -0.05), rFore=(-0.75, -0.25, 0.30),
    lUpLeg=(0.18, -0.95, 0.25), lLeg=(0.12, -0.97, -0.20), lFoot=(0.1, 0.3, 1),
    rUpLeg=(-0.14, -0.97, 0.18), rLeg=(-0.10, -0.98, -0.12), rFoot=(-0.1, 0.3, 1),
    chest=(0, 0.98, 0.18), spineMid=(0, 0.99, 0.10), head=(0, 0.93, 0.36),
)
# Dragged down from behind: stumbles, reaches out to break the fall.
FWD_STUMBLE = P(
    lUpLeg=(0.12, -0.80, 0.58), lLeg=(0.10, -0.98, 0.15),
    rUpLeg=(-0.12, -0.92, -0.38), rLeg=(-0.08, -0.70, -0.70),
    lArm=(0.55, -0.30, 0.78), lFore=(0.35, -0.05, 0.94),
    rArm=(-0.35, -0.75, 0.56), rFore=(0.35, -0.10, 0.93),
    chest=(0, 0.82, 0.57), head=(0, 0.90, 0.44),
    hips={'pitch': 14, 'drop': 10},
)
FWD_REACH = P(
    lUpLeg=(0.14, -0.94, -0.30), lLeg=(0.10, -0.80, -0.59),
    rUpLeg=(-0.14, -0.88, -0.45), rLeg=(-0.08, -0.70, -0.71),
    lArm=(0.45, 0.10, 0.89), lFore=(0.30, -0.25, 0.92),
    rArm=(-0.30, -0.55, 0.78), rFore=(0.40, -0.05, 0.92),
    chest=(0, 0.86, 0.51), head=(0, 0.80, 0.60),
    hips={'pitch': 10, 'drop': 14},
)
FWD_IMPACT = P(
    lUpLeg=(0.16, -0.92, -0.36), lLeg=(0.10, -0.86, -0.50),
    rUpLeg=(-0.16, -0.90, -0.40), rLeg=(-0.10, -0.84, -0.53),
    lArm=(0.55, -0.35, 0.76), lFore=(0.40, -0.40, 0.82),
    rArm=(-0.40, -0.40, 0.82), rFore=(0.20, -0.20, 0.96),
    chest=(0, 0.92, 0.40), head=(0, 0.84, 0.54),
    hips={'drop': 8},
)
# Wrapped up head-on: knocked back, legs come up, arms thrown wide.
BACK_HIT = P(
    chest=(0, 0.96, -0.28), spineMid=(0, 0.97, -0.22), head=(0, 0.94, -0.34),
    lArm=(0.75, -0.10, 0.65), lFore=(0.65, 0.30, 0.70),
    rArm=(-0.45, -0.60, 0.66), rFore=(0.30, -0.10, 0.95),
    lUpLeg=(0.12, -0.85, 0.51), lLeg=(0.08, -0.96, 0.27),
    rUpLeg=(-0.12, -0.96, 0.25), rLeg=(-0.08, -0.97, -0.20),
    hips={'pitch': -8, 'drop': 6},
)
BACK_AIR = P(
    chest=(0, 0.93, -0.36), spineMid=(0, 0.95, -0.30), head=(0, 0.86, 0.51),
    lArm=(0.85, 0.25, 0.46), lFore=(0.70, 0.55, 0.45),
    rArm=(-0.60, -0.30, 0.74), rFore=(0.30, -0.05, 0.95),
    lUpLeg=(0.14, -0.55, 0.82), lLeg=(0.10, -0.90, 0.42),
    rUpLeg=(-0.14, -0.65, 0.75), rLeg=(-0.10, -0.95, 0.30),
    hips={'pitch': -6, 'drop': 10},
)
BACK_LAND = P(
    chest=(0, 0.96, -0.10), spineMid=(0, 0.97, -0.08), head=(0, 0.90, 0.44),
    lArm=(0.80, -0.30, 0.52), lFore=(0.60, -0.10, 0.79),
    rArm=(-0.55, -0.55, 0.63), rFore=(0.30, -0.10, 0.95),
    lUpLeg=(0.18, -0.70, 0.69), lLeg=(0.12, -0.98, 0.15),
    rUpLeg=(-0.18, -0.80, 0.57), rLeg=(-0.12, -0.99, 0.05),
    hips={'drop': 8},
)
# Shoestring: legs taken out from the side, one foot caught, the other kicks.
SHOE_TRIP = P(
    lUpLeg=(0.20, -0.95, -0.25), lLeg=(0.15, -0.60, -0.79), lFoot=(0, -0.9, 0.4),
    rUpLeg=(-0.30, -0.70, 0.65), rLeg=(-0.20, -0.95, 0.20),
    lArm=(0.70, -0.20, 0.68), lFore=(0.55, 0.20, 0.81),
    rArm=(-0.35, -0.75, 0.56), rFore=(0.35, -0.10, 0.93),
    chest=(0.15, 0.88, 0.45), head=(0.10, 0.92, 0.38),
    hips={'pitch': 10, 'roll': 10, 'drop': 8},
)
SHOE_TWIST = P(
    lUpLeg=(0.25, -0.85, -0.46), lLeg=(0.18, -0.70, -0.69),
    rUpLeg=(-0.35, -0.60, 0.72), rLeg=(-0.25, -0.92, 0.30),
    lArm=(0.60, 0.10, 0.79), lFore=(0.40, -0.20, 0.89),
    rArm=(-0.40, -0.50, 0.77), rFore=(0.30, -0.10, 0.95),
    chest=(0.18, 0.85, 0.49), head=(0.12, 0.82, 0.56),
    hips={'pitch': 8, 'roll': 16, 'drop': 13},
)

# (name, bone set, [(frame, pose)], extra metadata). Frame 0 is the first.
CLIPS = [
    ('throw', UPPER, [(0, THROW_SET), (4, THROW_COCK), (5, THROW_RELEASE),
                      (9, THROW_FOLLOW), (21, THROW_SETTLE)],
     {'release': 5 / FPS, 'fadeIn': 0.05, 'fadeOut': 0.18}),
    ('spin', UPPER, [(0, SPIN_LOAD), (6, SPIN_WHIP), (12, SPIN_WHIP), (18, SPIN_OUT)],
     {'fadeIn': 0.06, 'fadeOut': 0.14}),
    ('jukeRight', FULL, [(0, JUKE_PLANT_R), (5, JUKE_PUSH_R), (12, JUKE_RUN_R)],
     {'fadeIn': 0.04, 'fadeOut': 0.14}),
    ('jukeLeft', FULL, [(0, mirror(JUKE_PLANT_R)), (5, mirror(JUKE_PUSH_R)),
                        (12, mirror(JUKE_RUN_R))],
     {'fadeIn': 0.04, 'fadeOut': 0.14}),
    ('truck', UPPER, [(0, TRUCK_LOAD), (5, TRUCK_HIT), (11, TRUCK_HIT), (17, TRUCK_DRIVE)],
     {'fadeIn': 0.05, 'fadeOut': 0.16}),
    ('fallForward', FULL, [(0, FWD_STUMBLE), (8, FWD_REACH), (17, FWD_IMPACT),
                           (26, DOWN_END)],
     {'fadeIn': 0.06, 'fadeOut': 0.25, 'holdsEnd': True}),
    ('fallBack', FULL, [(0, BACK_HIT), (8, BACK_AIR), (18, BACK_LAND), (26, DOWN_BACK_END)],
     {'fadeIn': 0.06, 'fadeOut': 0.25, 'holdsEnd': True}),
    ('fallShoestring', FULL, [(0, SHOE_TRIP), (8, SHOE_TWIST), (17, FWD_IMPACT),
                              (26, DOWN_END)],
     {'fadeIn': 0.06, 'fadeOut': 0.25, 'holdsEnd': True}),
]


# ---- Blender side ----------------------------------------------------------

def load_rig():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=RIG)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    # Drop the run clip: each export should carry exactly one action.
    if arm.animation_data:
        arm.animation_data.action = None
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    scene = bpy.context.scene
    scene.render.fps = FPS
    return arm


def reset(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
        pb.scale = Vector((1, 1, 1))
    bpy.context.view_layer.update()


def rotate_about_head(pb, rot):
    head = pb.head.copy()
    m = Matrix.Translation(head) @ rot.to_matrix().to_4x4() @ Matrix.Translation(-head)
    pb.matrix = m @ pb.matrix
    bpy.context.view_layer.update()


def apply_pose(arm, pose):
    reset(arm)
    pbs = arm.pose.bones
    hips = pose.get('_hips', {})
    hip = pbs['Hips']
    q = (Quaternion((0, 0, 1), math.radians(hips.get('yaw', 0)))
         @ Quaternion((1, 0, 0), math.radians(hips.get('pitch', 0)))
         @ Quaternion((0, 1, 0), -math.radians(hips.get('roll', 0))))
    rotate_about_head(hip, q)
    if hips.get('drop'):
        m = hip.matrix.copy()
        m.translation.z -= hips['drop']
        hip.matrix = m
        bpy.context.view_layer.update()
    for key, bone, child in CHAIN:
        if key not in pose:
            continue
        pb, cb = pbs[bone], pbs[child]
        have = (cb.head - pb.head)
        if have.length < 1e-6:
            continue
        want = model_to_arm(pose[key])
        rotate_about_head(pb, have.normalized().rotation_difference(want))


def key_clip(arm, name, bones, keys):
    act = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = act
    for frame, pose in keys:
        apply_pose(arm, pose)
        for b in bones:
            pb = arm.pose.bones[b]
            pb.keyframe_insert('rotation_quaternion', frame=frame + 1)
            if b == 'Hips':
                pb.keyframe_insert('location', frame=frame + 1)
    # Bezier with auto-clamped handles: eases in and out of every key
    # without overshooting the pose.
    try:
        curves = act.fcurves
    except AttributeError:  # layered actions (Blender 4.4+)
        curves = [fc for layer in act.layers for strip in layer.strips
                  for bag in strip.channelbags for fc in bag.fcurves]
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
        fc.update()
    last = keys[-1][0] + 1
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = last
    return act


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_animations=True,
        export_animation_mode='ACTIVE_ACTIONS', export_force_sampling=True,
        export_frame_step=1, export_optimize_animation_size=False,
        export_def_bones=False, export_reset_pose_bones=False,
    )


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    gj = json.loads(data[20:20 + jlen])
    bin_off = 20 + jlen + 8
    def acc(i):
        a = gj['accessors'][i]
        bv = gj['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
        off = bin_off + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        return list(struct.unpack_from('<%df' % (a['count'] * n), data, off)), n
    return gj, acc


def sample_export(path, bones):
    gj, acc = read_glb(path)
    names = {i: n.get('name') for i, n in enumerate(gj['nodes'])}
    anim = gj['animations'][0]
    times = None
    rot, pos = {}, None
    for ch in anim['channels']:
        node = names[ch['target']['node']]
        s = anim['samplers'][ch['sampler']]
        if times is None:
            times, _ = acc(s['input'])
        vals, _ = acc(s['output'])
        if node in bones and ch['target']['path'] == 'rotation':
            rot[node] = vals
        if node == 'Hips' and ch['target']['path'] == 'translation':
            pos = vals
    t0 = times[0]
    return [round(t - t0, 4) for t in times], rot, pos, gj


def round_list(vs, nd):
    return [round(v, nd) for v in vs]


def check_roundtrip():
    """Export the bind pose and compare with the rig GLB's own node
    rotations. If these match, keyed values come out in game convention."""
    arm = load_rig()
    act = key_clip(arm, 'bind', FULL, [(0, {'_hips': {}}), (1, {'_hips': {}})])
    tmp = os.path.join(tempfile.mkdtemp(), 'bind.glb')
    export(tmp)
    _, rot, pos, _ = sample_export(tmp, FULL)
    src, _ = read_glb(RIG)
    nodes = {n.get('name'): n for n in src['nodes']}
    worst = 0
    for b in FULL:
        want = nodes[b].get('rotation', [0, 0, 0, 1])
        got = rot[b][:4]
        d = min(sum((a - c) ** 2 for a, c in zip(want, got)),
                sum((a + c) ** 2 for a, c in zip(want, got))) ** 0.5
        worst = max(worst, d)
    print('round-trip worst quaternion error vs rig bind pose: %.6f' % worst)
    return worst


def main():
    if '--check' in sys.argv:
        check_roundtrip()
        return
    err = check_roundtrip()
    if err > 1e-3:
        sys.exit('round-trip check failed, not writing clips')
    tmpdir = tempfile.mkdtemp()
    out = {}
    for name, bones, keys, meta in CLIPS:
        arm = load_rig()
        key_clip(arm, name, bones, keys)
        path = os.path.join(tmpdir, name + '.glb')
        export(path)
        times, rot, pos, _ = sample_export(path, bones)
        missing = [b for b in bones if b not in rot]
        if missing:
            sys.exit('%s: exporter dropped %s' % (name, missing))
        clip = {
            'name': name, 'fps': FPS, 'duration': times[-1],
            'times': times, 'bones': bones,
            'rot': {b: round_list(rot[b], 4) for b in bones},
            'hipsPos': round_list(pos, 5) if pos else None,
        }
        clip.update(meta)
        out[name] = clip
        print('%-15s %5.2fs  %2d frames  %2d bones' % (name, times[-1], len(times), len(bones)))
    with open(OUT, 'w') as f:
        f.write('// GENERATED by tools/anim/author_clips.py - do not edit by hand.\n')
        f.write('// Keyframed in Blender on assets-src/models/hero_regular_run.glb, baked at\n')
        f.write('// %d fps, values read back from the glTF exporter (node-local, Three.js\n' % FPS)
        f.write('// convention). Re-run the script to change a clip.\n\n')
        f.write('export const CLIPS = %s;\n' % json.dumps(out, separators=(',', ':')))
    print('wrote', os.path.relpath(OUT, ROOT), '%.1f KB' % (os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
