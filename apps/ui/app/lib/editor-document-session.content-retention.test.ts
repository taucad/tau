/**
 * A document the session keeps is a path the content service holds (STO-25 SP2g review F2).
 *
 * The content service tells only the paths it holds when a file changes or
 * goes. A background document — language work, navigation — is held by no
 * view, and its outcome can be pruned from the service's bounded cache, so the
 * session must say it holds the path: otherwise a deleted file's text keeps
 * being served, and an external write never reaches it (I5, I7).
 */

import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ChangeEvent } from '@taucad/types';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { EditorDocumentSession } from '#lib/editor-document-session.js';

const encoder = new TextEncoder();

const fixture = (): {
  files: Map<string, string>;
  session: EditorDocumentSession;
  emit: (event: ChangeEvent) => void;
  dispose: () => void;
} => {
  const files = new Map<string, string>();
  const proxy = mock<ComposedViewClient>();
  const read = async (absolutePath: string): Promise<Uint8Array<ArrayBuffer>> => {
    const text = files.get(absolutePath.replace(/^\/project\//u, ''));
    if (text === undefined) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
    return encoder.encode(text);
  };
  proxy.readFile.mockImplementation(read as ComposedViewClient['readFile']);
  proxy.readFileWithDigest = vi.fn(async (path: string) => ({ data: await read(path), sha256: 'digest' }));
  let listener: (data: unknown) => void = () => undefined;
  const channel = new WorkerChangeChannel({
    transport: {
      listen: (_event, handler) => {
        listener = handler;
        return () => undefined;
      },
    },
  });
  /* A one-entry cache, so a second file prunes the first file's outcome. */
  const content = new FileContentService({
    proxy,
    paths: new WorkspacePathResolver('/project'),
    channel,
    refreshGuard: new RefreshGenerationGuard(),
    cacheOptions: { maxEntries: 1 },
  });
  const session = new EditorDocumentSession({ contentService: content, projectId: 'p' });
  return {
    files,
    session,
    emit: (event) => {
      listener(event);
    },
    dispose: () => {
      session.dispose();
      content.dispose();
      channel.dispose();
    },
  };
};

describe('EditorDocumentSession content retention', () => {
  it('should drop a background document whose file is deleted after its outcome was pruned', async () => {
    const { files, session, emit, dispose } = fixture();
    try {
      files.set('a.ts', 'export const a = 1;');
      files.set('b.ts', 'export const b = 1;');
      const document = await session.getOrEnsureDocument('a.ts');
      expect(document?.text).toBe('export const a = 1;');
      await session.getOrEnsureDocument('b.ts');

      files.delete('a.ts');
      emit({ type: 'fileDeleted', path: 'a.ts', backend: 'memory' });

      await vi.waitFor(() => {
        expect(session.get('a.ts')).toBeUndefined();
      });
    } finally {
      dispose();
    }
  });

  it('should adopt an external write to a background document whose outcome was pruned', async () => {
    const { files, session, emit, dispose } = fixture();
    try {
      files.set('a.ts', 'export const a = 1;');
      files.set('b.ts', 'export const b = 1;');
      await session.getOrEnsureDocument('a.ts');
      await session.getOrEnsureDocument('b.ts');

      files.set('a.ts', 'export const a = 2;');
      emit({ type: 'fileWritten', path: 'a.ts', backend: 'memory' });

      await vi.waitFor(() => {
        expect(session.get('a.ts')?.text).toBe('export const a = 2;');
      });
    } finally {
      dispose();
    }
  });
});
