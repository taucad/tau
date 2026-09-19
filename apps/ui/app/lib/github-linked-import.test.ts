import { describe, expect, it, vi } from 'vitest';
import { largeObjectThresholdBytes } from '@taucad/revisions';
import { prepareLinkedGithubImport } from '#lib/github-linked-import.js';

vi.mock('#lib/github-connections.js', () => ({
  githubConnections: { token: vi.fn() },
}));

describe('prepareLinkedGithubImport', () => {
  it('refuses a large ordinary Git blob before fetching or rewriting repository history', async () => {
    await expect(
      prepareLinkedGithubImport({
        selection: {
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
          files: [{ path: 'model.step', mode: '100644', size: largeObjectThresholdBytes, oid: 'b'.repeat(40) }],
        },
        targetBranch: 'main',
        manifest: new TextEncoder().encode('{}'),
        mainFile: 'model.step',
      }),
    ).rejects.toThrow('Track it with Git LFS');
  });
});
