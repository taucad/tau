// @taucad/three/react - React components, hooks, and stores
export { AxesHelper } from './axes-helper.js';
export { GltfMesh } from './gltf-mesh.js';
export { InfiniteGrid } from './infinite-grid.js';
export { Lights } from './lights.js';
export { SceneOverlay } from './scene-overlay.js';
export { SectionView } from './section-view.js';
export type { CutterProperties } from './section-view.js';
export {
  SectionViewControls,
  type AvailablePlane,
  type PlaneId,
  type PlaneSelectorId,
  type UpDirection,
} from './section-view-controls.js';
export { TransformControls, type TransformControlsProps } from './transform-controls-drei.js';
export { Stage, defaultStageOptions, type StageOptions } from './stage.js';
export { UpDirectionHandler } from './up-direction-handler.js';
export { useCameraFraming } from './hooks/use-camera-framing.js';
export { useCameraReset } from './use-camera-reset.js';
export { useGeometryBounds } from './hooks/use-geometry-bounds.js';
export { useSectionView, type SectionViewResult } from './hooks/use-section-view.js';
export { PostProcessing } from './post-processing.js';
export { Grid } from './grid.js';
export { ViewportGizmoCube } from './viewport-gizmo.js';
export { MeasureTool } from './measure-tool.js';
export { Controls } from './controls.js';
export { Scene } from './scene.js';
export { CadCanvas } from './cad-canvas.js';
export { CadViewer } from './cad-viewer.js';
export { presets, type CadViewerPreset } from './presets.js';

// Zustand stores
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
