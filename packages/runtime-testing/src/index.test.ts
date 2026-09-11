import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { defineRuntime } from '@taucad/runtime/worker';
import { contentDigest, digestAction } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import type { ResidentCacheBinding, ResidentExportEntry } from '@taucad/runtime/kernel';

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

    await expect(filesystem.readFile('main.ts', 'utf8')).resolves.toBe('fixture');
    await expect(filesystem.readFile('main.ts')).resolves.toEqual(new TextEncoder().encode('fixture'));
    await expect(filesystem.readdir('')).resolves.toEqual(['main.ts']);
  });

  it('reuses a published action across two scopes through the resident binding', async () => {
    const runtime = entry.createMockKernelRuntime();
    const computeAction: ComputeAction = {
      schemaVersion: 1,
      namespace: 'test',
      producer: {
        id: 'fixture',
        version: '1',
        implementationAssets: [contentDigest({ value: `sha256:${'1'.repeat(64)}` })],
      },
      operation: 'box',
      inputs: [],
      arguments: { size: 10 },
      environment: {},
      codec: { id: 'bytes', version: '1' },
    };
    const digest = await digestAction({ action: computeAction });
    if (runtime.compute.status !== 'on') {
      throw new Error('The mock kernel runtime binds compute on.');
    }
    const createResident = (native: Map<ActionDigest, Uint8Array<ArrayBuffer>>): ResidentCacheBinding => ({
      contains: ({ digest: key }) => native.has(key),
      importEntries: async ({ entries }) => {
        for (const cached of entries) {
          native.set(cached.actionDigest, new Uint8Array(cached.bytes));
        }
        return { imported: entries.map((cached) => cached.actionDigest), omitted: [] };
      },
      exportEntries: async ({ digests }) => ({
        entries: digests.flatMap((key) => {
          const bytes = native.get(key);
          const exported: ResidentExportEntry = {
            action: computeAction,
            bytes: bytes ?? new Uint8Array(),
            mediaType: 'test/bytes',
            determinism: 'byte-exact',
          };
          return bytes ? [exported] : [];
        }),
        omitted: [],
      }),
      stats: () => ({
        entries: native.size,
        logicalBytes: 0,
        encodedBytes: { status: 'unsupported' },
        evictions: 0,
        omissions: 0,
      }),
      clear: () => {
        native.clear();
      },
    });

    const producerNative = new Map<ActionDigest, Uint8Array<ArrayBuffer>>([[digest, new Uint8Array([1, 2, 3])]]);
    const producer = runtime.compute.openScope({
      namespace: 'test',
      producer: computeAction.producer,
      environment: {},
      resident: createResident(producerNative),
    });
    expect(
      producer.announce({
        entries: [{ kind: 'action', action: computeAction, digest, computeDuration: 40, estimatedBytes: 3 }],
      }),
    ).toMatchObject({
      admitted: [digest],
    });
    await expect(producer.close({ outcome: 'delivered' }).settled).resolves.toMatchObject({
      status: 'published',
      published: [digest],
    });

    const consumerNative = new Map<ActionDigest, Uint8Array<ArrayBuffer>>();
    const consumer = runtime.compute.openScope({
      namespace: 'test',
      producer: computeAction.producer,
      environment: {},
      resident: createResident(consumerNative),
    });
    await expect(consumer.warm({ digests: [digest] })).resolves.toMatchObject({ imported: [digest] });
    expect(consumerNative.get(digest)).toStrictEqual(new Uint8Array([1, 2, 3]));
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
              specifier.includes('_internal') ||
              specifier.includes('test/support') ||
              specifier.includes('-native') ||
              specifier.includes('-python'),
          )
          .map((specifier) => `${name}: ${specifier}`);
      });

    expect(offenders).toEqual([]);
  });
});
