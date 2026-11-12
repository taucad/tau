/**
 * The measure session's DOM adapters: one surface's pointer listeners, and what the session follows under them.
 *
 * The measuring tool builds both around its surface, R3F's root state, the graphics and kinematics actors and its own
 * host functions, and provides them to the measure session as `follower` and `pointer`. They share one closure, so
 * everything a host holds stays here (D4): the surface, the pointer snapshots and their meshes, the waiting presses and
 * their promises, the frame loop and the subscriptions. The session holds only plain facts and answers each report
 * with a command.
 *
 * @module
 */

import type { RenderFrame } from '@taucad/spatial';
import { fromThreeRenderPoint } from '@taucad/three/spatial';
import * as THREE from 'three';
import { createCallbackLogic } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import type { MeasurementTarget } from '#graphics/three/utils/measurement-features.js';
import { createRafCoalescer } from '#graphics/three/utils/raf-coalescer.js';
import type { graphicsMachine, KinematicsRef } from '#machines/graphics.machine.js';
import { selectCameraDragging, selectPresentedGeometryKey } from '#machines/graphics.machine.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type {
  MeasurePointerAt,
  MeasureSessionAdapterLogic,
  MeasureSessionCommand,
  MeasureSessionEvent,
} from '#machines/measure-session.machine.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;
type GraphicsSnapshot = SnapshotFrom<typeof graphicsMachine>;
type GraphicsContext = GraphicsSnapshot['context'];

/** R3F's frame subscription, which reads only `getState` from the store it is given. */
type FrameSubscribe = (
  callback: { current: () => void },
  priority: number,
  store: Readonly<{ getState: () => unknown }>,
) => () => void;

/** The part of R3F's root state the adapters read, live: the camera, the last pointer event and the frame loop. */
type MeasureRoot = Readonly<{
  camera: THREE.Camera;
  /** R3F types these against its own store; only the shapes named here are used. */
  internal: Readonly<{ subscribe: unknown; lastEvent: Readonly<{ current: unknown }> }>;
}>;

/** Ahead of every frame callback at the default priority (0), as the section input follows its render frame. */
const cameraFollowPriority = -1;

/**
 * What a pointer snapshot found under the pointer.
 *
 * @public
 */
export type MeasurePointerSnapshot = {
  readonly hasTarget: boolean;
  readonly hasActiveSnapTarget: boolean;
  readonly point?: THREE.Vector3;
  readonly target?: MeasurementTarget;
  /**
   * Set while something this snapshot needed was still being prepared off the main thread (a mesh's feature graph or
   * pick tree), so its targets may be incomplete: settles once one of those has, for the snapshot to be taken again.
   */
  readonly whenReady?: Promise<void>;
  /** The mesh under the pointer while its feature graph is still being prepared: a press there waits on it first. */
  readonly pendingSurface?: THREE.Mesh;
};

/**
 * The measuring tool's own work, read live: the adapters call the version the tool rendered last.
 *
 * @public
 */
export type MeasureToolHost = Readonly<{
  /** Takes the pointer snapshot at `at`, paints its hover and publishes its candidates. */
  snapshot: (at: MeasurePointerAt, coarsePointer: boolean) => MeasurePointerSnapshot;
  /** Places the snapshot's point: a start, a feature measurement or the second point. */
  commit: (snapshot: MeasurePointerSnapshot) => void;
  /** Clears the hover marks and the preview distance. */
  clearHover: () => void;
  /** Drops an unlocked chosen candidate as a press goes down, so the press snaps to what is under it. */
  releaseChosenCandidate: () => void;
  /** Drops the first target of a measurement in progress. */
  clearSelection: () => void;
  /** Has the graph of the mesh under a waiting press built next. */
  prioritize: (snapshot: MeasurePointerSnapshot) => void;
  /** How many times the graph of `surface` failed to prepare. */
  graphFailures: (surface: THREE.Mesh) => number;
  renderFrame: () => RenderFrame;
  currentStart: () => readonly [number, number, number] | undefined;
  /** The presented camera or pose changed: drop the candidates the tool holds in world space. */
  invalidateCandidates: () => void;
  /** The pose moved to `revision`; `isActive` is whether Measure is on. */
  poseChanged: (revision: number, isActive: boolean) => void;
  /** The committed cuts changed while Measure is on. */
  cutsChanged: (context: GraphicsContext) => void;
}>;

/**
 * The host objects the adapters are built around.
 *
 * @public
 */
export type MeasureToolAdapterOptions = Readonly<{
  /** Where R3F takes pointer events: its event source (`events.connected`) or else the canvas. */
  surface: HTMLElement;
  /** R3F's root state, read live. */
  get: () => MeasureRoot;
  graphics: GraphicsActorRef;
  kinematics: KinematicsRef;
  /** The tool's host functions, as last rendered; unset until the tool has rendered once. */
  host: Readonly<{ current: MeasureToolHost | undefined }>;
  /**
   * The pointer adapter that holds Measure's input now, shared by every adapter pair the tool builds. A session
   * rebuilt around a new surface starts before the one it replaces stops (a `useActorRef` actor stops a microtask
   * after its unmount), so only the holder gives the input back.
   */
  inputOwner: { current: symbol | undefined };
}>;

/**
 * The adapters, and the re-hover the tool asks for when a feature graph or pick tree it waited on lands.
 *
 * @public
 */
export type MeasureToolAdapters = Readonly<{
  follower: MeasureSessionAdapterLogic;
  pointer: MeasureSessionAdapterLogic;
  /** Hovers again from where the pointer rests, on the next frame. Nothing hovers while Measure is off. */
  rehover: () => void;
}>;

/** A press waiting on the targets under it: where it was released, by what, what it waits on, and for how long. */
type DeferredMeasurePress = Readonly<{
  generation: number;
  at: MeasurePointerAt;
  isTouch: boolean;
  preparing: Promise<void>;
  waits: number;
  /** The camera it was released under: its screen position means nothing under another. */
  cameraWorld: THREE.Matrix4;
  cameraProjection: THREE.Matrix4;
  /** The graph under the press and its failure count when released. */
  pendingSurface?: THREE.Mesh;
  failures: number;
}>;

/** The release whose decision the session is reaching. */
type PendingRelease = Readonly<{
  snapshot: MeasurePointerSnapshot;
  point: [number, number, number] | undefined;
  isTouch: boolean;
  at: MeasurePointerAt;
  preparing: Promise<void> | undefined;
}>;

/**
 * How many steps of progress a press made while its targets were being prepared waits through before it is dropped.
 * Each step is a feature graph or pick tree landing (or failing), so this only bounds a worker that keeps failing.
 */
const maxDeferredPressWaits = 64;

/** How far, in CSS pixels, a press may travel and still be a click or tap that waits on its targets, not a drag. */
const deferredPressSlopPx = { mouse: 4, touch: 10 } as const;

/** Pointer events whose position is where the pointer still rests over the event source. */
const restingPointerEventTypes: ReadonlySet<string> = new Set([
  'pointermove',
  'pointerdown',
  'pointerup',
  'pointerover',
]);

/**
 * Where a mouse or pen pointer rests over `element`, from the last event R3F's event source saw, or nothing once it
 * left (R3F does not record a leave, so the element's `:hover` answers that), was cancelled, or was a touch (a lifted
 * finger does not hover).
 *
 * @internal
 * @param event - R3F's last pointer event (`internal.lastEvent`).
 * @param element - The element measure listens on.
 * @returns The pointer's client coordinates, or `undefined`.
 */
export const restingPointerOver = (
  event: Readonly<Partial<PointerEvent>> | undefined,
  element: HTMLElement,
): MeasurePointerAt | undefined => {
  if (
    !event ||
    !restingPointerEventTypes.has(event.type ?? '') ||
    event.pointerType === 'touch' ||
    event.clientX === undefined ||
    event.clientY === undefined ||
    !element.matches(':hover')
  ) {
    return undefined;
  }
  const rect = element.getBoundingClientRect();
  const { clientX, clientY } = event;
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    ? { clientX, clientY }
    : undefined;
};

const toMeters = (renderFrame: RenderFrame, point: THREE.Vector3): [number, number, number] => [
  ...fromThreeRenderPoint({ renderFrame, point }),
];

/** The graphics snapshot, read when a report needs it. */
const selectGraphics = (graphics: GraphicsActorRef): GraphicsSnapshot => graphics.getSnapshot();

/** The pose revision the kinematics actor holds now. */
const selectPoseRevision = (kinematics: KinematicsRef): number => kinematics.getSnapshot().context.revision;

/** The component display revision the model interaction actor holds now. */
const selectDisplayRevision = (modelInteraction: GraphicsContext['modelInteractionRef']): number =>
  modelInteraction.getSnapshot().context.displayRevision;

/** The manifest of the unit Measure works on, which names the hover's candidates. */
const selectUnitManifest = (
  modelInteraction: GraphicsContext['modelInteractionRef'],
  unitId: string | undefined,
): unknown =>
  unitId ? getModelInteractionUnitState(modelInteraction.getSnapshot().context, unitId).manifest : undefined;

/** What a pointer snapshot reads from graphics that, once changed, a waiting press no longer applies to. */
const sourceOf = (snapshot: GraphicsSnapshot): string =>
  `${selectPresentedGeometryKey(snapshot)}:${snapshot.context.pickableMeshesVersion}`;

/** The settings a hover is taken with: a change hovers again from where the pointer rests. */
const hoverSettingsOf = ({ context }: GraphicsSnapshot): string =>
  `${context.measureMode}:${context.measureFilter}:${context.measureSnapEnabled}:${context.measureSnapDistance}:${context.measureOperation}`;

/**
 * Builds the measure session's adapters around one surface.
 *
 * @param options - The surface, R3F's root state, the actors and the tool's host functions.
 * @returns The `follower` and `pointer` logic to provide to the measure session, and the tool's re-hover.
 * @public
 */
export const createMeasureToolAdapters = ({
  surface,
  get,
  graphics,
  kinematics,
  host,
  inputOwner,
}: MeasureToolAdapterOptions): MeasureToolAdapters => {
  /** The pointer adapter's hover queue while it runs. */
  let hovers: ReturnType<typeof createRafCoalescer<MeasurePointerAt>> | undefined;
  /** Where the session last hovered, mirrored so a landed graph can hover again from it. */
  let hoverAt: MeasurePointerAt | undefined;

  const follower = createCallbackLogic<MeasureSessionCommand, undefined>(({ sendBack }) => {
    const report = (event: MeasureSessionEvent): void => {
      sendBack(event);
    };
    const first = selectGraphics(graphics);
    let isActive = first.context.isMeasureActive;
    let start = first.context.currentMeasurementStart;
    let cuts = first.context.committedSectionCuts;
    let source = sourceOf(first);
    let settings = hoverSettingsOf(first);
    report({ type: 'measureActiveChanged', active: isActive });

    // The hover's candidate labels name components from the unit's manifest. Either actor may change first: graphics
    // names the unit, the model interaction actor holds its manifest.
    const { modelInteractionRef } = first.context;
    let manifest = selectUnitManifest(modelInteractionRef, first.context.modelInteractionUnitId);
    const followManifest = (): void => {
      const unitManifest = selectUnitManifest(
        modelInteractionRef,
        selectGraphics(graphics).context.modelInteractionUnitId,
      );
      if (unitManifest !== manifest) {
        manifest = unitManifest;
        report({ type: 'hoverSettingsChanged' });
      }
    };

    const graphicsSubscription = graphics.subscribe((snapshot) => {
      const { context } = snapshot;
      if (context.isMeasureActive !== isActive) {
        isActive = context.isMeasureActive;
        report({ type: 'measureActiveChanged', active: isActive });
      }
      if (context.currentMeasurementStart !== start) {
        start = context.currentMeasurementStart;
        // A start placed or cancelled (Escape) while a press waits: the press belonged to the measurement before it.
        report({ type: 'startChanged' });
      }
      if (context.committedSectionCuts !== cuts) {
        cuts = context.committedSectionCuts;
        if (isActive) {
          host.current?.cutsChanged(context);
          report({ type: 'cutsChanged' });
        }
      }
      const nextSource = sourceOf(snapshot);
      if (nextSource !== source) {
        source = nextSource;
        report({ type: 'sourceChanged' });
      }
      const nextSettings = hoverSettingsOf(snapshot);
      if (nextSettings !== settings) {
        settings = nextSettings;
        report({ type: 'hoverSettingsChanged' });
      }
      followManifest();
    });

    // The view's camera child: a drag it reports steals a measuring press.
    const { cameraRef } = first.context;
    let isDragging = selectCameraDragging(cameraRef);
    const cameraSubscription = cameraRef.subscribe(() => {
      const dragging = selectCameraDragging(cameraRef);
      if (dragging !== isDragging) {
        isDragging = dragging;
        report({ type: 'cameraDragChanged', dragging });
      }
    });

    let revision = selectPoseRevision(kinematics);
    const kinematicsSubscription = kinematics.subscribe((snapshot) => {
      if (snapshot.context.revision === revision) {
        return;
      }
      ({ revision } = snapshot.context);
      host.current?.poseChanged(revision, isActive);
      report({ type: 'poseChanged', revision });
    });

    let displayRevision = selectDisplayRevision(modelInteractionRef);
    const modelSubscription = modelInteractionRef.subscribe((snapshot) => {
      if (snapshot.context.displayRevision !== displayRevision) {
        ({ displayRevision } = snapshot.context);
        report({ type: 'sourceChanged' });
      }
      followManifest();
    });

    // The presented camera, followed in the frame it is drawn in: a pose, a resize, a render-frame rebase or a clip
    // change all move its matrices, and the raycasts read exactly those.
    const presented = {
      camera: undefined as THREE.Camera | undefined,
      world: new THREE.Matrix4(),
      projection: new THREE.Matrix4(),
    };
    const followCamera = (): void => {
      if (!isActive) {
        return;
      }
      const { camera } = get();
      if (
        presented.camera === camera &&
        presented.world.equals(camera.matrixWorld) &&
        presented.projection.equals(camera.projectionMatrix)
      ) {
        return;
      }
      presented.camera = camera;
      presented.world.copy(camera.matrixWorld);
      presented.projection.copy(camera.projectionMatrix);
      report({ type: 'cameraPresented' });
    };
    const subscribeFrame = get().internal.subscribe as FrameSubscribe;
    const unsubscribeFrame = subscribeFrame({ current: followCamera }, cameraFollowPriority, { getState: get });

    return () => {
      graphicsSubscription.unsubscribe();
      cameraSubscription.unsubscribe();
      kinematicsSubscription.unsubscribe();
      modelSubscription.unsubscribe();
      unsubscribeFrame();
    };
  });

  const pointer = createCallbackLogic<MeasureSessionCommand, undefined>(({ sendBack, receive }) => {
    const listeners = new AbortController();
    const activePointerIds = new Set<number>();
    /** What the current press found pending at pointer down, for its release to wait on. */
    let pressPreparing: Promise<void> | undefined;
    /** Where the current press went down, so a release that dragged away is never taken for a click. */
    let pressOrigin: (MeasurePointerAt & { pointerId: number }) | undefined;
    let release: PendingRelease | undefined;
    let waiting: DeferredMeasurePress | undefined;
    let isStopped = false;
    const ownership = Symbol('measure input owner');
    inputOwner.current = ownership;
    const queue = createRafCoalescer<MeasurePointerAt>((at) => {
      host.current?.snapshot(at, false);
    });
    hovers = queue;

    const take = (at: MeasurePointerAt, coarsePointer: boolean): MeasurePointerSnapshot | undefined =>
      host.current?.snapshot(at, coarsePointer);

    const wait = (press: DeferredMeasurePress): void => {
      waiting = press;
      host.current?.prioritize({ hasTarget: false, hasActiveSnapTarget: false, pendingSurface: press.pendingSurface });
      // async-iife: bootstrap -- A pointer handler cannot await targets still being prepared off the main thread.
      void (async (): Promise<void> => {
        await press.preparing;
        if (!isStopped && waiting === press) {
          sendBack({ type: 'pressReady', generation: press.generation });
        }
      })();
    };

    /** Takes a waiting press's snapshot again once its targets are prepared, and lands it as its release would have. */
    const land = (press: DeferredMeasurePress): void => {
      const { current } = host;
      waiting = undefined;
      if (!current) {
        return;
      }
      const liveCamera = get().camera;
      if (
        !liveCamera.matrixWorld.equals(press.cameraWorld) ||
        !liveCamera.projectionMatrix.equals(press.cameraProjection)
      ) {
        // Zoomed, framed or turned by the view cube while it waited: the press's screen position is somewhere else now.
        return;
      }
      if (press.pendingSurface && current.graphFailures(press.pendingSurface) !== press.failures) {
        return;
      }
      const snapshot = current.snapshot(press.at, press.isTouch);
      if (!snapshot.hasActiveSnapTarget && snapshot.whenReady) {
        if (press.waits < maxDeferredPressWaits) {
          // Something else under it was still being prepared (a pick tree after the graph): wait for that too.
          wait({
            ...press,
            preparing: snapshot.whenReady,
            waits: press.waits + 1,
            pendingSurface: snapshot.pendingSurface,
            failures: snapshot.pendingSurface ? current.graphFailures(snapshot.pendingSurface) : 0,
          });
        }
        return;
      }
      if (!snapshot.hasTarget && !snapshot.hasActiveSnapTarget) {
        return;
      }
      if (press.isTouch) {
        if (snapshot.target) {
          graphics.send({ type: 'chooseMeasureCandidate', id: snapshot.target.id });
        }
        return;
      }
      const point = snapshot.point ? toMeters(current.renderFrame(), snapshot.point) : undefined;
      const start = current.currentStart();
      if (point && (start === undefined || new THREE.Vector3(...start).distanceTo(new THREE.Vector3(...point)) !== 0)) {
        current.commit(snapshot);
      }
      sendBack({ type: 'pressSettled', at: press.at });
    };

    const decide = (decision: 'accepted' | 'cancelled' | 'ignored'): void => {
      const decided = release;
      release = undefined;
      if (!decided) {
        return;
      }
      if (decision === 'cancelled') {
        graphics.send({ type: 'cancelCurrentMeasurement' });
        host.current?.clearSelection();
        return;
      }
      if (decided.isTouch && decided.snapshot.target) {
        graphics.send({ type: 'chooseMeasureCandidate', id: decided.snapshot.target.id });
      }
      if (decision === 'accepted' && decided.point && !decided.isTouch) {
        host.current?.commit(decided.snapshot);
      }
    };

    const defer = (generation: number): void => {
      const decided = release;
      release = undefined;
      const { current } = host;
      if (!decided?.preparing || !current) {
        return;
      }
      const { camera } = get();
      const { pendingSurface } = decided.snapshot;
      wait({
        generation,
        at: decided.at,
        isTouch: decided.isTouch,
        preparing: decided.preparing,
        waits: 1,
        cameraWorld: camera.matrixWorld.clone(),
        cameraProjection: camera.projectionMatrix.clone(),
        pendingSurface,
        failures: pendingSurface ? current.graphFailures(pendingSurface) : 0,
      });
    };

    receive((message) => {
      switch (message.type) {
        case 'hover': {
          hoverAt = message.at;
          if (message.when === 'now') {
            take(message.at, false);
          } else {
            queue.schedule(message.at);
          }
          return;
        }
        case 'hoverCleared': {
          hoverAt = undefined;
          queue.cancel();
          host.current?.clearHover();
          return;
        }
        case 'releaseDecided': {
          decide(message.decision);
          return;
        }
        case 'pressDeferred': {
          defer(message.generation);
          return;
        }
        case 'pressLanded': {
          if (waiting?.generation === message.generation) {
            land(waiting);
          }
          return;
        }
        case 'candidatesInvalidated': {
          host.current?.invalidateCandidates();
          break;
        }
      }
    });

    const { signal } = listeners;
    const at = (event: PointerEvent): MeasurePointerAt => ({ clientX: event.clientX, clientY: event.clientY });

    surface.addEventListener(
      'pointermove',
      (event) => {
        if (activePointerIds.size <= 1) {
          sendBack({ type: 'pointerMoved', at: at(event) });
        }
      },
      { signal },
    );
    surface.addEventListener(
      'pointerdown',
      (event) => {
        const { current } = host;
        if (!current) {
          return;
        }
        pressOrigin = { ...at(event), pointerId: event.pointerId };
        hoverAt = at(event);
        activePointerIds.add(event.pointerId);
        current.releaseChosenCandidate();
        const snapshot = current.snapshot(at(event), event.pointerType === 'touch');
        pressPreparing = snapshot.hasActiveSnapTarget ? undefined : snapshot.whenReady;
        if (pressPreparing) {
          current.prioritize(snapshot);
        }
        sendBack({
          type: 'pointerPressed',
          at: at(event),
          pointerCount: activePointerIds.size,
          button: event.button,
          hasTarget: snapshot.hasTarget || snapshot.hasActiveSnapTarget,
          // Read now: the camera reports a drag before anything re-renders with it.
          cameraMoving: selectCameraDragging(selectGraphics(graphics).context.cameraRef),
          pointerId: event.pointerId,
          isPrimary: event.isPrimary && activePointerIds.size === 1,
        });
      },
      { signal },
    );
    surface.addEventListener(
      'pointerup',
      (event) => {
        activePointerIds.delete(event.pointerId);
        const { current } = host;
        if (!current) {
          return;
        }
        const isTouch = event.pointerType === 'touch';
        hoverAt = at(event);
        const snapshot = current.snapshot(at(event), isTouch);
        const { hasActiveSnapTarget, hasTarget } = snapshot;
        const point = snapshot.point ? toMeters(current.renderFrame(), snapshot.point) : undefined;
        const start = current.currentStart();
        const isZeroLength =
          point !== undefined && start !== undefined
            ? new THREE.Vector3(...start).distanceTo(new THREE.Vector3(...point)) === 0
            : false;
        const preparing = (hasActiveSnapTarget ? undefined : snapshot.whenReady) ?? pressPreparing;
        pressPreparing = undefined;
        const origin = pressOrigin;
        pressOrigin = undefined;
        const slop = isTouch ? deferredPressSlopPx.touch : deferredPressSlopPx.mouse;
        const stayedPut =
          origin !== undefined &&
          origin.pointerId === event.pointerId &&
          Math.hypot(event.clientX - origin.clientX, event.clientY - origin.clientY) <= slop;
        // Read now, not from a render: the camera reports a drag before anything re-renders with it.
        const { cameraRef, suppressNextModelPointerClick } = selectGraphics(graphics).context;
        // A click or tap that found no snap target while targets under it were still being prepared is not a miss yet,
        // nor a bare surface point where the prepared graph would snap it. A drag (an orbit) is neither.
        const awaitingTargets =
          preparing !== undefined &&
          stayedPut &&
          !selectCameraDragging(cameraRef) &&
          !suppressNextModelPointerClick &&
          !hasActiveSnapTarget;
        release = { snapshot, point, isTouch, at: at(event), preparing };
        sendBack({
          type: 'pointerReleased',
          at: at(event),
          button: event.button,
          hasTarget,
          hasCurrentStart: start !== undefined,
          isZeroLength,
          hasActiveSnapTarget,
          awaitingTargets,
          pointerId: event.pointerId,
        });
      },
      { signal },
    );
    surface.addEventListener(
      'pointercancel',
      (event) => {
        activePointerIds.delete(event.pointerId);
        sendBack({ type: 'pointerCancelled', pointerId: event.pointerId });
      },
      { signal },
    );
    surface.addEventListener(
      'pointerleave',
      () => {
        sendBack({ type: 'pointerLeft' });
      },
      { signal },
    );
    globalThis.addEventListener(
      'blur',
      () => {
        activePointerIds.clear();
        sendBack({ type: 'windowBlurred' });
      },
      { signal },
    );
    surface.addEventListener(
      'contextmenu',
      (event) => {
        // A right click cancels the current measurement; it opens no menu while Measure is on.
        event.preventDefault();
      },
      { signal },
    );
    graphics.send({ type: 'setMeasureInputReady', ready: true });

    // The tool mounts when Measure turns on (lazily, on its first use), after the pointer may already have moved over
    // the model: that move reached only R3F's event source, and a pointer held still sends no other. Hover from where
    // it rests, so the first hover or click after turning Measure on is not lost.
    const seed = restingPointerOver(
      (get().internal.lastEvent.current ?? undefined) as Partial<PointerEvent> | undefined,
      surface,
    );
    if (seed) {
      sendBack({ type: 'pointerMoved', at: seed });
    }

    return () => {
      isStopped = true;
      listeners.abort();
      queue.cancel();
      if (hovers === queue) {
        hovers = undefined;
      }
      hoverAt = undefined;
      waiting = undefined;
      release = undefined;
      if (inputOwner.current !== ownership) {
        // A newer pointer adapter took the input over: its hover and readiness are its own.
        return;
      }
      inputOwner.current = undefined;
      host.current?.clearHover();
      if (selectGraphics(graphics).context.measurePreviewDistance !== undefined) {
        graphics.send({ type: 'setMeasurePreviewDistance' });
      }
      graphics.send({ type: 'setMeasureInputReady', ready: false });
    };
  });

  return {
    follower,
    pointer,
    rehover: () => {
      if (hoverAt) {
        hovers?.schedule(hoverAt);
      }
    },
  };
};
