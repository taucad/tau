import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import { arrangeWorkbenchOutputSchema } from '#schemas/tools/arrange-workbench.tool.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { handleArrangeWorkbench } from '#rpc/handlers/handle-arrange-workbench.js';

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const digest = (text: string): string => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const layout = (viewer?: { kind: 'group'; tabs: Array<{ kind: 'view'; view: string }>; active?: number }) =>
  workbenchRecords.layout.serialize({
    version: 1,
    lanes: { chat: true, workbench: true },
    viewer: viewer ?? { kind: 'group', tabs: [] },
    workbench: { kind: 'group', tabs: [] },
  });
const view = (entryPath = 'main.ts', name?: string) =>
  workbenchRecords.view.serialize({ version: 1, entryPath, ...(name === undefined ? {} : { name }) });

const harness = (initial: Record<string, string> = {}, directories: readonly string[] = []) => {
  const files = new Map(Object.entries(initial));
  const directoryPaths = new Set(directories);
  const writes: string[] = [];
  const applied: string[] = [];
  const outcomes: string[] = [];
  const fs = mock<RpcFileSystem>();
  fs.exists.mockImplementation(async (path) => files.has(path) || directoryPaths.has(path));
  fs.readFile.mockImplementation(async (path) => files.get(path)!);
  fs.stat.mockImplementation(async (path) =>
    directoryPaths.has(path)
      ? { size: 0, isDirectory: true, createdAt: '', modifiedAt: '' }
      : {
          size: bytes(files.get(path) ?? '').byteLength,
          isDirectory: false,
          createdAt: '',
          modifiedAt: '',
          contentKind: 'text',
          lineCount: 1,
        },
  );
  fs.writeFileChecked.mockImplementation(async ({ path, data, preconditions }) => {
    const before = files.get(path);
    if (preconditions[0]?.expected !== (before ?? null)) {
      return { status: 'conflict', conflicts: [{ path, actual: before === undefined ? null : bytes(before) }] };
    }
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    files.set(path, text);
    writes.push(path);
    const status = before === text ? 'unchanged' : 'applied';
    outcomes.push(status);
    if (status === 'applied') {
      applied.push(path);
    }
    return { status, content: bytes(text) };
  });
  fs.deleteFileChecked.mockImplementation(async ({ path, preconditions }) => {
    const before = files.get(path);
    if (preconditions[0]?.expected !== (before ?? null)) {
      return { status: 'conflict', conflicts: [{ path, actual: before === undefined ? null : bytes(before) }] };
    }
    files.delete(path);
    writes.push(path);
    applied.push(path);
    outcomes.push('applied');
    return { status: 'applied', content: bytes('') };
  });
  const workbench = { isModelFile: vi.fn(async (path: string) => path.endsWith('.ts')) };
  return { fs, files, writes, applied, outcomes, workbench };
};

describe('handleArrangeWorkbench', () => {
  it('creates a view, shows it immediately, and reports exact checked revisions', async () => {
    const state = harness({ 'main.ts': 'model' });
    const result = await handleArrangeWorkbench(
      { views: [{ id: 'front', entryPath: 'main.ts', camera: { kind: 'preset', preset: 'front' } }] },
      state.fs,
      state.workbench,
    );

    expect(result).toMatchObject({ success: true, status: 'written', visible: [{ kind: 'view', view: 'front' }] });
    expect(state.writes).toEqual([workbenchPaths.view('front'), workbenchPaths.layout]);
    expect(state.fs.writeFileChecked.mock.calls[0]?.[0].preconditions).toEqual([
      { path: workbenchPaths.view('front'), expected: null },
    ]);
    expect(state.files.get(workbenchPaths.view('front'))).toContain('"preset": "front"');
    expect(state.workbench.isModelFile).toHaveBeenCalledExactlyOnceWith('main.ts');
    if (result.success) {
      expect(result.revisions).toEqual([
        {
          path: workbenchPaths.view('front'),
          digest: digest(state.files.get(workbenchPaths.view('front'))!),
          previousDigest: 'missing',
        },
        {
          path: workbenchPaths.layout,
          digest: digest(state.files.get(workbenchPaths.layout)!),
          previousDigest: 'missing',
        },
      ]);
    }
  });

  it('retains omitted view fields, merges display toggles, and makes repeat calls idempotent', async () => {
    const state = harness({
      'main.ts': 'model',
      [workbenchPaths.layout]: layout({ kind: 'group', tabs: [{ kind: 'view', view: 'front' }] }),
      [workbenchPaths.view('front')]: view('main.ts', 'Front'),
    });
    const input = { views: [{ id: 'front', display: { axes: false } }] };
    const first = await handleArrangeWorkbench(input, state.fs, state.workbench);
    const firstBytes = state.files.get(workbenchPaths.view('front'));
    const appliedAfterFirst = state.applied.length;
    const second = await handleArrangeWorkbench(input, state.fs, state.workbench);

    expect(first).toMatchObject({ success: true, status: 'written' });
    expect(second).toMatchObject({ success: true, status: 'written' });
    expect(state.files.get(workbenchPaths.view('front'))).toBe(firstBytes);
    expect(workbenchRecords.view.read(bytes(firstBytes!))).toMatchObject({
      status: 'current',
      record: { name: 'Front', entryPath: 'main.ts', display: { axes: false, surfaces: true } },
    });
    expect(state.workbench.isModelFile).not.toHaveBeenCalled();
    expect(state.applied).toHaveLength(appliedAfterFirst);
    expect(state.outcomes.slice(2)).toEqual(['unchanged', 'unchanged']);
    if (first.success && second.success) {
      expect(second.revisions.map(({ digest }) => digest)).toEqual(first.revisions.map(({ digest }) => digest));
    }
  });

  it('preserves a person-created blank view while patching its label, display and grid', async () => {
    const blank = workbenchRecords.view.serialize({ version: 1, entryPath: null, name: 'Empty' });
    const state = harness({
      [workbenchPaths.layout]: layout({ kind: 'group', tabs: [{ kind: 'view', view: 'blank' }] }),
      [workbenchPaths.view('blank')]: blank,
    });
    const result = await handleArrangeWorkbench(
      { views: [{ id: 'blank', name: 'Waiting for model', display: { axes: false }, grid: { unit: 'cm' } }] },
      state.fs,
      state.workbench,
    );
    expect(result).toMatchObject({ success: true, visible: [{ kind: 'view', view: 'blank' }] });
    expect(workbenchRecords.view.read(bytes(state.files.get(workbenchPaths.view('blank'))!))).toMatchObject({
      status: 'current',
      record: { entryPath: null, name: 'Waiting for model', display: { axes: false }, grid: { unit: 'cm' } },
    });
    expect(state.workbench.isModelFile).not.toHaveBeenCalled();
  });

  it('still requires a model path for a newly created view', async () => {
    const state = harness();
    const result = await handleArrangeWorkbench({ views: [{ id: 'new', name: 'Front' }] }, state.fs, state.workbench);
    expect(result).toEqual({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      message: 'views[0].entryPath: a new view needs a model file. Nothing was written.',
    });
    expect(state.writes).toEqual([]);
  });

  it('closes a view by checked delete before publishing the layout', async () => {
    const state = harness({
      [workbenchPaths.layout]: layout({ kind: 'group', tabs: [{ kind: 'view', view: 'front' }] }),
      [workbenchPaths.view('front')]: view(),
    });
    const oldView = state.files.get(workbenchPaths.view('front'))!;
    const result = await handleArrangeWorkbench(
      { close: [{ kind: 'view', view: 'front' }] },
      state.fs,
      state.workbench,
    );
    expect(state.writes).toEqual([workbenchPaths.view('front'), workbenchPaths.layout]);
    expect(state.fs.deleteFileChecked).toHaveBeenCalledWith({
      path: workbenchPaths.view('front'),
      preconditions: [{ path: workbenchPaths.view('front'), expected: oldView }],
    });
    expect(state.files.has(workbenchPaths.view('front'))).toBe(false);
    if (result.success) {
      expect(result.revisions[0]).toEqual({
        path: workbenchPaths.view('front'),
        digest: 'missing',
        previousDigest: digest(oldView),
      });
    }
  });

  it('keeps the selected view when closing a tab before its active index', async () => {
    const state = harness({
      [workbenchPaths.layout]: layout({
        kind: 'group',
        tabs: [
          { kind: 'view', view: 'a' },
          { kind: 'view', view: 'b' },
          { kind: 'view', view: 'c' },
        ],
        active: 1,
      }),
      [workbenchPaths.view('a')]: view(),
    });
    const result = await handleArrangeWorkbench({ close: [{ kind: 'view', view: 'a' }] }, state.fs);
    expect(result).toMatchObject({ success: true, visible: [{ kind: 'view', view: 'b' }] });
    expect(workbenchRecords.layout.read(bytes(state.files.get(workbenchPaths.layout)!))).toMatchObject({
      status: 'current',
      record: { viewer: { active: 0 } },
    });
  });

  it('opens an existing file in the first workbench group, updates presentation, and reveals the lane', async () => {
    const base = workbenchRecords.layout.serialize({
      version: 1,
      lanes: { chat: true, workbench: false },
      viewer: { kind: 'group', tabs: [] },
      workbench: {
        kind: 'split',
        direction: 'row',
        children: [
          { kind: 'group', tabs: [{ kind: 'file', path: 'docs/review.md', presentation: 'source' }] },
          { kind: 'group', tabs: [{ kind: 'pane', pane: 'model' }] },
        ],
      },
    });
    const state = harness({ 'docs/review.md': '# Review', [workbenchPaths.layout]: base });
    const result = await handleArrangeWorkbench(
      { open: [{ kind: 'file', path: 'docs/review.md', presentation: 'preview' }] },
      state.fs,
    );
    expect(result).toMatchObject({
      success: true,
      visible: [
        { kind: 'file', path: 'docs/review.md', presentation: 'preview' },
        { kind: 'pane', pane: 'model' },
      ],
    });
    expect(state.writes).toEqual([workbenchPaths.layout]);
    expect(workbenchRecords.layout.read(bytes(state.files.get(workbenchPaths.layout)!))).toMatchObject({
      status: 'current',
      record: { lanes: { workbench: true } },
    });
  });

  it('replaces component lists while preserving other entry settings and writes entries before layout', async () => {
    const oldEntries = workbenchRecords.entries.serialize({
      version: 1,
      entries: { 'main.ts': { renderTimeout: 5000, components: { hidden: ['a'], isolated: ['b'], opacity: [] } } },
    });
    const state = harness({ 'main.ts': 'model', [workbenchPaths.entries]: oldEntries });
    const result = await handleArrangeWorkbench(
      { entries: [{ path: 'main.ts', components: { hidden: ['c'] } }] },
      state.fs,
    );
    expect(result).toMatchObject({ success: true, status: 'written' });
    expect(state.writes).toEqual([workbenchPaths.entries, workbenchPaths.layout]);
    expect(state.fs.writeFileChecked.mock.calls[0]?.[0].preconditions).toEqual([
      { path: workbenchPaths.entries, expected: oldEntries },
    ]);
    expect(workbenchRecords.entries.read(bytes(state.files.get(workbenchPaths.entries)!))).toMatchObject({
      status: 'current',
      record: { entries: { 'main.ts': { renderTimeout: 5000, components: { hidden: ['c'], isolated: ['b'] } } } },
    });
  });

  it('replaces measurements and section cuts while keeping omitted camera and display fields', async () => {
    const state = harness({
      'main.ts': 'model',
      [workbenchPaths.layout]: layout({ kind: 'group', tabs: [{ kind: 'view', view: 'front' }] }),
      [workbenchPaths.view('front')]: workbenchRecords.view.serialize({
        version: 1,
        entryPath: 'main.ts',
        camera: { kind: 'preset', preset: 'front' },
        display: {
          axes: false,
          surfaces: true,
          lines: true,
          gizmo: true,
          grid: true,
          matcap: false,
          postProcessing: false,
        },
        measurements: [{ id: 'old', frameId: 'tau:root', startPoint: [0, 0, 0], endPoint: [1, 0, 0], distance: 1 }],
      }),
    });
    const result = await handleArrangeWorkbench(
      {
        views: [
          {
            id: 'front',
            measurements: [{ id: 'new', startPoint: [0, 0, 0], endPoint: [0.012, 0, 0] }],
            section: { active: true, cuts: [{ kind: 'plane', plane: 'yz', offset: 0.012, isFlipped: false }] },
          },
        ],
      },
      state.fs,
      state.workbench,
    );
    expect(result).toMatchObject({ success: true });
    expect(workbenchRecords.view.read(bytes(state.files.get(workbenchPaths.view('front'))!))).toMatchObject({
      status: 'current',
      record: {
        camera: { kind: 'preset', preset: 'front' },
        display: { axes: false },
        measurements: [{ id: 'new', frameId: 'tau:root', distance: 0.012 }],
        section: { cuts: [{ offset: 0.012 }] },
      },
    });
  });

  it('replacing the viewer tree deletes views omitted from it before the layout write', async () => {
    const state = harness({
      'main.ts': 'model',
      [workbenchPaths.layout]: layout({ kind: 'group', tabs: [{ kind: 'view', view: 'old' }] }),
      [workbenchPaths.view('old')]: view(),
    });
    const result = await handleArrangeWorkbench(
      {
        viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'new' }] },
        views: [{ id: 'new', entryPath: 'main.ts' }],
      },
      state.fs,
      state.workbench,
    );
    expect(result).toMatchObject({ success: true, visible: [{ kind: 'view', view: 'new' }] });
    expect(state.writes).toEqual([workbenchPaths.view('new'), workbenchPaths.view('old'), workbenchPaths.layout]);
    expect(state.files.has(workbenchPaths.view('old'))).toBe(false);
  });

  it('re-opens a newly written view when a later layout conflict forces a rebase', async () => {
    const state = harness({ 'main.ts': 'model' });
    const foreign = workbenchRecords.layout.serialize({
      version: 1,
      lanes: { chat: false, workbench: true },
      viewer: { kind: 'group', tabs: [] },
      workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'model' }] },
    });
    const checkedWrite = state.fs.writeFileChecked.getMockImplementation()!;
    let conflicted = false;
    state.fs.writeFileChecked.mockImplementation(async (input) => {
      if (input.path === workbenchPaths.layout && !conflicted) {
        conflicted = true;
        state.files.set(workbenchPaths.layout, foreign);
        return { status: 'conflict', conflicts: [{ path: workbenchPaths.layout, actual: bytes(foreign) }] };
      }
      return checkedWrite(input);
    });

    const result = await handleArrangeWorkbench(
      { views: [{ id: 'front', entryPath: 'main.ts' }] },
      state.fs,
      state.workbench,
    );

    expect(result).toMatchObject({
      success: true,
      visible: [
        { kind: 'view', view: 'front' },
        { kind: 'pane', pane: 'model' },
      ],
    });
    expect(state.applied).toEqual([workbenchPaths.view('front'), workbenchPaths.layout]);
    expect(state.outcomes).toEqual(['applied', 'unchanged', 'applied']);
    expect(state.fs.writeFileChecked.mock.calls.map(([input]) => input.path)).toEqual([
      workbenchPaths.view('front'),
      workbenchPaths.layout,
      workbenchPaths.view('front'),
      workbenchPaths.layout,
    ]);
    expect(workbenchRecords.layout.read(bytes(state.files.get(workbenchPaths.layout)!))).toMatchObject({
      status: 'current',
      record: {
        lanes: { chat: false },
        viewer: { tabs: [{ kind: 'view', view: 'front' }] },
        workbench: { tabs: [{ kind: 'pane', pane: 'model' }] },
      },
    });
    if (result.success) {
      expect(result.revisions).toEqual([
        {
          path: workbenchPaths.view('front'),
          digest: digest(state.files.get(workbenchPaths.view('front'))!),
          previousDigest: digest(state.files.get(workbenchPaths.view('front'))!),
        },
        {
          path: workbenchPaths.layout,
          digest: digest(state.files.get(workbenchPaths.layout)!),
          previousDigest: digest(foreign),
        },
      ]);
    }
  });

  it('preflights missing files, non-model entry paths and unknown views with no writes', async () => {
    const state = harness({ 'notes.md': 'notes' });
    expect(
      await handleArrangeWorkbench({ entries: [{ path: 'absent.ts', renderTimeout: 20 }] }, state.fs, state.workbench),
    ).toMatchObject({ success: false, errorCode: 'FILE_NOT_FOUND', message: '`absent.ts` does not exist.' });
    expect(
      await handleArrangeWorkbench({ views: [{ id: 'lost', entryPath: 'absent.ts' }] }, state.fs, state.workbench),
    ).toEqual({ success: false, errorCode: 'FILE_NOT_FOUND', message: '`absent.ts` does not exist.' });
    expect(
      await handleArrangeWorkbench({ views: [{ id: 'notes', entryPath: 'notes.md' }] }, state.fs, state.workbench),
    ).toEqual({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      message:
        'views[0].entryPath: `notes.md` is not a model file accepted by the current runtime. Choose a model file. Nothing was written.',
    });
    expect(
      await handleArrangeWorkbench({ open: [{ kind: 'view', view: 'unknown' }] }, state.fs, state.workbench),
    ).toMatchObject({ success: false, errorCode: 'VALIDATION_ERROR' });
    expect(
      await handleArrangeWorkbench(
        { workbench: { kind: 'group', tabs: [{ kind: 'file', path: 'lost.md' }] } },
        state.fs,
      ),
    ).toMatchObject({ success: false, errorCode: 'FILE_NOT_FOUND', message: '`lost.md` does not exist.' });
    expect(state.writes).toEqual([]);
  });

  it('rejects directory paths for a model view, entry setting, and file tab before any write', async () => {
    const state = harness({}, ['main.ts', 'docs/review.md']);
    expect(
      await handleArrangeWorkbench({ views: [{ id: 'front', entryPath: 'main.ts' }] }, state.fs, state.workbench),
    ).toEqual({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      message:
        'views[0].entryPath: `main.ts` is a directory; choose an existing model file accepted by the current runtime. Nothing was written.',
    });
    expect(state.workbench.isModelFile).not.toHaveBeenCalled();
    expect(await handleArrangeWorkbench({ entries: [{ path: 'main.ts', renderTimeout: 1000 }] }, state.fs)).toEqual({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      message: 'entries[0].path: `main.ts` is a directory; choose an existing file. Nothing was written.',
    });
    expect(await handleArrangeWorkbench({ open: [{ kind: 'file', path: 'docs/review.md' }] }, state.fs)).toEqual({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      message: 'open[0].path: `docs/review.md` is a directory; choose an existing file. Nothing was written.',
    });
    expect(
      await handleArrangeWorkbench(
        { workbench: { kind: 'group', tabs: [{ kind: 'file', path: 'docs/review.md' }] } },
        state.fs,
      ),
    ).toMatchObject({ success: false, errorCode: 'VALIDATION_ERROR' });
    expect(state.writes).toEqual([]);
  });

  it('refuses a zero look direction and an unattached runtime before writing a view', async () => {
    const state = harness({ 'main.ts': 'model' });
    const zero = await handleArrangeWorkbench(
      { views: [{ id: 'zero', entryPath: 'main.ts', camera: { kind: 'look', direction: [0, 0, 0] } }] },
      state.fs,
      state.workbench,
    );
    expect(zero).toMatchObject({ success: false, errorCode: 'VALIDATION_ERROR' });
    const unavailable = await handleArrangeWorkbench({ views: [{ id: 'front', entryPath: 'main.ts' }] }, state.fs);
    expect(unavailable).toMatchObject({ success: false, errorCode: 'VALIDATION_ERROR' });
    expect(state.writes).toEqual([]);
  });

  it('refuses a stale basedOn with the current digest before writing', async () => {
    const current = layout();
    const state = harness({ [workbenchPaths.layout]: current });
    const result = await handleArrangeWorkbench(
      { lanes: { chat: false }, basedOn: 'missing' },
      state.fs,
      state.workbench,
    );
    expect(result).toEqual({
      success: false,
      errorCode: 'RECORD_CONFLICT',
      message: `The workbench arrangement changed since the digest you passed as basedOn (now ${digest(current)}). Read this turn's workbench snapshot or .tau/workbench/layout.json and arrange again from it.`,
    });
    expect(state.writes).toEqual([]);
  });

  it('preserves invalid records and refuses contradictory lane intent before any write', async () => {
    const invalidState = harness({ [workbenchPaths.layout]: '{broken' });
    expect(await handleArrangeWorkbench({ lanes: { chat: false } }, invalidState.fs)).toEqual({
      success: false,
      errorCode: 'INVALID_RECORD',
      message: '`.tau/workbench/layout.json` is not valid; the person has been offered Reset.',
    });
    expect(invalidState.writes).toEqual([]);
    const state = harness();
    expect(
      await handleArrangeWorkbench({ open: [{ kind: 'pane', pane: 'model' }], lanes: { workbench: false } }, state.fs),
    ).toMatchObject({ success: false, errorCode: 'VALIDATION_ERROR' });
    expect(state.writes).toEqual([]);
  });

  it('never replaces a newer-version layout, even when complete replacement fields are supplied', async () => {
    const state = harness({ [workbenchPaths.layout]: '{"version":2}' });
    const result = await handleArrangeWorkbench(
      {
        viewer: { kind: 'group', tabs: [] },
        workbench: { kind: 'group', tabs: [] },
        lanes: { chat: true, workbench: true },
      },
      state.fs,
    );
    expect(result).toEqual({
      success: false,
      errorCode: 'INVALID_RECORD',
      message: 'The layout record was written by a newer Tau. Update Tau to use it.',
    });
    expect(state.writes).toEqual([]);
  });

  it('maps a typed malformed UTF-8 record read to INVALID_RECORD without writing', async () => {
    const state = harness({ [workbenchPaths.layout]: 'placeholder' });
    state.fs.readFile.mockRejectedValueOnce(
      Object.assign(new TypeError('invalid UTF-8'), { code: 'INVALID_TEXT_ENCODING' }),
    );
    const result = await handleArrangeWorkbench({ lanes: { chat: false } }, state.fs);
    expect(result).toEqual({
      success: false,
      errorCode: 'INVALID_RECORD',
      message: '`.tau/workbench/layout.json` is not valid; the person has been offered Reset.',
    });
    expect(state.writes).toEqual([]);
  });

  it('re-reads on an unbased checked conflict, but does not retry a based call', async () => {
    const state = harness({ [workbenchPaths.layout]: layout() });
    const foreign = workbenchRecords.layout.serialize({
      version: 1,
      lanes: { chat: false, workbench: true },
      viewer: { kind: 'group', tabs: [] },
      workbench: { kind: 'group', tabs: [] },
    });
    state.fs.writeFileChecked.mockImplementationOnce(async ({ path }) => {
      state.files.set(path, foreign);
      return { status: 'conflict', conflicts: [{ path, actual: bytes(foreign) }] };
    });
    const result = await handleArrangeWorkbench({ lanes: { workbench: false } }, state.fs);
    expect(result).toMatchObject({ success: true });
    expect(state.fs.readFile.mock.calls.filter(([path]) => path === workbenchPaths.layout)).toHaveLength(2);
    expect(state.fs.exists.mock.calls.filter(([path]) => path === workbenchPaths.layout)).toHaveLength(2);
    expect(workbenchRecords.layout.read(bytes(state.files.get(workbenchPaths.layout)!))).toMatchObject({
      status: 'current',
      record: { lanes: { chat: false, workbench: false } },
    });
    const based = harness();
    based.fs.writeFileChecked.mockImplementationOnce(async ({ path }) => ({
      status: 'conflict',
      conflicts: [{ path, actual: null }],
    }));
    expect(await handleArrangeWorkbench({ lanes: { chat: false }, basedOn: 'missing' }, based.fs)).toMatchObject({
      success: false,
      errorCode: 'RECORD_CONFLICT',
    });
    expect(based.fs.writeFileChecked).toHaveBeenCalledTimes(1);
  });

  it('returns the approved three-attempt conflict message after three checked conflicts', async () => {
    const state = harness();
    state.fs.writeFileChecked.mockImplementation(async ({ path }) => ({
      status: 'conflict',
      conflicts: [{ path, actual: null }],
    }));
    const result = await handleArrangeWorkbench({ lanes: { chat: false } }, state.fs);
    expect(result).toEqual({
      success: false,
      errorCode: 'RECORD_CONFLICT',
      message:
        'The workbench records kept changing while they were written (three attempts). Read .tau/workbench/layout.json and arrange again.',
    });
    expect(state.fs.writeFileChecked).toHaveBeenCalledTimes(3);
    expect(state.writes).toEqual([]);
  });

  it('returns all 17 checked revisions for eight explicit closes and eight new views', async () => {
    const existing: Array<{ kind: 'view'; view: string }> = Array.from({ length: 8 }, (_, index) => ({
      kind: 'view',
      view: `old-${index}`,
    }));
    const initial = Object.fromEntries(existing.map(({ view: id }) => [workbenchPaths.view(id), view()]));
    const state = harness({
      ...initial,
      'main.ts': 'model',
      [workbenchPaths.layout]: layout({ kind: 'group', tabs: existing }),
    });
    const input = {
      close: existing,
      views: Array.from({ length: 8 }, (_, index) => ({ id: `new-${index}`, entryPath: 'main.ts' })),
    };
    const beforeLayout = state.files.get(workbenchPaths.layout)!;
    const result = await handleArrangeWorkbench(input, state.fs, state.workbench);
    const newPaths = input.views.map(({ id }) => workbenchPaths.view(id));
    const oldPaths = existing.map(({ view: id }) => workbenchPaths.view(id));
    expect(result).toMatchObject({ success: true, status: 'written' });
    expect(state.writes).toEqual([...newPaths, ...oldPaths, workbenchPaths.layout]);
    expect(state.applied).toEqual(state.writes);
    expect(state.files.get(workbenchPaths.layout)).not.toBe(beforeLayout);
    expect(oldPaths.every((path) => !state.files.has(path))).toBe(true);
    if (result.success) {
      expect(
        arrangeWorkbenchOutputSchema.safeParse({
          status: result.status,
          revisions: result.revisions,
          visible: result.visible,
        }).success,
      ).toBe(true);
      expect(result.revisions).toEqual([
        ...newPaths.map((path) => ({ path, digest: digest(state.files.get(path)!), previousDigest: 'missing' })),
        ...oldPaths.map((path) => ({ path, digest: 'missing', previousDigest: digest(initial[path]!) })),
        {
          path: workbenchPaths.layout,
          digest: digest(state.files.get(workbenchPaths.layout)!),
          previousDigest: digest(beforeLayout),
        },
      ]);
    }

    const afterFirst = new Map(state.files);
    const second = await handleArrangeWorkbench(input, state.fs, state.workbench);
    expect(second).toMatchObject({ success: true, status: 'written' });
    expect(state.files).toEqual(afterFirst);
    expect(state.writes.slice(17)).toEqual([...newPaths, workbenchPaths.layout]);
    expect(state.outcomes.slice(17)).toEqual(Array.from({ length: 9 }, () => 'unchanged'));
    if (second.success) {
      expect(second.revisions).toEqual([
        ...newPaths.map((path) => ({
          path,
          digest: digest(state.files.get(path)!),
          previousDigest: digest(state.files.get(path)!),
        })),
        {
          path: workbenchPaths.layout,
          digest: digest(state.files.get(workbenchPaths.layout)!),
          previousDigest: digest(state.files.get(workbenchPaths.layout)!),
        },
      ]);
      expect(
        arrangeWorkbenchOutputSchema.safeParse({
          status: second.status,
          revisions: second.revisions,
          visible: second.visible,
        }).success,
      ).toBe(true);
    }
  });

  it('returns every implicit deletion when a replacement viewer tree omits eleven old views', async () => {
    const existing: Array<{ kind: 'view'; view: string }> = Array.from({ length: 11 }, (_, index) => ({
      kind: 'view',
      view: `old-${index}`,
    }));
    const initial = Object.fromEntries(existing.map(({ view: id }) => [workbenchPaths.view(id), view()]));
    const beforeLayout = layout({ kind: 'group', tabs: existing });
    const state = harness({ ...initial, [workbenchPaths.layout]: beforeLayout });
    const result = await handleArrangeWorkbench({ viewer: { kind: 'group', tabs: [] } }, state.fs);
    const oldPaths = existing.map(({ view: id }) => workbenchPaths.view(id));
    expect(result).toMatchObject({ success: true, status: 'written', visible: [] });
    expect(state.writes).toEqual([...oldPaths, workbenchPaths.layout]);
    expect(oldPaths.every((path) => !state.files.has(path))).toBe(true);
    if (result.success) {
      expect(result.revisions).toEqual([
        ...oldPaths.map((path) => ({ path, digest: 'missing', previousDigest: digest(initial[path]!) })),
        {
          path: workbenchPaths.layout,
          digest: digest(state.files.get(workbenchPaths.layout)!),
          previousDigest: digest(beforeLayout),
        },
      ]);
      expect(
        arrangeWorkbenchOutputSchema.safeParse({
          status: result.status,
          revisions: result.revisions,
          visible: result.visible,
        }).success,
      ).toBe(true);
    }
  });

  it('requires a nonempty list of well-formed output revisions', () => {
    const output = { status: 'written', revisions: [], visible: [] };
    expect(arrangeWorkbenchOutputSchema.safeParse(output).success).toBe(false);
    expect(
      arrangeWorkbenchOutputSchema.safeParse({
        ...output,
        revisions: [{ path: workbenchPaths.layout, digest: 'broken', previousDigest: 'missing' }],
      }).success,
    ).toBe(false);
  });
});
