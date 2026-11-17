/**
 * T06: an operation's observed `worker.reuse` is the compute cache's real answer. The geometry cache middleware runs
 * over a real runtime client and worker with a memory compute store; nothing about the cache is mocked. A first export
 * is a miss and observes `computed`; once that result is published, the same export is a hit and observes `cache`;
 * an export the store has never seen is a miss again; and with compute off the observation says `off`.
 */
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { defineKernel, createKernelSuccess, nonemptyExportFiles } from '@taucad/runtime/kernel';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import type { RuntimeOperationObservation, TelemetryEntry } from '@taucad/runtime/types';
import { defineRuntime } from '@taucad/runtime/worker';
import { geometryCache } from '#geometry-cache.middleware.js';

const source = { files: { 'model.part': 'part' } };

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:reuse',
    $uses: ['JSONSchemaUnits'],
    name: 'ReuseParameters',
    type: 'object',
    properties: { width: { type: 'double', ucumUnit: 'mm' } },
    required: ['width'],
  },
  defaults: { width: 10 },
} as const;

/**
 * A runtime with one kernel and the geometry cache middleware, behind an in-process client.
 *
 * @param compute - The worker's compute mode.
 * @returns The client and how many times the kernel exported.
 */
const createClient = (compute: 'memory' | 'off') => {
  const exported = vi.fn();
  const kernel = defineKernel({
    id: 'reuse-kernel',
    extensions: ['part'] as const,
    name: 'Reuse kernel',
    version: '1.0.0',
    views: { primary: { title: 'Primary', mimeType: 'image/svg+xml' } },
    exports: {
      bom: { title: 'BOM', mimeType: 'text/csv', extension: 'csv' },
      list: { title: 'List', mimeType: 'text/plain', extension: 'txt' },
    },
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe() {
      return createKernelSuccess({ parameters });
    },
    async evaluate() {
      return { handle: {}, views: ['primary'] as const, exports: ['bom', 'list'] as const };
    },
    async render() {
      return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
    },
    async export({ exportId }) {
      exported(exportId);
      return {
        files: nonemptyExportFiles([
          { name: `model.${exportId}`, mimeType: 'text/plain', bytes: new TextEncoder().encode(`${exportId}:a,b`) },
        ]),
      };
    },
  })();
  const runtime = defineRuntime({ kernels: [kernel], middleware: [geometryCache()] });
  const client = createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({}), compute: { mode: compute } }),
  });
  const seen: RuntimeOperationObservation[] = [];
  const entries: TelemetryEntry[] = [];
  client.on('operation', (observation) => seen.push(observation));
  client.on('telemetry', (batch) => entries.push(...batch.entries));
  client.observe('facts');
  return { client, exported, seen, entries };
};

/**
 * The joined observation of the export whose result arrived `index`-th.
 *
 * @param seen - Every observation so far.
 * @param index - Which export, from zero.
 * @returns The observation, once its facts joined.
 */
const joinedExport = async (seen: readonly RuntimeOperationObservation[], index: number) =>
  vi.waitFor(() => {
    const observation = seen.filter(({ operation }) => operation === 'export')[index];
    expect(observation?.facts).toBe('joined');
    return observation!;
  });

/**
 * Wait until the compute store has published `count` results, so a repeated action can hit.
 *
 * @param entries - The spans the client received.
 * @param count - Stored publications to wait for.
 */
const published = async (entries: readonly TelemetryEntry[], count: number): Promise<void> =>
  vi.waitFor(() => {
    expect(
      entries.filter(({ name, detail }) => name === 'kernel.compute.publication' && detail?.['status'] === 'stored')
        .length,
    ).toBeGreaterThanOrEqual(count);
  });

describe('T06: the observed reuse is the compute cache outcome', () => {
  it("should observe a miss as 'computed' and the same export served from the store as 'cache'", async () => {
    const { client, exported, seen, entries } = createClient('memory');
    const document = client.open({ source, watch: false });
    try {
      const first = await document.export('bom');
      expect(first.success ? [] : first.issues).toEqual([]);
      expect(exported).toHaveBeenCalledTimes(1);
      const miss = await joinedExport(seen, 0);
      expect(miss).toMatchObject({ outcome: { type: 'succeeded' }, worker: { reuse: 'computed' } });

      await published(entries, 1);
      const second = await document.export('bom');
      expect(second.success).toBe(true);
      // A hit: the kernel did not export again, and the bytes are the stored ones.
      expect(exported).toHaveBeenCalledTimes(1);
      expect(second.success && second.files.map(({ bytes }) => new TextDecoder().decode(bytes))).toEqual(['bom:a,b']);
      const hit = await joinedExport(seen, 1);
      expect(hit).toMatchObject({ outcome: { type: 'succeeded' }, worker: { reuse: 'cache' } });

      // An action the store has not seen misses again, whatever the earlier hit.
      const third = await document.export('list');
      expect(third.success).toBe(true);
      expect(exported).toHaveBeenCalledTimes(2);
      const nextMiss = await joinedExport(seen, 2);
      expect(nextMiss).toMatchObject({ outcome: { type: 'succeeded' }, worker: { reuse: 'computed' } });
    } finally {
      document.close();
      await client.shutdown();
    }
  });

  it("should observe 'off' when the worker's compute reuse is off, and compute every time", async () => {
    const { client, exported, seen } = createClient('off');
    const document = client.open({ source, watch: false });
    try {
      await document.export('bom');
      await document.export('bom');
      expect(exported).toHaveBeenCalledTimes(2);
      const first = await joinedExport(seen, 0);
      const second = await joinedExport(seen, 1);
      expect([first.worker?.reuse, second.worker?.reuse]).toEqual(['off', 'off']);
    } finally {
      document.close();
      await client.shutdown();
    }
  });
});
