import { z } from 'zod';
import { createCameraView } from '@taucad/camera';
import type { CameraView } from '@taucad/camera';

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
export const defaultRenderTimeout = 60_000;

/** Existing mobile drawer surfaces; desktop utilities are Workbench tabs. */
export const mobilePanelIds = ['chat', 'files', 'viewer', 'parameters', 'editor', 'converter', 'details'] as const;

// ============================================================================
// Graphics View Settings
// ============================================================================

/**
 * Per-view graphics settings type.
 * These settings are stored per-build-per-view in EditorState and used to
 * initialize GraphicsMachine instances for each viewer panel.
 */
export type EnvironmentPreset = 'studio' | 'performance';

/**
 * A measurement that the user has explicitly pinned for persistence.
 */
export type PinnedMeasurement = {
  id: string;
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

export type PersistedCameraView = Pick<CameraView, 'target' | 'direction' | 'up' | 'verticalSpan'>;

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
  /** Render timeout. Milliseconds. */
  renderTimeout: number;
  environmentPreset: EnvironmentPreset;
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
   */
  schemaVersion?: 2 | 3 | 4 | 5 | 6 | 7;
};

// ============================================================================
// Zod Schemas for Runtime Validation of Persisted State
// ============================================================================

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

const persistedCameraViewSchema = z.object({
  target: vector3Schema,
  direction: vector3Schema,
  up: vector3Schema,
  verticalSpan: z.number(),
});

const pinnedMeasurementSchema = z.object({
  id: z.string(),
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
  /** Render timeout. Milliseconds. */
  renderTimeout: z.number(),
  environmentPreset: z.enum(['studio', 'performance']),
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
   */
  schemaVersion: z
    .union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)])
    .optional(),
});

const parsePersistedCameraView = (
  raw: unknown,
  requestedVerticalFieldOfView: number,
): PersistedCameraView | undefined => {
  const result = persistedCameraViewSchema.safeParse(raw);
  if (!result.success) return undefined;

  try {
    const view = createCameraView({
      ...result.data,
      requestedVerticalFieldOfView,
      viewport: { width: 1, height: 1, pixelRatio: 1 },
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    });
    return { target: view.target, direction: view.direction, up: view.up, verticalSpan: view.verticalSpan };
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
 * returned as v7.
 */
export function parseGraphicsViewSettings(raw: unknown): GraphicsViewSettings {
  const result = graphicsViewSettingsSchema.safeParse(raw);
  if (!result.success) {
    return { ...defaultGraphicsSettings };
  }

  const parsed = result.data;
  const cameraView = parsePersistedCameraView(parsed.cameraView, parsed.cameraFovAngle);
  const { componentDisplay: _legacyComponentDisplay, ...settings } = parsed;

  return {
    ...settings,
    cameraView,
    renderTimeout: parsed.schemaVersion === undefined ? parsed.renderTimeout * 1000 : parsed.renderTimeout,
    graphicsBackend: 'webgl',
    schemaVersion: 7,
  };
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
  renderTimeout: defaultRenderTimeout,
  environmentPreset: 'performance',
  graphicsBackend: 'webgl',
  schemaVersion: 7,
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
