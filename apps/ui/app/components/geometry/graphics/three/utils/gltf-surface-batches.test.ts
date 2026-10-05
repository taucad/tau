import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Layers, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import {
  createGltfSurfaceBatches,
  getGltfOccurrenceLayers,
  qualifyGltfSurfaceMaterial,
} from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';

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

  it('should retain existing canonical instances with all slots and parent transforms while batching ordinary meshes', () => {
    const { root, geometry, occurrences } = fixture(2);
    const parent = new Group();
    parent.position.set(3, -2, 1);
    parent.rotation.z = 0.3;
    parent.scale.setScalar(1.25);
    root.add(parent);
    const instances = [2, 3].map((count, index) => {
      const material = occurrences[index]?.material;
      if (!material) {
        throw new Error('Expected qualified ordinary fixture material');
      }
      const source = new InstancedMesh(geometry, material, count);
      source.position.set(index * 4 - 2, 1, 0);
      source.rotation.z = -0.2;
      for (let slot = 0; slot < count; slot++) {
        const matrix = new Matrix4().makeRotationZ(slot * 0.15);
        matrix.setPosition(slot * 2 - 1, slot + 0.5, 0);
        source.setMatrixAt(slot, matrix);
      }
      parent.add(source);
      cleanup.push(() => {
        source.dispose();
      });
      return source;
    });
    const nativeBuffers = instances.map((source) => source.instanceMatrix);
    const nativeMatrices = instances.map((source) => [...source.instanceMatrix.array]);
    const nativeDisposal = instances.map((source) => vi.spyOn(source, 'dispose'));
    for (const source of instances) {
      expect(source.type).toBe('Mesh');
      expect(source.isInstancedMesh).toBe(true);
    }
    const batches = createBatches(root, [...occurrences, ...instances]);
    batches.sync();
    for (const source of instances) {
      expect(source.layers.mask).toBe(1);
      expect(source.parent).toBe(parent);
    }
    const [batch] = batches.group.children;
    if (!(batch instanceof InstancedMesh)) {
      throw new Error('Expected the ordinary two-mesh presentation batch');
    }
    expect(batches.group.children).toHaveLength(1);
    expect(batch.count).toBe(2);
    expect(occurrences.map((source) => source.layers.mask)).toEqual([0, 0]);
    parent.position.y += 7;
    parent.rotation.z += 0.2;
    batches.syncMatrices([parent]);
    batches.sync();
    expect(instances.map((source) => source.instanceMatrix)).toEqual(nativeBuffers);
    expect(instances.map((source) => [...source.instanceMatrix.array])).toEqual(nativeMatrices);
    expect(instances.map((source) => source.layers.mask)).toEqual([1, 1]);
    expect(batch.count).toBe(2);
    batches.dispose();
    expect(occurrences.map((source) => source.layers.mask)).toEqual([1, 1]);
    for (const dispose of nativeDisposal) {
      expect(dispose).not.toHaveBeenCalled();
    }
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
