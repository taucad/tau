import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Mesh } from 'three';
import { DoubleSide, MeshMatcapMaterial } from 'three';
import { matcapMaterial } from '#components/geometry/graphics/three/materials/matcap-material.js';

/**
 * Apply Three.js matcap to a GLTF scene, respecting vertex colors and material colors.
 *
 * @param gltf - The GLTF scene to apply matcap to.
 */
export const applyMatcap = async (gltf: GLTF): Promise<void> => {
  // Load matcap texture
  const matcapTexture = matcapMaterial();

  gltf.scene.traverse((child) => {
    if ('isMesh' in child && child.isMesh) {
      const meshMatcap = new MeshMatcapMaterial({
        matcap: matcapTexture,
        side: DoubleSide,
      });
      const mesh = child as Mesh;

      const hasVertexColors = Boolean(mesh.geometry.attributes['color'] ?? mesh.geometry.attributes['COLOR_0']);

      if (hasVertexColors) {
        meshMatcap.vertexColors = true;
      } else {
        if ('color' in mesh.material) {
          const material = mesh.material as { color: { getHexString(): string } };
          meshMatcap.color.set(`#${material.color.getHexString()}`);
        }

        if ('opacity' in mesh.material) {
          const material = mesh.material as { opacity: number };
          meshMatcap.opacity = material.opacity;
          if (material.opacity < 1) {
            meshMatcap.transparent = true;
          }
        }
      }

      mesh.material = meshMatcap;
    }
  });
};
