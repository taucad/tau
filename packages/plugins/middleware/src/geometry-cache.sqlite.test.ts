import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { defineKernel } from '@taucad/runtime';
import { geometryCache } from '#geometry-cache.middleware.js';

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
      exportFormats: { step: { optionsSchema: z.object({}) } },
      async initialize() {
        return {};
      },
      async getDependencies({ entryPath }) {
        return { resolved: [entryPath, 'helper.txt'], unresolved: [] };
      },
      async getParameters() {
        return {
          success: true,
          data: {
            schema: {
              $schema: 'https://json-structure.org/meta/extended/v0/#',
              $id: 'urn:taucad:cache-reopen',
              $uses: ['JSONSchemaUnits'],
              name: 'CacheReopenParameters',
              type: 'object',
            },
            defaults: {},
          },
          issues: [],
        };
      },
      async createGeometry(_input, runtime) {
        builds++;
        const source = await runtime.filesystem.readFile('helper.txt', 'utf8');
        return {
          geometry: { format: 'gltf', content: encoder.encode(source) },
          nativeHandle: { source },
          issues: [],
        };
      },
      serializeNativeHandle({ nativeHandle }) {
        return nativeHandle;
      },
      deserializeNativeHandle({ serializedNativeHandle }) {
        restores++;
        return serializedNativeHandle;
      },
      async exportGeometry({ nativeHandle }) {
        return {
          success: true,
          data: [{ name: 'shape.step', mimeType: 'application/step', bytes: encoder.encode(nativeHandle.source) }],
          issues: [],
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
      try {
        const result = await client.render({
          source: { entry: 'main.probe', files: { 'main.probe': 'unchanged entry', 'helper.txt': helper } },
        });
        expect(result.superseded).toBe(false);
        if (result.superseded || !result.geometry.success || result.geometry.data.format !== 'gltf') {
          throw new Error('Expected display geometry');
        }
        const geometry = decoder.decode(result.geometry.data.content);
        let exported: string | undefined;
        if (exportStep) {
          const result = await client.export('step');
          expect(result.success).toBe(true);
          if (!result.success) {
            throw new Error('Expected STEP export');
          }
          exported = decoder.decode(result.data[0]!.bytes);
        }
        return { geometry, exported };
      } finally {
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
