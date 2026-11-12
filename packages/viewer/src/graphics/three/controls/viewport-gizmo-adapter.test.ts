/*
 * The view cube's DOM adapter, run as graphics runs it: spawned by `viewportGizmoAttached` as the adapter of the
 * cube's gesture, beside the canvas's real controls adapter and the view's real camera. `ViewportGizmo` is a scripted
 * stand-in that turns the camera it was given and dispatches the cube's events.
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
import {
  applyViewportGizmoNodeMaterials,
  applyViewportGizmoSurface,
} from '#graphics/three/controls/viewport-gizmo-cube-surface.js';
import type { GizmoStyleId } from '#graphics/three/controls/viewport-gizmo-styles.js';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { subscribeViewerLoadTiming } from '#lib/viewer-load-timing.js';
import type { ViewerLoadSpan } from '#lib/viewer-load-timing.js';
import { graphicsMachine, selectGraphicsViewportGizmoLocked } from '#machines/graphics.machine.js';
import type { GraphicsCameraRef } from '#machines/graphics.machine.js';
import type { ViewportGizmoEnvironment } from '#machines/viewport-gizmo-gesture.machine.js';
import { asCameraActor } from '#graphics/graphics-camera.js';

type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;

type GizmoOptions = Readonly<{
  up: 'x' | 'y' | 'z';
  type: string;
  placement: string;
  font: { family: string };
  right: { color: number; labelColor: number };
}>;

const gizmos = vi.hoisted(() => [] as FakeGizmoShape[]);

type FakeGizmoShape = EventDispatcher<Record<string, Record<string, unknown>>> & {
  camera: Camera;
  readonly target: Vector3;
  animating: boolean;
  options: GizmoOptions;
  readonly sets: GizmoOptions[];
  readonly add: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly render: ReturnType<typeof vi.fn>;
  readonly cameraUpdate: ReturnType<typeof vi.fn>;
  readonly domUpdate: ReturnType<typeof vi.fn>;
  readonly scale: { multiplyScalar: ReturnType<typeof vi.fn> };
  readonly _viewport: number[];
  readonly children: Object3D[];
  readonly _domElement: HTMLElement;
};

vi.mock('three-viewport-gizmo', async () => {
  const three = await import('three');
  class ViewportGizmo extends three.EventDispatcher<Record<string, Record<string, unknown>>> {
    public camera: Camera;

    public readonly target = new three.Vector3();

    public animating = false;

    public options: GizmoOptions;

    public readonly sets: GizmoOptions[] = [];

    public readonly add = vi.fn();

    public children: Object3D[] = [new three.Object3D(), new three.Object3D()];

    public readonly remove = vi.fn();

    // oxlint-disable-next-line @typescript-eslint/naming-convention -- `three-viewport-gizmo`'s private pointer surface.
    public _domElement = document.createElement('div');

    public readonly dispose = vi.fn();

    public readonly render = vi.fn();

    public readonly cameraUpdate = vi.fn();

    public readonly domUpdate = vi.fn();

    public readonly scale = { multiplyScalar: vi.fn() };

    // oxlint-disable-next-line @typescript-eslint/naming-convention -- `three-viewport-gizmo`'s private viewport field.
    public readonly _viewport = [600, 0, 96, 96];

    public constructor(camera: Camera, _renderer: unknown, options: GizmoOptions) {
      super();
      this.camera = camera;
      this.options = options;
      gizmos.push(this as unknown as FakeGizmoShape);
    }

    public set(options: GizmoOptions): this {
      // `set` regenerates the cube's children and its pointer surface.
      this.children = [new three.Object3D(), new three.Object3D()];
      this._domElement = document.createElement('div');
      this.options = options;
      this.sets.push(options);
      return this;
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the module's own export name.
  return { ViewportGizmo };
});
vi.mock('#graphics/three/controls/viewport-gizmo-cube-axes.js', () => ({
  createViewportGizmoCubeAxes: () => ({ isAxes: true }),
}));
vi.mock('#graphics/three/controls/viewport-gizmo-cube-surface.js', () => ({
  applyViewportGizmoSurface: vi.fn(),
  applyViewportGizmoNodeMaterials: vi.fn(),
}));

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
    attachCube({ planePicker, backend = 'webgl', gizmoStyle } = {}) {
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
        }),
      });
    },
    gizmo: () => gizmos.at(-1)!,
    locked: () => selectGraphicsViewportGizmoLocked(graphics.getSnapshot()),
    graphicsEvents,
  };
};

/** Turns the cube's camera about its target, as a drag step or an animation frame does, and dispatches `change`. */
const turn = (gizmo: FakeGizmoShape, direction: readonly [number, number, number]): void => {
  const offset = gizmo.camera.position.clone().sub(gizmo.target);
  const distance = offset.length();
  gizmo.camera.position.copy(new Vector3(...direction).normalize().multiplyScalar(distance).add(gizmo.target));
  gizmo.camera.lookAt(gizmo.target);
  gizmo.dispatchEvent({ type: 'change' });
};

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
    turn(gizmo, [0, -0.01, 1]);
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
    // A top face exactly on the z up axis, rolled so the screen's up is +x.
    gizmo.camera.position.set(0, 0, 20);
    gizmo.camera.up.set(0, 0, 1);
    gizmo.camera.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2);
    const { revision } = harness.camera.getSnapshot().context;

    gizmo.dispatchEvent({ type: 'change' });

    const { context } = harness.camera.getSnapshot();
    expect(context.revision).toBe(revision + 1);
    expect(context.view.direction[2]).toBeCloseTo(1, 5);
    // Tilted off the pole away from the screen's up, so the presented view keeps +x up on screen.
    expect(context.view.direction[0]).toBeLessThan(0);
    expect(context.view.direction[1]).toBeCloseTo(0, 6);
  });

  it('should send each drag step to the camera and hold the lock while the press turns it', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();
    const controls = harness.state.controls as unknown as { enabled: boolean };

    gizmo.dispatchEvent({ type: 'start' });
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

    gizmo.dispatchEvent({ type: 'start' });
    gizmo.dispatchEvent({ type: 'start' });
    gizmo.dispatchEvent({ type: 'end' });

    expect(controls.enabled).toBe(false);
  });

  it('should give back a held lock and the controls when the cube leaves mid-drag', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();
    const controls = harness.state.controls as unknown as { enabled: boolean };
    gizmo.dispatchEvent({ type: 'start' });
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
    gizmo.cameraUpdate.mockClear();

    harness.camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });

    expect(gizmos).toHaveLength(1);
    expect(gizmo.camera).toBe(harness.rig.orthographicCamera);
    expect(gizmo.cameraUpdate).toHaveBeenCalled();
  });

  it('should retarget its camera, field of view and target from a presented driver snapshot', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();
    gizmo.cameraUpdate.mockClear();

    // The cube is the view's only retained consumer here.
    for (const retarget of harness.consumers) {
      retarget(harness.rig.orthographicCamera, createDriverSnapshot(0, 1));
    }

    expect(gizmos).toHaveLength(1);
    expect(gizmo.camera).toBe(harness.rig.orthographicCamera);
    expect(gizmo.target.toArray()).toEqual([1, 2, 3]);
    expect(gizmo.cameraUpdate).toHaveBeenCalledOnce();
  });

  it('should follow the camera target unless the cube holds the lock or animates', () => {
    const harness = createHarness();
    harness.attachCube();
    const gizmo = harness.gizmo();

    harness.camera.send({ type: 'poseObserved', source: 'input', ...cameraView, target: [1, 2, 3] });
    const followed = gizmo.target.clone();
    expect(followed.length()).toBeGreaterThan(0);

    gizmo.dispatchEvent({ type: 'start' });
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
      expect(harness.gizmo().options.up).toBe('y');
      expect(spans.filter((span) => span.phase === 'gizmo.create')).toHaveLength(1);

      // The theme and the up axis repaint the same cube in place: no rebuild, no second span.
      harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });
      harness.graphics.send({ type: 'setUpDirection', payload: 'z' });

      expect(gizmos).toHaveLength(1);
      expect(harness.gizmo().sets.map((options) => options.up)).toEqual(['y', 'z']);
      expect(spans.filter((span) => span.phase === 'gizmo.create')).toHaveLength(1);
    } finally {
      unsubscribe();
    }
  });

  it.each([
    { gizmoStyle: undefined, type: 'rounded-cube', surface: 'tau', triad: true, scale: 0.7 },
    { gizmoStyle: 'cube', type: 'rounded-cube', surface: 'tau', triad: true, scale: 0.7 },
    { gizmoStyle: 'classic-cube', type: 'cube', surface: 'library', triad: true, scale: 0.7 },
    { gizmoStyle: 'axis-balls', type: 'sphere', surface: 'library', triad: false, scale: 1 },
  ] as const)(
    'should draw the $gizmoStyle style as a $type gizmo, and keep it across a repaint',
    ({ gizmoStyle, type, surface, triad, scale }) => {
      const harness = createHarness();
      harness.attachCube({ gizmoStyle });
      const gizmo = harness.gizmo();
      harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });

      expect([gizmo.options.type, gizmo.sets.map((options) => options.type)]).toEqual([type, [type]]);
      expect(gizmo.scale.multiplyScalar.mock.calls).toEqual([[scale]]);
      expect(
        vi.mocked(surface === 'tau' ? applyViewportGizmoSurface : applyViewportGizmoNodeMaterials),
      ).toHaveBeenCalledTimes(2);
      expect(gizmo.add).toHaveBeenCalledTimes(triad ? 2 : 0);
      expect(gizmo.children.every((child) => child.visible)).toBe(true);
      expect(gizmo._domElement.style.pointerEvents).toBe('');
    },
  );

  it('should draw the Axes style as the triad alone, taking no click, after a repaint too (G4)', () => {
    const harness = createHarness();
    harness.attachCube({ gizmoStyle: 'axes' });
    const gizmo = harness.gizmo();
    const hidden = (): boolean =>
      gizmo.children.every((child) => !child.visible) && gizmo._domElement.style.pointerEvents === 'none';
    expect([hidden(), gizmo.add.mock.calls.length]).toEqual([true, 1]);

    harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });

    expect([hidden(), gizmo.add.mock.calls.length]).toEqual([true, 2]);
  });

  it('should repaint with stronger faces and legible labels in high-contrast dark mode', () => {
    const harness = createHarness();
    harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });
    harness.attachCube();
    const gizmo = harness.gizmo();
    const normalFace = gizmo.options.right.color;

    harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: { ...dark, isHighContrast: true } });

    const { color, labelColor } = gizmo.options.right;
    const luminance = (value: Color): number => 0.2126 * value.r + 0.7152 * value.g + 0.0722 * value.b;
    expect(gizmos).toHaveLength(1);
    expect(color).not.toBe(normalFace);
    expect((luminance(new Color(labelColor)) + 0.05) / (luminance(new Color(color)) + 0.05)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(gizmo.dispose).not.toHaveBeenCalled();
  });

  it('should repaint once the web font arrives, keeping the camera it follows', async () => {
    const loaded = Promise.withResolvers<FontFace[]>();
    const fonts = { check: () => false, load: vi.fn(async () => loaded.promise) };
    const previousFonts = document.fonts;
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    try {
      const harness = createHarness();
      harness.attachCube();
      harness.camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
      const gizmo = harness.gizmo();

      expect(gizmo.sets).toHaveLength(0);
      loaded.resolve([]);
      await vi.waitFor(() => {
        expect(gizmo.sets).toHaveLength(1);
      });

      expect(gizmos).toHaveLength(1);
      expect(gizmo.camera).toBe(harness.rig.orthographicCamera);
      expect(fonts.load).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(document, 'fonts', { configurable: true, value: previousFonts });
    }
  });

  it('should warm the cube for both native cameras on WebGPU, after the build and after each repaint', () => {
    const harness = createHarness();
    const compileAsync = vi.fn(async (_scene: unknown, _camera: unknown) => undefined);
    Object.assign(harness.state.gl, { compileAsync });
    harness.attachCube({ backend: 'webgpu' });

    expect(compileAsync.mock.calls.map((call) => call[1])).toEqual([
      harness.rig.perspectiveCamera,
      harness.rig.orthographicCamera,
    ]);
    expect(compileAsync.mock.calls.every((call) => call[0] === harness.gizmo())).toBe(true);
    harness.graphics.send({ type: 'viewerEnvironmentChanged', environment: dark });
    expect(compileAsync).toHaveBeenCalledTimes(4);
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
    expect(style.face).toBe(harness.gizmo().options.right.color);
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
