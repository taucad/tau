import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { getRevisionClient } from '#hooks/use-revision-status.js';
import { EditorDocumentSession } from '#lib/editor-document-session.js';
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
          throw new Error('Revisions are still starting. Your edit is kept; type again to save it.');
        }
        return getRevisionClient({ projectId, worker }).recordEditorConflict(input);
      },
    });
    // oxlint-disable-next-line react/set-state-in-effect -- a session subscribes to the project filesystem only after mount.
    setSession(next);
    editorRef.send({
      type: 'registerMaterialiseModel',
      materialiseModel: async (path: string) => {
        await next.getOrEnsureDocument(path);
      },
    });
    return () => {
      editorRef.send({ type: 'registerMaterialiseModel', materialiseModel: undefined });
      next.dispose();
      clearEditorNavigation(projectId);
      setSession((current) => (current === next ? undefined : current));
    };
  }, [contentService, editorRef, fileManagerRef, projectId]);

  const fileManager = useMemo(
    () => ({ readFile, exists, readdir, getDirectoryStat }),
    [readFile, exists, readdir, getDirectoryStat],
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
