/**
 * The STEP subject store.
 *
 * One AP242 read per load (B6: the reader is the single evidence substrate),
 * retained so every later proof runs against the same transferred shapes. The
 * read itself is eager — a parse failure has to stay load-fatal (A12) — while
 * all BRep evidence hangs off the lazy facet ledger.
 *
 * Ordering is contract: the mesh facet runs before any BRep facet is read.
 * `BRepMesh` writes triangulations onto the shared TShapes and `BRepBndLib`
 * prefers a triangulation when one exists, so summary/face-feature bounds are
 * tessellation-derived by construction (D-3). Face *facts* are pinned
 * `useTriangulation=false` natively, so no relationship verdict can see the
 * tessellation (D5).
 *
 * @module
 */

import { hashString, sha256Bytes } from '@taucad/utils/hash';
import { GeoSpecModelLoadError } from 'geospec/model';
import { copyTriangleSoup, getOpenCascadeStepModule } from '#native/opencascade-module.js';
import { buildSoupStats, toMeshBufferPositions } from '#mesh/soup.js';
import { forensicSpan, forensicSpanAsync } from '#runner/forensic.js';
import type { ForensicSink } from '#runner/forensic.js';
import { createBrepEvidenceLedger } from '#step/evidence-ledger.js';
import { ensureNodeEvidenceStoreInstalled } from '#cache/node-evidence-store.js';
import { createNativeXdeFacade } from '#step/native-xde-facade.js';
import { createOccurrenceMeshFetchers } from '#step/occurrence-mesh.js';
import { readCachedXdeRead, writeCachedXdeRead, xdeReadCacheKey } from '#step/xde-read-cache.js';
import type {
  GeometryCapability,
  GeometrySource,
  GeometryStats,
  GeometrySubject,
  GeoSpecUnit,
  StepEvidence,
} from '#mesh/types.js';
import type {
  GeoSpecNativeStepBackend,
  GeoSpecNativeXdeReadResult,
  LoadStepOptions,
  StepSource,
  XdeReadResult,
} from '#step/types.js';

/** Default linear tessellation tolerance, in millimetres. */
export const defaultMeshLinearTolerance = 0.01;

/** Default angular tessellation tolerance, in degrees. */
export const defaultMeshAngularToleranceDegrees = 15;

/** Default deterministic work-unit budget for the wall-thickness facet. */
export const defaultWallWorkUnitBudget = 250_000;

/**
 * A configured STEP loader.
 *
 * @public
 */
export type GeoSpecStepLoader = (options: LoadStepOptions) => Promise<GeometrySubject>;

const loadFailure = (message: string, details?: unknown): GeoSpecModelLoadError =>
  new GeoSpecModelLoadError([
    {
      code: 'GEOSPEC_STEP_LOAD_FAILED',
      severity: 'error',
      message,
      suggestion: 'Check that the source is a readable AP242/AP214 STEP part 21 file.',
      ...(details === undefined ? {} : { details }),
    },
  ]);

type NormalizedSource = {
  bytes: Uint8Array<ArrayBuffer>;
  kind: GeometrySource['kind'];
  path?: string;
};

const concatChunks = (chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

const readFilePath = async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
  const filesystem = await import('node:fs/promises');
  const contents = await filesystem.readFile(path);
  return new Uint8Array(contents.buffer, contents.byteOffset, contents.byteLength) as Uint8Array<ArrayBuffer>;
};

const normalizeSource = async (source: StepSource): Promise<NormalizedSource> => {
  if (typeof source === 'string') {
    return { bytes: await readFilePath(source), kind: 'path', path: source };
  }
  if (source instanceof URL) {
    if (source.protocol !== 'file:') {
      throw loadFailure(`GeoSpec cannot read the STEP source '${source.href}': only file: URLs are supported.`);
    }
    const url = await import('node:url');
    const path = url.fileURLToPath(source);
    return { bytes: await readFilePath(path), kind: 'url', path };
  }
  if (source instanceof Uint8Array) {
    return { bytes: source, kind: 'bytes' };
  }
  if (source instanceof ArrayBuffer) {
    return { bytes: new Uint8Array(source), kind: 'array-buffer' };
  }
  if (source instanceof Blob) {
    return { bytes: new Uint8Array(await source.arrayBuffer()), kind: source instanceof File ? 'file' : 'blob' };
  }
  if (source instanceof ReadableStream) {
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    for await (const chunk of source as unknown as AsyncIterable<Uint8Array<ArrayBuffer>>) {
      chunks.push(chunk);
    }
    return { bytes: concatChunks(chunks), kind: 'readable-stream' };
  }
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of source) {
    chunks.push(chunk);
  }
  return { bytes: concatChunks(chunks), kind: 'async-iterable' };
};

const stepHeaderValue = (text: string, pattern: RegExp): string | undefined => pattern.exec(text)?.[1];

/**
 * Parse the native reader's JSON payload into a structured XDE read result.
 *
 * @param json - JSON emitted by the kernel's XDE reader.
 * @returns The structured read result.
 * @public
 */
export const parseXdeReadResultJson = (json: string): XdeReadResult => {
  const parsed = JSON.parse(json) as Partial<XdeReadResult> & { error?: string };
  if (parsed.error !== undefined) {
    throw loadFailure(`GeoSpec's AP242 reader failed: ${parsed.error}`, { native: parsed.error });
  }
  return {
    occurrences: parsed.occurrences ?? [],
    subshapeNames: parsed.subshapeNames ?? [],
    datumPlacements: parsed.datumPlacements ?? [],
    semanticDatums: parsed.semanticDatums ?? [],
    datumSystems: parsed.datumSystems ?? [],
    supplementalPlanes: parsed.supplementalPlanes ?? [],
    freeShapeCount: parsed.freeShapeCount ?? 0,
  };
};

const stepCapabilities = (): StepEvidence['capabilities'] => [
  { feature: 'product-structure', supported: true },
  { feature: 'color', supported: false },
  { feature: 'material', supported: false },
  {
    feature: 'geometric-tolerance',
    supported: false,
    reason: 'GeoSpec P0 reports unsupported AP242 PMI/GD&T evidence explicitly.',
  },
];

const subjectCapabilities = (hasMesh: boolean): GeometryCapability[] => [
  { kind: 'step', feature: 'schema' },
  { kind: 'step', feature: 'units' },
  { kind: 'step', feature: 'product-structure' },
  { kind: 'step', feature: 'reader-provenance' },
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
  ...(hasMesh
    ? ([
        { kind: 'mesh', feature: 'triangles' },
        { kind: 'mesh', feature: 'bounding-box' },
        { kind: 'mesh', feature: 'connected-components' },
        { kind: 'mesh', feature: 'watertightness' },
        { kind: 'mesh', feature: 'surface-area' },
        { kind: 'mesh', feature: 'volume' },
        { kind: 'mesh', feature: 'center-of-mass' },
        { kind: 'mesh', feature: 'distance' },
        { kind: 'mesh', feature: 'component-overlap' },
      ] satisfies GeometryCapability[])
    : []),
];

const emptyStats = (): GeometryStats => buildSoupStats(new Float64Array(0), 0, '');

type NativeReadRequest = {
  backend: GeoSpecNativeStepBackend;
  text: string;
  strategy: 'native-stream' | 'filesystem';
  readerOptionsJson: string;
};

const readNative = ({ backend, text, strategy, readerOptionsJson }: NativeReadRequest): GeoSpecNativeXdeReadResult => {
  const reader = backend.GeoSpecXdeReader;
  if (!reader) {
    throw loadFailure('The GeoSpec kernel build exposes no GeoSpecXdeReader binding.');
  }
  if (strategy === 'native-stream') {
    return reader.readText(text, readerOptionsJson);
  }
  const filesystem = backend.FS;
  if (!filesystem) {
    throw loadFailure(
      "The 'filesystem' STEP strategy needs an Emscripten filesystem the kernel build does not expose.",
    );
  }
  // A scratch path inside the kernel's in-memory filesystem, unlinked below —
  // it needs a stable unique name, not a digest, so this stays synchronous.
  const path = `/geospec-${hashString(text)}.step`;
  filesystem.writeFile(path, text);
  try {
    return reader.readFile(path, readerOptionsJson);
  } finally {
    filesystem.unlink(path);
  }
};

/**
 * Load STEP/XDE/BRep evidence into a GeoSpec geometry subject.
 *
 * @param options - STEP source, units, streaming mode, and mesh settings.
 * @returns A GeoSpec geometry subject carrying STEP, BRep and mesh evidence.
 * @throws GeoSpecModelLoadError when the source cannot be read or parsed.
 * @public
 */
/** Internal observed STEP load used by the configured model loader. @internal */
export const loadStepObserved = async (options: LoadStepOptions, forensic?: ForensicSink): Promise<GeometrySubject> => {
  options.signal?.throwIfAborted();
  options.onProgress?.({ phase: 'read-source' });
  const source = await forensicSpanAsync('load.step.bytes', async () => normalizeSource(options.source), forensic);
  const bytesRead = source.bytes.byteLength;
  if (options.maxBytes !== undefined && bytesRead > options.maxBytes) {
    throw loadFailure(`The STEP source is ${bytesRead} bytes, over the ${options.maxBytes}-byte limit.`);
  }
  options.signal?.throwIfAborted();

  const text = new TextDecoder().decode(source.bytes);
  const contentHash = `sha256:${await sha256Bytes(source.bytes)}`;
  const unit: GeoSpecUnit = options.unit ?? 'mm';
  const meshLinearTolerance = options.meshLinearTolerance ?? defaultMeshLinearTolerance;
  const meshAngularToleranceDegrees = options.meshAngularToleranceDegrees ?? defaultMeshAngularToleranceDegrees;
  const mesh = options.mesh ?? true;
  const readerOptionsJson = JSON.stringify({
    mesh,
    meshLinearTolerance,
    meshAngularToleranceDegrees,
  });
  const strategy: 'native-stream' | 'filesystem' = options.streaming === 'filesystem' ? 'filesystem' : 'native-stream';

  const backend = options.nativeStepBackend ?? options.openCascade ?? (await getOpenCascadeStepModule());
  options.signal?.throwIfAborted();
  options.onProgress?.({ phase: 'parse-step', bytesRead });

  // One read per load, performed at most once, whether it is forced now (cache
  // miss) or deferred behind the R8 proxy (cache hit).
  //
  // Tessellating is PART of the read, not a step after it (D-3). `BRepMesh`
  // writes triangulations onto the shared TShapes and `BRepBndLib` silently
  // prefers a triangulation when one exists, so a BRep facet observes different
  // bounds depending on whether the mesh ran first. Doing it here makes a
  // deferred read byte-identical to an eager one — cache temperature can never
  // reach a verdict.
  let performed: { native: GeoSpecNativeXdeReadResult; meshError: string | undefined } | undefined;
  const performRead = (): GeoSpecNativeXdeReadResult => {
    if (performed) {
      return performed.native;
    }
    const native = forensicSpan(
      'load.step.read',
      () => readNative({ backend, text, strategy, readerOptionsJson }),
      forensic,
    );
    if (!native.isSuccess()) {
      const message = native.resultJson();
      native.delete?.();
      throw loadFailure(`GeoSpec could not read the STEP source: ${message}`, { native: message });
    }
    const summary = mesh
      ? forensicSpan(
          'load.step.tessellate',
          () => JSON.parse(native.meshTriangles(readerOptionsJson)) as { triangleCount?: number; error?: string },
          forensic,
        )
      : { error: 'mesh evidence was not requested' };
    performed = { native, meshError: summary.error };
    return native;
  };

  const primitive = `${options.name ?? options.path ?? 'step'}#0`;
  ensureNodeEvidenceStoreInstalled();
  const cacheKey = await xdeReadCacheKey({ text, readerOptionsJson, strategy });
  const cached = forensicSpan('load.step.peek', () => readCachedXdeRead(cacheKey), forensic);

  let resultJson: string;
  let positions: Float32Array<ArrayBuffer> | undefined;
  let triangleCount = 0;
  if (cached) {
    // Warm: the entry exists only because the read succeeded and parsed, so no
    // reader work happens here at all (B15).
    resultJson = cached.resultJson;
    positions = cached.positions;
    triangleCount = cached.triangleCount;
  } else {
    const native = performRead();
    resultJson = native.resultJson();
    if (performed?.meshError === undefined) {
      triangleCount = native.meshTriangleCount();
      // No await between the native call and the copy: the pointer only stays
      // valid until the next crossing (shared-heap invariant).
      positions = toMeshBufferPositions(copyTriangleSoup(backend, native.meshTrianglePointer(), triangleCount));
    }
  }
  if (mesh) {
    options.onProgress?.({ phase: 'mesh-brep', bytesRead });
  }

  // Parsing is what makes a read fatal (A12); on the warm path the stored bytes
  // already parsed once, so this can only succeed.
  const xde = forensicSpan('load.step.parse', () => parseXdeReadResultJson(resultJson), forensic);
  if (!cached) {
    forensicSpan(
      'load.step.persist',
      () => {
        writeCachedXdeRead(cacheKey, { resultJson, ...(positions === undefined ? {} : { positions }), triangleCount });
      },
      forensic,
    );
  }

  const stats = positions === undefined ? emptyStats() : buildSoupStats(positions, triangleCount, primitive);

  const { facade, handle, materialize } = createNativeXdeFacade({
    read: performRead,
    occurrenceCount: xde.occurrences.length,
    ...(cached ? { cachedResultJson: resultJson } : {}),
  });
  if (!cached) {
    // The read already happened: hand it to the façade so `delete` owns it.
    materialize();
  }
  const facetOptionsJson = JSON.stringify({
    workUnitBudget: defaultWallWorkUnitBudget,
    meshLinearTolerance,
    meshAngularToleranceDegrees,
  });
  const occurrenceMeshes = createOccurrenceMeshFetchers({
    native: facade,
    backend,
    contentHash,
    optionsJson: readerOptionsJson,
  });

  const subject: GeometrySubject = {
    kind: 'geometry-subject',
    mesh: { format: 'mesh-buffer', stats },
    brep: createBrepEvidenceLedger({ handle, facetOptionsJson, contentHash }),
    step: {
      schema: forensicSpan(
        'load.step.header',
        () => stepHeaderValue(text, /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/u),
        forensic,
      ),
      unit,
      productStructure: xde.occurrences.map(({ path, transform }) => ({ name: path, path, transform })),
      readStrategy: {
        strategy,
        inputKind: source.kind,
        bytesRead,
        nativeReadStream: strategy === 'native-stream',
        // A pure function of the strategy, so the field cannot depend on
        // whether this particular load actually touched the reader.
        copiedToEmscriptenFs: strategy === 'filesystem',
      },
      capabilities: stepCapabilities(),
      xde,
    },
    provenance: {
      source: {
        kind: source.kind,
        format: 'step',
        ...(source.path === undefined ? {} : { path: source.path }),
        ...(options.name === undefined ? {} : { name: options.name }),
        byteLength: bytesRead,
      },
      unit,
      loader: 'opencascade-step',
      contentHash,
      ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
    },
    capabilities: subjectCapabilities(mesh),
    diagnostics: [],
    // Never the raw embind handle: the façade owns idempotent disposal (D-10)
    // and, on a warm load, defers the read itself until a claim needs it (R8).
    nativeXde: facade,
    occurrenceMesh: (occurrence, meshOptions) => occurrenceMeshes.occurrenceMesh(occurrence, meshOptions),
  };
  return subject;
};

/** Load STEP evidence without observation. */
export const loadStep = async (options: LoadStepOptions): Promise<GeometrySubject> => loadStepObserved(options);

/**
 * Create a {@link loadStep} function with shared defaults.
 *
 * @param defaults - STEP loading defaults.
 * @returns A configured STEP loader.
 * @public
 */
export const createStepLoader = (defaults: Omit<LoadStepOptions, 'source'> = {}): GeoSpecStepLoader =>
  async function loadStepWithDefaults(options: LoadStepOptions): Promise<GeometrySubject> {
    return loadStep({ ...defaults, ...options });
  };
