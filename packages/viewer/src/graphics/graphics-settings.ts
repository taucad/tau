import type { CameraView } from '@taucad/camera';
import type { SectionCutValues } from '#graphics/section-cuts.js';
import type { MeasurementRecord } from '#constants/measurement.types.js';

/**
 * A measurement that the user has explicitly pinned for persistence.
 * @public
 */
export type PinnedMeasurement = Omit<MeasurementRecord, 'isPinned'>;

/**
 * User preference for CAD viewer rendering API.
 *
 * @public
 */
export type GraphicsBackendPreference = 'webgl' | 'webgpu';

/**
 * Resolved active backend passed to THREE renderers (matches preference 1:1; `webgpu` falls back to `webgl` when unsupported).
 *
 * @public
 */
export type ResolvedGraphicsBackend = 'webgl' | 'webgpu';

/**
 * One model unit's persisted hidden, isolated and opacity state.
 * @public
 */
export type PersistedModelComponentDisplayUnitState = {
  hiddenComponentIds?: string[];
  isolatedComponentIds?: string[];
  opacityByComponentId?: Record<string, number>;
};

/**
 * Persisted component display state for every model unit.
 * @public
 */
export type PersistedModelComponentDisplayState = {
  schemaVersion: 1;
  unitsById: Record<string, PersistedModelComponentDisplayUnitState>;
};

/**
 * The persisted part of a camera view.
 * @public
 */
export type PersistedCameraView = Pick<
  CameraView,
  'frameId' | 'target' | 'direction' | 'up' | 'verticalSpan' | 'perspectiveZoom'
>;

/**
 * Per-view graphics settings type.
 * Portable fields are projected from a view record when initializing a graphics actor.
 * The graphics backend preference remains in device-local editor state.
 * @public
 */
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

/**
 * Entry-scoped cuts: cleared on file switch, not inherited by a new pane. `active` holds only with a cut.
 *
 * @public
 */
export type PersistedSectionView = {
  active: boolean;
  /** In order; at most `maxSectionCuts`. Cut ids are not persisted: they are made anew at every load. */
  cuts: PersistedSectionCut[];
};

/**
 * One cut: the model's cut without its id, in metres in the `tau:root` frame.
 *
 * @public
 */
export type PersistedSectionCut = SectionCutValues;

/**
 * Durable keys whose live owner is the per-view `graphicsMachine`.
 * They are seeded once, at actor construction, and the actor is the value afterwards.
 * @public
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

/**
 * Durable keys whose live owner is the view's camera actor, held by its `ViewCameraSession`.
 *
 * @public
 */
export type CameraOwnedSettings = Pick<GraphicsViewSettings, 'cameraFovAngle' | 'cameraView'>;

/**
 * Checks whether persisted component display state hides, isolates or fades nothing.
 *
 * @param componentDisplay - The state to check.
 * @returns Whether the state is absent or has no effect.
 * @public
 */
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

/**
 * Drops persisted component display state that has no effect.
 *
 * @param componentDisplay - The state to check.
 * @returns The state, or `undefined` when it is empty.
 * @public
 */
export function omitEmptyComponentDisplayState(
  componentDisplay: PersistedModelComponentDisplayState | undefined,
): PersistedModelComponentDisplayState | undefined {
  return isComponentDisplayStateEmpty(componentDisplay) ? undefined : componentDisplay;
}

/**
 * Default graphics settings for a newly created viewer actor.
 * @public
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
