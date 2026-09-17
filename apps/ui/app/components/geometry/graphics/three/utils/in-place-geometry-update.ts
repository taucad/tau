import { Box3, BufferAttribute, Sphere, Vector3 } from 'three';
import type { BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute, Mesh, Object3D } from 'three';
import { parseGltfBytes } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import type {
  GltfJson,
  GltfPrimitive,
  ParsedGltf,
} from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { deindexPositions, getFatLineSourceIndices } from '#components/geometry/graphics/three/materials/gltf-edges.js';

/** GlTF primitive mode for `LINES`. */
const linesMode = 1;
/** Component counts per glTF accessor type, for the types a Tau kernel emits. */
const componentsByType: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
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

type IndexArray = Uint32Array<ArrayBufferLike> | Uint16Array<ArrayBufferLike> | Uint8Array<ArrayBuffer>;
type AccessorArray = Float32Array<ArrayBuffer> | IndexArray;

/**
 * The in-place path is an optimisation: bytes it cannot read are handed to the full presentation,
 * which owns reporting the failure.
 */
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
  readonly materialsSignature: string;
  readonly primitives: readonly PrimitiveTarget[];
};

/** Input for {@link captureInPlaceGeometryTargets}. */
export type CaptureInPlaceGeometryTargetsInput = {
  readonly scene: Object3D;
  /** `GLTFLoader` stores `undefined` for a cached material with no mapping of its own. */
  readonly associations: ReadonlyMap<Object3D, { meshes?: number; primitives?: number } | undefined>;
  readonly bytes: Uint8Array<ArrayBuffer>;
};

function describePrimitive(json: GltfJson, primitive: GltfPrimitive): string {
  const accessors = json.accessors ?? [];
  const attributes = Object.entries(primitive.attributes ?? {})
    .map(([name, index]) => {
      const accessor = accessors[index];
      return `${name}:${accessor?.count ?? -1}:${accessor?.componentType ?? -1}:${accessor?.type ?? ''}`;
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
  if (!accessor || !bufferView || components === undefined) {
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
  if (start + byteLength > bin.byteOffset + bin.byteLength) {
    return undefined;
  }
  // A misaligned accessor cannot be viewed directly; copying it is rare and still cheaper than a reparse.
  const aligned =
    start % bytesPerComponent === 0
      ? { buffer: bin.buffer, offset: start }
      : { buffer: new Uint8Array(bin.buffer, start, byteLength).slice().buffer, offset: 0 };

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

function sameElements(left: AccessorArray | undefined, right: ArrayLike<number> | undefined): boolean {
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
    const attribute = values && writableAttribute(target.geometry, name.toLowerCase(), values);
    if (!values || !attribute) {
      return undefined;
    }
    writes.push([attribute, values]);
  }

  return () => {
    for (const [attribute, values] of writes) {
      (attribute.array as Float32Array).set(values as Float32Array);
      attribute.needsUpdate = true;
    }
    setBoundsFromAccessor(json, target.geometry, primitive.attributes?.['POSITION']);
  };
}

function planLineUpdate({ json, bin, primitive, target }: PrimitiveUpdate): (() => void) | undefined {
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

  return () => {
    (buffer.array as Float32Array).set(segmentPositions);
    buffer.needsUpdate = true;
    target.geometry.computeBoundingBox();
    target.geometry.computeBoundingSphere();
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
  associations,
  bytes,
}: CaptureInPlaceGeometryTargetsInput): InPlaceGeometryTargets | undefined {
  const parsed = readGltf(bytes);
  if (!parsed) {
    return undefined;
  }
  const { json } = parsed;
  const objectsByAddress = new Map<string, Object3D>();
  for (const [object, association] of associations) {
    if (association?.meshes === undefined || association.primitives === undefined) {
      continue;
    }
    const address = `${association.meshes}/${association.primitives}`;
    if (!objectsByAddress.has(address)) {
      objectsByAddress.set(address, object);
    }
  }

  const primitives: PrimitiveTarget[] = [];
  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
      const object = objectsByAddress.get(`${meshIndex}/${primitiveIndex}`);
      const geometry = (object as Mesh | undefined)?.geometry;
      if (!object || !geometry) {
        return undefined;
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
      primitives.push({ geometry, isLine, sourceIndices, descriptor: describePrimitive(json, primitive) });
    }
  }

  return { materialsSignature: JSON.stringify(json.materials ?? []), primitives };
}

/**
 * Write `bytes` into the buffers {@link captureInPlaceGeometryTargets} recorded, when every primitive
 * still has the same index buffer, accessor layout and material as the presented one.
 *
 * Nothing is mutated unless every primitive validates, so a `false` return leaves the presented scene
 * exactly as it was and the caller presents the result the full way.
 */
export function applyInPlaceGeometryUpdate(targets: InPlaceGeometryTargets, bytes: Uint8Array<ArrayBuffer>): boolean {
  const parsed = readGltf(bytes);
  if (!parsed) {
    return false;
  }
  const { json, bin } = parsed;
  if (JSON.stringify(json.materials ?? []) !== targets.materialsSignature) {
    return false;
  }

  const writes: Array<() => void> = [];
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const target = targets.primitives[writes.length];
      if (!target || describePrimitive(json, primitive) !== target.descriptor) {
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
  if (writes.length !== targets.primitives.length) {
    return false;
  }

  for (const write of writes) {
    write();
  }
  return true;
}
