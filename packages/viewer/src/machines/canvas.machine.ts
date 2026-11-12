/**
 * The canvas actor: one per mounted viewer surface, spawned by the graphics actor.
 *
 * ```text
 * canvas: creating → ready → presented ; lost ; failed
 * context: canvasId, backend, surface
 * ```
 *
 * - **creating**: the surface is in the document and R3F is building its renderer. A placeholder surface (the stage
 *   held while the WebGPU probe answers) stays here until it is removed.
 * - **ready**: R3F's `onCreated` handed over the host. The host adapter, a callback actor started with the R3F root in
 *   its input, holds the renderer, the DOM canvas and `invalidate` in its closure; none of them enters context.
 * - **presented**: the first frame with area reached the screen.
 * - **lost**: the browser took the GPU context; the canvas shows its context-lost fallback until Retry remounts it. A
 *   surface that re-attaches after its loss (a Suspense reveal) reports the loss again from `creating`.
 * - **failed**: the renderer could not start or its WebGPU device was destroyed; the viewer's error boundary takes it.
 *
 * It also holds the viewer's slot in the WebGL context budget (acquire on start, resize with the surface, release on
 * stop) and the project-open load spans `canvas.mount` (start to `ready`) and `frame.first`
 * (`ready` to `presented`), which are cancelled when the canvas leaves first.
 *
 * While a Three canvas can draw (from start until it is lost, fails or stops) it presents the view's camera on its
 * surface, through its `cameraSurface` child:
 * - the surface's size reaches the camera as `setViewport` in the macrostep that reports it (`hostCreated`,
 *   `surfaceResized`), so the frame that resized presents the new viewport;
 * - the camera's clip policy holds the infinite grid's far padding and presentation plane while graphics shows the
 *   grid, following graphics' `gridChanged`, and is cleared when the canvas stops drawing.
 *
 * Every fact here is ephemeral: it is derived from the mounted surface and never persisted or seeded.
 *
 * @module
 */

import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, CallbackActorLogic, EnqueueObject, SnapshotFrom, SystemRegistry } from 'xstate';
import type { CameraClipPolicy, cameraMachine } from '@taucad/camera/machine';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import {
  infiniteGridFadeEndVisibleSpans,
  infiniteGridPresentationPlaneByUpDirection,
} from '#graphics/three/utils/infinite-grid-frame.js';
import { beginViewerLoadSpan } from '#lib/viewer-load-timing.js';
import type { FinishViewerLoadSpan } from '#lib/viewer-load-timing.js';
import { eventSchemas } from '#machines/machine-schemas.js';
import { estimateViewerSurfaceBytes } from '#machines/webgl-context.machine.js';
import type { webglContextMachine } from '#machines/webgl-context.machine.js';

/**
 * The drawing surface's CSS size and drawing-buffer pixel ratio.
 *
 * @public
 */
export type CanvasSurface = Readonly<{ width: number; height: number; pixelRatio: number }>;

/**
 * Why a renderer could not run: a WebGPU start or device failure (the viewer then remounts on WebGL) or any other
 * failure (the viewer's failure screen shows it).
 *
 * @public
 */
export type CanvasFailure = Readonly<{ kind: 'webgpu-initialization' | 'renderer'; message: string }>;

/**
 * What the surface is: a Three canvas, or the placeholder that holds its place while the WebGPU probe answers. A
 * placeholder draws nothing, times nothing and holds no context budget; it only keeps the stage busy.
 *
 * @public
 */
export type CanvasSurfaceKind = 'canvas' | 'placeholder';

/**
 * Commands the canvas actor sends to its host adapter.
 *
 * @public
 */
export type CanvasHostCommand = { type: 'requestRender' };

/**
 * What a host adapter reports back to the canvas actor.
 *
 * @public
 */
export type CanvasHostReport =
  | { type: 'framePresented' }
  | { type: 'surfaceResized'; surface: CanvasSurface }
  | { type: 'contextLost' }
  | { type: 'rendererFailed'; failure: CanvasFailure };

/**
 * A host adapter: callback logic that owns one R3F root's renderer listeners and first-frame observation. The canvas
 * component builds it in `onCreated` around the R3F root, so the renderer, the DOM canvas and `invalidate` live only in
 * its closure; the canvas actor starts it from `hostCreated` and stops it when the renderer stops drawing.
 *
 * @public
 */
export type CanvasHostLogic = CallbackActorLogic<CanvasHostCommand, undefined>;

type WebglContextRef = ActorRefFrom<typeof webglContextMachine>;

/**
 * The view's camera, which a canvas presents on its surface.
 *
 * @public
 */
export type CanvasCameraRef = ActorRefFrom<typeof cameraMachine>;

/**
 * What graphics shows of the infinite grid: whether it is on, and the world up axis it lies across.
 *
 * @public
 */
export type CanvasGrid = Readonly<{ enabled: boolean; upDirection: 'x' | 'y' | 'z' }>;

/**
 * Created by the graphics actor when a surface attaches.
 *
 * @public
 */
export type CanvasInput = Readonly<{
  canvasId: string;
  kind: CanvasSurfaceKind;
  /** The viewer's WebGL context budget, when the embedder tracks one. */
  webglContext?: WebglContextRef;
  /** The surface estimate the viewer was admitted with, held until the canvas reports its own size. */
  admittedBytes?: number;
  /**
   * The surface re-attached to a renderer that already exists (a Suspense reveal): nothing mounts, so the load spans
   * are not timed.
   */
  reattached?: boolean;
  /** The view's camera: the canvas presents its viewport and clip policy on it. A canvas without one presents none. */
  camera?: CanvasCameraRef;
  /** The grid graphics shows when the surface attaches; `gridChanged` follows it. */
  grid?: CanvasGrid;
}>;

/**
 * Events accepted by the canvas actor.
 *
 * @public
 */
export type CanvasEvent =
  /** R3F's `onCreated`: the renderer exists and the host adapter can start. */
  | {
      type: 'hostCreated';
      backend: ResolvedGraphicsBackend;
      surface: CanvasSurface;
      /** The DOM surface, passed on in `surfaceAttached` for adapters that bind input to it. */
      domElement: HTMLCanvasElement;
      host: CanvasHostLogic;
    }
  /** The surface's size or pixel ratio changed. */
  | { type: 'surfaceResized'; surface: CanvasSurface }
  /** Ask for one more frame on a canvas that renders on demand. */
  | { type: 'requestRender' }
  /** The renderer could not be created, before `onCreated`. */
  | { type: 'rendererFailed'; failure: CanvasFailure }
  | { type: 'framePresented' }
  | { type: 'contextLost' }
  /** Graphics turned the grid on or off, or changed the world up axis it lies across. */
  | { type: 'gridChanged'; grid: CanvasGrid };

/**
 * Events the canvas actor emits.
 *
 * @public
 */
export type CanvasEmitted = {
  /** The renderer and its DOM surface exist. A camera or tool adapter that needs the surface starts from this. */
  type: 'surfaceAttached';
  canvasId: string;
  backend: ResolvedGraphicsBackend;
  surface: CanvasSurface;
  domElement: HTMLCanvasElement;
};

/**
 * The canvas actor's context.
 *
 * @public
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface, so declarations reference it by name
export interface CanvasContext {
  canvasId: string;
  kind: CanvasSurfaceKind;
  /** The backend the renderer started on; set in `ready`. */
  backend: ResolvedGraphicsBackend | undefined;
  /** The last reported surface; set in `ready`. */
  surface: CanvasSurface | undefined;
  failure: CanvasFailure | undefined;
  /** The viewer's slot in the WebGL context budget, held for the canvas's life; absent for a placeholder. */
  contextBudget: ContextBudgetRef | undefined;
  loadSpans: LoadSpansRef;
  host: CanvasHostRef | undefined;
  /** Presents this surface's viewport and clip policy on the camera while the canvas can draw. */
  cameraSurface: CameraSurfaceRef | undefined;
}

type LoadSpansCommand = { type: 'mounted' } | { type: 'presented' } | { type: 'cancel' };

/**
 * The project-open load spans of one surface. `canvas.mount` starts with the actor and ends at `mounted`;
 * `frame.first` runs from `mounted` to `presented`. A span still open at `cancel` or at stop ends as cancelled.
 */
const loadSpansLogic = createCallbackLogic<LoadSpansCommand, Readonly<{ timed: boolean }>>(({ input, receive }) => {
  let finishMount: FinishViewerLoadSpan | undefined = input.timed ? beginViewerLoadSpan('canvas.mount') : undefined;
  let finishFirstFrame: FinishViewerLoadSpan | undefined;
  const cancel = (): void => {
    finishMount?.('cancelled');
    finishFirstFrame?.('cancelled');
    finishMount = undefined;
    finishFirstFrame = undefined;
  };
  receive((command) => {
    switch (command.type) {
      case 'mounted': {
        if (finishMount) {
          finishMount();
          finishMount = undefined;
          finishFirstFrame = beginViewerLoadSpan('frame.first');
        }
        break;
      }
      case 'presented': {
        finishFirstFrame?.();
        finishFirstFrame = undefined;
        break;
      }
      case 'cancel': {
        cancel();
        break;
      }
    }
  });
  return cancel;
});

type LoadSpansRef = ActorRefFrom<typeof loadSpansLogic>;

type ContextBudgetInput = Readonly<{ webglContext: WebglContextRef; id: string; bytes: number }>;

/**
 * Holds one slot in the WebGL context budget: acquired when it starts, resized with the surface, released when it stops
 * (the canvas stopping stops it).
 */
const contextBudgetLogic = createCallbackLogic<{ type: 'resize'; bytes: number }, ContextBudgetInput>(
  ({ input, receive }) => {
    const { webglContext, id } = input;
    webglContext.send({ type: 'acquire', id, bytes: input.bytes });
    receive((command) => {
      webglContext.send({ type: 'resize', id, bytes: command.bytes });
    });
    return () => {
      webglContext.send({ type: 'release', id });
    };
  },
);

type ContextBudgetRef = ActorRefFrom<typeof contextBudgetLogic>;

type CameraSurfaceCommand =
  | { type: 'viewport'; viewport: CanvasSurface }
  | { type: 'clipPolicy'; clipPolicy: CameraClipPolicy | undefined };

type CameraSurfaceInput = Readonly<{ camera: CanvasCameraRef; clipPolicy: CameraClipPolicy | undefined }>;

/** Whether the camera still takes events: graphics stops it last, after this canvas. */
const selectCameraRunning = (camera: CanvasCameraRef): boolean => camera.getSnapshot().status === 'active';

/** The viewport the camera presents now. */
const selectPresentedViewport = (camera: CanvasCameraRef): CanvasSurface => camera.getSnapshot().context.view.viewport;

/**
 * Presents one surface on the view's camera: sets the clip policy when it starts, forwards the surface's viewport and
 * policy changes, and clears the policy when it stops. A viewport the camera already presents is not sent again, so a
 * remount or a re-reported size makes no camera change.
 */
const cameraSurfaceLogic = createCallbackLogic<CameraSurfaceCommand, CameraSurfaceInput>(({ input, receive }) => {
  const { camera } = input;
  camera.send({ type: 'setClipPolicy', clipPolicy: input.clipPolicy });
  receive((command) => {
    if (command.type === 'clipPolicy') {
      camera.send({ type: 'setClipPolicy', clipPolicy: command.clipPolicy });
      return;
    }
    const { width, height, pixelRatio } = command.viewport;
    const presented = selectPresentedViewport(camera);
    if (presented.width !== width || presented.height !== height || presented.pixelRatio !== pixelRatio) {
      camera.send({ type: 'setViewport', viewport: { width, height, pixelRatio } });
    }
  });
  return () => {
    if (selectCameraRunning(camera)) {
      camera.send({ type: 'setClipPolicy', clipPolicy: undefined });
    }
  };
});

type CameraSurfaceRef = ActorRefFrom<typeof cameraSurfaceLogic>;

/**
 * The camera clip policy for the grid graphics shows: room past the far plane for the grid's fade, and the grid's plane
 * kept in front of the near plane. No grid, no policy.
 *
 * @param grid - The grid graphics shows.
 * @returns The policy, or `undefined` without a grid.
 * @public
 */
export const resolveGridClipPolicy = (grid: CanvasGrid): CameraClipPolicy | undefined =>
  grid.enabled
    ? {
        farPaddingVerticalSpans: infiniteGridFadeEndVisibleSpans,
        presentationPlane: infiniteGridPresentationPlaneByUpDirection[grid.upDirection],
      }
    : undefined;

const noGrid: CanvasGrid = { enabled: false, upDirection: 'z' };

/** The host slot is filled per surface from `hostCreated`; nothing starts it from the registry. */
const missingHost: CanvasHostLogic = createCallbackLogic<CanvasHostCommand, undefined>(() => {
  throw new Error('The canvas host adapter starts from hostCreated, with the R3F root it was built around.');
});

type CanvasHostRef = ActorRefFrom<CanvasHostLogic>;

const canvasActors = {
  loadSpans: loadSpansLogic,
  contextBudget: contextBudgetLogic,
  host: missingHost,
  cameraSurface: cameraSurfaceLogic,
};

type CanvasEnqueue = EnqueueObject<CanvasEvent, CanvasEmitted, SystemRegistry, typeof canvasActors>;

const hasArea = (surface: CanvasSurface | undefined): boolean =>
  surface !== undefined && surface.width > 0 && surface.height > 0;

/** Report the surface's estimate to the context budget. */
const resizeBudget = (context: CanvasContext, surface: CanvasSurface, enq: CanvasEnqueue): void => {
  if (context.contextBudget) {
    enq.sendTo(context.contextBudget, {
      type: 'resize',
      bytes: estimateViewerSurfaceBytes(surface.width * surface.height, surface.pixelRatio),
    });
  }
};

/** Send the surface's viewport to the camera, once it has area (the camera refuses an empty viewport). */
const presentViewport = (context: CanvasContext, surface: CanvasSurface, enq: CanvasEnqueue): void => {
  if (context.cameraSurface && hasArea(surface)) {
    enq.sendTo(context.cameraSurface, { type: 'viewport', viewport: surface });
  }
};

/**
 * A renderer that stopped drawing: its host adapter stops, its open spans end as cancelled and it no longer presents
 * the camera, whose clip policy is cleared.
 */
const stopDrawing = (context: CanvasContext, enq: CanvasEnqueue): Pick<CanvasContext, 'host' | 'cameraSurface'> => {
  enq.sendTo(context.loadSpans, { type: 'cancel' });
  if (context.host) {
    enq.stop(context.host);
  }
  if (context.cameraSurface) {
    enq.stop(context.cameraSurface);
  }
  return { host: undefined, cameraSurface: undefined };
};

const surfaceResized = (
  context: CanvasContext,
  event: Extract<CanvasEvent, { type: 'surfaceResized' }>,
  enq: CanvasEnqueue,
) => {
  resizeBudget(context, event.surface, enq);
  // In this macrostep, so the frame that resized presents the new viewport.
  presentViewport(context, event.surface, enq);
  // A canvas that gains area after it started draws nothing until asked: ask for the frame the presentation waits on.
  if (!hasArea(context.surface) && hasArea(event.surface) && context.host) {
    enq.sendTo(context.host, { type: 'requestRender' });
  }
  return { context: { surface: event.surface } };
};

const canvasMachineDefinition = setup({
  actors: canvasActors,
  schemas: {
    context: types<CanvasContext>(),
    events: eventSchemas<CanvasEvent>(),
    emitted: eventSchemas<CanvasEmitted>(),
    input: types<CanvasInput>(),
    tags: types<'awaiting-frame' | 'rendering'>(),
  },
}).createMachine({
  id: 'canvas',
  context: ({ input, spawn }) => ({
    canvasId: input.canvasId,
    kind: input.kind,
    backend: undefined,
    surface: undefined,
    failure: undefined,
    // A Three canvas presents the camera from the start: its clip policy holds from the commit that mounts it, as the
    // grid it pads is drawn. A placeholder draws nothing and presents nothing.
    cameraSurface:
      input.kind === 'canvas' && input.camera
        ? spawn(canvasActors.cameraSurface, {
            id: 'cameraSurface',
            input: { camera: input.camera, clipPolicy: resolveGridClipPolicy(input.grid ?? noGrid) },
          })
        : undefined,
    // Holds the viewer's place in the context budget for the canvas's whole life, Retry's fallback included.
    contextBudget:
      input.kind === 'canvas' && input.webglContext
        ? spawn(canvasActors.contextBudget, {
            id: 'contextBudget',
            input: { webglContext: input.webglContext, id: input.canvasId, bytes: input.admittedBytes ?? 0 },
          })
        : undefined,
    loadSpans: spawn(canvasActors.loadSpans, {
      id: 'loadSpans',
      input: { timed: input.kind === 'canvas' && !input.reattached },
    }),
    host: undefined,
  }),
  // Stopping the canvas stops its children: the host adapter, the open load spans, the budget slot and the camera
  // surface (which clears the clip policy) end with it.
  initial: 'creating',
  states: {
    creating: {
      tags: ['awaiting-frame'],
      on: {
        hostCreated: ({ context, event }, enq) => {
          if (context.kind === 'placeholder') {
            // A placeholder never hosts a renderer.
            return {};
          }
          const host = enq.spawn(event.host, { id: 'host' });
          enq.sendTo(context.loadSpans, { type: 'mounted' });
          resizeBudget(context, event.surface, enq);
          presentViewport(context, event.surface, enq);
          enq.emit({
            type: 'surfaceAttached',
            canvasId: context.canvasId,
            backend: event.backend,
            surface: event.surface,
            domElement: event.domElement,
          });
          return { target: 'ready', context: { backend: event.backend, surface: event.surface, host } };
        },
        rendererFailed: ({ context, event }, enq) => ({
          target: 'failed',
          context: { ...stopDrawing(context, enq), failure: event.failure },
        }),
        // No renderer yet: R3F has not measured, and nothing waits on a size before `onCreated`.
        surfaceResized: () => ({}),
        requestRender: () => ({}),
        framePresented: () => ({}),
        // Only a surface re-attached after its context was lost reports a loss before a host: it shows the fallback
        // again. A placeholder has no context to lose.
        contextLost: ({ context }, enq) => {
          if (context.kind === 'placeholder') {
            return {};
          }
          return { target: 'lost', context: stopDrawing(context, enq) };
        },
      },
    },
    ready: {
      tags: ['awaiting-frame', 'rendering'],
      on: {
        framePresented: ({ context }, enq) => {
          enq.sendTo(context.loadSpans, { type: 'presented' });
          return { target: 'presented' };
        },
        // StrictMode replays `onCreated` on the same root; the host adapter already holds it.
        hostCreated: () => ({}),
      },
    },
    presented: {
      tags: ['rendering'],
      on: {
        // The host adapter observes one first frame; a repeated report changes nothing.
        framePresented: () => ({}),
        hostCreated: () => ({}),
      },
    },
    lost: {
      on: {
        // The fallback draws nothing: no frame, size or second root can reach a lost canvas.
        hostCreated: () => ({}),
        surfaceResized: () => ({}),
        requestRender: () => ({}),
        framePresented: () => ({}),
        contextLost: () => ({}),
        rendererFailed: () => ({}),
      },
    },
    failed: {
      on: {
        // The error boundary replaces the surface; reports after the failure change nothing.
        hostCreated: () => ({}),
        surfaceResized: () => ({}),
        requestRender: () => ({}),
        framePresented: () => ({}),
        contextLost: () => ({}),
        rendererFailed: () => ({}),
      },
    },
  },
  on: {
    surfaceResized: ({ context, event }, enq) => surfaceResized(context, event, enq),
    requestRender: ({ context }, enq) => {
      if (context.host) {
        enq.sendTo(context.host, { type: 'requestRender' });
      }
      return {};
    },
    contextLost: ({ context }, enq) => ({ target: '.lost', context: stopDrawing(context, enq) }),
    rendererFailed: ({ context, event }, enq) => ({
      target: '.failed',
      context: { ...stopDrawing(context, enq), failure: event.failure },
    }),
    // Only a canvas that still presents the camera changes its policy; a lost or failed one has none to change.
    gridChanged: ({ context, event }, enq) => {
      if (context.cameraSurface) {
        enq.sendTo(context.cameraSurface, { type: 'clipPolicy', clipPolicy: resolveGridClipPolicy(event.grid) });
      }
      return {};
    },
  },
});

/**
 * The `[state, eventType]` pairs {@link canvasMachine} leaves unanswered (MC-R17): none.
 *
 * @public
 */
export const canvasIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [];

/**
 * Every {@link CanvasEvent} type, in the union's order.
 *
 * @public
 */
export const canvasEventTypes = [
  'hostCreated',
  'surfaceResized',
  'requestRender',
  'rendererFailed',
  'framePresented',
  'contextLost',
  'gridChanged',
] as const satisfies ReadonlyArray<CanvasEvent['type']>;

type CanvasMachineDefinition = typeof canvasMachineDefinition;

/**
 * The type of {@link canvasMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface CanvasMachine extends CanvasMachineDefinition {}

/**
 * The renderer lifecycle of one viewer surface.
 *
 * @public
 */
export const canvasMachine: CanvasMachine = canvasMachineDefinition;

/**
 * A running canvas actor.
 *
 * @public
 */
export type CanvasRef = ActorRefFrom<CanvasMachine>;

/**
 * A canvas actor's snapshot.
 *
 * @public
 */
export type CanvasSnapshot = SnapshotFrom<CanvasMachine>;

/**
 * Whether the stage waits on this surface: it is mounted and its first frame is not on screen yet. A lost or failed
 * canvas draws nothing more, so nothing waits on it.
 *
 * @param snapshot - The canvas snapshot, if a canvas is attached.
 * @returns Whether a first frame is outstanding.
 * @public
 */
export const selectCanvasAwaitingFrame = (snapshot: CanvasSnapshot | undefined): boolean =>
  snapshot?.hasTag('awaiting-frame') ?? false;

/**
 * The backend of the renderer drawing this surface, while one draws.
 *
 * @param snapshot - The canvas snapshot, if a canvas is attached.
 * @returns The backend, or `undefined` before `onCreated` and after loss or failure.
 * @public
 */
export const selectCanvasBackend = (snapshot: CanvasSnapshot | undefined): ResolvedGraphicsBackend | undefined =>
  snapshot?.hasTag('rendering') ? snapshot.context.backend : undefined;
