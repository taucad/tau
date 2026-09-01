import { describe, expect, it } from 'vitest';
import { buildReadFingerprint } from '#api/tools/tools/read-file-fingerprint.js';

describe('buildReadFingerprint', () => {
  it('defaults offset to 1 and limit to -1 when omitted', () => {
    expect(buildReadFingerprint({ targetFile: 'src/index.ts' })).toBe('src/index.ts:1:-1');
  });

  it('returns the same fingerprint for identical inputs', () => {
    const a = buildReadFingerprint({ targetFile: 'src/index.ts', offset: 10, limit: 200 });
    const b = buildReadFingerprint({ targetFile: 'src/index.ts', offset: 10, limit: 200 });
    expect(a).toBe(b);
    expect(a).toBe('src/index.ts:10:200');
  });

  it('differentiates by offset and limit', () => {
    expect(buildReadFingerprint({ targetFile: 'a.ts', offset: 10 })).not.toBe(
      buildReadFingerprint({ targetFile: 'a.ts', offset: 20 }),
    );
    expect(buildReadFingerprint({ targetFile: 'a.ts', offset: 10, limit: 200 })).not.toBe(
      buildReadFingerprint({ targetFile: 'a.ts', offset: 10, limit: 400 }),
    );
  });

  it('differentiates by targetFile', () => {
    expect(buildReadFingerprint({ targetFile: 'a.ts' })).not.toBe(buildReadFingerprint({ targetFile: 'b.ts' }));
  });
});
