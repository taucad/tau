import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { expect, it, vi } from 'vitest';

import { createProjectRevisions } from '#revisions.js';

it('should pull the remote again when the page reports a session change (audit R6)', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-session-'));
  const filesystem = new NodeFsProvider(workspaceRoot);
  await filesystem.writeFile('main.ts', 'first');
  const port = createIsomorphicGitRevisionPort({
    filesystem,
    checkouts: { projectId: 'proj_AAAAAAAAAAAAAAAAAAAAA', root: () => filesystem },
  });
  const listRemoteReferences = vi.fn(async () => []);
  const revisions = createProjectRevisions({
    workspaceRoot,
    projectId: 'proj_AAAAAAAAAAAAAAAAAAAAA',
    watchWorkspace: false,
    filesystem: () => filesystem,
    port: {
      ...port,
      listRemotes: async () => [{ name: 'tau', url: 'https://remote.test/project.git', kind: 'tau' }],
      listRemoteRefs: listRemoteReferences,
    },
  });
  try {
    await revisions.opened();
    await vi.waitFor(() => {
      expect(listRemoteReferences).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(revisions.status().sync.state).not.toBe('opening');
    });
    const reads = listRemoteReferences.mock.calls.length;

    await revisions.channel.request({ command: 'sessionChanged' });

    await vi.waitFor(() => {
      expect(listRemoteReferences.mock.calls.length).toBeGreaterThan(reads);
    });
  } finally {
    await revisions.release();
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
