import { createContext, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { selectCameraDriverSnapshot } from '@taucad/camera/machine';
import type { CameraMachineSnapshot } from '@taucad/camera/machine';
import type { RenderFrame } from '@taucad/spatial';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCameraRig } from '@taucad/three/camera';
import { useViewerEnvironment } from '#environment/viewer-environment.jsx';
import { selectGraphicsFramingIdentity } from '#machines/graphics.machine.js';
import type { GraphicsCameraRef, graphicsMachine } from '#machines/graphics.machine.js';
import type { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { kinematicsMachine } from '#machines/kinematics.machine.js';
import { asCameraActor } from '#graphics/graphics-camera.js';
import type { CameraUpdateHandler, RenderFrameUpdateHandler, ViewCameraSeed } from '#graphics/graphics-camera.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;
type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;
type KinematicsRef = ActorRefFrom<typeof kinematicsMachine>;

type GraphicsContextValue = {
  graphicsRef: GraphicsActorRef;
  cameraRig: ThreeCameraRig;
  cameraConnectorRef: RefObject<CameraUpdateHandler | undefined>;
  cameraConsumersRef: RefObject<Set<CameraUpdateHandler>>;
  getRenderFrame: () => RenderFrame;
  setRenderFrame: (renderFrame: RenderFrame) => void;
  subscribeRenderFrame: (listener: () => void) => () => void;
  renderFrameConsumersRef: RefObject<Set<RenderFrameUpdateHandler>>;
};

const GraphicsContext = createContext<GraphicsContextValue | undefined>(undefined);

/**
 * Returns a graphics actor's camera from outside its provider: the view's camera, which lives as long as the graphics
 * actor does.
 *
 * @param graphicsRef - The graphics actor, if any.
 * @returns Its camera actor, or `undefined` with no graphics actor.
 * @public
 */
export const useGraphicsCamera = (graphicsRef: GraphicsActorRef | undefined): GraphicsCameraRef | undefined =>
  useSelector(graphicsRef, (snapshot) => snapshot?.context.cameraRef);

/** The view's camera, read once when a presentation is made. */
const selectViewCamera = (graphicsRef: GraphicsActorRef): GraphicsCameraRef =>
  graphicsRef.getSnapshot().context.cameraRef;

/** The camera's presented snapshot, read when a retained resource joins the consumers. */
const selectRigDriverSnapshot = (cameraRig: ThreeCameraRig) =>
  selectCameraDriverSnapshot(cameraRig.actorRef.getSnapshot());

/** The entry the view's framing actor frames now. */
const selectViewFramingIdentity = (graphicsRef: GraphicsActorRef): string | undefined =>
  selectGraphicsFramingIdentity(graphicsRef.getSnapshot());

/**
 * Names the seeded entry to the view's framing. A view can render before its entry path is known (a panel seeded
 * while the project loads), and that is not a file switch: a seed with no identity changes nothing, so the persisted
 * pose is not re-armed over the live one. The same identity again is a re-delivery and sends nothing.
 *
 * This is the only sender of the view's entry identity (charter G6b): the view's record binding follows framing's
 * identity and never names an entry, because the record's read can land after the entry's geometry is measured. It is
 * sent while the provider renders, where the framing record was latched. No component renders from the framing actor
 * (its selectors are read when needed), so the send re-renders none.
 */
const deliverSeedEntry = (graphicsRef: GraphicsActorRef, seed: ViewCameraSeed | undefined): void => {
  const identity = seed?.identity;
  if (identity === undefined || selectViewFramingIdentity(graphicsRef) === identity) {
    return;
  }
  const pose = seed?.camera?.cameraView;
  graphicsRef.send({
    type: 'entryChanged',
    identity,
    ...(pose === undefined ? {} : { pendingPose: { requestId: `seed:${identity}`, pose } }),
  });
};

/* The per-mount presentation of the view's camera: the native cameras, the publication slots and the render frame. */
const createViewPresentation = (graphicsRef: GraphicsActorRef): Omit<GraphicsContextValue, 'graphicsRef'> => {
  const connectorRef: RefObject<CameraUpdateHandler | undefined> = { current: undefined };
  const consumers = new Set<RenderFrameUpdateHandler>();
  const listeners = new Set<() => void>();
  // The frame this mount presents: set before its listeners hear of a change, so a store read in the notification sees
  // the new frame.
  let renderFrame: RenderFrame | undefined;
  /* A frame the camera took (a rebased gesture) reaches the retained resources before the camera is published. */
  const changeRenderFrame = (next: RenderFrame): void => {
    renderFrame = next;
    for (const update of consumers) {
      update(next);
    }
    for (const listener of listeners) {
      listener();
    }
  };
  const rig = createThreeCameraRig({
    actorRef: asCameraActor(selectViewCamera(graphicsRef)),
    onUpdate(camera, snapshot) {
      if (snapshot.renderFrame !== renderFrame) {
        changeRenderFrame(snapshot.renderFrame);
      }
      connectorRef.current?.(camera, snapshot);
    },
  });
  renderFrame = rig.renderFrame;
  return {
    cameraRig: rig,
    cameraConnectorRef: connectorRef,
    cameraConsumersRef: { current: new Set<CameraUpdateHandler>() },
    getRenderFrame: () => renderFrame ?? rig.renderFrame,
    setRenderFrame: (next: RenderFrame): void => {
      const previous = rig.renderFrame;
      if (
        next.anchorFrameId === previous.anchorFrameId &&
        next.metersPerRenderUnit === previous.metersPerRenderUnit &&
        next.originMeters.every((value, index) => value === previous.originMeters[index])
      ) {
        return;
      }
      // The consumers retarget first, then the rig presents the camera in the new frame.
      changeRenderFrame(next);
      rig.setRenderFrame(next);
    },
    subscribeRenderFrame: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    renderFrameConsumersRef: { current: consumers },
  };
};

/**
 * Provider that makes a per-view graphics machine and its capabilities available to all descendants.
 *
 * The view's camera is the graphics actor's child, so a remounted provider finds the camera the person left. The
 * provider builds the native cameras that present it on this mount; they hold no subscription until a canvas's
 * controls adapter connects them, so a discarded render leaves nothing behind. A new `seed.identity` names the entry
 * the view's framing frames.
 * Placed in ChatViewer (and standalone viewers like hero-viewer, converter).
 * @public
 */
export function GraphicsProvider({
  graphicsRef,
  seed,
  children,
}: {
  readonly graphicsRef: GraphicsActorRef;
  readonly seed?: ViewCameraSeed;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  'use no memo';

  deliverSeedEntry(graphicsRef, seed);
  let [presentation, setPresentation] = useState(() => ({ graphicsRef, ...createViewPresentation(graphicsRef) }));
  if (presentation.graphicsRef !== graphicsRef) {
    // A new graphics actor is a new view: present its camera on new native cameras.
    presentation = { graphicsRef, ...createViewPresentation(graphicsRef) };
    setPresentation(presentation);
  }

  /*
   * The viewer environment's React-context-to-actor boundary (programme control ruling, 2026-11-12): the theme, the
   * accent and high contrast reach the viewer only as React context, so this composition root reports them to graphics,
   * which repaints the view cube in place. It is the graphics scope's single named context-to-actor boundary, beside
   * the standalone viewer's artifact boundary (inventory C10).
   */
  const { colorScheme, isHighContrast, accentColor } = useViewerEnvironment();
  useEffect(() => {
    graphicsRef.send({ type: 'viewerEnvironmentChanged', environment: { colorScheme, isHighContrast, accentColor } });
  }, [accentColor, colorScheme, graphicsRef, isHighContrast]);

  return <GraphicsContext.Provider value={presentation}>{children}</GraphicsContext.Provider>;
}

/**
 * Returns the per-view graphics actor ref from the nearest GraphicsProvider.
 * Use for `.send()` calls to dispatch events to the graphics machine.
 * @public
 */
export function useGraphics(): GraphicsActorRef {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useGraphics must be used within a GraphicsProvider');
  }

  return context.graphicsRef;
}

/**
 * Returns the view-owned portable native camera rig.
 *
 * @public
 */
export function useCameraRig(): ThreeCameraRig {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useCameraRig must be used within a GraphicsProvider');
  }

  return context.cameraRig;
}

/**
 * Returns the current per-view physical-to-render snapshot.
 *
 * @public
 */
export function useRenderFrame(): RenderFrame {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useRenderFrame must be used within a GraphicsProvider');
  }
  return useSyncExternalStore(context.subscribeRenderFrame, context.getRenderFrame, context.getRenderFrame);
}

/**
 * Atomically retargets the current viewport scene and camera.
 *
 * @public
 */
export function useSetRenderFrame(): (renderFrame: RenderFrame) => void {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useSetRenderFrame must be used within a GraphicsProvider');
  }
  return context.setRenderFrame;
}

/**
 * Registers a retained render-space resource for synchronous frame changes.
 *
 * @public
 */
export function useRenderFrameRetarget(handler: RenderFrameUpdateHandler): void {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useRenderFrameRetarget must be used within a GraphicsProvider');
  }
  const { getRenderFrame, renderFrameConsumersRef } = context;
  useLayoutEffect(() => {
    renderFrameConsumersRef.current.add(handler);
    handler(getRenderFrame());
    return () => {
      renderFrameConsumersRef.current.delete(handler);
    };
  }, [getRenderFrame, handler, renderFrameConsumersRef]);
}

/**
 * Returns the sole app-local endpoint publication slot for the current R3F canvas.
 *
 * @public
 */
export function useCameraConnectorRef(): RefObject<CameraUpdateHandler | undefined> {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useCameraConnectorRef must be used within a GraphicsProvider');
  }

  return context.cameraConnectorRef;
}

/**
 * Registers a retained camera-bound resource for the connector's pre-publication handoff.
 *
 * @public
 */
export function useCameraRetarget(handler: CameraUpdateHandler): void {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useCameraRetarget must be used within a GraphicsProvider');
  }
  const { cameraConsumersRef, cameraRig } = context;
  useLayoutEffect(() => {
    cameraConsumersRef.current.add(handler);
    handler(cameraRig.activeCamera, selectRigDriverSnapshot(cameraRig));
    return () => {
      cameraConsumersRef.current.delete(handler);
    };
  }, [cameraConsumersRef, cameraRig, handler]);
}

/**
 * Returns the retained resources that must be retargeted before R3F camera publication.
 *
 * @public
 */
export function useCameraConsumersRef(): RefObject<Set<CameraUpdateHandler>> {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useCameraConsumersRef must be used within a GraphicsProvider');
  }
  return context.cameraConsumersRef;
}

/**
 * Curried selector hook for the provider-owned portable camera actor.
 *
 * @public
 */
export function useCameraSelector<T>(
  selector: (state: CameraMachineSnapshot) => T,
  compare?: (left: T, right: T) => boolean,
): T {
  const cameraRig = useCameraRig();
  return useSelector(cameraRig.actorRef, selector, compare);
}

/**
 * Curried selector hook for reading state from the nearest per-view graphics machine.
 * Delegates to XState's useSelector for subscription management and re-render optimization.
 *
 * @public
 * @example <caption>Read the grid sizes</caption>
 * ```tsx
 * import { useGraphicsSelector } from '@taucad/viewer/hooks/use-graphics';
 *
 * export const GridSize = (): React.JSX.Element => {
 *   const gridSizes = useGraphicsSelector((state) => state.context.gridSizes);
 *   return <span>{gridSizes.smallSize}</span>;
 * };
 * ```
 */
export function useGraphicsSelector<T>(selector: (state: SnapshotFrom<typeof graphicsMachine>) => T): T {
  const graphicsRef = useGraphics();
  return useSelector(graphicsRef, selector);
}

/**
 * Returns the nearest view's model interaction actor.
 *
 * @returns The model interaction actor of the enclosing graphics provider.
 * @public
 */
export function useModelInteractionRef(): ModelInteractionRef {
  const graphicsRef = useGraphics();
  return useSelector(graphicsRef, (state) => state.context.modelInteractionRef);
}

/**
 * Selects a value from the nearest view's model interaction actor and re-renders when it changes.
 *
 * @param selector - Reads the value from the model interaction snapshot.
 * @returns The selected value.
 * @public
 */
export function useModelInteractionSelector<T>(
  selector: (state: SnapshotFrom<typeof modelInteractionMachine>) => T,
): T {
  const modelInteractionRef = useModelInteractionRef();
  return useSelector(modelInteractionRef, selector);
}

/**
 * Returns the nearest view's kinematics actor, which owns every unit's mechanism pose and playback.
 *
 * @public
 */
export function useKinematicsRef(): KinematicsRef {
  const graphicsRef = useGraphics();
  return useSelector(graphicsRef, (state) => state.context.kinematicsRef);
}

/**
 * Selects a value from the nearest view's kinematics actor and re-renders when it changes.
 *
 * @param selector - Reads the value from the kinematics snapshot.
 * @param compare - Optional equality check used to skip re-renders.
 * @returns The selected value.
 * @public
 */
export function useKinematicsSelector<T>(
  selector: (state: SnapshotFrom<typeof kinematicsMachine>) => T,
  compare?: (left: T, right: T) => boolean,
): T {
  const kinematicsRef = useKinematicsRef();
  return useSelector(kinematicsRef, selector, compare);
}
