import * as THREE from 'three';
import { toonifyTree, RAMPS } from './toon.js';

// 7-on-7 street field. Play runs along X: goal lines at ±halfLength, end
// zones beyond them, sidelines at ±halfWidth. 1 unit = 1 yard, so the field
// is a real 7-on-7 sheet: 40 yards goal-to-goal, 10-yard end zones, 30 wide,
// first down at midfield (x = 0).
export const FIELD = {
  halfLength: 20,
  endZoneDepth: 10,
  halfWidth: 15,
  fenceMargin: 5, // apron between sideline and fence
  fenceHeight: 3.2,
};

export const GROUND_HALF_X =
  FIELD.halfLength + FIELD.endZoneDepth + FIELD.fenceMargin + 1;
export const GROUND_HALF_Z = FIELD.halfWidth + FIELD.fenceMargin + 1;

// ---- Surfaces ------------------------------------------------------------
// Each surface owns its ground paint, its sky/sun mood and the junk that
// sits around the lot, so switching fields swaps the whole venue.
export const SURFACES = {
  grass: {
    key: 'grass',
    name: 'THE PARK',
    blurb: 'Cut grass, chalk lines, full bleachers.',
    swatch: '#4f8f3a',
    base: '#55923a',
    paintAlpha: 0.85,
    roughness: 0.82,
    sky: 0xbfe4ff,
    fog: [0xcfe8ff, 90, 190],
    sun: { color: 0xfffaf0, intensity: 2.15, pos: [38, 26, -20] },
    hemi: [0xeaf6ff, 0x6d7f55, 0.95],
    rim: { color: 0xbfe0ff, intensity: 0.3 },
    crowdRows: 7,
    crowdFill: 0.9,
    surround: 'trees',
    grip: 1.0, // full traction
  },
  concrete: {
    key: 'concrete',
    name: 'THE BLOCK',
    blurb: 'Cracked concrete, graffiti, chain-link.',
    swatch: '#8f8d88',
    base: '#9a9892',
    paintAlpha: 0.55,
    roughness: 0.95,
    sky: 0xffc98d,
    fog: [0xffc98d, 85, 180],
    sun: { color: 0xffe0bc, intensity: 2.1, pos: [35, 14, -22] },
    hemi: [0xffeed6, 0x8a8278, 0.92],
    rim: { color: 0x9fd8ff, intensity: 0.32 },
    crowdRows: 5,
    crowdFill: 0.75,
    surround: 'city',
    grip: 1.06, // hard court, quick cuts
  },
  dirt: {
    key: 'dirt',
    name: 'THE DUST BOWL',
    blurb: 'Light brown dirt, dead patches, rundown.',
    swatch: '#b09468',
    base: '#bb9e70',
    paintAlpha: 0.22,
    roughness: 1.0,
    sky: 0xe8cfa4,
    fog: [0xe0c69a, 78, 170],
    sun: { color: 0xfff0dc, intensity: 2.0, pos: [30, 18, -26] },
    hemi: [0xfaeed6, 0x9a8a70, 0.95],
    rim: { color: 0xffe2b0, intensity: 0.25 },
    crowdRows: 4,
    crowdFill: 0.4,
    surround: 'weeds',
    grip: 0.93, // loose footing, slides a little
  },
};
export const SURFACE_KEYS = Object.keys(SURFACES);

// ---- Ground texture -----------------------------------------------------

function paintLines(g, surf, px, pz, sx, sz) {
  const { halfLength, endZoneDepth, halfWidth } = FIELD;
  const backX = halfLength + endZoneDepth;
  const a = surf.paintAlpha;
  const white = (alpha) => `rgba(248,248,243,${alpha * a})`;

  // End zone washes — blue defends -X, red defends +X.
  g.fillStyle = `rgba(40,92,200,${0.26 * a + 0.05})`;
  g.fillRect(px(-backX), pz(-halfWidth), endZoneDepth * sx, halfWidth * 2 * sz);
  g.fillStyle = `rgba(206,56,48,${0.26 * a + 0.05})`;
  g.fillRect(px(halfLength), pz(-halfWidth), endZoneDepth * sx, halfWidth * 2 * sz);

  // Boundary.
  g.strokeStyle = white(1);
  g.lineWidth = 0.3 * sx;
  g.strokeRect(px(-backX), pz(-halfWidth), backX * 2 * sx, halfWidth * 2 * sz);

  const stripe = (x, width, alpha) => {
    g.strokeStyle = white(alpha);
    g.lineWidth = width * sx;
    g.beginPath();
    g.moveTo(px(x), pz(-halfWidth));
    g.lineTo(px(x), pz(halfWidth));
    g.stroke();
  };
  // Goal lines, then every 5 yards, with midfield (the first-down line in
  // 7-on-7) painted heaviest.
  stripe(-halfLength, 0.42, 1);
  stripe(halfLength, 0.42, 1);
  for (let x = -15; x <= 15; x += 5) stripe(x, x === 0 ? 0.34 : 0.2, x === 0 ? 0.9 : 0.6);

  // Hash marks every yard along both hash rows.
  g.strokeStyle = white(0.45);
  g.lineWidth = 0.1 * sx;
  for (let x = -halfLength + 1; x < halfLength; x += 1) {
    for (const z of [-halfWidth * 0.4, halfWidth * 0.4]) {
      g.beginPath();
      g.moveTo(px(x), pz(z - 0.4));
      g.lineTo(px(x), pz(z + 0.4));
      g.stroke();
    }
  }

  // Midfield emblem.
  g.strokeStyle = white(0.7);
  g.lineWidth = 0.22 * sx;
  g.beginPath();
  g.ellipse(px(0), pz(0), 4 * sx, 4 * sz, 0, 0, Math.PI * 2);
  g.stroke();
}

function makeGroundTexture(surf) {
  const W = 2048;
  const H = 1280;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const sx = W / (GROUND_HALF_X * 2);
  const sz = H / (GROUND_HALF_Z * 2);
  const px = (x) => (x + GROUND_HALF_X) * sx;
  const pz = (z) => (z + GROUND_HALF_Z) * sz;

  g.fillStyle = surf.base;
  g.fillRect(0, 0, W, H);

  if (surf.key === 'grass') {
    // Mower stripes across the short axis, then blade speckle and divots.
    for (let i = 0; i < 18; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)';
      g.fillRect(0, (H / 18) * i, W, H / 18);
    }
    for (let i = 0; i < 60000; i++) {
      const v = Math.random();
      g.fillStyle =
        v < 0.5
          ? `rgba(${90 + Math.random() * 40},${125 + Math.random() * 55},${55 + Math.random() * 30},0.22)`
          : `rgba(${60 + Math.random() * 30},${95 + Math.random() * 40},${40 + Math.random() * 25},0.22)`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 3);
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(104,84,52,${0.10 + Math.random() * 0.14})`;
      g.beginPath();
      g.ellipse(
        Math.random() * W, Math.random() * H,
        6 + Math.random() * 22, 4 + Math.random() * 14,
        Math.random() * Math.PI, 0, Math.PI * 2
      );
      g.fill();
    }
  } else if (surf.key === 'concrete') {
    for (let i = 0; i < 40000; i++) {
      const v = 110 + Math.random() * 95;
      g.fillStyle = `rgba(${v},${v},${v * 0.97},${0.06 + Math.random() * 0.1})`;
      g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }
    // Slab joints.
    g.strokeStyle = 'rgba(55,55,55,0.16)';
    g.lineWidth = 2;
    for (let x = -GROUND_HALF_X; x < GROUND_HALF_X; x += 9) {
      g.beginPath(); g.moveTo(px(x), 0); g.lineTo(px(x), H); g.stroke();
    }
    for (let z = -GROUND_HALF_Z; z < GROUND_HALF_Z; z += 9) {
      g.beginPath(); g.moveTo(0, pz(z)); g.lineTo(W, pz(z)); g.stroke();
    }
    // Oil blotches and hairline cracks.
    for (let i = 0; i < 80; i++) {
      const v = 95 + Math.random() * 60;
      g.fillStyle = `rgba(${v},${v},${v},0.06)`;
      g.beginPath();
      g.ellipse(
        Math.random() * W, Math.random() * H,
        30 + Math.random() * 130, 20 + Math.random() * 90,
        Math.random() * Math.PI, 0, Math.PI * 2
      );
      g.fill();
    }
    g.strokeStyle = 'rgba(42,42,42,0.15)';
    for (let i = 0; i < 40; i++) {
      g.lineWidth = 1 + Math.random() * 1.8;
      g.beginPath();
      let cx = Math.random() * W;
      let cy = Math.random() * H;
      g.moveTo(cx, cy);
      for (let s = 0; s < 6; s++) {
        cx += (Math.random() - 0.5) * 170;
        cy += (Math.random() - 0.5) * 170;
        g.lineTo(cx, cy);
      }
      g.stroke();
    }
  } else {
    // Dust bowl: bare dirt base, clumps of dead grass, worn-out bald
    // patches where the traffic is, pebbles and dried mud cracks.
    for (let i = 0; i < 55000; i++) {
      const v = 150 + Math.random() * 70;
      g.fillStyle = `rgba(${v},${v * 0.86},${v * 0.62},${0.05 + Math.random() * 0.1})`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    // Surviving dead-grass clumps, thicker toward the edges.
    for (let i = 0; i < 2200; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const edge = Math.abs(y - H / 2) / (H / 2);
      if (Math.random() > 0.25 + edge * 0.8) continue;
      g.fillStyle = `rgba(${130 + Math.random() * 50},${115 + Math.random() * 45},${55 + Math.random() * 30},${0.2 + Math.random() * 0.3})`;
      g.beginPath();
      g.ellipse(x, y, 5 + Math.random() * 16, 4 + Math.random() * 10, Math.random() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    // Bald, lighter, worn patches (the "missing patches").
    for (let i = 0; i < 150; i++) {
      const v = 185 + Math.random() * 45;
      g.fillStyle = `rgba(${v},${v * 0.88},${v * 0.66},${0.18 + Math.random() * 0.22})`;
      g.beginPath();
      g.ellipse(
        Math.random() * W, Math.random() * H,
        18 + Math.random() * 90, 12 + Math.random() * 55,
        Math.random() * Math.PI, 0, Math.PI * 2
      );
      g.fill();
    }
    // Dried mud cracks + pebbles.
    g.strokeStyle = 'rgba(92,70,45,0.18)';
    for (let i = 0; i < 70; i++) {
      g.lineWidth = 1 + Math.random() * 1.4;
      g.beginPath();
      let cx = Math.random() * W;
      let cy = Math.random() * H;
      g.moveTo(cx, cy);
      for (let s = 0; s < 4; s++) {
        cx += (Math.random() - 0.5) * 120;
        cy += (Math.random() - 0.5) * 120;
        g.lineTo(cx, cy);
      }
      g.stroke();
    }
    for (let i = 0; i < 1800; i++) {
      const v = 120 + Math.random() * 90;
      g.fillStyle = `rgba(${v},${v * 0.9},${v * 0.78},0.3)`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
  }

  paintLines(g, surf, px, pz, sx, sz);

  // Wear pass: surface grain back over the paint so lines look worn in.
  const wearCount = surf.key === 'dirt' ? 26000 : 10000;
  for (let i = 0; i < wearCount; i++) {
    const v = 120 + Math.random() * 80;
    const tint = surf.key === 'grass'
      ? `rgba(${v * 0.6},${v * 0.8},${v * 0.45},0.1)`
      : surf.key === 'dirt'
        ? `rgba(${v},${v * 0.86},${v * 0.62},0.12)`
        : `rgba(${v},${v},${v},0.1)`;
    g.fillStyle = tint;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeFenceTexture() {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  g.strokeStyle = 'rgba(205,210,214,0.95)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, S / 2);
  g.lineTo(S / 2, 0);
  g.lineTo(S, S / 2);
  g.lineTo(S / 2, S);
  g.closePath();
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Fence runs the two end lines and the far sideline; the near sideline is
// left open so the camera never shoots through chain-link.
function addFence(root, surf) {
  const { fenceHeight } = FIELD;
  const fx = GROUND_HALF_X - 0.5;
  const fz = GROUND_HALF_Z - 0.5;
  const tex = makeFenceTexture();
  const rusty = surf.key === 'dirt';
  const postMat = new THREE.MeshStandardMaterial({
    color: rusty ? 0x6b5443 : 0x4c5257,
    roughness: rusty ? 0.9 : 0.6,
    metalness: rusty ? 0.25 : 0.5,
  });

  const sides = [
    { len: fx * 2, pos: [0, -fz], rotY: 0 },
    { len: fz * 2, pos: [fx, 0], rotY: Math.PI / 2 },
    { len: fz * 2, pos: [-fx, 0], rotY: Math.PI / 2 },
  ];
  for (const { len, pos, rotY } of sides) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(len * 1.5, fenceHeight * 1.5);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(len, fenceHeight),
      new THREE.MeshStandardMaterial({
        map: t,
        transparent: true,
        alphaTest: 0.3,
        side: THREE.DoubleSide,
        roughness: 0.5,
        metalness: rusty ? 0.2 : 0.4,
        color: rusty ? 0xc9b49a : 0xffffff,
      })
    );
    mesh.position.set(pos[0], fenceHeight / 2, pos[1]);
    mesh.rotation.y = rotY;
    root.add(mesh);

    const across = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY));
    const count = Math.max(2, Math.round(len / 7));
    const postGeo = new THREE.CylinderGeometry(0.07, 0.07, fenceHeight, 8);
    for (let i = 0; i <= count; i++) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position
        .set(pos[0], fenceHeight / 2, pos[1])
        .addScaledVector(across, -len / 2 + (len / count) * i);
      // Dust bowl fence sags and leans.
      if (rusty) post.rotation.z = (Math.random() - 0.5) * 0.12;
      post.castShadow = true;
      root.add(post);
    }
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 8), postMat);
    rail.rotation.z = Math.PI / 2;
    rail.rotation.y = rotY;
    rail.position.set(pos[0], fenceHeight - 0.08, pos[1]);
    root.add(rail);
  }
  // Only the per-side clones are attached to materials, so the source
  // texture would never be reached by the dispose walk.
  tex.dispose();
}

// ---- Bleachers + crowd ---------------------------------------------------

const SKIN = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0xffdbac, 0x5c3a21, 0x7a4b2a];
const SHIRTS = [
  0x2f6fdb, 0xd93b3b, 0xf2c230, 0x37b16b, 0xffffff, 0x1d1d22, 0xe06bb0,
  0x7a4fd0, 0xff7a29, 0x25c4c4, 0x9aa3ad, 0xb9f227,
];

// Two stands: the big one behind the near sideline (reads in frame) and a
// smaller one behind the far sideline. Spectators are instanced bodies +
// heads so a few hundred fans cost two draw calls.
function addCrowd(root, surf, quality) {
  const rows = surf.crowdRows;
  const rowRise = 0.52;
  const rowDepth = 0.95;
  const standLen = GROUND_HALF_X * 1.55;
  const seatMat = new THREE.MeshStandardMaterial({
    color: surf.key === 'dirt' ? 0x9a8c74 : 0xb8bcc2,
    roughness: 0.75,
    metalness: 0.3,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: surf.key === 'dirt' ? 0x6e5a46 : 0x565e66,
    roughness: 0.8,
    metalness: 0.4,
  });

  const slots = [];
  const stands = [
    { z: GROUND_HALF_Z + 1.2, dir: 1, len: standLen, scaleRows: 1 },
    { z: -(GROUND_HALF_Z + 1.2), dir: -1, len: standLen * 0.8, scaleRows: 0.7 },
  ];

  for (const stand of stands) {
    const nRows = Math.max(2, Math.round(rows * stand.scaleRows));
    for (let r = 0; r < nRows; r++) {
      const y = r * rowRise;
      const z = stand.z + stand.dir * r * rowDepth;
      // Bench plank + riser.
      const plank = new THREE.Mesh(new THREE.BoxGeometry(stand.len, 0.12, 0.8), seatMat);
      plank.position.set(0, y + 0.42, z);
      plank.receiveShadow = true;
      root.add(plank);
      const riser = new THREE.Mesh(new THREE.BoxGeometry(stand.len, rowRise + 0.42, 0.1), frameMat);
      riser.position.set(0, (y + 0.42) / 2, z - stand.dir * 0.42);
      root.add(riser);

      // Seat slots along the plank.
      const seats = Math.floor(stand.len / 0.78);
      for (let s = 0; s < seats; s++) {
        if (Math.random() > surf.crowdFill * quality.crowdFill) continue;
        const x = -stand.len / 2 + 0.4 + s * 0.78;
        slots.push({ x, y: y + 0.54, z, face: -stand.dir });
      }
    }
    // Side frames and a back rail.
    for (const sx of [-stand.len / 2, stand.len / 2]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, nRows * rowRise + 0.9, nRows * rowDepth + 0.9),
        frameMat
      );
      leg.position.set(sx, (nRows * rowRise) / 2, stand.z + stand.dir * (nRows * rowDepth) / 2);
      root.add(leg);
    }
  }

  // Instanced spectators: torso box + head sphere, colored per instance.
  const count = slots.length;
  const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.42, 4, 8);
  const headGeo = new THREE.SphereGeometry(0.15, 10, 8);
  const bodies = new THREE.InstancedMesh(
    bodyGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    count
  );
  const heads = new THREE.InstancedMesh(
    headGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.75 }),
    count
  );
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const color = new THREE.Color();
  const fans = slots.map((slot, i) => {
    color.setHex(SHIRTS[(Math.random() * SHIRTS.length) | 0]);
    bodies.setColorAt(i, color);
    color.setHex(SKIN[(Math.random() * SKIN.length) | 0]);
    heads.setColorAt(i, color);
    return {
      ...slot,
      phase: Math.random() * Math.PI * 2,
      rate: 0.6 + Math.random() * 0.8,
      lazy: Math.random(), // how much idle bob this fan does
      jump: 0,
    };
  });
  root.add(bodies, heads);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  let excitement = 0;
  let t = 0;
  let frame = 0;

  function update(dt) {
    t += dt;
    excitement = Math.max(0, excitement - dt * 0.55);
    // Re-posing several hundred fans every frame is pure waste on a phone:
    // stride the rebuild and they still read as a moving crowd.
    frame++;
    if (quality.crowdStride > 1 && frame % quality.crowdStride !== 0 && excitement < 0.2) return;
    const hype = excitement;
    for (let i = 0; i < fans.length; i++) {
      const f = fans[i];
      // Idle sway always; on a big play they come up off the bench.
      const idle = Math.sin(t * f.rate + f.phase) * 0.035 * (0.3 + f.lazy);
      const cheer = hype * (0.35 + 0.45 * Math.abs(Math.sin(t * (6 + f.rate * 3) + f.phase)));
      const lift = idle + cheer;
      const lean = Math.sin(t * f.rate * 0.7 + f.phase) * 0.06 + hype * 0.18;
      q.setFromAxisAngle(_X, lean * -f.face);
      pos.set(f.x, f.y + lift, f.z);
      m.compose(pos, q, scl);
      bodies.setMatrixAt(i, m);
      pos.y = f.y + 0.52 + lift * 1.25;
      m.compose(pos, q, scl);
      heads.setMatrixAt(i, m);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }

  return {
    count,
    update,
    // 0..1 — big plays spike it, it decays back to idle.
    cheer(amount = 1) {
      excitement = Math.min(1.4, excitement + amount);
    },
    get excitement() {
      return excitement;
    },
  };
}
const _X = new THREE.Vector3(1, 0, 0);

// ---- Surroundings --------------------------------------------------------

function addSurround(root, surf) {
  const rand = (a, b) => a + Math.random() * (b - a);

  if (surf.surround === 'trees') {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 0.9 });
    const leafMats = [0x2f6b2a, 0x3c7f33, 0x275a26].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true })
    );
    for (let i = 0; i < 26; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = rand(-GROUND_HALF_X - 14, GROUND_HALF_X + 14);
      const z = side * rand(GROUND_HALF_Z + 7, GROUND_HALF_Z + 22);
      const h = rand(5, 9);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, h, 7), trunkMat);
      trunk.position.set(x, h / 2, z);
      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(rand(1.8, 3.1), 0),
        leafMats[(Math.random() * leafMats.length) | 0]
      );
      crown.position.set(x, h + 0.8, z);
      crown.scale.y = rand(0.8, 1.2);
      root.add(trunk, crown);
    }
  } else if (surf.surround === 'city') {
    const mats = [0x6a5a52, 0x7d6a5c, 0x58504e, 0x8a6f5d].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 })
    );
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x2a3340, emissive: 0xffd089, emissiveIntensity: 0.25, roughness: 0.4,
    });
    for (let i = 0; i < 22; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const w = rand(7, 14);
      const h = rand(9, 26);
      const d = rand(7, 13);
      const x = rand(-GROUND_HALF_X - 18, GROUND_HALF_X + 18);
      const z = side * rand(GROUND_HALF_Z + 10, GROUND_HALF_Z + 34);
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        mats[(Math.random() * mats.length) | 0]
      );
      b.position.set(x, h / 2, z);
      root.add(b);
      // A lit window band facing the court.
      const band = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.5), winMat);
      band.position.set(x, h * 0.55, z - side * (d / 2 + 0.05));
      if (side < 0) band.rotation.y = Math.PI;
      root.add(band);
    }
  } else {
    // Dust bowl: dry scrub, a dead tree, a busted light pole.
    const scrubMats = [0x8a7a4a, 0x9c8d57, 0x766a42].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true })
    );
    for (let i = 0; i < 48; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const s = rand(0.5, 1.4);
      const bush = new THREE.Mesh(
        new THREE.IcosahedronGeometry(s, 0),
        scrubMats[(Math.random() * scrubMats.length) | 0]
      );
      bush.position.set(
        rand(-GROUND_HALF_X - 16, GROUND_HALF_X + 16),
        s * 0.45,
        side * rand(GROUND_HALF_Z + 5, GROUND_HALF_Z + 26)
      );
      bush.scale.y = 0.5;
      root.add(bush);
    }
    const deadMat = new THREE.MeshStandardMaterial({ color: 0x6d5a44, roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const h = rand(5, 7.5);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, h, 6), deadMat);
      const x = rand(-GROUND_HALF_X - 10, GROUND_HALF_X + 10);
      const z = (Math.random() < 0.5 ? -1 : 1) * rand(GROUND_HALF_Z + 8, GROUND_HALF_Z + 20);
      t.position.set(x, h / 2, z);
      t.rotation.z = rand(-0.1, 0.1);
      root.add(t);
      for (let b = 0; b < 3; b++) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, rand(1.5, 2.6), 5), deadMat);
        br.position.set(x, h * rand(0.6, 0.95), z);
        br.rotation.z = rand(-1.1, 1.1);
        br.rotation.x = rand(-0.6, 0.6);
        root.add(br);
      }
    }
  }

  // Every lot gets flood poles at the corners.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3f464c, roughness: 0.7, metalness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff2cf, emissive: 0xfff0c0, emissiveIntensity: 0.6, roughness: 0.3,
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const h = 11;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, h, 8), poleMat);
      pole.position.set(sx * (GROUND_HALF_X + 2), h / 2, sz * (GROUND_HALF_Z + 4));
      root.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.9), lampMat);
      head.position.set(sx * (GROUND_HALF_X + 2), h, sz * (GROUND_HALF_Z + 4) - sz * 0.5);
      root.add(head);
    }
  }
}

// ---- Drive lines ---------------------------------------------------------

// Broadcast overlay: blue = line of scrimmage, yellow = line to gain.
export function createDriveLines(scene) {
  const makeLine = (color, opacity) => {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, FIELD.halfWidth * 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.02;
    scene.add(line);
    return line;
  };
  return {
    losLine: makeLine(0x38b6ff, 0.5),
    markerLine: makeLine(0xffb300, 0.68),
  };
}

// ---- World --------------------------------------------------------------

function disposeTree(obj) {
  obj.traverse((c) => {
    if (c.isMesh || c.isInstancedMesh) {
      c.geometry?.dispose();
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      for (const m of mats) {
        if (!m) continue;
        m.map?.dispose();
        m.dispose();
      }
    }
  });
}

// Builds ground + fence + bleachers + crowd + skyline + lighting for one
// surface, all under a single group so switching fields is a swap.
export function buildWorld(scene, surfaceKey, quality = { crowdFill: 1, crowdStride: 1, shadow: 2048 }) {
  const surf = SURFACES[surfaceKey] ?? SURFACES.concrete;
  const root = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_HALF_X * 2, GROUND_HALF_Z * 2),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(surf), roughness: surf.roughness })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // Dirt apron so the lot doesn't end in a hard edge against the fog.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_HALF_X * 6, GROUND_HALF_Z * 7),
    new THREE.MeshStandardMaterial({
      color: surf.key === 'grass' ? 0x3f6b2c : surf.key === 'dirt' ? 0x9c8460 : 0x6f6a63,
      roughness: 1,
    })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  root.add(apron);

  addFence(root, surf);
  addSurround(root, surf);
  const crowd = addCrowd(root, surf, quality);
  // Everything in the venue gets the same banded ramp as the players so the
  // cel look is consistent rather than characters-on-a-photo.
  toonifyTree(root, { ramp: RAMPS.world });

  // Lighting travels with the venue.
  scene.background = new THREE.Color(surf.sky);
  scene.fog = new THREE.Fog(surf.fog[0], surf.fog[1], surf.fog[2]);
  root.add(new THREE.HemisphereLight(surf.hemi[0], surf.hemi[1], surf.hemi[2]));
  const sun = new THREE.DirectionalLight(surf.sun.color, surf.sun.intensity);
  sun.position.set(...surf.sun.pos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  sun.shadow.camera.left = -46;
  sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 46;
  sun.shadow.camera.bottom = -46;
  sun.shadow.bias = -0.0005;
  root.add(sun);
  const rim = new THREE.DirectionalLight(surf.rim.color, surf.rim.intensity);
  rim.position.set(-28, 18, 30);
  root.add(rim);

  scene.add(root);

  return {
    surface: surf,
    crowd,
    dispose() {
      scene.remove(root);
      disposeTree(root);
    },
  };
}
