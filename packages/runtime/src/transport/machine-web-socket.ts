/** Browser-safe preparation for one authenticated machines WebSocket endpoint. @public */

import type { WebSocketLike } from '@taucad/rpc';

import { connectMachineChannel } from '#machines/machine-channel.js';
import type { MachineChannelClient } from '#machines/machine-channel.js';
import type { RuntimeTransportFacet } from '#transport/runtime-transport.types.js';

type FetchLike = typeof globalThis.fetch;

/** Named admission input for an exact machines endpoint. @public */
export type PrepareMachineWebSocketInput = Readonly<{
  url: string | URL;
  fetch?: FetchLike;
  createSocket?: (url: string) => WebSocketLike;
  signal?: AbortSignal;
}>;

/** Fresh machine-channel factory admitted for one exact endpoint. @public */
export type PreparedMachineWebSocket = Readonly<{
  connect(): MachineChannelClient;
}>;

const parseEndpoint = (input: string | URL): URL => {
  const endpoint = new URL(typeof input === 'string' ? input : input.href);
  if (endpoint.username || endpoint.password) {
    throw new TypeError('prepareMachineWebSocket: endpoint credentials are not allowed');
  }
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw new TypeError('prepareMachineWebSocket: endpoint must use http or https');
  }
  return endpoint;
};

const socketUrl = (endpoint: URL): string => {
  const url = new URL(endpoint.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
};

const defaultSocketFactory = (url: string): WebSocketLike => {
  if (typeof WebSocket !== 'function') {
    throw new TypeError('prepareMachineWebSocket: no WebSocket implementation available; pass createSocket');
  }
  return new WebSocket(url);
};

/**
 * Probe one exact authenticated machine endpoint and prepare fresh channel acquisition.
 *
 * @param input - Exact endpoint and optional platform fetch/socket implementations.
 * @returns An available fresh-channel factory, or a truthful bounded refusal.
 * @public
 */
export const prepareMachineWebSocket = async (
  input: PrepareMachineWebSocketInput,
): Promise<RuntimeTransportFacet<PreparedMachineWebSocket>> => {
  const endpoint = parseEndpoint(input.url);
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const response = await fetchImpl(endpoint, {
    credentials: 'include',
    redirect: 'error',
    signal: input.signal,
  });
  if (response.redirected) {
    throw new TypeError('prepareMachineWebSocket: redirected admission response refused');
  }
  if (response.status === 403) {
    return { available: false, reason: 'not-granted' };
  }
  if (response.status === 404) {
    return { available: false, reason: 'unsupported' };
  }
  if (response.status !== 204) {
    throw new Error(`prepareMachineWebSocket: admission probe failed with status ${String(response.status)}`);
  }

  const createSocket = input.createSocket ?? defaultSocketFactory;
  const url = socketUrl(endpoint);
  return {
    available: true,
    connect() {
      const channel = connectMachineChannel(createSocket(url));
      const observeReadiness = async (): Promise<void> => {
        try {
          await channel.ready;
        } catch {
          channel.close();
        }
      };
      // async-iife: readiness remains caller-visible while this observer owns failed-handshake cleanup.
      void observeReadiness();
      return channel;
    },
  };
};
