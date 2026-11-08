import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { EditorSaveConflictError } from '@taucad/fs-client/file-content-service';
import type {
  ContentChangeEvent,
  FileContentService,
  FileContentResult,
  OutcomeChangeEvent,
} from '@taucad/fs-client/file-content-service';
import type { EditorConflictOutcome } from '@taucad/revisions/revision-effects';
import {
  EditorDocumentSession,
  editorSaveDebounceMilliseconds,
  isRecordingEditorConflict,
  maxDeclarations,
} from '#lib/editor-document-session.js';

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const outcome = (text: string): FileContentResult => ({ kind: 'text', content: bytes(text) });

function service(initial: string): {
  content: FileContentService;
  contentChange: (event: ContentChangeEvent) => void;
  outcomeChange: (event: OutcomeChangeEvent) => void;
} {
  const content = mock<FileContentService>();
  content.addEditorSaveFlusher.mockReturnValue(() => undefined);
  let contentChange = (_event: ContentChangeEvent): void => undefined;
  let outcomeChange = (_event: OutcomeChangeEvent): void => undefined;
  content.resolve.mockResolvedValue(outcome(initial));
  content.peekOutcome.mockReturnValue(outcome(initial));
  content.onDidContentChange.mockImplementation((listener) => {
    contentChange = listener;
    return () => undefined;
  });
  content.onDidChangeOutcome.mockImplementation((listener) => {
    outcomeChange = listener;
    return () => undefined;
  });
  content.saveEditor.mockResolvedValue(undefined);
  return {
    content,
    contentChange: (event) => {
      contentChange(event);
    },
    outcomeChange: (event) => {
      outcomeChange(event);
    },
  };
}

describe('EditorDocumentSession', () => {
  it('loads once, shares a document across holds, and saves through checked content authority', async () => {
    const { content } = service('one');
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const left = await session.acquire('main.ts');
    const right = await session.acquire('main.ts');
    expect(right).toBe(left);
    expect(content.resolve).toHaveBeenCalledTimes(1);
    expect(
      session.apply('main.ts', {
        expectedVersion: 1,
        origin: 'view',
        viewId: 'left',
        changes: [{ from: 3, to: 3, insert: ' two' }],
      })?.version,
    ).toBe(2);
    await session.save('main.ts');
    expect(content.saveEditor).toHaveBeenCalledWith('main.ts', bytes('one two'), bytes('one'));
    session.release('main.ts');
    session.release('main.ts');
    session.dispose();
  });

  it('retains document and undo identity across rename and redirects a later save', async () => {
    const { content, contentChange } = service('one');
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const document = await session.acquire('old.ts');
    session.apply('old.ts', { expectedVersion: 1, origin: 'view', changes: [{ from: 3, to: 3, insert: ' two' }] });
    contentChange({ type: 'renamed', oldPath: 'old.ts', newPath: 'new.ts' });
    expect(session.get('new.ts')).toBe(document);
    expect(document?.undo()?.path).toBe('new.ts');
    await session.save('new.ts');
    expect(content.saveEditor).toHaveBeenCalledWith('new.ts', bytes('one'), bytes('one'));
    session.dispose();
  });

  it('refuses a late project load and never creates a document in the new session', async () => {
    const { content } = service('one');
    const deferred = Promise.withResolvers<FileContentResult>();
    vi.mocked(content.resolve).mockReturnValueOnce(deferred.promise);
    const session = new EditorDocumentSession({ contentService: content, projectId: 'old' });
    const loading = session.acquire('main.ts');
    session.setProjectSession('new');
    deferred.resolve(outcome('old data'));
    expect(await loading).toBeUndefined();
    expect(session.get('main.ts')).toBeUndefined();
    session.dispose();
  });

  it('rebases a refused save onto changed bytes and persists the merge', async () => {
    const { content, outcomeChange } = service('one\ntwo\n');
    const base = bytes('one\ntwo\n');
    const changed: Extract<FileContentResult, { kind: 'text' }> = { kind: 'text', content: bytes('ONE\ntwo\n') };
    vi.mocked(content.saveEditor).mockRejectedValueOnce(new EditorSaveConflictError('main.ts', base));
    vi.mocked(content.peekOutcome).mockReturnValueOnce(changed).mockReturnValue(outcome('ONE\nTWO\n'));
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    await session.acquire('main.ts');
    session.apply('main.ts', { expectedVersion: 1, origin: 'view', changes: [{ from: 4, to: 7, insert: 'TWO' }] });
    const saved = session.save('main.ts');
    outcomeChange({ path: 'main.ts', result: changed });
    await saved;
    expect(session.get('main.ts')?.text).toBe('ONE\nTWO\n');
    expect(content.saveEditor).toHaveBeenLastCalledWith('main.ts', bytes('ONE\nTWO\n'), changed.content);
    session.dispose();
  });

  it('records an unmergeable edit as a durable conflict and holds project close', async () => {
    const { content } = service('one\n');
    const base = bytes('one\n');
    vi.mocked(content.saveEditor).mockRejectedValueOnce(new EditorSaveConflictError('main.ts', base));
    vi.mocked(content.peekOutcome).mockReturnValue(outcome('theirs\n'));
    const record = vi.fn(
      async (): Promise<EditorConflictOutcome> => ({
        status: 'recorded',
        revisionId: 'r1',
        line: 'main',
        into: 'main',
      }),
    );
    const session = new EditorDocumentSession({
      contentService: content,
      projectId: 'p',
      recordEditorConflict: record,
    });
    await session.acquire('main.ts');
    session.apply('main.ts', { expectedVersion: 1, origin: 'view', changes: [{ from: 0, to: 3, insert: 'mine' }] });
    await session.save('main.ts');
    expect(record).toHaveBeenCalledWith({ path: 'main.ts', base: 'one\n', mine: 'mine\n' });
    expect(isRecordingEditorConflict('p')).toBe(false);
    expect(session.get('main.ts')?.text).toBe('theirs\n');
    session.dispose();
  });

  it('answers the refusal it is recording with the record, so a close cut waits instead of failing', async () => {
    const { content } = service('one\n');
    const refusal = new EditorSaveConflictError('main.ts', bytes('one\n'));
    vi.mocked(content.saveEditor).mockRejectedValueOnce(refusal);
    vi.mocked(content.peekOutcome).mockReturnValue(outcome('theirs\n'));
    const recorded = Promise.withResolvers<EditorConflictOutcome>();
    const session = new EditorDocumentSession({
      contentService: content,
      projectId: 'p-answer',
      recordEditorConflict: async () => recorded.promise,
    });
    await session.acquire('main.ts');
    session.apply('main.ts', { expectedVersion: 1, origin: 'view', changes: [{ from: 0, to: 3, insert: 'mine' }] });
    const saved = session.save('main.ts');
    await vi.waitFor(() => {
      expect(isRecordingEditorConflict('p-answer')).toBe(true);
    });

    const answer = session.conflictResolution(refusal);
    expect(answer).toBeInstanceOf(Promise);
    expect(session.conflictResolution(new Error('disk full'))).toBeUndefined();
    expect(session.conflictResolution(new EditorSaveConflictError('main.ts', null))).toBeUndefined();
    let answered = false;
    const watching = (async (): Promise<void> => {
      await answer;
      answered = true;
    })();
    await Promise.resolve();
    expect(answered).toBe(false);
    recorded.resolve({ status: 'recorded', revisionId: 'r1', line: 'main', into: 'main' });
    await expect(answer).resolves.toBeUndefined();
    await watching;
    expect(answered).toBe(true);
    await saved;
    session.dispose();
  });

  it('records refused text before a deleted file releases its document', async () => {
    const { content, contentChange } = service('original');
    const base = bytes('original');
    vi.mocked(content.saveEditor).mockRejectedValueOnce(new EditorSaveConflictError('main.ts', base));
    vi.mocked(content.peekOutcome).mockReturnValue({ kind: 'orphaned' });
    const record = vi.fn(
      async (): Promise<EditorConflictOutcome> => ({
        status: 'recorded',
        revisionId: 'r1',
        line: 'main',
        into: 'main',
      }),
    );
    const session = new EditorDocumentSession({
      contentService: content,
      projectId: 'p',
      recordEditorConflict: record,
    });
    await session.acquire('main.ts');
    session.apply('main.ts', { expectedVersion: 1, origin: 'view', changes: [{ from: 0, to: 8, insert: 'mine' }] });
    const saved = session.save('main.ts');
    await vi.waitFor(() => {
      expect(content.peekOutcome).toHaveBeenCalled();
    });
    contentChange({ type: 'deleted', path: 'main.ts', source: 'user' });
    await saved;
    expect(record).toHaveBeenCalledWith({ path: 'main.ts', base: 'original', mine: 'mine' });
    expect(session.get('main.ts')).toBeUndefined();
    session.dispose();
  });
});

describe('EditorDocumentSession library declarations', () => {
  const path = '__kcl_std__/sketch.kcl';

  it('serves a declaration from memory at its own path without touching the filesystem', async () => {
    const { content } = service('unused');
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });

    const opened = session.openDeclaration(path, 'export fn circle() {}');
    const held = await session.acquire(path);

    expect(held).toBe(opened);
    expect(held?.text).toBe('export fn circle() {}');
    expect(session.declarationText(path)).toBe('export fn circle() {}');
    expect(content.resolve).not.toHaveBeenCalled();
  });

  it('refuses edits and saves to a declaration', async () => {
    const { content } = service('unused');
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    session.openDeclaration(path, 'fn a() {}');
    await session.acquire(path);

    expect(
      session.apply(path, {
        expectedVersion: 1,
        origin: 'view',
        viewId: 'v',
        changes: [{ from: 0, to: 0, insert: 'x' }],
      }),
    ).toBeUndefined();
    await expect(session.save(path)).rejects.toThrow('read-only library declaration');
    expect(content.saveEditor).not.toHaveBeenCalled();
  });

  it('only opens paths under a library declaration root', () => {
    const { content } = service('unused');
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    expect(session.openDeclaration('main.kcl', 'fn a() {}')).toBeUndefined();
    expect(session.hasDeclaration('main.kcl')).toBe(false);
  });

  it('reopens a released declaration and returns nothing for one it never served', async () => {
    const { content } = service('unused');
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    session.openDeclaration(path, 'fn a() {}');
    await session.acquire(path);
    session.release(path);

    const reopened = await session.acquire(path);
    expect(reopened?.text).toBe('fn a() {}');
    expect(await session.acquire('__typescript_lib__/lib.es5.d.ts')).toBeUndefined();
    expect(content.resolve).not.toHaveBeenCalled();
  });

  it('keeps held declarations and drops the oldest unheld ones past the cap', async () => {
    const { content } = service('unused');
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    session.openDeclaration('__kcl_std__/held.kcl', 'held');
    await session.acquire('__kcl_std__/held.kcl');
    for (let index = 0; index < maxDeclarations + 4; index++) {
      session.openDeclaration(`__kcl_std__/m${String(index)}.kcl`, `m${String(index)}`);
    }

    expect(session.hasDeclaration('__kcl_std__/held.kcl')).toBe(true);
    expect(session.hasDeclaration('__kcl_std__/m0.kcl')).toBe(false);
    expect(session.hasDeclaration(`__kcl_std__/m${String(maxDeclarations + 3)}.kcl`)).toBe(true);
  });

  it('forgets declarations when the project changes', () => {
    const { content } = service('unused');
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    session.openDeclaration(path, 'fn a() {}');
    session.setProjectSession('q');
    expect(session.hasDeclaration(path)).toBe(false);
  });

  describe('debounced saves (D17)', () => {
    const edit = (session: EditorDocumentSession, path: string, change: { at: number; insert: string }): void => {
      const { at, insert } = change;
      const document = session.get(path)!;
      session.apply(path, {
        expectedVersion: document.version,
        origin: 'view',
        changes: [{ from: at, to: at, insert }],
      });
    };

    it('writes once when the window closes, with the text as it then stands, and shares one promise', async () => {
      vi.useFakeTimers();
      try {
        const { content } = service('one');
        const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
        await session.acquire('main.ts');
        edit(session, 'main.ts', { at: 3, insert: ' two' });
        const first = session.scheduleSave('main.ts');
        edit(session, 'main.ts', { at: 7, insert: ' three' });
        const second = session.scheduleSave('main.ts');

        expect(second).toBe(first);
        vi.advanceTimersByTime(editorSaveDebounceMilliseconds - 1);
        expect(content.saveEditor).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        await first;

        expect(content.saveEditor).toHaveBeenCalledOnce();
        expect(content.saveEditor).toHaveBeenCalledWith('main.ts', bytes('one two three'), bytes('one'));
        session.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    const recorded = (): ReturnType<typeof vi.fn<() => Promise<EditorConflictOutcome>>> =>
      vi.fn(
        async (): Promise<EditorConflictOutcome> => ({
          status: 'recorded',
          revisionId: 'r1',
          line: 'main',
          into: 'main',
        }),
      );

    it('records text still in its window as a conflict when the file is deleted, never as a saved success', async () => {
      vi.useFakeTimers();
      try {
        const { content, contentChange } = service('one');
        const record = recorded();
        const session = new EditorDocumentSession({
          contentService: content,
          projectId: 'p',
          recordEditorConflict: record,
        });
        await session.acquire('main.ts');
        edit(session, 'main.ts', { at: 3, insert: ' two' });
        const scheduled = session.scheduleSave('main.ts');
        contentChange({ type: 'deleted', path: 'main.ts', source: 'user' });
        await scheduled;

        expect(record).toHaveBeenCalledWith({ path: 'main.ts', base: 'one', mine: 'one two' });
        expect(content.saveEditor).not.toHaveBeenCalled();
        expect(session.hasScheduledSave('main.ts')).toBe(false);
        session.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('records text still in its window as a conflict when the file turns binary', async () => {
      vi.useFakeTimers();
      try {
        const { content, outcomeChange } = service('one');
        const record = recorded();
        const session = new EditorDocumentSession({
          contentService: content,
          projectId: 'p',
          recordEditorConflict: record,
        });
        await session.acquire('main.ts');
        edit(session, 'main.ts', { at: 3, insert: '!' });
        const scheduled = session.scheduleSave('main.ts');
        outcomeChange({ path: 'main.ts', result: { kind: 'binary', size: 9, head: new Uint8Array([0]), revision: 2 } });
        await scheduled;

        expect(record).toHaveBeenCalledWith({ path: 'main.ts', base: 'one', mine: 'one!' });
        expect(session.get('main.ts')).toBeUndefined();
        session.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('carries typing made while a conflict is being recorded when the file is then deleted', async () => {
      vi.useFakeTimers();
      try {
        const { content, contentChange } = service('one');
        const first = Promise.withResolvers<EditorConflictOutcome>();
        const record = vi
          .fn<() => Promise<EditorConflictOutcome>>()
          .mockReturnValueOnce(first.promise)
          .mockResolvedValue({ status: 'recorded', revisionId: 'r2', line: 'main', into: 'main' });
        const session = new EditorDocumentSession({
          contentService: content,
          projectId: 'p',
          recordEditorConflict: record,
        });
        await session.acquire('main.ts');
        edit(session, 'main.ts', { at: 3, insert: ' A' });
        /* Another writer changed the same line: the overlap is recorded. */
        contentChange({ type: 'written', path: 'main.ts', data: bytes('one B'), source: 'user' });
        expect(record).toHaveBeenCalledOnce();
        edit(session, 'main.ts', { at: 5, insert: '!' });
        const scheduled = session.scheduleSave('main.ts');
        contentChange({ type: 'deleted', path: 'main.ts', source: 'user' });
        first.resolve({ status: 'recorded', revisionId: 'r1', line: 'main', into: 'main' });
        await scheduled;

        expect(record).toHaveBeenLastCalledWith({ path: 'main.ts', base: 'one', mine: 'one A!' });
        expect(content.saveEditor).not.toHaveBeenCalled();
        session.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('never records a file recreated at the same path as the text of the one deleted mid-record', async () => {
      vi.useFakeTimers();
      try {
        const { content, contentChange } = service('one');
        const first = Promise.withResolvers<EditorConflictOutcome>();
        const record = vi
          .fn<() => Promise<EditorConflictOutcome>>()
          .mockReturnValueOnce(first.promise)
          .mockResolvedValue({ status: 'recorded', revisionId: 'r2', line: 'main', into: 'main' });
        const session = new EditorDocumentSession({
          contentService: content,
          projectId: 'p',
          recordEditorConflict: record,
        });
        await session.acquire('main.ts');
        edit(session, 'main.ts', { at: 3, insert: ' A' });
        contentChange({ type: 'written', path: 'main.ts', data: bytes('one B'), source: 'user' });
        expect(record).toHaveBeenCalledOnce();
        contentChange({ type: 'deleted', path: 'main.ts', source: 'user' });
        /* A new file at the same path, opened while the old one's record is in flight. */
        vi.mocked(content.resolve).mockResolvedValue(outcome('fresh'));
        vi.mocked(content.peekOutcome).mockReturnValue(outcome('fresh'));
        await session.acquire('main.ts');
        first.resolve({ status: 'recorded', revisionId: 'r1', line: 'main', into: 'main' });
        await vi.waitFor(() => {
          expect(isRecordingEditorConflict('p')).toBe(false);
        });

        expect(record).toHaveBeenCalledOnce();
        expect(record).toHaveBeenCalledWith({ path: 'main.ts', base: 'one', mine: 'one A' });
        expect(session.get('main.ts')?.text).toBe('fresh');
        session.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports text in its window it cannot record when the file goes away', async () => {
      vi.useFakeTimers();
      try {
        const { content, contentChange } = service('one');
        const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
        await session.acquire('main.ts');
        edit(session, 'main.ts', { at: 3, insert: '!' });
        const scheduled = session.scheduleSave('main.ts');
        contentChange({ type: 'deleted', path: 'main.ts', source: 'user' });

        await expect(scheduled).rejects.toThrow('cannot record both versions');
        session.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not let continuous typing hold the write past one window', async () => {
      vi.useFakeTimers();
      try {
        const { content } = service('one');
        const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
        await session.acquire('main.ts');
        for (let step = 0; step < 5; step += 1) {
          edit(session, 'main.ts', { at: 3, insert: 'x' });
          void session.scheduleSave('main.ts');
          vi.advanceTimersByTime(editorSaveDebounceMilliseconds / 5);
        }

        expect(content.saveEditor).toHaveBeenCalledOnce();
        session.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('writes at once at a flush point, for one path or for all', async () => {
      const { content } = service('one');
      const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
      await session.acquire('a.ts');
      await session.acquire('b.ts');
      edit(session, 'a.ts', { at: 3, insert: '!' });
      edit(session, 'b.ts', { at: 3, insert: '?' });
      const a = session.scheduleSave('a.ts');
      const b = session.scheduleSave('b.ts');

      session.flushSaves('a.ts');
      expect(content.saveEditor).toHaveBeenCalledOnce();
      expect(session.hasScheduledSave('b.ts')).toBe(true);
      session.flushSaves();
      await Promise.all([a, b]);

      expect(content.saveEditor).toHaveBeenCalledTimes(2);
      expect(session.hasScheduledSave()).toBe(false);
      session.dispose();
    });

    it("registers with the content service so a cut's settle writes the window first", async () => {
      const { content } = service('one');
      let flusher: (() => void) | undefined;
      vi.mocked(content.addEditorSaveFlusher).mockImplementation((flush) => {
        flusher = flush;
        return () => undefined;
      });
      const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
      await session.acquire('main.ts');
      edit(session, 'main.ts', { at: 3, insert: '!' });
      const pending = session.scheduleSave('main.ts');

      flusher!();
      await pending;

      expect(content.saveEditor).toHaveBeenCalledWith('main.ts', bytes('one!'), bytes('one'));
      session.dispose();
    });

    it('writes the window when the session is disposed, and never writes it over a deleted file', async () => {
      const { content, contentChange } = service('one');
      const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
      await session.acquire('kept.ts');
      await session.acquire('gone.ts');
      edit(session, 'kept.ts', { at: 3, insert: '!' });
      edit(session, 'gone.ts', { at: 3, insert: '!' });
      const kept = session.scheduleSave('kept.ts');
      const gone = session.scheduleSave('gone.ts');

      contentChange({ type: 'deleted', path: 'gone.ts', source: 'user' });
      /* No conflict recorder here: the text it could not keep is reported, not dropped as saved. */
      await expect(gone).rejects.toThrow('cannot record both versions');
      session.dispose();
      await kept;

      expect(content.saveEditor).toHaveBeenCalledOnce();
      expect(content.saveEditor).toHaveBeenCalledWith('kept.ts', bytes('one!'), bytes('one'));
    });

    it('follows a rename while the window is open', async () => {
      const { content, contentChange } = service('one');
      const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
      await session.acquire('old.ts');
      edit(session, 'old.ts', { at: 3, insert: '!' });
      const pending = session.scheduleSave('old.ts');

      contentChange({ type: 'renamed', oldPath: 'old.ts', newPath: 'new.ts' });
      session.flushSaves('new.ts');
      await pending;

      expect(content.saveEditor).toHaveBeenCalledWith('new.ts', bytes('one!'), bytes('one'));
      session.dispose();
    });

    it('refuses to schedule a save of a declaration or of no document', async () => {
      const { content } = service('one');
      const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });

      await expect(session.scheduleSave('missing.ts')).rejects.toThrow('No active document');
      session.dispose();
    });
  });
});
