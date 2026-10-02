import type { Vector2, Object3D, BufferGeometry, Material } from 'three';
import {
  Float32BufferAttribute,
  BufferAttribute,
  InstancedBufferAttribute,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  Group,
  InterleavedBufferAttribute,
} from 'three';
import { attribute, mat4, vec4 } from 'three/tsl';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import {
  createGltfFatLineMaterial,
  getFatLinePrototypeSource,
  collectGltfFatLineMaterials,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { Line2NodeMaterial } from '#components/geometry/graphics/three/materials/line2.material.js';
import { sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';
import type { GltfFatLineMaterial } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';

/** One immutable quad stream per edge prototype; the instance dimension contains occurrences. */
export function createEdgePrototypeGeometry(positions: Float32Array, capacity: number): InstancedBufferGeometry {
  if (
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    positions.length === 0 ||
    positions.length % 6 !== 0 ||
    !positions.every((value) => Number.isFinite(value))
  ) {
    throw new TypeError('Edge batching requires complete finite segments and positive occurrence capacity');
  }
  const quad = new LineSegmentsGeometry();
  const geometry = new InstancedBufferGeometry();
  const segments = positions.length / 6;
  for (const name of ['position', 'uv']) {
    const source = quad.getAttribute(name);
    const values = new Float32Array(source.array.length * segments);
    for (let segment = 0; segment < segments; segment++) {
      values.set(source.array, segment * source.array.length);
    }
    geometry.setAttribute(name, new Float32BufferAttribute(values, source.itemSize));
  }
  const indices =
    segments * 8 - 1 <= 65_534
      ? new Uint16Array(quad.index!.count * segments)
      : new Uint32Array(quad.index!.count * segments);
  const starts = new Float32Array(segments * 8 * 3);
  const ends = new Float32Array(starts.length);
  for (let segment = 0; segment < segments; segment++) {
    for (let i = 0; i < quad.index!.count; i++) {
      indices[segment * quad.index!.count + i] = quad.index!.getX(i) + segment * 8;
    }
    for (let vertex = 0; vertex < 8; vertex++) {
      starts.set(positions.subarray(segment * 6, segment * 6 + 3), (segment * 8 + vertex) * 3);
      ends.set(positions.subarray(segment * 6 + 3, segment * 6 + 6), (segment * 8 + vertex) * 3);
    }
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setAttribute('instanceStart', new Float32BufferAttribute(starts, 3));
  geometry.setAttribute('instanceEnd', new Float32BufferAttribute(ends, 3));
  for (let column = 0; column < 4; column++) {
    geometry.setAttribute(
      `tauOccurrence${column}`,
      new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage),
    );
  }
  for (const [name, buffer] of Object.entries(geometry.attributes)) {
    buffer.name = `tau-edge-${name}`;
  }
  geometry.index!.name = 'tau-edge-index';
  geometry.instanceCount = 0;
  quad.dispose();
  return geometry;
}

/** Reuses the existing fat-line coverage, trim, depth and theme factory in both backends. */
export function createEdgeBatchMaterial(
  backend: ResolvedGraphicsBackend,
  resolution: Vector2,
  color: number,
): GltfFatLineMaterial {
  const material = createGltfFatLineMaterial({
    backend,
    resolution,
    edgeColor: color,
  });
  if (material instanceof Line2NodeMaterial) {
    const placement = mat4(
      attribute<'vec4'>('tauOccurrence0', 'vec4'),
      attribute<'vec4'>('tauOccurrence1', 'vec4'),
      attribute<'vec4'>('tauOccurrence2', 'vec4'),
      attribute<'vec4'>('tauOccurrence3', 'vec4'),
    );
    material.edgeStartNode = placement.mul(vec4(attribute<'vec3'>('instanceStart', 'vec3'), 1)).xyz;
    material.edgeEndNode = placement.mul(vec4(attribute<'vec3'>('instanceEnd', 'vec3'), 1)).xyz;
  } else {
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      const start = 'vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );';
      const end = 'vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );';
      if (shader.vertexShader.split(start).length !== 2 || shader.vertexShader.split(end).length !== 2) {
        throw new Error('Three LineMaterial endpoint anchors changed');
      }
      shader.vertexShader = shader.vertexShader
        .replace(
          'void main() {',
          'attribute vec4 tauOccurrence0; attribute vec4 tauOccurrence1; attribute vec4 tauOccurrence2; attribute vec4 tauOccurrence3;\nvoid main() {\nmat4 tauOccurrence = mat4(tauOccurrence0, tauOccurrence1, tauOccurrence2, tauOccurrence3);',
        )
        .replace(start, 'vec4 start = modelViewMatrix * tauOccurrence * vec4(instanceStart, 1.0);')
        .replace(end, 'vec4 end = modelViewMatrix * tauOccurrence * vec4(instanceEnd, 1.0);');
    };
    material.customProgramCacheKey = () => 'tau-edge-occurrence-v1';
  }
  return material;
}

/** Populate only the O(N) placement table; never rewrite prototype endpoints. */
export function writeEdgePlacement(geometry: InstancedBufferGeometry, slot: number, matrix: Matrix4): void {
  if (
    !matrix.elements.every((value) => Number.isFinite(value)) ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= geometry.getAttribute('tauOccurrence0').count
  ) {
    throw new TypeError('Invalid edge occurrence placement');
  }
  for (let column = 0; column < 4; column++) {
    const buffer = geometry.getAttribute(`tauOccurrence${column}`) as InstancedBufferAttribute;
    buffer.array.set(matrix.elements.slice(column * 4, column * 4 + 4), slot * 4);
    buffer.addUpdateRange(slot * 4, 4);
    buffer.needsUpdate = true;
  }
}

/** Rendering primitive; canonical hierarchy, identity, visibility and picking stay with sources. */
export function createEdgeBatch(
  positions: Float32Array,
  capacity: number,
  options: Readonly<{
    backend: ResolvedGraphicsBackend;
    resolution: Vector2;
    color: number;
  }>,
): Mesh<InstancedBufferGeometry, GltfFatLineMaterial> {
  const { backend, resolution, color } = options;
  const geometry = createEdgePrototypeGeometry(positions, capacity);
  const mesh = new Mesh(geometry, createEdgeBatchMaterial(backend, resolution, color));
  Object.defineProperty(mesh, 'type', { value: 'LineSegments2' });
  mesh.userData[sceneTag.gltfSurfacePresentation] = true;
  mesh.frustumCulled = false;
  mesh.raycast = () => undefined;
  return mesh;
}

type EdgeBatch = {
  mesh: ReturnType<typeof createEdgeBatch>;
  sources: Mesh[];
  matrices: Matrix4[];
  sourceVersion: number;
};

/** Event-driven private cohorts use the aggregate presentation owner's existing layer registry. */
export function createGltfEdgeBatches(
  root: Object3D,
  sources: readonly Mesh[],
  options: Readonly<{
    backend: ResolvedGraphicsBackend;
    resolution: Vector2;
    hooks: Readonly<{
      restore: (source: Mesh) => void;
      suppress: (source: Mesh) => void;
      prepareMaterial: (material: Material) => void;
    }>;
  }>,
): Readonly<{
  group: Group;
  sync: () => void;
  syncMatrices: (changed: readonly Object3D[]) => void;
  dispose: () => void;
}> {
  const { backend, resolution, hooks } = options;
  const group = new Group();
  group.userData[sceneTag.gltfSurfacePresentation] = true;
  root.add(group);
  const cohorts = new Map<BufferGeometry, Map<string, EdgeBatch>>();
  const inverseRoot = new Matrix4();
  const local = new Matrix4();
  const descendants = new Map<Object3D, Set<Mesh>>();
  const slots = new Map<Mesh, { batch: EdgeBatch; slot: number }>();
  let disposed = false;
  for (const source of sources) {
    for (
      let current: Object3D | undefined = source;
      current && current !== root.parent;
      current = current.parent ?? undefined
    ) {
      const members = descendants.get(current) ?? new Set<Mesh>();
      members.add(source);
      descendants.set(current, members);
    }
  }
  const placement = (source: Mesh) => {
    source.updateWorldMatrix(true, false);
    return local.multiplyMatrices(inverseRoot, source.matrixWorld);
  };
  const valid = (matrix: Matrix4) =>
    matrix.elements.every((value) => Number.isFinite(value)) &&
    matrix.elements[3] === 0 &&
    matrix.elements[7] === 0 &&
    matrix.elements[11] === 0 &&
    matrix.elements[15] === 1 &&
    matrix.determinant() !== 0;
  const visible = (source: Object3D) => {
    for (let current: Object3D | undefined = source; current; current = current.parent ?? undefined) {
      if (!current.visible) {
        return false;
      }
    }
    return true;
  };
  const sync = () => {
    if (disposed) {
      return;
    }
    root.updateWorldMatrix(true, false);
    inverseRoot.copy(root.matrixWorld).invert();
    slots.clear();
    const members = new Map<BufferGeometry, Map<string, Mesh[]>>();
    for (const source of sources) {
      hooks.restore(source);
      const prototype = getFatLinePrototypeSource(source);
      const material = Array.isArray(source.material) ? undefined : source.material;
      const known = collectGltfFatLineMaterials(source);
      if (
        !prototype ||
        !material ||
        !known.includes(material as GltfFatLineMaterial) ||
        !visible(source) ||
        !material.visible ||
        material.transparent ||
        material.opacity < 1 ||
        !valid(placement(source))
      ) {
        continue;
      }
      const byMaterial = members.get(prototype) ?? new Map<string, Mesh[]>();
      members.set(prototype, byMaterial);
      const key = JSON.stringify([material.uuid, source.layers.mask, source.renderOrder]);
      const list = byMaterial.get(key) ?? [];
      list.push(source);
      byMaterial.set(key, list);
    }
    for (const byMaterial of cohorts.values()) {
      for (const batch of byMaterial.values()) {
        batch.mesh.visible = false;
        batch.mesh.geometry.instanceCount = 0;
      }
    }
    for (const [prototype, byMaterial] of members) {
      for (const [key, list] of byMaterial) {
        const source = list[0];
        if (!source || list.length < 2) {
          continue;
        }
        const material = source.material as GltfFatLineMaterial;
        const endpoint = source.geometry.getAttribute('instanceStart');
        if (
          !(endpoint instanceof InterleavedBufferAttribute) ||
          !(endpoint.data.array instanceof Float32Array) ||
          endpoint.data.stride !== 6 ||
          endpoint.offset !== 0
        ) {
          continue;
        }
        const { version } = endpoint.data;
        const existing = cohorts.get(prototype) ?? new Map<string, EdgeBatch>();
        cohorts.set(prototype, existing);
        let batch = existing.get(key);
        if (
          batch &&
          (batch.mesh.geometry.getAttribute('tauOccurrence0').count < list.length || batch.sourceVersion !== version)
        ) {
          batch.mesh.removeFromParent();
          batch.mesh.geometry.dispose();
          batch.mesh.material.dispose();
          existing.delete(key);
          batch = undefined;
        }
        if (!batch) {
          const mesh = createEdgeBatch(endpoint.data.array, list.length, {
            backend,
            resolution,
            color: material.color.getHex(),
          });
          hooks.prepareMaterial(mesh.material);
          group.add(mesh);
          batch = { mesh, sources: [], matrices: [], sourceVersion: version };
          existing.set(key, batch);
        }
        batch.mesh.material.color.copy(material.color);
        batch.mesh.material.depthTest = material.depthTest;
        batch.mesh.material.depthWrite = material.depthWrite;
        batch.mesh.material.linewidth = material.linewidth;
        if ('resolution' in batch.mesh.material && 'resolution' in material) {
          batch.mesh.material.resolution.copy(material.resolution);
        }
        batch.mesh.renderOrder = source.renderOrder;
        batch.mesh.layers.mask = source.layers.mask;
        batch.mesh.visible = true;
        batch.mesh.geometry.instanceCount = list.length;
        for (const [slot, source] of list.entries()) {
          const matrix = placement(source);
          if (batch.sources[slot] !== source || !batch.matrices[slot]?.equals(matrix)) {
            writeEdgePlacement(batch.mesh.geometry, slot, matrix);
            (batch.matrices[slot] ??= new Matrix4()).copy(matrix);
          }
          hooks.suppress(source);
          slots.set(source, { batch, slot });
        }
        batch.sources = list;
      }
    }
  };
  return {
    group,
    sync,
    syncMatrices(changed: readonly Object3D[]): void {
      if (disposed) {
        return;
      }
      root.updateWorldMatrix(true, false);
      inverseRoot.copy(root.matrixWorld).invert();
      for (const source of new Set(changed.flatMap((node) => [...(descendants.get(node) ?? [])]))) {
        const entry = slots.get(source);
        if (!entry) {
          sync();
          return;
        }
        const matrix = placement(source);
        if (!valid(matrix)) {
          sync();
          return;
        }
        const previous = entry.batch.matrices[entry.slot];
        if (previous?.equals(matrix)) {
          continue;
        }
        writeEdgePlacement(entry.batch.mesh.geometry, entry.slot, matrix);
        (entry.batch.matrices[entry.slot] ??= new Matrix4()).copy(matrix);
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const source of sources) {
        hooks.restore(source);
      }
      for (const byMaterial of cohorts.values()) {
        for (const batch of byMaterial.values()) {
          batch.mesh.geometry.dispose();
          batch.mesh.material.dispose();
        }
      }
      group.removeFromParent();
      cohorts.clear();
      slots.clear();
      descendants.clear();
    },
  };
}
