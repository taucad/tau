import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { expect, it, vi } from 'vitest';

import { createProjectRevisions } from '#revisions.js';

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
    await vi.waitFor(() => {
      expect(revisions.status().headRevisionId).not.toBe(before);
    });
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
