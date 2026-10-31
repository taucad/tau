import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { createRuntimeClient, fromMemoryFs } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest } from './protocol.mts';
import { defineRuntime } from '@taucad/runtime/worker';
import { defineKernel } from '@taucad/runtime/kernel';
import { makeFixture } from './fixture.mts';

// App-local fixture kernel exercises the actual host, dependency resolver, RuntimeClient and geometry delivery.
// Existing product kernels can feed publishGeometry without changes; this is not a new product kernel.
export const createFixtureRuntime = async () => {
  let computations = 0;
  const cacheSources: string[] = [];
  const stateDirectory = await mkdtemp(join(tmpdir(), 'tau-renderer-store-'));
  const store = createSqliteComputeEngine({
    directory: stateDirectory,
    logicalQuota: 67108864,
    maxEntryBytes: 67108864,
    reserveBytes: 0,
  });
  const kernel = defineKernel({
    id: 'native-spike',
    name: 'Native renderer witness',
    version: '1.0.0',
    extensions: ['json'],
    exportFormats: {},
    async initialize() {
      return {};
    },
    async getDependencies({ entryPath }, runtime) {
      const content = await runtime.filesystem.readFile(entryPath, 'utf8');
      const source = JSON.parse(content);
      if (source.part !== 'part.glb') throw new Error('Only the fixture dependency is admitted');
      return { resolved: [entryPath, source.part], unresolved: [] };
    },
    async getParameters() {
      return {
        success: true as const,
        data: {
          schema: {
            $schema: 'https://json-structure.org/meta/extended/v0/#',
            $id: 'urn:taucad:native-spike',
            $uses: ['JSONSchemaUnits'],
            name: 'SpikeParameters',
            type: 'object' as const,
          },
          defaults: {},
        },
        issues: [],
      };
    },
    async createGeometry(_input, runtime) {
      const bytes = await runtime.filesystem.readFile('part.glb');
      if (runtime.compute.status !== 'on') throw new Error('Host compute binding missing');
      const evaluated = await runtime.compute.evaluate({
        action: {
          schemaVersion: 1,
          namespace: 'tau.native-renderer-spike',
          producer: { id: 'fixture-admission', version: '1', implementationAssets: [] },
          operation: 'admit',
          inputs: [],
          arguments: { sha256: digest(bytes) },
          environment: null,
          codec: { id: 'glb', version: '1' },
        },
        codec: {
          id: 'glb',
          version: '1',
          mediaType: 'model/gltf-binary',
          encode: ({ value }) => value,
          decode: ({ bytes }) => bytes,
        },
        policy: 'best-effort',
        compute: async () => {
          computations++;
          return bytes;
        },
      });
      cacheSources.push(evaluated.source);
      return { geometry: { format: 'gltf' as const, content: evaluated.value }, nativeHandle: {} };
    },
    async exportGeometry() {
      return { success: true as const, data: [], issues: [] };
    },
  });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime: defineRuntime({ kernels: [kernel()] }),
      fileSystem: fromMemoryFs(),
      compute: { mode: 'durable', store: fromSqlite({ store, workspace: 'native-renderer-fixture' }) },
    }),
  });
  const close = async () => {
    client.terminate();
    await store.dispose();
    await rm(stateDirectory, { recursive: true, force: true });
  };
  const files = { 'main.json': JSON.stringify({ part: 'part.glb' }), 'part.glb': new Uint8Array(makeFixture(32)) };
  const started = performance.now();
  const result = await client.render({ source: { files, entry: 'main.json' } });
  if (result.superseded || !result.geometry.success) {
    await close();
    throw new Error(JSON.stringify(result));
  }
  const coldMs = performance.now() - started;
  const warm = performance.now();
  const repeated = await client.render({ source: { path: 'main.json' } });
  if (repeated.superseded || !repeated.geometry.success) {
    await close();
    throw new Error('Runtime repeat failed');
  }
  return {
    client,
    close,
    async renderVariant(side: number) {
      const updated = await client.render({
        source: { entry: 'main.json', files: { ...files, 'part.glb': new Uint8Array(makeFixture(side)) } },
      });
      if (updated.superseded || !updated.geometry.success) throw new Error('Variant render failed');
      return updated.geometry.data;
    },
    geometry: result.geometry.data,
    metrics: { coldMs, warmMs: performance.now() - warm, computations, cacheSources },
    computations: () => computations,
  };
};
