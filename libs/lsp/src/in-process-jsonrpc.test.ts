import { describe, it, expect } from 'vitest';

import { createInProcessJsonRpcPair } from '#in-process-jsonrpc.js';

describe('createInProcessJsonRpcPair', () => {
  it('round-trips requests on each half', async () => {
    const pair = createInProcessJsonRpcPair();
    pair.clientSide.addMethod('add', ({ a, b }: { a: number; b: number }) => a + b);
    pair.serverSide.addMethod('mul', ({ a, b }: { a: number; b: number }) => a * b);

    await expect(pair.clientSide.request('add', { a: 2, b: 3 })).resolves.toBe(5);
    await expect(pair.serverSide.request('mul', { a: 4, b: 5 })).resolves.toBe(20);

    pair.dispose();
  });
});
