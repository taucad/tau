import { mkdtemp, rm } from 'node:fs/promises';
import type { statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { defineKernel } from '@taucad/runtime';
import { asKnownArtifact } from '@taucad/runtime/types';
import { geometryCache } from '#geometry-cache.middleware.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<{ statfs: typeof statfs }>();
  return {
    ...actual,
    statfs: async (...arguments_: Parameters<typeof actual.statfs>) => {
      const stats = await actual.statfs(...arguments_);
      if (typeof arguments_[0] !== 'string' || !basename(arguments_[0]).startsWith('tau-geometry-reopen-')) {
        return stats;
      }
      if (typeof stats.bsize === 'bigint') {
        return { ...stats, bavail: (8n * 1024n ** 3n) / stats.bsize, blocks: (16n * 1024n ** 3n) / stats.bsize };
      }
      return {
        ...stats,
        bavail: Math.floor((8 * 1024 ** 3) / stats.bsize),
        blocks: Math.floor((16 * 1024 ** 3) / stats.bsize),
      };
    },
  };
});

describe('geometry cache with durable SQLite', () => {
  it('should reuse geometry after reopening, invalidate a changed dependency, and restore a cached native handle for export', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-geometry-reopen-'));
    let builds = 0;
    let restores = 0;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const kernel = defineKernel({
      id: 'cache-reopen',
      name: 'Cache reopen fixture',
      version: '1.0.0',
      extensions: ['probe'],
      views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
      exports: {
        step: { title: 'STEP', mimeType: 'application/step', extension: 'step', optionsSchema: z.object({}) },
      },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath, 'helper.txt'], unresolved: [] };
      },
      async describe() {
        return {
          success: true,
          data: {
            parameters: {
              schema: {
                $schema: 'https://json-structure.org/meta/extended/v0/#',
                $id: 'urn:taucad:cache-reopen',
                $uses: ['JSONSchemaUnits'],
                name: 'CacheReopenParameters',
                type: 'object',
              },
              defaults: {},
            },
          },
          issues: [],
        };
      },
      async evaluate(_input, services) {
        builds++;
        const source = await services.filesystem.readFile('helper.txt', 'utf8');
        return {
          handle: { source },
          views: ['model'],
          exports: ['step'],
          issues: [],
        };
      },
      async render({ handle }) {
        return { content: encoder.encode(handle.source) };
      },
      serializeHandle({ handle }) {
        return handle;
      },
      deserializeHandle({ serialized }) {
        restores++;
        return serialized;
      },
      async export({ handle }) {
        return {
          files: [{ name: 'shape.step', mimeType: 'application/step', bytes: encoder.encode(handle.source) }],
        };
      },
    })();
    const runtime = defineRuntime({ kernels: [kernel], middleware: [geometryCache()] });
    const render = async (helper: string, exportStep = false) => {
      const store = createSqliteComputeEngine({ directory });
      const compute = { mode: 'durable', store: fromSqlite({ store, workspace: '/project/reopen' }) } as const;
      const client = createRuntimeClient({
        transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs(), compute }),
      });
      const document = client.open({
        source: { entry: 'main.probe', files: { 'main.probe': 'unchanged entry', 'helper.txt': helper } },
        watch: false,
      });
      const view = document.view('model');
      try {
        const result = await view.rendering();
        expect(result.superseded).toBe(false);
        if (result.superseded || !result.rendering.success) {
          throw new Error('Expected display geometry');
        }
        const artifact = asKnownArtifact(result.rendering.artifact);
        if (artifact?.mimeType !== 'model/gltf-binary') {
          throw new Error('Expected GLB display geometry');
        }
        const geometry = decoder.decode(artifact.content);
        let exported: string | undefined;
        if (exportStep) {
          const result = await document.export('step');
          expect(result.success).toBe(true);
          if (!result.success) {
            throw new Error('Expected STEP export');
          }
          exported = decoder.decode(result.files[0].bytes);
        }
        return { geometry, exported };
      } finally {
        view.close();
        document.close();
        await client.shutdown();
        await store.dispose();
      }
    };

    try {
      expect(await render('shape-a')).toEqual({ geometry: 'shape-a', exported: undefined });
      expect(builds).toBe(1);
      expect(await render('shape-a', true)).toEqual({ geometry: 'shape-a', exported: 'shape-a' });
      expect(builds).toBe(1);
      expect(restores).toBe(1);
      expect(await render('shape-b', true)).toEqual({ geometry: 'shape-b', exported: 'shape-b' });
      expect(builds).toBe(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
