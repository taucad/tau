import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * A static, over-approximating module graph of the API's own source, for tests
 * that prove what an entry point can and cannot reach (DC4).
 *
 * It reads `import`, `export … from` and `import('…')` specifiers with string
 * literals, follows the package's `#*` subpath imports and relative paths, and
 * records every bare specifier as a package without descending into it.
 * `import type` and `export type` are skipped because they are erased before
 * run time. Anything a regular expression mistakes for an import makes the
 * graph larger, never smaller, which is the safe direction for a test that
 * asserts something is *not* reachable.
 */

/** `apps/api`, the root the `#*` imports and every path below are relative to. */
export const apiRoot = path.resolve(import.meta.dirname, '../..');

const sourceRoot = path.join(apiRoot, 'app');

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
  if (specifier.startsWith('#')) {
    // The package.json imports: "#*.js" -> "./app/*.ts", "#*" -> "./app/*"
    base = path.join(sourceRoot, specifier.slice(1));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
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
export const moduleGraph = (...entries: string[]): ModuleGraph => {
  const modules = new Set<string>();
  const packages = new Set<string>();
  const importedBy = new Map<string, string>();
  const pending = entries.map((entry) => path.join(apiRoot, entry));

  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    const relative = path.relative(apiRoot, file);
    if (modules.has(relative)) {
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

/** Every non-test TypeScript source file under `apps/api/app`, relative to `apps/api`. */
export const sourceFiles = (): string[] =>
  readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.tsx?$/u.test(name) && !/\.(?:test|spec|test-d)\.tsx?$/u.test(name) && !name.endsWith('.d.ts'))
    .map((name) => path.join('app', name));
