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
import {
  ChangeEventBus,
  CrossTabCoordinator,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  WorkspaceFileService,
} from '@taucad/filesystem';
import type { CheckedFileWrite, CheckedFileWriteResult, WatchEvent, WatchRequest } from '@taucad/filesystem';
import { wrapMessagePort } from '@taucad/rpc';
import type { Port } from '@taucad/rpc';
import { createBridgeServer } from '@taucad/rpc/bridge';
import { createFileSystemBridgePort, createFileSystemBridgeProxy } from '#filesystem-bridge.js';
import { createFileSystemBridgeHello, fileSystemBridgeSchemas } from '#filesystem-bridge-protocol.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const messagePort = (port: MessagePort, label: string): Port<unknown> => wrapMessagePort(port, { label });
const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

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
      async writeFileChecked(input: Omit<CheckedFileWrite, 'signal'>): Promise<CheckedFileWriteResult> {
        const conflicts = input.preconditions.flatMap((precondition) => {
          const actual = files.get(precondition.path) ?? null;
          const expected =
            precondition.expected === null
              ? null
              : typeof precondition.expected === 'string'
                ? encoder.encode(precondition.expected)
                : precondition.expected;
          const same = actual === null ? expected === null : expected !== null && bytesEqual(actual, expected);
          return same ? [] : [{ path: precondition.path, actual }];
        });
        if (conflicts.length > 0) {
          return { status: 'conflict', conflicts };
        }
        const content = typeof input.data === 'string' ? encoder.encode(input.data) : new Uint8Array(input.data);
        files.set(input.path, content);
        return { status: 'applied', content };
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
      await expect(
        proxy.writeFileChecked({
          path: 'dep.ts',
          data: encoder.encode('export default 3;\n'),
          preconditions: [{ path: 'dep.ts', expected: encoder.encode('export default 2;\n') }],
        }),
      ).resolves.toEqual({ status: 'applied', content: encoder.encode('export default 3;\n') });

      await vi.waitFor(() => {
        expect(events).toEqual([{ type: 'change', path: 'dep.ts' }]);
      });

      subscription.unsubscribe();
    } finally {
      proxy.dispose();
      server.dispose();
    }
  });

  it('should preserve a known-not-applied checked-write refusal through the real bridge', async () => {
    vi.stubGlobal('navigator', {});
    const providerRegistry = new ProviderRegistry();
    const scope = { backend: 'memory', storageRootKey: 'memory:checked-refusal-bridge' } as const;
    const provider = await providerRegistry.getProvider(scope);
    const mountTable = new MountTable();
    mountTable.mount('/', provider, {
      class: 'authored',
      backend: 'memory',
      storageRootKey: providerRegistry.resolveStorageRootKey(scope),
    });
    const service = new WorkspaceFileService({
      providerRegistry,
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
      crossTabCoordinator: new CrossTabCoordinator(),
      mountTable,
    });
    const connection = createFileSystemBridgePort(service.createRootedFileSystem('/'));
    const proxy = createFileSystemBridgeProxy(connection);

    try {
      await proxy.ready;
      await expect(
        proxy.writeFileChecked({
          path: 'target.txt',
          data: 'new',
          preconditions: [{ path: 'target.txt', expected: null }],
        }),
      ).rejects.toMatchObject({
        code: 'CHECKED_WRITE_UNSUPPORTED',
        applicationState: 'known-not-applied',
        metadata: { applicationState: 'known-not-applied' },
      });
    } finally {
      proxy.dispose();
      service.dispose();
      vi.unstubAllGlobals();
    }
  });

  it('classifies a checked-write acknowledgement timeout as potentially applied without retrying', async () => {
    const channel = new MessageChannel();
    let releaseReply!: () => void;
    const replyGate = new Promise<void>((resolve) => {
      releaseReply = resolve;
    });
    let applied = false;
    const writeFileChecked = vi.fn(async (): Promise<CheckedFileWriteResult> => {
      applied = true;
      await replyGate;
      return { status: 'applied', content: encoder.encode('new') };
    });
    const server = createBridgeServer(
      { writeFileChecked },
      messagePort(channel.port1, 'fs-bridge-checked-timeout-server'),
      {
        hello: createFileSystemBridgeHello({
          state: 'ready',
          capabilities: { persistent: false, writable: true, quotaBased: false, durability: 'ephemeral' },
          watchable: false,
        }),
        protocolSchemas: fileSystemBridgeSchemas,
      },
    );
    const proxy = createFileSystemBridgeProxy({
      port: messagePort(channel.port2, 'fs-bridge-checked-timeout-client'),
      dispose: () => {
        channel.port2.close();
      },
    });

    try {
      await proxy.ready;
      vi.useFakeTimers();
      const pending = proxy.writeFileChecked({ path: 'target.txt', data: 'new', preconditions: [] });
      const rejection = expect(pending).rejects.toMatchObject({
        applicationState: 'potentially-applied',
        metadata: { applicationState: 'potentially-applied' },
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await rejection;
      expect(applied).toBe(true);
      expect(writeFileChecked).toHaveBeenCalledOnce();
      releaseReply();
      await vi.advanceTimersByTimeAsync(0);
      expect(writeFileChecked).toHaveBeenCalledOnce();
    } finally {
      releaseReply();
      proxy.dispose();
      server.dispose();
      vi.useRealTimers();
    }
  });

  it('classifies connection loss after a checked write starts as potentially applied without retrying', async () => {
    const channel = new MessageChannel();
    let markApplied!: () => void;
    const applied = new Promise<void>((resolve) => {
      markApplied = resolve;
    });
    const writeFileChecked = vi.fn(async () => {
      markApplied();
      return new Promise<CheckedFileWriteResult>(() => {
        void 0;
      });
    });
    const server = createBridgeServer(
      { writeFileChecked },
      messagePort(channel.port1, 'fs-bridge-checked-loss-server'),
      {
        hello: createFileSystemBridgeHello({
          state: 'ready',
          capabilities: { persistent: false, writable: true, quotaBased: false, durability: 'ephemeral' },
          watchable: false,
        }),
        protocolSchemas: fileSystemBridgeSchemas,
      },
    );
    const proxy = createFileSystemBridgeProxy({
      port: messagePort(channel.port2, 'fs-bridge-checked-loss-client'),
      dispose: () => {
        channel.port2.close();
      },
    });

    try {
      await proxy.ready;
      const pending = proxy.writeFileChecked({ path: 'target.txt', data: 'new', preconditions: [] });
      await applied;
      server.dispose();
      await expect(pending).rejects.toMatchObject({
        applicationState: 'potentially-applied',
        metadata: { applicationState: 'potentially-applied' },
      });
      expect(writeFileChecked).toHaveBeenCalledOnce();
    } finally {
      proxy.dispose();
      server.dispose();
    }
  });

  it('classifies direct and captured checked writes after disposal as known not applied without dispatch', async () => {
    const channel = new MessageChannel();
    const writeFileChecked = vi.fn();
    const server = createBridgeServer(
      { writeFileChecked },
      messagePort(channel.port1, 'fs-bridge-checked-disposed-server'),
      {
        hello: createFileSystemBridgeHello({
          state: 'ready',
          capabilities: { persistent: false, writable: true, quotaBased: false, durability: 'ephemeral' },
          watchable: false,
        }),
        protocolSchemas: fileSystemBridgeSchemas,
      },
    );
    const proxy = createFileSystemBridgeProxy({
      port: messagePort(channel.port2, 'fs-bridge-checked-disposed-client'),
      dispose: () => {
        channel.port2.close();
      },
    });

    try {
      await proxy.ready;
      const capturedWriteFileChecked = proxy.writeFileChecked;
      proxy.dispose();
      const input = { path: 'target.txt', data: 'new', preconditions: [] };

      await expect(proxy.writeFileChecked(input)).rejects.toMatchObject({
        applicationState: 'known-not-applied',
        metadata: { applicationState: 'known-not-applied' },
      });
      await expect(capturedWriteFileChecked(input)).rejects.toMatchObject({
        applicationState: 'known-not-applied',
        metadata: { applicationState: 'known-not-applied' },
      });
      expect(writeFileChecked).not.toHaveBeenCalled();
    } finally {
      proxy.dispose();
      server.dispose();
    }
  });

  it('classifies invalid checked-write arguments as known not applied before dispatch', async () => {
    const channel = new MessageChannel();
    const writeFileChecked = vi.fn();
    const server = createBridgeServer(
      { writeFileChecked },
      messagePort(channel.port1, 'fs-bridge-checked-invalid-server'),
      {
        hello: createFileSystemBridgeHello({
          state: 'ready',
          capabilities: { persistent: false, writable: true, quotaBased: false, durability: 'ephemeral' },
          watchable: false,
        }),
        protocolSchemas: fileSystemBridgeSchemas,
      },
    );
    const proxy = createFileSystemBridgeProxy({
      port: messagePort(channel.port2, 'fs-bridge-checked-invalid-client'),
      dispose: () => {
        channel.port2.close();
      },
    });

    try {
      await proxy.ready;
      const uncheckedWriteFileChecked = proxy.writeFileChecked as unknown as (input: unknown) => Promise<unknown>;
      await expect(uncheckedWriteFileChecked({ path: 'target.txt', data: 'new' })).rejects.toMatchObject({
        applicationState: 'known-not-applied',
        metadata: { applicationState: 'known-not-applied' },
      });
      expect(writeFileChecked).not.toHaveBeenCalled();
    } finally {
      proxy.dispose();
      server.dispose();
    }
  });
});
