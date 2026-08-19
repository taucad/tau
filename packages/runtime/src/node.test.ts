/* eslint-disable @typescript-eslint/naming-convention -- file map keys are filesystem paths, not symbols */
import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeClient } from '#node.js';
import { extractGltfFromExportResult } from '#testing/kernel-geometry-testing.utils.js';

describe('createNodeClient', () => {
  it('should return a client with the command surface', async () => {
    const client = await createNodeClient();

    expect(client.render).toBeTypeOf('function');
    expect(client.updateParameters).toBeTypeOf('function');
    expect(client.setOptions).toBeTypeOf('function');
    expect(client.setRenderTimeout).toBeTypeOf('function');
    expect(client.export).toBeTypeOf('function');
    expect(client.terminate).toBeTypeOf('function');
    expect(client.on).toBeTypeOf('function');
    expect(client.connect).toBeTypeOf('function');

    client.terminate();
  });

  it('should accept a project path for filesystem-backed rendering', async () => {
    const client = await createNodeClient('/tmp');

    expect(client.render).toBeTypeOf('function');

    client.terminate();
  });

  // `createNodeClient()` with no projectPath must return an inert client;
  // an eager handshake here would flip lifecycleState to 'connected'.
  it('returns a lazily-connected client when no projectPath is given', async () => {
    const client = await createNodeClient();

    expect(client.lifecycleState).toBe('unconnected');

    client.terminate();
  });

  it('auto-connects on the first inline-code export', { timeout: 30_000 }, async () => {
    const client = await createNodeClient();

    expect(client.lifecycleState).toBe('unconnected');

    const result = await client.export('glb', {
      source: {
        files: {
          'main.ts': `
            import { makeBaseBox } from 'replicad';
            export default function main() {
              return makeBaseBox(10, 20, 30);
            }
          `,
        },
      },
    });

    expect(client.lifecycleState).toBe('connected');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(extractGltfFromExportResult(result)).toBeInstanceOf(Uint8Array);
      expect(result.data[0]?.mimeType).toBe('model/gltf-binary');
    }

    client.terminate();
  });

  it('should export direct OpenCascade source through the Node client', { timeout: 60_000 }, async () => {
    const client = await createNodeClient();

    const result = await client.export('glb', {
      source: {
        files: {
          'main.ts': `
            import { BRepPrimAPI_MakeBox } from 'libcascade';

            export default function main() {
              return new BRepPrimAPI_MakeBox(10, 20, 30).Shape();
            }
          `,
        },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(extractGltfFromExportResult(result)?.byteLength).toBeGreaterThan(0);
      expect(result.data[0]?.mimeType).toBe('model/gltf-binary');
    }

    client.terminate();
  });

  it('settles repeated identical exports', { timeout: 10_000 }, async () => {
    const client = await createNodeClient();
    const input = {
      source: {
        files: {
          'main.ts': `
            import { makeBaseBox } from 'replicad';
            export default function main() {
              return makeBaseBox(10, 20, 30);
            }
          `,
        },
      },
    };

    const withSettlementLimit = async <T>(promise: Promise<T>): Promise<T> => {
      let settlementTimer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<never>((resolve, reject) => {
        void resolve;
        settlementTimer = setTimeout(() => {
          reject(new Error('Repeated identical export did not settle'));
        }, 2000);
      });

      try {
        return await Promise.race([promise, limit]);
      } finally {
        if (settlementTimer) {
          clearTimeout(settlementTimer);
        }
      }
    };

    const first = await withSettlementLimit(client.export('glb', input));
    const second = await withSettlementLimit(client.export('glb', input));

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);

    client.terminate();
  });

  // A filesystem-backed export subscribes `fs.watch` handles through the inline
  // node-fs adapter; `terminate()` must release them or the host process never
  // exits (`taucad export` hung after writing its artifact).
  it('releases fs.watch handles on terminate for a path-backed client', { timeout: 30_000 }, async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'taucad-node-client-'));
    await writeFile(
      join(projectDirectory, 'main.ts'),
      "import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(10, 20, 30);\n",
    );
    const client = await createNodeClient(projectDirectory);

    const result = await client.export('glb', { source: { path: 'main.ts' } });
    expect(result.success).toBe(true);
    expect(process.getActiveResourcesInfo()).toContain('FSEventWrap');

    client.terminate();

    // `FSWatcher.close()` releases the libuv handle asynchronously.
    await vi.waitFor(() => {
      expect(process.getActiveResourcesInfo()).not.toContain('FSEventWrap');
    });
  });
});
