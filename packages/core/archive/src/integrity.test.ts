import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { integrityFromHex, integrityMatches, integrityToHex } from '#integrity.js';

const bytes = new TextEncoder().encode('verified bytes');
const digest = (algorithm: string, encoding: 'base64' | 'hex'): string =>
  createHash(algorithm).update(bytes).digest(encoding);
const sri = (algorithm: string): string => `${algorithm}-${digest(algorithm, 'base64')}`;

describe('integrityMatches', () => {
  it.each(['sha256', 'sha384', 'sha512', 'sha1'])('should accept matching %s bytes', async (algorithm) => {
    expect(await integrityMatches(bytes, sri(algorithm))).toBe(true);
  });

  it('should decide by the strongest listed algorithm', async () => {
    const wrongSha512 = `sha512-${createHash('sha512').update('other').digest('base64')}`;

    expect(await integrityMatches(bytes, `${sri('sha256')} ${wrongSha512}`)).toBe(false);
    expect(await integrityMatches(bytes, `${wrongSha512} ${sri('sha512')}`)).toBe(true);
  });

  it.each(['', 'md5-abc', 'sha256:0000', `sha256-${digest('sha256', 'hex')}`])(
    'should never match %j',
    async (integrity) => {
      expect(await integrityMatches(bytes, integrity)).toBe(false);
    },
  );
});

describe('integrityFromHex and integrityToHex', () => {
  it.each(['sha256', 'sha384', 'sha512'] as const)('should transcode a %s hex digest to SRI and back', (algorithm) => {
    const hex = digest(algorithm, 'hex');

    expect(integrityFromHex(algorithm, hex.toUpperCase())).toBe(sri(algorithm));
    expect(integrityToHex(sri(algorithm))).toEqual({ algorithm, hex });
  });

  it('should transcode the python-build-standalone SHA256SUMS digest of the pinned interpreter', () => {
    const hex = 'b9054a9d3d54f4cb5573d44907fddb29874b08909bde73f29f2868cf872223ee';

    expect(integrityFromHex('sha256', hex)).toBe('sha256-uQVKnT1U9MtVc9RJB/3bKYdLCJCb3nPynyhoz4ciI+4=');
    expect(integrityToHex('sha256-uQVKnT1U9MtVc9RJB/3bKYdLCJCb3nPynyhoz4ciI+4=').hex).toBe(hex);
  });

  it.each([
    ['a short digest', () => integrityFromHex('sha256', 'abcd')],
    ['a digest of another algorithm', () => integrityFromHex('sha512', digest('sha256', 'hex'))],
    ['non-hex characters', () => integrityFromHex('sha256', 'z'.repeat(64))],
    ['a colon-separated hex pin', () => integrityToHex(`sha256:${digest('sha256', 'hex')}`)],
    ['unpadded base64', () => integrityToHex(sri('sha256').replace(/=+$/u, ''))],
    ['a sha384 length under a sha256 label', () => integrityToHex(`sha256-${digest('sha384', 'base64')}`)],
    ['sha1', () => integrityToHex(sri('sha1'))],
  ])('should refuse %s', (_label, run) => {
    expect(run).toThrow(TypeError);
  });
});
