import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Mesh, Material, Scene, Texture } from 'three';
import { DoubleSide, MeshMatcapMaterial } from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { MeshMatcapNodeMaterial } from 'three/webgpu';
import { matcapMaterial } from '#components/geometry/graphics/three/materials/matcap-material.js';
import { sceneTag, hasSceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';

/**
 * Dispose a material or array of materials, releasing GPU resources.
 */
function disposeMaterials(material: Material | Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    mat.dispose();
  }
}

type ApplyMatcapToClonedSceneOptions = Readonly<{
  /** Color multiplier applied to every matcap material (1.0 = unchanged). */
  tint?: number;
  /** WebGL shader matcap vs WebGPU/TSL {@link MeshMatcapNodeMaterial}. */
  backend?: ResolvedGraphicsBackend;
}>;

function createMeshMatcapReplacement(
  backend: ResolvedGraphicsBackend,
  matcapTexture: Texture,
): MeshMatcapMaterial | MeshMatcapNodeMaterial {
  return backend === 'webgpu'
    ? new MeshMatcapNodeMaterial({
        matcap: matcapTexture,
        side: DoubleSide,
      })
    : new MeshMatcapMaterial({
        matcap: matcapTexture,
        side: DoubleSide,
      });
}

/**
 * Apply Three.js matcap to a GLTF scene, respecting vertex colors and material colors.
 *
 * Note: LineSegments2 extends Mesh but uses LineMaterial for fat line rendering.
 * We must exclude LineSegments2 from matcap application to preserve edge rendering.
 *
 * @param gltf - Loaded glTF root (scene is traversed in place).
 * @param tint - Color multiplier applied to every matcap material (1.0 = full brightness, lower = dimmed).
 * @param backend - WebGL shader matcap vs WebGPU/TSL {@link MeshMatcapNodeMaterial}.
 */
export const applyMatcap = async (gltf: GLTF, tint = 1, backend: ResolvedGraphicsBackend = 'webgl'): Promise<void> => {
  // Load matcap texture
  const matcapTexture = matcapMaterial();

  gltf.scene.traverse((child) => {
    // Skip fat-line meshes (`LineSegments2`) — WebGL + WebGPU both use `.type === 'LineSegments2'`.
    // They extend Mesh but use fat-line materials; matcap breaks edge rendering.
    if ('type' in child && child.type === 'LineSegments2') {
      return;
    }

    if ('isMesh' in child && child.isMesh) {
      const meshMatcap = createMeshMatcapReplacement(backend, matcapTexture);
      const mesh = child as Mesh;

      // Preserve clipping planes so section-view clipping survives matcap replacement
      if (!Array.isArray(mesh.material) && mesh.material.clippingPlanes?.length) {
        meshMatcap.clippingPlanes = mesh.material.clippingPlanes;
      }

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

      if (tint < 1) {
        meshMatcap.color.multiplyScalar(tint);
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
 * Returns the explicit `Set<Material>` of every matcap material this call
 * allocated, so {@link disposeCloneOwnedMaterials} can free precisely the
 * clone-owned materials at teardown without ever touching shared references.
 *
 * Unlike {@link applyMatcap}, this function does **not** dispose the original
 * materials because `scene.clone()` creates meshes that share material
 * references with the live scene. Disposing them would corrupt the original
 * via three's per-renderer `RenderObject.onMaterialDispose` listener fan-out
 * (see `docs/research/screenshot-viewport-shared-material-state-bleed.md`).
 *
 * @param scene - The cloned THREE.Scene to apply matcap materials to.
 * @param matcapTexture - A fully-loaded matcap texture (use `ensureMatcapTextureLoaded()`).
 * @param options - Optional `tint` and `backend`; defaults match `applyMatcap` (`tint` 1, backend `webgl`).
 * @returns The set of newly-allocated matcap materials owned by this clone pass.
 */
export function applyMatcapToClonedScene(
  scene: Scene,
  matcapTexture: Texture,
  options?: ApplyMatcapToClonedSceneOptions,
): Set<Material> {
  const tint = options?.tint ?? 1;
  const backend = options?.backend ?? 'webgl';
  const allocated = new Set<Material>();

  scene.traverse((child) => {
    if ('type' in child && child.type === 'LineSegments2') {
      return;
    }

    if (hasSceneTag(child, sceneTag.sectionViewHelper)) {
      return;
    }

    if ('isMesh' in child && child.isMesh) {
      const mesh = child as Mesh;
      const meshMatcap = createMeshMatcapReplacement(backend, matcapTexture);

      if (!Array.isArray(mesh.material) && mesh.material.clippingPlanes?.length) {
        meshMatcap.clippingPlanes = mesh.material.clippingPlanes;
      }

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

      if (tint < 1) {
        meshMatcap.color.multiplyScalar(tint);
      }

      mesh.material = meshMatcap;
      allocated.add(meshMatcap);
    }
  });

  return allocated;
}

/**
 * Dispose materials whose allocation is explicitly owned by a screenshot/offscreen clone.
 *
 * Iterates the supplied set rather than traversing the scene by `isMesh` —
 * inheritance-based ownership inference is unsafe because `LineSegments2`
 * extends `Mesh` and would otherwise pull shared viewport `Line2NodeMaterial`
 * instances into the dispose chain, firing per-renderer `'dispose'` listeners
 * across every renderer using that material.
 *
 * The shared matcap texture singleton is unaffected — `Material.dispose()`
 * only releases the compiled shader program, not referenced textures.
 *
 * @param materials - The exact set of clone-owned materials returned from
 *   `applyMatcapToClonedScene` (and any other clone-pass allocator that
 *   participates in this contract, e.g. `applyEdgeMaterialsToClonedScene`).
 */
export function disposeCloneOwnedMaterials(materials: ReadonlySet<Material>): void {
  for (const material of materials) {
    material.dispose();
  }
}
