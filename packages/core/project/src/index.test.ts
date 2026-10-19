import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as entry from '#index.js';

describe('@taucad/project-core', () => {
  it('has a lightweight non-plugin root', () => {
    expect(entry).not.toHaveProperty('plugin');
  });

  it('keeps identity machines and XState outside the manifest root import graph', () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const visited = new Set<string>();
    const externalDependencies = new Set<string>();
    const visit = (name: string): void => {
      if (visited.has(name)) {
        return;
      }
      visited.add(name);
      const source = readFileSync(join(sourceDirectory, name), 'utf8')
        .replaceAll(/\/\*[\S\s]*?\*\//g, '')
        .replaceAll(/^\s*\/\/.*$/gm, '')
        .replaceAll(/^\s*(?:import|export)\s+type\s[^;]*;/gm, '');
      for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
        const specifier = match[1]!;
        if (specifier.startsWith('#')) {
          visit(specifier.slice(1).replace(/\.js$/, '.ts'));
        } else if (specifier.startsWith('.')) {
          visit(join(dirname(name), specifier).replace(/\.js$/, '.ts'));
        } else {
          externalDependencies.add(specifier);
        }
      }
    };
    visit('index.ts');
    expect([...externalDependencies]).toEqual(['zod']);
    expect([...visited].some((name) => name.includes('identity'))).toBe(false);
  });

  it('keeps native, Python, and Node-only payloads out of browser source', () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
    // Mirrors `nodeOnlyDependencies` in tools/pkgcheck-metadata.ts, the single source; a
    // published package must not import from `tools/`, so the list is copied, not shared.
    const nodeOnlyPackages = new Set([
      'better-sqlite3',
      'bufferutil',
      'canvas',
      'fs-extra',
      'node-fetch',
      'node-gyp-build',
      'sharp',
      'utf-8-validate',
      'ws',
    ]);
    const offenders = readdirSync(sourceDirectory, { encoding: 'utf8', recursive: true })
      .filter((name) => name.endsWith('.ts') && !name.includes('.test'))
      .flatMap((name) => {
        // Comments are prose, not payload: a doc comment naming `import('ws')` is not an import.
        // `import type` is erased before the bundle exists, so it is not payload either.
        const source = readFileSync(join(sourceDirectory, name), 'utf8')
          .replaceAll(/\/\*[\S\s]*?\*\//g, '')
          .replaceAll(/^\s*\/\/.*$/gm, '')
          .replaceAll(/^\s*(?:import|export)\s+type\s[^;]*;/gm, '');

        return [...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)]
          .map((match) => match[1]!)
          .filter(
            (specifier) =>
              nodeBuiltins.has(specifier) ||
              nodeOnlyPackages.has(specifier) ||
              specifier.includes('-native') ||
              specifier.includes('-python'),
          )
          .map((specifier) => `${name}: ${specifier}`);
      });

    expect(offenders).toEqual([]);
  });
});
