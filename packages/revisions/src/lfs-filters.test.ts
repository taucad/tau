import { describe, expect, it } from 'vitest';
import { largeObjectFilterKeys, missingLargeObjectFilters } from '#lfs-filters.js';

const installed = [...largeObjectFilterKeys].map(([key, value]) => `${key} ${value}`).join('\n');

describe('missingLargeObjectFilters', () => {
  it('should find nothing to write in a store git-lfs configured, in any order', () => {
    expect(missingLargeObjectFilters(`${installed}\n`)).toStrictEqual([]);
    expect(missingLargeObjectFilters(installed.split('\n').toReversed().join('\r\n'))).toStrictEqual([]);
  });

  it('should name every key for a store with none of them', () => {
    expect(missingLargeObjectFilters('')).toStrictEqual([...largeObjectFilterKeys]);
  });

  it('should name only the keys a store lost', () => {
    expect(missingLargeObjectFilters('lfs.repositoryformatversion 0\n')).toStrictEqual(
      [...largeObjectFilterKeys].filter(([key]) => key !== 'lfs.repositoryformatversion'),
    );
  });

  it.each([
    ['a changed value', installed.replace('filter.lfs.required true', 'filter.lfs.required false')],
    ['a key twice', `${installed}\nfilter.lfs.process git-lfs filter-process`],
    ['a filter key git-lfs does not write', `${installed}\nfilter.lfs.extra yes`],
    ['a key with no value', installed.replace('filter.lfs.required true', 'filter.lfs.required')],
  ])('should leave %s to git-lfs', (_name, listing) => {
    expect(missingLargeObjectFilters(listing)).toBeUndefined();
  });
});
