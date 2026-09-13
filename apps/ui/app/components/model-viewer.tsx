import { memo, useEffect } from 'react';
import { useActorRef } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { AlertTriangle } from 'lucide-react';
import type { Geometry } from '@taucad/types';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import { Loader } from '#components/ui/loader.js';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';
import { cn } from '#utils/ui.utils.js';
import type { StageOptions } from '#components/geometry/graphics/three/stage.js';
import type { RenderStatus } from '@taucad/react';

/**
 * Visual rendering settings for the model viewer.
 * Grouped into a single bag for extensibility.
 */
export type ModelViewerGraphicsOptions = {
  readonly enableLines?: boolean;
  readonly enableSurfaces?: boolean;
  readonly enableMatcap?: boolean;
  readonly enableGizmo?: boolean;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
  readonly enablePostProcessing?: boolean;
  readonly viewerClassName?: string;
};

/**
 * Props for the `ModelViewer` component.
 */
export type ModelViewerProps = {
  /** Geometries to display. Empty array shows a loading state. */
  readonly geometries: Geometry[];
  /**
   * External graphics actor ref. When provided, ModelViewer uses it instead of
   * creating its own `graphicsMachine`. Use this when the parent manages the
   * graphics lifecycle (e.g. `CadPreviewProvider`).
   */
  readonly graphicsRef?: ActorRefFrom<typeof graphicsMachine>;
  readonly className?: string;
  readonly enablePan?: boolean;
  readonly enableZoom?: boolean;
  readonly stageOptions?: StageOptions;
  readonly graphicsOptions?: ModelViewerGraphicsOptions;
  /** Error to display. When set, shows an error overlay instead of the viewer. */
  readonly error?: Error;
};

type ModelViewerCoreProps = Omit<ModelViewerProps, 'graphicsRef'> & {
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
};

/**
 * Core viewer that renders geometries using a provided `graphicsRef`.
 * Always receives a concrete graphics actor -- never creates its own.
 */
const ModelViewerCore = memo(function ModelViewerCore({
  geometries,
  graphicsRef,
  className,
  enablePan,
  enableZoom,
  stageOptions,
  graphicsOptions,
  error,
}: ModelViewerCoreProps): React.JSX.Element {
  useEffect(() => {
    if (geometries.length > 0) {
      graphicsRef.send({ type: 'updateGeometries', geometries, units: { length: 'mm' } });
    }
  }, [geometries, graphicsRef]);

  if (error) {
    return (
      <div
        role='alert'
        aria-label='Preview error'
        className={cn('flex size-full items-center justify-center', className)}
      >
        <div className='flex flex-col items-center gap-3 text-destructive'>
          <AlertTriangle className='size-10 opacity-60' strokeWidth={1.5} />
          <span className='max-w-sm text-center text-sm'>{error.message}</span>
        </div>
      </div>
    );
  }

  if (geometries.length === 0) {
    return (
      <div
        role='status'
        aria-label='Loading preview'
        aria-busy='true'
        className={cn('flex size-full items-center justify-center', className)}
      >
        <Loader className='size-12' />
      </div>
    );
  }

  return (
    <div role='img' aria-label='3D model preview' className={cn('size-full', className)}>
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

/**
 * Wrapper that creates an internal `graphicsMachine` when no external
 * `graphicsRef` is provided, then delegates to `ModelViewerCore`.
 */
const ModelViewerWithOwnGraphics = memo(function ModelViewerWithOwnGraphics(
  props: Omit<ModelViewerProps, 'graphicsRef'>,
): React.JSX.Element {
  const graphicsRef = useActorRef(graphicsMachine, {
    input: {
      defaultCameraFovAngle: defaultGraphicsSettings.cameraFovAngle,
      measureSnapDistance: 40,
      enableSurfaces: defaultGraphicsSettings.enableSurfaces,
      enableLines: defaultGraphicsSettings.enableLines,
      enableGizmo: defaultGraphicsSettings.enableGizmo,
      enableGrid: defaultGraphicsSettings.enableGrid,
      enableAxes: defaultGraphicsSettings.enableAxes,
      enableMatcap: defaultGraphicsSettings.enableMatcap,
      enablePostProcessing: defaultGraphicsSettings.enablePostProcessing,
      upDirection: defaultGraphicsSettings.upDirection,
      environmentPreset: defaultGraphicsSettings.environmentPreset,
      graphicsBackendPreference: defaultGraphicsSettings.graphicsBackend ?? 'webgl',
    },
  });

  return <ModelViewerCore {...props} graphicsRef={graphicsRef} />;
});

/**
 * Self-contained CAD model viewer that takes `Geometry[]` as input.
 *
 * Creates its own `graphicsMachine` internally by default, or uses an
 * externally provided `graphicsRef` when the parent manages the graphics
 * lifecycle (e.g. `CadPreviewProvider`).
 *
 * Renders via `GraphicsProvider` + `CadViewer`. No dependency on
 * `CadPreviewProvider`, `cadMachine`, or `FileManagerProvider`.
 *
 * @example
 * ```typescript
 * const { geometries } = useRender({
 *   clientOptions: options,
 *   code: { 'main.ts': modelCode },
 * });
 * return <ModelViewer geometries={geometries} enablePan enableZoom />;
 * ```
 */
export const ModelViewer = memo(function ModelViewer(props: ModelViewerProps): React.JSX.Element {
  const { graphicsRef, ...rest } = props;

  if (graphicsRef) {
    return <ModelViewerCore {...rest} graphicsRef={graphicsRef} />;
  }

  return <ModelViewerWithOwnGraphics {...rest} />;
});

/**
 * Props for the `RenderStatusOverlay` component.
 */
export type RenderStatusOverlayProps = {
  /** Current render status. Only shows overlay when `'loading'`. */
  readonly status: RenderStatus;
  readonly className?: string;
};

/**
 * Standalone rendering status overlay.
 *
 * Shows a loading indicator when the render status is `'loading'`.
 * Renders nothing for other statuses. Decoupled from any context provider.
 *
 * @param props - Status and optional className
 * @returns Overlay element or nothing
 */
export function RenderStatusOverlay({ status, className }: RenderStatusOverlayProps): React.ReactNode {
  if (status !== 'loading') {
    return undefined;
  }

  return (
    <div
      role='status'
      aria-label='Rendering in progress'
      className={cn(
        'absolute top-4 right-4 z-10 flex items-center gap-2 rounded-md border bg-background/70 px-2 py-1 backdrop-blur-sm',
        className,
      )}
    >
      <span className='font-mono text-sm text-muted-foreground capitalize'>{status}...</span>
      <Loader className='size-4' />
    </div>
  );
}
