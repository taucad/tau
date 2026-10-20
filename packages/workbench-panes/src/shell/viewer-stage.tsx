/**
 * The viewer's canvas stage, drawn by both the Tau app and the agent plugin viewer: the focusable canvas region with the
 * part menu's gesture and keys, the hover label, the status and failure overlays and the bottom controls. A host keeps
 * its model source, its canvas element (through `renderCanvas`), its layout container and its app-only slot content.
 */
import { useCallback, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { cn } from '@taucad/ui/utils/cn';
import type { ModelComponentSecondaryPointerTarget } from '@taucad/viewer/graphics/three/react/gltf-mesh';
import { RuntimeErrorOverlay } from '@taucad/viewer/model-viewer';
import { HoveredModelComponentBadge, placeModelComponentNameBadge } from '#component-menu/component-name-badge.jsx';
import type { ViewerPartMenu, ViewerPartMenuDecorator } from '#component-menu/use-viewer-part-menu.jsx';
import type { GraphicsRef } from '#host/workbench-host.jsx';
import { ViewerStatusPill } from '#shell/viewer-status.jsx';

/**
 * What the stage shows over the canvas besides the model: nothing, running work, or a failure.
 *
 * @public
 */
export type ViewerStageStatus =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{
      kind: 'loading';
      /** What is running, such as "Loading gear.glb" or a build phase. */
      label: string;
      /** From 0 to 1; omit while unknown. */
      progress?: number;
    }>
  | Readonly<{
      kind: 'failed';
      /** The error, shown in full or under "Details" when there is a summary. */
      message: string;
      /** A plain-language line shown above the details. */
      summary?: string;
    }>;

/**
 * What the stage hands the host's canvas element (`CadViewer` or `ModelViewer`).
 *
 * @public
 */
export type ViewerStageCanvasProps = Readonly<{
  /** The selector of the region the view cube draws in, the canvas region itself. */
  gizmoContainer: string;
  /**
   * The canvas region, for the canvas's pointer events. Keep the default offset computation: a window-relative event
   * prefix mis-rays a docked panel.
   */
  eventSource: React.RefObject<HTMLElement>;
  /** The part under a right press, for the part menu; absent while the stage has no part menu. */
  onComponentSecondaryPointerCandidate?: (target: ModelComponentSecondaryPointerTarget | undefined) => void;
}>;

/**
 * Props for {@link ViewerStage}.
 *
 * @public
 */
export type ViewerStageProps = Readonly<
  Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'> & {
    /** The viewer's graphics actor; the stage reads whether a model is drawn and which unit it is. */
    graphicsRef: GraphicsRef;
    /** The canvas region's element id, unique on the page; the view cube draws inside it. */
    regionId: string;
    /** The canvas region's accessible name. "CAD canvas" when absent. */
    regionLabel?: string;
    /** Draws the host's canvas element with the stage's region wiring. */
    renderCanvas: (canvas: ViewerStageCanvasProps) => React.ReactNode;
    /**
     * The part menu from `useViewerPartMenu`. Without it the region takes no focus and offers no part menu, as in the
     * agent plugin's inline card or while a host's renderer is closed.
     */
    partMenu?: ViewerPartMenu;
    /** Adds host-only data to the open part menu, such as the Tau app's part thumbnail. */
    decoratePartMenu?: ViewerPartMenuDecorator;
    /**
     * Whether the canvas draws a model: the status sits higher over one and the hover label shows only then. Whether the
     * graphics actor holds an artifact when absent.
     */
    isModelShown?: boolean;
    /** What is running or failed. Idle when absent. */
    status?: ViewerStageStatus;
    /** Host content under the status, such as an upgrade banner or a view notice. */
    statusExtra?: React.ReactNode;
    /** The bottom controls, usually `ViewerControls` with the host's slots; the hover label flips above them. */
    controls?: React.ReactNode;
    /** Host overlays inside the canvas region, such as an empty-state message. */
    children?: React.ReactNode;
    /** Classes on the stage's root, which also takes the other HTML attributes, such as a test id or key handler. */
    className?: string;
  }
>;

/** Over a model the status sits in the upper sixth, below the view cube and the tab strip, above the model's middle. */
const statusOverModelClasses = 'top-[clamp(5rem,16%,8rem)]';

/** Before a model is drawn the status sits where the model will appear. */
const statusWithoutModelClasses = 'top-1/2 -translate-y-1/2';

/**
 * The status slot: the loading pill and the host's status content, placed by whether a model is drawn.
 *
 * @param props - The status, the host content and whether a model is drawn.
 * @returns The slot, or nothing with neither to show.
 */
function StageStatus({
  status,
  statusExtra,
  hasModel,
}: Readonly<Pick<ViewerStageProps, 'status' | 'statusExtra'> & { hasModel: boolean }>): React.ReactNode {
  const loading = status?.kind === 'loading' ? status : undefined;
  if (loading === undefined && statusExtra === undefined) {
    return null;
  }
  return (
    <div
      data-slot='viewer-status'
      className={cn(
        'absolute right-2 left-2 z-10 mx-auto flex w-fit max-w-full flex-col gap-2',
        hasModel ? statusOverModelClasses : statusWithoutModelClasses,
      )}
    >
      {loading === undefined ? null : <ViewerStatusPill label={loading.label} progress={loading.progress} />}
      {statusExtra}
    </div>
  );
}

/**
 * The canvas stage. Render it inside the host's `GraphicsProvider`, `KeyboardProvider` and `TooltipProvider`. Pointer
 * moves place the hover label by writing custom properties on the stage, so a move never re-renders it; only pointer
 * entry and exit are state.
 *
 * @param props - The graphics actor, the region, the canvas renderer, the part menu, the status and the slots.
 * @returns The stage, filling its parent.
 * @public
 *
 * @example <caption>A host draws its model viewer on the stage</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ModelViewer } from '@taucad/viewer/model-viewer';
 * import type { GraphicsRef } from '@taucad/workbench-panes/host/workbench-host';
 * import { useViewerPartMenu } from '@taucad/workbench-panes/component-menu/use-viewer-part-menu';
 * import { ViewerStage } from '@taucad/workbench-panes/shell/viewer-stage';
 *
 * export function Stage({ graphicsRef }: { readonly graphicsRef: GraphicsRef }): React.JSX.Element {
 *   const partMenu = useViewerPartMenu({ graphicsRef });
 *   return createElement(ViewerStage, {
 *     graphicsRef,
 *     regionId: 'tau-viewer-canvas',
 *     partMenu,
 *     status: { kind: 'loading', label: 'Loading gear.glb', progress: 0.5 },
 *     renderCanvas: ({ gizmoContainer, onComponentSecondaryPointerCandidate }) =>
 *       createElement(ModelViewer, {
 *         graphicsRef,
 *         artifact: undefined,
 *         gizmoContainer,
 *         onComponentSecondaryPointerCandidate,
 *       }),
 *   });
 * }
 * ```
 */
export function ViewerStage({
  graphicsRef,
  regionId,
  regionLabel = 'CAD canvas',
  renderCanvas,
  partMenu,
  decoratePartMenu,
  isModelShown,
  status,
  statusExtra,
  controls,
  children,
  className,
  ...layoutProps
}: ViewerStageProps): React.JSX.Element {
  const layoutRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  const ownRegionRef = useRef<HTMLElement | null>(null);
  const regionRef = partMenu?.regionProps.ref ?? ownRegionRef;
  const [isPointerOver, setIsPointerOver] = useState(false);
  const hasArtifact = useSelector(graphicsRef, (state) => state.context.artifact !== undefined);
  const hasModel = isModelShown ?? hasArtifact;
  const unitId = useSelector(graphicsRef, (state) => state.context.modelInteractionUnitId);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const layout = layoutRef.current;
      if (layout === null) {
        return;
      }
      // The controls are read at each move: the bar grows and shrinks as tools start and stop.
      placeModelComponentNameBadge(layout, { clientX: event.clientX, clientY: event.clientY }, controlsRef.current);
      // Only entry is state: a repeated update could still render the stage once more on a later move.
      if (!isPointerOver) {
        setIsPointerOver(true);
      }
    },
    [isPointerOver],
  );
  const handlePointerLeave = useCallback(() => {
    setIsPointerOver(false);
  }, []);

  const failure = status?.kind === 'failed' ? status : undefined;

  return (
    <div
      {...layoutProps}
      ref={layoutRef}
      data-viewer-frame
      data-slot='viewer-stage'
      className={cn('group/viewer fullscreen:bg-background @container/viewer relative flex h-full flex-col', className)}
    >
      <StageStatus status={status} statusExtra={statusExtra} hasModel={hasModel} />
      <section
        {...partMenu?.regionProps}
        ref={regionRef}
        id={regionId}
        data-slot='viewer-canvas-region'
        data-testid='cad-viewer-canvas-region'
        role='application'
        aria-label={regionLabel}
        tabIndex={partMenu === undefined ? undefined : 0}
        className='relative min-h-0 flex-1 overflow-hidden focus-visible:focus-outline'
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
      >
        {renderCanvas({
          gizmoContainer: `#${regionId}`,
          eventSource: regionRef as React.RefObject<HTMLElement>,
          onComponentSecondaryPointerCandidate: partMenu?.onComponentSecondaryPointerCandidate,
        })}
        {failure === undefined ? null : (
          <RuntimeErrorOverlay
            message={failure.message}
            summary={failure.summary}
            className='absolute top-4 right-4 left-4 z-10 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-md border border-feature/40 bg-background/90 p-2 shadow-sm backdrop-blur-sm'
          />
        )}
        {children}
      </section>
      {partMenu?.renderMenu(decoratePartMenu)}
      <HoveredModelComponentBadge
        unitId={unitId}
        isSuppressed={!isPointerOver || !hasModel || partMenu?.isOpen === true}
      />
      {controls === undefined ? null : (
        /* The bar is centred on the last line and grows upward as tools start. */
        <div
          ref={controlsRef}
          data-slot='viewer-controls'
          className='pointer-events-none absolute inset-x-2 bottom-2 z-10 flex flex-col items-center-safe gap-2'
        >
          {controls}
        </div>
      )}
    </div>
  );
}
