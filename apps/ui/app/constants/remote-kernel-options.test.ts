import { fromMemoryFs } from '@taucad/runtime/filesystem';
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
  webSocketTransport: vi.fn((options: unknown) => ({ id: 'web-socket', options })),
}));

vi.mock('@taucad/runtime/metadata', () => ({ packageVersion: '1.2.3' }));
vi.mock('@taucad/runtime/transport/websocket', () => ({ webSocketTransport: mocks.webSocketTransport }));
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
    expect(mocks.webSocketTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'wss://api.example/v1/agents/sessions/session-1/browser',
        fileSystem,
      }),
    );
    expect(getRemoteComputePlacement()).toEqual({ state: 'connecting', deviceId: 'device-1' });
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
