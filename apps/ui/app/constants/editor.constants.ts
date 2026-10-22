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

/** Mobile drawer snap points for the projects interface */
export const mobileDrawerSnapPoints: Array<number | string> = [0.7, 1];

/** Default runtime operation timeout. Milliseconds. */
export const defaultOperationTimeout = 180_000;

/** Existing mobile drawer surfaces; desktop utilities are Workbench tabs. */
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
