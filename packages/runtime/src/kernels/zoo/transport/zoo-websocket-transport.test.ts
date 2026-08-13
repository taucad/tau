/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON fixtures use API field names */
// @vitest-environment node
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZooWebSocketTransport } from '#kernels/zoo/transport/zoo-websocket-transport.js';
import { KclAuthError } from '#kernels/zoo/kcl-errors.js';
import {
  zooTestInstallFakeWebSocket,
  zooTestFakeSocketCapture,
  zooTestRestoreWebSocket,
} from '#kernels/zoo/zoo-fake-websocket.js';

const authSuccess = {
  success: true,
  resp: {
    type: 'modeling_session_data',
    data: {
      session: { api_call_id: 'test-session' },
    },
  },
} as const;

describe('ZooWebSocketTransport', () => {
  let OriginalWebSocket: typeof WebSocket;

  beforeEach(() => {
    OriginalWebSocket = zooTestInstallFakeWebSocket();
  });

  afterEach(() => {
    zooTestRestoreWebSocket(OriginalWebSocket);
  });

  it('completes initialize after modeling_session_data without sending Authorization headers', async () => {
    const transport = new ZooWebSocketTransport({ baseUrl: 'ws://fake.example/modeling-commands' });
    const init = transport.initialize();

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(zooTestFakeSocketCapture.current).toBeDefined();
    const frames = zooTestFakeSocketCapture.current?.sentFrames ?? [];
    const hasAuthHeader = frames.some((frame) => frame.includes('Authorization') || frame.includes('Bearer'));
    expect(hasAuthHeader).toBe(false);

    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));
    await init;
    expect(transport.connected).toBe(true);
  });

  it('forwards binary frames as raw bytes + decoded msgpack to onMessage', async () => {
    const transport = new ZooWebSocketTransport({ baseUrl: 'ws://fake.example/modeling-commands' });
    const received: Array<{ raw: Uint8Array<ArrayBuffer>; decoded: unknown }> = [];
    transport.onMessage((raw, decoded) => {
      received.push({ raw, decoded });
    });

    void transport.initialize();
    await Promise.resolve();
    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));

    const payload = {
      success: true,
      request_id: 'rid-binary',
      resp: {
        type: 'modeling',
        data: { modeling_response: { type: 'empty' } },
      },
    } as const;

    const encoded = msgpackEncode(payload);
    zooTestFakeSocketCapture.current?.testEmitMessage(
      encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
    );

    expect(received.length).toBeGreaterThanOrEqual(2);
    const last = received.at(-1);
    expect(last).toBeDefined();
    expect(new Uint8Array(last!.raw)).toEqual(new Uint8Array(encoded));
    expect(last!.decoded).toMatchObject({ success: true, request_id: 'rid-binary' });
  });

  it('does not emitMessage to handlers until modeling_session_data (post-auth gating)', async () => {
    const transport = new ZooWebSocketTransport({ baseUrl: 'ws://fake.example/modeling-commands' });
    const spy = vi.fn();
    transport.onMessage(spy);

    const init = transport.initialize();
    await Promise.resolve();

    zooTestFakeSocketCapture.current?.testEmitMessage(
      JSON.stringify({
        success: true,
        request_id: 'pre-auth',
        resp: {
          type: 'modeling',
          data: { modeling_response: { type: 'empty' } },
        },
      }),
    );
    expect(spy).not.toHaveBeenCalled();

    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));
    await init;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ resp: { type: 'modeling_session_data' } });
    expect(spy.mock.calls[1]?.[1]).toMatchObject({ request_id: 'pre-auth' });
  });

  it.each([
    [1000, 'normal'],
    [1001, 'away'],
    [1006, 'abnormal'],
    [1011, 'error'],
  ] as const)('invokes onSocketClosed when the socket closes with code %i', async (code, reason) => {
    const transport = new ZooWebSocketTransport({ baseUrl: 'ws://fake.example/modeling-commands' });
    const onClosed = vi.fn();
    transport.onSocketClosed(onClosed);

    const init = transport.initialize();
    await Promise.resolve();
    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));
    await init;

    zooTestFakeSocketCapture.current?.close(code, reason);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it.each([
    { code: 4401, reason: 'UNAUTHENTICATED', expectedStatus: 401, messagePattern: /sign in to tau/i },
    { code: 4403, reason: 'PRO_KERNELS_REQUIRED', expectedStatus: 403, messagePattern: /pro subscription/i },
  ])(
    'maps the Tau billing-gate close code $code to a typed auth error before auth completes',
    async ({ code, reason, expectedStatus, messagePattern }) => {
      const transport = new ZooWebSocketTransport({ baseUrl: 'ws://fake.example/modeling-commands' });
      const init = transport.initialize();
      await Promise.resolve();

      zooTestFakeSocketCapture.current?.close(code, reason);

      const error = await init.then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(error).toBeInstanceOf(KclAuthError);
      expect((error as KclAuthError).statusCode).toBe(expectedStatus);
      expect((error as KclAuthError).message).toMatch(messagePattern);
    },
  );

  it('clears handlers on dispose', async () => {
    const transport = new ZooWebSocketTransport({ baseUrl: 'ws://fake.example/modeling-commands' });
    const spy = vi.fn();
    transport.onMessage(spy);

    void transport.initialize();
    await Promise.resolve();
    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));

    transport.dispose();
    spy.mockClear();
    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));
    expect(spy).not.toHaveBeenCalled();
  });
});
