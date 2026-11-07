import * as THREE from 'three';

// Street football court. Play runs along X: end zones at both ±X ends,
// sidelines at ±Z. A chain-link fence encloses the whole lot.
export const FIELD = {
  halfLength: 18, // goal line to goal line is 36 units
  endZoneDepth: 6,
  halfWidth: 9,
  fenceMargin: 3, // concrete apron between boundary and fence
  fenceHeight: 3,
};

const GROUND_HALF_X = FIELD.halfLength + FIELD.endZoneDepth + FIELD.fenceMargin + 1;
const GROUND_HALF_Z = FIELD.halfWidth + FIELD.fenceMargin + 1;

// Concrete with painted lines, drawn into one canvas so paint looks worn-in.
function makeCourtTexture() {
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const sx = W / (GROUND_HALF_X * 2);
  const sz = H / (GROUND_HALF_Z * 2);
  const px = (x) => (x + GROUND_HALF_X) * sx;
  const pz = (z) => (z + GROUND_HALF_Z) * sz;

  // Concrete base + speckle + blotches + hairline cracks.
  g.fillStyle = '#8f8d88';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 35000; i++) {
    const v = 110 + Math.random() * 90;
    g.fillStyle = `rgba(${v},${v},${v * 0.97},${0.06 + Math.random() * 0.09})`;
    g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
  }
  for (let i = 0; i < 70; i++) {
    const v = 100 + Math.random() * 60;
    g.fillStyle = `rgba(${v},${v},${v},0.05)`;
    g.beginPath();
    g.ellipse(
      Math.random() * W, Math.random() * H,
      30 + Math.random() * 120, 20 + Math.random() * 80,
      Math.random() * Math.PI, 0, Math.PI * 2
    );
    g.fill();
  }
  g.strokeStyle = 'rgba(45,45,45,0.13)';
  for (let i = 0; i < 28; i++) {
    g.lineWidth = 1 + Math.random() * 1.5;
    g.beginPath();
    let cx = Math.random() * W;
    let cy = Math.random() * H;
    g.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += (Math.random() - 0.5) * 160;
      cy += (Math.random() - 0.5) * 160;
      g.lineTo(cx, cy);
    }
    g.stroke();
  }

  const { halfLength, endZoneDepth, halfWidth } = FIELD;
  const backX = halfLength + endZoneDepth;
  const paint = 'rgba(245,245,240,0.6)';

  // End zone fills (faded paint), blue defends -X, red defends +X.
  g.fillStyle = 'rgba(45,95,200,0.3)';
  g.fillRect(px(-backX), pz(-halfWidth), endZoneDepth * sx, halfWidth * 2 * sz);
  g.fillStyle = 'rgba(210,60,50,0.3)';
  g.fillRect(px(halfLength), pz(-halfWidth), endZoneDepth * sx, halfWidth * 2 * sz);

  // Boundary: sidelines + end lines.
  g.strokeStyle = paint;
  g.lineWidth = 0.22 * sx;
  g.strokeRect(px(-backX), pz(-halfWidth), backX * 2 * sx, halfWidth * 2 * sz);

  // Goal lines (thicker) and yard stripes every 6 units.
  const stripe = (x, width, alpha) => {
    g.strokeStyle = `rgba(245,245,240,${alpha})`;
    g.lineWidth = width * sx;
    g.beginPath();
    g.moveTo(px(x), pz(-halfWidth));
    g.lineTo(px(x), pz(halfWidth));
    g.stroke();
  };
  stripe(-halfLength, 0.3, 0.6);
  stripe(halfLength, 0.3, 0.6);
  for (const x of [-12, -6, 6, 12]) stripe(x, 0.14, 0.35);
  stripe(0, 0.2, 0.45);

  // Hash marks between stripes.
  g.strokeStyle = 'rgba(245,245,240,0.28)';
  g.lineWidth = 0.08 * sx;
  for (let x = -halfLength + 1.5; x < halfLength; x += 3) {
    for (const z of [-halfWidth * 0.45, halfWidth * 0.45]) {
      g.beginPath();
      g.moveTo(px(x), pz(z - 0.35));
      g.lineTo(px(x), pz(z + 0.35));
      g.stroke();
    }
  }

  // Center circle emblem, street-court style.
  g.strokeStyle = 'rgba(245,245,240,0.4)';
  g.lineWidth = 0.16 * sx;
  g.beginPath();
  g.ellipse(px(0), pz(0), 3 * sx, 3 * sz, 0, 0, Math.PI * 2);
  g.stroke();

  // Wear pass: concrete speckle back on top of the paint.
  for (let i = 0; i < 9000; i++) {
    const v = 120 + Math.random() * 70;
    g.fillStyle = `rgba(${v},${v},${v},0.1)`;
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
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, S, S);
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
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function addFence(scene) {
  const { fenceHeight } = FIELD;
  const fx = GROUND_HALF_X - 0.5;
  const fz = GROUND_HALF_Z - 0.5;
  const tex = makeFenceTexture();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4c5257, roughness: 0.6, metalness: 0.5 });
  const railGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 8);

  const sides = [
    { len: fx * 2, pos: [0, fz], rotY: 0 },
    { len: fx * 2, pos: [0, -fz], rotY: 0 },
    { len: fz * 2, pos: [fx, 0], rotY: Math.PI / 2 },
    { len: fz * 2, pos: [-fx, 0], rotY: Math.PI / 2 },
  ];
  for (const { len, pos, rotY } of sides) {
    const t = tex.clone();
    t.repeat.set(len * 1.6, fenceHeight * 1.6);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(len, fenceHeight),
      new THREE.MeshStandardMaterial({
        map: t,
        transparent: true,
        alphaTest: 0.3,
        side: THREE.DoubleSide,
        roughness: 0.5,
        metalness: 0.4,
      })
    );
    mesh.position.set(pos[0], fenceHeight / 2, pos[1]);
    mesh.rotation.y = rotY;
    scene.add(mesh);

    // Posts and a top rail.
    const across = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY));
    const count = Math.round(len / 6);
    for (let i = 0; i <= count; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, fenceHeight, 8),
        postMat
      );
      post.position
        .set(pos[0], fenceHeight / 2, pos[1])
        .addScaledVector(across, -len / 2 + (len / count) * i);
      post.castShadow = true;
      scene.add(post);
    }
    const rail = new THREE.Mesh(railGeo, postMat);
    rail.scale.y = len;
    rail.rotation.z = Math.PI / 2;
    rail.rotation.y = rotY;
    rail.position.set(pos[0], fenceHeight - 0.05, pos[1]);
    scene.add(rail);
  }
}

// Broadcast-style overlay lines: blue = line of scrimmage, yellow = the
// marker the offense must reach. Reposition via .position.x each drive.
export function createDriveLines(scene) {
  const makeLine = (color, opacity) => {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, FIELD.halfWidth * 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.02;
    scene.add(line);
    return line;
  };
  return {
    losLine: makeLine(0x38b6ff, 0.55),
    markerLine: makeLine(0xffb300, 0.7),
  };
}

export function buildField(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_HALF_X * 2, GROUND_HALF_Z * 2),
    new THREE.MeshStandardMaterial({ map: makeCourtTexture(), roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  addFence(scene);
}

// Golden-hour lighting: warm low sun, long shadows, hazy warm sky.
export function buildLighting(scene) {
  scene.background = new THREE.Color(0xffc98d);
  scene.fog = new THREE.Fog(0xffc98d, 70, 150);

  scene.add(new THREE.HemisphereLight(0xffdcb0, 0x5a5248, 0.75));

  const sun = new THREE.DirectionalLight(0xffb168, 2.4);
  sun.position.set(35, 14, -22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
}
