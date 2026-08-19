import { describe, it, expect } from 'vitest';
import type { MessagePortLike, Port } from '@taucad/rpc';
import { createTransferredFileSystemBridgeProxy, exposeFileSystem, openFileSystemBridge } from '@taucad/fs-bridge';

import { _fromMemoryFsHandle as fromMemoryFS } from '#transport/_internal/from-memory-fs-handle.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import { createBridgeProxy, createBridgeServer } from '@taucad/rpc/bridge';

function makeFs(files?: Record<string, string>): RuntimeFileSystemBase {
  const handle = fromMemoryFS(files);
  if (handle.kind !== 'inline') {
    throw new Error('fromMemoryFS() must return the inline-kind handle.');
  }
  return handle.create();
}

/** Minimal in-process {@link Port} pair for bridging without `MessagePort`. */
function createLinkedMemoryPorts(): readonly [Port<unknown>, Port<unknown>] {
  const toA: unknown[] = [];
  const toB: unknown[] = [];
  let subA: ((data: unknown) => void) | undefined;
  let subB: ((data: unknown) => void) | undefined;

  const flushA = (): void => {
    if (!subA) {
      return;
    }
    while (toA.length > 0) {
      subA(toA.shift());
    }
  };

  const flushB = (): void => {
    if (!subB) {
      return;
    }
    while (toB.length > 0) {
      subB(toB.shift());
    }
  };

  const portA: Port<unknown> = {
    postMessage(data: unknown): void {
      toB.push(data);
      queueMicrotask(flushB);
    },
    onMessage(handler: (data: unknown) => void): () => void {
      subA = handler;
      queueMicrotask(flushA);
      return (): void => {
        subA = undefined;
      };
    },
    close(): void {
      void 0;
    },
  };

  const portB: Port<unknown> = {
    postMessage(data: unknown): void {
      toA.push(data);
      queueMicrotask(flushA);
    },
    onMessage(handler: (data: unknown) => void): () => void {
      subB = handler;
      queueMicrotask(flushB);
      return (): void => {
        subB = undefined;
      };
    },
    close(): void {
      void 0;
    },
  };

  return [portA, portB];
}

describe('bridge Port<T> round-trip', () => {
  it('readFile crosses a custom in-memory Port pair', async () => {
    type ReadService = { readFile(path: string, encoding: 'utf8'): Promise<string> };
    const helloPath = '/hello.txt';
    const fs = makeFs({ [helloPath]: 'from-port-bridge' });
    const [serverPort, clientPort] = createLinkedMemoryPorts();

    createBridgeServer(fs, serverPort);
    const proxy = createBridgeProxy<ReadService>(clientPort);

    await expect(proxy.readFile(helloPath, 'utf8')).resolves.toBe('from-port-bridge');
    proxy.dispose();
  });

  /**
   * X7 — the fs-bridge *entry helper*, not just the primitives. The client
   * port here is a plain object: `instanceof MessagePort === false`, no
   * `start`. The authority still receives a genuine `MessagePort` inside its
   * connect envelope, because the `instanceof MessagePort` connect guard
   * (`filesystem-bridge.ts:457`) is deliberately left in place.
   */
  it('drives createTransferredFileSystemBridgeProxy over a structural port', async () => {
    const helloPath = '/hello.txt';
    const fs = makeFs({ [helloPath]: 'from-structural-port' });
    // Node global `MessageChannel`, standing in for the worker boundary.
    const boundary = new MessageChannel();
    const exposed = exposeFileSystem(fs, { messageSource: boundary.port2 });
    const connection = openFileSystemBridge(boundary.port1);

    // Hide the real port behind an object carrying only the four members
    // `MessagePortLike` declares — no `start`, no prototype identity.
    const structuralPort: MessagePortLike = {
      postMessage(data: unknown, transfer?: Transferable[]): void {
        connection.port.postMessage(data, transfer ?? []);
      },
      addEventListener(type: 'message', listener: EventListener): void {
        connection.port.addEventListener(type, listener);
      },
      removeEventListener(type: 'message', listener: EventListener): void {
        connection.port.removeEventListener(type, listener);
      },
      close(): void {
        connection.port.close();
      },
    };
    expect(structuralPort instanceof MessagePort).toBe(false);
    expect('start' in structuralPort).toBe(false);

    const proxy = createTransferredFileSystemBridgeProxy(structuralPort);
    try {
      await proxy.ready;
      expect(proxy.hello.payload).toMatchObject({ v: 1, state: 'ready' });
      await expect(proxy.readFile(helloPath, 'utf8')).resolves.toBe('from-structural-port');
    } finally {
      proxy.dispose();
      exposed.cleanup();
      boundary.port1.close();
      boundary.port2.close();
    }
  });
});
