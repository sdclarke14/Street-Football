import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Post chain: scene (MSAA, HDR) -> ambient occlusion -> bloom -> tone map ->
// broadcast grade (contrast, warmth, vignette). Quality 'low' skips AO.

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.08 },
    saturation: { value: 1.08 },
    lift: { value: new THREE.Vector3(0.012, 0.006, 0.0) },
    vignette: { value: 0.32 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float contrast, saturation, vignette;
    uniform vec3 lift;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5 + lift;
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export function createPostFX(renderer, scene, camera, quality) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(w * pr, h * pr, {
    type: THREE.HalfFloatType,
    samples: quality === 'high' ? 4 : 2,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  let ao = null;
  if (quality === 'high') {
    ao = new GTAOPass(scene, camera, w, h);
    ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
  }

  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.45, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GradeShader));
  composer.setSize(w, h);

  return {
    composer,
    render: () => composer.render(),
    setSize(width, height) {
      composer.setSize(width, height);
      if (ao) ao.setSize(width, height);
    },
  };
}
