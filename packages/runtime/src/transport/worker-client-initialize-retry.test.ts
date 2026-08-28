import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as RpcModule from '@taucad/rpc';
import { createFileSystemBridgePort, createTransferredFileSystemBridgeProxy } from '@taucad/fs-bridge';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { nodeWorkerClient } from '#transport/node-worker-client.js';
import type { RuntimeInitializePayload } from '#transport/runtime-transport.types.js';
import { webWorkerClient } from '#transport/web-worker-client.js';
import { resolveRuntimeFileSystem, wrapAsRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import { inProcessClient } from '#transport/in-process-client.js';
import { defineRuntime } from '#worker/runtime-definition.js';

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
  const openConnection = vi.fn(() => {
    const handle = resolveRuntimeFileSystem(fromMemoryFs());
    if (handle.kind !== 'inline') {
      throw new Error('fromMemoryFs must create an inline handle');
    }
    return createFileSystemBridgePort(handle.create());
  });
  const fileSystem = wrapAsRuntimeFileSystem({
    kind: 'channel',
    create: openConnection,
  });
  return { fileSystem, openConnection };
};

const initializePayload = {
  config: {},
} satisfies RuntimeInitializePayload;
const mainFilePath = 'main.ts';
const mainFileSource = 'export default 1;';

const expectTransferredFileSystem = async (payload: InitializeCallPayload): Promise<void> => {
  const port = payload.value?.memoryHandle?.fileSystemPort;
  expect(port).toBeInstanceOf(MessagePort);
  if (!port) {
    return;
  }

  const fileSystem = createTransferredFileSystemBridgeProxy(port);
  try {
    await fileSystem.ready;
    await expect(fileSystem.readFile(mainFilePath, 'utf8')).resolves.toBe(mainFileSource);
  } finally {
    fileSystem.dispose();
  }
};

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
      fileSystem: fromMemoryFs({ [mainFilePath]: mainFileSource }),
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
    await expectTransferredFileSystem(secondPayload);
    await client.close();
  });

  it('should open a fresh channel filesystem bridge after failed web-worker initialize', async () => {
    const { fileSystem, openConnection } = createChannelBackedFileSystem();
    const client = webWorkerClient({
      createWorker: createWebWorker,
      fileSystem,
    });
    mocks.channel.call.mockRejectedValueOnce(new Error('Invalid runtime config')).mockResolvedValueOnce({});

    await expect(client.initialize(initializePayload)).rejects.toThrow('Invalid runtime config');
    await expect(client.initialize(initializePayload)).resolves.toEqual({});

    expect(mocks.channel.call).toHaveBeenCalledTimes(2);
    expect(openConnection).toHaveBeenCalledTimes(2);
    const firstPayload = mocks.channel.call.mock.calls[0]?.[1] as InitializeCallPayload;
    const secondPayload = mocks.channel.call.mock.calls[1]?.[1] as InitializeCallPayload;
    expect(secondPayload.value?.memoryHandle?.fileSystemPort).not.toBe(
      firstPayload.value?.memoryHandle?.fileSystemPort,
    );
    await client.close();
  });

  it('should rebuild inline node-worker filesystem bridges after failed initialize', async () => {
    const { workerCtor } = createNodeWorkerCtor();
    const client = nodeWorkerClient({
      url: new URL('about:blank'),
      workerCtor,
      fileSystem: fromMemoryFs({ [mainFilePath]: mainFileSource }),
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
    await expectTransferredFileSystem(secondPayload);
    await client.close();
  });

  it('should open a fresh channel filesystem bridge after failed node-worker initialize', async () => {
    const { workerCtor } = createNodeWorkerCtor();
    const { fileSystem, openConnection } = createChannelBackedFileSystem();
    const client = nodeWorkerClient({
      url: new URL('about:blank'),
      workerCtor,
      fileSystem,
    });
    mocks.channel.call.mockRejectedValueOnce(new Error('Invalid runtime config')).mockResolvedValueOnce({});

    await expect(client.initialize(initializePayload)).rejects.toThrow('Invalid runtime config');
    await expect(client.initialize(initializePayload)).resolves.toEqual({});

    expect(mocks.channel.call).toHaveBeenCalledTimes(2);
    expect(openConnection).toHaveBeenCalledTimes(2);
    const firstPayload = mocks.channel.call.mock.calls[0]?.[1] as InitializeCallPayload;
    const secondPayload = mocks.channel.call.mock.calls[1]?.[1] as InitializeCallPayload;
    expect(secondPayload.value?.memoryHandle?.fileSystemPort).not.toBe(
      firstPayload.value?.memoryHandle?.fileSystemPort,
    );
    await client.close();
  });

  it('should open one fresh channel connection for each in-process runtime binding', async () => {
    const { fileSystem, openConnection } = createChannelBackedFileSystem();
    const runtime = defineRuntime({});
    const firstClient = inProcessClient({ runtime, fileSystem });
    const secondClient = inProcessClient({ runtime, fileSystem });

    await firstClient.initialize(initializePayload);
    await secondClient.initialize(initializePayload);

    expect(openConnection).toHaveBeenCalledTimes(2);
    await firstClient.close();
    await secondClient.close();
  });
});
