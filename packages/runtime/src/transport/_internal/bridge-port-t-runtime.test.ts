import { describe, it, expect } from 'vitest';
import type { Port } from '@taucad/rpc';

import { _fromMemoryFsHandle as fromMemoryFS } from '#transport/_internal/from-memory-fs-handle.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import { createBridgeProxy, createBridgeServer } from '#transport/_internal/runtime-filesystem-bridge.js';

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
    const helloPath = '/hello.txt';
    const fs = makeFs({ [helloPath]: 'from-port-bridge' });
    const [serverPort, clientPort] = createLinkedMemoryPorts();

    createBridgeServer(fs, serverPort);
    const proxy = createBridgeProxy<RuntimeFileSystemBase>(clientPort);

    await expect(proxy.readFile(helloPath, 'utf8')).resolves.toBe('from-port-bridge');
    proxy.dispose();
  });
});
