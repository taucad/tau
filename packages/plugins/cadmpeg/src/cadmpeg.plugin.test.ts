import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { plugin, cadmpeg } from '#index.js';

describe('@taucad/cadmpeg', () => {
  it('binds the mechanical plugin alias to the package-named factory', () => {
    expect(cadmpeg).toBe(plugin);
  });

  it('exports the named plugin', async () => {
    const { plugin: importedPlugin } = await import('#index.js');
    expect(importedPlugin).toBe(plugin);
    const { capabilities } = plugin();
    expect(capabilities.kernels.map(({ id }) => id)).toEqual(['cadmpeg']);
    expect(capabilities.middleware.map(({ id }) => id)).toEqual([]);
    expect(capabilities.bundlers.map(({ id }) => id)).toEqual([]);
    expect(capabilities.transcoders.map(({ id }) => id)).toEqual([]);
    expect(capabilities.jobs.map(({ id }) => id)).toEqual([]);
    expect(capabilities.machines.map(({ id }) => id)).toEqual([]);
  });

  it('adds the native writers only when export is selected', () => {
    expect(plugin({ preset: 'export' }).capabilities.transcoders.map(({ id }) => id)).toEqual(['cadmpeg']);
    expect(plugin({ preset: 'all' }).capabilities.kernels.map(({ id }) => id)).toEqual(['cadmpeg']);
    expect(plugin({ preset: 'all' }).capabilities.transcoders.map(({ id }) => id)).toEqual(['cadmpeg']);
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

  it('imports cadmpeg-ts only through its engine-free entry, digests and formats', () => {
    // The bare `cadmpeg-ts` entry and `cadmpeg-ts/wasm/*` name all 13 engines, so a bundler would
    // emit every one of them into each app that registers this plugin (engine delivery charter D16).
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const allowed = new Set(['cadmpeg-ts/core', 'cadmpeg-ts/digests', 'cadmpeg-ts/formats']);
    const specifiers = readdirSync(sourceDirectory, { encoding: 'utf8', recursive: true })
      .filter((name) => name.endsWith('.ts'))
      .flatMap((name) =>
        [
          ...readFileSync(join(sourceDirectory, name), 'utf8').matchAll(
            /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*|resolve\s*\(\s*)["'](cadmpeg-ts(?:\/[^"']*)?)["']/g,
          ),
        ].map((match) => ({ name, specifier: match[1]! })),
      );

    expect(specifiers.length).toBeGreaterThan(0);
    expect(
      specifiers
        .filter(
          ({ name, specifier }) =>
            !allowed.has(specifier) && !(name.endsWith('.test.ts') && specifier === 'cadmpeg-ts/package.json'),
        )
        .map(({ name, specifier }) => `${name}: ${specifier}`),
    ).toEqual([]);
  });
});
