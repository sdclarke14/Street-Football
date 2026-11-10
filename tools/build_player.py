"""Build the flag football player for Street Football.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/build_player.py -- [preview_dir]

Takes the existing 24-bone rig (and its three run clips) from art/source,
builds a new higher-detail body plus clothing shells on it (union of primitives
-> voxel remesh -> smooth -> cut hems -> decimate -> thickness), skins it with
distance-based weights, and writes:
  public/models/player_flag.glb   (rig + mesh + clips Run_Regular/Run_Turbo/Run_Gassed)
  art/player_flag.blend           (editable source)
Material names (Skin, Jersey, Shorts, Socks, Cleats, Hair, Belt, Gloves, Eyes)
are what the game keys its PBR materials and team colors on.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, "public", "models")
SOURCE = os.path.join(ROOT, "art", "source")  # original rig + run clips
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW_DIR = argv[0] if argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- rig + clips
def import_glb(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SOURCE, name))
    return [o for o in bpy.data.objects if o not in before]

objs = import_glb("hero_regular_run.glb")
arm = next(o for o in objs if o.type == "ARMATURE")
arm.name = "Armature"
acts = {"Run_Regular": arm.animation_data.action}
for o in objs:
    if o is not arm:
        bpy.data.objects.remove(o, do_unlink=True)
for fname, clip in (("hero_turbo_run.glb", "Run_Turbo"), ("hero_gassed_run.glb", "Run_Gassed")):
    extra = import_glb(fname)
    a = next(o for o in extra if o.type == "ARMATURE")
    acts[clip] = a.animation_data.action
    for o in extra:
        bpy.data.objects.remove(o, do_unlink=True)
for name, act in acts.items():
    act.name = name
    act.use_fake_user = True

# Rest pose: evaluate with no action so bones sit at rest.
arm.animation_data.action = None
H = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
V = Vector

def tip(a, b, length):
    return H[b] + (H[b] - H[a]).normalized() * length

def toe_tip(foot, toe):
    d = H[toe] - H[foot]
    d.z = 0
    p = H[toe] + d.normalized() * 0.07
    p.z = 0.035
    return p

SEG = {
    "Hips": (H["Hips"], H["Spine02"]), "Spine02": (H["Spine02"], H["Spine01"]),
    "Spine01": (H["Spine01"], H["Spine"]), "Spine": (H["Spine"], H["neck"]),
    "neck": (H["neck"], H["Head"]), "Head": (H["Head"], H["head_end"]),
}
for s in ("Left", "Right"):
    SEG[s + "Shoulder"] = (H[s + "Shoulder"], H[s + "Arm"])
    SEG[s + "Arm"] = (H[s + "Arm"], H[s + "ForeArm"])
    SEG[s + "ForeArm"] = (H[s + "ForeArm"], H[s + "Hand"])
    SEG[s + "Hand"] = (H[s + "Hand"], tip(s + "ForeArm", s + "Hand", 0.17))
    SEG[s + "UpLeg"] = (H[s + "UpLeg"], H[s + "Leg"])
    SEG[s + "Leg"] = (H[s + "Leg"], H[s + "Foot"])
    SEG[s + "Foot"] = (H[s + "Foot"], H[s + "ToeBase"])
    SEG[s + "ToeBase"] = (H[s + "ToeBase"], toe_tip(s + "Foot", s + "ToeBase"))
MID_X = (H["LeftUpLeg"].x + H["RightUpLeg"].x) / 2

# ---------------------------------------------------------------- primitives
def along(d):
    return V((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()

def ellipsoid(bm, c, r, rot=None, grow=0.0):
    rot = rot or Matrix.Identity(3)
    m = Matrix.Translation(c) @ rot.to_4x4() @ Matrix.Diagonal((r[0] + grow, r[1] + grow, r[2] + grow, 1))
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=18, radius=1.0, matrix=m)

def capsule(bm, p, q, r1, r2, grow=0.0):
    d = q - p
    m = Matrix.Translation((p + q) / 2) @ along(d).to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=r1 + grow, radius2=r2 + grow, depth=d.length, matrix=m)
    ellipsoid(bm, p, (r1, r1, r1), grow=grow)
    ellipsoid(bm, q, (r2, r2, r2), grow=grow)

def lerpv(a, b, t):
    return a + (b - a) * t

def frame_rot(axis_z, hint_x):
    z = axis_z.normalized()
    x = (hint_x - z * hint_x.dot(z)).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()

# Torso pieces shared by body and jersey: (center, radii)
def jersey_parts(bm, g):
    ellipsoid(bm, V((0, 0.018, 0.915)), (0.185, 0.135, 0.085), grow=g)  # hem flare
    ellipsoid(bm, V((0, 0.012, 0.98)), (0.155, 0.112, 0.12), grow=g)
    ellipsoid(bm, H["Spine01"], (0.156, 0.11, 0.13), grow=g)
    ellipsoid(bm, H["Spine"] + V((0, -0.005, -0.01)), (0.18, 0.125, 0.14), grow=g)
    ellipsoid(bm, V((0, 0.02, 1.265)), (0.2, 0.105, 0.075), grow=g)
    for s in (1, -1):
        capsule(bm, V((0, 0.04, 1.32)), V((0.17 * s, 0.03, 1.285)), 0.05, 0.048, grow=g)

def torso_parts(bm, g=0.0, jersey=False):
    if not jersey:
        ellipsoid(bm, H["Hips"] + V((0, 0.01, 0.03)), (0.165, 0.115, 0.12), grow=g)
        for s in (1, -1):
            ellipsoid(bm, V((0.075 * s, 0.07, 0.80)), (0.085, 0.07, 0.09), grow=g)  # glutes
    ellipsoid(bm, V((0, 0.012, 0.96)), (0.148, 0.106, 0.11), grow=g)  # waist
    ellipsoid(bm, H["Spine01"], (0.152, 0.106, 0.11), grow=g)  # abdomen
    ellipsoid(bm, H["Spine"] + V((0, 0, -0.01)), (0.175, 0.116, 0.13), grow=g)  # chest
    ellipsoid(bm, V((0, 0.02, 1.27)), (0.19, 0.1, 0.07), grow=g)  # shoulder girdle
    for s in (1, -1):
        ellipsoid(bm, V((0.085 * s, -0.062, 1.2)), (0.085, 0.045, 0.07), grow=g)  # pecs
        ellipsoid(bm, V((0.12 * s, 0.04, 1.13)), (0.06, 0.07, 0.12), grow=g)  # lats
        capsule(bm, V((0, 0.04, 1.33)), V((0.17 * s, 0.03, 1.29)), 0.05, 0.045, grow=g)  # traps

def arm_parts(bm, s, g=0.0, sleeve=False):
    A, F, Hd = H[s + "Arm"], H[s + "ForeArm"], H[s + "Hand"]
    sx = 1 if s == "Left" else -1
    ellipsoid(bm, A + V((0.012 * sx, 0, 0.005)), (0.066, 0.07, 0.066), grow=g)  # deltoid
    if sleeve:
        capsule(bm, A, lerpv(A, F, 0.6), 0.062, 0.056, grow=g)
        return
    capsule(bm, A, F, 0.057, 0.045)
    d = F - A
    ellipsoid(bm, lerpv(A, F, 0.45) + V((0, -0.016, 0)), (0.048, 0.05, 0.085), along(d))  # biceps
    ellipsoid(bm, lerpv(A, F, 0.4) + V((0, 0.018, 0)), (0.05, 0.048, 0.095), along(d))  # triceps
    capsule(bm, F, Hd, 0.047, 0.031)
    ellipsoid(bm, lerpv(F, Hd, 0.28), (0.052, 0.047, 0.09), along(Hd - F))  # forearm
    a = (Hd - F).normalized()
    rot = frame_rot(a, V((1, 0, 0)))  # local x = thickness (palm faces body)
    ellipsoid(bm, Hd + a * 0.075, (0.022, 0.047, 0.088), rot)  # hand
    w = rot.col[1]
    capsule(bm, Hd + a * 0.02 - w * 0.03, Hd + a * 0.075 - w * 0.055, 0.016, 0.013)  # thumb

def leg_parts(bm, s, g=0.0, shorts=False, cleat=False):
    U, L, Fo, T = H[s + "UpLeg"], H[s + "Leg"], H[s + "Foot"], H[s + "ToeBase"]
    if shorts:
        capsule(bm, U, lerpv(U, L, 0.62), 0.095, 0.08, grow=g)
        return
    heel = Fo + V((0, 0.03, 0)); heel.z = 0.045
    toe = toe_tip(s + "Foot", s + "ToeBase")
    fwd = toe - heel; fwd.z = 0
    if cleat:
        ellipsoid(bm, (heel + toe) / 2 + V((0, 0, 0.005)), (0.05, 0.05, fwd.length / 2 + 0.01), frame_rot(fwd, V((0, 0, 1))), grow=g)
        capsule(bm, Fo, T, 0.04, 0.034, grow=g)
        return
    capsule(bm, U, L, 0.09, 0.058)
    d = L - U
    ellipsoid(bm, lerpv(U, L, 0.42) + V((0, -0.022, 0)), (0.072, 0.062, 0.17), along(d))  # quads
    ellipsoid(bm, lerpv(U, L, 0.45) + V((0, 0.025, 0)), (0.062, 0.058, 0.16), along(d))  # hamstring
    ellipsoid(bm, L, (0.056, 0.056, 0.056))  # knee
    capsule(bm, L, Fo, 0.055, 0.034)
    ellipsoid(bm, lerpv(L, Fo, 0.3) + V((0, 0.026, 0)), (0.05, 0.05, 0.1), along(Fo - L))  # calf
    ellipsoid(bm, (heel + toe) / 2, (0.042, 0.038, fwd.length / 2), frame_rot(fwd, V((0, 0, 1))))
    capsule(bm, Fo, T, 0.036, 0.03)

def head_parts(bm, g=0.0, hair=False):
    ellipsoid(bm, V((0, 0.012, 1.575)), (0.09, 0.098, 0.1), grow=g)  # cranium
    if hair:
        return
    capsule(bm, H["neck"], V((0, 0.025, 1.47)), 0.066, 0.062)
    ellipsoid(bm, V((0, -0.03, 1.495)), (0.074, 0.074, 0.068))  # jaw
    ellipsoid(bm, V((0, -0.068, 1.458)), (0.036, 0.03, 0.026))  # chin
    ellipsoid(bm, V((0, -0.074, 1.575)), (0.06, 0.02, 0.011))  # brow
    for s in (1, -1):
        ellipsoid(bm, V((0.05 * s, -0.058, 1.535)), (0.02, 0.02, 0.016))  # cheekbones
        ellipsoid(bm, V((0.09 * s, 0.012, 1.55)), (0.012, 0.022, 0.03))  # ears
    capsule(bm, V((0, -0.092, 1.565)), V((0, -0.102, 1.53)), 0.011, 0.014)  # nose

# ---------------------------------------------------------------- mesh pipeline
def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob

def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)

def bisect(ob, cuts):
    """Each cut is (point, normal) or (point, normal, radius). Geometry on the
    normal's side is removed; with a radius only within that distance of point."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for cut in cuts:
        co, no = cut[0], cut[1].normalized()
        radius = cut[2] if len(cut) > 2 else None
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no)
        doomed = [f for f in bm.faces
                  if (f.calc_center_median() - co).dot(no) > 0
                  and (radius is None or (f.calc_center_median() - co).length < radius)]
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
    # Drop small loose fragments left behind by the cuts.
    bm.faces.ensure_lookup_table()
    seen, small = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop(); comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index); stack.append(h)
        if len(comp) < 60:
            small.extend(comp)
    bmesh.ops.delete(bm, geom=small, context="FACES")
    bm.to_mesh(ob.data); bm.free()

def split(ob, planes):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for co, no in planes:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no.normalized())
    bm.to_mesh(ob.data); bm.free()

def finish(name, build, voxel=0.0055, faces=3000, cuts=(), thickness=0.0, smooth=10, hide=None):
    """faces = triangle budget before thickness."""
    bm = bmesh.new(); build(bm)
    ob = mesh_obj(name, bm)
    r = ob.modifiers.new("remesh", "REMESH"); r.mode = "VOXEL"; r.voxel_size = voxel
    s = ob.modifiers.new("smooth", "LAPLACIANSMOOTH"); s.iterations = smooth; s.lambda_factor = 0.7
    s.use_volume_preserve = True
    apply_mods(ob)
    if hide:
        bm = bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if hide(f.calc_center_median())], context="FACES")
        bm.to_mesh(ob.data); bm.free()
    n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if n > faces:
        d = ob.modifiers.new("decimate", "DECIMATE"); d.ratio = faces / n
        apply_mods(ob)
    if cuts:
        bisect(ob, cuts)
    if thickness:
        so = ob.modifiers.new("solid", "SOLIDIFY"); so.thickness = thickness; so.offset = -1; so.use_even_offset = True
        apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob

# ---------------------------------------------------------------- materials
MATS = {
    "Skin": ((0.55, 0.36, 0.25), 0.55), "Jersey": ((0.12, 0.45, 0.22), 0.8),
    "Shorts": ((0.08, 0.08, 0.09), 0.75), "Socks": ((0.9, 0.9, 0.88), 0.9),
    "Cleats": ((0.06, 0.06, 0.07), 0.45), "Hair": ((0.05, 0.035, 0.03), 0.6),
    "Belt": ((0.05, 0.05, 0.05), 0.5), "Gloves": ((0.08, 0.08, 0.09), 0.6), "Eyes": ((0.03, 0.025, 0.02), 0.2), "EyeWhite": ((0.8, 0.78, 0.74), 0.3),
}
def mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    col, rough = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1); b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*col, 1); m.roughness = rough
    return m

def box_uv(ob):
    """Box-project UVs in meters (1 UV unit = 1 m) for tiling detail maps."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = [(1, 2), (0, 2), (0, 1)][ax]
        for l in f.loops:
            l[uv].uv = (l.vert.co[a], l.vert.co[b])
    bm.to_mesh(ob.data); bm.free()

def set_mats(ob, names, pick=None):
    for n in names:
        ob.data.materials.append(mat(n))
    if pick:
        for p in ob.data.polygons:
            p.material_index = pick(p.center)

# ---------------------------------------------------------------- weights
def skin(ob, bones, power=5, keep=4):
    for b in arm.data.bones:
        if b.name not in ob.vertex_groups:
            ob.vertex_groups.new(name=b.name)
    vg = {g.name: g for g in ob.vertex_groups}
    for v in ob.data.vertices:
        p = v.co
        allowed = bones(p) if callable(bones) else bones
        ws = []
        for bn in allowed:
            a, b = SEG[bn]
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
            d = (a + ab * t - p).length
            ws.append((1.0 / (d + 0.004) ** power, bn))
        ws.sort(reverse=True)
        ws = ws[:keep]
        tot = sum(w for w, _ in ws)
        for w, bn in ws:
            if w / tot > 0.01:
                vg[bn].add([v.index], w / tot, "REPLACE")
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    m = ob.modifiers.new("Armature", "ARMATURE"); m.object = arm

SPINE = ["Hips", "Spine02", "Spine01", "Spine", "neck"]
def side(p):
    return "Left" if p.x > MID_X else "Right"
def torso_bones(p):
    s = side(p)
    return SPINE + ["Head", s + "Shoulder", s + "Arm", s + "UpLeg"]
def arm_bones(s):
    return [s + "Shoulder", s + "Arm", s + "ForeArm", s + "Hand"]
def leg_bones(s):
    return ["Hips", s + "UpLeg", s + "Leg", s + "Foot", s + "ToeBase"]

# ---------------------------------------------------------------- build
parts = []
torso = finish("Body_Torso", lambda bm: (torso_parts(bm), head_parts(bm)), voxel=0.0042, faces=4200,
               hide=lambda c: 0.84 < c.z < 1.25)
set_mats(torso, ["Skin"]); skin(torso, torso_bones); parts.append(torso)
for s in ("Left", "Right"):
    A0, F0 = H[s + "Arm"], H[s + "ForeArm"]
    a = finish("Body_Arm" + s, lambda bm, s=s: arm_parts(bm, s), faces=1600,
               hide=lambda c, A0=A0, F0=F0: (c - A0).dot((F0 - A0).normalized()) < 0.3 * (F0 - A0).length)
    fa, hd = H[s + "ForeArm"], H[s + "Hand"]
    ax = (hd - fa).normalized()
    split(a, [(hd - ax * 0.012, ax)])
    set_mats(a, ["Skin", "Gloves"], lambda c, hd=hd, ax=ax: 1 if (c - hd).dot(ax) > -0.012 else 0)
    skin(a, arm_bones(s)); parts.append(a)
    l = finish("Body_Leg" + s, lambda bm, s=s: leg_parts(bm, s), faces=1800, hide=lambda c: c.z > 0.64)
    split(l, [(V((0, 0, 0.31)), V((0, 0, 1)))])
    set_mats(l, ["Skin", "Socks"], lambda c: 1 if c.z < 0.31 else 0)
    skin(l, leg_bones(s)); parts.append(l)

def jersey_build(bm):
    jersey_parts(bm, 0.022)
    for s in ("Left", "Right"):
        arm_parts(bm, s, g=0.018, sleeve=True)
cuts = [(V((0, 0, 0.885)), V((0, 0, -1))), (V((0, 0, 1.40)), V((0, 0, 1)))]
for s in ("Left", "Right"):
    A, F = H[s + "Arm"], H[s + "ForeArm"]
    cuts.append((lerpv(A, F, 0.45), F - A, 0.16))
jersey = finish("Jersey", jersey_build, faces=3000, cuts=cuts, thickness=0.006, smooth=25)
set_mats(jersey, ["Jersey"]); skin(jersey, torso_bones); parts.append(jersey)

def shorts_build(bm):
    ellipsoid(bm, H["Hips"] + V((0, 0.01, 0.03)), (0.165, 0.115, 0.12), grow=0.016)
    ellipsoid(bm, V((0, 0.012, 0.96)), (0.148, 0.106, 0.11), grow=0.008)
    ellipsoid(bm, V((0, 0.06, 0.81)), (0.165, 0.095, 0.105), grow=0.03)
    for s in ("Left", "Right"):
        leg_parts(bm, s, g=0.03, shorts=True)
cuts = [(V((0, 0, 0.995)), V((0, 0, 1)))]
for s in ("Left", "Right"):
    U, L = H[s + "UpLeg"], H[s + "Leg"]
    cuts.append((lerpv(U, L, 0.55), L - U, 0.16))
shorts = finish("Shorts", shorts_build, faces=2000, cuts=cuts, thickness=0.005, smooth=18)
set_mats(shorts, ["Shorts"])
skin(shorts, lambda p: ["Hips", "Spine02", side(p) + "UpLeg"]); parts.append(shorts)

# Belt: tube around the shorts at z=0.935, fitted to their cross-section.
zb = 0.872
ring = [v.co for v in shorts.data.vertices if abs(v.co.z - zb) < 0.01]
rx = max(abs(p.x) for p in ring) + 0.004
ymin = min(p.y for p in ring) - 0.004; ymax = max(p.y for p in ring) + 0.004
cy, ry = (ymin + ymax) / 2, (ymax - ymin) / 2
bm = bmesh.new(); N, M, tr = 64, 8, 0.011
grid = []
for i in range(N):
    a = 2 * math.pi * i / N
    c = V((rx * math.cos(a), cy + ry * math.sin(a), zb))
    out = V((math.cos(a) / rx, math.sin(a) / ry, 0)).normalized()
    grid.append([bm.verts.new(c + out * tr * math.cos(2 * math.pi * j / M) * 0.6 + V((0, 0, tr * math.sin(2 * math.pi * j / M) * 1.6))) for j in range(M)])
for i in range(N):
    for j in range(M):
        bm.faces.new((grid[i][j], grid[(i + 1) % N][j], grid[(i + 1) % N][(j + 1) % M], grid[i][(j + 1) % M]))
belt = mesh_obj("Belt", bm)
for p in belt.data.polygons:
    p.use_smooth = True
set_mats(belt, ["Belt"]); skin(belt, ["Hips", "Spine02"]); parts.append(belt)
BELT_INFO = {"rx": rx, "cy": cy, "ry": ry, "z": zb}

cleats = finish("Cleats", lambda bm: [leg_parts(bm, s, g=0.012, cleat=True) for s in ("Left", "Right")],
                faces=1400, cuts=[(V((0, 0, 0.118)), V((0, 0, 1)))])
set_mats(cleats, ["Cleats"])
skin(cleats, lambda p: [side(p) + "Leg", side(p) + "Foot", side(p) + "ToeBase"]); parts.append(cleats)

hair = finish("Hair", lambda bm: head_parts(bm, g=0.008, hair=True), voxel=0.004, faces=700,
              cuts=[(V((0, -0.06, 1.592)), V((0, -0.5, -1)))], thickness=0.004)
set_mats(hair, ["Hair"]); skin(hair, ["Head"]); parts.append(hair)

bm = bmesh.new()
for sx in (1, -1):
    ellipsoid(bm, V((0.031 * sx, -0.078, 1.553)), (0.0105, 0.0065, 0.0062))
    ellipsoid(bm, V((0.031 * sx, -0.0838, 1.553)), (0.0048, 0.0018, 0.0048))
eyes = mesh_obj("Eyes", bm)
for p in eyes.data.polygons:
    p.use_smooth = True
set_mats(eyes, ["EyeWhite", "Eyes"], lambda c: 1 if c.y < -0.0835 else 0)
skin(eyes, ["Head"]); parts.append(eyes)

for p in parts:
    box_uv(p)

# Join body pieces into one object (one draw call per material in-engine).
bpy.ops.object.select_all(action="DESELECT")
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = torso
bpy.ops.object.join()
body = torso; body.name = "FlagPlayer"
tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
print("STATS", {"tris": tris, "verts": len(body.data.vertices), "mats": [m.name for m in body.data.materials], "belt": BELT_INFO})

# ---------------------------------------------------------------- clips + export
ad = arm.animation_data
for name, act in acts.items():
    tr = ad.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, int(act.frame_range[0]), act)
    if hasattr(st, "action_slot") and act.slots:
        st.action_slot = act.slots[0]
    tr.mute = True

os.makedirs(os.path.join(ROOT, "art"), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "art", "player_flag.blend"))
bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, "player_flag.glb"), export_format="GLB",
                          export_animations=True, export_animation_mode="ACTIONS", export_yup=True)

# ---------------------------------------------------------------- previews
if PREVIEW_DIR:
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"; sh.color_type = "MATERIAL"; sh.show_cavity = True; sh.show_shadows = True
    scene.render.resolution_x, scene.render.resolution_y = 700, 900
    scene.world = bpy.data.worlds.new("w"); scene.world.color = (0.55, 0.57, 0.6)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam)
    cam.data.lens = 70; scene.camera = cam
    def shot(path, loc, target=V((0, 0, 0.9)), frame=None, action=None):
        ad.action = action
        if action is not None and hasattr(ad, "action_slot") and action.slots:
            ad.action_slot = action.slots[0]
        if frame is not None:
            scene.frame_set(frame)
        cam.location = loc
        cam.rotation_euler = (target - V(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
    shot(os.path.join(PREVIEW_DIR, "front.png"), (0.0, -4.2, 1.1))
    shot(os.path.join(PREVIEW_DIR, "threequarter.png"), (2.6, -3.2, 1.4))
    shot(os.path.join(PREVIEW_DIR, "back.png"), (-1.8, 3.6, 1.3))
    shot(os.path.join(PREVIEW_DIR, "face.png"), (0.35, -1.1, 1.55), target=V((0, 0, 1.5)))
    shot(os.path.join(PREVIEW_DIR, "run.png"), (2.6, -3.2, 1.4), frame=8, action=acts["Run_Regular"])
