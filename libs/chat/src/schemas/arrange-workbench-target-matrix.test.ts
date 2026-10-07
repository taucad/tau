import { describe, expect, it } from 'vitest';
import {
  cameraPresets,
  lengthUnits,
  paneIds,
  workbenchDeviceSchema,
  workbenchEntriesSchema,
  workbenchLayoutSchema,
  workbenchViewSchema,
} from '@taucad/workbench';
import { arrangeWorkbenchInputSchema } from '#schemas/tools/arrange-workbench.tool.schema.js';

const view = (fields: Record<string, unknown> = {}) => ({ version: 1, entryPath: 'bracket.ts', ...fields });
const group = (tabs: ReadonlyArray<Record<string, unknown>> = []) => ({ kind: 'group', tabs });
const layout = (fields: Record<string, unknown> = {}) => ({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: group(),
  workbench: group(),
  ...fields,
});
const patch = (fields: Record<string, unknown>) => ({ views: [{ id: 'front', ...fields }] });
describe('approved workbench Target matrix', () => {
  it('should expose every portable view field in both the record and tool', () => {
    const cases: ReadonlyArray<[string, Record<string, unknown>]> = [
      ['entry', { entryPath: 'bracket.ts' }],
      ['name', { name: 'Front' }],
      ...cameraPresets.map((preset): [string, Record<string, unknown>] => [
        `camera ${preset}`,
        { camera: { kind: 'preset', preset } },
      ]),
      ['look from the front', { camera: { kind: 'look', direction: [0, -1, 0] } }],
      ['look with up', { camera: { kind: 'look', direction: [-1, 1, 1], up: [0, 0, 1] } }],
      ['orthographic', { fieldOfView: 0 }],
      ['field of view', { fieldOfView: 90 }],
      ...(['x', 'y', 'z'] as const).map((axis): [string, Record<string, unknown>] => [
        `up ${axis}`,
        { upDirection: axis },
      ]),
      ...lengthUnits.map((unit): [string, Record<string, unknown>] => [`grid ${unit}`, { grid: { unit } }]),
      [
        'plane cut',
        { section: { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0.012, isFlipped: false }] } },
      ],
      [
        'revolution cut',
        {
          section: {
            active: true,
            cuts: [{ kind: 'revolution', axis: 'z', origin: [0, 0, 0.012], start: 0, sweep: 90 }],
          },
        },
      ],
    ];
    for (const [surface, fields] of cases) {
      expect(workbenchViewSchema.safeParse(view(fields)).success, `${surface} record`).toBe(true);
      expect(arrangeWorkbenchInputSchema.safeParse(patch(fields)).success, `${surface} tool`).toBe(true);
    }
    for (const [name, value] of Object.entries({
      surfaces: false,
      lines: false,
      gizmo: false,
      grid: false,
      axes: false,
      matcap: true,
      postProcessing: true,
    })) {
      expect(workbenchViewSchema.safeParse(view({ display: { [name]: value } })).success, `${name} record`).toBe(true);
      expect(arrangeWorkbenchInputSchema.safeParse(patch({ display: { [name]: value } })).success, `${name} tool`).toBe(
        true,
      );
    }
  });

  it('should keep page-derived pose and measurement fields out of the tool', () => {
    const pose = {
      kind: 'pose',
      frameId: 'tau:root',
      target: [0, 0, 0],
      direction: [0, -1, 0],
      up: [0, 0, 1],
      verticalSpan: 1,
      perspectiveZoom: 1,
    };
    expect(workbenchViewSchema.safeParse(view({ camera: pose })).success).toBe(true);
    expect(arrangeWorkbenchInputSchema.safeParse(patch({ camera: pose })).success).toBe(false);
    const measurement = {
      id: 'edge',
      frameId: 'tau:root',
      startPoint: [0, 0, 0],
      endPoint: [0.012, 0, 0],
      distance: 0.012,
      name: 'Edge',
    };
    expect(workbenchViewSchema.safeParse(view({ measurements: [measurement] })).success).toBe(true);
    expect(
      arrangeWorkbenchInputSchema.safeParse(
        patch({ measurements: [{ id: 'edge', startPoint: [0, 0, 0], endPoint: [0.012, 0, 0], name: 'Edge' }] }),
      ).success,
    ).toBe(true);
    expect(arrangeWorkbenchInputSchema.safeParse(patch({ measurements: [measurement] })).success).toBe(false);
    expect(workbenchViewSchema.safeParse(view({ entryPath: null })).success).toBe(true);
    expect(arrangeWorkbenchInputSchema.safeParse(patch({ entryPath: null })).success).toBe(false);
  });

  it('should cover canonical entry render timeout and component display in records and tool', () => {
    const settings = {
      renderTimeout: 0,
      components: { hidden: ['bolt'], isolated: ['nut'], opacity: [{ id: 'washer', opacity: 0.5 }] },
    };
    expect(workbenchEntriesSchema.safeParse({ version: 1, entries: { 'bracket.ts': settings } }).success).toBe(true);
    expect(arrangeWorkbenchInputSchema.safeParse({ entries: [{ path: 'bracket.ts', ...settings }] }).success).toBe(
      true,
    );
    expect(
      arrangeWorkbenchInputSchema.safeParse({ entries: [{ path: 'bracket.ts', renderTimeout: 600_000 }] }).success,
    ).toBe(true);
    expect(
      arrangeWorkbenchInputSchema.safeParse({ entries: [{ path: 'bracket.ts', renderTimeout: 600_001 }] }).success,
    ).toBe(false);
    expect(
      arrangeWorkbenchInputSchema.safeParse({ entries: [{ path: 'bracket.ts', operationTimeout: 0 }] }).success,
    ).toBe(false);
    expect(
      workbenchEntriesSchema.safeParse({ version: 1, entries: { 'bracket.ts': { operationTimeout: 0 } } }).success,
    ).toBe(false);
  });

  it('should cover viewer views, twelve panes, files, activation, closing, splits and lane intent', () => {
    const viewer = {
      kind: 'split',
      direction: 'row',
      children: [group([{ kind: 'view', view: 'front' }]), group([{ kind: 'view', view: 'side' }])],
    };
    const workbench = {
      kind: 'split',
      direction: 'column',
      children: [
        group([{ kind: 'pane', pane: 'model' }]),
        group([{ kind: 'file', path: 'docs/report.md', presentation: 'preview', filesOpen: true }]),
      ],
    };
    expect(
      workbenchLayoutSchema.safeParse(layout({ viewer, workbench, lanes: { chat: false, workbench: true } })).success,
    ).toBe(true);
    expect(arrangeWorkbenchInputSchema.safeParse({ viewer, workbench, lanes: { chat: false } }).success).toBe(true);
    for (const pane of paneIds) {
      expect(arrangeWorkbenchInputSchema.safeParse({ open: [{ kind: 'pane', pane }] }).success, pane).toBe(true);
    }
    expect(paneIds).toHaveLength(12);
    expect(
      arrangeWorkbenchInputSchema.safeParse({
        open: [
          { kind: 'view', view: 'front' },
          { kind: 'file', path: 'docs/report.md', presentation: 'source', filesOpen: true },
        ],
      }).success,
    ).toBe(true);
    expect(
      arrangeWorkbenchInputSchema.safeParse({
        close: [
          { kind: 'view', view: 'front' },
          { kind: 'pane', pane: 'model' },
        ],
      }).success,
    ).toBe(true);
    expect(arrangeWorkbenchInputSchema.safeParse({ viewer: group([{ kind: 'pane', pane: 'model' }]) }).success).toBe(
      false,
    );
    expect(arrangeWorkbenchInputSchema.safeParse({ workbench: group([{ kind: 'view', view: 'front' }]) }).success).toBe(
      false,
    );
    expect(
      workbenchLayoutSchema.safeParse(
        layout({ viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'front' }], active: 0 } }),
      ).success,
    ).toBe(true);
  });

  it('should keep device and deferred presentation controls out of portable records and tool', () => {
    const excluded = [
      'gridSizeLock',
      'measureMode',
      'selection',
      'focusedPart',
      'hover',
      'kinematicsPose',
      'laneWidths',
      'focusedChatId',
      'mobileTab',
      'compactAuxiliary',
      'activeGroup',
      'filesWidth',
      'floating',
      'maximized',
    ];
    for (const field of excluded) {
      expect(workbenchViewSchema.safeParse(view({ [field]: true })).success, `${field} view`).toBe(false);
      expect(arrangeWorkbenchInputSchema.safeParse({ [field]: true }).success, `${field} tool`).toBe(false);
    }
    expect(workbenchViewSchema.safeParse(view({ grid: { unit: 'mm', sizeLock: true } })).success).toBe(false);
    expect(arrangeWorkbenchInputSchema.safeParse(patch({ grid: { unit: 'mm', sizeLock: true } })).success).toBe(false);
    expect(workbenchLayoutSchema.safeParse(layout({ viewer: { ...group(), floating: true } })).success).toBe(false);
    expect(arrangeWorkbenchInputSchema.safeParse({ viewer: { ...group(), maximized: true } }).success).toBe(false);
    expect(
      workbenchLayoutSchema.safeParse(
        layout({ workbench: group([{ kind: 'file', path: 'docs/report.md', filesWidth: 280 }]) }),
      ).success,
    ).toBe(false);
    expect(
      arrangeWorkbenchInputSchema.safeParse({ open: [{ kind: 'file', path: 'docs/report.md', filesWidth: 280 }] })
        .success,
    ).toBe(false);
    expect(
      workbenchDeviceSchema.safeParse({
        version: 1,
        laneWidths: { chat: 300, workbench: 400 },
        compactAuxiliary: 'chat',
        mobileTab: 'viewer',
        sections: {},
        fileSidebars: {},
        graphicsBackend: 'webgl',
        panes: {},
      }).success,
    ).toBe(true);
    for (const field of ['layouts', 'printApproval', 'physicalStart', 'revisionAction', 'install', 'machineBinding']) {
      expect(arrangeWorkbenchInputSchema.safeParse({ [field]: true }).success, field).toBe(false);
    }
  });
});
