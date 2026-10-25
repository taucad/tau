/**
 * GeoSpec's default module VM: native `esbuild` over the project filesystem, on Node only.
 *
 * It resolves project files (relative and root-absolute specifiers) and registered builtins, and nothing else: a bare
 * npm specifier or a URL is refused with a typed `BUNDLER_FAILED` issue naming the specifier, never fetched. A host
 * that wants package imports injects its own VM through `createModuleVm` (Tau injects `createEsbuildModuleVm`). In a
 * browser or worker realm there is no default: every bundle is refused until a VM is injected.
 */

import type * as Esbuild from 'esbuild';
import type * as NodeFs from 'node:fs';
import type * as NodeOs from 'node:os';
import type * as NodePath from 'node:path';
import type * as NodeProcess from 'node:process';
import type * as NodeUrl from 'node:url';
import { resolveRootedPath } from '#support/path.js';
import type {
  BuiltinModule,
  BundleResult,
  ModuleVm,
  ModuleVmOptions,
  VmExecuteResult,
  VmFileSystem,
  VmIssue,
} from '#vm/types.js';

/** Issue code of every bundling refusal, matching the code Tau's VM uses for the same failure. */
const bundlerFailed = 'BUNDLER_FAILED';

const namespace = { project: 'vfs', builtin: 'builtin' } as const;

/**
 * Keep Node-only modules opaque to browser bundlers until the Node branch runs.
 * @param specifier - Node-only package or built-in module to load.
 * @returns The imported module.
 */
const importNodeModule = async <T>(specifier: string): Promise<T> =>
  import(
    /* webpackIgnore: true */
    /* @vite-ignore */
    specifier
  ) as Promise<T>;

// oxlint-disable-next-line n/prefer-global/process, @typescript-eslint/no-unnecessary-condition -- process may be undefined in browser/worker
const isNode = (): boolean => typeof process !== 'undefined' && Boolean(process.versions?.node);

const noVmMessage =
  'No module VM is available on this host: GeoSpec bundles specs with native esbuild on Node only. Inject one with `createModuleVm`.';

const unsupportedImportMessage = (specifier: string): string =>
  `Cannot import '${specifier}': GeoSpec's default module VM resolves project files and GeoSpec builtins only, never npm packages or URLs. Run the spec on a host that injects a module VM with package resolution (\`createModuleVm\`), or import a project file instead.`;

const isProjectSpecifier = (specifier: string): boolean =>
  specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');

const isUrlSpecifier = (specifier: string): boolean => /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(specifier);

const packageName = (specifier: string): string => {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
};

const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'] as const;
const extensionSwaps = new Map<string, readonly string[]>([
  ['.js', ['.ts', '.tsx']],
  ['.jsx', ['.tsx']],
]);

/** A directory is not a module file: `exists` reports it as `EISDIR`, so index probing can continue. */
const isFile = async (filesystem: VmFileSystem, path: string): Promise<boolean> => {
  try {
    return await filesystem.exists(path);
  } catch (error) {
    if ((error as { readonly code?: unknown }).code === 'EISDIR') {
      return false;
    }
    throw error;
  }
};

/**
 * Resolve a project specifier against its importer, probing extensions the way Tau's bundler does.
 * @param filesystem - Project filesystem.
 * @param specifier - Relative or root-absolute specifier.
 * @param importer - Rooted importer path.
 * @returns The rooted path of the file, or undefined when none exists.
 */
const resolveProjectFile = async (
  filesystem: VmFileSystem,
  specifier: string,
  importer: string,
): Promise<string | undefined> => {
  let path: string;
  if (specifier.startsWith('/')) {
    path = resolveRootedPath(specifier.slice(1));
  } else {
    const separator = importer.lastIndexOf('/');
    const directory = separator === -1 ? '' : importer.slice(0, separator);
    path = resolveRootedPath(`${directory ? `${directory}/` : ''}${specifier}`);
  }
  if (await isFile(filesystem, path)) {
    return path;
  }
  const extension = /\.[jt]sx?$/u.exec(path)?.[0];
  const candidates = extension
    ? (extensionSwaps.get(extension) ?? []).map((swap) => path.slice(0, -extension.length) + swap)
    : sourceExtensions.map((suffix) => path + suffix);
  for (const candidate of candidates) {
    // oxlint-disable-next-line no-await-in-loop -- ordered probing is observable resolution behaviour
    if (await isFile(filesystem, candidate)) {
      return candidate;
    }
  }
  return undefined;
};

const loaderFor = (path: string): Esbuild.Loader => {
  if (path.endsWith('.ts') || path.endsWith('.mts') || path.endsWith('.cts')) {
    return 'ts';
  }
  if (path.endsWith('.tsx')) {
    return 'tsx';
  }
  if (path.endsWith('.jsx')) {
    return 'jsx';
  }
  if (path.endsWith('.json')) {
    return 'json';
  }
  return 'js';
};

const issueFromMessage = (message: Esbuild.Message, severity: 'error' | 'warning'): VmIssue => ({
  message: message.text,
  code: bundlerFailed,
  ...(message.detail === undefined ? {} : { details: message.detail as unknown }),
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
    const build = error as { readonly errors?: Esbuild.Message[]; readonly warnings?: Esbuild.Message[] };
    return [
      ...(build.errors ?? []).map((message) => issueFromMessage(message, 'error')),
      ...(build.warnings ?? []).map((message) => issueFromMessage(message, 'warning')),
    ];
  }
  return [
    {
      message: error instanceof Error ? error.message : String(error),
      code: bundlerFailed,
      type: 'compilation',
      severity: 'error',
    },
  ];
};

const commonJsBanner = (modules: ReadonlyMap<string, BuiltinModule>): string => {
  const globals = [...modules.values()]
    .filter((module) => module.globalName !== undefined && module.registryExpression !== undefined)
    .map((module) => `const ${module.globalName} = ${module.registryExpression};`)
    .join('\n');
  return `${globals}\nconst exports = {};\nconst module = { exports };\n`;
};

type Session = {
  readonly detectedModules: Set<string>;
  readonly dependencies: Set<string>;
  readonly unresolvedPaths: Set<string>;
};

const createSourcePlugin = ({
  filesystem,
  builtins,
  session,
  detect,
}: {
  readonly filesystem: VmFileSystem;
  readonly builtins: ReadonlyMap<string, BuiltinModule>;
  readonly session: Session;
  readonly detect: boolean;
}): Esbuild.Plugin => ({
  name: detect ? 'geospec-vfs-detection' : 'geospec-vfs',
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      const { path: specifier } = args;
      const importer = args.importer.length === 0 ? undefined : args.importer;
      if (importer === undefined) {
        // The entry point itself.
        const entry = resolveRootedPath(specifier);
        session.dependencies.add(entry);
        return { path: entry, namespace: namespace.project };
      }
      if (isProjectSpecifier(specifier) && args.namespace === namespace.project) {
        try {
          const path = await resolveProjectFile(filesystem, specifier, importer);
          if (path === undefined) {
            session.unresolvedPaths.add(specifier);
            return { errors: [{ text: `Cannot find '${specifier}' imported by '${importer}'.` }] };
          }
          session.dependencies.add(path);
          return { path, namespace: namespace.project };
        } catch (error) {
          return {
            errors: [
              { text: `Failed to resolve '${specifier}': ${error instanceof Error ? error.message : String(error)}` },
            ],
          };
        }
      }
      const builtinName = builtins.has(specifier)
        ? specifier
        : builtins.has(packageName(specifier))
          ? packageName(specifier)
          : undefined;
      if (detect && !isProjectSpecifier(specifier)) {
        // Detection reports every bare specifier, builtins included, and loads none of them.
        session.detectedModules.add(specifier);
        return { path: specifier, external: true };
      }
      if (builtinName !== undefined) {
        return { path: builtinName, namespace: namespace.builtin };
      }
      return {
        errors: [
          {
            text: unsupportedImportMessage(specifier),
            detail: {
              code: isUrlSpecifier(specifier) ? 'url-import-unsupported' : 'package-import-unsupported',
              specifier,
            },
          },
        ],
      };
    });

    build.onLoad({ filter: /.*/, namespace: namespace.builtin }, (args) => {
      const module = builtins.get(args.path);
      return module === undefined
        ? { errors: [{ text: `Missing builtin module '${args.path}'.` }] }
        : { contents: module.code, loader: 'js' };
    });

    build.onLoad({ filter: /.*/, namespace: namespace.project }, async (args) => {
      try {
        return { contents: await filesystem.readFile(args.path, 'utf8'), loader: loaderFor(args.path) };
      } catch (error) {
        return {
          errors: [
            { text: `Failed to load '${args.path}': ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    });
  },
});

let nodeExecuteCounter = 0;

const stripInlineSourceMap = (code: string): string => code.replace(/\/\/# sourceMappingURL=data:[^\n]+$/mu, '');

/**
 * Execute bundled code in Node.js through a temporary module file.
 * @param code - Bundled ESM.
 * @returns The module namespace and the temporary entry URL.
 */
const executeCodeInNode = async (code: string): Promise<{ value: unknown; entryUrl: string }> => {
  const [fs, os, path, nodeProcess, url] = await Promise.all([
    importNodeModule<typeof NodeFs>('node:fs'),
    importNodeModule<typeof NodeOs>('node:os'),
    importNodeModule<typeof NodePath>('node:path'),
    importNodeModule<typeof NodeProcess>('node:process'),
    importNodeModule<typeof NodeUrl>('node:url'),
  ]);
  // Unique across worker threads too: pool workers share the pid and each thread has its own counter.
  const uniqueSuffix = Math.random().toString(36).slice(2, 10);
  const temporaryFile = path.join(
    os.tmpdir(),
    `geospec-exec-${nodeProcess.pid}-${++nodeExecuteCounter}-${uniqueSuffix}.mjs`,
  );
  const entryUrl = url.pathToFileURL(temporaryFile).href;
  fs.writeFileSync(temporaryFile, stripInlineSourceMap(code), 'utf8');
  try {
    const value: unknown = await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      entryUrl
    );
    return { value, entryUrl };
  } finally {
    try {
      fs.unlinkSync(temporaryFile);
    } catch {
      // Best-effort cleanup; the OS reclaims the temp file if unlink fails.
    }
  }
};

const unavailableBundle = (): BundleResult => ({
  code: '',
  issues: [{ message: noVmMessage, code: bundlerFailed, type: 'compilation', severity: 'error' }],
  success: false,
  dependencies: [],
  unresolvedPaths: [],
});

/**
 * Create GeoSpec's default module VM: native `esbuild` over the project filesystem, resolving project files and
 * registered builtins only. A bare npm or URL import is refused with a `BUNDLER_FAILED` issue that names the
 * specifier. Outside Node every bundle is refused with `BUNDLER_FAILED` until a host injects a VM.
 *
 * @param options - The project filesystem.
 * @returns A module VM.
 * @public
 */
export const createPlainModuleVm = async (options: ModuleVmOptions): Promise<ModuleVm> => {
  const { filesystem } = options;
  const builtins = new Map<string, BuiltinModule>();
  const esbuild = isNode() ? await importNodeModule<typeof Esbuild>('esbuild') : undefined;

  const newSession = (): Session => ({
    detectedModules: new Set(),
    dependencies: new Set(),
    unresolvedPaths: new Set(),
  });

  return {
    async detectImports(entryPath) {
      if (esbuild === undefined) {
        throw new Error(noVmMessage);
      }
      const session = newSession();
      await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        write: false,
        metafile: true,
        format: 'esm',
        target: 'es2022',
        platform: 'browser',
        plugins: [createSourcePlugin({ filesystem, builtins, session, detect: true })],
        logLevel: 'silent',
      });
      return { detectedModules: [...session.detectedModules], dependencies: [...session.dependencies] };
    },

    async bundle(entryPath, signal) {
      if (esbuild === undefined) {
        return unavailableBundle();
      }
      const session = newSession();
      try {
        signal?.throwIfAborted();
        const result = await esbuild.build({
          entryPoints: [entryPath],
          bundle: true,
          write: false,
          format: 'esm',
          target: 'es2022',
          platform: 'browser',
          sourcemap: 'external',
          outdir: 'out',
          plugins: [createSourcePlugin({ filesystem, builtins, session, detect: false })],
          logLevel: 'silent',
          banner: { js: commonJsBanner(builtins) },
        });
        const output = result.outputFiles.find((file) => file.path.endsWith('.js')) ?? result.outputFiles[0];
        const sourceMap = result.outputFiles.find((file) => file.path.endsWith('.js.map'))?.text;
        const issues = result.warnings.map((warning) => issueFromMessage(warning, 'warning'));
        if (output === undefined) {
          issues.push({ message: 'No output generated', code: bundlerFailed, type: 'compilation', severity: 'error' });
        }
        return {
          code: output?.text ?? '',
          ...(sourceMap === undefined ? {} : { sourceMap }),
          issues,
          dependencies: [...session.dependencies],
          unresolvedPaths: [...session.unresolvedPaths],
          success: output !== undefined,
        };
      } catch (error) {
        return {
          code: '',
          issues: issuesFromError(error),
          dependencies: [...session.dependencies],
          unresolvedPaths: [...session.unresolvedPaths],
          success: false,
        };
      }
    },

    async execute<T = unknown>(code: string, signal?: AbortSignal): Promise<VmExecuteResult<T>> {
      try {
        signal?.throwIfAborted();
        if (!isNode()) {
          throw new Error(noVmMessage);
        }
        const { value, entryUrl } = await executeCodeInNode(code);
        signal?.throwIfAborted();
        return { success: true, value: value as T, entryUrl };
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
    },

    registerModule(name, module) {
      builtins.set(name, module);
    },

    dispose() {
      builtins.clear();
    },
  };
};
