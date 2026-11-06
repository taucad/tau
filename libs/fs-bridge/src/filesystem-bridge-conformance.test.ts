/**
 * Bridge conformance suite (charter W10): one behaviour contract, run against
 * every transport a filesystem bridge rides —
 *
 * - **in-process port**: `createFileSystemBridgePort` in the caller's isolate;
 * - **authority connection**: a rooted connection to `exposeFileSystem`, the
 *   connect handshake every authority worker answers;
 * - **worker port**: the authority in a real `worker_threads` thread, so every
 *   frame crosses an isolate boundary and every transfer is a real transfer.
 *
 * Each transport must answer wire v3's first calls alike (`readMany`,
 * `readRange`, long-call progress and abort), count its I2 crossings per path,
 * and fail typed when the authority dies or hangs.
 */
import { MessageChannel as NodeMessageChannel, Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { MessagePortLike } from '@taucad/rpc';
import { sha256Bytes } from '@taucad/utils/hash';
import {
  consumableBytes,
  createFileSystemBridgePort,
  createFileSystemBridgeProxy,
  createTransferredFileSystemBridgeProxy,
  exposeFileSystemForTesting,
  filesystemBridgeConnectMessageType,
} from '#filesystem-bridge.js';
import type { FileSystemBridgeProxy } from '#filesystem-bridge.js';
import { fileSystemBridgeProtocolVersion, maxReadManyPaths, maxReadRangeBytes } from '#filesystem-bridge-protocol.js';
import type { FileSystemBridgeEvent, LongCallProgress } from '#filesystem-bridge-protocol.js';
import { observeFileSystemBridgeCrossings } from '#filesystem-bridge-crossings.js';
import type { FileSystemBridgeCrossings } from '#filesystem-bridge-crossings.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const files = {
  'a.ts': 'alpha',
  'lib/b.ts': 'beta beta',
  'lib/c.bin': '0123456789',
};

type Opened = {
  readonly proxy: FileSystemBridgeProxy;
  /** The host side's I2 crossings since the transport opened. */
  hostCrossings(): Promise<ReadonlyMap<string, FileSystemBridgeCrossings>>;
  close(): Promise<void>;
};

type Transport = {
  readonly name: string;
  open(seed: Record<string, string>): Promise<Opened>;
};

const seeded = async (seed: Record<string, string>): Promise<MemoryProvider> => {
  const provider = new MemoryProvider();
  for (const [path, content] of Object.entries(seed)) {
    // oxlint-disable-next-line no-await-in-loop -- fixture seeding is sequential.
    await provider.writeFile(path, content);
  }
  return provider;
};

const inProcessPort: Transport = {
  name: 'in-process port',
  async open(seed) {
    const provider = await seeded(seed);
    const crossings = observeFileSystemBridgeCrossings();
    const proxy = createFileSystemBridgeProxy(createFileSystemBridgePort(provider));
    await proxy.ready;
    return {
      proxy,
      hostCrossings: async () => crossings.snapshot(),
      async close() {
        crossings.stop();
        proxy.dispose();
      },
    };
  },
};

const authorityConnection: Transport = {
  name: 'authority connection',
  async open(seed) {
    const provider = await seeded(seed);
    const crossings = observeFileSystemBridgeCrossings();
    const messageSource = new EventTarget();
    const handle = exposeFileSystemForTesting(
      {},
      { policy: tauPathPolicy, messageSource, handlerForRoot: () => provider },
    );
    const channel = new MessageChannel();
    messageSource.dispatchEvent(
      new MessageEvent('message', {
        data: {
          v: fileSystemBridgeProtocolVersion,
          type: filesystemBridgeConnectMessageType,
          port: channel.port1,
          root: '/projects/p',
          consumer: 'working-copy',
        },
      }),
    );
    const proxy = createTransferredFileSystemBridgeProxy(channel.port2);
    await proxy.ready;
    return {
      proxy,
      hostCrossings: async () => crossings.snapshot(),
      async close() {
        crossings.stop();
        proxy.dispose();
        handle.cleanup();
        channel.port1.close();
      },
    };
  },
};

type WorkerHost = Opened & {
  readonly worker: Worker;
  /** Block the authority's thread until `thaw`: it stops answering, its ports stay open. */
  freeze(): Promise<void>;
  thaw(): void;
};

const workerMessage = async <Reply>(worker: Worker, type: string): Promise<Reply> =>
  new Promise<Reply>((resolve) => {
    const onMessage = (message: { type: string }): void => {
      if (message.type === type) {
        worker.off('message', onMessage);
        resolve(message as Reply);
      }
    };
    worker.on('message', onMessage);
  });

const openWorkerHost = async (seed: Record<string, string>): Promise<WorkerHost> => {
  const worker = new Worker(new URL('filesystem-bridge-conformance.test-worker.ts', import.meta.url));
  const channel = new NodeMessageChannel();
  const serving = workerMessage(worker, 'serving');
  worker.postMessage({ type: 'serve', port: channel.port1, files: seed }, [channel.port1]);
  await serving;
  const proxy = createTransferredFileSystemBridgeProxy(channel.port2 as unknown as MessagePortLike);
  await proxy.ready;
  const gate = new Int32Array(new SharedArrayBuffer(4));
  return {
    proxy,
    worker,
    async hostCrossings() {
      const reply = workerMessage<{ crossings: Array<[string, FileSystemBridgeCrossings]> }>(worker, 'crossings');
      worker.postMessage({ type: 'crossings' });
      const { crossings } = await reply;
      return new Map(crossings);
    },
    async freeze() {
      const frozen = workerMessage(worker, 'frozen');
      worker.postMessage({ type: 'freeze', gate });
      await frozen;
    },
    thaw() {
      Atomics.store(gate, 0, 1);
      Atomics.notify(gate, 0);
    },
    async close() {
      Atomics.store(gate, 0, 1);
      Atomics.notify(gate, 0);
      proxy.dispose();
      await worker.terminate();
    },
  };
};

const workerPort: Transport = { name: 'worker port', open: openWorkerHost };

const opened: Opened[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const transport of opened.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- transports close in reverse order.
    await transport.close();
  }
});

const open = async (transport: Transport, seed: Record<string, string> = files): Promise<Opened> => {
  const handle = await transport.open(seed);
  opened.push(handle);
  return handle;
};

const text = (value: Uint8Array<ArrayBuffer> | 'missing' | undefined): string | undefined =>
  value === undefined || value === 'missing' ? value : decoder.decode(value);

/** Watch a call settle without awaiting it, so fake time can move underneath. */
const track = (pending: Promise<unknown>): { readonly settled: () => boolean } => {
  let settled = false;
  const observe = async (): Promise<void> => {
    try {
      await pending;
    } catch {
      // The test asserts the rejection itself.
    } finally {
      settled = true;
    }
  };
  void observe();
  return { settled: () => settled };
};

describe.each([inProcessPort, authorityConnection, workerPort])('bridge conformance: $name', (transport) => {
  it('says protocol version 9 in its ready hello', async () => {
    const { proxy } = await open(transport);
    expect(proxy.hello.payload).toMatchObject({ v: 9, state: 'ready' });
  });

  it('reads many files in one call: bytes or missing, in request order, once per path', async () => {
    const { proxy } = await open(transport);
    const read = await proxy.readMany(['lib/b.ts', 'gone.ts', 'a.ts', 'lib/b.ts']);
    expect([...read.keys()]).toEqual(['lib/b.ts', 'gone.ts', 'a.ts']);
    expect(text(read.get('lib/b.ts'))).toBe('beta beta');
    expect(read.get('gone.ts')).toBe('missing');
    expect(text(read.get('a.ts'))).toBe('alpha');
  });

  it('transfers each path read exactly once and copies none (I2)', async () => {
    const host = await open(transport);
    const read = await host.proxy.readMany(['a.ts', 'lib/b.ts', 'lib/c.bin', 'gone.ts']);
    for (const value of read.values()) {
      if (value !== 'missing') {
        // The caller owns a buffer of exactly its bytes, not a view into a larger one.
        expect(value.buffer.byteLength).toBe(value.byteLength);
      }
    }
    expect(Object.fromEntries(await host.hostCrossings())).toEqual({
      'a.ts': { transfers: 1, copies: 0, bytes: 5 },
      'lib/b.ts': { transfers: 1, copies: 0, bytes: 9 },
      'lib/c.bin': { transfers: 1, copies: 0, bytes: 10 },
    });
  });

  it('reports progress for a long read and finishes at the full count', async () => {
    const { proxy } = await open(transport);
    const reports: LongCallProgress[] = [];
    await proxy.readMany(['a.ts', 'lib/b.ts', 'lib/c.bin'], {
      onProgress(progress) {
        reports.push(progress);
      },
    });
    expect(reports.at(-1)).toEqual({ done: 3, total: 3, bytes: 24 });
  });

  it('digests with progress through the same long-call controls', async () => {
    const { proxy } = await open(transport);
    const reports: LongCallProgress[] = [];
    const digests = await proxy.hashFiles(['a.ts', 'gone.ts'], {
      onProgress(progress) {
        reports.push(progress);
      },
    });
    expect(digests).toEqual({ 'a.ts': await sha256Bytes(encoder.encode('alpha')), 'gone.ts': 'missing' });
    expect(reports.at(-1)).toEqual({ done: 2, total: 2, bytes: 5 });
  });

  it('refuses a long call whose signal is already aborted, without a round trip', async () => {
    const { proxy } = await open(transport);
    await expect(proxy.readMany(['a.ts'], { signal: AbortSignal.abort() })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('reads a range clamped to the end of the file', async () => {
    const { proxy } = await open(transport);
    expect(decoder.decode(await proxy.readRange('lib/c.bin', 2, 3))).toBe('234');
    expect(decoder.decode(await proxy.readRange('lib/c.bin', 8, 100))).toBe('89');
    const pastEnd = await proxy.readRange('lib/c.bin', 50, 4);
    expect(pastEnd.byteLength).toBe(0);
    const empty = await proxy.readRange('lib/c.bin', 0, 0);
    expect(empty.byteLength).toBe(0);
  });

  it('refuses out-of-contract reads before the host reads anything', async () => {
    const { proxy } = await open(transport);
    await expect(proxy.readRange('lib/c.bin', 0, maxReadRangeBytes + 1)).rejects.toMatchObject({
      code: 'WIRE_VALIDATION_FAILED',
    });
    await expect(proxy.readRange('lib/c.bin', -1, 1)).rejects.toMatchObject({ code: 'WIRE_VALIDATION_FAILED' });
    await expect(proxy.readMany(['../escape.ts'])).rejects.toMatchObject({ code: 'WIRE_VALIDATION_FAILED' });
    const tooMany = Array.from({ length: maxReadManyPaths + 1 }, (_, index) => `f${String(index)}.ts`);
    await expect(proxy.readMany(tooMany)).rejects.toMatchObject({ code: 'WIRE_VALIDATION_FAILED' });
  });

  it('refuses the index queries with ENOTSUP where the connection serves a bare provider', async () => {
    const { proxy } = await open(transport);
    await expect(proxy.facts(['lib/c.bin'])).rejects.toMatchObject({ code: 'ENOTSUP' });
    await expect(proxy.changedSince(0)).rejects.toMatchObject({ code: 'ENOTSUP' });
    await expect(proxy.changedSince(-1)).rejects.toMatchObject({ code: 'WIRE_VALIDATION_FAILED' });
  });

  it('counts a write as one copy per path, or one transfer when the caller hands its bytes over (I2)', async () => {
    const { proxy } = await open(transport);
    const crossings = observeFileSystemBridgeCrossings();
    try {
      const kept = encoder.encode('kept');
      await proxy.writeFile('kept.ts', kept);
      const handed = encoder.encode('handed');
      await proxy.writeFile('handed.ts', Object.assign(handed, { [consumableBytes]: true }));
      expect(kept.byteLength).toBe(4);
      expect(handed.byteLength).toBe(0);
      expect(Object.fromEntries(crossings.snapshot())).toMatchObject({
        'kept.ts': { transfers: 0, copies: 1, bytes: 4 },
        'handed.ts': { transfers: 1, copies: 0, bytes: 6 },
      });
      const landed = await proxy.readMany(['kept.ts', 'handed.ts']);
      expect(text(landed.get('handed.ts'))).toBe('handed');
    } finally {
      crossings.stop();
    }
  });
});

/** Fake only the clocks the bridge reads, so a port's real message turns still run. */
const fakeClocks = (): void => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
};

/** Advance fake time a second at a time, letting real port deliveries land in between. */
const advance = async (milliseconds: number): Promise<void> => {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 1000) {
    // oxlint-disable-next-line no-await-in-loop -- time moves in order.
    await vi.advanceTimersByTimeAsync(Math.min(1000, milliseconds - elapsed));
    for (let turn = 0; turn < 4; turn += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each turn delivers the frames the last one posted.
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
    }
  }
};

describe('bridge conformance: long calls outlive the ordinary deadline (W10, I10)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a readMany alive past 30 s while its authority works, reporting progress, and resolves it', async () => {
    const provider = await seeded(files);
    const read = provider.readFile.bind(provider);
    vi.spyOn(provider, 'readFile').mockImplementation((async (path: string) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 35_000);
      });
      return read(path);
    }) as MemoryProvider['readFile']);
    const proxy = createFileSystemBridgeProxy(createFileSystemBridgePort(provider));
    opened.push({
      proxy,
      hostCrossings: async () => new Map(),
      async close() {
        proxy.dispose();
      },
    });
    await proxy.ready;
    fakeClocks();

    // Twelve paths over eight lanes: two rounds of 35 s, so 70 s in all, and no
    // frame but heartbeats for the first 35 s: longer than one liveness window.
    const paths = ['a.ts', ...Array.from({ length: 11 }, (_, index) => `missing-${String(index)}.ts`)];
    const reports: LongCallProgress[] = [];
    const pending = proxy.readMany(paths, {
      onProgress(progress) {
        reports.push(progress);
      },
    });
    const outcome = track(pending);
    await advance(65_000);
    expect(outcome.settled()).toBe(false);
    // The first round reported progress mid-call.
    expect(reports.at(0)).toMatchObject({ total: 12 });
    await advance(6000);
    const result = await pending;
    expect(text(result.get('a.ts'))).toBe('alpha');
    expect(result.get('missing-10.ts')).toBe('missing');
    expect(reports.at(-1)).toEqual({ done: 12, total: 12, bytes: 5 });
  });
});

describe('bridge conformance: authority death after ready (W10)', () => {
  it('fails an in-flight call with PEER_GONE and settles `closed` when the worker dies', async () => {
    const host = await openWorkerHost(files);
    opened.push(host);
    await host.freeze();
    const pending = host.proxy.readMany(['a.ts']);
    const failure = expect(pending).rejects.toMatchObject({ code: 'PEER_GONE' });
    await host.worker.terminate();
    await failure;
    await expect(host.proxy.closed).resolves.toBeUndefined();
    await expect(host.proxy.readRange('a.ts', 0, 1)).rejects.toMatchObject({ code: 'PEER_GONE' });
  });

  it('fails a long call with PEER_UNRESPONSIVE when a live worker stops answering', async () => {
    const host = await openWorkerHost(files);
    opened.push(host);
    await host.freeze();
    vi.useFakeTimers();
    const pending = host.proxy.readMany(['a.ts']);
    const outcome = track(pending);
    const failure = expect(pending).rejects.toMatchObject({ code: 'PEER_UNRESPONSIVE' });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(outcome.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await failure;
    vi.useRealTimers();
    host.thaw();
    // The connection itself is still open: a thawed authority answers the next call.
    const after = await host.proxy.readMany(['a.ts']);
    expect(text(after.get('a.ts'))).toBe('alpha');
  });
  it('tells event subscribers the authority is lost once, on the first unresponsive call, and not again on close', async () => {
    const host = await openWorkerHost(files);
    opened.push(host);
    const heard: FileSystemBridgeEvent[] = [];
    const subscription = host.proxy.events((event) => heard.push(event));
    // A plain handler set serves no event channel; the loss is the client's to say regardless.
    await subscription.ready.catch(() => undefined);
    await host.freeze();
    vi.useFakeTimers();
    const first = host.proxy.readMany(['a.ts']);
    const firstFailure = expect(first).rejects.toMatchObject({ code: 'PEER_UNRESPONSIVE' });
    await vi.advanceTimersByTimeAsync(30_000);
    await firstFailure;
    expect(heard).toEqual([{ kind: 'authority-lost' }]);
    const second = host.proxy.readMany(['a.ts']);
    const secondFailure = expect(second).rejects.toMatchObject({ code: 'PEER_UNRESPONSIVE' });
    await vi.advanceTimersByTimeAsync(30_000);
    await secondFailure;
    vi.useRealTimers();
    host.thaw();
    await host.worker.terminate();
    await host.proxy.closed;
    expect(heard).toEqual([{ kind: 'authority-lost' }]);
    subscription.unsubscribe();
  });
});
