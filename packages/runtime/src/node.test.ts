/* eslint-disable @typescript-eslint/naming-convention -- file map keys are filesystem paths, not symbols */
import { describe, it, expect } from 'vitest';
import { createNodeClient } from '#node.js';

describe('createNodeClient', () => {
  it('should return a client with the v5 command surface', async () => {
    const client = await createNodeClient();

    expect(client.openFile).toBeTypeOf('function');
    expect(client.updateParameters).toBeTypeOf('function');
    expect(client.setOptions).toBeTypeOf('function');
    expect(client.export).toBeTypeOf('function');
    expect(client.terminate).toBeTypeOf('function');
    expect(client.on).toBeTypeOf('function');
    expect(client.connect).toBeTypeOf('function');

    client.terminate();
  });

  it('should accept a project path for filesystem-backed rendering', async () => {
    const client = await createNodeClient('/tmp');

    expect(client.openFile).toBeTypeOf('function');

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
      code: {
        'main.ts': `
          import { makeBaseBox } from 'replicad';
          export default function main() {
            return makeBaseBox(10, 20, 30);
          }
        `,
      },
      file: 'main.ts',
    });

    expect(client.lifecycleState).toBe('connected');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bytes).toBeInstanceOf(Uint8Array);
      expect(result.data.bytes.byteLength).toBeGreaterThan(0);
      expect(result.data.mimeType).toBe('model/gltf-binary');
    }

    client.terminate();
  });

  it('settles repeated identical exports', { timeout: 10_000 }, async () => {
    const client = await createNodeClient();
    const input = {
      code: {
        'main.ts': `
          import { makeBaseBox } from 'replicad';
          export default function main() {
            return makeBaseBox(10, 20, 30);
          }
        `,
      },
      file: 'main.ts',
    };

    const withSettlementLimit = async <T>(promise: Promise<T>): Promise<T> => {
      let settlementTimer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<never>((_, reject) => {
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
});
