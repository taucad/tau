/**
 * The open project: its context and the hooks that read it. The providers that build it are in
 * `hooks/project-provider.tsx`, so this module reaches no project runtime, editor or viewer and the shared composer on
 * Home can read the project through it (progressive loading PL1).
 */
/* oxlint-disable typescript/no-restricted-types -- Workbench record entry paths are nullable by schema. */
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { ParameterManifest } from '@taucad/parameters';
import type { WorkbenchEntries, WorkbenchView } from '@taucad/workbench';
import { findEntryGraphics } from '@taucad/workbench-panes/units/geometry-units';
import type { ParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import type { projectMachine } from '#machines/project.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import type { logMachine } from '#machines/logs.machine.js';
import type { modelInteractionMachine } from '@taucad/viewer/machines/model-interaction.machine';
import type { EntryPathChange } from '#workbench-records/entries-store.js';
import type { ViewRecordPortsHandle } from '#workbench-records/view-record-session.js';
import type { ProjectRuntime } from '#runtime/project-runtime.js';

/** What a project provider gives its subtree. @public */
export type ProjectContextType = {
  manifestObservationError: string | undefined;
  retryManifestObservation: () => void;
  readonly profile: 'editor' | 'shared';
  projectId: string;
  projectRef: ActorRefFrom<typeof projectMachine>;
  editorRef: ActorRefFrom<typeof editorMachine>;
  /** Per-viewer-panel graphics machines, keyed by Dockview panel ID */
  viewGraphics: Map<string, ActorRefFrom<typeof graphicsMachine>>;
  viewRecords: ReadonlyMap<string, WorkbenchView>;
  appliedWorkbenchRevisions: ReadonlyMap<string, `sha256:${string}`>;
  setAppliedWorkbenchRevision: (path: string, digest: `sha256:${string}` | undefined) => void;
  appliedEntryRevisions: ReadonlyMap<string, `sha256:${string}`>;
  setViewRecord: (viewId: string, record: WorkbenchView | undefined) => void;
  viewEntryPaths: ReadonlyMap<string, string | null>;
  setViewEntryPath: (viewId: string, path: string | null | undefined) => void;
  entriesRecord: WorkbenchEntries | undefined;
  changeEntryPaths: (operation: EntryPathChange) => Promise<boolean>;
  /** The project runtime this provider is a view of (A6b): its root, parameter service and producer set. */
  projectRuntime: ProjectRuntime;
  /** The ports every view's record session shares (charter G6b): the host flushes them on close. */
  viewRecordPorts: ViewRecordPortsHandle;
  modelInteractionRef: ActorRefFrom<typeof modelInteractionMachine>;
  /** Dynamic geometry units keyed by entry path. Each is a headless CadMachine+KernelMachine. */
  geometryUnits: Map<string, ActorRefFrom<typeof cadMachine>>;
  /** The main entry path from project.assets.main?.entryPath. */
  mainEntryPath: string;
  logRef: ActorRefFrom<typeof logMachine>;
  resolveParameterEntry: (filePath: string, manifest: ParameterManifest) => void;
  setGeometryUnitParameters: (
    filePath: string,
    manifest: ParameterManifest,
    parameters: Record<string, unknown>,
  ) => void;
  /** Write a form edit: only the fields `values` changes from `base`, the values the form rendered. */
  editGeometryUnitParameters: (
    filePath: string,
    manifest: ParameterManifest,
    edit: Readonly<{ values: Record<string, unknown>; base: Record<string, unknown> }>,
  ) => void;
  switchParameterGroup: (filePath: string, manifest: ParameterManifest, groupName: string) => void;
  createParameterGroup: (
    filePath: string,
    manifest: ParameterManifest,
    input: Readonly<{
      groupName: string;
      values?: Record<string, unknown>;
    }>,
  ) => void;
  deleteParameterGroup: (filePath: string, manifest: ParameterManifest, groupName: string) => void;
  renameParameterGroup: (
    filePath: string,
    manifest: ParameterManifest,
    input: Readonly<{ oldName: string; newName: string }>,
  ) => void;
  parameterService: ParameterSetService;
  updateName: (name: string) => void;
  updateDescription: (description: string) => void;
  updateTags: (tags: string[]) => void;
  getMainFilename: () => Promise<string>;
  setFocusedChatId: (chatId: string | undefined) => void;
};

/** The open project, as `ProjectProvider` and `SessionProjectProvider` provide it (`hooks/project-provider.tsx`). @public */
export const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

/**
 * Find the graphics actor for the viewer panel displaying the main entry path.
 * Returns undefined when the main entry has no live viewer.
 * Used by external consumers (headless capture, RPC handlers, parameters) that are NOT inside a GraphicsProvider.
 */
export function useMainGraphics(): ActorRefFrom<typeof graphicsMachine> | undefined {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useMainGraphics must be used within a ProjectProvider');
  }

  return findEntryGraphics(context.viewGraphics, context.viewEntryPaths, context.mainEntryPath);
}

/**
 * The live parameter-set actor for an entry, re-read whenever the service creates or retires one.
 * @param entryPath - The geometry entry whose parameters the actor owns.
 * @returns The actor, or `undefined` before the entry has been resolved.
 */
export function useParameterSetActor(
  entryPath: string | undefined,
): ReturnType<ProjectContextType['parameterService']['actor']> {
  const { parameterService } = useProject();
  return useSyncExternalStore(
    parameterService.subscribeActors,
    () => (entryPath === undefined ? undefined : parameterService.actor(entryPath)),
    () => undefined,
  );
}

export function useProject<T extends ProjectContextType = ProjectContextType>(options?: {
  readonly enableNoContext?: false;
}): T;
export function useProject<T extends ProjectContextType = ProjectContextType>(options: {
  readonly enableNoContext: true;
}): T | undefined;
export function useProject({ enableNoContext = false }: { readonly enableNoContext?: boolean } = {}):
  | ProjectContextType
  | undefined {
  const context = useContext(ProjectContext);
  if (context === undefined && !enableNoContext) {
    throw new Error('useProject must be used within a ProjectProvider');
  }

  return context;
}
