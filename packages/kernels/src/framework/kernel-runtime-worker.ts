/**
 * Kernel Runtime Worker
 *
 * A generic worker that dynamically loads kernel modules defined via defineKernel().
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

// eslint-disable-next-line import-x/no-unassigned-import -- side-effect: stubs `document` before any bundler modulepreload code runs
import '#framework/worker-preload-polyfill.js';
import type {
  CreateGeometryResult,
  ExportGeometryResult,
  GetParametersResult,
  KernelIssue,
} from '#types/kernel.types.js';
import type {
  CanHandleInput,
  CreateGeometryInput,
  ExportGeometryInput,
  GetDependenciesInput,
  GetParametersInput,
  KernelDefinition,
  KernelRuntime,
} from '#types/kernel-worker.types.js';
import type { KernelSpanTracer } from '#types/kernel-tracer.types.js';
import { KernelWorker } from '#framework/kernel-worker.js';
import { isWorkerContext, getWorkerMessagePort } from '#framework/kernel-message-adapter.js';
import { createWorkerDispatcher } from '#framework/kernel-worker-dispatcher.js';

/**
 * Configuration for a kernel module within the runtime worker.
 * Mirrors KernelRegistration but without the worker URL (since we ARE the worker).
 */
type KernelModuleEntry = {
  id: string;
  moduleUrl: string;
  extensions?: string[];
  detectImport?: string;
  builtinModuleNames?: string[];
  options?: Record<string, unknown>;
  /** Pre-loaded definition (bypasses dynamic import, used in tests) */
  definition?: KernelDefinition;
};

type LoadedKernel = {
  entry: KernelModuleEntry;
  definition: KernelDefinition;
  ctx: unknown;
  initialized: boolean;
};

type RuntimeWorkerOptions = {
  kernelModules: KernelModuleEntry[];
};

/**
 * Generic kernel runtime worker.
 * Loads kernel modules dynamically and delegates to the active kernel.
 */
/** How a kernel was selected — determines whether to re-check via kernel.canHandle. */
type SelectionMethod = 'regex' | 'bundler' | 'extension' | 'catchall';

type KernelSelection = {
  kernel: LoadedKernel;
  method: SelectionMethod;
};

/** Multi-kernel runtime worker that dynamically selects and delegates to loaded kernel definitions. */
class KernelRuntimeWorker extends KernelWorker<RuntimeWorkerOptions> {
  protected override readonly name = 'KernelRuntimeWorker';

  private readonly loadedKernels = new Map<string, LoadedKernel>();
  private activeKernelId: string | undefined;
  private readonly selectionCache = new Map<string, { id: string; method: SelectionMethod }>();
  private kernelModules: KernelModuleEntry[] = [];
  private cachedDetectionDeps?: string[];

  // =====================================================================
  // Protected overrides (must precede private methods per linter rules)
  // =====================================================================

  protected override async onInitialize(
    { options }: { options: RuntimeWorkerOptions },
    _runtime: KernelRuntime,
  ): Promise<void> {
    this.kernelModules = options.kernelModules;
  }

  protected override async onCanHandle(input: CanHandleInput, runtime: KernelRuntime): Promise<boolean> {
    const selection = await this.selectKernel(input.filePath, runtime);
    if (!selection) {
      return false;
    }

    this.activeKernelId = selection.kernel.entry.id;

    // When selected via bundler detection (transitive import analysis),
    // the framework's detection is authoritative — skip kernel-level canHandle
    // which only checks the entry file and would reject transitive imports.
    if (selection.method === 'bundler') {
      return true;
    }

    if (selection.kernel.definition.canHandle) {
      return selection.kernel.definition.canHandle(input, runtime, selection.kernel.ctx);
    }

    return true;
  }

  protected override async onGetDependencies(input: GetDependenciesInput, runtime: KernelRuntime): Promise<string[]> {
    if (this.cachedDetectionDeps) {
      const deps = this.cachedDetectionDeps;
      this.cachedDetectionDeps = undefined;
      return deps;
    }

    const kernel = await this.ensureActiveKernel(input.filePath, runtime);
    if (!kernel) {
      return [input.filePath];
    }

    return kernel.definition.getDependencies(input, runtime, kernel.ctx);
  }

  protected override async onGetParameters(
    input: GetParametersInput,
    runtime: KernelRuntime,
  ): Promise<GetParametersResult> {
    const kernel = await this.ensureActiveKernel(input.filePath, runtime);
    if (!kernel) {
      return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
    }

    return kernel.definition.getParameters(input, runtime, kernel.ctx);
  }

  protected override async onCreateGeometry(
    input: CreateGeometryInput,
    runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    const kernel = await this.ensureActiveKernel(input.filePath, runtime);
    if (!kernel) {
      return { success: true, data: [], issues: [] };
    }

    try {
      const output = await kernel.definition.createGeometry(input, runtime, kernel.ctx);

      this.nativeHandle = output.nativeHandle;
      return {
        success: true,
        data: output.geometry,
        issues: output.issues ?? [],
      };
    } catch (error) {
      if (error instanceof Error && 'issues' in error && Array.isArray(error.issues)) {
        return { success: false, issues: error.issues as KernelIssue[] };
      }

      return {
        success: false,
        issues: [
          { message: error instanceof Error ? error.message : String(error), type: 'kernel', severity: 'error' },
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
        issues: [{ message: 'No geometry available for export', type: 'runtime', severity: 'error' }],
      };
    }

    const kernel = this.getActiveKernel();
    return kernel.definition.exportGeometry(input, runtime, kernel.ctx);
  }

  protected override getAssetUrls(): string[] {
    return [];
  }

  protected override onFileChanged(_changedPaths: string[]): void {
    this.selectionCache.clear();
    this.cachedDetectionDeps = undefined;
    this.activeKernelId = undefined;
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
    span.end();
    return selection.kernel;
  }

  private async loadKernelModule(config: KernelModuleEntry, tracer: KernelSpanTracer): Promise<LoadedKernel> {
    const existing = this.loadedKernels.get(config.id);
    if (existing) {
      return existing;
    }

    let definition: KernelDefinition;
    if (config.definition) {
      definition = config.definition;
    } else {
      const importSpan = tracer.startSpan('kernel.load-module', { id: config.id });
      this.logger.debug(`Loading kernel module: ${config.id} from ${config.moduleUrl}`);
      const module = (await import(/* @vite-ignore */ config.moduleUrl)) as { default: KernelDefinition };
      definition = module.default;
      importSpan.end();
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime guard for dynamic import
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
    return loaded;
  }

  private async ensureKernelInitialized(kernel: LoadedKernel, runtime: KernelRuntime): Promise<void> {
    if (kernel.initialized) {
      return;
    }

    this.logger.debug(`Initializing kernel: ${kernel.entry.id}`);

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
   * Returns the selected kernel and the method used for selection.
   * The selection method is used by canHandle to decide whether to
   * re-check via the kernel's own canHandle (skipped for bundler detection
   * since it already traced transitive imports).
   *
   * @param filePath - Full path to the file (used as cache key for collision safety)
   */
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
    let catchAllEntry: KernelModuleEntry | undefined;
    const hasBundlerKernels = this.kernelModules.some((c) => c.builtinModuleNames && c.builtinModuleNames.length > 0);

    /* eslint-disable no-await-in-loop -- Sequential kernel selection: try each config in priority order */

    // Pass 1: Extension + regex fast path
    for (const config of this.kernelModules) {
      if (!config.extensions) {
        continue;
      }

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
        this.selectionCache.set(filePath, { id: config.id, method: 'extension' });
        return { kernel, method: 'extension' };
      }

      try {
        const detectSpan = runtime.tracer.startSpan('kernel.detect-import', { kernel: config.id });
        const code = await runtime.filesystem.readFile(filePath, 'utf8');
        detectSpan.end();
        const importRegex = new RegExp(config.detectImport, 's');
        if (importRegex.test(code)) {
          const kernel = await this.loadKernelModule(config, runtime.tracer);
          await this.ensureKernelInitialized(kernel, runtime);
          this.selectionCache.set(filePath, { id: config.id, method: 'regex' });
          return { kernel, method: 'regex' };
        }
      } catch {
        continue;
      }
    }

    // Pass 2: Bundler-assisted detection via detectImports
    const fileExt = filePath.includes('.') ? filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase() : '';
    if (this.hasBundlerForExtension(fileExt)) {
      const configsWithBuiltins = this.kernelModules.filter(
        (c) => c.builtinModuleNames && c.builtinModuleNames.length > 0,
      );

      if (configsWithBuiltins.length > 0) {
        const bundler = await this.ensureBundlerForExtension(fileExt);
        const detectSpan = runtime.tracer.startSpan('kernel.detect-bundle', { file: filePath });
        const { detectedModules, dependencies } = await bundler.definition.detectImports(
          { entryPath: filePath },
          bundler.ctx,
        );
        detectSpan.end();

        this.cachedDetectionDeps = dependencies;

        const matchingConfigs = configsWithBuiltins.filter((config) =>
          config.builtinModuleNames!.some((name) =>
            detectedModules.some((detected) => detected === name || detected.startsWith(name + '/')),
          ),
        );

        if (matchingConfigs.length > 0) {
          const primaryConfig = matchingConfigs[0]!;
          const primaryKernel = await this.loadKernelModule(primaryConfig, runtime.tracer);
          await this.ensureKernelInitialized(primaryKernel, runtime);

          for (const config of matchingConfigs.slice(1)) {
            const kernel = await this.loadKernelModule(config, runtime.tracer);
            await this.ensureKernelInitialized(kernel, runtime);
          }

          this.selectionCache.set(filePath, { id: primaryConfig.id, method: 'bundler' });
          return { kernel: primaryKernel, method: 'bundler' };
        }
      }
    }

    /* eslint-enable no-await-in-loop -- End sequential kernel selection */

    // Pass 3: Catch-all fallback — guarded by canHandle when defined
    if (catchAllEntry) {
      return this.tryCatchAllKernel(catchAllEntry, { filePath, extension, runtime });
    }

    return undefined;
  }

  /** Attempt catch-all kernel selection, rejecting if the kernel's canHandle returns false. */
  private async tryCatchAllKernel(
    entry: KernelModuleEntry,
    { filePath, extension, runtime }: { filePath: string; extension: string; runtime: KernelRuntime },
  ): Promise<KernelSelection | undefined> {
    const kernel = await this.loadKernelModule(entry, runtime.tracer);
    await this.ensureKernelInitialized(kernel, runtime);

    if (kernel.definition.canHandle) {
      const canHandleInput: CanHandleInput = {
        filePath,
        basePath: filePath.slice(0, filePath.lastIndexOf('/')),
        extension,
      };
      const accepted = await kernel.definition.canHandle(canHandleInput, runtime, kernel.ctx);
      if (!accepted) {
        return undefined;
      }
    }

    this.selectionCache.set(filePath, { id: entry.id, method: 'catchall' });
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
}

if (isWorkerContext()) {
  const worker = new KernelRuntimeWorker();
  createWorkerDispatcher(worker, getWorkerMessagePort());
}

export { KernelRuntimeWorker };
