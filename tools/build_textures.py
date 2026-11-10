"""Seamless PBR textures for Street Football, generated procedurally.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/build_textures.py

Writes public/textures/<name>_{albedo,normal,rough}.jpg. Every map tiles
seamlessly (all noise is built in the frequency domain / with wrap-around).
"""
import bpy, os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "textures")
os.makedirs(OUT, exist_ok=True)

def fbm(n, beta, rng):
    """Periodic fractal noise in [0,1]; larger beta = smoother."""
    f = np.fft.fftfreq(n)
    k = np.sqrt(f[:, None] ** 2 + f[None, :] ** 2)
    k[0, 0] = 1.0
    spec = np.fft.fft2(rng.standard_normal((n, n))) * k ** (-beta / 2)
    spec[0, 0] = 0
    out = np.real(np.fft.ifft2(spec))
    return (out - out.min()) / (out.max() - out.min())

def blur(a, sigma):
    n = a.shape[0]
    f = np.fft.fftfreq(n)
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))

def speckles(n, count, sigma, rng):
    a = np.zeros((n, n))
    ys, xs = rng.integers(0, n, count), rng.integers(0, n, count)
    np.add.at(a, (ys, xs), rng.uniform(0.5, 1.0, count))
    a = blur(a, sigma)
    return a / a.max()

def cracks(n, count, rng):
    a = np.zeros((n, n))
    for _ in range(count):
        y, x = rng.uniform(0, n, 2)
        ang = rng.uniform(0, 2 * np.pi)
        for _ in range(int(rng.uniform(80, 260))):
            ang += rng.normal(0, 0.35)
            y = (y + np.sin(ang) * 1.5) % n
            x = (x + np.cos(ang) * 1.5) % n
            a[int(y), int(x)] = 1.0
    return np.clip(blur(a, 0.8) * 4, 0, 1)

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    nrm = np.stack([-dx, dy, np.ones_like(h)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    return nrm * 0.5 + 0.5

def save(name, rgb):
    """rgb: (n,n,3) or (n,n) array in [0,1], row 0 = top of image."""
    if rgb.ndim == 2:
        rgb = np.repeat(rgb[..., None], 3, -1)
    n = rgb.shape[0]
    img = bpy.data.images.new(name, n, n, alpha=False)
    px = np.ones((n, n, 4), np.float32)
    px[..., :3] = np.clip(rgb[::-1], 0, 1)  # Blender pixels start bottom-left
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = os.path.join(OUT, name + ".jpg")
    img.file_format = "JPEG"
    scene = bpy.context.scene
    scene.render.image_settings.quality = 80
    img.save_render(img.filepath_raw, scene=scene)
    print("wrote", name)

def srgb_tint(a, lo, hi):
    lo, hi = np.array(lo), np.array(hi)
    return lo + (hi - lo) * a[..., None]

# Data maps (normal/roughness) must not get display color management.
bpy.context.scene.view_settings.view_transform = "Standard"

# --- asphalt (court) ---
rng = np.random.default_rng(3)
N = 1024
base = fbm(N, 2.2, rng)
grain = fbm(N, 0.6, rng)
stones = speckles(N, 9000, 1.6, rng)
fine = speckles(N, 30000, 0.7, rng)
crk = cracks(N, 10, rng)
patch = fbm(N, 3.2, rng)  # big worn / patched areas
h = 0.5 * stones + 0.25 * fine + 0.15 * grain - 0.6 * crk
alb = srgb_tint(0.35 * base + 0.25 * patch + 0.25 * stones + 0.15 * grain, (0.13, 0.13, 0.135), (0.36, 0.355, 0.35))
alb *= (1 - 0.55 * crk)[..., None]
save("asphalt_albedo", alb)
save("asphalt_normal", normal_from_height(h, 6.0))
save("asphalt_rough", np.clip(0.93 - 0.25 * stones - 0.12 * patch + 0.05 * crk, 0.55, 1.0))

# --- concrete (sidewalk / apron) ---
rng = np.random.default_rng(7)
N = 512
base = fbm(N, 2.6, rng)
pores = speckles(N, 3500, 0.5, rng)
crk = cracks(N, 5, rng)
seam = np.zeros((N, N)); seam[:, :3] = 1; seam[:3, :] = 1  # slab joint at tile edge
seam = np.clip(blur(seam, 1.2) * 2, 0, 1)
h = 0.4 * base - 0.35 * pores - 0.8 * seam - 0.5 * crk
alb = srgb_tint(0.6 * base + 0.4 * fbm(N, 1.2, rng), (0.42, 0.41, 0.39), (0.62, 0.61, 0.58))
alb *= (1 - 0.35 * pores - 0.45 * seam - 0.4 * crk)[..., None]
save("concrete_albedo", alb)
save("concrete_normal", normal_from_height(h, 4.0))
save("concrete_rough", np.clip(0.85 + 0.1 * pores - 0.15 * base, 0.6, 1.0))

# --- brick (buildings), running bond, 4 courses x 2 bricks per tile ---
rng = np.random.default_rng(11)
rows, cols, mortar = 8, 4, 0.06
yy, xx = np.mgrid[0:N, 0:N] / N
course = np.floor(yy * rows).astype(int)
xs = (xx * cols + 0.5 * (course % 2)) % cols
col = np.floor(xs).astype(int)
fy, fx = (yy * rows) % 1, xs % 1
edge = np.minimum(np.minimum(fy, 1 - fy) / mortar * 1.0, np.minimum(fx, 1 - fx) / (mortar * 0.5))
brick_mask = np.clip(edge * 1.5 - 0.5, 0, 1)
ids = course * cols + col
tone = rng.uniform(0, 1, rows * cols * 2)[ids % (rows * cols * 2)]
noise = fbm(N, 1.4, rng)
grime = fbm(N, 2.8, rng)
brick_col = srgb_tint(0.6 * tone + 0.4 * noise, (0.32, 0.12, 0.08), (0.58, 0.27, 0.17))
mortar_col = srgb_tint(noise, (0.45, 0.43, 0.4), (0.62, 0.6, 0.56))
alb = mortar_col * (1 - brick_mask[..., None]) + brick_col * brick_mask[..., None]
alb *= (0.78 + 0.22 * grime)[..., None]
h = brick_mask * (0.8 + 0.2 * noise) + 0.15 * fbm(N, 0.8, rng)
save("brick_albedo", alb)
save("brick_normal", normal_from_height(h, 8.0))
save("brick_rough", np.clip(0.95 - 0.1 * brick_mask * tone, 0.7, 1.0))

# --- athletic mesh jersey fabric (normal only), 256 tile ---
n = 256
yy, xx = np.mgrid[0:n, 0:n] / n * 16
row = np.floor(yy).astype(int)
cx = (xx + 0.5 * (row % 2)) % 1 - 0.5
cy = yy % 1 - 0.5
holes = np.clip(1 - np.sqrt(cx ** 2 + cy ** 2) / 0.28, 0, 1)
h = blur(1 - np.clip(holes * 2, 0, 1), 0.7)
save("fabric_normal", normal_from_height(h, 3.0))

# --- leather pebble (ball) and knit (shorts/socks), 256 tiles ---
rng = np.random.default_rng(19)
h = speckles(n, 2600, 1.1, rng)
save("leather_normal", normal_from_height(h, 5.0))
yy, xx = np.mgrid[0:n, 0:n] / n
knit = np.abs(np.sin(xx * np.pi * 32 + np.sin(yy * np.pi * 64) * 0.6))
save("knit_normal", normal_from_height(blur(knit, 0.6), 1.6))
