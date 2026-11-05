import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import { OPFSProvider } from '#backend/opfs-provider.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';
import type { MockRootHandleOptions } from '#testing/mock-handle-factory.js';
import { RootedFileSystemError } from '#workspace-errors.js';
import type { UncommittedChangesetStore, UncommittedRecord } from '#backend/uncommitted-changesets.js';

describe('OPFSProvider lifecycle', () => {
  beforeEach(() => {
    const root = createMockRootHandle() as unknown as FileSystemDirectoryHandle;
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn().mockResolvedValue(root) } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const operations: ReadonlyArray<{
    name: string;
    run: (provider: OPFSProvider) => Promise<unknown>;
  }> = [
    { name: 'writeFile', run: async (provider) => provider.writeFile('file', 'x') },
    { name: 'appendFile', run: async (provider) => provider.appendFile('file', 'x') },
    { name: 'readFile', run: async (provider) => provider.readFile('file') },
    { name: 'readdir', run: async (provider) => provider.readdir('') },
    { name: 'readdirWithStats', run: async (provider) => provider.readdirWithStats('') },
    { name: 'stat', run: async (provider) => provider.stat('') },
    { name: 'lstat', run: async (provider) => provider.lstat('') },
    { name: 'exists', run: async (provider) => provider.exists('') },
    { name: 'mkdir', run: async (provider) => provider.mkdir('directory') },
    { name: 'unlink', run: async (provider) => provider.unlink('file') },
    { name: 'rmdir', run: async (provider) => provider.rmdir('directory') },
    { name: 'rename', run: async (provider) => provider.rename('source', 'target') },
    { name: 'readFileStream', run: async (provider) => provider.readFileStream('file') },
    { name: 'refresh', run: async (provider) => provider.refresh() },
  ];

  it.each(['before initialization', 'after disposal'] as const)('rejects every public operation %s', async (phase) => {
    for (const operation of operations) {
      const provider = new OPFSProvider();
      if (phase === 'after disposal') {
        // oxlint-disable-next-line no-await-in-loop -- Each operation needs an independently revoked root.
        await provider.initialize();
        provider.dispose();
      }
      // oxlint-disable-next-line no-await-in-loop -- Table assertions intentionally execute in a deterministic order.
      await expect(operation.run(provider), operation.name).rejects.toThrow('not initialized');
    }
  });

  it('reports an origin-private filesystem that will not open as ROOT_UNAVAILABLE', async () => {
    // `getDirectory` is a function in every WebKit session and only the call
    // itself separates a persistent profile from an ephemeral (private-browsing)
    // one, where it rejects with a bare `UnknownError: ... (e.g. out of memory)`.
    // A caller must get the typed root failure the bridge already carries.
    const failure = new DOMException('The operation failed for an unknown transient reason.', 'UnknownError');
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn().mockRejectedValue(failure) } });
    const provider = new OPFSProvider();

    const thrown = await provider.initialize().then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(RootedFileSystemError);
    expect(thrown).toMatchObject({ code: 'ROOT_UNAVAILABLE', cause: failure });
  });

  it('allows operations after initialization and revokes them on dispose', async () => {
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('file.txt', 'ready');
    await expect(provider.readFile('file.txt', 'utf8')).resolves.toBe('ready');

    provider.dispose();
    await expect(provider.readFile('file.txt')).rejects.toThrow('not initialized');
  });

  it('should sweep a dead owner and keep one that started while the sweep asked for locks', async () => {
    const root = createMockRootHandle() as unknown as FileSystemDirectoryHandle;
    const staging = await root.getDirectoryHandle('.tau-staging', { create: true });
    await staging.getDirectoryHandle('dead-owner', { create: true });
    vi.stubGlobal('navigator', {
      storage: { getDirectory: vi.fn().mockResolvedValue(root) },
      locks: {
        request: async (_name: string, _options: unknown, callback: () => Promise<void>): Promise<void> => {
          // The owner lock is held for the realm's lifetime: its callback never settles.
          await callback();
        },
        // An owner that takes its lock and creates its directory after this
        // query answers is still writing, and must survive the sweep.
        query: async () => {
          await staging.getDirectoryHandle('late-owner', { create: true });
          return { held: [], pending: [] };
        },
      },
    });

    await new OPFSProvider().initialize();

    const left: string[] = [];
    for await (const [name] of (staging as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) {
      left.push(name);
    }
    expect(left).toEqual(['late-owner']);
  });
});

describe('OPFS writes via sync access handles', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252]);

  const mountRoot = (
    options: MockRootHandleOptions,
  ): { root: ReturnType<typeof createMockRootHandle>; acquired: string[] } => {
    const acquired: string[] = [];
    const root = createMockRootHandle({ ...options, onAcquireWriteApi: (api) => acquired.push(api) });
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn().mockResolvedValue(root) } });
    return { root, acquired };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes through createSyncAccessHandle when the API exists', async () => {
    const { acquired } = mountRoot({});
    const provider = new OPFSProvider();
    await provider.initialize();
    acquired.length = 0;

    await provider.writeFile('nested/data.bin', bytes);

    expect(acquired).toEqual(['sync']);
    await expect(provider.readFile('nested/data.bin')).resolves.toEqual(bytes);
  });

  it('truncates a longer prior file instead of leaving a tail', async () => {
    mountRoot({});
    const provider = new OPFSProvider();
    await provider.initialize();

    await provider.writeFile('data.bin', new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]));
    await provider.writeFile('data.bin', new Uint8Array([1, 2]));

    await expect(provider.readFile('data.bin')).resolves.toEqual(new Uint8Array([1, 2]));
  });

  it('completes a short sync overwrite before truncating', async () => {
    mountRoot({ syncWriteLimit: 2 });
    const provider = new OPFSProvider();
    await provider.initialize();

    await provider.writeFile('data.bin', bytes);

    await expect(provider.readFile('data.bin')).resolves.toEqual(bytes);
  });

  it('completes a short sync append without truncating the tail', async () => {
    const { root } = mountRoot({ syncWriteLimit: 2 });
    const provider = new OPFSProvider();
    await provider.initialize();
    const fileHandle = await root.getFileHandle('events.log', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write('head');
    await writable.close();

    await provider.appendFile('events.log', '-tail');

    await expect(provider.readFile('events.log', 'utf8')).resolves.toBe('head-tail');
  });

  it('rejects a zero-progress sync write', async () => {
    mountRoot({ syncWriteLimit: 0 });
    const provider = new OPFSProvider();
    await provider.initialize();

    await expect(provider.writeFile('data.bin', bytes)).rejects.toThrow(/0 of 6 bytes/);
  });

  it('falls back to createWritable when the environment lacks the API', async () => {
    const { acquired } = mountRoot({ syncAccess: false });
    const provider = new OPFSProvider();
    await provider.initialize();

    expect(provider.capabilities.durability).toBe('stream-append');
    await provider.writeFile('data.bin', bytes);

    expect(acquired).toEqual(['writable']);
    await expect(provider.readFile('data.bin')).resolves.toEqual(bytes);
  });

  it('cannot open a writable stream while another sync handle is open', async () => {
    const { root, acquired } = mountRoot({});
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('data.bin', new Uint8Array([7]));

    const contendedHandle = await root.getFileHandle('data.bin');
    const contender = await contendedHandle.createSyncAccessHandle!();
    acquired.length = 0;
    try {
      await expect(provider.writeFile('data.bin', bytes)).rejects.toMatchObject({
        name: 'NoModificationAllowedError',
      });
    } finally {
      contender.close();
    }

    expect(acquired).toEqual(['sync', 'sync', 'writable']);
    await expect(provider.readFile('data.bin')).resolves.toEqual(new Uint8Array([7]));
  });

  it('keeps the user-picked webaccess provider on createWritable', async () => {
    const acquired: string[] = [];
    const root = createMockRootHandle({ onAcquireWriteApi: (api) => acquired.push(api) });
    const provider = new FileSystemAccessProvider(root as unknown as FileSystemDirectoryHandle);

    await provider.writeFile('data.bin', bytes);

    expect(acquired).toEqual(['writable']);
    await expect(provider.readFile('data.bin')).resolves.toEqual(bytes);
  });

  it('appends at getSize through one sync access handle', async () => {
    const { acquired } = mountRoot({});
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('events.log', 'head');
    acquired.length = 0;

    await provider.appendFile('events.log', '-tail');

    expect(acquired).toEqual(['sync']);
    await expect(provider.readFile('events.log', 'utf8')).resolves.toBe('head-tail');
  });

  it('cannot append through a writable stream while another sync handle is open', async () => {
    const { root, acquired } = mountRoot({});
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('events.log', 'head');
    const fileHandle = await root.getFileHandle('events.log');
    const contender = await fileHandle.createSyncAccessHandle!();
    acquired.length = 0;
    try {
      await expect(provider.appendFile('events.log', '-tail')).rejects.toMatchObject({
        name: 'NoModificationAllowedError',
      });
    } finally {
      contender.close();
    }

    expect(acquired).toEqual(['sync', 'sync', 'writable']);
    await expect(provider.readFile('events.log', 'utf8')).resolves.toBe('head');
  });
});

describe('OPFS rename via native move', () => {
  const mountRoot = (
    options: MockRootHandleOptions,
  ): { root: ReturnType<typeof createMockRootHandle>; acquired: string[]; moved: string[] } => {
    const acquired: string[] = [];
    const moved: string[] = [];
    const root = createMockRootHandle({
      ...options,
      onAcquireWriteApi: (api) => acquired.push(api),
      onMove: (from, to) => moved.push(`${from} to ${to}`),
    });
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn().mockResolvedValue(root) } });
    return { root, acquired, moved };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should move a file with one native move and no byte copy', async () => {
    const { acquired, moved } = mountRoot({ nativeMove: true });
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('dir/a.tau-staged.1.tmp', 'staged bytes');
    acquired.length = 0;

    await provider.rename('dir/a.tau-staged.1.tmp', 'dir/a.ts');

    expect(moved).toEqual(['a.tau-staged.1.tmp to a.ts']);
    expect(acquired).toEqual([]);
    await expect(provider.readFile('dir/a.ts', 'utf8')).resolves.toBe('staged bytes');
    await expect(provider.exists('dir/a.tau-staged.1.tmp')).resolves.toBe(false);
  });

  it('should create missing destination parents for a native move', async () => {
    const { moved } = mountRoot({ nativeMove: true });
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('source.txt', 'payload');

    await provider.rename('source.txt', 'new/nested/target.txt');

    expect(moved).toEqual(['source.txt to target.txt']);
    await expect(provider.readFile('new/nested/target.txt', 'utf8')).resolves.toBe('payload');
    await expect(provider.stat('new/nested')).resolves.toMatchObject({ type: 'dir' });
  });

  it('should refuse an existing destination with EEXIST without moving', async () => {
    const { moved } = mountRoot({ nativeMove: true });
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('source.txt', 'source');
    await provider.writeFile('target.txt', 'target');

    await expect(provider.rename('source.txt', 'target.txt')).rejects.toMatchObject({ code: 'EEXIST' });

    expect(moved).toEqual([]);
    await expect(provider.readFile('source.txt', 'utf8')).resolves.toBe('source');
    await expect(provider.readFile('target.txt', 'utf8')).resolves.toBe('target');
  });

  it('should reject a missing source with ENOENT', async () => {
    mountRoot({ nativeMove: true });
    const provider = new OPFSProvider();
    await provider.initialize();

    await expect(provider.rename('missing.txt', 'target.txt')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('should copy through a sync handle when the engine has no native move', async () => {
    const { acquired, moved } = mountRoot({ nativeMove: false });
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('source.txt', 'payload');
    acquired.length = 0;

    await provider.rename('source.txt', 'target.txt');

    expect(moved).toEqual([]);
    expect(acquired).toEqual(['sync']);
    await expect(provider.readFile('target.txt', 'utf8')).resolves.toBe('payload');
    await expect(provider.exists('source.txt')).resolves.toBe(false);
  });

  it('should fall back to the copy path when the engine refuses move as unsupported', async () => {
    const { root, acquired } = mountRoot({ nativeMove: true });
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('source.txt', 'payload');
    const originalGetFileHandle = root.getFileHandle.bind(root);
    vi.spyOn(root, 'getFileHandle').mockImplementation(async (name, options) => {
      const handle = await originalGetFileHandle(name, options);
      if (name === 'source.txt' && handle.move !== undefined) {
        vi.spyOn(handle, 'move').mockRejectedValue(new DOMException('unsupported', 'NotSupportedError'));
      }
      return handle;
    });
    acquired.length = 0;

    await provider.rename('source.txt', 'out/target.txt');

    expect(acquired).toEqual(['sync']);
    await expect(provider.readFile('out/target.txt', 'utf8')).resolves.toBe('payload');
    await expect(provider.exists('source.txt')).resolves.toBe(false);
  });

  it.each([
    { refusal: 'NotFoundError', code: 'ENOENT' },
    { refusal: 'InvalidModificationError', code: 'EEXIST' },
    { refusal: 'TypeMismatchError', code: 'EEXIST' },
  ])('should report a native $refusal as $code with the DOM exception as cause', async ({ refusal, code }) => {
    const { root } = mountRoot({ nativeMove: true });
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('source.txt', 'payload');
    const originalGetFileHandle = root.getFileHandle.bind(root);
    vi.spyOn(root, 'getFileHandle').mockImplementation(async (name, options) => {
      const handle = await originalGetFileHandle(name, options);
      if (name === 'source.txt' && handle.move !== undefined) {
        vi.spyOn(handle, 'move').mockRejectedValue(new DOMException('refused', refusal));
      }
      return handle;
    });

    await expect(provider.rename('source.txt', 'target.txt')).rejects.toMatchObject({
      code,
      cause: { name: refusal },
    });
    await expect(provider.readFile('source.txt', 'utf8')).resolves.toBe('payload');
  });

  it('should remove the parents it created and keep the source when a native move fails', async () => {
    const { root } = mountRoot({ nativeMove: true });
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('source.txt', 'payload');
    const sourceHandle = await root.getFileHandle('source.txt');
    const contender = await sourceHandle.createSyncAccessHandle!();
    try {
      await expect(provider.rename('source.txt', 'created/target.txt')).rejects.toMatchObject({
        code: 'EBUSY',
        cause: { name: 'NoModificationAllowedError' },
      });
    } finally {
      contender.close();
    }

    await expect(provider.exists('created')).resolves.toBe(false);
    await expect(provider.readFile('source.txt', 'utf8')).resolves.toBe('payload');
  });
});

describe('OPFS uncommitted create changesets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

  /** An in-memory record store that logs every call, in order. */
  const memoryStore = (seed: readonly UncommittedRecord[] = []) => {
    const records = new Map(seed.map((record) => [record.changesetId, record]));
    const calls: string[] = [];
    const store: UncommittedChangesetStore = {
      put: async (record) => {
        calls.push(`put ${record.entries.map(({ path, size }) => `${path}:${String(size)}`).join(',')}`);
        records.set(record.changesetId, record);
      },
      delete: async ({ changesetId }) => {
        calls.push('delete');
        records.delete(changesetId);
      },
      list: async (root) => [...records.values()].filter((record) => record.root === root),
    };
    return { store, records, calls };
  };

  const stubRoot = (held: readonly string[] = [], options: MockRootHandleOptions = {}) => {
    const writes: string[] = [];
    const root = createMockRootHandle({
      ...options,
      onAcquireWriteApi: (api) => {
        writes.push(api);
      },
    });
    vi.stubGlobal('navigator', {
      storage: { getDirectory: vi.fn().mockResolvedValue(root) },
      locks: {
        // A granted callback's result is the request's result; the owner lock's never settles.
        request: async <T>(_name: string, _options: unknown, callback: () => Promise<T>): Promise<T> => callback(),
        query: async () => ({ held: held.map((owner) => ({ name: `tau-fs-staging-owner:${owner}` })), pending: [] }),
      },
    });
    return { root, writes };
  };

  const deadRecord = (entries: UncommittedRecord['entries'], recordedAt = Date.now()): UncommittedRecord => ({
    root: 'opfs:origin',
    owner: 'dead-owner',
    changesetId: 'changeset-1',
    recordedAt,
    entries,
  });

  it('should record only the paths a batch created, once, before any write, and delete the record once they settle', async () => {
    const { root, writes } = stubRoot();
    await root.getFileHandle('taken.ts', { create: true });
    const { store: inner, records, calls } = memoryStore();
    const store: UncommittedChangesetStore = {
      ...inner,
      put: async (record) => {
        calls.push(`writes before put ${String(writes.length)}`);
        await inner.put(record);
      },
    };
    const provider = new OPFSProvider({ uncommitted: store });
    await provider.initialize();
    writes.length = 0;

    const receipts = await provider.applyBatch([
      { op: 'write', path: 'dir/new.ts', data: bytes('new'), create: true },
      { op: 'write', path: 'taken.ts', data: bytes('mine'), create: true },
    ]);

    expect(receipts.map(({ outcome }) => outcome)).toEqual(['applied', 'failed']);
    expect(calls).toEqual(['writes before put 0', 'put dir/new.ts:3', 'delete']);
    expect(records.size).toBe(0);
    await expect(provider.readFile('taken.ts', 'utf8')).resolves.toBe('');
    calls.length = 0;

    await provider.applyBatch([{ op: 'write', path: 'other.ts', data: bytes('replace') }]);

    expect(calls).toEqual([]);
  });

  it('should rewrite one record in place, up to eight creates a put, making each file only after its put', async () => {
    const { writes } = stubRoot();
    const { store: inner, records } = memoryStore();
    const puts: Array<Readonly<{ id: string; paths: string[]; writes: number }>> = [];
    const createdBeforeTheirPut: string[] = [];
    const late: { provider?: OPFSProvider } = {};
    const store: UncommittedChangesetStore = {
      ...inner,
      put: async (record) => {
        const paths = record.entries.map(({ path }) => path);
        const added = paths.slice(puts.at(-1)?.paths.length ?? 0);
        puts.push({ id: record.changesetId, paths, writes: writes.length });
        for (const path of added) {
          // oxlint-disable-next-line no-await-in-loop -- checked one at a time, before the put lands.
          if ((await late.provider?.exists(path)) === true) {
            createdBeforeTheirPut.push(path);
          }
        }
        await inner.put(record);
      },
    };
    const provider = new OPFSProvider({ uncommitted: store });
    late.provider = provider;
    await provider.initialize();
    writes.length = 0;
    const paths = Array.from({ length: 20 }, (_, index) => `many/${String(index)}.ts`);

    const receipts = await provider.applyBatch(
      paths.map((path) => ({ op: 'write', path, data: bytes(path), create: true }) as const),
    );

    expect(receipts.every(({ outcome }) => outcome === 'applied')).toBe(true);
    expect(new Set(puts.map(({ id }) => id)).size).toBe(1);
    expect(puts.at(-1)?.paths.toSorted()).toEqual(paths.toSorted());
    // Groups of 1, 2, 4, then up to 8: 20 creates take five puts.
    expect(puts.map(({ paths: covered }) => covered.length)).toEqual([1, 3, 7, 15, 20]);
    for (const [index, put] of puts.entries()) {
      const previous = puts[index - 1]?.paths ?? [];
      // The record only grows, and no write has begun on a path the puts so far did not cover.
      expect(put.paths.slice(0, previous.length)).toEqual(previous);
      expect(put.writes).toBeLessThanOrEqual(previous.length);
    }
    // A crash before a put leaves no file at a path the record does not name.
    expect(createdBeforeTheirPut).toEqual([]);
    expect(records.size).toBe(0);
  });

  it('should keep the person’s file a refused create named when its realm dies before the record is deleted', async () => {
    const { root } = stubRoot();
    await root.getFileHandle('person.ts', { create: true });
    const kept: UncommittedRecord[] = [];
    const { store: inner } = memoryStore();
    const store: UncommittedChangesetStore = {
      ...inner,
      put: async (record) => {
        kept.push(record);
        await inner.put(record);
      },
    };
    const writer = new OPFSProvider({ uncommitted: store });
    await writer.initialize();
    await writer.applyBatch([
      { op: 'write', path: 'person.ts', data: bytes('overwrite'), create: true },
      { op: 'write', path: 'fresh.ts', data: bytes('fresh'), create: true },
    ]);
    // The realm dies with its record kept: a sibling finds it under a dead owner.
    const { store: survivor, records } = memoryStore(kept.map((record) => ({ ...record, owner: 'dead-owner' })));

    const provider = new OPFSProvider({ uncommitted: survivor });
    await provider.initialize();

    expect(kept.flatMap(({ entries }) => entries.map(({ path }) => path))).toEqual(['fresh.ts']);
    await expect(provider.readFile('person.ts', 'utf8')).resolves.toBe('');
    await expect(provider.readFile('fresh.ts', 'utf8')).resolves.toBe('fresh');
    expect(records.size).toBe(0);
  });

  it('should remove the empty file a crashed create left, report it, and drop the record', async () => {
    const { root } = stubRoot();
    const directory = await root.getDirectoryHandle('src', { create: true });
    await directory.getFileHandle('torn.ts', { create: true });
    const { store, records } = memoryStore([deadRecord([{ path: 'src/torn.ts', size: 12 }])]);
    const onRecovered = vi.fn();

    const provider = new OPFSProvider({ uncommitted: store, onRecovered });
    await provider.initialize();

    await expect(provider.exists('src/torn.ts')).resolves.toBe(false);
    expect(onRecovered).toHaveBeenCalledWith(['src/torn.ts']);
    expect(records.size).toBe(0);
  });

  it('should keep a recorded file that holds bytes, one edited after the crash, and one never created', async () => {
    const { root } = stubRoot();
    const directory = await root.getDirectoryHandle('src', { create: true });
    const landed = await directory.getFileHandle('landed.ts', { create: true });
    const writable = await landed.createWritable();
    await writable.write(bytes('done'));
    await writable.close();
    await directory.getFileHandle('emptied.ts', { create: true });
    const { store, records } = memoryStore([
      deadRecord(
        [
          { path: 'src/landed.ts', size: 12 },
          { path: 'src/emptied.ts', size: 5 },
          { path: 'src/never-started.ts', size: 7 },
        ],
        // Beyond the slack: `emptied.ts` was modified long after the record was kept.
        Date.now() - 10 * 60_000,
      ),
    ]);
    const onRecovered = vi.fn();

    const provider = new OPFSProvider({ uncommitted: store, onRecovered });
    await provider.initialize();

    await expect(provider.readFile('src/landed.ts', 'utf8')).resolves.toBe('done');
    await expect(provider.readFile('src/emptied.ts', 'utf8')).resolves.toBe('');
    expect(onRecovered).not.toHaveBeenCalled();
    expect(records.size).toBe(0);
  });

  it('should keep an empty file copied in with a time long before the record', async () => {
    const { root } = stubRoot();
    const copied = await root.getFileHandle('synced.ts', { create: true });
    // A sync tool keeps the source's time: far before the crashed batch's record.
    (copied as unknown as { _entry: { lastModified: number } })._entry.lastModified = Date.now() - 24 * 3_600_000;
    const { store, records } = memoryStore([deadRecord([{ path: 'synced.ts', size: 8 }])]);
    const onRecovered = vi.fn();

    await new OPFSProvider({ uncommitted: store, onRecovered }).initialize();

    await expect(root.getFileHandle('synced.ts')).resolves.toBeDefined();
    expect(onRecovered).not.toHaveBeenCalled();
    expect(records.size).toBe(0);
  });

  it('should keep an empty file recorded as empty', async () => {
    const { root } = stubRoot();
    await root.getFileHandle('empty.ts', { create: true });
    const { store } = memoryStore([deadRecord([{ path: 'empty.ts', size: 0 }])]);

    await new OPFSProvider({ uncommitted: store }).initialize();

    await expect(root.getFileHandle('empty.ts')).resolves.toBeDefined();
  });

  it('should leave a live realm’s record and its files alone', async () => {
    const { root } = stubRoot(['live-owner']);
    await root.getFileHandle('writing.ts', { create: true });
    const { store, records } = memoryStore([{ ...deadRecord([{ path: 'writing.ts', size: 9 }]), owner: 'live-owner' }]);

    await new OPFSProvider({ uncommitted: store }).initialize();

    await expect(root.getFileHandle('writing.ts')).resolves.toBeDefined();
    expect(records.size).toBe(1);
  });

  it('should stage a batch’s creates and move them into place when its record cannot be kept', async () => {
    const { writes } = stubRoot([], { nativeMove: true });
    const { store: inner } = memoryStore();
    const store: UncommittedChangesetStore = {
      ...inner,
      put: async () => {
        throw new Error('quota');
      },
    };
    const provider = new OPFSProvider({ uncommitted: store });
    await provider.initialize();
    writes.length = 0;

    const receipts = await provider.applyBatch([{ op: 'write', path: 'dir/new.ts', data: bytes('new'), create: true }]);

    expect(receipts).toEqual([{ outcome: 'applied', kind: 'file', created: true }]);
    expect(writes).toEqual(['sync']);
    await expect(provider.readFile('dir/new.ts', 'utf8')).resolves.toBe('new');
  });

  it('should refuse a batch’s creates, leaving no file, when the record cannot be kept and nothing can stage', async () => {
    stubRoot([], { nativeMove: false });
    const { store: inner } = memoryStore();
    const store: UncommittedChangesetStore = {
      ...inner,
      put: async () => {
        throw new Error('quota');
      },
    };
    const provider = new OPFSProvider({ uncommitted: store });
    await provider.initialize();

    const [receipt] = await provider.applyBatch([{ op: 'write', path: 'new.ts', data: bytes('new'), create: true }]);

    expect(receipt?.outcome).toBe('failed');
    await expect(provider.exists('new.ts')).resolves.toBe(false);
  });

  it('should log a record it cannot delete after retries and still return the receipts', async () => {
    stubRoot();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store: inner, calls } = memoryStore();
    const store: UncommittedChangesetStore = {
      ...inner,
      delete: async () => {
        calls.push('delete');
        throw new Error('blocked');
      },
    };
    const provider = new OPFSProvider({ uncommitted: store });
    await provider.initialize();

    const receipts = await provider.applyBatch([{ op: 'write', path: 'new.ts', data: bytes('new'), create: true }]);

    expect(receipts).toEqual([{ outcome: 'applied', kind: 'file', created: true }]);
    expect(calls.filter((call) => call === 'delete')).toHaveLength(3);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
