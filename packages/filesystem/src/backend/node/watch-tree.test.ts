/**
 * A tree watch survives a path that changes type under it.
 *
 * On Linux, Node's own recursive watcher throws ENOTDIR from an internal event
 * handler when a watched directory is replaced by a file, which kills the
 * process; `watchTree` reports the change and keeps watching.
 */
import { rmSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchTree } from '#backend/node/watch-tree.js';
import type { TreeWatcher } from '#backend/node/watch-tree.js';

const roots: string[] = [];
const watchers: TreeWatcher[] = [];

afterEach(async () => {
  for (const watcher of watchers.splice(0)) {
    watcher.close();
  }
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const open = async () => {
  const root = await mkdtemp(join(tmpdir(), 'tau-host-watch-tree-'));
  roots.push(root);
  await writeFile(join(root, 'main.ts'), 'file\n');
  const seen: Array<string | undefined> = [];
  const watcher = watchTree(root, {
    onChange: (path) => {
      seen.push(path);
    },
    onError: (error) => {
      throw error;
    },
  });
  watchers.push(watcher);
  /*
   * Events arrive in order, so a marker's event means every earlier write's
   * event has arrived. The marker is rewritten until it is seen: macOS's
   * FSEvents stream starts after `watch()` returns, and can miss the first.
   */
  const reaches = async (marker: string): Promise<void> => {
    await vi.waitFor(
      () => {
        writeFileSync(join(root, marker), '');
        expect(seen).toContain(marker);
      },
      { timeout: 10_000, interval: 50 },
    );
  };
  return { root, seen, reaches };
};

describe('watchTree', () => {
  it('should keep watching a path swapped from a file to a directory and back', async () => {
    const { root, seen, reaches } = await open();
    await reaches('ready.ts');

    await unlink(join(root, 'main.ts'));
    await mkdir(join(root, 'main.ts'));
    await writeFile(join(root, 'main.ts', 'inner.ts'), 'inner\n');
    await vi.waitFor(
      () => {
        expect(seen).toContain('main.ts/inner.ts');
      },
      { timeout: 10_000 },
    );

    /* Back to a file before the watcher hears the directory go, so its watch on the directory is still armed. */
    rmSync(join(root, 'main.ts'), { recursive: true });
    writeFileSync(join(root, 'main.ts'), 'file again\n');
    await reaches('after.ts');
    seen.length = 0;
    await writeFile(join(root, 'main.ts'), 'edited\n');
    await reaches('done.ts');

    expect(seen).toContain('main.ts');
    expect(seen).not.toContain('main.ts/main.ts');
  });
});
