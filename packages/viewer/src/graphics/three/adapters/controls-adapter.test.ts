import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CameraControlsImpl from 'camera-controls';
import { OrthographicCamera, Raycaster, Scene } from 'three';
import type { Camera, PerspectiveCamera } from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor, InspectionEvent } from 'xstate';
import type { RootState } from '@react-three/fiber';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import type { CameraOwnedSettings } from '#graphics/graphics-settings.js';
import { createControlsAdapter } from '#graphics/three/adapters/controls-adapter.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
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
      graphics.send({
        type: 'controlsAttached',
        canvasId: 'canvas',
        adapter: createControlsAdapter({
          root: state,
          rig,
          connectorRef,
          consumersRef: { current: consumers },
          getUpAxis: () => 'z',
        }),
      });
    },
  };
  harnesses.push(harness);
  return harness;
};

describe('controls adapter', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'devicePixelRatio', 'get').mockReturnValue(1);
  });

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
    // The stopped adapter no longer listens: a late event from the disposed controls reaches nobody.
    harness.graphicsEvents.length = 0;
    controls.dispatchEvent({ type: 'controlstart' });
    expect(harness.graphicsEvents).toEqual([]);
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
});
