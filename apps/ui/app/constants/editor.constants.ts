// ============================================================================
// Panel Constants
// ============================================================================

/** Desktop lane minimum widths in pixels. */

/** Minimum width for the Chat lane. */
export const panelMinSizeChat = 280;

/** Minimum width for the Viewer/center panel (main 3D CAD visualization area) */
export const panelMinSizeViewer = 416;

/** Minimum width for the mixed file/utility Workbench lane at narrow desktop widths. */
export const panelMinSizeWorkbench = 320;

/**
 * Minimum width for the Viewer when the workspace cannot hold an auxiliary lane beside the full viewer minimum, as from
 * 768px with the sidebar open or on a landscape phone (D12). The lanes then fit the workspace instead of running past
 * the viewport's edge.
 */
export const panelMinSizeViewerTight = 200;

/** Below this workspace width the Viewer takes {@link panelMinSizeViewerTight}: the widest lane beside the full viewer. */
export const tightWorkspaceWidth = Math.max(panelMinSizeChat, panelMinSizeWorkbench) + panelMinSizeViewer;

/** The detent a surface opens at from the model: half the screen. */
export const mobileDrawerOpenSnapPoint = 0.5;

/**
 * Mobile drawer snap points for the projects interface: half and full. Collapsed is the sheet closed on the model
 * (the Model destination, or a drag down from half), so the sheet rests at one of three heights: 0, 50% and 100%.
 */
export const mobileDrawerSnapPoints: Array<number | string> = [mobileDrawerOpenSnapPoint, 1];

/** The spoken names of {@link mobileDrawerSnapPoints}: its lowest detent is half the screen, not a peek. */
export const mobileDrawerDetentNames: readonly string[] = ['Half', 'Full'];

/** Default runtime operation timeout. Milliseconds. */
export const defaultOperationTimeout = 180_000;

/**
 * Every phone surface: the model stage (`viewer`), the chat, the editor, and one per desktop Workbench surface, so
 * each registry pane opens on a phone (I1). `model-tree` is the Workbench `model` pane; the stage keeps "Model".
 */
export const mobilePanelIds = [
  'chat',
  'files',
  'viewer',
  'parameters',
  'editor',
  'converter',
  'details',
  'share',
  'revisions',
  'model-tree',
  'kinematics',
  'print',
  'browser',
  'agents',
  'jobs',
  'kernel',
  'console',
  'terminal',
] as const;

// ============================================================================
// Entry Settings
// ============================================================================

/** Settings of one entry path; the workbench entries record is the durable owner. */
export type PersistedUnitSettings = {
  /** Runtime operation timeout. Milliseconds. */
  operationTimeout: number;
};

/** Durable keys whose live owner is the entry path's `cadMachine`. */
export type CadOwnedSettings = Pick<PersistedUnitSettings, 'operationTimeout'>;

// ============================================================================
// Panel State Types (derived from constants above)
// ============================================================================

/** Mobile drawer panel IDs. Desktop utility tabs use `WorkbenchPanelId`. */
export type MobilePanelId = (typeof mobilePanelIds)[number];

/**
 * Default panel state for new projects or when no stored state exists.
 */
export const defaultPanelState = {
  desktopLayout: {
    chatOpen: true,
    workbenchOpen: true,
    chatWidth: 320,
    workbenchWidth: 420,
    compactAuxiliary: 'chat',
  },
  mobileActiveTab: 'viewer',
  kernelPaneview: {},
  modelPaneview: {},
  parametersPaneview: {},
  consolePaneview: {},
} as const satisfies {
  desktopLayout: {
    chatOpen: boolean;
    workbenchOpen: boolean;
    chatWidth: number;
    workbenchWidth: number;
    compactAuxiliary: 'chat' | 'workbench';
  };
  mobileActiveTab: MobilePanelId;
  kernelPaneview: Record<string, never>;
  modelPaneview: Record<string, never>;
  parametersPaneview: Record<string, never>;
  consolePaneview: Record<string, never>;
};
