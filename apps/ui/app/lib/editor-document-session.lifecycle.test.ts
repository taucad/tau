import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type {
  ContentChangeEvent,
  FileContentResult,
  FileContentService,
  OutcomeChangeEvent,
} from '@taucad/fs-client/file-content-service';
import { EditorDocumentSession, maxBackgroundDocuments } from '#lib/editor-document-session.js';

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const text = (value: string): FileContentResult => ({ kind: 'text', content: bytes(value) });

function fixture(initial = 'base'): {
  content: FileContentService;
  outcomes: Map<string, FileContentResult>;
  contentChange(event: ContentChangeEvent): void;
  outcomeChange(event: OutcomeChangeEvent): void;
} {
  const content = mock<FileContentService>();
  const outcomes = new Map<string, FileContentResult>();
  let contentListener = (_event: ContentChangeEvent): void => undefined;
  let outcomeListener = (_event: OutcomeChangeEvent): void => undefined;
  content.resolve.mockImplementation(async (path) => outcomes.get(path) ?? text(initial));
  content.peekOutcome.mockImplementation((path) => outcomes.get(path) ?? text(initial));
  content.peek.mockImplementation((path) => {
    const result = outcomes.get(path);
    return result?.kind === 'text' ? result.content : undefined;
  });
  content.saveEditor.mockImplementation(async (path, data) => {
    outcomes.set(path, { kind: 'text', content: data });
  });
  content.onDidContentChange.mockImplementation((listener) => {
    contentListener = listener;
    return () => undefined;
  });
  content.onDidChangeOutcome.mockImplementation((listener) => {
    outcomeListener = listener;
    return () => undefined;
  });
  return {
    content,
    outcomes,
    contentChange: (event) => {
      contentListener(event);
    },
    outcomeChange: (event) => {
      outcomeListener(event);
    },
  };
}

describe('EditorDocumentSession lifecycle', () => {
  it.each([
    { kind: 'binary', size: 1, head: new Uint8Array([0]), revision: 1 },
    { kind: 'too-large', size: 10, limit: 1 },
    { kind: 'orphaned' },
    { kind: 'error', cause: new Error('offline') },
  ] satisfies FileContentResult[])('does not materialize a document for a non-text outcome: $kind', async (result) => {
    const { content } = fixture();
    vi.mocked(content.resolve).mockResolvedValue(result);
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    expect(await session.acquire('main.ts')).toBeUndefined();
    expect(session.get('main.ts')).toBeUndefined();
    session.release('main.ts');
    session.dispose();
  });

  it('keeps a held document while evicting least-recent clean background documents', async () => {
    const { content } = fixture();
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const held = await session.acquire('held.ts');
    await Promise.all(
      Array.from({ length: maxBackgroundDocuments + 1 }, async (_, index) =>
        session.getOrEnsureDocument(`background-${String(index)}.ts`),
      ),
    );
    expect(session.get('held.ts')).toBe(held);
    expect(session.get('background-0.ts')).toBeUndefined();
    expect(session.get(`background-${String(maxBackgroundDocuments)}.ts`)).toBeDefined();
    session.release('held.ts');
    session.dispose();
  });

  it('keeps a dirty background document while evicting clean backgrounds', async () => {
    const { content } = fixture();
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const dirty = await session.acquire('dirty.ts');
    session.apply('dirty.ts', { origin: 'view', expectedVersion: 1, changes: [{ from: 0, to: 4, insert: 'mine' }] });
    session.release('dirty.ts');
    await Promise.all(
      Array.from({ length: maxBackgroundDocuments + 1 }, async (_, index) =>
        session.getOrEnsureDocument(`clean-${String(index)}.ts`),
      ),
    );
    expect(session.get('dirty.ts')).toBe(dirty);
    expect(dirty?.text).toBe('mine');
    expect(session.get('clean-0.ts')).toBeUndefined();
    session.dispose();
  });

  it('does not create unopened documents from batch writes and adopts only external writes', async () => {
    const { content, contentChange, outcomes } = fixture();
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    outcomes.set('unopened.ts', text('external'));
    contentChange({ type: 'batchWritten', paths: ['unopened.ts'], source: 'machine' });
    expect(session.get('unopened.ts')).toBeUndefined();
    const held = await session.acquire('main.ts');
    contentChange({ type: 'written', path: 'main.ts', data: bytes('editor echo'), source: 'editor' });
    expect(held?.text).toBe('base');
    contentChange({ type: 'written', path: 'main.ts', data: bytes('external'), source: 'machine' });
    expect(held?.text).toBe('external');
    session.release('main.ts');
    session.dispose();
  });

  it('defers an authoritative outcome until a pending checked save completes', async () => {
    const { content, outcomes, outcomeChange } = fixture();
    const gate = Promise.withResolvers<void>();
    vi.mocked(content.saveEditor).mockImplementation(async (path, data) => {
      await gate.promise;
      outcomes.set(path, { kind: 'text', content: data });
    });
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const document = await session.acquire('main.ts');
    session.apply('main.ts', { origin: 'view', expectedVersion: 1, changes: [{ from: 0, to: 4, insert: 'mine' }] });
    const saved = session.save('main.ts');
    outcomeChange({ path: 'main.ts', result: text('older external') });
    expect(document?.text).toBe('mine');
    gate.resolve();
    await saved;
    expect(document?.text).toBe('mine');
    session.dispose();
  });

  it('retains unsaved text after a failed save and accepts the next checked save', async () => {
    const { content, outcomes } = fixture();
    vi.mocked(content.saveEditor).mockRejectedValueOnce(new Error('offline'));
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const document = await session.acquire('main.ts');
    session.apply('main.ts', { origin: 'view', expectedVersion: 1, changes: [{ from: 0, to: 4, insert: 'mine' }] });
    await expect(session.save('main.ts')).rejects.toThrow('offline');
    expect(document?.text).toBe('mine');
    await session.save('main.ts');
    expect(outcomes.get('main.ts')).toEqual(text('mine'));
    expect(document?.text).toBe('mine');
    session.dispose();
  });

  it('keeps dirty text and undo when a pre-save edit receives an unchanged-base refresh', async () => {
    const { content, contentChange, outcomeChange, outcomes } = fixture();
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const document = await session.acquire('main.ts');
    session.apply('main.ts', { origin: 'view', expectedVersion: 1, changes: [{ from: 0, to: 4, insert: 'mine' }] });

    contentChange({ type: 'written', path: 'main.ts', data: bytes('base'), source: 'machine' });
    outcomeChange({ path: 'main.ts', result: text('base') });
    expect(document?.text).toBe('mine');
    document?.undo();
    expect(document?.text).toBe('base');
    document?.redo();
    expect(document?.text).toBe('mine');

    await session.save('main.ts');
    expect(vi.mocked(content.saveEditor).mock.calls[0]?.[2]).toEqual(bytes('base'));
    expect(outcomes.get('main.ts')).toEqual(text('mine'));
    session.dispose();
  });

  it('keeps the original checked base and dirty text when fresh authority arrives after a failed save', async () => {
    const { content, outcomes, outcomeChange } = fixture();
    vi.mocked(content.saveEditor).mockRejectedValueOnce(new Error('offline'));
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const document = await session.acquire('main.ts');
    session.apply('main.ts', { origin: 'view', expectedVersion: 1, changes: [{ from: 0, to: 4, insert: 'mine' }] });
    await expect(session.save('main.ts')).rejects.toThrow('offline');
    outcomes.set('main.ts', text('remote'));
    outcomeChange({ path: 'main.ts', result: text('remote') });
    expect(document?.text).toBe('mine');
    await session.save('main.ts');
    expect(vi.mocked(content.saveEditor).mock.calls[1]?.[2]).toEqual(bytes('base'));
    expect(outcomes.get('main.ts')).toEqual(text('mine'));
    session.dispose();
  });

  it('retains a pending editor save against a non-editor written event', async () => {
    const { content, contentChange, outcomes } = fixture();
    const gate = Promise.withResolvers<void>();
    vi.mocked(content.saveEditor).mockImplementation(async (path, data) => {
      await gate.promise;
      outcomes.set(path, { kind: 'text', content: data });
    });
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const document = await session.acquire('main.ts');
    session.apply('main.ts', { origin: 'view', expectedVersion: 1, changes: [{ from: 0, to: 4, insert: 'mine' }] });
    const saving = session.save('main.ts');
    contentChange({ type: 'written', path: 'main.ts', data: bytes('remote'), source: 'machine' });
    expect(document?.text).toBe('mine');
    gate.resolve();
    await saving;
    expect(document?.text).toBe('mine');
    session.dispose();
  });

  it('ignores late authoritative ingress after a failed save until checked retry settles', async () => {
    const { content, contentChange, outcomes } = fixture();
    vi.mocked(content.saveEditor).mockRejectedValueOnce(new Error('offline'));
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const document = await session.acquire('main.ts');
    session.apply('main.ts', { origin: 'view', expectedVersion: 1, changes: [{ from: 0, to: 4, insert: 'mine' }] });
    await expect(session.save('main.ts')).rejects.toThrow('offline');
    outcomes.set('main.ts', text('stale refresh'));
    contentChange({ type: 'written', path: 'main.ts', data: bytes('stale refresh'), source: 'machine' });
    expect(document?.text).toBe('mine');
    await session.save('main.ts');
    expect(vi.mocked(content.saveEditor).mock.calls[1]?.[2]).toEqual(bytes('base'));
    expect(document?.text).toBe('mine');
    session.dispose();
  });

  it('carries a failed edit through rename and adopts external content after successful recovery', async () => {
    const { content, contentChange, outcomeChange, outcomes } = fixture();
    vi.mocked(content.saveEditor).mockRejectedValueOnce(new Error('offline'));
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const document = await session.acquire('main.ts');
    session.apply('main.ts', { origin: 'view', expectedVersion: 1, changes: [{ from: 0, to: 4, insert: 'mine' }] });
    await expect(session.save('main.ts')).rejects.toThrow('offline');
    contentChange({ type: 'renamed', oldPath: 'main.ts', newPath: 'renamed.ts' });
    outcomes.set('renamed.ts', text('remote'));
    outcomeChange({ path: 'renamed.ts', result: text('remote') });
    expect(document?.path).toBe('renamed.ts');
    expect(document?.text).toBe('mine');
    await session.save('renamed.ts');
    expect(vi.mocked(content.saveEditor).mock.calls[1]?.[0]).toBe('renamed.ts');
    expect(vi.mocked(content.saveEditor).mock.calls[1]?.[2]).toEqual(bytes('base'));
    outcomeChange({ path: 'renamed.ts', result: text('later external') });
    expect(document?.text).toBe('later external');
    session.dispose();
  });

  it('does not let an obsolete save rejection undo a newer successful edit', async () => {
    const { content, outcomes } = fixture();
    const older = Promise.withResolvers<void>();
    vi.mocked(content.saveEditor).mockImplementationOnce(async () => older.promise);
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const document = await session.acquire('main.ts');
    session.apply('main.ts', { origin: 'view', expectedVersion: 1, changes: [{ from: 0, to: 4, insert: 'first' }] });
    const firstSave = session.save('main.ts');
    session.apply('main.ts', { origin: 'view', expectedVersion: 2, changes: [{ from: 0, to: 5, insert: 'newest' }] });
    await session.save('main.ts');
    older.reject(new Error('old save failed'));
    await expect(firstSave).rejects.toThrow('old save failed');
    expect(document?.text).toBe('newest');
    expect(outcomes.get('main.ts')).toEqual(text('newest'));
    session.dispose();
  });

  it('retains a held orphan but removes an orphaned background document', async () => {
    const { content, outcomeChange } = fixture();
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const held = await session.acquire('main.ts');
    outcomeChange({ path: 'main.ts', result: { kind: 'orphaned' } });
    expect(session.get('main.ts')).toBe(held);
    session.release('main.ts');
    outcomeChange({ path: 'main.ts', result: { kind: 'orphaned' } });
    expect(session.get('main.ts')).toBeUndefined();
    session.dispose();
  });

  it('retains an empty held document and its identity across rename', async () => {
    const { content, contentChange } = fixture('');
    const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
    const document = await session.acquire('empty.ts');
    contentChange({ type: 'renamed', oldPath: 'empty.ts', newPath: 'renamed.ts' });
    expect(session.get('empty.ts')).toBeUndefined();
    expect(session.get('renamed.ts')).toBe(document);
    expect(document?.text).toBe('');
    expect(document?.path).toBe('renamed.ts');
    session.dispose();
  });
});
