import { describe, it, expect } from 'vitest';
import {
  ManifestError,
  assertGenerationSucceeds,
  assertSameIncarnation,
  decodeManifest,
  encodeManifest,
  isTombstoned,
  manifestFormat,
  succeedManifest,
  tombstoneManifest,
} from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import { retentionWindowMilliseconds } from '#api/git/store/limits.js';

const oid = 'a'.repeat(40);
const tagOid = 'b'.repeat(40);
const peeled = 'c'.repeat(40);

const sample = (overrides: Partial<Manifest> = {}): Manifest => ({
  format: manifestFormat,
  incarnation: 'f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0',
  generation: 3,
  committedAt: '2026-09-18T01:02:03.000Z',
  committedBy: 'user_abc',
  refs: { 'refs/heads/main': { oid }, 'refs/tags/v1': { oid: tagOid, peeled } },
  packs: [{ key: 'packs/pack-1234-aaaa.pack', bytes: 4096, indexStored: false }],
  retired: [{ key: 'packs/pack-0000-bbbb.pack', retiredAt: '2026-09-01T00:00:00.000Z' }],
  encryption: 'none',
  tombstone: null,
  ...overrides,
});

describe('repository manifest codec', () => {
  describe('round trip', () => {
    it('should decode exactly what it encoded', () => {
      const manifest = sample();

      expect(decodeManifest(encodeManifest(manifest))).toStrictEqual(manifest);
    });

    it('should preserve the peeled target of an annotated tag', () => {
      const decoded = decodeManifest(encodeManifest(sample()));

      expect(decoded.refs['refs/tags/v1']).toStrictEqual({ oid: tagOid, peeled });
    });

    it('should preserve live pack byte sizes and retirement timestamps', () => {
      const decoded = decodeManifest(encodeManifest(sample()));

      expect(decoded.packs).toStrictEqual([{ key: 'packs/pack-1234-aaaa.pack', bytes: 4096, indexStored: false }]);
      expect(decoded.retired).toStrictEqual([
        { key: 'packs/pack-0000-bbbb.pack', retiredAt: '2026-09-01T00:00:00.000Z' },
      ]);
    });
  });

  describe('validation', () => {
    it('should refuse an unknown format', () => {
      const bytes = new TextEncoder().encode(JSON.stringify({ ...sample(), format: 2 }));

      expect(() => decodeManifest(bytes)).toThrow(
        expect.objectContaining({ code: 'unsupported-format' }) as unknown as Error,
      );
    });

    it('should refuse bytes that are not JSON', () => {
      expect(() => decodeManifest(new TextEncoder().encode('{'))).toThrow(ManifestError);
    });

    it.each([
      ['a missing incarnation', { incarnation: undefined }],
      ['a fractional generation', { generation: 1.5 }],
      ['a negative generation', { generation: -1 }],
      ['a missing committedBy', { committedBy: undefined }],
      ['a ref outside refs/', { refs: { 'heads/main': { oid } } }],
      ['a ref name containing ..', { refs: { 'refs/heads/../evil': { oid } } }],
      ['an oid that is not hexadecimal', { refs: { 'refs/heads/main': { oid: 'zz' } } }],
      ['a pack key outside packs/', { packs: [{ key: 'manifest.json', bytes: 1, indexStored: false }] }],
      ['a pack key that traverses', { packs: [{ key: 'packs/../manifest.json', bytes: 1, indexStored: false }] }],
      ['a negative pack size', { packs: [{ key: 'packs/pack-a-b.pack', bytes: -1, indexStored: false }] }],
      ['an unknown encryption', { encryption: 'aes' }],
    ])('should refuse %s', (_name, overrides) => {
      const bytes = new TextEncoder().encode(JSON.stringify({ ...sample(), ...overrides }));

      expect(() => decodeManifest(bytes)).toThrow(ManifestError);
    });
  });

  describe('succession', () => {
    it('should give a repository that does not exist yet generation 1 and a fresh incarnation', () => {
      const first = succeedManifest(undefined, { refs: {}, packs: [], retired: [], committedBy: 'user_abc' });

      expect(first.generation).toBe(1);
      expect(first.incarnation).toMatch(/^[\da-f]{32}$/u);
    });

    it('should carry the incarnation forward and increment the generation', () => {
      const base = sample();

      const next = succeedManifest(base, { refs: {}, packs: [], retired: [], committedBy: 'user_abc' });

      expect(next.incarnation).toBe(base.incarnation);
      expect(next.generation).toBe(base.generation + 1);
    });

    it('should adopt an explicit incarnation so a restore rolls forward rather than rewriting', () => {
      const base = sample();

      const restored = succeedManifest(base, {
        refs: {},
        packs: [],
        retired: [],
        committedBy: 'user_abc',
        incarnation: '0'.repeat(32),
      });

      expect(restored.incarnation).toBe('0'.repeat(32));
      expect(restored.generation).toBe(base.generation + 1);
    });

    it('should refuse a generation that does not strictly increase', () => {
      const base = sample();

      expect(() => {
        assertGenerationSucceeds(base, { ...base, generation: base.generation });
      }).toThrow(expect.objectContaining({ code: 'generation-not-monotonic' }) as unknown as Error);
      expect(() => {
        assertGenerationSucceeds(base, { ...base, generation: base.generation - 1 });
      }).toThrow(expect.objectContaining({ code: 'generation-not-monotonic' }) as unknown as Error);
    });
  });

  describe('incarnation nonce (AR-A E7)', () => {
    it('should never produce byte-identical manifests for two incarnations of the same content', () => {
      const first = succeedManifest(undefined, {
        refs: { 'refs/heads/main': { oid } },
        packs: [],
        retired: [],
        committedBy: 'user_abc',
      });
      const second = succeedManifest(undefined, {
        refs: { 'refs/heads/main': { oid } },
        packs: [],
        retired: [],
        committedBy: 'user_abc',
      });

      expect(second.incarnation).not.toBe(first.incarnation);
      expect(encodeManifest({ ...second, committedAt: first.committedAt })).not.toStrictEqual(encodeManifest(first));
    });

    it('should refuse a commit whose base incarnation is not the one that is stored', () => {
      const hydrated = sample();
      const current = sample({ incarnation: '9'.repeat(32) });

      expect(() => {
        assertSameIncarnation(hydrated, current);
      }).toThrow(expect.objectContaining({ code: 'incarnation-changed' }) as unknown as Error);
      expect(() => {
        assertSameIncarnation(hydrated, hydrated);
      }).not.toThrow();
    });
  });

  describe('tombstone', () => {
    it('should carry a purge deadline one retention window after the tombstone', () => {
      const at = new Date('2026-09-18T00:00:00.000Z');

      const tombstoned = tombstoneManifest(sample(), { committedBy: 'user_abc', at });

      expect(tombstoned.tombstone).toStrictEqual({
        tombstonedAt: at.toISOString(),
        purgeAfter: new Date(at.getTime() + retentionWindowMilliseconds).toISOString(),
      });
      expect(isTombstoned(tombstoned)).toBe(true);
    });

    it('should purge immediately when erasure is verified', () => {
      const at = new Date('2026-09-18T00:00:00.000Z');

      const tombstoned = tombstoneManifest(sample(), { committedBy: 'user_abc', at, erasureVerified: true });

      expect(tombstoned.tombstone?.purgeAfter).toBe(at.toISOString());
    });

    it('should keep the pack list so purge knows what to remove', () => {
      const base = sample();

      const tombstoned = tombstoneManifest(base, { committedBy: 'user_abc', at: new Date() });

      expect(tombstoned.packs).toStrictEqual(base.packs);
      expect(tombstoned.generation).toBe(base.generation + 1);
    });

    it('should report a live manifest as not tombstoned', () => {
      expect(isTombstoned(sample())).toBe(false);
    });
  });
});
