import { describe, expect, it, vi } from 'vitest';
import { shareArtifactCodec } from '#artifact.js';
import type { ShareArtifactCodec, ShareOpenedArtifact } from '#artifact.js';
import { bitbucketShareProvider } from '#bitbucket.js';
import { githubShareProvider } from '#github.js';
import { gitlabShareProvider } from '#gitlab.js';
import type { ShareProviderContext } from '#provider.js';
import { formatRepositoryTarget } from '#repository-target.js';

const commit = 'a'.repeat(40);
const opened: ShareOpenedArtifact = { archive: new Uint8Array([1]), files: [] };
const openArchive = vi.fn<ShareArtifactCodec['openArchive']>(async () => opened);
const artifactCodec = { ...shareArtifactCodec, openArchive } satisfies ShareArtifactCodec;

describe('repository share providers', () => {
  it.each([
    [githubShareProvider, 'github', { v: 1, repositoryId: 1, fullName: 'taucad/examples', commit, root: '' }],
    [gitlabShareProvider, 'gitlab', { v: 1, projectId: 2, commit, root: 'birdhouse' }],
    [
      bitbucketShareProvider,
      'bitbucket',
      {
        v: 1,
        workspaceUuid: '{11111111-1111-1111-1111-111111111111}',
        repositoryUuid: '{22222222-2222-2222-2222-222222222222}',
        commit,
        root: '',
      },
    ],
  ] as const)('resolves %s through the same-origin bounded gateway', async (provider, providerId, target) => {
    const reference = formatRepositoryTarget(providerId, target);
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      expect(url.origin).toBe('https://tau.new');
      expect(url.searchParams.get('provider')).toBe(providerId);
      expect(url.searchParams.get('target')).toBe(reference);
      expect(init?.credentials).toBe('omit');
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'application/zip' } });
    });
    const context = { origin: 'https://tau.new', fetch, artifactCodec } satisfies ShareProviderContext;
    await expect(provider.resolve!({ locator: { providerId, reference }, secrets: {} }, context)).resolves.toBe(opened);
  });

  it('rejects gateway failures without exposing response bodies', async () => {
    const reference = formatRepositoryTarget('gitlab', { v: 1, projectId: 2, commit, root: '' });
    const context = {
      origin: 'https://tau.new',
      artifactCodec,
      fetch: vi.fn<typeof globalThis.fetch>(async () => new Response('secret upstream detail', { status: 429 })),
    } satisfies ShareProviderContext;
    await expect(
      gitlabShareProvider.resolve!({ locator: { providerId: 'gitlab', reference }, secrets: {} }, context),
    ).rejects.toMatchObject({ code: 'SHARE_PROVIDER_UNAVAILABLE' });
  });
});
