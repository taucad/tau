import { createContext, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { createCameraView } from '@taucad/camera';
import { selectCameraDriverSnapshot } from '@taucad/camera/machine';
import type { CameraDriverSnapshot, CameraMachineSnapshot } from '@taucad/camera/machine';
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

const getPixelRatio = (): number => {
  const pixelRatio = Reflect.get(globalThis, 'devicePixelRatio');
  return Math.min(typeof pixelRatio === 'number' && pixelRatio > 0 ? pixelRatio : 1, 2);
};

const createInitialCameraRig = ({
  graphicsRef,
  connectorRef,
  cameraView,
  initialVerticalFieldOfView,
}: {
  readonly graphicsRef: GraphicsActorRef;
  readonly connectorRef: RefObject<CameraUpdateHandler | undefined>;
  readonly cameraView?: PersistedCameraView;
  readonly initialVerticalFieldOfView?: number;
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
    initialView: createCameraView({
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

/**
 * Provider that makes a per-view graphics machine and its capabilities available to all descendants.
 * Owns the per-view portable camera rig and registry entry.
 * Placed in ChatViewer (and standalone viewers like hero-viewer, converter).
 */
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
  const cameraConnectorRef = useRef<CameraUpdateHandler | undefined>(undefined);
  const cameraConsumersRef = useRef(new Set<CameraUpdateHandler>());
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
      }),
    [graphicsRef, initialVerticalFieldOfView],
  );
  const cleanupTicketsRef = useRef(new WeakMap<ThreeCameraRig, symbol>());
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

  useLayoutEffect(() => {
    cleanupTicketsRef.current.delete(cameraRig);
    cameraRig.actorRef.start();
    registerGraphicsCameraRig(graphicsRef, cameraRig);
    return () => {
      const cleanupTicket = Symbol('camera-rig-cleanup');
      cleanupTicketsRef.current.set(cameraRig, cleanupTicket);
      queueMicrotask(() => {
        if (cleanupTicketsRef.current.get(cameraRig) !== cleanupTicket) {
          return;
        }
        cleanupTicketsRef.current.delete(cameraRig);
        unregisterGraphicsCameraRig(graphicsRef, cameraRig);
        cameraRig.dispose();
      });
    };
  }, [cameraRig, graphicsRef]);

  const value = useMemo(
    (): GraphicsContextValue => ({
      graphicsRef,
      cameraRig,
      cameraConnectorRef,
      cameraConsumersRef,
      cameraViewRestoreIdentity: cameraViewRestore?.identity,
      beginCameraViewInitialization,
    }),
    [beginCameraViewInitialization, cameraRig, cameraViewRestore?.identity, graphicsRef],
  );

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

/** Returns the provider-owned portable native camera rig. */
export function useCameraRig(): ThreeCameraRig {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useCameraRig must be used within a GraphicsProvider');
  }

  return context.cameraRig;
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
