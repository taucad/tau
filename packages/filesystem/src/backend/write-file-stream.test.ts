/**
 * `writeFileStream` (W6.3): a file written from a stream lands whole or not
 * at all, through each provider's own staging, and a stream that fails part
 * way leaves the path as it was and nothing staged behind (I1).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { NodeFsProvider } from '#backend/node/provider.js';
import { OPFSProvider, opfsStagingDirectory } from '#backend/opfs-provider.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';
import type { MockRootHandleOptions } from '#testing/mock-handle-factory.js';
import type { UncommittedChangesetStore, UncommittedRecord } from '#backend/uncommitted-changesets.js';
import type { FileSystemProvider } from '#types.js';

const encoder = new TextEncoder();

/** A stream of these chunks, erroring after `failAfter` of them when given. */
const streamOf = (chunks: readonly string[], failAfter?: number): ReadableStream<Uint8Array<ArrayBuffer>> => {
  let at = 0;
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (failAfter !== undefined && at === failAfter) {
        controller.error(new Error('the source failed'));
        return;
      }
      const chunk = chunks[at];
      at += 1;
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunk));
    },
  });
};

/** A stream that tells whether it was read to its end or cancelled. */
const trackedStreamOf = (
  chunks: readonly string[],
): { stream: ReadableStream<Uint8Array<ArrayBuffer>>; settled: () => boolean } => {
  let at = 0;
  let ended = false;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      const chunk = chunks[at];
      at += 1;
      if (chunk === undefined) {
        ended = true;
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunk));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, settled: () => ended || cancelled };
};

/** The contract every provider keeps, whatever it stages through. */
const contract = (open: () => Promise<FileSystemProvider>): void => {
  it('should write every chunk, in order, creating missing parents', async () => {
    const provider = await open();
    await provider.writeFileStream!('nested/dir/model.stl', streamOf(['solid ', 'part', '\nendsolid']));
    await expect(provider.readFile('nested/dir/model.stl', 'utf8')).resolves.toBe('solid part\nendsolid');
  });

  it('should replace an existing file only once the stream ends', async () => {
    const provider = await open();
    await provider.writeFile('model.stl', 'old bytes');
    await provider.writeFileStream!('model.stl', streamOf(['new ', 'bytes']));
    await expect(provider.readFile('model.stl', 'utf8')).resolves.toBe('new bytes');
  });

  it('should leave an existing file as it was when the stream fails part way', async () => {
    const provider = await open();
    await provider.writeFile('model.stl', 'old bytes');
    await expect(provider.writeFileStream!('model.stl', streamOf(['new ', 'by', 'tes'], 2))).rejects.toThrow(
      'the source failed',
    );
    await expect(provider.readFile('model.stl', 'utf8')).resolves.toBe('old bytes');
  });

  it('should create nothing when the stream of a new file fails part way', async () => {
    const provider = await open();
    await expect(provider.writeFileStream!('fresh/model.stl', streamOf(['new ', 'bytes'], 1))).rejects.toThrow(
      'the source failed',
    );
    await expect(provider.exists('fresh/model.stl')).resolves.toBe(false);
    await expect(provider.exists('fresh')).resolves.toBe(false);
  });

  it('should refuse a directory at the path, and leave the source read or cancelled', async () => {
    const provider = await open();
    await provider.mkdir('folder', { recursive: true });
    const { stream, settled } = trackedStreamOf(['x', 'y']);
    await expect(provider.writeFileStream!('folder', stream)).rejects.toMatchObject({ code: 'EISDIR' });
    expect(settled()).toBe(true);
  });

  it('should cancel the source when it refuses the path before reading', async () => {
    const provider = await open();
    const { stream, settled } = trackedStreamOf(['x']);
    await expect(provider.writeFileStream!('../outside.stl', stream)).rejects.toThrow();
    expect(settled()).toBe(true);
  });
};

describe('writeFileStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('MemoryProvider (gathers, then writes once)', () => {
    contract(async () => new MemoryProvider());
  });

  describe('FileSystemAccessProvider (the writable stream’s swap file)', () => {
    contract(
      async () =>
        new FileSystemAccessProvider(
          createMockRootHandle({ syncAccess: false }) as unknown as FileSystemDirectoryHandle,
        ),
    );
  });

  describe('FileSystemAccessProvider on a root that records its creates', () => {
    const recorded = (): {
      store: UncommittedChangesetStore;
      log: string[];
      records: Map<string, UncommittedRecord>;
    } => {
      const records = new Map<string, UncommittedRecord>();
      const log: string[] = [];
      return {
        records,
        log,
        store: {
          put: async (record) => {
            log.push(`put ${record.entries.map(({ path }) => path).join(',')}`);
            records.set(record.changesetId, record);
          },
          delete: async ({ changesetId }) => {
            log.push('delete');
            records.delete(changesetId);
          },
          list: async (root) => [...records.values()].filter((record) => record.root === root),
        },
      };
    };
    const picked = (store: UncommittedChangesetStore): FileSystemAccessProvider =>
      new FileSystemAccessProvider(
        createMockRootHandle({ syncAccess: false }) as unknown as FileSystemDirectoryHandle,
        {
          uncommitted: { root: 'webaccess:test', store },
        },
      );

    contract(async () => picked(recorded().store));

    it('should record a new file before making it, and drop the record once the stream settles', async () => {
      const { store, log, records } = recorded();
      const provider = picked(store);
      let seen: string | undefined;
      const source = new ReadableStream<Uint8Array<ArrayBuffer>>(
        {
          async pull(controller) {
            if (seen === undefined) {
              controller.enqueue(encoder.encode('first'));
              /* Mid-stream the path holds nothing of it, and the record covers it. */
              seen = `${log.join(';')} | ${await provider.readFile('dir/new.stl', 'utf8').catch(() => 'absent')}`;
              return;
            }
            controller.close();
          },
        },
        /* Pulled only once the write reads it. */
        { highWaterMark: 0 },
      );
      await provider.writeFileStream('dir/new.stl', source);

      expect(seen).toBe('put dir/new.stl | ');
      expect(log).toEqual(['put dir/new.stl', 'delete']);
      expect(records.size).toBe(0);
      await expect(provider.readFile('dir/new.stl', 'utf8')).resolves.toBe('first');
    });

    it('should drop the record and the file when the stream fails, and record nothing for an existing file', async () => {
      const { store, log, records } = recorded();
      const provider = picked(store);
      await expect(provider.writeFileStream('new.stl', streamOf(['a', 'b'], 1))).rejects.toThrow('the source failed');
      expect(log).toEqual(['put new.stl', 'delete']);
      expect(records.size).toBe(0);
      await expect(provider.exists('new.stl')).resolves.toBe(false);

      await provider.writeFile('old.stl', 'old');
      log.length = 0;
      await provider.writeFileStream('old.stl', streamOf(['new']));
      expect(log).toEqual([]);
      await expect(provider.readFile('old.stl', 'utf8')).resolves.toBe('new');
    });

    it('should refuse a new file whose record cannot be kept, cancelling the source', async () => {
      const { store } = recorded();
      const provider = picked({
        ...store,
        put: async () => {
          throw new Error('quota');
        },
      });
      const { stream, settled } = trackedStreamOf(['x']);
      await expect(provider.writeFileStream('dir/new.stl', stream)).rejects.toThrow(
        'its crash record could not be kept',
      );
      expect(settled()).toBe(true);
      await expect(provider.exists('dir')).resolves.toBe(false);
    });
  });

  describe('FileSystemAccessProvider on a root that stages its creates', () => {
    const staging = (): FileSystemAccessProvider =>
      new FileSystemAccessProvider(
        createMockRootHandle({ syncAccess: false }) as unknown as FileSystemDirectoryHandle,
        {
          stageCreates: true,
        },
      );

    contract(async () => staging());

    it('should write a new file to a temporary sibling, never to its path, and move it into place', async () => {
      const provider = staging();
      let seen: string[] | undefined;
      const source = new ReadableStream<Uint8Array<ArrayBuffer>>(
        {
          async pull(controller) {
            if (seen === undefined) {
              controller.enqueue(encoder.encode('staged'));
              seen = await provider.readdir('dir');
              return;
            }
            controller.close();
          },
        },
        /* Pulled only once the write reads it. */
        { highWaterMark: 0 },
      );
      await provider.writeFileStream('dir/new.stl', source);

      expect(seen).toHaveLength(1);
      expect(seen?.[0]).toMatch(/^\.new\.stl\.tau-staged\.[\da-f-]{36}\.tmp$/u);
      await expect(provider.readdir('dir')).resolves.toEqual(['new.stl']);
      await expect(provider.readFile('dir/new.stl', 'utf8')).resolves.toBe('staged');
    });
  });

  describe('OPFSProvider (staged through a sync handle, then moved)', () => {
    const mounted: Array<{ root: ReturnType<typeof createMockRootHandle>; moved: string[] }> = [];
    const mount = async (options?: MockRootHandleOptions): Promise<OPFSProvider> => {
      const moved: string[] = [];
      const root = createMockRootHandle({
        nativeMove: true,
        ...options,
        onMove: (from, to) => moved.push(`${from} to ${to}`),
      });
      vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn().mockResolvedValue(root) } });
      mounted.push({ root, moved });
      const provider = new OPFSProvider({ uncommitted: false });
      await provider.initialize();
      return provider;
    };
    const stagedLeft = async (root: ReturnType<typeof createMockRootHandle>): Promise<string[]> => {
      const names: string[] = [];
      const staging = await (root as unknown as FileSystemDirectoryHandle).getDirectoryHandle(opfsStagingDirectory, {
        create: true,
      });
      for await (const [owner, handle] of (
        staging as unknown as { entries(): AsyncIterable<[string, FileSystemDirectoryHandle]> }
      ).entries()) {
        for await (const [name] of (handle as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) {
          names.push(`${owner}/${name}`);
        }
      }
      return names;
    };

    contract(async () => mount());

    it('should publish with one native move from the staging directory', async () => {
      const provider = await mount();
      const { root, moved } = mounted.at(-1)!;
      await provider.writeFileStream('out/model.stl', streamOf(['a', 'b', 'c']));

      expect(moved).toHaveLength(1);
      expect(moved[0]).toMatch(/ to model\.stl$/u);
      await expect(stagedLeft(root)).resolves.toEqual([]);
    });

    it('should remove its staged file when the stream fails, and keep the target as it was', async () => {
      const provider = await mount();
      const { root, moved } = mounted.at(-1)!;
      await provider.writeFile('model.stl', 'old bytes');
      await expect(provider.writeFileStream('model.stl', streamOf(['new'], 1))).rejects.toThrow('the source failed');

      expect(moved).toEqual([]);
      await expect(stagedLeft(root)).resolves.toEqual([]);
      await expect(provider.readFile('model.stl', 'utf8')).resolves.toBe('old bytes');
    });

    it('should fall back to the writable stream where the engine has no native move', async () => {
      const provider = await mount({ nativeMove: false });
      await provider.writeFileStream('model.stl', streamOf(['swap ', 'file']));
      await expect(provider.readFile('model.stl', 'utf8')).resolves.toBe('swap file');
      expect(mounted.at(-1)?.moved).toEqual([]);
    });
  });

  describe('NodeFsProvider (temp sibling, synced and renamed)', () => {
    const roots: string[] = [];
    afterEach(() => {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    });
    const open = async (): Promise<NodeFsProvider> => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-node-stream-')));
      roots.push(root);
      return new NodeFsProvider(root);
    };

    contract(open);

    it('should leave no temp sibling behind when the stream fails part way', async () => {
      const provider = await open();
      const root = roots.at(-1)!;
      writeFileSync(join(root, 'model.stl'), 'old bytes');
      await expect(provider.writeFileStream('model.stl', streamOf(['new', 'er'], 1))).rejects.toThrow(
        'the source failed',
      );

      expect(readdirSync(root)).toEqual(['model.stl']);
      expect(readFileSync(join(root, 'model.stl'), 'utf8')).toBe('old bytes');
    });

    it('should sweep crashed temp siblings the first time it writes in their directory', async () => {
      const provider = await open();
      const root = roots.at(-1)!;
      const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
      const orphaned = `.model.stl.999999999.${uuid}.tmp`;
      const abandoned = `.model.stl.${String(process.pid)}.${uuid.replace('0f8', '1f8')}.tmp`;
      const inFlight = `.part.stl.${String(process.pid)}.${uuid.replace('0f8', '2f8')}.tmp`;
      const orphanedRecently = `.part.stl.999999999.${uuid.replace('0f8', '3f8')}.tmp`;
      for (const name of [orphaned, abandoned, inFlight, orphanedRecently]) {
        writeFileSync(join(root, name), 'torn');
      }
      const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * 60_000);
      utimesSync(join(root, orphaned), minutesAgo(5), minutesAgo(5));
      utimesSync(join(root, abandoned), minutesAgo(25 * 60), minutesAgo(25 * 60));

      await provider.writeFileStream('model.stl', streamOf(['whole']));

      expect(readdirSync(root).toSorted()).toEqual([inFlight, orphanedRecently, 'model.stl'].toSorted());
    });

    it('should write a stream larger than one read chunk and verify it whole', async () => {
      const provider = await open();
      const chunk = 'x'.repeat(256 * 1024);
      await provider.writeFileStream('large.bin', streamOf(Array.from({ length: 6 }, () => chunk)));
      expect(readFileSync(join(roots.at(-1)!, 'large.bin')).byteLength).toBe(6 * chunk.length);
    });
  });
});
