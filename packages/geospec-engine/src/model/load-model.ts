/**
 * `loadModel` — the engine half of `geospec/model`.
 *
 * Two branches, and the difference between them is who owns the units:
 *
 * - a **direct geometry source** is a file the caller already has, so the
 *   caller declares its unit and GeoSpec applies exactly one uniform scale;
 * - a **runtime-exported** model is produced on demand, so GeoSpec asks for it
 *   in the only frame it verifies in — millimetres, Z-up — and records what the
 *   route actually honored as `provenance.exportIntent`.
 *
 * That is why the runtime branch has NO unit, scale or coordinate-system knob
 * (Register C7): a knob there would let a spec silently re-interpret the
 * geometry it is asserting about, and every mm-denominated tolerance in the
 * suite would mean something different. Passing one is
 * `GEOSPEC_INVALID_LOAD_MODEL_OPTIONS`, not a best-effort conversion.
 *
 * @module
 */

import { toGeoSpecProtocolJson } from 'geospec/engine';
import { GeoSpecModelLoadError, resolveRuntimeExportIntent } from 'geospec/model';
import type { KernelIssue } from '@taucad/runtime/types';
import type {
  CreateModelLoaderOptions,
  GeoSpecModelFormat,
  GeoSpecModelLoader,
  ManagedGeoSpecModelLoader,
  GeoSpecRuntimeClient,
  GeoSpecRuntimeSourceAdapter,
  LoadModelOptions,
  RuntimeBackedModelFormat,
  RuntimeExportIntent,
} from 'geospec/model';
import { loadMeshObserved } from '#mesh/load-mesh.js';
import type { GeometryDiagnostic, GeometrySubject, GeoSpecUnit, MeshFileFormat } from '#mesh/types.js';
import { loadStepObserved } from '#step/load-step.js';
import { exposeEngineSubject } from '#engine/subject-store.js';
import type { ForensicSink } from '#runner/forensic.js';

/** The code a runtime-branch call carrying a unit/scale/coordinate knob fails with. */
export const invalidLoadModelOptionsCode = 'GEOSPEC_INVALID_LOAD_MODEL_OPTIONS';

/** Option keys the runtime branch refuses outright (Register C7). */
export const forbiddenRuntimeOptionKeys = ['sourceUnit', 'unit', 'scale', 'coordinateSystem'] as const;

const stepFormats = new Set<GeoSpecModelFormat>(['step', 'stp']);

type SourceOptions = Extract<LoadModelOptions, { source: unknown }>;
type RuntimeOptions = Exclude<LoadModelOptions, SourceOptions>;

const isSourceOptions = (options: LoadModelOptions): options is SourceOptions => 'source' in options;

const failure = (diagnostics: GeometryDiagnostic[]): GeoSpecModelLoadError => new GeoSpecModelLoadError(diagnostics);

const runtimeIssueDiagnostic = (issue: KernelIssue, fallbackCode: string): GeometryDiagnostic => ({
  code: (issue as Partial<KernelIssue>).code ?? fallbackCode,
  severity: issue.severity,
  message: issue.message,
  suggestion: 'Fix the model source or its kernel/export path, then re-export the evidence.',
  details: toGeoSpecProtocolJson(issue),
});

/**
 * Refuse a runtime-branch call that tries to reinterpret the exported frame.
 *
 * @param options - The runtime-branch options.
 * @returns The refusal, or `undefined` when the options are knob-free.
 * @public
 */
export const rejectFrameOptions = (options: RuntimeOptions): GeoSpecModelLoadError | undefined => {
  const declared = forbiddenRuntimeOptionKeys.filter((key) => key in (options as Record<string, unknown>));
  return declared.length === 0
    ? undefined
    : failure([
        {
          code: invalidLoadModelOptionsCode,
          severity: 'error',
          message: `loadModel() rejects ${declared.map((key) => `'${key}'`).join(', ')} on a runtime-exported model: GeoSpec always asks the runtime for canonical Z-up millimetre geometry.`,
          suggestion:
            'Drop the option. If the model is authored in another unit, fix it in the model — a loader-side reinterpretation would silently change every tolerance in the suite.',
          details: { declared, honored: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } } },
        },
      ]);
};

const meshFormats = new Set<GeoSpecModelFormat>(['glb', 'gltf', 'mesh-buffer']);

/**
 * Load a direct geometry source: bytes, a path, a blob or a mesh buffer.
 *
 * @param options - The direct-source options.
 * @returns The subject.
 */
const loadDirectSource = async (
  options: SourceOptions,
  runtimeSourceUnit?: GeoSpecUnit,
  forensic?: ForensicSink,
): Promise<GeometrySubject> => {
  const format = options.format ?? 'glb';
  if (stepFormats.has(format)) {
    if (options.sourceUnit !== undefined) {
      throw failure([
        {
          code: invalidLoadModelOptionsCode,
          severity: 'error',
          message:
            "loadModel() rejects 'sourceUnit' for STEP: the file declares its own length unit and GeoSpec's STEP reader normalizes it to millimetres.",
          suggestion: "Remove 'sourceUnit'. Correct a wrong STEP unit declaration in the source artifact.",
          details: { format, sourceUnit: options.sourceUnit },
        },
      ]);
    }
    return loadStepObserved(
      {
        source: options.source as Parameters<typeof loadStepObserved>[0]['source'],
        ...(options.stepStreaming === undefined ? {} : { streaming: options.stepStreaming }),
        ...(options.mesh === undefined ? {} : { mesh: options.mesh }),
        ...(options.meshLinearTolerance === undefined ? {} : { meshLinearTolerance: options.meshLinearTolerance }),
        ...(options.meshAngularToleranceDegrees === undefined
          ? {}
          : { meshAngularToleranceDegrees: options.meshAngularToleranceDegrees }),
        ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
        ...(options.path === undefined ? {} : { path: options.path }),
        ...(options.name === undefined ? {} : { name: options.name }),
      },
      forensic,
    );
  }
  if (!meshFormats.has(format)) {
    throw failure([
      {
        code: invalidLoadModelOptionsCode,
        severity: 'error',
        message: `loadModel() cannot read the '${format}' format.`,
        suggestion: "Use 'glb', 'gltf', 'mesh-buffer', 'step' or 'stp'.",
        details: { format },
      },
    ]);
  }
  const result = await loadMeshObserved(
    {
      source: options.source as Parameters<typeof loadMeshObserved>[0]['source'],
      format: format as MeshFileFormat,
      unit: 'mm',
      ...((runtimeSourceUnit ?? options.sourceUnit) === undefined
        ? {}
        : { sourceUnit: runtimeSourceUnit ?? options.sourceUnit }),
      ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
      ...(options.path === undefined ? {} : { path: options.path }),
      ...(options.name === undefined ? {} : { name: options.name }),
    },
    forensic,
  );
  if (!result.success) {
    throw failure([...result.diagnostics]);
  }
  return result.subject;
};

const resolveAdapter = (options: RuntimeOptions): GeoSpecRuntimeSourceAdapter | undefined =>
  options.sourceAdapters?.find((adapter) => adapter.extensions.some((extension) => options.file.endsWith(extension)));

const createDefaultRuntimeClient = async (projectPath: string | undefined): Promise<GeoSpecRuntimeClient> => {
  const [{ createNodeClient }, { defaultRuntime }] = await Promise.all([
    import('@taucad/runtime/node'),
    import('#model/default-runtime.js'),
  ]);
  return (await createNodeClient({ runtime: defaultRuntime, projectPath })) as unknown as GeoSpecRuntimeClient;
};

/**
 * Obtain the runtime client for a runtime-branch load.
 *
 * @param options - The runtime-branch options.
 * @returns The client and whether this call owns its lifetime.
 */
const resolveRuntime = async (options: RuntimeOptions): Promise<{ runtime: GeoSpecRuntimeClient; owned: boolean }> => {
  if (typeof options.runtime === 'function') {
    return { runtime: await options.runtime(), owned: true };
  }
  if (options.runtime) {
    // A caller-supplied client outlives this call: the runner reuses one client
    // for a whole file, which is the entire point of injecting it.
    return { runtime: options.runtime, owned: false };
  }
  const adapter = resolveAdapter(options);
  if (adapter) {
    return {
      runtime: await adapter.createRuntime({
        ...(options.projectPath === undefined ? {} : { projectPath: options.projectPath }),
        file: options.file,
      }),
      owned: true,
    };
  }
  return { runtime: await createDefaultRuntimeClient(options.projectPath), owned: true };
};

type RuntimeSourceInput = { files: Record<string, string>; entry: string } | { path: string };

type RuntimeExport = (
  format: string,
  options: {
    source?: RuntimeSourceInput;
    parameters?: Record<string, unknown>;
    exportOptions: Record<string, unknown>;
  },
) => ReturnType<GeoSpecRuntimeClient['export']>;

const runtimeSource = (options: RuntimeOptions): { files: Record<string, string>; entry: string } | { path: string } =>
  'code' in options ? { files: options.code, entry: options.file } : { path: options.file };

/**
 * Export a model through the Tau runtime and parse the bytes it produced.
 *
 * @param options - The runtime-branch options.
 * @returns The subject, with the honored export route recorded in provenance.
 */
const loadFromRuntime = async (options: RuntimeOptions, forensic?: ForensicSink): Promise<GeometrySubject> => {
  const rejected = rejectFrameOptions(options);
  if (rejected) {
    throw rejected;
  }
  const format = (options.format ?? 'glb') as RuntimeBackedModelFormat;
  const { runtime, owned } = await resolveRuntime(options);
  try {
    await runtime.connect();
    // Before the source selects its kernel, a Tau runtime has no concrete
    // route metadata. The canonical preflight still supplies the wire intent;
    // the request-scoped export renders privately (publish:false), avoiding a
    // multi-gigabyte preview payload that GeoSpec would immediately discard.
    const intentInput = {
      runtime,
      format,
      ...(options.meshLinearTolerance === undefined ? {} : { meshLinearTolerance: options.meshLinearTolerance }),
      ...(options.meshAngularToleranceDegrees === undefined
        ? {}
        : { meshAngularToleranceDegrees: options.meshAngularToleranceDegrees }),
    };
    const requestedIntent = resolveRuntimeExportIntent(intentInput);
    if ('success' in requestedIntent) {
      throw failure(requestedIntent.diagnostics);
    }
    // The client's `export` is generic over the runtime's registered formats;
    // GeoSpec speaks the protocol's own five, so the call is made through the
    // protocol shape rather than the runtime's inferred format union.
    const exported = await (runtime.export as unknown as RuntimeExport)(format, {
      source: runtimeSource(options),
      ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
      exportOptions: requestedIntent.options,
    });
    if (!exported.success) {
      throw failure(exported.issues.map((issue) => runtimeIssueDiagnostic(issue, 'GEOSPEC_MODEL_EXPORT_FAILED')));
    }
    const file = exported.data[0];
    if (!file) {
      throw failure([
        {
          code: 'GEOSPEC_MODEL_EXPORT_FAILED',
          severity: 'error',
          message: `The runtime exported no ${format.toUpperCase()} file for '${options.file}'.`,
          suggestion: 'Check that the entry file default-exports a shape.',
          details: { file: options.file, format },
        },
      ]);
    }
    // The export has now selected exactly one kernel and published its route
    // metadata. Validate that concrete route rather than recording the
    // route-less preflight as provenance.
    const honoredIntent = resolveRuntimeExportIntent(intentInput);
    if ('success' in honoredIntent) {
      throw failure(honoredIntent.diagnostics);
    }
    const subject = await loadDirectSource(
      {
        source: file.bytes,
        format,
        name: file.name,
        path: options.file,
        ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
        ...(options.stepStreaming === undefined ? {} : { stepStreaming: options.stepStreaming }),
        ...(options.mesh === undefined ? {} : { mesh: options.mesh }),
        ...(options.meshLinearTolerance === undefined ? {} : { meshLinearTolerance: options.meshLinearTolerance }),
        ...(options.meshAngularToleranceDegrees === undefined
          ? {}
          : { meshAngularToleranceDegrees: options.meshAngularToleranceDegrees }),
      },
      honoredIntent.sourceUnit,
      forensic,
    );
    subject.diagnostics.push(
      ...exported.issues.map((issue) => runtimeIssueDiagnostic(issue, 'GEOSPEC_MODEL_EXPORT_FAILED')),
    );
    return withExportIntent(subject, honoredIntent.provenance);
  } catch (error) {
    // A raw kernel throw must never reach a matcher: every model-load failure
    // leaves through the same structured error.
    throw error instanceof GeoSpecModelLoadError
      ? error
      : failure([
          {
            code: 'GEOSPEC_MODEL_EXPORT_FAILED',
            severity: 'error',
            message: `The Tau runtime could not produce ${format.toUpperCase()} evidence for '${options.file}': ${error instanceof Error ? error.message : String(error)}`,
            suggestion: 'Fix the model source, or export the artifact yourself and load it as a direct source.',
            details: { file: options.file, format },
          },
        ]);
  } finally {
    if (owned) {
      runtime.terminate();
    }
  }
};

const withExportIntent = (
  subject: GeometrySubject,
  exportIntent: RuntimeExportIntent['provenance'],
): GeometrySubject => {
  // Provenance is data, but the subject carries live native handles, so the
  // record is written in place rather than through a structural clone.
  subject.provenance.exportIntent = exportIntent;
  return subject;
};

/**
 * Load a CAD model into GeoSpec evidence.
 *
 * @param options - Direct-source, inline-code or project-file options.
 * @returns The geometry subject.
 * @throws GeoSpecModelLoadError when the model cannot be exported or parsed.
 * @public
 */
export const loadModel = async <Code extends Record<string, string> = Record<string, string>>(
  options: LoadModelOptions<Code>,
): Promise<GeometrySubject> =>
  isSourceOptions(options) ? loadDirectSource(options) : loadFromRuntime(options as RuntimeOptions);

const configureForensics = new WeakMap<GeoSpecModelLoader, (sink?: ForensicSink) => void>();

/** Attach a run-scoped forensic sink to an engine-owned model loader. */
export const setModelLoaderForensicSink = (
  loader: GeoSpecModelLoader | undefined,
  sink?: ForensicSink,
): (() => void) => {
  const configure = loader === undefined ? undefined : configureForensics.get(loader);
  configure?.(sink);
  return () => configure?.();
};

/**
 * Build a {@link loadModel} with shared defaults.
 *
 * @param defaults - Defaults applied to every call.
 * @returns The configured loader.
 * @public
 */
export const createModelLoader = (defaults: CreateModelLoaderOptions = {}): ManagedGeoSpecModelLoader => {
  let sharedRuntime: Promise<GeoSpecRuntimeClient> | undefined;
  let disposed = false;
  let forensicSink: ForensicSink | undefined;
  let observedRuntime: GeoSpecRuntimeClient | undefined;
  let stopTelemetry: (() => void) | undefined;

  const observe = (runtime: GeoSpecRuntimeClient): void => {
    stopTelemetry?.();
    stopTelemetry = undefined;
    observedRuntime = runtime;
    if (!forensicSink || !runtime.on) {
      return;
    }
    stopTelemetry = runtime.on('telemetry', (entries) => {
      for (const entry of entries) {
        forensicSink?.({ name: entry.name, value: entry.duration, unit: 'milliseconds' });
      }
    });
  };

  const createSharedRuntime = async (): Promise<GeoSpecRuntimeClient> => {
    if (disposed) {
      throw new Error('GeoSpec model loader is disposed.');
    }
    if (typeof defaults.runtime === 'function') {
      const runtime = await defaults.runtime();
      observe(runtime);
      return runtime;
    }
    const runtime = await createDefaultRuntimeClient(defaults.projectPath);
    observe(runtime);
    return runtime;
  };

  const loader: GeoSpecModelLoader = async (options) => {
    if (isSourceOptions(options)) {
      const merged: SourceOptions = { ...defaults, ...options };
      return exposeEngineSubject(await loadDirectSource(merged, undefined, forensicSink));
    }
    const merged: RuntimeOptions = { ...defaults, ...options };
    // A per-call runtime keeps loadModel's documented ownership semantics. A
    // concrete default is caller-owned. Only a default factory (or the default
    // Node runtime) belongs to this configured loader and is reused.
    const perCallRuntime = options.runtime;
    if (perCallRuntime !== undefined) {
      return exposeEngineSubject(await loadFromRuntime(merged, forensicSink));
    }
    if (resolveAdapter(merged) !== undefined) {
      return exposeEngineSubject(await loadFromRuntime({ ...merged, runtime: undefined }, forensicSink));
    }
    if (defaults.runtime && typeof defaults.runtime !== 'function') {
      return exposeEngineSubject(await loadFromRuntime(merged, forensicSink));
    }
    sharedRuntime ??= createSharedRuntime();
    const runtime = await sharedRuntime;
    const withRuntime: RuntimeOptions = { ...merged, runtime };
    return exposeEngineSubject(await loadFromRuntime(withRuntime, forensicSink));
  };
  configureForensics.set(loader, (sink) => {
    forensicSink = sink;
    if (observedRuntime) {
      observe(observedRuntime);
    }
  });

  return Object.assign(loader, {
    async dispose(): Promise<void> {
      if (disposed) {
        return;
      }
      disposed = true;
      stopTelemetry?.();
      stopTelemetry = undefined;
      configureForensics.delete(loader);
      if (sharedRuntime === undefined) {
        return;
      }
      try {
        const runtime = await sharedRuntime;
        runtime.terminate();
      } catch {
        // Runtime creation failed, so there is no live client to terminate.
      }
    },
  });
};
