import { loadMesh } from '#mesh/load-mesh.js';
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
  const expression = /PRODUCT\s*\(\s*'([^']*)'/giu;
  let match: RegExpExecArray | undefined;
  while ((match = expression.exec(text) ?? undefined) !== undefined) {
    const name = match[1]?.trim();
    if (name) {
      products.push({ name, path: `product[${products.length}]` });
    }
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

// One STEP-XDE read yields structure, names, and properties together; the
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
  { kind: 'brep', feature: 'wall-thickness' },
];

const stepCapabilities = (options: { brep: BrepEvidence | undefined; hasMesh: boolean }): GeometryCapability[] => [
  ...(options.hasMesh ? meshCapabilities : []),
  ...stepEvidenceCapabilities,
  ...(options.brep ? brepCapabilities : []),
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

const normalizeBrepEvidence = (brep: BrepEvidence | undefined): BrepEvidence | undefined => {
  if (!brep?.circularHoles) {
    return brep;
  }

  return {
    ...brep,
    circularHoles: brep.circularHoles.map((hole) => {
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
    }),
  };
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
  const brep = normalizeBrepEvidence(options.payload.brep);
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
  const bytes = await readStepSource(options);
  options.onProgress?.({ phase: 'parse-step', bytesRead: bytes.bytes.byteLength });
  const module = await resolveNativeStepBackend({
    nativeStepBackend: options.nativeStepBackend,
    openCascade: options.openCascade,
  });
  const native = module ? await readNativeStep({ bytes, loadOptions: options, module }) : undefined;
  if (!module || !native) {
    throw new Error(
      'GeoSpec native STEP reader is unavailable. Use geospec/native/opencascade/single or pass a nativeStepBackend module with GeoSpecStepStreamReader.',
    );
  }
  options.onProgress?.({ phase: 'mesh-brep', bytesRead: bytes.bytes.byteLength });
  const xdeRead = readNativeXde({ text: bytes.text, module });
  return buildStepSubject({ bytes, loadOptions: options, payload: native.payload, strategy: native.strategy, xdeRead });
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
