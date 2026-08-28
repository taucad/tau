/** Host-selecting esbuild adapter backed by `@taucad/bundler-core`. */

import type { BuildOptions, Loader, Message, OnLoadArgs, OnLoadResult, Plugin } from 'esbuild-wasm';
import * as wasmEsbuild from 'esbuild-wasm';

import { createBundlerSourceHost } from '@taucad/bundler-core';
import type {
  BundlerSourceHost,
  BundlerSourceIntent,
  BundlerSourceResolution,
  BundlerSourceSession,
} from '@taucad/bundler-core';
import type { BuiltinModule } from '@taucad/runtime/bundler';

import { importBrowserModule } from '#vm/browser-module-import.js';
import { esbuildNamespace } from '#vm/esbuild.constants.js';
import { isNode } from '#vm/environment.js';
import { executeCodeInNode } from '#vm/node-module-execution.js';
import type { VmExecuteResult, VmFileSystem, VmIssue } from '#vm/types.js';

/** Outcome of bundling a CAD script entry point. @public */
export type BundleResult = {
  code: string;
  sourceMap?: string;
  issues: VmIssue[];
  success: boolean;
  dependencies: string[];
  unresolvedPaths: string[];
};

/** Configuration for the esbuild adapter. @public */
export type BundlerOptions = {
  filesystem: VmFileSystem;
  builtinModules: Map<string, BuiltinModule>;
  sourceMaps?: boolean;
  autoExportNames?: string[];
};

const esbuildWasmUrl = new URL('wasm/esbuild.wasm', import.meta.url).href;
let esbuildInitialized = false;
let initializationPromise: Promise<void> | undefined;
let activeEsbuild: typeof wasmEsbuild = wasmEsbuild;

/**
 * Return the initialized host-appropriate esbuild API.
 * @returns The active native or WASM esbuild API.
 * @public
 */
export const getEsbuild = (): typeof wasmEsbuild => activeEsbuild;

/**
 * Initialize native esbuild on Node or esbuild-wasm elsewhere.
 * @returns Completion after the selected engine is ready.
 * @public
 */
export const initializeEsbuild = async (): Promise<void> => {
  if (esbuildInitialized) {
    return;
  }
  initializationPromise ??= (async () => {
    try {
      if (isNode()) {
        const packageName = 'esbuild';
        activeEsbuild = (await import(/* @vite-ignore */ packageName)) as typeof wasmEsbuild;
      }
      await activeEsbuild.initialize(isNode() ? {} : { wasmURL: esbuildWasmUrl });
      esbuildInitialized = true;
    } catch (error) {
      initializationPromise = undefined;
      throw error;
    }
  })();
  return initializationPromise;
};

const loaders: Record<BundlerSourceIntent, Loader> = {
  script: 'js',
  json: 'json',
  text: 'text',
  binary: 'binary',
  base64: 'base64',
  dataurl: 'dataurl',
  file: 'dataurl',
};

const scriptLoader = (path: string): Loader => {
  const clean = path.split(/[?#]/u, 1)[0] ?? path;
  if (clean.endsWith('.ts')) {
    return 'ts';
  }
  if (clean.endsWith('.tsx')) {
    return 'tsx';
  }
  if (clean.endsWith('.jsx')) {
    return 'jsx';
  }
  if (clean.endsWith('.json')) {
    return 'json';
  }
  return 'js';
};

const toEsbuildPath = (resolution: BundlerSourceResolution): string => {
  if (resolution.kind === 'project' || resolution.kind === 'package') {
    return resolution.id;
  }
  return resolution.id;
};

const toNamespace = (resolution: BundlerSourceResolution): string => {
  if (resolution.kind === 'builtin') {
    return esbuildNamespace.builtin;
  }
  if (resolution.kind === 'remote') {
    return esbuildNamespace.httpUrl;
  }
  return esbuildNamespace.vfs;
};

const importerId = (args: { readonly importer: string; readonly namespace: string }): string | undefined => {
  if (args.importer.length === 0) {
    return undefined;
  }
  if (args.namespace === esbuildNamespace.httpUrl) {
    return args.importer;
  }
  return args.importer;
};

const issueFromMessage = (message: Message, severity: 'error' | 'warning'): VmIssue => ({
  message: message.text,
  code: 'BUNDLER_FAILED',
  type: 'compilation',
  severity,
  location:
    message.location === null
      ? undefined
      : {
          fileName: message.location.file.replace(/^vfs:\/?/u, ''),
          startLineNumber: message.location.line,
          startColumn: message.location.column,
        },
});

const issuesFromError = (error: unknown): VmIssue[] => {
  if (typeof error === 'object' && error !== null && 'errors' in error) {
    const build = error as { readonly errors?: Message[]; readonly warnings?: Message[] };
    return [
      ...(build.errors ?? []).map((message) => issueFromMessage(message, 'error')),
      ...(build.warnings ?? []).map((message) => issueFromMessage(message, 'warning')),
    ];
  }
  return [
    {
      message: error instanceof Error ? error.message : String(error),
      code: 'BUNDLER_FAILED',
      type: 'compilation',
      severity: 'error',
    },
  ];
};

const loadFromSession = async (
  session: BundlerSourceSession,
  args: OnLoadArgs,
  detect: boolean,
): Promise<OnLoadResult> => {
  const resolution = args.pluginData as BundlerSourceResolution | undefined;
  if (resolution === undefined) {
    return { errors: [{ text: `Missing source resolution for '${args.path}'.` }] };
  }
  if (detect && 'intent' in resolution && resolution.intent !== 'script' && resolution.intent !== 'json') {
    return { contents: '', loader: 'js' };
  }
  try {
    const source = await session.load(resolution);
    const loader = source.intent === 'script' ? scriptLoader(source.id) : loaders[source.intent];
    return {
      contents: source.bytes ?? source.text ?? '',
      loader,
      resolveDir: source.resolveDirectory,
    };
  } catch (error) {
    return {
      errors: [{ text: `Failed to load '${args.path}': ${error instanceof Error ? error.message : String(error)}` }],
    };
  }
};

const createSourcePlugin = (session: BundlerSourceSession, detect: boolean): Plugin => ({
  name: detect ? `${esbuildNamespace.vfs}-detection` : esbuildNamespace.vfs,
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      try {
        const resolution = await session.resolve({
          specifier: args.path,
          importer: importerId(args),
          attributes: args.with,
        });
        if (resolution.kind === 'external') {
          return { path: resolution.specifier, external: true };
        }
        if (resolution.kind === 'unsupported') {
          return { errors: [{ text: resolution.message }] };
        }
        return {
          path: toEsbuildPath(resolution),
          namespace: toNamespace(resolution),
          pluginData: resolution,
          ...(resolution.kind === 'project' && resolution.suffix.length > 0 ? { suffix: resolution.suffix } : {}),
        };
      } catch (error) {
        return {
          errors: [
            { text: `Failed to resolve '${args.path}': ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    });

    for (const namespace of Object.values(esbuildNamespace)) {
      build.onLoad({ filter: /.*/, namespace }, async (args) => loadFromSession(session, args, detect));
    }
  },
});

const commonJsBanner = (modules: ReadonlyMap<string, BuiltinModule>): string => {
  const globals = [...modules.entries()]
    .filter(([, module]) => module.globalName !== undefined)
    .map(
      ([name, module]) => `const ${module.globalName} = globalThis.__KERNEL_MODULES__?.get(${JSON.stringify(name)});`,
    )
    .join('\n');
  return `${globals}\nconst exports = {};\nconst module = { exports };\n`;
};

/** Esbuild graph adapter using one compiler-neutral source host. @public */
export class EsbuildBundler {
  readonly #builtins: Map<string, BuiltinModule>;
  readonly #host: BundlerSourceHost;
  readonly #sourceMaps: boolean;

  public constructor(options: BundlerOptions) {
    this.#builtins = options.builtinModules;
    this.#sourceMaps = options.sourceMaps ?? true;
    this.#host = createBundlerSourceHost({
      filesystem: options.filesystem,
      autoExportNames: options.autoExportNames,
    });
  }

  public async initialize(): Promise<void> {
    await initializeEsbuild();
  }

  public registerModule(name: string, module: BuiltinModule): void {
    this.#builtins.set(name, module);
    this.#host.registerBuiltin({ name, module });
  }

  public async detectImports(
    entryPath: string,
    signal = new AbortController().signal,
  ): Promise<{ detectedModules: string[]; dependencies: string[] }> {
    const session = this.#host.beginSession({ mode: 'detect', signal, entryPath });
    await getEsbuild().build({
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      target: 'es2022',
      platform: 'browser',
      plugins: [createSourcePlugin(session, true)],
      logLevel: 'silent',
    });
    const observation = session.complete();
    return { detectedModules: observation.detectedModules, dependencies: observation.dependencies };
  }

  public async bundle(entryPath: string, signal = new AbortController().signal): Promise<BundleResult> {
    const session = this.#host.beginSession({ mode: 'bundle', signal, entryPath });
    try {
      const options: BuildOptions = {
        entryPoints: [entryPath],
        bundle: true,
        write: false,
        format: 'esm',
        target: 'es2022',
        platform: 'browser',
        sourcemap: this.#sourceMaps ? 'external' : false,
        outdir: 'out',
        plugins: [createSourcePlugin(session, false)],
        logLevel: 'silent',
        banner: { js: commonJsBanner(this.#builtins) },
      };
      const result = await getEsbuild().build(options);
      const output = result.outputFiles?.find((file) => file.path.endsWith('.js')) ?? result.outputFiles?.[0];
      const sourceMap = result.outputFiles?.find((file) => file.path.endsWith('.js.map'))?.text;
      const observation = session.complete();
      const issues = result.warnings.map((warning) => issueFromMessage(warning, 'warning'));
      if (output === undefined) {
        issues.push({
          message: 'No output generated',
          code: 'BUNDLER_FAILED',
          type: 'compilation',
          severity: 'error',
        });
      }
      const code = output?.text ?? '';
      return {
        code,
        sourceMap,
        issues,
        dependencies: observation.dependencies,
        unresolvedPaths: observation.unresolvedPaths,
        success: output !== undefined,
      };
    } catch (error) {
      const observation = session.complete();
      return {
        code: '',
        issues: issuesFromError(error),
        dependencies: observation.dependencies,
        unresolvedPaths: observation.unresolvedPaths,
        success: false,
      };
    }
  }

  public dispose(): void {
    this.#host.dispose();
  }
}

/** Execute bundled ESM and release its host-specific temporary resource. @public */
export const executeCode = async <T = unknown>(
  code: string,
  signal = new AbortController().signal,
): Promise<VmExecuteResult<T>> => {
  try {
    signal.throwIfAborted();
    let moduleExports: unknown;
    let entryUrl: string | undefined;
    if (isNode()) {
      const result = await executeCodeInNode(code);
      moduleExports = result.value;
      entryUrl = result.entryUrl;
    } else {
      const blobUrl = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
      entryUrl = blobUrl;
      try {
        moduleExports = await importBrowserModule(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
    signal.throwIfAborted();
    return { success: true, value: moduleExports as T, entryUrl };
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
};
