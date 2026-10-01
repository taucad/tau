import { describe, expect, it, vi } from 'vitest';
import type { WebSocketLike } from '@taucad/rpc';
import { ChannelClosedError } from '@taucad/rpc';

import { prepareMachineWebSocket } from '#transport/machine-web-socket.js';

describe('prepareMachineWebSocket', () => {
  it.each([
    [403, 'not-granted'],
    [404, 'unsupported'],
  ] as const)('maps status %i to %s without opening a socket', async (status, reason) => {
    const fetch = vi.fn(async () => new Response(undefined, { status }));
    const createSocket = vi.fn();
    await expect(prepareMachineWebSocket({ url: 'https://host.test/machines', fetch, createSocket })).resolves.toEqual({
      available: false,
      reason,
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://host.test/machines'),
      expect.objectContaining({ credentials: 'include', redirect: 'error' }),
    );
    expect(createSocket).not.toHaveBeenCalled();
  });

  it('rejects credentials and unsupported schemes before probing', async () => {
    const fetch = vi.fn();
    await expect(prepareMachineWebSocket({ url: 'https://token@host.test/machines', fetch })).rejects.toThrow(
      'credentials',
    );
    await expect(prepareMachineWebSocket({ url: 'ws://host.test/machines', fetch })).rejects.toThrow('http or https');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prepares a fresh exact WebSocket connection for each client', async () => {
    const sockets: string[] = [];
    const prepared = await prepareMachineWebSocket({
      url: 'https://host.test/prefix/machines?scope=one',
      fetch: async () => new Response(undefined, { status: 204 }),
      createSocket: (url) => {
        sockets.push(url);
        return {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          send: vi.fn(),
          close: vi.fn(),
        } as unknown as WebSocketLike;
      },
    });
    if (!prepared.available) {
      throw new Error('Expected admitted machines endpoint');
    }
    const first = prepared.connect();
    const second = prepared.connect();
    first.close();
    second.close();
    expect(sockets).toEqual(['wss://host.test/prefix/machines?scope=one', 'wss://host.test/prefix/machines?scope=one']);
    await expect(first.ready).rejects.toBeInstanceOf(ChannelClosedError);
    await expect(first.ready).rejects.toMatchObject({
      name: 'ChannelClosedError',
      message: 'Channel closed',
      code: 'CHANNEL_CLOSED',
      info: { origin: 'local', code: 'CHANNEL_CLOSED' },
    });
    await expect(second.ready).rejects.toBeInstanceOf(ChannelClosedError);
    await expect(second.ready).rejects.toMatchObject({
      name: 'ChannelClosedError',
      message: 'Channel closed',
      code: 'CHANNEL_CLOSED',
      info: { origin: 'local', code: 'CHANNEL_CLOSED' },
    });
  });
});
