import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeBase64,
  encodeBase64Url,
  fileLinkKeyId,
  fileLinkLocationOfKey,
  fileLinkMessage,
  fileLinkObjectKey,
  fileLinkOrigin,
  fileLinkPath,
  importFileLinkSigningKey,
  importFileLinkVerifyKey,
  parseFileLinkPath,
  parseFileLinkSigningSecret,
  signFileLink,
  verifyFileLink,
} from '#index.js';
import type { FileLinkKey, FileLinkLocation } from '#index.js';
import { fileLinkVectors } from '#vectors.js';

const keyBytes = (generation: number): Uint8Array<ArrayBuffer> => {
  const key = fileLinkVectors.keys.find((entry) => entry.generation === generation);
  const bytes = key === undefined ? undefined : decodeBase64(key.keyBase64);
  if (bytes === undefined) {
    throw new Error(`no vector key ${String(generation)}`);
  }
  return bytes;
};

const secretJson = (generation: number): string => {
  const key = fileLinkVectors.keys.find((entry) => entry.generation === generation);
  return JSON.stringify({ kid: key?.kid, alg: 'HS256', keyBase64: key?.keyBase64 });
};

const signingKey = async (generation: number): Promise<FileLinkKey> =>
  importFileLinkSigningKey(parseFileLinkSigningSecret(secretJson(generation)));

const verifyKeys = async (): Promise<ReadonlyMap<string, CryptoKey>> =>
  new Map(
    await Promise.all(
      fileLinkVectors.keys.map(
        async (key) => [key.kid, await importFileLinkVerifyKey(keyBytes(key.generation))] as const,
      ),
    ),
  );

const [first] = fileLinkVectors.links;
if (first === undefined) {
  throw new Error('no vectors');
}
const now = first.expiresAt - 600;

const verifyUrl = async (
  url: string,
  options: Readonly<{ audience?: string; at?: number; keys?: ReadonlyMap<string, CryptoKey> }> = {},
) => {
  const parsed = new URL(url);
  const keys = options.keys ?? (await verifyKeys());
  return verifyFileLink({
    path: parsed.pathname,
    search: parsed.search,
    audience: options.audience ?? first.audience,
    now: options.at ?? now,
    keyFor: (kid) => keys.get(kid),
  });
};

describe('golden vectors', () => {
  it.each(fileLinkVectors.links.map((link) => [link.name, link] as const))(
    'should match the independent HMAC oracle for %s',
    (_name, link) => {
      const generation = Number(link.kid.split('-')[1]);
      const oracle = createHmac('sha256', keyBytes(generation)).update(link.message, 'utf8').digest('base64url');
      expect(oracle).toBe(link.signature);
      expect(new TextDecoder().decode(fileLinkMessage(link))).toBe(link.message);
    },
  );

  it.each(fileLinkVectors.links.map((link) => [link.name, link] as const))(
    'should sign %s to the exact golden URL',
    async (_name, link) => {
      const href = await signFileLink({
        baseUrl: link.baseUrl,
        location: link.location,
        size: link.size,
        expiresAt: link.expiresAt,
        key: await signingKey(Number(link.kid.split('-')[1])),
      });
      expect(href).toBe(link.url);
      expect(fileLinkPath(link.location)).toBe(link.path);
      expect(fileLinkObjectKey(link.location)).toBe(link.objectKey);
    },
  );

  it.each(fileLinkVectors.links.map((link) => [link.name, link] as const))(
    'should verify %s and return what it names',
    async (_name, link) => {
      const verdict = await verifyUrl(link.url, { audience: link.audience, at: link.expiresAt - 900 });
      expect(verdict).toEqual({
        ok: true,
        link: { location: link.location, size: link.size, expiresAt: link.expiresAt, kid: link.kid },
      });
    },
  );

  it('should derive every vector kid from its key bytes', async () => {
    for (const key of fileLinkVectors.keys) {
      // oxlint-disable-next-line no-await-in-loop -- two keys
      expect(await fileLinkKeyId(key.generation, keyBytes(key.generation))).toBe(key.kid);
    }
  });
});

describe('verifyFileLink refusals', () => {
  const replaceParameter = (url: string, name: string, value: string): string => {
    const parsed = new URL(url);
    const pairs = parsed.search
      .slice(1)
      .split('&')
      .map((pair) => (pair.startsWith(`${name}=`) ? `${name}=${value}` : pair));
    return `${parsed.origin}${parsed.pathname}?${pairs.join('&')}`;
  };

  it('should refuse a link whose size was changed', async () => {
    expect(await verifyUrl(replaceParameter(first.url, 'n', String(first.size + 1)))).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('should refuse a link whose expiry was moved', async () => {
    expect(await verifyUrl(replaceParameter(first.url, 'x', String(first.expiresAt + 1)))).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('should refuse a link presented under another key id it does not hold a signature for', async () => {
    const other = fileLinkVectors.keys[1]?.kid ?? '';
    expect(await verifyUrl(replaceParameter(first.url, 'k', other))).toEqual({ ok: false, reason: 'signature' });
  });

  it('should refuse a link whose path names another object', async () => {
    const tampered = first.url.replace(first.location.oid, 'f'.repeat(64));
    expect(await verifyUrl(tampered)).toEqual({ ok: false, reason: 'signature' });
  });

  it('should refuse a link whose signature was changed', async () => {
    const bytes = decodeBase64(first.signature) ?? new Uint8Array(32);
    bytes[0] = bytes[0] === 0 ? 1 : 0;
    expect(await verifyUrl(replaceParameter(first.url, 's', encodeBase64Url(bytes)))).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('should refuse a staging link on another audience', async () => {
    expect(await verifyUrl(first.url, { audience: 'files.tau.new' })).toEqual({ ok: false, reason: 'signature' });
  });

  it('should refuse a key id the verifier does not hold', async () => {
    expect(await verifyUrl(first.url, { keys: new Map() })).toEqual({ ok: false, reason: 'key' });
  });

  it('should accept up to thirty seconds of skew past expiry, and no more', async () => {
    const edge = await verifyUrl(first.url, { at: first.expiresAt + 30 });
    expect(edge.ok).toBe(true);
    expect(await verifyUrl(first.url, { at: first.expiresAt + 31 })).toEqual({ ok: false, reason: 'expired' });
  });

  it('should refuse a link valid for longer than 960 seconds from now', async () => {
    const longest = await verifyUrl(first.url, { at: first.expiresAt - 960 });
    expect(longest.ok).toBe(true);
    expect(await verifyUrl(first.url, { at: first.expiresAt - 961 })).toEqual({ ok: false, reason: 'expired' });
  });

  it('should check expiry before the key, so an expired link costs no HMAC', async () => {
    expect(await verifyUrl(first.url, { at: first.expiresAt + 3600, keys: new Map() })).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it.each([
    ['an unknown parameter', `${first.url}&z=1`],
    ['a repeated parameter', `${first.url}&n=${String(first.size)}`],
    ['a missing parameter', first.url.replace(/&s=[^&]+/u, '')],
    ['an empty query', first.url.split('?')[0] ?? ''],
    ['a bare parameter', `${first.url}&`],
    ['a percent-escaped value', replaceParameter(first.url, 'n', `%31${String(first.size).slice(1)}`)],
    ['a size with a leading zero', replaceParameter(first.url, 'n', `0${String(first.size)}`)],
    ['a size over 100 MiB', replaceParameter(first.url, 'n', '104857601')],
    ['a negative size', replaceParameter(first.url, 'n', '-1')],
    ['a fractional expiry', replaceParameter(first.url, 'x', `${String(first.expiresAt)}.5`)],
    ['a malformed key id', replaceParameter(first.url, 'k', 'files-0-0123456789abcdef')],
    ['a short signature', replaceParameter(first.url, 's', first.signature.slice(1))],
    ['a padded signature', replaceParameter(first.url, 's', `${first.signature}=`)],
    ['a standard-base64 signature', replaceParameter(first.url, 's', first.signature.replaceAll('-', '+'))],
  ])('should refuse %s as malformed', async (_case, url) => {
    expect(await verifyUrl(url)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('should refuse a non-canonical spelling of a valid signature', async () => {
    const last = first.signature.at(-1) ?? 'A';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const index = alphabet.indexOf(last);
    const sibling = alphabet[index % 2 === 0 ? index + 1 : index - 1] ?? 'A';
    const tampered = replaceParameter(first.url, 's', `${first.signature.slice(0, -1)}${sibling}`);
    expect(decodeBase64(new URL(tampered).searchParams.get('s') ?? '')).toEqual(decodeBase64(first.signature));
    expect(await verifyUrl(tampered)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('should accept the parameters in any order', async () => {
    const parsed = new URL(first.url);
    const reversed = parsed.search.slice(1).split('&').toReversed().join('&');
    const verdict = await verifyUrl(`${parsed.origin}${parsed.pathname}?${reversed}`);
    expect(verdict.ok).toBe(true);
  });
});

describe('paths', () => {
  const oid = 'a'.repeat(64);

  it.each([
    [{ layout: 'tenant', ownerId: 'user_1', projectId: 'proj-1', oid }, '/v1/lfs/user_1/proj-1/' + oid],
    [{ layout: 'legacy', projectId: 'proj_1', oid }, '/v1/lfs-legacy/proj_1/' + oid],
  ] as const)('should round-trip %o through its path and key', (location: FileLinkLocation, path) => {
    expect(fileLinkPath(location)).toBe(path);
    expect(parseFileLinkPath(path)).toEqual(location);
    expect(fileLinkLocationOfKey(fileLinkObjectKey(location))).toEqual(location);
  });

  it.each([
    '/v1/lfs/user_1/proj_1',
    '/v1/lfs/user_1/proj_1/' + oid + '/',
    '/v1/lfs/user_1//' + oid,
    '/v1/lfs/../proj_1/' + oid,
    '/v1/lfs/user%2F1/proj_1/' + oid,
    '/v1/lfs/_user/proj_1/' + oid,
    '/v1/lfs/' + 'u'.repeat(65) + '/proj_1/' + oid,
    '/v1/lfs/user_1/proj_1/' + 'A'.repeat(64),
    '/v1/lfs-legacy/user_1/proj_1/' + oid,
    '/v1/repos/user_1/proj_1/' + oid,
    '/v2/lfs/user_1/proj_1/' + oid,
    'v1/lfs/user_1/proj_1/' + oid,
  ])('should refuse %s', (path) => {
    expect(parseFileLinkPath(path)).toBeUndefined();
  });

  it('should refuse ids the repository locator refuses when building a path', () => {
    expect(() => fileLinkPath({ layout: 'tenant', ownerId: '../x', projectId: 'p', oid })).toThrow(RangeError);
    expect(() => fileLinkObjectKey({ layout: 'legacy', projectId: 'p/q', oid })).toThrow(RangeError);
  });

  it.each([
    'tenants/user_1/repos/proj_1/pack.pack',
    'tenants/user_1/lfs/proj_1/' + oid + '/x',
    'blobs/git-lfs/proj_1/lfs/objects/ab/aa/' + oid,
    'blobs/manifests/proj_1',
    'derivatives/x',
  ])('should map no other bucket key (%s) to a link', (key) => {
    expect(fileLinkLocationOfKey(key)).toBeUndefined();
  });
});

describe('keys and secrets', () => {
  it('should refuse a secret whose kid names other key bytes', async () => {
    const second = fileLinkVectors.keys[1];
    const json = JSON.stringify({ kid: first.kid, alg: 'HS256', keyBase64: second?.keyBase64 });
    await expect(importFileLinkSigningKey(parseFileLinkSigningSecret(json))).rejects.toThrow(
      'kid does not match its key bytes',
    );
  });

  it.each([
    ['not JSON', 'nope', 'not JSON'],
    ['no kid', JSON.stringify({ alg: 'HS256', keyBase64: 'AA==' }), 'no valid kid'],
    ['another alg', JSON.stringify({ kid: first.kid, alg: 'EdDSA', keyBase64: 'AA==' }), 'alg "HS256"'],
    ['a short key', JSON.stringify({ kid: first.kid, alg: 'HS256', keyBase64: 'AAAA' }), 'at least 32'],
  ])('should refuse a secret with %s, without echoing it', (_case, json, message) => {
    try {
      parseFileLinkSigningSecret(json);
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as Error).name).toBe('TypeError');
      expect((error as Error).message).toContain(message);
      expect((error as Error).message).not.toContain('AAAA');
    }
  });

  it('should import the signing key as sign-only and non-extractable', async () => {
    const { key } = await signingKey(1);
    expect(key.usages).toEqual(['sign']);
    expect(key.extractable).toBe(false);
  });

  it('should refuse a base URL that is not a bare origin', () => {
    expect(fileLinkOrigin('https://files.taucad.dev/')).toEqual({
      origin: 'https://files.taucad.dev',
      audience: 'files.taucad.dev',
    });
    for (const url of ['https://files.taucad.dev/x', 'https://u:p@files.taucad.dev', 'ftp://files.taucad.dev']) {
      expect(() => fileLinkOrigin(url)).toThrow(TypeError);
    }
  });

  it('should refuse sizes and expiries a link cannot carry', async () => {
    const key = await signingKey(1);
    const base = { baseUrl: first.baseUrl, location: first.location, key };
    await expect(signFileLink({ ...base, size: 104_857_601, expiresAt: first.expiresAt })).rejects.toThrow(RangeError);
    await expect(signFileLink({ ...base, size: 1, expiresAt: 1.5 })).rejects.toThrow(RangeError);
  });

  it('should refuse a key generation outside 1 to 999999', async () => {
    await expect(fileLinkKeyId(0, keyBytes(1))).rejects.toThrow(RangeError);
  });

  it('should refuse text that is not base64', () => {
    expect(decodeBase64('a*b')).toBeUndefined();
    expect(decodeBase64('abcde')).toBeUndefined();
  });
});
