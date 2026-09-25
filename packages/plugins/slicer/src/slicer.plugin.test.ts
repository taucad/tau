import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { plugin, slicer } from '#index.js';

describe('@taucad/slicer', () => {
  it('binds the mechanical plugin alias to the package-named factory', () => {
    expect(slicer).toBe(plugin);
  });

  it('exports the named plugin', async () => {
    const { plugin: importedPlugin } = await import('#index.js');
    expect(importedPlugin).toBe(plugin);
    const { capabilities } = plugin();
    expect(capabilities.kernels.map(({ id }) => id)).toEqual([]);
    expect(capabilities.middleware.map(({ id }) => id)).toEqual([]);
    expect(capabilities.bundlers.map(({ id }) => id)).toEqual([]);
    expect(capabilities.transcoders.map(({ id }) => id)).toEqual(['slicer']);
    expect(capabilities.jobs.map(({ id }) => id)).toEqual([]);
    expect(capabilities.machines.map(({ id }) => id)).toEqual([]);
  });

  it('keeps native, Python, and Node-only payloads out of browser source', () => {
    // The Bambu Studio engine, reached only through the `node` condition of `#bambu-studio/engine.js`
    // and `./bambu-studio`; browsers resolve `engine.stub.ts`, which this scan still covers.
    const nodeConditionOnly = new Set(
      ['catalog.ts', 'installation.ts', 'slice.ts'].map((name) => join('bambu-studio', name)),
    );
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
      .filter((name) => name.endsWith('.ts') && !name.includes('.test') && !nodeConditionOnly.has(name))
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

  it('should resolve the Bambu Studio engine under the node condition and a refusing stub otherwise', async () => {
    const manifest = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
    ) as Record<'exports' | 'imports', Record<string, unknown>> & {
      publishConfig: Record<'exports' | 'imports', Record<string, unknown>>;
    };
    const source = { node: './src/bambu-studio/engine.ts', default: './src/bambu-studio/engine.stub.ts' };
    const published = { node: './dist/bambu-studio/engine.mjs', default: './dist/bambu-studio/engine.stub.mjs' };
    expect(manifest.exports['./bambu-studio']).toMatchObject(source);
    expect(manifest.imports['#bambu-studio/engine.js']).toMatchObject(source);
    expect(manifest.publishConfig.exports['./bambu-studio']).toMatchObject(published);
    expect(manifest.publishConfig.imports['#bambu-studio/engine.js']).toMatchObject(published);

    const stub = await import('#bambu-studio/engine.stub.js');
    await expect(stub.findBambuStudio()).resolves.toBeUndefined();
    await Promise.all(
      [stub.loadBambuStudioCatalog, stub.describeBambuStudioSettings, stub.sliceWithBambuStudio].map(async (refused) =>
        expect(refused()).rejects.toMatchObject({
          name: 'BambuStudioError',
          code: 'BAMBU_STUDIO_UNAVAILABLE',
          message: 'Slicing with Bambu Studio needs the Tau desktop app with Bambu Studio installed.',
        }),
      ),
    );
  });
});
