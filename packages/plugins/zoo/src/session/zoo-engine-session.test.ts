/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON fixtures use API field names */
// @vitest-environment node
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { describe, expect, it, vi } from 'vitest';
import { ZooEngineBridge } from '#bridge/zoo-engine-bridge.js';
import { ZooEngineSession } from '#session/zoo-engine-session.js';
import type { WebSocketResponse, ZooWebSocketTransport } from '#transport/zoo-websocket-transport.js';
import { FileSystemManager } from '#filesystem-manager.js';
import type { WasmModule } from '#zoo-wasm-module.types.js';
import type { KernelFileSystem } from '@taucad/runtime/kernel';

type TransportStub = {
  connected: boolean;
  onMessageHandlers: Set<(raw: Uint8Array<ArrayBuffer>, decoded: WebSocketResponse) => void>;
  onSocketClosedHandlers: Set<() => void>;
  onMessage: ZooWebSocketTransport['onMessage'];
  onSocketClosed: ZooWebSocketTransport['onSocketClosed'];
  emit: (raw: Uint8Array<ArrayBuffer>, decoded: WebSocketResponse) => void;
  dispose: () => void;
};

function createTransportStub(options?: { connected?: boolean }): TransportStub & { connected: boolean } {
  const connected = options?.connected ?? true;
  const onMessageHandlers = new Set<(raw: Uint8Array<ArrayBuffer>, decoded: WebSocketResponse) => void>();
  const onSocketClosedHandlers = new Set<() => void>();
  return {
    connected,
    onMessageHandlers,
    onSocketClosedHandlers,
    onMessage(handler) {
      onMessageHandlers.add(handler);
      return () => {
        onMessageHandlers.delete(handler);
      };
    },
    onSocketClosed(handler) {
      onSocketClosedHandlers.add(handler);
      return () => {
        onSocketClosedHandlers.delete(handler);
      };
    },
    emit(raw, decoded) {
      for (const handler of onMessageHandlers) {
        handler(raw, decoded);
      }
    },
    dispose() {
      onMessageHandlers.clear();
      onSocketClosedHandlers.clear();
    },
  };
}

const noopKernelFs = (): KernelFileSystem =>
  ({
    readFile: async () => new Uint8Array(),
    exists: async () => false,
    readdir: async () => [],
  }) as unknown as KernelFileSystem;

describe('ZooEngineSession', () => {
  it('pipes transport raw frames to Context.sendResponse after openContext', async () => {
    const stub = createTransportStub();
    const transport = stub as unknown as ZooWebSocketTransport;

    const sendResponse = vi.fn(async (_data: Uint8Array<ArrayBuffer>) => {
      /* Drain handler bytes */
    });

    const wasmModule = {
      Context: class {
        public constructor(_bridge: unknown, _fs: unknown) {
          void _bridge;
          void _fs;
        }

        public async sendResponse(data: Uint8Array<ArrayBuffer>): Promise<void> {
          await sendResponse(data);
        }
      },
    } as unknown as WasmModule;

    const bridge = new ZooEngineBridge(transport);

    const fileSystemManager = new FileSystemManager(noopKernelFs());
    const session = new ZooEngineSession({ transport, bridge, fileSystemManager, wasmModule });

    await session.openContext();

    const payload: WebSocketResponse = {
      success: true,
      request_id: 'abc',
      resp: {
        type: 'modeling',
        data: { modeling_response: { type: 'empty' } },
      },
    };

    const raw = new Uint8Array(msgpackEncode(payload));
    stub.emit(raw, payload);

    expect(sendResponse).toHaveBeenCalledTimes(1);
    const firstArgument = sendResponse.mock.calls[0]?.[0];
    expect(firstArgument).toBeDefined();
    expect(new Uint8Array(firstArgument!)).toEqual(raw);

    session.dispose();
  });

  it('openContext throws when the transport is not connected', async () => {
    const stub = createTransportStub({ connected: false });
    const transport = stub as unknown as ZooWebSocketTransport;
    const bridge = new ZooEngineBridge(transport);
    const fileSystemManager = new FileSystemManager(noopKernelFs());
    const wasmModule = {} as unknown as WasmModule;
    const session = new ZooEngineSession({ transport, bridge, fileSystemManager, wasmModule });

    await expect(session.openContext()).rejects.toThrow(/openContext requires a connected transport/);

    session.dispose();
  });
});
