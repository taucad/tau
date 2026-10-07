import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Layers,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Texture,
  TextureLoader,
} from 'three';
import {
  createGltfSurfaceBatches,
  getGltfOccurrenceLayers,
  qualifyGltfSurfaceMaterial,
  sealGltfSurfaceMaterial,
} from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import { applyMatcap } from '#components/geometry/graphics/three/materials/gltf-matcap.js';
import {
  applyGltfSurfaceDepthBias,
  refreshGltfSurfaceDepthBias,
} from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';
import { createSectionClip, installSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import {
  applyModelMaterialAppearance,
  getOrCaptureModelMaterialAppearance,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) {
    dispose();
  }
  vi.restoreAllMocks();
});
const createBatches: typeof createGltfSurfaceBatches = (...args) => {
  const owner = createGltfSurfaceBatches(...args);
  cleanup.push(owner.dispose);
  return owner;
};

const fixture = (count = 100) => {
  const root = new Group();
  const geometry = new BoxGeometry();
  const source = new MeshStandardMaterial();
  const occurrences = Array.from({ length: count }, (_, index) => {
    const material = source.clone();
    material.name = `authored-${index}`;
    material.userData = { component: index };
    qualifyGltfSurfaceMaterial(material);
    const mesh = new Mesh(geometry, material);
    mesh.name = `component-${index}`;
    mesh.userData['componentId'] = `id-${index}`;
    mesh.position.x = index * 2;
    root.add(mesh);
    return mesh;
  });
  cleanup.push(() => {
    geometry.dispose();
    for (const occurrence of occurrences) {
      occurrence.material.dispose();
    }
  });
  return { root, geometry, occurrences };
};

describe('glTF surface batches', () => {
  it.each(['webgl', 'webgpu'] as const)(
    'should retain initially partial dim capacity through actual PBR to matcap and preserve opaque depth overrides on %s',
    async (backend) => {
      const texture = new Texture<HTMLImageElement>();
      vi.spyOn(TextureLoader.prototype, 'load').mockReturnValue(texture);
      cleanup.push(() => {
        texture.dispose();
      });
      const { root, occurrences } = fixture(4);
      const clip = createSectionClip(backend);
      for (const [index, mesh] of occurrences.entries()) {
        applyGltfSurfaceDepthBias(mesh.material, backend);
        installSectionClip(mesh.material, clip);
        const snapshot = getOrCaptureModelMaterialAppearance(mesh.material);
        sealGltfSurfaceMaterial(mesh.material);
        applyModelMaterialAppearance(mesh.material, snapshot, index < 2 ? 0.25 : 1);
      }
      await applyMatcap({ scene: root }, 1, backend);
      for (const mesh of occurrences) {
        applyGltfSurfaceDepthBias(mesh.material, backend);
        getOrCaptureModelMaterialAppearance(mesh.material);
        sealGltfSurfaceMaterial(mesh.material);
      }
      const batches = createBatches(root, occurrences);
      batches.sync();
      const [batch] = batches.group.children;
      if (!(batch instanceof InstancedMesh)) {
        throw new Error('Expected an opaque batch');
      }
      expect(batch.count).toBe(2);
      expect(batch.instanceMatrix.count).toBe(4);
      const matrix = batch.instanceMatrix;
      for (const mesh of occurrences) {
        applyModelMaterialAppearance(mesh.material, getOrCaptureModelMaterialAppearance(mesh.material), 1);
      }
      batches.sync();
      expect(batches.group.children).toEqual([batch]);
      expect(batch.instanceMatrix).toBe(matrix);
      expect(batch.count).toBe(4);
      const override = occurrences[2]!;
      override.material.depthWrite = false;
      refreshGltfSurfaceDepthBias(override.material);
      batches.sync();
      expect(override.layers.mask).toBe(1);
      expect(batches.group.children).toHaveLength(1);
      const [remaining] = batches.group.children;
      expect(remaining).toBeInstanceOf(InstancedMesh);
      expect((remaining as InstancedMesh).count).toBe(3);
    },
  );

  it.each(['webgl', 'webgpu'] as const)(
    'should retain initially dimmed classic capacity and preserve current opaque depthWrite on %s',
    (backend) => {
      const { root, occurrences } = fixture(4);
      const clip = createSectionClip(backend);
      const snapshots = occurrences.map(({ material }) => getOrCaptureModelMaterialAppearance(material));
      for (const [index, mesh] of occurrences.entries()) {
        installSectionClip(mesh.material, clip);
        applyModelMaterialAppearance(mesh.material, snapshots[index]!, index < 2 ? 0.25 : 1);
        applyGltfSurfaceDepthBias(mesh.material, backend);
        sealGltfSurfaceMaterial(mesh.material);
      }
      const batches = createBatches(root, occurrences);
      batches.sync();
      const [batch] = batches.group.children;
      if (!(batch instanceof InstancedMesh)) {
        throw new Error('Expected an opaque batch');
      }
      expect(batch.count).toBe(2);
      expect(batch.instanceMatrix.count).toBe(4);
      const matrix = batch.instanceMatrix;
      for (const [index, mesh] of occurrences.entries()) {
        applyModelMaterialAppearance(mesh.material, snapshots[index]!, 1);
      }
      batches.sync();
      expect(batches.group.children).toEqual([batch]);
      expect(batch.instanceMatrix).toBe(matrix);
      expect(batch.count).toBe(4);
      const override = occurrences[2]!;
      override.material.depthWrite = false;
      refreshGltfSurfaceDepthBias(override.material);
      batches.sync();
      expect(override.layers.mask).toBe(1);
      expect(batches.group.children).toHaveLength(1);
      const [remaining] = batches.group.children;
      expect(remaining).toBeInstanceOf(InstancedMesh);
      expect((remaining as InstancedMesh).count).toBe(3);
    },
  );

  it('should keep authored shader, polygon, backend and current override states in distinct real-bias cohorts', () => {
    const { root, occurrences } = fixture(8);
    const clips = { webgl: createSectionClip('webgl'), webgpu: createSectionClip('webgpu') };
    for (const [index, mesh] of occurrences.entries()) {
      if (index < 2) {
        mesh.material.polygonOffset = true;
        mesh.material.polygonOffsetFactor = 7;
      }
      if (index >= 2 && index < 4) {
        mesh.material.customProgramCacheKey = () => 'authored|tau-gltf-surface-depth-bias-v2|different';
      }
      const backend = index >= 4 && index < 6 ? 'webgpu' : 'webgl';
      applyGltfSurfaceDepthBias(mesh.material, backend);
      installSectionClip(mesh.material, clips[backend]);
      sealGltfSurfaceMaterial(mesh.material);
      if (index >= 6) {
        mesh.material.polygonOffsetFactor = 99;
      }
    }
    const batches = createBatches(root, occurrences);
    batches.sync();
    expect(batches.group.children).toHaveLength(4);
    expect(batches.group.children.every((batch) => batch instanceof InstancedMesh && batch.count === 2)).toBe(true);
  });

  it.each(['webgl', 'webgpu'] as const)(
    'should batch delayed first depth activation but reject an unknown later hook on %s',
    (backend) => {
      const { root, occurrences } = fixture(2);
      const clip = createSectionClip(backend);
      const snapshots = occurrences.map(({ material }) => getOrCaptureModelMaterialAppearance(material));
      for (const [index, mesh] of occurrences.entries()) {
        applyModelMaterialAppearance(mesh.material, snapshots[index]!, 0.25);
        applyGltfSurfaceDepthBias(mesh.material, backend);
        installSectionClip(mesh.material, clip);
        sealGltfSurfaceMaterial(mesh.material);
        applyModelMaterialAppearance(mesh.material, snapshots[index]!, 1);
      }
      const batches = createBatches(root, occurrences);
      batches.sync();
      expect(batches.group.children).toHaveLength(1);
      const { material } = occurrences[0]!;
      const ownedHook = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer): void => {
        ownedHook.call(material, shader, renderer);
      };
      batches.sync();
      expect(occurrences[0]!.layers.mask).toBe(1);
    },
  );

  it.each(['webgl', 'webgpu'] as const)(
    'should retain the full real-bias cohort capacity after initially partial dimming on %s',
    (backend) => {
      const { root, occurrences } = fixture();
      const clip = createSectionClip(backend);
      const snapshots = occurrences.map(({ material }) => {
        applyGltfSurfaceDepthBias(material, backend);
        installSectionClip(material, clip);
        sealGltfSurfaceMaterial(material);
        return getOrCaptureModelMaterialAppearance(material);
      });
      for (const [index, mesh] of occurrences.entries()) {
        applyModelMaterialAppearance(mesh.material, snapshots[index]!, index < 50 ? 0.25 : 1);
        applyGltfSurfaceDepthBias(mesh.material, backend);
      }
      const batches = createBatches(root, occurrences);
      batches.sync();
      const [batch] = batches.group.children;
      if (!(batch instanceof InstancedMesh)) {
        throw new Error('Expected an opaque batch');
      }
      expect(batch.count).toBe(50);
      expect(occurrences.slice(0, 50).every((mesh) => mesh.layers.mask === 1)).toBe(true);
      expect(batch.instanceMatrix.array.byteLength).toBe(64 * 100);
      const matrix = batch.instanceMatrix;
      for (const [index, mesh] of occurrences.entries()) {
        applyModelMaterialAppearance(mesh.material, snapshots[index]!, 1);
        applyGltfSurfaceDepthBias(mesh.material, backend);
      }
      batches.sync();
      expect(batches.group.children[0]).toBe(batch);
      expect(batch.instanceMatrix).toBe(matrix);
      expect(batch.count).toBe(100);
    },
  );

  it.each(['webgl', 'webgpu'] as const)(
    'should retain the real-bias batch through all-dim and restore on %s',
    (backend) => {
      const { root, occurrences } = fixture();
      const clip = createSectionClip(backend);
      const snapshots = occurrences.map(({ material }) => {
        applyGltfSurfaceDepthBias(material, backend);
        installSectionClip(material, clip);
        sealGltfSurfaceMaterial(material);
        return getOrCaptureModelMaterialAppearance(material);
      });
      const batches = createBatches(root, occurrences);
      batches.sync();
      const [batch] = batches.group.children;
      if (!(batch instanceof InstancedMesh)) {
        throw new Error('Expected an opaque batch');
      }
      const matrix = batch.instanceMatrix;
      for (const [index, mesh] of occurrences.entries()) {
        applyModelMaterialAppearance(mesh.material, snapshots[index]!, 0.25);
        applyGltfSurfaceDepthBias(mesh.material, backend);
      }
      batches.sync();
      expect(occurrences.every((mesh) => mesh.layers.mask === 1)).toBe(true);
      expect(batches.group.children[0]).toBe(batch);
      expect(batch.count).toBe(0);
      for (const [index, mesh] of occurrences.entries()) {
        applyModelMaterialAppearance(mesh.material, snapshots[index]!, 1);
        applyGltfSurfaceDepthBias(mesh.material, backend);
      }
      batches.sync();
      expect(batches.group.children[0]).toBe(batch);
      expect(batch.instanceMatrix).toBe(matrix);
      expect(batch.count).toBe(100);
    },
  );

  it('should batch shared opaque surfaces without replacing canonical identities or picking layers', () => {
    const { root, geometry, occurrences } = fixture();
    const batches = createBatches(root, occurrences);
    batches.sync();
    expect(batches.group.children).toHaveLength(1);
    const batch = batches.group.children[0]!;
    expect('count' in batch && batch.count).toBe(100);
    expect('geometry' in batch && batch.geometry).toBe(geometry);
    for (const [index, mesh] of occurrences.entries()) {
      expect(mesh.parent).toBe(root);
      expect(mesh.name).toBe(`component-${index}`);
      expect(mesh.visible).toBe(true);
      expect(mesh.layers.mask).toBe(0);
      expect(new Layers().test(getGltfOccurrenceLayers(mesh))).toBe(true);
      expect(mesh.material.name).toBe(`authored-${index}`);
    }
    batches.dispose();
  });

  it('should compact hiding and return dimmed, mirrored, morph and custom surfaces to direct submission', () => {
    const { root, occurrences } = fixture(5);
    const batches = createBatches(root, occurrences);
    batches.sync();
    occurrences[0]!.visible = false;
    occurrences[1]!.material.opacity = 0.2;
    occurrences[1]!.material.transparent = true;
    occurrences[2]!.scale.x = -1;
    occurrences[3]!.morphTargetInfluences = [1];
    occurrences[4]!.material = new MeshStandardMaterial();
    batches.sync();
    expect(batches.group.children.every((batch) => 'count' in batch && batch.count === 0)).toBe(true);
    expect(occurrences[0]!.visible).toBe(false);
    for (const mesh of occurrences.slice(1)) {
      expect(mesh.layers.mask).toBe(1);
    }
    occurrences[0]!.visible = true;
    batches.sync();
    expect(batches.group.children.some((batch) => 'count' in batch && batch.count === 1)).toBe(true);
    batches.dispose();
  });

  it('should split actual shading and object pass state while ignoring authored material labels', () => {
    const { root, occurrences } = fixture(6);
    occurrences[0]!.material.color.setHex(0xff_00_00);
    occurrences[1]!.renderOrder = 2;
    occurrences[2]!.frustumCulled = false;
    occurrences[3]!.layers.set(2);
    const batches = createBatches(root, occurrences);
    batches.sync();
    expect(batches.group.children).toHaveLength(1);
    for (const source of occurrences.slice(0, 4)) {
      expect(source.layers.mask).not.toBe(0);
    }
    batches.dispose();
    expect(occurrences[3]!.layers.mask).toBe(4);
  });

  it('should update changed pose slots and bounds with no geometry rewrite or unchanged upload', () => {
    const { root, geometry, occurrences } = fixture(3);
    const parent = new Group();
    parent.position.set(10, 20, 30);
    parent.add(root);
    const batches = createBatches(root, occurrences);
    batches.sync();
    const batch = batches.group.children[0]!;
    if (!(batch instanceof InstancedMesh)) {
      throw new Error('Expected an instance batch');
    }
    const attribute = batch.instanceMatrix;
    const { version } = attribute;
    batches.syncMatrices([occurrences[1]!]);
    expect(attribute.version).toBe(version);
    const position = geometry.getAttribute('position');
    occurrences[1]!.position.y = 50;
    batches.syncMatrices([occurrences[1]!]);
    expect(attribute.version).toBe(Number(version) + 1);
    expect(geometry.getAttribute('position')).toBe(position);
    const matrix = new Matrix4();
    batch.getMatrixAt(1, matrix);
    expect(matrix.elements[13]).toBe(50);
    expect(batch.boundingBox).toBeTruthy();
    batches.dispose();
  });

  it('should dispose owned instance buffers once and retain caller geometry and materials', () => {
    const { root, geometry, occurrences } = fixture(2);
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const batches = createBatches(root, occurrences);
    batches.sync();
    const batch = batches.group.children[0]!;
    const materialDispose = vi.spyOn(occurrences[0]!.material, 'dispose');
    const disposed = vi.fn();
    if (!(batch instanceof InstancedMesh)) {
      throw new Error('Expected an instance batch');
    }
    batch.addEventListener('dispose', disposed);
    batches.dispose();
    batches.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(batches.group.parent).toBeNull();
    expect(occurrences[0]!.layers.mask).toBe(1);
  });
  it('should retain linear matrix capacity across hidden and initially dimmed cohort membership', () => {
    const { root, occurrences } = fixture();
    for (const mesh of occurrences.slice(0, 50)) {
      mesh.material.transparent = true;
      mesh.material.opacity = 0.25;
      mesh.material.depthWrite = false;
    }
    const batches = createBatches(root, occurrences);
    batches.sync();
    const [batch] = batches.group.children;
    if (!(batch instanceof InstancedMesh)) {
      throw new Error('Expected a batch');
    }
    expect(batch.instanceMatrix.array.byteLength).toBe(64 * 100);
    expect(batch.count).toBe(50);
    const disposed = vi.fn();
    batch.addEventListener('dispose', disposed);
    for (const mesh of occurrences) {
      mesh.material.transparent = false;
      mesh.material.opacity = 1;
      mesh.material.depthWrite = true;
    }
    batches.sync();
    expect(batches.group.children[0]).toBe(batch);
    expect(batch.count).toBe(100);
    for (const [index, mesh] of occurrences.entries()) {
      mesh.material.color.setHex(index % 2 ? 0xff_00_00 : 0x00_ff_00);
    }
    batches.sync();
    expect(
      batches.group.children.reduce(
        (sum, child) => sum + (child instanceof InstancedMesh ? child.instanceMatrix.array.byteLength : 0),
        0,
      ),
    ).toBe(64 * 100);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('should fall back for later shader overrides and cyclic or accessor rendering values', () => {
    const { root, occurrences } = fixture(8);
    occurrences[0]!.material.onBeforeCompile = () => undefined;
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    Object.defineProperty(occurrences[1]!.material, 'unsafeRenderProperty', {
      value: cyclic,
      enumerable: true,
    });
    const getter = vi.fn(() => {
      throw new Error('Getter must not run');
    });
    Object.defineProperty(occurrences[2]!.material, 'unsafeRenderProperty', {
      get: getter,
      enumerable: true,
    });
    Object.defineProperty(occurrences[3]!.material, 'unsafeRenderProperty', {
      value: Number.NaN,
      enumerable: true,
    });
    const batches = createBatches(root, occurrences);
    batches.sync();
    expect(getter).not.toHaveBeenCalled();
    for (const mesh of occurrences.slice(0, 4)) {
      expect(mesh.layers.mask).toBe(1);
    }
    expect(batches.group.children).toHaveLength(1);
    const [batch] = batches.group.children;
    expect(batch instanceof InstancedMesh && batch.count).toBe(4);
  });

  it('should fall back for nonaffine and sheared placement while batching exact positive nonuniform scale', () => {
    const { root, occurrences } = fixture(4);
    occurrences[0]!.matrixAutoUpdate = false;
    occurrences[0]!.matrix.elements[3] = 0.1;
    occurrences[1]!.matrixAutoUpdate = false;
    occurrences[1]!.matrix.elements[4] = 0.2;
    occurrences[2]!.scale.set(2, 3, 4);
    occurrences[3]!.scale.set(1, 0.5, 5);
    const batches = createBatches(root, occurrences);
    batches.sync();
    expect(occurrences[0]!.layers.mask).toBe(1);
    expect(occurrences[1]!.layers.mask).toBe(1);
    expect(occurrences[2]!.layers.mask).toBe(0);
    expect(occurrences[3]!.layers.mask).toBe(0);
  });
});
