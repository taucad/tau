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
  InstancedInterleavedBuffer,
} from 'three';
import { attribute, mat4, vec4 } from 'three/tsl';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import {
  createGltfFatLineMaterial,
  getFatLinePrototypeSource,
  collectGltfFatLineMaterials,
} from '#graphics/three/materials/gltf-edges.js';
import { Line2NodeMaterial } from '#graphics/three/materials/line2.material.js';
import { sceneTag } from '#graphics/three/utils/scene-tags.js';
import type { GltfFatLineMaterial } from '#graphics/three/materials/gltf-edges.js';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';

/**
 * How an edge batch lays out its prototype segments and occurrence placements.
 *
 * - `occurrences`: occurrences are instances; every segment is unrolled into the 8 quad vertices with its
 *   endpoints copied onto each, so the prototype costs about 400 B per segment and an occurrence 64 B.
 * - `segments`: segments are instances that read the prototype's own endpoint array (24 B per segment on the GPU,
 *   nothing on the CPU); each occurrence unrolls one quad carrying its placement, about 700 B.
 *
 * @public
 */
export type EdgeBatchLayout = 'occurrences' | 'segments';

const quadVertices = 8;
const quadIndices = 18;

const indexBytes = (vertices: number): number => (vertices - 1 <= 65_534 ? 2 : 4);

/**
 * Resident bytes (CPU and GPU together) of an edge batch's own arrays in each layout. The `segments` layout shares
 * the prototype's endpoint array on the CPU, so its per-segment cost is the GPU copy alone.
 * @param segments - Prototype segment count.
 * @param capacity - Occurrence capacity.
 * @param layout - The layout to measure.
 * @returns The batch's resident bytes.
 * @public
 */
export function measureEdgeBatchBytes(segments: number, capacity: number, layout: EdgeBatchLayout): number {
  if (layout === 'occurrences') {
    const perSegment = quadVertices * (3 + 2 + 3 + 3) * 4 + quadIndices * indexBytes(segments * quadVertices);
    return 2 * (segments * perSegment + capacity * 16 * 4);
  }
  const perOccurrence = quadVertices * (3 + 2 + 16) * 4 + quadIndices * indexBytes(capacity * quadVertices);
  return segments * 6 * 4 + 2 * capacity * perOccurrence;
}

/**
 * The cheaper layout for a prototype: `segments` unless the occurrence table would outweigh the unrolled segments,
 * as for a few-segment fastener repeated thousands of times.
 * @param segments - Prototype segment count.
 * @param capacity - Occurrence capacity.
 * @returns The layout with fewer resident bytes.
 * @public
 */
export function selectEdgeBatchLayout(segments: number, capacity: number): EdgeBatchLayout {
  return measureEdgeBatchBytes(segments, capacity, 'segments') <=
    measureEdgeBatchBytes(segments, capacity, 'occurrences')
    ? 'segments'
    : 'occurrences';
}

const readEdgeBatchLayout = (geometry: InstancedBufferGeometry): EdgeBatchLayout =>
  geometry.getAttribute('tauOccurrence0') instanceof InstancedBufferAttribute ? 'occurrences' : 'segments';

/**
 * The number of occurrences an edge batch geometry can place.
 * @param geometry - A geometry from {@link createEdgePrototypeGeometry}.
 * @returns Its occurrence capacity.
 * @public
 */
export function getEdgeOccurrenceCapacity(geometry: InstancedBufferGeometry): number {
  const { count } = geometry.getAttribute('tauOccurrence0');
  return readEdgeBatchLayout(geometry) === 'occurrences' ? count : count / quadVertices;
}

/**
 * Draw the first `count` placed occurrences of an edge batch.
 * @param geometry - A geometry from {@link createEdgePrototypeGeometry}.
 * @param count - Occurrences to draw, at most the capacity.
 * @public
 */
export function setEdgeOccurrenceCount(geometry: InstancedBufferGeometry, count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > getEdgeOccurrenceCapacity(geometry)) {
    throw new TypeError('Invalid edge occurrence count');
  }
  if (readEdgeBatchLayout(geometry) === 'occurrences') {
    geometry.instanceCount = count;
  } else {
    geometry.setDrawRange(0, count * quadIndices);
  }
}

/**
 * The number of occurrences an edge batch draws.
 * @param geometry - A geometry from {@link createEdgePrototypeGeometry}.
 * @returns Its drawn occurrence count.
 * @public
 */
export function getEdgeOccurrenceCount(geometry: InstancedBufferGeometry): number {
  return readEdgeBatchLayout(geometry) === 'occurrences'
    ? geometry.instanceCount
    : Math.min(geometry.drawRange.count, geometry.index!.count) / quadIndices;
}

/**
 * One quad stream per edge prototype, laid out as {@link selectEdgeBatchLayout} chooses unless `layout` is given.
 * The `segments` layout reads `positions` in place, so the caller keeps that array unchanged while the batch lives.
 */
export function createEdgePrototypeGeometry(
  positions: Float32Array,
  capacity: number,
  layout: EdgeBatchLayout = selectEdgeBatchLayout(positions.length / 6, capacity),
): InstancedBufferGeometry {
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
  // Segment-major layouts repeat the quad per segment; occurrence-major ones repeat it per occurrence.
  const repeats = layout === 'occurrences' ? segments : capacity;
  for (const name of ['position', 'uv']) {
    const source = quad.getAttribute(name);
    const values = new Float32Array(source.array.length * repeats);
    for (let repeat = 0; repeat < repeats; repeat++) {
      values.set(source.array, repeat * source.array.length);
    }
    geometry.setAttribute(name, new Float32BufferAttribute(values, source.itemSize));
  }
  const indices =
    indexBytes(repeats * quadVertices) === 2
      ? new Uint16Array(quadIndices * repeats)
      : new Uint32Array(quadIndices * repeats);
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (let i = 0; i < quadIndices; i++) {
      indices[repeat * quadIndices + i] = quad.index!.getX(i) + repeat * quadVertices;
    }
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  if (layout === 'occurrences') {
    const starts = new Float32Array(segments * quadVertices * 3);
    const ends = new Float32Array(starts.length);
    for (let segment = 0; segment < segments; segment++) {
      for (let vertex = 0; vertex < quadVertices; vertex++) {
        starts.set(positions.subarray(segment * 6, segment * 6 + 3), (segment * quadVertices + vertex) * 3);
        ends.set(positions.subarray(segment * 6 + 3, segment * 6 + 6), (segment * quadVertices + vertex) * 3);
      }
    }
    geometry.setAttribute('instanceStart', new Float32BufferAttribute(starts, 3));
    geometry.setAttribute('instanceEnd', new Float32BufferAttribute(ends, 3));
    for (let column = 0; column < 4; column++) {
      geometry.setAttribute(
        `tauOccurrence${column}`,
        new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage),
      );
    }
    geometry.instanceCount = 0;
  } else {
    // The prototype's own endpoint stream, one instance per segment, as `LineSegmentsGeometry` lays it out.
    // The interleaved stride also keeps this layout's pipeline cache key apart from the `occurrences` one.
    const endpoints = Object.assign(new InstancedInterleavedBuffer(positions, 6, 1), { name: 'tau-edge-endpoints' });
    geometry.setAttribute('instanceStart', new InterleavedBufferAttribute(endpoints, 3, 0));
    geometry.setAttribute('instanceEnd', new InterleavedBufferAttribute(endpoints, 3, 3));
    for (let column = 0; column < 4; column++) {
      geometry.setAttribute(
        `tauOccurrence${column}`,
        new Float32BufferAttribute(new Float32Array(capacity * quadVertices * 4), 4).setUsage(DynamicDrawUsage),
      );
    }
    geometry.instanceCount = segments;
    geometry.setDrawRange(0, 0);
  }
  for (const [name, buffer] of Object.entries(geometry.attributes)) {
    buffer.name = `tau-edge-${name}`;
  }
  geometry.index!.name = 'tau-edge-index';
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
    slot >= getEdgeOccurrenceCapacity(geometry)
  ) {
    throw new TypeError('Invalid edge occurrence placement');
  }
  // An `occurrences` placement is one instance; a `segments` placement is repeated on its quad's 8 vertices.
  const vertices = readEdgeBatchLayout(geometry) === 'occurrences' ? 1 : quadVertices;
  for (let column = 0; column < 4; column++) {
    const buffer = geometry.getAttribute(`tauOccurrence${column}`) as BufferAttribute;
    const first = slot * vertices * 4;
    // Copied element by element: placements are written during drags, so no per-column array is made.
    for (let vertex = 0; vertex < vertices; vertex++) {
      for (let row = 0; row < 4; row++) {
        buffer.array[first + vertex * 4 + row] = matrix.elements[column * 4 + row]!;
      }
    }
    buffer.addUpdateRange(first, vertices * 4);
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
    /** Forces a layout; the cheaper one by default. */
    layout?: EdgeBatchLayout;
  }>,
): Mesh<InstancedBufferGeometry, GltfFatLineMaterial> {
  const { backend, resolution, color, layout } = options;
  const geometry = createEdgePrototypeGeometry(positions, capacity, layout);
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
  const slots = new Map<Mesh, { batch: EdgeBatch; slot: number } | 'canonical' | 'unsupported-transform'>();
  const affected = new Set<Mesh>();
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
      slots.set(source, 'canonical');
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
        // Fractional geometric coverage is not translucent material opacity.
        // Same-material edge cohorts blend the same color without depth writes,
        // so analytic coverage remains order independent within the cohort.
        (material.transparent &&
          !(
            material instanceof Line2NodeMaterial &&
            material.usesAnalyticCoverage &&
            !material.depthWrite &&
            !material.useViewportSrgbBlend
          )) ||
        material.opacity < 1
      ) {
        continue;
      }
      if (!valid(placement(source))) {
        slots.set(source, 'unsupported-transform');
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
        setEdgeOccurrenceCount(batch.mesh.geometry, 0);
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
          (getEdgeOccurrenceCapacity(batch.mesh.geometry) < list.length || batch.sourceVersion !== version)
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
        setEdgeOccurrenceCount(batch.mesh.geometry, list.length);
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
      if (disposed || changed.length === 0) {
        return;
      }
      root.updateWorldMatrix(true, false);
      for (const object of changed) {
        object.updateWorldMatrix(true, true);
      }
      inverseRoot.copy(root.matrixWorld).invert();
      affected.clear();
      for (const object of changed) {
        for (const source of descendants.get(object) ?? []) {
          affected.add(source);
        }
      }
      for (const source of affected) {
        const entry = slots.get(source);
        if (!entry) {
          sync();
          return;
        }
        if (entry === 'canonical') {
          continue;
        }
        const matrix = local.multiplyMatrices(inverseRoot, source.matrixWorld);
        const supported = valid(matrix);
        if (entry === 'unsupported-transform' && !supported) {
          continue;
        }
        if (entry === 'unsupported-transform' || !supported) {
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
      affected.clear();
    },
  };
}
