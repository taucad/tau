import { memo } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { useSelector } from '@xstate/react';
import { ModelViewer, RuntimeStatusOverlay } from '#components/model-viewer.js';
import type { ModelViewerGraphicsOptions, ModelViewerState } from '#components/model-viewer.js';
import { useCadPreview } from '#hooks/use-cad-preview.js';
import type { CadPreviewStatus } from '#hooks/use-cad-preview.js';
import type { StageOptions } from '#components/geometry/graphics/three/stage.js';

/**
 * Visual rendering settings for the CAD preview viewer.
 * Alias for `ModelViewerGraphicsOptions` for backward compatibility.
 */
export type CadPreviewGraphicsOptions = ModelViewerGraphicsOptions;

type CadPreviewViewerProps = {
  readonly className?: string;
  readonly enablePan?: boolean;
  readonly enableZoom?: boolean;
  readonly initialVerticalFieldOfView?: number;
  readonly stageOptions?: StageOptions;
  readonly graphicsOptions?: CadPreviewGraphicsOptions;
  /** A larger artifact is not handed to three.js; a notice asks to open the project instead. */
  readonly maxArtifactBytes?: number;
};

const cadPreviewStatusToViewerState = (status: CadPreviewStatus, hasArtifact: boolean): ModelViewerState => {
  // Keep the last settled frame visible during parameter re-renders; only
  // block the viewport with a full-screen loader on the initial load.
  if (status === 'loading') {
    return hasArtifact ? 'ready' : 'loading';
  }

  return 'ready';
};

/**
 * Thin adapter over `ModelViewer` that reads from `CadPreviewProvider` context.
 *
 * Must be rendered inside a `CadPreviewProvider`.
 *
 * @example
 * ```tsx
 * <CadPreviewProvider projectId="my-build" mainFile="main.ts" files={files}>
 *   <CadPreviewViewer
 *     className="size-full"
 *     enablePan
 *     enableZoom
 *     graphicsOptions={{ enableLines: false, viewerClassName: 'bg-muted' }}
 *   />
 * </CadPreviewProvider>
 * ```
 */
export const CadPreviewViewer = memo(function CadPreviewViewer({
  className,
  enablePan,
  enableZoom,
  initialVerticalFieldOfView,
  stageOptions,
  graphicsOptions,
  maxArtifactBytes,
}: CadPreviewViewerProps): React.JSX.Element {
  const { artifact, artifactHash, graphicsRef, status, error } = useCadPreview();
  const enableLines = useSelector(graphicsRef, (state) => state.context.enableLines);
  const enableSurfaces = useSelector(graphicsRef, (state) => state.context.enableSurfaces);
  const enableMatcap = useSelector(graphicsRef, (state) => state.context.enableMatcap);
  const enableGizmo = useSelector(graphicsRef, (state) => state.context.enableGizmo);
  const enableGrid = useSelector(graphicsRef, (state) => state.context.enableGrid);
  const enableAxes = useSelector(graphicsRef, (state) => state.context.enableAxes);

  if (artifact && maxArtifactBytes !== undefined && artifact.content.length > maxArtifactBytes) {
    return (
      <p
        role='status'
        className={cn('flex items-center justify-center p-4 text-center text-sm text-muted-foreground', className)}
      >
        Too large to preview. Open the project to view it.
      </p>
    );
  }

  return (
    <ModelViewer
      artifact={artifact}
      artifactHash={artifactHash}
      viewerState={cadPreviewStatusToViewerState(status, Boolean(artifact))}
      graphicsRef={graphicsRef}
      className={className}
      enablePan={enablePan}
      enableZoom={enableZoom}
      initialVerticalFieldOfView={initialVerticalFieldOfView}
      stageOptions={stageOptions}
      graphicsOptions={{
        enableLines,
        enableSurfaces,
        enableMatcap,
        enableGizmo,
        enableGrid,
        enableAxes,
        ...graphicsOptions,
      }}
      error={status === 'error' ? (error ?? new Error('Failed to render preview')) : error}
    />
  );
});

type CadPreviewStatusProps = {
  readonly className?: string;
};

/**
 * Rendering status overlay that shows the current CAD machine phase.
 * Reads from `CadPreviewProvider` context.
 *
 * Renders nothing when not in a loading/rendering state.
 */
export function CadPreviewStatus({ className }: CadPreviewStatusProps): React.ReactNode {
  const { status } = useCadPreview();

  return (
    <RuntimeStatusOverlay
      status={
        status === 'loading' ? 'evaluating' : status === 'ready' ? 'ready' : status === 'error' ? 'error' : 'closed'
      }
      className={className}
    />
  );
}
