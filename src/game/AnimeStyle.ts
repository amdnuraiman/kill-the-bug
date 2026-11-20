import * as THREE from 'three';

let cachedToonMap: THREE.DataTexture | null = null;

export function getAnimeToonGradientMap(): THREE.DataTexture {
  if (cachedToonMap) return cachedToonMap;

  // 4-step sharp cel-shading ramp for crisp anime lighting contrast
  const colors = new Uint8Array([
    72, 72, 92, 255,
    145, 145, 165, 255,
    220, 220, 232, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(colors, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cachedToonMap = tex;
  return tex;
}

const inkMaterialCache = new Map<number, THREE.MeshBasicMaterial>();

export function getInkOutlineMaterial(color = 0x0b0714): THREE.MeshBasicMaterial {
  let mat = inkMaterialCache.get(color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.BackSide,
    });
    inkMaterialCache.set(color, mat);
  }
  return mat;
}

export function attachInkOutline(
  mesh: THREE.Mesh,
  scaleFactor = 1.07,
  color = 0x0b0714,
): THREE.Mesh {
  const outline = new THREE.Mesh(mesh.geometry, getInkOutlineMaterial(color));
  outline.scale.setScalar(scaleFactor);
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  return outline;
}
