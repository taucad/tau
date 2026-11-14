import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import type { FlushPhase } from '#runtime/environment.js';
import { useProject } from '#hooks/use-project.js';
import { getRevisionClient } from '#hooks/use-revision-status.js';
import { peekRevisionClient } from '#services/revision-client-registry.js';
import { readLfsPointer } from '@taucad/revisions';
import {
  EditorDocumentSession,
  editorConflictRecordsSettled,
  isRecordingEditorConflict,
} from '#lib/editor-document-session.js';
import { confirmFlush } from '#workbench-records/record-health.js';
import type { EditorDocument } from '#lib/editor-document.js';
import { clearEditorNavigation } from '#lib/editor-navigation-service.js';
import type { EditorLanguageEnvironment, EditorNavigationTarget } from '#lib/editor-language-environment.js';
import { isVirtualDeclarationPath } from '#lib/virtual-declarations.js';
import { URI } from 'vscode-uri';
import { assertRootedPath } from '@taucad/utils/path';

type EditorContextValue = {
  session: EditorDocumentSession | undefined;
  environment: EditorLanguageEnvironment | undefined;
};
const EditorSessionContext = createContext<EditorContextValue>({ session: undefined, environment: undefined });

/** Owns one filesystem-backed document session for the mounted project. */
export function EditorDocumentSessionProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { projectId, editorRef } = useProject();
  const { contentService, treeService, fileManagerRef, readFile, exists, readdir, getDirectoryStat } = useFileManager();
  const [session, setSession] = useState<EditorDocumentSession>();

  useEffect(() => {
    if (!contentService) {
      return;
    }
    const next = new EditorDocumentSession({
      contentService,
      projectId,
      recordEditorConflict: async (input) => {
        const { worker } = fileManagerRef.getSnapshot().context;
        if (!worker) {
          throw new Error('History is still starting. Your edit is kept; type again to save it.');
        }
        return getRevisionClient({ projectId, worker }).recordEditorConflict(input);
      },
    });
    // oxlint-disable-next-line react/set-state-in-effect -- a session subscribes to the project filesystem only after mount.
    setSession(next);
    /* D17's flush points outside one pane: the window losing focus, the tab hidden
     * or switched away from, and the page going away (which cannot await the write). */
    const flush = (): void => {
      next.flushSaves();
    };
    const flushWhenHidden = (): void => {
      if (document.visibilityState === 'hidden') {
        next.flushSaves();
      }
    };
    globalThis.addEventListener('blur', flush);
    globalThis.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    editorRef.send({
      type: 'registerMaterialiseModel',
      materialiseModel: async (path: string) => {
        await next.getOrEnsureDocument(path);
      },
    });
    return () => {
      globalThis.removeEventListener('blur', flush);
      globalThis.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      editorRef.send({ type: 'registerMaterialiseModel', materialiseModel: undefined });
      next.dispose();
      clearEditorNavigation(projectId);
      setSession((current) => (current === next ? undefined : current));
    };
  }, [contentService, editorRef, fileManagerRef, projectId]);

  /* The close cut is a producer's: text in its debounce window, every save
   * already queued and every overlap being recorded beside its file is settled
   * before the session takes the close revision (D17). Bounded like the other
   * close flushers, so a save that never settles names itself instead of
   * holding the quit. */
  const flushEditorAtClose = useCallback(
    async (phase: FlushPhase): Promise<void> => {
      if (phase !== 'hidden' || !contentService) {
        return;
      }
      /* A refusal the session is answering (a conflict recorded beside the
       * file) settles on that answer, not as an unsaved edit. */
      const settle = async (): Promise<void> =>
        contentService.settleEditorSaves({
          resolution: (failure): Promise<void> | undefined => session?.conflictResolution(failure),
        });
      await confirmFlush(async () => {
        await settle();
        /* A record that ends may save its rebased text, so the saves are settled again after it. */
        while (isRecordingEditorConflict(projectId)) {
          // oxlint-disable-next-line no-await-in-loop -- one round per record that started meanwhile.
          await editorConflictRecordsSettled(projectId);
          // oxlint-disable-next-line no-await-in-loop -- the record's own save, if it made one.
          await settle();
        }
        return true;
      }, 'Editor changes are not confirmed saved.');
    },
    [contentService, projectId, session],
  );
  useFlushOnClose(flushEditorAtClose, { stage: 'producer' });

  const fileManager = useMemo(
    () => ({
      /* The language services read through placeholders (D9, D10): a pointer is made its file first, never parsed. */
      readFile: async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
        const data = await readFile(path);
        const client = peekRevisionClient(projectId);
        if (client?.materialize === undefined || readLfsPointer(data) === undefined) {
          return data;
        }
        await client.materialize([path.replace(/^\/+/u, '')]);
        return readFile(path);
      },
      exists,
      readdir,
      getDirectoryStat,
    }),
    [projectId, readFile, exists, readdir, getDirectoryStat],
  );
  const navigate = useCallback(
    async (target: EditorNavigationTarget): Promise<void> => {
      const uri = URI.parse(target.uri);
      if (uri.scheme !== 'file' || uri.authority || uri.query || uri.fragment || !uri.path.startsWith('/')) {
        return;
      }
      const path = assertRootedPath(uri.path.slice(1));
      if (isVirtualDeclarationPath(path)) {
        // A library declaration opens as a read-only tab like any file; its text comes from the language service.
        if (target.declaration) {
          session?.openDeclaration(path, target.declaration.text);
        }
        if (!session?.hasDeclaration(path)) {
          return;
        }
        editorRef.send({
          type: 'openFile',
          path,
          source: 'user',
          readOnly: true,
          lineNumber: target.line,
          column: target.column,
        });
        return;
      }
      if (target.declaration) {
        return;
      }
      const entry = await treeService?.getEntry(path);
      if (entry?.type !== 'file') {
        return;
      }
      editorRef.send({
        type: 'openFile',
        path,
        source: 'user',
        readOnly: entry.provenance !== undefined && entry.provenance.source !== 'project',
        lineNumber: target.line,
        column: target.column,
      });
    },
    [editorRef, session, treeService],
  );
  const environment = useMemo(
    (): EditorLanguageEnvironment | undefined =>
      session && contentService && treeService
        ? {
            session,
            diagnostics: session.diagnostics,
            fileManagerRef,
            contentService,
            treeService,
            fileManager,
            navigate,
          }
        : undefined,
    [session, contentService, treeService, fileManagerRef, fileManager, navigate],
  );
  const value = useMemo(() => ({ session, environment }), [session, environment]);
  return <EditorSessionContext.Provider value={value}>{children}</EditorSessionContext.Provider>;
}

/** The neutral session is present for project panes, including non-code views. */
export function useEditorDocumentSession(): EditorDocumentSession | undefined {
  return useContext(EditorSessionContext).session;
}

/** Ports available to syntax and semantic services after a source pane mounts. */
export function useEditorLanguageEnvironment(): EditorLanguageEnvironment | undefined {
  return useContext(EditorSessionContext).environment;
}

/** Acquire only while an actual source editor is mounted. */
export function useEditorDocument(path: string): EditorDocument | undefined {
  const session = useEditorDocumentSession();
  const [held, setHeld] = useState<{
    session: EditorDocumentSession;
    path: string;
    document: EditorDocument;
  }>();
  useEffect(() => {
    if (!session) {
      return;
    }
    let current = true;
    const acquire = async (): Promise<void> => {
      const document = await session.acquire(path);
      if (current && document) {
        setHeld({ session, path, document });
      }
    };
    void acquire();
    return () => {
      current = false;
      session.release(path);
      setHeld((value) => (value?.session === session && value.path === path ? undefined : value));
    };
  }, [session, path]);
  return held !== undefined && held.session === session && held.path === path ? held.document : undefined;
}
