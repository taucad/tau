import type { CanvasProps } from '@react-three/fiber';
import { Canvas } from '@react-three/fiber';
import { Scene } from './scene.js';
import { SceneOverlay } from './scene-overlay.js';
import { PostProcessing } from './post-processing.js';
import { Grid } from './grid.js';
import { AxesHelper } from './axes-helper.js';
import type { StageOptions } from './stage.js';
import { CadStoreProvider } from './stores/store-context.js';
import type { ViewerStore, MeasureStore, SectionViewStore } from './stores/index.js';

type CadCanvasProperties = CanvasProps & {
  readonly enableGizmo?: boolean;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly enableZoom?: boolean;
  readonly enablePan?: boolean;
  readonly enableDamping?: boolean;
  readonly upDirection?: 'x' | 'y' | 'z';
  readonly enableCentering?: boolean;
  readonly stageOptions?: StageOptions;
  readonly zoomSpeed?: number;
  readonly gizmoContainer?: HTMLElement | string;
  readonly className?: string;
  readonly geometryKey?: string;
  readonly onSceneRadiusChange?: (radius: number) => void;
  readonly onResetCamera?: () => void;
  readonly onContextLost?: () => void;
  readonly viewerStore?: ViewerStore;
  readonly measureStore?: MeasureStore;
  readonly sectionViewStore?: SectionViewStore;
};

export function CadCanvas({
  children,
  enableGizmo = false,
  enableGrid = false,
  enableAxes = false,
  enableZoom = true,
  enablePan = true,
  enableDamping = true,
  upDirection = 'z',
  enableCentering = false,
  className,
  stageOptions,
  zoomSpeed = 2,
  gizmoContainer,
  geometryKey,
  onSceneRadiusChange,
  onResetCamera,
  onContextLost,
  viewerStore,
  measureStore,
  sectionViewStore,
  ...canvasProps
}: CadCanvasProperties): React.JSX.Element {
  const dpr = Math.min(globalThis.devicePixelRatio ?? 1, 2);

  return (
    <CadStoreProvider viewerStore={viewerStore} measureStore={measureStore} sectionViewStore={sectionViewStore}>
      <Canvas
        gl={{
          logarithmicDepthBuffer: true,
          antialias: true,
          stencil: true,
        }}
        dpr={dpr}
        frameloop="demand"
        className={className}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 1;
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            onContextLost?.();
          });
        }}
        {...canvasProps}
      >
        <Scene
          enableGizmo={enableGizmo}
          enableCentering={enableCentering}
          enableDamping={enableDamping}
          enableZoom={enableZoom}
          enablePan={enablePan}
          upDirection={upDirection}
          stageOptions={stageOptions}
          zoomSpeed={zoomSpeed}
          gizmoContainer={gizmoContainer}
          geometryKey={geometryKey}
          onSceneRadiusChange={onSceneRadiusChange}
          onResetCamera={onResetCamera}
        >
          {children}
        </Scene>
        <PostProcessing />
        <SceneOverlay>
          {enableAxes ? <AxesHelper /> : undefined}
          {enableGrid ? <Grid /> : undefined}
        </SceneOverlay>
      </Canvas>
    </CadStoreProvider>
  );
}
