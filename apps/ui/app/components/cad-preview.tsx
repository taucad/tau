import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import { Loader } from '#components/ui/loader.js';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { useCadPreview } from '#hooks/use-cad-preview.js';
import { cn } from '#utils/ui.utils.js';
import type { StageOptions } from '@taucad/three/react';

/**
 * Visual rendering settings for the CAD preview viewer.
 * Grouped into a single bag for extensibility -- new CadViewer props can be
 * added here without changing the top-level CadPreviewViewer API.
 */
export type CadPreviewGraphicsOptions = {
  readonly enableLines?: boolean;
  readonly enableSurfaces?: boolean;
  readonly enableMatcap?: boolean;
  readonly enableGizmo?: boolean;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly enablePostProcessing?: boolean;
  /** Forwarded as `className` to CadViewer (controls canvas background, e.g. "bg-muted"). */
  readonly viewerClassName?: string;
};

type CadPreviewViewerProps = {
  readonly className?: string;
  readonly enablePan?: boolean;
  readonly enableZoom?: boolean;
  readonly stageOptions?: StageOptions;
  readonly graphicsOptions?: CadPreviewGraphicsOptions;
};

/**
 * Self-contained CAD viewer that reads from CadPreviewProvider context.
 * Renders GraphicsProvider + CadViewer with built-in loading state.
 *
 * Must be rendered inside a CadPreviewProvider.
 *
 * @example
 * ```tsx
 * <CadPreviewProvider buildId="my-build" mainFile="main.ts" files={files}>
 *   <CadPreviewViewer
 *     className="size-full"
 *     enablePan
 *     enableZoom
 *     graphicsOptions={{ enableLines: false, viewerClassName: 'bg-muted' }}
 *   />
 * </CadPreviewProvider>
 * ```
 */
export const CadPreviewViewer = memo(function ({
  className,
  enablePan,
  enableZoom,
  stageOptions,
  graphicsOptions,
}: CadPreviewViewerProps): React.JSX.Element {
  const { geometries, graphicsRef, status, error } = useCadPreview();

  if (status === 'error') {
    return (
      <div className={cn('flex size-full items-center justify-center', className)}>
        <div className="flex flex-col items-center gap-3 text-destructive">
          <AlertTriangle className="size-10 opacity-60" strokeWidth={1.5} />
          <span className="max-w-sm text-center text-sm">{error?.message ?? 'Failed to render preview'}</span>
        </div>
      </div>
    );
  }

  if (geometries.length === 0) {
    return (
      <div className={cn('flex size-full items-center justify-center', className)}>
        <Loader className="size-12" />
      </div>
    );
  }

  return (
    <div className={cn('size-full', className)}>
      <GraphicsProvider graphicsRef={graphicsRef}>
        <CadViewer
          geometries={geometries}
          enablePan={enablePan}
          enableZoom={enableZoom}
          enableGrid={graphicsOptions?.enableGrid}
          enableAxes={graphicsOptions?.enableAxes}
          enableLines={graphicsOptions?.enableLines}
          enableSurfaces={graphicsOptions?.enableSurfaces}
          enableMatcap={graphicsOptions?.enableMatcap}
          enableGizmo={graphicsOptions?.enableGizmo}
          className={graphicsOptions?.viewerClassName}
          stageOptions={stageOptions}
        />
      </GraphicsProvider>
    </div>
  );
});

type CadPreviewStatusProps = {
  readonly className?: string;
};

/**
 * Rendering status overlay that shows the current CAD machine phase.
 * Reads from CadPreviewProvider context.
 *
 * Renders nothing when not in a loading/rendering state.
 */
export function CadPreviewStatus({ className }: CadPreviewStatusProps): React.ReactNode {
  const { status } = useCadPreview();

  if (status !== 'loading') {
    return undefined;
  }

  return (
    <div
      className={cn(
        'absolute top-4 right-4 z-10 flex items-center gap-2 rounded-md border bg-background/70 px-2 py-1 backdrop-blur-sm',
        className,
      )}
    >
      <span className="font-mono text-sm text-muted-foreground capitalize">{status}...</span>
      <Loader className="size-4" />
    </div>
  );
}
