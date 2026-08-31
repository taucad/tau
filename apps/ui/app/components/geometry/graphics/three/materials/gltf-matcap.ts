import type { Mesh, Material, Object3D, Texture } from 'three';
import { DoubleSide, MeshMatcapMaterial } from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { MeshMatcapNodeMaterial } from 'three/webgpu';
import { matcapMaterial } from '#components/geometry/graphics/three/materials/matcap-material.js';
import { applyModelMaterialOpacityOverride } from '#components/geometry/graphics/three/materials/model-component-appearance.js';

/**
 * Dispose a material or array of materials, releasing GPU resources.
 */
function disposeMaterials(material: Material | Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    mat.dispose();
  }
}

type MaterialWithColor = Material & { color: { getHexString(): string } };

type SourceMaterialRenderState = Readonly<{
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  colorHexString?: string;
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

function getSourceMaterials(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function hasColor(material: Material): material is MaterialWithColor {
  const { color } = material as Partial<MaterialWithColor>;
  if (!color) {
    return false;
  }

  return typeof color.getHexString === 'function';
}

function resolveSourceMaterialRenderState(material: Material | Material[]): SourceMaterialRenderState {
  const materials = getSourceMaterials(material);
  if (materials.length === 0) {
    return { opacity: 1, transparent: false, depthWrite: true };
  }

  const opacity = Math.min(...materials.map((sourceMaterial) => sourceMaterial.opacity));
  const colorMaterial = materials.find((sourceMaterial) => hasColor(sourceMaterial));

  return {
    opacity,
    transparent: materials.some((sourceMaterial) => sourceMaterial.transparent || sourceMaterial.opacity < 1),
    depthWrite: materials.every((sourceMaterial) => sourceMaterial.depthWrite),
    ...(colorMaterial ? { colorHexString: colorMaterial.color.getHexString() } : {}),
  };
}

function applySourceMaterialRenderStateToMatcap(
  matcap: MeshMatcapMaterial | MeshMatcapNodeMaterial,
  state: SourceMaterialRenderState,
): void {
  matcap.opacity = state.opacity;
  matcap.transparent = state.transparent;
  matcap.depthWrite = state.depthWrite;

  if (state.opacity < 1) {
    applyModelMaterialOpacityOverride(matcap, state.opacity);
  }
}

function applyMatcapMaterialToMesh({
  mesh,
  matcapTexture,
  tint,
  backend,
}: {
  readonly mesh: Mesh;
  readonly matcapTexture: Texture;
  readonly tint: number;
  readonly backend: ResolvedGraphicsBackend;
}): MeshMatcapMaterial | MeshMatcapNodeMaterial {
  const meshMatcap = createMeshMatcapReplacement(backend, matcapTexture);
  const sourceRenderState = resolveSourceMaterialRenderState(mesh.material);

  // Preserve clipping planes so section-view clipping survives matcap replacement
  if (!Array.isArray(mesh.material) && mesh.material.clippingPlanes?.length) {
    meshMatcap.clippingPlanes = mesh.material.clippingPlanes;
  }

  const hasVertexColors = Boolean(mesh.geometry.attributes['color'] ?? mesh.geometry.attributes['COLOR_0']);
  if (hasVertexColors) {
    meshMatcap.vertexColors = true;
  } else if (sourceRenderState.colorHexString) {
    meshMatcap.color.set(`#${sourceRenderState.colorHexString}`);
  }

  applySourceMaterialRenderStateToMatcap(meshMatcap, sourceRenderState);

  if (tint < 1) {
    meshMatcap.color.multiplyScalar(tint);
  }

  return meshMatcap;
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
export const applyMatcap = async (
  gltf: { readonly scene: Object3D },
  tint = 1,
  backend: ResolvedGraphicsBackend = 'webgl',
): Promise<void> => {
  // Load matcap texture
  const matcapTexture = matcapMaterial();

  gltf.scene.traverse((child) => {
    // Skip fat-line meshes (`LineSegments2`) — WebGL + WebGPU both use `.type === 'LineSegments2'`.
    // They extend Mesh but use fat-line materials; matcap breaks edge rendering.
    if ('type' in child && child.type === 'LineSegments2') {
      return;
    }

    if ('isMesh' in child && child.isMesh) {
      const mesh = child as Mesh;
      const meshMatcap = applyMatcapMaterialToMesh({ mesh, matcapTexture, tint, backend });

      // Dispose the old material(s) before replacing to prevent GPU memory leaks
      disposeMaterials(mesh.material);

      mesh.material = meshMatcap;
    }
  });
};
