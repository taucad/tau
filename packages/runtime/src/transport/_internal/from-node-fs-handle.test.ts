import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import parcelWatcher from '@parcel/watcher';
import * as fs from 'node:fs/promises';
import * as nodeFs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { _fromNodeFsHandle as fromNodeFS } from '#transport/_internal/from-node-fs-handle.js';
import type { RuntimeFileSystemBase, RuntimeWatchEvent } from '#types/runtime-kernel.types.js';
import type { WorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import type { InlineRuntimeFileSystemBase } from '#transport/_internal/runtime-filesystem-handle.js';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';

const { realpathMock } = vi.hoisted(() => ({ realpathMock: vi.fn<typeof fs.realpath>() }));
const { watchMock } = vi.hoisted(() => ({ watchMock: vi.fn<typeof nodeFs.watch>() }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  realpathMock.mockImplementation(actual.realpath);
  return {
    ...actual,
    default: { ...actual, realpath: realpathMock },
    realpath: realpathMock,
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>();
  watchMock.mockImplementation(actual.watch);
  return {
    ...actual,
    default: { ...actual, watch: watchMock },
    watch: watchMock,
  };
});

/**
 * `fromNodeFS()` returns a `RuntimeFileSystemHandle` discriminated handle; this
 * suite exercises the underlying `RuntimeFileSystemBase` directly via
 * `.fs`. Runtime API integration is covered elsewhere.
 */
function unwrap(basePath: string): InlineRuntimeFileSystemBase {
  const handle = fromNodeFS(basePath);
  if (handle.kind !== 'inline') {
    throw new Error('fromNodeFS must return the inline-kind handle.');
  }
  return handle.create();
}

describe('fromNodeFS', () => {
  const temporaryDirectory = path.join(os.tmpdir(), `kernels-node-fs-test-${Date.now()}`);

  afterAll(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('should read and write a file round-trip', async () => {
    await fs.mkdir(temporaryDirectory, { recursive: true });
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('roundtrip.txt', 'hello world');
    const content = await fileSystem.readFile('roundtrip.txt', 'utf8');
    expect(content).toBe('hello world');
  });

  it('should read file as utf8 string', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('utf8.txt', 'text content');
    const content = await fileSystem.readFile('utf8.txt', 'utf8');
    expect(content).toBe('text content');
  });

  it('should read file as Uint8Array', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('binary.txt', 'bytes');
    const content = await fileSystem.readFile('binary.txt');
    expect(content).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(content)).toBe('bytes');
  });

  it('should create directory with mkdir', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.mkdir('subdir', { recursive: true });
    const stat = await fileSystem.stat('subdir');
    expect(stat.type).toBe('dir');
  });

  it('should list directory entries with readdir', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    const entries = await fileSystem.readdir('');
    expect(entries).toContain('roundtrip.txt');
    expect(entries).toContain('subdir');
  });

  it('should return file stats with stat', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    const stat = await fileSystem.stat('roundtrip.txt');
    expect(stat.type).toBe('file');
    expect(stat.size).toBeGreaterThan(0);
    expect(stat.mtimeMs).toBeTypeOf('number');
  });

  it('should return file stats with lstat', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    const stat = await fileSystem.lstat('roundtrip.txt');
    expect(stat.type).toBe('file');
    expect(stat.size).toBeGreaterThan(0);
  });

  it('should rename a file', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('rename-src.txt', 'move me');
    await fileSystem.rename('rename-src.txt', 'rename-dst.txt');

    expect(await fileSystem.exists('rename-src.txt')).toBe(false);
    const content = await fileSystem.readFile('rename-dst.txt', 'utf8');
    expect(content).toBe('move me');
  });

  it('should delete a file with unlink', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('delete-me.txt', 'gone');
    await fileSystem.unlink('delete-me.txt');
    expect(await fileSystem.exists('delete-me.txt')).toBe(false);
  });

  it('should remove directory with rmdir', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.mkdir('rmdir-test');
    await fileSystem.rmdir('rmdir-test');
    expect(await fileSystem.exists('rmdir-test')).toBe(false);
  });

  it('should return true for existing file via exists', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('exists-test.txt', 'here');
    expect(await fileSystem.exists('exists-test.txt')).toBe(true);
  });

  it('should return false for nonexistent file via exists', async () => {
    const fileSystem = unwrap(temporaryDirectory);
    expect(await fileSystem.exists('not-here.txt')).toBe(false);
  });

  it('should resolve paths relative to basePath', async () => {
    await fs.mkdir(path.join(temporaryDirectory, 'nested'), { recursive: true });
    await fs.writeFile(path.join(temporaryDirectory, 'nested', 'deep.txt'), 'deep content');

    const fileSystem = unwrap(temporaryDirectory);
    const content = await fileSystem.readFile('nested/deep.txt', 'utf8');
    expect(content).toBe('deep content');
  });

  it('should map VFS-root-leading paths under basePath, not host filesystem root', async () => {
    await fs.writeFile(path.join(temporaryDirectory, 'vfs-root.txt'), 'vfs');
    const fileSystem = unwrap(temporaryDirectory);
    expect(await fileSystem.readFile('vfs-root.txt', 'utf8')).toBe('vfs');
  });

  /* The above-root traversal table moved to the shared adapter conformance
   * suite (`filesystem/adapter-conformance.test.ts`), which runs the same
   * eleven operations against every adapter instead of this one. */

  it('should hide a symlink whose real target is outside the base directory', async () => {
    const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'kernels-node-fs-outside-'));
    await fs.writeFile(path.join(outsideDirectory, 'secret.txt'), 'secret');
    await fs.symlink(outsideDirectory, path.join(temporaryDirectory, 'outside-link'), 'dir');
    const fileSystem = unwrap(temporaryDirectory);

    await expect(fileSystem.readFile('outside-link/secret.txt', 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(fileSystem.exists('outside-link/secret.txt')).resolves.toBe(false);
    await fs.rm(outsideDirectory, { recursive: true, force: true });
  });

  it('should allow a symlink whose real target remains inside the base directory', async () => {
    await fs.mkdir(path.join(temporaryDirectory, 'inside-target'), { recursive: true });
    await fs.writeFile(path.join(temporaryDirectory, 'inside-target', 'safe.txt'), 'safe');
    await fs.symlink(
      path.join(temporaryDirectory, 'inside-target'),
      path.join(temporaryDirectory, 'inside-link'),
      'dir',
    );
    const fileSystem = unwrap(temporaryDirectory);

    await expect(fileSystem.readFile('inside-link/safe.txt', 'utf8')).resolves.toBe('safe');
  });

  it('should refuse to replace a file symlink even when its target remains inside the base directory', async () => {
    const targetPath = path.join(temporaryDirectory, 'symlink-write-target.txt');
    await fs.writeFile(targetPath, 'unchanged');
    await fs.symlink(targetPath, path.join(temporaryDirectory, 'symlink-write.txt'));
    const fileSystem = unwrap(temporaryDirectory);

    await expect(fileSystem.writeFile('symlink-write.txt', 'replacement')).rejects.toMatchObject({
      code: 'ELOOP',
    });
    await expect(fs.readFile(targetPath, 'utf8')).resolves.toBe('unchanged');
  });

  it('should refuse a parent changed to a symlink between admission and replacement', async () => {
    const parentPath = path.join(temporaryDirectory, 'write-parent');
    const swappedParentPath = path.join(temporaryDirectory, 'write-parent-swapped');
    const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'kernels-node-fs-parent-swap-'));
    await fs.mkdir(parentPath, { recursive: true });
    await fs.writeFile(path.join(parentPath, 'main.txt'), 'inside');
    await fs.writeFile(path.join(outsideDirectory, 'main.txt'), 'outside');
    await fs.symlink(outsideDirectory, swappedParentPath, 'dir');
    const fileSystem = unwrap(temporaryDirectory);
    const originalRealpath = realpathMock.getMockImplementation();
    if (!originalRealpath) {
      throw new Error('Expected the node:fs/promises realpath mock to delegate to the native implementation.');
    }
    let parentRealpathCalls = 0;
    realpathMock.mockImplementation(async (candidate) => {
      const result = await originalRealpath(candidate);
      if (path.resolve(candidate.toString()) !== parentPath) {
        return result;
      }
      parentRealpathCalls += 1;
      if (parentRealpathCalls === 2) {
        return originalRealpath(swappedParentPath);
      }
      return result;
    });

    try {
      await expect(fileSystem.writeFile('write-parent/main.txt', 'replacement')).rejects.toMatchObject({
        code: 'ELOOP',
      });
      expect(await fs.readFile(path.join(parentPath, 'main.txt'), 'utf8')).toBe('inside');
      expect(await fs.readFile(path.join(outsideDirectory, 'main.txt'), 'utf8')).toBe('outside');
      const parentEntries = await fs.readdir(parentPath);
      expect(parentEntries.some((name) => name.endsWith('.tmp'))).toBe(false);
    } finally {
      realpathMock.mockImplementation(originalRealpath);
      await fs.unlink(swappedParentPath).catch(() => undefined);
      await fs.rm(outsideDirectory, { recursive: true, force: true });
    }
  });

  it('should validate both rename paths before changing the source', async () => {
    const fileSystem = unwrap(temporaryDirectory);
    await fileSystem.writeFile('rename-guard.txt', 'keep');

    await expect(fileSystem.rename('rename-guard.txt', '../outside.txt')).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_ROOT',
    });
    await expect(fileSystem.readFile('rename-guard.txt', 'utf8')).resolves.toBe('keep');
  });
});

/* FSEvents/inotify deliver asynchronously and, under machine load, well past
 * vi.waitFor's 1 s default; the budget is generous because these tests assert
 * delivery, never latency. A test waits for at most two deliveries, so its own
 * timeout has to cover both budgets, or the 5 s default cuts them short. */
const watchDeliveryBudget = { timeout: 10_000 } as const;

describe('fromNodeFS watch', { timeout: 3 * watchDeliveryBudget.timeout }, () => {
  const roots: string[] = [];

  const createRoot = async (): Promise<string> => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kernels-node-fs-watch-'));
    roots.push(root);
    return root;
  };

  /** Await the adapter's private native admission before the one external mutation. */
  const subscribe = async (
    fileSystem: RuntimeFileSystemBase,
    request: Parameters<NonNullable<RuntimeFileSystemBase['watch']>>[0],
  ): Promise<{ readonly events: RuntimeWatchEvent[]; readonly unsubscribe: () => void }> => {
    const events: RuntimeWatchEvent[] = [];
    const { watchReady } = fileSystem as RuntimeFileSystemBase & WorkerFileSystemProxy;
    if (!watchReady) {
      throw new Error('The Node filesystem adapter must expose watchReady().');
    }
    const registration = watchReady(request, (event) => events.push(event));
    await registration.ready;
    return { events, unsubscribe: registration.unsubscribe };
  };

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('should deliver a change for an externally written path and nothing for its peers', async () => {
    const root = await createRoot();
    const fileSystem = unwrap(root);
    const { events, unsubscribe } = await subscribe(fileSystem, { paths: ['main.ts', 'peer.ts'], recursive: false });

    try {
      await fs.writeFile(path.join(root, 'main.ts'), 'first');
      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'change', path: 'main.ts' });
      }, watchDeliveryBudget);
      // The OS may repeat an event for the written path; no peer path may ever appear.
      expect(events.filter((event) => event.type !== 'change' || event.path !== 'main.ts')).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  it('should report an atomic save as a change and an unlink as a delete', async () => {
    const root = await createRoot();
    await fs.writeFile(path.join(root, 'main.ts'), 'first');
    const fileSystem = unwrap(root);
    const { events, unsubscribe } = await subscribe(fileSystem, { paths: ['main.ts'], recursive: false });

    try {
      const temporaryPath = path.join(root, '.main.ts.editor.tmp');
      await fs.writeFile(temporaryPath, 'saved');
      await fs.rename(temporaryPath, path.join(root, 'main.ts'));
      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'change', path: 'main.ts' });
      }, watchDeliveryBudget);
      // The editor's temporary sibling is not a requested path and must stay invisible.
      expect(events.some((event) => 'path' in event && event.path.includes('tmp'))).toBe(false);

      events.length = 0;
      await fs.unlink(path.join(root, 'main.ts'));
      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'delete', path: 'main.ts' });
      }, watchDeliveryBudget);
    } finally {
      unsubscribe();
    }
  });

  it('should accept paths that do not exist and report their later creation', async () => {
    const root = await createRoot();
    const fileSystem = unwrap(root);
    const { events, unsubscribe } = await subscribe(fileSystem, {
      paths: ['missing.ts', 'absent-dir/nested/deep.ts'],
      recursive: false,
    });

    try {
      await fs.writeFile(path.join(root, 'missing.ts'), 'created');
      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'change', path: 'missing.ts' });
      }, watchDeliveryBudget);

      // The nearest existing ancestor of `/absent-dir/nested/deep.ts` is the root, so the
      // adapter has to re-arm onto each directory as it appears before the leaf is visible.
      events.length = 0;
      await fs.mkdir(path.join(root, 'absent-dir', 'nested'), { recursive: true });
      await fs.writeFile(path.join(root, 'absent-dir', 'nested', 'deep.ts'), 'deep');
      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'change', path: 'absent-dir/nested/deep.ts' });
      }, watchDeliveryBudget);
    } finally {
      unsubscribe();
    }
  });

  it('should deliver no events for excluded cache paths under a write burst', async () => {
    const root = await createRoot();
    await fs.mkdir(path.join(root, '.tau', 'cache', 'geometry'), { recursive: true });
    await fs.writeFile(path.join(root, 'main.ts'), 'first');
    const fileSystem = unwrap(root);
    const { events, unsubscribe } = await subscribe(fileSystem, {
      paths: ['.tau/cache/geometry/warm.bin', 'main.ts'],
      recursive: false,
      excludes: ['.tau/cache/**'],
    });

    try {
      for (let index = 0; index < 20; index++) {
        // oxlint-disable-next-line no-await-in-loop -- sequential burst mirrors the cache writer's own ordering
        await fs.writeFile(path.join(root, '.tau', 'cache', 'geometry', 'warm.bin'), `burst-${index}`);
      }
      await fs.writeFile(path.join(root, 'main.ts'), 'second');
      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'change', path: 'main.ts' });
      }, watchDeliveryBudget);
      expect(events.filter((event) => 'path' in event && event.path.startsWith('.tau/'))).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  it('should reject a watch path that escapes the base directory', async () => {
    const root = await createRoot();
    const fileSystem = unwrap(root);

    await expect(subscribe(fileSystem, { paths: ['../outside.txt'], recursive: false })).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_ROOT',
    });
  });

  it('should deliver the immediate write after native admission', async () => {
    const root = await createRoot();
    await fs.writeFile(path.join(root, 'main.ts'), 'first');
    const fileSystem = unwrap(root);
    const { events, unsubscribe } = await subscribe(fileSystem, { paths: ['main.ts'], recursive: false });

    try {
      // No delay between the actual native-ready handoff and this external write.
      nodeFs.writeFileSync(path.join(root, 'main.ts'), 'second');
      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'change', path: 'main.ts' });
      }, watchDeliveryBudget);
    } finally {
      unsubscribe();
    }
  });

  it('should logically detach on unsubscribe and on dispose', async () => {
    const root = await createRoot();
    const nativeStop = vi.fn();
    const watch = vi.spyOn(NodeFsProvider.prototype, 'watch').mockResolvedValue(nativeStop);
    try {
      const fileSystem = unwrap(root);
      const first = await subscribe(fileSystem, { paths: ['main.ts'], recursive: false });
      first.unsubscribe();
      first.unsubscribe();
      expect(nativeStop).toHaveBeenCalledTimes(1);
      const second = await subscribe(fileSystem, { paths: ['main.ts'], recursive: false });
      fileSystem.dispose();
      expect(nativeStop).toHaveBeenCalledTimes(2);
      second.unsubscribe();
      expect(nativeStop).toHaveBeenCalledTimes(2);
      expect(watch).toHaveBeenCalledTimes(2);
    } finally {
      watch.mockRestore();
    }
  });

  it('should forward a native loss reset but stay quiet after unsubscribe', async () => {
    const root = await createRoot();
    let nativeHandler: Parameters<NodeFsProvider['watch']>[1] | undefined;
    const watch = vi.spyOn(NodeFsProvider.prototype, 'watch').mockImplementation(async (_request, handler) => {
      nativeHandler = handler;
      return () => undefined;
    });
    try {
      const fileSystem = unwrap(root);
      const live = await subscribe(fileSystem, { paths: ['main.ts'], recursive: false });
      nativeHandler?.({ type: 'reset' });
      expect(live.events).toEqual([{ type: 'reset' }]);
      live.unsubscribe();
      nativeHandler?.({ type: 'reset' });
      expect(live.events).toEqual([{ type: 'reset' }]);
    } finally {
      watch.mockRestore();
    }
  });

  it('should settle disposeAsync only after an in-flight native admission is stopped', async () => {
    const root = await createRoot();
    const admission = Promise.withResolvers<Awaited<ReturnType<typeof parcelWatcher.subscribe>>>();
    const stopped = Promise.withResolvers<void>();
    const nativeStop = vi.fn(async () => stopped.promise);
    const nativeSubscribe = vi.spyOn(parcelWatcher, 'subscribe').mockReturnValue(admission.promise);
    /** Whether `promise` settles before the event loop turns; its rejection propagates. */
    const settled = async (promise: Promise<void>): Promise<boolean> => {
      const settles = async (): Promise<boolean> => {
        await promise;
        return true;
      };
      const turns = new Promise<boolean>((resolve) => {
        setImmediate(() => {
          resolve(false);
        });
      });
      return Promise.race([settles(), turns]);
    };
    const fileSystem = unwrap(root) as InlineRuntimeFileSystemBase & WorkerFileSystemProxy;
    if (!fileSystem.disposeAsync || !fileSystem.watchReady) {
      throw new Error('The Node filesystem adapter must expose disposeAsync() and watchReady().');
    }
    try {
      const events: RuntimeWatchEvent[] = [];
      const registration = fileSystem.watchReady({ paths: ['main.ts'], recursive: false }, (event) =>
        events.push(event),
      );
      await vi.waitFor(() => {
        expect(nativeSubscribe).toHaveBeenCalledOnce();
      });

      // The worker that owns this adapter may exit as soon as disposal settles, so
      // disposal must outlast the native subscribe that is still in flight...
      const disposal = fileSystem.disposeAsync();
      await expect(settled(disposal)).resolves.toBe(false);
      expect(nativeStop).not.toHaveBeenCalled();

      // ...and the native stop that the late admission triggers before it is refused.
      admission.resolve({ unsubscribe: nativeStop });
      await expect(registration.ready).rejects.toThrow('cancelled during admission');
      expect(nativeStop).toHaveBeenCalledOnce();
      await expect(settled(disposal)).resolves.toBe(false);

      stopped.resolve();
      await expect(disposal).resolves.toBeUndefined();
      expect(events).toEqual([]);
    } finally {
      admission.resolve({ unsubscribe: nativeStop });
      stopped.resolve();
      await fileSystem.disposeAsync();
      nativeSubscribe.mockRestore();
    }
  });
});
