import type * as BrowserRolldown from '@rolldown/browser';
import type { ModuleType, Plugin, RolldownLog } from '@rolldown/browser';

import { createBundlerSourceHost, normalizeAssetImportAttributes } from '@taucad/bundler-core';
import type {
  BundlerFileSystem,
  BundlerSource,
  BundlerSourceHost,
  BundlerSourceResolution,
  BundlerSourceSession,
} from '@taucad/bundler-core';
import type { BuiltinModule, BundleResult as RuntimeBundleResult } from '@taucad/runtime/bundler';
import type { KernelIssue } from '@taucad/runtime/types';
import { uint8ArrayToBase64 } from 'uint8array-extras';

import { executeCodeInNode } from '#node-module-execution.js';

/** Narrow engine surface shared by native and browser Rolldown. @internal */
export type RolldownApi = Pick<typeof BrowserRolldown, 'rolldown'>;

type VmOptions = {
  readonly filesystem: BundlerFileSystem;
  readonly autoExportNames?: readonly string[];
  readonly cacheExecution?: boolean;
};

type ExecuteResult<T> =
  | { readonly success: true; readonly value: T; readonly entryUrl?: string }
  | { readonly success: false; readonly issues: KernelIssue[] };

/** Browser-host capability failure raised before loading Rolldown WASM. @internal */
export class BrowserRolldownCapabilityError extends Error {
  /**
   * Get the stable browser capability error code.
   * @returns Stable capability error code.
   */
  public get code(): 'ROLLDOWN_SHARED_MEMORY_UNAVAILABLE' {
    return 'ROLLDOWN_SHARED_MEMORY_UNAVAILABLE';
  }

  public constructor(message: string) {
    super(message);
    this.name = 'BrowserRolldownCapabilityError';
  }
}

/** Native-host capability failure raised when the optional engine cannot load. @internal */
export class NativeRolldownCapabilityError extends Error {
  /**
   * Get the stable native capability error code.
   * @returns Stable capability error code.
   */
  public get code(): 'ROLLDOWN_NATIVE_UNAVAILABLE' {
    return 'ROLLDOWN_NATIVE_UNAVAILABLE';
  }

  public constructor(cause: unknown) {
    super('Native Rolldown is unavailable. Reinstall @taucad/rolldown without omitting optional dependencies.', {
      cause,
    });
    this.name = 'NativeRolldownCapabilityError';
  }
}

const isNode = (): boolean =>
  // oxlint-disable-next-line n/prefer-global/process, @typescript-eslint/no-unnecessary-condition -- process is absent in browser hosts
  typeof process !== 'undefined' && process.versions?.node !== undefined;

const assertBrowserCapabilities = (): void => {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    throw new BrowserRolldownCapabilityError(
      'Browser Rolldown requires a cross-origin-isolated host with SharedArrayBuffer.',
    );
  }
  try {
    void new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
  } catch (error) {
    throw new BrowserRolldownCapabilityError(
      `Browser Rolldown requires WebAssembly shared memory: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const importRolldown = async (): Promise<RolldownApi> => {
  if (isNode()) {
    const packageName = 'rolldown';
    try {
      return (await import(/* @vite-ignore */ packageName)) as RolldownApi;
    } catch (error) {
      throw new NativeRolldownCapabilityError(error);
    }
  }

  assertBrowserCapabilities();
  return import('@rolldown/browser');
};

let apiPromise: Promise<RolldownApi> | undefined;

/**
 * Load the host-appropriate engine once per realm and permit retry after failure.
 * @internal
 * @returns The selected Rolldown API.
 */
export const loadRolldown = async (): Promise<RolldownApi> => {
  apiPromise ??= importRolldown();
  try {
    return await apiPromise;
  } catch (error) {
    apiPromise = undefined;
    throw error;
  }
};

const moduleType = (id: string): ModuleType => {
  if (id.endsWith('.ts')) {
    return 'ts';
  }
  if (id.endsWith('.tsx')) {
    return 'tsx';
  }
  if (id.endsWith('.jsx')) {
    return 'jsx';
  }
  if (id.endsWith('.json')) {
    return 'json';
  }
  return 'js';
};

const mimeType = (path: string): string => {
  if (path.endsWith('.png')) {
    return 'image/png';
  }
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (path.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  if (path.endsWith('.json')) {
    return 'application/json';
  }
  return 'application/octet-stream';
};

const assetModule = (source: BundlerSource): string => {
  const bytes = source.bytes ?? new TextEncoder().encode(source.text ?? '');
  if (source.intent === 'text') {
    return `export default ${JSON.stringify(new TextDecoder().decode(bytes).replace(/^\uFEFF/u, ''))};`;
  }
  if (source.intent === 'binary') {
    return `export default new Uint8Array([${bytes.join(',')}]);`;
  }
  const base64 = uint8ArrayToBase64(bytes);
  if (source.intent === 'base64') {
    return `export default ${JSON.stringify(base64)};`;
  }
  return `export default ${JSON.stringify(`data:${mimeType(source.id)};base64,${base64}`)};`;
};

const toIssue = (error: unknown, severity: 'error' | 'warning' = 'error'): KernelIssue => {
  const value = error as {
    readonly message?: string;
    readonly id?: string;
    readonly loc?: { file?: string; line?: number; column?: number };
  };
  const fileName = value.loc?.file ?? value.id;
  const normalizedFileName = fileName?.startsWith('\0tau-') ? fileName.slice(fileName.indexOf(':') + 1) : fileName;
  return {
    message: value.message ?? String(error),
    code: 'BUNDLER_FAILED',
    type: 'compilation',
    severity,
    ...(normalizedFileName === undefined
      ? {}
      : {
          location: {
            fileName: normalizedFileName,
            startLineNumber: value.loc?.line ?? 1,
            startColumn: value.loc?.column ?? 1,
          },
        }),
  };
};

const issuesFromError = (error: unknown): KernelIssue[] => {
  if (typeof error === 'object' && error !== null && 'errors' in error) {
    const { errors } = error as { readonly errors?: unknown[] };
    if (errors !== undefined) {
      return errors.map((item) => toIssue(item));
    }
  }
  return [toIssue(error)];
};

const sourceKey = (resolution: BundlerSourceResolution): string => {
  const suffix = resolution.kind === 'project' ? resolution.suffix : '';
  return `${resolution.id}${suffix}`;
};

const importerId = (
  importer: string | undefined,
  resolutions: ReadonlyMap<string, BundlerSourceResolution>,
): string | undefined => {
  if (importer === undefined) {
    return undefined;
  }
  return resolutions.get(importer)?.id ?? importer;
};

const createSourcePlugin = (
  session: BundlerSourceSession,
  detect: boolean,
  resolutions: Map<string, BundlerSourceResolution>,
): Plugin => ({
  name: detect ? 'tau-rolldown-detection' : 'tau-rolldown-source-host',
  async resolveId(specifier, importer) {
    const resolution = await session.resolve({ specifier, importer: importerId(importer, resolutions) });
    if (resolution.kind === 'external') {
      return { id: resolution.specifier, external: true };
    }
    if (resolution.kind === 'unsupported') {
      throw new Error(resolution.message);
    }
    const id = resolution.kind === 'remote' ? resolution.url : sourceKey(resolution);
    resolutions.set(id, resolution);
    return id;
  },
  async load(id) {
    const resolution = resolutions.get(id);
    if (resolution === undefined) {
      return null;
    }
    const source = await session.load(resolution);
    if (source.intent !== 'script' && source.intent !== 'json') {
      return { code: assetModule(source), moduleType: 'js' };
    }
    const code = source.text ?? '';
    const normalized = source.intent === 'script' ? await normalizeAssetImportAttributes(code) : { code };
    return { code: normalized.code, moduleType: moduleType(source.id) };
  },
});

const banner = (modules: ReadonlyMap<string, BuiltinModule>): string =>
  `${[...modules.entries()]
    .filter(([, module]) => module.globalName !== undefined)
    .map(
      ([name, module]) => `const ${module.globalName} = globalThis.__KERNEL_MODULES__?.get(${JSON.stringify(name)});`,
    )
    .join('\n')}\nconst exports = {};\nconst module = { exports };`;

/** Host-independent Rolldown module VM. @internal */
export class RolldownModuleVm {
  readonly #api: RolldownApi;
  readonly #builtins = new Map<string, BuiltinModule>();
  readonly #executeCache = new Map<string, unknown>();
  readonly #host: BundlerSourceHost;
  readonly #cacheExecution: boolean;

  /**
   * Create a VM over one resolved engine API.
   * @param options - Source host and execution-cache options.
   * @param api - Selected Rolldown engine API.
   */
  public constructor(options: VmOptions, api: RolldownApi) {
    this.#api = api;
    this.#host = createBundlerSourceHost({ filesystem: options.filesystem, autoExportNames: options.autoExportNames });
    this.#cacheExecution = options.cacheExecution === true;
  }

  /**
   * Register a runtime built-in.
   * @param name - Bare package name.
   * @param module - Built-in module source and metadata.
   */
  public registerModule(name: string, module: BuiltinModule): void {
    this.#builtins.set(name, module);
    this.#host.registerBuiltin({ name, module });
  }

  /**
   * Clear one cached execution result or all results.
   * @param code - Optional generated source cache key.
   */
  public clearExecutionCache(code?: string): void {
    if (code === undefined) {
      this.#executeCache.clear();
    } else {
      this.#executeCache.delete(code);
    }
  }

  /** Release VM-owned source and execution state. */
  public dispose(): void {
    this.#executeCache.clear();
    this.#host.dispose();
  }

  /**
   * Detect the transitive project and built-in graph.
   * @param entryPath - Rooted entry path.
   * @param signal - Operation cancellation signal.
   * @returns Detected built-ins and project dependencies.
   */
  public async detectImports(
    entryPath: string,
    signal = new AbortController().signal,
  ): Promise<{ readonly detectedModules: string[]; readonly dependencies: string[] }> {
    const session = this.#host.beginSession({ mode: 'detect', signal, entryPath });
    const resolutions = new Map<string, BundlerSourceResolution>();
    let build: Awaited<ReturnType<RolldownApi['rolldown']>> | undefined;
    try {
      build = await this.#api.rolldown({
        cwd: '/',
        input: entryPath,
        plugins: [createSourcePlugin(session, true, resolutions)],
      });
      await build.generate({ format: 'esm', codeSplitting: false });
      const observation = session.complete();
      return { detectedModules: observation.detectedModules, dependencies: observation.dependencies };
    } finally {
      await build?.close();
    }
  }

  /**
   * Bundle one rooted project entry.
   * @param entryPath - Rooted entry path.
   * @param signal - Operation cancellation signal.
   * @returns Bundle output or structured issues.
   */
  public async bundle(entryPath: string, signal = new AbortController().signal): Promise<RuntimeBundleResult> {
    const session = this.#host.beginSession({ mode: 'bundle', signal, entryPath });
    const resolutions = new Map<string, BundlerSourceResolution>();
    const issues: KernelIssue[] = [];
    let build: Awaited<ReturnType<RolldownApi['rolldown']>> | undefined;
    try {
      build = await this.#api.rolldown({
        cwd: '/',
        input: entryPath,
        plugins: [createSourcePlugin(session, false, resolutions)],
        onLog(level: string, log: RolldownLog) {
          if (level === 'warn') {
            issues.push(toIssue(log, 'warning'));
          }
        },
      });
      const output = await build.generate({
        format: 'esm',
        codeSplitting: false,
        sourcemap: 'hidden',
        banner: banner(this.#builtins),
      });
      const chunk = output.output.find((item) => item.type === 'chunk');
      if (chunk === undefined) {
        throw new Error('No JavaScript output generated.');
      }
      const observation = session.complete();
      return {
        code: chunk.code,
        sourceMap: chunk.map?.toString(),
        issues,
        success: true,
        dependencies: observation.dependencies,
        unresolvedPaths: observation.unresolvedPaths,
      };
    } catch (error) {
      const observation = session.complete();
      return {
        code: '',
        issues: [...issues, ...issuesFromError(error)],
        success: false,
        dependencies: observation.dependencies,
        unresolvedPaths: observation.unresolvedPaths,
      };
    } finally {
      await build?.close();
    }
  }

  /**
   * Execute generated ESM in the current host.
   * @param code - Generated ESM source.
   * @param signal - Operation cancellation signal.
   * @returns Imported module or structured runtime issues.
   */
  public async execute<T = unknown>(code: string, signal = new AbortController().signal): Promise<ExecuteResult<T>> {
    const cached = this.#cacheExecution ? this.#executeCache.get(code) : undefined;
    if (cached !== undefined) {
      return { success: true, value: cached as T };
    }
    signal.throwIfAborted();
    try {
      const result = isNode()
        ? await executeCodeInNode<T>(code, signal)
        : await this.#executeInBrowser<T>(code, signal);
      if (this.#cacheExecution) {
        this.#executeCache.set(code, result.value);
      }
      return { success: true, ...result };
    } catch (error) {
      return {
        success: false,
        issues: [
          {
            message: error instanceof Error ? error.message : String(error),
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
          },
        ],
      };
    }
  }

  async #executeInBrowser<T>(
    code: string,
    signal: AbortSignal,
  ): Promise<{ readonly value: T; readonly entryUrl: string }> {
    const entryUrl = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    try {
      const value = (await import(/* @vite-ignore */ entryUrl)) as T;
      signal.throwIfAborted();
      return { value, entryUrl };
    } finally {
      URL.revokeObjectURL(entryUrl);
    }
  }
}

/**
 * Create a Rolldown module VM using the host-appropriate engine.
 * @internal
 * @param options - Source host and execution-cache options.
 * @returns A ready module VM.
 */
export const createRolldownModuleVm = async (options: VmOptions): Promise<RolldownModuleVm> =>
  new RolldownModuleVm(options, await loadRolldown());
