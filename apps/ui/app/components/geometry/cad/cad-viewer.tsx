import { memo } from 'react';
import type { CanvasProps } from '@react-three/fiber';
import type { CadAssemblyDisplay } from '#machines/cad.machine.js';
import { asKnownArtifact } from '@taucad/runtime';
import type { Artifact } from '@taucad/runtime';
import { GltfMesh } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import type { ModelComponentSecondaryPointerTarget } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { ThreeProvider } from '#components/geometry/graphics/three/three-context.js';
import type { ThreeViewerProperties } from '#components/geometry/graphics/three/three-viewer-properties.js';
import { SvgViewer } from '#components/geometry/graphics/svg/svg-viewer.js';
import { WebglErrorBoundary } from '#components/geometry/cad/webgl-error-boundary.js';
import { WebglErrorFallback } from '#components/geometry/cad/webgl-fallback.js';
import { useFeature } from '#flags/use-feature.js';
import { useGraphicsSelector } from '#hooks/use-graphics.js';
import { resolveViewerGraphicsBackend } from '#components/geometry/graphics/graphics-backend.js';

type CadViewerCanvasEventProperties = Pick<CanvasProps, 'eventSource' | 'eventPrefix'>;

type CadViewerProperties = Omit<ThreeViewerProperties, 'graphicsBackend'> &
  CadViewerCanvasEventProperties & {
    readonly artifact?: Artifact;
    readonly artifactHash?: string;
    readonly assemblyDisplay?: CadAssemblyDisplay;
    readonly sourceFile?: string;
    readonly enableSurfaces?: boolean;
    readonly enableLines?: boolean;
    readonly enableMatcap?: boolean;
    readonly onModelComponentSecondaryPointerCandidate?: (
      target: ModelComponentSecondaryPointerTarget | undefined,
    ) => void;
  };

export const CadViewer = memo(
  ({
    artifact,
    artifactHash,
    assemblyDisplay,
    sourceFile,
    enableSurfaces = true,
    enableLines = true,
    enableMatcap = false,
    onModelComponentSecondaryPointerCandidate,
    ...properties
  }: CadViewerProperties): React.JSX.Element => {
    const webGpuEnabled = useFeature('webGpu');
    const gpuAvailable = useGraphicsSelector((state) => state.context.webGpuAvailable);
    const requestedGltfRevision = useGraphicsSelector((state) => state.context.gltfPresentation.requestedRevision);

    const graphicsBackendEffective = resolveViewerGraphicsBackend(webGpuEnabled, gpuAvailable);

    const known = artifact === undefined ? undefined : asKnownArtifact(artifact);
    if (known?.mimeType === 'image/svg+xml') {
      return <SvgViewer enableGrid={properties.enableGrid} enableAxes={properties.enableAxes} artifact={known} />;
    }

    let scene: React.ReactNode;
    if (assemblyDisplay !== undefined || known?.mimeType === 'model/gltf-binary') {
      scene = (
        <GltfMesh
          gltfFile={known?.mimeType === 'model/gltf-binary' ? known.content : undefined}
          assemblyDisplay={assemblyDisplay}
          sourceFile={sourceFile}
          geometryHash={assemblyDisplay?.root.digest ?? artifactHash}
          presentationRevision={requestedGltfRevision}
          enableMatcap={enableMatcap}
          enableSurfaces={enableSurfaces}
          enableLines={enableLines}
          onModelComponentSecondaryPointerCandidate={onModelComponentSecondaryPointerCandidate}
        />
      );
    } else if (artifact !== undefined) {
      return (
        <div
          role='status'
          className='flex size-full items-center justify-center bg-background text-sm text-muted-foreground'
        >
          No viewer is available for {artifact.mimeType}.
        </div>
      );
    }

    return (
      <WebglErrorBoundary fallback={(errorProps) => <WebglErrorFallback {...errorProps} />}>
        <ThreeProvider {...properties} graphicsBackend={graphicsBackendEffective}>
          {scene}
        </ThreeProvider>
      </WebglErrorBoundary>
    );
  },
);
