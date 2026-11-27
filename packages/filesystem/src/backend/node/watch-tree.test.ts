import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { watchTree } from '#backend/node/watch-tree.js';
import type { TreeWatcher } from '#backend/node/watch-tree.js';

/**
 * A watch over a fresh temporary root that records what it reports.
 *
 * `barrier` writes a marker at the root and resolves once the watch reports it.
 * Every watch shares the process's one inotify queue, which delivers in order,
 * so by then each event raised by an earlier write has been handled too.
 */
const watched = (root: string) => {
  const changes: Array<string | undefined> = [];
  const errors: Error[] = [];
  const waiting = new Map<string, () => void>();
  let markers = 0;
  const watcher: TreeWatcher = watchTree(root, {
    change: (path) => {
      changes.push(path);
      if (path !== undefined) {
        waiting.get(path)?.();
      }
    },
    error: (error) => {
      errors.push(error);
    },
  });
  const barrier = async (): Promise<void> => {
    markers += 1;
    const name = `marker-${String(markers)}`;
    const seen = Promise.withResolvers<void>();
    waiting.set(name, seen.resolve);
    writeFileSync(join(root, name), '');
    await seen.promise;
    waiting.delete(name);
  };
  return { watcher, changes, errors, barrier };
};

describe('watchTree', () => {
  let root: string;
  let watch: ReturnType<typeof watched> | undefined;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'tau-watch-tree-')));
  });

  afterEach(async () => {
    watch?.watcher.close();
    watch = undefined;
    await rm(root, { recursive: true, force: true });
  });

  it('should report a watched directory replaced by a file of the same name without throwing (#2972)', async () => {
    watch = watched(root);
    mkdirSync(join(root, 'main.ts'));
    writeFileSync(join(root, 'main.ts', 'child.ts'), 'export {};');
    await watch.barrier();
    watch.changes.length = 0;

    /* In one turn, so the removed directory's own events are handled only once the file stands in its place. */
    rmSync(join(root, 'main.ts'), { recursive: true });
    writeFileSync(join(root, 'main.ts'), '');
    await watch.barrier();

    expect(watch.changes).toContain('main.ts');
    expect(watch.changes).not.toContain('main.ts/main.ts');
    expect(watch.errors).toEqual([]);
  });

  it('should report writes inside a directory created after the watch started', async () => {
    watch = watched(root);
    mkdirSync(join(root, 'parts', 'deep'), { recursive: true });
    await watch.barrier();
    writeFileSync(join(root, 'parts', 'deep', 'gear.ts'), 'export {};');
    await watch.barrier();

    expect(watch.changes).toContain('parts/deep/gear.ts');
  });

  it('should report each entry of a directory found after the watch started', async () => {
    watch = watched(root);
    const staged = await mkdtemp(join(tmpdir(), 'tau-watch-tree-staged-'));
    mkdirSync(join(staged, 'nested'));
    writeFileSync(join(staged, 'nested', 'a.ts'), '');
    renameSync(staged, join(root, 'moved'));
    await watch.barrier();

    expect(watch.changes).toEqual(expect.arrayContaining(['moved', 'moved/nested', 'moved/nested/a.ts']));
  });

  it('should keep reporting writes in a directory that replaced a file, and in one that replaced that directory', async () => {
    watch = watched(root);
    writeFileSync(join(root, 'main.ts'), '');
    await watch.barrier();
    rmSync(join(root, 'main.ts'));
    mkdirSync(join(root, 'main.ts'));
    await watch.barrier();
    writeFileSync(join(root, 'main.ts', 'child.ts'), '');
    await watch.barrier();
    expect(watch.changes).toContain('main.ts/child.ts');

    rmSync(join(root, 'main.ts'), { recursive: true });
    mkdirSync(join(root, 'main.ts'));
    await watch.barrier();
    watch.changes.length = 0;
    writeFileSync(join(root, 'main.ts', 'other.ts'), '');
    await watch.barrier();

    expect(watch.changes).toContain('main.ts/other.ts');
    expect(watch.errors).toEqual([]);
  });

  it('should report an error once its root goes away', async () => {
    const failed = Promise.withResolvers<Error>();
    const watcher = watchTree(root, {
      change: () => undefined,
      error: failed.resolve,
    });
    await rm(root, { recursive: true });
    const error = await failed.promise;
    watcher.close();

    expect(error).toMatchObject({ code: 'ENOENT' });
  });

  it('should report nothing after close', async () => {
    watch = watched(root);
    await watch.barrier();
    watch.watcher.close();
    const count = watch.changes.length;
    writeFileSync(join(root, 'after-close.ts'), '');
    /* A second watch on the same root shares the inotify queue, so its report means the closed one was offered the event. */
    const control = watched(root);
    await control.barrier();
    control.watcher.close();

    expect(watch.changes).toHaveLength(count);
  });

  it('should throw when its root cannot be watched', () => {
    expect(() => watchTree(join(root, 'missing'), { change: () => undefined, error: () => undefined })).toThrow();
  });
});
