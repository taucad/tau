import { deflateSync } from 'node:zlib';
import { MessageChannel } from 'node:worker_threads';
import type { Transferable as NodeTransferable } from 'node:worker_threads';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInlineCompute, serveComputeWorker } from '#compute-worker/compute-worker.js';
import { ComputeWorkerCrashedError, CorruptBytesError, isComputeWorkerFailure } from '#compute-worker/errors.js';
import type { ComputePort, ComputeWorker } from '#compute-worker/compute-worker.js';
import { createSupervisedComputeWorker } from '#compute-worker/supervisor.js';
import type { ComputeWorkerHandle } from '#compute-worker/supervisor.js';
import { createObjectStore, gitFilesOf } from '#object-store/object-store.js';
import { buildPack, indexBuiltPack } from '#object-store/pack-writer.js';
import { digestHex } from '#object-hash.js';

const encoder = new TextEncoder();
const channels: MessageChannel[] = [];

afterEach(() => {
  for (const channel of channels.splice(0)) {
    channel.port1.close();
    channel.port2.close();
  }
});

/* Node's ports speak `on('message')`; the seam takes the DOM shape. */
const domPort = (port: MessageChannel['port1']): ComputePort => ({
  postMessage: (message, transfer) => {
    port.postMessage(message, transfer as unknown as readonly NodeTransferable[]);
  },
  addEventListener: (_type, listener) => {
    port.on('message', (data: unknown) => {
      listener({ data } as MessageEvent);
    });
  },
});

/**
 * A worker double: a real message channel served by the inline compute, which
 * a test can kill. A killed worker answers nothing more and raises the error
 * event a browser raises for an uncaught error in a worker.
 */
type FakeWorker = ComputeWorkerHandle &
  Readonly<{ crash: () => void; terminated: () => boolean; hang: () => void; freeze: () => void; sent: () => number }>;

const fakeWorker = (crashOn?: string, compute: ComputeWorker = createInlineCompute()): FakeWorker => {
  const channel = new MessageChannel();
  channels.push(channel);
  let hung = false;
  let crashNow = (): void => undefined;
  const served: ComputeWorker = Object.fromEntries(
    Object.entries(compute).map(([name, work]) => [
      name,
      async (...args: readonly unknown[]) => {
        if (name === crashOn) {
          crashNow();
        }
        if (hung) {
          return new Promise(() => {
            /* A hung worker never answers. */
          });
        }
        return (work as (...input: readonly unknown[]) => Promise<unknown>)(...args);
      },
    ]),
  ) as unknown as ComputeWorker;
  serveComputeWorker(domPort(channel.port2), served);
  const port = domPort(channel.port1);
  const errors: Array<(event: Event) => void> = [];
  let terminated = false;
  let frozen = false;
  let sent = 0;
  const crash = (): void => {
    hung = true;
    const event = Object.assign(new Event('error'), { message: 'Uncaught RangeError: out of memory' });
    for (const listener of errors) {
      listener(event);
    }
  };
  crashNow = crash;
  return {
    postMessage: (message, transfer) => {
      if ((message as { ping?: true }).ping !== true) {
        sent += 1;
      }
      if (!terminated && !frozen) {
        port.postMessage(message, transfer);
      }
    },
    addEventListener: (type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void) => {
      if (type === 'message') {
        port.addEventListener('message', listener as (event: MessageEvent) => void);
      } else if (type === 'error') {
        errors.push(listener);
      }
    },
    terminate: () => {
      terminated = true;
      channel.port1.close();
      channel.port2.close();
    },
    crash,
    hang: () => {
      hung = true;
    },
    freeze: () => {
      frozen = true;
    },
    sent: () => sent,
    terminated: () => terminated,
  };
};

describe('the supervised compute worker (W5)', () => {
  it('fails the calls a dead worker held typed, restarts it, and answers the next call', async () => {
    const workers: FakeWorker[] = [];
    const crashes: unknown[] = [];
    const supervised = createSupervisedComputeWorker({
      spawn: () => {
        const worker = fakeWorker();
        workers.push(worker);
        return worker;
      },
      onCrash: (report) => crashes.push(report),
    });
    const body = encoder.encode('cube(1);\n');
    expect(await supervised.sha1(body)).toBe(digestHex('sha1', body));
    expect(supervised.spawned()).toBe(1);

    workers[0]!.hang();
    const held = supervised.deflate(body);
    /* Once the call is with the worker, which the in-flight slot reaches a task later. */
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    workers[0]!.crash();
    const failure = await held.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ComputeWorkerCrashedError);
    expect(failure).toMatchObject({ failure: 'crashed', method: 'deflate' });
    /* Never a TypeError: a store drops packs only for those. */
    expect(failure).not.toBeInstanceOf(TypeError);
    expect(isComputeWorkerFailure(failure)).toBe(true);
    expect(workers[0]!.terminated()).toBe(true);
    expect(crashes).toEqual([{ failedCalls: 1, restarts: 1, abandoned: false }]);

    /* Supervised restart: the next call spawns a new worker and is answered. */
    expect(await supervised.sha1(body)).toBe(digestHex('sha1', body));
    expect(supervised.spawned()).toBe(2);
  });

  it('stops restarting after the budget and sends calls to the fallback, or fails them typed without one', async () => {
    const spawnCrashing = (): FakeWorker => {
      const worker = fakeWorker();
      queueMicrotask(() => {
        worker.crash();
      });
      return worker;
    };
    const fallback = createInlineCompute();
    const withFallback = createSupervisedComputeWorker({ spawn: spawnCrashing, maxRestarts: 2, fallback });
    const without = createSupervisedComputeWorker({ spawn: spawnCrashing, maxRestarts: 2 });
    const body = encoder.encode('x');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each call crashes its own worker in turn.
      await expect(withFallback.sha1(body)).rejects.toBeInstanceOf(ComputeWorkerCrashedError);
      // oxlint-disable-next-line no-await-in-loop -- as above.
      await expect(without.sha1(body)).rejects.toBeInstanceOf(ComputeWorkerCrashedError);
    }
    expect(withFallback.spawned()).toBe(3);
    expect(await withFallback.sha1(body)).toBe(digestHex('sha1', body));
    expect(withFallback.spawned()).toBe(3);
    await expect(without.sha1(body)).rejects.toMatchObject({ failure: 'unavailable', method: 'sha1' });
  });

  it('takes a worker that is silent past the deadline for dead', async () => {
    vi.useFakeTimers();
    try {
      const workers: FakeWorker[] = [];
      const supervised = createSupervisedComputeWorker({
        spawn: () => {
          const worker = fakeWorker();
          /* Nothing reaches it, so it starts nothing and answers no ping. */
          worker.freeze();
          workers.push(worker);
          return worker;
        },
        callDeadline: 1000,
      });
      const pending = supervised.inflate(new Uint8Array([1, 2, 3]));
      const failed = expect(pending).rejects.toBeInstanceOf(ComputeWorkerCrashedError);
      await vi.advanceTimersByTimeAsync(1600);
      await failed;
      expect(workers[0]?.terminated()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a worker that is slow on one call alive, and answers the call beside it', async () => {
    vi.useFakeTimers();
    try {
      const workers: FakeWorker[] = [];
      const slow = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
      const inline = createInlineCompute();
      const supervised = createSupervisedComputeWorker({
        spawn: () => {
          const worker = fakeWorker(undefined, { ...inline, deflate: async () => slow.promise });
          workers.push(worker);
          return worker;
        },
        callDeadline: 1000,
      });
      const body = encoder.encode('box(1);\n');
      const held = supervised.deflate(body);
      /* Far past the silence window: the worker still answers pings, so it is busy, not gone. */
      await vi.advanceTimersByTimeAsync(5000);
      expect(await supervised.sha1(body)).toBe(digestHex('sha1', body));
      expect(workers[0]?.terminated()).toBe(false);
      slow.resolve(new Uint8Array([7]));
      expect(await held).toStrictEqual(new Uint8Array([7]));
      expect(supervised.spawned()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends at most the in-flight bound at once, and the rest as slots free', async () => {
    const workers: FakeWorker[] = [];
    const gate = Promise.withResolvers<undefined>();
    const inline = createInlineCompute();
    const supervised = createSupervisedComputeWorker({
      spawn: () => {
        const worker = fakeWorker(undefined, {
          ...inline,
          sha1: async (bytes) => {
            await gate.promise;
            return inline.sha1(bytes);
          },
        });
        workers.push(worker);
        return worker;
      },
      maxInFlight: 2,
    });
    const body = encoder.encode('box(1);\n');
    const calls = Array.from({ length: 5 }, async () => supervised.sha1(body));
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(workers[0]?.sent()).toBe(2);
    gate.resolve(undefined);
    expect(await Promise.all(calls)).toEqual(Array.from({ length: 5 }, () => digestHex('sha1', body)));
    expect(workers[0]?.sent()).toBe(5);
  });

  it('counts a spawn that throws as a crash, and past the budget sends calls to the fallback', async () => {
    const crashes: unknown[] = [];
    const supervised = createSupervisedComputeWorker({
      spawn: () => {
        throw new Error('Worker scripts are blocked here.');
      },
      maxRestarts: 1,
      fallback: createInlineCompute(),
      onCrash: (report) => crashes.push(report),
    });
    const body = encoder.encode('box(1);\n');
    await expect(supervised.sha1(body)).rejects.toMatchObject({ failure: 'crashed', method: 'sha1' });
    expect(await supervised.sha1(body)).toBe(digestHex('sha1', body));
    expect(crashes).toEqual([
      { failedCalls: 0, restarts: 1, abandoned: false },
      { failedCalls: 0, restarts: 2, abandoned: true },
    ]);
    expect(supervised.spawned()).toBe(0);
  });

  it('never indexes a pack on the fallback: past the worker it fails typed', async () => {
    const supervised = createSupervisedComputeWorker({
      spawn: () => {
        throw new Error('no workers');
      },
      maxRestarts: 0,
      fallback: createInlineCompute(),
    });
    const inline = createInlineCompute();
    const data = encoder.encode('cube(1);\n');
    const built = await buildPack(
      [{ oid: digestHex('sha1', encoder.encode('blob 9\0cube(1);\n')), type: 'blob', data }],
      inline,
    );
    await expect(supervised.indexPack(built.pack)).rejects.toMatchObject({
      failure: 'unavailable',
      method: 'indexPack',
    });
    expect(await supervised.inflate(await inline.deflate(data))).toStrictEqual(data);
  });

  it('keeps a pack whose read failed because the worker crashed, and reads it once restarted', async () => {
    /* The first worker dies the moment it is asked to inflate; its successor does not. */
    let spawned = 0;
    const supervised = createSupervisedComputeWorker({
      spawn: () => {
        spawned += 1;
        return fakeWorker(spawned === 1 ? 'inflate' : undefined);
      },
    });
    const inline = createInlineCompute();
    const data = encoder.encode('box(2);\n'.repeat(32));
    const oid = digestHex('sha1', new Uint8Array([...encoder.encode(`blob ${String(data.byteLength)}\0`), ...data]));
    const built = await buildPack([{ oid, type: 'blob', data }], inline);
    const provider = new MemoryProvider();
    await provider.mkdir('.git/objects/pack', { recursive: true });
    await provider.writeFile(`.git/objects/pack/pack-${built.checksum}.pack`, built.pack);
    await provider.writeFile(`.git/objects/pack/pack-${built.checksum}.idx`, await indexBuiltPack(built, inline));
    const store = createObjectStore({
      files: gitFilesOf(provider, '.git'),
      gitdir: '.git',
      compute: supervised,
      fenceName: 'crash',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(store.read(oid)).rejects.toBeInstanceOf(ComputeWorkerCrashedError);
    expect(supervised.spawned()).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    await expect(store.has(oid)).resolves.toBe(true);
    await expect(store.read(oid)).resolves.toStrictEqual({ type: 'blob', data });
    provider.dispose();
  });
});

describe('the compute contract', () => {
  const remote = (): ComputeWorker =>
    createSupervisedComputeWorker({ spawn: () => fakeWorker(), callDeadline: 30_000 });

  it('resolves a delta on the worker, and carries a corrupt one back as a verdict on the bytes', async () => {
    const compute = remote();
    const base = encoder.encode('0123456789');
    /* Base size 10, target size 7: copy 4 bytes from offset 2, then insert "xyz". */
    const delta = new Uint8Array([10, 7, 0x91, 2, 4, 3, ...encoder.encode('xyz')]);
    const compressed = new Uint8Array(deflateSync(delta));
    expect(new TextDecoder().decode(await compute.resolveDelta(compressed, delta.byteLength, base))).toBe('2345xyz');
    await expect(compute.resolveDelta(compressed, delta.byteLength + 1, base)).rejects.toBeInstanceOf(
      CorruptBytesError,
    );
    await expect(compute.resolveDelta(encoder.encode('not zlib'), 3, base)).rejects.toBeInstanceOf(CorruptBytesError);
    await expect(compute.resolveDelta(compressed, delta.byteLength, encoder.encode('short'))).rejects.toBeInstanceOf(
      CorruptBytesError,
    );
  });

  it("carries the worker's own trouble back as an error that judges nothing", async () => {
    const inline = createInlineCompute();
    const compute = createSupervisedComputeWorker({
      spawn: () =>
        fakeWorker(undefined, {
          ...inline,
          resolveDelta: async () => {
            throw new RangeError('Array buffer allocation failed');
          },
        }),
    });
    const failure = await compute
      .resolveDelta(new Uint8Array([1]), 1, new Uint8Array([1]))
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(TypeError);
    expect(failure).not.toBeInstanceOf(RangeError);
  });

  it('hashes SHA-256 as an LFS object id', async () => {
    const body = encoder.encode('large object\n');
    expect(await remote().sha256(body)).toBe(digestHex('sha256', body));
  });
});

/* Only a verdict on the bytes drops a pack: every other failure of the compute leaves it, and a later read finds it. */
describe('a pack the compute failed to read for its own reasons', () => {
  const packed = async () => {
    const inline = createInlineCompute();
    const data = encoder.encode('box(3);\n'.repeat(16));
    const oid = digestHex('sha1', new Uint8Array([...encoder.encode(`blob ${String(data.byteLength)}\0`), ...data]));
    const built = await buildPack([{ oid, type: 'blob', data }], inline);
    const provider = new MemoryProvider();
    await provider.mkdir('.git/objects/pack', { recursive: true });
    await provider.writeFile(`.git/objects/pack/pack-${built.checksum}.pack`, built.pack);
    await provider.writeFile(`.git/objects/pack/pack-${built.checksum}.idx`, await indexBuiltPack(built, inline));
    return { inline, data, oid, provider };
  };

  it.each([
    ['inflate', 'a RangeError from the worker'],
    ['sha1', "the index check's hash"],
  ] as const)('keeps the pack when %s fails with %s', async (method: 'inflate' | 'sha1', _why: string) => {
    const { inline, data, oid, provider } = await packed();
    let failing = true;
    const compute: ComputeWorker = {
      ...inline,
      [method]: async (...args: readonly unknown[]) => {
        if (failing) {
          throw new RangeError('Array buffer allocation failed');
        }
        return (inline[method] as (...input: readonly unknown[]) => Promise<unknown>)(...args);
      },
    };
    const store = createObjectStore({
      files: gitFilesOf(provider, '.git'),
      gitdir: '.git',
      compute,
      fenceName: `keep-${method}`,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(store.read(oid)).rejects.toBeInstanceOf(RangeError);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    failing = false;
    await expect(store.read(oid)).resolves.toStrictEqual({ type: 'blob', data });
    provider.dispose();
  });

  it('keeps every pack when a repack fold fails for the compute, and reads them after', async () => {
    const { inline, data, oid, provider } = await packed();
    let failing = true;
    const compute: ComputeWorker = {
      ...inline,
      deflate: async (raw) => {
        if (failing) {
          throw new RangeError('Array buffer allocation failed');
        }
        return inline.deflate(raw);
      },
    };
    const store = createObjectStore({
      files: gitFilesOf(provider, '.git'),
      gitdir: '.git',
      compute,
      fenceName: 'keep-repack',
    });
    failing = false;
    await store.writeLoose([{ type: 'blob', data: encoder.encode('cube(2);\n') }]);
    failing = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(store.repack(true)).rejects.toBeInstanceOf(RangeError);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    failing = false;
    await expect(store.read(oid)).resolves.toStrictEqual({ type: 'blob', data });
    provider.dispose();
  });
});
