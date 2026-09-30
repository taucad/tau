/** Native protocol-3 model admission over direct bytes and Tau Runtime exports. @module */

import type { GeoSpecNativeEngine, GeoSpecNativeSubject } from '#assertion-client/index.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { resolveRuntimeExportIntent } from '#model/export-intent.js';
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
import type { KernelIssue, SourceRevision } from '@taucad/runtime/types';
import { sha256Bytes } from '@taucad/runtime/kernel';

const protocolHeader = {
  canonicalProfile: 'geospec-jcs-v1',
  protocolVersion: 3,
  registryVersion: 5,
} as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const supportedFormats = new Set<GeoSpecModelFormat>(['glb', 'step', 'stp']);

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
  readonly artifacts: ReadonlyArray<{ readonly name: string; readonly sha256: string; readonly byteLength: number }>;
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
type RuntimeExport = (
  format: string,
  options: {
    source: { files: Record<string, string>; entry: string } | { path: string };
    parameters?: Record<string, unknown>;
    exportOptions: Record<string, unknown>;
  },
) => ReturnType<GeoSpecRuntimeClient['export']>;

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
    return readSource(source);
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
  const admissions = new Map<string, unknown>();
  const pendingLoads = new Set<Promise<GeoSpecNativeModelSubject>>();
  const runtimeLoads = new Map<
    GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory,
    Map<string, Promise<GeoSpecNativeModelSubject>>
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

  // Previous-scope subjects this scope has not loaded again: the ones its release frees.
  const staleCarried = (): Array<[string, unknown]> =>
    [...(defaults.carried ?? [])].filter(([subjectHash]) => !admissions.has(subjectHash));

  const admit = (options: {
    format: Extract<GeoSpecModelFormat, 'glb' | 'step' | 'stp'>;
    ingestOptions?: Readonly<Record<string, unknown>>;
    primary: Uint8Array<ArrayBuffer>;
    resources: ReadonlyArray<{ name: string; bytes: Uint8Array<ArrayBuffer> }>;
    sourceUnit?: string;
    diagnostics?: readonly GeometryDiagnostic[];
  }): GeoSpecNativeModelSubject => {
    const format = options.format === 'stp' ? 'step' : options.format;
    const ingest = (): Uint8Array<ArrayBuffer> =>
      defaults.engine.ingestSubject(
        encode({
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
        }),
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
      const limited = typeof error === 'object' && error !== null && 'code' in error && error.code === 'limit-exceeded';
      if (!limited || stale.length === 0) {
        throw error;
      }
      for (const [subjectHash, handle] of stale) {
        defaults.carried?.delete(subjectHash);
        release(handle);
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
    admissions.set(subjectHash, handle);
    return { subjectHash };
  };

  const loadDirect = async (options: Extract<GeoSpecNativeLoadModelOptions, { source: unknown }>) => {
    const format = resolveFormat(options, defaults.format);
    const primary = await directBytes(options.source, defaults.readSource);
    const resources = await Promise.all(
      (options.resources ?? []).map(async ({ name, source }) => ({
        name,
        bytes: await directBytes(source, defaults.readSource),
      })),
    );
    const artifacts = await Promise.all(
      [{ name: options.path ?? options.name ?? 'primary', bytes: primary }, ...resources].map(
        async ({ name, bytes }) => ({ name, sha256: await sha256Bytes(bytes), byteLength: bytes.byteLength }),
      ),
    );
    const subject = admit({
      format,
      primary,
      resources,
      ...(options.ingestOptions === undefined ? {} : { ingestOptions: options.ingestOptions }),
      ...(options.sourceUnit === undefined ? {} : { sourceUnit: options.sourceUnit }),
    });
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

  const loadRuntime = async (options: RuntimeOptions & GeoSpecNativeLoadModelOptions) => {
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
    const exported = await (runtime.export as unknown as RuntimeExport)(format, {
      source: runtimeSource(options),
      ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
      exportOptions: structuredClone(exportOptions),
    });
    if (!exported.success) {
      throw failure(exported.issues.map(runtimeIssueDiagnostic));
    }
    const [primary, ...resources] = exported.data;
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
      exported.data.map(async ({ name, bytes }) => ({
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
    const subject = admit({
      format,
      primary: primary.bytes,
      resources,
      sourceUnit: honored.sourceUnit,
      diagnostics: exported.issues.map(runtimeIssueDiagnostic),
      ...(options.ingestOptions === undefined ? {} : { ingestOptions: options.ingestOptions }),
    });
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

  const coalescedRuntime = async (options: RuntimeOptions & GeoSpecNativeLoadModelOptions) => {
    const configured = options.runtime ?? defaults.runtime;
    if (
      !('code' in options) ||
      configured === undefined ||
      options.parameters !== undefined ||
      options.ingestOptions !== undefined ||
      ['sourceUnit', 'unit', 'scale', 'coordinateSystem'].some((key) => key in options)
    ) {
      return loadRuntime(options);
    }
    const codePrototype: unknown = Object.getPrototypeOf(options.code);
    if (
      (codePrototype !== Object.prototype && codePrototype !== null) ||
      Object.values(Object.getOwnPropertyDescriptors(options.code)).some(
        (descriptor) => !('value' in descriptor) || typeof descriptor.value !== 'string',
      )
    ) {
      return loadRuntime(options);
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
      return existing;
    }
    const pending = loadRuntime({ ...options, code });
    loads.set(key, pending);
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
      'mesh',
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
        ? loadDirect(snapshot as Extract<GeoSpecNativeLoadModelOptions, { source: unknown }>)
        : coalescedRuntime(snapshot as RuntimeOptions & GeoSpecNativeLoadModelOptions);
    const pending = (async () => {
      const subject = await admission;
      return { ...subject, ...(subject.load === undefined ? {} : { load: { ...subject.load, loadId } }) };
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
      const handles = carried === undefined ? [...admissions.values()] : staleCarried().map(([, handle]) => handle);
      if (carried !== undefined) {
        carried.clear();
        for (const [subjectHash, handle] of admissions) {
          carried.set(subjectHash, handle);
        }
      }
      admissions.clear();
      for (const handle of handles.reverse()) {
        try {
          release(handle);
        } catch (error) {
          errors.push(error);
        }
      }
      for (const runtime of ownedRuntimes) {
        try {
          runtime.terminate();
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
