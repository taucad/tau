/**
 * Change delivery obeys the mask the connection asked for (G0-4, invariant CI1).
 *
 * A masked rooted connection cannot *read* the control plane, so it must not
 * learn the names or the timing of writes into it either. `'working-copy'` is
 * the trusted plane and keeps the stream whole (architecture V6).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeEventBus } from '@taucad/filesystem';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { ChangeEvent } from '@taucad/types';
import type { RootedBridgeConsumer } from '@taucad/fs-bridge';
import {
  createTransferredFileSystemBridgeProxy,
  fileSystemBridgeProtocolVersion,
  filesystemBridgeConnectMessageType,
} from '@taucad/fs-bridge';
import { exposeFileSystemForTesting as exposeFileSystem } from '#filesystem-bridge.js';

const root = '/projects/alpha';
const backend = 'memory';
const written = (path: string): ChangeEvent => ({ type: 'fileWritten', path, backend });

describe('exposeFileSystem masked change delivery', () => {
  let messageHandlers: Array<(event: MessageEvent) => void>;
  const disposers: Array<() => void> = [];

  beforeEach(() => {
    messageHandlers = [];
    vi.stubGlobal('self', {
      addEventListener: (_type: string, handler: (event: MessageEvent) => void) => {
        messageHandlers.push(handler);
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    for (const dispose of disposers.splice(0).reverse()) {
      dispose();
    }
    vi.unstubAllGlobals();
  });

  /** One rooted connection and everything it hears, over the production guard. */
  const connect = (
    consumer: RootedBridgeConsumer,
    options?: { readonly refuse?: boolean },
  ): {
    readonly received: ChangeEvent[];
    readonly bus: ChangeEventBus;
    readonly ready: Promise<void>;
    readonly serverHandleCount: () => number;
  } => {
    const bus = new ChangeEventBus();
    const handle = exposeFileSystem(
      {},
      {
        changeEventBus: bus,
        policy: tauPathPolicy,
        handlerForRoot: () =>
          options?.refuse === true
            ? undefined
            : {
                capabilities: { persistent: false, writable: true, quotaBased: false, durability: 'ephemeral' },
                readFile: async () => new Uint8Array([1]),
              },
      },
    );
    const channel = new MessageChannel();
    messageHandlers.at(-1)!(
      new MessageEvent('message', {
        data: {
          v: fileSystemBridgeProtocolVersion,
          type: filesystemBridgeConnectMessageType,
          port: channel.port1,
          root,
          consumer,
        },
      }),
    );
    const proxy = createTransferredFileSystemBridgeProxy(channel.port2);
    const received: ChangeEvent[] = [];
    const stop = proxy.listen('fileChanged', (event) => received.push(event as ChangeEvent));
    disposers.push(() => {
      stop();
      proxy.dispose();
      handle.cleanup();
      channel.port1.close();
    });
    return { received, bus, ready: proxy.ready, serverHandleCount: () => handle.serverHandles.size };
  };

  /* The visible sibling is the marker: once it has arrived, anything emitted
   * before it has already been delivered or dropped for good. */
  const emitAndSettle = async (bus: ChangeEventBus, received: ChangeEvent[], hidden: ChangeEvent[]): Promise<void> => {
    for (const event of hidden) {
      bus.emit(event);
    }
    bus.emit(written(`${root}/src/main.ts`));
    await vi.waitFor(
      () => {
        expect(received).toContainEqual(written('src/main.ts'));
      },
      { timeout: 5000 },
    );
  };

  it.each(['user', 'agent'] as const)('should not deliver a hidden path to the %s view', async (consumer) => {
    const { received, bus } = connect(consumer);

    await emitAndSettle(bus, received, [
      written(`${root}/.git/HEAD`),
      written(`${root}/.git/refs/heads/main`),
      written(`${root}/vendor/lib/.git/HEAD`),
      written(`${root}/.tau/binding.json`),
    ]);

    expect(received).toEqual([written('src/main.ts')]);
  });

  it('should deliver every hidden path to a working-copy connection', async () => {
    const { received, bus } = connect('working-copy');

    await emitAndSettle(bus, received, [written(`${root}/.git/HEAD`), written(`${root}/vendor/lib/.git/HEAD`)]);

    expect(received).toEqual([written('.git/HEAD'), written('vendor/lib/.git/HEAD'), written('src/main.ts')]);
  });

  /* A hidden end is as absent from a masked view as one outside the root, so the
   * rename degrades exactly as `scopeEventToRoot` already degrades a move that
   * crosses the root boundary — an arrival, or a disappearance. */
  it('should degrade a rename across the mask to the visible end alone', async () => {
    const { received, bus } = connect('agent');

    await emitAndSettle(bus, received, [
      { type: 'fileRenamed', oldPath: `${root}/.git/HEAD`, newPath: `${root}/src/arrived.ts`, backend },
      { type: 'fileRenamed', oldPath: `${root}/src/left.ts`, newPath: `${root}/.git/HEAD`, backend },
      { type: 'fileCopied', sourcePath: `${root}/src/a.ts`, targetPath: `${root}/.git/HEAD`, backend },
    ]);

    expect(received).toEqual([
      written('src/arrived.ts'),
      { type: 'fileDeleted', path: 'src/left.ts', backend },
      written('src/main.ts'),
    ]);
  });

  /* A port answered `ROOT_UNAVAILABLE` is not a recipient of the change stream
   * for the root it was denied, and leaves no entry behind. */
  it('should register no handle and deliver nothing to a refused rooted port', async () => {
    const { received, bus, ready, serverHandleCount } = connect('agent', { refuse: true });
    await ready;

    bus.emit(written(`${root}/src/main.ts`));
    bus.emit(written(`${root}/.git/HEAD`));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(serverHandleCount()).toBe(0);
    expect(received).toEqual([]);
  });
});

/*
 * Delivery is O(events × ports) today; the derivation inside it need not be.
 * A scoped event is a function of the event, the root and whether the mask
 * applies, so every port sharing those three shares one derivation (W9d).
 */
describe('exposeFileSystem scoped delivery cost', () => {
  let messageHandlers: Array<(event: MessageEvent) => void>;

  beforeEach(() => {
    messageHandlers = [];
    vi.stubGlobal('self', {
      addEventListener: (_type: string, handler: (event: MessageEvent) => void) => {
        messageHandlers.push(handler);
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should derive one scoped event per root and mask however many ports share them', async () => {
    const bus = new ChangeEventBus();
    const handle = exposeFileSystem(
      {},
      {
        changeEventBus: bus,
        policy: tauPathPolicy,
        handlerForRoot: () => ({
          capabilities: { persistent: false, writable: true, quotaBased: false, durability: 'ephemeral' },
          readFile: async () => new Uint8Array([1]),
        }),
      },
    );
    const consumers: RootedBridgeConsumer[] = [
      ...Array.from({ length: 25 }, (): RootedBridgeConsumer => 'agent'),
      ...Array.from({ length: 25 }, (): RootedBridgeConsumer => 'working-copy'),
    ];
    const channels = consumers.map((consumer) => {
      const channel = new MessageChannel();
      messageHandlers.at(-1)!(
        new MessageEvent('message', {
          data: {
            v: fileSystemBridgeProtocolVersion,
            type: filesystemBridgeConnectMessageType,
            port: channel.port1,
            root,
            consumer,
          },
        }),
      );
      return channel;
    });

    try {
      await vi.waitFor(() => {
        expect(handle.serverHandles.size).toBe(consumers.length);
      });
      const delivered: unknown[] = [];
      for (const served of handle.serverHandles.values()) {
        vi.spyOn(served, 'emit').mockImplementation((_name: string, payload: unknown) => {
          delivered.push(payload);
        });
      }

      bus.emit(written(`${root}/src/main.ts`));

      expect(delivered).toHaveLength(consumers.length);
      /* One object for the masked ports, one for the working-copy ports. */
      expect(new Set(delivered).size).toBe(2);
      expect([...new Set(delivered)]).toEqual([written('src/main.ts'), written('src/main.ts')]);
    } finally {
      handle.cleanup();
      for (const channel of channels) {
        channel.port1.close();
        channel.port2.close();
      }
    }
  });
});
