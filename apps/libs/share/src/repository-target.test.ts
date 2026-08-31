import { base64url } from 'jose';
import { describe, expect, it } from 'vitest';
import { formatRepositoryTarget, parseRepositoryTarget } from '#repository-target.js';

const commit = 'a'.repeat(40);

describe('repository share targets', () => {
  it('round trips canonical immutable targets for every provider', () => {
    const targets = [
      ['github', { v: 1, repositoryId: 12, fullName: 'taucad/examples', commit, root: 'replicad/birdhouse' }],
      ['gitlab', { v: 1, projectId: 34, commit, root: '' }],
      [
        'bitbucket',
        {
          v: 1,
          workspaceUuid: '{11111111-1111-1111-1111-111111111111}',
          repositoryUuid: '{22222222-2222-2222-2222-222222222222}',
          commit,
          root: 'examples/birdhouse',
        },
      ],
    ] as const;
    for (const [providerId, target] of targets) {
      const reference = formatRepositoryTarget(providerId, target);
      expect(reference).not.toContain('=');
      expect(parseRepositoryTarget(providerId, reference)).toEqual(target);
    }
  });

  it('rejects mutable refs, unsafe roots, unknown fields, and noncanonical JSON', () => {
    expect(() =>
      formatRepositoryTarget('github', {
        v: 1,
        repositoryId: 12,
        fullName: 'taucad/examples',
        commit: 'main',
        root: '',
      }),
    ).toThrow('malformed');
    expect(() => formatRepositoryTarget('gitlab', { v: 1, projectId: 34, commit, root: '../birdhouse' })).toThrow(
      'malformed',
    );
    for (const root of ['a%2Fb', 'a\nb', 'é'.repeat(600)]) {
      expect(() => formatRepositoryTarget('gitlab', { v: 1, projectId: 34, commit, root })).toThrow('malformed');
    }

    const extra = base64url.encode(
      new TextEncoder().encode(JSON.stringify({ v: 1, projectId: 34, commit, root: '', extra: true })),
    );
    expect(() => parseRepositoryTarget('gitlab', extra)).toThrow('malformed');

    const reordered = base64url.encode(
      new TextEncoder().encode(JSON.stringify({ commit, root: '', projectId: 34, v: 1 })),
    );
    expect(() => parseRepositoryTarget('gitlab', reordered)).toThrow('malformed');
  });
});
