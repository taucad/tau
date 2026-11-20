import { createContext } from 'react';
import type { AnyActorRef } from 'xstate';
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

/** The model-interaction actor's part a chat reference chip reads and drives: each unit's shown components. */
export type ProjectModelInteractionRef = Readonly<{
  getSnapshot: () => Readonly<{
    context: Readonly<{
      unitsById: Readonly<
        Record<string, Readonly<{ manifest?: Readonly<{ nodesById: Readonly<Record<string, unknown>> }> }> | undefined>
      >;
    }>;
  }>;
  subscribe: AnyActorRef['subscribe'];
  send: (event: Readonly<{ type: 'selectComponent'; unitId: string; componentId: string; source: 'chat' }>) => void;
}>;

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
  modelInteractionRef: ProjectModelInteractionRef;
}>;

/** The open project, or `undefined` outside a project provider. */
export const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);
