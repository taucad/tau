import { resolveRootedPath } from '@taucad/runtime/kernel';

import type { BundlerFileSystem } from '#package-artifact-cache.js';
import type { PackageIssue } from '#package-lock.types.js';

/** One bare (`name/sub`) or private (`#name`) import to resolve over an installed `node_modules` tree. @internal */
export type NodeResolveRequest = {
  readonly filesystem: BundlerFileSystem;
  readonly specifier: string;
  /** Project-rooted path of the importing file (no leading slash). */
  readonly importer: string;
  /** Matched against `exports`/`imports` condition keys; `default` always matches, `development` never does. */
  readonly conditions?: readonly string[];
};

/** A resolved file with the identity of the installed package that owns it, or an actionable issue. @internal */
export type NodeResolution =
  | { readonly kind: 'file'; readonly path: string; readonly packageName: string; readonly packageVersion: string }
  | { readonly kind: 'issue'; readonly issue: PackageIssue };

type Manifest = Readonly<Record<string, unknown>>;

const defaultConditions = ['browser', 'import', 'module', 'default'];
// ponytail: `.ts` probes last so packages that ship TS source beside their JS still resolve the JS.
const fileExtensions = ['', '.js', '.mjs', '.cjs', '.json', '.ts'];
// ponytail: only the string form of `browser`; object-form remaps are ignored (fall through to module/main).
const mainFields = ['browser', 'module', 'main'];
const packageName = /^(?:@[^./\\%][^/\\%]*\/)?[^./\\%][^/\\%]*$/u;

const isRecord = (value: unknown): value is Manifest =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const join = (directory: string, path: string): string => resolveRootedPath(directory ? `${directory}/${path}` : path);

const parentOf = (path: string): string | undefined =>
  path === '' ? undefined : path.slice(0, Math.max(path.lastIndexOf('/'), 0));

const isNodeModules = (directory: string): boolean =>
  directory === 'node_modules' || directory.endsWith('/node_modules');

const isFile = async (filesystem: BundlerFileSystem, path: string): Promise<boolean> => {
  if (!(await filesystem.exists(path))) {
    return false;
  }
  if (filesystem.stat === undefined) {
    return true;
  }
  const entry = await filesystem.stat(path);
  return entry.type === 'file';
};

const firstFile = async (filesystem: BundlerFileSystem, candidates: readonly string[]): Promise<string | undefined> => {
  for (const candidate of candidates) {
    // oxlint-disable-next-line no-await-in-loop -- ordered probing is observable resolution behavior
    if (await isFile(filesystem, candidate)) {
      return candidate;
    }
  }
  return undefined;
};

const readManifest = async (filesystem: BundlerFileSystem, directory: string): Promise<Manifest | undefined> => {
  const path = join(directory, 'package.json');
  if (!(await filesystem.exists(path))) {
    return undefined;
  }
  const value: unknown = JSON.parse(await filesystem.readFile(path, 'utf8'));
  return isRecord(value) ? value : {};
};

const stringField = (manifest: Manifest, key: string): string => {
  const value = manifest[key];
  return typeof value === 'string' ? value : '';
};

const loadAsFile = async (filesystem: BundlerFileSystem, path: string): Promise<string | undefined> =>
  firstFile(
    filesystem,
    fileExtensions.map((extension) => path + extension),
  );

const loadIndex = async (filesystem: BundlerFileSystem, directory: string): Promise<string | undefined> =>
  firstFile(
    filesystem,
    fileExtensions.slice(1).map((extension) => join(directory, `index${extension}`)),
  );

// Directory entry: `browser` (string) → `module` → `main` → `index.*`, for a package root or a subpath folder.
const loadAsDirectory = async (filesystem: BundlerFileSystem, directory: string): Promise<string | undefined> => {
  const manifest = (await readManifest(filesystem, directory)) ?? {};
  for (const field of mainFields) {
    const entry = manifest[field];
    if (typeof entry === 'string') {
      const target = join(directory, entry);
      // oxlint-disable-next-line no-await-in-loop -- main fields are tried in priority order
      const found = (await loadAsFile(filesystem, target)) ?? (await loadIndex(filesystem, target));
      if (found !== undefined) {
        return found;
      }
    }
  }
  return loadIndex(filesystem, directory);
};

// Node's PACKAGE_TARGET_RESOLVE: condition objects in key order, arrays first-match, `null` = not exported.
const resolveTarget = (
  target: unknown,
  match: string | undefined,
  conditions: ReadonlySet<string>,
): string | undefined => {
  if (typeof target === 'string') {
    return match === undefined ? target : target.replaceAll('*', match);
  }
  const candidates = Array.isArray(target)
    ? target
    : isRecord(target)
      ? Object.entries(target)
          .filter(([key]) => conditions.has(key))
          .map(([, value]) => value)
      : [];
  for (const candidate of candidates) {
    const resolved = resolveTarget(candidate, match, conditions);
    if (resolved !== undefined) {
      return resolved;
    }
  }
  return undefined;
};

// Node's PACKAGE_IMPORTS_EXPORTS_RESOLVE: exact key, else the single-`*` pattern with the longest base.
const resolveMapped = (map: Manifest, key: string, conditions: ReadonlySet<string>): string | undefined => {
  if (Object.hasOwn(map, key) && !key.includes('*')) {
    return resolveTarget(map[key], undefined, conditions);
  }
  let best: string | undefined;
  for (const pattern of Object.keys(map)) {
    const star = pattern.indexOf('*');
    if (star === -1 || star !== pattern.lastIndexOf('*')) {
      continue;
    }
    const matches =
      key.length >= pattern.length && key.startsWith(pattern.slice(0, star)) && key.endsWith(pattern.slice(star + 1));
    const bestStar = best?.indexOf('*') ?? -1;
    if (matches && (best === undefined || star > bestStar || (star === bestStar && pattern.length > best.length))) {
      best = pattern;
    }
  }
  if (best === undefined) {
    return undefined;
  }
  const star = best.indexOf('*');
  return resolveTarget(map[best], key.slice(star, key.length - (best.length - star - 1)), conditions);
};

// Resolve a mapped `./` target inside `directory` and require the file to exist.
const containedFile = async (filesystem: BundlerFileSystem, directory: string, target: string): Promise<string> => {
  const path = target.startsWith('./') ? join(directory, target) : undefined;
  if (path === undefined || (directory !== '' && !path.startsWith(`${directory}/`))) {
    throw new Error(`Invalid package target '${target}' in '${join(directory, 'package.json')}'.`);
  }
  if (!(await isFile(filesystem, path))) {
    throw new Error(`Cannot find '${path}', mapped from '${join(directory, 'package.json')}'.`);
  }
  return path;
};

const findPackageDirectory = async (
  filesystem: BundlerFileSystem,
  name: string,
  start: string,
): Promise<string | undefined> => {
  for (let directory: string | undefined = start; directory !== undefined; directory = parentOf(directory)) {
    if (!isNodeModules(directory)) {
      const candidate = join(directory, `node_modules/${name}`);
      // oxlint-disable-next-line no-await-in-loop -- the nearest node_modules wins, so ancestors are probed in order
      if (await filesystem.exists(join(candidate, 'package.json'))) {
        return candidate;
      }
    }
  }
  return undefined;
};

// Nearest ancestor `package.json`, stopping at a `node_modules` boundary (Node's LOOKUP_PACKAGE_SCOPE).
const findScope = async (
  filesystem: BundlerFileSystem,
  start: string,
): Promise<{ readonly directory: string; readonly manifest: Manifest } | undefined> => {
  for (let directory: string | undefined = start; directory !== undefined; directory = parentOf(directory)) {
    if (isNodeModules(directory)) {
      return undefined;
    }
    // oxlint-disable-next-line no-await-in-loop -- the nearest package.json is the scope
    const manifest = await readManifest(filesystem, directory);
    if (manifest !== undefined) {
      return { directory, manifest };
    }
  }
  return undefined;
};

type Resolving = Omit<NodeResolveRequest, 'conditions'> & { readonly conditions: ReadonlySet<string> };

const resolvePrivate = async (request: Resolving): Promise<NodeResolution> => {
  const { filesystem, specifier, importer, conditions } = request;
  const scope = await findScope(filesystem, parentOf(importer) ?? '');
  const imports = scope?.manifest['imports'];
  const target = scope && isRecord(imports) ? resolveMapped(imports, specifier, conditions) : undefined;
  if (scope === undefined || target === undefined) {
    throw new Error(`'${specifier}' is not defined by the "imports" of the package that contains '${importer}'.`);
  }
  if (!target.startsWith('./')) {
    return resolve({ ...request, specifier: target, importer: join(scope.directory, 'package.json') });
  }
  const marker = scope.directory.lastIndexOf('node_modules/');
  return {
    kind: 'file',
    path: await containedFile(filesystem, scope.directory, target),
    packageName:
      marker === -1 ? stringField(scope.manifest, 'name') : scope.directory.slice(marker + 'node_modules/'.length),
    packageVersion: stringField(scope.manifest, 'version'),
  };
};

const resolvePackage = async (request: Resolving): Promise<NodeResolution> => {
  const { filesystem, specifier, importer, conditions } = request;
  const segments = specifier.split('/');
  const nameLength = specifier.startsWith('@') ? 2 : 1;
  const name = segments.slice(0, nameLength).join('/');
  if (!packageName.test(name)) {
    throw new Error(`'${specifier}' is not a valid package specifier.`);
  }
  const rest = segments.slice(nameLength).join('/');
  const subpath = rest ? `./${rest}` : '.';
  const directory = await findPackageDirectory(filesystem, name, parentOf(importer) ?? '');
  if (directory === undefined) {
    return {
      kind: 'issue',
      issue: {
        code: 'package-not-installed',
        message: `Package '${name}' is not installed in node_modules. Run Install (or \`npm ci\`) to install package-lock.json.`,
        name,
        path: `node_modules/${name}`,
      },
    };
  }
  const manifest = (await readManifest(filesystem, directory)) ?? {};
  const packageVersion = stringField(manifest, 'version');
  const { exports } = manifest;
  if (exports !== undefined && exports !== null) {
    const map =
      isRecord(exports) && Object.keys(exports).some((key) => key.startsWith('.')) ? exports : { '.': exports };
    const target = resolveMapped(map, subpath, conditions);
    if (target === undefined) {
      throw new Error(`'${specifier}' is not exported by ${name}@${packageVersion} (exports map).`);
    }
    return {
      kind: 'file',
      path: await containedFile(filesystem, directory, target),
      packageName: name,
      packageVersion,
    };
  }
  const base = join(directory, subpath);
  const path =
    subpath === '.'
      ? await loadAsDirectory(filesystem, directory)
      : ((await loadAsFile(filesystem, base)) ?? (await loadAsDirectory(filesystem, base)));
  if (path === undefined) {
    throw new Error(`Cannot find '${specifier}' in ${name}@${packageVersion}.`);
  }
  return { kind: 'file', path, packageName: name, packageVersion };
};

const resolve = async (request: Resolving): Promise<NodeResolution> =>
  request.specifier.startsWith('#') ? resolvePrivate(request) : resolvePackage(request);

/**
 * Resolve a bare or `#private` import the way Node does over an installed `node_modules` tree: nearest
 * `node_modules/<name>` from the importer upward, then `exports` (or `browser`/`module`/`main`/index probing).
 *
 * @param request - Filesystem, specifier, importer and optional condition names.
 * @returns The resolved file and owning package, or `package-not-installed` when no ancestor has the package.
 * @throws {Error} When the package is installed but the subpath is not exported, a `#` import is undefined, or the
 * mapped/probed file is missing.
 * @internal
 */
export const resolveNodeModule = async (request: NodeResolveRequest): Promise<NodeResolution> => {
  const conditions = new Set([...(request.conditions ?? defaultConditions), 'default']);
  conditions.delete('development');
  return resolve({ ...request, conditions });
};
