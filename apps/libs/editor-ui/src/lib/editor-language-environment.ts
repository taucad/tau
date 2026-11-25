import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { EditorDocumentSession } from '#lib/editor-document-session.js';
import type { EditorDiagnostics } from '#lib/editor-diagnostics.js';

/** Project-owned ports passed to language services only after a code pane mounts. */
export type EditorNavigationTarget = Readonly<{
  uri: string;
  line: number;
  column: number;
  /** Worker-validated virtual declaration text, never written to the project tree. */
  declaration?: Readonly<{ text: string }>;
}>;

/** The project file-manager actor's snapshot, as far as language services read it. */
export type EditorFileManagerSnapshot = Readonly<{
  context: Readonly<{
    rootDirectory: string;
    worker: Worker | undefined;
    viewClient: ComposedViewClient | undefined;
  }>;
  matches(state: string): boolean;
}>;

/** The project file-manager actor: its current snapshot and its changes. */
export type EditorFileManagerRef = Readonly<{
  getSnapshot(): EditorFileManagerSnapshot;
  subscribe(observer: (snapshot: EditorFileManagerSnapshot) => void): Readonly<{ unsubscribe(): void }>;
}>;

/** Project file reads that language servers resolve imports through. */
export type EditorFileManagerApi = Readonly<{
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
}>;

export type EditorLanguageEnvironment = Readonly<{
  session: EditorDocumentSession;
  diagnostics: EditorDiagnostics;
  fileManagerRef: EditorFileManagerRef;
  contentService: FileContentService;
  treeService: FileTreeService;
  fileManager: EditorFileManagerApi;
  navigate: (target: EditorNavigationTarget) => void | Promise<void>;
}>;
