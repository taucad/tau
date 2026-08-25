/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON fixtures use API field names */
// @vitest-environment node
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZooEngineBridge } from '#bridge/zoo-engine-bridge.js';
import type { WebSocketRequest, WebSocketResponse, ZooWebSocketTransport } from '#transport/zoo-websocket-transport.js';

type MessageHandler = (raw: Uint8Array<ArrayBuffer>, decoded: WebSocketResponse) => void;

/**
 * Minimal transport double for bridge rejection-shape tests — no real WebSocket.
 */
class MockZooTransport {
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly socketClosedHandlers = new Set<() => void>();
  private connectedFlag = true;

  public get connected(): boolean {
    return this.connectedFlag;
  }

  public setConnected(value: boolean): void {
    this.connectedFlag = value;
  }

  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  public onSocketClosed(handler: () => void): () => void {
    this.socketClosedHandlers.add(handler);
    return () => {
      this.socketClosedHandlers.delete(handler);
    };
  }

  public sendRaw(_message: WebSocketRequest): void {
    /* No-op */
  }

  public emitDecoded(decoded: WebSocketResponse): void {
    const raw = new Uint8Array(msgpackEncode(decoded));
    for (const handler of this.messageHandlers) {
      handler(raw, decoded);
    }
  }

  public emitSocketClosed(): void {
    for (const handler of this.socketClosedHandlers) {
      handler();
    }
  }

  public asTransport(): ZooWebSocketTransport {
    return this as unknown as ZooWebSocketTransport;
  }
}

const startPathCmd = JSON.stringify({
  type: 'modeling_cmd_req',
  cmd: { type: 'start_path' },
});

function assertJsonFailureString(value: unknown, expectedErrorCode: string): void {
  expect(typeof value).toBe('string');
  const parsed = JSON.parse(value as string) as {
    success: false;
    errors: Array<{ error_code: string; message: string }>;
    request_id?: string;
  };
  expect(parsed.success).toBe(false);
  expect(parsed.errors[0]?.error_code).toBe(expectedErrorCode);
}

describe('ZooEngineBridge rejection shape (Rust conn_wasm JSON-string contract)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('rejects with JSON string FailureWebSocketResponse on engine success:false for the pending command', async () => {
    const transport = new MockZooTransport();
    const bridge = new ZooEngineBridge(transport.asTransport());

    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const sendPromise = bridge.sendModelingCommandFromWasm(id, '[]', startPathCmd, '{}');

    transport.emitDecoded({
      success: false,
      request_id: id,
      errors: [{ error_code: 'precondition_failed', message: 'plane not found' }],
    } as unknown as WebSocketResponse);

    let rejection: unknown;
    try {
      await sendPromise;
    } catch (error) {
      rejection = error;
    }

    assertJsonFailureString(rejection, 'precondition_failed');
    const parsed = JSON.parse(rejection as string) as { errors: Array<{ message: string }> };
    expect(parsed.errors[0]?.message).toContain('plane not found');

    bridge.dispose();
  });

  it('rejects with JSON string on command timeout', async () => {
    const transport = new MockZooTransport();
    const bridge = new ZooEngineBridge(transport.asTransport());

    const id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const sendPromise = bridge.sendModelingCommandFromWasm(id, '[]', startPathCmd, '{}');

    const rejectionAssertion = expect(sendPromise).rejects.toSatisfy((value: unknown) => {
      assertJsonFailureString(value, 'timeout');
      return true;
    });

    await vi.advanceTimersByTimeAsync(30_001);
    await rejectionAssertion;

    bridge.dispose();
  });

  it('rejects with JSON string when dispose() runs while pending', async () => {
    const transport = new MockZooTransport();
    const bridge = new ZooEngineBridge(transport.asTransport());

    const id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const sendPromise = bridge.sendModelingCommandFromWasm(id, '[]', startPathCmd, '{}');

    bridge.dispose();

    let rejection: unknown;
    try {
      await sendPromise;
    } catch (error) {
      rejection = error;
    }

    assertJsonFailureString(rejection, 'bridge_disposed');
  });

  it('rejects with JSON string when the socket closes while pending', async () => {
    const transport = new MockZooTransport();
    const bridge = new ZooEngineBridge(transport.asTransport());

    const id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const sendPromise = bridge.sendModelingCommandFromWasm(id, '[]', startPathCmd, '{}');

    transport.emitSocketClosed();

    let rejection: unknown;
    try {
      await sendPromise;
    } catch (error) {
      rejection = error;
    }

    assertJsonFailureString(rejection, 'connection_problem');
  });

  it('rejects with JSON string when transport.connected is false', async () => {
    const transport = new MockZooTransport();
    transport.setConnected(false);
    const bridge = new ZooEngineBridge(transport.asTransport());

    const sendPromise = bridge.sendModelingCommandFromWasm(
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      '[]',
      startPathCmd,
      '{}',
    );

    let rejection: unknown;
    try {
      await sendPromise;
    } catch (error) {
      rejection = error;
    }

    assertJsonFailureString(rejection, 'connection_problem');
  });
});
