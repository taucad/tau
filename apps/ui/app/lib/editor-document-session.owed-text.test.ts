import { afterEach, describe, expect, it, vi } from 'vitest';
import { stringToBase64 } from 'uint8array-extras';
import { mock } from 'vitest-mock-extended';
import type { MockProxy } from 'vitest-mock-extended';
import type { FileContentResult, FileContentService } from '@taucad/fs-client/file-content-service';
import type { EditorConflictOutcome } from '@taucad/revisions/revision-effects';
import {
  EditorDocumentSession,
  editorTextDebtLimit,
  editorTextDebtMaxAgeMilliseconds,
  editorTextDebtStorageKeyPrefix,
  editorTextDebts,
  isOwingEditorText,
  isRecordingEditorConflict,
  setEditorTextScope,
} from '#lib/editor-document-session.js';
import type {
  EditorTextDebtPort,
  EditorTextPlace,
  EditorTextScope,
  OwedEditorText,
} from '#lib/editor-document-session.js';

/*
 * A7e (I6, B7): text a document had not confirmed on disk when the page went is recorded at `pagehide`, synchronously,
 * under the person and workspace the project's revisions child records as, and the next session for that project,
 * as that same person, replays it through the checked save against the recorded base, or into a conflict record.
 */

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const outcome = (text: string): FileContentResult => ({ kind: 'text', content: bytes(text) });
const ada: EditorTextScope = { workspace: 'w', actorId: 'usr_1' };
const bea: EditorTextScope = { workspace: 'w', actorId: 'usr_2' };

/** A Map-backed debt port, keyed as the real one is, so scopes never share a record. */
function createDebts(): EditorTextDebtPort & { records: Map<string, OwedEditorText> } {
  const records = new Map<string, OwedEditorText>();
  const prefix = ({ scope, projectId }: EditorTextPlace): string =>
    JSON.stringify([scope.workspace, projectId, scope.actorId]);
  return {
    records,
    list: (place) =>
      [...records.entries()].filter(([key]) => key.startsWith(prefix(place))).map(([, record]) => record),
    write: (place, record) => {
      records.set(`${prefix(place)}${record.path}`, record);
    },
    clear: (place, path, token) => {
      const key = `${prefix(place)}${path}`;
      if (token === undefined || records.get(key)?.token === token) {
        records.delete(key);
      }
    },
  };
}

function service(initial: string): MockProxy<FileContentService> {
  const content = mock<FileContentService>();
  content.addEditorSaveFlusher.mockReturnValue(() => undefined);
  content.resolve.mockResolvedValue(outcome(initial));
  content.peekOutcome.mockReturnValue(outcome(initial));
  content.onDidContentChange.mockReturnValue(() => undefined);
  content.onDidChangeOutcome.mockReturnValue(() => undefined);
  content.saveEditor.mockResolvedValue(undefined);
  return content;
}

const recorded: EditorConflictOutcome = { status: 'recorded', revisionId: 'r1', line: 'main', into: 'main' };

/** One closing document: an edit whose save had not answered when the page went. */
async function closeWithUnsavedEdit(
  projectId: string,
  debts: EditorTextDebtPort,
  scope: EditorTextScope = ada,
): Promise<void> {
  const content = service('one\n');
  /* The save is in flight when the page goes: it never answers. */
  content.saveEditor.mockReturnValue(Promise.withResolvers<void>().promise);
  setEditorTextScope(projectId, scope);
  const session = new EditorDocumentSession({ contentService: content, projectId, textDebts: debts });
  await session.acquire('main.ts');
  session.apply('main.ts', { expectedVersion: 1, origin: 'view', changes: [{ from: 0, to: 3, insert: 'mine' }] });
  /* Never answers; held only so the save is in flight. */
  const pending = session.save('main.ts');
  session.flushSaves();
  session.recordOwedText();
  session.dispose();
  setEditorTextScope(projectId, undefined);
  expect(pending).toBeInstanceOf(Promise);
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.useRealTimers();
});

describe('EditorDocumentSession owed text (A7e)', () => {
  it('should record a document whose save had not answered at pagehide, under the published scope only', async () => {
    const debts = createDebts();
    await closeWithUnsavedEdit('p-record', debts);
    const [record] = debts.list({ scope: ada, projectId: 'p-record' });
    expect(record).toMatchObject({ path: 'main.ts', text: 'mine\n' });
    expect(record?.base).toBe(stringToBase64('one\n'));
    expect(debts.list({ scope: bea, projectId: 'p-record' })).toEqual([]);

    /* Without a scope nothing is recorded: the session does not know whose text it is. */
    const none = createDebts();
    const content = service('one\n');
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p-unscoped', textDebts: none });
    await session.acquire('main.ts');
    session.apply('main.ts', { expectedVersion: 1, origin: 'view', changes: [{ from: 0, to: 3, insert: 'mine' }] });
    session.recordOwedText();
    expect(none.records.size).toBe(0);
    session.dispose();
  });

  it('should record nothing for a clean document, and clear its own record once its save is confirmed', async () => {
    const debts = createDebts();
    const content = service('one\n');
    setEditorTextScope('p-clean', ada);
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p-clean', textDebts: debts });
    await session.acquire('main.ts');
    session.recordOwedText();
    expect(debts.records.size).toBe(0);
    session.apply('main.ts', { expectedVersion: 1, origin: 'view', changes: [{ from: 0, to: 3, insert: 'two' }] });
    /* A pagehide the document survives (the back/forward cache) records the edit; its confirmed save clears it. */
    session.recordOwedText();
    expect(debts.list({ scope: ada, projectId: 'p-clean' })).toHaveLength(1);
    content.peekOutcome.mockReturnValue(outcome('two\n'));
    await session.save('main.ts');
    expect(debts.list({ scope: ada, projectId: 'p-clean' })).toEqual([]);
    session.recordOwedText();
    expect(debts.records.size).toBe(0);
    session.dispose();
    setEditorTextScope('p-clean', undefined);
  });

  it('should keep today’s behaviour when storage refuses the write at pagehide (quota)', async () => {
    const debts: EditorTextDebtPort = {
      ...createDebts(),
      write: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    await expect(closeWithUnsavedEdit('p-quota', debts)).resolves.toBeUndefined();

    /* The real port catches it too. */
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => {
      editorTextDebts.write(
        { scope: ada, projectId: 'p-quota' },
        { token: 't', path: 'a.ts', base: stringToBase64('a'), text: 'b', at: Date.now() },
      );
    }).not.toThrow();
    setItem.mockRestore();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(editorTextDebts.list({ scope: ada, projectId: 'p-quota' })).toEqual([]);
  });

  it('should replay the owed text through the checked save against its base before a pane adopts the file', async () => {
    const debts = createDebts();
    await closeWithUnsavedEdit('p-replay', debts);
    const content = service('one\n');
    const saved = Promise.withResolvers<void>();
    content.saveEditor.mockReturnValue(saved.promise);
    setEditorTextScope('p-replay', ada);
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p-replay', textDebts: debts });
    expect(isOwingEditorText('p-replay')).toBe(true);
    const document = await session.acquire('main.ts');
    expect(document?.text).toBe('mine\n');
    expect(content.saveEditor).toHaveBeenCalledWith('main.ts', bytes('mine\n'), bytes('one\n'));
    expect(debts.list({ scope: ada, projectId: 'p-replay' })).toHaveLength(1);
    content.peekOutcome.mockReturnValue(outcome('mine\n'));
    saved.resolve();
    await vi.waitFor(() => {
      expect(debts.list({ scope: ada, projectId: 'p-replay' })).toEqual([]);
    });
    expect(isOwingEditorText('p-replay')).toBe(false);
    session.dispose();
    setEditorTextScope('p-replay', undefined);
  });

  it('should refuse a replay whose base moved into the conflict record, never onto the file', async () => {
    const debts = createDebts();
    await closeWithUnsavedEdit('p-moved', debts);
    const content = service('theirs\n');
    const answer = Promise.withResolvers<EditorConflictOutcome>();
    const record = vi.fn(async () => answer.promise);
    setEditorTextScope('p-moved', ada);
    const session = new EditorDocumentSession({
      contentService: content,
      projectId: 'p-moved',
      textDebts: debts,
      recordEditorConflict: record,
    });
    await vi.waitFor(() => {
      expect(record).toHaveBeenCalledWith({ path: 'main.ts', base: 'one\n', mine: 'mine\n' });
    });
    expect(isRecordingEditorConflict('p-moved')).toBe(true);
    expect(content.saveEditor).not.toHaveBeenCalled();
    const opened = await session.acquire('main.ts');
    expect(opened?.text).toBe('theirs\n');
    answer.resolve(recorded);
    await vi.waitFor(() => {
      expect(debts.list({ scope: ada, projectId: 'p-moved' })).toEqual([]);
    });
    expect(isRecordingEditorConflict('p-moved')).toBe(false);
    session.dispose();
    setEditorTextScope('p-moved', undefined);
  });

  it('should clear a record whose text is already on disk, with no save', async () => {
    const debts = createDebts();
    await closeWithUnsavedEdit('p-landed', debts);
    const content = service('mine\n');
    setEditorTextScope('p-landed', ada);
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p-landed', textDebts: debts });
    await vi.waitFor(() => {
      expect(debts.list({ scope: ada, projectId: 'p-landed' })).toEqual([]);
    });
    expect(content.saveEditor).not.toHaveBeenCalled();
    session.dispose();
    setEditorTextScope('p-landed', undefined);
  });

  it('should never replay another account’s text, and keep it for that account', async () => {
    const debts = createDebts();
    await closeWithUnsavedEdit('p-second', debts, ada);
    const content = service('one\n');
    setEditorTextScope('p-second', bea);
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p-second', textDebts: debts });
    const opened = await session.acquire('main.ts');
    expect(opened?.text).toBe('one\n');
    expect(content.saveEditor).not.toHaveBeenCalled();
    expect(debts.list({ scope: ada, projectId: 'p-second' })).toHaveLength(1);
    expect(isOwingEditorText('p-second')).toBe(false);
    session.dispose();
    setEditorTextScope('p-second', undefined);
  });

  it('should replay over a pane opened before the scope, but record it as a conflict once the person typed', async () => {
    const debts = createDebts();
    await closeWithUnsavedEdit('p-late', debts);
    const content = service('one\n');
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p-late', textDebts: debts });
    const document = await session.acquire('main.ts');
    expect(document?.text).toBe('one\n');
    content.peekOutcome.mockReturnValue(outcome('mine\n'));
    setEditorTextScope('p-late', ada);
    await vi.waitFor(() => {
      expect(debts.list({ scope: ada, projectId: 'p-late' })).toEqual([]);
    });
    expect(document?.text).toBe('mine\n');
    expect(content.saveEditor).toHaveBeenCalledWith('main.ts', bytes('mine\n'), bytes('one\n'));
    session.dispose();
    setEditorTextScope('p-late', undefined);

    await closeWithUnsavedEdit('p-typed', debts);
    const typedContent = service('one\n');
    const record = vi.fn(async (): Promise<EditorConflictOutcome> => recorded);
    const typedSession = new EditorDocumentSession({
      contentService: typedContent,
      projectId: 'p-typed',
      textDebts: debts,
      recordEditorConflict: record,
    });
    await typedSession.acquire('main.ts');
    typedSession.apply('main.ts', { expectedVersion: 1, origin: 'view', changes: [{ from: 0, to: 3, insert: 'new' }] });
    setEditorTextScope('p-typed', ada);
    await vi.waitFor(() => {
      expect(record).toHaveBeenCalledWith({ path: 'main.ts', base: 'one\n', mine: 'mine\n' });
    });
    expect(typedSession.get('main.ts')?.text).toBe('new\n');
    expect(typedContent.saveEditor).not.toHaveBeenCalled();
    typedSession.dispose();
    setEditorTextScope('p-typed', undefined);
  });

  it('should keep the record when the replay cannot land, for a later open', async () => {
    const debts = createDebts();
    await closeWithUnsavedEdit('p-fail', debts);
    const content = service('one\n');
    content.saveEditor.mockRejectedValue(new Error('disk full'));
    setEditorTextScope('p-fail', ada);
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p-fail', textDebts: debts });
    await vi.waitFor(() => {
      expect(content.saveEditor).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(isOwingEditorText('p-fail')).toBe(false);
    });
    expect(debts.list({ scope: ada, projectId: 'p-fail' })).toHaveLength(1);
    session.dispose();
    setEditorTextScope('p-fail', undefined);
  });

  it('should keep at most the record limit in storage, dropping the oldest, and drop expired records on read', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    for (let index = 0; index <= editorTextDebtLimit; index += 1) {
      editorTextDebts.write(
        { scope: ada, projectId: 'p-cap' },
        {
          token: `t${String(index)}`,
          path: `f${String(index)}.ts`,
          base: stringToBase64('a'),
          text: 'b',
          at: Date.now() + index,
        },
      );
    }
    const kept = editorTextDebts.list({ scope: ada, projectId: 'p-cap' });
    expect(kept).toHaveLength(editorTextDebtLimit);
    expect(kept.some((record) => record.path === 'f0.ts')).toBe(false);
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(editorTextDebtStorageKeyPrefix));
    expect(keys).toHaveLength(editorTextDebtLimit);

    vi.setSystemTime(1_000_000_000_000 + editorTextDebtLimit + editorTextDebtMaxAgeMilliseconds + 1);
    expect(editorTextDebts.list({ scope: ada, projectId: 'p-cap' })).toEqual([]);
    expect(Object.keys(localStorage).filter((key) => key.startsWith(editorTextDebtStorageKeyPrefix))).toEqual([]);
  });

  it('should owe text for a project while a record exists under its scope, even with no editor mounted', () => {
    setEditorTextScope('p-owing', ada);
    expect(isOwingEditorText('p-owing')).toBe(false);
    editorTextDebts.write(
      { scope: ada, projectId: 'p-owing' },
      { token: 't', path: 'a.ts', base: stringToBase64('a'), text: 'b', at: Date.now() },
    );
    expect(isOwingEditorText('p-owing')).toBe(true);
    setEditorTextScope('p-owing', bea);
    expect(isOwingEditorText('p-owing')).toBe(false);
    setEditorTextScope('p-owing', undefined);
  });
});
