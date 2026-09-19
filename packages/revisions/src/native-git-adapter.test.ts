import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { Revision } from '#revision-authority.js';
import { describe, expect, it } from 'vitest';
import { createNativeGitAdapter } from '#native-git-adapter.js';
import type { NativeGitError } from '#native-git.types.js';

const adapter = createNativeGitAdapter({
  repositoryPath: '/unused/tau-native-git-repository',
  worktreeRoot: '/unused/tau-native-git-worktrees',
});
const revision: Revision = Object.freeze({
  id: revisionId('revision'),
  parents: Object.freeze([]),
  tree: new ImmutableRevisionTree([]),
  provenance: Object.freeze({ source: 'agent', actorId: 'actor', createdAt: 0 }),
  summary: Object.freeze({ generated: 'Generated revision' }),
});

describe('native Git argument validation', () => {
  it.each([
    ['newline', 'origin\n--upload-pack=evil'],
    ['NUL', 'origin\0evil'],
    ['leading dash', '--upload-pack=evil'],
  ])('rejects %s injection in transport values', async (_name, remote) => {
    await expect(adapter.fetch({ remote, refspecs: ['refs/heads/main'] })).rejects.toEqual(
      expect.objectContaining<Partial<NativeGitError>>({ code: 'INVALID_TRANSPORT' }),
    );
  });

  it.each([
    ['newline', 'refs/heads/main\n--force'],
    ['NUL', 'refs/heads/main\0evil'],
    ['leading dash', '--force'],
    ['managed destination', 'refs/heads/main:refs/tau/workspaces/poison'],
  ])('rejects %s injection in refspecs', async (_name, refspec) => {
    await expect(adapter.fetch({ remote: 'origin', refspecs: [refspec] })).rejects.toEqual(
      expect.objectContaining<Partial<NativeGitError>>({ code: 'INVALID_TRANSPORT' }),
    );
  });

  it('rejects managed refs before repository access', async () => {
    await expect(
      adapter.push({ remote: 'origin', refspecs: ['refs/tau/revisions/private:refs/heads/leaked'] }),
    ).rejects.toEqual(expect.objectContaining<Partial<NativeGitError>>({ code: 'INVALID_TRANSPORT' }));
  });

  it.each(['', 'a'.repeat(257), 'run\nother', 'run\0other'])('rejects an unsafe run id', async (runId) => {
    await expect(
      adapter.bindWorkspace({
        workspaceId: 'workspace',
        runId,
        baseRevision: revision,
      }),
    ).rejects.toThrow(TypeError);
  });

  it.each([
    {
      name: 'duplicate parents',
      value: { ...revision, parents: [revisionId('parent'), revisionId('parent')] },
    },
    { name: 'negative creation time', value: { ...revision, provenance: { ...revision.provenance, createdAt: -1 } } },
    { name: 'empty actor', value: { ...revision, provenance: { ...revision.provenance, actorId: '' } } },
    { name: 'empty summary', value: { ...revision, summary: { generated: '' } } },
  ])('rejects a revision with $name', async ({ value }) => {
    await expect(adapter.storeRevision(value)).rejects.toThrow(TypeError);
  });
});
