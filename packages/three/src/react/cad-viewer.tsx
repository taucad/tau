import { memo } from 'react';
import { CadCanvas } from './cad-canvas.js';
import { GltfMesh } from './gltf-mesh.js';
import type { StageOptions } from './stage.js';
import type { ViewerStore, MeasureStore, SectionViewStore } from './stores/index.js';

type CadViewerProperties = {
  readonly gltf: Uint8Array<ArrayBuffer> | ReadonlyArray<Uint8Array<ArrayBuffer>>;
  readonly enableGizmo?: boolean;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly enableZoom?: boolean;
  readonly enablePan?: boolean;
  readonly enableDamping?: boolean;
  readonly enableMatcap?: boolean;
  readonly enableSurfaces?: boolean;
  readonly enableLines?: boolean;
  readonly upDirection?: 'x' | 'y' | 'z';
  readonly enableCentering?: boolean;
  readonly stageOptions?: StageOptions;
  readonly zoomSpeed?: number;
  readonly gizmoContainer?: HTMLElement | string;
  readonly className?: string;
  readonly onContextLost?: () => void;
  readonly viewerStore?: ViewerStore;
  readonly measureStore?: MeasureStore;
  readonly sectionViewStore?: SectionViewStore;
};

export const CadViewer = memo(function CadViewer({
  gltf,
  enableMatcap = false,
  enableSurfaces = true,
  enableLines = true,
  ...canvasProps
}: CadViewerProperties): React.JSX.Element {
  const gltfArray = Array.isArray(gltf) ? gltf : [gltf];

  return (
    <CadCanvas {...canvasProps}>
      {gltfArray.map((file, index) => (
        <GltfMesh
          key={index}
          gltfFile={file}
          enableMatcap={enableMatcap}
          enableSurfaces={enableSurfaces}
          enableLines={enableLines}
        />
      ))}
    </CadCanvas>
  );
});
