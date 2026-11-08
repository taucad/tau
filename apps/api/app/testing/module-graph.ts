import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * A static, over-approximating module graph of the API's own source, for tests
 * that prove what an entry point can and cannot reach (DC4).
 *
 * It reads `import`, `export … from` and `import('…')` specifiers with string
 * literals, follows relative paths and each package's `#*` subpath imports, and
 * enters the API server libraries (`@taucad/api-*` under `apps/libs`) through
 * their `exports` maps, because their modules are the API's own source moved
 * into libraries. Every other bare specifier is recorded as a package without
 * descending into it.
 * `import type` and `export type` are skipped because they are erased before
 * run time. Anything a regular expression mistakes for an import makes the
 * graph larger, never smaller, which is the safe direction for a test that
 * asserts something is *not* reachable.
 */

/**
 * `apps/api`, the root every path below is relative to: an app module is
 * `app/main.ts`, a library module `../libs/api-core/src/environment.config.ts`.
 */
export const apiRoot = path.resolve(import.meta.dirname, '../..');

const sourceRoot = path.join(apiRoot, 'app');

/** `apps/libs`, home of the API server libraries. */
const librariesRoot = path.resolve(apiRoot, '../libs');

const apiLibrarySpecifier = /^@taucad\/(api-[a-z0-9-]+)(\/.+)?$/u;

type PackageMaps = {
  readonly root: string;
  readonly imports: Readonly<Record<string, unknown>>;
  readonly exports: Readonly<Record<string, unknown>>;
};

const packageMaps = new Map<string, PackageMaps>();

const readPackageMaps = (root: string): PackageMaps => {
  let maps = packageMaps.get(root);
  if (maps === undefined) {
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      imports?: Record<string, unknown>;
      exports?: Record<string, unknown>;
    };
    maps = { root, imports: manifest.imports ?? {}, exports: manifest.exports ?? {} };
    packageMaps.set(root, maps);
  }
  return maps;
};

/** The package a source file belongs to: an API server library, or the app. */
const owningPackage = (file: string): PackageMaps => {
  const relative = path.relative(librariesRoot, file);
  const [library] = relative.split(path.sep);
  return library !== undefined && !relative.startsWith('..') && library.startsWith('api-')
    ? readPackageMaps(path.join(librariesRoot, library))
    : readPackageMaps(apiRoot);
};

/** Node's subpath pattern match: an exact key, else the longest matching `*` key. */
const matchSubpath = (map: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const exact = map[key];
  if (typeof exact === 'string') {
    return exact;
  }
  const patterns = Object.keys(map)
    .filter((pattern) => {
      const [prefix, suffix, ...rest] = pattern.split('*');
      return (
        rest.length === 0 &&
        suffix !== undefined &&
        prefix !== undefined &&
        key.startsWith(prefix) &&
        key.endsWith(suffix) &&
        key.length >= prefix.length + suffix.length
      );
    })
    .toSorted((a, b) => b.length - a.length);
  const pattern = patterns[0];
  const target = pattern === undefined ? undefined : map[pattern];
  if (pattern === undefined || typeof target !== 'string') {
    return undefined;
  }
  const [prefix = '', suffix = ''] = pattern.split('*');
  return target.replace('*', key.slice(prefix.length, key.length - suffix.length));
};

const specifierPattern =
  /(?:^|[\s;}])(?:import|export)\s+(?!type[\s{])(?:[^'"`;]*?\sfrom\s+)?['"]([^'"\n]+)['"]|import\(\s*['"]([^'"\n]+)['"]\s*\)/gmu;

export type ModuleGraph = {
  /** Source files reached, as paths relative to `apps/api` (e.g. `app/main.ts`). */
  readonly modules: ReadonlySet<string>;
  /** Bare specifiers imported by any reached module, Node built-ins included (`node:http`). */
  readonly packages: ReadonlySet<string>;
  /** For each reached module, the module that first imported it, for failure messages. */
  readonly importedBy: ReadonlyMap<string, string>;
};

const resolveLocal = (fromFile: string, specifier: string): string | undefined => {
  let base: string;
  const library = apiLibrarySpecifier.exec(specifier);
  if (specifier.startsWith('#')) {
    // The owning package.json imports ("#*" -> "./app/*" or "./src/*"); the
    // candidates below map a `.js` specifier to its `.ts` or `.tsx` source.
    const owner = owningPackage(fromFile);
    const plain = owner.imports['#*'];
    const target =
      typeof plain === 'string' ? plain.replace('*', specifier.slice(1)) : matchSubpath(owner.imports, specifier);
    if (target === undefined) {
      return undefined;
    }
    base = path.join(owner.root, target);
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else if (library?.[1] !== undefined && existsSync(path.join(librariesRoot, library[1], 'package.json'))) {
    const owner = readPackageMaps(path.join(librariesRoot, library[1]));
    const target = matchSubpath(owner.exports, `.${library[2] ?? ''}`);
    if (target === undefined) {
      return undefined;
    }
    base = path.join(owner.root, target);
  } else {
    return undefined;
  }

  const candidates = [
    base.replace(/\.js$/u, '.ts'),
    base.replace(/\.js$/u, '.tsx'),
    base,
    `${base}.ts`,
    path.join(base, 'index.ts'),
  ];
  return candidates.find((candidate) => existsSync(candidate) && !candidate.endsWith(path.sep));
};

/** Package name of a bare specifier: `@scope/name/sub` -> `@scope/name`, `node:fs/promises` kept whole. */
const packageName = (specifier: string): string => {
  if (specifier.startsWith('node:')) {
    return specifier;
  }
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
};

/** Every specifier one source file imports at run time. */
export const runtimeSpecifiers = (source: string): string[] =>
  [...source.matchAll(specifierPattern)].map((match) => match[1] ?? match[2] ?? '').filter(Boolean);

/**
 * Walks the graph from one or more entry files.
 *
 * @param entries - Paths relative to `apps/api`, such as `app/maintenance-command.ts`.
 * @returns The reached modules and packages.
 */
export const moduleGraph = (...entries: string[]): ModuleGraph => moduleGraphExcept(new Set(), ...entries);

/**
 * {@link moduleGraph} that does not enter the given modules: what the entries
 * reach when those modules are cut out, so a test can hold everything but one
 * deliberate edge to a rule.
 *
 * @param excluded - Modules (relative to `apps/api`) the walk does not enter.
 * @param entries - Entry files relative to `apps/api`.
 * @returns The graph without the excluded modules and what only they reach.
 */
export const moduleGraphExcept = (excluded: ReadonlySet<string>, ...entries: string[]): ModuleGraph => {
  const modules = new Set<string>();
  const packages = new Set<string>();
  const importedBy = new Map<string, string>();
  const pending = entries.map((entry) => path.join(apiRoot, entry));

  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    const relative = path.relative(apiRoot, file);
    if (modules.has(relative) || excluded.has(relative)) {
      continue;
    }
    modules.add(relative);

    for (const specifier of runtimeSpecifiers(readFileSync(file, 'utf8'))) {
      const local = resolveLocal(file, specifier);
      if (local === undefined) {
        if (!specifier.startsWith('#') && !specifier.startsWith('.')) {
          packages.add(packageName(specifier));
        }
        continue;
      }
      const localRelative = path.relative(apiRoot, local);
      if (!importedBy.has(localRelative)) {
        importedBy.set(localRelative, relative);
      }
      pending.push(local);
    }
  }

  return { modules, packages, importedBy };
};

/** The import chain from an entry to `module`, for a readable failure. */
export const importChain = (graph: ModuleGraph, module: string): string => {
  const chain = [module];
  for (let parent = graph.importedBy.get(module); parent !== undefined; parent = graph.importedBy.get(parent)) {
    if (chain.includes(parent)) {
      break;
    }
    chain.unshift(parent);
  }
  return chain.join(' -> ');
};

const isSource = (name: string): boolean =>
  /\.tsx?$/u.test(name) && !/\.(?:test|spec|test-d)\.tsx?$/u.test(name) && !name.endsWith('.d.ts');

/**
 * Every non-test TypeScript source file of the API: under `apps/api/app` and
 * under each API server library's `src`, relative to `apps/api`.
 */
export const sourceFiles = (): string[] => [
  ...readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })
    .filter((name) => isSource(name))
    .map((name) => path.join('app', name)),
  ...readdirSync(librariesRoot)
    .filter((library) => library.startsWith('api-') && existsSync(path.join(librariesRoot, library, 'src')))
    .toSorted()
    .flatMap((library) =>
      readdirSync(path.join(librariesRoot, library, 'src'), { recursive: true, encoding: 'utf8' })
        .filter((name) => isSource(name))
        .map((name) => path.relative(apiRoot, path.join(librariesRoot, library, 'src', name))),
    ),
];
