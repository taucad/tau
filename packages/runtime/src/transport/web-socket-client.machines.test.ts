import { describe, expect, it, vi } from 'vitest';

import type { MachineChannelClient } from '#machines/machine-channel.js';
import { webSocketClient } from '#transport/web-socket-client.js';

describe('WebSocket machines facet', () => {
  it('does not acquire its authenticated channel until the first machine operation', async () => {
    const close = vi.fn();
    const listProviders = vi.fn(async () => []);
    const captureStill = vi.fn<MachineChannelClient['captureStill']>(async () => ({
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      mediaType: 'image/jpeg',
      capturedAt: '2026-09-14T00:00:00.000Z',
      expiresAt: '2026-09-14T00:00:15.000Z',
    }));
    const unused = async (): Promise<never> => {
      throw new Error('Unused fixture operation');
    };
    const stop = vi.fn<MachineChannelClient['stop']>(async (input) => ({
      operationId: input.operationId ?? 'stop-1',
      machineId: input.machineId,
      kind: 'stop',
      status: 'accepted',
      observedAt: '2026-09-14T00:00:00.000Z',
    }));
    const channel: MachineChannelClient = {
      ready: Promise.resolve(),
      close,
      listProviders,
      async *discover() {
        yield* [];
      },
      async beginBinding() {
        return { status: 'operator-action-required', ceremonyId: 'fixture' };
      },
      removeBinding: unused,
      checkJob: unused,
      requestJob: unused,
      listJobs: unused,
      async *watchJobs() {
        yield* [];
      },
      resolveJob: unused,
      withdrawJob: unused,
      applyAction: unused,
      approveAction: unused,
      stop,
      beginHold: unused,
      renewHold: unused,
      endHold: unused,
      reconcileOperation: unused,
      setTesting: unused,
      captureStill,
      async list() {
        throw new Error('Unused fixture operation');
      },
      async get() {
        throw new Error('Unused fixture operation');
      },
      async *watch() {
        yield* [];
      },
    };
    const connect = vi.fn(() => channel);
    const client = webSocketClient({
      url: 'ws://127.0.0.1:1',
      machines: { available: true, connect },
    });

    expect(connect).not.toHaveBeenCalled();
    if (!client.machines?.available) {
      throw new Error('Expected available machines facet');
    }
    await expect(client.machines.listProviders({})).resolves.toEqual([]);
    expect(connect).toHaveBeenCalledOnce();
    await expect(client.machines.captureStill({ machineId: 'machine-1' })).resolves.toMatchObject({
      mediaType: 'image/jpeg',
    });
    expect(captureStill).toHaveBeenCalledWith({ machineId: 'machine-1' });
    const requestedBy = { kind: 'user', id: 'operator', label: 'Operator' } as const;
    await expect(
      client.machines.stop({ machineId: 'machine-1', operationId: 'stop-1', requestedBy }),
    ).resolves.toMatchObject({ kind: 'stop', status: 'accepted' });
    expect(stop).toHaveBeenCalledWith({ machineId: 'machine-1', operationId: 'stop-1', requestedBy });
    await client.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
