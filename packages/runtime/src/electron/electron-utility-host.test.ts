import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';

import { electronUtilityHost } from '#electron/electron-utility-host.js';
import { serveElectronFileSystemBridgePort } from '#electron/filesystem-bridge-port.js';
import type { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import type { MessagePortMainLike } from '@taucad/rpc';
import type * as DispatcherModule from '#transport/_internal/runtime-document-dispatcher.js';
import { fromMemoryFs } from '#filesystem/index.js';
import { createWorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';

const dispatcherCalls = vi.hoisted(
  () => [] as Array<Parameters<typeof DispatcherModule.createDocumentWorkerDispatcher>>,
);
const disposeDispatcher = vi.hoisted(() => vi.fn());

vi.mock('#transport/_internal/runtime-document-dispatcher.js', () => ({
  createDocumentWorkerDispatcher: (...args: Parameters<typeof DispatcherModule.createDocumentWorkerDispatcher>) => {
    dispatcherCalls.push(args);
    return { dispose: disposeDispatcher };
  },
}));

vi.mock('#transport/_internal/worker-crash-trap.js', () => ({ installWorkerCrashTrap: vi.fn() }));

type ParentPort = {
  once(event: string, listener: (event: { data?: unknown; ports: readonly MessagePortMainLike[] }) => void): void;
};

const originalParentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;

afterEach(() => {
  dispatcherCalls.length = 0;
  disposeDispatcher.mockClear();
  Object.defineProperty(process, 'parentPort', {
    configurable: true,
    value: originalParentPort,
  });
});

describe('electronUtilityHost filesystem boot', () => {
  it.each([true, false])(
    'keeps transferred publication separate and omits a readonly writer (writable=%s)',
    async (writable) => {
      let receive: ((event: { data?: unknown; ports: readonly MessagePortMainLike[] }) => void) | undefined;
      Object.defineProperty(process, 'parentPort', {
        configurable: true,
        value: {
          once: (_event: string, listener: typeof receive) => {
            receive = listener;
          },
        },
      });
      const runtimePorts = new MessageChannel();
      const evaluatorPorts = new MessageChannel();
      const publicationPorts = new MessageChannel();
      const evaluator = new MemoryProvider();
      const publication = new MemoryProvider();
      await evaluator.writeFile('value.txt', 'evaluator');
      await publication.writeFile('value.txt', 'publication');
      const readonlyPublication = new Proxy(publication, {
        get(target, property): unknown {
          if (property === 'capabilities') {
            return { ...publication.capabilities, writable };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const evaluatorServer = serveElectronFileSystemBridgePort(evaluator, evaluatorPorts.port1);
      const publicationServer = serveElectronFileSystemBridgePort(readonlyPublication, publicationPorts.port1);
      const host = electronUtilityHost({ worker: Object.create(null) as KernelRuntimeWorker });
      try {
        const opening = host.open();
        receive?.({
          data: { runtimePortIndex: 0, fileSystemPortIndex: 1, publicationFileSystemPortIndex: 2 },
          ports: [runtimePorts.port1, evaluatorPorts.port2, publicationPorts.port2] as unknown as MessagePortMainLike[],
        });
        await opening;
        const bindings = dispatcherCalls[0]?.[2];
        await expect(bindings?.inlineFileSystem?.readFile('value.txt', 'utf8')).resolves.toBe('evaluator');
        if (writable) {
          const writerPort = bindings?.publicationFileSystem?.port;
          if (!writerPort) {
            throw new Error('Missing independent publication binding.');
          }
          const writer = await createWorkerFileSystemProxy(writerPort);
          await expect(writer.readFile('value.txt', 'utf8')).resolves.toBe('publication');
          writer.dispose();
        } else {
          expect(bindings?.publicationFileSystem?.port).toBeUndefined();
        }
      } finally {
        await host.close();
        evaluatorServer.dispose();
        publicationServer.dispose();
        runtimePorts.port2.close();
      }
    },
  );

  it.each([
    { publicationFileSystemPortIndex: 2 },
    { publicationFileSystemPortIndex: -1 },
    { publicationFileSystemPortIndex: 0 },
    { publicationFileSystemPortIndex: 0.5 },
  ])(
    'rejects invalid publication port indices before wiring and closes siblings when one close throws: %j',
    async (data) => {
      let receive: ((event: { data?: unknown; ports: readonly MessagePortMainLike[] }) => void) | undefined;
      Object.defineProperty(process, 'parentPort', {
        configurable: true,
        value: {
          once: (_event: string, listener: typeof receive) => {
            receive = listener;
          },
        },
      });
      const first = {
        close: vi.fn(() => {
          throw new Error('close failed');
        }),
      };
      const second = { close: vi.fn() };
      const host = electronUtilityHost({
        fileSystem: fromMemoryFs(),
        worker: Object.create(null) as KernelRuntimeWorker,
      });
      const opening = host.open();
      receive?.({
        data: { runtimePortIndex: 0, computeStorePortIndex: 1, ...data },
        ports: [first, second] as unknown as MessagePortMainLike[],
      });
      await expect(opening).rejects.toThrow('invalid MessagePortMain indices');
      expect(first.close).toHaveBeenCalledOnce();
      expect(second.close).toHaveBeenCalledOnce();
      expect(dispatcherCalls).toHaveLength(0);
      await host.close();
    },
  );

  it('rejects simultaneous static and transferred publication bindings', async () => {
    let receive: ((event: { data?: unknown; ports: readonly MessagePortMainLike[] }) => void) | undefined;
    Object.defineProperty(process, 'parentPort', {
      configurable: true,
      value: {
        once: (_event: string, listener: typeof receive) => {
          receive = listener;
        },
      },
    });
    const ports = [{ close: vi.fn() }, { close: vi.fn() }];
    const host = electronUtilityHost({
      fileSystem: fromMemoryFs(),
      publicationFileSystem: fromMemoryFs(),
      worker: Object.create(null) as KernelRuntimeWorker,
    });
    const opening = host.open();
    receive?.({
      data: { runtimePortIndex: 0, publicationFileSystemPortIndex: 1 },
      ports: ports as unknown as MessagePortMainLike[],
    });
    await expect(opening).rejects.toThrow('static and transferred publication');
    expect(dispatcherCalls).toHaveLength(0);
    for (const port of ports) {
      expect(port.close).toHaveBeenCalledOnce();
    }
    await host.close();
  });

  it('awaits a transferred rooted bridge before wiring the dispatcher and owns its close', async () => {
    let receive: ((event: { data?: unknown; ports: readonly MessagePortMainLike[] }) => void) | undefined;
    Object.defineProperty(process, 'parentPort', {
      configurable: true,
      value: {
        once: (_event: string, listener: typeof receive) => {
          receive = listener;
        },
      },
    });
    const runtimePorts = new MessageChannel();
    const fileSystemPorts = new MessageChannel();
    const provider = new MemoryProvider();
    await provider.writeFile('value.txt', 'shared');
    const server = serveElectronFileSystemBridgePort(provider, fileSystemPorts.port1);
    const host = electronUtilityHost({ worker: Object.create(null) as KernelRuntimeWorker });
    const opening = host.open();

    receive?.({
      data: { runtimePortIndex: 0, fileSystemPortIndex: 1 },
      ports: [runtimePorts.port1, fileSystemPorts.port2] as unknown as MessagePortMainLike[],
    });

    await opening;
    const dispatcherCall = dispatcherCalls[0];
    expect(dispatcherCall).toBeDefined();
    if (!dispatcherCall) {
      throw new Error('The utility did not create its runtime dispatcher.');
    }
    const inlineFileSystem = dispatcherCall[2]?.inlineFileSystem;
    expect(inlineFileSystem).toBeDefined();
    if (!inlineFileSystem) {
      throw new Error('The utility dispatcher received no rooted filesystem.');
    }
    await expect(inlineFileSystem.readFile('value.txt', 'utf8')).resolves.toBe('shared');
    await host.close();
    expect(disposeDispatcher).toHaveBeenCalledOnce();

    server.dispose();
    runtimePorts.port2.close();
  });

  it('rejects a pending boot and closes ports delivered after host shutdown', async () => {
    let receive: ((event: { data?: unknown; ports: readonly MessagePortMainLike[] }) => void) | undefined;
    Object.defineProperty(process, 'parentPort', {
      configurable: true,
      value: {
        once: (_event: string, listener: typeof receive) => {
          receive = listener;
        },
      },
    });
    const runtimePorts = new MessageChannel();
    const closeRuntimePort = vi.spyOn(runtimePorts.port1, 'close');
    const host = electronUtilityHost({ worker: Object.create(null) as KernelRuntimeWorker });
    const opening = host.open();

    await host.close('fixture shutdown');
    await expect(opening).rejects.toThrow(/closed before parent boot frame/u);
    receive?.({ ports: [runtimePorts.port1] as unknown as MessagePortMainLike[] });

    expect(closeRuntimePort).toHaveBeenCalledOnce();
    runtimePorts.port2.close();
  });

  it('closes every received port exactly once while filesystem hello is pending', async () => {
    let receive: ((event: { data?: unknown; ports: readonly MessagePortMainLike[] }) => void) | undefined;
    Object.defineProperty(process, 'parentPort', {
      configurable: true,
      value: {
        once: (_event: string, listener: typeof receive) => {
          receive = listener;
        },
      },
    });
    const runtimePorts = new MessageChannel();
    const fileSystemPorts = new MessageChannel();
    const computePorts = new MessageChannel();
    const closeRuntimePort = vi.spyOn(runtimePorts.port1, 'close');
    const closeFileSystemPort = vi.spyOn(fileSystemPorts.port1, 'close');
    const closeComputePort = vi.spyOn(computePorts.port1, 'close');
    const host = electronUtilityHost({ worker: Object.create(null) as KernelRuntimeWorker });
    const opening = host.open();

    receive?.({
      data: { runtimePortIndex: 0, fileSystemPortIndex: 1, computeStorePortIndex: 2 },
      ports: [runtimePorts.port1, fileSystemPorts.port1, computePorts.port1] as unknown as MessagePortMainLike[],
    });
    await Promise.resolve();
    await host.close('close during filesystem hello');

    await expect(opening).rejects.toThrow(/closed before parent boot frame/u);
    expect(closeRuntimePort).toHaveBeenCalledOnce();
    expect(closeFileSystemPort).toHaveBeenCalledOnce();
    expect(closeComputePort).toHaveBeenCalledOnce();

    const lateServer = serveElectronFileSystemBridgePort(new MemoryProvider(), fileSystemPorts.port2);
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(closeRuntimePort).toHaveBeenCalledOnce();
    expect(closeFileSystemPort).toHaveBeenCalledOnce();
    expect(closeComputePort).toHaveBeenCalledOnce();

    lateServer.dispose();
    runtimePorts.port2.close();
    computePorts.port2.close();
  });
});
