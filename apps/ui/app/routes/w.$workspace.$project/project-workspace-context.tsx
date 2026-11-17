/**
 * The project workspace's contexts and the hooks that read them. `ProjectWorkspaceProvider`, which builds them, is
 * in `project-workspace-provider.tsx`, so this module reaches no workbench layout machine or viewer and a surface
 * shared with Home can read the workspace through it (progressive loading PL1).
 */
import { createContext, useContext } from 'react';
import type { PanelState } from '@taucad/ui-core/types/editor.types';
import type { WorkbenchLayoutController } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import type { WorkbenchIntentTarget } from '#routes/w.$workspace.$project/workbench-layout-controller.shim.js';
import type {
  WorkbenchPanelId,
  WorkbenchUtilityPanelId,
} from '#routes/w.$workspace.$project/project-workspace-context.panels.js';
import type { PaneIntentSource } from '#workbench-records/pane-intents.js';
import type { WorkbenchLayoutRef } from '#runtime/project-runtime.layout.js';

export const projectWorkspaceKeyCombinations = {
  files: { key: 'f', ctrlKey: true },
  model: { key: 'a', ctrlKey: true },
  parameters: { key: 'x', ctrlKey: true },
  kinematics: { key: 'm', ctrlKey: true },
  editor: { key: 'e', ctrlKey: true },
  details: { key: 'i', ctrlKey: true },
  export: { key: 'd', ctrlKey: true },
} as const;

/** What `ProjectWorkspaceProvider` gives its subtree. @public */
export type ProjectWorkspaceContextValue = {
  /** Survives Dockview header replacement during reviewed layout recovery. */
  registerRecordRecoveryFocus: React.RefCallback<HTMLButtonElement>;
  restoreRecordRecoveryFocus: () => void;
  /** Open a Workbench surface: a pane intent from `source` (the person, unless named) on a live project's layout. */
  openPanel: (panelId: WorkbenchPanelId, source?: PaneIntentSource) => void;
  setWorkbenchOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  /**
   * Connect the workbench's opener and file activation. Each answers with the workbench node Dockview shows after it,
   * and the opener `false` when it refuses a pane (see `WorkbenchIntentTarget`).
   */
  connectWorkbench: (
    openPanel: WorkbenchIntentTarget['openPanel'],
    activateFile?: WorkbenchIntentTarget['activateFile'],
  ) => () => void;
  layoutController: WorkbenchLayoutController;
  /** The live project's layout, which runs the workbench's adapter (A8c); absent on a page without one. */
  layout: WorkbenchLayoutRef | undefined;
};

/** The project workspace, as `ProjectWorkspaceProvider` provides it. @public */
export const ProjectWorkspaceContext = createContext<ProjectWorkspaceContextValue | undefined>(undefined);

/** The pane a file was opened from, so its tab can offer one way back (the Print pane's G-code preview). */
export type FileReturn = Readonly<{ path: string; panel: WorkbenchUtilityPanelId }>;

/** The way back from a file a pane opened, as `ProjectWorkspaceProvider` provides it. @public */
export type FileReturnContextValue = Readonly<{
  returnTo: FileReturn | undefined;
  /** Open a file as the user would, remembering the pane to go back to. */
  openFileFrom: (path: string, panel: WorkbenchUtilityPanelId) => void;
  /** Go back to that pane; the way back is spent. */
  back: () => void;
}>;

/** The way back from a file, as `ProjectWorkspaceProvider` provides it. @public */
export const FileReturnContext = createContext<FileReturnContextValue | undefined>(undefined);

/**
 * The way back from a file a pane opened; separate from {@link useProjectWorkspace} so its changes
 * re-render only the breadcrumbs that show it.
 *
 * @returns The way back, or undefined outside a project workspace.
 */
export const useFileReturn = (): FileReturnContextValue | undefined => useContext(FileReturnContext);

export function resolveCompactAuxiliary(layout: PanelState['desktopLayout']): 'chat' | 'workbench' | undefined {
  if (layout[layout.compactAuxiliary === 'chat' ? 'chatOpen' : 'workbenchOpen']) {
    return layout.compactAuxiliary;
  }
  const other = layout.compactAuxiliary === 'chat' ? 'workbench' : 'chat';
  return layout[other === 'chat' ? 'chatOpen' : 'workbenchOpen'] ? other : undefined;
}

/** Which desktop lanes are on screen, after the compact rule has picked one auxiliary. */
export type WorkspaceLanes = Readonly<{ chat: boolean; workbench: boolean }>;

/**
 * Lane visibility, provided by `ChatInterfaceDesktop`, the one owner that
 * measures the width the compact rule depends on. Undefined outside it: mobile
 * and shared pages have no lanes.
 */
export const WorkspaceLanesContext = createContext<WorkspaceLanes | undefined>(undefined);

/**
 * Whether the workspace's panes have their settled sizes (layout-ready). `ChatInterfaceDesktop` lays its lanes out
 * after its first paint, and until then each pane sits at its content's width (1 px) with its contents unrendered; a
 * pane whose contents size themselves once, as the viewer's canvas sizes its camera, waits for this before it mounts
 * them. True outside the desktop lanes: mobile and shared pages size their panes on their first layout.
 */
export const WorkspaceLayoutReadyContext = createContext(true);

/**
 * Reads whether the workspace's panes are laid out at their settled sizes.
 *
 * @returns Whether the panes are layout-ready; true outside the desktop lanes.
 */
export const useWorkspaceLayoutReady = (): boolean => useContext(WorkspaceLayoutReadyContext);

const noLanes: WorkspaceLanes = { chat: false, workbench: false };

/**
 * Reads which desktop lanes are on screen.
 *
 * @returns Whether the chat and workbench lanes are visible; neither outside the desktop layout.
 */
export const useWorkspaceLanes = (): WorkspaceLanes => useContext(WorkspaceLanesContext) ?? noLanes;

export function useProjectWorkspace(): ProjectWorkspaceContextValue;
export function useProjectWorkspace(options: {
  readonly enableNoContext: true;
}): ProjectWorkspaceContextValue | undefined;
export function useProjectWorkspace(options?: {
  readonly enableNoContext?: boolean;
}): ProjectWorkspaceContextValue | undefined {
  const context = useContext(ProjectWorkspaceContext);
  if (!context && !options?.enableNoContext) {
    throw new Error('useProjectWorkspace must be used within ProjectWorkspaceProvider');
  }
  return context;
}

/** The page-owned Restore/snapshot API used by the arrangement card and chat snapshot. */
export function useWorkbenchLayoutController(): WorkbenchLayoutController {
  return useProjectWorkspace().layoutController;
}
