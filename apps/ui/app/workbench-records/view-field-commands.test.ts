/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { workbenchRecords } from '@taucad/workbench';
import type { ViewFieldPath, ViewFieldValues, WorkbenchView } from '@taucad/workbench';
import type { ViewerViewFieldPath, ViewerViewFieldValues } from '@taucad/viewer/cad/viewer-view-fields';
import type { PersonalViewDefaults } from '@taucad/preferences';
import type { CheckedFileWriteResult } from '@taucad/types';
import { editViewFile } from '#workbench-records/view-actions.js';
import { exceptionsForView, viewExceptions, viewExceptionsStore } from '#workbench-records/view-exceptions.js';
import { createViewFieldCommands } from '#workbench-records/view-field-commands.js';
import type { ViewFieldCommandPorts } from '#workbench-records/view-field-commands.js';
import type { SectionWriteResult } from '#preferences/section-store.js';

const encoder = new TextEncoder();
const root = '/projects/p';
const viewId = 'v-abcd1234';
const path = `${root}/.tau/workbench/views/${viewId}.json`;
const view = { viewId, entryPath: 'main.ts' } as const;

let content: Map<string, Uint8Array<ArrayBuffer>>;
let defaults: PersonalViewDefaults;
let conflictNext = false;

const files = {
  exists: async (filePath: string) => content.has(filePath),
  readFile: async (filePath: string) => content.get(filePath)!,
  writeFileChecked: async ({
    path: filePath,
    data,
    preconditions,
  }: {
    path: string;
    data: string;
    preconditions: ReadonlyArray<{ path: string; expected: Uint8Array<ArrayBuffer> | null }>;
  }): Promise<CheckedFileWriteResult> => {
    const current = content.get(filePath) ?? null;
    const expected = preconditions[0]?.expected ?? null;
    const matches =
      current === null || expected === null
        ? current === expected
        : current.length === expected.length && current.every((byte, index) => byte === expected[index]);
    if (conflictNext || !matches) {
      conflictNext = false;
      return { status: 'conflict', conflicts: [{ path: filePath, actual: current }] };
    }
    const bytes = encoder.encode(data);
    content.set(filePath, bytes);
    return { status: 'applied', content: bytes };
  },
  deleteFileChecked: async (): Promise<CheckedFileWriteResult> => ({ status: 'applied', content: new Uint8Array() }),
};

const onError = vi.fn();
let addResult: SectionWriteResult | undefined;
const ports = {
  projectId: 'p',
  edit: async (id: string, change: (current: WorkbenchView | undefined) => WorkbenchView) =>
    editViewFile({ root, viewId: id, files, change, onError }),
  personDefaults: () => defaults,
  exceptionsOf: (projectId: string, id: string) => exceptionsForView(viewExceptionsStore.read(), projectId, id),
  addException: (projectId: string, id: string, leaf: ViewFieldPath): SectionWriteResult =>
    addResult ?? viewExceptions.add(projectId, id, leaf),
  removeException: viewExceptions.remove,
} satisfies ViewFieldCommandPorts;
const commands = createViewFieldCommands(ports);

const record = (): WorkbenchView => {
  const read = workbenchRecords.view.read(content.get(path)!);
  if (read.status !== 'current') {
    throw new Error(read.message);
  }
  return read.record;
};
const exceptions = (): readonly ViewFieldPath[] => exceptionsForView(viewExceptionsStore.read(), 'p', viewId);

beforeEach(() => {
  globalThis.localStorage.clear();
  content = new Map([
    [
      path,
      encoder.encode(
        workbenchRecords.view.serialize(workbenchRecords.view.schema.parse({ version: 1, entryPath: 'main.ts' })),
      ),
    ],
  ]);
  defaults = {};
  conflictNext = false;
  addResult = undefined;
  onError.mockClear();
});

afterEach(() => {
  globalThis.localStorage.clear();
});

describe('view field commands', () => {
  it('sets a value away from the format value with no exception', async () => {
    expect(await commands.setViewField(view, 'display.grid', false)).toBe(true);
    expect(record().display.grid).toBe(false);
    expect(exceptions()).toEqual([]);
  });

  it('adds an exception when a format value is set over a personal default (V7)', async () => {
    defaults = { 'display.grid': false };
    expect(await commands.setViewField(view, 'display.grid', true)).toBe(true);
    expect(record().display.grid).toBe(true);
    expect(exceptions()).toEqual(['display.grid']);
  });

  it('records the exception whatever the flag, because the command never reads it (V15)', async () => {
    // `viewerControls` off: there is no control that sets a default, but one saved earlier is still on the device.
    defaults = { 'display.grid': false };
    await commands.setViewField(view, 'display.grid', true);
    expect(exceptions()).toEqual(['display.grid']);
  });

  it('writes a format value alone with no personal default for the leaf', async () => {
    defaults = { 'display.axes': false };
    await commands.setViewField(view, 'display.grid', true);
    expect(exceptions()).toEqual([]);
  });

  it('removes the exception when a value away from the format value is set', async () => {
    defaults = { 'display.grid': false };
    await commands.setViewField(view, 'display.grid', true);
    await commands.setViewField(view, 'display.grid', false);
    expect(exceptions()).toEqual([]);
    expect(record().display.grid).toBe(false);
  });

  it('never records an up axis exception: it has no personal level', async () => {
    defaults = { 'display.grid': false };
    await commands.setViewField(view, 'upDirection', 'z');
    expect(exceptions()).toEqual([]);
  });

  it('writes the grid unit to the view (V13)', async () => {
    await commands.setViewField(view, 'grid.unit', 'in');
    expect(record().grid.unit).toBe('in');
    expect(record().display).toEqual(workbenchRecords.view.schema.parse({ version: 1, entryPath: null }).display);
  });

  it('resets a leaf to its format value and removes the exception (V7)', async () => {
    defaults = { 'display.grid': false };
    await commands.setViewField(view, 'display.grid', true);
    expect(await commands.resetViewField(view, 'display.grid')).toBe(true);
    expect(record().display.grid).toBe(true);
    expect(exceptions()).toEqual([]);
  });

  it('creates the record for a missing view with the entry it names', async () => {
    content.clear();
    expect(await commands.setViewField(view, 'display.axes', false)).toBe(true);
    expect(record()).toMatchObject({ entryPath: 'main.ts', display: { axes: false } });
  });

  it('passes a refused record through without writing it', async () => {
    content.set(path, encoder.encode('{"version":2}'));
    expect(await commands.setViewField(view, 'display.grid', false)).toBe(false);
    expect(new TextDecoder().decode(content.get(path))).toBe('{"version":2}');
  });

  it('puts the exception back when the record write is refused', async () => {
    defaults = { 'display.grid': false };
    content.set(path, encoder.encode('{"version":2}'));
    expect(await commands.setViewField(view, 'display.grid', true)).toBe(false);
    expect(exceptions()).toEqual([]);
  });

  it('keeps the exception a failed reset would have removed', async () => {
    defaults = { 'display.grid': false };
    await commands.setViewField(view, 'display.grid', true);
    content.set(path, encoder.encode('{"version":2}'));
    expect(await commands.resetViewField(view, 'display.grid')).toBe(false);
    expect(exceptions()).toEqual(['display.grid']);
  });

  it('puts the exception back when the record edit throws', async () => {
    defaults = { 'display.grid': false };
    const throwing = createViewFieldCommands({
      ...ports,
      edit: async () => {
        throw new Error('disk gone');
      },
    });
    await expect(throwing.setViewField(view, 'display.grid', true)).rejects.toThrow('disk gone');
    expect(exceptions()).toEqual([]);
  });

  it('writes nothing and reports failure when the device refuses the exception', async () => {
    defaults = { 'display.grid': false };
    const before = new TextDecoder().decode(content.get(path));
    addResult = 'refused';
    expect(await commands.setViewField(view, 'display.grid', true)).toBe(false);
    expect(new TextDecoder().decode(content.get(path))).toBe(before);
    addResult = 'newer';
    expect(await commands.setViewField(view, 'display.grid', true)).toBe(false);
    expect(new TextDecoder().decode(content.get(path))).toBe(before);
  });

  it('needs no exception write for a value away from the format value, so a newer section never blocks it', async () => {
    defaults = { 'display.grid': false };
    addResult = 'newer';
    expect(await commands.setViewField(view, 'display.grid', false)).toBe(true);
    expect(record().display.grid).toBe(false);
  });

  it('retries a conflicting write against the bytes it re-reads', async () => {
    conflictNext = true;
    expect(await commands.setViewField(view, 'display.lines', false)).toBe(true);
    expect(record().display.lines).toBe(false);
  });
});

describe("the viewer bar's leaf vocabulary", () => {
  it('names the same leaves as the workbench record (BD12)', () => {
    expectTypeOf<ViewerViewFieldPath>().toEqualTypeOf<ViewFieldPath>();
    expectTypeOf<Omit<ViewerViewFieldValues, 'grid.unit'>>().toEqualTypeOf<Omit<ViewFieldValues, 'grid.unit'>>();
    expectTypeOf<ViewFieldValues['grid.unit']>().toExtend<ViewerViewFieldValues['grid.unit']>();
  });
});
