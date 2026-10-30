import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { getRevisionClient } from '#hooks/use-revision-status.js';
import { EditorDocumentSession } from '#lib/editor-document-session.js';
import { EditorDocument } from '#lib/editor-document.js';
import { clearEditorNavigation } from '#lib/editor-navigation-service.js';
import type { EditorLanguageEnvironment, EditorNavigationTarget } from '#lib/editor-language-environment.js';
import { VirtualDeclarationDialog } from '#components/code/virtual-declaration-dialog.js';
import type { VirtualDeclaration } from '#components/code/virtual-declaration-dialog.js';
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
  const [declaration, setDeclaration] = useState<VirtualDeclaration>();
  const opener = useRef<HTMLElement | undefined>(undefined);

  useEffect(() => {
    if (!contentService) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- a declaration from the previous project must not remain visible.
    setDeclaration(undefined);
    opener.current = undefined;
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
      if (target.declaration) {
        const typescriptDeclaration =
          (path.startsWith('__typescript_lib__/') || path.startsWith('cdn-types/')) && path.endsWith('.d.ts');
        const kclStandardLibrary = path.startsWith('__kcl_std__/') && path.endsWith('.kcl');
        const openscadBuiltins = path.startsWith('__openscad_builtins__/') && path.endsWith('.scad');
        if (!typescriptDeclaration && !kclStandardLibrary && !openscadBuiltins) {
          return;
        }
        opener.current =
          globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : undefined;
        setDeclaration({
          uri: target.uri,
          document: new EditorDocument(path, target.declaration.text),
          line: target.line,
          column: target.column,
        });
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
    [editorRef, treeService],
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
  return (
    <EditorSessionContext.Provider value={value}>
      {children}
      <VirtualDeclarationDialog
        declaration={declaration}
        onClose={() => {
          setDeclaration(undefined);
        }}
        restoreFocus={() => {
          opener.current?.focus();
        }}
      />
    </EditorSessionContext.Provider>
  );
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
