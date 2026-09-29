import type { CameraView } from '@taucad/camera';
import type { SectionCutValues } from '#components/geometry/graphics/section-cuts.js';
import type { MeasurementRecord } from '#constants/measurement.types.js';

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

/** Default render timeout. Milliseconds. */
export const defaultRenderTimeout = 180_000;

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
// Graphics View Settings
// ============================================================================

/**
 * Per-view graphics settings type.
 * Portable fields are projected from a view record when initializing a graphics actor.
 * The graphics backend preference remains in device-local editor state.
 */
/**
 * A measurement that the user has explicitly pinned for persistence.
 */
export type PinnedMeasurement = Omit<MeasurementRecord, 'isPinned'>;

/** User preference for CAD viewer rendering API. */
export type GraphicsBackendPreference = 'webgl' | 'webgpu';

/** Resolved active backend passed to THREE renderers (matches preference 1:1; `webgpu` falls back to `webgl` when unsupported). */
export type ResolvedGraphicsBackend = 'webgl' | 'webgpu';

export type PersistedModelComponentDisplayUnitState = {
  hiddenComponentIds?: string[];
  isolatedComponentIds?: string[];
  opacityByComponentId?: Record<string, number>;
};

export type PersistedModelComponentDisplayState = {
  schemaVersion: 1;
  unitsById: Record<string, PersistedModelComponentDisplayUnitState>;
};

export type PersistedCameraView = Pick<
  CameraView,
  'frameId' | 'target' | 'direction' | 'up' | 'verticalSpan' | 'perspectiveZoom'
>;

export type GraphicsViewSettings = {
  enableSurfaces: boolean;
  enableLines: boolean;
  enableGizmo: boolean;
  enableGrid: boolean;
  enableAxes: boolean;
  enableMatcap: boolean;
  enablePostProcessing: boolean;
  upDirection: 'x' | 'y' | 'z';
  cameraFovAngle: number;
  /** Canonical user-authored camera view; derived viewport, bounds, and clipping are intentionally omitted. */
  cameraView?: PersistedCameraView;
  /** Durable cuts through this entry's geometry. Absent means none. Added in schema v11, a cut list since v12. */
  sectionView?: PersistedSectionView;
  /** Persisted pinned measurements -- optional so legacy data deserializes cleanly */
  pinnedMeasurements?: PinnedMeasurement[];
  /**
   * Graphics API preference. Added in schema v3.
   * @default 'webgl'
   */
  graphicsBackend?: GraphicsBackendPreference;
  /**
   * Settings schema version. Absent / `1` = legacy seconds-based renderTimeout
   * persisted before the milliseconds-only migration; values are multiplied
   * by 1000 on parse. `2` = milliseconds-only + no graphics backend column.
   * `3` = adds persisted `graphicsBackend` with `'auto' | 'webgl' | 'webgpu'`.
   * `4` = drops `'auto'`; persisted `'auto'` migrates to `'webgl'`.
   * `5` = adds optional per-component display state.
   * `6` = adds the optional canonical camera view.
   * `7` = moves component display state to project-level EditorState.
   * `8` = migrates persisted world-space lengths from millimetres to metres.
   * `9` = adds perspective magnification to the canonical camera view.
   * `10` = names the physical frame of cameras and measurements.
   * `11` = moved `renderTimeout` to per-file settings and added the section view.
   * `12` = replaces the one section plane with a list of cuts and drops the section display preferences.
   */
  schemaVersion?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
};

/** Entry-scoped cuts: cleared on file switch, not inherited by a new pane. `active` holds only with a cut. */
export type PersistedSectionView = {
  active: boolean;
  /** In order; at most `maxSectionCuts`. Cut ids are not persisted: they are made anew at every load. */
  cuts: PersistedSectionCut[];
};

/** One cut: the model's cut without its id, in metres in the `tau:root` frame. */
export type PersistedSectionCut = SectionCutValues;

/** Settings of one entry path; the workbench entries record is the durable owner. */
export type PersistedUnitSettings = {
  /** Render timeout. Milliseconds. */
  renderTimeout: number;
};

/**
 * Durable keys whose live owner is the per-view `graphicsMachine`.
 * They are seeded once, at actor construction, and the actor is the value afterwards.
 */
export type GraphicsOwnedSettings = Pick<
  GraphicsViewSettings,
  | 'enableSurfaces'
  | 'enableLines'
  | 'enableGizmo'
  | 'enableGrid'
  | 'enableAxes'
  | 'enableMatcap'
  | 'enablePostProcessing'
  | 'upDirection'
  | 'graphicsBackend'
  | 'pinnedMeasurements'
  | 'sectionView'
>;

/** Durable keys whose live owner is the view's camera actor, held by its `ViewCameraSession`. */
export type CameraOwnedSettings = Pick<GraphicsViewSettings, 'cameraFovAngle' | 'cameraView'>;

/** Durable keys whose live owner is the entry path's `cadMachine`. */
export type CadOwnedSettings = Pick<PersistedUnitSettings, 'renderTimeout'>;

export function isComponentDisplayStateEmpty(
  componentDisplay: PersistedModelComponentDisplayState | undefined,
): boolean {
  if (!componentDisplay) {
    return true;
  }

  for (const unit of Object.values(componentDisplay.unitsById)) {
    if ((unit.hiddenComponentIds?.length ?? 0) > 0) {
      return false;
    }
    if ((unit.isolatedComponentIds?.length ?? 0) > 0) {
      return false;
    }
    if (Object.keys(unit.opacityByComponentId ?? {}).length > 0) {
      return false;
    }
  }

  return true;
}

export function omitEmptyComponentDisplayState(
  componentDisplay: PersistedModelComponentDisplayState | undefined,
): PersistedModelComponentDisplayState | undefined {
  return isComponentDisplayStateEmpty(componentDisplay) ? undefined : componentDisplay;
}

/**
 * Default graphics settings for a newly created viewer actor.
 */
export const defaultGraphicsSettings: GraphicsViewSettings = {
  enableSurfaces: true,
  enableLines: true,
  enableGizmo: true,
  enableGrid: true,
  enableAxes: true,
  enableMatcap: false,
  enablePostProcessing: false,
  upDirection: 'z',
  cameraFovAngle: 60,
  graphicsBackend: 'webgl',
  schemaVersion: 12,
};

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
  mobileActiveTab: 'chat',
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
