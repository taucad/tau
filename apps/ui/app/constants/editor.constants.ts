import { z } from 'zod';
import { createCameraView } from '@taucad/camera';
import type { CameraView } from '@taucad/camera';
import { sectionSchema } from '@taucad/workbench';
import { sectionAxisIndices, sectionPlaneAxes } from '#components/geometry/graphics/section-cuts.js';
import type { SectionCutValues, SectionVector } from '#components/geometry/graphics/section-cuts.js';

// ============================================================================
// Panel Constants
// ============================================================================

/** Desktop lane minimum widths in pixels. */

/** Minimum width for the Chat lane. */
export const panelMinSizeChat = 280;

/** Minimum width for the Viewer/center panel (main 3D CAD visualization area) */
export const panelMinSizeViewer = 416;

/** Minimum width for the mixed file/utility Workbench lane. */
export const panelMinSizeWorkbench = 360;

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
 * These settings are stored per-build-per-view in EditorState and used to
 * initialize GraphicsMachine instances for each viewer panel.
 */
/**
 * A measurement that the user has explicitly pinned for persistence.
 */
export type PinnedMeasurement = {
  id: string;
  frameId: string;
  startPoint: [number, number, number];
  endPoint: [number, number, number];
  distance: number;
  name?: string;
};

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
   * `11` = moves `renderTimeout` to `EditorState.unitSettings` (per file) and adds the section view.
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

/** Durable settings of one entry path, keyed by that path in `EditorState.unitSettings`. */
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

// ============================================================================
// Zod Schemas for Runtime Validation of Persisted State
// ============================================================================

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

const persistedCameraViewSchema = z.object({
  frameId: z.string().optional(),
  target: vector3Schema,
  direction: vector3Schema,
  up: vector3Schema,
  verticalSpan: z.number(),
  perspectiveZoom: z.number().optional(),
});

const pinnedMeasurementSchema = z.object({
  id: z.string(),
  frameId: z.string().optional(),
  startPoint: vector3Schema,
  endPoint: vector3Schema,
  distance: z.number(),
  name: z.string().optional(),
});

const componentDisplayUnitSchema = z.object({
  hiddenComponentIds: z.array(z.string()).optional(),
  isolatedComponentIds: z.array(z.string()).optional(),
  opacityByComponentId: z.record(z.string(), z.number()).optional(),
});

export const componentDisplayStateSchema = z.object({
  schemaVersion: z.literal(1),
  unitsById: z.record(z.string(), componentDisplayUnitSchema),
});

/** The schema v11 single cut, read only to migrate it. */
const legacySectionViewSchema = z.object({
  active: z.boolean(),
  plane: z.enum(['xy', 'xz', 'yz']).optional(),
  pivot: vector3Schema,
  rotation: vector3Schema,
  direction: z.union([z.literal(1), z.literal(-1)]),
});

const persistedSectionViewSchema = z.union([sectionSchema, legacySectionViewSchema]);

export const graphicsViewSettingsSchema = z.object({
  enableSurfaces: z.boolean(),
  enableLines: z.boolean(),
  enableGizmo: z.boolean(),
  enableGrid: z.boolean(),
  enableAxes: z.boolean(),
  enableMatcap: z.boolean(),
  enablePostProcessing: z.boolean(),
  upDirection: z.enum(['x', 'y', 'z']),
  cameraFovAngle: z.number(),
  /** Milliseconds. Records at v10 and earlier carried it here; v11 hoists it into `unitSettings`. */
  renderTimeout: z.number().optional(),
  // Parsed on its own, like the camera: one bad cut drops the section view, not the whole record.
  sectionView: z.unknown().optional(),
  pinnedMeasurements: z.array(pinnedMeasurementSchema).optional(),
  graphicsBackend: z.enum(['auto', 'webgl', 'webgpu']).optional(),
  componentDisplay: componentDisplayStateSchema.optional(),
  // Parse independently so corrupt camera data does not discard unrelated valid settings.
  cameraView: z.unknown().optional(),
  /**
   * Settings schema version. Absent / `1` = legacy seconds-based renderTimeout;
   * `2` = milliseconds-only contract.
   * `3` = adds persisted `graphicsBackend` with `'auto' | 'webgl' | 'webgpu'`.
   * `4` = drops `'auto'`; persisted `'auto'` migrates to `'webgl'`.
   * `5` = adds optional per-component display state.
   * `6` = adds the optional canonical camera view.
   * `7` = moves component display state to project-level EditorState.
   * `8` = metre world-space camera and measurement lengths.
   * `9` = adds perspective magnification to the canonical camera view.
   * `10` = names physical frames.
   * `11` = per-file render timeout and durable section view.
   * `12` = section cut list.
   */
  schemaVersion: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(7),
      z.literal(8),
      z.literal(9),
      z.literal(10),
      z.literal(11),
      z.literal(12),
    ])
    .optional(),
});

/** `vector` turned about X, then Y, then Z by `rotation` (radians): how v11 turned a plane's normal. */
const rotateLegacyNormal = ([x, y, z]: SectionVector, [rx, ry, rz]: SectionVector): SectionVector => {
  const y1 = y * Math.cos(rx) - z * Math.sin(rx);
  const z1 = y * Math.sin(rx) + z * Math.cos(rx);
  const x2 = x * Math.cos(ry) + z1 * Math.sin(ry);
  const z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
  return [x2 * Math.cos(rz) - y1 * Math.sin(rz), x2 * Math.sin(rz) + y1 * Math.cos(rz), z2];
};

/**
 * The section view at v12, or `undefined` when it is absent or invalid.
 *
 * A v11 plane becomes one plane cut through its pivot that removes the side v11 removed: the side its rotated +axis
 * normal, times `direction`, points to. The rotation itself is dropped, so the cut is flipped when that normal has a
 * negative component along the plane's axis. A v11 view with no plane has no cut and is inactive.
 */
const parseSectionView = (raw: unknown): PersistedSectionView | undefined => {
  const result = persistedSectionViewSchema.safeParse(raw);
  if (!result.success) {
    return undefined;
  }
  if ('cuts' in result.data) {
    return result.data;
  }
  const { active, plane, pivot, rotation, direction } = result.data;
  if (plane === undefined) {
    return { active: false, cuts: [] };
  }
  const axisIndex = sectionAxisIndices[sectionPlaneAxes[plane]];
  const normal: [number, number, number] = [0, 0, 0];
  normal[axisIndex] = 1;
  return {
    active,
    cuts: [
      {
        kind: 'plane',
        plane,
        offset: pivot[axisIndex],
        isFlipped: direction * rotateLegacyNormal(normal, rotation)[axisIndex] < 0,
      },
    ],
  };
};

const parsePersistedCameraView = (
  raw: unknown,
  {
    requestedVerticalFieldOfView,
    lengthScale,
    schemaVersion,
  }: {
    requestedVerticalFieldOfView: number;
    lengthScale: number;
    schemaVersion: GraphicsViewSettings['schemaVersion'];
  },
): PersistedCameraView | undefined => {
  const result = persistedCameraViewSchema.safeParse(raw);
  if (!result.success) {
    return undefined;
  }
  if (schemaVersion !== undefined && schemaVersion >= 9 && result.data.perspectiveZoom === undefined) {
    return undefined;
  }

  try {
    const view = createCameraView({
      frameId: result.data.frameId ?? 'tau:root',
      ...result.data,
      target: result.data.target.map((coordinate) => coordinate * lengthScale) as [number, number, number],
      verticalSpan: result.data.verticalSpan * lengthScale,
      perspectiveZoom: result.data.perspectiveZoom ?? 1,
      requestedVerticalFieldOfView,
      viewport: { width: 1, height: 1, pixelRatio: 1 },
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    });
    return {
      frameId: view.frameId,
      target: view.target,
      direction: view.direction,
      up: view.up,
      verticalSpan: view.verticalSpan,
      perspectiveZoom: view.perspectiveZoom,
    };
  } catch {
    return undefined;
  }
};

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

/** Reads the legacy per-view display payload without retaining it in current view settings. */
export function parseLegacyModelComponentDisplay(raw: unknown): PersistedModelComponentDisplayState | undefined {
  const result = graphicsViewSettingsSchema.safeParse(raw);
  return result.success ? omitEmptyComponentDisplayState(result.data.componentDisplay) : undefined;
}

/**
 * Safely parse persisted graphics view settings.
 * Returns validated settings on success, or defaults if the data is
 * missing / corrupt / from an older schema version.
 *
 * Backward-compat migration: persisted settings without a schema version are
 * interpreted as v1 (seconds) and multiplied by 1000. Every valid version is
 * returned as v12. Versions before v8 stored world-space lengths in millimetres.
 */
export function parseGraphicsViewSettings(raw: unknown): GraphicsViewSettings {
  const result = graphicsViewSettingsSchema.safeParse(raw);
  if (!result.success) {
    return { ...defaultGraphicsSettings };
  }

  const parsed = result.data;
  const lengthScale = parsed.schemaVersion !== undefined && parsed.schemaVersion >= 8 ? 1 : 0.001;
  const cameraView = parsePersistedCameraView(parsed.cameraView, {
    requestedVerticalFieldOfView: parsed.cameraFovAngle,
    lengthScale,
    schemaVersion: parsed.schemaVersion,
  });
  const {
    componentDisplay: _legacyComponentDisplay,
    renderTimeout: _hoistedRenderTimeout,
    sectionView: _persistedSectionView,
    ...settings
  } = parsed;
  const pinnedMeasurements = parsed.pinnedMeasurements?.map((measurement) => ({
    ...measurement,
    frameId: measurement.frameId ?? 'tau:root',
    startPoint: measurement.startPoint.map((coordinate) => coordinate * lengthScale) as [number, number, number],
    endPoint: measurement.endPoint.map((coordinate) => coordinate * lengthScale) as [number, number, number],
    distance: measurement.distance * lengthScale,
  }));
  const sectionView = parseSectionView(parsed.sectionView);

  return {
    ...settings,
    cameraView,
    ...(sectionView === undefined ? {} : { sectionView }),
    pinnedMeasurements,
    graphicsBackend: 'webgl',
    schemaVersion: 12,
  };
}

/**
 * Milliseconds. Reads the render timeout a record at schema v10 or earlier carried per view, so the
 * v11 load can hoist it into the per-entry record. Absent / `1` means the value was in seconds.
 */
export function readLegacyRenderTimeout(raw: unknown): number | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const { renderTimeout, schemaVersion } = raw as { renderTimeout?: unknown; schemaVersion?: unknown };
  if (typeof renderTimeout !== 'number' || !Number.isFinite(renderTimeout) || renderTimeout <= 0) {
    return undefined;
  }
  return schemaVersion === undefined || schemaVersion === 1 ? renderTimeout * 1000 : renderTimeout;
}

/**
 * Default graphics settings for new viewer panels.
 * Used when no persisted settings exist or when seeding a fresh layout.
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
