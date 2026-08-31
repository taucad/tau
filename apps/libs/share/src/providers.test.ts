import { describe, expect, it, vi } from 'vitest';
import type { ShareArtifactCodec, ShareOpenedArtifact, SharePlainArtifact, ShareProtectedArtifact } from '#artifact.js';
import { directShareProvider } from '#direct.js';
import { tauShareProvider } from '#tau.js';
import type { ShareProviderContext } from '#provider.js';
import type { ShareProjectSnapshot } from '#snapshot.js';

const snapshot: ShareProjectSnapshot = { entryPath: 'main.ts', files: [], warnings: [] };
const opened: ShareOpenedArtifact = { archive: new Uint8Array([1]), files: [] };
const artifact: ShareProtectedArtifact = {
  archive: opened.archive,
  compactJwe: 'protected..iv.ciphertext.tag',
  metrics: { fileCount: 0, uncompressedBytes: 0, archiveBytes: 1, jweCharacters: 28 },
};
const plainArtifact: SharePlainArtifact = {
  archive: opened.archive,
  encodedArchive: 'encoded-archive',
  metrics: { fileCount: 0, uncompressedBytes: 0, archiveBytes: 1, encodedCharacters: 15 },
};

const artifactCodec = {
  pack: vi.fn(async () => plainArtifact),
  openArchive: vi.fn(async () => opened),
  openPlain: vi.fn(async () => opened),
  sealWithPassword: vi.fn(async () => artifact),
  openWithPassword: vi.fn(async () => opened),
} satisfies ShareArtifactCodec;

const context = (overrides: Partial<ShareProviderContext> = {}): ShareProviderContext => ({
  origin: 'https://tau.new',
  fetch: globalThis.fetch,
  artifactCodec,
  ...overrides,
});

describe('direct and Tau share providers', () => {
  it('round trips a plain direct artifact without a transport', async () => {
    const publication = await directShareProvider.publish!({ snapshot }, context());
    expect(publication).toMatchObject({
      locator: { providerId: 'direct' },
      secrets: { v: '2', zip: plainArtifact.encodedArchive },
    });
    await expect(
      directShareProvider.resolve!({ locator: publication.locator, secrets: publication.secrets }, context()),
    ).resolves.toBe(opened);
    expect(artifactCodec.openPlain).toHaveBeenLastCalledWith(plainArtifact.encodedArchive, undefined);
  });

  it('requires or consumes the password for encrypted direct artifacts', async () => {
    const publication = await directShareProvider.publish!(
      {
        snapshot,
        protection: { kind: 'password', password: 'correct horse battery staple 12345', includePassword: false },
      },
      context(),
    );
    expect(publication.secrets).toEqual({ v: '2', jwe: artifact.compactJwe });
    await expect(
      directShareProvider.resolve!({ locator: publication.locator, secrets: publication.secrets }, context()),
    ).rejects.toMatchObject({ code: 'SHARE_PASSWORD_REQUIRED' });
    await directShareProvider.resolve!(
      { locator: publication.locator, secrets: { ...publication.secrets, p: 'correct horse battery staple 12345' } },
      context(),
    );
    expect(artifactCodec.openWithPassword).toHaveBeenLastCalledWith(
      { compactJwe: artifact.compactJwe, password: 'correct horse battery staple 12345' },
      undefined,
    );
  });

  it('adapts Tau publication and resolution through the injected transport only', async () => {
    const publish = vi.fn(async () => ({ publicationId: 'pub_1' }));
    const resolve = vi.fn(async () => opened);
    const providerContext = context({ tau: { publish, resolve } });
    await expect(tauShareProvider.publish!({ snapshot }, providerContext)).resolves.toMatchObject({
      locator: { providerId: 'tau', reference: 'pub_1' },
      secrets: {},
    });
    await expect(
      tauShareProvider.resolve!({ locator: { providerId: 'tau', reference: 'pub_1' }, secrets: {} }, providerContext),
    ).resolves.toBe(opened);
    expect(publish).toHaveBeenCalledWith({ snapshot, signal: undefined });
    expect(resolve).toHaveBeenCalledWith({ publicationId: 'pub_1', signal: undefined });
  });

  it('fails closed when Tau authority or a direct secret is missing', async () => {
    await expect(tauShareProvider.publish!({ snapshot }, context())).rejects.toMatchObject({
      code: 'SHARE_AUTH_REQUIRED',
    });
    await expect(
      directShareProvider.resolve!({ locator: { providerId: 'direct' }, secrets: {} }, context()),
    ).rejects.toMatchObject({ code: 'SHARE_LOCATOR_INVALID' });
  });
});
