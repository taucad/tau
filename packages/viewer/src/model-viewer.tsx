import { memo, useCallback, useEffect, useMemo } from 'react';
import { useActorRef } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { AlertTriangle } from 'lucide-react';
import { asKnownArtifact } from '@taucad/runtime';
import type { Artifact, DocumentStatus } from '@taucad/runtime';
import { CadViewer } from '#cad/cad-viewer.jsx';
import { Loader } from '@taucad/ui/components/loader';
import { GraphicsProvider, useModelInteractionRef } from '#hooks/use-graphics.jsx';
import type { ModelComponentSecondaryPointerTarget } from '#graphics/three/react/gltf-mesh.jsx';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import { buildGeometryComponentReference } from '#graphics/metadata/geometry-component-reference.js';
import type { GeometryComponentReference } from '@taucad/types';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { defaultGraphicsSettings } from '#graphics/graphics-settings.js';
import { cn } from '@taucad/ui/utils/cn';
import type { StageOptions } from '#graphics/three/stage-options.js';
import { isEmptyGlb } from '#utils/inspect-glb.js';

/**
 * Visual rendering settings for the model viewer.
 * Grouped into a single bag for extensibility.
 * @public
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
 * @public
 */
export type ModelViewerState = 'loading' | 'ready';

/**
 * Props for the `RuntimeErrorOverlay` component.
 * @public
 */
export type RuntimeErrorOverlayProps = {
  /** The runtime's own text. */
  readonly message: string;
  /** A neutral sentence with the next step; when set, `message` moves behind a disclosure. */
  readonly summary?: string;
  readonly className?: string;
};

/** What a preview says when it fails; the runtime text stays one disclosure away. */
const previewFailureSummary = 'Preview could not load. Open the project to see the error.';

/**
 * Shared accessible presentation for CAD runtime failures. With a summary, colour marks only the glyph.
 *
 * @public
 */
export function RuntimeErrorOverlay({ message, summary, className }: RuntimeErrorOverlayProps): React.JSX.Element {
  return (
    <div role='alert' aria-label='CAD runtime error' className={cn('flex items-center gap-2', className)}>
      <AlertTriangle aria-hidden className='size-5 shrink-0 text-feature' strokeWidth={1.5} />
      {summary === undefined ? (
        <span className='max-w-sm text-sm text-feature'>{message}</span>
      ) : (
        <div className='flex max-w-sm flex-col gap-1'>
          <p className='text-sm'>{summary}</p>
          <details className='text-xs text-muted-foreground'>
            <summary>Details</summary>
            <code className='font-mono break-words'>{message}</code>
          </details>
        </div>
      )}
    </div>
  );
}

/**
 * Props for the `ModelViewer` component.
 * @public
 */
export type ModelViewerProps = {
  /** Rendered artifact to display. Undefined shows a loading state unless `viewerState` overrides. */
  readonly artifact: Artifact | undefined;
  /** Identity of the successful rendering that produced `artifact`. */
  readonly artifactHash: string | undefined;
  /**
   * Lifecycle hint from the surrounding pipeline. Defaults to `'loading'` when
   * artifact is absent and `'ready'` otherwise — preserves behaviour for
   * direct callers (e.g. hero viewer) that have no settled-render signal.
   */
  readonly viewerState?: ModelViewerState;
  /**
   * External graphics actor ref. When provided, ModelViewer uses it instead of
   * creating its own `graphicsMachine`. Use this when the parent manages the
   * graphics lifecycle (e.g. `CadPreviewProvider`).
   */
  readonly graphicsRef?: ActorRefFrom<typeof graphicsMachine>;
  readonly className?: string;
  readonly enablePan?: boolean;
  readonly enableZoom?: boolean;
  readonly initialVerticalFieldOfView?: number;
  readonly stageOptions?: StageOptions;
  readonly graphicsOptions?: ModelViewerGraphicsOptions;
  /** Error to display. When set, shows an error overlay instead of the viewer. */
  readonly error?: Error;
  /** The project path of the file that produced `artifact`; components can be referenced only when it is known. */
  readonly sourceFile?: string;
  /** Called with the structured reference of a component the person secondary-clicks (right-click or long press). */
  readonly onComponentReference?: (reference: GeometryComponentReference) => void;
  /**
   * Called on every right press on the model with the part under it, or `undefined` when it missed every part. The
   * press precedes its release, so a host that opens a part menu decides on release whether the press was a click or
   * a camera pan (the Tau app's viewer secondary gesture).
   */
  readonly onComponentSecondaryPointerCandidate?: (target: ModelComponentSecondaryPointerTarget | undefined) => void;
  /**
   * The element (or its selector) the view cube draws in. With one, the cube sits in that element's top-right corner,
   * as in the Tau workbench; without one it sits in the canvas's bottom-right corner.
   */
  readonly gizmoContainer?: HTMLElement | string;
};

type ReferencingCadViewerProps = React.ComponentProps<typeof CadViewer> & {
  readonly onComponentReference?: (reference: GeometryComponentReference) => void;
  readonly onComponentSecondaryPointerCandidate?: (target: ModelComponentSecondaryPointerTarget | undefined) => void;
};

/** The CAD viewer, turning a secondary click on a component into that component's structured reference. */
function ReferencingCadViewer({
  onComponentReference,
  onComponentSecondaryPointerCandidate,
  ...properties
}: ReferencingCadViewerProps): React.JSX.Element {
  const modelInteractionRef = useModelInteractionRef();
  const handleSecondaryPointerCandidate = useCallback(
    (target: ModelComponentSecondaryPointerTarget | undefined) => {
      onComponentSecondaryPointerCandidate?.(target);
      if (!target || !onComponentReference) {
        return;
      }
      const { manifest } = getModelInteractionUnitState(modelInteractionRef.getSnapshot().context, target.unitId);
      const node = manifest?.nodesById[target.componentId];
      const reference = manifest && node ? buildGeometryComponentReference(manifest, node) : undefined;
      if (reference) {
        onComponentReference(reference);
      }
    },
    [modelInteractionRef, onComponentReference, onComponentSecondaryPointerCandidate],
  );

  return (
    <CadViewer
      {...properties}
      onModelComponentSecondaryPointerCandidate={
        onComponentReference === undefined && onComponentSecondaryPointerCandidate === undefined
          ? undefined
          : handleSecondaryPointerCandidate
      }
    />
  );
}

type ModelViewerCoreProps = Omit<ModelViewerProps, 'graphicsRef'> & {
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
};

/**
 * Core viewer that renders geometry using a provided `graphicsRef`.
 * Always receives a concrete graphics actor -- never creates its own.
 */
const ModelViewerCore = memo(function ModelViewerCore({
  artifact,
  artifactHash,
  viewerState,
  graphicsRef,
  className,
  enablePan,
  enableZoom,
  initialVerticalFieldOfView,
  stageOptions,
  graphicsOptions,
  error,
  sourceFile,
  onComponentReference,
  onComponentSecondaryPointerCandidate,
  gizmoContainer,
}: ModelViewerCoreProps): React.JSX.Element {
  const effectiveState: ModelViewerState = viewerState ?? (artifact ? 'ready' : 'loading');
  const knownArtifact = useMemo(() => (artifact ? asKnownArtifact(artifact) : undefined), [artifact]);
  const emptyModel = useMemo(
    () => knownArtifact?.mimeType === 'model/gltf-binary' && isEmptyGlb(knownArtifact.content),
    [knownArtifact],
  );
  useEffect(() => {
    if (emptyModel || (effectiveState === 'ready' && !error && !knownArtifact)) {
      graphicsRef.send({ type: 'clearArtifact' });
    } else if (knownArtifact && artifactHash !== undefined) {
      graphicsRef.send({ type: 'updateArtifact', artifact: knownArtifact, hash: artifactHash });
    }
  }, [knownArtifact, artifactHash, graphicsRef, effectiveState, emptyModel, error]);

  if (error && !artifact) {
    return (
      <RuntimeErrorOverlay
        message={error.message}
        summary={previewFailureSummary}
        className={cn('size-full flex-col justify-center p-3 text-center', className)}
      />
    );
  }

  if (effectiveState === 'loading') {
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

  if (!artifact || emptyModel) {
    return (
      <div
        role='status'
        aria-label='Empty model'
        className={cn('flex size-full items-center justify-center text-sm text-muted-foreground', className)}
      >
        Empty model
      </div>
    );
  }

  if (!knownArtifact) {
    return (
      <div
        role='status'
        aria-label='Unsupported preview format'
        className={cn('flex size-full items-center justify-center text-sm text-muted-foreground', className)}
      >
        Preview format is not supported.
      </div>
    );
  }

  return (
    <div className='relative size-full'>
      <div role='img' aria-label='3D model preview' className={cn('size-full', className)}>
        <GraphicsProvider graphicsRef={graphicsRef} initialVerticalFieldOfView={initialVerticalFieldOfView}>
          <ReferencingCadViewer
            artifact={artifact}
            artifactHash={artifactHash}
            sourceFile={sourceFile}
            onComponentReference={onComponentReference}
            onComponentSecondaryPointerCandidate={onComponentSecondaryPointerCandidate}
            enablePan={enablePan}
            enableZoom={enableZoom}
            enableGrid={graphicsOptions?.enableGrid}
            enableAxes={graphicsOptions?.enableAxes}
            enableLines={graphicsOptions?.enableLines}
            enableSurfaces={graphicsOptions?.enableSurfaces}
            enableMatcap={graphicsOptions?.enableMatcap}
            enableGizmo={graphicsOptions?.enableGizmo}
            gizmoContainer={gizmoContainer}
            className={graphicsOptions?.viewerClassName}
            stageOptions={stageOptions}
          />
        </GraphicsProvider>
      </div>
      {error ? (
        <RuntimeErrorOverlay
          message={error.message}
          summary={previewFailureSummary}
          className='absolute top-4 right-4 left-4 z-10 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-md border border-feature/40 bg-background/90 p-2 shadow-sm backdrop-blur-sm'
        />
      ) : null}
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
      enableSurfaces: defaultGraphicsSettings.enableSurfaces,
      enableLines: defaultGraphicsSettings.enableLines,
      enableGizmo: defaultGraphicsSettings.enableGizmo,
      enableGrid: defaultGraphicsSettings.enableGrid,
      enableAxes: defaultGraphicsSettings.enableAxes,
      enableMatcap: defaultGraphicsSettings.enableMatcap,
      enablePostProcessing: defaultGraphicsSettings.enablePostProcessing,
      upDirection: defaultGraphicsSettings.upDirection,
      graphicsBackend: defaultGraphicsSettings.graphicsBackend ?? 'webgl',
    },
  });

  return <ModelViewerCore {...props} graphicsRef={graphicsRef} />;
});

/**
 * Self-contained CAD model viewer that takes one runtime artifact as input.
 *
 * Creates its own `graphicsMachine` internally by default, or uses an
 * externally provided `graphicsRef` when the parent manages the graphics
 * lifecycle (e.g. `CadPreviewProvider`).
 *
 * Renders via `GraphicsProvider` + `CadViewer`. No dependency on
 * `CadPreviewProvider`, `cadMachine`, or `FileManagerProvider`. Requires a
 * `KeyboardProvider` from `@taucad/ui/components/keyboard` above it, which
 * dispatches the viewer's shortcuts; rendering a model without one throws.
 *
 * @public
 * @example <caption>Show a runtime artifact with pan and zoom</caption>
 * ```tsx
 * import type { Artifact } from '@taucad/runtime';
 * import { KeyboardProvider } from '@taucad/ui/components/keyboard';
 * import { ModelViewer } from '@taucad/viewer/model-viewer';
 *
 * export const Preview = ({ artifact, hash }: { readonly artifact: Artifact; readonly hash: string }): React.JSX.Element => (
 *   <KeyboardProvider>
 *     <ModelViewer artifact={artifact} artifactHash={hash} enablePan enableZoom />
 *   </KeyboardProvider>
 * );
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
 * Props for the `RuntimeStatusOverlay` component.
 * @public
 */
export type RuntimeStatusOverlayProps = {
  /** Current render status. Only shows overlay while connecting or rendering. */
  readonly status: DocumentStatus;
  readonly className?: string;
};

/**
 * Standalone rendering status overlay.
 *
 * Shows a loading indicator while the runtime is connecting or rendering.
 * Renders nothing for other statuses. Decoupled from any context provider.
 *
 * @param props - Status and optional className
 * @returns Overlay element or nothing
 * @public
 */
export function RuntimeStatusOverlay({ status, className }: RuntimeStatusOverlayProps): React.ReactNode {
  if (status !== 'evaluating') {
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
