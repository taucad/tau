/*
 * The view cube's DOM adapter, run as graphics runs it: spawned by `viewportGizmoAttached` as the adapter of the
 * cube's gesture, beside the canvas's real controls adapter and the view's real camera. `ViewportGizmo` is a scripted
 * stand-in in controlled mode: it writes no camera and dispatches the cube's events with the pose.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Color, Raycaster, Scene, Vector3 } from 'three';
import type { Camera, EventDispatcher, Object3D } from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor, InspectionEvent } from 'xstate';
import type { RootState } from '@react-three/fiber';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { createCameraView } from '@taucad/camera';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import { createControlsAdapter } from '#graphics/three/adapters/controls-adapter.js';
import {
  createViewportGizmoAdapter,
  viewportGizmoRenderPriority,
} from '#graphics/three/controls/viewport-gizmo-adapter.js';
import type { SectionPlanePicker } from '#graphics/three/controls/section-plane-picker.js';
import type { GizmoStyleId } from '#graphics/three/controls/viewport-gizmo-styles.js';
import type { OrbitStyle } from '#graphics/three/controls/camera-wheel-router.js';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { subscribeViewerLoadTiming } from '#lib/viewer-load-timing.js';
import type { ViewerLoadSpan } from '#lib/viewer-load-timing.js';
import { graphicsMachine, selectGraphicsViewportGizmoLocked } from '#machines/graphics.machine.js';
import type { GraphicsCameraRef } from '#machines/graphics.machine.js';
import type { ViewportGizmoEnvironment } from '#machines/viewport-gizmo-gesture.machine.js';
import { asCameraActor } from '#graphics/graphics-camera.js';

type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;

type GizmoOptions = Readonly<{
  up: Readonly<{ x: number; y: number; z: number }>;
  type: string;
  placement: string;
  font: { family: string };
  x: { color: number; labelColor: number };
  triad?: { enabled: boolean };
  controlled: boolean;
  fieldOfView: number;
  roll: boolean | 'free';
  navigation: { enabled: boolean };
  offset: { top?: number; right?: number; bottom?: number };
}>;

const gizmos = vi.hoisted(() => [] as FakeGizmoShape[]);

type FakeGizmoShape = EventDispatcher<Record<string, Record<string, unknown>>> & {
  camera: Camera;
  readonly target: Vector3;
  animating: boolean;
  enabled: boolean;
  options: GizmoOptions;
  readonly sets: Array<Partial<GizmoOptions>>;
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly render: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
  readonly compile: ReturnType<typeof vi.fn>;
  readonly viewport: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly root: Readonly<{ children: Object3D[] }>;
  readonly domElement: HTMLElement;
};

vi.mock('three-viewport-gizmo', async () => {
  const three = await import('three');
  class ViewportGizmo extends three.EventDispatcher<Record<string, Record<string, unknown>>> {
    public camera: Camera;

    public readonly target = new three.Vector3();

    public animating = false;

    public enabled = true;

    public options: GizmoOptions;

    public readonly sets: Array<Partial<GizmoOptions>> = [];

    public readonly root = { children: [new three.Object3D(), new three.Object3D()] };

    public readonly domElement = document.createElement('div');

    public readonly dispose = vi.fn();

    public readonly render = vi.fn();

    public readonly update = vi.fn();

    public readonly compile = vi.fn(async () => undefined);

    public readonly viewport = { x: 600, y: 0, width: 96, height: 96 };

    public constructor(camera: Camera, _renderer: unknown, options: GizmoOptions) {
      super();
      this.camera = camera;
      this.options = options;
      gizmos.push(this as unknown as FakeGizmoShape);
    }

    public set(options: Partial<GizmoOptions>): void {
      // `set` merges into the current options and keeps the element.
      this.options = { ...this.options, ...options };
      this.sets.push(options);
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the module's own export name.
  return { ViewportGizmo };
});

const cameraView = {
  frameId: 'tau:root',
  target: [0, 0, 0],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 10,
  perspectiveZoom: 1,
} as const;

/** G3's driver snapshot fixture: what a camera presents to a retained consumer. */
const createDriverSnapshot = (requestedVerticalFieldOfView: number, revision: number): CameraDriverSnapshot => ({
  projection:
    requestedVerticalFieldOfView === 0
      ? { kind: 'orthographic' }
      : { kind: 'perspective', verticalFieldOfView: requestedVerticalFieldOfView },
  view: createCameraView({
    frameId: 'test-root',
    requestedVerticalFieldOfView,
    perspectiveZoom: 1,
    target: [1, 2, 3],
    direction: [1, -1, 0.7],
    up: [0, 0, 1],
    verticalSpan: 10,
    viewport: { width: 800, height: 600, pixelRatio: 1 },
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  }),
  perspectiveVerticalFieldOfView: requestedVerticalFieldOfView === 0 ? 60 : requestedVerticalFieldOfView,
  revision,
  lastChange: { source: 'framing', revision },
  renderFrame: { anchorFrameId: 'test-root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
});

const dark: ViewportGizmoEnvironment = { colorScheme: 'dark', isHighContrast: false, accentColor: '#00aaff' };

type Harness = Readonly<{
  graphics: Actor<typeof graphicsMachine>;
  camera: GraphicsCameraRef;
  rig: ThreeCameraRig;
  state: RootState & { invalidate: ReturnType<typeof vi.fn> };
  consumers: Set<CameraUpdateHandler>;
  /** The frame callbacks subscribed on the stub root, with their priorities, in subscription order. */
  frames: () => Array<{ ref: { current: (state: RootState, delta: number) => void }; priority: number }>;
  attachCube: (
    options?: Readonly<{
      planePicker?: SectionPlanePicker;
      backend?: ResolvedGraphicsBackend;
      gizmoStyle?: GizmoStyleId;
      orbitStyle?: OrbitStyle;
    }>,
  ) => void;
  gizmo: () => FakeGizmoShape;
  locked: () => boolean;
  /** The events graphics took, in order. */
  graphicsEvents: string[];
}>;

const actors: Array<Actor<typeof graphicsMachine>> = [];

afterEach(() => {
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
  gizmos.length = 0;
  vi.clearAllMocks();
});

const createHarness = (): Harness => {
  const graphicsEvents: string[] = [];
  const graphics: Actor<typeof graphicsMachine> = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    {
      input: { camera: { cameraView } },
      inspect(event: InspectionEvent) {
        if (event.type === '@xstate.transition' && event.actorRef === graphics) {
          graphicsEvents.push((event.event as { type: string }).type);
        }
      },
    },
  );
  actors.push(graphics);
  graphics.start();
  const { cameraRef } = graphics.getSnapshot().context;
  const connectorRef: { current: CameraUpdateHandler | undefined } = { current: undefined };
  const consumers = new Set<CameraUpdateHandler>();
  const rig = createThreeCameraRig({
    actorRef: asCameraActor(cameraRef),
    onUpdate(nativeCamera, snapshot) {
      connectorRef.current?.(nativeCamera, snapshot);
    },
  });
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  container.append(canvas);
  const state = {
    camera: rig.activeCamera as Camera,
    controls: null as RootState['controls'],
    gl: { domElement: canvas, toneMapping: 0, getPixelRatio: () => 1 },
    events: { connected: undefined as HTMLElement | undefined },
    scene: new Scene(),
    raycaster: new Raycaster(),
    size: { width: 800, height: 600, top: 0, left: 0 },
    viewport: { dpr: 1 },
    invalidate: vi.fn(),
    set: vi.fn((patch: Partial<RootState>) => {
      Object.assign(state, patch);
    }),
    get: () => state,
    internal: { subscribe: vi.fn(() => () => undefined) },
  } as unknown as RootState & { invalidate: ReturnType<typeof vi.fn> };
  const store = { getState: () => state, subscribe: vi.fn(() => () => undefined) };
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
      isInteractionLocked: () => selectGraphicsViewportGizmoLocked(graphics.getSnapshot()),
    }),
  });
  return {
    graphics,
    camera: cameraRef,
    rig,
    state,
    consumers,
    frames: () =>
      (
        vi.mocked(state.internal.subscribe).mock.calls as unknown as Array<
          [ReturnType<Harness['frames']>[number]['ref'], number]
        >
      ).map(([ref, priority]) => ({ ref, priority })),
    attachCube({ planePicker, backend = 'webgl', gizmoStyle, orbitStyle } = {}) {
      graphics.send({
        type: 'viewportGizmoAttached',
        gizmoId: 'cube',
        adapter: createViewportGizmoAdapter({
          store,
          size: 96,
          backend,
          rig,
          consumersRef: { current: consumers },
          graphics,
          planePicker,
          gizmoStyle,
          orbitStyle,
        }),
      });
    },
    gizmo: () => gizmos.at(-1)!,
    locked: () => selectGraphicsViewportGizmoLocked(graphics.getSnapshot()),
    graphicsEvents,
  };
};

/** Reports a pose, as a drag step or an animation frame does in controlled mode: the camera is not written. */
const turn = (
  gizmo: FakeGizmoShape,
  direction: readonly [number, number, number],
  { up = new Vector3(0, 0, 1), cause = 'drag' }: Readonly<{ up?: Vector3; cause?: string }> = {},
): void => {
  gizmo.dispatchEvent({
    type: 'change',
    cause,
    heading: null,
    pose: { direction: new Vector3(...direction).normalize(), up },
  });
};

/** The sets that restyle the cube, not the field of view it follows. */
const restyles = (gizmo: FakeGizmoShape): Array<Partial<GizmoOptions>> =>
  gizmo.sets.filter((options) => !('fieldOfView' in options));

describe('view cube adapter', () => {
  it('should turn the camera once with the source gizmo for a face click, and ignore the echo of its own write', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();
    const viewChanges: Array<Readonly<{ source: string; revision: number }>> = [];
    harness.camera.on('viewChanged', (event) => {
      viewChanges.push({ source: event.source, revision: event.revision });
    });
    const { revision } = harness.camera.getSnapshot().context;

    // A face click: the cube animates the camera to the top face in one frame and ends.
    gizmo.animating = true;
    // The cube nudges a top view off the z up axis, as `three-viewport-gizmo` does.
    turn(gizmo, [0, -0.01, 1], { cause: 'click' });
    gizmo.animating = false;
    gizmo.dispatchEvent({ type: 'end' });

    // One camera snapshot: the controls adapter wrote the controls with the change's stamp, and the `update` that
    // write caused was an echo the camera ignored.
    expect(viewChanges).toEqual([{ source: 'gizmo', revision: revision + 1 }]);
    const { context } = harness.camera.getSnapshot();
    expect(context.revision).toBe(revision + 1);
    expect(context.lastChange.source).toBe('gizmo');
    expect(context.view.direction[2]).toBeCloseTo(1, 3);
    expect(harness.locked()).toBe(false);
  });

  it('should take a face straight along the up axis, keeping the roll the cube turned to', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();
    // A top face, kept 1e-4 rad off the z up axis by the library, leaning toward -x.
    const { revision } = harness.camera.getSnapshot().context;

    turn(gizmo, [-1e-4, 0, 1]);

    const { context } = harness.camera.getSnapshot();
    expect(context.revision).toBe(revision + 1);
    expect(context.view.direction[2]).toBeCloseTo(1, 5);
    // Tilted further the way the cube leans, so the camera takes it and keeps the roll.
    expect(context.view.direction[0]).toBeLessThan(0);
    expect(context.view.direction[1]).toBeCloseTo(0, 6);
  });

  it('should keep the roll the cube turned to on a face straight down the up axis', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();
    // A bottom face, leaning toward +x.
    turn(gizmo, [1e-4, 0, -1]);

    const { direction } = harness.camera.getSnapshot().context.view;
    expect(direction[2]).toBeCloseTo(-1, 5);
    // Tilted further the way the cube leans.
    expect(direction[0]).toBeGreaterThan(0);
    expect(direction[1]).toBeCloseTo(0, 6);
  });

  it('should send each drag step to the camera and hold the lock while the press turns it', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();
    const controls = harness.state.controls as unknown as { enabled: boolean };

    gizmo.dispatchEvent({ type: 'press', pressed: null });
    turn(gizmo, [1, 0, 0.2]);
    turn(gizmo, [0, 1, 0.2]);

    expect(harness.locked()).toBe(true);
    expect(controls.enabled).toBe(false);
    expect(harness.camera.getSnapshot().context.lastChange.source).toBe('gizmo');
    expect(harness.camera.getSnapshot().context.view.direction[1]).toBeGreaterThan(0.9);
    // The controls do not step while the cube holds the lock.
    const update = vi.spyOn(harness.state.controls as unknown as { update: (delta: number) => boolean }, 'update');
    harness
      .frames()
      .find((frame) => frame.priority === -1)
      ?.ref.current(harness.state, 1 / 60);
    expect(update).not.toHaveBeenCalled();

    gizmo.dispatchEvent({ type: 'end' });

    expect(harness.locked()).toBe(false);
    expect(controls.enabled).toBe(true);
    expect(harness.graphicsEvents.filter((type) => /Hover|PointerGesture/.test(type))).toEqual([
      'beginViewerModelHoverSuppression',
      'markModelPointerGestureMoved',
      'markModelPointerGestureMoved',
      'endViewerModelHoverSuppression',
    ]);
  });

  it('should restore controls that were disabled before the press', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();
    const controls = harness.state.controls as unknown as { enabled: boolean };
    controls.enabled = false;

    gizmo.dispatchEvent({ type: 'press', pressed: null });
    gizmo.dispatchEvent({ type: 'press', pressed: null });
    gizmo.dispatchEvent({ type: 'end' });

    expect(controls.enabled).toBe(false);
  });

  it('should give back a held lock and the controls when the cube leaves mid-drag', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();
    const controls = harness.state.controls as unknown as { enabled: boolean };
    gizmo.dispatchEvent({ type: 'press', pressed: null });
    turn(gizmo, [1, 0, 0.2]);

    harness.graphics.send({ type: 'viewportGizmoDetached', gizmoId: 'cube' });

    expect(harness.locked()).toBe(false);
    expect(controls.enabled).toBe(true);
    expect(gizmo.dispose).toHaveBeenCalledOnce();
    expect(harness.consumers.size).toBe(0);
    expect(harness.graphics.getSnapshot().context.viewerHoverSuppressionReasons).not.toContain('viewportGizmo');
  });

  it('should retarget the cube and its field of view on every presented camera change, without a rebuild', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();
    gizmo.update.mockClear();

    harness.camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });

    expect(gizmos).toHaveLength(1);
    expect(gizmo.camera).toBe(harness.rig.orthographicCamera);
    expect(gizmo.update).toHaveBeenCalled();
  });

  it('should retarget its camera, field of view and target from a presented driver snapshot', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();
    gizmo.update.mockClear();

    // The cube is the view's only retained consumer here.
    for (const retarget of harness.consumers) {
      retarget(harness.rig.orthographicCamera, createDriverSnapshot(0, 1));
    }

    expect(gizmos).toHaveLength(1);
    expect(gizmo.camera).toBe(harness.rig.orthographicCamera);
    expect(gizmo.target.toArray()).toEqual([1, 2, 3]);
    expect(gizmo.update).toHaveBeenCalledOnce();
  });

  it('should follow the camera target unless the cube holds the lock or animates', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();

    harness.camera.send({ type: 'poseObserved', source: 'input', ...cameraView, target: [1, 2, 3] });
    const followed = gizmo.target.clone();
    expect(followed.length()).toBeGreaterThan(0);

    gizmo.dispatchEvent({ type: 'press', pressed: null });
    turn(gizmo, [1, 0, 0.2]);
    harness.camera.send({ type: 'poseObserved', source: 'input', ...cameraView, target: [4, 5, 6] });
    expect(gizmo.target.toArray()).toEqual(followed.toArray());
  });

  it('should build the cube once per start, in one gizmo.create span, around the view up axis', () => {
    const spans: ViewerLoadSpan[] = [];
    const unsubscribe = subscribeViewerLoadTiming((span) => {
      spans.push(span);
    });
    try {
      const harness = createHarness();
      harness.graphics.send({ type: 'setUpDirection', payload: 'y' });
      harness.attachCube();

      expect(gizmos).toHaveLength(1);
      expect(harness.gizmo().options.up).toEqual({ x: 0, y: 1, z: 0 });
      expect(spans.filter((span) => span.phase === 'gizmo.create')).toHaveLength(1);

      // The theme and the up axis repaint the same cube in place: no rebuild, no second span.
      harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });
      harness.graphics.send({ type: 'setUpDirection', payload: 'z' });

      expect(gizmos).toHaveLength(1);
      expect(restyles(harness.gizmo()).map((options) => options.up)).toEqual([
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: 1 },
      ]);
      expect(spans.filter((span) => span.phase === 'gizmo.create')).toHaveLength(1);
    } finally {
      unsubscribe();
    }
  });

  it.each([
    { gizmoStyle: undefined, type: 'rounded-cube', triad: true },
    { gizmoStyle: 'cube', type: 'rounded-cube', triad: true },
    { gizmoStyle: 'classic-cube', type: 'cube', triad: true },
    { gizmoStyle: 'axis-balls', type: 'sphere', triad: false },
  ] as const)(
    'should draw the $gizmoStyle style as a $type gizmo in controlled mode, and keep it across a repaint',
    ({ gizmoStyle, type, triad }) => {
      const harness = createHarness();
      harness.attachCube({ gizmoStyle });
      const gizmo = harness.gizmo();
      harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });

      expect([gizmo.options.type, restyles(gizmo).map((options) => options.type)]).toEqual([type, [type]]);
      expect(gizmo.options.controlled).toBe(true);
      expect(gizmo.options.triad?.enabled ?? false).toBe(triad);
      expect(gizmo.enabled).toBe(true);
    },
  );

  it.each([
    { orbitStyle: undefined, roll: false },
    { orbitStyle: 'turntable', roll: false },
    { orbitStyle: 'tumble', roll: 'free' },
  ] as const)(
    'should roll $roll in the $orbitStyle orbit style, with the navigation buttons on and room for them',
    ({ orbitStyle, roll }) => {
      const harness = createHarness();
      harness.attachCube({ orbitStyle });
      const gizmo = harness.gizmo();
      harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });

      expect([gizmo.options.roll, ...restyles(gizmo).map((options) => options.roll)]).toEqual([roll, roll]);
      expect(gizmo.options.navigation).toEqual({ enabled: true });
      expect(gizmo.options.offset).toEqual({ top: 24, bottom: 24, right: 24 });
    },
  );

  it('should draw the Axes style as the triad alone, taking no click, after a repaint too (G4)', () => {
    const harness = createHarness();
    harness.attachCube({ gizmoStyle: 'axes' });
    const gizmo = harness.gizmo();
    expect([gizmo.enabled, gizmo.options.triad?.enabled]).toEqual([false, true]);

    harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });

    expect([gizmo.enabled, gizmo.options.triad?.enabled]).toEqual([false, true]);
  });

  it('should repaint with stronger faces and legible labels in high-contrast dark mode', () => {
    const harness = createHarness();
    harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });
    harness.attachCube();
    const gizmo = harness.gizmo();
    const normalFace = gizmo.options.x.color;

    harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: { ...dark, isHighContrast: true } });

    const { color, labelColor } = gizmo.options.x;
    const luminance = (value: Color): number => 0.2126 * value.r + 0.7152 * value.g + 0.0722 * value.b;
    expect(gizmos).toHaveLength(1);
    expect(color).not.toBe(normalFace);
    expect((luminance(new Color(labelColor)) + 0.05) / (luminance(new Color(color)) + 0.05)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(gizmo.dispose).not.toHaveBeenCalled();
  });

  it('should warm the cube through the library after the build and after each repaint', () => {
    const harness = createHarness();
    harness.attachCube({ backend: 'webgpu' });

    expect(harness.gizmo().compile).toHaveBeenCalledOnce();
    harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });
    expect(harness.gizmo().compile).toHaveBeenCalledTimes(2);
  });

  it('should style the plane picker as the cube, draw it only while Section is on, and restyle it with the theme', () => {
    const harness = createHarness();
    const setStyle = vi.fn<SectionPlanePicker['setStyle']>();
    const render = vi.fn<SectionPlanePicker['render']>();
    const planePicker = { setStyle, render } as unknown as SectionPlanePicker;
    harness.attachCube({ planePicker });
    const draw = harness.frames().find((frame) => frame.priority === viewportGizmoRenderPriority)!;

    expect(setStyle).toHaveBeenCalledOnce();
    const [style] = setStyle.mock.calls[0]!;
    expect(style.face).toBe(harness.gizmo().options.x.color);
    draw.ref.current(harness.state, 1 / 60);
    expect(render).not.toHaveBeenCalled();
    expect(harness.gizmo().render).toHaveBeenCalledOnce();

    harness.graphics.send({ type: 'setSectionViewActive', payload: true });
    draw.ref.current(harness.state, 1 / 60);
    expect(render).toHaveBeenCalledOnce();

    harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });
    expect(setStyle).toHaveBeenCalledTimes(2);
    expect(setStyle.mock.calls[1]![0].face).not.toBe(style.face);
  });

  it('should listen on no camera-controls event: the controls adapter stays their only listener', () => {
    const harness = createHarness();
    const controls = harness.state.controls as unknown as EventDispatcher;
    const addEventListener = vi.spyOn(controls, 'addEventListener');

    harness.attachCube();

    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('should stop drawing, following and listening when the cube leaves', () => {
    const harness = createHarness();
    const unsubscribe = vi.fn();
    vi.mocked(harness.state.internal.subscribe).mockReturnValue(unsubscribe);
    harness.attachCube();
    const gizmo = harness.gizmo();
    unsubscribe.mockClear();
    harness.graphics.send({ type: 'viewportGizmoDetached', gizmoId: 'cube' });
    const { revision } = harness.camera.getSnapshot().context;

    turn(gizmo, [1, 0, 0.2]);

    expect(harness.camera.getSnapshot().context.revision).toBe(revision);
    // The cube's draw is unsubscribed (the controls adapter's tick stays).
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(harness.consumers.size).toBe(0);
    expect(harness.graphics.getSnapshot().context.viewportGizmo).toBeUndefined();
  });
});
