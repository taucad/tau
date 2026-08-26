/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON fixtures use API field names */
// @vitest-environment node
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileWasmStreaming } from '@taucad/runtime/kernel';
import type { KernelFileSystem } from '@taucad/runtime/kernel';
import { FileSystemManager } from '#filesystem-manager.js';
import { ZooEngineBridge } from '#bridge/zoo-engine-bridge.js';
import { KclWasmError, extractWasmKclError } from '#kcl-errors.js';
import { kclWasmUrl } from '#kcl-utils.js';
import type { WebSocketRequest, WebSocketResponse, ZooWebSocketTransport } from '#transport/zoo-websocket-transport.js';
import type { WasmModule } from '#zoo-wasm-module.types.js';

type MessageHandler = (raw: Uint8Array<ArrayBuffer>, decoded: WebSocketResponse) => void;

/**
 * Emits a failure for the first `modeling_cmd_req` so Rust receives a structured engine error (JSON-string reject).
 */
class FirstCommandFailsTransport {
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly socketClosedHandlers = new Set<() => void>();

  public get connected(): boolean {
    return true;
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

  public sendRaw(message: WebSocketRequest): void {
    if (message.type !== 'modeling_cmd_req') {
      return;
    }

    const requestId = message.cmd_id;
    queueMicrotask(() => {
      const decoded = {
        success: false,
        request_id: requestId,
        errors: [{ error_code: 'precondition_failed', message: 'plane not found' }],
      } as unknown as WebSocketResponse;
      const raw = new Uint8Array(msgpackEncode(decoded));
      for (const handler of this.messageHandlers) {
        handler(raw, decoded);
      }
    });
  }

  public asTransport(): ZooWebSocketTransport {
    return this as unknown as ZooWebSocketTransport;
  }
}

const memoryFs = (): KernelFileSystem => {
  const files = new Map<string, string>([['/main.kcl', 'x = 1\n']]);
  return {
    async readFile(path: string) {
      const hit = files.get(path);
      if (hit === undefined) {
        throw new Error(`ENOENT ${path}`);
      }

      return new TextEncoder().encode(hit);
    },
    async exists(path: string) {
      return files.has(path);
    },
    async readdir(path: string) {
      if (path === '/' || path === '') {
        return ['main.kcl'];
      }

      return [];
    },
  } as unknown as KernelFileSystem;
};

describe('KCL WASM engine rejection round-trip (JSON-string reject → visible engine message)', () => {
  let wasm: WasmModule;

  beforeAll(async () => {
    wasm = await import('@taucad/kcl-wasm-lib');
    const compiled = await compileWasmStreaming(kclWasmUrl);
    await wasm.default({ module_or_path: compiled });
  }, 120_000);

  it('surfaces precondition_failed / plane not found from the bridge; not the generic send promise string', async () => {
    const transport = new FirstCommandFailsTransport();
    const bridge = new ZooEngineBridge(transport.asTransport());
    const fs = new FileSystemManager(memoryFs());

    // oxlint-disable-next-line @typescript-eslint/await-thenable -- wasm-bindgen Context constructor is Promise-like
    const context = await new wasm.Context(bridge, fs);
    const unsubscribePipe = transport.onMessage((raw) => {
      void context.sendResponse(raw);
    });

    const parseResult = wasm.parse_wasm('x = 1\n') as [unknown, Array<{ severity: string }>];
    const [programNode, issues] = parseResult;
    expect(issues.filter((issue) => issue.severity === 'Error')).toEqual([]);

    let caught: unknown;
    try {
      await context.execute(JSON.stringify(programNode), 'main.kcl', '{}');
    } catch (error) {
      caught = error;
    } finally {
      unsubscribePipe();
      bridge.dispose();
    }

    expect(caught).toBeDefined();

    const wasmError = extractWasmKclError(caught);
    expect(wasmError).toBeDefined();
    const wrapped = new KclWasmError(wasmError!);
    const message = wrapped.msg.toLowerCase();
    expect(message).toContain('precondition_failed');
    expect(message).toContain('plane not found');
    expect(message).not.toContain('failed to wait for promise from send modeling command');
  });
});
