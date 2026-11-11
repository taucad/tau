import { projectManifestSchemaUrl, serializeProjectManifest, projectToManifest } from '@taucad/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { largeObjectThresholdBytes } from '@taucad/revisions';
import type * as GithubConnections from '#lib/github-connections.js';
import { githubConnections } from '#lib/github-connections.js';
import { prepareLinkedGithubImport, readLinkedGithubManifest } from '#lib/github-linked-import.js';
import { setRevisionSessionUser } from '#lib/revision-actor.js';

vi.mock('#lib/github-connections.js', () => ({
  githubConnections: { token: vi.fn() },
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

describe('readLinkedGithubManifest', () => {
  it('should convert an exact legacy declaration without retaining its source identity', () => {
    const manifest = projectToManifest({
      name: 'Legacy',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'main.scad' } },
    });
    const legacy = new TextEncoder().encode(
      JSON.stringify({
        ...manifest,
        $schema: 'https://tau.new/schemas/tau-schema-v1.json',
        id: 'proj_123456789012345678901',
      }),
    );
    expect(readLinkedGithubManifest(legacy)).toEqual({ success: true, data: manifest });
    expect(readLinkedGithubManifest(serializeProjectManifest(manifest))).toEqual({ success: true, data: manifest });
    expect(manifest.$schema).toBe(projectManifestSchemaUrl);
  });
});

describe('prepareLinkedGithubImport', () => {
  /* A GitHub connection belongs to a signed-in Tau account (B1). */
  beforeEach(() => {
    setRevisionSessionUser({ id: 'tau-user-1' });
  });
  afterEach(() => {
    setRevisionSessionUser(undefined);
  });

  it('should refuse to record an import with no Tau account to name, rather than a stand-in id (B1)', async () => {
    setRevisionSessionUser(undefined);

    await expect(
      prepareLinkedGithubImport({
        selection: { ...selection, files: [] },
        targetBranch: 'main',
        manifest: new TextEncoder().encode('{}'),
        mainFile: 'main.scad',
      }),
    ).rejects.toThrow('Sign in to Tau');
  });

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
    setRevisionSessionUser({ id: 'tau-user-1' });

    const { request, generation } = await prepareLinkedGithubImport({
      selection: { ...selection, files: [] },
      targetBranch: 'main',
      manifest: new TextEncoder().encode('{}'),
      mainFile: 'main.scad',
    });

    const noreply = { name: 'octo', email: '1+octo@users.noreply.github.com' };
    expect(generation).toBe(4);
    expect(request).toMatchObject({
      author: noreply,
      setup: { provenance: { actor: { kind: 'user', id: 'tau-user-1', ...noreply }, capture: 'save', via: 'browser' } },
    });
    setRevisionSessionUser(undefined);
  });

  it('should describe the pinned branch for the worker to fetch, with a credential for that repository alone (I6)', async () => {
    vi.mocked(githubConnections.token).mockResolvedValue({ accessToken: 't', expiresAt: '', generation: 4 });

    const { request } = await prepareLinkedGithubImport({
      selection,
      targetBranch: 'tau-main',
      manifest: new TextEncoder().encode('{}'),
      mainFile: 'main.scad',
    });

    expect(request).toMatchObject({
      name: 'octo/design',
      origin: 'https://github.com',
      repositoryUrl: 'https://github.com/octo/design.git',
      authorization: `Basic ${globalThis.btoa('x-access-token:t')}`,
      remote: {
        name: 'github-3',
        url: 'https://github.com/octo/design.git',
        provider: 'github',
        repositoryId: '3',
        fetchOnly: false,
      },
      sourceRef: 'refs/heads/main',
      sourceHead: 'a'.repeat(40),
      targetBranch: 'tau-main',
    });
    /* The review's own setup, and nothing of the repository: the worker fetches that. */
    expect(request.setup.files.map(({ path }) => path)).toEqual(['tau.json']);
    expect(vi.mocked(githubConnections.token).mock.calls.at(-1)?.[1]).toEqual({
      repositoryId: 3,
      operation: 'read',
      purpose: 'import',
    });
  });

  it('should set up an empty repository with the main file and no source pin', async () => {
    vi.mocked(githubConnections.token).mockResolvedValue({ accessToken: 't', expiresAt: '', generation: 4 });

    const { request } = await prepareLinkedGithubImport({
      selection: { ...selection, branch: { name: 'main' } },
      targetBranch: 'main',
      manifest: new TextEncoder().encode('{}'),
      mainFile: 'main.scad',
    });

    expect(request.sourceRef).toBeUndefined();
    expect(request.sourceHead).toBeUndefined();
    expect(request.setup.files.map(({ path }) => path)).toEqual(['tau.json', 'main.scad']);
  });

  describe('a GitHub account removed before Import and link (R23)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should send the import page back to the account list, not to the backup', async () => {
      const actual = await vi.importActual<typeof GithubConnections>('#lib/github-connections.js');
      vi.mocked(githubConnections.token).mockImplementation(actual.githubConnections.token);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ code: 'GITHUB_CONNECTION_NOT_FOUND' }, { status: 401 })),
      );

      await expect(
        prepareLinkedGithubImport({
          selection,
          targetBranch: 'main',
          manifest: new TextEncoder().encode('{}'),
          mainFile: 'main.scad',
        }),
      ).rejects.toThrow('This GitHub account is no longer connected. Refresh and choose another account.');
    });
  });
});
