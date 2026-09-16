/**
 * A34 / AC23 substrate pin: every module under `src/` is reachable from a
 * published entrypoint, and every barrel export names a symbol some non-test
 * file imports.
 *
 * The second clause is deliberately weaker than "has a product consumer"
 * (review R5): an import inside this package counts, so a set of modules that
 * only import each other satisfies it. P65 deleted the one such island this
 * package had; the reported-only count below is what would show the next one.
 *
 * **Run it with `--skip-nx-cache`** (review R8). This is the AC23 gate, and the
 * `revisions` test target's Nx inputs do not include `apps/**` or the other
 * packages — a consumer deleted anywhere else does not invalidate the cached
 * result, so a cached green here proves nothing. Nothing in `project.json`
 * changes: widening the inputs to the workspace would make every `revisions`
 * test run cache-miss on any edit anywhere.
 *
 * ponytail: a regex over `import`/`export ... from` lines, not the TypeScript
 * compiler API — the smallest thing that fails when a module is orphaned or an
 * export loses its last importer. It reads text, so an import clause written
 * inside a comment or a JSDoc `@example` counts as an import (review R6); the
 * retired-identifier ESLint pin is the AST-accurate half, and a stale example
 * that keeps a name alive here is caught there instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceRoot = path.join(packageRoot, 'src');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const skippedDirectories = new Set(['node_modules', 'dist', 'out', 'out-tsc', '.nx', 'coverage']);
const sourceExtensions = new Set(['.ts', '.tsx', '.mjs']);
const bindingPattern = /(?:import|export)\s+(?:type\s+)?{([^}]*)}\s*from\s*["']([^"']+)["']/g;

const walk = (directory: string): string[] => {
  const entries: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        entries.push(...walk(full));
      }
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      entries.push(full);
    }
  }
  return entries;
};

const isTestFile = (file: string): boolean =>
  /\.(?:test|test-d|conformance\.test|integration\.test)\.tsx?$/.test(file) ||
  file.startsWith(`${path.join(sourceRoot, 'test')}${path.sep}`);

/** `{ a, type B, c as d }` → the names the *source* module exports. */
const bindingsOf = (clause: string): string[] =>
  clause
    .split(',')
    .map(
      (binding) =>
        binding
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          ?.trim() ?? '',
    )
    .filter((name) => name.length > 0);

const readBindings = (file: string): Array<{ names: string[]; specifier: string }> => {
  const text = readFileSync(file, 'utf8');
  const found: Array<{ names: string[]; specifier: string }> = [];
  for (const match of text.matchAll(bindingPattern)) {
    found.push({ names: bindingsOf(match[1] ?? ''), specifier: match[2] ?? '' });
  }
  return found;
};

/** Resolve the package's own specifiers (`#name.js` import map, or relative). */
const resolveInternal = (specifier: string, fromFile: string): string | undefined => {
  const asTs = specifier.replace(/\.js$/, '.ts');
  if (asTs.startsWith('#')) {
    return path.join(sourceRoot, asTs.slice(1));
  }
  if (asTs.startsWith('.')) {
    return path.resolve(path.dirname(fromFile), asTs);
  }
  return undefined;
};

const modules = walk(sourceRoot).filter((file) => !isTestFile(file) && file.endsWith('.ts'));
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, string>;
};
const entrypoints = Object.values(manifest.exports)
  .filter((target) => target.endsWith('.ts'))
  .map((target) => path.resolve(packageRoot, target));
const barrels = [path.join(sourceRoot, 'index.ts'), path.join(sourceRoot, 'node', 'index.ts')];

describe('packages/revisions import graph', () => {
  it('reaches every module from a published entrypoint', () => {
    const reached = new Set<string>();
    const queue = [...entrypoints];
    while (queue.length > 0) {
      const file = queue.pop();
      if (file === undefined || reached.has(file)) {
        continue;
      }
      reached.add(file);
      for (const { specifier } of readBindings(file)) {
        const target = resolveInternal(specifier, file);
        if (target !== undefined) {
          queue.push(target);
        }
      }
    }

    const orphans = modules.filter((file) => !reached.has(file)).map((file) => path.relative(packageRoot, file));
    expect(orphans, 'modules unreachable from a package entrypoint (A34)').toEqual([]);
  });

  it('gives every barrel export an importer that is not a test', () => {
    const exported = new Set(barrels.flatMap((barrel) => readBindings(barrel).flatMap(({ names }) => names)));

    const consumed = new Set<string>();
    const consumedOutside = new Set<string>();
    const scanned = ['apps', 'packages', 'libs']
      .flatMap((directory) => walk(path.join(workspaceRoot, directory)))
      .filter((file) => !barrels.includes(file))
      .filter((file) => !(file.startsWith(`${sourceRoot}${path.sep}`) && isTestFile(file)));
    for (const file of scanned) {
      const insidePackage = file.startsWith(`${sourceRoot}${path.sep}`);
      const reaches = (specifier: string): boolean =>
        insidePackage ? resolveInternal(specifier, file) !== undefined : specifier.startsWith('@taucad/revisions');
      for (const { names } of readBindings(file).filter((binding) => reaches(binding.specifier))) {
        for (const name of names) {
          consumed.add(name);
          if (!insidePackage) {
            consumedOutside.add(name);
          }
        }
      }
    }

    const orphaned = [...exported].filter((name) => !consumed.has(name)).sort();
    expect(orphaned, 'barrel exports no non-test file imports anywhere (AC23)').toEqual([]);

    /* Reported, not asserted: an export only this package imports is not a
     * defect by itself — `RevisionPort` is imported by every adapter here and by
     * hosts — but a *rising* count is where the next dead island starts. */
    const insideOnly = [...exported].filter((name) => !consumedOutside.has(name));
    console.info(
      `[import-graph] ${String(insideOnly.length)} of ${String(exported.size)} barrel exports have no importer outside packages/revisions.`,
    );
    /* One read of every source file in `apps`, `packages` and `libs`: seconds
     * on a warm cache, longer beside other suites. The budget is the scan's,
     * not a timing contract. */
  }, 120_000);
});
