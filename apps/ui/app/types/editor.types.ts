import type { SerializedDockview } from 'dockview-react';
import type { PanelId, DesktopPanelId, GraphicsViewSettings } from '#constants/editor.constants.js';
import { allotmentPanelOrder } from '#constants/editor.constants.js';

// ============================================================================
// File Types
// ============================================================================

/**
 * Represents an open file tab in the editor.
 *
 * The `paneId` is the **stable identity** of the tab. The `path` is a
 * mutable property of the tab (changes on rename/move). React keys,
 * Dockview panel IDs, and all participants must key off `paneId`, never
 * `path`, so a rename does not unmount the tab.
 */
export type OpenFile = {
  /** Stable pane identity. Minted once via `generatePrefixedId(idPrefix.pane)`. */
  paneId: string;
  /** Current file path (mutable — updated by rename/move participants). */
  path: string;
  name: string;
  /** Timestamp of last focus/access for LRU eviction. */
  lastAccessedAt: number;
  /** Bundled kernel typings (`node_modules/…` workspace-relative) open read-only. */
  readOnly?: boolean;
};

/**
 * Source of a file open event.
 * - 'user': User-initiated action (e.g., clicked on file in tree, breadcrumb, link) - should open editor panel
 * - 'machine': Programmatic action (e.g., project load, chat tool) - should not auto-open editor panel
 */
export type FileOpenSource = 'user' | 'machine';

/**
 * Represents a file or directory item in the file tree.
 */
export type FileItem = {
  id: string;
  name: string;
  path: string;
  content: Uint8Array<ArrayBuffer>;
  language?: string;
  isDirectory?: boolean;
  children?: FileItem[];
};

/**
 * Per-panel state for a PaneviewReact panel (expansion + pixel height).
 */
export type PaneviewPanelState = {
  isExpanded: boolean;
  size: number;
};

/**
 * Panel layout state - stored per-project for persistence across page refreshes.
 */
export type PanelState = {
  /** Which panels are open (keyed by panel ID, order-independent) */
  openPanels: Record<DesktopPanelId, boolean>;
  /** Panel sizes in pixels (keyed by panel ID, order-independent) */
  panelSizes: Record<PanelId, number>;
  /** Mobile active tab ID */
  mobileActiveTab: PanelId;
  /** Kernel paneview panel states (keyed by entry file path) */
  kernelPaneview: Record<string, PaneviewPanelState>;
  /** Parameters paneview panel states (keyed by entry file path) */
  parametersPaneview: Record<string, PaneviewPanelState>;
};

/**
 * Convert named panel sizes object to Allotment array format.
 * Uses allotmentPanelOrder for consistent ordering.
 */
export function toAllotmentSizes(panelSizes: Record<PanelId, number>): number[] {
  return allotmentPanelOrder.map((id) => panelSizes[id]);
}

/**
 * Convert Allotment array back to named panel sizes object.
 * Uses allotmentPanelOrder for consistent mapping.
 */
export function fromAllotmentSizes(sizes: readonly number[]): Record<PanelId, number> {
  return Object.fromEntries(allotmentPanelOrder.map((id, index) => [id, sizes[index] ?? 200])) as Record<
    PanelId,
    number
  >;
}

// ============================================================================
// View State Types
// ============================================================================

/**
 * Per-viewer-panel state. Each viewer panel in the Dockview layout has its own
 * entry file binding and graphics settings.
 */
export type ViewState = {
  /** Which file this viewer panel is displaying (undefined = no file selected, show empty state) */
  entryFile: string | undefined;
  /** Per-view graphics settings (surfaces, lines, grid, FOV, etc.) */
  graphicsSettings: GraphicsViewSettings;
};

// ============================================================================
// Editor State Types
// ============================================================================

/**
 * Editor State - Transient per-project Editor state stored separately from project data.
 *
 * This type is stored in IndexedDB and managed by the editorMachine.
 * It is decoupled from the Project type to keep the project machine clean for
 * CLI/multi-frontend reuse.
 */
export type EditorState = {
  /** Primary key, references Project.id */
  projectId: string;
  /** Open files/tabs in the editor */
  openFiles: OpenFile[];
  /** Currently active pane id (stable across renames) */
  activePaneId: string | undefined;
  /** Currently focused chat ID (the chat the user is actively viewing) */
  focusedChatId: string | undefined;
  /** Panel layout state (open/close, sizes, mobile tab) */
  panelState: PanelState;
  /** Serialized DockviewReact layout for the code editor area */
  editorLayout: SerializedDockview | undefined;
  /** Serialized DockviewReact layout for the geometry viewer area */
  viewerLayout: SerializedDockview | undefined;
  /** Per-viewer-panel state, keyed by Dockview panel ID */
  viewSettings: Record<string, ViewState>;
  /** Timestamp of last update */
  updatedAt: number;
};

/**
 * Input type for updating editor state.
 * The `updatedAt` field is omitted as it's automatically set by the storage layer.
 */
export type EditorStateInput = Omit<EditorState, 'updatedAt'>;
