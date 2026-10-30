/* eslint-disable @typescript-eslint/naming-convention -- environment variable names are UPPER_CASED */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { decodeBase64, importFileLinkVerifyKey, verifyFileLink } from '@taucad/file-links';
import { fileLinkVectors } from '@taucad/file-links/vectors';
import type { FileLinkVector } from '@taucad/file-links/vectors';
import { FileLinksService } from '#storage/file-links.service.js';
import type { FileLinksEnvironment } from '#storage/file-links.service.js';

const vector = (index: number): FileLinkVector => {
  const link = fileLinkVectors.links[index];
  if (link === undefined) {
    throw new Error('no vector');
  }
  return link;
};

const secret = (generation: number): string => {
  const key = fileLinkVectors.keys.find((entry) => entry.generation === generation);
  return JSON.stringify({ kid: key?.kid, alg: 'HS256', keyBase64: key?.keyBase64 });
};

const service = (values: Partial<FileLinksEnvironment>): FileLinksService =>
  new FileLinksService({
    get: (name: keyof FileLinksEnvironment) => values[name],
  } as unknown as ConfigService<FileLinksEnvironment, true>);

/** The namespace-relative location `GitLfsService` holds for a vector's object. */
const storedLocation = (link: FileLinkVector) =>
  link.objectKey.startsWith('tenants/')
    ? ({ namespace: 'tenants', key: link.objectKey.slice('tenants/'.length), tier: 'private' } as const)
    : ({ namespace: 'blobs', key: link.objectKey.slice('blobs/'.length), tier: 'private' } as const);

describe('FileLinksService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should stay off, and sign nothing, unless both settings are present and not empty', async () => {
    for (const values of [
      {},
      { TAU_FILES_BASE_URL: 'https://files.taucad.dev' },
      { TAU_FILES_LINK_SIGNING_KEY: secret(1) },
      { TAU_FILES_BASE_URL: '', TAU_FILES_LINK_SIGNING_KEY: secret(1) },
      { TAU_FILES_BASE_URL: 'https://files.taucad.dev', TAU_FILES_LINK_SIGNING_KEY: '' },
    ]) {
      const links = service(values);
      expect(links.enabled).toBe(false);
      // oxlint-disable-next-line no-await-in-loop -- five configurations
      await expect(
        links.sign({ ...storedLocation(vector(0)), size: 1, expiresInSeconds: 900 }),
      ).resolves.toBeUndefined();
    }
  });

  it.each([0, 1])(
    'should mint golden vector %i byte for byte (the Worker verifies the same vectors)',
    async (index) => {
      const link = vector(index);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime((link.expiresAt - 900) * 1000);
      const links = service({ TAU_FILES_BASE_URL: link.baseUrl, TAU_FILES_LINK_SIGNING_KEY: secret(1) });
      await links.onModuleInit();
      expect(links.enabled).toBe(true);
      await expect(links.sign({ ...storedLocation(link), size: link.size, expiresInSeconds: 900 })).resolves.toBe(
        link.url,
      );
    },
  );

  it('should mint a link the Worker verifier accepts, expiring in exactly the requested lifetime', async () => {
    const link = vector(0);
    const links = service({ TAU_FILES_BASE_URL: 'https://files.taucad.dev/', TAU_FILES_LINK_SIGNING_KEY: secret(1) });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const href = await links.sign({ ...storedLocation(link), size: 42, expiresInSeconds: 900 });
    const url = new URL(href ?? '');
    const key = await importFileLinkVerifyKey(
      decodeBase64(fileLinkVectors.keys[0]?.keyBase64 ?? '') ?? new Uint8Array(),
    );
    const verdict = await verifyFileLink({
      path: url.pathname,
      search: url.search,
      audience: 'files.taucad.dev',
      now: nowSeconds,
      keyFor: (kid) => (kid === link.kid ? key : undefined),
    });
    expect(verdict).toEqual({
      ok: true,
      link: { location: link.location, size: 42, expiresAt: expect.any(Number) as number, kid: link.kid },
    });
    const expiresAt = verdict.ok ? verdict.link.expiresAt : 0;
    expect(expiresAt - nowSeconds).toBeGreaterThanOrEqual(900);
    expect(expiresAt - nowSeconds).toBeLessThanOrEqual(901);
  });

  it.each([
    ['a repository pack', { namespace: 'tenants', key: 'user_1/repos/proj_1/pack-1.pack', tier: 'private' }],
    ['a publication manifest', { namespace: 'blobs', key: 'manifests/proj_1.json', tier: 'private' }],
    ['the public tier', { namespace: 'tenants', key: `user_1/lfs/proj_1/${'a'.repeat(64)}`, tier: 'public' }],
  ] as const)('should leave %s to a presigned link', async (_case, location) => {
    const links = service({ TAU_FILES_BASE_URL: 'https://files.taucad.dev', TAU_FILES_LINK_SIGNING_KEY: secret(1) });
    await expect(links.sign({ ...location, size: 1, expiresInSeconds: 900 })).resolves.toBeUndefined();
  });

  it('should refuse to boot with a kid that names other key bytes', async () => {
    const mismatched = JSON.stringify({
      kid: fileLinkVectors.keys[0]?.kid,
      alg: 'HS256',
      keyBase64: fileLinkVectors.keys[1]?.keyBase64,
    });
    const links = service({ TAU_FILES_BASE_URL: 'https://files.taucad.dev', TAU_FILES_LINK_SIGNING_KEY: mismatched });
    await expect(links.onModuleInit()).rejects.toThrow('kid does not match its key bytes');
  });
});
