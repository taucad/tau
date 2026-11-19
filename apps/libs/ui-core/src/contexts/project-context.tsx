import { createContext } from 'react';
import type { FileOpenSource } from '#types/editor.types.js';

/** The editor events a library component sends to open or reveal a project file. */
export type ProjectEditorEvent =
  | Readonly<{
      type: 'openFile';
      path: string;
      source: FileOpenSource;
      lineNumber?: number;
      column?: number;
      readOnly?: boolean;
    }>
  | Readonly<{ type: 'revealFileInTree'; path: string; expandTarget?: boolean }>;

/**
 * The part of the open project that library components read.
 *
 * The app's project providers supply the whole project; its `useProject` hook reads this context and narrows it to
 * the app's type.
 */
export type ProjectContextValue = Readonly<{
  projectId: string;
  projectRef: Readonly<{ send: (event: Readonly<{ type: 'openInViewer'; entryPath: string }>) => void }>;
  editorRef: Readonly<{ send: (event: ProjectEditorEvent) => void }>;
}>;

/** The open project, or `undefined` outside a project provider. */
export const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);
