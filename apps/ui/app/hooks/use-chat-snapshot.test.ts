import { describe, expect, it } from 'vitest';
import { workbenchRecords } from '@taucad/workbench';
import type { GeometryComponentManifest } from '@taucad/types';
import { projectViewerSelection, projectWorkbenchSnapshot } from '#hooks/use-chat-snapshot.js';
import type { WorkbenchLayoutSnapshot } from '#routes/w.$workspace.$project/workbench-layout-controller.js';

describe('projectWorkbenchSnapshot', () => {
  it('omits an absent layout and caps arrays while using each group’s default active tab', () => {
    const view = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'model/main.ts' });
    const viewRecords = new Map(Array.from({ length: 20 }, (_, index): [string, typeof view] => [`v-${index}`, view]));
    const entriesRecord = workbenchRecords.entries.schema.parse({
      version: 1,
      entries: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`models/${index}.ts`, {}])),
    });
    expect(
      projectWorkbenchSnapshot({ current: undefined, viewRecords, entriesRecord, isTauDebugEnabled: false }),
    ).toBeUndefined();
    const layout = workbenchRecords.layout.schema.parse({
      version: 1,
      lanes: { chat: false, workbench: false },
      viewer: {
        kind: 'group',
        tabs: [
          { kind: 'view', view: 'first' },
          { kind: 'view', view: 'last' },
        ],
      },
      workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'kernel' }] },
    });
    const refused = Array.from({ length: 20 }, (): WorkbenchLayoutSnapshot['refused'][number] => ({
      tab: { kind: 'pane', pane: 'kernel' },
      reason: 'debug-only',
    }));
    const snapshot = projectWorkbenchSnapshot({
      current: { layout, layoutDigest: 'missing', refused },
      viewRecords,
      entriesRecord,
      isTauDebugEnabled: false,
    });
    expect(snapshot?.visible).toEqual([{ kind: 'view', view: 'last' }]);
    expect(snapshot?.views).toHaveLength(16);
    expect(snapshot?.entries).toHaveLength(16);
    expect(snapshot?.refused).toHaveLength(16);
  });

  it('projects active tabs and bounded portable records with non-debug refusals', () => {
    const view = workbenchRecords.view.schema.parse({
      version: 1,
      name: 'Front review',
      entryPath: 'model/main.ts',
      camera: { kind: 'preset', preset: 'front' },
    });
    const entries = workbenchRecords.entries.schema.parse({
      version: 1,
      entries: { 'model/main.ts': { renderTimeout: 15_000, components: { hidden: ['a', 'b'] } } },
    });
    const layout = workbenchRecords.layout.schema.parse({
      version: 1,
      lanes: { chat: true, workbench: true },
      viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'front' }] },
      workbench: {
        kind: 'group',
        tabs: [
          { kind: 'pane', pane: 'details' },
          { kind: 'pane', pane: 'kernel' },
        ],
        active: 1,
      },
    });
    const refused = [{ tab: { kind: 'pane', pane: 'kernel' }, reason: 'debug-only' }] as const;
    expect(
      projectWorkbenchSnapshot({
        current: { layout, layoutDigest: 'missing', refused },
        viewRecords: new Map([['front', view]]),
        entriesRecord: entries,
        isTauDebugEnabled: false,
      }),
    ).toEqual({
      layoutDigest: 'missing',
      lanes: { chat: true, workbench: true },
      visible: [
        { kind: 'view', view: 'front' },
        { kind: 'pane', pane: 'kernel' },
      ],
      views: [{ id: 'front', name: 'Front review', entryPath: 'model/main.ts', camera: 'front' }],
      entries: [{ path: 'model/main.ts', renderTimeout: 15_000, hidden: 2 }],
      unavailable: ['kernel', 'console'],
      refused,
    });
    expect(
      projectWorkbenchSnapshot({
        current: { layout, layoutDigest: 'missing', refused: [] },
        viewRecords: new Map([['front', view]]),
        entriesRecord: entries,
        isTauDebugEnabled: true,
      })?.unavailable,
    ).toEqual([]);
  });
});

describe('projectViewerSelection', () => {
  const capabilities = {
    canHide: true,
    canIsolate: true,
    canFocus: true,
    canAdjustOpacity: true,
    hasDrawings: false,
    hasPreciseTopology: false,
    exports: [],
  };
  const node = ({ id, name, kind, index }: { id: string; name: string; kind: 'model' | 'part'; index: number }) => ({
    id,
    name,
    kind,
    selector: `node/${index}`,
    childIds: [],
    depth: index,
    path: [id],
    meshNodeIndices: [],
    primitiveIndices: [],
    materialIndices: [],
    capabilities,
  });
  const manifest = (sourceFile: string | undefined): GeometryComponentManifest => ({
    schemaVersion: 1,
    ...(sourceFile === undefined ? {} : { sourceFile }),
    geometryHash: 'hash-1',
    rootId: 'root',
    nodeOrder: ['root', 'component:sun_gear'],
    nodesById: {
      root: node({ id: 'root', name: 'Model', kind: 'model', index: 0 }),
      'component:sun_gear': node({ id: 'component:sun_gear', name: 'Sun gear', kind: 'part', index: 1 }),
    },
    capabilities,
  });
  const unit = (sourceFile: string | undefined, selectedComponentIds: string[]) => ({
    manifest: manifest(sourceFile),
    selectedComponentIds,
    hiddenComponentIds: [],
    isolatedComponentIds: [],
    opacityByComponentId: {},
  });

  it('carries the selected components as structured references, preferring the active entry', () => {
    const context = {
      unitOrder: ['file:a.ts', 'geometry:hash-9', 'file:gears/main.ts'],
      unitsById: {
        'file:a.ts': unit('a.ts', ['component:sun_gear']),
        'geometry:hash-9': unit(undefined, ['component:sun_gear']),
        'file:gears/main.ts': unit('gears/main.ts', ['component:sun_gear', 'component:gone']),
      },
    };
    expect(projectViewerSelection(context, 'gears/main.ts')).toEqual({
      entryPath: 'gears/main.ts',
      selected: [
        {
          resource: { kind: 'workspace-file', path: 'gears/main.ts', revision: 'hash-1' },
          target: {
            kind: 'component',
            componentId: 'component:sun_gear',
            selector: 'node/1',
            label: 'Sun gear',
            componentKind: 'part',
          },
        },
      ],
    });
    expect(projectViewerSelection(context, undefined)?.entryPath).toBe('a.ts');
  });

  it('reports nothing when no source file has a selection', () => {
    expect(
      projectViewerSelection(
        {
          unitOrder: ['file:a.ts', 'geometry:h'],
          unitsById: { 'file:a.ts': unit('a.ts', []), 'geometry:h': unit(undefined, ['component:sun_gear']) },
        },
        'a.ts',
      ),
    ).toBeUndefined();
  });
});
