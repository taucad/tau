import { Box3, BufferAttribute, BufferGeometry, Matrix4, Quaternion, Sphere, Vector3 } from 'three';
import type { InterleavedBuffer, InterleavedBufferAttribute, Material, Object3D, Texture } from 'three';
import { parseGltfBytes, readTopologyPayload } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import type {
  GltfJson,
  GltfPrimitive,
  ParsedGltf,
} from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { deindexPositions, getFatLineSourceIndices } from '#components/geometry/graphics/three/materials/gltf-edges.js';

/** GlTF primitive mode for `LINES`. */
const linesMode = 1;
/** Component counts per glTF accessor type, for the types a Tau kernel emits. */
/* eslint-disable @typescript-eslint/naming-convention -- glTF accessor type names are the format's own identifiers. */
const componentsByType: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};
/* eslint-enable @typescript-eslint/naming-convention -- scope ends with the glTF constant. */
const componentTypeFloat = 5126;
const componentTypeUnsignedInt = 5125;
const componentTypeUnsignedShort = 5123;
const componentTypeUnsignedByte = 5121;
/** Bytes per component for the glTF component types a Tau kernel emits. */
const componentBytes: Record<number, number> = {
  [componentTypeFloat]: 4,
  [componentTypeUnsignedInt]: 4,
  [componentTypeUnsignedShort]: 2,
  [componentTypeUnsignedByte]: 1,
};

type IndexArray = Uint32Array | Uint16Array | Uint8Array<ArrayBuffer>;
type AccessorArray = Float32Array<ArrayBuffer> | IndexArray;

/**
 * The in-place path is an optimisation: bytes it cannot read are handed to the full presentation,
 * which owns reporting the failure.
 */
const isBufferGeometry = (value: unknown): value is BufferGeometry => value instanceof BufferGeometry;

function readGltf(bytes: Uint8Array<ArrayBuffer>): ParsedGltf | undefined {
  try {
    return parseGltfBytes(bytes);
  } catch {
    return undefined;
  }
}

type PrimitiveTarget = {
  /** The live geometry presented for this glTF primitive. */
  readonly geometry: BufferGeometry;
  /** De-indexed fat-line geometries take their vertices through {@link deindexPositions}. */
  readonly isLine: boolean;
  /** The LINES index buffer the presented fat line was de-indexed with. */
  readonly sourceIndices?: IndexArray;
  /** Accessor layout captured at presentation; equality is required before any write. */
  readonly descriptor: string;
};

/**
 * Everything the in-place path needs to decide whether the next result may be written into the
 * presented buffers, captured once per full presentation.
 */
export type InPlaceGeometryTargets = {
  readonly sceneSignature: string;
  readonly materialsSignature: string;
  readonly imageBytes: ReadonlyArray<Uint8Array<ArrayBuffer>>;
  readonly primitives: ReadonlyArray<readonly PrimitiveTarget[]>;
  readonly nodes: ReadonlyArray<{
    readonly nodeIndex: number;
    readonly object: Object3D;
    readonly sourceMatrix: Matrix4;
  }>;
};

/** Input for {@link captureInPlaceGeometryTargets}. */
export type CaptureInPlaceGeometryTargetsInput = {
  readonly scene: Object3D;
  /** `GLTFLoader` stores `undefined` for a cached material with no mapping of its own. */
  readonly associations: ReadonlyMap<
    Object3D | Material | Texture,
    { meshes?: number; primitives?: number; nodes?: number } | undefined
  >;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly parsed?: ParsedGltf;
};

function materialSignature(json: GltfJson): string {
  return JSON.stringify([json.materials ?? [], json.textures ?? [], json.samplers ?? [], json.images ?? []]);
}

/** Unmapped poses, hierarchy and identity changes retain the full presentation fallback. */
function sceneSignature({ json, bin }: ParsedGltf, movableNodes: ReadonlySet<number> = new Set()): string | undefined {
  try {
    const payload = readTopologyPayload(json, bin);
    return JSON.stringify([
      json.scene ?? 0,
      json.scenes ?? [],
      (json.nodes ?? []).map((node, nodeIndex) => {
        if (!movableNodes.has(nodeIndex)) {
          return node;
        }
        const structural = { ...node };
        delete structural.matrix;
        delete structural.translation;
        delete structural.rotation;
        delete structural.scale;
        return structural;
      }),
      (json.meshes ?? []).map((mesh) => [mesh.name, (mesh.primitives ?? []).map((primitive) => primitive.extras)]),
      (payload.components ?? []).map((component) => [
        component.id,
        component.name,
        component.kind,
        component.selector,
        component.nodeIndex,
        component.meshIndex,
        component.parentId,
        component.childIds,
        component.primitiveIndices,
        component.primitiveRefs,
      ]),
      payload.mechanism,
    ]);
  } catch {
    return undefined;
  }
}

function rigidNodeMatrix(node: NonNullable<GltfJson['nodes']>[number] | undefined): Matrix4 | undefined {
  if (!node) {
    return undefined;
  }
  const valid = (value: unknown, size: number): value is number[] =>
    Array.isArray(value) &&
    value.length === size &&
    value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate));
  const matrix = new Matrix4();
  if (node.matrix === undefined) {
    const translation = node.translation ?? [0, 0, 0];
    const rotation = node.rotation ?? [0, 0, 0, 1];
    const scale = node.scale ?? [1, 1, 1];
    if (!valid(translation, 3) || !valid(rotation, 4) || !valid(scale, 3)) {
      return undefined;
    }
    matrix.compose(
      new Vector3().fromArray(translation),
      new Quaternion().fromArray(rotation),
      new Vector3().fromArray(scale),
    );
  } else if (valid(node.matrix, 16)) {
    matrix.fromArray(node.matrix);
  } else {
    return undefined;
  }
  const { elements } = matrix;
  const x = new Vector3().setFromMatrixColumn(matrix, 0);
  const y = new Vector3().setFromMatrixColumn(matrix, 1);
  const z = new Vector3().setFromMatrixColumn(matrix, 2);
  return Math.abs(elements[3]) < 1e-6 &&
    Math.abs(elements[7]) < 1e-6 &&
    Math.abs(elements[11]) < 1e-6 &&
    Math.abs(elements[15] - 1) < 1e-6 &&
    [x, y, z].every((axis) => Math.abs(axis.length() - 1) < 1e-12) &&
    Math.abs(x.dot(y)) < 1e-6 &&
    Math.abs(y.dot(z)) < 1e-6 &&
    Math.abs(z.dot(x)) < 1e-6 &&
    x.clone().cross(y).dot(z) > 1 - 1e-6
    ? matrix
    : undefined;
}

function readImages({ json, bin }: ParsedGltf): Array<Uint8Array<ArrayBuffer>> | undefined {
  const images: Array<Uint8Array<ArrayBuffer>> = [];
  for (const image of json.images ?? []) {
    const view = image.bufferView === undefined ? undefined : json.bufferViews?.[image.bufferView];
    if (
      !view ||
      ('buffer' in view && view.buffer !== 0) ||
      !Number.isSafeInteger(view.byteOffset ?? 0) ||
      (view.byteOffset ?? 0) < 0 ||
      !Number.isSafeInteger(view.byteLength) ||
      view.byteLength < 0 ||
      (view.byteOffset ?? 0) + view.byteLength > bin.byteLength
    ) {
      // External resources have no immutable bytes to compare; use the full loader path.
      return undefined;
    }
    images.push(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
  }
  return images;
}

function describePrimitive(json: GltfJson, primitive: GltfPrimitive): string {
  const accessors = json.accessors ?? [];
  const attributes = Object.entries(primitive.attributes ?? {})
    .map(([name, index]) => {
      const accessor = accessors[index];
      return `${name}:${accessor?.count ?? -1}:${accessor?.componentType ?? -1}:${accessor?.type ?? ''}:${accessor && 'normalized' in accessor ? Boolean(accessor.normalized) : false}`;
    })
    .sort()
    .join(',');
  const indices = primitive.indices === undefined ? undefined : accessors[primitive.indices];
  return `${primitive.mode ?? 4}|${primitive.material ?? -1}|${attributes}|${indices?.count ?? -1}:${indices?.componentType ?? -1}`;
}

function readAccessor(json: GltfJson, bin: Uint8Array<ArrayBuffer>, accessorIndex?: number): AccessorArray | undefined {
  const accessor = accessorIndex === undefined ? undefined : json.accessors?.[accessorIndex];
  const bufferView = accessor?.bufferView === undefined ? undefined : json.bufferViews?.[accessor.bufferView];
  const components = componentsByType[accessor?.type ?? ''];
  if (
    !accessor ||
    !bufferView ||
    components === undefined ||
    'sparse' in accessor ||
    ('buffer' in bufferView && bufferView.buffer !== 0)
  ) {
    return undefined;
  }

  const elements = accessor.count * components;
  const bytesPerComponent = componentBytes[accessor.componentType];
  if (
    bytesPerComponent === undefined ||
    (bufferView.byteStride !== undefined && bufferView.byteStride !== bytesPerComponent * components)
  ) {
    // Interleaved or unknown storage: the caller falls back to a full presentation.
    return undefined;
  }

  const start = bin.byteOffset + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const byteLength = elements * bytesPerComponent;
  if (
    !Number.isSafeInteger(accessor.count) ||
    accessor.count < 0 ||
    !Number.isSafeInteger(bufferView.byteOffset ?? 0) ||
    (bufferView.byteOffset ?? 0) < 0 ||
    !Number.isSafeInteger(accessor.byteOffset ?? 0) ||
    (accessor.byteOffset ?? 0) < 0 ||
    !Number.isSafeInteger(bufferView.byteLength) ||
    bufferView.byteLength < 0 ||
    (accessor.byteOffset ?? 0) + byteLength > bufferView.byteLength ||
    start + byteLength > bin.byteOffset + bin.byteLength
  ) {
    return undefined;
  }
  // A misaligned accessor cannot be viewed directly; copying it is rare and still cheaper than a reparse.
  const aligned =
    start % bytesPerComponent === 0
      ? { buffer: bin.buffer, offset: start }
      : {
          buffer: new Uint8Array(bin.buffer, start, byteLength).slice().buffer,
          offset: 0,
        };

  switch (accessor.componentType) {
    case componentTypeFloat: {
      return new Float32Array(aligned.buffer, aligned.offset, elements);
    }
    case componentTypeUnsignedInt: {
      return new Uint32Array(aligned.buffer, aligned.offset, elements);
    }
    case componentTypeUnsignedShort: {
      return new Uint16Array(aligned.buffer, aligned.offset, elements);
    }
    default: {
      return new Uint8Array(aligned.buffer, aligned.offset, elements);
    }
  }
}

function sameElements(left: ArrayLike<number> | undefined, right: ArrayLike<number> | undefined): boolean {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  // The topology proof runs over every index of every result, so it uses the cheapest form there is
  // and bails on the first difference.
  // oxlint-disable-next-line unicorn-js/no-for-loop -- Indexed typed-array compare, see above.
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function setBoundsFromAccessor(json: GltfJson, geometry: BufferGeometry, positionAccessorIndex?: number): void {
  const accessor = positionAccessorIndex === undefined ? undefined : json.accessors?.[positionAccessorIndex];
  const { min, max } = accessor ?? {};
  if (min?.length === 3 && max?.length === 3) {
    geometry.boundingBox = new Box3(new Vector3(min[0], min[1], min[2]), new Vector3(max[0], max[1], max[2]));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());
    return;
  }
  geometry.boundingBox = null;
  geometry.boundingSphere = null;
}

function writableAttribute(geometry: BufferGeometry, name: string, values: AccessorArray): BufferAttribute | undefined {
  const attribute = geometry.getAttribute(name);
  return attribute instanceof BufferAttribute && attribute.array.length === values.length ? attribute : undefined;
}

type PrimitiveUpdate = {
  readonly json: GltfJson;
  readonly bin: Uint8Array<ArrayBuffer>;
  readonly primitive: GltfPrimitive;
  readonly target: PrimitiveTarget;
};

function planSurfaceUpdate({ json, bin, primitive, target }: PrimitiveUpdate): (() => void) | undefined {
  const indices = readAccessor(json, bin, primitive.indices);
  const presentedIndices = target.geometry.index?.array;
  if (primitive.indices !== undefined && !sameElements(indices, presentedIndices)) {
    return undefined;
  }

  const writes: Array<[BufferAttribute, AccessorArray]> = [];
  for (const [name, accessorIndex] of Object.entries(primitive.attributes ?? {})) {
    const values = readAccessor(json, bin, accessorIndex);
    const attribute =
      values &&
      writableAttribute(
        target.geometry,
        name === 'TEXCOORD_0'
          ? 'uv'
          : name.startsWith('TEXCOORD_')
            ? `uv${name.slice(9)}`
            : name === 'COLOR_0'
              ? 'color'
              : name.toLowerCase(),
        values,
      );
    if (!values || !attribute) {
      return undefined;
    }
    if (!sameElements(values, attribute.array)) {
      writes.push([attribute, values]);
    }
  }

  return () => {
    for (const [attribute, values] of writes) {
      (attribute.array as Float32Array).set(values as Float32Array);
      attribute.needsUpdate = true;
    }
    if (writes.some(([attribute]) => attribute === target.geometry.getAttribute('position'))) {
      setBoundsFromAccessor(json, target.geometry, primitive.attributes?.['POSITION']);
    }
  };
}

function planLineUpdate({ json, bin, primitive, target }: PrimitiveUpdate): (() => void) | undefined {
  if (!target.geometry.attributes['instanceStart']) {
    return planSurfaceUpdate({ json, bin, primitive, target });
  }
  const indices = readAccessor(json, bin, primitive.indices);
  if (primitive.indices !== undefined && !sameElements(indices, target.sourceIndices)) {
    return undefined;
  }

  const positions = readAccessor(json, bin, primitive.attributes?.['POSITION']);
  const start = target.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute | undefined;
  const buffer: InterleavedBuffer | undefined = start?.data;
  if (!(positions instanceof Float32Array) || !buffer) {
    return undefined;
  }
  const segmentPositions =
    indices === undefined ? positions : deindexPositions(positions, indices as Uint32Array | Uint16Array);
  if (buffer.array.length !== segmentPositions.length) {
    return undefined;
  }

  if (sameElements(segmentPositions, buffer.array)) {
    return () => undefined;
  }

  return () => {
    if (!sameElements(segmentPositions, buffer.array)) {
      (buffer.array as Float32Array).set(segmentPositions);
      buffer.needsUpdate = true;
      target.geometry.computeBoundingBox();
      target.geometry.computeBoundingSphere();
    }
  };
}

/**
 * Snapshot the presented scene against the glTF it was parsed from, so a later result with the same
 * topology can be written straight into these buffers (D22).
 *
 * Returns `undefined` when any primitive in the glTF has no presented geometry — the in-place path is
 * then unavailable for this presentation and every result takes the full path.
 */
export function captureInPlaceGeometryTargets({
  scene,
  associations,
  bytes,
  parsed: suppliedParsed,
}: CaptureInPlaceGeometryTargetsInput): InPlaceGeometryTargets | undefined {
  const parsed = suppliedParsed ?? readGltf(bytes);
  if (!parsed) {
    return undefined;
  }
  const { json } = parsed;
  const imageBytes = readImages(parsed);
  if (!imageBytes) {
    return undefined;
  }
  const presentedObjects = new Set<Object3D>();
  scene.traverse((object) => {
    presentedObjects.add(object);
  });
  const nodes: Array<{ nodeIndex: number; object: Object3D; sourceMatrix: Matrix4 }> = [];
  for (const [object, association] of associations) {
    if ('isObject3D' in object && presentedObjects.has(object) && association?.nodes !== undefined) {
      const matrix = rigidNodeMatrix(json.nodes?.[association.nodes]);
      if (matrix) {
        nodes.push({ nodeIndex: association.nodes, object, sourceMatrix: matrix });
      }
    }
  }
  const signature = sceneSignature(parsed, new Set(nodes.map(({ nodeIndex }) => nodeIndex)));
  if (signature === undefined) {
    return undefined;
  }
  const objectsByAddress = new Map<string, Object3D[]>();
  for (const [object, association] of associations) {
    if (
      !('isObject3D' in object) ||
      !presentedObjects.has(object) ||
      association?.meshes === undefined ||
      association.primitives === undefined
    ) {
      continue;
    }
    const address = `${association.meshes}/${association.primitives}`;
    const objects = objectsByAddress.get(address) ?? [];
    objects.push(object);
    objectsByAddress.set(address, objects);
  }

  const primitives: PrimitiveTarget[][] = [];
  const geometryOwners = new Map<BufferGeometry, string>();
  const storageRanges = new Map<ArrayBufferLike, Array<{ start: number; end: number; owner: string }>>();
  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
      const address = `${meshIndex}/${primitiveIndex}`;
      const objects = objectsByAddress.get(address);
      if (!objects?.length) {
        return undefined;
      }
      const targets: PrimitiveTarget[] = [];
      for (const object of objects) {
        if (!('geometry' in object) || !isBufferGeometry(object.geometry)) {
          return undefined;
        }
        const { geometry } = object;
        const owner = geometryOwners.get(geometry);
        if (owner === address) {
          continue;
        }
        if (owner !== undefined) {
          // One mutable geometry cannot accept different primitive data. Use the full loader path.
          return undefined;
        }
        geometryOwners.set(geometry, address);
        for (const [name, attribute] of [
          ...Object.entries(geometry.attributes),
          ...(geometry.index ? [['index', geometry.index] as const] : []),
        ]) {
          const array = 'data' in attribute ? attribute.data.array : attribute.array;
          const ranges = storageRanges.get(array.buffer) ?? [];
          const semantic = primitive.mode === linesMode && 'data' in attribute ? 'line-segments' : name;
          ranges.push({
            start: array.byteOffset,
            end: array.byteOffset + array.byteLength,
            owner: `${address}/${semantic}`,
          });
          storageRanges.set(array.buffer, ranges);
        }
        const isLine = primitive.mode === linesMode;
        // A fat line's own index belongs to the instanced quad, never to the source segments, so the
        // de-indexed replacement is the only admissible source there.
        const isFatLine = 'instanceStart' in geometry.attributes;
        const sourceIndices = isLine
          ? isFatLine
            ? getFatLineSourceIndices(object)
            : (geometry.index?.array as IndexArray | undefined)
          : undefined;
        if (isLine && primitive.indices !== undefined && !sourceIndices) {
          return undefined;
        }
        targets.push({
          geometry,
          isLine,
          sourceIndices,
          descriptor: describePrimitive(json, primitive),
        });
      }
      primitives.push(targets);
    }
  }

  // GLTFLoader can cache one accessor across material-split primitives with distinct geometries.
  // Different primitive writes may diverge later, so overlapping mutable storage uses the full path.
  for (const ranges of storageRanges.values()) {
    ranges.sort((left, right) => left.start - right.start);
    let previous: (typeof ranges)[number] | undefined;
    for (const range of ranges) {
      if (previous && range.start < previous.end && range.owner !== previous.owner) {
        return undefined;
      }
      if (!previous || range.end > previous.end) {
        previous = range;
      }
    }
  }

  return {
    sceneSignature: signature,
    materialsSignature: materialSignature(json),
    imageBytes,
    primitives,
    nodes,
  };
}

/**
 * Write `bytes` into the buffers {@link captureInPlaceGeometryTargets} recorded, when every primitive
 * still has the same index buffer, accessor layout and material as the presented one.
 *
 * Nothing is mutated unless every primitive validates, so a `false` return leaves the presented scene
 * exactly as it was and the caller presents the result the full way.
 */
export function applyInPlaceGeometryUpdate(
  targets: InPlaceGeometryTargets,
  bytes: Uint8Array<ArrayBuffer>,
  suppliedParsed?: ParsedGltf,
): boolean {
  const parsed = suppliedParsed ?? readGltf(bytes);
  if (!parsed) {
    return false;
  }
  const { json, bin } = parsed;
  const imageBytes = readImages(parsed);
  if (
    sceneSignature(parsed, new Set(targets.nodes.map(({ nodeIndex }) => nodeIndex))) !== targets.sceneSignature ||
    materialSignature(json) !== targets.materialsSignature ||
    !imageBytes ||
    imageBytes.length !== targets.imageBytes.length ||
    imageBytes.some((bytes, index) => !sameElements(bytes, targets.imageBytes[index]))
  ) {
    return false;
  }

  const writes: Array<() => void> = [];
  for (const { nodeIndex, object, sourceMatrix } of targets.nodes) {
    const matrix = rigidNodeMatrix(json.nodes?.[nodeIndex]);
    if (!matrix) {
      return false;
    }
    if (!matrix.equals(sourceMatrix)) {
      writes.push(() => {
        matrix.decompose(object.position, object.quaternion, object.scale);
        object.updateMatrix();
        object.updateWorldMatrix(true, true);
        sourceMatrix.copy(matrix);
      });
    }
  }
  let primitiveCount = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const primitiveTargets = targets.primitives[primitiveCount++];
      if (!primitiveTargets) {
        return false;
      }
      for (const target of primitiveTargets) {
        if (describePrimitive(json, primitive) !== target.descriptor) {
          return false;
        }
        const update = { json, bin, primitive, target };
        const write = target.isLine ? planLineUpdate(update) : planSurfaceUpdate(update);
        if (!write) {
          return false;
        }
        writes.push(write);
      }
    }
  }
  if (primitiveCount !== targets.primitives.length) {
    return false;
  }

  for (const write of writes) {
    write();
  }
  return true;
}
