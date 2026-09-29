/**
 * Kernel Runtime Worker
 *
 * A generic worker that hosts kernel plugins defined by a worker-owned runtime definition.
 * Replaces the pattern of one Worker per kernel with a single Worker per compilation
 * unit that loads only the WASM runtime it needs.
 *
 * Kernel selection:
 * 1. Extension-based fast path: .scad -> OpenRSCAD, .kcl -> KCL
 * 2. Import-based: for .ts/.js files, bundles the entry and inspects imports
 * 3. Caches selection for subsequent renders of the same file
 *
 * This worker extends KernelWorker to reuse all infrastructure:
 * file caching, middleware chain, telemetry, and the MessagePort dispatcher.
 */

// oxlint-disable-next-line import-x/no-unassigned-import -- side-effect: stubs `document` before any bundler modulepreload code runs
import '#framework/worker-preload-polyfill.js';
import type {
  CreateGeometryResult,
  ExportGeometryResult,
  GetParameterDeclarationsResult,
  KernelIssue,
} from '#types/runtime.types.js';
import type {
  ExportGeometryInput,
  GetDependenciesInput,
  GetParametersInput,
  KernelRuntime,
} from '#types/runtime-kernel.types.js';
import type {
  Artifact,
  EvaluateResult,
  KernelOffers,
  RenderResult,
  RenderOutput,
  WriteOutput,
  KernelDefinitionV2,
  KernelExportDeclarations,
  KernelViewDeclarations,
  ViewInstance,
} from '#types/runtime-kernel-v2.types.js';
import type { GetDependenciesResult } from '#types/runtime-dependency.types.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import { KernelWorker } from '#framework/kernel-worker.js';
import type { EvaluationSlot, KernelBinding, NativeBuildInput, OperationOwner } from '#framework/render-artifact.js';
import { isRenderAbortedError } from '#framework/runtime-worker-client.js';
import { preserveMethodNames } from '#framework/named.js';
import { isWebAssemblyException } from '#framework/wasm-exception.js';
import { createKernelError } from '#kernels/kernel-helpers.js';
import type { KernelPlugin } from '#plugins/plugin-types.js';
import type { RuntimeContentInput } from '#types/runtime-content.types.js';
import type { RenderRequest } from '#types/runtime-middleware-v2.types.js';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';
import { resolveRuntimeDefinition } from '#worker/runtime-definition.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import { RuntimeAlreadyInitializedError } from '#transport/runtime-transport.types.js';
import { sourcePathMatchesExtensions } from '@taucad/utils/file';
import type { z } from 'zod';

type WorkerKernelDefinition = KernelDefinitionV2<
  string,
  readonly string[],
  unknown,
  unknown,
  unknown,
  z.ZodType | undefined,
  z.ZodObject<z.ZodRawShape> | undefined,
  KernelViewDeclarations,
  KernelExportDeclarations
>;

/**
 * Configuration for a kernel plugin within the runtime worker.
 */
type KernelPluginEntry = KernelPlugin<Record<string, unknown>, unknown> &
  RuntimePluginDefinitionCarrier<WorkerKernelDefinition>;

type LoadedKernel = {
  entry: KernelPluginEntry;
  definition: WorkerKernelDefinition;
  ctx: unknown;
  initialized: boolean;
  options: Record<string, unknown>;
};

type RuntimeKernelBinding = KernelBinding<LoadedKernel>;

type RuntimeWorkerOptions = Record<string, never>;

type KernelRuntimeWorkerOptions = {
  readonly runtime: AnyRuntimeDefinition;
};

/**
 * Generic kernel runtime worker.
 * Loads worker-owned kernel definitions and delegates to the active kernel.
 */
/** How a kernel was selected. */
type SelectionMethod = 'regex' | 'bundler' | 'extension' | 'catchall';

type KernelSelection = {
  kernel: LoadedKernel;
  method: SelectionMethod;
};

/** Maximum registered extensions named in an unhandled-extension diagnostic before eliding. */
const listedExtensionLimit = 12;

const isViewInstance = (value: unknown): value is ViewInstance =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  'title' in value &&
  typeof value.title === 'string';

/**
 * Describe why an entry matched no kernel: its extension and the ones the runtime does handle.
 *
 * @param entryPath - Canonical path of the entry that matched no kernel.
 * @param kernels - Kernel registrations composing the runtime.
 * @returns A diagnostic naming the unhandled extension and the registered ones.
 */
const describeUnhandledExtension = (entryPath: string, kernels: readonly KernelPluginEntry[]): string => {
  const dotIndex = entryPath.lastIndexOf('.');
  const extension = dotIndex > 0 ? entryPath.slice(dotIndex) : entryPath.slice(entryPath.lastIndexOf('/') + 1);
  const handled = [...new Set(kernels.flatMap((kernel) => kernel.extensions))].filter((candidate) => candidate !== '*');
  const listed = handled.slice(0, listedExtensionLimit).join(', ');
  const registered = handled.length > listedExtensionLimit ? `${listed}, …` : `${listed || 'none'}.`;
  return `No kernel handles "${extension}". Registered kernels handle: ${registered} Install a plugin that declares this extension and add it to the runtime definition.`;
};

/** Multi-kernel runtime worker that dynamically selects and delegates to loaded kernel definitions. */
class KernelRuntimeWorker extends KernelWorker<RuntimeWorkerOptions> {
  protected override readonly name = 'KernelRuntimeWorker';

  private readonly runtime: AnyRuntimeDefinition;
  private readonly loadedKernels = new Map<string, LoadedKernel>();
  private activeKernelId: string | undefined;
  private readonly selectionCache = new Map<string, { id: string; method: SelectionMethod }>();
  private readonly selectionErrors = new Map<string, unknown>();
  private kernelPlugins: readonly KernelPluginEntry[] = [];
  private cachedDetectionDeps?: GetDependenciesResult;
  private initialized = false;

  public constructor(options: KernelRuntimeWorkerOptions) {
    super();
    this.runtime = options.runtime;
  }

  /** Initializes the configured runtime and its kernel registrations. */
  public override async initialize(input: {
    callbacks: Parameters<KernelWorker<RuntimeWorkerOptions>['initialize']>[0]['callbacks'];
    transferables: Parameters<KernelWorker<RuntimeWorkerOptions>['initialize']>[0]['transferables'];
    options?: RuntimeWorkerOptions;
    config?: unknown;
  }): Promise<void> {
    if (this.initialized) {
      throw new RuntimeAlreadyInitializedError();
    }
    this.initialized = true;
    try {
      const resolvedRuntime = await resolveRuntimeDefinition(this.runtime, input.config);
      this.assertUniquePluginIds('kernel', resolvedRuntime.kernels);
      this.kernelPlugins = resolvedRuntime.kernels;
      this.loadedKernels.clear();
      this.kernelExportZodSchemasMap.clear();
      this.kernelRenderZodSchemaMap.clear();
      this.kernelCreateOptionsZodSchemaMap.clear();
      this.kernelExportContentMap.clear();
      this.kernelRenderContentMap.clear();
      this.kernelInitOptionsMap.clear();
      this.kernelImplementationAssetsMap.clear();
      this.activeKernelId = undefined;
      this.selectionCache.clear();
      this.selectionErrors.clear();
      this.configureRuntimePlugins({
        kernels: resolvedRuntime.kernels,
        middleware: resolvedRuntime.middleware,
        bundlers: resolvedRuntime.bundlers,
        transcoders: resolvedRuntime.transcoders,
      });
      await super.initialize(input);
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  // =====================================================================
  // Protected overrides (must precede private methods per linter rules)
  // =====================================================================

  protected override async onInitialize(
    _input: { options: RuntimeWorkerOptions },
    _runtime: KernelRuntime,
  ): Promise<void> {
    await Promise.resolve();
  }

  protected override async onCleanup(): Promise<void> {
    for (const kernel of this.loadedKernels.values()) {
      if (!kernel.initialized) {
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- release each initialized owner independently in load order.
        await kernel.definition.onDispose?.(kernel.ctx);
      } catch (error) {
        this.logger.warn('Kernel cleanup failed', { data: { kernelId: kernel.entry.id, error: String(error) } });
      }
    }
    this.loadedKernels.clear();
    this.activeKernelId = undefined;
    this.selectionCache.clear();
    this.selectionErrors.clear();
    this.cachedDetectionDeps = undefined;
  }

  protected override async onGetDependencies(
    input: GetDependenciesInput,
    runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    const owner = await this.createRequestOperationOwner(input, 'request', runtime);
    return this.onGetDependenciesForOwner(owner, input, runtime);
  }

  protected override async onGetDependenciesForOwner(
    owner: OperationOwner,
    input: GetDependenciesInput,
    runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    if (this.cachedDetectionDeps) {
      const deps = this.cachedDetectionDeps;
      this.cachedDetectionDeps = undefined;
      return deps;
    }

    const kernel = this.getKernelForOwner(owner);
    if (!kernel) {
      return { resolved: [input.entryPath], unresolved: [] };
    }

    return kernel.definition.resolve(input, this.forKernel(kernel, runtime), kernel.ctx);
  }

  protected override async onGetParameters(
    input: GetParametersInput,
    runtime: KernelRuntime,
  ): Promise<GetParameterDeclarationsResult> {
    const owner = await this.createRequestOperationOwner(input, 'request', runtime);
    return this.onGetParametersForOwner(owner, input, runtime);
  }

  protected override async onGetParametersForOwner(
    owner: OperationOwner,
    input: GetParametersInput,
    runtime: KernelRuntime,
  ): Promise<GetParameterDeclarationsResult> {
    const selectionError = this.selectionErrors.get(input.entryPath);
    if (selectionError) {
      return createKernelError([this.createKernelBindingIssue(selectionError)]);
    }

    const kernel = this.getKernelForOwner(owner);
    if (!kernel) {
      runtime.logger.warn(`getParameters failed: ${describeUnhandledExtension(input.entryPath, this.kernelPlugins)}`, {
        data: { entryPath: input.entryPath, loadedKernels: [...this.loadedKernels.keys()] },
      });
      return createKernelError([
        {
          message: describeUnhandledExtension(input.entryPath, this.kernelPlugins),
          code: 'KERNEL_CAPABILITY_MISSING',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }

    const result = await kernel.definition.describe(input, this.forKernel(kernel, runtime), kernel.ctx);
    return result.success ? { success: true, data: result.data.parameters, issues: result.issues } : result;
  }

  protected override async onCreateGeometry(
    input: NativeBuildInput,
    runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    const owner = await this.createRequestOperationOwner(input, 'request', runtime);
    return this.onCreateGeometryForOwner(owner, input, runtime, this.createEvaluationSlot(owner, input.entryPath));
  }

  // oxlint-disable-next-line max-params -- Implements the base owner-bound hook including its evaluation slot.
  protected override async onCreateGeometryForOwner(
    owner: OperationOwner,
    input: NativeBuildInput,
    runtime: KernelRuntime,
    slot: EvaluationSlot,
  ): Promise<CreateGeometryResult> {
    const result = await this.onEvaluateForOwner(owner, input, runtime, slot);
    return result.success
      ? {
          success: true,
          data: undefined,
          issues: result.issues,
          ...(result.serializedHandle === undefined ? {} : { serializedNativeHandle: result.serializedHandle }),
          ...(result.serializeHandleSnapshot === undefined
            ? {}
            : { serializeNativeHandleSnapshot: result.serializeHandleSnapshot }),
        }
      : result;
  }

  // oxlint-disable-next-line max-params -- Implements the base owner-bound hook including its evaluation slot.
  protected override async onEvaluateForOwner(
    owner: OperationOwner,
    input: NativeBuildInput,
    runtime: KernelRuntime,
    slot: EvaluationSlot,
  ): Promise<EvaluateResult> {
    const selectionError = this.selectionErrors.get(input.entryPath);
    if (selectionError) {
      this.selectionErrors.delete(input.entryPath);
      return createKernelError([this.createKernelBindingIssue(selectionError)]);
    }

    const kernel = this.getKernelForOwner(owner);
    if (!kernel) {
      runtime.logger.warn('createGeometry failed: kernel-not-selected', {
        data: { entryPath: input.entryPath, loadedKernels: [...this.loadedKernels.keys()] },
      });
      return createKernelError([
        {
          message: describeUnhandledExtension(input.entryPath, this.kernelPlugins),
          code: 'KERNEL_CAPABILITY_MISSING',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }

    try {
      const kernelRuntime = this.forKernel(kernel, runtime);
      const output = await kernel.definition.evaluate(
        { entryPath: input.entryPath, parameters: input.parameters, options: input.options ?? {} },
        kernelRuntime,
        kernel.ctx,
      );

      this.captureNativeHandle(output.handle, owner, slot);
      const instances: Record<string, readonly ViewInstance[]> = {};
      for (const [id, value] of Object.entries(output.instances ?? {})) {
        const candidate: unknown = value;
        if (!Array.isArray(candidate) || !candidate.every((item: unknown) => isViewInstance(item))) {
          throw new TypeError(`Kernel ${kernel.entry.id} offered invalid instances for view ${id}.`);
        }
        instances[id] = candidate.filter((item: unknown) => isViewInstance(item));
      }
      const offers = {
        ...(output.views === undefined ? {} : { views: output.views }),
        ...(output.exports === undefined ? {} : { exports: output.exports }),
        ...(output.instances === undefined ? {} : { instances }),
      };
      slot.offers = offers;
      slot.nativeBuildInput = input;
      const defaultViewId = output.views === undefined ? Object.keys(kernel.definition.views)[0] : output.views[0];
      const defaultView = defaultViewId ? kernel.definition.views[defaultViewId] : undefined;
      if (defaultView) {
        this.kernelRenderMimeTypeMap.set(kernel.entry.id, defaultView.mimeType);
        this.kernelRenderContentMap.set(kernel.entry.id, defaultView.content ?? []);
        if (defaultView.optionsSchema) {
          this.kernelRenderZodSchemaMap.set(kernel.entry.id, defaultView.optionsSchema);
        } else {
          this.kernelRenderZodSchemaMap.delete(kernel.entry.id);
        }
      } else {
        this.kernelRenderMimeTypeMap.delete(kernel.entry.id);
        this.kernelRenderContentMap.delete(kernel.entry.id);
        this.kernelRenderZodSchemaMap.delete(kernel.entry.id);
      }

      const { serializeHandle } = kernel.definition;
      if (serializeHandle) {
        const { handle } = output;
        return {
          success: true,
          data: offers,
          issues: [...(output.issues ?? [])],
          /* D12: the snapshot is an export artifact that no display render reads, and serialising a
           * Replicad or OpenCascade shape is not cheap — so it is produced where someone asks for
           * it. The liveness check is load-bearing, not defensive: this thunk outlives the handle,
           * and serialising a disposed kernel shape is a crash. */
          serializeHandleSnapshot: () => {
            if (!this.isEvaluationSlotLive(slot)) {
              return undefined;
            }
            const serialized = serializeHandle({ handle }, kernelRuntime, kernel.ctx);
            if (serialized === undefined || serialized === null) {
              throw new Error('Kernel native-handle snapshot serializer returned null or undefined.');
            }
            return serialized;
          },
        };
      }

      return {
        success: true,
        data: offers,
        issues: [...(output.issues ?? [])],
      };
    } catch (error) {
      if (isRenderAbortedError(error)) {
        throw error;
      }

      if (error instanceof Error && 'issues' in error && Array.isArray(error.issues)) {
        return { success: false, issues: error.issues as KernelIssue[] };
      }

      let message: string;
      if (error instanceof Error) {
        message = error.message;
      } else if (isWebAssemblyException(error)) {
        message = 'KernelError: The geometry kernel threw an undecodable C++ exception';
      } else {
        message = String(error);
      }

      return {
        success: false,
        issues: [
          {
            message,
            code: 'KERNEL_BINDING_FAILED',
            type: 'kernel',
            severity: 'error',
          },
        ],
      };
    }
  }

  protected override kernelHasMeshPhaseForOwner(owner: OperationOwner): boolean {
    return this.getKernelForOwner(owner)?.definition.render !== undefined;
  }

  protected override selectDefaultViewForOwner(
    owner: OperationOwner,
    offers: KernelOffers,
  ): { view: string; mimeType: Artifact['mimeType'] } | undefined {
    const kernel = this.getKernelForOwner(owner);
    if (!kernel) {
      return undefined;
    }
    const view = offers.views === undefined ? Object.keys(kernel.definition.views)[0] : offers.views[0];
    const declaration = view ? kernel.definition.views[view] : undefined;
    return view && declaration ? { view, mimeType: declaration.mimeType } : undefined;
  }

  // oxlint-disable-next-line max-params -- Implements the base owner-bound hook including its evaluation slot.
  protected override async onRenderForOwner(
    owner: OperationOwner,
    input: RenderRequest & { nativeHandle: unknown },
    runtime: KernelRuntime,
    slot: EvaluationSlot,
  ): Promise<RenderResult> {
    const kernel = this.getKernelForOwner(owner);
    const render = kernel?.definition.render;
    const declaration = kernel?.definition.views[input.view];
    if (!kernel || !render || !declaration || declaration.mimeType !== input.mimeType) {
      return createKernelError([
        {
          message: `No matching render view ${input.view} with media type ${input.mimeType}.`,
          code: 'KERNEL_CAPABILITY_MISSING',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }
    const offeredViews = slot.offers?.views;
    if (offeredViews !== undefined && !offeredViews.includes(input.view)) {
      return createKernelError([
        {
          message: `Kernel ${kernel.entry.id} did not offer view ${input.view} for this evaluation.`,
          code: 'KERNEL_CAPABILITY_MISSING',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }
    const parsed = declaration.optionsSchema?.safeParse(input.options);
    if (parsed && !parsed.success) {
      return createKernelError(
        parsed.error.issues.map((issue) => ({
          message: `Kernel ${kernel.entry.id} view ${input.view} option ${issue.path.join('.')}: ${issue.message}`,
          code: 'RUNTIME',
          type: 'kernel',
          severity: 'error',
        })),
      );
    }
    if (!declaration.optionsSchema && Object.keys(input.options).length > 0) {
      return createKernelError([
        {
          message: `Kernel ${kernel.entry.id} view ${input.view} declares no options.`,
          code: 'RUNTIME',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }
    const resolvedOptions: unknown = parsed?.data ?? {};
    if (typeof resolvedOptions !== 'object' || resolvedOptions === null || Array.isArray(resolvedOptions)) {
      return createKernelError([
        {
          message: `Kernel ${kernel.entry.id} view ${input.view} options must resolve to an object.`,
          code: 'RUNTIME',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }
    try {
      // The registration's exact generic view union is erased at the dynamic worker boundary;
      // the selected declaration, offer, media type and options were checked above.
      const renderSelected = render as (
        input: {
          handle: unknown;
          view: string;
          options: Record<string, unknown>;
          instance?: string;
          content?: RuntimeContentInput;
        },
        services: KernelRuntime,
        context: unknown,
      ) => Promise<RenderOutput>;
      const output = await renderSelected(
        {
          handle: input.nativeHandle,
          view: input.view,
          options: { ...resolvedOptions },
          ...(input.instance === undefined ? {} : { instance: input.instance }),
          ...(input.content === undefined ? {} : { content: input.content }),
        },
        this.forKernel(kernel, runtime),
        kernel.ctx,
      );
      return {
        success: true,
        data: {
          content: output.content,
          mimeType: declaration.mimeType,
          ...(output.units ? { units: output.units } : {}),
        },
        issues: [...(output.issues ?? [])],
      };
    } catch (error) {
      if (isRenderAbortedError(error)) {
        throw error;
      }
      if (error instanceof Error && 'issues' in error && Array.isArray(error.issues)) {
        return { success: false, issues: error.issues as KernelIssue[] };
      }
      return createKernelError([
        {
          message: error instanceof Error ? error.message : String(error),
          code: 'KERNEL_BINDING_FAILED',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }
  }

  protected override async onExportGeometry(
    input: ExportGeometryInput,
    runtime: KernelRuntime,
  ): Promise<ExportGeometryResult> {
    if (!this.activeKernelId) {
      return {
        success: false,
        issues: [
          {
            message: 'No geometry available for export',
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
          },
        ],
      };
    }

    const kernel = this.getActiveKernel();
    return this.writeForKernel(kernel, input, runtime);
  }

  // oxlint-disable-next-line max-params -- Implements the base owner-bound hook including its evaluation slot.
  protected override async onExportGeometryForOwner(
    owner: OperationOwner,
    input: ExportGeometryInput,
    runtime: KernelRuntime,
    slot?: EvaluationSlot,
  ): Promise<ExportGeometryResult> {
    const kernel = this.getKernelForOwner(owner);
    if (!kernel) {
      return {
        success: false,
        issues: [
          {
            message: 'No geometry available for export',
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
          },
        ],
      };
    }

    return this.writeForKernel(kernel, input, runtime, slot);
  }

  protected override async isNativeHandleValidForOwner(
    owner: OperationOwner,
    nativeHandle: unknown,
    runtime: KernelRuntime,
  ): Promise<boolean | undefined> {
    const kernel = this.getKernelForOwner(owner);
    if (!kernel?.definition.isHandleValid) {
      return undefined;
    }

    return kernel.definition.isHandleValid({ handle: nativeHandle }, this.forKernel(kernel, runtime), kernel.ctx);
  }

  // oxlint-disable-next-line max-params -- Implements the base owner-bound hook including its evaluation slot.
  protected override async deserializeNativeHandleForOwner(
    owner: OperationOwner,
    serializedNativeHandle: unknown,
    runtime: KernelRuntime,
    _slot: EvaluationSlot,
  ): Promise<unknown | undefined> {
    const kernel = this.getKernelForOwner(owner);
    if (!kernel?.definition.deserializeHandle) {
      return undefined;
    }

    const handle = kernel.definition.deserializeHandle(
      { serialized: serializedNativeHandle },
      this.forKernel(kernel, runtime),
      kernel.ctx,
    );
    return handle;
  }

  // oxlint-disable-next-line max-params -- Implements the base owner-bound hook including its evaluation slot.
  protected override disposeNativeHandleForOwner(
    owner: OperationOwner,
    nativeHandle: unknown,
    runtime: KernelRuntime,
    _slot: EvaluationSlot,
  ): void {
    const kernel = this.getKernelForOwner(owner);
    if (kernel) {
      kernel.definition.releaseHandle?.({ handle: nativeHandle }, this.forKernel(kernel, runtime), kernel.ctx);
    }
  }

  protected override async resolveKernelBinding(
    input: { entryPath: string },
    runtime: KernelRuntime,
  ): Promise<RuntimeKernelBinding | undefined> {
    const span = runtime.tracer.startSpan('kernel.select', { file: input.entryPath });
    let selected: { kernelId: string; method: SelectionMethod } | undefined;
    try {
      const selection = await this.selectKernel(input.entryPath, runtime);
      if (!selection) {
        return undefined;
      }

      /* The selected kernel is on the span because nothing else in a trace says which kernel ran:
       * a desktop host with a resident native engine logs that engine's identity at fork, whatever
       * the render then selects. */
      selected = { kernelId: selection.kernel.entry.id, method: selection.method };
      return {
        kernelId: selection.kernel.entry.id,
        kernelVersion: selection.kernel.definition.version,
        entryPath: input.entryPath,
        kernel: selection.kernel,
      };
    } catch (error) {
      this.selectionErrors.set(input.entryPath, error);
      return undefined;
    } finally {
      span.end(selected);
    }
  }

  protected override publishOperationOwner(owner: OperationOwner): void {
    const nextKernelId = owner.binding?.kernelId;
    if (this.activeKernelId === nextKernelId) {
      return;
    }

    this.activeKernelId = nextKernelId;
    this.onActiveKernelChanged?.({ kernelId: nextKernelId, renderId: this.activeRenderId });
  }

  protected override getActiveKernelId(): string | undefined {
    return this.activeKernelId;
  }

  protected override getActiveKernelVersion(): string | undefined {
    return this.activeKernelId ? this.getActiveKernel().definition.version : undefined;
  }

  protected override describeUnselectedKernel(owner: OperationOwner): string {
    return describeUnhandledExtension(owner.file.filename, this.kernelPlugins);
  }

  protected override onFileChanged(_changedPaths: readonly string[]): void {
    this.clearFileDerivedKernelState();
  }

  protected override onVolatileFileCachesCleared(): void {
    this.clearFileDerivedKernelState();
  }

  protected override onPublishedArtifactInvalidated(): void {
    if (this.activeKernelId === undefined) {
      return;
    }
    this.activeKernelId = undefined;
    this.onActiveKernelChanged?.({ renderId: this.activeRenderId });
  }

  /** Map the current client's extension route to the v2 export declaration. */
  // oxlint-disable-next-line max-params -- The optional evaluation slot guards selected offers at the write boundary.
  private async writeForKernel(
    kernel: LoadedKernel,
    input: ExportGeometryInput & { content?: RuntimeContentInput },
    runtime: KernelRuntime,
    slot?: EvaluationSlot,
  ): Promise<ExportGeometryResult> {
    const selected = Object.entries(kernel.definition.exports).find(
      ([, declaration]) => declaration.extension === input.format,
    );
    if (!selected || !kernel.definition.write) {
      return createKernelError([
        {
          message: `Kernel ${kernel.entry.id} does not offer export format ${input.format}.`,
          code: 'KERNEL_CAPABILITY_MISSING',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }
    const [exportId, declaration] = selected;
    const offeredExports = slot?.offers?.exports;
    if (offeredExports !== undefined && !offeredExports.includes(exportId)) {
      return createKernelError([
        {
          message: `Kernel ${kernel.entry.id} did not offer export ${exportId} for this evaluation.`,
          code: 'KERNEL_CAPABILITY_MISSING',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }
    const parsed = declaration.optionsSchema?.safeParse(input.options);
    if (parsed && !parsed.success) {
      return createKernelError(
        parsed.error.issues.map((issue) => ({
          message: `Kernel ${kernel.entry.id} export ${exportId} option ${issue.path.join('.')}: ${issue.message}`,
          code: 'RUNTIME',
          type: 'kernel',
          severity: 'error',
        })),
      );
    }
    if (!declaration.optionsSchema && Object.keys(input.options).length > 0) {
      return createKernelError([
        {
          message: `Kernel ${kernel.entry.id} export ${exportId} declares no options.`,
          code: 'RUNTIME',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }
    const resolvedOptions: unknown = parsed?.data ?? {};
    if (typeof resolvedOptions !== 'object' || resolvedOptions === null || Array.isArray(resolvedOptions)) {
      return createKernelError([
        {
          message: `Kernel ${kernel.entry.id} export ${exportId} options must resolve to an object.`,
          code: 'RUNTIME',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }
    try {
      // The exact export union is erased at this dynamic boundary after declaration,
      // offer and option admission; preserve the selected provider content.
      const writeSelected = kernel.definition.write as (
        input: { handle: unknown; exportId: string; options: Record<string, unknown>; content?: RuntimeContentInput },
        services: KernelRuntime,
        context: unknown,
      ) => Promise<WriteOutput>;
      const output = await writeSelected(
        {
          handle: input.nativeHandle,
          exportId,
          options: { ...resolvedOptions },
          ...(input.content ? { content: input.content } : {}),
        },
        this.forKernel(kernel, runtime),
        kernel.ctx,
      );
      if (output.files.length === 0) {
        return createKernelError([
          {
            message: `Kernel ${kernel.entry.id} export ${exportId} produced no files.`,
            code: 'EXPORT_ARTIFACT_SET_INVALID',
            type: 'runtime',
            severity: 'error',
          },
        ]);
      }
      return { success: true, data: [...output.files], issues: [...(output.issues ?? [])] };
    } catch (error) {
      if (isRenderAbortedError(error)) {
        throw error;
      }
      return createKernelError([
        {
          message: error instanceof Error ? error.message : String(error),
          code: 'KERNEL_BINDING_FAILED',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }
  }

  private clearFileDerivedKernelState(): void {
    this.selectionCache.clear();
    this.selectionErrors.clear();
    this.cachedDetectionDeps = undefined;
  }

  // =====================================================================
  // Private methods
  // =====================================================================

  private async createRequestOperationOwner(
    input: GetDependenciesInput | GetParametersInput | NativeBuildInput,
    kind: OperationOwner['kind'],
    runtime: KernelRuntime,
  ): Promise<OperationOwner> {
    const binding = await this.resolveKernelBinding({ entryPath: input.entryPath }, runtime);
    const lastSlash = input.entryPath.lastIndexOf('/');
    return {
      kind,
      file: {
        filename: input.entryPath.slice(lastSlash + 1),
        path: input.entryPath.slice(0, lastSlash),
      },
      binding,
    };
  }

  private getKernelForOwner(owner: OperationOwner): LoadedKernel | undefined {
    const binding = owner.binding as RuntimeKernelBinding | undefined;
    if (binding?.kernel) {
      return binding.kernel;
    }

    if (!binding?.kernelId) {
      return undefined;
    }

    const kernel = this.loadedKernels.get(binding.kernelId);
    return kernel?.definition.version === binding.kernelVersion ? kernel : undefined;
  }

  private async loadKernelModule(config: KernelPluginEntry, tracer: RuntimeSpanTracer): Promise<LoadedKernel> {
    const existing = this.loadedKernels.get(config.id);
    if (existing) {
      return existing;
    }

    const importSpan = tracer.startSpan('kernel.load-module', {
      id: config.id,
    });
    this.logger.debug(`Loading kernel module: ${config.id}`);
    const definition = await resolveRuntimePluginDefinition<WorkerKernelDefinition>('kernel', config);
    importSpan.end();

    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime guard for dynamic import
    if (!definition || typeof definition.resolve !== 'function') {
      throw new Error(`Kernel module ${config.id} does not export a valid KernelDefinition`);
    }

    const rawOptions = config.options ?? {};
    const parsedOptions: unknown = definition.optionsSchema ? definition.optionsSchema.parse(rawOptions) : rawOptions;
    if (typeof parsedOptions !== 'object' || parsedOptions === null || Array.isArray(parsedOptions)) {
      throw new TypeError(`Kernel ${config.id} options schema must produce an object.`);
    }
    const validatedOptions: Record<string, unknown> = { ...parsedOptions };
    const implementationAssets = definition.implementationAssets ?? [];
    await this.verifyImplementationAssets(config.id, implementationAssets);

    const loaded: LoadedKernel = {
      entry: config,
      definition,
      ctx: undefined,
      initialized: false,
      options: validatedOptions,
    };

    this.loadedKernels.set(config.id, loaded);
    const exportFormats = definition.exports;

    this.kernelExportZodSchemasMap.set(
      config.id,
      Object.fromEntries(
        Object.values(exportFormats).map((declaration) => [declaration.extension, declaration.optionsSchema]),
      ),
    );
    this.kernelExportContentMap.set(
      config.id,
      Object.fromEntries(
        Object.values(exportFormats).flatMap((declaration) =>
          declaration.content ? [[declaration.extension, declaration.content]] : [],
        ),
      ),
    );
    this.kernelExportMetadataMap.set(
      config.id,
      Object.fromEntries(
        Object.entries(exportFormats).map(([id, declaration]) => [
          declaration.extension,
          { id, mimeType: declaration.mimeType },
        ]),
      ),
    );
    const defaultView = Object.values(definition.views)[0];
    this.kernelAllViewContentMap.set(config.id, [
      ...new Set(Object.values(definition.views).flatMap((view) => view.content ?? [])),
    ]);
    this.kernelRenderContentMap.set(config.id, defaultView?.content ?? []);
    if (defaultView) {
      this.kernelRenderMimeTypeMap.set(config.id, defaultView.mimeType);
    }
    if (definition.cancellation) {
      this.kernelCancellationMap.set(config.id, definition.cancellation);
    }
    this.kernelInitOptionsMap.set(config.id, validatedOptions);
    this.kernelImplementationAssetsMap.set(config.id, implementationAssets);
    if (defaultView?.optionsSchema) {
      this.kernelRenderZodSchemaMap.set(config.id, defaultView.optionsSchema);
    }
    if (definition.evaluateOptionsSchema) {
      this.kernelCreateOptionsZodSchemaMap.set(config.id, definition.evaluateOptionsSchema);
    }

    this.rebuildAndPushCapabilities();

    return loaded;
  }

  private forKernel(kernel: LoadedKernel, runtime: KernelRuntime): KernelRuntime {
    return {
      ...runtime,
      emitEvent: (type, payload) => {
        const renderId = this.activeRenderId;
        this.onKernelEvent?.({
          kernelId: kernel.entry.id,
          type,
          ...(renderId === undefined ? {} : { renderId }),
          payload,
        });
      },
    };
  }

  private async ensureKernelInitialized(kernel: LoadedKernel, runtime: KernelRuntime): Promise<void> {
    if (kernel.initialized) {
      return;
    }

    this.logger.trace(`Initializing kernel: ${kernel.entry.id}`);

    kernel.ctx = await kernel.definition.initialize(kernel.options, this.forKernel(kernel, runtime));
    kernel.initialized = true;
  }

  /**
   * Select the appropriate kernel for a file using three-pass detection:
   * 1. Extension + regex fast path (entry path only)
   * 2. Bundler-assisted detection via detectImports (transitive, no stubs)
   * 3. Catch-all fallback (extensions: ['*'])
   *
   * @param entryPath - Canonical path to the model entry (used as cache key for collision safety)
   * @param runtime - the kernel runtime context for initialization
   * @returns the selected kernel and selection method, or undefined if no kernel matches
   */
  // oxlint-disable-next-line complexity -- Multi-pass kernel selection requires sequential checks
  private async selectKernel(entryPath: string, runtime: KernelRuntime): Promise<KernelSelection | undefined> {
    const cached = this.selectionCache.get(entryPath);
    if (cached) {
      const kernel = this.loadedKernels.get(cached.id);
      if (kernel) {
        return { kernel, method: cached.method };
      }
    }

    let catchAllEntry: KernelPluginEntry | undefined;
    const hasBundlerKernels = this.kernelPlugins.some((c) => c.builtinModuleNames && c.builtinModuleNames.length > 0);

    /* oxlint-disable no-await-in-loop -- Sequential kernel selection: try each config in priority order */

    // Pass 1: Extension + regex fast path
    for (const config of this.kernelPlugins) {
      const isCatchAll = config.extensions.includes('*');
      const extensionMatch = sourcePathMatchesExtensions(entryPath, config.extensions);
      if (!extensionMatch) {
        continue;
      }

      if (isCatchAll && hasBundlerKernels) {
        catchAllEntry = config;
        continue;
      }

      if (!config.detectImport) {
        const kernel = await this.loadKernelModule(config, runtime.tracer);
        await this.ensureKernelInitialized(kernel, runtime);
        this.selectionCache.set(entryPath, {
          id: config.id,
          method: 'extension',
        });
        return { kernel, method: 'extension' };
      }

      const pattern = config.detectImport;
      let importRegex: RegExp;
      if (pattern instanceof RegExp) {
        importRegex = pattern;
      } else {
        if (typeof pattern.source !== 'string' || typeof pattern.flags !== 'string') {
          throw new TypeError(`Kernel "${config.id}" has invalid detectImport metadata.`);
        }
        try {
          importRegex = new RegExp(pattern.source, pattern.flags);
        } catch (error) {
          throw new TypeError(`Kernel "${config.id}" has invalid detectImport metadata.`, { cause: error });
        }
      }

      try {
        const detectSpan = runtime.tracer.startSpan('kernel.detect-import', {
          kernel: config.id,
        });
        const code = await runtime.filesystem.readFile(entryPath, 'utf8');
        detectSpan.end();
        if (!importRegex.test(code)) {
          continue;
        }
      } catch (error) {
        runtime.logger.warn('selectKernel pass 1 (extension/regex) failed', {
          data: { kernel: config.id, entryPath, error: String(error) },
        });
        continue;
      }

      const kernel = await this.loadKernelModule(config, runtime.tracer);
      await this.ensureKernelInitialized(kernel, runtime);
      this.selectionCache.set(entryPath, { id: config.id, method: 'regex' });
      return { kernel, method: 'regex' };
    }

    // Pass 2: Bundler-assisted detection via detectImports
    const fileExtension = entryPath.includes('.') ? entryPath.slice(entryPath.lastIndexOf('.') + 1).toLowerCase() : '';
    const hasBundler = this.hasBundlerForExtension(fileExtension);
    if (hasBundler) {
      const configsWithBuiltins = this.kernelPlugins.filter(
        (c) => c.builtinModuleNames && c.builtinModuleNames.length > 0,
      );

      if (configsWithBuiltins.length > 0) {
        let matchingConfigs: KernelPluginEntry[] = [];

        try {
          const bundler = await this.ensureBundlerForExtension(fileExtension);
          const detectSpan = runtime.tracer.startSpan('kernel.detect-bundle', {
            entryPath,
          });
          const { detectedModules, dependencies } = await bundler.definition.detectImports(
            { entryPath },
            { signal: runtime.signal },
            bundler.ctx,
          );
          detectSpan.end();
          this.cachedDetectionDeps = { resolved: dependencies, unresolved: [] };

          matchingConfigs = configsWithBuiltins.filter((config) =>
            config.builtinModuleNames!.some((name) =>
              detectedModules.some((detected) => detected === name || detected.startsWith(name + '/')),
            ),
          );
        } catch (error) {
          runtime.logger.warn('selectKernel pass 2 (bundler-detect) failed', {
            data: {
              entryPath,
              configs: configsWithBuiltins.map((c) => c.id),
              error: String(error),
            },
          });
          // Fall through to catch-all
        }

        if (matchingConfigs.length > 0) {
          const primaryConfig = matchingConfigs[0]!;
          const primaryKernel = await this.loadKernelModule(primaryConfig, runtime.tracer);
          await this.ensureKernelInitialized(primaryKernel, runtime);

          for (const config of matchingConfigs.slice(1)) {
            const kernel = await this.loadKernelModule(config, runtime.tracer);
            await this.ensureKernelInitialized(kernel, runtime);
          }

          this.selectionCache.set(entryPath, {
            id: primaryConfig.id,
            method: 'bundler',
          });
          return { kernel: primaryKernel, method: 'bundler' };
        }
      }
    }

    /* oxlint-enable no-await-in-loop -- End sequential kernel selection */

    // Pass 3: Catch-all fallback
    if (catchAllEntry) {
      return this.tryCatchAllKernel(catchAllEntry, { entryPath, runtime });
    }

    return undefined;
  }

  /**
   * Select the catch-all kernel for files that no other kernel matched.
   *
   * @param entry - the kernel module entry to select
   * @returns the selected kernel and selection method
   */
  private async tryCatchAllKernel(
    entry: KernelPluginEntry,
    { entryPath, runtime }: { entryPath: string; runtime: KernelRuntime },
  ): Promise<KernelSelection> {
    const kernel = await this.loadKernelModule(entry, runtime.tracer);
    await this.ensureKernelInitialized(kernel, runtime);

    this.selectionCache.set(entryPath, { id: entry.id, method: 'catchall' });
    return { kernel, method: 'catchall' };
  }

  private getActiveKernel(): LoadedKernel {
    if (!this.activeKernelId) {
      throw new Error('No kernel selected');
    }

    const kernel = this.loadedKernels.get(this.activeKernelId);
    if (!kernel) {
      throw new Error(`Kernel ${this.activeKernelId} not loaded`);
    }

    return kernel;
  }

  private createKernelBindingIssue(error: unknown): KernelIssue {
    let message: string;
    if (error instanceof Error) {
      message = error.message;
    } else if (isWebAssemblyException(error)) {
      message = 'KernelError: The geometry kernel threw an undecodable C++ exception';
    } else {
      message = String(error);
    }

    return {
      message,
      code: 'KERNEL_BINDING_FAILED',
      type: 'kernel',
      severity: 'error',
    };
  }
}

preserveMethodNames(KernelRuntimeWorker, ['onCreateGeometry', 'onGetParameters', 'onExportGeometry']);

export { KernelRuntimeWorker };
