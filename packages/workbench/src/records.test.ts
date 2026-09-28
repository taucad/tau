import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  componentDisplaySchema,
  entrySettingsSchema,
  fileTabSchema,
  paneTabSchema,
  pinnedMeasurementSchema,
  projectPathSchema,
  sectionSchema,
  viewCameraSchema,
  viewDisplaySchema,
  viewFieldsSchema,
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

  it('refuses unsafe paths, unknown pane, wrong lane, duplicate tabs and zero look', () => {
    for (const path of ['/a.ts', '../a.ts', 'a//b.ts', 'a/./b.ts', String.raw`a\b.ts`, 'a\0.ts']) {
      expect(projectPathSchema.safeParse(path).success).toBe(false);
    }
    expect(() => workbenchPaths.view('../front')).toThrow();
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
      sectionSchema,
    ]) {
      const json = JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }));
      expect(json).not.toMatch(/"(?:const|\$ref|propertyNames)"/u);
    }
  });
});
