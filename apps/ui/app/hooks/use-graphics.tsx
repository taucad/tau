import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { selectCameraDriverSnapshot } from '@taucad/camera/machine';
import type { CameraMachineSnapshot } from '@taucad/camera/machine';
import type { RenderFrame } from '@taucad/spatial';
import type { ThreeCameraRig } from '@taucad/three/camera';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import {
  acquireViewCameraSession,
  getGraphicsCameraRegistryVersion,
  getViewCameraSession,
  hasGraphicsCameraRig,
  notifyViewCameraSession,
  subscribeGraphicsCameraRegistry,
} from '#services/graphics-camera-registry.js';
import type {
  CameraUpdateHandler,
  RenderFrameUpdateHandler,
  ViewCameraFraming,
  ViewCameraSeed,
  ViewCameraSession,
} from '#services/graphics-camera-registry.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;
type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;

type GraphicsContextValue = {
  graphicsRef: GraphicsActorRef;
  cameraRig: ThreeCameraRig;
  cameraConnectorRef: RefObject<CameraUpdateHandler | undefined>;
  cameraConsumersRef: RefObject<Set<CameraUpdateHandler>>;
  getRenderFrame: () => RenderFrame;
  setRenderFrame: (renderFrame: RenderFrame) => void;
  subscribeRenderFrame: (listener: () => void) => () => void;
  renderFrameConsumersRef: RefObject<Set<RenderFrameUpdateHandler>>;
  framing: ViewCameraFraming;
};

const GraphicsContext = createContext<GraphicsContextValue | undefined>(undefined);
/** Re-renders external camera consumers when a view camera session is created or released. */
const useCameraRegistryVersion = (): number =>
  useSyncExternalStore(
    subscribeGraphicsCameraRegistry,
    getGraphicsCameraRegistryVersion,
    getGraphicsCameraRegistryVersion,
  );

/** Returns a registry query whose identity changes with camera session lifetime. */
export const useGraphicsCameraRigQuery = (): ((graphicsRef: GraphicsActorRef | undefined) => boolean) => {
  const version = useCameraRegistryVersion();
  return useMemo(
    () => (graphicsRef: GraphicsActorRef | undefined) =>
      version === getGraphicsCameraRegistryVersion() && hasGraphicsCameraRig(graphicsRef),
    [version],
  );
};

/**
 * Returns a view's camera session from outside its provider, re-rendering when one comes or goes.
 *
 * The write-side host reads a view whose pane may not be mounted: until some canvas acquires the
 * session there is no live camera, and the view's camera keys are left as the person left them.
 */
export const useViewCameraSession = (graphicsRef: GraphicsActorRef | undefined): ViewCameraSession | undefined => {
  useCameraRegistryVersion();
  return getViewCameraSession(graphicsRef);
};

/**
 * Provider that makes a per-view graphics machine and its capabilities available to all descendants.
 * Binds the view's camera session, whose owner is the graphics actor rather than this mount.
 * Placed in ChatViewer (and standalone viewers like hero-viewer, converter).
 */
export function GraphicsProvider({
  graphicsRef,
  seed,
  initialVerticalFieldOfView,
  children,
}: {
  readonly graphicsRef: GraphicsActorRef;
  readonly seed?: ViewCameraSeed;
  /** Standalone hosts with no persisted record; folded into the create-only camera seed. */
  readonly initialVerticalFieldOfView?: number;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  'use no memo';

  const session = acquireViewCameraSession(graphicsRef, {
    identity: seed?.identity,
    camera:
      initialVerticalFieldOfView === undefined
        ? seed?.camera
        : { ...seed?.camera, cameraFovAngle: initialVerticalFieldOfView },
  });

  useLayoutEffect(() => {
    notifyViewCameraSession(session);
  }, [session]);

  const value = useMemo((): GraphicsContextValue => {
    const { renderFrame, rig } = session;
    return {
      graphicsRef,
      cameraRig: rig,
      cameraConnectorRef: session.connectorRef,
      cameraConsumersRef: session.consumersRef,
      getRenderFrame: () => renderFrame.current,
      setRenderFrame: (next: RenderFrame): void => {
        const previous = renderFrame.current;
        if (
          next.anchorFrameId === previous.anchorFrameId &&
          next.metersPerRenderUnit === previous.metersPerRenderUnit &&
          next.originMeters.every((value, index) => value === previous.originMeters[index])
        ) {
          return;
        }
        // oxlint-disable-next-line react/immutability -- the render frame belongs to the view camera session, whose owner is the graphics actor rather than this mount.
        renderFrame.current = next;
        for (const update of renderFrame.consumers) {
          update(next);
        }
        rig.setRenderFrame(next);
        for (const listener of renderFrame.listeners) {
          listener();
        }
      },
      subscribeRenderFrame: (listener: () => void): (() => void) => {
        renderFrame.listeners.add(listener);
        return () => renderFrame.listeners.delete(listener);
      },
      renderFrameConsumersRef: { current: renderFrame.consumers },
      framing: session.framing,
    };
  }, [graphicsRef, session]);

  return <GraphicsContext.Provider value={value}>{children}</GraphicsContext.Provider>;
}

/**
 * Returns the per-view graphics actor ref from the nearest GraphicsProvider.
 * Use for `.send()` calls to dispatch events to the graphics machine.
 */
export function useGraphics(): GraphicsActorRef {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useGraphics must be used within a GraphicsProvider');
  }

  return context.graphicsRef;
}

/** Returns the view-owned portable native camera rig. */
export function useCameraRig(): ThreeCameraRig {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useCameraRig must be used within a GraphicsProvider');
  }

  return context.cameraRig;
}

/** Returns the current per-view physical-to-render snapshot. */
export function useRenderFrame(): RenderFrame {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useRenderFrame must be used within a GraphicsProvider');
  }
  return useSyncExternalStore(context.subscribeRenderFrame, context.getRenderFrame, context.getRenderFrame);
}

/** Atomically retargets the current viewport scene and camera. */
export function useSetRenderFrame(): (renderFrame: RenderFrame) => void {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useSetRenderFrame must be used within a GraphicsProvider');
  }
  return context.setRenderFrame;
}

/** Registers a retained render-space resource for synchronous frame changes. */
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

/** Returns the sole app-local endpoint publication slot for the current R3F canvas. */
export function useCameraConnectorRef(): RefObject<CameraUpdateHandler | undefined> {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useCameraConnectorRef must be used within a GraphicsProvider');
  }

  return context.cameraConnectorRef;
}

/** Registers a retained camera-bound resource for the connector's pre-publication handoff. */
export function useCameraRetarget(handler: CameraUpdateHandler): void {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useCameraRetarget must be used within a GraphicsProvider');
  }
  const { cameraConsumersRef, cameraRig } = context;
  useLayoutEffect(() => {
    cameraConsumersRef.current.add(handler);
    handler(cameraRig.activeCamera, selectCameraDriverSnapshot(cameraRig.actorRef.getSnapshot()));
    return () => {
      cameraConsumersRef.current.delete(handler);
    };
  }, [cameraConsumersRef, cameraRig, handler]);
}

/** Returns the retained resources that must be retargeted before R3F camera publication. */
export function useCameraConsumersRef(): RefObject<Set<CameraUpdateHandler>> {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useCameraConsumersRef must be used within a GraphicsProvider');
  }
  return context.cameraConsumersRef;
}

/** Returns the session-owned record that gates the one-time framing and persisted-view restore. */
export function useViewCameraFraming(): ViewCameraFraming {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useViewCameraFraming must be used within a GraphicsProvider');
  }
  return context.framing;
}

/** Curried selector hook for the provider-owned portable camera actor. */
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
 * @example
 * const gridSizes = useGraphicsSelector(state => state.context.gridSizes);
 */
export function useGraphicsSelector<T>(selector: (state: SnapshotFrom<typeof graphicsMachine>) => T): T {
  const graphicsRef = useGraphics();
  return useSelector(graphicsRef, selector);
}

export function useModelInteractionRef(): ModelInteractionRef {
  const graphicsRef = useGraphics();
  return useSelector(graphicsRef, (state) => state.context.modelInteractionRef);
}

export function useModelInteractionSelector<T>(
  selector: (state: SnapshotFrom<typeof modelInteractionMachine>) => T,
): T {
  const modelInteractionRef = useModelInteractionRef();
  return useSelector(modelInteractionRef, selector);
}
