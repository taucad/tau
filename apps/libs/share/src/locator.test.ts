import { describe, expect, it } from 'vitest';
import {
  formatSharePath,
  formatShareUrl,
  parseShareSlug,
  parseShareUrl,
  shareReferenceMaxCharacters,
} from '#locator.js';

describe('share locators', () => {
  it('round trips plain and password-protected direct URLs', () => {
    const direct = formatShareUrl({
      origin: 'https://tau.new',
      locator: { providerId: 'direct' },
      secrets: { v: '2', zip: 'encoded-archive' },
    });
    expect(parseShareUrl({ slug: 'direct', fragment: new URL(direct).hash })).toEqual({
      locator: { providerId: 'direct' },
      secrets: { v: '2', zip: 'encoded-archive' },
    });

    expect(parseShareUrl({ slug: 'direct', fragment: '#jwe=a.b.c.d.e&p=passphrase&v=2' })).toEqual({
      locator: { providerId: 'direct' },
      secrets: { v: '2', jwe: 'a.b.c.d.e', p: 'passphrase' },
    });
  });

  it('round trips latest and pinned Gist URLs with optional passwords', () => {
    const reference = `abc123.${'f'.repeat(40)}`;
    const gist = formatShareUrl({
      origin: 'https://tau.new',
      locator: { providerId: 'github-gist', reference },
      secrets: { p: 'password' },
    });
    expect(parseShareUrl({ slug: `github-gist~${reference}`, fragment: new URL(gist).hash })).toEqual({
      locator: { providerId: 'github-gist', reference },
      secrets: { p: 'password' },
    });
    expect(parseShareUrl({ slug: 'github-gist~abc123', fragment: '' })).toEqual({
      locator: { providerId: 'github-gist', reference: 'abc123' },
      secrets: {},
    });
  });

  it('rejects bare references and ambiguous fragments', () => {
    expect(() => parseShareSlug('pub_bare')).toThrow('must identify its provider');
    expect(() => parseShareUrl({ slug: 'direct', fragment: '#v=2&zip=value&extra=x' })).toThrow(
      'unexpected secret fields',
    );
    expect(() => parseShareUrl({ slug: 'tau~pub_1', fragment: '#k=secret' })).toThrow('must not contain secret fields');
    expect(() => parseShareSlug('direct~unexpected')).toThrow('must not contain a route reference');
    expect(() => parseShareSlug(`github~${'a'.repeat(shareReferenceMaxCharacters + 1)}`)).toThrow('malformed');
  });

  it('formats application-relative provider paths', () => {
    expect(formatSharePath({ providerId: 'builtin', reference: 'replicad.birdhouse' })).toBe(
      '/s/builtin~replicad.birdhouse',
    );
  });
});
