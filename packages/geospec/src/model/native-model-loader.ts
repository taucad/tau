/** Native protocol-3 model admission over direct bytes and Tau Runtime exports. @module */

import type { GeoSpecNativeEngine, GeoSpecNativeSubject } from '#assertion-client/index.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { resolveRuntimeExportIntent } from '#model/export-intent.js';
import { bindRawSubjectResidency } from '#model/subject.js';
import type { RuntimeBackedModelFormat } from '#model/export-intent.js';
import type {
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
const countRefusal = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  error.code === 'limit-exceeded' &&
  error.message === 'Engine exceeds the configured retained subject count.';

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
};

/**
 * Model loader injected into native VM runs.
 *
 * The freshness unit is one load: every call reads its source again (the
 * source reader or a Runtime export) and the engine digests those exact bytes.
 * Nothing is deduplicated per run or per scope; bytes equal to an admitted
 * subject's reuse that subject by digest, length and descriptor, and edited
 * bytes admit a new subject. Only concurrent identical inline-code Runtime
 * loads share one in-flight export.
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
  const admissions = new Map<string, ResidentInput>();
  const admissionOwners = new Map<ResidencyOwner, string>();
  let generation = 0;
  const pendingLoads = new Set<Promise<GeoSpecNativeModelSubject>>();
  const runtimeLoads = new Map<
    GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory,
    Map<string, { pending: Promise<GeoSpecNativeModelSubject>; owners: Set<ResidencyOwner> }>
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
    // Check before copying; an already owned identical load is still admitted afresh below.
    if (
      !Number.isSafeInteger(binaryBytes) ||
      binaryBytes > residency.binaryLimit ||
      request.byteLength > descriptorLimit
    ) {
      throw Object.assign(new RangeError('GeoSpec retained admission input exceeds its byte limit.'), {
        code: 'limit-exceeded',
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
    if (
      shared === undefined &&
      (binaryBytes > residency.binaryLimit - residency.binaryBytes ||
        request.byteLength > descriptorLimit - residency.descriptorBytes)
    ) {
      throw Object.assign(new RangeError('GeoSpec live admission snapshots exceed their retained input byte limit.'), {
        code: 'limit-exceeded',
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
    const intentOptions = {
      runtime,
      format,
      ...(options.meshLinearTolerance === undefined ? {} : { meshLinearTolerance: options.meshLinearTolerance }),
      ...(options.meshAngularToleranceDegrees === undefined
        ? {}
        : { meshAngularToleranceDegrees: options.meshAngularToleranceDegrees }),
    };
    const requested = resolveRuntimeExportIntent(intentOptions);
    if ('success' in requested) {
      throw failure(requested.diagnostics);
    }
    const exportOptions = structuredClone(requested.options);
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
        artifacts,
      } satisfies GeoSpecModelLoadEvidence,
    };
  };

  const coalescedRuntime = async (options: RuntimeOptions & GeoSpecNativeLoadModelOptions, owner: ResidencyOwner) => {
    const configured = options.runtime ?? defaults.runtime;
    if (
      !('code' in options) ||
      configured === undefined ||
      options.parameters !== undefined ||
      options.ingestOptions !== undefined ||
      ['sourceUnit', 'unit', 'scale', 'coordinateSystem'].some((key) => key in options)
    ) {
      return loadRuntime(options, new Set([owner]));
    }
    const codePrototype: unknown = Object.getPrototypeOf(options.code);
    if (
      (codePrototype !== Object.prototype && codePrototype !== null) ||
      Object.values(Object.getOwnPropertyDescriptors(options.code)).some(
        (descriptor) => !('value' in descriptor) || typeof descriptor.value !== 'string',
      )
    ) {
      return loadRuntime(options, new Set([owner]));
    }
    const files = Object.entries(options.code);
    const code = Object.fromEntries(files);
    const key = JSON.stringify({
      file: options.file,
      files,
      format: options.format ?? defaults.format ?? 'glb',
      meshLinearTolerance: options.meshLinearTolerance,
      meshAngularToleranceDegrees: options.meshAngularToleranceDegrees,
    });
    let loads = runtimeLoads.get(configured);
    if (loads === undefined) {
      loads = new Map();
      runtimeLoads.set(configured, loads);
    }
    const existing = loads.get(key);
    if (existing !== undefined) {
      existing.owners.add(owner);
      return existing.pending;
    }
    const owners = new Set([owner]);
    const pending = loadRuntime({ ...options, code }, owners);
    loads.set(key, { pending, owners });
    const forget = (): void => {
      loads.delete(key);
      if (loads.size === 0) {
        runtimeLoads.delete(configured);
      }
    };
    // async-iife: bootstrap -- Remove only the in-flight entry after either settlement; the returned admission remains tracked.
    // oxlint-disable-next-line promise/prefer-await-to-then -- Settlement callback must not replace the caller's promise.
    void pending.then(forget, forget);
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
            ...(requestedFormat === 'step' || requestedFormat === 'stp' ? ['sourceUnit'] : []),
          ]
        : []),
    ].find((key) => key in options);
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
