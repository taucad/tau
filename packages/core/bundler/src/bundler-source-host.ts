import { parsePackage } from 'cdn-resolve';

import { assertRootedPath, resolveImportPath } from '@taucad/runtime/kernel';
import type { BuiltinModule } from '@taucad/runtime/bundler';

import { resolveAssetIntent, splitAssetSpecifier } from '#asset-imports.js';
import type { BundlerSourceIntent } from '#asset-imports.js';
import { PackageArtifactCache } from '#package-artifact-cache.js';
import type { BundlerFileSystem, PackageArtifactIdentity } from '#package-artifact-cache.js';

/** Source-host operation mode. @public */
export type BundlerSourceMode = 'detect' | 'bundle';

/** Resolution request shared by compiler adapters. @public */
export type BundlerSourceResolveRequest = {
  readonly specifier: string;
  readonly importer?: string;
  readonly attributes?: Readonly<Record<string, string>>;
};

type ResolvedBase = { readonly id: string; readonly intent: BundlerSourceIntent };

/** Compiler-neutral result of resolving one import. @public */
export type BundlerSourceResolution =
  | (ResolvedBase & { readonly kind: 'project'; readonly path: string; readonly suffix: string })
  | (ResolvedBase & { readonly kind: 'builtin'; readonly name: string })
  | (ResolvedBase & { readonly kind: 'package'; readonly identity: PackageArtifactIdentity })
  | (ResolvedBase & { readonly kind: 'remote'; readonly url: string })
  | { readonly kind: 'external'; readonly id: string; readonly specifier: string }
  | { readonly kind: 'unsupported'; readonly id: string; readonly message: string };

/** Loaded compiler-neutral module source. @public */
export type BundlerSource = {
  readonly id: string;
  readonly text?: string;
  readonly bytes?: Uint8Array<ArrayBuffer>;
  readonly intent: BundlerSourceIntent;
  readonly resolveDirectory?: string;
};

/** Stable source graph observations from one completed operation. @public */
export type BundlerSourceObservation = {
  readonly detectedModules: string[];
  readonly dependencies: string[];
  readonly unresolvedPaths: string[];
};

/** One operation-local resolver/loader session. @public */
export type BundlerSourceSession = {
  resolve(request: BundlerSourceResolveRequest): Promise<BundlerSourceResolution>;
  load(resolution: BundlerSourceResolution): Promise<BundlerSource>;
  complete(): BundlerSourceObservation;
};

/** Shared source host used by one bundler VM. @public */
export type BundlerSourceHost = {
  registerBuiltin(input: { readonly name: string; readonly module: BuiltinModule }): void;
  beginSession(input: {
    readonly mode: BundlerSourceMode;
    readonly signal: AbortSignal;
    readonly entryPath: string;
  }): BundlerSourceSession;
  dispose(): void;
};

/** Source-host construction options. @public */
export type BundlerSourceHostOptions = {
  readonly filesystem: BundlerFileSystem;
  readonly autoExportNames?: readonly string[];
};

const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'] as const;
const extensionSwaps = new Map([
  ['.js', ['.ts', '.tsx']],
  ['.jsx', ['.tsx']],
]);
const remoteMaximumBytes = 10 * 1024 * 1024;

const isBareSpecifier = (specifier: string): boolean =>
  !specifier.startsWith('./') &&
  !specifier.startsWith('../') &&
  !specifier.startsWith('/') &&
  !specifier.startsWith('http://') &&
  !specifier.startsWith('https://');

const directoryOf = (path: string): string => {
  const directory = path.slice(0, Math.max(path.lastIndexOf('/'), 0));
  return directory;
};

const scriptIntent = (path: string): BundlerSourceIntent => (path.toLowerCase().endsWith('.json') ? 'json' : 'script');

const addAutomaticExports = (code: string, names: readonly string[]): string => {
  const exports: string[] = [];
  for (const name of names) {
    const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
    const alreadyExported =
      new RegExp(`\\bexport\\s+\\{\\s*[^}]*\\b${escaped}\\b`, 'u').test(code) ||
      new RegExp(`\\bexport\\s+(?:const|function|let|var)\\s+${escaped}\\b`, 'u').test(code) ||
      (name === 'main' && /\bexport\s+default\b/u.test(code));
    const defined =
      new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`, 'u').test(code) ||
      new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=`, 'u').test(code);
    if (!alreadyExported && defined) {
      exports.push(name);
    }
  }
  return exports.length === 0 ? code : `${code}\nexport { ${exports.join(', ')} };\n`;
};

const probeProjectPath = async (
  filesystem: BundlerFileSystem,
  path: string,
): Promise<{ readonly path: string; readonly candidates: readonly string[] }> => {
  const isFile = async (candidate: string): Promise<boolean> => {
    if (!(await filesystem.exists(candidate))) {
      return false;
    }
    if (filesystem.stat === undefined) {
      return true;
    }
    const entry = await filesystem.stat(candidate);
    return entry.type === 'file';
  };
  if (await isFile(path)) {
    return { path, candidates: [] };
  }
  const extension = /\.[jt]sx?$/u.exec(path)?.[0];
  const candidates = extension
    ? (extensionSwaps.get(extension) ?? []).map((swap) => path.slice(0, -extension.length) + swap)
    : sourceExtensions.map((suffix) => path + suffix);
  for (const candidate of candidates) {
    // oxlint-disable-next-line no-await-in-loop -- ordered probing is observable resolution behavior
    if (await isFile(candidate)) {
      return { path: candidate, candidates };
    }
  }
  return { path, candidates };
};

/**
 * Create the compiler-neutral source host used by Tau bundler adapters.
 * @param options - Rooted filesystem and automatic entry exports.
 * @returns A reusable host with operation-local sessions.
 * @public
 */
export const createBundlerSourceHost = (options: BundlerSourceHostOptions): BundlerSourceHost => {
  const builtins = new Map<string, BuiltinModule>();
  const packageArtifacts = new PackageArtifactCache(options.filesystem);
  const autoExportNames = options.autoExportNames ?? ['main', 'defaultParams'];

  return {
    registerBuiltin({ name, module }) {
      builtins.set(name, module);
    },

    beginSession({ mode, signal, entryPath }) {
      const canonicalEntry = assertRootedPath(entryPath);
      const detectedModules = new Set<string>();
      const dependencies = new Set<string>();
      const unresolvedPaths = new Set<string>();
      let completed = false;

      // oxlint-disable-next-line complexity -- one discriminated resolver is the shared semantic boundary
      const resolve = async (request: BundlerSourceResolveRequest): Promise<BundlerSourceResolution> => {
        signal.throwIfAborted();
        const { attributes, importer, specifier } = request;

        if (specifier.startsWith('data:')) {
          return { kind: 'external', id: specifier, specifier };
        }
        if (specifier.startsWith('#')) {
          return {
            kind: 'unsupported',
            id: specifier,
            message: `Private package import '${specifier}' is not supported.`,
          };
        }

        if (importer !== undefined && /^https?:\/\//u.test(importer)) {
          if (mode === 'detect') {
            return { kind: 'external', id: specifier, specifier };
          }
          const url = isBareSpecifier(specifier) ? `https://esm.sh/${specifier}` : new URL(specifier, importer).href;
          return { kind: 'remote', id: url, url, intent: scriptIntent(new URL(url).pathname) };
        }
        if (specifier.startsWith('http://') || specifier.startsWith('https://')) {
          if (mode === 'detect') {
            return { kind: 'external', id: specifier, specifier };
          }
          return {
            kind: 'remote',
            id: specifier,
            url: specifier,
            intent: scriptIntent(new URL(specifier).pathname),
          };
        }

        if (isBareSpecifier(specifier) && !(importer === undefined && specifier === canonicalEntry)) {
          if (mode === 'detect') {
            detectedModules.add(specifier);
            return { kind: 'external', id: specifier, specifier };
          }
          const parsed = parsePackage(specifier);
          const parsedPath = parsed.path?.replace(/^\//u, '') ?? '';
          const fullName = parsedPath === '' ? parsed.name : `${parsed.name}/${parsedPath}`;
          const builtinName = builtins.has(fullName) ? fullName : builtins.has(parsed.name) ? parsed.name : undefined;
          if (builtinName !== undefined) {
            return { kind: 'builtin', id: `builtin:${builtinName}`, name: builtinName, intent: 'script' };
          }
          const identity = await packageArtifacts.ensure(specifier, signal);
          return { kind: 'package', id: identity.cachePath, identity, intent: 'script' };
        }

        if (specifier.startsWith('/') && importer?.startsWith(`${artifactRoot}/`)) {
          const url = `https://esm.sh${specifier}`;
          return { kind: 'remote', id: url, url, intent: scriptIntent(new URL(url).pathname) };
        }

        const asset = splitAssetSpecifier(specifier);
        const importerPath = importer === undefined ? canonicalEntry : assertRootedPath(importer);
        const unresolved = resolveImportPath(asset.specifier, importerPath);
        const result =
          asset.intent === undefined
            ? await probeProjectPath(options.filesystem, unresolved)
            : { path: unresolved, candidates: [] };
        if (!(await options.filesystem.exists(result.path))) {
          unresolvedPaths.add(result.path);
          for (const candidate of result.candidates) {
            unresolvedPaths.add(candidate);
          }
        }
        const intent = resolveAssetIntent(asset.suffix, attributes) ?? scriptIntent(result.path);
        dependencies.add(result.path);
        return {
          kind: 'project',
          id: result.path,
          path: result.path,
          suffix: asset.suffix,
          intent,
        };
      };

      const load = async (resolution: BundlerSourceResolution): Promise<BundlerSource> => {
        signal.throwIfAborted();
        if (resolution.kind === 'external' || resolution.kind === 'unsupported') {
          throw new Error(
            resolution.kind === 'unsupported' ? resolution.message : `Cannot load external '${resolution.id}'.`,
          );
        }
        if (resolution.kind === 'builtin') {
          const builtin = builtins.get(resolution.name);
          if (builtin === undefined) {
            throw new Error(`Built-in module '${resolution.name}' not found.`);
          }
          return { id: resolution.id, text: builtin.code, intent: 'script' };
        }
        if (resolution.kind === 'remote') {
          const response = await fetch(resolution.url, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch '${resolution.url}': ${response.status} ${response.statusText}`);
          }
          const declared = Number(response.headers.get('content-length') ?? 0);
          if (declared > remoteMaximumBytes) {
            throw new Error(`Remote module '${resolution.url}' exceeds ${remoteMaximumBytes} bytes.`);
          }
          const text = await response.text();
          if (new TextEncoder().encode(text).byteLength > remoteMaximumBytes) {
            throw new Error(`Remote module '${resolution.url}' exceeds ${remoteMaximumBytes} bytes.`);
          }
          return { id: resolution.id, text, intent: resolution.intent, resolveDirectory: resolution.url };
        }

        const path = resolution.kind === 'package' ? resolution.identity.cachePath : resolution.path;
        const resolveDirectory = directoryOf(path);
        try {
          if (resolution.intent !== 'script' && resolution.intent !== 'json') {
            return {
              id: resolution.id,
              bytes: await options.filesystem.readFile(path),
              intent: resolution.intent,
              resolveDirectory,
            };
          }
          let text = await options.filesystem.readFile(path, 'utf8');
          if (resolution.kind === 'project' && path === canonicalEntry && resolution.intent === 'script') {
            text = addAutomaticExports(text, autoExportNames);
          }
          return { id: resolution.id, text, intent: resolution.intent, resolveDirectory };
        } catch (error) {
          if (resolution.kind === 'project') {
            unresolvedPaths.add(path);
          }
          throw error;
        }
      };

      return {
        resolve,
        load,
        complete() {
          if (completed) {
            throw new Error('Bundler source session has already completed.');
          }
          completed = true;
          return {
            detectedModules: [...detectedModules].sort(),
            dependencies: [...dependencies].sort(),
            unresolvedPaths: [...unresolvedPaths].sort(),
          };
        },
      };
    },

    dispose() {
      packageArtifacts.dispose();
      builtins.clear();
    },
  };
};

const artifactRoot = 'node_modules/.tau-bundler';
