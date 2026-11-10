import * as THREE from 'three';
import { tex } from './materials.js';

const GRAVITY = 20; // arcade-heavy so throws stay snappy
const X_AXIS = new THREE.Vector3(1, 0, 0);

// Leather football: pebbled PBR leather, white laces on top, white stripes
// near each tip (flag-football style).
export function createBall(scene) {
  const geo = new THREE.SphereGeometry(0.16, 40, 24);
  geo.scale(1.45, 1, 1); // football ellipsoid, long axis on X
  const leather = new THREE.MeshPhysicalMaterial({
    color: 0x6e3518,
    roughness: 0.55,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    normalMap: tex('leather_normal', { repeat: 4 }),
    normalScale: new THREE.Vector2(0.8, 0.8),
  });
  const mesh = new THREE.Mesh(geo, leather);
  mesh.castShadow = true;

  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
  const lace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.018), white);
  lace.position.y = 0.158;
  mesh.add(lace);
  for (let i = -3; i <= 3; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, 0.05), white);
    tick.position.set(i * 0.022, 0.159, 0);
    mesh.add(tick);
  }
  for (const s of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.121, 0.008, 6, 32), white);
    stripe.rotation.y = Math.PI / 2;
    stripe.position.x = s * 0.15;
    mesh.add(stripe);
  }
  scene.add(mesh);
  return {
    mesh,
    state: 'held', // 'held' | 'thrown'
    carrier: null,
    intended: null, // receiver a thrown ball is meant for
    airTime: 0,
    velocity: new THREE.Vector3(),
  };
}

export function holdBall(ball, player) {
  ball.state = 'held';
  ball.carrier = player;
  ball.intended = null;
}

// Ballistic throw from `from` to `targetPos` arriving in `flightTime`.
export function throwBall(ball, from, targetPos, flightTime, intended) {
  ball.state = 'thrown';
  ball.carrier = null;
  ball.intended = intended;
  ball.airTime = 0;
  ball.mesh.position.copy(from);
  ball.velocity.set(
    (targetPos.x - from.x) / flightTime,
    (targetPos.y - from.y) / flightTime + 0.5 * GRAVITY * flightTime,
    (targetPos.z - from.z) / flightTime
  );
}

const vDir = new THREE.Vector3();
const handPos = new THREE.Vector3();
export function updateBall(ball, dt) {
  if (ball.state === 'held' && ball.carrier) {
    const c = ball.carrier;
    if (c.hand) {
      // Socket the ball into the carrying hand so it rides the run cycle.
      c.rig.updateMatrixWorld(true);
      c.hand.getWorldPosition(handPos);
      ball.mesh.position.copy(handPos);
      ball.mesh.position.y = Math.max(handPos.y, 0.35);
    } else {
      ball.mesh.position.set(
        c.group.position.x + Math.sin(c.heading) * 0.35,
        1.0,
        c.group.position.z + Math.cos(c.heading) * 0.35
      );
    }
    ball.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.heading);
    ball.mesh.rotateZ(1.15); // tucked under the arm
  } else if (ball.state === 'thrown') {
    ball.airTime += dt;
    ball.velocity.y -= GRAVITY * dt;
    ball.mesh.position.addScaledVector(ball.velocity, dt);
    vDir.copy(ball.velocity).normalize();
    ball.mesh.quaternion.setFromUnitVectors(X_AXIS, vDir); // nose along flight
  }
}
