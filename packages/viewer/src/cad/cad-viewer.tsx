import { memo, useId, useLayoutEffect } from 'react';
import type { CanvasProps } from '@react-three/fiber';
import { asKnownArtifact } from '@taucad/runtime';
import type { Artifact } from '@taucad/runtime';
import { GltfMesh } from '#graphics/three/react/gltf-mesh.jsx';
import type { ModelComponentSecondaryPointerTarget } from '#graphics/three/react/gltf-mesh.jsx';
import { ThreeProvider } from '#graphics/three/three-context.jsx';
import type { ThreeViewerProperties } from '#graphics/three/three-viewer-properties.js';
import { SvgViewer } from '#graphics/svg/svg-viewer.jsx';
import { WebglErrorBoundary } from '#cad/webgl-error-boundary.jsx';
import { WebglErrorFallback } from '#cad/webgl-fallback.jsx';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.jsx';
import { resolveGraphicsBackendPreference } from '#graphics/graphics-backend.js';
import { useViewerEnvironment } from '#environment/viewer-environment.jsx';

type CadViewerCanvasEventProperties = Pick<CanvasProps, 'eventSource' | 'eventPrefix'>;

type CadViewerProperties = Omit<ThreeViewerProperties, 'graphicsBackend'> &
  CadViewerCanvasEventProperties & {
    readonly artifact?: Artifact;
    readonly artifactHash?: string;
    readonly sourceFile?: string;
    readonly enableSurfaces?: boolean;
    readonly enableLines?: boolean;
    readonly enableMatcap?: boolean;
    readonly onModelComponentSecondaryPointerCandidate?: (
      target: ModelComponentSecondaryPointerTarget | undefined,
    ) => void;
  };

/**
 * Holds the canvas's place until the WebGPU capability probe answers. It declares a canvas that has not drawn, so the
 * stage stays busy for the whole wait rather than reporting ready before any canvas exists.
 *
 * @returns An empty stage-coloured placeholder.
 */
function CanvasPendingCapability(): React.JSX.Element {
  const graphicsRef = useGraphics();
  const placeholderId = useId();
  useLayoutEffect(() => {
    graphicsRef.send({ type: 'canvasMounted', canvasId: placeholderId });
    return () => {
      graphicsRef.send({ type: 'canvasUnmounted', canvasId: placeholderId });
    };
  }, [graphicsRef, placeholderId]);
  return <div className='size-full bg-background' />;
}

/**
 * Renders a CAD artifact: SVG artifacts in the SVG viewer and GLTF artifacts in a Three.js canvas on the resolved graphics backend, behind a WebGL error boundary.
 *
 * @public
 */
export const CadViewer = memo(
  ({
    artifact,
    artifactHash,
    sourceFile,
    enableSurfaces = true,
    enableLines = true,
    enableMatcap = false,
    onModelComponentSecondaryPointerCandidate,
    ...properties
  }: CadViewerProperties): React.JSX.Element => {
    const { graphicsBackend } = useViewerEnvironment();
    const gpuAvailable = useGraphicsSelector((state) => state.context.webGpuAvailable);
    const isGpuProbeSettled = useGraphicsSelector((state) => state.context.webGpuProbeSettled);
    const requestedGltfRevision = useGraphicsSelector((state) => state.context.gltfPresentation.requestedRevision);

    const graphicsBackendEffective = resolveGraphicsBackendPreference(graphicsBackend, gpuAvailable);

    const known = artifact === undefined ? undefined : asKnownArtifact(artifact);
    if (known?.mimeType === 'image/svg+xml') {
      return <SvgViewer enableGrid={properties.enableGrid} enableAxes={properties.enableAxes} artifact={known} />;
    }

    let scene: React.ReactNode;
    if (known?.mimeType === 'model/gltf-binary') {
      scene = (
        <GltfMesh
          gltfFile={known.content}
          sourceFile={sourceFile}
          geometryHash={artifactHash}
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

    if (graphicsBackend === 'webgpu' && !isGpuProbeSettled) {
      // A WebGPU-preferring viewer mounts once, on the backend the probe picks: a canvas mounted on WebGL while the
      // probe runs would be replaced, and on a software adapter its GPU work delays the probe's answer by seconds.
      return <CanvasPendingCapability />;
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
