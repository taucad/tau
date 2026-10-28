import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { EditorDocumentSession } from '#lib/editor-document-session.js';
import type { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import type { FileManagerApi, FileManagerRef } from '#machines/file-manager.machine.types.js';

/** Project-owned ports passed to language services only after a code pane mounts. */
export type EditorNavigationTarget = Readonly<{
  uri: string;
  line: number;
  column: number;
  /** Worker-validated virtual declaration text, never written to the project tree. */
  declaration?: Readonly<{ text: string }>;
}>;

export type EditorLanguageEnvironment = Readonly<{
  session: EditorDocumentSession;
  diagnostics: EditorDiagnostics;
  fileManagerRef: FileManagerRef;
  contentService: FileContentService;
  treeService: FileTreeService;
  fileManager: FileManagerApi;
  navigate: (target: EditorNavigationTarget) => void | Promise<void>;
}>;
