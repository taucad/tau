import { describe, expect, it } from 'vitest';
import { nodeWorkerClientOptionsSchema } from '#transport/node-worker-transport.schemas.js';

describe('nodeWorkerClientOptionsSchema', () => {
  it('should require a consumer-owned worker URL', () => {
    expect(nodeWorkerClientOptionsSchema.safeParse({}).success).toBe(false);
    expect(nodeWorkerClientOptionsSchema.safeParse({ url: './runtime.worker.js' }).success).toBe(true);
    expect(nodeWorkerClientOptionsSchema.safeParse({ url: new URL('file:///tmp/runtime.worker.js') }).success).toBe(
      true,
    );
  });
});
