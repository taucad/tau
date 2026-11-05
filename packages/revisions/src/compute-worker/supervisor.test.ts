import { deflateRawSync } from 'node:zlib';
import { MessageChannel } from 'node:worker_threads';
import type { Transferable as NodeTransferable } from 'node:worker_threads';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ComputeWorkerCrashedError,
  createInlineCompute,
  isComputeWorkerFailure,
  serveComputeWorker,
} from '#compute-worker/compute-worker.js';
import type { ComputePort, ComputeWorker } from '#compute-worker/compute-worker.js';
import { createSupervisedComputeWorker } from '#compute-worker/supervisor.js';
import type { ComputeWorkerHandle } from '#compute-worker/supervisor.js';
import { crc32 } from '#compute-worker/zip.js';
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
type FakeWorker = ComputeWorkerHandle & Readonly<{ crash: () => void; terminated: () => boolean; hang: () => void }>;

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
          return new Promise(() => undefined);
        }
        return (work as (...input: readonly unknown[]) => Promise<unknown>)(...args);
      },
    ]),
  ) as unknown as ComputeWorker;
  serveComputeWorker(domPort(channel.port2), served);
  const port = domPort(channel.port1);
  const errors: Array<(event: Event) => void> = [];
  let terminated = false;
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
      if (!terminated) {
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

  it('takes a worker that answers nothing past the deadline for dead', async () => {
    vi.useFakeTimers();
    try {
      const workers: FakeWorker[] = [];
      const supervised = createSupervisedComputeWorker({
        spawn: () => {
          const worker = fakeWorker();
          workers.push(worker);
          return worker;
        },
        callDeadline: 1000,
      });
      workers.length = 0;
      const pending = supervised.inflate(new Uint8Array([1, 2, 3]));
      workers[0]?.hang();
      const settled = pending.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(1001);
      expect(await settled).toBeInstanceOf(ComputeWorkerCrashedError);
      expect(workers[0]?.terminated()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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

  it('resolves a delta on the worker, and carries a corrupt one back as a TypeError', async () => {
    const compute = remote();
    const base = encoder.encode('0123456789');
    /* Base size 10, target size 7: copy 4 bytes from offset 2, then insert "xyz". */
    const delta = new Uint8Array([10, 7, 0x91, 2, 4, 3, ...encoder.encode('xyz')]);
    const { deflateSync } = await import('node:zlib');
    const compressed = new Uint8Array(deflateSync(delta));
    expect(new TextDecoder().decode(await compute.resolveDelta(compressed, delta.byteLength, base))).toBe('2345xyz');
    await expect(compute.resolveDelta(compressed, delta.byteLength + 1, base)).rejects.toBeInstanceOf(TypeError);
    await expect(compute.resolveDelta(encoder.encode('not zlib'), 3, base)).rejects.toBeInstanceOf(TypeError);
  });

  it('hashes SHA-256 as an LFS object id', async () => {
    const body = encoder.encode('large object\n');
    expect(await remote().sha256(body)).toBe(digestHex('sha256', body));
  });

  it('decodes a zip archive, checking each CRC, and refuses an unsafe path', async () => {
    const zip = (
      entries: ReadonlyArray<{ name: string; data: Uint8Array; method: 0 | 8 }>,
    ): Uint8Array<ArrayBuffer> => {
      const parts: Uint8Array[] = [];
      const directory: Uint8Array[] = [];
      let offset = 0;
      for (const entry of entries) {
        const name = encoder.encode(entry.name);
        const stored = entry.method === 8 ? new Uint8Array(deflateRawSync(entry.data)) : entry.data;
        const local = new Uint8Array(30 + name.byteLength);
        const view = new DataView(local.buffer);
        view.setUint32(0, 0x04_03_4b_50, true);
        view.setUint16(8, entry.method, true);
        view.setUint32(14, crc32(entry.data), true);
        view.setUint32(18, stored.byteLength, true);
        view.setUint32(22, entry.data.byteLength, true);
        view.setUint16(26, name.byteLength, true);
        local.set(name, 30);
        const central = new Uint8Array(46 + name.byteLength);
        const centralView = new DataView(central.buffer);
        centralView.setUint32(0, 0x02_01_4b_50, true);
        centralView.setUint16(10, entry.method, true);
        centralView.setUint32(16, crc32(entry.data), true);
        centralView.setUint32(20, stored.byteLength, true);
        centralView.setUint32(24, entry.data.byteLength, true);
        centralView.setUint16(28, name.byteLength, true);
        centralView.setUint32(42, offset, true);
        central.set(name, 46);
        parts.push(local, stored);
        directory.push(central);
        offset += local.byteLength + stored.byteLength;
      }
      const directorySize = directory.reduce((total, part) => total + part.byteLength, 0);
      const end = new Uint8Array(22);
      const endView = new DataView(end.buffer);
      endView.setUint32(0, 0x06_05_4b_50, true);
      endView.setUint16(8, entries.length, true);
      endView.setUint16(10, entries.length, true);
      endView.setUint32(12, directorySize, true);
      endView.setUint32(16, offset, true);
      const all = [...parts, ...directory, end];
      const out = new Uint8Array(all.reduce((total, part) => total + part.byteLength, 0));
      let at = 0;
      for (const part of all) {
        out.set(part, at);
        at += part.byteLength;
      }
      return out;
    };
    const compute = remote();
    const main = encoder.encode('export const main = 1;\n'.repeat(40));
    const archive = zip([
      { name: 'project/main.ts', data: main, method: 8 },
      { name: 'project/README.md', data: encoder.encode('# Tau\n'), method: 0 },
    ]);
    const entries = await compute.unzip(archive);
    expect(entries.map((entry) => entry.path)).toEqual(['project/main.ts', 'project/README.md']);
    expect(entries[0]?.data).toStrictEqual(main);
    await expect(compute.unzip(zip([{ name: '../escape.ts', data: main, method: 0 }]))).rejects.toBeInstanceOf(
      TypeError,
    );
    const corrupt = new Uint8Array(archive);
    corrupt[52] = corrupt[52]! ^ 0xff;
    await expect(compute.unzip(corrupt)).rejects.toBeInstanceOf(TypeError);
    await expect(
      compute.unzip(archive, { maxEntries: 1, maxEntryBytes: 1_000_000, maxTotalBytes: 1_000_000 }),
    ).rejects.toThrow('limits');
  });

  it('greps text files line by line, skips binary files and stops at the bound', async () => {
    const compute = remote();
    const files = [
      { path: 'a.ts', data: encoder.encode('const box = 1;\nconst Box = 2;\nconst cube = 3;\n') },
      { path: 'b.bin', data: new Uint8Array([98, 111, 120, 0, 1]) },
      { path: 'c.ts', data: encoder.encode('box(1);\n') },
    ];
    expect(await compute.grep(files, { source: 'box' })).toEqual({
      matches: [
        { path: 'a.ts', line: 1, column: 6, text: 'const box = 1;' },
        { path: 'c.ts', line: 1, column: 0, text: 'box(1);' },
      ],
      truncated: false,
    });
    expect((await compute.grep(files, { source: 'box', ignoreCase: true }, { maxMatches: 2 })).truncated).toBe(true);
    expect((await compute.grep(files, { source: 'box(', literal: true })).matches).toHaveLength(1);
  });
});
