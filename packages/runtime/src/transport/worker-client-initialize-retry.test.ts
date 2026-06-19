import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as RpcModule from '@taucad/rpc';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { nodeWorkerClient } from '#transport/node-worker-client.js';
import type { RuntimeInitializePayload } from '#transport/runtime-transport.types.js';
import { webWorkerClient } from '#transport/web-worker-client.js';
import { wrapAsRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';

const mocks = vi.hoisted(() => {
  const channel = {
    call: vi.fn(),
    notify: vi.fn(),
    close: vi.fn(),
    ready: Promise.resolve(),
  };
  return {
    channel,
    createChannelClient: vi.fn(() => channel),
  };
});

vi.mock('@taucad/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof RpcModule>()),
  createChannelClient: mocks.createChannelClient,
}));

type InitializeCallPayload = {
  value?: {
    memoryHandle?: {
      fileSystemPort?: MessagePort;
    };
  };
};

const createWebWorker = (): Worker => {
  const listeners = new Set<(event: { data: unknown }) => void>();
  return {
    postMessage: vi.fn(),
    addEventListener: vi.fn((_type: 'message', listener: (event: { data: unknown }) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: 'message', listener: (event: { data: unknown }) => void) => {
      listeners.delete(listener);
    }),
    terminate: vi.fn(() => {
      listeners.clear();
    }),
  } as unknown as Worker;
};

const createNodeWorkerCtor = () => {
  const created: Array<{ terminate: ReturnType<typeof vi.fn> }> = [];
  const workerCtor = function fakeNodeWorker(this: unknown) {
    const listeners = new Set<(data: unknown) => void>();
    const worker = {
      postMessage: vi.fn(),
      on: vi.fn((_event: 'message', listener: (data: unknown) => void) => {
        listeners.add(listener);
        return worker;
      }),
      off: vi.fn((_event: 'message', listener: (data: unknown) => void) => {
        listeners.delete(listener);
        return worker;
      }),
      terminate: vi.fn(async () => {
        listeners.clear();
        return 0;
      }),
    };
    created.push(worker);
    return worker;
  };
  return { workerCtor, created };
};

const createChannelBackedFileSystem = () => {
  const channel = new MessageChannel();
  return wrapAsRuntimeFileSystem({
    kind: 'channel',
    port: channel.port1,
    dispose() {
      channel.port1.close();
      channel.port2.close();
    },
  });
};

const initializePayload = {
  config: {},
} satisfies RuntimeInitializePayload;
const mainFilePath = '/main.ts';

describe('worker transport initialize filesystem bridge retries', () => {
  beforeEach(() => {
    mocks.channel.call.mockReset();
    mocks.channel.notify.mockReset();
    mocks.channel.close.mockReset();
    mocks.createChannelClient.mockClear();
  });

  it('should rebuild inline web-worker filesystem bridges after failed initialize', async () => {
    const client = webWorkerClient({
      createWorker: createWebWorker,
      fileSystem: fromMemoryFs({ [mainFilePath]: 'export default 1;' }),
    });
    mocks.channel.call.mockRejectedValueOnce(new Error('Invalid runtime config')).mockResolvedValueOnce({});

    await expect(client.initialize(initializePayload)).rejects.toThrow('Invalid runtime config');
    await expect(client.initialize(initializePayload)).resolves.toEqual({});

    expect(mocks.channel.call).toHaveBeenCalledTimes(2);
    const firstPayload = mocks.channel.call.mock.calls[0]?.[1] as InitializeCallPayload;
    const secondPayload = mocks.channel.call.mock.calls[1]?.[1] as InitializeCallPayload;
    expect(firstPayload.value?.memoryHandle?.fileSystemPort).toBeInstanceOf(MessagePort);
    expect(secondPayload.value?.memoryHandle?.fileSystemPort).toBeInstanceOf(MessagePort);
    expect(secondPayload.value?.memoryHandle?.fileSystemPort).not.toBe(
      firstPayload.value?.memoryHandle?.fileSystemPort,
    );
    await client.close();
  });

  it('should report a terminal web-worker diagnostic for consumed channel filesystem bridges', async () => {
    const client = webWorkerClient({
      createWorker: createWebWorker,
      fileSystem: createChannelBackedFileSystem(),
    });
    mocks.channel.call.mockRejectedValueOnce(new Error('Invalid runtime config'));

    await expect(client.initialize(initializePayload)).rejects.toThrow('Invalid runtime config');
    try {
      await client.initialize(initializePayload);
      expect.fail('should reject consumed channel filesystem bridge retry');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('RuntimeFileSystemBridgeConsumedError');
      expect((error as Error).message).toContain('webWorkerTransport');
      expect((error as Error).message).toContain('Recreate the RuntimeClient');
      expect((error as { code?: string }).code).toBe('RUNTIME_FILESYSTEM_BRIDGE_CONSUMED');
    }
    expect(mocks.channel.call).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it('should rebuild inline node-worker filesystem bridges after failed initialize', async () => {
    const { workerCtor } = createNodeWorkerCtor();
    const client = nodeWorkerClient({
      workerCtor,
      fileSystem: fromMemoryFs({ [mainFilePath]: 'export default 1;' }),
    });
    mocks.channel.call.mockRejectedValueOnce(new Error('Invalid runtime config')).mockResolvedValueOnce({});

    await expect(client.initialize(initializePayload)).rejects.toThrow('Invalid runtime config');
    await expect(client.initialize(initializePayload)).resolves.toEqual({});

    expect(mocks.channel.call).toHaveBeenCalledTimes(2);
    const firstPayload = mocks.channel.call.mock.calls[0]?.[1] as InitializeCallPayload;
    const secondPayload = mocks.channel.call.mock.calls[1]?.[1] as InitializeCallPayload;
    expect(firstPayload.value?.memoryHandle?.fileSystemPort).toBeInstanceOf(MessagePort);
    expect(secondPayload.value?.memoryHandle?.fileSystemPort).toBeInstanceOf(MessagePort);
    expect(secondPayload.value?.memoryHandle?.fileSystemPort).not.toBe(
      firstPayload.value?.memoryHandle?.fileSystemPort,
    );
    await client.close();
  });

  it('should report a terminal node-worker diagnostic for consumed channel filesystem bridges', async () => {
    const { workerCtor } = createNodeWorkerCtor();
    const client = nodeWorkerClient({
      workerCtor,
      fileSystem: createChannelBackedFileSystem(),
    });
    mocks.channel.call.mockRejectedValueOnce(new Error('Invalid runtime config'));

    await expect(client.initialize(initializePayload)).rejects.toThrow('Invalid runtime config');
    try {
      await client.initialize(initializePayload);
      expect.fail('should reject consumed channel filesystem bridge retry');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('RuntimeFileSystemBridgeConsumedError');
      expect((error as Error).message).toContain('nodeWorkerTransport');
      expect((error as Error).message).toContain('Recreate the RuntimeClient');
      expect((error as { code?: string }).code).toBe('RUNTIME_FILESYSTEM_BRIDGE_CONSUMED');
    }
    expect(mocks.channel.call).toHaveBeenCalledTimes(1);
    await client.close();
  });
});
