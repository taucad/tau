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
import { EditorDocumentSession, isRecordingEditorConflict } from '#lib/editor-document-session.js';

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const outcome = (text: string): FileContentResult => ({ kind: 'text', content: bytes(text) });

function service(initial: string): {
  content: FileContentService;
  contentChange: (event: ContentChangeEvent) => void;
  outcomeChange: (event: OutcomeChangeEvent) => void;
} {
  const content = mock<FileContentService>();
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
