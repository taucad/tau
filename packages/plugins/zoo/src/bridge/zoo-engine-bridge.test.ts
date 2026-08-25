/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON fixtures use API field names */
// @vitest-environment node
import { decode as msgpackDecode } from '@msgpack/msgpack';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZooEngineBridge, assignModelingCommandRequestId } from '#bridge/zoo-engine-bridge.js';
import { ZooWebSocketTransport } from '#transport/zoo-websocket-transport.js';
import {
  zooTestInstallFakeWebSocket,
  zooTestFakeSocketCapture,
  zooTestRestoreWebSocket,
} from '#testing/zoo-fake-websocket.js';

const authSuccess = {
  success: true,
  resp: {
    type: 'modeling_session_data',
    data: {
      session: { api_call_id: 'test-session' },
    },
  },
} as const;

const startPathCmd = JSON.stringify({
  type: 'modeling_cmd_req',
  cmd: { type: 'start_path' },
});

async function readyTransport(): Promise<ZooWebSocketTransport> {
  const transport = new ZooWebSocketTransport({ baseUrl: 'ws://fake.example/modeling-commands' });
  const init = transport.initialize();
  await Promise.resolve();
  zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));
  await init;
  return transport;
}

describe('ZooEngineBridge', () => {
  let OriginalWebSocket: typeof WebSocket;

  beforeEach(() => {
    OriginalWebSocket = zooTestInstallFakeWebSocket();
  });

  afterEach(() => {
    zooTestRestoreWebSocket(OriginalWebSocket);
  });

  it('sendModelingCommandFromWasm assigns cmd_id from the id argument and resolves msgpack', async () => {
    const transport = await readyTransport();
    const bridge = new ZooEngineBridge(transport);

    const id = '11111111-1111-1111-1111-111111111111';
    const sendPromise = bridge.sendModelingCommandFromWasm(id, '[]', startPathCmd, '{}');

    const parsedFirst = JSON.parse(zooTestFakeSocketCapture.current?.sentFrames.at(-1) ?? '{}') as { cmd_id?: string };
    expect(parsedFirst.cmd_id).toBe(id);

    const response = {
      success: true,
      request_id: id,
      resp: {
        type: 'modeling',
        data: { modeling_response: { type: 'empty' } },
      },
    } as const;

    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(response));

    const bytes = await sendPromise;
    const decoded = msgpackDecode(bytes) as { success: boolean; request_id?: string };
    expect(decoded.success).toBe(true);
    expect(decoded.request_id).toBe(id);

    bridge.dispose();
    transport.dispose();
  });

  it('fireModelingCommandFromWasm sends without local promise tracking', async () => {
    const transport = await readyTransport();
    const bridge = new ZooEngineBridge(transport);

    const id = '22222222-2222-2222-2222-222222222222';
    bridge.fireModelingCommandFromWasm(id, '[]', startPathCmd, '{}');

    const parsed = JSON.parse(zooTestFakeSocketCapture.current?.sentFrames.at(-1) ?? '{}') as { cmd_id?: string };
    expect(parsed.cmd_id).toBe(id);

    bridge.dispose();
    transport.dispose();
  });

  it('rejects pending sends when the socket closes', async () => {
    const transport = await readyTransport();
    const bridge = new ZooEngineBridge(transport);

    const id = '33333333-3333-3333-3333-333333333333';
    const pending = bridge.sendModelingCommandFromWasm(id, '[]', startPathCmd, '{}');

    zooTestFakeSocketCapture.current?.close(1006, 'gone');

    await expect(pending).rejects.toSatisfy((value: unknown) => {
      expect(typeof value).toBe('string');
      const parsed = JSON.parse(value as string) as { errors: Array<{ error_code: string }> };
      expect(parsed.errors[0]?.error_code).toBe('connection_problem');
      return true;
    });

    bridge.dispose();
    transport.dispose();
  });

  it('fan-outs modeling_batch sub-responses to per-command pending entries', async () => {
    const transport = await readyTransport();
    const bridge = new ZooEngineBridge(transport);

    const subId = '44444444-4444-4444-4444-444444444444';
    const batchId = '55555555-5555-5555-5555-555555555555';

    const batchRequest = JSON.stringify({
      type: 'modeling_cmd_batch_req',
      requests: [],
      responses: true,
    });

    const pSub = bridge.sendModelingCommandFromWasm(subId, '[]', startPathCmd, '{}');
    const pBatch = bridge.sendModelingCommandFromWasm(batchId, '[]', batchRequest, '{}');

    zooTestFakeSocketCapture.current?.testEmitMessage(
      JSON.stringify({
        success: true,
        request_id: batchId,
        resp: {
          type: 'modeling_batch',
          data: {
            responses: {
              [subId]: { response: { type: 'empty' } },
            },
          },
        },
      }),
    );

    const subBytes = await pSub;
    const subDecoded = msgpackDecode(subBytes) as { success: boolean; request_id?: string };
    expect(subDecoded.request_id).toBe(subId);

    const batchBytes = await pBatch;
    const batchDecoded = msgpackDecode(batchBytes) as { resp: { type: string } };
    expect(batchDecoded.resp.type).toBe('modeling_batch');

    bridge.dispose();
    transport.dispose();
  });

  it('startNewSession resolves without IO', async () => {
    const transport = await readyTransport();
    const bridge = new ZooEngineBridge(transport);
    await expect(bridge.startNewSession()).resolves.toBeUndefined();
    bridge.dispose();
    transport.dispose();
  });

  it('rejects sendModelingCommandFromWasm when the transport is not initialized', async () => {
    const transport = new ZooWebSocketTransport({ baseUrl: 'ws://fake.example/modeling-commands' });
    const bridge = new ZooEngineBridge(transport);

    await expect(
      bridge.sendModelingCommandFromWasm('66666666-6666-6666-6666-666666666666', '[]', startPathCmd, '{}'),
    ).rejects.toSatisfy((value: unknown) => {
      expect(typeof value).toBe('string');
      const parsed = JSON.parse(value as string) as { errors: Array<{ error_code: string }> };
      expect(parsed.errors[0]?.error_code).toBe('connection_problem');
      return true;
    });

    bridge.dispose();
    transport.dispose();
  });

  it('fireModelingCommandFromWasm throws Error with JSON-serialized FailureWebSocketResponse for malformed command JSON', async () => {
    const transport = await readyTransport();
    const bridge = new ZooEngineBridge(transport);

    expect(() => {
      bridge.fireModelingCommandFromWasm('88888888-8888-8888-8888-888888888888', '[]', 'not-json', '{}');
    }).toThrow();

    try {
      bridge.fireModelingCommandFromWasm('88888888-8888-8888-8888-888888888888', '[]', 'not-json', '{}');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const parsed = JSON.parse((error as Error).message) as {
        success: boolean;
        errors: Array<{ error_code: string }>;
      };
      expect(parsed.success).toBe(false);
      expect(parsed.errors[0]?.error_code).toBe('fire_modeling_cmd_failed');
    }

    bridge.dispose();
    transport.dispose();
  });

  it('assignModelingCommandRequestId throws for non-modeling WebSocketRequest types', () => {
    expect(() => {
      assignModelingCommandRequestId({ type: 'ping' }, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    }).toThrow(/Unexpected WebSocketRequest/);
  });

  it('flushPending resolves after all pending send commands settle', async () => {
    const transport = await readyTransport();
    const bridge = new ZooEngineBridge(transport);

    const id = '77777777-7777-7777-7777-777777777777';
    const sendPromise = bridge.sendModelingCommandFromWasm(id, '[]', startPathCmd, '{}');
    const flushPromise = bridge.flushPending();

    zooTestFakeSocketCapture.current?.testEmitMessage(
      JSON.stringify({
        success: true,
        request_id: id,
        resp: {
          type: 'modeling',
          data: { modeling_response: { type: 'empty' } },
        },
      }),
    );

    await flushPromise;
    await sendPromise;

    bridge.dispose();
    transport.dispose();
  });
});
