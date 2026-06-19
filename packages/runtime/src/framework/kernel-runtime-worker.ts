/**
 * Kernel Runtime Worker
 *
 * A generic worker that hosts kernel plugins defined by a worker-owned runtime definition.
 * Replaces the pattern of one Worker per kernel with a single Worker per compilation
 * unit that loads only the WASM runtime it needs.
 *
 * Kernel selection:
 * 1. Extension-based fast path: .scad -> OpenSCAD, .kcl -> KCL
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
  GetParametersResult,
  KernelIssue,
} from '#types/runtime.types.js';
import type {
  CreateGeometryInput,
  ExportGeometryInput,
  GetDependenciesInput,
  GetDependenciesResult,
  GetParametersInput,
  KernelDefinition,
  KernelRuntime,
} from '#types/runtime-kernel.types.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import { KernelWorker } from '#framework/kernel-worker.js';
import type { LastSettledRenderIdentity } from '#framework/kernel-worker.js';
import { isRenderAbortedError } from '#framework/runtime-worker-client.js';
import { preserveMethodNames } from '#framework/named.js';
import { isWebAssemblyException } from '#kernels/occt/wasm-exception.js';
import { createKernelError } from '#kernels/kernel-helpers.js';
import type { KernelPlugin } from '#plugins/plugin-types.js';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';
import { resolveRuntimeDefinition } from '#worker/runtime-definition.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';

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
};

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
    const resolvedRuntime = await resolveRuntimeDefinition(this.runtime, input.config);
    this.kernelPlugins = resolvedRuntime.kernels;
    this.loadedKernels.clear();
    this.activeKernelId = undefined;
    this.selectionCache.clear();
    this.selectionErrors.clear();
    this.configureRuntimePlugins({
      middleware: resolvedRuntime.middleware,
      bundlers: resolvedRuntime.bundlers,
      transcoders: resolvedRuntime.transcoders,
    });
    await super.initialize(input);
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
    if (this.cachedDetectionDeps) {
      const deps = this.cachedDetectionDeps;
      this.cachedDetectionDeps = undefined;
      return deps;
    }

    let kernel: LoadedKernel | undefined;
    try {
      kernel = await this.ensureActiveKernel(input.filePath, runtime);
    } catch (error) {
      this.selectionErrors.set(input.filePath, error);
      return { resolved: [input.filePath], unresolved: [] };
    }

    if (!kernel) {
      return { resolved: [input.filePath], unresolved: [] };
    }

    return kernel.definition.getDependencies(input, runtime, kernel.ctx);
  }

  protected override async onGetParameters(
    input: GetParametersInput,
    runtime: KernelRuntime,
  ): Promise<GetParametersResult> {
    let kernel: LoadedKernel | undefined;
    try {
      kernel = await this.ensureActiveKernel(input.filePath, runtime);
    } catch (error) {
      return createKernelError([this.createKernelBindingIssue(error)]);
    }

    if (!kernel) {
      runtime.logger.warn('getParameters returning empty: kernel-not-selected', {
        data: { filePath: input.filePath, loadedKernels: [...this.loadedKernels.keys()] },
      });
      return {
        success: true,
        data: { defaultParameters: {}, jsonSchema: {} },
        issues: [],
      };
    }

    return kernel.definition.getParameters(input, runtime, kernel.ctx);
  }

  protected override async onCreateGeometry(
    input: CreateGeometryInput,
    runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    const selectionError = this.selectionErrors.get(input.filePath);
    if (selectionError) {
      this.selectionErrors.delete(input.filePath);
      return createKernelError([this.createKernelBindingIssue(selectionError)]);
    }

    let kernel: LoadedKernel | undefined;
    try {
      kernel = await this.ensureActiveKernel(input.filePath, runtime);
    } catch (error) {
      return createKernelError([this.createKernelBindingIssue(error)]);
    }

    if (!kernel) {
      runtime.logger.warn('createGeometry returning empty: kernel-not-selected', {
        data: { filePath: input.filePath, loadedKernels: [...this.loadedKernels.keys()] },
      });
      return { success: true, data: [], issues: [] };
    }

    const zodSchema = this.kernelRenderZodSchemaMap.get(kernel.entry.id);
    const resolvedInput =
      zodSchema && Object.keys(input.options).length === 0
        ? { ...input, options: this.revalidateRenderOptions(input.options, zodSchema) }
        : input;

    try {
      const output = await kernel.definition.createGeometry(resolvedInput, runtime, kernel.ctx);

      this.nativeHandle = output.nativeHandle;

      if (kernel.definition.serializeNativeHandle) {
        const serializedNativeHandle = kernel.definition.serializeNativeHandle(
          { nativeHandle: output.nativeHandle },
          runtime,
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
    return kernel.definition.exportGeometry(input, runtime, kernel.ctx);
  }

  protected override async ensureNativeHandle(
    runtime: KernelRuntime,
    renderIdentity?: LastSettledRenderIdentity,
  ): Promise<void> {
    if (this.nativeHandle !== undefined && this.nativeHandle !== null) {
      if (!this.activeKernelId) {
        return;
      }

      const kernel = this.getActiveKernel();
      if (!kernel.definition.isNativeHandleValid) {
        return;
      }

      try {
        const isValid = await kernel.definition.isNativeHandleValid(
          { nativeHandle: this.nativeHandle },
          runtime,
          kernel.ctx,
        );
        if (isValid) {
          return;
        }

        this.nativeHandle = undefined;
        this.logger.debug('Native handle is stale; export will reheat');
      } catch (error) {
        this.nativeHandle = undefined;
        this.logger.warn('Native-handle validity check failed; export will reheat', {
          data: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    if (this.nativeHandle !== undefined && this.nativeHandle !== null) {
      return;
    }

    const serialized = this.lastSerializedNativeHandle;
    if (serialized !== undefined && serialized !== null && this.activeKernelId) {
      const kernel = this.getActiveKernel();
      if (kernel.definition.deserializeNativeHandle) {
        try {
          this.logger.debug('Restoring nativeHandle via kernel deserializeNativeHandle');
          this.nativeHandle = kernel.definition.deserializeNativeHandle(
            { serializedNativeHandle: serialized },
            runtime,
            kernel.ctx,
          );
          return;
        } catch (error) {
          this.lastSerializedNativeHandle = undefined;
          this.logger.warn('Native-handle snapshot restore failed; export will reheat', {
            data: { error: error instanceof Error ? error.message : String(error) },
          });
        }
      }
    }

    return super.ensureNativeHandle(runtime, renderIdentity);
  }

  protected override getActiveKernelId(): string | undefined {
    return this.activeKernelId;
  }

  protected override getActiveKernelVersion(): string | undefined {
    return this.activeKernelId ? this.getActiveKernel().definition.version : undefined;
  }

  protected override getAssetUrls(): string[] {
    return [];
  }

  protected override onFileChanged(_changedPaths: readonly string[]): void {
    this.selectionCache.clear();
    this.selectionErrors.clear();
    this.cachedDetectionDeps = undefined;
    this.activeKernelId = undefined;
    this.onActiveKernelChanged?.(undefined);
  }

  // =====================================================================
  // Private methods
  // =====================================================================

  private async ensureActiveKernel(filePath: string, runtime: KernelRuntime): Promise<LoadedKernel | undefined> {
    if (this.activeKernelId) {
      return this.getActiveKernel();
    }

    const span = runtime.tracer.startSpan('kernel.select', { file: filePath });
    const selection = await this.selectKernel(filePath, runtime);
    if (!selection) {
      span.end();
      return undefined;
    }

    this.activeKernelId = selection.kernel.entry.id;
    this.onActiveKernelChanged?.(this.activeKernelId);
    span.end();
    return selection.kernel;
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
    const definition = await resolveRuntimePluginDefinition('kernel', config);
    importSpan.end();

    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime guard for dynamic import
    if (!definition || typeof definition.getDependencies !== 'function') {
      throw new Error(`Kernel module ${config.id} does not export a valid KernelDefinition`);
    }

    const loaded: LoadedKernel = {
      entry: config,
      definition,
      ctx: undefined,
      initialized: false,
    };

    this.loadedKernels.set(config.id, loaded);

    if (definition.exportSchemas) {
      this.kernelExportZodSchemasMap.set(config.id, definition.exportSchemas);
    }

    if (definition.renderSchema) {
      this.kernelRenderZodSchemaMap.set(config.id, definition.renderSchema);
    }

    this.rebuildAndPushCapabilities();

    return loaded;
  }

  private async ensureKernelInitialized(kernel: LoadedKernel, runtime: KernelRuntime): Promise<void> {
    if (kernel.initialized) {
      return;
    }

    this.logger.trace(`Initializing kernel: ${kernel.entry.id}`);

    const rawOptions = kernel.entry.options ?? {};
    const validatedOptions = kernel.definition.optionsSchema
      ? kernel.definition.optionsSchema.parse(rawOptions)
      : rawOptions;

    kernel.ctx = await kernel.definition.initialize(validatedOptions, runtime);
    kernel.initialized = true;
  }

  /**
   * Select the appropriate kernel for a file using three-pass detection:
   * 1. Extension + regex fast path (entry file only)
   * 2. Bundler-assisted detection via detectImports (transitive, no stubs)
   * 3. Catch-all fallback (extensions: ['*'])
   *
   * @param filePath - Full path to the file (used as cache key for collision safety)
   * @param runtime - the kernel runtime context for initialization
   * @returns the selected kernel and selection method, or undefined if no kernel matches
   */
  // oxlint-disable-next-line complexity -- Multi-pass kernel selection requires sequential checks
  private async selectKernel(filePath: string, runtime: KernelRuntime): Promise<KernelSelection | undefined> {
    const cached = this.selectionCache.get(filePath);
    if (cached) {
      const kernel = this.loadedKernels.get(cached.id);
      if (kernel) {
        return { kernel, method: cached.method };
      }
    }

    const dotIndex = filePath.lastIndexOf('.');
    const extension = dotIndex > 0 && dotIndex < filePath.length - 1 ? filePath.slice(dotIndex + 1).toLowerCase() : '';
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
        this.selectionCache.set(filePath, {
          id: config.id,
          method: 'extension',
        });
        return { kernel, method: 'extension' };
      }

      try {
        const detectSpan = runtime.tracer.startSpan('kernel.detect-import', {
          kernel: config.id,
        });
        const code = await runtime.filesystem.readFile(filePath, 'utf8');
        detectSpan.end();
        const importRegex = config.detectImport;
        if (!importRegex.test(code)) {
          continue;
        }
      } catch (error) {
        runtime.logger.warn('selectKernel pass 1 (extension/regex) failed', {
          data: { kernel: config.id, file: filePath, error: String(error) },
        });
        continue;
      }

      const kernel = await this.loadKernelModule(config, runtime.tracer);
      await this.ensureKernelInitialized(kernel, runtime);
      this.selectionCache.set(filePath, { id: config.id, method: 'regex' });
      return { kernel, method: 'regex' };
    }

    // Pass 2: Bundler-assisted detection via detectImports
    const fileExtension = filePath.includes('.') ? filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase() : '';
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
            file: filePath,
          });
          const { detectedModules, dependencies } = await bundler.definition.detectImports(
            { entryPath: filePath },
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
              file: filePath,
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

          this.selectionCache.set(filePath, {
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
      return this.tryCatchAllKernel(catchAllEntry, { filePath, runtime });
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
    { filePath, runtime }: { filePath: string; runtime: KernelRuntime },
  ): Promise<KernelSelection> {
    const kernel = await this.loadKernelModule(entry, runtime.tracer);
    await this.ensureKernelInitialized(kernel, runtime);

    this.selectionCache.set(filePath, { id: entry.id, method: 'catchall' });
    return { kernel, method: 'catchall' };
  }

  private revalidateRenderOptions(
    raw: Record<string, unknown>,
    zodSchema: { safeParse(data: unknown): { success: boolean; data?: unknown } },
  ): Record<string, unknown> {
    const parseResult = zodSchema.safeParse(raw);
    return parseResult.success ? (parseResult.data as Record<string, unknown>) : raw;
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
