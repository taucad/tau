import { describe, it, expect } from 'vitest';
import { sortGeometryUnitEntries } from '#routes/projects_.$id/geometry-unit.utils.js';

describe('sortGeometryUnitEntries', () => {
  it('should place mainEntryPath first', () => {
    const entries: Array<[string, number]> = [
      ['b.ts', 2],
      ['main.ts', 1],
      ['a.ts', 3],
    ];
    const sorted = sortGeometryUnitEntries(entries, 'main.ts');
    expect(sorted[0]![0]).toBe('main.ts');
  });

  it('should sort remaining entries alphabetically', () => {
    const entries: Array<[string, number]> = [
      ['c.ts', 3],
      ['main.ts', 1],
      ['a.ts', 2],
    ];
    const sorted = sortGeometryUnitEntries(entries, 'main.ts');
    expect(sorted.map(([k]) => k)).toEqual(['main.ts', 'a.ts', 'c.ts']);
  });

  it('should handle single entry', () => {
    const entries: Array<[string, number]> = [['main.ts', 1]];
    const sorted = sortGeometryUnitEntries(entries, 'main.ts');
    expect(sorted).toEqual([['main.ts', 1]]);
  });

  it('should handle entries where mainEntryPath is not present', () => {
    const entries: Array<[string, number]> = [
      ['b.ts', 2],
      ['a.ts', 1],
    ];
    const sorted = sortGeometryUnitEntries(entries, 'main.ts');
    expect(sorted.map(([k]) => k)).toEqual(['a.ts', 'b.ts']);
  });

  it('should not mutate the original array', () => {
    const entries: Array<[string, number]> = [
      ['b.ts', 2],
      ['main.ts', 1],
    ];
    const original = [...entries];
    sortGeometryUnitEntries(entries, 'main.ts');
    expect(entries).toEqual(original);
  });

  it('should handle empty array', () => {
    const sorted = sortGeometryUnitEntries([], 'main.ts');
    expect(sorted).toEqual([]);
  });
});
