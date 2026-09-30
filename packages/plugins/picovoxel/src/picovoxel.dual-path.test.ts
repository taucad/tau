import { beforeEach, describe, expect, it, vi } from 'vitest';
import { esbuild } from '@taucad/esbuild';
import { geometryCache } from '@taucad/middleware';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import type { CreatePicoOptions, CreatePicoRuntimeOptions } from 'picovoxel';
import type * as PicovoxelModule from 'picovoxel';

import { picovoxel } from '#index.js';

const sessions = vi.hoisted(() => ({ lanes: [] as Array<CreatePicoOptions['lane']> }));

vi.mock('picovoxel', async (importOriginal) => {
  const actual = await importOriginal<typeof PicovoxelModule>();
  return {
    ...actual,
    async createPicoRuntime(options?: CreatePicoRuntimeOptions) {
      const runtime = await actual.createPicoRuntime(options);
      const createSession = runtime.createPico.bind(runtime);
      return Object.assign(runtime, {
        async createPico(sessionOptions?: CreatePicoOptions) {
          sessions.lanes.push(sessionOptions?.lane);
          return createSession(sessionOptions);
        },
      });
    },
  };
});

// An offset makes the lanes differ: fast runs it through fastRenorm (Class 2), exact never does.
const model = `
import type { Pico, Voxels } from 'picovoxel';
export const defaultParams = { voxelSize: 1 };
export default function main(pico: Pico): Voxels {
  return pico.createVoxels({ shape: 'sphere', radius: 4 }).offset({ distance: 0.6 });
}
`;

const header = (bytes: Uint8Array<ArrayBuffer>): string => new TextDecoder().decode(bytes.subarray(0, 80)).trimEnd();

const createClient = () =>
  createTestRuntimeClient({
    // Serial for the fast lane too: the counts below are about builds, not artifacts.
    runtime: defineRuntime({ plugins: [picovoxel({ kernels: { default: { wasm: 'serial' } } }), esbuild()] }),
    files: { 'main.ts': model },
  });

type Client = ReturnType<typeof createClient>;
const documents = new WeakMap<Client, ReturnType<Client['open']>>();
const lanes = new WeakMap<Client, 'fast' | 'exact'>();
const documentFor = (client: Client) => {
  let document = documents.get(client);
  if (!document) {
    document = client.open({ source: { path: 'main.ts' }, watch: false });
    documents.set(client, document);
    lanes.set(client, 'fast');
  }
  return document;
};

const render = async (client: Client, lane?: 'fast' | 'exact') => {
  const document = documentFor(client);
  const requestedLane = lane ?? 'fast';
  if (lanes.get(client) !== requestedLane) {
    const updated = await document.update({ evaluateOptions: { lane: requestedLane } });
    if (updated.superseded || !updated.evaluation.success) {
      throw new Error('PicoVoxel evaluation failed');
    }
    lanes.set(client, requestedLane);
  }
  const view = document.view('model', { content: { includeEdges: true } });
  const outcome = await view.rendering();
  view.close();
  if (outcome.superseded || !outcome.rendering.success) {
    throw new Error('PicoVoxel render failed');
  }
  return outcome.rendering;
};

const exportStl = async (client: Client, exportOptions?: { lane: 'fast' | 'exact' }) => {
  const result = await documentFor(client).export('stl', exportOptions ? { options: exportOptions } : {});
  if (!result.success) {
    throw new Error(result.issues.map(({ message }) => message).join('; '));
  }
  return result.files[0].bytes;
};

beforeEach(() => {
  sessions.lanes.length = 0;
});

describe('PicoVoxel dual path through the runtime', () => {
  it('should render the viewer in the fast lane and retain one exact replay for exports', async () => {
    const client = createClient();
    try {
      await render(client);
      const exact = await exportStl(client);
      const again = await exportStl(client);

      // The worker retains the exact evaluation for matching later exports.
      expect(sessions.lanes).toEqual(['fast', 'exact']);
      expect(header(exact)).toBe('PicoGK UNITS=mm');
      expect(again).toEqual(exact);
    } finally {
      await client.shutdown();
    }
  }, 120_000);

  it('should replay once for any number of exports in a host with the geometry cache (DP4)', async () => {
    // The UI and desktop compose `geometryCache()`, which keys the replayed exact build like any
    // other, so the second export after a fast render is a cache hit: 2 builds, not 3.
    const client = createTestRuntimeClient({
      runtime: defineRuntime({
        plugins: [picovoxel({ kernels: { default: { wasm: 'serial' } } }), esbuild()],
        middleware: [geometryCache()],
      }),
      files: { 'main.ts': model },
    });
    try {
      await render(client);
      const exact = await exportStl(client);
      const again = await exportStl(client);

      expect(sessions.lanes).toEqual(['fast', 'exact']);
      expect(again).toEqual(exact);
    } finally {
      await client.shutdown();
    }
  }, 120_000);

  it('should export an exact viewer render without another build', async () => {
    const client = createClient();
    try {
      await render(client, 'exact');
      await exportStl(client);

      expect(sessions.lanes).toEqual(['exact']);
    } finally {
      await client.shutdown();
    }
  }, 120_000);

  it('should key the lane: the two lanes build different geometry', async () => {
    const client = createClient();
    try {
      const fast = await render(client);
      const exact = await render(client, 'exact');

      expect(sessions.lanes).toEqual(['fast', 'exact']);
      expect(fast.artifact).not.toEqual(exact.artifact);
    } finally {
      await client.shutdown();
    }
  }, 120_000);

  it('should serve a repeated lane from the geometry cache and keep the two lanes apart (DP2)', async () => {
    const client = createTestRuntimeClient({
      runtime: defineRuntime({
        plugins: [picovoxel({ kernels: { default: { wasm: 'serial' } } }), esbuild()],
        middleware: [geometryCache()],
      }),
      files: { 'main.ts': model },
    });
    try {
      const fast = await render(client);
      const exact = await render(client, 'exact');
      const fastAgain = await render(client);
      const exactAgain = await render(client, 'exact');

      expect(sessions.lanes).toEqual(['fast', 'exact']);
      expect([fastAgain.artifact, exactAgain.artifact]).toEqual([fast.artifact, exact.artifact]);
    } finally {
      await client.shutdown();
    }
  }, 120_000);

  it('should stamp an explicitly fast STL export of the fast viewer build without replaying', async () => {
    const client = createClient();
    try {
      await render(client);
      const fast = await exportStl(client, { lane: 'fast' });

      expect(sessions.lanes).toEqual(['fast']);
      expect(header(fast)).toBe('PicoGK UNITS=mm LANE=fast');
    } finally {
      await client.shutdown();
    }
  }, 120_000);

  it('should build an export-only document once, in the exact lane', async () => {
    const client = createClient();
    const document = client.open({ source: { path: 'main.ts' }, evaluateOptions: { lane: 'exact' }, watch: false });
    try {
      const result = await document.export('glb');

      expect(result.success).toBe(true);
      expect(sessions.lanes).toEqual(['exact']);
    } finally {
      document.close();
      await client.shutdown();
    }
  }, 120_000);
});
