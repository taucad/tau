/**
 * Geometry cache across the document lifecycle an agent and a slider drive.
 *
 * Counts model runs, tessellations, snapshot restores and store writes through the public client,
 * the in-process transport and the real `geometryCache` middleware: an agent opens, renders and
 * closes a document per tool call; a slider sends transient frames and then commits.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import type { statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { defineKernel } from '@taucad/runtime';
import { geometryCache } from '#geometry-cache.middleware.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<{ statfs: typeof statfs }>();
  return {
    ...actual,
    statfs: async (...arguments_: Parameters<typeof actual.statfs>) => {
      const stats = await actual.statfs(...arguments_);
      if (typeof arguments_[0] !== 'string' || !basename(arguments_[0]).startsWith('tau-geometry-lifecycle-')) {
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

type Handle = { readonly origin: 'built' | 'restored'; readonly size: number };

type Counters = {
  builds: number;
  renders: number;
  snapshots: number;
  restores: number;
  renderedFrom: Array<Handle['origin']>;
};

const createCounters = (): Counters => ({ builds: 0, renders: 0, snapshots: 0, restores: 0, renderedFrom: [] });

const encoder = new TextEncoder();
/** Parameter description shared by both probe kernels; each `describe` adds `success`. */
const probeDescription = () => ({
  data: {
    parameters: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:taucad:lifecycle-probe',
        $uses: ['JSONSchemaUnits'],
        name: 'LifecycleProbeParameters',
        type: 'object',
        properties: { size: { type: 'double' } },
      },
      defaults: { size: 1 },
    },
  },
  issues: [],
});

const createKernel = (counters: Counters) =>
  defineKernel({
    id: 'lifecycle-probe',
    name: 'Lifecycle probe',
    version: '1.0.0',
    extensions: ['probe'],
    views: {
      model: {
        title: 'Model',
        mimeType: 'model/gltf-binary',
        optionsSchema: z.object({ detail: z.number().default(1) }),
      },
    },
    exports: {
      step: { title: 'STEP', mimeType: 'application/step', extension: 'step', optionsSchema: z.object({}) },
    },
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe() {
      return { success: true, ...probeDescription() };
    },
    async evaluate({ parameters }) {
      counters.builds++;
      const size = typeof parameters['size'] === 'number' ? parameters['size'] : 1;
      const handle: Handle = { origin: 'built', size };
      return { handle, views: ['model'], exports: ['step'], issues: [] };
    },
    async render({ handle, options }) {
      counters.renders++;
      counters.renderedFrom.push(handle.origin);
      return { content: encoder.encode(`size=${String(handle.size)};detail=${String(options.detail)}`) };
    },
    serializeHandle({ handle }) {
      counters.snapshots++;
      return { size: handle.size };
    },
    deserializeHandle({ serialized }): Handle {
      counters.restores++;
      return { origin: 'restored', size: z.object({ size: z.number() }).parse(serialized).size };
    },
    async export({ handle }) {
      return {
        files: [{ name: 'model.step', mimeType: 'application/step', bytes: encoder.encode(String(handle.size)) }],
      };
    },
  })();

/** A kernel with no snapshot serializer, like build123d, smlibpy, openrscad and zoo. */
const createUnserializableKernel = (counters: Counters) =>
  defineKernel({
    id: 'lifecycle-probe',
    name: 'Lifecycle probe without snapshots',
    version: '1.0.0',
    extensions: ['probe'],
    views: {
      model: {
        title: 'Model',
        mimeType: 'model/gltf-binary',
        optionsSchema: z.object({ detail: z.number().default(1) }),
      },
    },
    exports: {},
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe() {
      return { success: true, ...probeDescription() };
    },
    async evaluate() {
      counters.builds++;
      return { handle: { size: 1 }, views: ['model'], exports: [], issues: [] };
    },
    async render({ handle }) {
      counters.renders++;
      return { content: encoder.encode(`size=${String(handle.size)};detail=1`) };
    },
  })();

const decoder = new TextDecoder();
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- clients and stores close in reverse creation order.
    await cleanup();
  }
});

type Compute = Parameters<typeof inProcessTransport>[0]['compute'];

const createClient = (
  kernel: ReturnType<typeof createKernel> | ReturnType<typeof createUnserializableKernel>,
  compute: Compute,
) => {
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime: defineRuntime({ kernels: [kernel], middleware: [geometryCache()] }),
      fileSystem: fromMemoryFs(),
      compute,
    }),
  });
  cleanups.push(async () => client.shutdown());
  return client;
};

/** A durable SQLite store whose engine counts every `put` a session commits. */
const createCountingStore = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-geometry-lifecycle-'));
  const store = createSqliteComputeEngine({ directory });
  const puts: number[] = [];
  const gets: number[] = [];
  const engine: typeof store.engine = {
    ...store.engine,
    open: async (input) => {
      const session = await store.engine.open(input);
      return {
        ...session,
        get generation() {
          return session.generation;
        },
        get: async (request) => {
          gets.push(request.digests.length);
          return session.get(request);
        },
        put: async (request) => {
          puts.push(request.entries.length);
          return session.put(request);
        },
      };
    },
  };
  cleanups.push(async () => {
    await store.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    gets,
    puts,
    compute: { mode: 'durable', store: fromSqlite({ store: { ...store, engine }, workspace: '/lifecycle' }) } as const,
  };
};

const source = { entry: 'main.probe', files: { 'main.probe': 'unchanged' } } as const;

/** One agent tool call: open unwatched, render one view, close. */
const agentCall = async (client: ReturnType<typeof createClient>, detail = 1): Promise<string> => {
  const document = client.open({ source, watch: false });
  const view = document.view('model', { options: { detail } });
  try {
    const rendered = await view.rendering();
    if (rendered.superseded || !rendered.rendering.success) {
      throw new Error(`Expected a rendering: ${JSON.stringify(rendered)}`);
    }
    const { content } = rendered.rendering.artifact;
    return typeof content === 'string' ? content : decoder.decode(content);
  } finally {
    view.close();
    document.close();
  }
};

describe('geometry cache across the document lifecycle', () => {
  describe('agent open, render, close per call', () => {
    it('should run the model once across nine back-to-back calls on one unchanged build', async () => {
      const counters = createCounters();
      const client = createClient(createKernel(counters), { mode: 'memory' });
      const outputs: string[] = [];
      for (let call = 0; call < 9; call++) {
        // oxlint-disable-next-line no-await-in-loop -- an agent's tool calls are sequential.
        outputs.push(await agentCall(client));
      }
      expect(new Set(outputs)).toEqual(new Set(['size=1;detail=1']));
      expect(counters.builds).toBe(1);
      expect(counters.renders).toBe(1);
    });

    it('should keep compute off as it was: each call builds and meshes again', async () => {
      const counters = createCounters();
      const client = createClient(createKernel(counters), { mode: 'off' });
      for (let call = 0; call < 3; call++) {
        // oxlint-disable-next-line no-await-in-loop -- an agent's tool calls are sequential.
        expect(await agentCall(client)).toBe('size=1;detail=1');
      }
      expect(counters.builds).toBe(3);
      expect(counters.renders).toBe(3);
    });

    it('should run the model once and tessellate once per view content when calls alternate views', async () => {
      const counters = createCounters();
      const client = createClient(createKernel(counters), { mode: 'memory' });
      const outputs: string[] = [];
      for (let call = 0; call < 9; call++) {
        // oxlint-disable-next-line no-await-in-loop -- an agent's tool calls are sequential.
        outputs.push(await agentCall(client, (call % 3) + 1));
      }
      expect(outputs.slice(0, 3)).toEqual(['size=1;detail=1', 'size=1;detail=2', 'size=1;detail=3']);
      expect(outputs.slice(3)).toEqual([...outputs.slice(0, 3), ...outputs.slice(0, 3)]);
      expect(counters.builds).toBe(1);
      expect(counters.renders).toBe(3);
    });

    it('should mesh a new view of a held build from the live handle, not a restored snapshot', async () => {
      const counters = createCounters();
      const client = createClient(createKernel(counters), { mode: 'memory' });
      await agentCall(client, 1);
      // Let the build publish, so the next call's build lookup would hit the store.
      await vi.waitFor(() => {
        expect(counters.snapshots).toBe(1);
      });
      expect(await agentCall(client, 2)).toBe('size=1;detail=2');
      expect(counters.builds).toBe(1);
      expect(counters.restores).toBe(0);
      expect(counters.renderedFrom).toEqual(['built', 'built']);
    });

    it('should hold a closed build until its publication settles when the next call builds something else', async () => {
      const counters = createCounters();
      const client = createClient(createKernel(counters), { mode: 'memory' });
      const call = async (size: number): Promise<string> => {
        const document = client.open({ source, watch: false, parameters: { size } });
        const view = document.view('model', { options: { detail: 1 } });
        try {
          const rendered = await view.rendering();
          if (rendered.superseded || !rendered.rendering.success) {
            throw new Error('Expected a rendering');
          }
          const { content } = rendered.rendering.artifact;
          return typeof content === 'string' ? content : decoder.decode(content);
        } finally {
          view.close();
          document.close();
        }
      };
      expect(await call(1)).toBe('size=1;detail=1');
      expect(await call(2)).toBe('size=2;detail=1');
      expect(await call(1)).toBe('size=1;detail=1');
      expect(counters.builds).toBe(2);
      expect(counters.renders).toBe(2);
    });

    it('should keep the stored build reusable after the worker that published it is gone', async () => {
      const counters = createCounters();
      const durable = await createCountingStore();
      const first = createClient(createKernel(counters), durable.compute);
      expect(await agentCall(first, 1)).toBe('size=1;detail=1');
      await first.shutdown();
      const second = createClient(createKernel(counters), durable.compute);
      expect(await agentCall(second, 1)).toBe('size=1;detail=1');
      expect(await agentCall(second, 2)).toBe('size=1;detail=2');
      expect(counters.builds).toBe(1);
      expect(counters.restores).toBe(1);
      expect(counters.renderedFrom).toEqual(['built', 'restored']);
    });
  });

  describe('kernels that cannot store a build', () => {
    it('should not attempt a build publication when the kernel defines no snapshot serializer', async () => {
      const counters = createCounters();
      const durable = await createCountingStore();
      const client = createClient(createUnserializableKernel(counters), durable.compute);
      expect(await agentCall(client, 1)).toBe('size=1;detail=1');
      await client.shutdown();
      // Only the mesh is looked up and stored: a build entry could never be encoded.
      expect({ gets: durable.gets.length, puts: durable.puts.length }).toEqual({ gets: 1, puts: 1 });
    });
  });

  describe('slider frames', () => {
    it('should write nothing to the store for transient frames and publish the committed state once', async () => {
      const counters = createCounters();
      const durable = await createCountingStore();
      const client = createClient(createKernel(counters), durable.compute);
      const document = client.open({ source, watch: false });
      const view = document.view('model', { options: { detail: 1 } });
      const rendered = await view.rendering();
      expect(rendered.superseded).toBe(false);
      // The opening build and its mesh publish once the worker is idle.
      await vi.waitFor(() => {
        expect(durable.puts).toHaveLength(2);
      });
      for (const size of [2, 3, 4]) {
        // oxlint-disable-next-line no-await-in-loop -- each frame rests long enough to have published before.
        const frame = await document.update({ transient: true, parameters: { size } });
        expect(frame.superseded).toBe(false);
        // oxlint-disable-next-line no-await-in-loop -- the frame's mesh is rendered before the next one.
        await vi.waitFor(() => {
          expect(counters.renders).toBe(size);
        });
        // oxlint-disable-next-line no-await-in-loop -- a rested frame would publish within this window.
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
      }
      expect(durable.puts).toHaveLength(2);
      const committed = await document.update({ parameters: { size: 4 } });
      expect(committed.superseded).toBe(false);
      await vi.waitFor(() => {
        expect(durable.puts).toHaveLength(4);
      });
      expect(counters.builds).toBe(4);
      expect(counters.renders).toBe(4);
      view.close();
      document.close();
      await client.shutdown();
      expect(durable.puts).toHaveLength(4);

      // The committed state is what a later session finds: no model run, no tessellation.
      const reopened = createClient(createKernel(counters), durable.compute);
      const later = reopened.open({ source, watch: false, parameters: { size: 4 } });
      const laterView = later.view('model', { options: { detail: 1 } });
      const revisit = await laterView.rendering();
      if (revisit.superseded || !revisit.rendering.success) {
        throw new Error('Expected the committed state from the store');
      }
      expect(counters.builds).toBe(4);
      expect(counters.renders).toBe(4);
      laterView.close();
      later.close();
    });
  });
});
