import { describe, expect, it } from 'vitest';
import { rankCommandPaletteRows } from '#components/layout/command-palette.js';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';

const item = (id: string, group: string, searchValue?: string): CommandPaletteItem => ({
  id,
  label: id,
  group,
  icon: <span />,
  ...(searchValue === undefined ? {} : { searchValue }),
});

const items = [
  item('action-new', 'Actions'),
  item('project-a', 'Projects', 'Racing Drone carbon quad frame'),
  item('project-b', 'Projects'),
  item('hidden', 'Projects'),
].map((entry) => (entry.id === 'hidden' ? { ...entry, visible: false } : entry));

describe('rankCommandPaletteRows', () => {
  it('keeps registration order with a heading per group when the query is empty', () => {
    expect(rankCommandPaletteRows(items, '').map((row) => row.key)).toEqual([
      'group-Actions',
      'action-new',
      'group-Projects',
      'project-a',
      'project-b',
    ]);
  });

  it('matches on search-only text and drops empty groups and hidden items', () => {
    expect(rankCommandPaletteRows(items, 'carbon').map((row) => row.key)).toEqual(['group-Projects', 'project-a']);
  });

  it('returns no rows when nothing matches', () => {
    expect(rankCommandPaletteRows(items, 'zzzz')).toEqual([]);
  });
});
