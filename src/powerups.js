import * as THREE from 'three';
import { FIELD } from './field.js';

// Mystery boxes: fixed spawn spots at midfield and the flanks (never in an
// end zone). Hot acid-yellow, idle bob + glow ring. Contact pickup, 15s
// respawn. Effects: turbo burst, electric trap, oil slick — traps drop just
// behind the collector and only trigger on the other team.

export const ACID = 0xd4f00f;
export const BOX_SPOTS = [
  [0, -6.5],
  [0, 6.5],
  [-8, -4],
  [-8, 4],
  [8, -4],
  [8, 4],
];
export const EFFECT_TYPES = ['turbo', 'trap', 'oil'];

const RESPAWN_SECONDS = 15;
const PICKUP_RADIUS = 0.8;
const HAZARD_RADIUS = 0.75;
const HAZARD_LIFE = 5;
const HAZARD_DROP_BACK = 1.7; // spawned this far behind the collector

export function createPowerups(scene) {
  const boxMat = new THREE.MeshStandardMaterial({
    color: ACID,
    emissive: ACID,
    emissiveIntensity: 1.5,
    roughness: 0.35,
  });
  const boxes = BOX_SPOTS.map(([x, z]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), boxMat);
    mesh.castShadow = true;
    mesh.position.set(x, 0.55, z);
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 24),
      new THREE.MeshBasicMaterial({ color: ACID, transparent: true, opacity: 0.3 })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.03, z);
    scene.add(mesh, glow);
    return { x, z, mesh, glow, cooldown: 0, bobT: Math.random() * 6 };
  });

  const hazards = [];
  let forcedNext = null; // test hook: force the next effect type

  function makeHazardMesh(type) {
    if (type === 'trap') {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32),
        new THREE.MeshStandardMaterial({
          color: ACID,
          emissive: ACID,
          emissiveIntensity: 2,
          roughness: 0.2,
        })
      );
      m.position.y = 0.35;
      return m;
    }
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 24),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.15, metalness: 0.4 })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    return m;
  }

  function spawnHazard(type, owner) {
    const pos = owner.group.position.clone();
    pos.x -= Math.sin(owner.heading) * HAZARD_DROP_BACK;
    pos.z -= Math.cos(owner.heading) * HAZARD_DROP_BACK;
    const maxX = FIELD.halfLength + FIELD.endZoneDepth - 1;
    pos.x = THREE.MathUtils.clamp(pos.x, -maxX, maxX);
    pos.z = THREE.MathUtils.clamp(pos.z, -FIELD.halfWidth + 0.5, FIELD.halfWidth - 0.5);
    const mesh = makeHazardMesh(type);
    mesh.position.x = pos.x;
    mesh.position.z = pos.z;
    scene.add(mesh);
    hazards.push({ type, owner, mesh, life: HAZARD_LIFE });
  }

  function update(dt, players, { onPickup, onHazardHit }) {
    for (const box of boxes) {
      box.bobT += dt;
      if (box.cooldown > 0) {
        box.cooldown -= dt;
        if (box.cooldown <= 0) {
          box.mesh.visible = true;
          box.glow.visible = true;
        }
        continue;
      }
      box.mesh.position.y = 0.55 + Math.sin(box.bobT * 2.6) * 0.13;
      box.mesh.rotation.y += dt * 1.4;
      for (const p of players) {
        const dx = p.group.position.x - box.x;
        const dz = p.group.position.z - box.z;
        if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
          box.cooldown = RESPAWN_SECONDS;
          box.mesh.visible = false;
          box.glow.visible = false;
          const type =
            forcedNext ?? EFFECT_TYPES[Math.floor(Math.random() * EFFECT_TYPES.length)];
          forcedNext = null;
          onPickup(p, type);
          break;
        }
      }
    }

    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      h.life -= dt;
      if (h.type === 'trap') {
        h.mesh.rotation.y += dt * 5;
        h.mesh.position.y = 0.35 + Math.sin(h.life * 9) * 0.05;
      }
      let triggered = false;
      if (h.life > 0) {
        for (const p of players) {
          if (p.team === h.owner.team || p.stunT > 0 || p.slipT > 0) continue;
          const dx = p.group.position.x - h.mesh.position.x;
          const dz = p.group.position.z - h.mesh.position.z;
          if (dx * dx + dz * dz < HAZARD_RADIUS * HAZARD_RADIUS) {
            onHazardHit(h, p);
            triggered = true;
            break;
          }
        }
      }
      if (triggered || h.life <= 0) {
        scene.remove(h.mesh);
        hazards.splice(i, 1);
      }
    }
  }

  return {
    boxes,
    hazards,
    update,
    spawnHazard,
    forceNext: (type) => (forcedNext = type),
  };
}
