/** Native protocol-3 model admission over direct bytes and Tau Runtime exports. @module */

import type { GeoSpecNativeEngine, GeoSpecNativeSubject } from '#assertion-client/index.js';
import { geoSpecAuthoredWorkUnitLimitProblem, resolveGeoSpecMaximumWorkUnitLimit } from '#engine/client.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { resolveRuntimeExportIntent } from '#model/export-intent.js';
import { bindRawSubjectResidency } from '#model/subject.js';
import type { GeoSpecExportRoute, RuntimeBackedModelFormat, RuntimeClientWithRoutes } from '#model/export-intent.js';
import type {
  GeoSpecLoadRegion,
  GeoSpecModelFormat,
  GeoSpecRuntimeClient,
  GeoSpecRuntimeClientFactory,
  GeoSpecRuntimeSourceAdapter,
  LoadModelOptions,
  LoadModelSourceOptions,
} from '#model/types.js';
import type { GeometryDiagnostic } from '#mesh/types.js';
import type { ExportFile, KernelIssue, SourceRevision } from '@taucad/runtime/types';
import { sha256Bytes } from '@taucad/runtime/kernel';

const protocolHeader = {
  canonicalProfile: 'geospec-jcs-v1',
  protocolVersion: 3,
  registryVersion: 5,
} as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const supportedFormats = new Set<GeoSpecModelFormat>(['glb', 'step', 'stp']);

type ResidencyOwner = Record<string, never> | Map<string, unknown>;
type ResidentInput = {
  readonly request: Uint8Array<ArrayBuffer>;
  readonly primary: Uint8Array<ArrayBuffer>;
  readonly resources: ReadonlyArray<Uint8Array<ArrayBuffer>>;
  readonly owners: Set<ResidencyOwner>;
  handle?: unknown;
  cleanupPending?: () => void;
};
type Residency = {
  readonly inputs: Map<string, ResidentInput>;
  readonly resident: Map<string, ResidentInput>;
  readonly binaryLimit: number;
  binaryBytes: number;
  descriptorBytes: number;
};
const engineResidency = new WeakMap<GeoSpecNativeModelEngine, Residency>();
// The existing native JSON codec profile limits each request to 16 MiB. Retained descriptors
// use that same byte ceiling in aggregate, separately from retained binary input bytes.
const descriptorLimit = 16 * 1024 * 1024;
// The engine's retained-subject refusal is a `limit-exceeded` protocol error whose `capacity`
// counts retained subjects. retained-subject-eviction.test.ts drives the real engine past its
// retained count, so a change to that shape fails that test rather than a run.
const countRefusal = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  error.code === 'limit-exceeded' &&
  'capacity' in error &&
  typeof error.capacity === 'object' &&
  error.capacity !== null &&
  'unit' in error.capacity &&
  error.capacity.unit === 'retained subjects';
// The host's own byte refusal carries the engine's `limit-exceeded` capacity shape, plus the limit it enforced.
const byteRefusal = (
  message: string,
  capacity: { readonly name: string; readonly limit: number; readonly required: number },
): RangeError =>
  Object.assign(new RangeError(message), {
    code: 'limit-exceeded',
    capacity: { code: 'GEOSPEC_RESOURCE_LIMIT', limitClass: 'admission', unit: 'bytes', ...capacity, source: 'host' },
  });

const residencyFor = (engine: GeoSpecNativeModelEngine): Residency => {
  const cached = engineResidency.get(engine);
  if (cached !== undefined) {
    return cached;
  }
  const response = decodeRecord(
    engine.processRequest(encode({ ...protocolHeader, method: 'initialize', requestId: 'configuration' })),
    'initialize response',
  );
  const result = record(response['result'], 'initialize result');
  if (
    response['requestId'] !== 'configuration' ||
    result['protocolVersion'] !== 3 ||
    result['registryVersion'] !== 5 ||
    result['canonicalProfile'] !== 'geospec-jcs-v1'
  ) {
    throw new TypeError('Native GeoSpec residency requires a compatible initialize profile.');
  }
  const configuration = record(result['configuration'], 'initialize configuration');
  const limits = record(configuration['binaryAdmissionLimits'], 'binary admission limits');
  const values = [limits['maxSubjectBytes'], limits['maxTotalBinaryBytes']].map((value) => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError('Native GeoSpec residency requires safe positive binary admission limits.');
    }
    return value;
  });
  const residency: Residency = {
    inputs: new Map(),
    resident: new Map(),
    binaryLimit: Math.max(...values),
    binaryBytes: 0,
    descriptorBytes: 0,
  };
  engineResidency.set(engine, residency);
  return residency;
};

/** Native engine operations required for model admission and run-level cleanup. @public */
export type GeoSpecNativeModelEngine = GeoSpecNativeEngine & {
  ingestSubject(
    request: Uint8Array<ArrayBuffer>,
    primary: Uint8Array<ArrayBuffer>,
    resources: ReadonlyArray<Uint8Array<ArrayBuffer>>,
  ): Uint8Array<ArrayBuffer>;
  subjectHandle(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
  releaseSubject(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
};

/** One named external resource referenced by a direct glTF-family source. @public */
export type GeoSpecNativeModelResource = {
  readonly name: string;
  readonly source: LoadModelSourceOptions['source'];
};

/** Native additions accepted by the injected `geospec/runner/native` loader. @public */
export type GeoSpecNativeLoadModelOptions<Code extends Record<string, string> = Record<string, string>> =
  LoadModelOptions<Code> & {
    /** Ordered external resource payloads declared to the native admission request. */
    readonly resources?: readonly GeoSpecNativeModelResource[];
    /** Format-specific native ingest options. */
    readonly ingestOptions?: Readonly<Record<string, unknown>>;
  };

/** Subject identity returned by native STEP/GLB admission. @public */
export type GeoSpecNativeModelSubject = GeoSpecNativeSubject & {
  readonly subjectHash: string;
  /** Exact successful-load evidence retained by the admitting host, when available. */
  readonly load?: GeoSpecModelLoadEvidence;
};

/** Immutable identity of the inputs and artifacts consumed by one model load. @public */
export type GeoSpecModelLoadEvidence = {
  readonly loadId: string;
  readonly status: 'complete' | 'unavailable';
  readonly format: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly exportOptions?: Readonly<Record<string, unknown>>;
  readonly ingestOptions: Readonly<Record<string, unknown>>;
  readonly sourceRevision?: SourceRevision;
  /** Actual direct-source locator, when the load read one; absent for anonymous in-memory bytes. */
  readonly sourcePath?: string;
  /** Authored default work-unit budget for claims on this subject. */
  readonly workUnitLimit?: number;
  /**
   * The crop box the kernel applied before export. Present only on a cropped load: its subject is
   * the region, never the whole model.
   */
  readonly region?: GeoSpecLoadRegion;
  /**
   * True when this load reused the run's earlier admission of identical inputs: the same file,
   * code, parameters, format, tolerances, region and ingest options, with an unchanged source
   * revision. No export or ingest ran for it; its artifacts and source revision are the earlier
   * load's, and lineage still records it under its own load id.
   */
  readonly reused?: true;
  readonly artifacts: ReadonlyArray<{
    readonly name: string;
    readonly sha256: string;
    readonly byteLength: number;
    /** Actual source locator consumed by a direct load; absent for bytes and Runtime exports. */
    readonly sourcePath?: string;
  }>;
};

/**
 * Resolve a non-memory source into ordinary ArrayBuffer-backed bytes.
 *
 * The loader takes ownership of the returned bytes and admits them without a
 * copy, so a reader must return bytes that nothing mutates afterwards (a fresh
 * read, not a view of a shared or reused buffer).
 *
 * @public
 */
export type GeoSpecNativeSourceReader = (source: LoadModelSourceOptions['source']) => Promise<Uint8Array<ArrayBuffer>>;

/** Defaults and host dependencies for a managed native model loader. @public */
export type CreateGeoSpecNativeModelLoaderOptions = {
  readonly engine: GeoSpecNativeModelEngine;
  readonly format?: Extract<GeoSpecModelFormat, 'glb' | 'step' | 'stp'>;
  readonly projectPath?: string;
  readonly readSource?: GeoSpecNativeSourceReader;
  readonly runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory;
  readonly sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
  /**
   * Subject handles carried between the release scopes of loaders that share one engine, keyed by
   * subjectHash. With a carrier, `releaseAll` keeps this scope's subjects for the next scope and
   * releases only the previous scope's subjects this scope did not load again, so reloading
   * unchanged bytes in the next scope is digest-only. Share one carrier per engine and run its
   * scopes one at a time: a scope's release touches only subjects whose scope has settled.
   */
  readonly carried?: Map<string, unknown>;
  /**
   * The largest `loadModel` `workUnitLimit` a spec may author. Host policy: omitted uses
   * `geoSpecMaximumWorkUnitLimit`, and a host provisioned for larger claims raises it.
   */
  readonly maximumWorkUnitLimit?: number;
};

/**
 * Model loader injected into native VM runs.
 *
 * Direct `source` loads read their source again on every call and the engine
 * digests those exact bytes; bytes equal to an admitted subject's reuse that
 * subject by digest, length and descriptor, and edited bytes admit a new
 * subject. Runtime loads are coalesced per release scope (one run): a load
 * whose file, inline code, project path, parameters, format, tolerances,
 * region and ingest options equal an earlier successful load's reuses that
 * admission without exporting or ingesting again. A file load is reused only
 * while a Runtime source snapshot still matches the earlier load's complete
 * source revision; otherwise, or when every owner of the earlier admission has
 * released it, the load exports afresh. Failures are never reused.
 *
 * @public
 */
export type GeoSpecNativeModelLoader = <Code extends Record<string, string> = Record<string, string>>(
  options: GeoSpecNativeLoadModelOptions<Code>,
) => Promise<GeoSpecNativeModelSubject>;

/**
 * Reusable native model loader whose admitted subjects can be released as one run.
 * The caller owns the engine and the boundaries between load scopes.
 * @public
 */
export type ManagedGeoSpecNativeModelLoader = GeoSpecNativeModelLoader & {
  /**
   * Drain registered admissions, including additions while drainage awaits,
   * then release this scope's subjects (with a carrier: the previous scope's
   * subjects this scope did not load again) and owned Runtime clients.
   *
   * Await the intended complete load chain before final release, and await
   * this method before closing the caller-owned engine. Calls after it returns
   * start a new scope requiring another release; future detached loads are not
   * part of the completed scope.
   *
   * @returns Completion of the current scope's admission drain and release.
   */
  releaseAll(): Promise<void>;
};

type RuntimeOptions = Exclude<LoadModelOptions, { source: unknown }>;

const failure = (diagnostics: GeometryDiagnostic[]): GeoSpecModelLoadError => new GeoSpecModelLoadError(diagnostics);

const diagnostic = (options: {
  code: string;
  message: string;
  suggestion: string;
  details?: Record<string, unknown>;
}): GeometryDiagnostic => ({
  code: options.code,
  severity: 'error',
  message: options.message,
  suggestion: options.suggestion,
  ...(options.details === undefined ? {} : { details: options.details }),
});

const runtimeIssueDiagnostic = (issue: KernelIssue): GeometryDiagnostic => ({
  code: issue.code,
  severity: issue.severity,
  message: issue.message,
  suggestion: 'Fix the model source or its Runtime export route, then retry the native run.',
});

const encode = (value: unknown): Uint8Array<ArrayBuffer> => encoder.encode(JSON.stringify(value));

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Native GeoSpec returned a non-object ${label}.`);
  }
  return value as Record<string, unknown>;
};

const decodeRecord = (bytes: Uint8Array<ArrayBuffer>, label: string): Record<string, unknown> =>
  record(JSON.parse(decoder.decode(bytes)) as unknown, label);

const directBytes = async (
  source: LoadModelSourceOptions['source'],
  readSource: GeoSpecNativeSourceReader | undefined,
): Promise<Uint8Array<ArrayBuffer>> => {
  if (source instanceof Uint8Array) {
    return Uint8Array.from(source);
  }
  if (source instanceof ArrayBuffer) {
    return Uint8Array.from(new Uint8Array(source));
  }
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    return new Uint8Array(await source.arrayBuffer());
  }
  if (readSource !== undefined) {
    try {
      return await readSource(source);
    } catch (error) {
      throw failure([
        diagnostic({
          code: 'GEOSPEC_NATIVE_SOURCE_READ_FAILED',
          message: `The host source reader could not read ${typeof source === 'string' ? source : 'this source'}: ${error instanceof Error ? error.message : String(error)}`,
          suggestion: 'Check that the source exists at a project-rooted path and is readable, then retry the load.',
          ...(typeof source === 'string' ? { details: { source } } : {}),
        }),
      ]);
    }
  }
  throw failure([
    diagnostic({
      code: 'GEOSPEC_NATIVE_SOURCE_READER_UNAVAILABLE',
      message: 'The native model loader cannot read this source form without a host source reader.',
      suggestion: 'Pass in-memory bytes or configure readSource on createGeoSpecNativeModelLoader().',
    }),
  ]);
};

const runtimeSource = (options: RuntimeOptions): { files: Record<string, string>; entry: string } | { path: string } =>
  'code' in options ? { files: options.code, entry: options.file } : { path: options.file };

const resolveFormat = (
  options: GeoSpecNativeLoadModelOptions,
  defaultFormat: CreateGeoSpecNativeModelLoaderOptions['format'],
): Extract<GeoSpecModelFormat, 'glb' | 'step' | 'stp'> => {
  const format = options.format ?? defaultFormat ?? 'glb';
  if (!supportedFormats.has(format)) {
    throw failure([
      diagnostic({
        code: 'GEOSPEC_NATIVE_MODEL_FORMAT_UNSUPPORTED',
        message: `The native model host does not admit '${format}' models.`,
        suggestion: "Use 'step', 'stp', or 'glb' for native model assertions.",
        details: { format },
      }),
    ]);
  }
  return format as Extract<GeoSpecModelFormat, 'glb' | 'step' | 'stp'>;
};

/**
 * Every export route the Runtime offers for a format: `routesFor` when it lists them, else its best
 * route, else none.
 *
 * @param runtime - The connected Runtime client.
 * @param format - The requested export format.
 * @returns The routes, possibly empty.
 */
const runtimeRoutesFor = (runtime: GeoSpecRuntimeClient, format: string): readonly GeoSpecExportRoute[] => {
  const { routesFor, bestRouteFor } = runtime as Partial<{
    routesFor: (format: string) => readonly GeoSpecExportRoute[];
    bestRouteFor: RuntimeClientWithRoutes['bestRouteFor'];
  }>;
  if (typeof routesFor === 'function') {
    return routesFor.call(runtime, format);
  }
  const best = typeof bestRouteFor === 'function' ? bestRouteFor.call(runtime, format) : undefined;
  return best === undefined ? [] : [best];
};

/**
 * The kernel that evaluates a Runtime source, so export routes are chosen among its own.
 * @param runtime - The connected Runtime.
 * @param options - The load naming the source.
 * @returns The kernel id, or `undefined` when the Runtime cannot describe the source; route
 *   selection then spans every kernel, as it did before description existed.
 */
const describedKernel = async (runtime: GeoSpecRuntimeClient, options: RuntimeOptions): Promise<string | undefined> => {
  if (typeof runtime.describe !== 'function') {
    return undefined;
  }
  try {
    const { kernelId } = await runtime.describe({ source: runtimeSource(options) });
    return typeof kernelId === 'string' && kernelId.length > 0 ? kernelId : undefined;
  } catch {
    // A source the Runtime cannot describe still fails or succeeds at export, with its own issues.
    return undefined;
  }
};

/**
 * Stable JSON for a coalescing key, or `undefined` for a value whose identity JSON cannot carry.
 * @param value - Plain load input.
 * @returns Key text with sorted object keys.
 */
const keyJson = (value: unknown): string | undefined => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : undefined;
  }
  if (Array.isArray(value)) {
    const items = value.map((item: unknown) => keyJson(item));
    return items.includes(undefined) ? undefined : `[${items.join(',')}]`;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      // Object keys are unique, so no two entries compare equal.
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([name, item]) => [name, keyJson(item)] as const);
    return entries.some(([, item]) => item === undefined)
      ? undefined
      : `{${entries.map(([name, item]) => `${JSON.stringify(name)}:${item}`).join(',')}}`;
  }
  return undefined;
};

const regionCorner = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((axis) => typeof axis === 'number' && Number.isFinite(axis));

/**
 * The typed refusal for a malformed `region`, or `undefined` for an omitted or well-formed box.
 * @param region - The authored region option.
 * @returns The load error to reject with, when the box is malformed.
 */
const regionFailure = (region: unknown): GeoSpecModelLoadError | undefined => {
  if (region === undefined) {
    return undefined;
  }
  const candidate = region !== null && typeof region === 'object' ? (region as Record<string, unknown>) : {};
  const { min, max } = candidate;
  return regionCorner(min) &&
    regionCorner(max) &&
    Object.keys(candidate).every((key) => key === 'min' || key === 'max') &&
    min.every((axis, index) => axis < max[index]!)
    ? undefined
    : failure([
        diagnostic({
          code: 'GEOSPEC_MODEL_OPTION_INVALID',
          message:
            'loadModel region must be { min: [x, y, z], max: [x, y, z] } in millimetres with every min axis below its max axis.',
          suggestion:
            'Pass finite millimetre corners of the box to check, for example { min: [0, 0, 0], max: [40, 40, 60] }.',
          details: { option: 'region', region: structuredClone(region) as unknown },
        }),
      ]);
};

/**
 * Copy a crop box the loader already validated.
 * @param region - The validated region option.
 * @returns An owned copy.
 */
const copyRegion = ({ min, max }: GeoSpecLoadRegion): GeoSpecLoadRegion => ({
  min: [min[0], min[1], min[2]],
  max: [max[0], max[1], max[2]],
});

/**
 * Whether a Runtime source snapshot still matches a complete exported source revision.
 * @param revision - The earlier load's complete source revision.
 * @param snapshot - A successful snapshot of the same entry.
 * @returns True only when every read digest is unchanged and no new file joined the closure.
 */
const revisionUnchanged = (
  revision: SourceRevision,
  snapshot: Extract<Awaited<ReturnType<NonNullable<GeoSpecRuntimeClient['snapshotSource']>>>, { success: true }>,
): boolean => {
  const observed: Readonly<Record<string, string>> =
    snapshot.sourceRevision?.files ??
    Object.fromEntries(snapshot.data.files.map(({ path, sha256 }) => [path, `sha256:${sha256}`]));
  return (
    (snapshot.sourceRevision?.entry ?? snapshot.data.entryPath) === revision.entry &&
    Object.entries(observed).every(([path, digest]) => digest === 'missing' || revision.files[path] === digest) &&
    Object.entries(revision.files).every(([path, digest]) =>
      digest === 'missing' ? observed[path] === undefined || observed[path] === 'missing' : observed[path] === digest,
    )
  );
};

/**
 * Create a native model loader that admits actual STEP/GLB bytes and retains
 * generation-checked handles until the owning runner finishes.
 *
 * @param defaults - Native engine, Runtime defaults, and optional source reader.
 * @returns A loader plus run-level cleanup operation.
 * @public
 */
export const createGeoSpecNativeModelLoader = (
  defaults: CreateGeoSpecNativeModelLoaderOptions,
): ManagedGeoSpecNativeModelLoader => {
  let requestSequence = 0;
  const maximumWorkUnitLimit = resolveGeoSpecMaximumWorkUnitLimit(defaults.maximumWorkUnitLimit);
  const admissions = new Map<string, ResidentInput>();
  const admissionOwners = new Map<ResidencyOwner, string>();
  let generation = 0;
  const pendingLoads = new Set<Promise<GeoSpecNativeModelSubject>>();
  // GR7: one entry per identical Runtime load in this release scope. Successful entries stay until
  // releaseAll; a failed one is dropped at once, so failures are never reused.
  const runtimeLoads = new Map<
    GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory,
    Map<
      string,
      {
        readonly pending: Promise<GeoSpecNativeModelSubject & { readonly load: GeoSpecModelLoadEvidence }>;
        /** Inline-code loads reserve each later owner before admission; file loads verify first. */
        readonly owners?: Set<ResidencyOwner>;
      }
    >
  >();
  const ownedRuntimes = new Set<GeoSpecRuntimeClient>();
  const runtimeFactories = new Map<GeoSpecRuntimeClientFactory, Promise<GeoSpecRuntimeClient>>();

  const nextRequestId = (operation: string): string => {
    requestSequence += 1;
    return `geospec-native-model:${operation}:${requestSequence}`;
  };

  const adapterFor = (options: RuntimeOptions): GeoSpecRuntimeSourceAdapter | undefined =>
    (options.sourceAdapters ?? defaults.sourceAdapters)?.find((adapter) =>
      adapter.extensions.some((extension) => options.file.endsWith(extension)),
    );

  const runtimeFor = async (options: RuntimeOptions): Promise<GeoSpecRuntimeClient> => {
    const configured = options.runtime ?? defaults.runtime;
    if (typeof configured === 'function') {
      let pending = runtimeFactories.get(configured);
      if (pending === undefined) {
        pending = configured();
        runtimeFactories.set(configured, pending);
      }
      const runtime = await pending;
      ownedRuntimes.add(runtime);
      return runtime;
    }
    if (configured !== undefined) {
      return configured;
    }
    const adapter = adapterFor(options);
    if (adapter !== undefined) {
      const runtime = await adapter.createRuntime({
        file: options.file,
        ...((options.projectPath ?? defaults.projectPath) === undefined
          ? {}
          : { projectPath: options.projectPath ?? defaults.projectPath }),
      });
      ownedRuntimes.add(runtime);
      return runtime;
    }
    throw failure([
      diagnostic({
        code: 'GEOSPEC_NATIVE_RUNTIME_UNAVAILABLE',
        message: `No Tau Runtime is configured to export '${options.file}' for native GeoSpec.`,
        suggestion: 'Pass a Runtime client/factory or a matching source adapter to the native runner.',
        details: { file: options.file },
      }),
    ]);
  };

  const release = (handle: unknown): void => {
    defaults.engine.releaseSubject(
      encode({
        ...protocolHeader,
        method: 'releaseSubject',
        requestId: nextRequestId('release'),
        subjectHandle: handle,
      }),
    );
  };

  const dropOwner = (subjectHash: string, priorOwner: ResidencyOwner): void => {
    const residency = engineResidency.get(defaults.engine);
    const input = residency?.inputs.get(subjectHash);
    if (residency === undefined || input === undefined) {
      return;
    }
    input.cleanupPending?.();
    delete input.cleanupPending;
    if (!input.owners.has(priorOwner)) {
      return;
    }
    if (input.owners.size > 1) {
      input.owners.delete(priorOwner);
      return;
    }
    if (input.handle !== undefined) {
      release(input.handle);
      delete input.handle;
    }
    input.owners.delete(priorOwner);
    residency.resident.delete(subjectHash);
    residency.inputs.delete(subjectHash);
    residency.binaryBytes -= input.resources.reduce((sum, bytes) => sum + bytes.byteLength, input.primary.byteLength);
    residency.descriptorBytes -= input.request.byteLength;
  };

  const settleCleanup = (residency: Residency): void => {
    for (const [subjectHash, input] of residency.inputs) {
      if (input.cleanupPending === undefined) {
        continue;
      }
      input.cleanupPending();
      delete input.cleanupPending;
      delete input.handle;
      residency.resident.delete(subjectHash);
    }
  };

  // Previous-scope subjects this scope has not loaded again: the ones its release frees.
  const staleCarried = (): Array<[string, unknown]> =>
    [...(defaults.carried ?? [])].filter(([subjectHash]) => !admissions.has(subjectHash));

  const admit = (
    options: {
      format: Extract<GeoSpecModelFormat, 'glb' | 'step' | 'stp'>;
      ingestOptions?: Readonly<Record<string, unknown>>;
      primary: Uint8Array<ArrayBuffer>;
      resources: ReadonlyArray<{ name: string; bytes: Uint8Array<ArrayBuffer> }>;
      sourceUnit?: string;
      diagnostics?: readonly GeometryDiagnostic[];
    },
    owners: ReadonlySet<ResidencyOwner>,
  ): GeoSpecNativeModelSubject => {
    const format = options.format === 'stp' ? 'step' : options.format;
    const residency = residencyFor(defaults.engine);
    settleCleanup(residency);
    const request = encode({
      ...protocolHeader,
      method: 'ingestSubject',
      requestId: nextRequestId('ingest'),
      format,
      frame: {
        coordinateSystem: 'z-up',
        sourceUnit: format === 'step' ? 'auto' : (options.sourceUnit ?? 'm'),
        outputUnit: 'mm',
      },
      ingestOptions: options.ingestOptions ?? {},
      ...(options.diagnostics === undefined || options.diagnostics.length === 0
        ? {}
        : { diagnostics: options.diagnostics }),
      primaryByteLength: options.primary.byteLength,
      resources: options.resources.map(({ name, bytes }) => ({ name, byteLength: bytes.byteLength })),
    });
    const binaryBytes = options.resources.reduce(
      (sum, { bytes }) => sum + bytes.byteLength,
      options.primary.byteLength,
    );
    // Check before copying; an already owned identical load is still admitted afresh below. The engine keeps
    // maxSubjectBytes at or below maxTotalBinaryBytes, so the binary limit is the total.
    if (!Number.isSafeInteger(binaryBytes) || binaryBytes > residency.binaryLimit) {
      throw byteRefusal('GeoSpec retained admission input exceeds its byte limit.', {
        name: 'maxTotalBinaryBytes',
        limit: residency.binaryLimit,
        required: binaryBytes,
      });
    }
    if (request.byteLength > descriptorLimit) {
      throw byteRefusal('GeoSpec retained admission input exceeds its byte limit.', {
        name: 'descriptorBytes',
        limit: descriptorLimit,
        required: request.byteLength,
      });
    }
    const sameBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
      left.length === right.length && left.every((byte, index) => byte === right[index]);
    const descriptor = { ...decodeRecord(request, 'admission request'), requestId: '' };
    const shared = [...residency.inputs.values()].find((input) => {
      const prior = { ...decodeRecord(input.request, 'retained request'), requestId: '' };
      return (
        JSON.stringify(prior) === JSON.stringify(descriptor) &&
        sameBytes(input.primary, options.primary) &&
        input.resources.length === options.resources.length &&
        input.resources.every((bytes, index) => sameBytes(bytes, options.resources[index]!.bytes))
      );
    });
    if (shared === undefined && binaryBytes > residency.binaryLimit - residency.binaryBytes) {
      throw byteRefusal('GeoSpec live admission snapshots exceed their retained input byte limit.', {
        name: 'maxTotalBinaryBytes',
        limit: residency.binaryLimit,
        required: residency.binaryBytes + binaryBytes,
      });
    }
    if (shared === undefined && request.byteLength > descriptorLimit - residency.descriptorBytes) {
      throw byteRefusal('GeoSpec live admission snapshots exceed their retained input byte limit.', {
        name: 'descriptorBytes',
        limit: descriptorLimit,
        required: residency.descriptorBytes + request.byteLength,
      });
    }
    const input: ResidentInput = shared ?? {
      request: Uint8Array.from(request),
      primary: Uint8Array.from(options.primary),
      resources: options.resources.map(({ bytes }) => Uint8Array.from(bytes)),
      owners: new Set(),
    };
    const ingest = (): Uint8Array<ArrayBuffer> =>
      defaults.engine.ingestSubject(
        request,
        options.primary,
        options.resources.map(({ bytes }) => bytes),
      );
    let admissionBytes: Uint8Array<ArrayBuffer>;
    try {
      admissionBytes = ingest();
    } catch (error) {
      // ponytail: carried subjects share the engine's retained-subject cap, so a full engine frees the stale ones
      // and retries once; the retry re-reads nothing but repeats the parse the refusal discarded.
      const stale = staleCarried();
      if (!countRefusal(error)) {
        throw error;
      }
      let freed = false;
      for (const [subjectHash, handle] of stale) {
        const retained = residency.inputs.get(subjectHash);
        if (retained === undefined) {
          release(handle);
          freed = true;
        } else {
          const releases = retained.owners.size === 1 && retained.handle !== undefined;
          dropOwner(subjectHash, defaults.carried!);
          freed ||= releases;
        }
        defaults.carried?.delete(subjectHash);
      }
      if (!freed) {
        const oldest = residency.resident.entries().next().value;
        if (oldest === undefined) {
          throw error;
        }
        release(oldest[1].handle);
        delete oldest[1].handle;
        residency.resident.delete(oldest[0]);
      }
      admissionBytes = ingest();
    }
    const admission = decodeRecord(admissionBytes, 'admission response');
    const result = record(admission['result'], 'admission result');
    const subject = record(result['subject'], 'admitted subject');
    const { subjectHash } = subject;
    if (typeof subjectHash !== 'string' || !/^[0-9a-f]{64}$/u.test(subjectHash)) {
      throw new TypeError('Native GeoSpec admission did not return a valid subjectHash.');
    }
    const handleResponse = decodeRecord(
      defaults.engine.subjectHandle(
        encode({
          ...protocolHeader,
          method: 'subjectHandle',
          requestId: nextRequestId('handle'),
          subjectHash,
        }),
      ),
      'subject-handle response',
    );
    const handleResult = record(handleResponse['result'], 'subject-handle result');
    const handle = handleResult['subjectHandle'];
    if (handle === undefined) {
      throw new TypeError('Native GeoSpec did not return a subject handle.');
    }
    const existing = residency.inputs.get(subjectHash);
    const retained = existing ?? input;
    if (existing === undefined) {
      residency.inputs.set(subjectHash, retained);
      residency.binaryBytes += binaryBytes;
      residency.descriptorBytes += retained.request.byteLength;
    }
    for (const owner of owners) {
      retained.owners.add(owner);
      admissionOwners.set(owner, subjectHash);
    }
    retained.handle = handle;
    residency.resident.delete(subjectHash);
    residency.resident.set(subjectHash, retained);
    admissions.set(subjectHash, retained);
    return { subjectHash };
  };

  const ensureResident = (subjectHash: string): void => {
    const input = admissions.get(subjectHash);
    if (input === undefined) {
      throw new TypeError('This subject is not admitted by the active GeoSpec host.');
    }
    const residency = residencyFor(defaults.engine);
    settleCleanup(residency);
    if (input.handle === undefined) {
      const ingest = (): Uint8Array<ArrayBuffer> =>
        defaults.engine.ingestSubject(input.request, input.primary, input.resources);
      let response: Uint8Array<ArrayBuffer>;
      try {
        response = ingest();
      } catch (error) {
        const oldest = residency.resident.entries().next().value;
        if (!countRefusal(error) || oldest === undefined) {
          throw error;
        }
        release(oldest[1].handle);
        delete oldest[1].handle;
        residency.resident.delete(oldest[0]);
        response = ingest();
      }
      const acquireHandle = (): unknown => {
        const result = record(
          decodeRecord(
            defaults.engine.subjectHandle(
              encode({
                ...protocolHeader,
                method: 'subjectHandle',
                requestId: nextRequestId('restore-handle'),
                subjectHash,
              }),
            ),
            'restored handle',
          )['result'],
          'restored handle result',
        );
        const handle = record(result['subjectHandle'], 'restored subject handle');
        if (handle['subjectHash'] !== subjectHash) {
          throw new TypeError('Native GeoSpec restored handle changed its subject identity.');
        }
        return handle;
      };
      try {
        const admitted = record(
          record(decodeRecord(response, 'restored admission')['result'], 'restored result')['subject'],
          'restored subject',
        );
        if (admitted['subjectHash'] !== subjectHash) {
          throw new TypeError('Native GeoSpec restored admission changed its subject identity.');
        }
        input.handle = acquireHandle();
      } catch (error) {
        // Only this immutable input's previously owned identity authorizes rollback. A corrupt
        // response's arbitrary different identity cannot authorize releasing a foreign subject.
        input.cleanupPending = () => {
          try {
            release(acquireHandle());
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              'Native GeoSpec restored admission failed and cleanup remains pending.',
              { cause: error },
            );
          }
        };
        input.cleanupPending();
        delete input.cleanupPending;
        throw error;
      }
    }
    residency.resident.delete(subjectHash);
    residency.resident.set(subjectHash, input);
  };

  const loadDirect = async (
    options: Extract<GeoSpecNativeLoadModelOptions, { source: unknown }>,
    owners: ReadonlySet<ResidencyOwner>,
  ) => {
    const format = resolveFormat(options, defaults.format);
    const primary = await directBytes(options.source, defaults.readSource);
    const resources = await Promise.all(
      (options.resources ?? []).map(async ({ name, source }) => ({
        name,
        bytes: await directBytes(source, defaults.readSource),
        ...(typeof source === 'string' ? { sourcePath: source } : {}),
      })),
    );
    const artifacts = await Promise.all(
      [
        {
          name: options.path ?? options.name ?? 'primary',
          bytes: primary,
          ...(typeof options.source === 'string' ? { sourcePath: options.source } : {}),
        },
        ...resources,
      ].map(async ({ name, bytes, sourcePath }) => ({
        name,
        sha256: await sha256Bytes(bytes),
        byteLength: bytes.byteLength,
        ...(sourcePath === undefined ? {} : { sourcePath }),
      })),
    );
    const subject = admit(
      {
        format,
        primary,
        resources,
        ...(options.ingestOptions === undefined ? {} : { ingestOptions: options.ingestOptions }),
        ...(options.sourceUnit === undefined ? {} : { sourceUnit: options.sourceUnit }),
      },
      owners,
    );
    return {
      ...subject,
      load: {
        loadId: '',
        status: 'complete',
        format,
        parameters: options.parameters ?? {},
        ingestOptions: options.ingestOptions ?? {},
        ...(typeof options.source === 'string' ? { sourcePath: options.source } : {}),
        ...(options.workUnitLimit === undefined ? {} : { workUnitLimit: options.workUnitLimit }),
        artifacts,
      } satisfies GeoSpecModelLoadEvidence,
    };
  };

  const loadRuntime = async (
    options: RuntimeOptions & GeoSpecNativeLoadModelOptions,
    owners: ReadonlySet<ResidencyOwner>,
  ) => {
    for (const key of ['sourceUnit', 'unit', 'scale', 'coordinateSystem'] as const) {
      if (key in options) {
        throw failure([
          diagnostic({
            code: 'GEOSPEC_NATIVE_RUNTIME_FRAME_OVERRIDE',
            message: `Native Runtime model loading rejects '${key}': the Runtime export intent owns the frame.`,
            suggestion: 'Remove the frame override and let GeoSpec request canonical Z-up millimetre evidence.',
            details: { key },
          }),
        ]);
      }
    }
    const requestedFormat = resolveFormat(options, defaults.format);
    const format: Extract<RuntimeBackedModelFormat, 'glb' | 'step'> =
      requestedFormat === 'stp' ? 'step' : requestedFormat;
    const runtime = await runtimeFor(options);
    await runtime.connect();
    const kernelId = await describedKernel(runtime, options);
    const intentOptions = {
      runtime,
      format,
      ...(kernelId === undefined ? {} : { kernelId }),
      ...(options.meshLinearTolerance === undefined ? {} : { meshLinearTolerance: options.meshLinearTolerance }),
      ...(options.meshAngularToleranceDegrees === undefined
        ? {}
        : { meshAngularToleranceDegrees: options.meshAngularToleranceDegrees }),
    };
    const requested = resolveRuntimeExportIntent(intentOptions);
    if ('success' in requested) {
      throw failure(requested.diagnostics);
    }
    // Validated by the loader before any Runtime work.
    const region = options.region === undefined ? undefined : copyRegion(options.region);
    if (region !== undefined) {
      // A described kernel's own direct routes decide. Without one, the kernel that renders the file
      // is chosen when it opens, so admit the crop when any direct route declares it; an option no
      // route declares would be dropped by option parsing and export the whole model. The kernel's
      // crop notice below stays the authority for the chosen route.
      const routes = runtimeRoutesFor(runtime, format).filter(
        (route) => kernelId === undefined || route.kernelId === kernelId,
      );
      const cropping = routes.some(
        (route) => route.transcoderId === undefined && 'region' in (route.exportOptions?.schema.properties ?? {}),
      );
      if (!cropping) {
        const kernelIds = [
          ...new Set(routes.flatMap((route) => (route.kernelId === undefined ? [] : [route.kernelId]))),
        ];
        throw failure([
          diagnostic({
            code: 'GEOSPEC_MODEL_REGION_UNSUPPORTED',
            message: `No direct ${format.toUpperCase()} export of this Runtime${kernelIds.length === 0 ? '' : ` (${kernelIds.join(', ')})`} declares a region option, so GeoSpec cannot crop '${options.file}' before admission.`,
            suggestion:
              'Load the whole model; if it exceeds a host limit, report the claim as not decided at this capacity. A region load needs a kernel whose GLB export crops, such as PicoVoxel, and only scopes a separate claim to that region.',
            details: { file: options.file, format, region, kernelIds },
          }),
        ]);
      }
    }
    const exportOptions = {
      ...structuredClone(requested.options),
      ...(region === undefined ? {} : { region: { min: [...region.min], max: [...region.max] } }),
    };
    // One export, then close: a file watcher would outlive the worker that tears it down.
    const document = runtime.open({
      source: runtimeSource(options),
      ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
      watch: false,
    });
    const exported = await (async () => {
      try {
        return await document.export(format, { options: structuredClone(exportOptions) });
      } finally {
        document.close();
      }
    })();
    if (!exported.success) {
      throw failure(exported.issues.map(runtimeIssueDiagnostic));
    }
    if (
      region !== undefined &&
      !exported.issues.some((issue) => {
        const { details } = issue;
        const cropped: unknown =
          details !== null && typeof details === 'object' && 'region' in details ? details.region : undefined;
        return (
          cropped !== null &&
          typeof cropped === 'object' &&
          keyJson(cropped) === keyJson({ min: [...region.min], max: [...region.max] })
        );
      })
    ) {
      throw failure([
        diagnostic({
          code: 'GEOSPEC_MODEL_REGION_NOT_HONORED',
          message: `The Runtime export of '${options.file}' did not confirm the requested region crop, so its bytes may be the whole model.`,
          suggestion: 'Load the whole model, or update the kernel so its export reports the region it cropped.',
          details: { file: options.file, format, region },
        }),
      ]);
    }
    const files: ExportFile[] = [...exported.files];
    const [primary, ...resources] = files;
    if (primary === undefined) {
      throw failure([
        diagnostic({
          code: 'GEOSPEC_NATIVE_MODEL_EXPORT_EMPTY',
          message: `The Tau Runtime exported no ${format.toUpperCase()} artifact for '${options.file}'.`,
          suggestion: 'Check that the selected source exports geometry in the requested format.',
          details: { file: options.file, format },
        }),
      ]);
    }
    const honored = resolveRuntimeExportIntent(intentOptions);
    if ('success' in honored) {
      throw failure(honored.diagnostics);
    }
    // The export is consumed synchronously by admission, so its bytes need no copy.
    const artifacts = await Promise.all(
      files.map(async ({ name, bytes }) => ({
        name,
        sha256: await sha256Bytes(bytes),
        byteLength: bytes.byteLength,
      })),
    );
    const sourceRevision = exported.sourceRevision === undefined ? undefined : structuredClone(exported.sourceRevision);
    const completeSourceRevision =
      sourceRevision !== undefined &&
      /^sha256:[0-9a-f]{64}$/u.test(sourceRevision.files[sourceRevision.entry] ?? '') &&
      Object.values(sourceRevision.files).every(
        (digest) => digest === 'missing' || /^sha256:[0-9a-f]{64}$/u.test(digest),
      );
    const subject = admit(
      {
        format,
        primary: primary.bytes,
        resources,
        sourceUnit: honored.sourceUnit,
        diagnostics: exported.issues.map(runtimeIssueDiagnostic),
        ...(options.ingestOptions === undefined ? {} : { ingestOptions: options.ingestOptions }),
      },
      owners,
    );
    return {
      ...subject,
      load: {
        loadId: '',
        status: completeSourceRevision ? 'complete' : 'unavailable',
        format,
        parameters: options.parameters ?? {},
        exportOptions,
        ingestOptions: options.ingestOptions ?? {},
        ...(sourceRevision === undefined ? {} : { sourceRevision }),
        ...(options.workUnitLimit === undefined ? {} : { workUnitLimit: options.workUnitLimit }),
        ...(region === undefined ? {} : { region }),
        artifacts,
      } satisfies GeoSpecModelLoadEvidence,
    };
  };

  /**
   * Register one more owner on an admission this scope still retains.
   * @param subjectHash - The earlier load's admitted subject.
   * @param owner - The reusing load's private owner.
   * @returns False when every owner has released it, so the caller must load afresh.
   */
  const adopt = (subjectHash: string, owner: ResidencyOwner): boolean => {
    const input = engineResidency.get(defaults.engine)?.inputs.get(subjectHash);
    if (input === undefined || input.owners.size === 0) {
      return false;
    }
    input.owners.add(owner);
    admissionOwners.set(owner, subjectHash);
    admissions.set(subjectHash, input);
    return true;
  };

  /**
   * Whether the earlier file load's exported source closure is unchanged now.
   * @param options - The reusing file load.
   * @param load - The earlier load's evidence.
   * @returns False without a complete revision or a successful matching Runtime snapshot.
   */
  const fileUnchanged = async (
    options: RuntimeOptions & GeoSpecNativeLoadModelOptions,
    load: GeoSpecModelLoadEvidence,
  ): Promise<boolean> => {
    const revision = load.status === 'complete' ? load.sourceRevision : undefined;
    if (revision === undefined) {
      return false;
    }
    const runtime = await runtimeFor(options);
    if (runtime.snapshotSource === undefined) {
      return false;
    }
    try {
      const snapshot = await runtime.snapshotSource({ source: { path: options.file } });
      return snapshot.success && revisionUnchanged(revision, snapshot);
    } catch {
      // An unverifiable closure is not a load failure: the fresh export that follows reports any real error.
      return false;
    }
  };

  const coalescedRuntime = async (
    options: RuntimeOptions & GeoSpecNativeLoadModelOptions,
    owner: ResidencyOwner,
  ): Promise<GeoSpecNativeModelSubject> => {
    const configured = options.runtime ?? defaults.runtime;
    const inline = 'code' in options;
    // The loader already snapshotted `code` into a plain object; only its values can defeat the key.
    const code =
      inline && Object.values(options.code).every((value: unknown) => typeof value === 'string')
        ? options.code
        : undefined;
    const key =
      configured === undefined ||
      (inline && code === undefined) ||
      ['sourceUnit', 'unit', 'scale', 'coordinateSystem'].some((name) => name in options)
        ? undefined
        : keyJson({
            file: options.file,
            code,
            projectPath: options.projectPath ?? defaults.projectPath,
            format: options.format ?? defaults.format ?? 'glb',
            meshLinearTolerance: options.meshLinearTolerance,
            meshAngularToleranceDegrees: options.meshAngularToleranceDegrees,
            parameters: options.parameters,
            ingestOptions: options.ingestOptions,
            region: options.region,
          });
    if (configured === undefined || key === undefined) {
      return loadRuntime(options, new Set([owner]));
    }
    let loads = runtimeLoads.get(configured);
    if (loads === undefined) {
      loads = new Map();
      runtimeLoads.set(configured, loads);
    }
    const existing = loads.get(key);
    if (existing !== undefined) {
      existing.owners?.add(owner);
      const subject = await existing.pending;
      const reusable =
        (existing.owners !== undefined || (await fileUnchanged(options, subject.load))) &&
        adopt(subject.subjectHash, owner);
      if (reusable) {
        const { workUnitLimit: earlierWorkUnitLimit, ...earlier } = subject.load;
        return {
          subjectHash: subject.subjectHash,
          load: {
            ...earlier,
            ...(options.workUnitLimit === undefined ? {} : { workUnitLimit: options.workUnitLimit }),
            reused: true,
          },
        };
      }
    }
    const owners = new Set([owner]);
    const pending = loadRuntime(options, owners);
    const entry = { pending, ...(code === undefined ? {} : { owners }) };
    loads.set(key, entry);
    // A failed load is replaced only by a later load of the same key, which reads the map afresh;
    // the emptied per-runtime map stays until releaseAll clears the scope.
    const forget = (): void => {
      loads.delete(key);
    };
    // async-iife: bootstrap -- Drop only a failed entry; a successful admission stays reusable for this scope.
    // oxlint-disable-next-line promise/prefer-await-to-then -- Settlement callback must not replace the caller's promise.
    void pending.then(undefined, forget);
    return pending;
  };

  // oxlint-disable-next-line typescript/promise-function-async -- Return the tracked admission promise unchanged to its author.
  const loader: GeoSpecNativeModelLoader = (options) => {
    const owner = {};
    const loadId = nextRequestId('load');
    const snapshot = {
      ...options,
      ...('code' in options ? { code: Object.fromEntries(Object.entries(options.code)) } : {}),
      ...(options.parameters === undefined ? {} : { parameters: structuredClone(options.parameters) }),
      ...(options.ingestOptions === undefined ? {} : { ingestOptions: structuredClone(options.ingestOptions) }),
      ...('region' in options && options.region !== undefined ? { region: structuredClone(options.region) } : {}),
    };
    const requestedFormat = options.format ?? defaults.format ?? 'glb';
    const invalidOption = [
      'stepStreaming',
      // Native STEP admission is BRep-only; explicit later queries may demand tessellation.
      ...(options.mesh === false && (requestedFormat === 'step' || requestedFormat === 'stp') ? [] : ['mesh']),
      ...('source' in options
        ? [
            'meshLinearTolerance',
            'meshAngularToleranceDegrees',
            // Direct bytes are admitted as they are; only a kernel export can crop.
            'region',
            ...(requestedFormat === 'step' || requestedFormat === 'stp' ? ['sourceUnit'] : []),
          ]
        : []),
      // A crop is mesh-only: exact BRep evidence is never cut.
      ...(requestedFormat === 'step' || requestedFormat === 'stp' ? ['region'] : []),
    ].find((key) => key in options && (key !== 'region' || options[key as keyof typeof options] !== undefined));
    if (invalidOption !== undefined) {
      return Promise.reject(
        failure([
          diagnostic({
            code: 'GEOSPEC_MODEL_OPTION_UNSUPPORTED',
            message: `This GeoSpec host cannot honor model option '${invalidOption}'.`,
            suggestion: 'Remove this option or configure a host that supports its declared behavior.',
            details: { option: invalidOption },
          }),
        ]),
      );
    }
    const workUnitLimitProblem = geoSpecAuthoredWorkUnitLimitProblem(
      options.workUnitLimit,
      'loadModel workUnitLimit',
      maximumWorkUnitLimit,
    );
    if (workUnitLimitProblem !== undefined) {
      return Promise.reject(
        failure([
          diagnostic({
            code: 'GEOSPEC_MODEL_OPTION_INVALID',
            message: workUnitLimitProblem,
            suggestion:
              'Pass a positive integer workUnitLimit within the stated bound, or omit it for the engine default.',
            details: { option: 'workUnitLimit' },
          }),
        ]),
      );
    }
    const invalidRegion = 'source' in options ? undefined : regionFailure(options.region);
    if (invalidRegion !== undefined) {
      return Promise.reject(invalidRegion);
    }
    const admission =
      'source' in options
        ? loadDirect(snapshot as Extract<GeoSpecNativeLoadModelOptions, { source: unknown }>, new Set([owner]))
        : coalescedRuntime(snapshot as RuntimeOptions & GeoSpecNativeLoadModelOptions, owner);
    const pending = (async () => {
      const subject = await admission;
      const result = { ...subject, ...(subject.load === undefined ? {} : { load: { ...subject.load, loadId } }) };
      const current = generation;
      let disposing = false;
      bindRawSubjectResidency(result, {
        ensureResident() {
          if (current !== generation || !admissionOwners.has(owner)) {
            throw new TypeError('This subject is not admitted by the active GeoSpec host.');
          }
          ensureResident(subject.subjectHash);
        },
        dispose() {
          if (disposing || !admissionOwners.has(owner)) {
            return;
          }
          disposing = true;
          try {
            dropOwner(subject.subjectHash, owner);
            admissionOwners.delete(owner);
            if (![...admissionOwners.values()].includes(subject.subjectHash)) {
              admissions.delete(subject.subjectHash);
            }
          } finally {
            disposing = false;
          }
        },
      });
      return result;
    })();
    pendingLoads.add(pending);
    return pending;
  };

  return Object.assign(loader, {
    async releaseAll(): Promise<void> {
      do {
        const batch = [...pendingLoads];
        // oxlint-disable-next-line no-await-in-loop -- Admissions can register another load while this batch settles.
        await Promise.allSettled(batch);
        for (const pending of batch) {
          pendingLoads.delete(pending);
        }
      } while (pendingLoads.size > 0);
      const errors: unknown[] = [];
      const { carried } = defaults;
      generation += 1;
      runtimeLoads.clear();
      if (carried !== undefined) {
        for (const [subjectHash, handle] of staleCarried()) {
          try {
            if (engineResidency.get(defaults.engine)?.inputs.has(subjectHash)) {
              dropOwner(subjectHash, carried);
            } else {
              release(handle);
            }
            carried.delete(subjectHash);
          } catch (error) {
            errors.push(error);
          }
        }
        for (const [subjectHash, input] of admissions) {
          if (input.handle === undefined) {
            input.owners.delete(carried);
            carried.delete(subjectHash);
          } else {
            input.owners.add(carried);
            carried.set(subjectHash, input.handle);
          }
        }
      }
      for (const [owner, subjectHash] of [...admissionOwners].reverse()) {
        try {
          dropOwner(subjectHash, owner);
          admissionOwners.delete(owner);
          if (![...admissionOwners.values()].includes(subjectHash)) {
            admissions.delete(subjectHash);
          }
        } catch (error) {
          errors.push(error);
        }
      }
      for (const runtime of ownedRuntimes) {
        try {
          if (runtime.shutdown) {
            // oxlint-disable-next-line no-await-in-loop -- Each owned runtime must close before release settles.
            await runtime.shutdown();
          } else {
            runtime.terminate();
          }
        } catch (error) {
          errors.push(error);
        }
      }
      ownedRuntimes.clear();
      runtimeFactories.clear();
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Native GeoSpec model cleanup failed.');
      }
    },
  });
};
