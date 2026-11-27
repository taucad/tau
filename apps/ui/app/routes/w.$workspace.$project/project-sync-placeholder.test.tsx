import { describe, expect, it } from 'vitest';
import type { LargeObjectsFacet } from '@taucad/revisions';
import { largeObjectsProgressText } from '#routes/w.$workspace.$project/project-sync-placeholder.js';

const facet = (changes: Partial<LargeObjectsFacet> = {}): LargeObjectsFacet => ({
  phase: 'fetching',
  paths: ['models/a.step'],
  objects: 12,
  totalObjects: 295,
  bytes: 3.1 * 1024 * 1024,
  totalBytes: 70 * 1024 * 1024,
  ...changes,
});

/* The viewer's detail line: a download's numbers only, never a sentence (Progressive Loading Policy rule 18). */
describe('largeObjectsProgressText', () => {
  it('says how far the download is in files and bytes', () => {
    expect(largeObjectsProgressText(facet())).toBe('12 of 295 files, 3.1 MB of 70.0 MB');
    expect(largeObjectsProgressText(facet({ objects: 0, totalObjects: 1, bytes: 0, totalBytes: 2048 }))).toBe(
      '0 of 1 file, 0 B of 2.0 KB',
    );
  });
});
