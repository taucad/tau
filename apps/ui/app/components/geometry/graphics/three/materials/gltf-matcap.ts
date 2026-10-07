import {
  qualifyGltfSurfaceMaterial,
  gltfSurfacePresentationTag,
} from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import type { Mesh, Material, Object3D, Texture, Color } from 'three';
import { DoubleSide, MeshMatcapMaterial } from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { MeshMatcapNodeMaterial } from 'three/webgpu';
import { matcapMaterial } from '#components/geometry/graphics/three/materials/matcap-material.js';
import {
  applyModelMaterialOpacityOverride,
  getCapturedModelMaterialAppearance,
  getOrCaptureModelMaterialAppearance,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import { transferSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';

/**
 * Dispose a material or array of materials, releasing GPU resources.
 */
function disposeMaterials(material: Material | Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    mat.dispose();
  }
}

type MaterialWithColor = Material & { color: Color };
const matcapBaseColors = new WeakMap<Material, Color>();

type SourceMaterialRenderState = Readonly<{
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  color?: Color;
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
    ...(colorMaterial ? { color: colorMaterial.color.clone() } : {}),
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
  const current = mesh.material;
  if (
    !Array.isArray(current) &&
    matcapBaseColors.has(current) &&
    ((backend === 'webgl' && current instanceof MeshMatcapMaterial) ||
      (backend === 'webgpu' && current instanceof MeshMatcapNodeMaterial))
  ) {
    current.color.copy(matcapBaseColors.get(current)!).multiplyScalar(tint);
    return current;
  }
  const meshMatcap = createMeshMatcapReplacement(backend, matcapTexture);
  qualifyGltfSurfaceMaterial(meshMatcap);
  const [source] = getSourceMaterials(mesh.material);
  if (source) {
    meshMatcap.name = source.name;
    meshMatcap.userData = structuredClone(source.userData);
  }
  const sourceRenderState = resolveSourceMaterialRenderState(mesh.material);

  // The section clip carries over to the replacement.
  const [clipped] = getSourceMaterials(mesh.material);
  if (clipped) {
    transferSectionClip(clipped, meshMatcap);
  }

  const hasVertexColors = Boolean(mesh.geometry.attributes['color'] ?? mesh.geometry.attributes['COLOR_0']);
  if (hasVertexColors) {
    meshMatcap.vertexColors = true;
  } else if (sourceRenderState.color) {
    meshMatcap.color.copy(sourceRenderState.color);
  }

  applySourceMaterialRenderStateToMatcap(meshMatcap, sourceRenderState);

  matcapBaseColors.set(meshMatcap, meshMatcap.color.clone());
  if (tint !== 1) {
    meshMatcap.color.multiplyScalar(tint);
  }

  const authoredStates = getSourceMaterials(current).map(
    (material) => getCapturedModelMaterialAppearance(material) ?? material,
  );
  getOrCaptureModelMaterialAppearance(meshMatcap, {
    opacity: authoredStates.length > 0 ? Math.min(...authoredStates.map((state) => state.opacity)) : 1,
    transparent: authoredStates.some((state) => state.transparent || state.opacity < 1),
    depthWrite: authoredStates.every((state) => state.depthWrite),
  });

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
    if (Boolean(child.userData[gltfSurfacePresentationTag]) || ('type' in child && child.type === 'LineSegments2')) {
      return;
    }

    if ('isMesh' in child && child.isMesh) {
      const mesh = child as Mesh;
      const meshMatcap = applyMatcapMaterialToMesh({ mesh, matcapTexture, tint, backend });

      // Dispose the old material(s) before replacing to prevent GPU memory leaks
      if (mesh.material !== meshMatcap) {
        disposeMaterials(mesh.material);
      }

      mesh.material = meshMatcap;
    }
  });
};
