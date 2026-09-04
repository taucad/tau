import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    return stat.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });

describe('@taucad/filesystem import boundary', () => {
  it('should not import rpc, runtime, fs-bridge, or app code', () => {
    const files = sourceFiles(new URL('.', import.meta.url).pathname);
    const forbidden = /from ['"](?:@taucad\/rpc|@taucad\/runtime|@taucad\/fs-bridge|apps\/)/u;

    const offenders = files.filter((file) => forbidden.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });
});

const sourceDirectory = new URL('.', import.meta.url).pathname;

/** Resolve one `#…` or relative specifier to its source file, or `undefined` when external. */
const resolveLocal = (specifier: string, from: string): string | undefined => {
  const relative = specifier.startsWith('#')
    ? join(sourceDirectory, specifier.slice(1))
    : specifier.startsWith('.')
      ? join(from, '..', specifier)
      : undefined;
  if (relative === undefined) {
    return undefined;
  }
  const base = relative.replace(/\.js$/u, '');
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Try the next spelling.
    }
  }
  return undefined;
};

/** Every specifier reachable from `entry` through local imports, plus the externals hit. */
const reachableSpecifiers = (entry: string): { files: string[]; externals: Set<string> } => {
  const seen = new Set<string>();
  const externals = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/gu)) {
      const specifier = match[1]!;
      const local = resolveLocal(specifier, file);
      if (local === undefined) {
        externals.add(specifier);
      } else {
        queue.push(local);
      }
    }
  }
  return { files: [...seen], externals };
};

describe('@taucad/filesystem node backend containment', () => {
  it('keeps node builtins out of everything the browser barrel reaches', () => {
    const { externals } = reachableSpecifiers(join(sourceDirectory, 'backend/index.ts'));

    expect([...externals].filter((specifier) => specifier.startsWith('node:'))).toEqual([]);
  });

  it('proves the walk would see a node builtin — the node subpath does import them', () => {
    const { externals } = reachableSpecifiers(join(sourceDirectory, 'backend/node/index.ts'));

    expect([...externals].filter((specifier) => specifier.startsWith('node:')).sort()).toEqual([
      'node:crypto',
      'node:fs',
      'node:fs/promises',
      'node:path',
    ]);
  });
});
