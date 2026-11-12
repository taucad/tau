/**
 * The view cube's DOM adapter: the `ViewportGizmo`, its listeners and its render subscription, held in one closure
 * (charter D4).
 *
 * The view cube builds it around its canvas's R3F store and hands it to graphics (`viewportGizmoAttached`), which runs
 * it as the `adapter` of the view cube's gesture (`viewportGizmoGestureMachine`) and stops it with the cube. The cube
 * is built once per start, inside one `gizmo.create` load span; theme, accent, contrast, a web font arriving and the
 * up axis repaint or reorient it in place (`ViewportGizmo.set`), never rebuild it.
 *
 * Cube to camera:
 * - `change` (a drag step, a face click's animation frame): `poseObserved` with the source `gizmo`, sent to the camera,
 *   which owns the pose (charter I1, I3). The camera presents it on every canvas: the controls adapter writes its
 *   controls with an echo stamp, so their `update` changes nothing (I3).
 * - `start`, `change`, `end`: `gizmoPressed`, `gizmoTurned`, `gizmoReleased`, sent back to the gesture, which decides
 *   whether the press holds the canvas's interaction lock.
 * - `start`, `change`, `end`, `hoverchange`: a render request.
 *
 * Camera to cube: the adapter is a retained camera consumer, so each presented change retargets the cube's camera and
 * field of view and turns the cube with it. The cube follows the camera's target unless it holds the lock or animates.
 *
 * Each frame, at {@link viewportGizmoRenderPriority} (after the scene), the cube draws into its sub-viewport of the
 * shared canvas, with the section plane picker beside it while Section is on. The cube follows the canvas's size from
 * the R3F store. The adapter is no listener on `camera-controls` (charter I9): while the lock is held it only disables
 * them, and the canvas's controls adapter does not step them.
 *
 * @module
 */
import type { RootState } from '@react-three/fiber';
import type { GizmoOptions } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import * as THREE from 'three';
import type { Camera, Object3D } from 'three';
import { createCallbackLogic } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { selectCameraDriverSnapshot } from '@taucad/camera/machine';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import type { CameraVector } from '@taucad/camera';
import type { RenderFrame } from '@taucad/spatial';
import type { ThreeCameraRig } from '@taucad/three/camera';
import { fromThreeRenderPoint, toThreeRenderPoint } from '@taucad/three/spatial';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { createViewportGizmoCubeAxes } from '#graphics/three/controls/viewport-gizmo-cube-axes.js';
import { readViewportGizmoStyle, viewportGizmoMetrics } from '#graphics/three/controls/viewport-gizmo-cube-style.js';
import type { ViewportGizmoStyle } from '#graphics/three/controls/viewport-gizmo-cube-style.js';
import { applyViewportGizmoSurface } from '#graphics/three/controls/viewport-gizmo-cube-surface.js';
import {
  bindViewportGizmoInvalidationEvents,
  readGizmoViewport,
  renderViewportGizmoFrame,
} from '#graphics/three/controls/viewport-gizmo-render-loop.js';
import type { SectionPlanePicker } from '#graphics/three/controls/section-plane-picker.js';
import { followGizmoCanvasSize, resolveGizmoContainer, syncGizmoFov } from '#graphics/three/utils/gizmo.utils.js';
import { isViewportWebGpu } from '#graphics/three/viewport-cad-renderer.js';
import { beginViewerLoadSpan } from '#lib/viewer-load-timing.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type {
  ViewportGizmoAdapterEvent,
  ViewportGizmoAdapterLogic,
  ViewportGizmoAppearance,
  ViewportGizmoCommand,
} from '#machines/viewport-gizmo-gesture.machine.js';
import type { CameraUpdateHandler } from '#services/graphics-camera-registry.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;
type GraphicsSnapshot = SnapshotFrom<typeof graphicsMachine>;

type FrameCallback = (state: RootState, delta: number) => void;
type FrameSubscribe = (
  callback: { current: FrameCallback },
  priority: number,
  store: Readonly<{ getState: () => RootState }>,
) => () => void;

/**
 * The view cube draws after the scene, its overlays and the section handles (2.5).
 *
 * @public
 */
export const viewportGizmoRenderPriority = 3;

/** The class name the view cube's DOM element carries; hosts place it with this. */
const className = 'viewport-gizmo-cube';

/**
 * The R3F store the view cube draws on: read live, and followed for the canvas's size.
 *
 * @public
 */
export type ViewportGizmoStore = Readonly<{
  getState: () => RootState;
  subscribe: (listener: (state: RootState) => void) => () => void;
}>;

/**
 * The host objects one view cube is built around. Every member is a host object or a host callback; the adapter keeps
 * them in its closure.
 *
 * @public
 */
export type ViewportGizmoHost = Readonly<{
  /** The canvas's R3F store. */
  store: ViewportGizmoStore;
  /** A container element or selector to append the cube to; the renderer's parent when omitted. */
  container?: HTMLElement | string;
  /** The cube's size in CSS pixels. */
  size: number;
  /** The rendering backend the cube's materials are built for. */
  backend: ResolvedGraphicsBackend;
  /** The view's native camera rig: the cube turns its active camera and reports poses to its camera actor. */
  rig: ThreeCameraRig;
  /** The view's retained camera consumers: the adapter joins them while it runs. */
  consumersRef: Readonly<{ current: Set<CameraUpdateHandler> }>;
  /** The graphics actor: the cube's press sets the model's hover aside there. */
  graphics: GraphicsActorRef;
  /** The section plane picker the cube draws beside it, styled as the cube is. Absent when it has none. */
  planePicker?: SectionPlanePicker;
}>;

/** The camera's presented pose, read once per reported turn. */
const selectCameraDriver = (rig: ThreeCameraRig): CameraDriverSnapshot =>
  selectCameraDriverSnapshot(rig.actorRef.getSnapshot());

/** Whether Section is on, which draws the plane picker beside the cube. */
const selectSectionViewActive = (graphics: GraphicsActorRef): boolean =>
  (graphics.getSnapshot() as GraphicsSnapshot).context.isSectionViewActive;

/**
 * How far a view straight along the up axis is tilted off it, toward the camera's own screen up: the camera takes no
 * view parallel to its up (as `camera-controls` keeps a polar margin), and this keeps the roll the cube turned to.
 */
const poleTilt = 1e-3;

/**
 * Reads the pose the cube turned its camera to, in the view's physical frame. The cube orbits its target at a fixed
 * distance, so the camera's span is kept. A view along the up axis (a top or bottom face) is tilted off it by
 * {@link poleTilt}, toward the camera's screen up, so the camera does not refuse it.
 *
 * @param options - The cube's camera and target (render units), the view's render frame and the presented span.
 * @returns The pose, or `undefined` when the camera sits on its target.
 * @public
 */
export const readViewportGizmoPose = ({
  camera,
  target,
  renderFrame,
  verticalSpan,
}: Readonly<{ camera: Camera; target: THREE.Vector3; renderFrame: RenderFrame; verticalSpan: number }>):
  | Readonly<{ target: CameraVector; direction: CameraVector; up: CameraVector; verticalSpan: number }>
  | undefined => {
  const offset = camera.position.clone().sub(target);
  const distance = offset.length();
  if (!(distance > 0)) {
    return undefined;
  }
  const direction = offset.divideScalar(distance);
  const up = camera.up.clone().normalize();
  if (direction.clone().cross(up).lengthSq() < poleTilt * poleTilt) {
    const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    direction.addScaledVector(screenUp, -poleTilt).normalize();
  }
  return {
    target: fromThreeRenderPoint({ renderFrame, point: target }),
    direction: [direction.x, direction.y, direction.z],
    up: [camera.up.x, camera.up.y, camera.up.z],
    verticalSpan,
  };
};

/**
 * The cube's `ViewportGizmo` options for a style and an up axis.
 *
 * @param options - The cube's style, up axis, placement container and size.
 * @returns The options to build or regenerate the cube with.
 * @public
 */
export const viewportGizmoOptions = ({
  style,
  upDirection,
  container,
  placeTopRight,
  size,
}: Readonly<{
  style: ViewportGizmoStyle;
  upDirection: ViewportGizmoAppearance['upDirection'];
  container: HTMLElement;
  placeTopRight: boolean;
  size: number;
}>): GizmoOptions => {
  const faceConfig = {
    color: style.face,
    labelColor: style.label,
    hover: { color: style.hover, labelColor: style.hoverLabel },
  };
  return {
    type: 'rounded-cube',
    up: upDirection,
    placement: placeTopRight ? 'top-right' : 'bottom-right',
    size,
    font: { weight: 500, family: style.font },
    radius: viewportGizmoMetrics.radius,
    offset: { bottom: 0, right: 0 },
    className,
    resolution: viewportGizmoMetrics.textureSize,
    container,
    background: { enabled: false },
    corners: faceConfig,
    edges: faceConfig,
    right: faceConfig,
    top: faceConfig,
    front: faceConfig,
    back: faceConfig,
    left: faceConfig,
    bottom: faceConfig,
  };
};

/**
 * Creates a view cube's DOM adapter, the callback logic its gesture runs while the cube is mounted.
 *
 * @param host - The canvas's store, the view's rig and consumers, the graphics actor and the cube's placement.
 * @returns The adapter logic to send in `viewportGizmoAttached`.
 * @public
 */
export const createViewportGizmoAdapter = (host: ViewportGizmoHost): ViewportGizmoAdapterLogic =>
  createCallbackLogic<ViewportGizmoCommand, ViewportGizmoAppearance, ViewportGizmoAdapterEvent>(
    ({ input, sendBack, receive }) => {
      const { store, container, size, backend, rig, consumersRef, graphics, planePicker } = host;
      const { gl } = store.getState();
      const containerElement = resolveGizmoContainer(container, gl.domElement);
      if (!containerElement) {
        return undefined;
      }
      const finishSpan = beginViewerLoadSpan('gizmo.create');
      const invalidate = (): void => {
        store.getState().invalidate();
      };
      let appearance = input;
      let stopped = false;
      let locked = false;
      let controlsEnabledBeforeLock = true;
      // The web font the cube last waited for: canvas text does not repaint when it arrives, so the cube repaints once.
      let awaitedFont: string | undefined;

      const readStyle = (): ViewportGizmoStyle =>
        readViewportGizmoStyle({ container: containerElement, ...appearance.environment });
      const options = (style: ViewportGizmoStyle): GizmoOptions =>
        viewportGizmoOptions({
          style,
          upDirection: appearance.upDirection,
          container: containerElement,
          placeTopRight: container !== undefined,
          size,
        });

      let style = readStyle();
      const gizmo = new ViewportGizmo(rig.activeCamera, gl, options(style));
      gizmo.scale.multiplyScalar(0.7);

      /*
       * Pipeline pre-warm (Policy Rule 13): on WebGPU the cube's surface and axes need pipelines, so the first draw would
       * otherwise wait on `createRenderPipelineAsync` and skip frames. Each paint builds new materials, so each warms.
       */
      const warmUp = (): void => {
        const renderer = gl as unknown as { compileAsync?: (scene: Object3D, camera: Camera) => Promise<unknown> };
        const compile = renderer.compileAsync;
        if (backend !== 'webgpu' || typeof compile !== 'function') {
          return;
        }
        // async-iife: bootstrap — the warm-up is asynchronous; a stop before it resolves makes it a no-op.
        void (async () => {
          try {
            await Promise.all([
              compile.call(renderer, gizmo, rig.perspectiveCamera),
              compile.call(renderer, gizmo, rig.orthographicCamera),
            ]);
          } catch (error) {
            console.error('ViewportGizmoCube pipeline warm-up failed', error);
            return;
          }
          if (!stopped) {
            invalidate();
          }
        })();
      };

      /* Paints what `ViewportGizmo` does not: the surface, the axes, the field of view and the plane picker. */
      const decorate = (): void => {
        applyViewportGizmoSurface(gizmo, style, backend);
        gizmo.add(
          createViewportGizmoCubeAxes({
            axesSize: 2.1,
            rendererSize: size,
            xAxisColor: style.axes.x,
            yAxisColor: style.axes.y,
            zAxisColor: style.axes.z,
            xLabelColor: style.axes.x,
            yLabelColor: style.axes.y,
            zLabelColor: style.axes.z,
            lineWidth: 1.5,
            lineOpacity: 1,
            fontFamily: style.font,
            renderingBackend: backend,
          }),
        );
        syncGizmoFov(gizmo, selectCameraDriver(rig).view.requestedVerticalFieldOfView);
        planePicker?.setStyle(style);
        warmUp();
        awaitFont();
        invalidate();
      };

      /* Regenerates the cube in place: the same instance, camera, target and listeners. */
      const repaint = (): void => {
        style = readStyle();
        gizmo.set(options(style));
        decorate();
      };

      function awaitFont(): void {
        const font = `500 ${viewportGizmoMetrics.fontSize}px ${style.font}`;
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- jsdom and some embedders have no FontFaceSet.
        if (awaitedFont === style.font || typeof document === 'undefined' || !document.fonts) {
          return;
        }
        if (document.fonts.check(font)) {
          return;
        }
        awaitedFont = style.font;
        const family = style.font;
        // async-iife: bootstrap — font readiness is asynchronous; a stop or a new font family makes it a no-op.
        void (async () => {
          try {
            await document.fonts.load(font);
          } catch {
            return; // A failed font request keeps the system-font labels.
          }
          if (!stopped && style.font === family) {
            repaint();
          }
        })();
      }

      /* Camera to cube: retarget its camera and field of view, follow the target, turn with the camera. */
      const follow: CameraUpdateHandler = (camera, snapshot) => {
        gizmo.camera = camera;
        syncGizmoFov(gizmo, snapshot.view.requestedVerticalFieldOfView);
        if (!locked && !gizmo.animating) {
          gizmo.target.copy(
            toThreeRenderPoint({ renderFrame: snapshot.renderFrame, pointMeters: snapshot.view.target }),
          );
        }
        gizmo.cameraUpdate();
      };

      /* Cube to camera. */
      const onStart = (): void => {
        sendBack({ type: 'gizmoPressed' });
      };
      const onChange = (): void => {
        const presented = selectCameraDriver(rig);
        const pose = readViewportGizmoPose({
          camera: gizmo.camera,
          target: gizmo.target,
          renderFrame: rig.renderFrame,
          verticalSpan: presented.view.verticalSpan,
        });
        if (pose) {
          rig.actorRef.send({ type: 'poseObserved', ...pose, source: 'gizmo' });
        }
        sendBack({ type: 'gizmoTurned' });
      };
      const onEnd = (): void => {
        sendBack({ type: 'gizmoReleased' });
      };
      const listeners = [
        ['start', onStart],
        ['change', onChange],
        ['end', onEnd],
      ] as const;

      const takeLock = (): void => {
        if (locked) {
          return;
        }
        locked = true;
        const { controls } = store.getState() as { controls: { enabled?: boolean } | null };
        controlsEnabledBeforeLock = controls?.enabled ?? true;
        if (controls) {
          controls.enabled = false;
        }
        graphics.send({ type: 'beginViewerModelHoverSuppression', reason: 'viewportGizmo', source: 'viewer' });
      };
      const releaseLock = (): void => {
        if (!locked) {
          return;
        }
        locked = false;
        const { controls } = store.getState() as { controls: { enabled?: boolean } | null };
        if (controls) {
          controls.enabled = controlsEnabledBeforeLock;
        }
        graphics.send({ type: 'endViewerModelHoverSuppression', reason: 'viewportGizmo', source: 'viewer' });
      };

      receive((message) => {
        switch (message.type) {
          case 'lockTaken': {
            takeLock();
            return;
          }
          case 'lockedTurn': {
            graphics.send({ type: 'markModelPointerGestureMoved' });
            return;
          }
          case 'lockReleased': {
            releaseLock();
            return;
          }
          case 'appearanceChanged': {
            appearance = { environment: message.environment, upDirection: message.upDirection };
            repaint();
            return;
          }
        }
      });

      /* The cube's draw, into its sub-viewport of the shared canvas. */
      const savedViewport = new THREE.Vector4();
      const savedScissor = new THREE.Vector4();
      const draw = {
        current(state: RootState): void {
          const target = isViewportWebGpu(state.gl) ? state.gl.getRenderTarget() : null;
          const viewport = readGizmoViewport(gizmo as unknown as Readonly<Record<string, unknown>>);
          if (target && viewport) {
            savedViewport.copy(target.viewport);
            savedScissor.copy(target.scissor);
            target.viewport.set(...viewport).multiplyScalar(state.gl.getPixelRatio());
            target.scissor.copy(target.viewport);
          }
          try {
            renderViewportGizmoFrame({
              gizmo,
              renderer: state.gl,
              invalidate,
              planePicker:
                planePicker && selectSectionViewActive(graphics)
                  ? { picker: planePicker, renderer: state.gl, camera: state.camera }
                  : undefined,
            });
          } finally {
            if (target && viewport) {
              target.viewport.copy(savedViewport);
              target.scissor.copy(savedScissor);
            }
          }
        },
      };

      // The cube follows the canvas's size, placing its DOM element and saved viewport without a rebuild.
      const unsubscribeSize = followGizmoCanvasSize({ store, gizmo });

      decorate();
      for (const [type, listener] of listeners) {
        gizmo.addEventListener(type, listener);
      }
      const removeInvalidationListeners = bindViewportGizmoInvalidationEvents({ gizmo, invalidate });
      consumersRef.current.add(follow);
      follow(rig.activeCamera, selectCameraDriver(rig));
      const root = store.getState();
      const unsubscribeFrame = (root.internal.subscribe as FrameSubscribe)(draw, viewportGizmoRenderPriority, store);
      finishSpan();

      return () => {
        stopped = true;
        unsubscribeFrame();
        unsubscribeSize();
        consumersRef.current.delete(follow);
        removeInvalidationListeners();
        for (const [type, listener] of listeners) {
          gizmo.removeEventListener(type, listener);
        }
        releaseLock();
        gizmo.dispose();
        invalidate();
      };
    },
  );
