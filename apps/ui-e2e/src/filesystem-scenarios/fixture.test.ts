import { describe, expect, it } from 'vitest';
/* oxlint-disable no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases. */
import {
  checkoutBytes,
  defaultFixtureSeed,
  fixtureBytes,
  fixtureMarker,
  fixtureProfiles,
  planFixture,
  referenceShape,
} from './fixture.ts';
/* oxlint-enable no-restricted-imports */

const mebibyte = 1024 * 1024;
/** Byte equality without a per-element deep comparison. */
const same = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  Buffer.from(left).equals(Buffer.from(right));

describe('planFixture', () => {
  it('should reproduce the STO-25 shape at full scale', () => {
    const plan = planFixture({ seed: defaultFixtureSeed, scale: fixtureProfiles.full.scale });

    expect(plan.totals).toMatchObject({
      files: 2000,
      textFiles: 1500,
      binaryFiles: 500,
      largeObjects: 5,
      textBytes: referenceShape.textBytes,
      binaryBytes: referenceShape.binaryBytes,
      revisions: 200,
    });
    const large = plan.entries.filter((entry) => entry.size >= 50 * mebibyte - 2 * mebibyte);
    expect(large).toHaveLength(5);
    expect(large.every((entry) => entry.lfs && entry.size <= 102 * mebibyte)).toBe(true);
    expect(new Set(plan.entries.map((entry) => entry.path)).size).toBe(plan.entries.length);
  });

  it('should scale counts and bytes by the profile factor', () => {
    const plan = planFixture({ seed: defaultFixtureSeed, scale: fixtureProfiles.small.scale });

    expect(plan.totals).toMatchObject({ files: 100, textFiles: 75, binaryFiles: 25, largeObjects: 1, revisions: 200 });
    expect(plan.totals.bytes).toBe(
      Math.round(referenceShape.textBytes / 20) + Math.round(referenceShape.binaryBytes / 20),
    );
  });

  it('should plan identically from the same seed and differently from another', () => {
    const first = planFixture({ seed: 7, scale: 0.01 });
    const second = planFixture({ seed: 7, scale: 0.01 });
    const other = planFixture({ seed: 8, scale: 0.01 });

    expect(second).toStrictEqual(first);
    expect(other.entries.map((entry) => entry.path)).not.toStrictEqual(first.entries.map((entry) => entry.path));
  });

  it('should record each revision on exactly the entries it changed', () => {
    const plan = planFixture({ seed: defaultFixtureSeed, scale: 0.05 });
    const byPath = new Map(plan.entries.map((entry) => [entry.path, entry]));

    for (const revision of plan.revisions.slice(1)) {
      expect(revision.changed.length).toBeGreaterThan(0);
      for (const path of revision.changed) {
        expect(byPath.get(path)?.revisions).toContain(revision.index);
      }
    }
  });

  it('should refuse a scale outside (0, 1]', () => {
    expect(() => planFixture({ seed: 1, scale: 0 })).toThrow(RangeError);
    expect(() => planFixture({ seed: 1, scale: 2 })).toThrow(RangeError);
  });
});

describe('fixtureBytes', () => {
  const plan = planFixture({ seed: defaultFixtureSeed, scale: 0.02 });

  it('should generate exactly the planned size, deterministically', () => {
    for (const entry of plan.entries.slice(0, 40)) {
      const bytes = fixtureBytes(entry);
      expect(bytes.byteLength).toBe(entry.size);
      expect(same(fixtureBytes(entry), bytes)).toBe(true);
    }
  });

  it('should generate valid UTF-8 text and carry the grep marker in some text files', () => {
    const texts = plan.entries
      .filter((entry) => entry.kind === 'text')
      .map((entry) => new TextDecoder('utf-8', { fatal: true }).decode(fixtureBytes(entry)));

    expect(texts.some((text) => text.includes(fixtureMarker))).toBe(true);
  });

  it('should change an edited entry between revisions and keep its size', () => {
    const edited = plan.entries.find((entry) => entry.kind === 'text' && entry.revisions.length > 1);
    if (edited === undefined) {
      throw new Error('The plan has no edited text entry.');
    }
    const later = edited.revisions[1] ?? 0;

    expect(same(fixtureBytes(edited, later), fixtureBytes(edited, 0))).toBe(false);
    expect(fixtureBytes(edited, later).byteLength).toBe(edited.size);
    expect(same(fixtureBytes(edited, later - 1), fixtureBytes(edited, 0))).toBe(true);
  });

  it('should write an LFS pointer for a large object before its fill', () => {
    const binary = plan.entries.find((entry) => entry.lfs);
    if (binary === undefined) {
      throw new Error('The plan has no large object.');
    }
    const pointer = new TextDecoder().decode(checkoutBytes(binary));

    expect(pointer).toMatch(/^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:[\da-f]{64}\nsize \d+\n$/u);
  });
});
