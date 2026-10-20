/**
 * `tauClientExporter`: a GeoSpec model exporter over a connected Tau Runtime client. Hosts pass it in
 * the loader's `exporters`, so `loadModel({ file })` on a code-CAD file exports once through the Runtime
 * and admits the bytes; the Runtime stays out of GeoSpec.
 *
 * @module
 */

import { GeoSpecModelLoadError } from 'geospec/model';
import type {
  GeoSpecConsumedSources,
  GeoSpecExportFormat,
  GeoSpecLoadRegion,
  GeoSpecModelArtifact,
  GeoSpecModelExporter,
  GeoSpecModelExportRequest,
} from 'geospec/model';
import type { GeometryDiagnostic } from 'geospec/mesh';
import type { RuntimeClient } from '@taucad/runtime/client';
import type { KernelIssue } from '@taucad/runtime/types';

import { resolveRuntimeExportIntent } from '#geospec/tau-export-intent.js';
import type { GeoSpecExportRoute, RuntimeClientWithRoutes } from '#geospec/tau-export-intent.js';

/**
 * The Tau Runtime client surface the exporter uses. A connected `RuntimeClient` satisfies it.
 *
 * @public
 */
export type TauExporterClient = Pick<RuntimeClient, 'connect'> &
  Partial<Pick<RuntimeClient, 'shutdown' | 'terminate' | 'snapshotSource' | 'describe'>> & {
    readonly capabilities?:
      | {
          readonly registrations: ReadonlyArray<{
            readonly kind: string;
            readonly extensions?: readonly string[];
          }>;
          readonly routes?: readonly unknown[];
        }
      | undefined;
    open: (
      input: Pick<Parameters<RuntimeClient['open']>[0], 'source' | 'parameters' | 'watch' | 'signal'>,
    ) => Pick<ReturnType<RuntimeClient['open']>, 'export' | 'close'>;
  };

/**
 * Options for {@link tauClientExporter}.
 *
 * @public
 */
export type TauClientExporterOptions =
  | {
      /** A Runtime client the host owns; the exporter connects it and never shuts it down. */
      readonly client: TauExporterClient;
      /** File extensions to claim; defaults to every extension the client's kernels declare. */
      readonly extensions?: readonly string[];
      readonly id?: string;
    }
  | {
      /**
       * Creates a Runtime client on the first export of a scope. The exporter owns it: `close()` shuts it
       * down, and the next scope creates another.
       */
      readonly client: () => Promise<TauExporterClient>;
      /** File extensions to claim; a lazy client cannot be asked before it exists. */
      readonly extensions: readonly string[];
      readonly id?: string;
    };

const issueDiagnostic = (issue: KernelIssue): GeometryDiagnostic => ({
  code: issue.code,
  severity: issue.severity,
  message: issue.message,
  suggestion: 'Fix the model source or its Runtime export route, then retry the native run.',
});

const failure = (diagnostics: readonly GeometryDiagnostic[]): GeoSpecModelLoadError =>
  new GeoSpecModelLoadError([...diagnostics]);

const runtimeSource = (
  request: Pick<GeoSpecModelExportRequest, 'file' | 'inline'>,
): { files: Record<string, string>; entry: string } | { path: string } =>
  request.inline === undefined ? { path: request.file } : { files: { ...request.inline }, entry: request.file };

/**
 * Every export route the Runtime offers for a format: `routesFor` when it lists them, else its best
 * route, else none.
 *
 * @param client - The connected Runtime client.
 * @param format - The requested export format.
 * @returns The routes, possibly empty.
 */
const routesFor = (client: TauExporterClient, format: string): readonly GeoSpecExportRoute[] => {
  const { routesFor: list, bestRouteFor } = client as Partial<{
    routesFor: (format: string) => readonly GeoSpecExportRoute[];
    bestRouteFor: RuntimeClientWithRoutes['bestRouteFor'];
  }>;
  if (typeof list === 'function') {
    return list.call(client, format);
  }
  const best = typeof bestRouteFor === 'function' ? bestRouteFor.call(client, format) : undefined;
  return best === undefined ? [] : [best];
};

/**
 * The kernel that evaluates a source, so export routes are chosen among its own.
 *
 * @param client - The connected Runtime client.
 * @param request - The export naming the source.
 * @returns The kernel id, or `undefined` when the Runtime cannot describe the source; route selection
 *   then spans every kernel.
 */
const describedKernel = async (
  client: TauExporterClient,
  request: GeoSpecModelExportRequest,
): Promise<string | undefined> => {
  if (typeof client.describe !== 'function') {
    return undefined;
  }
  try {
    const { kernelId } = await client.describe({ source: runtimeSource(request) });
    return typeof kernelId === 'string' && kernelId.length > 0 ? kernelId : undefined;
  } catch {
    // A source the Runtime cannot describe still fails or succeeds at export, with its own issues.
    return undefined;
  }
};

/**
 * Refuse a region load no direct route of the evaluating kernel can crop, before exporting.
 *
 * @param client - The connected Runtime client.
 * @param context - The export, its format, region and evaluating kernel.
 * @throws GeoSpecModelLoadError `GEOSPEC_MODEL_REGION_UNSUPPORTED` when no direct route declares `region`.
 */
const assertRegionRoute = (
  client: TauExporterClient,
  context: {
    readonly file: string;
    readonly format: GeoSpecExportFormat;
    readonly region: GeoSpecLoadRegion;
    readonly kernelId: string | undefined;
  },
): void => {
  const { file, format, region, kernelId } = context;
  // A described kernel's own direct routes decide. Without one, the kernel that renders the file is chosen
  // when it opens, so admit the crop when any direct route declares it; the kernel's crop notice stays the
  // authority for the chosen route.
  const routes = routesFor(client, format).filter((route) => kernelId === undefined || route.kernelId === kernelId);
  const cropping = routes.some(
    (route) => route.transcoderId === undefined && 'region' in (route.exportOptions?.schema.properties ?? {}),
  );
  if (cropping) {
    return;
  }
  const kernelIds = [...new Set(routes.flatMap((route) => (route.kernelId === undefined ? [] : [route.kernelId])))];
  throw failure([
    {
      code: 'GEOSPEC_MODEL_REGION_UNSUPPORTED',
      severity: 'error',
      message: `No direct ${format.toUpperCase()} export of this Runtime${kernelIds.length === 0 ? '' : ` (${kernelIds.join(', ')})`} declares a region option, so GeoSpec cannot crop '${file}' before admission.`,
      suggestion:
        'Load the whole model; if it exceeds a host limit, report the claim as not decided at this capacity. A region load needs a kernel whose GLB export crops, such as PicoVoxel, and only scopes a separate claim to that region.',
      details: { file, format, region: { min: [...region.min], max: [...region.max] }, kernelIds },
    },
  ]);
};

const sameRegion = (cropped: unknown, region: GeoSpecLoadRegion): boolean => {
  if (cropped === null || typeof cropped !== 'object') {
    return false;
  }
  const { min, max } = cropped as { min?: unknown; max?: unknown };
  const axes = (actual: unknown, expected: readonly number[]): boolean =>
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value: unknown, index) => value === expected[index]);
  return axes(min, region.min) && axes(max, region.max);
};

const consumedFrom = (files: Readonly<Record<string, string>>): GeoSpecConsumedSources =>
  Object.entries(files).map(([path, sha256]) => ({ path, sha256 }));

/**
 * The extensions a client's kernels declare, without the catch-all `'*'`.
 *
 * @param client - The connected Runtime client.
 * @returns The extensions, without leading dots.
 * @throws TypeError when the client reports no capabilities.
 */
const kernelExtensions = (client: TauExporterClient): readonly string[] => {
  const { capabilities } = client;
  if (capabilities === undefined) {
    throw new TypeError('tauClientExporter needs a client that reports its kernels, or explicit extensions.');
  }
  return [
    ...new Set(
      capabilities.registrations
        .filter(({ kind }) => kind === 'kernel')
        .flatMap(({ extensions = [] }) => extensions)
        .map((extension) => extension.replace(/^\./u, ''))
        .filter((extension) => extension !== '*' && extension.length > 0),
    ),
  ];
};

/**
 * Export one model through a connected Runtime client.
 *
 * @param client - The connected Runtime client.
 * @param request - The loader's export request.
 * @returns The artifact in the canonical Z-up millimetre frame.
 */
const exportThrough = async (
  client: TauExporterClient,
  request: GeoSpecModelExportRequest,
): Promise<GeoSpecModelArtifact> => {
  const { file, format, region } = request;
  const kernelId = await describedKernel(client, request);
  const intent = resolveRuntimeExportIntent({
    runtime: client,
    format,
    ...(kernelId === undefined ? {} : { kernelId }),
    ...(request.mesh?.linearTolerance === undefined ? {} : { meshLinearTolerance: request.mesh.linearTolerance }),
    ...(request.mesh?.angularToleranceDegrees === undefined
      ? {}
      : { meshAngularToleranceDegrees: request.mesh.angularToleranceDegrees }),
  });
  if ('success' in intent) {
    throw failure(intent.diagnostics);
  }
  if (region !== undefined) {
    assertRegionRoute(client, { file, format, region, kernelId });
  }
  const exportOptions = {
    ...structuredClone(intent.options),
    ...(region === undefined ? {} : { region: { min: [...region.min], max: [...region.max] } }),
  };
  // One export, then close: a file watcher would outlive the worker that tears it down.
  const document = client.open({
    source: runtimeSource(request),
    ...(request.parameters === undefined ? {} : { parameters: structuredClone({ ...request.parameters }) }),
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
    throw failure(exported.issues.map((issue) => issueDiagnostic(issue)));
  }
  if (
    region !== undefined &&
    !exported.issues.some(({ details }) =>
      sameRegion(
        details !== null && typeof details === 'object' && 'region' in details ? details.region : undefined,
        region,
      ),
    )
  ) {
    throw failure([
      {
        code: 'GEOSPEC_MODEL_REGION_NOT_HONORED',
        severity: 'error',
        message: `The Runtime export of '${file}' did not confirm the requested region crop, so its bytes may be the whole model.`,
        suggestion: 'Load the whole model, or update the kernel so its export reports the region it cropped.',
        details: { file, format, region: { min: [...region.min], max: [...region.max] } },
      },
    ]);
  }
  // The Runtime type promises a file, but the reply crosses a worker boundary, so an empty one still refuses.
  const files: ReadonlyArray<(typeof exported.files)[number]> = exported.files;
  const [primary, ...resources] = files;
  if (primary === undefined) {
    throw failure([
      {
        code: 'GEOSPEC_NATIVE_MODEL_EXPORT_EMPTY',
        severity: 'error',
        message: `The Tau Runtime exported no ${format.toUpperCase()} artifact for '${file}'.`,
        suggestion: 'Check that the selected source exports geometry in the requested format.',
        details: { file, format },
      },
    ]);
  }
  const revision = exported.sourceRevision;
  return {
    bytes: primary.bytes,
    format,
    sourceUnit: intent.sourceUnit,
    resources: resources.map(({ name, bytes }) => ({ name, bytes })),
    ...(revision === undefined ? {} : { consumedSources: consumedFrom(revision.files) }),
    diagnostics: exported.issues.map((issue) => issueDiagnostic(issue)),
    exportOptions,
  };
};

const release = async (created: TauExporterClient): Promise<void> => {
  if (created.shutdown) {
    await created.shutdown();
  } else {
    created.terminate?.();
  }
};

const start = async (client: () => Promise<TauExporterClient>): Promise<TauExporterClient> => {
  const created = await client();
  try {
    await created.connect();
  } catch (error) {
    try {
      await release(created);
    } catch {
      // The connect failure is the one to report.
    }
    throw error;
  }
  return created;
};

/**
 * A GeoSpec model exporter over a Tau Runtime client: it claims the files the client's kernels declare,
 * resolves the route that gives canonical Z-up millimetre evidence, exports once and closes the document.
 * A kernel without the route a load needs refuses with a typed diagnostic, never another kernel's route.
 *
 * @param options - The client, or a lazy client factory with explicit extensions.
 * @returns The exporter, once the client's kernels are known.
 * @public
 */
export const tauClientExporter = async (options: TauClientExporterOptions): Promise<GeoSpecModelExporter> => {
  const { client } = options;
  let owned: Promise<TauExporterClient> | undefined;
  const connected = async (): Promise<TauExporterClient> => {
    if (typeof client !== 'function') {
      await client.connect();
      return client;
    }
    owned ??= start(client);
    const pending = owned;
    try {
      return await pending;
    } catch (error) {
      // A failed start is not cached, so the next export starts a fresh client.
      if (owned === pending) {
        owned = undefined;
      }
      throw error;
    }
  };
  const extensions = options.extensions ?? kernelExtensions(await connected());
  return {
    id: options.id ?? 'tau',
    extensions: [...extensions],
    capabilities: { formats: ['glb', 'step'], parameters: true, region: true, inlineSources: true },
    async export(request) {
      return exportThrough(await connected(), request);
    },
    async revision(request) {
      const current = await connected();
      if (current.snapshotSource === undefined) {
        return undefined;
      }
      const snapshot = await current.snapshotSource({ source: { path: request.file } });
      if (!snapshot.success) {
        return undefined;
      }
      return snapshot.sourceRevision === undefined
        ? snapshot.data.files.map(({ path, sha256 }) => ({ path, sha256 }))
        : consumedFrom(snapshot.sourceRevision.files);
    },
    async close() {
      const pending = owned;
      owned = undefined;
      if (pending === undefined) {
        return;
      }
      let created: TauExporterClient;
      try {
        created = await pending;
      } catch {
        // The export that started it already reported the failure.
        return;
      }
      await release(created);
    },
  };
};
