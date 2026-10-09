import { parsePackage } from 'cdn-resolve';

import { assertRootedPath, resolveImportPath } from '@taucad/runtime/kernel';
import type { BuiltinModule } from '@taucad/runtime/bundler';

import { resolveAssetIntent, splitAssetSpecifier } from '#asset-imports.js';
import type { BundlerSourceIntent } from '#asset-imports.js';
import { resolveNodeModule } from '#node-resolve.js';
import { PackageArtifactCache } from '#package-artifact-cache.js';
import type { BundlerFileSystem } from '#package-artifact-cache.js';
import { lockMatchesManifest, readPackageLock } from '#package-lock.js';
import { packageLockPath, packageManifestPath } from '#package-lock.types.js';
import type { PackageIssue, PackageLock } from '#package-lock.types.js';

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
  /** A file inside an installed package (or, without a lock, a CDN bundle); never auto-exported. */
  | (ResolvedBase & {
      readonly kind: 'package';
      readonly path: string;
      readonly name: string;
      readonly version: string;
    })
  | (ResolvedBase & { readonly kind: 'remote'; readonly url: string })
  | { readonly kind: 'external'; readonly id: string; readonly specifier: string }
  /** `message` starts with `issue.code` when a package issue caused the refusal. */
  | { readonly kind: 'unsupported'; readonly id: string; readonly message: string; readonly issue?: PackageIssue };

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
  /** Non-fatal package diagnostics, e.g. `package-not-locked` once per package name. */
  readonly issues: PackageIssue[];
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
// Relative imports inside installed packages follow Node's file and index probing (no TypeScript swaps).
const packageExtensions = ['.js', '.mjs', '.cjs', '.json', '/index.js', '/index.mjs', '/index.cjs', '/index.json'];
const remoteMaximumBytes = 10 * 1024 * 1024;

const isUrl = (value: string | undefined): boolean => value !== undefined && /^https?:\/\//u.test(value);

const isInNodeModules = (path: string): boolean => /(?:^|\/)node_modules\//u.test(path);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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
  inPackage = false,
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
  const candidates = inPackage
    ? packageExtensions.map((suffix) => path + suffix)
    : extension
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

type ProjectPackages = {
  readonly manifest?: Readonly<Record<string, unknown>>;
  readonly lock?: PackageLock;
  /** Set when a lock exists but cannot be used: every bare import fails with it (I6). */
  readonly issue?: PackageIssue;
};

// Read package.json and package-lock.json once per session. A `taucadPackageLock` key is just an unknown key.
const readProjectPackages = async (filesystem: BundlerFileSystem): Promise<ProjectPackages> => {
  let manifest: Readonly<Record<string, unknown>> | undefined;
  let manifestError: string | undefined;
  if (await filesystem.exists(packageManifestPath)) {
    try {
      const value: unknown = JSON.parse(await filesystem.readFile(packageManifestPath, 'utf8'));
      manifest = isRecord(value) ? value : {};
    } catch (error) {
      manifestError = errorMessage(error);
    }
  }
  const read = await readPackageLock(filesystem);
  if (read.issue !== undefined || read.lock === undefined) {
    return { manifest, issue: read.issue };
  }
  if (manifestError !== undefined) {
    return {
      lock: read.lock,
      issue: {
        code: 'lock-stale',
        message: `package.json is not valid JSON (${manifestError}). Fix it, then run Install.`,
      },
    };
  }
  return { manifest, lock: read.lock, issue: lockMatchesManifest(read.lock, manifest ?? {}) };
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
      const { filesystem } = options;
      const canonicalEntry = assertRootedPath(entryPath);
      const detectedModules = new Set<string>();
      const dependencies = new Set<string>();
      const unresolvedPaths = new Set<string>();
      const issues = new Map<string, PackageIssue>();
      // Package that owns each resolved package file, so its relative imports stay inside that package.
      const packageFiles = new Map<string, { readonly name: string; readonly version: string }>();
      let completed = false;
      let projectPromise: Promise<ProjectPackages> | undefined;
      const getProject = async (): Promise<ProjectPackages> => {
        projectPromise ??= readProjectPackages(filesystem);
        return projectPromise;
      };

      const refuse = (id: string, issue: PackageIssue): BundlerSourceResolution => ({
        kind: 'unsupported',
        id,
        message: `${issue.code}: ${issue.message}`,
        issue,
      });

      const packageFile = (path: string, owner: { readonly name: string; readonly version: string }) => {
        packageFiles.set(path, owner);
        dependencies.add(path);
        return { kind: 'package', id: path, path, ...owner, intent: scriptIntent(path) } as const;
      };

      const projectFile = (path: string, suffix: string, intent: BundlerSourceIntent) => {
        dependencies.add(path);
        return { kind: 'project', id: path, path, suffix, intent } as const;
      };

      // Bare or `#` import over the installed tree: Node resolution, failing only this import (I6).
      const resolveInstalled = async (specifier: string, importer: string): Promise<BundlerSourceResolution> => {
        let resolved: Awaited<ReturnType<typeof resolveNodeModule>>;
        try {
          resolved = await resolveNodeModule({ filesystem, specifier, importer });
        } catch (error) {
          return { kind: 'unsupported', id: specifier, message: errorMessage(error) };
        }
        if (resolved.kind === 'issue') {
          // The package appearing after Install invalidates this failed build.
          unresolvedPaths.add(`${resolved.issue.path ?? `node_modules/${resolved.issue.name}`}/package.json`);
          return refuse(specifier, resolved.issue);
        }
        if (!isInNodeModules(resolved.path)) {
          return projectFile(resolved.path, '', scriptIntent(resolved.path));
        }
        return packageFile(resolved.path, { name: resolved.packageName, version: resolved.packageVersion });
      };

      const resolveBare = async (specifier: string, importer: string): Promise<BundlerSourceResolution> => {
        const project = await getProject();
        if (project.lock === undefined && project.issue === undefined) {
          // No package-lock.json: today's CDN bundle (DA4), reported so the author can Install (I8).
          const { name } = parsePackage(specifier);
          const identity = await packageArtifacts.ensure(specifier, signal);
          if (!issues.has(name)) {
            issues.set(name, {
              code: 'package-not-locked',
              name,
              message: `'${name}' was loaded as a CDN bundle because the project has no package-lock.json. Run Install to lock and install it.`,
            });
          }
          return {
            kind: 'package',
            id: identity.cachePath,
            path: identity.cachePath,
            name,
            version: identity.exactVersion,
            intent: 'script',
          };
        }
        dependencies.add(packageManifestPath);
        dependencies.add(packageLockPath);
        if (project.issue !== undefined) {
          return refuse(specifier, project.issue);
        }
        return resolveInstalled(specifier, importer);
      };

      // A locked project whose lock names another version of a builtin's package than the one Tau runs gets one warning per name.
      const checkBuiltinVersion = async (identity: BuiltinModule['package']): Promise<void> => {
        const { lock } = await getProject();
        if (identity === undefined || lock === undefined || issues.has(identity.name)) {
          return;
        }
        dependencies.add(packageLockPath);
        const path = `node_modules/${identity.name}`;
        const row = lock.packages[path];
        const alias = /^npm:(.+)@([^@]+)$/u.exec(identity.spec);
        const [name, version] = alias === null ? [identity.name, identity.spec] : [alias[1], alias[2]];
        if (row !== undefined && (row.version !== version || (row.name ?? identity.name) !== name)) {
          issues.set(identity.name, {
            code: 'package-version-mismatch',
            name: identity.name,
            path,
            message: `package-lock.json has ${row.name ?? identity.name}@${row.version ?? '?'} but Tau runs ${identity.spec}. Set "${identity.name}": "${identity.spec}" in package.json dependencies and run Install so the lock matches the kernel.`,
          });
        }
      };

      // oxlint-disable-next-line complexity -- one discriminated resolver is the shared semantic boundary
      const resolve = async (request: BundlerSourceResolveRequest): Promise<BundlerSourceResolution> => {
        signal.throwIfAborted();
        const { attributes, importer, specifier } = request;

        if (specifier.startsWith('data:')) {
          return { kind: 'external', id: specifier, specifier };
        }
        if (specifier.startsWith('#')) {
          // Package files use their package's `imports`; project files only when package.json declares `imports`.
          const { manifest: projectManifest } = await getProject();
          const imports =
            (importer !== undefined && packageFiles.has(importer)) || isRecord(projectManifest?.['imports']);
          if (!imports || isUrl(importer)) {
            return {
              kind: 'unsupported',
              id: specifier,
              message: `Private package import '${specifier}' is not supported.`,
            };
          }
          return resolveInstalled(specifier, importer === undefined ? canonicalEntry : assertRootedPath(importer));
        }

        if (importer !== undefined && isUrl(importer)) {
          if (mode === 'detect') {
            return { kind: 'external', id: specifier, specifier };
          }
          const url = isBareSpecifier(specifier) ? `https://esm.sh/${specifier}` : new URL(specifier, importer).href;
          return { kind: 'remote', id: url, url, intent: scriptIntent(new URL(url).pathname) };
        }
        if (isUrl(specifier)) {
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
            await checkBuiltinVersion(builtins.get(builtinName)?.package);
            return { kind: 'builtin', id: `builtin:${builtinName}`, name: builtinName, intent: 'script' };
          }
          return resolveBare(specifier, importer === undefined ? canonicalEntry : assertRootedPath(importer));
        }

        if (specifier.startsWith('/') && importer?.startsWith(`${artifactRoot}/`)) {
          const url = `https://esm.sh${specifier}`;
          return { kind: 'remote', id: url, url, intent: scriptIntent(new URL(url).pathname) };
        }

        const asset = splitAssetSpecifier(specifier);
        const importerPath = importer === undefined ? canonicalEntry : assertRootedPath(importer);
        const unresolved = resolveImportPath(asset.specifier, importerPath);
        const owner = packageFiles.get(importerPath);
        if (owner !== undefined) {
          const found = await probeProjectPath(filesystem, unresolved, true);
          if (!(await filesystem.exists(found.path))) {
            return {
              kind: 'unsupported',
              id: specifier,
              message: `Cannot find '${specifier}' imported by '${importerPath}'.`,
            };
          }
          return packageFile(found.path, owner);
        }
        const result =
          asset.intent === undefined
            ? await probeProjectPath(filesystem, unresolved)
            : { path: unresolved, candidates: [] };
        if (!(await filesystem.exists(result.path))) {
          unresolvedPaths.add(result.path);
          for (const candidate of result.candidates) {
            unresolvedPaths.add(candidate);
          }
        }
        return projectFile(
          result.path,
          asset.suffix,
          resolveAssetIntent(asset.suffix, attributes) ?? scriptIntent(result.path),
        );
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

        const { path } = resolution;
        const resolveDirectory = directoryOf(path);
        try {
          if (resolution.intent !== 'script' && resolution.intent !== 'json') {
            return {
              id: resolution.id,
              bytes: await filesystem.readFile(path),
              intent: resolution.intent,
              resolveDirectory,
            };
          }
          let text = await filesystem.readFile(path, 'utf8');
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
            issues: [...issues.values()],
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
