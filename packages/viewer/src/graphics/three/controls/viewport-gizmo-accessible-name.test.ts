/*
 * The view cube's accessible name after a reload onto a saved pose (F3), with the real `three-viewport-gizmo`, the
 * real graphics and camera actors and the real adapters. On a reload the cube is built while the camera shows the
 * framed default view ("Near Top Front Right"); once the view's record loads, the framing actor sends
 * `adoptPersistedPose`, the camera presents the saved pose and the adapter's camera follow calls `gizmo.update()`.
 * The cube must then be named for the pose it shows, as a cube built at that pose is.
 *
 * 3.0.0-beta.4 keeps the default view's name (it rewrote the name only when the view moved onto or off a target), so
 * the second test runs as `it.fails`. The three-viewport-gizmo beta with the fix (fork commit "Derive the accessible
 * name from every pose the gizmo observes") makes it pass, which fails `it.fails`: the bump flips it to `it`. The first
 * test is a plain `it`, so a harness that stops building the cube cannot satisfy `it.fails`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Raycaster, Scene } from 'three';
import type { Camera, Vector4, WebGLRenderer } from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor, InspectionEvent } from 'xstate';
import type { RootState } from '@react-three/fiber';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera } from '@taucad/three/camera';
import { createControlsAdapter } from '#graphics/three/adapters/controls-adapter.js';
import { createViewportGizmoAdapter } from '#graphics/three/controls/viewport-gizmo-adapter.js';
import { graphicsMachine, selectGraphicsViewportGizmoLocked } from '#machines/graphics.machine.js';
import { asCameraActor } from '#graphics/graphics-camera.js';

type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;

/** Tau's default framed view: off every target of the z-up cube, near Top Front Right. */
const cameraView = {
  frameId: 'tau:root',
  target: [0, 0, 0],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 10,
  perspectiveZoom: 1,
} as const;

/** A saved pose a drag left off every target, near another face than the default view. */
const savedPose = { target: [0, 0, 0], direction: [-1, 0.15, 0.1], up: [0, 0, 1], verticalSpan: 10 } as const;

const actors: Array<Actor<typeof graphicsMachine>> = [];

/** The 2D calls the cube's label textures make, as no-ops. */
const labelCalls = {
  arcTo: () => undefined,
  beginPath: () => undefined,
  closePath: () => undefined,
  fill: () => undefined,
  fillText: () => undefined,
  lineTo: () => undefined,
  measureText: (text: string) => ({ fontBoundingBoxDescent: 10, width: text.length * 10 }),
  moveTo: () => undefined,
  stroke: () => undefined,
};

beforeEach(() => {
  // The cube draws its labels on a 2D canvas; the viewer's jsdom stub lacks the path and text calls a label needs.
  const { getContext } = HTMLCanvasElement.prototype;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    ...args: Parameters<HTMLCanvasElement['getContext']>
  ) {
    const context = getContext.apply(this, args);
    // Fill in only what the stub lacks; its own calls stay.
    return context ? Object.assign(context, { ...labelCalls, ...context }) : context;
  } as HTMLCanvasElement['getContext']);
});

afterEach(() => {
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** A renderer that never initializes WebGL: what the cube reads to place and measure itself. */
const createRendererStub = (canvas: HTMLCanvasElement) =>
  ({
    domElement: canvas,
    toneMapping: 0,
    getPixelRatio: () => 1,
    autoClear: true,
    autoClearColor: true,
    autoClearDepth: true,
    autoClearStencil: true,
    capabilities: { reversedDepthBuffer: false },
    getViewport: (target: Vector4) => target.set(0, 0, 800, 600),
    getScissor: (target: Vector4) => target.set(0, 0, 800, 600),
    getScissorTest: () => false,
    getRenderTarget: () => null,
    setViewport: () => undefined,
    setScissor: () => undefined,
    setScissorTest: () => undefined,
    clear: () => undefined,
    render: () => undefined,
    compile: () => undefined,
    compileAsync: async () => undefined,
    extensions: { has: () => true },
  }) as unknown as WebGLRenderer;

const createHarness = () => {
  // An actor that fails (the cube's adapter throwing while it builds) is reported with the test's failure.
  const errors: unknown[] = [];
  const graphics: Actor<typeof graphicsMachine> = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    {
      input: { camera: { cameraView } },
      inspect(event: InspectionEvent) {
        const { snapshot } = event as { snapshot?: { status?: string; error?: unknown } };
        if (snapshot?.status === 'error') {
          errors.push(snapshot.error);
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
  document.body.append(container);
  const gl = createRendererStub(canvas);
  const state = {
    camera: rig.activeCamera as Camera,
    controls: null as RootState['controls'],
    gl,
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
  } as unknown as RootState;
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
  const attachCube = (): void => {
    graphics.send({
      type: 'viewportGizmoAttached',
      gizmoId: 'cube',
      adapter: createViewportGizmoAdapter({
        store,
        size: 96,
        backend: 'webgl',
        rig,
        consumersRef: { current: consumers },
        graphics,
      }),
    });
  };
  /** The view cube's accessible name. */
  const name = (): string | undefined => {
    const element = container.querySelector<HTMLElement>('[aria-roledescription="view cube"]');
    if (!element) {
      throw new Error('The view cube was not built', { cause: errors[0] });
    }
    return element.getAttribute('aria-label') ?? undefined;
  };
  /** Turns the camera to the saved pose, as the framing actor does once a view's record has loaded. */
  const adoptSavedPose = (): void => {
    cameraRef.send({ type: 'adoptPersistedPose', requestId: 'reload', pose: savedPose });
    expect(cameraRef.getSnapshot().context.lastChange.source).toBe('persisted');
  };
  return { attachCube, name, adoptSavedPose };
};

/** The name of a cube built while the camera already shows the saved pose: built after the pose, it cannot be stale. */
const savedPoseName = (): string | undefined => {
  const harness = createHarness();
  harness.adoptSavedPose();
  harness.attachCube();
  const name = harness.name();
  document.body.replaceChildren();
  return name;
};

describe('view cube accessible name', () => {
  it('should name the default view, and the saved pose when the camera holds it before the cube is built', () => {
    const harness = createHarness();
    harness.attachCube();
    expect(harness.name()).toBe('Near Top Front Right');
    expect(savedPoseName()).toMatch(/^Near /);
    expect(savedPoseName()).not.toBe('Near Top Front Right');
  });

  it.fails('should rename the cube for a saved pose a reload adopts after the cube is built', () => {
    const expected = savedPoseName();
    const harness = createHarness();
    harness.attachCube();
    expect(harness.name()).toBe('Near Top Front Right');

    harness.adoptSavedPose();

    expect(harness.name()).toBe(expected);
  });
});
