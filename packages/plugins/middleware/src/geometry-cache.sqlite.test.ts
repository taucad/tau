import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
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
import { Document, NodeIO } from '@gltf-transform/core';
import { gltfEdgeDetection } from '#gltf-edge-detection.middleware.js';

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
  it('persists one shared GLB leaf for native build and display, and a distinct edge leaf when requested', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-geometry-parts-'));
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(buffer);
    const indices = document
      .createAccessor()
      .setType('SCALAR')
      .setArray(new Uint16Array([0, 1, 2]))
      .setBuffer(buffer);
    const material = document.createMaterial('Authored copper').setBaseColorFactor([0.7, 0.3, 0.1, 1]);
    const mesh = document
      .createMesh('Authored surface')
      .addPrimitive(
        document.createPrimitive().setAttribute('POSITION', positions).setIndices(indices).setMaterial(material),
      );
    document.createScene().addChild(document.createNode('Authored occurrence').setMesh(mesh));
    const glb = await new NodeIO().writeBinary(document);
    let builds = 0;
    let snapshots = 0;
    const kernel = defineKernel({
      id: 'shared-parts',
      name: 'Shared parts fixture',
      version: '1.0.0',
      extensions: ['probe'],
      views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
      exports: { glb: { title: 'GLB', mimeType: 'model/gltf-binary', extension: 'glb', optionsSchema: z.object({}) } },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return {
          success: true,
          data: {
            parameters: {
              schema: {
                $schema: 'https://json-structure.org/meta/extended/v0/#',
                $id: 'urn:taucad:shared-parts',
                $uses: ['JSONSchemaUnits'],
                name: 'SharedPartsParameters',
                type: 'object',
              },
              defaults: {},
            },
          },
          issues: [],
        };
      },
      async evaluate() {
        builds++;
        return { handle: { glb, label: 'Authored assembly' }, views: ['model'], exports: ['glb'], issues: [] };
      },
      async render({ handle }) {
        return { content: handle.glb };
      },
      serializeHandle({ handle }) {
        snapshots++;
        return handle;
      },
      deserializeHandle({ serialized }) {
        return z.object({ glb: z.instanceof(Uint8Array), label: z.string() }).parse(serialized);
      },
      async export({ handle }) {
        return { files: [{ name: 'authored.glb', mimeType: 'model/gltf-binary', bytes: handle.glb }] };
      },
    })();
    const render = async (edges: boolean) => {
      const store = createSqliteComputeEngine({ directory });
      const runtime = defineRuntime({
        kernels: [kernel],
        middleware: [geometryCache(), gltfEdgeDetection()],
      });
      const client = createRuntimeClient({
        transport: inProcessTransport({
          runtime,
          fileSystem: fromMemoryFs(),
          compute: { mode: 'durable', store: fromSqlite({ store, workspace: '/shared-parts' }) },
        }),
      });
      const opened = client.open({
        source: { entry: 'main.probe', files: { 'main.probe': 'unchanged' } },
        watch: false,
      });
      const view = opened.view('model', { content: { includeEdges: edges } });
      try {
        const rendered = await view.rendering();
        if (rendered.superseded || !rendered.rendering.success) {
          throw new Error(`Expected shared display: ${JSON.stringify(rendered)}`);
        }
        const artifact = asKnownArtifact(rendered.rendering.artifact);
        if (artifact?.mimeType !== 'model/gltf-binary') {
          throw new Error('Expected GLB');
        }
        const exported = await opened.export('glb', { content: { includeEdges: edges } });
        if (!exported.success) {
          throw new Error('Expected GLB export');
        }
        return { bytes: artifact.content, exported: exported.files[0] };
      } finally {
        view.close();
        opened.close();
        await client.shutdown();
        await store.dispose();
      }
    };
    const readPayloads = async () => {
      const files = await readdir(directory);
      const file = files.find((name) => name.endsWith('.sqlite'));
      if (!file) {
        throw new Error('Expected persisted SQLite store');
      }
      const db = new DatabaseSync(join(directory, file), { readOnly: true });
      try {
        return z
          .array(z.object({ bytes: z.instanceof(Uint8Array), byteLength: z.number() }))
          .parse(db.prepare('SELECT bytes, byte_length AS byteLength FROM content').all());
      } finally {
        db.close();
      }
    };
    try {
      const cold = await render(false);
      const warm = await render(false);
      expect(cold).toEqual(warm);
      expect(cold.bytes).toEqual(glb);
      expect(cold.exported.name).toBe('authored.glb');
      expect(builds).toBe(1);
      expect(snapshots).toBe(1);
      const payloads = await readPayloads();
      expect(payloads.filter((row) => Buffer.from(row.bytes).equals(glb))).toHaveLength(1);
      const roots = payloads.filter((row) => !Buffer.from(row.bytes).equals(glb));
      // Export codec remains self-contained; exclude its separately measured payload from build/display accounting.
      const metadata = roots.filter((row) => !Buffer.from(row.bytes).includes(Buffer.from(glb)));
      expect(metadata.reduce((sum, row) => sum + row.byteLength, 0)).toBeLessThan(glb.byteLength);
      const edgeCold = await render(true);
      const edgeWarm = await render(true);
      expect(edgeCold).toEqual(edgeWarm);
      expect(edgeCold.bytes).not.toEqual(glb);
      expect(builds).toBe(1);
      expect(snapshots).toBe(1);
      const withEdges = await readPayloads();
      expect(withEdges.filter((row) => Buffer.from(row.bytes).equals(glb))).toHaveLength(1);
      expect(withEdges.filter((row) => Buffer.from(row.bytes).equals(edgeCold.bytes))).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
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
