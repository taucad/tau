// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- constructors held in variables keep PascalCase for `new`. */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { withZooProxyHeaders } from '#proxy/zoo-proxy-headers.js';

const proxyUrl = 'wss://api.example.test/v1/kernels/zoo';

/** Records what a decorated constructor hands its base, the way undici would receive it. */
const createRecordingBase = (): { Base: typeof WebSocket; calls: unknown[][] } => {
  const calls: unknown[][] = [];
  class RecordingWebSocket {
    public readonly args: unknown[];
    public constructor(...args: unknown[]) {
      this.args = args;
      calls.push(args);
    }
  }
  return { Base: RecordingWebSocket as unknown as typeof WebSocket, calls };
};

describe('withZooProxyHeaders', () => {
  it('adds the upgrade headers to a connection to the proxy, whatever its query', () => {
    const { Base, calls } = createRecordingBase();
    const Decorated = withZooProxyHeaders(Base, { url: proxyUrl, headers: () => ({ 'tau-zoo-token': 'zt1.a.b' }) });

    expect(new Decorated(`${proxyUrl}?video_res_width=256`)).toBeInstanceOf(Base);

    expect(calls).toEqual([[`${proxyUrl}?video_res_width=256`, { headers: { 'tau-zoo-token': 'zt1.a.b' } }]]);
  });

  it('keeps requested subprotocols beside the headers', () => {
    const { Base, calls } = createRecordingBase();
    const Decorated = withZooProxyHeaders(Base, { url: proxyUrl, headers: () => ({ authorization: 'Bearer s' }) });

    expect(new Decorated(new URL(proxyUrl), ['v1'])).toBeInstanceOf(Base);

    expect(calls).toEqual([[new URL(proxyUrl), { protocols: ['v1'], headers: { authorization: 'Bearer s' } }]]);
  });

  it.each([
    ['another path on the same origin', 'wss://api.example.test/v1/agents/control'],
    ['another origin with the same path', 'wss://evil.example.test/v1/kernels/zoo'],
    ['another scheme', 'ws://api.example.test/v1/kernels/zoo'],
  ])('never decorates %s', (_label, url) => {
    const { Base, calls } = createRecordingBase();
    const Decorated = withZooProxyHeaders(Base, { url: proxyUrl, headers: () => ({ 'tau-zoo-token': 'secret' }) });

    expect(new Decorated(url, 'chat')).toBeInstanceOf(Base);

    expect(calls).toEqual([[url, 'chat']]);
  });

  it('reads the credential at connection time and sends none while it is absent', () => {
    const { Base, calls } = createRecordingBase();
    const credential: { token?: string } = {};
    const Decorated = withZooProxyHeaders(Base, {
      url: proxyUrl,
      headers: () => (credential.token === undefined ? undefined : { 'tau-zoo-token': credential.token }),
    });

    expect(new Decorated(proxyUrl)).toBeInstanceOf(Base);
    credential.token = 'zt1.fresh.sig';
    expect(new Decorated(proxyUrl)).toBeInstanceOf(Base);

    expect(calls).toEqual([
      [proxyUrl, undefined],
      [proxyUrl, { headers: { 'tau-zoo-token': 'zt1.fresh.sig' } }],
    ]);
  });

  it('sends the headers on a real Node upgrade request', async () => {
    const server = createServer();
    const upgraded = new Promise<string | undefined>((resolve) => {
      server.once('upgrade', (request, socket) => {
        resolve(request.headers['tau-zoo-token'] as string | undefined);
        socket.destroy();
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    const url = `ws://127.0.0.1:${String(port)}/v1/kernels/zoo`;
    try {
      const Decorated = withZooProxyHeaders(globalThis.WebSocket, {
        url,
        headers: () => ({ 'tau-zoo-token': 'zt1.x.y' }),
      });
      const socket = new Decorated(`${url}?video_res_width=256`);
      socket.addEventListener('error', () => undefined);

      expect(await upgraded).toBe('zt1.x.y');
    } finally {
      server.close();
    }
  });

  it('keeps instanceof checks against the decorated constructor working', () => {
    const { Base } = createRecordingBase();
    const Decorated = withZooProxyHeaders(Base, { url: proxyUrl, headers: () => undefined });

    expect(new Decorated(proxyUrl)).toBeInstanceOf(Base);
  });
});
