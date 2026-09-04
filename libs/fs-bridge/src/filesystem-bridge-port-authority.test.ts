/**
 * The authority served over a bare {@link Port} pair — no `MessagePort`, no
 * worker, no connect envelope. This is the socket topology: the dialler runs
 * the bridge *client* and the dialee runs the bridge *server*, which is the
 * inverse of the RPC roles in the worker topology.
 *
 * The pair also simulates a binary codec by mapping every `undefined` to
 * `null` on the wire, exactly as msgpack's nil does — which is what makes the
 * void `writeFile` response a real test of the widened `voidResult`.
 */

import { describe, expect, it, vi } from 'vitest';
import type { WatchEvent, WatchRequest } from '@taucad/filesystem';
import type { Port } from '@taucad/rpc';
import { createBridgeServer } from '@taucad/rpc/bridge';
import { createFileSystemBridgeProxy } from '#filesystem-bridge.js';
import { createFileSystemBridgeHello, fileSystemBridgeSchemas } from '#filesystem-bridge-protocol.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Map `undefined` to `null` throughout, as a msgpack nil round trip does. */
const asNil = (value: unknown): unknown => {
  if (value === undefined) {
    return null;
  }
  if (value instanceof Uint8Array || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => asNil(entry));
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, asNil(entry)]));
};

const createPortEnd = (): {
  receive: (data: unknown) => void;
  port: (send: (data: unknown) => void) => Port<unknown>;
} => {
  const buffered: unknown[] = [];
  let handler: ((data: unknown) => void) | undefined;
  return {
    receive: (data) => {
      queueMicrotask(() => {
        if (handler) {
          handler(data);
        } else {
          buffered.push(data);
        }
      });
    },
    port: (send) => ({
      postMessage: send,
      onMessage(next) {
        handler = next;
        for (const data of buffered.splice(0)) {
          next(data);
        }
        return () => {
          handler = undefined;
        };
      },
      close: () => undefined,
    }),
  };
};

/** A codec-shaped port pair: frames are cloned and nil-mapped in transit. */
const createCodecPortPair = (): readonly [Port<unknown>, Port<unknown>] => {
  const a = createPortEnd();
  const b = createPortEnd();
  return [
    a.port((data) => {
      b.receive(asNil(structuredClone(data)));
    }),
    b.port((data) => {
      a.receive(asNil(structuredClone(data)));
    }),
  ];
};

const createAuthority = (
  seed: Record<string, string>,
): {
  handlers: Record<string, unknown>;
  capabilities: {
    persistent: boolean;
    writable: boolean;
    quotaBased: boolean;
    durability: 'ephemeral';
  };
} => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>(
    Object.entries(seed).map(([path, content]) => [path, encoder.encode(content)]),
  );
  let watcher: ((event: WatchEvent) => void) | undefined;
  return {
    capabilities: { persistent: false, writable: true, quotaBased: false, durability: 'ephemeral' },
    handlers: {
      async readFile(
        path: string,
        options?: 'utf8' | { readonly encoding?: 'utf8' },
      ): Promise<string | Uint8Array<ArrayBuffer>> {
        const bytes = files.get(path);
        if (!bytes) {
          throw new Error(`ENOENT: ${path}`);
        }
        const utf8 = options === 'utf8' || (typeof options === 'object' && options.encoding === 'utf8');
        return utf8 ? decoder.decode(bytes) : bytes;
      },
      async writeFile(path: string, data: string | Uint8Array<ArrayBuffer>): Promise<void> {
        files.set(path, typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data));
        watcher?.({ type: 'change', path });
      },
      watch(_request: WatchRequest, handler: (event: WatchEvent) => void): () => void {
        watcher = handler;
        return () => {
          watcher = undefined;
        };
      },
    },
  };
};

describe('filesystem bridge authority over a Port pair (dialler = client, dialee = server)', () => {
  it('completes hello, reads, a void write and a live watch event', async () => {
    const { handlers, capabilities } = createAuthority({ 'main.ts': 'export default 1;\n' });
    const [dialeePort, diallerPort] = createCodecPortPair();
    const server = createBridgeServer(handlers, dialeePort, {
      hello: createFileSystemBridgeHello({ state: 'ready', capabilities, watchable: true }),
      protocolSchemas: fileSystemBridgeSchemas,
    });
    const proxy = createFileSystemBridgeProxy({ port: diallerPort, dispose: () => undefined });

    try {
      await proxy.ready;
      expect(proxy.hello.payload).toEqual({ v: 1, state: 'ready', capabilities, watchable: true });

      await expect(proxy.readFile('main.ts', 'utf8')).resolves.toBe('export default 1;\n');
      await expect(proxy.readFile('main.ts')).resolves.toEqual(encoder.encode('export default 1;\n'));

      const events: WatchEvent[] = [];
      const subscription = proxy.watchReady({ paths: ['dep.ts'] }, (event) => {
        events.push(event);
      });
      await subscription.ready;

      /* A void result: `undefined` crosses the wire as nil and arrives as
       * `null`. Before `voidResult` was widened this rejected with
       * "Expected no result" and the mutation never settled; the validator
       * normalises the nil back to `undefined` so every transport agrees. */
      await expect(proxy.writeFile('dep.ts', 'export default 2;\n')).resolves.toBeUndefined();
      await expect(proxy.readFile('dep.ts', 'utf8')).resolves.toBe('export default 2;\n');

      await vi.waitFor(() => {
        expect(events).toEqual([{ type: 'change', path: 'dep.ts' }]);
      });

      subscription.unsubscribe();
    } finally {
      proxy.dispose();
      server.dispose();
    }
  });
});
