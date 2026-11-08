import { mkdtempSync, realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repositoryLargeObjectStore } from '#backend/node/large-object-store.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
});

const arrange = async (): Promise<string> => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'tau-large-object-store-')));
  roots.push(base);
  await fs.mkdir(join(base, 'project', '.git'), { recursive: true });
  await fs.mkdir(join(base, 'other', '.git', 'lfs', 'objects'), { recursive: true });
  return base;
};

describe('repositoryLargeObjectStore (W11.3, I6)', () => {
  it("accepts the repository's own store, before and after it exists", async () => {
    const base = await arrange();
    const project = join(base, 'project');
    const store = join(project, '.git', 'lfs', 'objects');

    expect(repositoryLargeObjectStore(project, store)).toBe(store);
    await fs.mkdir(store, { recursive: true });
    expect(repositoryLargeObjectStore(project, join(project, '.git', 'lfs', '..', 'lfs', 'objects'))).toBe(store);
  });

  it("refuses another repository's store, a directory under the project, and a link out of .git", async () => {
    const base = await arrange();
    const project = join(base, 'project');
    await fs.mkdir(join(project, '.git', 'lfs'), { recursive: true });
    await fs.symlink(join(base, 'other', '.git', 'lfs', 'objects'), join(project, '.git', 'lfs', 'objects'));

    for (const store of [
      join(base, 'other', '.git', 'lfs', 'objects'),
      join(project, 'models'),
      join(project, '.git'),
      join(project, '.git', 'lfs', 'objects'),
    ]) {
      expect(() => repositoryLargeObjectStore(project, store), store).toThrow(
        expect.objectContaining({ code: 'EINVAL' }),
      );
    }
  });

  it('refuses a root whose .git is a file (a linked worktree)', async () => {
    const base = await arrange();
    const linked = join(base, 'linked');
    await fs.mkdir(linked);
    await fs.writeFile(join(linked, '.git'), `gitdir: ${join(base, 'project', '.git', 'worktrees', 'linked')}\n`);

    expect(() => repositoryLargeObjectStore(linked, join(linked, '.git', 'lfs', 'objects'))).toThrow(
      expect.objectContaining({ code: 'EINVAL' }),
    );
  });
});
