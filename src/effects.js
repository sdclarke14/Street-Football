import * as THREE from 'three';

// Hit feedback: impact flash sprites + camera shake. Hit-stop lives in
// main.js since it gates the whole tick. Kept light — a handful of sprites,
// no particle system.

const FLASH_LIFE = 0.28;

function makeFlashTexture() {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,235,130,0.9)');
  grad.addColorStop(1, 'rgba(255,220,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // star spikes
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 5;
  for (const a of [0, Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4]) {
    g.beginPath();
    g.moveTo(S / 2 - Math.cos(a) * 58, S / 2 - Math.sin(a) * 58);
    g.lineTo(S / 2 + Math.cos(a) * 58, S / 2 + Math.sin(a) * 58);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function createFX(scene, camera) {
  const flashTex = makeFlashTexture();
  const flashes = [];
  let shakeT = 0;
  let shakeAmp = 0;

  function hitFlash(pos, size = 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthTest: false })
    );
    sprite.position.copy(pos);
    sprite.renderOrder = 20;
    scene.add(sprite);
    flashes.push({ sprite, t: 0, size });
  }

  function shake(amp = 0.25) {
    shakeT = 0.25;
    shakeAmp = Math.max(shakeAmp, amp);
  }

  // Call AFTER the camera has been positioned for the frame.
  function update(dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dt;
      const k = f.t / FLASH_LIFE;
      f.sprite.scale.setScalar((0.5 + k * 1.3) * f.size);
      f.sprite.material.opacity = 1 - k;
      if (f.t >= FLASH_LIFE) {
        scene.remove(f.sprite);
        f.sprite.material.dispose();
        flashes.splice(i, 1);
      }
    }
    if (shakeT > 0) {
      shakeT -= dt;
      const k = Math.max(shakeT, 0) / 0.25;
      camera.position.x += (Math.random() - 0.5) * shakeAmp * k;
      camera.position.y += (Math.random() - 0.5) * shakeAmp * k * 0.6;
      camera.position.z += (Math.random() - 0.5) * shakeAmp * k;
      if (shakeT <= 0) shakeAmp = 0;
    }
  }

  return { hitFlash, shake, update };
}
