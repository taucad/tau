/**
 * @taucad/three/react - React components, hooks, and stores for CAD rendering.
 *
 * Provides a complete set of React Three Fiber components for rendering
 * CAD geometry with measurement, section view, and viewport gizmo features.
 * All state is managed via zustand stores.
 *
 * @packageDocumentation
 */

// ── High-level components ─────────────────────────────────────────────────────

export { CadViewer } from './cad-viewer.js';
export { CadCanvas } from './cad-canvas.js';
export { presets, type CadViewerPreset } from './presets.js';

// ── Scene composition ─────────────────────────────────────────────────────────

export { Scene } from './scene.js';
export { Stage, defaultStageOptions, type StageOptions } from './stage.js';
export { GltfMesh } from './gltf-mesh.js';
export { Lights } from './lights.js';
export { Grid } from './grid.js';
export { AxesHelper } from './axes-helper.js';
export { PostProcessing } from './post-processing.js';
export { InfiniteGrid } from './infinite-grid.js';
export { SceneOverlay } from './scene-overlay.js';
export { Controls } from './controls.js';
export { UpDirectionHandler } from './up-direction-handler.js';

// ── Interactive features ──────────────────────────────────────────────────────

export { MeasureTool } from './measure-tool.js';
export { SectionView, type CutterProperties } from './section-view.js';
export {
  SectionViewControls,
  type AvailablePlane,
  type PlaneId,
  type PlaneSelectorId,
  type UpDirection,
} from './section-view-controls.js';
export { TransformControls, type TransformControlsProps } from './transform-controls-drei.js';
export { ViewportGizmoCube } from './viewport-gizmo.js';

// ── Hooks ─────────────────────────────────────────────────────────────────────

export { useCameraFraming } from './hooks/use-camera-framing.js';
export { useCameraReset } from './use-camera-reset.js';
export { useGeometryBounds } from './hooks/use-geometry-bounds.js';
export { useSectionView, type SectionViewResult } from './hooks/use-section-view.js';

// ── Stores ────────────────────────────────────────────────────────────────────

export {
  createViewerStore,
  createMeasureStore,
  createSectionViewStore,
  CadStoreProvider,
  CadStoreContext,
  useViewerStore,
  useMeasureStore,
  useSectionViewStore,
} from './stores/index.js';

export type {
  ViewerStore,
  ViewerStoreOptions,
  ViewerState,
  Measurement,
  MeasureUnits,
  MeasureStore,
  MeasureStoreOptions,
  MeasureState,
  AvailableSectionView,
  SectionViewStore,
  SectionViewStoreOptions,
  SectionViewState,
  CadStores,
} from './stores/index.js';
