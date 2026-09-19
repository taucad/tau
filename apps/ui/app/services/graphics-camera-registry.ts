import type { RefObject } from 'react';
import type { ActorRefFrom } from 'xstate';
import { Topic } from '@taucad/events';
import { createCameraView } from '@taucad/camera';
import type { CameraState } from '@taucad/camera';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import type { RenderFrame } from '@taucad/spatial';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import type { CameraOwnedSettings, PersistedCameraView } from '#constants/editor.constants.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;

export type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;
export type RenderFrameUpdateHandler = (renderFrame: RenderFrame) => void;

/** One-time framing record for an entry identity; mutated by the canvas framing hook. */
export type ViewCameraFraming = {
  /** Entry path whose geometry this record describes; a change re-latches the other two fields. */
  identity: string | undefined;
  /** Persisted pose to apply once the first geometry has been framed. */
  pendingView: PersistedCameraView | undefined;
  /** Whether the first real geometry has already been framed for this identity. */
  initialized: boolean;
};

/**
 * The live camera of one view: the rig, the slots each canvas rebinds, and the framing record.
 * Its lifetime is the graphics actor's, so a remounted provider finds the camera the person left.
 */
export type ViewCameraSession = Readonly<{
  rig: ThreeCameraRig;
  /** Rebound by each canvas mount. */
  connectorRef: RefObject<CameraUpdateHandler | undefined>;
  consumersRef: RefObject<Set<CameraUpdateHandler>>;
  renderFrame: {
    current: RenderFrame;
    consumers: Set<RenderFrameUpdateHandler>;
    listeners: Set<() => void>;
  };
  framing: ViewCameraFraming;
}>;

/** Create-only seed. Applied when the session is built; later acquisitions ignore `camera`. */
export type ViewCameraSeed = Readonly<{
  identity?: string;
  camera?: Partial<CameraOwnedSettings>;
}>;

const sessions = new WeakMap<GraphicsActorRef, ViewCameraSession>();
const sessionTopic = new Topic<void>({ name: 'view-camera-sessions' });
const publishedSessions = new WeakSet<ViewCameraSession>();
let version = 0;

const notify = (): void => {
  version += 1;
  sessionTopic.emit();
};

/**
 * Publishes a session to camera consumers outside the provider tree, once per session.
 *
 * A session is acquired during render so descendants can read the rig while rendering, and a store
 * notification from the render phase is a React update to a component that is not rendering. The
 * host calls this from its layout effect instead, which is the commit phase.
 */
export const notifyViewCameraSession = (session: ViewCameraSession): void => {
  if (publishedSessions.has(session)) {
    return;
  }
  publishedSessions.add(session);
  notify();
};

const initialDirection = [Math.sqrt(3 / 8), -Math.sqrt(3 / 8), 0.5] as const;
/** Field of view in degrees for a rig whose host supplies no seed; matches `defaultGraphicsSettings.cameraFovAngle`. */
const defaultVerticalFieldOfView = 60;

const createInitialRenderFrame = (): RenderFrame => ({
  anchorFrameId: 'tau:root',
  originMeters: [0, 0, 0],
  metersPerRenderUnit: 1,
});

const getPixelRatio = (): number => {
  const pixelRatio = Reflect.get(globalThis, 'devicePixelRatio');
  return Math.min(typeof pixelRatio === 'number' && pixelRatio > 0 ? pixelRatio : 1, 2);
};

const createRig = ({
  graphicsRef,
  seed,
  connectorRef,
  renderFrame,
}: {
  readonly graphicsRef: GraphicsActorRef;
  readonly seed: ViewCameraSeed;
  readonly connectorRef: RefObject<CameraUpdateHandler | undefined>;
  readonly renderFrame: RenderFrame;
}): ThreeCameraRig => {
  const { upDirection } = graphicsRef.getSnapshot().context;
  const up =
    upDirection === 'x' ? ([1, 0, 0] as const) : upDirection === 'y' ? ([0, 1, 0] as const) : ([0, 0, 1] as const);

  const initialView = seed.camera?.cameraView ?? {
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
      requestedVerticalFieldOfView: seed.camera?.cameraFovAngle ?? defaultVerticalFieldOfView,
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
 * Returns the live camera session for a graphics actor, building it on first demand.
 *
 * The first call owns the seed: it builds and starts the rig. Later calls return the same session
 * and use the seed only to re-latch the framing record when the entry identity changes -- the live
 * field of view and pose belong to the camera actor from then on. The session is released when the
 * graphics actor completes, so a project that keeps its actors keeps its cameras.
 *
 * That release is explicit only for a graphics actor stopped as a spawned child, which is how a
 * project stops its views. `@xstate/react` mutes an actor's observers before stopping it, so a host
 * that owns its actor through `useActorRef` never emits `complete`; its session holds no timer,
 * subscription or GPU resource and is collected with the actor it is keyed by.
 *
 * The caller publishes the new session with {@link notifyViewCameraSession} from its commit phase.
 */
export const acquireViewCameraSession = (
  graphicsRef: GraphicsActorRef,
  seed: ViewCameraSeed = {},
): ViewCameraSession => {
  const existing = sessions.get(graphicsRef);
  if (existing) {
    /* A view can render before its entry path is known (a panel seeded while the project loads), and
     * that is not a file switch: re-latching there would re-arm the persisted pose over the live one. */
    if (seed.identity !== undefined && existing.framing.identity !== seed.identity) {
      existing.framing.identity = seed.identity;
      existing.framing.pendingView = seed.camera?.cameraView;
      existing.framing.initialized = false;
    }
    return existing;
  }

  const connectorRef: RefObject<CameraUpdateHandler | undefined> = { current: undefined };
  const renderFrame = {
    current: createInitialRenderFrame(),
    consumers: new Set<RenderFrameUpdateHandler>(),
    listeners: new Set<() => void>(),
  };
  const session: ViewCameraSession = {
    rig: createRig({ graphicsRef, seed, connectorRef, renderFrame: renderFrame.current }),
    connectorRef,
    consumersRef: { current: new Set<CameraUpdateHandler>() },
    renderFrame,
    framing: { identity: seed.identity, pendingView: seed.camera?.cameraView, initialized: false },
  };
  sessions.set(graphicsRef, session);
  session.rig.actorRef.start();

  graphicsRef.subscribe({
    complete: () => {
      if (sessions.get(graphicsRef) !== session) {
        return;
      }
      sessions.delete(graphicsRef);
      session.rig.dispose();
      notify();
    },
  });

  return session;
};

/**
 * Returns the live camera session of a graphics actor, or undefined when no view has built one.
 *
 * For readers outside the provider tree: the write-side host persists a view whose pane may not be
 * mounted, and a view with no camera simply has no camera keys to write.
 */
export const getViewCameraSession = (graphicsRef: GraphicsActorRef | undefined): ViewCameraSession | undefined =>
  graphicsRef ? sessions.get(graphicsRef) : undefined;

/** Reads the latest complete camera state without mirroring it into the graphics actor. */
export const getGraphicsCameraState = (graphicsRef: GraphicsActorRef | undefined): CameraState | undefined => {
  if (!graphicsRef) {
    return undefined;
  }
  return sessions.get(graphicsRef)?.rig.readState();
};

export const hasGraphicsCameraRig = (graphicsRef: GraphicsActorRef | undefined): boolean =>
  Boolean(graphicsRef && sessions.has(graphicsRef));

export const subscribeGraphicsCameraRegistry = (listener: () => void): (() => void) => sessionTopic.subscribe(listener);

export const getGraphicsCameraRegistryVersion = (): number => version;
