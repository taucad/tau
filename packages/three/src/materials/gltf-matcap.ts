import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Mesh, Material, Scene, Texture } from 'three';
import { DoubleSide, MeshMatcapMaterial } from 'three';
import { LineSegments2 } from 'three/addons';
import { matcapMaterial } from '#materials/matcap-material.js';

/**
 * Dispose a material or array of materials, releasing GPU resources.
 */
function disposeMaterials(material: Material | Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    mat.dispose();
  }
}

/**
 * Apply Three.js matcap to a GLTF scene, respecting vertex colors and material colors.
 *
 * Note: LineSegments2 extends Mesh but uses LineMaterial for fat line rendering.
 * We must exclude LineSegments2 from matcap application to preserve edge rendering.
 *
 * @param gltf - The GLTF scene to apply matcap to.
 */
export const applyMatcap = async (gltf: GLTF): Promise<void> => {
  // Load matcap texture
  const matcapTexture = matcapMaterial();

  gltf.scene.traverse((child) => {
    // Skip LineSegments2 - they extend Mesh but use LineMaterial for fat lines
    if (child instanceof LineSegments2) {
      return;
    }

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

      // Dispose the old material(s) before replacing to prevent GPU memory leaks
      disposeMaterials(mesh.material);

      mesh.material = meshMatcap;
    }
  });
};

/**
 * Apply matcap materials to a cloned scene for screenshot rendering.
 *
 * Unlike {@link applyMatcap}, this function does **not** dispose the original
 * materials because `scene.clone()` creates meshes that share material
 * references with the live scene. Disposing them would corrupt the original.
 *
 * @param scene - The cloned THREE.Scene to apply matcap materials to.
 * @param matcapTexture - A fully-loaded matcap texture (use `ensureMatcapTextureLoaded()`).
 */
export function applyMatcapToClonedScene(scene: Scene, matcapTexture: Texture): void {
  scene.traverse((child) => {
    // Skip LineSegments2 — they extend Mesh but use LineMaterial for fat lines
    if (child instanceof LineSegments2) {
      return;
    }

    if ('isMesh' in child && child.isMesh) {
      const mesh = child as Mesh;
      const meshMatcap = new MeshMatcapMaterial({
        matcap: matcapTexture,
        side: DoubleSide,
      });

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

      // Do NOT dispose — materials are shared references with the original live scene
      mesh.material = meshMatcap;
    }
  });
}

/**
 * Dispose matcap materials that were applied to a cloned screenshot scene.
 *
 * Traverses the scene and disposes each mesh's material. The shared matcap
 * texture singleton is unaffected — `Material.dispose()` only releases the
 * compiled shader program, not referenced textures.
 */
export function disposeClonedSceneMaterials(scene: Scene): void {
  scene.traverse((child) => {
    if ('isMesh' in child && child.isMesh) {
      const mesh = child as Mesh;
      disposeMaterials(mesh.material);
    }
  });
}
