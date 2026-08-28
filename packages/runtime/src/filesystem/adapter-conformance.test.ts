/**
 * X9 — one conformance table every first-party `RuntimeFileSystemBase`
 * adapter runs through, mirroring the shape of
 * `libs/filesystem/src/backend/provider-tree-conformance.test.ts`
 * (`describe.each` over `'$name …'` rows plus an `expectCode` helper). That
 * suite cannot be extended to these adapters: it would have to import
 * `packages/runtime`, and the dependency runs the other way. `packages/runtime`
 * can see both sides, so the table lives here and registers
 * `MemoryProvider` from `@taucad/filesystem/backend` as the reference row.
 *
 * It replaces the three near-identical private traversal tables that used to
 * live in `from-node-fs-handle.test.ts`, `from-fs-like-handle.test.ts` and
 * `from-browser-fs-subpath.test.ts`, and gives `from-memory-fs-handle.ts` and
 * `from-browser-fs.ts` their first behavioural coverage.
 *
 * **The bridge authority accepts real `MessagePort` connections only.** The
 * `instanceof MessagePort` guard in `isFileSystemBridgeConnectEnvelope`
 * (`libs/fs-bridge/src/filesystem-bridge.ts`) is deliberately unwidened — it is
 * the only thing stopping a hostile connect envelope from installing a fake
 * port. The `bridge` row below therefore connects over a genuine Node
 * `worker_threads` `MessageChannel` (`worker_threads.MessagePort ===
 * globalThis.MessagePort`); the *client* end is where X7's widening applies.
 *
 * Divergences are declared, never skipped: each row lists the contracts it
 * cannot meet together with the reason, and `conformance divergence ledger`
 * fails if any reason is missing.
 */

import fs from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { MemoryProvider } from '@taucad/filesystem/backend';
import { exposeFileSystem, openFileSystemBridge } from '@taucad/fs-bridge';

import * as filesystemBarrel from '#filesystem/index.js';
import { fromBrowserFs } from '#filesystem/from-browser-fs.js';
import { fromNodeFs } from '#filesystem/from-node-fs.js';
import { _fromFsLikeHandle } from '#transport/_internal/from-fs-like-handle.js';
import type { FsLike } from '#transport/_internal/from-fs-like-handle.js';
import { _fromMemoryFsHandle } from '#transport/_internal/from-memory-fs-handle.js';
import { _fromNodeFsHandle } from '#transport/_internal/from-node-fs-handle.js';
import { resolveRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import { createWorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import type { RuntimeFileSystemBase, RuntimeWatchEvent } from '#types/runtime-kernel.types.js';

// ---------------------------------------------------------------------------
// Contracts a row may diverge from, each with the reason it does
// ---------------------------------------------------------------------------

type ContractId =
  | 'writeFile-creates-parents'
  | 'mkdir-reports-existing'
  | 'mkdir-requires-parent'
  | 'rmdir-guards-kind-and-emptiness'
  | 'unlink-rejects-directories'
  | 'rename-directories'
  | 'containment'
  | 'symlinks'
  | 'watch';

// ---------------------------------------------------------------------------
// Minimal in-memory File System Access root for the `browser` row.
// `libs/filesystem`'s richer `createMockRootHandle` is unreachable from here —
// it sits behind that package's private `#testing/` import and the package
// exposes no `./testing` subpath, which this batch's scope forbids adding.
// ---------------------------------------------------------------------------

type MockFileEntry = {
  kind: 'file';
  bytes: Uint8Array<ArrayBuffer>;
  lastModified: number;
};
type MockEntry = MockFileEntry | { kind: 'directory'; handle: MockDirectory };
type MockDirectory = {
  readonly kind: 'directory';
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MockDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<unknown>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterableIterator<[string, unknown]>;
};

const notFound = (): DOMException => new DOMException('no such entry', 'NotFoundError');
const typeMismatch = (): DOMException => new DOMException('wrong entry kind', 'TypeMismatchError');

function createMockRoot(name = 'root'): MockDirectory {
  const children = new Map<string, MockEntry>();

  return {
    kind: 'directory',
    name,
    async getDirectoryHandle(childName, options) {
      const existing = children.get(childName);
      if (existing?.kind === 'directory') {
        return existing.handle;
      }
      if (existing !== undefined) {
        throw typeMismatch();
      }
      if (options?.create !== true) {
        throw notFound();
      }
      const handle = createMockRoot(childName);
      children.set(childName, { kind: 'directory', handle });
      return handle;
    },
    async getFileHandle(childName, options) {
      const existing = children.get(childName);
      if (existing?.kind === 'directory') {
        throw typeMismatch();
      }
      if (existing === undefined) {
        if (options?.create !== true) {
          throw notFound();
        }
        children.set(childName, {
          kind: 'file',
          bytes: new Uint8Array(),
          lastModified: Date.now(),
        });
      }
      return {
        kind: 'file',
        name: childName,
        async getFile() {
          const entry = children.get(childName) as MockFileEntry;
          return {
            size: entry.bytes.byteLength,
            lastModified: entry.lastModified,
            async arrayBuffer() {
              return new Uint8Array(entry.bytes).buffer;
            },
          };
        },
        async createWritable() {
          const chunks: Array<Uint8Array<ArrayBuffer>> = [];
          return {
            async write(data: Uint8Array<ArrayBuffer> | string) {
              chunks.push(typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data));
            },
            async close() {
              const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
              let offset = 0;
              for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
              }
              children.set(childName, {
                kind: 'file',
                bytes,
                lastModified: Date.now(),
              });
            },
          };
        },
      };
    },
    async removeEntry(childName) {
      if (!children.has(childName)) {
        throw notFound();
      }
      children.delete(childName);
    },
    async *entries() {
      for (const [key, value] of children) {
        yield [key, value.kind === 'directory' ? value.handle : { kind: 'file', name: key }] as [string, unknown];
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

const temporaryDirectories: string[] = [];
const teardowns: Array<() => void> = [];

const makeTemporaryDirectory = async (prefix: string): Promise<string> => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
};

/** `FsLike` backed by Node `fs.promises` rooted at `root`, i.e. the shape memfs/BrowserFS present. */
const nodeBackedFsLike = (root: string): FsLike => {
  function readFile(filePath: string, encoding: 'utf8'): Promise<string>;
  function readFile(filePath: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(filePath: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === undefined
      ? new Uint8Array(await fs.readFile(path.join(root, filePath)))
      : fs.readFile(path.join(root, filePath), encoding);
  }

  return {
    promises: {
      readFile,
      writeFile: async (filePath, data) => fs.writeFile(path.join(root, filePath), data),
      mkdir: async (directoryPath, options) => fs.mkdir(path.join(root, directoryPath), options),
      readdir: async (directoryPath) => fs.readdir(path.join(root, directoryPath)),
      unlink: async (filePath) => fs.unlink(path.join(root, filePath)),
      rmdir: async (directoryPath) => fs.rmdir(path.join(root, directoryPath)),
      rename: async (oldPath, newPath) => fs.rename(path.join(root, oldPath), path.join(root, newPath)),
      stat: async (filePath) => fs.stat(path.join(root, filePath)),
      lstat: async (filePath) => fs.lstat(path.join(root, filePath)),
    },
  };
};

const inlineBase = (handle: ReturnType<typeof _fromMemoryFsHandle>): RuntimeFileSystemBase => {
  if (handle.kind !== 'inline') {
    throw new Error('Expected an inline filesystem handle.');
  }
  return handle.create();
};

type AdapterRow = {
  /** Row label, also the `$name` in the `describe.each` titles. */
  readonly name: string;
  /**
   * Factory identifiers this row covers, as discovered by the registration
   * guard below. `[]` marks a reference row that is not a runtime adapter.
   */
  readonly covers: readonly string[];
  /** Fresh, isolated adapter instance; `dispose()` is called by every test. */
  readonly create: () => Promise<RuntimeFileSystemBase>;
  /** Contracts this row does not meet, each with the reason. Never a bare skip. */
  readonly diverges: Partial<Record<ContractId, string>>;
};

const rows: readonly AdapterRow[] = [
  {
    name: 'node',
    covers: ['from-node-fs-handle.ts', 'fromNodeFs'],
    create: async () => inlineBase(_fromNodeFsHandle(await makeTemporaryDirectory('conformance-node-'))),
    diverges: {
      'writeFile-creates-parents':
        'A thin `fs.promises` wrapper: `writeFile` does not implicitly `mkdir -p`. Callers create the directory first (kernel-worker.ts uses `mkdir(dir, { recursive: true })`).',
    },
  },
  {
    name: 'memory',
    covers: ['from-memory-fs-handle.ts', 'fromMemoryFs'],
    create: async () => inlineBase(_fromMemoryFsHandle()),
    diverges: {
      symlinks: 'A flat path→bytes store has no link concept, so `lstat` cannot differ from `stat`.',
      watch: 'No change source: the store is only mutated through this adapter, and nothing subscribes.',
    },
  },
  {
    name: 'fs-like',
    covers: ['from-fs-like-handle.ts', 'fromFsLike'],
    create: async () =>
      inlineBase(_fromFsLikeHandle(nodeBackedFsLike(await makeTemporaryDirectory('conformance-fslike-')))),
    diverges: {
      'writeFile-creates-parents':
        'Forwards straight to the host `fsLike.promises.writeFile`; parents are the caller’s.',
      symlinks:
        '`FsLike` declares no `symlink`/`readlink`, so the adapter cannot create one — a backing object may still surface links through `lstat`.',
      watch: '`FsLike` carries no change-event API; the `watch` option was cut for want of an in-tree consumer.',
    },
  },
  {
    name: 'browser',
    covers: ['fromBrowserFs'],
    create: async () => {
      const handle = resolveRuntimeFileSystem(fromBrowserFs(createMockRoot() as unknown as FileSystemDirectoryHandle));
      if (handle.kind !== 'inline') {
        throw new Error('fromBrowserFs must produce an inline filesystem handle.');
      }
      return handle.create();
    },
    diverges: {
      'mkdir-reports-existing':
        'File System Access `getDirectoryHandle(name, { create: true })` is idempotent and reports no EEXIST.',
      'mkdir-requires-parent':
        'The same call creates intermediate directories unconditionally, so a missing parent cannot be reported.',
      'rmdir-guards-kind-and-emptiness':
        '`removeEntry(name, { recursive: true })` is the only removal primitive the API offers; it deletes files and non-empty trees alike.',
      'unlink-rejects-directories': 'Same primitive, same absence of a kind check.',
      'rename-directories':
        'FS Access has no directory move. The adapter copies file bytes and rejects directory sources with EISDIR rather than performing an unbounded recursive copy.',
      symlinks: 'The File System Access API exposes no links.',
      watch: 'FileSystemObserver is not wired into this adapter; the runtime bridge arm carries watch instead.',
    },
  },
  {
    name: 'bridge',
    covers: ['fromFileSystemBridge'],
    create: async () => {
      // A real Node `worker_threads` MessageChannel: the authority's connect
      // guard accepts genuine `MessagePort`s only, deliberately (X7's cut).
      const boundary = new MessageChannel();
      const exposed = exposeFileSystem(inlineBase(_fromMemoryFsHandle()), {
        messageSource: boundary.port2,
      });
      const connection = openFileSystemBridge(boundary.port1);
      const proxy = await createWorkerFileSystemProxy(connection.port);
      teardowns.push(() => {
        exposed.cleanup();
        boundary.port1.close();
        boundary.port2.close();
      });
      return proxy;
    },
    diverges: {
      symlinks: 'Inherited from the memory authority behind it.',
      watch: 'The memory authority advertises `watchable: false` in hello, so the proxy installs no `watch`.',
    },
  },
  {
    name: 'MemoryProvider (reference)',
    covers: [],
    create: async () => new MemoryProvider() as unknown as RuntimeFileSystemBase,
    diverges: {
      containment:
        'The `libs/filesystem` oracle is not a runtime adapter: it has no rooted-path validation of its own. Runtime adapters add that through `assertRootedPath`.',
      symlinks: 'An in-memory provider has no links.',
      watch: 'Not a `RuntimeFileSystemBase` factory; watch is the runtime adapters’ concern.',
    },
  },
];

afterAll(async () => {
  for (const teardown of teardowns) {
    teardown();
  }
  await Promise.all(temporaryDirectories.map(async (directory) => fs.rm(directory, { recursive: true, force: true })));
});

const expectCode = async (operation: Promise<unknown>, code: string): Promise<void> => {
  try {
    await operation;
    expect.fail(`Expected ${code}`);
  } catch (error) {
    expect((error as NodeJS.ErrnoException).code).toBe(code);
  }
};

const expectRejection = async (operation: Promise<unknown>): Promise<void> => {
  await expect(operation).rejects.toThrow();
};

const runs = (row: AdapterRow, contract: ContractId): boolean => row.diverges[contract] === undefined;

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

describe.each(rows)('$name adapter conformance', (row) => {
  it('round-trips text and binary content', async () => {
    const fileSystem = await row.create();
    try {
      const bytes = new Uint8Array([0, 1, 127, 128, 254, 255]);
      await fileSystem.writeFile('binary.bin', bytes);
      await fileSystem.writeFile('text.txt', 'héllo\nworld');

      await expect(fileSystem.readFile('binary.bin')).resolves.toEqual(bytes);
      await expect(fileSystem.readFile('text.txt', 'utf8')).resolves.toBe('héllo\nworld');
      // A second read must not observe a detached or mutated buffer.
      await expect(fileSystem.readFile('binary.bin')).resolves.toEqual(bytes);
    } finally {
      fileSystem.dispose();
    }
  });

  it('creates nested directories with recursive mkdir and tolerates an existing path', async () => {
    const fileSystem = await row.create();
    try {
      await fileSystem.mkdir('one/two/three', { recursive: true });

      await expect(fileSystem.stat('one/two/three')).resolves.toMatchObject({
        type: 'dir',
      });
      await expect(fileSystem.mkdir('one/two/three', { recursive: true })).resolves.toBeUndefined();
      await expect(fileSystem.exists('one/two')).resolves.toBe(true);
    } finally {
      fileSystem.dispose();
    }
  });

  it.runIf(runs(row, 'mkdir-reports-existing'))('rejects non-recursive mkdir on an existing path', async () => {
    const fileSystem = await row.create();
    try {
      await fileSystem.mkdir('existing', { recursive: true });

      await expectCode(fileSystem.mkdir('existing'), 'EEXIST');
      await expectCode(fileSystem.mkdir('existing', { recursive: false }), 'EEXIST');
      await expect(fileSystem.stat('existing')).resolves.toMatchObject({
        type: 'dir',
      });
    } finally {
      fileSystem.dispose();
    }
  });

  it.runIf(runs(row, 'mkdir-requires-parent'))('rejects non-recursive mkdir under a missing parent', async () => {
    const fileSystem = await row.create();
    try {
      await expectCode(fileSystem.mkdir('absent/child'), 'ENOENT');

      await expect(fileSystem.exists('absent')).resolves.toBe(false);
    } finally {
      fileSystem.dispose();
    }
  });

  /**
   * **No ordering is promised.** `fs.readdir` returns platform order while the
   * content-backed adapters return insertion order, so the contract is set
   * membership. Consumers that need deterministic order sort their own result.
   */
  it('lists exactly the directory members, in no promised order', async () => {
    const fileSystem = await row.create();
    try {
      await fileSystem.mkdir('listing', { recursive: true });
      await fileSystem.writeFile('listing/zeta.txt', 'z');
      await fileSystem.writeFile('listing/alpha.txt', 'a');
      await fileSystem.mkdir('listing/sub', { recursive: true });

      const entries = await fileSystem.readdir('listing');

      expect([...entries].sort()).toEqual(['alpha.txt', 'sub', 'zeta.txt']);
    } finally {
      fileSystem.dispose();
    }
  });

  it('reports the shared stat and lstat shape and raises ENOENT for missing paths', async () => {
    const fileSystem = await row.create();
    try {
      await fileSystem.mkdir('shape', { recursive: true });
      await fileSystem.writeFile('shape/file.txt', 'hello');

      const fileStat = await fileSystem.stat('shape/file.txt');
      const fileLstat = await fileSystem.lstat('shape/file.txt');
      // `contentKind` is deliberately outside the shared contract: content-backed
      // adapters classify the bytes ('text' plus `lineCount`), native-stat
      // adapters report 'binary' without reading them.
      expect(fileStat).toMatchObject({ type: 'file', size: 5 });
      expect(fileLstat).toMatchObject({ type: 'file', size: 5 });
      expect(typeof fileStat.mtimeMs).toBe('number');
      await expect(fileSystem.stat('shape')).resolves.toMatchObject({
        type: 'dir',
      });

      await expectCode(fileSystem.stat('shape/missing.txt'), 'ENOENT');
      await expectCode(fileSystem.lstat('shape/missing.txt'), 'ENOENT');
    } finally {
      fileSystem.dispose();
    }
  });

  /* Every row but `node` declares a `symlinks` divergence, so only the node
   * arm reaches this body; it rebuilds the adapter on a directory this test
   * owns, because creating the link needs host access `row.create()` hides. */
  it.runIf(runs(row, 'symlinks'))('distinguishes a symlink from its target through lstat', async () => {
    expect(row.name).toBe('node');
    const directory = await makeTemporaryDirectory('conformance-symlink-');
    await fs.writeFile(path.join(directory, 'target.txt'), 'linked');
    await fs.symlink(path.join(directory, 'target.txt'), path.join(directory, 'link.txt'));
    const fileSystem = inlineBase(_fromNodeFsHandle(directory));
    try {
      await expect(fileSystem.stat('link.txt')).resolves.toMatchObject({
        type: 'file',
        size: 6,
      });
      await expect(fileSystem.lstat('link.txt')).resolves.toMatchObject({
        type: 'file',
      });
      // `stat` follows the link, `lstat` describes the link entry itself.
      const linkStat = await fileSystem.lstat('link.txt');
      const targetStat = await fileSystem.stat('link.txt');
      expect(linkStat.size).not.toBe(targetStat.size);
    } finally {
      fileSystem.dispose();
    }
  });

  it('renames a file', async () => {
    const fileSystem = await row.create();
    try {
      await fileSystem.writeFile('before.txt', 'moved');

      await fileSystem.rename('before.txt', 'after.txt');

      await expect(fileSystem.readFile('after.txt', 'utf8')).resolves.toBe('moved');
      await expect(fileSystem.exists('before.txt')).resolves.toBe(false);
      await expectRejection(fileSystem.rename('never-existed.txt', 'wherever.txt'));
    } finally {
      fileSystem.dispose();
    }
  });

  it.runIf(runs(row, 'rename-directories'))('renames a directory with its contents', async () => {
    const fileSystem = await row.create();
    try {
      await fileSystem.mkdir('tree/nested', { recursive: true });
      await fileSystem.writeFile('tree/nested/leaf.txt', 'leaf');

      await fileSystem.rename('tree', 'moved');

      await expect(fileSystem.readFile('moved/nested/leaf.txt', 'utf8')).resolves.toBe('leaf');
      await expect(fileSystem.exists('tree')).resolves.toBe(false);
    } finally {
      fileSystem.dispose();
    }
  });

  it('reports exists false for a missing path and for one under a file parent', async () => {
    const fileSystem = await row.create();
    try {
      await fileSystem.writeFile('leaf.txt', 'leaf');

      await expect(fileSystem.exists('nowhere.txt')).resolves.toBe(false);
      await expect(fileSystem.exists('nowhere/deeper.txt')).resolves.toBe(false);
      await expect(fileSystem.exists('leaf.txt/child')).resolves.toBe(false);
      await expect(fileSystem.exists('leaf.txt')).resolves.toBe(true);
    } finally {
      fileSystem.dispose();
    }
  });

  it.runIf(runs(row, 'rmdir-guards-kind-and-emptiness'))(
    'refuses to rmdir a file, a non-empty directory, or a missing path',
    async () => {
      const fileSystem = await row.create();
      try {
        await fileSystem.mkdir('full/inner', { recursive: true });
        await fileSystem.writeFile('plain.txt', 'plain');

        await expectCode(fileSystem.rmdir('plain.txt'), 'ENOTDIR');
        await expectCode(fileSystem.rmdir('full'), 'ENOTEMPTY');
        await expectCode(fileSystem.rmdir('absent'), 'ENOENT');

        await expect(fileSystem.readFile('plain.txt', 'utf8')).resolves.toBe('plain');
        await expect(fileSystem.exists('full/inner')).resolves.toBe(true);

        await fileSystem.rmdir('full/inner');
        await fileSystem.rmdir('full');
        await expect(fileSystem.exists('full')).resolves.toBe(false);
      } finally {
        fileSystem.dispose();
      }
    },
  );

  /* The error *code* is not contractual here — Node reports EPERM, the
   * content-backed adapters EISDIR — only that the directory survives. */
  it.runIf(runs(row, 'unlink-rejects-directories'))('refuses to unlink a directory', async () => {
    const fileSystem = await row.create();
    try {
      await fileSystem.mkdir('keep', { recursive: true });

      await expectRejection(fileSystem.unlink('keep'));

      await expect(fileSystem.exists('keep')).resolves.toBe(true);
    } finally {
      fileSystem.dispose();
    }
  });

  it.runIf(runs(row, 'writeFile-creates-parents'))('creates missing parents when writing a nested file', async () => {
    const fileSystem = await row.create();
    try {
      await fileSystem.writeFile('implicit/parents/file.txt', 'data');

      await expect(fileSystem.readFile('implicit/parents/file.txt', 'utf8')).resolves.toBe('data');
      await expect(fileSystem.stat('implicit/parents')).resolves.toMatchObject({ type: 'dir' });
    } finally {
      fileSystem.dispose();
    }
  });

  it.runIf(runs(row, 'containment'))(
    'rejects above-root traversal on every operation before touching the backing store',
    async () => {
      const fileSystem = await row.create();
      const operations: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
        ['readFile', async () => fileSystem.readFile('../outside.txt')],
        ['writeFile', async () => fileSystem.writeFile('../outside.txt', 'no')],
        ['mkdir', async () => fileSystem.mkdir('../outside')],
        ['readdir', async () => fileSystem.readdir('../outside')],
        ['unlink', async () => fileSystem.unlink('../outside.txt')],
        ['stat', async () => fileSystem.stat('../outside.txt')],
        ['rmdir', async () => fileSystem.rmdir('../outside')],
        ['rename source', async () => fileSystem.rename('../outside.txt', 'safe.txt')],
        ['rename destination', async () => fileSystem.rename('safe.txt', '../outside.txt')],
        ['lstat', async () => fileSystem.lstat('../outside.txt')],
        ['exists', async () => fileSystem.exists('../outside.txt')],
      ];

      try {
        for (const [operation, invoke] of operations) {
          // oxlint-disable-next-line no-await-in-loop -- one sequential assertion per operation, by design
          await expect(invoke(), operation).rejects.toMatchObject({
            code: 'PATH_OUTSIDE_ROOT',
          });
        }
      } finally {
        fileSystem.dispose();
      }
    },
  );

  it('disposes idempotently', async () => {
    const fileSystem = await row.create();
    await fileSystem.writeFile('disposed.txt', 'x');

    expect(() => {
      fileSystem.dispose();
      fileSystem.dispose();
      fileSystem.dispose();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Watch section — runs for adapters exposing `watch`
// ---------------------------------------------------------------------------

describe.each(rows.filter((row) => runs(row, 'watch')))('$name adapter watch conformance', (row) => {
  const settle = async (): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, 250);
    });

  it('exposes watch', async () => {
    const fileSystem = await row.create();
    try {
      expect(typeof fileSystem.watch).toBe('function');
    } finally {
      fileSystem.dispose();
    }
  });

  /* Only `node` exposes `watch` today (every other row declares the `watch`
   * divergence and its reason), and delivery has to be provoked from outside
   * the adapter, so this body owns the host directory it watches. */
  it('delivers change and delete, honours excludes, and unsubscribes idempotently', async () => {
    expect(row.name).toBe('node');
    const directory = await makeTemporaryDirectory('conformance-watch-');
    const fileSystem = inlineBase(_fromNodeFsHandle(directory));
    const events: RuntimeWatchEvent[] = [];
    try {
      await fs.writeFile(path.join(directory, 'watched.txt'), 'one');
      await fs.mkdir(path.join(directory, '.tau', 'cache'), {
        recursive: true,
      });

      const unsubscribe = fileSystem.watch!(
        {
          paths: ['watched.txt', '.tau/cache/artifact.bin'],
          excludes: ['.tau/cache/**'],
        },
        (event) => events.push(event),
      );

      await fs.writeFile(path.join(directory, 'watched.txt'), 'two');
      await settle();
      expect(events.some((event) => event.type === 'change' && event.path === 'watched.txt')).toBe(true);

      events.length = 0;
      await fs.writeFile(path.join(directory, '.tau', 'cache', 'artifact.bin'), 'cached');
      await settle();
      expect(events).toEqual([]);

      await fs.rm(path.join(directory, 'watched.txt'));
      await settle();
      expect(events.some((event) => event.type === 'delete' && event.path === 'watched.txt')).toBe(true);

      expect(() => {
        unsubscribe();
        unsubscribe();
      }).not.toThrow();

      events.length = 0;
      await fs.writeFile(path.join(directory, 'watched.txt'), 'three');
      await settle();
      expect(events).toEqual([]);
    } finally {
      fileSystem.dispose();
    }
  }, 20_000);

  it('rejects a watch path that escapes the root', async () => {
    const fileSystem = await row.create();
    try {
      expect(() => fileSystem.watch!({ paths: ['../outside.txt'] }, () => undefined)).toThrow(
        expect.objectContaining({ code: 'PATH_OUTSIDE_ROOT' }),
      );
    } finally {
      fileSystem.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// Registration guard — the bidirectional set-membership shape of
// `types/runtime-protocol-schema-coverage.test.ts`
// ---------------------------------------------------------------------------

/**
 * Source of truth for "what adapters exist", enumerated at run time so a new
 * adapter cannot be added without a row here:
 *
 * 1. every `from-*-handle.ts` module under `src/transport/_internal/` — where
 *    every inline adapter factory is implemented; and
 * 2. every `from*` export of the public `@taucad/runtime/filesystem` barrel,
 *    plus `fromNodeFs` from its own `filesystem/node` subpath.
 */
const discoverAdapterFactories = (): string[] => {
  const internalDirectory = path.join(import.meta.dirname, '..', 'transport', '_internal');
  const handleModules = readdirSync(internalDirectory).filter(
    (entry) => /^from-.*-handle\.ts$/u.test(entry) && !entry.includes('.test.'),
  );
  const barrelFactories = Object.keys(filesystemBarrel).filter((name) => name.startsWith('from'));
  return [...new Set([...handleModules, ...barrelFactories, fromNodeFs.name])].sort();
};

describe('adapter conformance registration guard', () => {
  it('registers every discovered adapter factory in the conformance table', () => {
    const registered = new Set(rows.flatMap((row) => row.covers));

    for (const factory of discoverAdapterFactories()) {
      expect(registered.has(factory), `adapter factory '${factory}' has no conformance row`).toBe(true);
    }
  });

  it('registers no factory the source of truth does not know about', () => {
    const discovered = new Set(discoverAdapterFactories());

    for (const factory of rows.flatMap((row) => row.covers)) {
      expect(discovered.has(factory), `conformance row claims unknown factory '${factory}'`).toBe(true);
    }
  });

  it('finds the adapters this table was written against', () => {
    expect(discoverAdapterFactories()).toEqual([
      'from-fs-like-handle.ts',
      'from-memory-fs-handle.ts',
      'from-node-fs-handle.ts',
      'fromBrowserFs',
      'fromFileSystemBridge',
      'fromFsLike',
      'fromMemoryFs',
      'fromNodeFs',
    ]);
  });
});

describe('conformance divergence ledger', () => {
  it('gives every declared divergence a written reason', () => {
    for (const row of rows) {
      for (const [contract, reason] of Object.entries(row.diverges)) {
        expect(reason, `${row.name} / ${contract} has no reason`).toBeTypeOf('string');
        expect(reason.length, `${row.name} / ${contract} reason is too short to be one`).toBeGreaterThan(30);
      }
    }
  });

  it('keeps every runtime adapter inside its root', () => {
    for (const row of rows.filter((candidate) => candidate.covers.length > 0)) {
      expect(row.diverges.containment, `${row.name} must enforce containment`).toBeUndefined();
    }
  });
});
