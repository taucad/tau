import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareArtifactCodec, ShareOpenedArtifact, SharePlainArtifact, ShareProtectedArtifact } from '#artifact.js';
import { githubGistShareProvider } from '#github-gist.js';
import type { ShareProviderContext } from '#provider.js';
import type { ShareProjectSnapshot } from '#snapshot.js';

const password = 'correct horse battery staple 12345';
const protectedArtifact: ShareProtectedArtifact = {
  archive: new Uint8Array([1, 2, 3]),
  compactJwe: 'protected.encrypted',
  metrics: { fileCount: 2, uncompressedBytes: 3, archiveBytes: 3, jweCharacters: 19 },
};
const plainArtifact: SharePlainArtifact = {
  archive: protectedArtifact.archive,
  encodedArchive: 'encoded-archive',
  metrics: { fileCount: 2, uncompressedBytes: 3, archiveBytes: 3, encodedCharacters: 15 },
};
const opened: ShareOpenedArtifact = { archive: protectedArtifact.archive, files: [] };
const snapshot: ShareProjectSnapshot = { entryPath: 'main.ts', files: [], warnings: [] };

const artifactCodec = {
  pack: vi.fn(async (_snapshot: ShareProjectSnapshot) => plainArtifact),
  openArchive: vi.fn(async (_archive: Uint8Array<ArrayBuffer>) => opened),
  openPlain: vi.fn(async (_encodedArchive: string) => opened),
  sealWithPassword: vi.fn(async (_snapshot: ShareProjectSnapshot, _password: string) => protectedArtifact),
  openWithPassword: vi.fn(async (_input: { readonly compactJwe: string; readonly password: string }) => opened),
} satisfies ShareArtifactCodec;

const context = (
  fetch: typeof globalThis.fetch,
  grantedScopes: readonly string[] = ['gist'],
): ShareProviderContext => ({
  origin: 'https://tau.new',
  fetch,
  artifactCodec,
  credentialBroker: {
    getAccessToken: vi.fn(async () => ({ accessToken: 'oauth-token', grantedScopes })),
  },
});

const createdGist = () => {
  const body: Record<string, unknown> = { id: 'abc123', history: [{ version: 'a'.repeat(40) }] };
  body['html_url'] = 'https://gist.github.com/abc123';
  return Response.json(body);
};

describe('GitHub Gist share provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes an unencrypted secret Gist by default and pins the revision', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const requestBody = typeof init?.body === 'string' ? init.body : '';
      expect(JSON.parse(requestBody)).toEqual({
        public: false,
        files: { 'tau-project.zip.base64url': { content: plainArtifact.encodedArchive } },
      });
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer oauth-token');
      return createdGist();
    });
    await expect(githubGistShareProvider.publish!({ snapshot }, context(fetch))).resolves.toMatchObject({
      locator: { providerId: 'github-gist', reference: `abc123.${'a'.repeat(40)}` },
      secrets: {},
    });
  });

  it.each(['publish', 'republish', 'unpublish'] as const)(
    'rejects %s before GitHub when the granted scopes omit gist',
    async (operation) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const withoutGist = context(fetch, ['read:user']);
      const action =
        operation === 'publish'
          ? githubGistShareProvider.publish!({ snapshot }, withoutGist)
          : operation === 'republish'
            ? githubGistShareProvider.republish!(
                { locator: { providerId: 'github-gist', reference: 'abc123' }, snapshot },
                withoutGist,
              )
            : githubGistShareProvider.unpublish!(
                { locator: { providerId: 'github-gist', reference: 'abc123' } },
                withoutGist,
              );

      await expect(action).rejects.toMatchObject({
        name: 'ShareError',
        code: 'SHARE_PERMISSION_REQUIRED',
        message: 'Allow Gist access before managing a GitHub Gist.',
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('publishes a public password-protected Gist without storing its password', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const requestBody = typeof init?.body === 'string' ? init.body : '';
      expect(JSON.parse(requestBody)).toEqual({
        public: true,
        files: { 'tau-project.jwe': { content: protectedArtifact.compactJwe } },
      });
      expect(requestBody).not.toContain(password);
      return createdGist();
    });
    await expect(
      githubGistShareProvider.publish!(
        { snapshot, visibility: 'public', protection: { kind: 'password', password, includePassword: true } },
        context(fetch),
      ),
    ).resolves.toMatchObject({ secrets: { p: password } });
  });

  it('republishes a Tau Gist in place and returns its new pinned revision', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      if (init?.method === 'GET') {
        expect(url).toBe('https://api.github.com/gists/abc123');
        return Response.json({ files: { 'tau-project.zip.base64url': { content: 'old' } } });
      }
      expect(init?.method).toBe('PATCH');
      expect(url).toBe('https://api.github.com/gists/abc123');
      const requestBody = typeof init?.body === 'string' ? init.body : '';
      expect(JSON.parse(requestBody)).toEqual({
        files: {
          'tau-project.jwe': { content: protectedArtifact.compactJwe },
          'tau-project.zip.base64url': null,
        },
      });
      return createdGist();
    });
    await expect(
      githubGistShareProvider.republish!(
        {
          locator: { providerId: 'github-gist', reference: `abc123.${'b'.repeat(40)}` },
          snapshot,
          protection: { kind: 'password', password, includePassword: false },
        },
        context(fetch),
      ),
    ).resolves.toMatchObject({
      locator: { providerId: 'github-gist', reference: `abc123.${'a'.repeat(40)}` },
      secrets: {},
    });
  });

  it('unpublishes a Gist and refuses to republish an ordinary Gist', async () => {
    const deleteFetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      expect(url).toBe('https://api.github.com/gists/abc123');
      expect(init?.method).toBe('DELETE');
      return new Response(undefined, { status: 204 });
    });
    await expect(
      githubGistShareProvider.unpublish!(
        { locator: { providerId: 'github-gist', reference: 'abc123' } },
        context(deleteFetch),
      ),
    ).resolves.toBeUndefined();

    const ordinaryFetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ files: { 'main.scad': { content: 'cube(1);' } } }),
    );
    await expect(
      githubGistShareProvider.republish!(
        { locator: { providerId: 'github-gist', reference: 'abc123' }, snapshot },
        context(ordinaryFetch),
      ),
    ).rejects.toMatchObject({ code: 'SHARE_PROVIDER_INVALID_RESPONSE' });
    expect(ordinaryFetch).toHaveBeenCalledOnce();
  });

  it('resolves latest plain and pinned password-protected Tau artifacts anonymously', async () => {
    const latest = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      expect(url).toBe('https://api.github.com/gists/abc123');
      expect(init?.credentials).toBe('omit');
      return Response.json({
        files: { 'tau-project.zip.base64url': { content: plainArtifact.encodedArchive, truncated: false } },
      });
    });
    await expect(
      githubGistShareProvider.resolve!(
        { locator: { providerId: 'github-gist', reference: 'abc123' }, secrets: {} },
        context(latest),
      ),
    ).resolves.toBe(opened);

    const revision = 'b'.repeat(40);
    const encrypted = vi.fn<typeof globalThis.fetch>(async (url) => {
      expect(url).toBe(`https://api.github.com/gists/abc123/${revision}`);
      return Response.json({
        files: { 'tau-project.jwe': { content: protectedArtifact.compactJwe, truncated: false } },
      });
    });
    await expect(
      githubGistShareProvider.resolve!(
        { locator: { providerId: 'github-gist', reference: `abc123.${revision}` }, secrets: {} },
        context(encrypted),
      ),
    ).rejects.toMatchObject({ code: 'SHARE_PASSWORD_REQUIRED' });
    await githubGistShareProvider.resolve!(
      { locator: { providerId: 'github-gist', reference: `abc123.${revision}` }, secrets: { p: password } },
      context(encrypted),
    );
    expect(artifactCodec.openWithPassword).toHaveBeenLastCalledWith(
      { compactJwe: protectedArtifact.compactJwe, password },
      undefined,
    );
  });

  it('opens an ordinary single-source Gist by synthesizing tau.json in memory', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        description: 'External model',
        files: { 'model.scad': { filename: 'model.scad', content: 'cube([10, 10, 10]);', truncated: false } },
      }),
    );
    await githubGistShareProvider.resolve!(
      { locator: { providerId: 'github-gist', reference: 'abc123' }, secrets: {} },
      context(fetch),
    );
    const packedSnapshot = artifactCodec.pack.mock.calls.at(-1)?.[0];
    expect(packedSnapshot?.entryPath).toBe('model.scad');
    expect(packedSnapshot?.files.map(({ path }) => path)).toEqual(['model.scad', 'tau.json']);
    expect(new TextDecoder().decode(packedSnapshot?.files.find(({ path }) => path === 'tau.json')?.content)).toContain(
      'External model',
    );
  });

  it('rejects truncated ordinary Gists and maps GitHub failures', async () => {
    const truncated = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ files: { 'main.ts': { content: 'export default 1', truncated: true } } }),
    );
    await expect(
      githubGistShareProvider.resolve!(
        { locator: { providerId: 'github-gist', reference: 'abc123' }, secrets: {} },
        context(truncated),
      ),
    ).rejects.toMatchObject({ code: 'SHARE_PROVIDER_INVALID_RESPONSE' });

    await Promise.all(
      (
        [
          [401, 'SHARE_AUTH_REQUIRED'],
          [403, 'SHARE_PERMISSION_REQUIRED'],
          [404, 'SHARE_PROVIDER_UNAVAILABLE'],
          [422, 'SHARE_PROVIDER_INVALID_RESPONSE'],
          [429, 'SHARE_PROVIDER_UNAVAILABLE'],
        ] as const
      ).map(async ([status, code]) => {
        const failed = vi.fn<typeof globalThis.fetch>(async () => new Response(undefined, { status }));
        await expect(
          githubGistShareProvider.resolve!(
            { locator: { providerId: 'github-gist', reference: 'abc123' }, secrets: {} },
            context(failed),
          ),
        ).rejects.toMatchObject({ code });
      }),
    );
  });

  it('normalizes network failures while preserving cancellation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError('secret network detail');
    });
    const locator = { providerId: 'github-gist', reference: 'abc123' };
    await expect(githubGistShareProvider.resolve!({ locator, secrets: {} }, context(fetch))).rejects.toMatchObject({
      code: 'SHARE_PROVIDER_UNAVAILABLE',
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      githubGistShareProvider.resolve!({ locator, secrets: {}, signal: controller.signal }, context(fetch)),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
