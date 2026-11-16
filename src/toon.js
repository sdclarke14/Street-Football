import * as THREE from 'three';

// Bold cel-shading: banded toon ramps plus inverted-hull outlines.
//
// The outline is a second copy of the mesh rendered back-faces-only, with
// every vertex pushed out along its normal. For a SkinnedMesh the push has
// to happen BEFORE skinning or the shell tears apart as the player runs, so
// the offset is injected at <begin_vertex>, which Three.js emits ahead of
// <skinning_vertex>.

// Quantised light ramp. Few steps = hard terminator = cartoon.
export function makeGradientMap(steps = [70, 150, 235, 255]) {
  const data = new Uint8Array(steps);
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const RAMP_CHARACTER = makeGradientMap([125, 195, 255]);    // 3 hard bands, lifted shadow
const RAMP_WORLD = makeGradientMap([168, 212, 244, 255]);   // 4 bands, nearly flat

// Swap a PBR material for a toon one, keeping what matters (map, colour).
// The source rig bakes its look into BOTH map and emissiveMap with white
// emissive, which would flood out any shading — so emissive is dropped and
// the atlas is used as the colour map instead.
export function toonify(material, { ramp = RAMP_WORLD, keepEmissive = false, tintable = false } = {}) {
  if (!material || material.isMeshToonMaterial) return material;
  const map = material.map ?? material.emissiveMap ?? null;
  const toon = new THREE.MeshToonMaterial({
    map,
    color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
    gradientMap: ramp,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    side: material.side,
    flatShading: material.flatShading,
    vertexColors: material.vertexColors,
  });
  if (keepEmissive && material.emissive) {
    toon.emissive = material.emissive.clone();
    toon.emissiveIntensity = material.emissiveIntensity ?? 1;
  }
  if (tintable) addKitTint(toon);
  toon.name = material.name;
  return toon;
}

// Recolour the kit in the fragment shader rather than repainting a 2048px
// atlas per player. The source atlas has a green jersey that is chroma-
// distinct from skin, white and black, so green-dominant texels become the
// character's own colour. Near-white texels (trim, undershirt, socks) take
// a lighter wash of the team colour, which is what keeps the two sides
// apart once every player is wearing something different.
function addKitTint(material) {
  const kit = { value: new THREE.Color(0x4c9e16) };
  const team = { value: new THREE.Color(0xb9f227) };
  material.userData.kitUniform = kit;
  material.userData.teamUniform = team;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.kitColor = kit;
    shader.uniforms.teamColor = team;
    shader.fragmentShader =
      'uniform vec3 kitColor;\nuniform vec3 teamColor;\n' +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float mxAll = max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) );
          float mnAll = min( diffuseColor.r, min( diffuseColor.g, diffuseColor.b ) );
          float lum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
          bool jersey = diffuseColor.g > max( diffuseColor.r, diffuseColor.b ) * 1.10
                     && diffuseColor.g > 0.06;
          if ( jersey ) {
            // The kit is multiplied by the atlas luminance and again by the
            // toon ramp, so a straight tint comes out muddy. Lift it and
            // floor it so the colour reads as the colour.
            diffuseColor.rgb = kitColor * clamp( 0.45 + lum * 1.9, 0.62, 1.45 );
          } else if ( mxAll - mnAll < 0.12 && lum > 0.42 ) {
            diffuseColor.rgb = mix(
              diffuseColor.rgb,
              teamColor * clamp( 0.55 + lum * 0.8, 0.5, 1.25 ),
              0.78
            );
          }
        }`
      );
  };
}

// Set a rig's kit and team colours. Safe before or after shader compile.
export function setKit(root, kitHex, teamHex) {
  root.traverse((c) => {
    const u = c.material?.userData;
    if (!u?.kitUniform) return;
    u.kitUniform.value.set(kitHex);
    u.teamUniform.value.set(teamHex);
  });
}

// Walk a subtree and toon-ify every material on it.
export function toonifyTree(root, opts) {
  root.traverse((c) => {
    if (!c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh) return;
    if (Array.isArray(c.material)) c.material = c.material.map((m) => toonify(m, opts));
    else c.material = toonify(c.material, opts);
  });
}

// An inverted hull pushed along the mesh's own normals tears open at every
// hard edge, because those edges are duplicated vertices carrying different
// normals — the model visibly shatters. Averaging the normals of every
// vertex that shares a position gives a watertight shell to push instead.
const SMOOTH_ATTR = 'aOutlineNormal';
export function ensureSmoothNormals(geometry) {
  if (geometry.getAttribute(SMOOTH_ATTR)) return;
  const pos = geometry.getAttribute('position');
  const nrm = geometry.getAttribute('normal');
  if (!pos || !nrm) return;
  const count = pos.count;
  const sums = new Map(); // quantised position -> accumulated normal
  const keys = new Array(count);
  const Q = 1e4;
  for (let i = 0; i < count; i++) {
    const key =
      `${Math.round(pos.getX(i) * Q)},${Math.round(pos.getY(i) * Q)},${Math.round(pos.getZ(i) * Q)}`;
    keys[i] = key;
    let acc = sums.get(key);
    if (!acc) sums.set(key, (acc = [0, 0, 0]));
    acc[0] += nrm.getX(i);
    acc[1] += nrm.getY(i);
    acc[2] += nrm.getZ(i);
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = sums.get(keys[i]);
    const len = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / len;
    out[i * 3 + 1] = a[1] / len;
    out[i * 3 + 2] = a[2] / len;
  }
  geometry.setAttribute(SMOOTH_ATTR, new THREE.BufferAttribute(out, 3));
}

function outlineMaterial(color, width) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  // One uniform object owned by the material, so the width can be changed
  // before or after the shader compiles — a player's build can change when
  // a new character is drafted onto him.
  const uniform = { value: width };
  mat.userData.outlineUniform = uniform;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = uniform;
    shader.vertexShader =
      `uniform float outlineWidth;\nattribute vec3 ${SMOOTH_ATTR};\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        // Push along the averaged normal, in bind space: <skinning_vertex>
        // below deforms `transformed` afterwards, so the shell rides the
        // skeleton rather than floating in bind pose.
        `#include <begin_vertex>\n\ttransformed += normalize( ${SMOOTH_ATTR} ) * outlineWidth;`
      );
    mat.userData.shader = shader;
  };
  return mat;
}

// Add an outline shell for every mesh under `root`. A SkinnedMesh shell has
// to share the original's skeleton, which clone() does not do on its own.
export function addOutlines(root, { color = 0x0d0f0e, width = 0.018 } = {}) {
  const shells = [];
  const targets = [];
  root.traverse((c) => {
    if (c.isSkinnedMesh || c.isMesh) targets.push(c);
  });
  for (const mesh of targets) {
    if (mesh.userData.isOutline) continue;
    ensureSmoothNormals(mesh.geometry);
    const shell = mesh.isSkinnedMesh
      ? new THREE.SkinnedMesh(mesh.geometry, outlineMaterial(color, width))
      : new THREE.Mesh(mesh.geometry, outlineMaterial(color, width));
    if (mesh.isSkinnedMesh) {
      shell.bind(mesh.skeleton, mesh.bindMatrix);
      shell.bindMode = mesh.bindMode;
    }
    shell.userData.isOutline = true;
    shell.castShadow = false;
    shell.receiveShadow = false;
    shell.renderOrder = (mesh.renderOrder ?? 0) - 1;
    shell.frustumCulled = mesh.frustumCulled;
    mesh.add(shell);
    // The shell is parented to the mesh, so cancel the parent's transform:
    // it must sit in the same space, not inherit it twice.
    shell.position.set(0, 0, 0);
    shell.rotation.set(0, 0, 0);
    shell.scale.set(1, 1, 1);
    shell.matrixAutoUpdate = true;
    shells.push(shell);
  }
  return shells;
}

// Tint the ink per team. Kept very dark so it still reads as an outline,
// but the hue gives each side a silhouette cue that survives a pile-up,
// where the ground rings are hidden under bodies.
export function setOutlineColor(root, hex) {
  root.traverse((c) => {
    if (c.userData.isOutline && c.material?.color) c.material.color.set(hex);
  });
}

export function setOutlineWidth(root, width) {
  root.traverse((c) => {
    if (c.userData.isOutline && c.material?.userData?.outlineUniform) {
      c.material.userData.outlineUniform.value = width;
    }
  });
}

export const RAMPS = { character: RAMP_CHARACTER, world: RAMP_WORLD };
