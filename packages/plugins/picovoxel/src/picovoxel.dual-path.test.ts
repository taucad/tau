import { beforeEach, describe, expect, it, vi } from 'vitest';
import { esbuild } from '@taucad/esbuild';
import { geometryCache } from '@taucad/middleware';
import { createTestRuntimeClient, glbToDocument, readGltfNamingSummary } from '@taucad/runtime-testing';
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

const render = async (client: Client, lane?: 'fast' | 'exact') => {
  const outcome = await client.render({
    source: { path: 'main.ts' },
    content: { includeEdges: true },
    ...(lane ? { renderOptions: { lane } } : {}),
  });
  if (outcome.superseded || !outcome.geometry.success) {
    throw new Error('PicoVoxel render failed');
  }
  return outcome.geometry;
};

const exportStl = async (client: Client, exportOptions?: { lane: 'fast' | 'exact' }) => {
  const result = await client.export('stl', exportOptions ? { exportOptions } : undefined);
  if (!result.success) {
    throw new Error(result.issues.map(({ message }) => message).join('; '));
  }
  return result.data[0]!.bytes;
};

beforeEach(() => {
  sessions.lanes.length = 0;
});

describe('PicoVoxel dual path through the runtime', () => {
  it.each(['fast', 'exact'] as const)(
    'should retain names through cached %s delivery without changing booleans, clones or offsets',
    async (lane) => {
      const source = (named: boolean) => `
      import type { Pico } from 'picovoxel';
      import type { PicovoxelResult } from '@taucad/picovoxel';
      export const defaultParams = { voxelSize: 1 };
      export default function main(pico: Pico): PicovoxelResult {
        const sphere = pico.createVoxels({ shape: 'sphere', radius: 4 });
        const bore = pico.createVoxels({ shape: 'sphere', center: [3, 0, 0], radius: 2 });
        const shape = sphere.subtract(bore).clone().offset({ distance: 0.6 });
        return ${named ? "[{ shape, name: '蓋 / Mesh' }, { shape: shape.toMesh(), name: '蓋 / Mesh' }]" : '[shape, shape.toMesh()]'};
      }
    `;
      const client = createTestRuntimeClient({
        runtime: defineRuntime({
          plugins: [picovoxel({ kernels: { default: { wasm: 'serial' } } }), esbuild()],
          middleware: [geometryCache()],
        }),
      });
      const attributes = async (bytes: Uint8Array<ArrayBuffer>) => {
        const document = await glbToDocument(bytes);
        return document
          .getRoot()
          .listMeshes()
          .map((mesh) =>
            mesh.listPrimitives().map((primitive) => ({
              positions: primitive.getAttribute('POSITION')!.getArray(),
              min: primitive.getAttribute('POSITION')!.getMin([]),
              max: primitive.getAttribute('POSITION')!.getMax([]),
              normals: primitive.getAttribute('NORMAL')!.getArray(),
              indices: primitive.getIndices()!.getArray(),
            })),
          );
      };
      const build = async (named: boolean) => {
        const result = await client.render({
          source: { files: { 'main.ts': source(named) } },
          renderOptions: { lane },
        });
        if (result.superseded || !result.geometry.success || result.geometry.data.format !== 'gltf') {
          throw new Error('Named render failed');
        }
        return result.geometry.data.content;
      };
      try {
        const raw = await build(false);
        const named = await build(true);
        const again = await build(true);
        expect(sessions.lanes).toEqual([lane, lane]);
        expect(again).toEqual(named);
        expect(await attributes(named)).toEqual(await attributes(raw));
        const summary = await readGltfNamingSummary(again);
        expect(summary.nodeNames).toEqual(['蓋 / Mesh', '蓋 / Mesh']);
        expect(summary.meshNames).toEqual(summary.nodeNames);
        const exported = await client.export('glb');
        expect(exported.success).toBe(true);
        if (!exported.success) {
          throw new Error('Exact export failed');
        }
        const exportedNames = await readGltfNamingSummary(exported.data[0]!.bytes);
        expect(exportedNames.nodeNames).toEqual(summary.nodeNames);
      } finally {
        await client.shutdown();
      }
    },
    120_000,
  );

  it('should render the viewer in the fast lane and replay the model exactly for each export', async () => {
    const client = createClient();
    try {
      await render(client);
      const exact = await exportStl(client);
      const again = await exportStl(client);

      // DP4 in a bare runtime: the export's exact replay is request-local (never published), and
      // with no geometry cache nothing retains it, so a second export replays again. Same bytes.
      expect(sessions.lanes).toEqual(['fast', 'exact', 'exact']);
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
      expect(fast.data).not.toEqual(exact.data);
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
      expect([fastAgain.data, exactAgain.data]).toEqual([fast.data, exact.data]);
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

  it('should build a request-scoped export once, in the exact lane', async () => {
    const client = createClient();
    try {
      const result = await client.export('glb', { source: { path: 'main.ts' } });

      expect(result.success).toBe(true);
      expect(sessions.lanes).toEqual(['exact']);
    } finally {
      await client.shutdown();
    }
  }, 120_000);
});
