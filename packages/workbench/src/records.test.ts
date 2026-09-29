import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assertRootedPath } from '@taucad/runtime/kernel';
import {
  componentDisplaySchema,
  entrySettingsSchema,
  fileTabSchema,
  paneTabSchema,
  pinnedMeasurementSchema,
  projectPathSchema,
  sectionCutSchema,
  sectionSchema,
  viewFieldsSchema,
  viewerTabSchema,
  workbenchLaneTabSchema,
  viewCameraSchema,
  viewDisplaySchema,
  viewGridSchema,
  workbenchLayoutSchema,
  workbenchPaths,
  workbenchRecords,
  workbenchViewSchema,
} from '@taucad/workbench';
import type { WorkbenchRecordCodec } from '@taucad/workbench';

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const view: z.input<typeof workbenchViewSchema> = {
  version: 1,
  entryPath: 'bracket.ts',
  name: 'Corner',
  camera: { kind: 'look', direction: [-0.5, -0.7, 0.5] },
  grid: { unit: 'in' },
  section: { active: true, cuts: [{ kind: 'plane', plane: 'xz', offset: 0.012, isFlipped: false }] },
};
const layout = {
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: {
    kind: 'split',
    direction: 'row',
    children: [
      { kind: 'group', tabs: [{ kind: 'view', view: 'front' }] },
      { kind: 'group', tabs: [{ kind: 'view', view: 'top' }] },
    ],
  },
  workbench: {
    kind: 'group',
    tabs: [
      { kind: 'pane', pane: 'parameters' },
      { kind: 'file', path: 'docs/review.md', presentation: 'preview' },
    ],
    active: 1,
  },
} as const;

describe('approved record grammar', () => {
  it('matches filesystem path ingress for bounded nonempty project paths', () => {
    const paths = [
      'bracket.ts',
      'docs/review.md',
      'a b/é.ts',
      '.tau/workbench/layout.json',
      '',
      '/a.ts',
      '../a.ts',
      'a/../b.ts',
      'a/./b.ts',
      'a//b.ts',
      'a/',
      String.raw`a\b.ts`,
      'C:foo',
      'file:foo',
      'a\nb',
      'a\u007Fb',
      'a\u0080b',
      'a\0b',
    ];
    for (const path of paths) {
      let canonical = false;
      try {
        canonical = path.length > 0 && path.length <= 1024 && assertRootedPath(path) === path;
      } catch {
        /* Refused by filesystem ingress. */
      }
      expect(projectPathSchema.safeParse(path).success, path).toBe(canonical);
    }
  });

  it('accepts every approved records agent sketch', () => {
    const review = layout;
    const examples = [
      [
        workbenchRecords.view.schema,
        { version: 1, entryPath: 'bracket.ts', camera: { kind: 'preset', preset: 'front' }, fieldOfView: 0 },
      ],
      [workbenchRecords.view.schema, view],
      [workbenchRecords.layout.schema, review],
      [
        workbenchRecords.entries.schema,
        {
          version: 1,
          entries: {
            'bracket.ts': {
              renderTimeout: 300_000,
              components: { hidden: ['lid'], opacity: [{ id: 'housing', opacity: 0.4 }] },
            },
          },
        },
      ],
      [
        workbenchRecords.namedLayout.schema,
        {
          version: 1,
          viewer: review.viewer,
          views: [
            { id: 'front', name: 'Front', entryPath: 'bracket.ts', camera: { kind: 'preset', preset: 'front' } },
            { id: 'top', name: 'Top', entryPath: 'bracket.ts', camera: { kind: 'preset', preset: 'top' } },
          ],
        },
      ],
    ] as const;
    for (const [schema, sample] of examples) {
      expect(schema.safeParse(sample).success).toBe(true);
    }
  });

  it('accepts control-tool agent inputs projected to record parts', () => {
    for (const camera of [
      { kind: 'preset', preset: 'isometric' },
      { kind: 'preset', preset: 'front' },
      { kind: 'preset', preset: 'top' },
      { kind: 'look', direction: [-0.5, 0.7, -0.5] },
    ]) {
      expect(viewCameraSchema.safeParse(camera).success).toBe(true);
    }
    for (const tab of [
      { kind: 'view', view: 'iso' },
      { kind: 'view', view: 'front' },
      { kind: 'view', view: 'top' },
    ]) {
      expect(viewerTabSchema.safeParse(tab).success).toBe(true);
    }
    for (const tab of [
      { kind: 'pane', pane: 'parameters' },
      { kind: 'file', path: 'docs/review.md', presentation: 'preview' },
    ]) {
      expect(workbenchLaneTabSchema.safeParse(tab).success).toBe(true);
    }
    expect(
      viewFieldsSchema.safeParse({
        entryPath: 'bracket.ts',
        name: 'Joint',
        camera: { kind: 'look', direction: [-0.5, 0.7, -0.5] },
        section: { active: true, cuts: [{ kind: 'plane', plane: 'xz', offset: 0.012, isFlipped: false }] },
        grid: { unit: 'in' },
        display: { lines: false },
      }).success,
    ).toBe(true);
    expect(
      entrySettingsSchema.safeParse({
        renderTimeout: 300_000,
        components: { hidden: ['lid'], opacity: [{ id: 'housing', opacity: 0.4 }] },
      }).success,
    ).toBe(true);
  });

  it('accepts hand-written, look, layout, entries and file-only shapes', () => {
    expect(workbenchViewSchema.safeParse({ version: 1, entryPath: 'bracket.ts' }).success).toBe(true);
    expect(workbenchViewSchema.safeParse(view).success).toBe(true);
    expect(workbenchLayoutSchema.safeParse(layout).success).toBe(true);
    expect(
      workbenchRecords.entries.schema.safeParse({
        version: 1,
        entries: {
          'bracket.ts': {
            renderTimeout: 300_000,
            components: { hidden: ['lid'], opacity: [{ id: 'housing', opacity: 0.4 }] },
          },
        },
      }).success,
    ).toBe(true);
    expect(
      workbenchRecords.namedLayout.schema.safeParse({
        version: 1,
        viewer: layout.viewer,
        views: [{ id: 'front', entryPath: 'bracket.ts' }],
      }).success,
    ).toBe(true);
    expect(
      workbenchRecords.device.schema.safeParse({
        version: 1,
        laneWidths: { chat: 320, workbench: 400 },
        compactAuxiliary: 'chat',
        mobileTab: 'viewer',
        sections: {},
        fileSidebars: {},
        graphicsBackend: 'webgl',
        panes: {},
      }).success,
    ).toBe(true);
  });

  it('round-trips each kernel view choice without changing the selected id', () => {
    const serialized = workbenchRecords.view.serialize({
      version: 1,
      entryPath: 'board.tsx',
      selectedKernelView: 'schematic',
      kernelViews: [
        {
          id: 'schematic',
          options: { page: 'power', pins: true, scale: 1.5 },
          authoredInstance: 'sheet:power',
          camera: { kind: 'preset', preset: 'front' },
        },
        { id: 'pcb', options: { layers: ['front', 'back'] } },
      ],
    });
    const result = workbenchRecords.view.read(bytes(serialized));
    expect(result.status).toBe('current');
    if (result.status === 'current') {
      expect(result.record.selectedKernelView).toBe('schematic');
      expect(result.record.kernelViews).toEqual([
        {
          id: 'schematic',
          options: { page: 'power', pins: true, scale: 1.5 },
          authoredInstance: 'sheet:power',
          camera: { kind: 'preset', preset: 'front' },
        },
        { id: 'pcb', options: { layers: ['front', 'back'] } },
      ]);
    }
  });

  it('refuses ambiguous duplicate per-view state and non-JSON options', () => {
    expect(
      workbenchViewSchema.safeParse({
        version: 1,
        entryPath: 'board.tsx',
        kernelViews: [{ id: 'pcb' }, { id: 'pcb' }],
      }).success,
    ).toBe(false);
    expect(
      workbenchViewSchema.safeParse({
        version: 1,
        entryPath: 'board.tsx',
        kernelViews: [{ id: 'pcb', options: { invalid: () => undefined } }],
      }).success,
    ).toBe(false);
  });

  it('reads legacy renderTimeout but writes only canonical operationTimeout', () => {
    const legacy = bytes(JSON.stringify({ version: 1, entries: { 'main.ts': { renderTimeout: 15_000 } } }));
    const read = workbenchRecords.entries.read(legacy);
    expect(read.status).toBe('current');
    if (read.status === 'current') {
      expect(read.record.entries['main.ts']).toEqual({ operationTimeout: 15_000 });
      const written = workbenchRecords.entries.serialize(read.record);
      expect(written).toContain('"operationTimeout": 15000');
      expect(written).not.toContain('renderTimeout');
    }
  });

  it('refuses unsafe paths, unknown pane, wrong lane, duplicate tabs and zero look', () => {
    for (const path of ['/a.ts', '../a.ts', 'a//b.ts', 'a/./b.ts', String.raw`a\b.ts`, 'a\0.ts']) {
      expect(projectPathSchema.safeParse(path).success).toBe(false);
    }
    expect(() => workbenchPaths.view('../front')).toThrow();
    expect(workbenchPaths.device('proj_Aa09_Zz')).toBe('/.tau/workbench/proj_Aa09_Zz.json');
    expect(() => workbenchPaths.device('../proj_bad')).toThrow();
    expect(paneTabSchema.safeParse({ kind: 'pane', pane: 'settings' }).success).toBe(false);
    expect(
      workbenchLayoutSchema.safeParse({
        ...layout,
        viewer: { kind: 'group', tabs: [{ kind: 'pane', pane: 'parameters' }] },
      }).success,
    ).toBe(false);
    expect(
      workbenchLayoutSchema.safeParse({
        ...layout,
        viewer: {
          kind: 'group',
          tabs: [
            { kind: 'view', view: 'front' },
            { kind: 'view', view: 'front' },
          ],
        },
      }).success,
    ).toBe(false);
    expect(workbenchLayoutSchema.safeParse({ ...layout, viewer: { kind: 'group', tabs: [], active: 0 } }).success).toBe(
      false,
    );
    expect(viewCameraSchema.safeParse({ kind: 'look', direction: [0, 0, 0] }).success).toBe(false);
    expect(viewCameraSchema.safeParse({ kind: 'preset', preset: 'iso' }).success).toBe(false);
  });

  it('reads and writes canonical bytes idempotently for each record', () => {
    const roundTrip = <Schema extends z.ZodType>(
      codec: WorkbenchRecordCodec<Schema>,
      sample: z.input<Schema>,
    ): void => {
      const canonical = codec.serialize(sample);
      const read = codec.read(bytes(canonical));
      expect(read.status).toBe('current');
      if (read.status === 'current') {
        expect(codec.serialize(read.record as z.input<Schema>)).toBe(canonical);
      }
      expect(canonical).toMatch(/\n$/u);
    };
    roundTrip(workbenchRecords.layout, layout);
    roundTrip(workbenchRecords.view, view);
    roundTrip(workbenchRecords.entries, { version: 1, entries: { 'bracket.ts': { renderTimeout: 0 } } });
    roundTrip(workbenchRecords.namedLayout, { version: 1, views: [] });
    roundTrip(workbenchRecords.device, {
      version: 1,
      laneWidths: { chat: 320, workbench: 400 },
      compactAuxiliary: 'chat',
      mobileTab: 'viewer',
      sections: {},
      fileSidebars: {},
      graphicsBackend: 'webgl',
      panes: {},
    });
  });

  it('preserves invalid, newer and untrusted bytes', () => {
    for (const raw of [
      new Uint8Array(65 * 1024),
      new Uint8Array([0xff]),
      bytes('{'),
      bytes('{"version":1,"entryPath":"a.ts","__proto__":{}}'),
    ]) {
      expect(workbenchRecords.view.read(raw).status).toBe('invalid-preserved');
      expect(workbenchRecords.view.read(raw)).toMatchObject({ code: 'INVALID_RECORD' });
    }
    expect(workbenchRecords.layout.read(bytes('{"version":2}'))).toMatchObject({
      status: 'invalid-preserved',
      code: 'NEWER_RECORD',
      message: 'The layout record was written by a newer Tau. Update Tau to use it.',
    });
    expect(workbenchRecords.view.read(new Uint8Array(65 * 1024))).toMatchObject({
      message: 'The view record is invalid: it exceeds 64 KiB.',
    });
    expect(workbenchRecords.view.read(new Uint8Array([0xff]))).toMatchObject({
      message: 'The view record is invalid: it is not UTF-8 JSON.',
    });
    expect(workbenchRecords.view.read(bytes('{"version":1,"entryPath":"a.ts","__proto__":{}}'))).toMatchObject({
      message: 'The view record is invalid: it contains __proto__.',
    });
    expect(
      workbenchRecords.layout.read(
        bytes(
          JSON.stringify({
            ...layout,
            viewer: {
              kind: 'group',
              tabs: [
                { kind: 'view', view: 'front' },
                { kind: 'view', view: 'front' },
              ],
            },
          }),
        ),
      ),
    ).toMatchObject({
      code: 'INVALID_RECORD',
      message:
        'The layout record is invalid: viewer: viewer names view front twice; a lane shows each view, pane or file once.',
    });
    expect(workbenchRecords.layout.read(bytes(`${'['.repeat(20_000)}0${']'.repeat(20_000)}`))).toMatchObject({
      status: 'invalid-preserved',
      code: 'INVALID_RECORD',
    });
    expect(() =>
      workbenchRecords.entries.serialize({
        version: 1,
        entries: {
          'a.ts': { components: { hidden: Array.from({ length: 1024 }, (_, index) => `${index}-${'x'.repeat(100)}`) } },
        },
      }),
    ).toThrow(RangeError);
    const canonical = workbenchRecords.entries.serialize({
      version: 1,
      entries: { 'z.ts': { components: { hidden: ['b', 'a'] } }, 'a.ts': { renderTimeout: 1 } },
    });
    expect(canonical.indexOf('"a.ts"')).toBeLessThan(canonical.indexOf('"z.ts"'));
    expect(canonical.indexOf('"components"')).toBeLessThan(canonical.indexOf('"version"'));
  });

  it('keeps provider-safe subparts free of schema keywords providers reject', () => {
    for (const schema of [
      fileTabSchema,
      paneTabSchema,
      viewCameraSchema,
      viewDisplaySchema,
      viewGridSchema,
      viewFieldsSchema,
      pinnedMeasurementSchema,
      componentDisplaySchema,
      entrySettingsSchema,
      sectionCutSchema,
      sectionSchema,
    ]) {
      const json = JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }));
      expect(json).not.toMatch(/"(?:const|\$ref|propertyNames)"/u);
    }
  });
});
