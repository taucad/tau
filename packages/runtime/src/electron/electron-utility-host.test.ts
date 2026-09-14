import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';

import { electronUtilityHost } from '#electron/electron-utility-host.js';
import { serveElectronFileSystemBridgePort } from '#electron/filesystem-bridge-port.js';
import type { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import type { MessagePortMainLike } from '@taucad/rpc';
import type * as DispatcherModule from '#transport/_internal/runtime-worker-dispatcher.js';

const dispatcherCalls = vi.hoisted(() => [] as Array<Parameters<typeof DispatcherModule.createWorkerDispatcher>>);
const disposeDispatcher = vi.hoisted(() => vi.fn());

vi.mock('#transport/_internal/runtime-worker-dispatcher.js', () => ({
  createWorkerDispatcher: (...args: Parameters<typeof DispatcherModule.createWorkerDispatcher>) => {
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
