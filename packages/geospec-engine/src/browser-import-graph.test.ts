import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The bundling contract for the host-neutral entry.
 *
 * A browser bundler resolves the entire graph reachable from
 * `@taucad/geospec-engine/register`, so a Node builtin anywhere in that graph
 * ships to the browser. `@taucad/vite`'s `browserNodeBuiltins` plugin shims a
 * deliberate few — their functions throw a named error only if a browser path
 * actually calls them, which keeps a Node-only branch honest without breaking
 * the bundle. Every other builtin falls through to the bundler's own handling:
 * a dev-time proxy that throws on property access (so `import { x } from
 * 'node:crypto'` dies at module scope) and a production stub of `{}` (so the
 * binding is silently `undefined`).
 *
 * Neither disposition is survivable inside a worker, and neither is visible to
 * a runtime assertion — the sibling browser e2e drives real matchers and passes
 * while the UI's GeoSpec worker is dead. So the guard is static: walk the real
 * graph and assert it imports nothing the browser shim does not cover.
 */

const sourceRoot = new URL('./', import.meta.url);
const packageRoot = new URL('../', import.meta.url);

/** Exactly what `browserNodeBuiltins` substitutes — keep in step with `runtime-vite-plugins.ts`. */
const shimmedBuiltins = new Set(['fs', 'node:fs', 'node:fs/promises', 'node:url']);

/**
 * Value imports only. `import type` is erased before a bundler ever sees it, so
 * a type-only edge into a Node module is not a browser edge — `pool.ts` naming
 * `ShardTimings` must not implicate `cache/timings.ts`.
 */
const importSpecifiers = (source: string): string[] => [
  ...[...source.matchAll(/(?:^|[\s);}])(import|export)(?!\s+type\b)[^"';`]*?from\s*["'`]([^"'`]+)["'`]/g)].map(
    (match) => match[2]!,
  ),
  ...[...source.matchAll(/(?:^|[\s);}]])import\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]!),
  ...[...source.matchAll(/\bimport\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((match) => match[1]!),
];

/**
 * Resolve one specifier to a file on disk, mirroring the package's `imports`
 * map under the `browser` condition. Returns undefined for bare packages —
 * their own graphs are their own contract.
 */
const resolveLocal = (specifier: string, fromPath: string): string | undefined => {
  const candidate = specifier.startsWith('#cache/node-evidence-store.js')
    ? fileURLToPath(new URL('src/cache/browser-evidence-store.ts', packageRoot))
    : specifier.startsWith('#')
      ? fileURLToPath(new URL(`src/${specifier.slice(1).replace(/\.js$/, '.ts')}`, packageRoot))
      : specifier.startsWith('.')
        ? resolve(dirname(fromPath), specifier.replace(/\.js$/, '.ts'))
        : undefined;

  if (candidate === undefined) {
    return undefined;
  }

  for (const path of [candidate, candidate.replace(/\.ts$/, '/index.ts')]) {
    try {
      readFileSync(path, 'utf8');
      return path;
    } catch {
      continue;
    }
  }

  return undefined;
};

const walkNeutralGraph = (): Map<string, string[]> => {
  const entry = fileURLToPath(new URL('register.ts', sourceRoot));
  const seen = new Set<string>();
  const offenders = new Map<string, string[]>();
  const queue = [entry];

  while (queue.length > 0) {
    const path = queue.pop()!;
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);

    const specifiers = importSpecifiers(readFileSync(path, 'utf8'));
    const builtins = specifiers.filter(
      (specifier) => (specifier.startsWith('node:') || specifier === 'fs') && !shimmedBuiltins.has(specifier),
    );
    if (builtins.length > 0) {
      offenders.set(relative(fileURLToPath(packageRoot), path), [...new Set(builtins)].sort());
    }

    for (const specifier of specifiers) {
      const next = resolveLocal(specifier, path);
      if (next !== undefined) {
        queue.push(next);
      }
    }
  }

  return offenders;
};

describe('browser import graph', () => {
  it('reaches no unshimmed Node builtin from the host-neutral register', () => {
    expect(Object.fromEntries(walkNeutralGraph())).toEqual({});
  });

  it('walks a graph large enough to be meaningful', () => {
    // A resolver regression that silently resolved nothing would make the guard
    // above vacuously green.
    const entry = fileURLToPath(new URL('register.ts', sourceRoot));
    const reached = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const path = queue.pop()!;
      if (reached.has(path)) {
        continue;
      }
      reached.add(path);
      for (const specifier of importSpecifiers(readFileSync(path, 'utf8'))) {
        const next = resolveLocal(specifier, path);
        if (next !== undefined) {
          queue.push(next);
        }
      }
    }

    expect(reached.size).toBeGreaterThanOrEqual(50);
  });
});
