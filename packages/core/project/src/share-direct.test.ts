import { describe, expect, it } from 'vitest';
import { shareArtifactCodec, shareArtifactLimits } from '@taucad/project-core/share-artifact';
import {
  createDirectShareUrlFromArchive,
  formatDirectShareUrl,
  publishDirectShare,
  resolveDirectShare,
} from '@taucad/project-core/share-direct';
import { isShareError } from '@taucad/project-core/share-error';
import { parseShareUrl } from '@taucad/project-core/share-locator';
import type { ShareProjectSnapshot } from '@taucad/project-core/share-snapshot';

const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
const password = 'correct horse battery staple 12345';
const origin = 'https://tau.new';

const snapshot: ShareProjectSnapshot = {
  entryPath: 'main.ts',
  files: [
    { path: 'main.ts', content: bytes('export default 1;'), sha256: 'main', role: 'entry' },
    { path: 'tau.json', content: bytes('{"name":"Demo"}'), sha256: 'manifest', role: 'project-metadata' },
  ],
  warnings: [],
};

const context = { origin, artifactCodec: shareArtifactCodec };

const parse = (url: string): ReturnType<typeof parseShareUrl> => {
  const { pathname, hash } = new URL(url);
  return parseShareUrl({ slug: pathname.slice('/s/'.length), fragment: hash });
};

const openedPaths = async (url: string): Promise<readonly string[]> => {
  const { locator, secrets } = parse(url);
  const opened = await resolveDirectShare({ locator, secrets }, context);
  return opened.files.map(({ path }) => path);
};

describe('direct share links', () => {
  it('should pack a snapshot into the fragment and open it again', async () => {
    const published = await publishDirectShare({ snapshot }, context);

    expect(published.locator).toEqual({ providerId: 'direct' });
    expect(Object.keys(published.secrets).sort()).toEqual(['v', 'zip']);
    await expect(openedPaths(formatDirectShareUrl({ origin, secrets: published.secrets }))).resolves.toEqual([
      'main.ts',
      'tau.json',
    ]);
  });

  it('should make the same plain link from an archive packed elsewhere', async () => {
    const packed = await shareArtifactCodec.pack(snapshot);
    const published = await publishDirectShare({ snapshot }, context);

    const fromArchive = await createDirectShareUrlFromArchive({ origin, encodedArchive: packed.encodedArchive });

    expect(fromArchive.secrets).toEqual(published.secrets);
    expect(fromArchive.url).toBe(formatDirectShareUrl({ origin, secrets: published.secrets }));
  });

  it('should seal an archive packed elsewhere under the password and carry it when asked', async () => {
    const { encodedArchive } = await shareArtifactCodec.pack(snapshot);

    const withPassword = await createDirectShareUrlFromArchive({
      origin,
      encodedArchive,
      protection: { kind: 'password', password, includePassword: true },
    });
    const separate = await createDirectShareUrlFromArchive({
      origin,
      encodedArchive,
      protection: { kind: 'password', password, includePassword: false },
    });

    expect(Object.keys(withPassword.secrets).sort()).toEqual(['jwe', 'p', 'v']);
    await expect(openedPaths(withPassword.url)).resolves.toEqual(['main.ts', 'tau.json']);
    expect(Object.keys(separate.secrets).sort()).toEqual(['jwe', 'v']);
    await expect(openedPaths(separate.url)).rejects.toMatchObject({ code: 'SHARE_PASSWORD_REQUIRED' });
    const { locator, secrets } = parse(separate.url);
    const opened = await resolveDirectShare({ locator, secrets: { ...secrets, p: password } }, context);
    expect(opened.files.map(({ path }) => path)).toEqual(['main.ts', 'tau.json']);
  });

  it('should refuse a short password and a malformed archive', async () => {
    const { encodedArchive } = await shareArtifactCodec.pack(snapshot);
    await expect(
      createDirectShareUrlFromArchive({
        origin,
        encodedArchive,
        protection: { kind: 'password', password: 'short', includePassword: false },
      }),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });
    await expect(createDirectShareUrlFromArchive({ origin, encodedArchive: '' })).rejects.toMatchObject({
      code: 'SHARE_ARTIFACT_LIMIT',
    });
  });

  it('should refuse a link longer than a URL may be', () => {
    let caught: unknown;
    try {
      formatDirectShareUrl({
        origin,
        secrets: { v: '2', zip: 'a'.repeat(shareArtifactLimits.maxDirectUrlCharacters) },
      });
    } catch (error) {
      caught = error;
    }

    expect(isShareError(caught) && caught.code).toBe('SHARE_ARTIFACT_LIMIT');
  });
});
