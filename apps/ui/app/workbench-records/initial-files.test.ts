import { describe, expect, it } from 'vitest';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import { seedInitialWorkbenchFiles } from '#workbench-records/initial-files.js';

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

describe('project creation workbench files', () => {
  it('journals canonical layout and a main-entry view beside supplied project data', () => {
    const files = { 'models/main.ts': { content: bytes('main'), mode: '100644' } } as const;
    const seeded = seedInitialWorkbenchFiles(files, 'models/main.ts');
    expect(seeded['models/main.ts']).toBe(files['models/main.ts']);
    const layoutBytes = seeded[workbenchPaths.layout]?.content;
    expect(layoutBytes).toBeDefined();
    const layout = workbenchRecords.layout.read(layoutBytes!);
    expect(layout.status).toBe('current');
    if (layout.status !== 'current') {
      return;
    }
    expect(layout.record.workbench).toEqual({ kind: 'group', tabs: [] });
    expect(layout.record.viewer).toMatchObject({ kind: 'group', tabs: [{ kind: 'view' }] });
    if (layout.record.viewer.kind !== 'group') {
      return;
    }
    const viewId = layout.record.viewer.tabs[0]!.view;
    const viewBytes = seeded[workbenchPaths.view(viewId)]?.content;
    expect(workbenchRecords.view.read(viewBytes!)).toMatchObject({
      status: 'current',
      record: { entryPath: 'models/main.ts' },
    });
    expect(new TextDecoder().decode(layoutBytes)).toBe(workbenchRecords.layout.serialize(layout.record));
  });

  it('preserves imported or duplicated workbench bytes exactly', () => {
    const existing = {
      [workbenchPaths.layout]: { content: bytes('{"external":true}') },
      [workbenchPaths.view('v-old')]: { content: bytes('{"view":true}') },
    };
    expect(seedInitialWorkbenchFiles(existing, 'main.ts')).toBe(existing);
  });
});
