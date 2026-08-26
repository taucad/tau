import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { defineRuntime } from '@taucad/runtime/worker';

import * as entry from '#index.js';

describe('@taucad/runtime-testing', () => {
  it('has a lightweight non-plugin root', () => {
    expect(entry).not.toHaveProperty('plugin');
  });

  it('normalizes relative fixture paths before materializing the memory filesystem', async () => {
    const client = entry.createTestRuntimeClient({
      runtime: defineRuntime({}),
      files: { 'main.ts': 'export default null;' },
    });

    await client.shutdown();
  });

  it('preserves the kernel filesystem text and byte read overloads', async () => {
    const filesystem = entry.createMockFileSystem({ readFileResult: 'fixture', readdirResult: ['main.ts'] });

    await expect(filesystem.readFile('/main.ts', 'utf8')).resolves.toBe('fixture');
    await expect(filesystem.readFile('/main.ts')).resolves.toEqual(new TextEncoder().encode('fixture'));
    await expect(filesystem.readdir('/')).resolves.toEqual(['main.ts']);
  });

  it('keeps private runtime and host-only payloads out of browser source', () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
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
              specifier.includes('/_internal') ||
              specifier.includes('/test/support') ||
              specifier.includes('-native') ||
              specifier.includes('-python'),
          )
          .map((specifier) => `${name}: ${specifier}`);
      });

    expect(offenders).toEqual([]);
  });
});
