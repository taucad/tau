import { z } from 'zod';
import { createCameraView } from '@taucad/camera';
import type { CameraView } from '@taucad/camera';

// ============================================================================
// Panel Constants
// ============================================================================

/**
 * Minimum panel size constants for the chat interface layout (in pixels)
 * Used for both default sizes and minimum constraints on panes
 */

/** Minimum width for standard side panels (Explorer, Parameters, Converter, Details) */
export const panelMinSizeStandard = 200;

/** Minimum width for the Chat History panel */
export const panelMinSizeChat = 240;

/** Minimum width for the Editor panel (code editing area) */
export const panelMinSizeEditor = 400;

/** Minimum width for the Viewer/center panel (main 3D CAD visualization area) */
export const panelMinSizeViewer = 416;

/** Mobile drawer snap points for the projects interface */
export const mobileDrawerSnapPoints: Array<number | string> = [0.7, 1];

/** Default render timeout. Milliseconds. */
export const defaultRenderTimeout = 60_000;

/**
 * All panel identifiers - single source of truth for panel IDs.
 * Includes both toggleable panels and the always-visible viewer.
 */
export const panelIds = [
  'chat',
  'files',
  'explorer',
  'kernel',
  'viewer',
  'parameters',
  'editor',
  'converter',
  'details',
  'revisions',
] as const;

/**
 * Desktop panel identifiers - panels that can be opened/closed.
 * Excludes viewer which is always visible.
 */
export const desktopPanelIds = [
  'chat',
  'files',
  'explorer',
  'kernel',
  'parameters',
  'editor',
  'converter',
  'details',
] as const;

/**
 * Panel order for Allotment layout - single source of truth for visual ordering.
 * This determines the left-to-right order of panels in the desktop interface.
 *
 * INVARIANT: Every entry here MUST correspond to exactly one `<Allotment.Pane>`
 * rendered in `chat-interface-desktop.tsx` (in the same order). A mismatch
 * causes `allotment.resize(sizes)` to assign sizes to the wrong panes.
 */
export const allotmentPanelOrder = [
  'chat',
  'files',
  'explorer',
  'kernel',
  'viewer',
  'parameters',
  'editor',
  'converter',
  'details',
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

/** Type for all panel IDs (derived from panelIds constant) */
export type PanelId = (typeof panelIds)[number];

/** Type for desktop panel IDs (derived from desktopPanelIds constant) */
export type DesktopPanelId = (typeof desktopPanelIds)[number];

/**
 * Default panel state for new projects or when no stored state exists.
 */
export const defaultPanelState = {
  openPanels: {
    chat: true,
    files: false,
    explorer: false,
    kernel: false,
    parameters: true,
    editor: false,
    converter: false,
    details: false,
  },
  panelSizes: {
    chat: 300,
    files: 200,
    explorer: 300,
    kernel: 350,
    viewer: 420,
    parameters: 300,
    editor: 300,
    converter: 300,
    details: 300,
    revisions: 320,
  },
  mobileActiveTab: 'chat',
  kernelPaneview: {},
  parametersPaneview: {},
} as const satisfies {
  openPanels: Record<DesktopPanelId, boolean>;
  panelSizes: Record<PanelId, number>;
  mobileActiveTab: PanelId;
  kernelPaneview: Record<string, never>;
  parametersPaneview: Record<string, never>;
};
