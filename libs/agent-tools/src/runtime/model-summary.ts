import type { ModelSummary } from '@taucad/chat/schemas/tools/evaluate-model';
import type { KernelIssue } from '@taucad/runtime/types';

/**
 * The admission limits the GeoSpec engine checks one subject against, as its `initialize`
 * configuration reports them.
 * @public
 */
export type ModelAdmissionLimits = Readonly<{
  /** Triangles one subject may hold. */
  maxTriangles: number;
  /** Decoded vertices one subject may hold. */
  maxVertices: number;
  /** Bytes of one subject's primary geometry. */
  maxSubjectBytes: number;
}>;

/** What {@link summarizeRenderedModel} reads: the default view's artifact and issues, and the engine limits. */
type SummarizeRenderedModelInput = Readonly<{
  artifact: Readonly<{ mimeType: string; content: Uint8Array<ArrayBuffer> | string }>;
  issues: readonly KernelIssue[];
  /** Resolves the engine's limits, or `undefined` when this host cannot say; read only for a GLB. */
  admissionLimits?: (() => Promise<ModelAdmissionLimits | undefined>) | undefined;
}>;

type JsonObject = Readonly<Record<string, unknown>>;
type Matrix = readonly number[];
type Point = readonly [number, number, number];
type Estimate = NonNullable<ModelSummary['admission']>['subjectBytes'];
type MeshFacts = Readonly<{
  components: number;
  triangles: number;
  vertices: number;
  bounds?: ModelSummary['bounds'];
}>;

const glbMagic = 0x46_54_6c_67;
const jsonChunkType = 0x4e_4f_53_4a;
/**
 * A subject's bytes per triangle at three vertices per triangle, each a float32 position and normal:
 * exact for the mesh imports the glTF kernel de-indexes, more than an indexed export needs.
 */
const subjectBytesPerTriangle = 72;
/** What every admission warning says the estimate cannot know. */
const estimateCaveat =
  'The estimate comes from the display mesh: a kernel can export a finer subject, so a figure within a factor of about two of its limit is uncertain, and STEP and region loads are not estimated.';
/** Triangle lists, strips and fans: the primitives a GeoSpec subject meshes. */
const triangleModes: ReadonlySet<number> = new Set([4, 5, 6]);
/** Divisors of the normalized integer position types `KHR_mesh_quantization` allows. */
const normalizedDivisors: ReadonlyMap<number, number> = new Map([
  [5120, 127],
  [5121, 255],
  [5122, 32_767],
  [5123, 65_535],
]);
const identity: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const objectsOf = (value: unknown): ReadonlyArray<JsonObject | undefined> =>
  Array.isArray(value) ? value.map((entry: unknown) => (isObject(entry) ? entry : undefined)) : [];

const numberOf = (object: JsonObject | undefined, key: string): number | undefined => {
  const value = object?.[key];
  return isFiniteNumber(value) ? value : undefined;
};

const referenceOf = (object: JsonObject | undefined, key: string): number | undefined => {
  const value = numberOf(object, key);
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

const referencesOf = (object: JsonObject | undefined, key: string): readonly number[] => {
  const value = object?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: readonly unknown[] = value;
  return entries.filter((entry): entry is number => isFiniteNumber(entry) && Number.isSafeInteger(entry) && entry >= 0);
};

const numbersOf = (object: JsonObject | undefined, key: string, length: number): readonly number[] | undefined => {
  const value = object?.[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries: readonly unknown[] = value.slice(0, length);
  return entries.length === length && entries.every((entry): entry is number => isFiniteNumber(entry))
    ? entries
    : undefined;
};

/**
 * The JSON chunk of a GLB, or `undefined` for bytes that are not one.
 *
 * @param content - GLB bytes.
 * @returns The parsed glTF JSON.
 */
const gltfJson = (content: Uint8Array<ArrayBuffer>): JsonObject | undefined => {
  if (content.byteLength < 20) {
    return undefined;
  }
  const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
  const length = view.getUint32(12, true);
  if (view.getUint32(0, true) !== glbMagic || view.getUint32(16, true) !== jsonChunkType) {
    return undefined;
  }
  if (20 + length > content.byteLength) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(content.subarray(20, 20 + length)));
    return isObject(parsed) ? parsed : undefined;
  } catch {
    // A display GLB whose JSON does not parse has no facts to report; the viewer reports it.
    return undefined;
  }
};

/** Column-major `left × right`: a child's local matrix under its parent's world matrix. */
const multiply = (left: Matrix, right: Matrix): Matrix =>
  Array.from({ length: 16 }, (_, index) => {
    const column = Math.floor(index / 4) * 4;
    const row = index % 4;
    return (
      left[row]! * right[column]! +
      left[row + 4]! * right[column + 1]! +
      left[row + 8]! * right[column + 2]! +
      left[row + 12]! * right[column + 3]!
    );
  });

/** A node's local matrix: its `matrix`, else its translation, rotation and scale composed. */
const localMatrix = (node: JsonObject): Matrix => {
  const matrix = numbersOf(node, 'matrix', 16);
  if (matrix !== undefined) {
    return matrix;
  }
  const [tx = 0, ty = 0, tz = 0] = numbersOf(node, 'translation', 3) ?? [];
  const [x = 0, y = 0, z = 0, w = 1] = numbersOf(node, 'rotation', 4) ?? [];
  const [sx = 1, sy = 1, sz = 1] = numbersOf(node, 'scale', 3) ?? [];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + w * z) * sx,
    2 * (x * z - w * y) * sx,
    0,
    2 * (x * y - w * z) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + w * x) * sy,
    0,
    2 * (x * z + w * y) * sz,
    2 * (y * z - w * x) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
};

const transform = (matrix: Matrix, [x, y, z]: Point): Point => [
  matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
  matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
  matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
];

/** A point in glTF's Y-up metres, in the model's own frame: Z up, -Y forward, millimetres. */
const toModelMillimetres = ([x, y, z]: Point): Point => [x * 1000, -z * 1000, y * 1000];

/** The eight corners of a POSITION accessor's box, in the accessor's dequantized units. */
const positionCorners = (accessor: JsonObject | undefined): readonly Point[] => {
  const min = numbersOf(accessor, 'min', 3);
  const max = numbersOf(accessor, 'max', 3);
  if (min === undefined || max === undefined) {
    return [];
  }
  const divisor =
    accessor?.['normalized'] === true ? normalizedDivisors.get(numberOf(accessor, 'componentType') ?? 0) : undefined;
  const dequantize = (value: number): number => (divisor === undefined ? value : Math.max(value / divisor, -1));
  const [x0 = 0, y0 = 0, z0 = 0] = min.map((value) => dequantize(value));
  const [x1 = 0, y1 = 0, z1 = 0] = max.map((value) => dequantize(value));
  return [
    [x0, y0, z0],
    [x1, y0, z0],
    [x0, y1, z0],
    [x1, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x0, y1, z1],
    [x1, y1, z1],
  ];
};

/** Millimetres to 0.1 µm, below the noise float32 metres carry at model sizes; `|| 0` turns -0 into 0. */
const roundMillimetres = (value: number): number => Math.round(value * 10_000) / 10_000 || 0;

const pointOf = ([x, y, z]: Point): Readonly<{ x: number; y: number; z: number }> => ({
  x: roundMillimetres(x),
  y: roundMillimetres(y),
  z: roundMillimetres(z),
});

/**
 * The default scene's drawn mesh: its parts, triangles, vertices and box.
 *
 * Every mesh node the default scene reaches counts once per occurrence, as the viewer draws it
 * and the engine decodes it; primitives of one occurrence that share a POSITION accessor count
 * its vertices once, as the engine does. The box transforms each triangle primitive's POSITION
 * bounds through its node's world matrix, as the viewer's component manifest does: exact for
 * unrotated parts, the box around a rotated part's own box otherwise.
 *
 * @param json - The glTF JSON.
 * @returns The mesh facts in the model's frame.
 */
const meshFacts = (json: JsonObject): MeshFacts => {
  const nodes = objectsOf(json['nodes']);
  const meshes = objectsOf(json['meshes']);
  const accessors = objectsOf(json['accessors']);
  const scene = objectsOf(json['scenes'])[referenceOf(json, 'scene') ?? 0];
  const children = new Set(nodes.flatMap((node) => referencesOf(node, 'children')));
  const roots =
    scene === undefined ? [...nodes.keys()].filter((index) => !children.has(index)) : referencesOf(scene, 'nodes');
  const facts = { components: 0, triangles: 0, vertices: 0 };
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const visited = new Set<number>();

  const addPrimitive = (primitive: JsonObject | undefined, world: Matrix, decoded: Set<number>): boolean => {
    const mode = numberOf(primitive, 'mode') ?? 4;
    const attributes = primitive?.['attributes'];
    const positionIndex = isObject(attributes) ? referenceOf(attributes, 'POSITION') : undefined;
    const position = positionIndex === undefined ? undefined : accessors[positionIndex];
    const count = referenceOf(position, 'count');
    if (!triangleModes.has(mode) || positionIndex === undefined || count === undefined) {
      return false;
    }
    const indicesIndex = referenceOf(primitive, 'indices');
    const drawn = indicesIndex === undefined ? count : (referenceOf(accessors[indicesIndex], 'count') ?? 0);
    const triangles = mode === 4 ? Math.floor(drawn / 3) : Math.max(0, drawn - 2);
    if (triangles === 0) {
      return false;
    }
    facts.triangles += triangles;
    if (!decoded.has(positionIndex)) {
      decoded.add(positionIndex);
      facts.vertices += count;
    }
    for (const corner of positionCorners(position)) {
      const point = toModelMillimetres(transform(world, corner));
      for (const axis of [0, 1, 2] as const) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
    return true;
  };

  const visit = (index: number, parent: Matrix): void => {
    const node = nodes[index];
    if (node === undefined || visited.has(index)) {
      return;
    }
    visited.add(index);
    const world = multiply(parent, localMatrix(node));
    const meshIndex = referenceOf(node, 'mesh');
    const primitives = objectsOf(meshIndex === undefined ? undefined : meshes[meshIndex]?.['primitives']);
    const decoded = new Set<number>();
    const drawn = primitives.map((primitive) => addPrimitive(primitive, world, decoded));
    if (drawn.includes(true)) {
      facts.components += 1;
    }
    for (const child of referencesOf(node, 'children')) {
      visit(child, world);
    }
  };

  for (const root of roots) {
    visit(root, identity);
  }
  if (![...min, ...max].every((value) => Number.isFinite(value))) {
    return facts;
  }
  return {
    ...facts,
    bounds: {
      min: pointOf(min),
      max: pointOf(max),
      size: pointOf([max[0] - min[0], max[1] - min[1], max[2] - min[2]]),
      unit: 'mm',
    },
  };
};

/**
 * The first full-mesh count a display simplification reported: exports, and so GeoSpec subjects,
 * keep the mesh the kernel produced.
 *
 * @param issues - The default view's rendering issues.
 * @returns The produced and delivered triangle counts, when the render was simplified.
 */
const simplifiedFrom = (issues: readonly KernelIssue[]): Readonly<{ from: number; to: number }> | undefined => {
  for (const issue of issues) {
    const details = isObject(issue.details) ? issue.details : undefined;
    const from = referenceOf(details, 'from');
    const to = referenceOf(details, 'to');
    if (issue.code === 'DISPLAY_SIMPLIFIED' && from !== undefined && to !== undefined && to > 0) {
      return { from, to };
    }
  }
  return undefined;
};

const admissionOf = (
  mesh: Readonly<{ triangles: number; vertices: number }>,
  issues: readonly KernelIssue[],
  limits: ModelAdmissionLimits,
): NonNullable<ModelSummary['admission']> => {
  const simplified = simplifiedFrom(issues);
  const triangles = simplified?.from ?? mesh.triangles;
  // Simplification keeps the topology, so the produced mesh keeps the delivered vertex share.
  const vertices =
    simplified === undefined ? mesh.vertices : Math.round((mesh.vertices * simplified.from) / simplified.to);
  const estimates = {
    triangles: { estimated: triangles, limit: limits.maxTriangles },
    vertices: { estimated: vertices, limit: limits.maxVertices },
    subjectBytes: { estimated: triangles * subjectBytesPerTriangle, limit: limits.maxSubjectBytes },
  };
  const checks: ReadonlyArray<readonly [string, Estimate]> = [
    ['subject bytes', estimates.subjectBytes],
    ['vertices', estimates.vertices],
    ['triangles', estimates.triangles],
  ];
  const over = checks
    .filter(([, { estimated, limit }]) => estimated > limit)
    .map(([noun, { estimated, limit }]) => `${noun} about ${String(estimated)}, limit ${String(limit)}`);
  if (over.length === 0) {
    return estimates;
  }
  return {
    ...estimates,
    warning: `A whole-model GeoSpec loadModel of this model is estimated to exceed the engine's admission limits (${over.join('; ')}). The engine refuses such a load, so its claims would be not decided at this capacity, not failed. ${estimateCaveat}`,
  };
};

/**
 * Summarize the default view's GLB: its box, parts and mesh, and what a whole-model GeoSpec
 * `loadModel` of it would ask the engine to admit.
 *
 * Reads only the GLB's JSON chunk, so it costs milliseconds next to the render. The admission
 * figures are estimates: they count 72 bytes per triangle, and a subject is exported from the
 * model, so it may be meshed at another tolerance than the display.
 *
 * @internal
 * @param input - The default view's artifact and issues, and the engine limits when known.
 * @returns The summary, or `undefined` when the artifact is not a GLB.
 */
export const summarizeRenderedModel = async (input: SummarizeRenderedModelInput): Promise<ModelSummary | undefined> => {
  const { artifact } = input;
  if (artifact.mimeType !== 'model/gltf-binary' || typeof artifact.content === 'string') {
    return undefined;
  }
  const json = gltfJson(artifact.content);
  if (json === undefined) {
    return undefined;
  }
  const { components, triangles, vertices, bounds } = meshFacts(json);
  const limits = await input.admissionLimits?.();
  return {
    ...(bounds === undefined ? {} : { bounds }),
    componentCount: components,
    triangles,
    vertices,
    ...(limits === undefined ? {} : { admission: admissionOf({ triangles, vertices }, input.issues, limits) }),
  };
};
