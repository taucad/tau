import { describe, expect, it } from 'vitest';
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { viewTabTitle } from '#workbench-records/projection.js';

describe('workbench view titles', () => {
  it('shows only the file name for views of an entry', () => {
    const base = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'models/main.ts' });
    const records: WorkbenchView[] = [
      { ...base, name: 'Iso' },
      { ...base, name: 'Front', camera: { kind: 'preset', preset: 'front' } },
      { ...base, name: 'Top', camera: { kind: 'preset', preset: 'top' } },
    ];
    expect(records.map((record) => viewTabTitle(record))).toEqual(['main.ts', 'main.ts', 'main.ts']);
    expect(viewTabTitle({ ...base, entryPath: 'models/MainPart.ts' })).toBe('MainPart.ts');
    expect(viewTabTitle({ ...base, entryPath: null, name: 'Custom look' })).toBe('Custom look');
  });
});
