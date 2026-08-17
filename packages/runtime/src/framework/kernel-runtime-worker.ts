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
  MeshGeometryResult,
  ExportGeometryResult,
  GetParametersResult,
  KernelIssue,
} from '#types/runtime.types.js';
import type {
  ExportGeometryInput,
  GetDependenciesInput,
  GetParametersInput,
  KernelDefinition,
  KernelExportFormats,
  KernelRuntime,
} from '#types/runtime-kernel.types.js';
import type { GetDependenciesResult } from '#types/runtime-dependency.types.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import { KernelWorker } from '#framework/kernel-worker.js';
import type { KernelBinding, NativeBuildInput, OperationOwner } from '#framework/render-artifact.js';
import { isRenderAbortedError } from '#framework/runtime-worker-client.js';
import { preserveMethodNames } from '#framework/named.js';
import { isWebAssemblyException } from '#kernels/occt/wasm-exception.js';
import { createKernelError } from '#kernels/kernel-helpers.js';
import type { KernelPlugin } from '#plugins/plugin-types.js';
import type { RuntimeContentInput } from '#types/runtime-content.types.js';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';
import { resolveRuntimeDefinition } from '#worker/runtime-definition.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import { RuntimeAlreadyInitializedError } from '#transport/runtime-transport.types.js';

/**
 * Configuration for a kernel plugin within the runtime worker.
 */
type KernelPluginEntry = KernelPlugin<Record<string, unknown>, unknown> &
  RuntimePluginDefinitionCarrier<KernelDefinition>;

type LoadedKernel = {
  entry: KernelPluginEntry;
  definition: KernelDefinition;
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

    return kernel.definition.getDependencies(input, this.forKernel(kernel, runtime), kernel.ctx);
  }

  protected override async onGetParameters(
    input: GetParametersInput,
    runtime: KernelRuntime,
  ): Promise<GetParametersResult> {
    const owner = await this.createRequestOperationOwner(input, 'request', runtime);
    return this.onGetParametersForOwner(owner, input, runtime);
  }

  protected override async onGetParametersForOwner(
    owner: OperationOwner,
    input: GetParametersInput,
    runtime: KernelRuntime,
  ): Promise<GetParametersResult> {
    const selectionError = this.selectionErrors.get(input.entryPath);
    if (selectionError) {
      return createKernelError([this.createKernelBindingIssue(selectionError)]);
    }

    const kernel = this.getKernelForOwner(owner);
    if (!kernel) {
      runtime.logger.warn('getParameters returning empty: kernel-not-selected', {
        data: { entryPath: input.entryPath, loadedKernels: [...this.loadedKernels.keys()] },
      });
      return {
        success: true,
        data: { defaultParameters: {}, jsonSchema: {} },
        issues: [],
      };
    }

    return kernel.definition.getParameters(input, this.forKernel(kernel, runtime), kernel.ctx);
  }

  protected override async onCreateGeometry(
    input: NativeBuildInput,
    runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    const owner = await this.createRequestOperationOwner(input, 'request', runtime);
    return this.onCreateGeometryForOwner(owner, input, runtime);
  }

  protected override async onCreateGeometryForOwner(
    owner: OperationOwner,
    input: NativeBuildInput,
    runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
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
          message: 'No runtime kernel selected for render.',
          code: 'KERNEL_CAPABILITY_MISSING',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }

    try {
      const kernelRuntime = this.forKernel(kernel, runtime);
      const output = await kernel.definition.createGeometry(input, kernelRuntime, kernel.ctx);

      this.captureNativeHandle(output.nativeHandle, owner);

      if (kernel.definition.serializeNativeHandle) {
        const serializedNativeHandle = kernel.definition.serializeNativeHandle(
          { nativeHandle: output.nativeHandle },
          kernelRuntime,
          kernel.ctx,
        );
        if (serializedNativeHandle === undefined || serializedNativeHandle === null) {
          throw new Error('Kernel native-handle snapshot serializer returned null or undefined.');
        }

        return {
          success: true,
          data: output.geometry,
          issues: output.issues ?? [],
          serializedNativeHandle,
        };
      }

      return {
        success: true,
        data: output.geometry,
        issues: output.issues ?? [],
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
    return this.getKernelForOwner(owner)?.definition.meshGeometry !== undefined;
  }

  protected override async onMeshGeometryForOwner(
    owner: OperationOwner,
    input: { nativeHandle: unknown; options: Record<string, unknown>; content?: RuntimeContentInput },
    runtime: KernelRuntime,
  ): Promise<MeshGeometryResult> {
    const kernel = this.getKernelForOwner(owner);
    const meshGeometry = kernel?.definition.meshGeometry;
    if (!kernel || !meshGeometry) {
      return createKernelError([
        {
          message: 'No runtime kernel with a meshGeometry phase selected for display render.',
          code: 'KERNEL_CAPABILITY_MISSING',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }

    try {
      const output = await meshGeometry(input, runtime, kernel.ctx);
      return {
        success: true,
        data: output.geometry,
        issues: output.issues ?? [],
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
    return kernel.definition.exportGeometry(input, this.forKernel(kernel, runtime), kernel.ctx);
  }

  protected override async onExportGeometryForOwner(
    owner: OperationOwner,
    input: ExportGeometryInput,
    runtime: KernelRuntime,
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

    return kernel.definition.exportGeometry(input, this.forKernel(kernel, runtime), kernel.ctx);
  }

  protected override async isNativeHandleValidForOwner(
    owner: OperationOwner,
    nativeHandle: unknown,
    runtime: KernelRuntime,
  ): Promise<boolean | undefined> {
    const kernel = this.getKernelForOwner(owner);
    if (!kernel?.definition.isNativeHandleValid) {
      return undefined;
    }

    return kernel.definition.isNativeHandleValid({ nativeHandle }, this.forKernel(kernel, runtime), kernel.ctx);
  }

  protected override async deserializeNativeHandleForOwner(
    owner: OperationOwner,
    serializedNativeHandle: unknown,
    runtime: KernelRuntime,
  ): Promise<unknown | undefined> {
    const kernel = this.getKernelForOwner(owner);
    if (!kernel?.definition.deserializeNativeHandle) {
      return undefined;
    }

    return kernel.definition.deserializeNativeHandle(
      { serializedNativeHandle },
      this.forKernel(kernel, runtime),
      kernel.ctx,
    );
  }

  protected override disposeNativeHandleForOwner(
    owner: OperationOwner,
    nativeHandle: unknown,
    runtime: KernelRuntime,
  ): void {
    const kernel = this.getKernelForOwner(owner);
    if (kernel) {
      kernel.definition.disposeNativeHandle?.({ nativeHandle }, this.forKernel(kernel, runtime), kernel.ctx);
    }
  }

  protected override async resolveKernelBinding(
    input: { entryPath: string },
    runtime: KernelRuntime,
  ): Promise<RuntimeKernelBinding | undefined> {
    const span = runtime.tracer.startSpan('kernel.select', { file: input.entryPath });
    try {
      const selection = await this.selectKernel(input.entryPath, runtime);
      if (!selection) {
        return undefined;
      }

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
      span.end();
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
        path: input.entryPath.slice(0, lastSlash) || '/',
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
    this.warnOnRuntimeVersionMismatch('kernel', config);
    const definition = await resolveRuntimePluginDefinition<KernelDefinition>('kernel', config);
    importSpan.end();

    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime guard for dynamic import
    if (!definition || typeof definition.getDependencies !== 'function') {
      throw new Error(`Kernel module ${config.id} does not export a valid KernelDefinition`);
    }

    const rawOptions = config.options ?? {};
    const validatedOptions = definition.optionsSchema ? definition.optionsSchema.parse(rawOptions) : rawOptions;
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
    const exportFormats = definition.exportFormats as KernelExportFormats;

    this.kernelExportZodSchemasMap.set(
      config.id,
      Object.fromEntries(
        Object.entries(exportFormats).map(([format, declaration]) => [format, declaration.optionsSchema]),
      ),
    );
    this.kernelExportContentMap.set(
      config.id,
      Object.fromEntries(
        Object.entries(exportFormats).flatMap(([format, declaration]) =>
          declaration.content ? [[format, declaration.content]] : [],
        ),
      ),
    );
    this.kernelRenderContentMap.set(config.id, definition.render?.content ?? []);
    this.kernelInitOptionsMap.set(config.id, validatedOptions);
    this.kernelImplementationAssetsMap.set(config.id, implementationAssets);
    if (definition.render?.optionsSchema) {
      this.kernelRenderZodSchemaMap.set(config.id, definition.render.optionsSchema);
    }
    if (definition.createOptionsSchema) {
      this.kernelCreateOptionsZodSchemaMap.set(config.id, definition.createOptionsSchema);
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

    const dotIndex = entryPath.lastIndexOf('.');
    const extension =
      dotIndex > 0 && dotIndex < entryPath.length - 1 ? entryPath.slice(dotIndex + 1).toLowerCase() : '';
    let catchAllEntry: KernelPluginEntry | undefined;
    const hasBundlerKernels = this.kernelPlugins.some((c) => c.builtinModuleNames && c.builtinModuleNames.length > 0);

    /* oxlint-disable no-await-in-loop -- Sequential kernel selection: try each config in priority order */

    // Pass 1: Extension + regex fast path
    for (const config of this.kernelPlugins) {
      const isCatchAll = config.extensions.includes('*');
      const extensionMatch = config.extensions.includes(extension) || isCatchAll;
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

      try {
        const detectSpan = runtime.tracer.startSpan('kernel.detect-import', {
          kernel: config.id,
        });
        const code = await runtime.filesystem.readFile(entryPath, 'utf8');
        detectSpan.end();
        const importRegex = config.detectImport;
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
