/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON fixtures use API field names */
// @vitest-environment node
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZooWebSocketTransport } from '#kernels/zoo/transport/zoo-websocket-transport.js';
import { KclError } from '#kernels/zoo/kcl-errors.js';
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

  it('completes initialize after modeling_session_data without sending Authorization headers when token is omitted', async () => {
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

  it('sends the Zoo authorization headers frame when token is provided', async () => {
    const transport = new ZooWebSocketTransport({
      baseUrl: 'ws://fake.example/modeling-commands',
      token: 'zoo-token',
    });
    const init = transport.initialize();

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(zooTestFakeSocketCapture.current?.sentFrames.map((frame) => JSON.parse(frame) as unknown)).toContainEqual({
      type: 'headers',
      headers: { Authorization: 'Bearer zoo-token' },
    });

    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));
    await init;
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
    { code: 4401, reason: 'UNAUTHENTICATED', message: 'Consumer-defined sign-in copy' },
    { code: 4403, reason: 'ENTITLEMENT_REQUIRED', message: 'Consumer-defined entitlement copy' },
  ])('maps injected close-error copy for code $code before auth completes', async ({ code, reason, message }) => {
    const transport = new ZooWebSocketTransport({
      baseUrl: 'ws://fake.example/modeling-commands',
      closeErrors: { [code]: message },
    });
    const init = transport.initialize();
    await Promise.resolve();

    zooTestFakeSocketCapture.current?.close(code, reason);

    const error = await init.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(error).toBeInstanceOf(KclError);
    expect((error as KclError).msg).toBe(message);
  });

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
