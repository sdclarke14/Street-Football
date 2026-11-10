import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { surface, tex } from './materials.js';

// Street football court. Play runs along X: end zones at both ±X ends,
// sidelines at ±Z. A chain-link fence encloses the lot; brick and concrete
// buildings, a street and lamps surround it. Everything is PBR and lit by a
// golden-hour sky that also drives reflections.
export const FIELD = {
  halfLength: 18, // goal line to goal line is 36 units
  endZoneDepth: 6,
  halfWidth: 9,
  fenceMargin: 3, // apron between boundary and fence
  fenceHeight: 3,
};

const GROUND_HALF_X = FIELD.halfLength + FIELD.endZoneDepth + FIELD.fenceMargin + 1;
const GROUND_HALF_Z = FIELD.halfWidth + FIELD.fenceMargin + 1;

// Sun direction (toward the sun): low, from +X/-Z, long shadows across the court.
export const SUN_DIR = new THREE.Vector3(35, 11, -22).normalize();

// ---- helpers ---------------------------------------------------------------

// Plane on the ground with UVs in meters (so material repeat = tiles/meter).
function groundPlane(w, d) {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
  g.rotateX(-Math.PI / 2);
  return g;
}

// Box whose UVs are in meters on every face; `tile` = [u, v] meters per tile.
function meterBox(w, h, d, tile = [1, 1]) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faceSize = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * faceSize[f][0]) / tile[0], (uv.getY(i) * faceSize[f][1]) / tile[1]);
    }
  }
  return g;
}

function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// ---- court paint (transparent overlay on the asphalt) -----------------------
function makePaintTexture(maxSize) {
  const W = maxSize;
  const H = maxSize / 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const sx = W / (GROUND_HALF_X * 2);
  const sz = H / (GROUND_HALF_Z * 2);
  const px = (x) => (x + GROUND_HALF_X) * sx;
  const pz = (z) => (z + GROUND_HALF_Z) * sz;
  const { halfLength, endZoneDepth, halfWidth } = FIELD;
  const backX = halfLength + endZoneDepth;

  // End zones: faded team paint, blue defends -X, red defends +X.
  g.fillStyle = 'rgba(40,90,190,0.55)';
  g.fillRect(px(-backX), pz(-halfWidth), endZoneDepth * sx, halfWidth * 2 * sz);
  g.fillStyle = 'rgba(200,50,40,0.55)';
  g.fillRect(px(halfLength), pz(-halfWidth), endZoneDepth * sx, halfWidth * 2 * sz);

  const paint = 'rgba(240,238,228,0.95)';
  g.strokeStyle = paint;
  g.lineWidth = 0.2 * sx;
  g.strokeRect(px(-backX), pz(-halfWidth), backX * 2 * sx, halfWidth * 2 * sz);
  const stripe = (x, width, alpha) => {
    g.strokeStyle = `rgba(240,238,228,${alpha})`;
    g.lineWidth = width * sx;
    g.beginPath();
    g.moveTo(px(x), pz(-halfWidth));
    g.lineTo(px(x), pz(halfWidth));
    g.stroke();
  };
  stripe(-halfLength, 0.3, 0.95);
  stripe(halfLength, 0.3, 0.95);
  for (const x of [-12, -6, 6, 12]) stripe(x, 0.13, 0.8);
  stripe(0, 0.18, 0.9);
  g.strokeStyle = 'rgba(240,238,228,0.75)';
  g.lineWidth = 0.08 * sx;
  for (let x = -halfLength + 1.5; x < halfLength; x += 3) {
    for (const z of [-halfWidth * 0.45, halfWidth * 0.45]) {
      g.beginPath();
      g.moveTo(px(x), pz(z - 0.35));
      g.lineTo(px(x), pz(z + 0.35));
      g.stroke();
    }
  }
  g.lineWidth = 0.16 * sx;
  g.strokeStyle = 'rgba(240,238,228,0.85)';
  g.beginPath();
  g.ellipse(px(0), pz(0), 3 * sx, 3 * sz, 0, 0, Math.PI * 2);
  g.stroke();

  // End zone lettering.
  g.save();
  g.fillStyle = 'rgba(240,238,228,0.8)';
  g.font = `900 ${Math.round(2.4 * sx)}px Impact, "Arial Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [x, rot, word] of [[-backX + endZoneDepth / 2, -Math.PI / 2, 'BLUE'], [backX - endZoneDepth / 2, Math.PI / 2, 'RED']]) {
    g.save();
    g.translate(px(x), pz(0));
    g.rotate(rot);
    g.fillText(word, 0, 0);
    g.restore();
  }
  g.restore();

  // Wear: knock holes out of the paint so asphalt shows through.
  g.globalCompositeOperation = 'destination-out';
  const r = rng(42);
  for (let i = 0; i < W * 9; i++) {
    g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.6})`;
    const s = 0.5 + r() * 2.5;
    g.fillRect(r() * W, r() * H, s, s);
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(r() * W, r() * H, 20 + r() * 90, 10 + r() * 50, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---- chain-link fence -------------------------------------------------------
function makeFenceTexture() {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  g.strokeStyle = 'rgba(205,210,214,1)';
  g.lineWidth = 3.2;
  g.beginPath();
  g.moveTo(0, S / 2);
  g.lineTo(S / 2, 0);
  g.lineTo(S, S / 2);
  g.lineTo(S / 2, S);
  g.closePath();
  g.stroke();
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function addFence(scene) {
  const { fenceHeight } = FIELD;
  const fx = GROUND_HALF_X - 0.5;
  const fz = GROUND_HALF_Z - 0.5;
  const tex0 = makeFenceTexture();
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.38, metalness: 0.85 });
  const sides = [
    { len: fx * 2, pos: [0, fz], rotY: 0 },
    { len: fx * 2, pos: [0, -fz], rotY: 0 },
    { len: fz * 2, pos: [fx, 0], rotY: Math.PI / 2 },
    { len: fz * 2, pos: [-fx, 0], rotY: Math.PI / 2 },
  ];
  const postGeo = new THREE.CylinderGeometry(0.05, 0.05, fenceHeight, 10);
  const railGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 8);
  for (const { len, pos, rotY } of sides) {
    const t = tex0.clone();
    t.repeat.set(len * 1.8, fenceHeight * 1.8);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(len, fenceHeight),
      new THREE.MeshStandardMaterial({
        map: t, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.8, color: 0xb8bec2,
      })
    );
    mesh.position.set(pos[0], fenceHeight / 2, pos[1]);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    scene.add(mesh);

    const across = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY));
    const count = Math.round(len / 3);
    for (let i = 0; i <= count; i++) {
      const post = new THREE.Mesh(postGeo, metal);
      post.position.set(pos[0], fenceHeight / 2, pos[1]).addScaledVector(across, -len / 2 + (len / count) * i);
      post.castShadow = true;
      scene.add(post);
    }
    for (const y of [fenceHeight - 0.03, 0.12]) {
      const rail = new THREE.Mesh(railGeo, metal);
      rail.scale.y = len;
      rail.rotation.z = Math.PI / 2;
      rail.rotation.y = rotY;
      rail.position.set(pos[0], y, pos[1]);
      rail.castShadow = true;
      scene.add(rail);
    }
  }
}

// ---- neighborhood -----------------------------------------------------------
function addStreetscape(scene, quality) {
  const r = rng(9);
  const brick = surface('brick', 1);
  const paintedBrick = [0x9c8a76, 0x6f7f86, 0xb7a58c].map((c) => surface('brick', 1, { color: c }));
  const stucco = [0xd8c7a8, 0xbfae95, 0xa7b0b3].map((c) => surface('concrete', 0.5, { color: c }));
  const trimMat = surface('concrete', 1, { color: 0xc9c2b4 });

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x1b2430, roughness: 0.06, metalness: 0.3, envMapIntensity: 1.6, clearcoat: 1,
  });
  const lit = new THREE.MeshStandardMaterial({
    color: 0x2a2012, emissive: 0xffb45e, emissiveIntensity: 1.6, roughness: 0.3,
  });

  const windowSpots = { dark: [], lit: [], sill: [] };
  const buildings = [];
  // Rows of buildings along each side of the lot, set back past sidewalk/street.
  const rows = [
    { axis: 'x', from: -70, to: 70, line: -24, facing: 1 }, // behind -Z fence
    { axis: 'x', from: -70, to: 70, line: 36, facing: -1 }, // across the street (+Z)
    { axis: 'z', from: -22, to: 34, line: -44, facing: 1 }, // behind -X end
    { axis: 'z', from: -22, to: 34, line: 44, facing: -1 }, // behind +X end
  ];
  for (const row of rows) {
    let a = row.from;
    while (a < row.to) {
      const w = 7 + r() * 9;
      const h = 7 + Math.floor(r() * 4) * 3.2;
      const d = 10;
      const kind = r();
      const mat = kind < 0.45 ? brick : kind < 0.7 ? paintedBrick[Math.floor(r() * 3)] : stucco[Math.floor(r() * 3)];
      const tile = mat === brick || paintedBrick.includes(mat) ? [0.9, 0.6] : [2, 2];
      const geo = row.axis === 'x' ? meterBox(w, h, d, tile) : meterBox(d, h, w, tile);
      const m = new THREE.Mesh(geo, mat);
      const center = a + w / 2;
      const off = row.line - (row.facing * d) / 2;
      if (row.axis === 'x') m.position.set(center, h / 2, off);
      else m.position.set(off, h / 2, center);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      buildings.push(m);

      // Parapet / cornice
      const cap = new THREE.Mesh(meterBox(row.axis === 'x' ? w + 0.3 : d + 0.3, 0.35, row.axis === 'x' ? d + 0.3 : w + 0.3, [1, 1]), trimMat);
      cap.position.copy(m.position);
      cap.position.y = h + 0.17;
      scene.add(cap);

      // Windows on the face toward the court.
      const floors = Math.floor((h - 1.5) / 3.2);
      const cols = Math.max(1, Math.floor((w - 1.2) / 2.2));
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          const along = a + 0.6 + (c + 0.5) * ((w - 1.2) / cols);
          const y = 1.9 + f * 3.2 + 0.8;
          const out = row.line + row.facing * 0.02;
          const spot = row.axis === 'x'
            ? { p: [along, y, out], ry: row.facing > 0 ? 0 : Math.PI }
            : { p: [out, y, along], ry: row.facing > 0 ? Math.PI / 2 : -Math.PI / 2 };
          (r() < 0.16 ? windowSpots.lit : windowSpots.dark).push(spot);
          windowSpots.sill.push(spot);
        }
      }
      a += w + (r() < 0.25 ? 2 + r() * 3 : 0);
    }
  }

  const winGeo = new THREE.PlaneGeometry(1.3, 1.7);
  const sillGeo = new THREE.BoxGeometry(1.55, 0.12, 0.22);
  const place = (geo, mat, spots, yOff = 0, push = 0) => {
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    spots.forEach((s, i) => {
      e.set(0, s.ry, 0);
      q.setFromEuler(e);
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      m4.compose(new THREE.Vector3(s.p[0], s.p[1] + yOff, s.p[2]).addScaledVector(n, push), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m4);
    });
    scene.add(im);
    return im;
  };
  place(winGeo, glass, windowSpots.dark);
  place(winGeo, lit, windowSpots.lit);
  place(sillGeo, trimMat, windowSpots.sill, -0.9, 0.08);

  // Street lamps outside the fence; heads glow and catch bloom.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.7 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 4 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 7, 10);
  const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8);
  const headGeo = new THREE.BoxGeometry(0.7, 0.18, 0.35);
  const bulbGeo = new THREE.BoxGeometry(0.55, 0.04, 0.25);
  const lampZ = GROUND_HALF_Z + 1.8;
  for (const x of [-24, -8, 8, 24]) {
    for (const side of [1, -1]) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 3.5;
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0, 6.9, -side * 0.8);
      const head = new THREE.Mesh(headGeo, poleMat);
      head.position.set(0, 6.9, -side * 1.6);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(0, 6.8, -side * 1.6);
      for (const m of [pole, arm, head]) m.castShadow = true;
      g.add(pole, arm, head, bulb);
      g.position.set(x, 0, side * lampZ);
      scene.add(g);
    }
  }

  // Parked cars would be next; a few concrete barriers give the street depth.
  const barrierMat = surface('concrete', 1, { color: 0xb9b3a7 });
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(meterBox(2, 0.8, 0.5, [1, 1]), barrierMat);
    b.position.set(-30 + i * 12 + r() * 3, 0.4, GROUND_HALF_Z + 3.4);
    b.rotation.y = (r() - 0.5) * 0.15;
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
  }
  return buildings;
}

// Broadcast-style overlay lines: blue = line of scrimmage, yellow = the
// marker the offense must reach. Reposition via .position.x each drive.
export function createDriveLines(scene) {
  const makeLine = (color, opacity) => {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, FIELD.halfWidth * 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.02;
    line.renderOrder = 2;
    scene.add(line);
    return line;
  };
  return {
    losLine: makeLine(0x38b6ff, 0.55),
    markerLine: makeLine(0xffb300, 0.7),
  };
}

export function buildField(scene, { quality = 'high' } = {}) {
  // Court asphalt (tile every 3 m) with the paint as a separate decal layer.
  const courtW = GROUND_HALF_X * 2;
  const courtD = GROUND_HALF_Z * 2;
  const asphalt = surface('asphalt', 1 / 3);
  const court = new THREE.Mesh(groundPlane(courtW, courtD), asphalt);
  court.receiveShadow = true;
  scene.add(court);

  const paintGeo = new THREE.PlaneGeometry(courtW, courtD);
  paintGeo.rotateX(-Math.PI / 2);
  const paint = new THREE.Mesh(
    paintGeo,
    new THREE.MeshStandardMaterial({
      map: makePaintTexture(quality === 'high' ? 4096 : 2048),
      transparent: true,
      roughness: 0.62,
      normalMap: tex('asphalt_normal', { repeat: 1 }),
      normalScale: new THREE.Vector2(0.6, 0.6),
      polygonOffset: true,
      polygonOffsetFactor: -2,
      depthWrite: false,
    })
  );
  paint.material.normalMap = paint.material.normalMap.clone();
  paint.material.normalMap.repeat.set(courtW / 3, courtD / 3);
  paint.position.y = 0.003;
  paint.receiveShadow = true;
  paint.renderOrder = 1;
  scene.add(paint);

  // Sidewalk concrete everywhere outside the court (2 m slabs).
  const walk = new THREE.Mesh(groundPlane(240, 200), surface('concrete', 0.5));
  walk.position.y = -0.02;
  walk.receiveShadow = true;
  scene.add(walk);

  // Street along the +Z side.
  const road = new THREE.Mesh(groundPlane(240, 12), surface('asphalt', 1 / 3, { color: 0x9a9a9a }));
  road.position.set(0, -0.012, GROUND_HALF_Z + 10.5);
  road.receiveShadow = true;
  scene.add(road);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xe8c64a, roughness: 0.6 });
  for (let x = -110; x < 110; x += 6) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.15).rotateX(-Math.PI / 2), dashMat);
    dash.position.set(x, -0.008, GROUND_HALF_Z + 10.5);
    dash.receiveShadow = true;
    scene.add(dash);
  }

  addFence(scene);
  addStreetscape(scene, quality);
}

// Golden-hour sky + image-based lighting from it, and a shadow-casting sun
// that follows the action (call lighting.follow(target) every frame).
export function buildLighting(scene, renderer, { quality = 'high' } = {}) {
  const sunPos = SUN_DIR.clone();
  const makeSky = () => {
    const sky = new Sky();
    sky.scale.setScalar(1500);
    const u = sky.material.uniforms;
    u.turbidity.value = 7;
    u.rayleigh.value = 2.4;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.86;
    u.sunPosition.value.copy(sunPos);
    return sky;
  };
  scene.add(makeSky());

  const envScene = new THREE.Scene();
  envScene.add(makeSky());
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();

  scene.fog = new THREE.Fog(0xe2b892, 70, 320);

  const sun = new THREE.DirectionalLight(0xffc28a, 3.2);
  sun.castShadow = true;
  const size = quality === 'high' ? 4096 : 2048;
  sun.shadow.mapSize.set(size, size);
  const ext = 24;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 160 });
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  // Cool sky fill from the opposite side keeps shadow sides from going dead.
  const fill = new THREE.DirectionalLight(0x9cc4ff, 0.35);
  fill.position.set(-30, 25, 30);
  scene.add(fill);

  return {
    sun,
    follow(target) {
      sun.target.position.set(target.x, 0, target.z);
      sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 70);
    },
  };
}
