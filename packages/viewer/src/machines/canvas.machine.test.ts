/**
 * The canvas actor: its lifecycle, budget and load spans, and its host adapter driven through a scripted
 * R3F render loop. Path table (the shortest path to each state), kept current with `pathTable`:
 *
 * 1. `creating`: initial
 * 2. `ready`: `hostCreated`
 * 3. `failed`: `rendererFailed`
 * 4. `lost`: `contextLost` (a surface re-attached after its loss)
 * 5. `presented`: `hostCreated`, `framePresented`
 *
 * The camera rows drive a real camera actor: the canvas presents its viewport and its grid clip policy on it.
 */
import type { RootState } from '@react-three/fiber';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { createCameraView } from '@taucad/camera';
import { cameraMachine } from '@taucad/camera/machine';
import { createCanvasHostLogic } from '#graphics/three/three-canvas-instance-host.js';
import { tickPriority } from '#graphics/three/adapters/controls-adapter.js';
import { subscribeViewerLoadTiming } from '#lib/viewer-load-timing.js';
import type { ViewerLoadSpan } from '#lib/viewer-load-timing.js';
import {
  canvasEventTypes,
  canvasIgnoredEvents,
  canvasMachine,
  resolveGridClipPolicy,
  selectCanvasAwaitingFrame,
  selectCanvasBackend,
} from '#machines/canvas.machine.js';
import type { CanvasEvent, CanvasHostCommand, CanvasInput, CanvasSurface } from '#machines/canvas.machine.js';
import {
  infiniteGridFadeEndVisibleSpans,
  infiniteGridPresentationPlaneByUpDirection,
} from '#graphics/three/utils/infinite-grid-frame.js';
import { webglContextMachine } from '#machines/webgl-context.machine.js';

const surface: CanvasSurface = { width: 800, height: 600, pixelRatio: 2 };
const idleHost = createCallbackLogic<CanvasHostCommand, undefined>(() => undefined);
const hostCreated = (host = idleHost, at: CanvasSurface = surface): CanvasEvent => ({
  type: 'hostCreated',
  backend: 'webgl',
  surface: at,
  domElement: document.createElement('canvas'),
  host,
});

const samples: Record<CanvasEvent['type'], readonly CanvasEvent[]> = {
  hostCreated: [hostCreated()],
  surfaceResized: [{ type: 'surfaceResized', surface }],
  requestRender: [{ type: 'requestRender' }],
  rendererFailed: [{ type: 'rendererFailed', failure: { kind: 'renderer', message: 'no context' } }],
  framePresented: [{ type: 'framePresented' }],
  contextLost: [{ type: 'contextLost' }],
  gridChanged: [{ type: 'gridChanged', enabled: true }],
  upDirectionChanged: [{ type: 'upDirectionChanged', upDirection: 'y' }],
};
const pathOptions = {
  input: { canvasId: 'c', kind: 'canvas' } satisfies CanvasInput,
  events: Object.values(samples).flat(),
  limit: 100,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

const defaultSize = { width: 800, height: 600 };

/** A scripted R3F root: its frame loop, size, `invalidate` and renderer, driven by the test. */
const scriptRoot = (size: { width: number; height: number } = defaultSize) => {
  const domElement = document.createElement('canvas');
  const subscribers: Array<{ ref: { current: (state: RootState, delta: number) => void }; priority: number }> = [];
  const invalidate = vi.fn();
  const state = {
    gl: { domElement },
    size,
    viewport: { dpr: 1 },
    invalidate,
    get: () => state,
    internal: {
      subscribe(ref: { current: (state: RootState, delta: number) => void }, priority: number) {
        const entry = { ref, priority };
        subscribers.push(entry);
        return () => {
          subscribers.splice(subscribers.indexOf(entry), 1);
        };
      },
    },
  };
  const root = state as unknown as RootState;
  return {
    root,
    domElement,
    invalidate,
    subscribers,
    /** One pass of R3F's loop: every frame subscriber, in priority order. */
    frame(): void {
      for (const { ref } of [...subscribers].toSorted((a, b) => a.priority - b.priority)) {
        ref.current(root, 1 / 60);
      }
    },
  };
};

/** Animation frames run when the test says so. */
const animationFrames = () => {
  const queue = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    next += 1;
    queue.set(next, callback);
    return next;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    queue.delete(handle);
  });
  return {
    get pending(): number {
      return queue.size;
    },
    run(): void {
      const due = [...queue.entries()];
      queue.clear();
      for (const [, callback] of due) {
        callback(0);
      }
    },
  };
};

const defaultInput: CanvasInput = { canvasId: 'c', kind: 'canvas' };
const startCanvas = (input: CanvasInput = defaultInput) => {
  const guard = guardActors();
  return createActor(canvasMachine, { input, inspect: guard.inspect }).start();
};

describe('canvas machine totality', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...canvasEventTypes].toSorted());
  });

  it('should reach every state along the documented path table', () => {
    expect(
      pathTable(canvasMachine, pathOptions).map((row) => ({
        state: row.state,
        events: row.events.map((event) => event.type),
      })),
    ).toEqual([
      { state: 'creating', events: [] },
      { state: 'ready', events: ['hostCreated'] },
      { state: 'failed', events: ['rendererFailed'] },
      { state: 'lost', events: ['contextLost'] },
      { state: 'presented', events: ['hostCreated', 'framePresented'] },
    ]);
    expect(unreachedStates(canvasMachine, pathOptions)).toEqual([]);
  });

  it('should answer every event in every state', () => {
    expect(unansweredEvents(canvasMachine, { ...pathOptions, ignore: canvasIgnoredEvents })).toEqual([]);
  });
});

describe('canvas lifecycle', () => {
  let spans: ViewerLoadSpan[];
  let unsubscribe: () => void;
  beforeEach(() => {
    spans = [];
    unsubscribe = subscribeViewerLoadTiming((span) => {
      spans.push(span);
    });
  });
  afterEach(() => {
    unsubscribe();
    vi.unstubAllGlobals();
  });

  it('should go from mounted to presented through a scripted render loop, timing both load spans', () => {
    const frames = animationFrames();
    const loop = scriptRoot();
    const canvas = startCanvas();
    expect(canvas.getSnapshot().value).toBe('creating');
    expect(selectCanvasAwaitingFrame(canvas.getSnapshot())).toBe(true);
    expect(spans).toEqual([]);

    canvas.send(hostCreated(createCanvasHostLogic({ root: loop.root, isRetired: () => false })));
    expect(canvas.getSnapshot().value).toBe('ready');
    expect(selectCanvasBackend(canvas.getSnapshot())).toBe('webgl');
    expect(spans.map(({ phase, outcome }) => [phase, outcome])).toEqual([['canvas.mount', 'ok']]);
    // The canvas may have drawn before the observer subscribed: it asks for the one frame it observes.
    expect(loop.invalidate).toHaveBeenCalledTimes(1);
    expect(loop.subscribers.map(({ priority }) => priority)).toEqual([-2, 6]);

    // Submitting the frame is not presenting it: nothing is reported until two animation frames later.
    loop.frame();
    expect(canvas.getSnapshot().value).toBe('ready');
    frames.run();
    expect(canvas.getSnapshot().value).toBe('ready');
    loop.frame();
    expect(frames.pending).toBe(1);
    frames.run();
    expect(canvas.getSnapshot().value).toBe('presented');
    expect(selectCanvasAwaitingFrame(canvas.getSnapshot())).toBe(false);
    expect(spans.map(({ phase, outcome }) => [phase, outcome])).toEqual([
      ['canvas.mount', 'ok'],
      ['frame.first', 'ok'],
    ]);
    // It reports the first frame once, keeps observing frames only for surface changes, and asked for no frame beyond
    // the first.
    loop.frame();
    frames.run();
    frames.run();
    expect(frames.pending).toBe(0);
    expect(loop.subscribers.map(({ priority }) => priority)).toEqual([-2, 6]);
    expect(loop.invalidate).toHaveBeenCalledTimes(1);
    canvas.stop();
  });

  it('should wait for the canvas to have area before it observes a frame', () => {
    const frames = animationFrames();
    const loop = scriptRoot({ width: 0, height: 600 });
    const canvas = startCanvas();
    canvas.send(
      hostCreated(createCanvasHostLogic({ root: loop.root, isRetired: () => false }), { ...surface, width: 0 }),
    );
    expect(loop.invalidate).not.toHaveBeenCalled();
    loop.frame();
    expect(frames.pending).toBe(0);
    // The frame that gives it area reports the new surface and is the frame the presentation waits on.
    loop.root.size.width = 800;
    loop.frame();
    expect(canvas.getSnapshot().context.surface).toEqual({ width: 800, height: 600, pixelRatio: 1 });
    expect(frames.pending).toBe(1);
    canvas.stop();
  });

  it('should cancel the pending animation frame and the open span when it stops between the two frames', () => {
    const frames = animationFrames();
    const loop = scriptRoot();
    const canvas = startCanvas();
    canvas.send(hostCreated(createCanvasHostLogic({ root: loop.root, isRetired: () => false })));
    loop.frame();
    frames.run();
    expect(frames.pending).toBe(1);
    canvas.stop();
    expect(frames.pending).toBe(0);
    expect(spans.map(({ phase, outcome }) => [phase, outcome])).toEqual([
      ['canvas.mount', 'ok'],
      ['frame.first', 'cancelled'],
    ]);
  });

  it('should go lost on a lost WebGL context, stop drawing and keep its budget until it stops', () => {
    animationFrames();
    const loop = scriptRoot();
    const budget = createActor(webglContextMachine, { input: {} }).start();
    const canvas = startCanvas({ canvasId: 'c', kind: 'canvas', webglContext: budget, admittedBytes: 10 });
    expect(budget.getSnapshot().context).toMatchObject({ count: 1, bytes: 10 });
    canvas.send(hostCreated(createCanvasHostLogic({ root: loop.root, isRetired: () => false })));
    // The host's own size replaces the admission estimate.
    expect(budget.getSnapshot().context.bytes).toBe(800 * 600 * 4 * 64);

    const event = new Event('webglcontextlost', { cancelable: true });
    loop.domElement.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(canvas.getSnapshot().value).toBe('lost');
    expect(selectCanvasAwaitingFrame(canvas.getSnapshot())).toBe(false);
    expect(selectCanvasBackend(canvas.getSnapshot())).toBeUndefined();
    expect(loop.subscribers).toEqual([]);
    expect(spans.map(({ phase, outcome }) => [phase, outcome])).toEqual([
      ['canvas.mount', 'ok'],
      ['frame.first', 'cancelled'],
    ]);
    // The context-lost fallback still holds the viewer's place in the budget.
    expect(budget.getSnapshot().context.count).toBe(1);
    canvas.stop();
    expect(budget.getSnapshot().context).toMatchObject({ count: 0, bytes: 0 });
  });

  it('should ignore a loss reported by a retired canvas', () => {
    animationFrames();
    const loop = scriptRoot();
    const canvas = startCanvas();
    canvas.send(hostCreated(createCanvasHostLogic({ root: loop.root, isRetired: () => true })));
    loop.domElement.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(canvas.getSnapshot().value).toBe('ready');
    canvas.stop();
  });

  it('should record a renderer that could not start as failed and cancel the mount span', () => {
    const canvas = startCanvas();
    canvas.send({ type: 'rendererFailed', failure: { kind: 'webgpu-initialization', message: 'no adapter' } });
    expect(canvas.getSnapshot().value).toBe('failed');
    expect(canvas.getSnapshot().context.failure).toEqual({ kind: 'webgpu-initialization', message: 'no adapter' });
    expect(selectCanvasAwaitingFrame(canvas.getSnapshot())).toBe(false);
    expect(spans.map(({ phase, outcome }) => [phase, outcome])).toEqual([['canvas.mount', 'cancelled']]);
    canvas.stop();
  });

  it('should keep one host adapter when R3F replays onCreated', () => {
    const starts = vi.fn();
    const host = createCallbackLogic<CanvasHostCommand, undefined>(() => {
      starts();
    });
    const canvas = startCanvas();
    canvas.send(hostCreated(host));
    canvas.send(hostCreated(host));
    expect(starts).toHaveBeenCalledOnce();
    expect(Object.keys(canvas.getSnapshot().children).toSorted()).toEqual(['host', 'loadSpans']);
    canvas.stop();
  });

  it('should re-size its budget slot when a frame draws at another pixel ratio', () => {
    animationFrames();
    const loop = scriptRoot();
    const budget = createActor(webglContextMachine, { input: {} }).start();
    const canvas = startCanvas({ canvasId: 'c', kind: 'canvas', webglContext: budget, admittedBytes: 10 });
    canvas.send(
      hostCreated(createCanvasHostLogic({ root: loop.root, isRetired: () => false }), { ...surface, pixelRatio: 1 }),
    );
    const atOneX = budget.getSnapshot().context.bytes;
    loop.frame();
    expect(budget.getSnapshot().context.bytes).toBe(atOneX);
    // Moved to a 2x display: the CSS size is unchanged, but the drawing buffer is four times larger.
    (loop.root.viewport as { dpr: number }).dpr = 2;
    loop.frame();
    expect(canvas.getSnapshot().context.surface).toEqual({ width: 800, height: 600, pixelRatio: 2 });
    expect(budget.getSnapshot().context.bytes).toBe(atOneX * 4);
    canvas.stop();
  });

  it('should emit surfaceAttached once for a hosted canvas, and never for a placeholder', () => {
    const canvas = startCanvas();
    const attached = vi.fn();
    canvas.on('surfaceAttached', attached);
    const created = hostCreated();
    canvas.send(created);
    canvas.send(hostCreated());
    canvas.send({ type: 'framePresented' });
    canvas.send(hostCreated());
    expect(attached).toHaveBeenCalledOnce();
    expect(attached).toHaveBeenCalledWith({
      type: 'surfaceAttached',
      canvasId: 'c',
      backend: 'webgl',
      surface,
      domElement: (created as Extract<CanvasEvent, { type: 'hostCreated' }>).domElement,
    });
    canvas.stop();

    const placeholder = startCanvas({ canvasId: 'p', kind: 'placeholder' });
    const placeholderAttached = vi.fn();
    placeholder.on('surfaceAttached', placeholderAttached);
    placeholder.send(hostCreated());
    expect(placeholderAttached).not.toHaveBeenCalled();
    placeholder.stop();
  });

  it('should resume lost, untimed, when a surface re-attaches after its context was lost', () => {
    const budget = createActor(webglContextMachine, { input: {} }).start();
    const canvas = startCanvas({ canvasId: 'c', kind: 'canvas', webglContext: budget, reattached: true });
    canvas.send({ type: 'contextLost' });
    expect(canvas.getSnapshot().value).toBe('lost');
    expect(selectCanvasAwaitingFrame(canvas.getSnapshot())).toBe(false);
    // The fallback holds the viewer's place in the budget, as before the surface was hidden.
    expect(budget.getSnapshot().context.count).toBe(1);
    canvas.stop();
    expect(spans).toEqual([]);
  });

  it('should time nothing for a surface re-attached to a live renderer', () => {
    const frames = animationFrames();
    const loop = scriptRoot();
    const canvas = startCanvas({ canvasId: 'c', kind: 'canvas', reattached: true });
    canvas.send(hostCreated(createCanvasHostLogic({ root: loop.root, isRetired: () => false })));
    loop.frame();
    frames.run();
    frames.run();
    expect(canvas.getSnapshot().value).toBe('presented');
    canvas.stop();
    expect(spans).toEqual([]);
  });

  it('should hold a placeholder busy without timing it, budgeting it or hosting a renderer', () => {
    const budget = createActor(webglContextMachine, { input: {} }).start();
    const canvas = startCanvas({ canvasId: 'p', kind: 'placeholder', webglContext: budget });
    canvas.send(hostCreated());
    canvas.send({ type: 'contextLost' });
    expect(canvas.getSnapshot().value).toBe('creating');
    expect(selectCanvasAwaitingFrame(canvas.getSnapshot())).toBe(true);
    expect(budget.getSnapshot().context.count).toBe(0);
    canvas.stop();
    expect(spans).toEqual([]);
  });
});

/** A running camera, as graphics holds it, presenting at 1280 by 720. */
const startCamera = () =>
  createActor(cameraMachine, {
    input: {
      initialView: createCameraView({
        frameId: 'tau:root',
        requestedVerticalFieldOfView: 60,
        perspectiveZoom: 1,
        target: [0, 0, 0],
        direction: [1, -1, 0.7],
        up: [0, 0, 1],
        verticalSpan: 10,
        viewport: { width: 1280, height: 720, pixelRatio: 1 },
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      }),
    },
  }).start();

const gridPolicy = (upDirection: 'x' | 'y' | 'z') => ({
  farPaddingVerticalSpans: infiniteGridFadeEndVisibleSpans,
  presentationPlane: infiniteGridPresentationPlaneByUpDirection[upDirection],
});

describe('canvas camera presentation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should hand the camera the surface it is created with', () => {
    const camera = startCamera();
    const canvas = startCanvas({ ...defaultInput, camera });
    expect(camera.getSnapshot().context.view.viewport).toEqual({ width: 1280, height: 720, pixelRatio: 1 });
    canvas.send(hostCreated());
    expect(camera.getSnapshot().context.view.viewport).toEqual(surface);
    expect(camera.getSnapshot().context.lastChange.source).toBe('viewport');
    canvas.stop();
    camera.stop();
  });

  it('should resize the camera in the same macrostep as the resize', () => {
    const camera = startCamera();
    const canvas = startCanvas({ ...defaultInput, camera });
    canvas.send(hostCreated());
    // Whatever reads the camera once the resize is handled, such as the controls stepping in the same frame, reads the
    // new viewport.
    canvas.send({ type: 'surfaceResized', surface: { width: 640, height: 480, pixelRatio: 2 } });
    expect(camera.getSnapshot().context.view.viewport).toEqual({ width: 640, height: 480, pixelRatio: 2 });
    canvas.stop();
    camera.stop();
  });

  it('should present a resize from the frame loop before the controls step and the frame renders', () => {
    animationFrames();
    const loop = scriptRoot();
    const camera = startCamera();
    const canvas = startCanvas({ ...defaultInput, camera });
    canvas.send(hostCreated(createCanvasHostLogic({ root: loop.root, isRetired: () => false })));
    const seen: Record<string, unknown> = {};
    // Stand-ins for the controls adapter's step, at its own priority, and for the render pass after it.
    for (const [name, priority] of [
      ['tick', tickPriority],
      ['render', 1],
    ] as const) {
      loop.subscribers.push({
        ref: {
          current: () => {
            seen[name] = camera.getSnapshot().context.view.viewport;
          },
        },
        priority,
      });
    }
    loop.root.size.width = 1024;
    loop.frame();
    expect(seen).toEqual({
      tick: { width: 1024, height: 600, pixelRatio: 1 },
      render: { width: 1024, height: 600, pixelRatio: 1 },
    });
    canvas.stop();
    camera.stop();
  });

  it('should make no camera change for a viewport the camera already presents, nor for one without area', () => {
    const camera = startCamera();
    const canvas = startCanvas({ ...defaultInput, camera });
    canvas.send(hostCreated(idleHost, { width: 1280, height: 720, pixelRatio: 1 }));
    const { revision } = camera.getSnapshot().context;
    canvas.send({ type: 'surfaceResized', surface: { width: 0, height: 720, pixelRatio: 1 } });
    expect(camera.getSnapshot().context.revision).toBe(revision);
    canvas.send({ type: 'surfaceResized', surface: { width: 1280, height: 720, pixelRatio: 1 } });
    expect(camera.getSnapshot().context.revision).toBe(revision);
    expect(camera.getSnapshot().context.view.viewport).toEqual({ width: 1280, height: 720, pixelRatio: 1 });
    canvas.stop();
    camera.stop();
  });

  it('should hold the grid clip policy while the grid is in the scene, and clear it when the canvas stops', () => {
    const camera = startCamera();
    const canvas = startCanvas({ ...defaultInput, camera });
    // No grid is in the scene until the scene mounts one.
    expect(camera.getSnapshot().context.clipPolicy).toBeUndefined();
    canvas.send({ type: 'gridChanged', enabled: true });
    expect(camera.getSnapshot().context.clipPolicy).toEqual(gridPolicy('z'));
    canvas.stop();
    expect(camera.getSnapshot().context.clipPolicy).toBeUndefined();
    camera.stop();
  });

  it('should follow the grid in and out of the scene and across a new world up', () => {
    const camera = startCamera();
    const canvas = startCanvas({ ...defaultInput, camera, upDirection: 'x' });
    canvas.send({ type: 'gridChanged', enabled: true });
    expect(camera.getSnapshot().context.clipPolicy).toEqual(gridPolicy('x'));
    canvas.send(hostCreated());
    canvas.send({ type: 'upDirectionChanged', upDirection: 'z' });
    expect(camera.getSnapshot().context.clipPolicy).toEqual(gridPolicy('z'));
    canvas.send({ type: 'gridChanged', enabled: false });
    expect(camera.getSnapshot().context.clipPolicy).toBeUndefined();
    // A new axis while no grid is drawn keeps the camera unpadded, and the grid comes back across it.
    canvas.send({ type: 'upDirectionChanged', upDirection: 'y' });
    expect(camera.getSnapshot().context.clipPolicy).toBeUndefined();
    canvas.send({ type: 'gridChanged', enabled: true });
    expect(camera.getSnapshot().context.clipPolicy).toEqual(gridPolicy('y'));
    canvas.stop();
    camera.stop();
  });

  it('should clear the clip policy and stop presenting when the context is lost or the renderer fails', () => {
    for (const ending of [{ type: 'contextLost' }, samples.rendererFailed[0]!] as const) {
      const camera = startCamera();
      const canvas = startCanvas({ ...defaultInput, camera });
      canvas.send(hostCreated());
      canvas.send({ type: 'gridChanged', enabled: true });
      canvas.send(ending);
      expect(camera.getSnapshot().context.clipPolicy).toBeUndefined();
      const { revision } = camera.getSnapshot().context;
      canvas.send({ type: 'gridChanged', enabled: true });
      canvas.send({ type: 'surfaceResized', surface: { width: 320, height: 240, pixelRatio: 1 } });
      expect(camera.getSnapshot().context.clipPolicy).toBeUndefined();
      expect(camera.getSnapshot().context.revision).toBe(revision);
      canvas.stop();
      camera.stop();
    }
  });

  it('should present nothing on the camera from a placeholder', () => {
    const camera = startCamera();
    const placeholder = startCanvas({ canvasId: 'p', kind: 'placeholder', camera });
    placeholder.send(hostCreated());
    placeholder.send({ type: 'gridChanged', enabled: true });
    expect(camera.getSnapshot().context.clipPolicy).toBeUndefined();
    expect(camera.getSnapshot().context.view.viewport).toEqual({ width: 1280, height: 720, pixelRatio: 1 });
    placeholder.stop();
    camera.stop();
  });

  it('should leave the camera alone once graphics has stopped it', () => {
    const camera = startCamera();
    const canvas = startCanvas({ ...defaultInput, camera });
    canvas.send({ type: 'gridChanged', enabled: true });
    camera.stop();
    // A send to a stopped actor does not throw; it only warns that the event dead-lettered.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    canvas.stop();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should have no clip policy without a grid', () => {
    expect(resolveGridClipPolicy({ enabled: false, upDirection: 'y' })).toBeUndefined();
    expect(resolveGridClipPolicy({ enabled: true, upDirection: 'y' })).toEqual(gridPolicy('y'));
  });
});
