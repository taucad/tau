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

const context = (fetch: typeof globalThis.fetch): ShareProviderContext => ({
  origin: 'https://tau.new',
  fetch,
  artifactCodec,
});
const publication = { id: 'abc123', history: [{ version: 'a'.repeat(40) }] };

describe('GitHub Gist share provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should publish through the API transport without fetching or exposing credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const mutate = vi.fn(async () => publication);
    const result = await githubGistShareProvider.publish!({ snapshot }, { ...context(fetch), githubGist: { mutate } });
    expect(result.locator.reference).toBe(`abc123.${'a'.repeat(40)}`);
    expect(mutate).toHaveBeenCalledWith({
      action: 'create',
      signal: undefined,
      payload: { public: false, files: { 'tau-project.zip.base64url': { content: plainArtifact.encodedArchive } } },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should encrypt locally and never send the password to the server', async () => {
    const mutate = vi.fn(async () => publication);
    const result = await githubGistShareProvider.publish!(
      { snapshot, visibility: 'public', protection: { kind: 'password', password, includePassword: true } },
      { ...context(vi.fn()), githubGist: { mutate } },
    );
    expect(result.secrets).toEqual({ p: password });
    expect(mutate).toHaveBeenCalledWith({
      action: 'create',
      signal: undefined,
      payload: { public: true, files: { 'tau-project.jwe': { content: protectedArtifact.compactJwe } } },
    });
    expect(JSON.stringify(mutate.mock.calls)).not.toContain(password);
  });

  it.each(['publish', 'republish', 'unpublish'] as const)(
    'should refuse %s without the API transport',
    async (operation) => {
      const input = { snapshot, locator: { providerId: 'github-gist', reference: 'abc123' } };
      await expect(githubGistShareProvider[operation]!(input, context(vi.fn()))).rejects.toMatchObject({
        code: 'SHARE_AUTH_REQUIRED',
      });
    },
  );

  it('should send the publication identity and expected revision for update and deletion', async () => {
    const mutate = vi.fn(async () => publication);
    const context_ = { ...context(vi.fn()), githubGist: { mutate } };
    const locator = { providerId: 'github-gist', reference: `abc123.${'b'.repeat(40)}` };
    await githubGistShareProvider.republish!({ locator, snapshot }, context_);
    expect(mutate).toHaveBeenLastCalledWith({
      action: 'update',
      id: 'abc123',
      revision: 'b'.repeat(40),
      signal: undefined,
      payload: { files: { 'tau-project.zip.base64url': { content: plainArtifact.encodedArchive } } },
    });
    await githubGistShareProvider.unpublish!({ locator }, context_);
    expect(mutate).toHaveBeenLastCalledWith({
      action: 'delete',
      id: 'abc123',
      revision: 'b'.repeat(40),
      signal: undefined,
    });
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
