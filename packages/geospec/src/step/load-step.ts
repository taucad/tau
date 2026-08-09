import { getGeoSpecEvidenceCache } from '#cache/evidence-cache.js';
import type { GeoSpecEvidenceCodec } from '#cache/evidence-cache.js';
import {
  decodeSectionedPayload,
  encodeSectionedPayload,
  sectionToFloat64,
  typedArrayBytes,
} from '#cache/section-codec.js';
import { loadMesh } from '#mesh/load-mesh.js';
import { ensureManifoldModule } from '#mesh/manifold-module.js';
import { ensureOpenCascadeModule } from '#native/opencascade-module.js';
import { forensicAsync, forensicEnabled, forensicSync } from '#runner/forensic.js';
import { createBrepEvidenceLedger } from '#step/evidence-ledger.js';
import type {
  GeometryCapability,
  GeometrySource,
  GeometrySubject,
  OccurrenceFaceMeshFetcher,
  OccurrenceMeshFetcher,
  StepEvidence,
} from '#mesh/types.js';
import type {
  CreateStepLoaderOptions,
  GeoSpecNativeStepBackend,
  GeoSpecNativeXdeReadResult,
  GeoSpecOpenCascadeStepModule,
  LoadStepOptions,
  XdeReadResult,
} from '#step/types.js';

/**
 * Function shape returned by {@link createStepLoader}.
 *
 * @public
 */
export type GeoSpecStepLoader = (options: LoadStepOptions) => Promise<GeometrySubject>;

type StepBytes = {
  bytes: Uint8Array<ArrayBuffer>;
  text: string;
  source: GeometrySource;
};

const defaultMeshLinearTolerance = 0.01;
const defaultMeshAngularToleranceDegrees = 15;
const defaultMaxBytes = 256 * 1024 * 1024;

// R13: default work-unit budget for the wall-thickness facet (one unit = one
// exact extrema or one material-interval proof). Generous — today's largest
// corpus subject (the 666-solid assembly) consumes ~43k units under the eager
// algorithm — so a healthy subject never false-fails; the runner can lower it.
const defaultWallThicknessWorkUnitBudget = 250_000;

const resolveWallThicknessWorkUnitBudget = (): number => {
  const raw = Number(process.env['GEOSPEC_WALL_WORK_UNIT_BUDGET']);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : defaultWallThicknessWorkUnitBudget;
};

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

/**
 * Parse a native XDE `resultJson()` payload into a complete {@link XdeReadResult},
 * defaulting evidence arrays a pre-GDT wasm build does not emit.
 *
 * @param json - Raw `resultJson()` payload from the native reader.
 * @returns Structured read result with every evidence array present.
 * @public
 */
export const parseXdeReadResultJson = (json: string): XdeReadResult => {
  const raw = JSON.parse(json) as Partial<XdeReadResult>;
  return {
    occurrences: raw.occurrences ?? [],
    subshapeNames: raw.subshapeNames ?? [],
    datumPlacements: raw.datumPlacements ?? [],
    semanticDatums: raw.semanticDatums ?? [],
    datumSystems: raw.datumSystems ?? [],
    supplementalPlanes: raw.supplementalPlanes ?? [],
    freeShapeCount: raw.freeShapeCount ?? 0,
  };
};

type NativeXdeRead = {
  xde: XdeReadResult;
  nativeXde: GeoSpecNativeXdeReadResult;
  strategy: StepEvidence['readStrategy'];
};

// R8: which read path a subject takes is a pure function of the load options
// and the backend — never of the artifact — so it resolves without reading.
// That keeps `readStrategy` provenance identical on a warm subject that never
// parses. `undefined` means this backend cannot read at all (load-fatal).
const resolveReadStrategy = (options: {
  bytes: StepBytes;
  loadOptions: LoadStepOptions;
  module: GeoSpecNativeStepBackend;
}): StepEvidence['readStrategy'] | undefined => {
  const reader = options.module.GeoSpecXdeReader;
  if (!reader) {
    return undefined;
  }
  const shared = { inputKind: options.bytes.source.kind, bytesRead: options.bytes.bytes.byteLength };
  if (options.loadOptions.streaming !== 'filesystem') {
    return { strategy: 'native-stream', ...shared, nativeReadStream: true, copiedToEmscriptenFs: false };
  }
  if (typeof reader.readFile === 'function' && options.module.FS) {
    return { strategy: 'filesystem', ...shared, nativeReadStream: false, copiedToEmscriptenFs: true };
  }
  return undefined;
};

// The single AP242 read per load (lazy-evidence blueprint R3, Finding 3): one
// STEP-XDE read yields structure, names, and datum placements together, and
// retains the placed shapes plus the analysis root so every BRep evidence
// facet and exact proof call runs without a second parse. Parse/transfer
// failures stay load-fatal (blueprint A12) — analysis failures surface later
// as memoized facet diagnostics.
// GEOSPEC_FORENSIC=1 turns on native per-phase [FORENSIC] stderr timing. This
// is an argument to the read, so it is part of the persisted structure's key.
const nativeReaderOptionsJson = (): string => JSON.stringify({ forensic: forensicEnabled() });

const readNativeXde = (options: {
  bytes: StepBytes;
  loadOptions: LoadStepOptions;
  module: GeoSpecNativeStepBackend;
  strategy: StepEvidence['readStrategy'];
}): GeoSpecNativeXdeReadResult => {
  const reader = options.module.GeoSpecXdeReader;
  if (!reader) {
    throw new Error('GeoSpec native XDE reader disappeared between strategy resolution and the read.');
  }
  const readerOptionsJson = nativeReaderOptionsJson();
  let result: GeoSpecNativeXdeReadResult;
  if (options.strategy.strategy === 'native-stream') {
    result = reader.readText(options.bytes.text, readerOptionsJson);
  } else {
    const path = `/geospec-step-${Date.now()}-${Math.random().toString(16).slice(2)}.step`;
    options.module.FS?.writeFile(path, options.bytes.bytes);
    try {
      result = reader.readFile!(path, readerOptionsJson);
    } finally {
      options.module.FS?.unlink(path);
    }
  }
  if (!result.isSuccess()) {
    let message = 'GeoSpec native XDE reader failed.';
    try {
      const parsed = JSON.parse(result.resultJson()) as { error?: string };
      message = parsed.error ?? message;
    } catch {
      // Keep the generic message when the native error payload is unreadable.
    }
    result.delete?.();
    throw new Error(message);
  }
  return result;
};

/** Optional facets a backend build exposes; drives the engine seams below. */
type NativeXdeCapabilities = { occurrenceMesh: boolean; occurrenceFaceMesh: boolean };

type NativeXdeMaterializer = {
  /** Parse (once) and return the live handle; throws exactly as an eager load did. */
  force: () => GeoSpecNativeXdeReadResult;
  isDeleted: () => boolean;
  delete: () => void;
};

// R8: the parse itself, deferred behind one closure and memoized. Everything a
// warm run needs (the XDE structure, the facet values, the proof payloads) is
// persisted evidence, so on a fully-cached subject `force` is never called and
// the 13 MB OCCT reader never runs. `isDeleted`/`delete` answer WITHOUT forcing:
// the ledger probes liveness before every facet read (evidence-ledger.ts), and
// a liveness probe that parsed would defeat the whole recommendation.
const createNativeXdeMaterializer = (options: {
  bytes: StepBytes;
  loadOptions: LoadStepOptions;
  module: GeoSpecNativeStepBackend;
  strategy: StepEvidence['readStrategy'];
}): NativeXdeMaterializer => {
  let handle: GeoSpecNativeXdeReadResult | undefined;
  let deleted = false;
  return {
    force: (): GeoSpecNativeXdeReadResult => {
      if (deleted) {
        throw new Error('the native XDE handle was disposed before this facet was demanded');
      }
      handle ??= forensicSync('load.native.xdeReader', () => readNativeXde(options));
      return handle;
    },
    isDeleted: (): boolean => deleted || (handle?.isDeleted?.() ?? false),
    // Idempotent by ownership: deleting an Emscripten handle twice aborts the
    // wasm, and a subject can be disposed by more than one path (the resource
    // scope, plus a caller unwinding a failed load). The handle guards itself
    // rather than making every caller track whether it already fired.
    delete: (): void => {
      if (deleted) {
        return;
      }
      deleted = true;
      handle?.delete?.();
    },
  };
};

// R8: read the optional-facet table off the embind result PROTOTYPE, so a warm
// subject decides its engine seams (hybrid void, contact patches) with zero
// parse. The answer is identical either way — the prototype is the very object
// a handle would delegate to. Backends without the class (test fakes, hand-built
// modules) are probed by materializing, which for a fake costs nothing.
const probeNativeXdeCapabilities = (options: {
  module: GeoSpecNativeStepBackend;
  force: () => GeoSpecNativeXdeReadResult;
}): NativeXdeCapabilities => {
  const table: Partial<GeoSpecNativeXdeReadResult> = options.module.GeoSpecXdeReadResult?.prototype ?? options.force();
  return {
    occurrenceMesh: typeof table.occurrenceMeshTriangles === 'function',
    occurrenceFaceMesh: typeof table.occurrenceFaceMeshTriangles === 'function',
  };
};

// R8: the subject's native surface, materializing on first real call. Optional
// facets are installed per the probed capabilities so `subject.occurrenceMesh`
// stays present-or-absent exactly as an eager load left it — consumers read
// presence as a capability signal and fall back to other engines on absence.
const createLazyNativeXde = (options: {
  materializer: NativeXdeMaterializer;
  capabilities: NativeXdeCapabilities;
}): GeoSpecNativeXdeReadResult => {
  const { force } = options.materializer;
  return {
    isSuccess: () => force().isSuccess(),
    resultJson: () => force().resultJson(),
    extrema: (...extremaArguments: Parameters<GeoSpecNativeXdeReadResult['extrema']>) =>
      force().extrema(...extremaArguments),
    classifyPoints: (occurrence, pointsJson) => force().classifyPoints(occurrence, pointsJson),
    commonVolume: (occurrenceA, occurrenceB) => force().commonVolume(occurrenceA, occurrenceB),
    faceFacts: (occurrence) => force().faceFacts(occurrence),
    analysisSummaryJson: () => force().analysisSummaryJson(),
    analysisMassPropertiesJson: () => force().analysisMassPropertiesJson(),
    analysisValidityJson: (optionsJson) => force().analysisValidityJson(optionsJson),
    analysisFaceFeaturesJson: () => force().analysisFaceFeaturesJson(),
    analysisWallThicknessJson: (optionsJson) => force().analysisWallThicknessJson(optionsJson),
    meshTriangles: (optionsJson) => force().meshTriangles(optionsJson),
    meshTrianglePointer: () => force().meshTrianglePointer(),
    meshTriangleCount: () => force().meshTriangleCount(),
    ...(options.capabilities.occurrenceMesh
      ? {
          occurrenceMeshTriangles: (occurrence: number, optionsJson: string): string =>
            force().occurrenceMeshTriangles!(occurrence, optionsJson),
        }
      : {}),
    ...(options.capabilities.occurrenceFaceMesh
      ? {
          occurrenceFaceMeshTriangles: (occurrence: number, face: number, optionsJson: string): string =>
            force().occurrenceFaceMeshTriangles!(occurrence, face, optionsJson),
        }
      : {}),
    isDeleted: options.materializer.isDeleted,
    delete: options.materializer.delete,
  };
};

// R8: the XDE structure every selector index reads is a pure function of the
// artifact bytes and of how we asked the reader to read them, so it persists
// subject-scoped. Resolved EAGERLY at load, which is what keeps parse/transfer
// failures load-fatal (blueprint A12): a cold subject parses right here and
// throws from `loadStep` exactly as before, while a warm subject replays a
// structure that a successful parse already produced — so skipping the re-parse
// can never hide a failure.
//
// The key carries both read arguments (the reader options JSON and the read
// strategy) alongside the content hash, mirroring the `brep-facet` precedent: a
// key has to distinguish any two reads that could return different structures,
// and neither argument is worth assuming inert. The cost is one re-parse when a
// diagnostic flag flips, never a stale structure.
const readXdeStructure = (options: {
  contentHash: string;
  readerOptionsJson: string;
  strategy: StepEvidence['readStrategy'];
  force: () => GeoSpecNativeXdeReadResult;
}): XdeReadResult => {
  const compute = (): XdeReadResult => parseXdeReadResultJson(options.force().resultJson());
  const cache = getGeoSpecEvidenceCache();
  return cache
    ? (cache.getOrCompute({
        family: 'xde-read',
        version: 1,
        key: {
          subjectHash: options.contentHash,
          options: options.readerOptionsJson,
          strategy: options.strategy.strategy,
        },
        compute,
      }) ?? compute())
    : compute();
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
    return (await ensureOpenCascadeModule()) as GeoSpecOpenCascadeStepModule;
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
  // Finding 8 fix: capabilities describe what the loader can compute for the
  // subject, not which facets happen to be materialized. Wall thickness is
  // always offered on a successful native read; an invalid or open subject
  // reports its unsupported-evidence diagnostic at proof time instead (§5).
  { kind: 'brep', feature: 'wall-thickness' },
];

const stepCapabilities = (options: { hasBrep: boolean; hasMesh: boolean }): GeometryCapability[] => [
  ...(options.hasMesh ? meshCapabilities : []),
  ...stepEvidenceCapabilities,
  ...(options.hasBrep ? brepCapabilities : []),
];

// Triangle soup for mesh evidence rides the meshTriangles facet: the facet
// tessellates the retained root shape and the triangles are copied out of the
// wasm heap in one pass. `mesh: false` loads skip tessellation entirely.
const readMeshTriangles = (options: {
  loadOptions: LoadStepOptions;
  native: GeoSpecNativeXdeReadResult;
  module: GeoSpecNativeStepBackend;
}): number[] => {
  if (options.loadOptions.mesh === false) {
    return [];
  }
  const meshOptionsJson = JSON.stringify({
    mesh: true,
    meshLinearTolerance: options.loadOptions.meshLinearTolerance ?? defaultMeshLinearTolerance,
    meshAngularToleranceDegrees: options.loadOptions.meshAngularToleranceDegrees ?? defaultMeshAngularToleranceDegrees,
  });
  const summary = JSON.parse(options.native.meshTriangles(meshOptionsJson)) as {
    triangleCount?: number;
    error?: string;
  };
  if (summary.error !== undefined) {
    throw new Error(summary.error);
  }
  const count = summary.triangleCount ?? 0;
  if (count <= 0 || !options.module.HEAPF64) {
    return [];
  }
  const pointer = options.native.meshTrianglePointer();
  if (pointer <= 0) {
    return [];
  }
  const start = pointer / Float64Array.BYTES_PER_ELEMENT;
  return copyHeapFloat64({ heap: options.module.HEAPF64, start, length: count * 9 });
};

// R4: one tessellation payload per (subject, occurrence, deflection) — JSON
// header for the achieved deflection, one binary section for the soup.
const occurrenceMeshCodec: GeoSpecEvidenceCodec<{ triangles: Float64Array<ArrayBuffer>; deflection: number }> = {
  encode: (value) => encodeSectionedPayload({ deflection: value.deflection }, [typedArrayBytes(value.triangles)]),
  decode: (bytes) => {
    const { header, sections } = decodeSectionedPayload(bytes);
    if (sections.length !== 1) {
      throw new Error('occurrence-mesh payload must carry exactly 1 section.');
    }
    return { triangles: sectionToFloat64(sections[0]!), deflection: (header as { deflection: number }).deflection };
  },
};

/**
 * Per-occurrence on-demand tessellation for the hybrid void-occupancy engine
 * (throughput blueprint R6 move 3). Each call re-meshes the placed occurrence
 * at the requested density and copies the soup out of the wasm heap
 * immediately (the retained buffer is shared with the root facet). Works for
 * `mesh: false` loads — void claims tessellate on demand, never at load.
 *
 * R4 (suite audit): the soup is a pure function of (subject content,
 * occurrence, deflection), so successful fetches are memoized on the subject
 * AND persisted as the shared `occurrence-mesh` family — the contact
 * classifier, void occupancy, and overlap all read through this one seam
 * instead of re-tessellating per consumer, per run.
 */
const createOccurrenceMeshFetcher = (options: {
  occurrenceMeshTriangles: (occurrence: number, optionsJson: string) => string;
  native: GeoSpecNativeXdeReadResult;
  module: GeoSpecNativeStepBackend;
  contentHash: string;
}): OccurrenceMeshFetcher => {
  const memo = new Map<string, { triangles: Float64Array<ArrayBuffer>; deflection: number }>();
  const fetchDirect: OccurrenceMeshFetcher = (occurrence, meshOptions) => {
    const summary = JSON.parse(
      options.occurrenceMeshTriangles(
        occurrence,
        JSON.stringify({
          mesh: true,
          meshLinearTolerance: meshOptions.linearDeflection,
          meshAngularToleranceDegrees: meshOptions.angularDeflectionDegrees,
        }),
      ),
    ) as { triangleCount?: number; deflection?: number; error?: string };
    if (summary.error !== undefined) {
      return { error: summary.error };
    }
    const deflection = summary.deflection ?? meshOptions.linearDeflection;
    const count = summary.triangleCount ?? 0;
    if (count <= 0 || !options.module.HEAPF64) {
      return { triangles: new Float64Array(0), deflection };
    }
    const pointer = options.native.meshTrianglePointer();
    if (pointer <= 0) {
      return { triangles: new Float64Array(0), deflection };
    }
    const start = pointer / Float64Array.BYTES_PER_ELEMENT;
    return { triangles: options.module.HEAPF64.slice(start, start + count * 9), deflection };
  };
  return (occurrence, meshOptions) => {
    const memoKey = `${occurrence}:${meshOptions.linearDeflection}:${meshOptions.angularDeflectionDegrees}`;
    const memoized = memo.get(memoKey);
    if (memoized) {
      return memoized;
    }
    const cache = getGeoSpecEvidenceCache();
    let uncachedError: { error: string } | undefined;
    const result = cache
      ? (cache.getOrCompute({
          family: 'occurrence-mesh',
          version: 1,
          key: {
            subjectHash: options.contentHash,
            occurrence,
            linearDeflection: meshOptions.linearDeflection,
            angularDeflectionDegrees: meshOptions.angularDeflectionDegrees,
          },
          codec: occurrenceMeshCodec,
          compute: () => {
            const computed = fetchDirect(occurrence, meshOptions);
            if ('error' in computed) {
              uncachedError = computed;
              return undefined;
            }
            return computed;
          },
        }) ??
        uncachedError ??
        fetchDirect(occurrence, meshOptions))
      : fetchDirect(occurrence, meshOptions);
    if (!('error' in result)) {
      memo.set(memoKey, result);
    }
    return result;
  };
};

/**
 * Per-occurrence-face on-demand tessellation for the topological contact-patch
 * engine (spatial-relationship blueprint R1). Mirrors
 * {@link createOccurrenceMeshFetcher} but tessellates one face by index; the
 * retained buffer is shared with the root facet, so the soup is copied out of
 * the wasm heap immediately. Successful fetches are memoized on the subject
 * (R4) — per-face results stay in-process only, since the contact-patch
 * family already persists their derived patches.
 */
const createOccurrenceFaceMeshFetcher = (options: {
  occurrenceFaceMeshTriangles: (occurrence: number, face: number, optionsJson: string) => string;
  native: GeoSpecNativeXdeReadResult;
  module: GeoSpecNativeStepBackend;
}): OccurrenceFaceMeshFetcher => {
  const memo = new Map<string, { triangles: Float64Array<ArrayBuffer>; deflection: number }>();
  return (occurrence, face, meshOptions) => {
    const memoKey = `${occurrence}:${face}:${meshOptions.linearDeflection}:${meshOptions.angularDeflectionDegrees}`;
    const memoized = memo.get(memoKey);
    if (memoized) {
      return memoized;
    }
    const summary = JSON.parse(
      options.occurrenceFaceMeshTriangles(
        occurrence,
        face,
        JSON.stringify({
          mesh: true,
          meshLinearTolerance: meshOptions.linearDeflection,
          meshAngularToleranceDegrees: meshOptions.angularDeflectionDegrees,
        }),
      ),
    ) as { triangleCount?: number; deflection?: number; error?: string };
    if (summary.error !== undefined) {
      return { error: summary.error };
    }
    const deflection = summary.deflection ?? meshOptions.linearDeflection;
    const count = summary.triangleCount ?? 0;
    if (count <= 0 || !options.module.HEAPF64) {
      const empty = { triangles: new Float64Array(0), deflection };
      memo.set(memoKey, empty);
      return empty;
    }
    const pointer = options.native.meshTrianglePointer();
    if (pointer <= 0) {
      const empty = { triangles: new Float64Array(0), deflection };
      memo.set(memoKey, empty);
      return empty;
    }
    const start = pointer / Float64Array.BYTES_PER_ELEMENT;
    const result = { triangles: options.module.HEAPF64.slice(start, start + count * 9), deflection };
    memo.set(memoKey, result);
    return result;
  };
};

const buildStepSubject = async (options: {
  bytes: StepBytes;
  loadOptions: LoadStepOptions;
  xdeRead: NativeXdeRead;
  module: GeoSpecNativeStepBackend;
  contentHash: string;
  capabilities: NativeXdeCapabilities;
}): Promise<GeometrySubject> => {
  const unit = options.loadOptions.unit ?? 'mm';
  // `mesh: false` skips tessellation entirely and so never touches the native
  // handle (R8: the whole v8 corpus loads this way and stays parse-free warm);
  // a `mesh: true` load genuinely needs the root soup at load time and forces
  // the parse here, warm or cold.
  const triangles = forensicSync('load.native.meshTriangles', () =>
    readMeshTriangles({ loadOptions: options.loadOptions, native: options.xdeRead.nativeXde, module: options.module }),
  );
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
  // R5 subject-scope identity — resolved before the ledger so persisted facets
  // key on the artifact bytes (R8 computes it earlier still, ahead of any
  // native work, so a warm subject can key its whole load on it).
  const { contentHash } = options;
  // Hybrid void engine (R6 move 3): resolve the Manifold module here, while
  // still async, so the SYNC proof path's engine choice is deterministic —
  // ready or permanently failed by proof time, never timing-dependent. A
  // failed init leaves the sync getter empty and every void claim on the
  // exact path; it must never fail the load.
  const occurrenceMeshTriangles = options.xdeRead.nativeXde.occurrenceMeshTriangles?.bind(options.xdeRead.nativeXde);
  const occurrenceFaceMeshTriangles = options.xdeRead.nativeXde.occurrenceFaceMeshTriangles?.bind(
    options.xdeRead.nativeXde,
  );
  if (options.capabilities.occurrenceMesh) {
    await ensureManifoldModule().catch(() => undefined);
  }
  const brep = createBrepEvidenceLedger({
    native: options.xdeRead.nativeXde,
    occurrenceCount: options.xdeRead.xde.occurrences.length,
    facetOptionsJson: JSON.stringify({ forensic: forensicEnabled() }),
    wallThicknessOptionsJson: JSON.stringify({
      forensic: forensicEnabled(),
      workUnitBudget: resolveWallThicknessWorkUnitBudget(),
    }),
    contentHash,
  });
  const step: StepEvidence = {
    schema: extractStepSchema(options.bytes.text),
    unit,
    productStructure: extractProducts(options.bytes.text),
    readStrategy: options.xdeRead.strategy,
    capabilities: [
      { feature: 'product-structure', supported: true },
      { feature: 'color', supported: false },
      { feature: 'material', supported: false },
      {
        feature: 'geometric-tolerance',
        supported: false,
        reason: 'GeoSpec P0 reports unsupported AP242 PMI/GD&T evidence explicitly.',
      },
    ],
    xde: options.xdeRead.xde,
  };
  return {
    ...meshResult.subject,
    brep,
    step,
    provenance: {
      source: options.bytes.source,
      unit,
      loader: 'opencascade-step',
      contentHash,
      parameters: options.loadOptions.parameters,
    },
    capabilities: stepCapabilities({ hasBrep: true, hasMesh }),
    diagnostics: [],
    nativeXde: options.xdeRead.nativeXde,
    ...(occurrenceMeshTriangles
      ? {
          occurrenceMesh: createOccurrenceMeshFetcher({
            occurrenceMeshTriangles,
            native: options.xdeRead.nativeXde,
            module: options.module,
            contentHash,
          }),
        }
      : {}),
    ...(occurrenceFaceMeshTriangles
      ? {
          occurrenceFaceMesh: createOccurrenceFaceMeshFetcher({
            occurrenceFaceMeshTriangles,
            native: options.xdeRead.nativeXde,
            module: options.module,
          }),
        }
      : {}),
  };
};

/**
 * Load STEP/XDE/BRep evidence into a GeoSpec geometry subject.
 *
 * At most one AP242/XDE read per subject, and none at all when the subject's
 * evidence is already cached (R8): the read is deferred behind the returned
 * subject's native surface and fires on the first proof that genuinely needs
 * live geometry. Every `subject.brep` field materializes lazily on first access
 * via the evidence facet ledger.
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
  const strategy = module ? resolveReadStrategy({ bytes, loadOptions: options, module }) : undefined;
  if (!module || !strategy) {
    throw new Error(
      'GeoSpec native STEP reader is unavailable. Use geospec/native/opencascade/single or pass a nativeStepBackend module with GeoSpecXdeReader.',
    );
  }
  // R8: subject identity comes from the artifact bytes, ahead of any native
  // work — it is the key every persisted family already uses, so resolving it
  // first is what lets a warm subject skip the parse entirely.
  const contentHash = await hashBytes(bytes.bytes);
  const materializer = createNativeXdeMaterializer({ bytes, loadOptions: options, module, strategy });
  try {
    const xde = readXdeStructure({
      contentHash,
      readerOptionsJson: nativeReaderOptionsJson(),
      strategy,
      force: materializer.force,
    });
    const capabilities = probeNativeXdeCapabilities({ module, force: materializer.force });
    const nativeXde = createLazyNativeXde({ materializer, capabilities });
    options.onProgress?.({ phase: 'mesh-brep', bytesRead: bytes.bytes.byteLength });
    return await forensicAsync('load.buildSubject', async () =>
      buildStepSubject({
        bytes,
        loadOptions: options,
        xdeRead: { xde, nativeXde, strategy },
        module,
        contentHash,
        capabilities,
      }),
    );
  } catch (error) {
    // The subject takes ownership of the native XDE handle on success; on a
    // build failure it never receives it, so delete it here to avoid a leak.
    // No-ops when nothing was ever parsed.
    materializer.delete();
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
