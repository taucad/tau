import { describe, expect, it } from 'vitest';
import type { ChangesetEntry, ChangesetEntryReceipt } from '#changeset.js';
import {
  changeEventEntries,
  changesetReceipt,
  isBoundedChangeset,
  isRefusal,
  maximumChangesetBytes,
  maximumChangesetEntries,
  splitChangeset,
} from '#changeset.js';

const write = (path: string, bytes = 1): ChangesetEntry => ({ op: 'write', path, data: new Uint8Array(bytes) });

describe('isBoundedChangeset', () => {
  it('should admit up to the entry bound and refuse one more', () => {
    const entries = Array.from({ length: maximumChangesetEntries }, (_, index) => write(`f${String(index)}`));

    expect(isBoundedChangeset(entries)).toBe(true);
    expect(isBoundedChangeset([...entries, write('extra')])).toBe(false);
  });

  it('should refuse two entries whose in-hand bytes exceed the byte bound, but admit one alone', () => {
    const large = write('large', maximumChangesetBytes);

    expect(isBoundedChangeset([large])).toBe(true);
    expect(isBoundedChangeset([large, write('small')])).toBe(false);
  });
});

describe('splitChangeset', () => {
  it('should split 1,000 entries into bounded changesets that keep their order', () => {
    const entries = Array.from({ length: 1000 }, (_, index) => write(`f${String(index)}`));

    const parts = splitChangeset(entries);

    expect(parts).toHaveLength(Math.ceil(1000 / maximumChangesetEntries));
    expect(parts.every((part) => isBoundedChangeset(part))).toBe(true);
    expect(parts.flat()).toEqual(entries);
  });

  it('should start a new changeset where the next entry would pass the byte bound', () => {
    const half = maximumChangesetBytes / 2;
    const entries = [write('a', half), write('b', half), write('c', 1)];

    expect(splitChangeset(entries).map((part) => part.map((entry) => (entry as { path: string }).path))).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
  });
});

describe('changeEventEntries', () => {
  it('should expand a change set into its facts and answer a single fact as itself', () => {
    const fact = { type: 'fileWritten', path: 'a', backend: 'memory' } as const;
    const other = { type: 'fileDeleted', path: 'b', backend: 'memory' } as const;

    expect(changeEventEntries(fact)).toEqual([fact]);
    expect(changeEventEntries({ type: 'changeSet', entries: [fact, other] })).toEqual([fact, other]);
  });
});

describe('changesetReceipt', () => {
  it('should count each outcome', () => {
    const entries: ChangesetEntryReceipt[] = [
      { index: 0, outcome: 'applied' },
      { index: 1, outcome: 'failed', error: new Error('no') },
      { index: 2, outcome: 'uncertain', error: new Error('maybe') },
      { index: 3, outcome: 'skipped' },
    ];

    expect(changesetReceipt(entries)).toMatchObject({
      entries,
      applied: 1,
      failed: 1,
      uncertain: 1,
      skipped: 1,
      state: 'partially-applied',
    });
  });

  it('should tell a changeset nothing touched from one that may have changed bytes', () => {
    const failed = new Error('no');

    expect(changesetReceipt([{ index: 0, outcome: 'failed', error: failed }]).state).toBe('known-not-applied');
    expect(changesetReceipt([{ index: 0, outcome: 'uncertain', error: failed }]).state).toBe('potentially-applied');
    expect(changesetReceipt([{ index: 0, outcome: 'applied' }]).state).toBe('applied');
  });
});

describe('isRefusal', () => {
  it('should treat an errno that refuses before any I/O as a refusal and an I/O failure as not', () => {
    expect(isRefusal(Object.assign(new Error('EEXIST'), { code: 'EEXIST' }))).toBe(true);
    expect(isRefusal(Object.assign(new Error('EIO'), { code: 'EIO' }))).toBe(false);
  });
});
