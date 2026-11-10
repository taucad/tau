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
import { pbkdf2 } from 'node:crypto';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, sep } from 'node:path';
import { NodeFsProvider, drainNodeFsProviderWatchClosures } from '#backend/node/provider.js';
import { tauPathPolicy } from '#path-registry.js';
import type { BatchEntry } from '#changeset.js';
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

const pbkdf2Async = promisify(pbkdf2);

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

  it('delivers to a watch opened while the last native subscription is still closing', async () => {
    /* @parcel/watcher tears down its process-wide backend when the last subscription closes, on a pool thread. A
     * subscribe sent before that closing settles binds to the dying backend, resolves, and is never told of anything. */
    const closing = new NodeFsProvider(createRoot());
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const events: unknown[] = [];
    let stop: (() => void) | undefined;
    try {
      const stopClosing = await closing.watch({ paths: ['target.txt'], recursive: false }, () => undefined);
      /* Busy every libuv pool thread, as a loaded runner's file I/O does, so the native close is still queued when
       * the next watch opens. */
      const poolSize = Number(process.env['UV_THREADPOOL_SIZE'] ?? 4);
      const busy = Array.from({ length: poolSize }, async () => pbkdf2Async('busy', 'pool', 200_000, 32, 'sha256'));
      stopClosing();
      stop = await provider.watch({ paths: ['target.txt'], recursive: false }, (event) => events.push(event));
      writeFileSync(join(root, 'target.txt'), 'new');
      await vi.waitFor(
        () => {
          expect(events).toContainEqual({ type: 'change', path: 'target.txt', kind: 'file' });
        },
        { timeout: 2000 },
      );
      await Promise.all(busy);
    } finally {
      stop?.();
      await drainNodeFsProviderWatchClosures(closing);
      await drainNodeFsProviderWatchClosures(provider);
    }
  });

  it('reports a change whose kind a failed stat cannot tell as a reset', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    let onEvents: Parameters<typeof parcelWatcher.subscribe>[1] | undefined;
    vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (_directory, callback) => {
      onEvents = callback;
      return { unsubscribe: async () => undefined };
    });
    vi.spyOn(fs, 'stat').mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));
    const events: unknown[] = [];
    const stop = await provider.watch({ paths: [''], recursive: true }, (event) => events.push(event));
    onEvents?.(null, [{ type: 'update', path: join(root, 'target.txt') }]);
    await drainNodeFsProviderWatchClosures(provider);
    await vi.waitFor(() => {
      expect(events).toEqual([{ type: 'reset' }]);
    });
    stop();
    await drainNodeFsProviderWatchClosures(provider);
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

  it('keeps delivering events after a handler throws', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const close = vi.fn(async () => undefined);
    let onEvents: Parameters<typeof parcelWatcher.subscribe>[1] | undefined;
    vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (_directory, callback) => {
      onEvents = callback;
      return { unsubscribe: close };
    });
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events: unknown[] = [];
    const stop = await provider.watch({ paths: [''], recursive: true }, (event) => {
      events.push(event);
      if (events.length === 1) {
        throw new Error('handler broke');
      }
    });
    try {
      onEvents?.(null, [{ path: join(root, 'target.txt'), type: 'update' }]);
      await drainNodeFsProviderWatchClosures(provider);
      onEvents?.(null, [{ path: join(root, 'gone.txt'), type: 'delete' }]);
      await drainNodeFsProviderWatchClosures(provider);
      /* The event the handler dropped is owed back as a reset, so the consumer resyncs rather than stays stale. */
      expect(events).toEqual([
        { type: 'change', path: 'target.txt', kind: 'file' },
        { type: 'reset' },
        { type: 'delete', path: 'gone.txt' },
      ]);
      expect(reported).toHaveBeenCalledWith(expect.stringContaining('watch handler threw'), expect.any(Error));
    } finally {
      stop();
      await drainNodeFsProviderWatchClosures(provider);
    }
  });

  it('delivers a dropped reset again, ahead of the next event when its retry throws too', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const close = vi.fn(async () => undefined);
    let onEvents: Parameters<typeof parcelWatcher.subscribe>[1] | undefined;
    vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (_directory, callback) => {
      onEvents = callback;
      return { unsubscribe: close };
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events: unknown[] = [];
    let failures = 2;
    const stop = await provider.watch({ paths: [''], recursive: true }, (event) => {
      events.push(event);
      if (event.type === 'reset' && failures > 0) {
        failures -= 1;
        throw new Error('handler broke');
      }
    });
    try {
      onEvents?.(new Error('native stream lost'), []);
      await drainNodeFsProviderWatchClosures(provider);
      /* The reset, then its one retry, both dropped: still owed, and never retried in a loop. */
      expect(events).toEqual([{ type: 'reset' }, { type: 'reset' }]);
      onEvents?.(null, [{ path: join(root, 'target.txt'), type: 'update' }]);
      await drainNodeFsProviderWatchClosures(provider);
      expect(events).toEqual([
        { type: 'reset' },
        { type: 'reset' },
        { type: 'reset' },
        { type: 'change', path: 'target.txt', kind: 'file' },
      ]);
    } finally {
      stop();
      await drainNodeFsProviderWatchClosures(provider);
    }
  });

  it('acknowledges a watch whose handler throws during admission and releases every subscription', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const close = vi.fn(async () => undefined);
    let subscriptions = 0;
    vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async () => {
      subscriptions += 1;
      /* The target's parent appears while the first subscription starts, so admission reconciles with a reset. */
      if (subscriptions === 1) {
        mkdirSync(join(root, 'later'));
      }
      return { unsubscribe: close };
    });
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stop = await provider.watch({ paths: ['later/file.txt'], recursive: false }, () => {
      throw new Error('handler broke');
    });
    expect(subscriptions).toBe(2);
    expect(reported).toHaveBeenCalled();
    stop();
    await drainNodeFsProviderWatchClosures(provider);
    expect(close).toHaveBeenCalledTimes(2);
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
      const stat = vi.spyOn(fs, 'stat');
      onEvents?.(null, burst);
      await drainNodeFsProviderWatchClosures(provider);
      expect(events).toEqual([{ type: 'change', path: 'target.txt', kind: 'file' }]);
      /* A bulk change under an excluded tree costs no syscall on the services utility's event loop. */
      expect(stat.mock.calls.map(([statPath]) => String(statPath))).toEqual([join(directory, 'target.txt')]);
      /* No event is classified by a synchronous `stat` (D16). */
      expect(statted.paths.filter((statPath) => statPath.startsWith(`${directory}${sep}`))).toEqual([]);
    } finally {
      stop();
      await drainNodeFsProviderWatchClosures(provider);
    }
  });

  it('should trust a native delete and classify a burst in arrival order without a synchronous stat (D16)', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    let onEvents: Parameters<typeof parcelWatcher.subscribe>[1] | undefined;
    const subscribe = vi.spyOn(parcelWatcher, 'subscribe').mockImplementation(async (_directory, callback) => {
      onEvents = callback;
      return { unsubscribe: async () => undefined };
    });
    const events: unknown[] = [];
    const stop = await provider.watch({ paths: [''], recursive: true }, (event) => events.push(event));
    try {
      const [[directory]] = subscribe.mock.calls as unknown as [[string]];
      mkdirSync(join(directory, 'made'));
      writeFileSync(join(directory, 'made', 'a.txt'), 'a');
      const stat = vi.spyOn(fs, 'stat');
      statted.paths.length = 0;
      const removed = Array.from(
        { length: 100 },
        (_, index): ParcelEvent => ({
          path: join(directory, 'gone', `${String(index)}.txt`),
          type: 'delete',
        }),
      );
      onEvents?.(null, [
        { path: join(directory, 'made'), type: 'create' },
        { path: join(directory, 'made', 'a.txt'), type: 'create' },
        ...removed,
      ]);
      onEvents?.(null, [{ path: join(directory, 'target.txt'), type: 'update' }]);
      await drainNodeFsProviderWatchClosures(provider);
      expect(events).toEqual([
        { type: 'change', path: 'made', kind: 'dir' },
        { type: 'change', path: 'made/a.txt', kind: 'file' },
        ...removed.map((_, index) => ({ type: 'delete', path: `gone/${String(index)}.txt` })),
        { type: 'change', path: 'target.txt', kind: 'file' },
      ]);
      /* One asynchronous stat per create or update, none per delete, and no synchronous one at all. */
      expect(stat).toHaveBeenCalledTimes(3);
      expect(statted.paths.filter((statPath) => statPath.startsWith(`${directory}${sep}`))).toEqual([]);
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
  it('stats and lists head metadata without opening a file (I3)', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    writeFileSync(join(root, 'large.txt'), `${'a'.repeat(1024)}\nend`);
    const fullRead = vi.spyOn(fs, 'readFile');
    const open = vi.spyOn(fs, 'open');

    const rows = await provider.readdirWithStats('');
    const stat = await provider.stat('large.txt');

    /* Exactly kind, size and time: no content fact rides along. */
    expect(rows.find(({ name }) => name === 'large.txt')).toStrictEqual({
      name: 'large.txt',
      type: 'file',
      size: 1028,
      mtimeMs: stat.mtimeMs,
    });
    expect(stat).toStrictEqual({ type: 'file', size: 1028, mtimeMs: stat.mtimeMs });
    expect(fullRead).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('NodeFsProvider head listing cost (D16)', () => {
  it('lists a directory with one lstat per row and no per-row realpath', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root, { policy: tauPathPolicy });
    mkdirSync(join(root, 'parts'));
    for (let index = 0; index < 20; index += 1) {
      writeFileSync(join(root, 'parts', `${String(index)}.step`), String(index));
    }
    mkdirSync(join(root, 'parts', 'sub'));
    const realpath = vi.spyOn(fs, 'realpath');
    const lstat = vi.spyOn(fs, 'lstat');
    const stat = vi.spyOn(fs, 'stat');

    const rows = await provider.readdirWithStats('parts');

    expect(rows).toHaveLength(21);
    expect(rows.find(({ name }) => name === 'sub')).toMatchObject({ type: 'dir' });
    expect(rows.find(({ name }) => name === '7.step')).toMatchObject({ type: 'file', size: 1 });
    /* The root's and the directory's admission, a constant three, then one lstat per row: no row repeats them. */
    expect(realpath.mock.calls.length).toBeLessThanOrEqual(3);
    expect(lstat.mock.calls.filter(([entry]) => String(entry).startsWith(`${join(root, 'parts')}${sep}`))).toHaveLength(
      21,
    );
    expect(stat).not.toHaveBeenCalled();
  });

  it('still stats a row through its link, and refuses one that launders the mask', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root, { policy: tauPathPolicy });
    mkdirSync(join(root, 'real'));
    writeFileSync(join(root, 'real', 'a.txt'), 'abc');
    symlinkSync(join(root, 'real', 'a.txt'), join(root, 'link.txt'));
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'config'), 'secret');
    symlinkSync(join(root, '.git', 'config'), join(root, 'notes'));

    const rows = await provider.readdirWithStats('');

    expect(rows.find(({ name }) => name === 'link.txt')).toMatchObject({ type: 'file', size: 3 });
    expect(rows.map(({ name }) => name)).not.toContain('notes');
  });

  it('lists through a linked directory by resolving each row', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root, { policy: tauPathPolicy });
    mkdirSync(join(root, 'real'));
    writeFileSync(join(root, 'real', 'a.txt'), 'abcd');
    symlinkSync(join(root, 'real'), join(root, 'alias'));
    const stat = vi.spyOn(fs, 'stat');

    const rows = await provider.readdirWithStats('alias');

    expect(rows.map(({ name, type, size }) => ({ name, type, size }))).toEqual([
      { name: 'a.txt', type: 'file', size: 4 },
    ]);
    expect(stat).toHaveBeenCalled();
  });
});

describe('NodeFsProvider applyBatch (D16)', () => {
  /** Count every fsync any file handle makes, file or directory, from here on. */
  const countSyncs = async (root: string): Promise<{ count(): number }> => {
    const probe = await fs.open(join(root, 'target.txt'), 'r');
    const prototype = Object.getPrototypeOf(probe) as { sync(): Promise<void> };
    await probe.close();
    const sync = vi.spyOn(prototype, 'sync');
    return { count: () => sync.mock.calls.length };
  };

  it('fsyncs a changeset at most once per file plus once per directory', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const directories = ['a', 'b', 'c/d'];
    const entries = directories.flatMap((directory) =>
      Array.from(
        { length: 10 },
        (_, index): Extract<BatchEntry, { op: 'write' }> & { data: Uint8Array<ArrayBuffer> } => ({
          op: 'write',
          path: `${directory}/${String(index)}.txt`,
          data: new TextEncoder().encode(`${directory} ${String(index)}`),
        }),
      ),
    );
    const syncs = await countSyncs(root);

    const receipts = await provider.applyBatch(entries);

    expect(receipts).toEqual(entries.map(() => ({ outcome: 'applied', kind: 'file' })));
    /* 30 files in 3 directories: 33, where one write at a time pays 60. Windows cannot sync a directory, so each
     * file there syncs its own handle again after its rename. */
    expect(syncs.count()).toBe(process.platform === 'win32' ? 2 * entries.length : entries.length + directories.length);
    for (const entry of entries) {
      expect(readFileSync(join(root, entry.path), 'utf8')).toBe(new TextDecoder().decode(entry.data));
    }
    expect(directories.flatMap((directory) => temporaryFiles(join(root, directory)))).toEqual([]);
  });

  it('reads each written file back once and never re-reads an unwritten one (I2)', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const open = vi.spyOn(fs, 'open');
    await provider.applyBatch([
      { op: 'write', path: 'one.txt', data: new TextEncoder().encode('1') },
      { op: 'write', path: 'two.txt', data: new Blob(['2']) },
    ]);
    const verifications = open.mock.calls.filter(([, flags]) => typeof flags === 'number');
    /* The provider resolves its root natively, so on Windows it opens the long name of an 8.3 temp path. */
    const resolved = realpathSync.native(root);
    expect(verifications.map(([opened]) => String(opened)).toSorted()).toEqual([
      join(resolved, 'one.txt'),
      join(resolved, 'two.txt'),
    ]);
    expect(readFileSync(join(root, 'two.txt'), 'utf8')).toBe('2');
  });

  it('answers each entry truthfully beside the others', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    mkdirSync(join(root, 'folder'));
    writeFileSync(join(root, 'moved.txt'), 'm');
    writeFileSync(join(root, 'removed.txt'), 'r');

    const receipts = await provider.applyBatch([
      { op: 'write', path: 'target.txt', data: new TextEncoder().encode('kept'), create: true },
      { op: 'write', path: 'folder', data: new TextEncoder().encode('x') },
      { op: 'write', path: 'fresh.sh', data: new TextEncoder().encode('#!/bin/sh\n'), mode: '100755', create: true },
      { op: 'write', path: 'target.txt.copy', data: new TextEncoder().encode('new') },
      { op: 'move', from: 'moved.txt', to: 'arrived.txt' },
      { op: 'delete', path: 'removed.txt' },
      { op: 'mkdir', path: 'made', recursive: true },
    ]);

    expect(receipts.map(({ outcome }) => outcome)).toEqual([
      'failed',
      'failed',
      'applied',
      'applied',
      'applied',
      'applied',
      'applied',
    ]);
    expect((receipts[0]!.error as NodeJS.ErrnoException).code).toBe('EEXIST');
    expect((receipts[1]!.error as NodeJS.ErrnoException).code).toBe('EISDIR');
    expect(receipts[2]).toEqual({ outcome: 'applied', kind: 'file', created: true });
    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('old');
    expect(await provider.getFileMode('fresh.sh')).toBe(process.platform === 'win32' ? '100644' : '100755');
    expect(readFileSync(join(root, 'arrived.txt'), 'utf8')).toBe('m');
    expect(lstatSync(join(root, 'made')).isDirectory()).toBe(true);
    expect(readdirSync(root).toSorted()).toEqual(
      ['arrived.txt', 'folder', 'fresh.sh', 'made', 'target.txt', 'target.txt.copy'].toSorted(),
    );
  });

  it('keeps an existing file mode unless the entry names one', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    writeFileSync(join(root, 'run.sh'), 'old', { mode: 0o755 });
    await provider.applyBatch([{ op: 'write', path: 'run.sh', data: new TextEncoder().encode('new') }]);
    expect(await provider.getFileMode('run.sh')).toBe(process.platform === 'win32' ? '100644' : '100755');
    await provider.applyBatch([{ op: 'write', path: 'run.sh', data: new TextEncoder().encode('x'), mode: '100644' }]);
    expect(await provider.getFileMode('run.sh')).toBe('100644');
  });

  it('reports a write uncertain when its directory fsync fails after the rename', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    injectFailureAfter('post-rename-fsync');
    const receipts = await provider.applyBatch([
      { op: 'write', path: 'target.txt', data: new TextEncoder().encode('new') },
    ]);
    expect(receipts[0]?.outcome).toBe('uncertain');
    expect(temporaryFiles(root)).toEqual([]);
  });

  it('reports a write failed and leaves its target untouched when staging fails', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    injectFailureAfter('file-fsync');
    const receipts = await provider.applyBatch([
      { op: 'write', path: 'target.txt', data: new TextEncoder().encode('new') },
    ]);
    expect(receipts[0]?.outcome).toBe('failed');
    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('old');
    expect(temporaryFiles(root)).toEqual([]);
  });

  it('reports a write failed and leaves its target untouched when its temp write fails', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    injectFailureAfter('temp-write');
    const receipts = await provider.applyBatch([
      { op: 'write', path: 'target.txt', data: new TextEncoder().encode('new') },
    ]);
    expect(receipts[0]?.outcome).toBe('failed');
    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('old');
    expect(temporaryFiles(root)).toEqual([]);
  });

  it('reports a write uncertain when its rename lands and then throws', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    injectFailureAfter('rename');
    const receipts = await provider.applyBatch([
      { op: 'write', path: 'target.txt', data: new TextEncoder().encode('new') },
    ]);
    expect(receipts[0]?.outcome).toBe('uncertain');
    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('new');
    expect(temporaryFiles(root)).toEqual([]);
  });

  it('reports a write uncertain when its rename throws anything but a refusal', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    vi.spyOn(fs, 'rename').mockRejectedValue(Object.assign(new Error('EIO: i/o error'), { code: 'EIO' }));
    const receipts = await provider.applyBatch([
      { op: 'write', path: 'target.txt', data: new TextEncoder().encode('new') },
    ]);
    expect(receipts[0]).toMatchObject({ outcome: 'uncertain', error: { code: 'EIO' } });
    expect(temporaryFiles(root)).toEqual([]);
  });

  it('reports a write failed when its rename is refused', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    vi.spyOn(fs, 'rename').mockRejectedValue(Object.assign(new Error('EBUSY: busy'), { code: 'EBUSY' }));
    const receipts = await provider.applyBatch([
      { op: 'write', path: 'target.txt', data: new TextEncoder().encode('new') },
    ]);
    expect(receipts[0]).toMatchObject({ outcome: 'failed', error: { code: 'EBUSY' } });
    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('old');
  });

  it('reports a write uncertain when its read-back fails after the rename', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    injectFailureAfter('read-back');
    const receipts = await provider.applyBatch([
      { op: 'write', path: 'target.txt', data: new TextEncoder().encode('new') },
    ]);
    expect(receipts[0]?.outcome).toBe('uncertain');
    expect(temporaryFiles(root)).toEqual([]);
  });

  it('reports a write uncertain when it fails after making its parent', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    injectFailureAfter('file-fsync');
    const receipts = await provider.applyBatch([
      { op: 'write', path: 'made/deeper/new.txt', data: new TextEncoder().encode('new') },
    ]);
    /* The directories it made are a change the pipeline must reconcile, as the primitive batch reports it. */
    expect(receipts[0]?.outcome).toBe('uncertain');
    expect(lstatSync(join(root, 'made', 'deeper')).isDirectory()).toBe(true);
  });

  it('refuses to publish through a parent swapped for a symlink while it staged', async () => {
    const root = createRoot();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'tau-node-outside-')));
    roots.push(outside);
    mkdirSync(join(root, 'sub'));
    const provider = new NodeFsProvider(root);
    let swapRefusal: string | undefined;
    const open = fs.open.bind(fs);
    vi.spyOn(fs, 'open').mockImplementation(async (opened, flags, mode) => {
      const handle = await open(opened, flags, mode);
      if (flags === 'wx') {
        const sync = handle.sync.bind(handle);
        vi.spyOn(handle, 'sync').mockImplementation(async () => {
          await sync();
          try {
            renameSync(join(root, 'sub'), join(root, 'sub-before'));
          } catch (error) {
            swapRefusal = (error as NodeJS.ErrnoException).code;
            throw error;
          }
          symlinkSync(outside, join(root, 'sub'), 'dir');
        });
      }
      return handle;
    });
    const receipts = await provider.applyBatch([
      { op: 'write', path: 'sub/escape.txt', data: new TextEncoder().encode('new') },
    ]);
    /*
     * Windows will not rename a directory while a file inside it is open, so there the swap itself is
     * refused and the write fails with that refusal. Elsewhere the swap lands and the publish must
     * refuse the symlinked parent. Either way nothing reaches the outside directory.
     */
    if (process.platform === 'win32') {
      expect(swapRefusal).toBe('EPERM');
      expect(receipts[0]).toMatchObject({ outcome: 'failed', error: { code: 'EPERM' } });
    } else {
      expect(swapRefusal).toBeUndefined();
      expect(receipts[0]).toMatchObject({ outcome: 'failed', error: { code: 'ELOOP' } });
    }
    expect(readdirSync(outside)).toEqual([]);
  });

  it('applies the rest of a batch when some of its writes fail', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith(`${sep}b.txt`)) {
        throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
      }
      await rename(from, to);
    });
    const receipts = await provider.applyBatch([
      { op: 'write', path: 'a.txt', data: new TextEncoder().encode('a') },
      { op: 'write', path: 'b.txt', data: new TextEncoder().encode('b') },
      { op: 'write', path: 'target.txt', data: new TextEncoder().encode('t'), create: true },
      { op: 'write', path: 'c/c.txt', data: new TextEncoder().encode('c') },
      { op: 'delete', path: 'missing.txt' },
    ]);
    expect(receipts.map(({ outcome }) => outcome)).toEqual(['applied', 'uncertain', 'failed', 'applied', 'failed']);
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('a');
    expect(readFileSync(join(root, 'c', 'c.txt'), 'utf8')).toBe('c');
    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('old');
    expect(readdirSync(root).includes('b.txt')).toBe(false);
    expect(temporaryFiles(root)).toEqual([]);
  });

  it('starts no write once the changeset is aborted', async () => {
    const root = createRoot();
    const provider = new NodeFsProvider(root);
    const controller = new AbortController();
    controller.abort(new DOMException('stopped', 'AbortError'));
    const receipts = await provider.applyBatch(
      [{ op: 'write', path: 'target.txt', data: new TextEncoder().encode('new') }],
      { signal: controller.signal },
    );
    expect(receipts[0]?.outcome).toBe('failed');
    expect(readFileSync(join(root, 'target.txt'), 'utf8')).toBe('old');
  });
});
