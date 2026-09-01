import { describe, it, expect, vi } from 'vitest';
import type { ContentChangeEvent, FileContentService } from '@taucad/fs-client/file-content-service';
import { mountFileOperationParticipants } from '#filesystem/file-operation-participants.js';

type EditorEvent = { type: 'renameFile'; oldPath: string; newPath: string } | { type: 'closeFile'; path: string };
type ProjectEvent =
  | { type: 'fileMoved'; oldPath: string; newPath: string }
  | { type: 'fileDeleted'; path: string }
  | { type: 'directoryDeleted'; path: string };

function makeRefs(initialOpenFiles: Array<{ path: string }> = []) {
  const editorSent: EditorEvent[] = [];
  const projectSent: ProjectEvent[] = [];
  const openFiles = [...initialOpenFiles];

  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- structural test double
  const editorRef = {
    send: (event: EditorEvent) => {
      editorSent.push(event);
    },
    getSnapshot: () => ({ context: { openFiles } }),
  } as unknown as Parameters<typeof mountFileOperationParticipants>[0]['editorRef'];

  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- structural test double
  const projectRef = {
    send: (event: ProjectEvent) => {
      projectSent.push(event);
    },
  } as unknown as Parameters<typeof mountFileOperationParticipants>[0]['projectRef'];

  return { editorRef, projectRef, editorSent, projectSent };
}

function makeContentService(): {
  readonly service: FileContentService;
  readonly emit: (event: ContentChangeEvent) => void;
  readonly dispose: ReturnType<typeof vi.fn>;
} {
  let listener: ((event: ContentChangeEvent) => void) | undefined;
  const dispose = vi.fn();
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- structural test double covers only the surface this participant uses
  const service = {
    onDidContentChange: (handler: (event: ContentChangeEvent) => void) => {
      listener = handler;
      return dispose;
    },
  } as unknown as FileContentService;
  return {
    service,
    emit: (event) => {
      if (listener) {
        listener(event);
      }
    },
    dispose,
  };
}

describe('mountFileOperationParticipants', () => {
  it('should dispatch renameFile + fileMoved on file rename', () => {
    const { editorRef, projectRef, editorSent, projectSent } = makeRefs();
    const { service, emit } = makeContentService();
    mountFileOperationParticipants({ contentService: service, editorRef, projectRef });
    emit({ type: 'renamed', oldPath: 'src/old.ts', newPath: 'src/new.ts' });
    expect(editorSent).toEqual([{ type: 'renameFile', oldPath: 'src/old.ts', newPath: 'src/new.ts' }]);
    expect(projectSent).toEqual([{ type: 'fileMoved', oldPath: 'src/old.ts', newPath: 'src/new.ts' }]);
  });

  it('should dispatch renameFile + fileMoved on directory rename (prefix carries through)', () => {
    const { editorRef, projectRef, editorSent, projectSent } = makeRefs();
    const { service, emit } = makeContentService();
    mountFileOperationParticipants({ contentService: service, editorRef, projectRef });
    emit({ type: 'directoryRenamed', oldPath: 'src/foo', newPath: 'src/bar' });
    expect(editorSent).toEqual([{ type: 'renameFile', oldPath: 'src/foo', newPath: 'src/bar' }]);
    expect(projectSent).toEqual([{ type: 'fileMoved', oldPath: 'src/foo', newPath: 'src/bar' }]);
  });

  it('should dispatch closeFile + fileDeleted on file delete', () => {
    const { editorRef, projectRef, editorSent, projectSent } = makeRefs([{ path: 'src/x.ts' }]);
    const { service, emit } = makeContentService();
    mountFileOperationParticipants({ contentService: service, editorRef, projectRef });
    emit({ type: 'deleted', path: 'src/x.ts', source: 'user' });
    expect(editorSent).toEqual([{ type: 'closeFile', path: 'src/x.ts' }]);
    expect(projectSent).toEqual([{ type: 'fileDeleted', path: 'src/x.ts' }]);
  });

  it('should cascade closeFile to every tab under a directoryDeleted prefix', () => {
    const { editorRef, projectRef, editorSent, projectSent } = makeRefs([
      { path: 'src/keep.ts' },
      { path: 'src/foo/a.ts' },
      { path: 'src/foo/nested/b.ts' },
    ]);
    const { service, emit } = makeContentService();
    mountFileOperationParticipants({ contentService: service, editorRef, projectRef });
    emit({ type: 'directoryDeleted', path: 'src/foo' });
    expect(editorSent.map((evt) => evt)).toEqual([
      { type: 'closeFile', path: 'src/foo/a.ts' },
      { type: 'closeFile', path: 'src/foo/nested/b.ts' },
    ]);
    expect(projectSent).toEqual([{ type: 'directoryDeleted', path: 'src/foo' }]);
  });

  it('should ignore non-routed events (written, read, batchWritten, directoryCreated)', () => {
    const { editorRef, projectRef, editorSent, projectSent } = makeRefs();
    const { service, emit } = makeContentService();
    mountFileOperationParticipants({ contentService: service, editorRef, projectRef });
    emit({ type: 'written', path: 'src/x.ts', data: new Uint8Array(), source: 'user' });
    emit({ type: 'read', path: 'src/x.ts', data: new Uint8Array() });
    emit({ type: 'batchWritten', paths: ['src/x.ts'], source: 'user' });
    emit({ type: 'directoryCreated', path: 'src/newdir' });
    expect(editorSent).toEqual([]);
    expect(projectSent).toEqual([]);
  });

  it('should return a disposer that unsubscribes from the content service', () => {
    const { editorRef, projectRef } = makeRefs();
    const { service, dispose } = makeContentService();
    const disposer = mountFileOperationParticipants({ contentService: service, editorRef, projectRef });
    disposer();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
