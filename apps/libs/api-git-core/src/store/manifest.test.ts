import { describe, it, expect } from 'vitest';
import {
  ManifestError,
  assertGenerationSucceeds,
  assertSameIncarnation,
  decodeManifest,
  decodePushLogSegment,
  encodeManifest,
  isTombstoned,
  manifestFormat,
  pushLogByteLimit,
  pushRecordPageLimit,
  pushRecordRefLimit,
  pushRecordsAfter,
  spilledPushLog,
  succeedManifest,
  tombstoneManifest,
} from '#store/manifest.js';
import type { Manifest, PushLogSegment } from '#store/manifest.js';
import { retentionWindowMilliseconds } from '#store/limits.js';

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
  pushes: [
    {
      generation: 3,
      committedAt: '2026-09-18T01:02:03.000Z',
      committedBy: 'user_abc',
      viaDevice: 'hostdev_1',
      refs: [{ ref: 'refs/heads/main', tip: oid }, { ref: 'refs/tags/old' }],
    },
  ],
  earlierPushes: null,
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

    it('should preserve live pack byte sizes and the key of the spilled push log', () => {
      const decoded = decodeManifest(encodeManifest(sample({ earlierPushes: 'pushes/1-80-0011223344556677.json' })));

      expect(decoded.packs).toStrictEqual([{ key: 'packs/pack-1234-aaaa.pack', bytes: 4096, indexStored: false }]);
      expect(decoded.earlierPushes).toBe('pushes/1-80-0011223344556677.json');
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
      ['a missing push log', { pushes: undefined }],
      ['a missing earlierPushes (a manifest from before W13b, I14)', { earlierPushes: undefined }],
      ['an earlierPushes outside pushes/', { earlierPushes: 'packs/pack-a-b.pack' }],
      ['an earlierPushes that traverses', { earlierPushes: 'pushes/../manifest.json' }],
      [
        'a push log past its byte bound',
        {
          pushes: Array.from({ length: Math.ceil(pushLogByteLimit / 100) + 1 }, (_, index) => ({
            generation: index + 1,
            committedAt: '2026-09-18T01:02:03.000Z',
            committedBy: 'user_abc',
            refs: [{ ref: 'refs/heads/main', tip: oid }],
          })),
        },
      ],
      [
        'a push record with no committer',
        { pushes: [{ generation: 1, committedAt: '2026-09-18T01:02:03.000Z', refs: [] }] },
      ],
      [
        'a push record whose tip is not an object id',
        {
          pushes: [
            {
              generation: 1,
              committedAt: '2026-09-18T01:02:03.000Z',
              committedBy: 'user_abc',
              refs: [{ ref: 'refs/heads/main', tip: 'zz' }],
            },
          ],
        },
      ],
      [
        'a push record that marks anonymity with something other than true',
        {
          pushes: [
            {
              generation: 1,
              committedAt: '2026-09-18T01:02:03.000Z',
              committedBy: 'user_abc',
              refs: [],
              anonymous: false,
            },
          ],
        },
      ],
    ])('should refuse %s', (_name, overrides) => {
      const bytes = new TextEncoder().encode(JSON.stringify({ ...sample(), ...overrides }));

      expect(() => decodeManifest(bytes)).toThrow(ManifestError);
    });
  });

  describe('succession', () => {
    it('should give a repository that does not exist yet generation 1 and a fresh incarnation', () => {
      const first = succeedManifest(undefined, { refs: {}, packs: [], committedBy: 'user_abc' });

      expect(first.generation).toBe(1);
      expect(first.incarnation).toMatch(/^[\da-f]{32}$/u);
    });

    it('should carry the incarnation forward and increment the generation', () => {
      const base = sample();

      const next = succeedManifest(base, { refs: {}, packs: [], committedBy: 'user_abc' });

      expect(next.incarnation).toBe(base.incarnation);
      expect(next.generation).toBe(base.generation + 1);
    });

    it('should adopt an explicit incarnation so a restore rolls forward rather than rewriting', () => {
      const base = sample();

      const restored = succeedManifest(base, {
        refs: {},
        packs: [],
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

  /**
   * EQ11 (L6-F12): the server keeps who pushed what, appended, rather than only
   * the latest pusher. Every successor appends through `succeedManifest`, so a
   * removal (D24), a restore and a tombstone are attributed the same way.
   */
  describe('per-push attribution (EQ11)', () => {
    it('should append one record per commit with the tips the commit moved', () => {
      const base = sample();
      const next = succeedManifest(base, {
        refs: { 'refs/heads/main': { oid: peeled }, 'refs/tags/v1': { oid: tagOid, peeled } },
        packs: [],
        committedBy: 'user_collaborator',
      });

      expect(next.pushes.slice(0, -1)).toStrictEqual(base.pushes);
      expect(next.pushes.at(-1)).toStrictEqual({
        generation: base.generation + 1,
        committedAt: next.committedAt,
        committedBy: 'user_collaborator',
        refs: [{ ref: 'refs/heads/main', tip: peeled }],
      });
      /* The earlier pusher is still on record after somebody else pushed. */
      expect(next.pushes[0]?.committedBy).toBe('user_abc');
      expect(decodeManifest(encodeManifest(next))).toStrictEqual(next);
    });

    it('should record a removed ref without a tip, and the device a host pushed through', () => {
      const next = succeedManifest(sample(), {
        refs: { 'refs/heads/main': { oid } },
        packs: [],
        committedBy: 'user_abc',
        viaDevice: 'hostdev_cloud',
      });

      expect(next.pushes.at(-1)).toMatchObject({
        viaDevice: 'hostdev_cloud',
        refs: [{ ref: 'refs/tags/v1' }],
      });
    });

    /* RV-W9 M6: a push that moves thousands of refs, a thousand times over,
       must not grow the manifest every request reads without bound. */
    it('should list at most the per-record ref limit and keep the log within its byte limit', () => {
      const chats = (tip: string): Record<string, { oid: string }> =>
        Object.fromEntries(
          Array.from({ length: 5000 }, (_, index) => [
            `refs/tau/chats/chat_${String(index).padStart(5, '0')}`,
            { oid: tip },
          ]),
        );
      let manifest = sample();
      for (let push = 0; push < 200; push += 1) {
        manifest = succeedManifest(manifest, {
          refs: { ...manifest.refs, ...chats(push % 2 === 0 ? peeled : tagOid) },
          packs: [],
          committedBy: `user_${String(push)}`,
        });
      }

      const latest = manifest.pushes.at(-1);
      expect(latest?.refs).toHaveLength(pushRecordRefLimit);
      expect(latest?.omitted).toBe(5000 - pushRecordRefLimit);
      expect(latest?.committedBy).toBe('user_199');
      expect(JSON.stringify(manifest.pushes).length).toBeLessThanOrEqual(pushLogByteLimit);
      expect(decodeManifest(encodeManifest(manifest))).toStrictEqual(manifest);
    });
  });

  /**
   * W13b: the manifest is read on every request and written on every push, so
   * nothing in it may grow with the push count. The log spills into immutable
   * segments chained from the manifest, and every record stays reachable.
   */
  describe('bounded size (W13b)', () => {
    /** A push the way a Tau device makes one: `main` and one chat ref move. */
    const pushOnce = (base: Manifest, push: number): Manifest =>
      succeedManifest(base, {
        refs: {
          ...base.refs,
          'refs/heads/main': { oid: push % 2 === 0 ? oid : peeled },
          'refs/tau/chats/chat_1': { oid: push % 2 === 0 ? peeled : oid },
        },
        packs: base.packs,
        committedBy: `user_${String(push % 3)}`,
        viaDevice: 'hostdev_1',
      });

    it('should keep the manifest the same size from 100 pushes to 10,000', () => {
      let manifest = sample();
      const bytesAt: number[] = [];
      for (let push = 1; push <= 10_000; push += 1) {
        manifest = pushOnce(manifest, push);
        bytesAt[push] = encodeManifest(manifest).byteLength;
      }

      const largestUpTo = (from: number, to: number): number => Math.max(...bytesAt.slice(from, to + 1));
      // The log has filled and spilled at least once within the first hundred
      // pushes, and the top of that sawtooth never moves again. The only
      // difference allowed is digits: a full log's ~65 records each carry a
      // five-figure generation instead of a two-figure one, and so does the
      // segment key.
      expect(largestUpTo(100, 10_000) - largestUpTo(1, 100)).toBeLessThan(400);
      expect(largestUpTo(100, 10_000)).toBeLessThan(24 * 1024);
      expect(decodeManifest(encodeManifest(manifest))).toStrictEqual(manifest);
    });

    it('should reach every record ever committed through the spilled segments, newest first', () => {
      const segments = new Map<string, PushLogSegment>();
      let manifest = sample();
      for (let push = 1; push <= 1000; push += 1) {
        const next = pushOnce(manifest, push);
        const spilled = spilledPushLog(manifest, next);
        if (spilled !== undefined) {
          segments.set(spilled.key, JSON.parse(new TextDecoder().decode(spilled.bytes)) as PushLogSegment);
        }
        manifest = next;
      }

      const generations = manifest.pushes.map((record) => record.generation);
      for (let key = manifest.earlierPushes; key !== null; ) {
        const segment = segments.get(key);
        expect(segment).toBeDefined();
        generations.unshift(...(segment?.pushes ?? []).map((record) => record.generation));
        key = segment?.previous ?? null;
      }

      expect(segments.size).toBeGreaterThan(1);
      // `sample()` is generation 3 with one record; every successor since is on record once, in order.
      expect(generations).toStrictEqual(Array.from({ length: 1001 }, (_, index) => index + 3));
    });

    it('should name no segment for a successor that did not spill', () => {
      const base = sample();

      expect(spilledPushLog(base, pushOnce(base, 1))).toBeUndefined();
    });
  });

  /**
   * A3: the push-record read pages the whole log, oldest first, across the
   * spilled segments, and an anonymous push says so on its record (Q3).
   */
  describe('push-record read (A3)', () => {
    const pushOnce = (base: Manifest, push: number): Manifest =>
      succeedManifest(base, {
        refs: { ...base.refs, 'refs/heads/main': { oid: push % 2 === 0 ? oid : peeled } },
        packs: base.packs,
        committedBy: `user_${String(push % 3)}`,
      });

    /** 300 pushes over `sample()`, with every spilled segment kept where a reader can fetch it. */
    const spilledHistory = (): { manifest: Manifest; segments: Map<string, Uint8Array<ArrayBuffer>> } => {
      const segments = new Map<string, Uint8Array<ArrayBuffer>>();
      let manifest = sample();
      for (let push = 1; push <= 300; push += 1) {
        const next = pushOnce(manifest, push);
        const spilled = spilledPushLog(manifest, next);
        if (spilled !== undefined) {
          segments.set(spilled.key, spilled.bytes);
        }
        manifest = next;
      }
      return { manifest, segments };
    };

    it('should mark a push that brought an anonymous commit, and only such a push', () => {
      const anonymous = succeedManifest(sample(), {
        refs: { 'refs/heads/main': { oid: peeled } },
        packs: [],
        committedBy: 'user_abc',
        anonymous: true,
      });
      const attributed = succeedManifest(anonymous, {
        refs: { 'refs/heads/main': { oid } },
        packs: [],
        committedBy: 'user_abc',
        anonymous: false,
      });

      expect(anonymous.pushes.at(-1)?.anonymous).toBe(true);
      expect(attributed.pushes.at(-1)).not.toHaveProperty('anonymous');
      expect(decodeManifest(encodeManifest(attributed))).toStrictEqual(attributed);
    });

    it('should decode a stored segment and refuse one that is not', () => {
      const { segments } = spilledHistory();
      const [bytes] = segments.values();

      expect(bytes).toBeDefined();
      expect(decodePushLogSegment(bytes ?? new Uint8Array()).pushes.length).toBeGreaterThan(0);
      expect(() => decodePushLogSegment(new TextEncoder().encode('{"previous":null}'))).toThrow(ManifestError);
      expect(() => decodePushLogSegment(new TextEncoder().encode('['))).toThrow(ManifestError);
    });

    it('should page every record from the start through the segments, oldest first', async () => {
      const { manifest, segments } = spilledHistory();
      const readSegment = async (key: string): Promise<Uint8Array<ArrayBuffer>> => {
        const bytes = segments.get(key);
        if (bytes === undefined) {
          throw new Error(`no segment ${key}`);
        }
        return bytes;
      };

      const generations: number[] = [];
      let after = 0;
      let pages = 0;
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- each page continues from the one before
        const page = await pushRecordsAfter({ manifest, readSegment, after });
        pages += 1;
        generations.push(...page.records.map((record) => record.generation));
        if (page.next === undefined) {
          break;
        }
        expect(page.records).toHaveLength(pushRecordPageLimit);
        after = page.next;
      }

      expect(segments.size).toBeGreaterThan(1);
      expect(pages).toBe(Math.ceil(301 / pushRecordPageLimit));
      expect(generations).toStrictEqual(Array.from({ length: 301 }, (_, index) => index + 3));
    });

    it('should read only the manifest for a page after a recent generation', async () => {
      const { manifest } = spilledHistory();
      const read: string[] = [];

      const page = await pushRecordsAfter({
        manifest,
        readSegment: async (key) => {
          read.push(key);
          throw new Error('not read');
        },
        after: manifest.generation - 2,
      });

      expect(read).toStrictEqual([]);
      expect(page.records.map((record) => record.generation)).toStrictEqual([
        manifest.generation - 1,
        manifest.generation,
      ]);
      expect(page.next).toBeUndefined();
    });

    it('should answer nothing after the newest generation', async () => {
      const { manifest } = spilledHistory();

      await expect(
        pushRecordsAfter({
          manifest,
          readSegment: async () => new Uint8Array(),
          after: manifest.generation,
          limit: 5,
        }),
      ).resolves.toStrictEqual({ records: [] });
    });
  });

  describe('incarnation nonce (AR-A E7)', () => {
    it('should never produce byte-identical manifests for two incarnations of the same content', () => {
      const first = succeedManifest(undefined, {
        refs: { 'refs/heads/main': { oid } },
        packs: [],
        committedBy: 'user_abc',
      });
      const second = succeedManifest(undefined, {
        refs: { 'refs/heads/main': { oid } },
        packs: [],
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
