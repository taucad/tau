import { loadMesh } from '#mesh/load-mesh.js';
import { forensicAsync, forensicSync } from '#runner/forensic.js';
import type {
  BrepEvidence,
  GeometryCapability,
  GeometryDiagnostic,
  GeometrySource,
  GeometrySubject,
  StepEvidence,
} from '#mesh/types.js';
import type {
  CreateStepLoaderOptions,
  GeoSpecNativeStepBackend,
  GeoSpecNativeStepReadResult,
  GeoSpecNativeXdeReadResult,
  GeoSpecOpenCascadeStepModule,
  GeoSpecStepLoader,
  LoadStepOptions,
  XdeReadResult,
} from '#step/types.js';
import type { SelectorFaceFacts } from '#selector/types.js';

type StepBytes = {
  bytes: Uint8Array<ArrayBuffer>;
  text: string;
  source: GeometrySource;
};

type NativeEvidencePayload = {
  brep?: BrepEvidence;
  step?: StepEvidence;
  triangles?: number[];
  diagnostics?: GeometryDiagnostic[];
};

const defaultMeshLinearTolerance = 0.01;
const defaultMeshAngularToleranceDegrees = 15;
const defaultMaxBytes = 256 * 1024 * 1024;

const isBlobLike = (value: unknown): value is Blob =>
  typeof value === 'object' &&
  value !== null &&
  'arrayBuffer' in value &&
  typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function';

const isReadableStream = (value: unknown): value is ReadableStream<Uint8Array<ArrayBuffer>> =>
  typeof value === 'object' &&
  value !== null &&
  'getReader' in value &&
  typeof (value as { getReader?: unknown }).getReader === 'function';

const isAsyncIterable = (value: unknown): value is AsyncIterable<Uint8Array<ArrayBuffer>> =>
  typeof value === 'object' && value !== null && Symbol.asyncIterator in value;

const asUint8Array = (source: Uint8Array<ArrayBuffer> | ArrayBuffer): Uint8Array<ArrayBuffer> => {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
};

const bytesToHex = (bytes: Uint8Array<ArrayBuffer>): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const hashBytes = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
};

const isStepText = (value: string): boolean => /^\s*ISO-10303-/u.test(value) || value.includes('HEADER;');

const concatChunks = (chunks: Array<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const enforceReadLimit = (options: { bytesRead: number; maxBytes: number; signal?: AbortSignal }): void => {
  if (options.signal?.aborted) {
    throw new Error('STEP load aborted before parsing.');
  }
  if (options.bytesRead > options.maxBytes) {
    throw new Error(`STEP source exceeds maxBytes (${options.maxBytes}).`);
  }
};

const readUrl = async (url: URL): Promise<Uint8Array<ArrayBuffer>> => {
  if (url.protocol === 'file:') {
    const [{ readFile }, { fileURLToPath }] = await Promise.all([import('node:fs/promises'), import('node:url')]);
    return asUint8Array(new Uint8Array(await readFile(fileURLToPath(url))));
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch STEP source: ${response.status} ${response.statusText}`);
  }
  return asUint8Array(await response.arrayBuffer());
};

const readPathOrText = async (
  source: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; kind: GeometrySource['kind'] }> => {
  if (isStepText(source)) {
    return { bytes: new TextEncoder().encode(source), kind: 'bytes' };
  }
  if (/^https?:\/\//u.test(source) || source.startsWith('file:')) {
    return { bytes: await readUrl(new URL(source)), kind: 'url' };
  }
  const { readFile } = await import('node:fs/promises');
  return { bytes: asUint8Array(new Uint8Array(await readFile(source))), kind: 'path' };
};

const readReadableStream = async (
  source: ReadableStream<Uint8Array<ArrayBuffer>>,
  options: Pick<LoadStepOptions, 'maxBytes' | 'signal' | 'onProgress'>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const reader = source.getReader();
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let bytesRead = 0;
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- ReadableStream reads are sequential by contract.
      const result = await reader.read();
      if (result.done) {
        break;
      }
      bytesRead += result.value.byteLength;
      enforceReadLimit({ bytesRead, maxBytes: options.maxBytes ?? defaultMaxBytes, signal: options.signal });
      options.onProgress?.({ phase: 'read-source', bytesRead });
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return concatChunks(chunks);
};

const readAsyncIterable = async (
  source: AsyncIterable<Uint8Array<ArrayBuffer>>,
  options: Pick<LoadStepOptions, 'maxBytes' | 'signal' | 'onProgress'>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let bytesRead = 0;
  for await (const chunk of source) {
    bytesRead += chunk.byteLength;
    enforceReadLimit({ bytesRead, maxBytes: options.maxBytes ?? defaultMaxBytes, signal: options.signal });
    options.onProgress?.({ phase: 'read-source', bytesRead });
    chunks.push(chunk);
  }
  return concatChunks(chunks);
};

const readStepSourceBytes = async (
  options: LoadStepOptions,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; kind: GeometrySource['kind'] }> => {
  const { source } = options;
  if (typeof source === 'string') {
    return readPathOrText(source);
  }
  if (source instanceof URL) {
    return { bytes: await readUrl(source), kind: source.protocol === 'file:' ? 'path' : 'url' };
  }
  if (source instanceof Uint8Array || source instanceof ArrayBuffer) {
    return { bytes: asUint8Array(source), kind: source instanceof ArrayBuffer ? 'array-buffer' : 'bytes' };
  }
  if (isBlobLike(source)) {
    return {
      bytes: asUint8Array(await source.arrayBuffer()),
      kind: 'name' in source && typeof source.name === 'string' ? 'file' : 'blob',
    };
  }
  if (isReadableStream(source)) {
    return { bytes: await readReadableStream(source, options), kind: 'readable-stream' };
  }
  if (isAsyncIterable(source)) {
    return { bytes: await readAsyncIterable(source, options), kind: 'async-iterable' };
  }
  throw new Error('Unsupported STEP source input.');
};

const readStepSource = async (options: LoadStepOptions): Promise<StepBytes> => {
  const { source } = options;
  const { bytes, kind } = await readStepSourceBytes(options);
  enforceReadLimit({
    bytesRead: bytes.byteLength,
    maxBytes: options.maxBytes ?? defaultMaxBytes,
    signal: options.signal,
  });
  options.onProgress?.({ phase: 'read-source', bytesRead: bytes.byteLength });
  const text = new TextDecoder().decode(bytes);
  return {
    bytes,
    text,
    source: {
      kind,
      format: 'step',
      path: options.path ?? (typeof source === 'string' && kind === 'path' ? source : undefined),
      name:
        options.name ??
        (isBlobLike(source) && 'name' in source && typeof source.name === 'string' ? source.name : undefined),
      byteLength: bytes.byteLength,
    },
  };
};

const extractStepSchema = (text: string): string | undefined => {
  const description = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/iu.exec(text);
  return description?.[1];
};

const extractProducts = (text: string): StepEvidence['productStructure'] => {
  const products: StepEvidence['productStructure'] = [];
  const seen = new Set<string>();
  const add = (rawName: string | undefined, kind: 'product' | 'occurrence'): void => {
    const name = rawName?.trim();
    if (name !== undefined && name.length > 0 && !seen.has(name)) {
      seen.add(name);
      products.push({ name, path: `${kind}[${products.length}]` });
    }
  };
  const productExpression = /PRODUCT\s*\(\s*'([^']*)'/giu;
  let match: RegExpExecArray | undefined;
  while ((match = productExpression.exec(text) ?? undefined) !== undefined) {
    add(match[1], 'product');
  }
  // Idiomatic AP242 instancing collapses repeated placements into one shared PRODUCT
  // plus a NEXT_ASSEMBLY_USAGE_OCCURRENCE per instance; the occurrence name lives in
  // the NAUO's second field, not as a distinct PRODUCT entity. Collect those so the
  // product structure carries every occurrence name, not only the shared prototypes.
  const occurrenceExpression = /NEXT_ASSEMBLY_USAGE_OCCURRENCE\s*\(\s*'[^']*'\s*,\s*'([^']*)'/giu;
  while ((match = occurrenceExpression.exec(text) ?? undefined) !== undefined) {
    add(match[1], 'occurrence');
  }
  return products;
};

const trianglesToMeshBuffer = (triangles: readonly number[]): { positions: number[]; indices: number[] } => {
  const positions = [...triangles];
  const indices = Array.from({ length: Math.floor(triangles.length / 3) }, (_value, index) => index);
  return { positions, indices };
};

const copyHeapFloat64 = (options: { heap: Float64Array<ArrayBuffer>; start: number; length: number }): number[] => {
  const values: number[] = [];
  for (let index = 0; index < options.length; index++) {
    values.push(options.heap[options.start + index] ?? 0);
  }
  return values;
};

const readNativeStep = async (options: {
  bytes: StepBytes;
  loadOptions: LoadStepOptions;
  module: GeoSpecOpenCascadeStepModule;
}): Promise<{ payload: NativeEvidencePayload; strategy: StepEvidence['readStrategy'] } | undefined> => {
  const reader = options.module.GeoSpecStepStreamReader;
  if (!reader) {
    return undefined;
  }
  let result: GeoSpecNativeStepReadResult | undefined;
  try {
    const optionsJson = JSON.stringify({
      mesh: options.loadOptions.mesh ?? true,
      meshLinearTolerance: options.loadOptions.meshLinearTolerance ?? defaultMeshLinearTolerance,
      meshAngularToleranceDegrees:
        options.loadOptions.meshAngularToleranceDegrees ?? defaultMeshAngularToleranceDegrees,
    });
    let strategy: StepEvidence['readStrategy'];
    if (options.loadOptions.streaming !== 'filesystem') {
      result = reader.readText(options.bytes.text, optionsJson);
      strategy = {
        strategy: 'native-stream',
        inputKind: options.bytes.source.kind,
        bytesRead: options.bytes.bytes.byteLength,
        nativeReadStream: true,
        copiedToEmscriptenFs: false,
      };
    } else if (typeof reader.readFile === 'function' && options.module.FS) {
      const path = `/geospec-step-${Date.now()}-${Math.random().toString(16).slice(2)}.step`;
      options.module.FS.writeFile(path, options.bytes.bytes);
      try {
        result = reader.readFile(path, optionsJson);
      } finally {
        options.module.FS.unlink(path);
      }
      strategy = {
        strategy: 'filesystem',
        inputKind: options.bytes.source.kind,
        bytesRead: options.bytes.bytes.byteLength,
        nativeReadStream: false,
        copiedToEmscriptenFs: true,
      };
    } else {
      return undefined;
    }
    const payload = JSON.parse(result.evidenceJson()) as NativeEvidencePayload;
    if (!result.success) {
      const message =
        payload.diagnostics?.map((diagnostic) => diagnostic.message).join('\n') ?? 'GeoSpec native STEP reader failed.';
      throw new Error(message);
    }
    if (result.meshTrianglePointer && result.meshTriangleCount && options.module.HEAPF64) {
      const pointer = result.meshTrianglePointer();
      const count = result.meshTriangleCount();
      if (pointer > 0 && count > 0) {
        const start = pointer / Float64Array.BYTES_PER_ELEMENT;
        payload.triangles = copyHeapFloat64({ heap: options.module.HEAPF64, start, length: count * 9 });
      }
    }
    return {
      payload,
      strategy,
    };
  } finally {
    result?.delete?.();
  }
};

type NativeXdeRead = {
  xde?: XdeReadResult;
  nativeXde?: GeoSpecNativeXdeReadResult;
  diagnostic?: GeometryDiagnostic;
};

// One STEP-XDE read yields structure, names, and datum placements together; the
// native result also retains placed shapes for exact BRep proof calls, so it
// is handed to the subject instead of being deleted here.
const readNativeXde = (options: { text: string; module: GeoSpecNativeStepBackend }): NativeXdeRead => {
  const reader = options.module.GeoSpecXdeReader;
  if (!reader) {
    return {};
  }
  const result = reader.readText(options.text);
  if (!result.isSuccess()) {
    let message = 'GeoSpec native XDE reader failed.';
    try {
      const parsed = JSON.parse(result.resultJson()) as { error?: string };
      message = parsed.error ?? message;
    } catch {
      // Keep the generic message when the native error payload is unreadable.
    }
    result.delete?.();
    return { diagnostic: { code: 'GEOSPEC_XDE_READ_FAILED', severity: 'warning', message } };
  }
  return { xde: JSON.parse(result.resultJson()) as XdeReadResult, nativeXde: result };
};

const resolveNativeStepBackend = async (options: {
  nativeStepBackend?: LoadStepOptions['nativeStepBackend'];
  openCascade?: LoadStepOptions['openCascade'];
}): Promise<GeoSpecNativeStepBackend | undefined> => {
  const backend = options.nativeStepBackend ?? options.openCascade;
  if (typeof backend === 'function') {
    return backend();
  }
  if (backend) {
    return backend;
  }
  try {
    const module_ = await import('geospec/native/opencascade/single');
    const factory = module_.default as (options?: unknown) => Promise<GeoSpecOpenCascadeStepModule>;
    return await factory();
  } catch {
    return undefined;
  }
};

const meshCapabilities: GeometryCapability[] = [
  { kind: 'mesh', feature: 'triangles' },
  { kind: 'mesh', feature: 'bounding-box' },
  { kind: 'mesh', feature: 'connected-components' },
  { kind: 'mesh', feature: 'watertightness' },
  { kind: 'mesh', feature: 'surface-area' },
  { kind: 'mesh', feature: 'volume' },
  { kind: 'mesh', feature: 'center-of-mass' },
  { kind: 'mesh', feature: 'distance' },
  { kind: 'mesh', feature: 'component-overlap' },
];

const stepEvidenceCapabilities: GeometryCapability[] = [
  { kind: 'step', feature: 'schema' },
  { kind: 'step', feature: 'units' },
  { kind: 'step', feature: 'product-structure' },
  { kind: 'step', feature: 'reader-provenance' },
];

const brepCapabilities: GeometryCapability[] = [
  { kind: 'brep', feature: 'validity' },
  { kind: 'brep', feature: 'topology-counts' },
  { kind: 'brep', feature: 'bounding-box' },
  { kind: 'brep', feature: 'mass-properties' },
  { kind: 'brep', feature: 'planar-faces' },
  { kind: 'brep', feature: 'cylindrical-faces' },
  { kind: 'brep', feature: 'circular-holes' },
  { kind: 'brep', feature: 'circular-hole-patterns' },
  { kind: 'brep', feature: 'chamfer-features' },
  { kind: 'brep', feature: 'fillet-features' },
];

const stepCapabilities = (options: { brep: BrepEvidence | undefined; hasMesh: boolean }): GeometryCapability[] => [
  ...(options.hasMesh ? meshCapabilities : []),
  ...stepEvidenceCapabilities,
  ...(options.brep
    ? [
        ...brepCapabilities,
        ...(options.brep.minimumWallThickness ? ([{ kind: 'brep', feature: 'wall-thickness' }] as const) : []),
      ]
    : []),
];

const axisIndices = { x: 0, y: 1, z: 2 } as const;

const axisValue = (value: readonly [number, number, number], axis: 'x' | 'y' | 'z'): number => value[axisIndices[axis]];

const perpendicularAxes = (axis: 'x' | 'y' | 'z'): Array<'x' | 'y' | 'z'> =>
  axis === 'x' ? ['y', 'z'] : axis === 'y' ? ['x', 'z'] : ['x', 'y'];

const coordinatesMatch = (options: {
  left: readonly [number, number, number] | undefined;
  right: readonly [number, number, number] | undefined;
  axes: ReadonlyArray<'x' | 'y' | 'z'>;
  tolerance: number;
}): boolean => {
  const { left, right } = options;
  if (!left || !right) {
    return false;
  }
  return options.axes.every((axis) => Math.abs(axisValue(left, axis) - axisValue(right, axis)) <= options.tolerance);
};

const isAxisNormal = (normal: readonly [number, number, number], axis: 'x' | 'y' | 'z'): boolean => {
  const axisMagnitude = Math.abs(axisValue(normal, axis));
  const offAxisMagnitude = perpendicularAxes(axis).reduce(
    (sum, perpendicularAxis) => sum + Math.abs(axisValue(normal, perpendicularAxis)),
    0,
  );
  return axisMagnitude > 0.95 && offAxisMagnitude < 0.05;
};

const touchesBoundingExtent = (options: { value: number; min: number; max: number; tolerance: number }): boolean =>
  Math.abs(options.value - options.min) <= options.tolerance ||
  Math.abs(options.value - options.max) <= options.tolerance;

const hasInternalCircularCap = (options: {
  brep: BrepEvidence;
  diameter: number;
  axis: 'x' | 'y' | 'z';
  center?: readonly [number, number, number];
}): boolean => {
  const { brep, axis, center, diameter } = options;
  if (!brep.boundingBox || !brep.planarFaces || !center) {
    return false;
  }

  const radius = diameter / 2;
  const expectedCapArea = Math.PI * radius * radius;
  const areaTolerance = Math.max(1, expectedCapArea * 0.05);
  const positionTolerance = 0.1;
  const boundaryTolerance = 0.1;
  const min = axisValue(brep.boundingBox.min, axis);
  const max = axisValue(brep.boundingBox.max, axis);

  return brep.planarFaces.some((face) => {
    if (!face.center || face.area === undefined || !isAxisNormal(face.normal, axis)) {
      return false;
    }
    if (
      !coordinatesMatch({
        left: face.center,
        right: center,
        axes: perpendicularAxes(axis),
        tolerance: positionTolerance,
      })
    ) {
      return false;
    }
    if (Math.abs(face.area - expectedCapArea) > areaTolerance) {
      return false;
    }

    return !touchesBoundingExtent({
      value: axisValue(face.center, axis),
      min,
      max,
      tolerance: boundaryTolerance,
    });
  });
};

const holeThroughFromAxisRange = (options: {
  brep: BrepEvidence;
  axis: 'x' | 'y' | 'z';
  axisRange?: { min: number; max: number };
}): boolean | undefined => {
  const { axisRange, brep, axis } = options;
  if (!axisRange || !brep.boundingBox) {
    return undefined;
  }
  const tolerance = 0.1;
  return (
    axisRange.min <= axisValue(brep.boundingBox.min, axis) + tolerance &&
    axisRange.max >= axisValue(brep.boundingBox.max, axis) - tolerance
  );
};

type CircularHole = NonNullable<BrepEvidence['circularHoles']>[number];
type CircularHolePattern = NonNullable<BrepEvidence['circularHolePatterns']>[number];
type ChamferFeature = NonNullable<BrepEvidence['chamferFeatures']>[number];

const axisOf = (direction: readonly [number, number, number] | undefined): 'x' | 'y' | 'z' | undefined => {
  if (!direction) {
    return undefined;
  }
  const abs = direction.map((component) => Math.abs(component));
  const dominant = Math.max(...abs);
  // Axis-aligned means one component dominates and the others are near zero.
  if (dominant <= 0.999 || abs.filter((value) => value > 0.05).length !== 1) {
    return undefined;
  }
  return abs[0] === dominant ? 'x' : abs[1] === dominant ? 'y' : 'z';
};

const axialSpan = (facts: SelectorFaceFacts, axis: 'x' | 'y' | 'z'): number => {
  const index = axisIndices[axis];
  return facts.bounds.max[index] - facts.bounds.min[index];
};

// Re-derive revolved (conical) chamfer features the native planar-only
// recognizer misses (WS-E / Finding 7). A shaft-end or bore-entry chamfer is a
// `cone` face that is axis-aligned, small, and topologically flanked by a
// coaxial `cylinder` face and a coaxial planar end face (normal along the axis).
// Its 45 deg leg length equals its axial span, which is what toHaveChamferFeature
// checks as `distance`.
// C1: emitted only when the cone is small, axis-aligned, and flanked by both a
// coaxial cylinder and a coaxial end plane - the shaft-end / bore chamfer
// signature - so a deep taper or a stray cone is never reported as a chamfer.
// Deterministic: candidates are traversal-ordered and distances rounded to a
// stable key before de-duplication.
const deriveChamferFeaturesFromFaceFacts = (faces: readonly SelectorFaceFacts[]): ChamferFeature[] => {
  const cones = faces.filter((face) => face.surfaceType === 'cone');
  const cylinders = faces.filter((face) => face.surfaceType === 'cylinder');
  const planes = faces.filter((face) => face.surfaceType === 'plane');
  const maxChamferDistance = 10;

  const distances = new Set<number>();
  const derived: ChamferFeature[] = [];
  for (const cone of cones) {
    const axis = axisOf(cone.axisDirection);
    if (!axis) {
      continue;
    }
    const distance = axialSpan(cone, axis);
    if (distance <= 1e-6 || distance > maxChamferDistance) {
      continue;
    }
    // A chamfer bridges a coaxial cylinder wall and a coaxial end face; require
    // both so a stand-alone taper is never surfaced as a chamfer (C1).
    const coaxialCylinder = cylinders.some((cylinder) => axisOf(cylinder.axisDirection) === axis);
    const coaxialEndPlane = planes.some((plane) => axisOf(plane.normal) === axis);
    if (!coaxialCylinder || !coaxialEndPlane) {
      continue;
    }
    // Round to a micrometer-stable key so identical chamfers around a revolve collapse.
    const key = Math.round(distance * 1000) / 1000;
    if (distances.has(key)) {
      continue;
    }
    distances.add(key);
    derived.push({ distance: key, selection: `revolved chamfer (axis ${axis})` });
  }
  return derived;
};

// Axial gap (mm) beyond which two blind holes belong to different pads.
const padSeparationGap = 20;

const holePatternFrom = (group: readonly CircularHole[]): CircularHolePattern => {
  const { axis } = group[0]!;
  const centre: [number, number, number] = [0, 0, 0];
  for (const hole of group) {
    centre[0] += hole.center![0];
    centre[1] += hole.center![1];
    centre[2] += hole.center![2];
  }
  centre[0] /= group.length;
  centre[1] /= group.length;
  centre[2] /= group.length;
  const [px, py] = perpendicularAxes(axis).map((perpendicularAxis) => axisIndices[perpendicularAxis]);
  let radialSum = 0;
  for (const hole of group) {
    radialSum += Math.hypot(hole.center![px!] - centre[px!], hole.center![py!] - centre[py!]);
  }
  return {
    count: group.length,
    holeDiameter: group[0]!.diameter,
    boltCircleDiameter: (2 * radialSum) / group.length,
    axis,
    center: centre,
  };
};

// Split a blind-hole family into per-pad clusters by their entry-face plane:
// sort by axial centre and start a new pad wherever the gap exceeds
// padSeparationGap. Sorting on a scalar coordinate keeps the split deterministic
// (C2).
const splitBlindHolesByPad = (holes: readonly CircularHole[]): CircularHole[][] => {
  const axialIndex = axisIndices[holes[0]!.axis];
  const sorted = [...holes].sort((a, b) => a.center![axialIndex] - b.center![axialIndex]);
  const pads: CircularHole[][] = [];
  let current: CircularHole[] = [];
  let previous: number | undefined;
  for (const hole of sorted) {
    const axial = hole.center![axialIndex];
    if (previous !== undefined && axial - previous > padSeparationGap) {
      pads.push(current);
      current = [];
    }
    current.push(hole);
    previous = axial;
  }
  pads.push(current);
  return pads;
};

// Re-group circular holes into per-pattern families (WS-E / Finding 7). The
// native recognizer keys only by (axis, diameter), so two mirror-symmetric
// blind-tap pads on opposite faces merge into one over-counted pattern. Rule:
//   - Base family = (axis, diameter).
//   - THROUGH holes stay in one family per base key (a through pattern spans the
//     part and legitimately spreads along/around the axis, for example a bolt
//     circle or a row of breathing windows).
//   - BLIND holes (taps) enter from a single face, so a family is split into
//     pads by entry-plane clustering: a large axial gap starts a new pad.
// So two positive/negative-y pads of 3 taps report count 3 each (not a merged
// 6), while a single-face bolt circle of 6 blind taps stays count 6. Shallow
// taps are kept (no depth/aspect floor) so short blind bores still pattern.
// Deterministic: holes are consumed in native traversal order, clusters seeded
// by that order.
const deriveHolePatterns = (holes: readonly CircularHole[]): CircularHolePattern[] => {
  const families = new Map<string, CircularHole[]>();
  for (const hole of holes) {
    if (!hole.center) {
      continue;
    }
    const diameterKey = Math.round(hole.diameter * 1000) / 1000;
    // Through patterns are one family per (axis, diameter); blind taps are split
    // into pads below, keyed apart so a through row and a blind pad never merge.
    const kindKey = hole.through ? 'through' : 'blind';
    const key = `${hole.axis}:${diameterKey}:${kindKey}`;
    families.set(key, [...(families.get(key) ?? []), hole]);
  }

  const patterns: CircularHolePattern[] = [];
  for (const [key, family] of families) {
    const groups = key.endsWith(':blind') ? splitBlindHolesByPad(family) : [family];
    for (const group of groups) {
      if (group.length >= 2) {
        patterns.push(holePatternFrom(group));
      }
    }
  }
  return patterns;
};

const normalizeBrepEvidence = (
  brep: BrepEvidence | undefined,
  faceFacts: readonly SelectorFaceFacts[] = [],
): BrepEvidence | undefined => {
  if (!brep) {
    return brep;
  }

  const circularHoles = brep.circularHoles?.map((hole) => {
    const rangeThrough = holeThroughFromAxisRange({ brep, axis: hole.axis, axisRange: hole.axisRange });
    const cappedBlindHole = hasInternalCircularCap({
      brep,
      diameter: hole.diameter,
      axis: hole.axis,
      center: hole.center,
    });
    return {
      ...hole,
      through: rangeThrough ?? (hole.through && !cappedBlindHole),
    };
  });

  // Re-derive pattern grouping from the corrected through-state so mirror-
  // symmetric pads and single-face bolt circles are grouped per the rule above.
  const circularHolePatterns = circularHoles ? deriveHolePatterns(circularHoles) : brep.circularHolePatterns;

  // Union the native (planar-bevel) chamfers with revolved cone chamfers the
  // native recognizer cannot see.
  const derivedChamfers = deriveChamferFeaturesFromFaceFacts(faceFacts);
  const chamferFeatures =
    derivedChamfers.length > 0 ? [...(brep.chamferFeatures ?? []), ...derivedChamfers] : brep.chamferFeatures;

  return {
    ...brep,
    ...(circularHoles ? { circularHoles } : {}),
    ...(circularHolePatterns ? { circularHolePatterns } : {}),
    ...(chamferFeatures ? { chamferFeatures } : {}),
  };
};

// Chamfer/hole re-derivation is a per-part feature check; the native
// analyzeShape brep it augments is only meaningful for a single-solid part, and
// the rev2 chamfer/pattern REQs load individual parts (loadPartStep). Cap
// face-fact collection to part-scale occurrence counts so a 650-occurrence
// assembly load never pays a native faceFacts() call per occurrence.
const maxPartOccurrences = 8;

// Gather per-face analytic facts across every occurrence so TS-side feature
// re-derivation (revolved chamfers) can read cone/cylinder/plane geometry the
// native analyzeShape payload omits. Returns [] when the native XDE handle is
// absent (mesh-only or failed read) or the subject is assembly-scale.
const collectFaceFacts = (xdeRead?: NativeXdeRead): SelectorFaceFacts[] => {
  const native = xdeRead?.nativeXde;
  const occurrences = xdeRead?.xde?.occurrences;
  if (!native || !occurrences || occurrences.length > maxPartOccurrences) {
    return [];
  }
  const facts: SelectorFaceFacts[] = [];
  for (let position = 0; position < occurrences.length; position++) {
    try {
      const parsed = JSON.parse(native.faceFacts(position)) as { faces?: SelectorFaceFacts[] };
      if (Array.isArray(parsed.faces)) {
        facts.push(...parsed.faces);
      }
    } catch {
      // A single occurrence's fact read failing must not drop the load.
    }
  }
  return facts;
};

const buildStepSubject = async (options: {
  bytes: StepBytes;
  loadOptions: LoadStepOptions;
  payload: NativeEvidencePayload;
  strategy: StepEvidence['readStrategy'];
  xdeRead?: NativeXdeRead;
}): Promise<GeometrySubject> => {
  const unit = options.loadOptions.unit ?? 'mm';
  const triangles = options.payload.triangles ?? [];
  const hasMesh = triangles.length > 0;
  const meshBuffer = trianglesToMeshBuffer(triangles);
  const meshResult = await loadMesh({
    source: {
      format: 'mesh-buffer',
      name: options.loadOptions.name ?? options.bytes.source.name ?? 'step-subject',
      positions: meshBuffer.positions,
      indices: meshBuffer.indices,
    },
    unit,
    parameters: options.loadOptions.parameters,
  });
  if (!meshResult.success) {
    throw new Error(meshResult.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
  }
  const brep = normalizeBrepEvidence(options.payload.brep, collectFaceFacts(options.xdeRead));
  const payloadStepCapabilities = options.payload.step?.capabilities ?? [];
  const step: StepEvidence = {
    schema: extractStepSchema(options.bytes.text),
    unit,
    productStructure: extractProducts(options.bytes.text),
    readStrategy: options.strategy,
    capabilities: [
      { feature: 'product-structure', supported: true },
      {
        feature: 'color',
        supported: Boolean(
          payloadStepCapabilities.some((capability) => capability.feature === 'color' && capability.supported),
        ),
      },
      {
        feature: 'material',
        supported: Boolean(
          payloadStepCapabilities.some((capability) => capability.feature === 'material' && capability.supported),
        ),
      },
      {
        feature: 'geometric-tolerance',
        supported: false,
        reason: 'GeoSpec P0 reports unsupported AP242 PMI/GD&T evidence explicitly.',
      },
    ],
    xde: options.xdeRead?.xde,
  };
  return {
    ...meshResult.subject,
    brep,
    step,
    provenance: {
      source: options.bytes.source,
      unit,
      loader: 'opencascade-step',
      contentHash: await hashBytes(options.bytes.bytes),
      parameters: options.loadOptions.parameters,
    },
    capabilities: stepCapabilities({ brep, hasMesh }),
    diagnostics: [
      ...(options.payload.diagnostics ?? []),
      ...(options.xdeRead?.diagnostic ? [options.xdeRead.diagnostic] : []),
    ],
    nativeXde: options.xdeRead?.nativeXde,
  };
};

/**
 * Load STEP/XDE/BRep evidence into a GeoSpec geometry subject.
 *
 * @param options - STEP source and loading options.
 * @returns A geometry subject with STEP, BRep, and mesh evidence.
 * @public
 */
export const loadStep = async (options: LoadStepOptions): Promise<GeometrySubject> => {
  options.onProgress?.({ phase: 'read-source', bytesRead: 0 });
  const bytes = await forensicAsync('load.readSource', async () => readStepSource(options));
  options.onProgress?.({ phase: 'parse-step', bytesRead: bytes.bytes.byteLength });
  const module = await resolveNativeStepBackend({
    nativeStepBackend: options.nativeStepBackend,
    openCascade: options.openCascade,
  });
  const native = module
    ? await forensicAsync('load.native.analyzeReader', async () =>
        readNativeStep({ bytes, loadOptions: options, module }),
      )
    : undefined;
  if (!module || !native) {
    throw new Error(
      'GeoSpec native STEP reader is unavailable. Use geospec/native/opencascade/single or pass a nativeStepBackend module with GeoSpecStepStreamReader.',
    );
  }
  options.onProgress?.({ phase: 'mesh-brep', bytesRead: bytes.bytes.byteLength });
  const xdeRead = forensicSync('load.native.xdeReader', () => readNativeXde({ text: bytes.text, module }));
  try {
    return await forensicAsync('load.buildSubject', async () =>
      buildStepSubject({ bytes, loadOptions: options, payload: native.payload, strategy: native.strategy, xdeRead }),
    );
  } catch (error) {
    // The subject takes ownership of the native XDE handle on success; on a
    // build failure it never receives it, so delete it here to avoid a leak.
    xdeRead?.nativeXde?.delete?.();
    throw error;
  }
};

/**
 * Create a {@link loadStep} function with shared defaults.
 *
 * @param defaults - STEP loading defaults.
 * @returns A configured STEP loader.
 * @public
 */
export const createStepLoader =
  (defaults: CreateStepLoaderOptions = {}): GeoSpecStepLoader =>
  async (options: LoadStepOptions): Promise<GeometrySubject> =>
    loadStep({
      ...defaults,
      ...options,
      nativeStepBackend: options.nativeStepBackend ?? defaults.nativeStepBackend,
      openCascade: options.openCascade ?? defaults.openCascade,
    });
