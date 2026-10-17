import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { plugin, smlib } from '#index.js';
import { smlibDetectPattern } from '#smlib.constants.js';
import { smlibOptionsSchema } from '#smlib.schemas.js';

describe('@taucad/smlib', () => {
  it('binds the mechanical plugin alias to the package-named factory', () => {
    expect(smlib).toBe(plugin);
  });

  it('exports the named plugin', async () => {
    const { plugin: importedPlugin } = await import('#index.js');
    expect(importedPlugin).toBe(plugin);
    const { capabilities } = plugin();
    expect(capabilities.kernels.map(({ id }) => id)).toEqual(['smlib']);
    expect(capabilities.middleware.map(({ id }) => id)).toEqual([]);
    expect(capabilities.bundlers.map(({ id }) => id)).toEqual([]);
    expect(capabilities.transcoders.map(({ id }) => id)).toEqual([]);
    expect(capabilities.jobs.map(({ id }) => id)).toEqual([]);
    expect(capabilities.machines.map(({ id }) => id)).toEqual([]);
  });

  it('defaults library tracing off and rejects unknown modes', () => {
    expect(smlibOptionsSchema.parse({})).toEqual({ libraryTracing: 'off' });
    expect(smlibOptionsSchema.parse({ libraryTracing: 'per-call' })).toEqual({ libraryTracing: 'per-call' });
    expect(smlibOptionsSchema.safeParse({ libraryTracing: 'verbose' }).success).toBe(false);
  });

  it.each([
    [`import { Box } from '@classcad/smlibwasm';`, true],
    [`import * as smlib from "@classcad/smlibwasm";`, true],
    [`const { Box } = require('@classcad/smlibwasm');`, true],
    [`const smlib = await import('@classcad/smlibwasm');`, true],
    [`/** @typedef {import('@classcad/smlibwasm').Part} Part */`, true],
    [`import { Box } from '@classcad/smlibwasm-extra';`, false],
    [`import { makeBox } from 'replicad';`, false],
  ])('detects %s as SMLib: %s', (source, expected) => {
    expect(smlibDetectPattern.test(source)).toBe(expected);
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
