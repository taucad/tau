import { createContext, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom, AnyActorRef, Snapshot, SnapshotFrom } from 'xstate';
import { createCameraView } from '@taucad/camera';
import { selectCameraDriverSnapshot } from '@taucad/camera/machine';
import type { CameraDriverSnapshot, CameraMachineSnapshot } from '@taucad/camera/machine';
import type { RenderFrame } from '@taucad/spatial';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { PersistedCameraView } from '#constants/editor.constants.js';
import {
  getGraphicsCameraRegistryVersion,
  registerGraphicsCameraRig,
  subscribeGraphicsCameraRegistry,
  unregisterGraphicsCameraRig,
} from '#services/graphics-camera-registry.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;
type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;
type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;
type RenderFrameUpdateHandler = (renderFrame: RenderFrame) => void;

export type CameraViewRestore = Readonly<{
  identity: string;
  cameraView?: PersistedCameraView;
}>;

export type CameraViewInitialization =
  | Readonly<{ initialize: false }>
  | Readonly<{ initialize: true; cameraView?: PersistedCameraView }>;

type GraphicsContextValue = {
  graphicsRef: GraphicsActorRef;
  cameraRig: ThreeCameraRig;
  cameraConnectorRef: RefObject<CameraUpdateHandler | undefined>;
  cameraConsumersRef: RefObject<Set<CameraUpdateHandler>>;
  getRenderFrame: () => RenderFrame;
  setRenderFrame: (renderFrame: RenderFrame) => void;
  subscribeRenderFrame: (listener: () => void) => () => void;
  renderFrameConsumersRef: RefObject<Set<RenderFrameUpdateHandler>>;
  cameraViewRestoreIdentity: string | undefined;
  beginCameraViewInitialization: () => CameraViewInitialization;
};

const GraphicsContext = createContext<GraphicsContextValue | undefined>(undefined);
/** Re-renders external camera consumers when a provider registers or unregisters its rig. */
export const useCameraRegistryVersion = (): number =>
  useSyncExternalStore(
    subscribeGraphicsCameraRegistry,
    getGraphicsCameraRegistryVersion,
    getGraphicsCameraRegistryVersion,
  );

const initialDirection = [Math.sqrt(3 / 8), -Math.sqrt(3 / 8), 0.5] as const;
const createInitialRenderFrame = (): RenderFrame => ({
  anchorFrameId: 'tau:root',
  originMeters: [0, 0, 0],
  metersPerRenderUnit: 1,
});

const getPixelRatio = (): number => {
  const pixelRatio = Reflect.get(globalThis, 'devicePixelRatio');
  return Math.min(typeof pixelRatio === 'number' && pixelRatio > 0 ? pixelRatio : 1, 2);
};

const createInitialCameraRig = ({
  graphicsRef,
  connectorRef,
  cameraView,
  initialVerticalFieldOfView,
  renderFrame,
}: {
  readonly graphicsRef: GraphicsActorRef;
  readonly connectorRef: RefObject<CameraUpdateHandler | undefined>;
  readonly cameraView?: PersistedCameraView;
  readonly initialVerticalFieldOfView?: number;
  readonly renderFrame: RenderFrame;
}): ThreeCameraRig => {
  const graphics = graphicsRef.getSnapshot().context;
  const up =
    graphics.upDirection === 'x'
      ? ([1, 0, 0] as const)
      : graphics.upDirection === 'y'
        ? ([0, 1, 0] as const)
        : ([0, 0, 1] as const);

  const initialView = cameraView ?? {
    target: [0, 0, 0],
    direction: initialDirection,
    up,
    verticalSpan: 2,
    perspectiveZoom: 1,
  };

  return createThreeCameraRig({
    pixelBudget: 0.25,
    renderFrame,
    initialView: createCameraView({
      frameId: 'tau:root',
      requestedVerticalFieldOfView: initialVerticalFieldOfView ?? graphics.initialCameraFovAngle,
      ...initialView,
      viewport: { width: 1, height: 1, pixelRatio: getPixelRatio() },
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    }),
    onUpdate(camera, snapshot) {
      connectorRef.current?.(camera, snapshot);
    },
  });
};

// Mirrors @xstate/react's reconnect-safe actor cleanup. React can disconnect and reconnect
// effects without rendering a new provider; a plain stop leaves invoked children stopped.
const stopActorForReactReconnect = (actorRef: AnyActorRef): void => {
  type SnapshotWithChildren = Snapshot<unknown> & {
    readonly children?: Readonly<Record<string, AnyActorRef>>;
  };
  const persistedSnapshots: Array<readonly [AnyActorRef, Snapshot<unknown>]> = [];
  const visit = (ref: AnyActorRef): void => {
    const snapshot = ref.getSnapshot() as SnapshotWithChildren;
    persistedSnapshots.push([ref, snapshot]);
    for (const child of Object.values(snapshot.children ?? {})) {
      visit(child);
    }
    Reflect.set(ref, 'observers', new Set());
  };
  visit(actorRef);
  const systemSnapshot = actorRef.system.getSnapshot();

  actorRef.stop();

  Reflect.set(actorRef.system, '_snapshot', systemSnapshot);
  for (const [ref, snapshot] of persistedSnapshots) {
    Reflect.set(ref, '_processingStatus', 0);
    Reflect.set(ref, '_snapshot', snapshot);
  }
};

/**
 * Provider that makes a per-view graphics machine and its capabilities available to all descendants.
 * Owns the per-view portable camera rig and registry entry.
 * Placed in ChatViewer (and standalone viewers like hero-viewer, converter).
 */
/* oxlint-disable react/refs -- The `use no memo` compiler opt-out preserves this imperative XState/graphics bridge contract: stable callbacks synchronously rebind mutable per-actor state during render. */
export function GraphicsProvider({
  graphicsRef,
  cameraViewRestore,
  initialVerticalFieldOfView,
  children,
}: {
  readonly graphicsRef: GraphicsActorRef;
  readonly cameraViewRestore?: CameraViewRestore;
  readonly initialVerticalFieldOfView?: number;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  'use no memo';

  const cameraConnectorRef = useRef<CameraUpdateHandler | undefined>(undefined);
  const cameraConsumersRef = useRef(new Set<CameraUpdateHandler>());
  const renderFrameOwnerRef = useRef({
    graphicsRef,
    current: createInitialRenderFrame(),
    consumers: new Set<RenderFrameUpdateHandler>(),
    listeners: new Set<() => void>(),
  });
  if (renderFrameOwnerRef.current.graphicsRef !== graphicsRef) {
    renderFrameOwnerRef.current = {
      graphicsRef,
      current: createInitialRenderFrame(),
      consumers: new Set(),
      listeners: new Set(),
    };
  }
  const initialCameraViewRef = useRef({
    graphicsRef,
    cameraView: cameraViewRestore?.cameraView,
  });
  if (initialCameraViewRef.current.graphicsRef !== graphicsRef) {
    initialCameraViewRef.current = {
      graphicsRef,
      cameraView: cameraViewRestore?.cameraView,
    };
  }
  const cameraRig = useMemo(
    () =>
      createInitialCameraRig({
        graphicsRef,
        connectorRef: cameraConnectorRef,
        cameraView: initialCameraViewRef.current.cameraView,
        initialVerticalFieldOfView,
        renderFrame: renderFrameOwnerRef.current.current,
      }),
    [graphicsRef, initialVerticalFieldOfView],
  );
  const cameraRigRef = useRef(cameraRig);
  cameraRigRef.current = cameraRig;
  const cameraViewInitializationRef = useRef({
    graphicsRef,
    identity: cameraViewRestore?.identity,
    cameraView: cameraViewRestore?.cameraView,
    initialized: false,
  });
  if (
    cameraViewInitializationRef.current.graphicsRef !== graphicsRef ||
    cameraViewInitializationRef.current.identity !== cameraViewRestore?.identity
  ) {
    cameraViewInitializationRef.current = {
      graphicsRef,
      identity: cameraViewRestore?.identity,
      cameraView: cameraViewRestore?.cameraView,
      initialized: false,
    };
  }
  const beginCameraViewInitialization = useRef((): CameraViewInitialization => {
    const initialization = cameraViewInitializationRef.current;
    if (initialization.initialized) {
      return { initialize: false };
    }
    initialization.initialized = true;
    return { initialize: true, cameraView: initialization.cameraView };
  }).current;
  const getRenderFrame = useRef((): RenderFrame => renderFrameOwnerRef.current.current).current;
  const subscribeRenderFrame = useRef((listener: () => void): (() => void) => {
    renderFrameOwnerRef.current.listeners.add(listener);
    return () => renderFrameOwnerRef.current.listeners.delete(listener);
  }).current;
  const setRenderFrame = useRef((renderFrame: RenderFrame): void => {
    const owner = renderFrameOwnerRef.current;
    const previous = owner.current;
    if (
      renderFrame.anchorFrameId === previous.anchorFrameId &&
      renderFrame.metersPerRenderUnit === previous.metersPerRenderUnit &&
      renderFrame.originMeters.every((value, index) => value === previous.originMeters[index])
    ) {
      return;
    }
    owner.current = renderFrame;
    for (const update of owner.consumers) {
      update(renderFrame);
    }
    cameraRigRef.current.setRenderFrame(renderFrame);
    for (const listener of owner.listeners) {
      listener();
    }
  }).current;

  useLayoutEffect(() => {
    cameraRig.actorRef.start();
    registerGraphicsCameraRig(graphicsRef, cameraRig);
    return () => {
      unregisterGraphicsCameraRig(graphicsRef, cameraRig);
      stopActorForReactReconnect(cameraRig.actorRef);
    };
  }, [cameraRig, graphicsRef]);

  const value = useMemo(
    (): GraphicsContextValue => ({
      graphicsRef,
      cameraRig,
      cameraConnectorRef,
      cameraConsumersRef,
      getRenderFrame,
      setRenderFrame,
      subscribeRenderFrame,
      renderFrameConsumersRef: { current: renderFrameOwnerRef.current.consumers },
      cameraViewRestoreIdentity: cameraViewRestore?.identity,
      beginCameraViewInitialization,
    }),
    [
      beginCameraViewInitialization,
      cameraRig,
      cameraViewRestore?.identity,
      getRenderFrame,
      graphicsRef,
      setRenderFrame,
      subscribeRenderFrame,
    ],
  );

  return <GraphicsContext.Provider value={value}>{children}</GraphicsContext.Provider>;
}
/* oxlint-enable react/refs */

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

/** Returns the provider-owned portable native camera rig. */
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

/** Coordinates the one-time default frame and optional persisted view restore for this provider identity. */
export function useCameraViewInitialization(): Readonly<{
  identity: string | undefined;
  begin: () => CameraViewInitialization;
}> {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useCameraViewInitialization must be used within a GraphicsProvider');
  }
  return useMemo(
    () => ({
      identity: context.cameraViewRestoreIdentity,
      begin: context.beginCameraViewInitialization,
    }),
    [context.beginCameraViewInitialization, context.cameraViewRestoreIdentity],
  );
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
