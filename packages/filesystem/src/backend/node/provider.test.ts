import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import type * as NodeFs from 'node:fs';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsProvider, drainNodeFsProviderWatchClosures } from '#backend/node/provider.js';
import { tauPathPolicy } from '#path-registry.js';
import parcelWatcher from '@parcel/watcher';
import type { Event as ParcelEvent } from '@parcel/watcher';

/* Every `statSync` the provider makes, so a case can show which events it never measured. */
const statted = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return {
    ...actual,
    statSync: ((...arguments_: Parameters<typeof actual.statSync>) => {
      statted.paths.push(String(arguments_[0]));
      return actual.statSync(...arguments_);
    }) as typeof actual.statSync,
  };
});

const roots: string[] = [];

const createRoot = (): string => {
  // The provider watches `realpathSync(base)`, because a real native watcher reports resolved
  // paths. On macOS `tmpdir()` is `/var/folders/...`, a symlink, so a synthetic event built from an
  // unresolved root reads as outside the watch and costs a whole-subscription reset.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-node-atomic-')));
  roots.push(root);
  writeFileSync(join(root, 'target.txt'), 'old');
  return root;
};

const temporaryFiles = (root: string): string[] => readdirSync(root).filter((name) => name.endsWith('.tmp'));

type FailureStage = 'temp-write' | 'file-fsync' | 'rename' | 'post-rename-fsync' | 'read-back';

const injectFailureAfter = (stage: FailureStage): void => {
  const failure = new Error(`injected ${stage} failure`);
  if (stage === 'rename') {
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to);
      throw failure;
    });
    return;
  }

  const open = fs.open.bind(fs);
  vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
    const handle = await open(path, flags, mode);
    if (stage === 'read-back' && typeof flags === 'number') {
      vi.spyOn(handle, 'read').mockRejectedValue(failure);
    } else if (flags === 'wx' && stage === 'temp-write') {
      const writeFile = handle.writeFile.bind(handle);
      vi.spyOn(handle, 'writeFile').mockImplementation(async (...args) => {
        await writeFile(...args);
        throw failure;
      });
    } else if (flags === 'wx' && stage === 'file-fsync') {
      const sync = handle.sync.bind(handle);
      vi.spyOn(handle, 'sync').mockImplementation(async () => {
        await sync();
        throw failure;
      });
    } else if (stage === 'post-rename-fsync' && flags === (process.platform === 'win32' ? 'wx' : 'r')) {
      const sync = handle.sync.bind(handle);
      let calls = 0;
      vi.spyOn(handle, 'sync').mockImplementation(async () => {
        await sync();
        calls += 1;
        if (calls === (process.platform === 'win32' ? 2 : 1)) {
          throw failure;
        }
      });
    }
    return handle;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('NodeFsProvider entry kinds', () => {
  it('should classify ordinary files and directories without filesystem stats', async () => {
    const root = createRoot();
    mkdirSync(join(root, 'project'));
    const provider = new NodeFsProvider(root);
    const stat = vi.spyOn(fs, 'stat');
    try {
      const entries = await provider.readdirEntries('');
      expect(entries.sort((left, right) => left.name.localeCompare(right.name))).toEqual([
        { name: 'project', kind: 'dir' },
        { name: 'target.txt', kind: 'file' },
      ]);
      expect(stat).not.toHaveBeenCalled();
    } finally {
      provider.dispose();
    }
  });

  it('should classify admitted links while omitting broken, escaping and hidden-target links', async () => {
    const root = createRoot();
    const outside = createRoot();
    mkdirSync(join(root, 'project'));
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'config'), 'private');
    symlinkSync(join(root, 'project'), join(root, 'project-alias'));
    symlinkSync(join(root, 'target.txt'), join(root, 'target-alias'));
    symlinkSync(join(root, 'missing'), join(root, 'broken'));
    symlinkSync(outside, join(root, 'escape'));
    symlinkSync(join(root, '.git'), join(root, 'hidden-alias'));
    const provider = new NodeFsProvider(root, { policy: tauPathPolicy });
    try {
      const entries = await provider.readdirEntries('');
      expect(entries.sort((left, right) => left.name.localeCompare(right.name))).toEqual([
        { name: '.git', kind: 'dir' },
        { name: 'project', kind: 'dir' },
        { name: 'project-alias', kind: 'dir' },
        { name: 'target-alias', kind: 'file' },
        { name: 'target.txt', kind: 'file' },
      ]);
      const names = await provider.readdir('');
      expect(names.sort()).toEqual(entries.map(({ name }) => name).sort());
      await expect(provider.readdirEntries('escape')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      provider.dispose();
    }
  });
});

describe('NodeFsProvider atomic writes', () => {
  it('cancels observation before the optional backend import finishes', async () => {
    const provider = new NodeFsProvider(createRoot());
    const subscribe = vi.spyOn(parcelWatcher, 'subscribe');
    const opening = provider.watch({ paths: [''], recursive: true }, () => undefined);
    provider.dispose();
    await expect(opening).rejects.toThrow('cancelled during admission');
    await drainNodeFsProviderWatchClosures(provider);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('closes a native subscription admitted after provider disposal', async () => {
    const root = createRoot();
    const admission = Promise.withResolvers<{ unsubscribe(): Promise<void> }>();
    const close = vi.fn(async () => undefined);
    const subscribe = vi.spyOn(parcelWatcher, 'subscribe').mockReturnValue(admission.promise);
    const provider = new NodeFsProvider(root);
    const events: unknown[] = [];
    try {
      const opening = provider.watch({ paths: [''], recursive: true }, (event) => events.push(event));
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledOnce();
      });
      provider.dispose();
      admission.resolve({ unsubscribe: close });
      await expect(opening).rejects.toThrow('cancelled during admission');
      await drainNodeFsProviderWatchClosures(provider);
      expect(close).toHaveBeenCalledOnce();
      expect(events).toEqual([]);
    } finally {
      admission.resolve({ unsubscribe: close });
      subscribe.mockRestore();
    }
  });

  it('reports native stream loss as a whole-subscription reset', async () => {
    const provider = new NodeFsProvider(createRoot());
    const close = vi.fn(async () => undefined);
    let onEvents: Parameters<typeof parcelWatcher.subscribe>[1] | undefined;
    vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (_directory, callback) => {
      onEvents = callback;
      return { unsubscribe: close };
    });
    const events: unknown[] = [];
    const stop = await provider.watch({ paths: [''], recursive: true }, (event) => events.push(event));
    onEvents?.(new Error('native stream lost'), []);
    expect(events).toEqual([{ type: 'reset' }]);
    stop();
    await drainNodeFsProviderWatchClosures(provider);
    expect(close).toHaveBeenCalledOnce();
  });

  it('should keep excluded subtrees out of the native watch and never stat their events', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const close = vi.fn(async () => undefined);
    let onEvents: Parameters<typeof parcelWatcher.subscribe>[1] | undefined;
    const subscribe = vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (_directory, callback) => {
      onEvents = callback;
      return { unsubscribe: close };
    });
    const events: unknown[] = [];
    const stop = await provider.watch(
      { paths: [''], recursive: true, excludes: ['.tau/cache/**', 'exact.txt'] },
      (event) => events.push(event),
    );
    try {
      const [[directory, , options]] = subscribe.mock.calls as unknown as [[string, unknown, { ignore?: string[] }]];
      /* The OS never reports a subtree that would only be filtered out afterwards. */
      expect(options.ignore).toEqual([join(directory, '.tau', 'cache')]);

      const created = (index: number): ParcelEvent => ({
        path: join(directory, '.tau', 'cache', `entry-${String(index)}`),
        type: 'create',
      });
      const updated: ParcelEvent = { path: join(directory, 'target.txt'), type: 'update' };
      const burst = [...Array.from({ length: 50 }, (_, index) => created(index)), updated];
      statted.paths.length = 0;
      onEvents?.(null, burst);
      expect(events).toEqual([{ type: 'change', path: 'target.txt', kind: 'file' }]);
      /* A bulk change under an excluded tree costs no syscall on the services utility's event loop. */
      expect(statted.paths.filter((statPath) => statPath.includes(join('.tau', 'cache')))).toEqual([]);
    } finally {
      stop();
      await drainNodeFsProviderWatchClosures(provider);
    }
  });

  it('rejects admission when the native stream fails before readiness', async () => {
    const provider = new NodeFsProvider(createRoot());
    const close = vi.fn(async () => undefined);
    const lost = new Error('native stream lost during admission');
    vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (_directory, callback) => {
      callback(lost, []);
      return { unsubscribe: close };
    });
    const events: unknown[] = [];
    await expect(provider.watch({ paths: [''], recursive: true }, (event) => events.push(event))).rejects.toBe(lost);
    await drainNodeFsProviderWatchClosures(provider);
    expect(close).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
  });

  it.each(['created', 'removed', 'never present', 'unsubscribed'] as const)(
    'should reconcile a requested leaf after ancestor rearm when it is %s',
    async (outcome) => {
      const root = createRoot();
      const replacement = Promise.withResolvers<{ unsubscribe(): Promise<void> }>();
      const firstClose = vi.fn(async () => undefined);
      const replacementClose = vi.fn(async () => undefined);
      let onAncestorEvents: Parameters<typeof parcelWatcher.subscribe>[1] | undefined;
      const subscribe = vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (_directory, callback) => {
        if (!onAncestorEvents) {
          onAncestorEvents = callback;
          return { unsubscribe: firstClose };
        }
        return replacement.promise;
      });
      const provider = new NodeFsProvider(root);
      const events: unknown[] = [];
      const requestedPath = 'absent/nested/deep.ts';
      const excludedPath = 'absent/nested/ignored.ts';
      const stop = await provider.watch(
        { paths: [requestedPath, excludedPath], recursive: false, excludes: [excludedPath] },
        (event) => events.push(event),
      );
      try {
        mkdirSync(join(root, 'absent', 'nested'), { recursive: true });
        writeFileSync(join(root, excludedPath), 'excluded sibling');
        // Native enumeration may absorb the leaf into its initial snapshot, delivering only the ancestor.
        onAncestorEvents?.(null, [{ type: 'create', path: join(root, 'absent') }]);
        await vi.waitFor(() => {
          expect(subscribe).toHaveBeenCalledTimes(2);
        });
        if (outcome !== 'never present') {
          writeFileSync(join(root, requestedPath), 'created during replacement admission');
        }
        if (outcome === 'removed') {
          rmSync(join(root, requestedPath));
        } else if (outcome === 'unsubscribed') {
          stop();
        }
        replacement.resolve({ unsubscribe: replacementClose });
        await drainNodeFsProviderWatchClosures(provider);
        if (outcome === 'created') {
          expect(events).toEqual([{ type: 'change', path: requestedPath, kind: 'file' }, { type: 'reset' }]);
        } else if (outcome === 'removed' || outcome === 'never present') {
          expect(events).toEqual([{ type: 'delete', path: requestedPath }, { type: 'reset' }]);
        } else {
          expect(events).toEqual([]);
        }
      } finally {
        replacement.resolve({ unsubscribe: replacementClose });
        stop();
        await drainNodeFsProviderWatchClosures(provider);
      }
      expect(firstClose).toHaveBeenCalledOnce();
      expect(replacementClose).toHaveBeenCalledOnce();
    },
  );

  it('revalidates a missing parent created during native admission before acknowledging', async () => {
    const root = createRoot();
    const first = Promise.withResolvers<{ unsubscribe(): Promise<void> }>();
    const replacement = Promise.withResolvers<{ unsubscribe(): Promise<void> }>();
    const firstClose = vi.fn(async () => undefined);
    const replacementClose = vi.fn(async () => undefined);
    const subscribe = vi
      .spyOn(parcelWatcher, 'subscribe')
      .mockImplementation(async () => (subscribe.mock.calls.length === 1 ? first.promise : replacement.promise));
    const provider = new NodeFsProvider(root);
    const events: unknown[] = [];
    const opening = provider.watch({ paths: ['absent/deep.txt'], recursive: false }, (event) => events.push(event));
    try {
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledTimes(1);
      });
      mkdirSync(join(root, 'absent'));
      first.resolve({ unsubscribe: firstClose });
      await vi.waitFor(() => {
        expect(subscribe).toHaveBeenCalledTimes(2);
      });
      replacement.resolve({ unsubscribe: replacementClose });
      const stop = await opening;
      expect(events).toContainEqual({ type: 'reset' });
      stop();
      await drainNodeFsProviderWatchClosures(provider);
      expect(firstClose).toHaveBeenCalledOnce();
      expect(replacementClose).toHaveBeenCalledOnce();
    } finally {
      first.resolve({ unsubscribe: firstClose });
      replacement.resolve({ unsubscribe: replacementClose });
      provider.dispose();
      await opening.catch(() => undefined);
      await drainNodeFsProviderWatchClosures(provider);
    }
  });

  it.each(['before rearm', 'during rearm', 'deleted during rearm'] as const)(
    'should reconcile the watched file when it is %s without a native leaf event',
    async (timing) => {
      const root = createRoot();
      const target = join(root, 'absent', 'nested', 'deep.txt');
      const replacement = Promise.withResolvers<Awaited<ReturnType<typeof parcelWatcher.subscribe>>>();
      const replacementStarted = Promise.withResolvers<void>();
      const callbacks: Array<Parameters<typeof parcelWatcher.subscribe>[1]> = [];
      const firstClose = vi.fn(async () => undefined);
      const replacementClose = vi.fn(async () => undefined);
      vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (_directory, callback) => {
        callbacks.push(callback);
        if (callbacks.length === 1) {
          return { unsubscribe: firstClose };
        }
        replacementStarted.resolve();
        return replacement.promise;
      });
      const provider = new NodeFsProvider(root);
      const events: unknown[] = [];
      try {
        const stop = await provider.watch({ paths: ['absent/nested/deep.txt'] }, (event) => events.push(event));
        mkdirSync(join(root, 'absent', 'nested'), { recursive: true });
        if (timing !== 'during rearm') {
          writeFileSync(target, 'created');
        }
        // Native observation can report only the new ancestor before its subtree is observed.
        callbacks[0]?.(null, [{ type: 'create', path: join(root, 'absent') }]);
        await replacementStarted.promise;
        if (timing === 'during rearm') {
          writeFileSync(target, 'created');
        } else if (timing === 'deleted during rearm') {
          rmSync(target);
        }
        replacement.resolve({ unsubscribe: replacementClose });
        await drainNodeFsProviderWatchClosures(provider);
        expect(events).toContainEqual(
          timing === 'deleted during rearm'
            ? { type: 'delete', path: 'absent/nested/deep.txt' }
            : { type: 'change', path: 'absent/nested/deep.txt', kind: 'file' },
        );
        expect(firstClose).toHaveBeenCalledOnce();
        stop();
        await drainNodeFsProviderWatchClosures(provider);
        expect(replacementClose).toHaveBeenCalledOnce();
      } finally {
        replacement.resolve({ unsubscribe: replacementClose });
        provider.dispose();
        await drainNodeFsProviderWatchClosures(provider);
      }
    },
  );

  it.each(['temp-write', 'file-fsync', 'rename', 'post-rename-fsync', 'read-back'] as const)(
    'should leave old or new bytes and no temporary file after a %s failure',
    async (stage) => {
      const root = createRoot();
      const provider = new NodeFsProvider(root);
      injectFailureAfter(stage);

      await expect(provider.writeFile('target.txt', 'new')).rejects.toBeInstanceOf(Error);

      expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe(
        stage === 'temp-write' || stage === 'file-fsync' ? 'old' : 'new',
      );
      expect(temporaryFiles(root)).toEqual([]);
    },
  );

  it('should refuse to replace a symbolic link without changing its target', async () => {
    const root = createRoot();
    writeFileSync(join(root, 'linked.txt'), 'linked');
    symlinkSync('linked.txt', join(root, 'alias.txt'));
    const provider = new NodeFsProvider(root);

    await expect(provider.writeFile('alias.txt', 'new')).rejects.toMatchObject({ code: 'ELOOP' });

    expect(readFileSync(join(root, 'linked.txt'), 'utf8')).toBe('linked');
    expect(lstatSync(join(root, 'alias.txt')).isSymbolicLink()).toBe(true);
    expect(temporaryFiles(root)).toEqual([]);
  });

  /*
   * Q11/3h O4, the projection's last open activation gate. `docs/chats` classifies read-write, so every layer above
   * admits a write to it; once an external, non-Tau writer re-points the backing `docs` at `.tau`, the bytes land in
   * the read-only records row `.tau/chats`. Only this method can see both spellings. A read stays admitted: the
   * asymmetry that keeps the revisions engine working over its own name is unchanged.
   */
  it('should refuse a mutation whose real row grants less than its spelling, and still serve the read (O4)', async () => {
    const root = createRoot();
    mkdirSync(join(root, '.tau', 'chats'), { recursive: true });
    writeFileSync(join(root, '.tau', 'chats', 'record.json'), 'RECORD');
    symlinkSync(join(root, '.tau'), join(root, 'docs'));
    const provider = new NodeFsProvider(root, { policy: tauPathPolicy });
    try {
      // The spelled row is read-write and the real row is read-only: the laundered write is the whole finding.
      expect(tauPathPolicy.classify('docs/chats').agentAccess).toBe('read-write');
      expect(tauPathPolicy.classify('.tau/chats').agentAccess).toBe('read-only');

      await expect(provider.readFile('docs/chats/record.json', 'utf8')).resolves.toBe('RECORD');

      for (const mutation of [
        async () => provider.writeFile('docs/chats/record.json', 'LAUNDERED'),
        async () => provider.unlink('docs/chats/record.json'),
        async () => provider.mkdir('docs/chats/planted'),
        async () => provider.rmdir('docs/chats'),
        async () => provider.rename('docs/chats/record.json', 'docs/chats/moved.json'),
        async () => provider.setFileMode('docs/chats/record.json', '100755'),
      ]) {
        // oxlint-disable-next-line no-await-in-loop -- one laundered mutation at a time, each judged on disk after.
        await expect(mutation()).rejects.toMatchObject({ code: 'ELOOP' });
      }

      expect(readFileSync(join(root, '.tau', 'chats', 'record.json'), 'utf8')).toBe('RECORD');
      expect(readdirSync(join(root, '.tau', 'chats')).sort()).toEqual(['record.json']);
      expect(temporaryFiles(root)).toEqual([]);
    } finally {
      provider.dispose();
    }
  });

  it('should refuse a changed parent and remove the temporary file', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const realpath = fs.realpath.bind(fs);
    let rootResolutions = 0;
    vi.spyOn(fs, 'realpath').mockImplementation(async (candidate, options) => {
      const resolved = await realpath(candidate, options);
      if (String(candidate) === root && ++rootResolutions === 3) {
        return join(String(resolved), 'replacement-parent');
      }
      return resolved;
    });

    await expect(provider.writeFile('target.txt', 'new')).rejects.toMatchObject({ code: 'ELOOP' });

    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('old');
    expect(temporaryFiles(root)).toEqual([]);
  });

  it('should settle concurrent writes of one path without reporting a superseded write as unapplied', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);

    /*
     * Two writers of the same path, interleaved so that each publishes its entry
     * while the other is still verifying the one it published. Whatever the
     * platform does with the second rename, no writer may be told its own write
     * might not have applied when it was merely superseded.
     */
    const results = await Promise.allSettled([
      provider.writeFile('target.txt', 'first'),
      provider.writeFile('target.txt', 'second'),
    ]);

    if (process.platform === 'win32') {
      /*
       * Windows has no last-writer-wins for this path. `_atomicWrite` keeps the
       * published file's writable handle open past the rename, because only that
       * handle's flush commits the entry's metadata there (#1109), and Windows
       * refuses a rename that would replace a name whose entry a writer still
       * holds. So the later writer is refused before it publishes anything. The
       * refusal is the platform's, reported as itself: a write that did land is
       * never relabelled as one that might not have.
       */
      expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
      for (const result of results) {
        if (result.status === 'rejected') {
          expect(result.reason).not.toMatchObject({ code: 'CHECKED_WRITE_POTENTIALLY_APPLIED' });
          expect(result.reason).not.toMatchObject({ code: 'WRITE_VERIFICATION_FAILED' });
        }
      }
    } else {
      // Both renames land, and the path keeps the bytes of whichever landed last.
      expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    }
    expect(['first', 'second']).toContain(readFileSync(join(root, 'target.txt'), 'utf8'));
    expect(temporaryFiles(root)).toEqual([]);
  });

  it('should report WRITE_VERIFICATION_FAILED when committed bytes do not verify', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const open = fs.open.bind(fs);
    vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      if (typeof flags === 'number') {
        const read = handle.read.bind(handle);
        vi.spyOn(handle, 'read').mockImplementation(async (...arguments_: Parameters<typeof handle.read>) => {
          const result = await read(...arguments_);
          if (result.bytesRead > 0 && result.buffer instanceof Uint8Array) {
            result.buffer[0] = 0;
          }
          return result;
        });
      }
      return handle;
    });

    await expect(provider.writeFile('target.txt', 'new')).rejects.toMatchObject({ code: 'WRITE_VERIFICATION_FAILED' });

    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('new');
    expect(temporaryFiles(root)).toEqual([]);
  });

  // Windows keeps the writer's handle open through verification, so a later writer cannot
  // replace the path mid-read there: its rename fails EPERM instead.
  it.skipIf(process.platform === 'win32')(
    'should settle a write that a later writer replaced during its verification read',
    async () => {
      const root = createRoot();
      const provider = new NodeFsProvider(root);
      const open = fs.open.bind(fs);
      let replaced = false;
      vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
        const handle = await open(path, flags, mode);
        // The provider opens the admitted real path, which differs from `root` on macOS and Windows temp dirs.
        if (typeof flags === 'number' && String(path).endsWith('target.txt')) {
          const read = handle.read.bind(handle);
          vi.spyOn(handle, 'read').mockImplementation(async (...arguments_: Parameters<typeof handle.read>) => {
            if (!replaced) {
              // A second writer of the same bytes publishes over the path, unlinking the inode this read holds.
              replaced = true;
              writeFileSync(join(root, 'later.tmp'), 'new');
              renameSync(join(root, 'later.tmp'), join(root, 'target.txt'));
            }
            return read(...arguments_);
          });
        }
        return handle;
      });

      await expect(provider.writeFile('target.txt', 'new')).resolves.toBeUndefined();

      expect(replaced).toBe(true);
      expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('new');
      expect(temporaryFiles(root)).toEqual([]);
    },
  );

  it('should settle a write whose path a later writer replaced before its verification read', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const open = fs.open.bind(fs);
    let replacement: 'applied' | 'refused' | undefined;
    vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
      // Numeric flags single out the post-rename verification read; the provider opens the
      // admitted real path, which differs from `root` on macOS and Windows temp directories.
      if (replacement === undefined && typeof flags === 'number' && String(path).endsWith('target.txt')) {
        /*
         * A second writer publishes different bytes over the path *before* this
         * descriptor exists, so the verification read opens that writer's entry
         * instead of the one our rename published. This is the interleaving the
         * published-descriptor read cannot see: the inode it is handed is intact
         * and its bytes verify against themselves, they are simply not ours.
         */
        writeFileSync(join(root, 'superseding.tmp'), 'kept');
        try {
          renameSync(join(root, 'superseding.tmp'), join(root, 'target.txt'));
          replacement = 'applied';
        } catch {
          // Windows refuses a rename over a name whose entry a writer still holds, and
          // `_atomicWrite` holds the published file open there for its metadata flush,
          // so the path keeps this write's own entry and verification proceeds on it.
          rmSync(join(root, 'superseding.tmp'));
          replacement = 'refused';
        }
      }
      return open(path, flags, mode);
    });

    const outcome = await provider.writeFile('target.txt', 'mine').then(
      () => undefined,
      (error: unknown) => error,
    );
    const code = (outcome as NodeJS.ErrnoException | undefined)?.code;

    expect(code).not.toBe('WRITE_VERIFICATION_FAILED');
    expect(code).not.toBe('CHECKED_WRITE_POTENTIALLY_APPLIED');
    expect(outcome).toBeUndefined();
    expect(replacement).toBe(process.platform === 'win32' ? 'refused' : 'applied');
    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe(replacement === 'applied' ? 'kept' : 'mine');
    expect(temporaryFiles(root)).toEqual([]);
  });
});

describe('NodeFsProvider head listing', () => {
  it('avoids full reads and leaves exact counts fresh after a same-size external edit', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const file = join(root, 'large.txt');
    writeFileSync(file, `${'a'.repeat(1024)}\nend`);
    const fullRead = vi.spyOn(fs, 'readFile');

    const headRows = await provider.readdirWithStats('', { content: 'head' });
    expect(headRows.find(({ name }) => name === 'large.txt')).toMatchObject({
      contentKind: 'text',
      size: 1028,
    });
    expect(fullRead).not.toHaveBeenCalled();
    const head = await provider.stat('large.txt', { content: 'head' });
    expect(head).toMatchObject({ type: 'file', size: 1028, contentKind: 'text' });
    expect(head).not.toHaveProperty('lineCount');
    expect(fullRead).not.toHaveBeenCalled();
    writeFileSync(file, `${'a'.repeat(1024)}-end`);
    expect(await provider.stat('large.txt')).toMatchObject({ contentKind: 'text', lineCount: 1 });
    const exactRows = await provider.readdirWithStats('');
    expect(exactRows.find(({ name }) => name === 'large.txt')).toMatchObject({
      lineCount: 1,
    });
  });
});
