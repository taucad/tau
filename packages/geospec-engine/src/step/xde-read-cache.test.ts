import { afterEach, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore, writeEvidenceBytes } from '#cache/evidence-cache.js';
import { encodeSections } from '#cache/section-codec.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { normalizeStepHeader, readCachedXdeRead, writeCachedXdeRead, xdeReadCacheKey } from '#step/xde-read-cache.js';

afterEach(() => {
  setGeoSpecEvidenceStore(undefined);
});

const key = await xdeReadCacheKey({
  text: 'ISO-10303-21;',
  readerOptionsJson: '{"mesh":true}',
  strategy: 'native-stream',
});

describe('normalizeStepHeader', () => {
  it('should zero the Part 21 FILE_NAME timestamp so a re-export keeps its key', () => {
    const first = "FILE_NAME('part.step','2026-01-01T00:00:00',('a'),('b'),'','','');";
    const second = "FILE_NAME('part.step','2026-08-10T12:34:56',('a'),('b'),'','','');";
    expect(normalizeStepHeader(first)).toBe(normalizeStepHeader(second));
    expect(normalizeStepHeader(first)).toContain("FILE_NAME('part.step','',");
  });

  it('should leave a file with no FILE_NAME entity untouched', () => {
    expect(normalizeStepHeader('ISO-10303-21;\nDATA;\n')).toBe('ISO-10303-21;\nDATA;\n');
  });

  it('should still separate two genuinely different models', async () => {
    const left = await xdeReadCacheKey({ text: 'A', readerOptionsJson: '{}', strategy: 'native-stream' });
    const right = await xdeReadCacheKey({ text: 'B', readerOptionsJson: '{}', strategy: 'native-stream' });
    expect(left.contentHash).not.toBe(right.contentHash);
  });
});

describe('xdeReadCacheKey', () => {
  it('should carry every argument that could change the transferred structure', () => {
    expect(key).toEqual({
      contentHash: expect.stringMatching(/^sha256:[\da-f]{64}$/u) as unknown as string,
      readerOptionsJson: '{"mesh":true}',
      strategy: 'native-stream',
    });
  });
});

describe('xde-read persistence', () => {
  it('should round-trip the reader payload and its triangle soup', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    writeCachedXdeRead(key, { resultJson: '{"occurrences":[]}', positions, triangleCount: 1 });

    const cached = readCachedXdeRead(key);
    expect(cached?.resultJson).toBe('{"occurrences":[]}');
    expect(cached?.triangleCount).toBe(1);
    expect([...cached!.positions!]).toEqual([...positions]);
  });

  it('should round-trip a read that produced no mesh at all', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    writeCachedXdeRead(key, { resultJson: '{}', triangleCount: 0 });

    const cached = readCachedXdeRead(key);
    expect(cached).toEqual({ resultJson: '{}', triangleCount: 0 });
    expect(cached?.positions).toBeUndefined();
  });

  it('should miss when nothing was stored, and when no store exists', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    expect(readCachedXdeRead(key)).toBeUndefined();
    setGeoSpecEvidenceStore(undefined);
    expect(readCachedXdeRead(key)).toBeUndefined();
  });

  it('should reject a frame that is not the two-section shape', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    writeEvidenceBytes('xde-read', key, encodeSections({ meshed: false }, []));
    expect(readCachedXdeRead(key)).toBeUndefined();
  });

  it('should reject bytes that are not a frame at all', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    writeEvidenceBytes('xde-read', key, Uint8Array.from([1, 2, 3]));
    expect(readCachedXdeRead(key)).toBeUndefined();
  });

  it('should default a missing triangle count to zero', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    writeEvidenceBytes(
      'xde-read',
      key,
      encodeSections({ meshed: false }, [new TextEncoder().encode('{}'), new Uint8Array(0)]),
    );
    expect(readCachedXdeRead(key)).toEqual({ resultJson: '{}', triangleCount: 0 });
  });
});
