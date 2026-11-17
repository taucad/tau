import type * as nodeFs from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { revisionId } from '@taucad/revisions/algorithms';
import { expect, it, vi } from 'vitest';

import { createProjectRevisions } from '#revisions.js';

/* Whether each watcher the host opened is still open. */
const watching = vi.hoisted((): Array<{ open: boolean }> => []);

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>();
  const watch = (...arguments_: Parameters<typeof nodeFs.watch>): ReturnType<typeof nodeFs.watch> => {
    const watcher = actual.watch(...arguments_);
    const state = { open: true };
    watching.push(state);
    const close = watcher.close.bind(watcher);
    watcher.close = () => {
      state.open = false;
      close();
    };
    return watcher;
  };
  return { ...actual, watch };
});

it('should refuse release when the pending queue cannot be written and keep the root usable', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-release-'));
  const filesystem = new NodeFsProvider(workspaceRoot);
  await filesystem.writeFile('main.ts', 'first');
  const port = createIsomorphicGitRevisionPort({
    filesystem,
    checkouts: { projectId: 'proj_AAAAAAAAAAAAAAAAAAAAA', root: () => filesystem },
  });
  let refuseQueue = true;
  const write = filesystem.writeFile.bind(filesystem);
  const writes = vi.spyOn(filesystem, 'writeFile').mockImplementation(async (path, data) => {
    if (refuseQueue && path.startsWith('.git/sync-pending')) {
      throw new Error('Pending queue storage is full.');
    }
    await write(path, data);
  });
  const revisions = createProjectRevisions({
    via: 'desktop',
    workspaceRoot,
    projectId: 'proj_AAAAAAAAAAAAAAAAAAAAA',
    watchWorkspace: false,
    filesystem: () => filesystem,
    port: {
      ...port,
      listRemotes: async () => [{ name: 'tau', url: 'https://remote.test/project.git', kind: 'tau' }],
      listRemoteRefs: async () => [],
      push: async () => {
        throw new Error('Remote is unavailable.');
      },
    },
  });
  try {
    await revisions.opened();
    await expect(revisions.release()).rejects.toThrow('Pending queue storage is full.');
    const before = revisions.status().headRevisionId;
    expect(before).toBeDefined();
    await filesystem.writeFile('main.ts', 'after refused close');
    revisions.changed(revisions.status().checkoutId!, ['main.ts']);
    await revisions.channel.request({ command: 'saveRevision' });
    /* The close's own mint published just before: this one waits out the floor between mints (D11). */
    await vi.waitFor(
      () => {
        expect(revisions.status().headRevisionId).not.toBe(before);
      },
      { timeout: 5000 },
    );
  } finally {
    refuseQueue = false;
    await revisions.channel.request({ command: 'syncNow' });
    await vi.waitFor(() => {
      expect(revisions.status().sync.state).toBe('queued');
    });
    await revisions.release();
    writes.mockRestore();
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

it('should stop watching when a close cannot record, and read the whole checkout at the next close', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-release-watch-'));
  const filesystem = new NodeFsProvider(workspaceRoot);
  await filesystem.writeFile('main.ts', 'first');
  const port = createIsomorphicGitRevisionPort({
    filesystem,
    checkouts: { projectId: 'proj_AAAAAAAAAAAAAAAAAAAAA', root: () => filesystem },
  });
  let refuseQueue = true;
  const write = filesystem.writeFile.bind(filesystem);
  const writes = vi.spyOn(filesystem, 'writeFile').mockImplementation(async (path, data) => {
    if (refuseQueue && path.startsWith('.git/sync-pending')) {
      throw new Error('Pending queue storage is full.');
    }
    await write(path, data);
  });
  watching.length = 0;
  const revisions = createProjectRevisions({
    via: 'desktop',
    workspaceRoot,
    projectId: 'proj_AAAAAAAAAAAAAAAAAAAAA',
    filesystem: () => filesystem,
    port: {
      ...port,
      listRemotes: async () => [{ name: 'tau', url: 'https://remote.test/project.git', kind: 'tau' }],
      listRemoteRefs: async () => [],
      push: async () => {
        throw new Error('Remote is unavailable.');
      },
    },
  });
  try {
    await revisions.opened();
    expect(watching.length).toBeGreaterThan(0);
    await expect(revisions.release()).rejects.toThrow('Pending queue storage is full.');
    /* An open recursive watch holds its root on Windows: the project must not stay locked behind a refused close. */
    expect(watching.map(({ open }) => open)).toEqual(watching.map(() => false));

    /* No watcher reports this write; the retried close reads the whole checkout instead. */
    await writeFile(join(workspaceRoot, 'main.ts'), 'after refused close');
    refuseQueue = false;
    await revisions.release();
    const head = revisions.status().headRevisionId;
    expect(head).toBeDefined();
    const tree = await port.readTree(revisionId(head!));
    expect(new TextDecoder().decode(tree?.get('main.ts'))).toBe('after refused close');
  } finally {
    refuseQueue = false;
    await revisions.release().catch(() => undefined);
    writes.mockRestore();
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
