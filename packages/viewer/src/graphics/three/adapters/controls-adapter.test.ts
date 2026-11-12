import { afterEach, describe, expect, it, vi } from 'vitest';
import CameraControlsImpl from 'camera-controls';
import { OrthographicCamera, PerspectiveCamera as ThreePerspectiveCamera, Raycaster, Scene, Vector3 } from 'three';
import type { Camera, PerspectiveCamera } from 'three';
import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { Actor, InspectionEvent } from 'xstate';
import type { RootState } from '@react-three/fiber';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import type { CameraOwnedSettings } from '#graphics/graphics-settings.js';
import {
  createControlsAdapter,
  retargetCameraControls,
  tickPriority,
} from '#graphics/three/adapters/controls-adapter.js';
import { surfacePriority } from '#graphics/three/three-canvas-instance-host.js';
import type { RetargetableCameraControls } from '#graphics/three/adapters/controls-adapter.js';
import { graphicsMachine, selectGraphicsViewportGizmoLocked } from '#machines/graphics.machine.js';
import type { ViewportGizmoAdapterEvent, ViewportGizmoAdapterLogic } from '#machines/viewport-gizmo-gesture.machine.js';
import type { GraphicsCameraRef } from '#machines/graphics.machine.js';
import { asCameraActor } from '#services/graphics-camera-registry.js';

type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;

/* The controls adapter is the only `camera-controls` listener (charter I9) and the driver that presents the camera
 * (charter I3). These rows run it as graphics runs it: spawned by `controlsAttached`, stopped with the canvas. */

const cameraView = {
  frameId: 'tau:root',
  target: [0, 0, 0],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 10,
  perspectiveZoom: 1,
} as const;

type Harness = {
  graphics: Actor<typeof graphicsMachine>;
  camera: GraphicsCameraRef;
  rig: ThreeCameraRig;
  state: RootState;
  calls: string[];
  consumers: Set<CameraUpdateHandler>;
  graphicsEvents: string[];
  cameraEvents: Array<Readonly<{ type: string; echoRevision?: number }>>;
  controls: () => CameraControlsImpl;
  attach: () => void;
};

const harnesses: Harness[] = [];

/** The frame callbacks the adapter subscribed on the stub root, each with its priority, in subscription order. */
const frameSubscriptions = (
  harness: Harness,
): Array<{ ref: Parameters<RootState['internal']['subscribe']>[0]; priority: number }> =>
  vi.mocked(harness.state.internal.subscribe).mock.calls.map(([ref, priority]) => ({ ref, priority }));

const createHarness = (seed?: Partial<CameraOwnedSettings>): Harness => {
  const camera = seed ?? { cameraView };
  const graphicsEvents: string[] = [];
  const cameraEvents: Array<Readonly<{ type: string; echoRevision?: number }>> = [];
  const graphics = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    {
      input: { camera },
      inspect(event: InspectionEvent) {
        if (event.type !== '@xstate.transition') {
          return;
        }
        const { type } = event.event as { type: string };
        if (event.actorRef === graphics) {
          graphicsEvents.push(type);
        } else if ((event.actorRef as unknown) === graphics.getSnapshot().context.cameraRef) {
          cameraEvents.push(event.event as { type: string; echoRevision?: number });
        }
      },
    },
  );
  graphics.start();
  const { cameraRef } = graphics.getSnapshot().context;
  const connectorRef: { current: CameraUpdateHandler | undefined } = { current: undefined };
  const consumers = new Set<CameraUpdateHandler>();
  // The provider's presentation: the rig publishes each change through the connector the adapter fills.
  const rig = createThreeCameraRig({
    actorRef: asCameraActor(cameraRef),
    onUpdate(nativeCamera, snapshot) {
      connectorRef.current?.(nativeCamera, snapshot);
    },
  });
  const calls: string[] = [];
  const scene = new Scene();
  const state = {
    camera: rig.activeCamera as Camera,
    controls: null as RootState['controls'],
    gl: { domElement: document.createElement('div') },
    events: { connected: undefined as HTMLElement | undefined },
    scene,
    raycaster: new Raycaster(),
    size: { width: 800, height: 600, top: 0, left: 0 },
    invalidate: vi.fn(() => calls.push('invalidate')),
    set: vi.fn((patch: Partial<RootState>) => {
      if (patch.camera) {
        calls.push('publish');
      }
      Object.assign(state, patch);
    }),
    get: () => state,
    internal: { subscribe: vi.fn(() => () => undefined) },
  } as unknown as RootState & { set: ReturnType<typeof vi.fn>; invalidate: ReturnType<typeof vi.fn> };
  const harness: Harness = {
    graphics,
    camera: cameraRef,
    rig,
    state,
    calls,
    consumers,
    graphicsEvents,
    cameraEvents,
    controls: () => state.controls as unknown as CameraControlsImpl,
    attach() {
      graphics.send({ type: 'canvasAttached', canvasId: 'canvas', kind: 'canvas' });
      // The canvas actor hands the camera the surface's viewport when its renderer exists, as `onCreated` does.
      graphics.getSnapshot().context.canvas?.ref.send({
        type: 'hostCreated',
        backend: 'webgl',
        surface: { width: 800, height: 600, pixelRatio: 1 },
        domElement: document.createElement('canvas'),
        host: createCallbackLogic(() => undefined),
      });
      graphics.send({
        type: 'controlsAttached',
        canvasId: 'canvas',
        adapter: createControlsAdapter({
          root: state,
          rig,
          connectorRef,
          consumersRef: { current: consumers },
          getUpAxis: () => 'z',
          // As the canvas reads it: the view cube's gesture holds the lock as a state tag.
          isInteractionLocked: () => selectGraphicsViewportGizmoLocked(graphics.getSnapshot()),
        }),
      });
    },
  };
  harnesses.push(harness);
  return harness;
};

describe('controls adapter', () => {
  afterEach(() => {
    for (const { graphics, rig } of harnesses.splice(0)) {
      graphics.stop();
      rig.dispose();
    }
    vi.restoreAllMocks();
  });

  it('retargets retained consumers before publishing one camera and invalidating', () => {
    const harness = createHarness();
    harness.attach();
    harness.consumers.add(() => harness.calls.push('retarget'));
    harness.calls.length = 0;

    harness.camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });

    const { calls } = harness;
    expect(calls.filter((call) => call !== 'invalidate')).toEqual(['retarget', 'publish']);
    expect(calls.at(-1)).toBe('invalidate');
    expect(harness.state.camera).toBe(harness.rig.orthographicCamera);
    expect(harness.rig.activeCamera).toBeInstanceOf(OrthographicCamera);
  });

  it('should retarget a viewport revision without republishing an unchanged grid span', () => {
    const harness = createHarness();
    harness.attach();
    const retarget = vi.fn();
    harness.consumers.add(retarget);
    const span = harness.graphics.getSnapshot().context.cameraVisibleSpan;
    harness.graphicsEvents.length = 0;

    harness.camera.send({ type: 'setViewport', viewport: { width: 700, height: 600, pixelRatio: 1 } });

    expect(retarget).toHaveBeenCalledOnce();
    expect(harness.graphicsEvents.filter((type) => type === 'cameraViewChanged')).toEqual(['cameraViewChanged']);
    expect(harness.graphics.getSnapshot().context.cameraVisibleSpan).toBe(span);
  });

  it('retargets a same-camera field-of-view revision without publishing a camera', () => {
    const harness = createHarness();
    harness.attach();
    harness.consumers.add((_camera, snapshot) => {
      harness.calls.push(`retarget:${snapshot.view.requestedVerticalFieldOfView}`);
    });
    harness.calls.length = 0;

    harness.camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 39 });

    expect(harness.calls.filter((call) => call !== 'invalidate')).toEqual(['retarget:39']);
    expect(harness.calls.at(-1)).toBe('invalidate');
    expect(harness.state.camera).toBe(harness.rig.perspectiveCamera);
  });

  it('is the one listener of each camera-controls event, and reports one move per gesture', () => {
    const added: string[] = [];
    const { addEventListener } = CameraControlsImpl.prototype;
    vi.spyOn(CameraControlsImpl.prototype, 'addEventListener').mockImplementation(
      function (this: CameraControlsImpl, type, listener) {
        added.push(type);
        addEventListener.call(this, type, listener);
      },
    );
    const harness = createHarness();
    harness.attach();

    expect(added.toSorted()).toEqual(['control', 'controlend', 'controlstart', 'transitionstart', 'update', 'wake']);
    const controls = harness.controls();
    harness.graphicsEvents.length = 0;
    controls.dispatchEvent({ type: 'controlstart' });
    for (let step = 0; step < 3; step++) {
      controls.dispatchEvent({ type: 'control' });
    }
    controls.dispatchEvent({ type: 'controlend' });

    expect(harness.graphicsEvents.filter((type) => type.startsWith('interaction'))).toEqual([
      'interactionStarted',
      'interactionMoved',
      'interactionEnded',
    ]);
  });

  it('republishes raycaster clipping when the clip planes change without a pose change', () => {
    const harness = createHarness();
    harness.attach();
    vi.mocked(harness.state.invalidate).mockClear();

    harness.rig.setClipPlanes({ farPaddingVerticalSpans: 1000 });

    const nativeCamera = harness.rig.activeCamera as PerspectiveCamera;
    expect(harness.state.raycaster.near).toBe(nativeCamera.near);
    expect(harness.state.raycaster.far).toBe(nativeCamera.far);
    expect(harness.state.invalidate).toHaveBeenCalled();
  });

  it('presents a camera framed before the canvas existed on the controls it creates', () => {
    const harness = createHarness();
    harness.camera.send({ type: 'poseObserved', source: 'gizmo', ...cameraView, perspectiveZoom: 1.625 });
    harness.attach();
    const controls = harness.controls();
    const camera = harness.rig.perspectiveCamera;
    const position = camera.position.clone();

    controls.update(0);

    expect(camera.zoom).toBe(1.625);
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-9);
    expect(controls.getTarget(camera.position.clone()).toArray()).toEqual([0, 0, 0]);
  });

  it('round-trips a pose and its perspective zoom from camera-controls into the camera', () => {
    const harness = createHarness();
    harness.camera.send({ type: 'poseObserved', source: 'gizmo', ...cameraView, perspectiveZoom: 1.75 });
    harness.attach();
    const controls = harness.controls();

    void controls.setLookAt(8, -6, 4, 1, 2, 3, false);
    controls.update(0);

    const { view, lastChange } = harness.camera.getSnapshot().context;
    expect(lastChange.source).toBe('input');
    expect(view.perspectiveZoom).toBe(1.75);
    for (const [index, value] of view.target.entries()) {
      expect(value).toBeCloseTo([1, 2, 3][index]!, 9);
    }
  });

  /* The rig presents an orthographic span through the frustum at zoom 1, while camera-controls forces its own zoom on
   * every update: a zoom gesture must settle at the span it asked for, not shrink it again each frame. */
  it('settles an orthographic zoom gesture at the span it asked for', () => {
    const harness = createHarness({ cameraView, cameraFovAngle: 0 });
    harness.attach();
    const controls = harness.controls();
    expect(harness.rig.activeCamera).toBe(harness.rig.orthographicCamera);
    const span = (): number => harness.camera.getSnapshot().context.view.verticalSpan;
    const before = span();

    void controls.zoomTo(2, false);
    controls.update(0);
    const zoomed = span();
    for (let frame = 0; frame < 8; frame += 1) {
      controls.update(1 / 60);
    }

    expect(zoomed).toBeCloseTo(before / 2, 6);
    expect(span()).toBeCloseTo(zoomed, 9);
    expect(harness.rig.orthographicCamera.zoom).toBe(1);
  });

  /* A restored or adopted view arrives as `poseObserved` with the source `input` from a sender that is not the
   * controls; camera-controls rewrites the native camera from its own state every frame, so it must take that pose. */
  it('writes a pose another sender reports as input onto the controls, so the next frame keeps it', () => {
    const harness = createHarness();
    harness.attach();
    const controls = harness.controls();

    harness.camera.send({ type: 'poseObserved', source: 'input', ...cameraView, target: [5, 5, 5] });
    controls.update(1 / 60);

    expect(controls.getTarget(harness.rig.perspectiveCamera.position.clone()).toArray()).toEqual([5, 5, 5]);
    const { target } = harness.camera.getSnapshot().context.view;
    expect(target).toEqual([5, 5, 5]);
    const position = harness.rig.perspectiveCamera.position.clone();
    controls.update(1 / 60);
    expect(harness.rig.perspectiveCamera.position.distanceTo(position)).toBeLessThan(1e-9);
  });

  it('stamps the update its own controls write causes, so the camera ignores that echo (I3)', () => {
    const harness = createHarness();
    harness.attach();
    harness.cameraEvents.length = 0;
    const { revision } = harness.camera.getSnapshot().context;

    harness.camera.send({ type: 'poseObserved', source: 'gizmo', ...cameraView, direction: [0, -1, 0] });

    const poses = harness.cameraEvents.filter((event) => event.type === 'poseObserved');
    expect(poses.length).toBeGreaterThan(1);
    expect(poses.slice(1).every((event) => Number.isInteger(event.echoRevision))).toBe(true);
    expect(harness.camera.getSnapshot().context.revision).toBe(revision + 1);
    expect(harness.camera.getSnapshot().context.lastChange.source).toBe('gizmo');
  });

  /* The removed up-direction handler answered every graphics up change with an input pose, which was saved and held the
   * camera settling for the settle window. Graphics' up now reaches the camera as `setUpDirection` (source `up`), and
   * the controls write it causes is an echo. */
  it('makes no input-sourced camera change when graphics adopts a new up direction', () => {
    const harness = createHarness();
    harness.attach();
    harness.cameraEvents.length = 0;

    harness.graphics.send({ type: 'setUpDirection', payload: 'y' });

    const { lastChange, view } = harness.camera.getSnapshot().context;
    expect(lastChange.source).toBe('up');
    expect(view.up).toEqual([0, 1, 0]);
    expect(harness.camera.getSnapshot().matches({ input: 'idle' })).toBe(true);
    const inputPoses = harness.cameraEvents.filter(
      (event) => event.type === 'poseObserved' && !Number.isInteger(event.echoRevision),
    );
    expect(inputPoses).toEqual([]);
  });

  it('orbits about an up direction the camera took before its canvas attached', () => {
    const harness = createHarness();
    harness.graphics.send({ type: 'setUpDirection', payload: 'y' });
    harness.attach();
    const controls = harness.controls();
    const target = controls.getTarget(new Vector3());
    const before = controls.camera.position.clone().sub(target);

    void controls.rotate(0.5, 0, false);
    controls.update(0);

    const after = controls.camera.position.clone().sub(target);
    expect(controls.camera.up.toArray()).toEqual([0, 1, 0]);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(after.z).not.toBeCloseTo(before.z, 3);
  });

  it('ends a held gesture when its canvas leaves mid-drag, so the camera is not stuck dragging', () => {
    const harness = createHarness();
    harness.attach();
    const controls = harness.controls();
    controls.dispatchEvent({ type: 'controlstart' });
    controls.dispatchEvent({ type: 'control' });
    void controls.setLookAt(8, -6, 4, 1, 2, 3, false);
    controls.update(0);
    expect(harness.camera.getSnapshot().matches({ input: 'dragging', gesture: 'held' })).toBe(true);
    expect(harness.graphics.getSnapshot().context.viewerHoverSuppressionReasons).toEqual(['cameraControls']);

    harness.graphics.send({ type: 'canvasDetached', canvasId: 'canvas' });

    expect(harness.camera.getSnapshot().matches({ input: 'settling', gesture: 'released' })).toBe(true);
    expect(harness.graphics.getSnapshot().context.controlsAdapter).toBeUndefined();
    expect(harness.graphics.getSnapshot().context.viewerHoverSuppressionReasons).toEqual([]);
    expect(harness.state.controls).toBeNull();
    // The camera keeps its pose, so it still counts as presented.
    expect(harness.graphics.getSnapshot().context.cameraPresented).toBe(true);
    // The stopped adapter no longer listens: a late event from the disposed controls reaches nobody.
    harness.graphicsEvents.length = 0;
    controls.dispatchEvent({ type: 'controlstart' });
    expect(harness.graphicsEvents).toEqual([]);
  });

  /* With an `eventSource`, R3F's wrapper takes no pointer events, so the canvas never sees a gesture. */
  it("listens on R3F's event source when the canvas has one, and follows it when it changes", () => {
    const harness = createHarness();
    const region = document.createElement('div');
    harness.state.events.connected = region;
    harness.attach();
    const attribute = 'data-camera-controls-version';

    expect(region.hasAttribute(attribute)).toBe(true);
    expect(harness.state.gl.domElement.hasAttribute(attribute)).toBe(false);

    const next = document.createElement('div');
    harness.state.events.connected = next;
    const calls = vi.mocked(harness.state.internal.subscribe).mock.calls as unknown as Array<
      [{ current: (state: RootState) => void }]
    >;
    calls[0]?.[0].current(harness.state);

    expect(region.hasAttribute(attribute)).toBe(false);
    expect(next.hasAttribute(attribute)).toBe(true);
  });

  it('runs one adapter per surface, ignoring a re-delivery for the same canvas', () => {
    const harness = createHarness();
    harness.attach();
    const first = harness.graphics.getSnapshot().context.controlsAdapter;
    const controls = harness.controls();

    harness.graphics.send({
      type: 'controlsAttached',
      canvasId: 'canvas',
      adapter: createControlsAdapter({
        root: harness.state,
        rig: harness.rig,
        connectorRef: { current: undefined },
        consumersRef: { current: new Set() },
        getUpAxis: () => 'z',
      }),
    });

    expect(harness.graphics.getSnapshot().context.controlsAdapter).toBe(first);
    expect(harness.controls()).toBe(controls);
  });

  it('steps the controls by the frame delta once per frame, before the frame renders, while they are enabled', () => {
    const harness = createHarness();
    harness.attach();
    const subscriptions = frameSubscriptions(harness);
    // One tick for the canvas, where R3F's own controls step, after the canvas host reports a resize to the camera and
    // before anything renders (positive priorities): the controls never step on a stale viewport.
    expect(subscriptions.map(({ priority }) => priority)).toEqual([tickPriority]);
    expect(surfacePriority).toBeLessThan(tickPriority);
    expect(tickPriority).toBeLessThan(0);
    const ticker = subscriptions[0]!.ref;
    const update = vi.spyOn(harness.controls(), 'update');

    ticker.current(harness.state, 1 / 60);
    expect(update.mock.calls).toEqual([[1 / 60]]);

    // The view cube disables the controls while it turns the camera.
    harness.controls().enabled = false;
    ticker.current(harness.state, 1 / 60);
    expect(update).toHaveBeenCalledOnce();
  });

  it('moves no camera on a frame step while the view cube holds its interaction lock', () => {
    const harness = createHarness();
    harness.attach();
    const ticker = frameSubscriptions(harness)[0]!.ref;
    const controls = harness.controls();
    // A scripted view cube: its adapter reports what the cube did, and graphics runs its gesture.
    let report: ((event: ViewportGizmoAdapterEvent) => void) | undefined;
    const adapter: ViewportGizmoAdapterLogic = createCallbackLogic(({ sendBack }) => {
      report = sendBack;
      return undefined;
    });
    harness.graphics.send({ type: 'viewportGizmoAttached', gizmoId: 'cube', adapter });
    const update = vi.spyOn(controls, 'update');
    const locked = (): boolean => selectGraphicsViewportGizmoLocked(harness.graphics.getSnapshot());

    // The cube takes a press and turns the camera: its gesture holds the lock.
    report?.({ type: 'gizmoPressed' });
    report?.({ type: 'gizmoTurned' });
    expect(locked()).toBe(true);
    const { revision } = harness.camera.getSnapshot().context;
    ticker.current(harness.state, 1 / 60);
    expect(update).not.toHaveBeenCalled();
    expect(harness.camera.getSnapshot().context.revision).toBe(revision);
    // Another tool's drag ends under the cube (a second pointer) and re-enables the controls: the lock still holds them.
    controls.enabled = true;
    ticker.current(harness.state, 1 / 60);
    expect(update).not.toHaveBeenCalled();
    expect(harness.camera.getSnapshot().context.revision).toBe(revision);

    // Released: the next frame steps the controls again.
    report?.({ type: 'gizmoReleased' });
    expect(locked()).toBe(false);
    update.mockClear();
    ticker.current(harness.state, 1 / 60);
    expect(update).toHaveBeenCalledOnce();
  });

  /* N1 and N2: a navigation step graphics forwards moves the controls, and the next frame reports the pose to the
   * camera as the person's input, as a drag does. */
  it("moves the camera by a navigation step graphics forwards, as the person's input", () => {
    const harness = createHarness();
    harness.attach();
    const controls = harness.controls();
    const ticker = frameSubscriptions(harness)[0]!.ref;
    const azimuth = controls.azimuthAngle;
    const { distance } = controls;
    const target = (): number[] => [...harness.camera.getSnapshot().context.view.target];
    const startTarget = target();
    const orbit = { type: 'navigateCamera', step: { kind: 'orbit', direction: 'left' } } as const;
    harness.calls.length = 0;

    expect(harness.graphics.getSnapshot().can(orbit)).toBe(true);
    harness.graphics.send(orbit);
    expect(harness.calls).toContain('invalidate');
    ticker.current(harness.state, 1 / 60);
    expect(controls.azimuthAngle).not.toBeCloseTo(azimuth, 6);
    expect(harness.camera.getSnapshot().context.lastChange.source).toBe('input');
    expect(target()).toEqual(startTarget);

    harness.graphics.send({ type: 'navigateCamera', step: { kind: 'zoom', direction: 'in' } });
    ticker.current(harness.state, 1 / 60);
    expect(controls.distance).toBeLessThan(distance);

    harness.graphics.send({ type: 'navigateCamera', step: { kind: 'pan', direction: 'right' } });
    ticker.current(harness.state, 1 / 60);
    expect(target()).not.toEqual(startTarget);
  });

  it('leaves a navigation step unhandled with no canvas controls, and moves nothing under the view cube lock', () => {
    const harness = createHarness();
    const step = { type: 'navigateCamera', step: { kind: 'orbit', direction: 'up' } } as const;
    expect(harness.graphics.getSnapshot().can(step)).toBe(false);
    harness.attach();
    const controls = harness.controls();
    const polar = controls.polarAngle;
    const release = harness.lock.begin();
    harness.graphics.send(step);
    controls.update(0);
    expect(controls.polarAngle).toBeCloseTo(polar, 9);
    release();
  });

  it('stops stepping the controls when its canvas leaves', () => {
    const harness = createHarness();
    const unsubscribe = vi.fn();
    vi.mocked(harness.state.internal.subscribe).mockReturnValue(unsubscribe);
    harness.attach();
    harness.graphics.send({ type: 'canvasDetached', canvasId: 'canvas' });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('retargetCameraControls', () => {
  it('retargets one controls instance and projection-specific input mappings', () => {
    const perspective = new ThreePerspectiveCamera();
    const orthographic = new OrthographicCamera();
    const controls: RetargetableCameraControls = {
      camera: perspective,
      cancel: vi.fn(),
      mouseButtons: { wheel: CameraControlsImpl.ACTION.DOLLY },
      touches: { two: CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK },
      updateCameraUp: vi.fn(),
    };

    expect(retargetCameraControls({ controls, camera: orthographic })).toBe(true);
    expect(controls.camera).toBe(orthographic);
    expect(controls.mouseButtons.wheel).toBe(CameraControlsImpl.ACTION.ZOOM);
    expect(controls.touches.two).toBe(CameraControlsImpl.ACTION.TOUCH_ZOOM_TRUCK);
    expect(controls.cancel).toHaveBeenCalledOnce();
    expect(controls.updateCameraUp).toHaveBeenCalledOnce();

    expect(retargetCameraControls({ controls, camera: orthographic })).toBe(false);
    expect(controls.cancel).toHaveBeenCalledOnce();

    expect(retargetCameraControls({ controls, camera: perspective })).toBe(true);
    expect(controls.mouseButtons.wheel).toBe(CameraControlsImpl.ACTION.DOLLY);
    expect(controls.touches.two).toBe(CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK);
  });

  it('preserves a disabled wheel policy while retargeting to orthographic', () => {
    const controls: RetargetableCameraControls = {
      camera: new ThreePerspectiveCamera(),
      cancel: vi.fn(),
      mouseButtons: { wheel: CameraControlsImpl.ACTION.NONE },
      touches: { two: CameraControlsImpl.ACTION.NONE },
      updateCameraUp: vi.fn(),
    };

    retargetCameraControls({ controls, camera: new OrthographicCamera() });

    expect(controls.mouseButtons.wheel).toBe(CameraControlsImpl.ACTION.NONE);
    expect(controls.touches.two).toBe(CameraControlsImpl.ACTION.NONE);
  });
});
