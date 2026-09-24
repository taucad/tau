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
      async preparePrint() {
        throw new Error('Unused fixture operation');
      },
      async uploadPrint() {
        throw new Error('Unused fixture operation');
      },
      async requestPrint() {
        throw new Error('Unused fixture operation');
      },
      async listPrintRequests() {
        throw new Error('Unused fixture operation');
      },
      async *watchPrintRequests() {
        yield* [];
      },
      async resolvePrintRequest() {
        throw new Error('Unused fixture operation');
      },
      async withdrawPrintRequest() {
        throw new Error('Unused fixture operation');
      },
      async startPrint() {
        throw new Error('Unused fixture operation');
      },
      async reconcileOperation() {
        throw new Error('Unused fixture operation');
      },
      async controlRun() {
        throw new Error('Unused fixture operation');
      },
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
    await client.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
