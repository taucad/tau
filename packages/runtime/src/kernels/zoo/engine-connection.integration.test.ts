/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON fixtures use API field names */
// @vitest-environment node
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineConnection } from '#kernels/zoo/engine-connection.js';
import { FileSystemManager } from '#kernels/zoo/filesystem-manager.js';
import {
  zooTestInstallFakeWebSocket,
  zooTestFakeSocketCapture,
  zooTestRestoreWebSocket,
} from '#kernels/zoo/zoo-fake-websocket.js';
import type { WasmModule } from '#kernels/zoo/zoo-wasm-module.types.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';

const authSuccess = {
  success: true,
  resp: {
    type: 'modeling_session_data',
    data: {
      session: { api_call_id: 'test-session' },
    },
  },
} as const;

const noopFs = (): KernelFileSystem =>
  ({
    readFile: async () => new Uint8Array(),
    exists: async () => false,
    readdir: async () => [],
  }) as unknown as KernelFileSystem;

describe('EngineConnection (transport + session wiring)', () => {
  let OriginalWebSocket: typeof WebSocket;

  beforeEach(() => {
    OriginalWebSocket = zooTestInstallFakeWebSocket();
  });

  afterEach(() => {
    zooTestRestoreWebSocket(OriginalWebSocket);
  });

  it('forwards WebSocket frames to Context.sendResponse after initialize', async () => {
    const received: Array<Uint8Array<ArrayBuffer>> = [];

    const wasmModule = {
      Context: class {
        public constructor(_bridge: unknown, _fs: unknown) {
          void _bridge;
          void _fs;
        }

        public async sendResponse(data: Uint8Array<ArrayBuffer>): Promise<void> {
          received.push(new Uint8Array(data));
        }
      },
    } as unknown as WasmModule;

    const conn = new EngineConnection({
      baseUrl: 'ws://fake.example/modeling-commands',
      wasmModule,
      fileSystemManager: new FileSystemManager(noopFs()),
    });

    const init = conn.initialize();
    await Promise.resolve();
    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));
    await init;

    const payload = {
      success: true,
      request_id: 'engine-conn-test',
      resp: {
        type: 'modeling',
        data: { modeling_response: { type: 'empty' } },
      },
    } as const;

    const encoded = new Uint8Array(msgpackEncode(payload));
    zooTestFakeSocketCapture.current?.testEmitMessage(
      encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
    );

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received.at(-1)).toEqual(encoded);

    await conn.cleanup();
  });

  it('subscribes onSessionClosed and fires when the socket closes', async () => {
    const wasmModule = {
      Context: class {
        public constructor(_bridge: unknown, _fs: unknown) {
          void _bridge;
          void _fs;
        }
      },
    } as unknown as WasmModule;

    const conn = new EngineConnection({
      baseUrl: 'ws://fake.example/modeling-commands',
      wasmModule,
      fileSystemManager: new FileSystemManager(noopFs()),
    });

    const init = conn.initialize();
    await Promise.resolve();
    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));
    await init;

    const onClosed = vi.fn();
    conn.onSessionClosed(onClosed);
    zooTestFakeSocketCapture.current?.close(1006, 'idle');
    expect(onClosed).toHaveBeenCalledTimes(1);

    await conn.cleanup();
  });

  it('onSessionClosed before initialize returns a no-op unsubscriber', () => {
    const wasmModule = { Context: class {} } as unknown as WasmModule;
    const conn = new EngineConnection({
      baseUrl: 'ws://fake.example/modeling-commands',
      wasmModule,
      fileSystemManager: new FileSystemManager(noopFs()),
    });
    const unsub = conn.onSessionClosed(() => {
      /* No Session */
    });
    expect(() => {
      unsub();
    }).not.toThrow();
  });

  it('initialize cleans up an existing session before opening a new one', async () => {
    const wasmModule = {
      Context: class {
        public constructor(_bridge: unknown, _fs: unknown) {
          void _bridge;
          void _fs;
        }
      },
    } as unknown as WasmModule;

    const conn = new EngineConnection({
      baseUrl: 'ws://fake.example/modeling-commands',
      wasmModule,
      fileSystemManager: new FileSystemManager(noopFs()),
    });

    const first = conn.initialize();
    await Promise.resolve();
    const socket1 = zooTestFakeSocketCapture.current;
    expect(socket1).toBeDefined();
    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));
    await first;

    const second = conn.initialize();
    let socket2 = zooTestFakeSocketCapture.current;
    const deadline = Date.now() + 5000;
    while (socket2 === socket1 && Date.now() < deadline) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      socket2 = zooTestFakeSocketCapture.current;
    }

    expect(socket2).toBeDefined();
    expect(socket2).not.toBe(socket1);
    zooTestFakeSocketCapture.current?.testEmitMessage(JSON.stringify(authSuccess));
    await second;

    await conn.cleanup();
  });
});
