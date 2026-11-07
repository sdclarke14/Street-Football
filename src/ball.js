import * as THREE from 'three';

const GRAVITY = 20; // arcade-heavy so throws stay snappy
const X_AXIS = new THREE.Vector3(1, 0, 0);

export function createBall(scene) {
  const geo = new THREE.SphereGeometry(0.16, 20, 14);
  geo.scale(1.45, 1, 1); // football ellipsoid, long axis on X
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x7a4526, roughness: 0.6 })
  );
  mesh.castShadow = true;
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
