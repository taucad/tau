import type { ExportValidation } from '@taucad/chat/schemas/tools/export-model';

import { glbChunks, isObject } from '#runtime/glb-chunks.js';
import type { GlbChunks, JsonObject } from '#runtime/glb-chunks.js';

/** One exported file, as the runtime returns it. */
type ExportedFile = Readonly<{ name: string; bytes: Uint8Array<ArrayBuffer> }>;

/** A mesh as welded vertex ids, three per triangle. */
type Triangles = readonly number[];

/** Bytes per component of each glTF accessor component type. */
const componentBytes: ReadonlyMap<number, number> = new Map([
  [5120, 1],
  [5121, 1],
  [5122, 2],
  [5123, 2],
  [5125, 4],
  [5126, 4],
]);

/** How each glTF accessor component type is read, little-endian. */
const readers: ReadonlyMap<number, (data: DataView, at: number) => number> = new Map([
  [5120, (data: DataView, at: number) => data.getInt8(at)],
  [5121, (data: DataView, at: number) => data.getUint8(at)],
  [5122, (data: DataView, at: number) => data.getInt16(at, true)],
  [5123, (data: DataView, at: number) => data.getUint16(at, true)],
  [5125, (data: DataView, at: number) => data.getUint32(at, true)],
  [5126, (data: DataView, at: number) => data.getFloat32(at, true)],
]);

/** STEP length-unit prefixes, as `SI_UNIT(<prefix>, .METRE.)` names them. */
const stepPrefixes: Readonly<Record<string, string>> = {
  $: 'm',
  '.KILO.': 'km',
  '.DECI.': 'dm',
  '.CENTI.': 'cm',
  '.MILLI.': 'mm',
  '.MICRO.': 'um',
};

/** STEP conversion-based length units by name. */
const stepConversions: ReadonlyMap<string, string> = new Map([
  ['INCH', 'in'],
  ['FOOT', 'ft'],
]);

const integerOf = (object: JsonObject | undefined, key: string): number | undefined => {
  const value = object?.[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

const objectsOf = (value: unknown): ReadonlyArray<JsonObject | undefined> =>
  Array.isArray(value) ? value.map((entry: unknown) => (isObject(entry) ? entry : undefined)) : [];

/**
 * Merges coincident vertices: the same position always gets the same id, however many faces repeat it.
 *
 * @returns The id of a position.
 */
const createWelder = (): ((x: number, y: number, z: number) => number) => {
  const ids = new Map<string, number>();
  return (x, y, z) => {
    const key = `${String(x)},${String(y)},${String(z)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    return id;
  };
};

/**
 * Whether a welded triangle mesh is closed: every edge of a non-degenerate triangle is shared by exactly two.
 *
 * @param triangles - Welded vertex ids, three per triangle.
 * @returns `true` when no edge is open or shared by more than two triangles.
 */
const isClosed = (triangles: Triangles): boolean => {
  const edges = new Map<string, number>();
  for (let index = 0; index + 2 < triangles.length; index += 3) {
    const corners = [triangles[index]!, triangles[index + 1]!, triangles[index + 2]!];
    if (new Set(corners).size < 3) {
      continue;
    }
    for (const [from, to] of [
      [corners[0]!, corners[1]!],
      [corners[1]!, corners[2]!],
      [corners[2]!, corners[0]!],
    ] as const) {
      const key = from < to ? `${String(from)}:${String(to)}` : `${String(to)}:${String(from)}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return edges.size > 0 && [...edges.values()].every((count) => count === 2);
};

/**
 * Reads one component of one accessor element from a GLB's binary chunk.
 *
 * @param glb - The GLB's JSON and binary chunk.
 * @param index - The accessor.
 * @param components - Components per element: 3 for a position, 1 for an index.
 * @returns A reader, or `undefined` for an accessor this check cannot read (sparse, compressed or out of bounds).
 */
const accessorReader = (
  { json, bin }: Required<GlbChunks>,
  index: number,
  components: number,
): ((element: number, component: number) => number) | undefined => {
  const accessor = objectsOf(json['accessors'])[index];
  const viewIndex = integerOf(accessor, 'bufferView');
  const view = viewIndex === undefined ? undefined : objectsOf(json['bufferViews'])[viewIndex];
  const type = integerOf(accessor, 'componentType') ?? 0;
  const size = componentBytes.get(type);
  const count = integerOf(accessor, 'count');
  if (view === undefined || size === undefined || count === undefined || accessor?.['sparse'] !== undefined) {
    return undefined;
  }
  const offset = (integerOf(view, 'byteOffset') ?? 0) + (integerOf(accessor, 'byteOffset') ?? 0);
  const stride = integerOf(view, 'byteStride') ?? size * components;
  if (count > 0 && offset + stride * (count - 1) + size * components > bin.byteLength) {
    return undefined;
  }
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const read = readers.get(type);
  if (read === undefined) {
    return undefined;
  }
  return (element, component) => read(data, offset + element * stride + component * size);
};

/**
 * Appends one triangle-list primitive's corners to its mesh, as welded vertex ids.
 *
 * @param glb - The GLB's JSON and binary chunk.
 * @param primitive - The primitive.
 * @param mesh - The mesh's welder and the triangles welded so far.
 * @returns `false` when the primitive is a strip or fan or its geometry cannot be read.
 */
const weldPrimitive = (
  glb: Required<GlbChunks>,
  primitive: JsonObject | undefined,
  mesh: Readonly<{ weld: ReturnType<typeof createWelder>; triangles: number[] }>,
): boolean => {
  const mode = integerOf(primitive, 'mode') ?? 4;
  if (mode < 4) {
    // Points and lines draw no surface.
    return true;
  }
  const attributes = primitive?.['attributes'];
  const positionIndex = isObject(attributes) ? integerOf(attributes, 'POSITION') : undefined;
  const indicesIndex = integerOf(primitive, 'indices');
  const position = positionIndex === undefined ? undefined : accessorReader(glb, positionIndex, 3);
  const indices = indicesIndex === undefined ? undefined : accessorReader(glb, indicesIndex, 1);
  if (mode !== 4 || positionIndex === undefined || position === undefined) {
    return false;
  }
  if (indicesIndex !== undefined && indices === undefined) {
    return false;
  }
  const accessors = objectsOf(glb.json['accessors']);
  const vertices = integerOf(accessors[positionIndex], 'count') ?? 0;
  const drawn = indicesIndex === undefined ? vertices : (integerOf(accessors[indicesIndex], 'count') ?? 0);
  for (let corner = 0; corner < drawn - (drawn % 3); corner += 1) {
    const vertex = indices === undefined ? corner : indices(corner, 0);
    if (vertex >= vertices) {
      return false;
    }
    mesh.triangles.push(mesh.weld(position(vertex, 0), position(vertex, 1), position(vertex, 2)));
  }
  return true;
};

/**
 * Each GLB mesh as welded triangles, every primitive of a mesh welded together so faces drawn apart still join.
 *
 * @param bytes - The GLB.
 * @returns One triangle list per mesh with triangles, or `undefined` when some triangle geometry cannot be read.
 */
const glbMeshes = (bytes: Uint8Array<ArrayBuffer>): Triangles[] | undefined => {
  const chunks = glbChunks(bytes);
  if (chunks?.bin === undefined) {
    return undefined;
  }
  const glb = { json: chunks.json, bin: chunks.bin };
  const meshes: Triangles[] = [];
  for (const mesh of objectsOf(glb.json['meshes'])) {
    const welded = { weld: createWelder(), triangles: [] as number[] };
    if (!objectsOf(mesh?.['primitives']).every((primitive) => weldPrimitive(glb, primitive, welded))) {
      return undefined;
    }
    if (welded.triangles.length > 0) {
      meshes.push(welded.triangles);
    }
  }
  return meshes;
};

/**
 * An STL's one mesh as welded triangles, binary or ASCII.
 *
 * @param bytes - The STL.
 * @returns The triangles, or `undefined` for bytes that are not an STL.
 */
const stlMesh = (bytes: Uint8Array<ArrayBuffer>): Triangles | undefined => {
  const weld = createWelder();
  const triangles: number[] = [];
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.byteLength >= 84 ? data.getUint32(80, true) : -1;
  if (count >= 0 && 84 + count * 50 === bytes.byteLength) {
    for (let triangle = 0; triangle < count; triangle += 1) {
      for (let corner = 0; corner < 3; corner += 1) {
        const at = 84 + triangle * 50 + 12 + corner * 12;
        triangles.push(weld(data.getFloat32(at, true), data.getFloat32(at + 4, true), data.getFloat32(at + 8, true)));
      }
    }
    return triangles;
  }
  const text = new TextDecoder().decode(bytes);
  if (!/^\s*solid\b/u.test(text)) {
    return undefined;
  }
  for (const [, x, y, z] of text.matchAll(/\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/gu)) {
    triangles.push(weld(Number(x), Number(y), Number(z)));
  }
  return triangles.length % 3 === 0 ? triangles : undefined;
};

/**
 * The facts of a welded mesh export.
 *
 * @param meshes - Each mesh's welded triangles.
 * @returns The triangle count and whether every mesh is closed.
 */
const meshValidation = (meshes: readonly Triangles[]): ExportValidation => ({
  triangles: meshes.reduce((total, mesh) => total + mesh.length / 3, 0),
  ...(meshes.length === 0 ? {} : { watertight: meshes.every((mesh) => isClosed(mesh)) }),
});

/**
 * A STEP file's length unit and BRep solid count.
 *
 * @param bytes - The STEP file.
 * @returns Its facts.
 */
const stepValidation = (bytes: Uint8Array<ArrayBuffer>): ExportValidation => {
  const text = new TextDecoder().decode(bytes);
  const conversion = /CONVERSION_BASED_UNIT\s*\(\s*'([A-Z]+)'/u.exec(text)?.[1];
  const prefix = /LENGTH_UNIT\s*\(\s*\)[^;]*?SI_UNIT\s*\(\s*(\$|\.[A-Z]+\.)\s*,\s*\.METRE\.\s*\)/u.exec(text)?.[1];
  const units =
    (conversion === undefined ? undefined : stepConversions.get(conversion)) ??
    (prefix === undefined ? undefined : stepPrefixes[prefix]);
  const solids = text.match(/=\s*(?:MANIFOLD_SOLID_BREP|BREP_WITH_VOIDS)\s*\(/gu)?.length ?? 0;
  return { ...(units === undefined ? {} : { units }), solids };
};

/**
 * What an export says about itself, for `export_model`'s `validation`: a GLB's triangles and whether each mesh is
 * closed, the same over every STL file of a per-part STL export, and a STEP file's length unit and solids.
 *
 * Reads the bytes once after the export; formats it cannot read (3MF, OBJ, glTF with separate buffers, images)
 * have no validation.
 *
 * @internal
 * @param files - The exported files, primary first.
 * @returns The facts, or `undefined` when the primary file's format is not one this reads.
 */
export const validateExport = (files: readonly ExportedFile[]): ExportValidation | undefined => {
  const [primary] = files;
  const extension = primary?.name.toLowerCase().split('.').at(-1);
  if (primary === undefined) {
    return undefined;
  }
  switch (extension) {
    case 'glb': {
      const meshes = glbMeshes(primary.bytes);
      return meshes === undefined ? { units: 'm' } : { units: 'm', ...meshValidation(meshes) };
    }
    case 'stl': {
      /* A multi-part STL export writes one file per part; each is one mesh of the deliverable. */
      const meshes = files
        .filter((file) => file.name.toLowerCase().endsWith('.stl'))
        .map((file) => stlMesh(file.bytes));
      return meshes.includes(undefined)
        ? undefined
        : meshValidation(meshes.filter((mesh): mesh is Triangles => mesh !== undefined && mesh.length > 0));
    }
    case 'step':
    case 'stp': {
      return stepValidation(primary.bytes);
    }
    default: {
      return undefined;
    }
  }
};
