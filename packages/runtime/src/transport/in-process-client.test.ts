// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { createRuntimeClient } from '#client/runtime-client-core.js';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineRuntime } from '#worker/runtime-definition.js';

afterEach(() => vi.restoreAllMocks());

it('should await owned worker cleanup on default shutdown without cleaning up siblings', async () => {
  const cleanup = vi.spyOn(KernelRuntimeWorker.prototype, 'cleanup');
  const transport = inProcessTransport({ runtime: defineRuntime({}), fileSystem: fromMemoryFs({}) });
  const first = createRuntimeClient({ transport });
  const second = createRuntimeClient({ transport });
  try {
    await Promise.all([first.connect(), second.connect()]);
    await first.shutdown();
    expect(cleanup).toHaveBeenCalledTimes(1);
    await second.connect();
    await second.shutdown();
    expect(cleanup).toHaveBeenCalledTimes(2);
    await first.shutdown();
    expect(cleanup).toHaveBeenCalledTimes(2);
  } finally {
    await Promise.all([first.shutdown(), second.shutdown()]);
  }
});

it('should await the same asynchronous cleanup on repeated transport close calls', async () => {
  const cleanupGate = Promise.withResolvers<void>();
  const cleanup = vi.spyOn(KernelRuntimeWorker.prototype, 'cleanup').mockReturnValue(cleanupGate.promise);
  const client = inProcessTransport({ runtime: defineRuntime({}) }).materialize();
  await client.open();
  let closed = false;
  const first = client.close();
  const closeAgain = async (): Promise<void> => {
    await client.close();
    closed = true;
  };
  const second = closeAgain();
  try {
    await Promise.resolve();
    expect(closed).toBe(false);
  } finally {
    cleanupGate.resolve();
    await Promise.all([first, second]);
  }
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('should not create a worker when closed during asynchronous open', async () => {
  const cleanup = vi.spyOn(KernelRuntimeWorker.prototype, 'cleanup');
  const client = inProcessTransport({ runtime: defineRuntime({}) }).materialize();
  const opening = expect(client.open()).rejects.toThrow('client closed during open()');
  await client.close();
  await opening;
  expect(cleanup).not.toHaveBeenCalled();
});
