import { describe, expect, it, vi } from 'vitest';
import type * as Revisions from '@taucad/revisions';
import { bootstrapRemoteRevisionStore, largeObjectThresholdBytes } from '@taucad/revisions';
import { githubConnections } from '#lib/github-connections.js';
import { prepareLinkedGithubImport } from '#lib/github-linked-import.js';
import { setRevisionSessionUser } from '#lib/revision-actor.js';

vi.mock('#lib/github-connections.js', () => ({
  githubConnections: { token: vi.fn() },
}));
vi.mock('@taucad/revisions', async (importOriginal) => ({
  ...(await importOriginal<typeof Revisions>()),
  bootstrapRemoteRevisionStore: vi.fn(),
}));

const selection: Parameters<typeof prepareLinkedGithubImport>[0]['selection'] = {
  connection: {
    id: '00000000-0000-4000-8000-000000000001',
    subject: 1,
    login: 'octo',
    avatarUrl: undefined,
    generation: 1,
  },
  installation: {
    id: 2,
    owner: { id: 1, login: 'octo', avatarUrl: null, type: 'User' },
    repositorySelection: 'all',
    suspended: false,
    permissions: { contents: 'write' },
  },
  repository: {
    id: 3,
    name: 'design',
    fullName: 'octo/design',
    owner: { id: 1, login: 'octo', avatarUrl: null, type: 'User' },
    visibility: 'private',
    access: 'write',
    archived: false,
    disabled: false,
    description: null,
    defaultBranch: 'main',
    htmlUrl: 'https://github.com/octo/design',
    cloneUrl: 'https://github.com/octo/design.git',
  },
  branch: { name: 'main', head: 'a'.repeat(40) },
  files: [],
};

describe('prepareLinkedGithubImport', () => {
  it('refuses a large ordinary Git blob before fetching or rewriting repository history', async () => {
    await expect(
      prepareLinkedGithubImport({
        selection: {
          ...selection,
          files: [{ path: 'model.step', mode: '100644', size: largeObjectThresholdBytes, oid: 'b'.repeat(40) }],
        },
        targetBranch: 'main',
        manifest: new TextEncoder().encode('{}'),
        mainFile: 'model.step',
      }),
    ).rejects.toThrow('Track it with Git LFS');
  });

  it('records the setup revision as the signed-in Tau person with the GitHub no-reply author (D33)', async () => {
    vi.mocked(githubConnections.token).mockResolvedValue({ accessToken: 't', expiresAt: '', generation: 4 });
    vi.mocked(bootstrapRemoteRevisionStore).mockResolvedValue({
      tree: { entries: () => [] },
    } as unknown as Awaited<ReturnType<typeof bootstrapRemoteRevisionStore>>);
    setRevisionSessionUser({ id: 'tau-user-1' });

    await prepareLinkedGithubImport({
      selection: { ...selection, files: [] },
      targetBranch: 'main',
      manifest: new TextEncoder().encode('{}'),
      mainFile: 'main.scad',
    });

    const noreply = { name: 'octo', email: '1+octo@users.noreply.github.com' };
    expect(vi.mocked(bootstrapRemoteRevisionStore).mock.calls[0]?.[0]).toMatchObject({
      author: noreply,
      setup: { provenance: { actorId: 'tau-user-1', actor: { kind: 'user', id: 'tau-user-1', ...noreply } } },
    });
    setRevisionSessionUser(undefined);
  });
});
