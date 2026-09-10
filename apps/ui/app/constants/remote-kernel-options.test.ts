import { fromMemoryFs } from '@taucad/runtime/filesystem';
import type { RuntimeClient } from '@taucad/runtime';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';
import type * as WebSocketTransport from '@taucad/runtime/transport/websocket';
import { webSocketHost } from '@taucad/runtime/transport/websocket-host';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { remoteKernelOptions } from '#constants/remote-kernel-options.js';
import { RemoteHostApiError } from '#lib/remote-host-client.js';
import type * as RemoteHostClient from '#lib/remote-host-client.js';
import {
  getRemoteComputePlacement,
  getRemoteComputeSelectionRevision,
  selectLocalCompute,
  selectRemoteComputeDevice,
} from '#lib/remote-compute-placement.js';

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
}));

vi.mock('@taucad/runtime/metadata', () => ({ packageVersion: '1.2.3' }));
vi.mock('@taucad/runtime/transport/websocket', async (importOriginal) => {
  const original = await importOriginal<typeof WebSocketTransport>();
  return { ...original, webSocketTransport: vi.fn(original.webSocketTransport) };
});
vi.mock('#lib/remote-host-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof RemoteHostClient>()),
  createRemoteHostSession: mocks.createSession,
}));

afterEach(() => {
  vi.clearAllMocks();
  selectLocalCompute();
});

describe('remoteKernelOptions', () => {
  it('starts a fresh runtime selection when reconnecting the same device', () => {
    selectRemoteComputeDevice('device-1');
    const first = getRemoteComputeSelectionRevision();
    selectRemoteComputeDevice('device-1');

    expect(getRemoteComputeSelectionRevision()).toBe(first + 1);
  });

  it('passes the exact browser-owned filesystem handle to a fresh remote session', async () => {
    mocks.createSession.mockResolvedValue({
      id: 'session-1',
      runtimeVersion: '1.2.3',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      url: 'wss://api.example/v1/agents/sessions/session-1/browser',
    });
    selectRemoteComputeDevice('device-1');
    const fileSystem = fromMemoryFs({ 'main.ts': 'export default 1' });

    const optionsFactory = await remoteKernelOptions();
    optionsFactory({ fileSystem });

    expect(mocks.createSession).toHaveBeenCalledWith('device-1', '1.2.3');
    expect(webSocketTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'wss://api.example/v1/agents/sessions/session-1/browser',
        fileSystem,
      }),
    );
    expect(getRemoteComputePlacement()).toEqual({ state: 'connecting', deviceId: 'device-1' });
  });

  it('connects to an already-configured static host without sending browser boot configuration', async () => {
    const { createRuntimeClient } = await import('@taucad/runtime');
    const host = webSocketHost({
      worker: () => createRuntimeWorker({ runtime: defineRuntime({}) }),
    });
    let client: RuntimeClient | undefined;
    try {
      await host.ready;
      mocks.createSession.mockResolvedValue({
        id: 'session-local',
        runtimeVersion: '1.2.3',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        url: `ws://127.0.0.1:${host.address().port}`,
      });
      selectRemoteComputeDevice('device-local');
      const factory = await remoteKernelOptions();
      const incompatible = createRuntimeClient({
        transport: webSocketTransport({
          url: `ws://127.0.0.1:${host.address().port}`,
          fileSystem: fromMemoryFs(),
        }),
        // @ts-expect-error -- Exercise rejection of an invalid boot bag at the actual wire boundary.
        config: { browserWorkerUrl: 'https://browser.invalid/worker.mjs' },
      });
      try {
        await expect(incompatible.connect()).rejects.toThrow(/configuration|config|initializ/iu);
      } finally {
        await incompatible.shutdown();
      }
      client = createRuntimeClient(factory({ fileSystem: fromMemoryFs() }));

      await client.connect();

      expect(client.capabilities?.registrations).toEqual([]);
      expect(getRemoteComputePlacement()).toEqual({ state: 'remote', deviceId: 'device-local' });
    } finally {
      await client?.shutdown();
      await host.close();
    }
  });

  it('surfaces an offline device without choosing local execution', async () => {
    mocks.createSession.mockRejectedValue(new RemoteHostApiError('DEVICE_OFFLINE', 'Device is offline'));
    selectRemoteComputeDevice('device-2');

    await expect(remoteKernelOptions()).rejects.toThrow('Device is offline');
    expect(getRemoteComputePlacement()).toEqual({
      state: 'device-offline',
      deviceId: 'device-2',
      message: 'Device is offline',
    });
  });
});
// @vitest-environment node
