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
 * - `change` (a drag step, a face click's animation frame): the cube runs in controlled mode, so it writes no camera and
 *   reports the pose in the event; the adapter sends it as `poseObserved` with the source `gizmo` to the camera, which
 *   owns the pose (charter I1, I3). The camera presents it on every canvas: the controls adapter writes its controls
 *   with an echo stamp, so their `update` changes nothing (I3).
 * - `press`, `change`, `end`: `gizmoPressed`, `gizmoTurned` (with the turn's `cause`), `gizmoReleased`, sent back to the
 *   gesture, which decides whether the press or drag holds the canvas's interaction lock.
 * - `invalidate`: a render request.
 *
 * Camera to cube: the adapter is a retained camera consumer, so each presented change retargets the cube's camera and
 * field of view and turns the cube with it. The cube follows the camera's target unless it holds the lock or animates.
 *
 * Each frame, at {@link viewportGizmoRenderPriority} (after the scene), the cube draws into its sub-viewport of the
 * shared canvas, with the section plane picker beside it while Section is on; `render()` measures its own box. The
 * adapter is no listener on `camera-controls` (charter I9): while the lock is held it only disables
 * them, and the canvas's controls adapter does not step them.
 *
 * @module
 */
import type { RootState } from '@react-three/fiber';
import type { GizmoMaterial, GizmoOptions, GizmoPose, ViewportGizmoEventMap } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import type * as THREE from 'three';
import { createCallbackLogic } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { selectCameraDriverSnapshot } from '@taucad/camera/machine';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import type { CameraVector } from '@taucad/camera';
import type { RenderFrame } from '@taucad/spatial';
import type { ThreeCameraRig } from '@taucad/three/camera';
import { fromThreeRenderPoint, toThreeRenderPoint } from '@taucad/three/spatial';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { readViewportGizmoStyle, viewportGizmoMetrics } from '#graphics/three/controls/viewport-gizmo-cube-style.js';
import type { ViewportGizmoStyle } from '#graphics/three/controls/viewport-gizmo-cube-style.js';
import {
  resolveViewportGizmoStyleConfig,
  viewportGizmoNodeMaterials,
} from '#graphics/three/controls/viewport-gizmo-styles.js';
import type { GizmoStyleId, ViewportGizmoStyleConfig } from '#graphics/three/controls/viewport-gizmo-styles.js';
import { renderViewportGizmoFrame } from '#graphics/three/controls/viewport-gizmo-render-loop.js';
import type { SectionPlanePicker } from '#graphics/three/controls/section-plane-picker.js';
import type { OrbitStyle } from '#graphics/three/controls/camera-wheel-router.js';
import { gizmoFieldOfView, resolveGizmoContainer } from '#graphics/three/utils/gizmo.utils.js';
import { beginViewerLoadSpan } from '#lib/viewer-load-timing.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type {
  ViewportGizmoAdapterEvent,
  ViewportGizmoAdapterLogic,
  ViewportGizmoAppearance,
  ViewportGizmoCommand,
} from '#machines/viewport-gizmo-gesture.machine.js';
import type { CameraUpdateHandler } from '#graphics/graphics-camera.js';

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

/**
 * The view cube element's classes: `viewport-gizmo-cube`, which hosts place it by, and its look in each state the
 * library marks on it (styling guide revision 3): the action cursor over a target (`data-hovered`), the grabbing cursor
 * while a drag turns the view (`data-dragging`), no pointer input while display-only (`data-disabled`, the Axes style,
 * so a press reaches the canvas below), and Tau's foreground and focus ring on the navigation buttons.
 *
 * @public
 */
export const viewportGizmoClassName = [
  'viewport-gizmo-cube',
  'data-hovered:cursor-action',
  'data-dragging:cursor-grabbing',
  'data-disabled:pointer-events-none',
  '[--viewport-gizmo-button-color:var(--foreground)]',
  '[--viewport-gizmo-button-focus-ring:var(--focus-outline-color)]',
].join(' ');

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
  /** The cube's style; the rounded cube when omitted. A new style is a new adapter. */
  gizmoStyle?: GizmoStyleId;
  /** The person's orbit style; Turntable when omitted. A new orbit style is a new adapter. */
  orbitStyle?: OrbitStyle;
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
 * Reads the pose the cube reported (controlled mode), in the view's physical frame. The cube orbits its target at a
 * fixed distance, so the camera's span is kept. A view along the up axis (a top or bottom face) is tilted off it by
 * {@link poleTilt}, further the way the cube already leans off the pole, so the camera does not refuse it.
 *
 * @param options - The reported pose, the cube's target (render units), the view's render frame and the presented span.
 * @returns The pose for the camera actor.
 * @public
 */
export const readViewportGizmoPose = ({
  pose,
  target,
  renderFrame,
  verticalSpan,
}: Readonly<{ pose: GizmoPose; target: THREE.Vector3; renderFrame: RenderFrame; verticalSpan: number }>): Readonly<{
  target: CameraVector;
  direction: CameraVector;
  up: CameraVector;
  verticalSpan: number;
}> => {
  const direction = pose.direction.clone();
  const { up } = pose;
  const lean = direction.clone().addScaledVector(up, -direction.dot(up));
  // ponytail: the library keeps poses 1e-4 rad off the poles, so `lean` is never zero there.
  if (lean.length() < poleTilt && lean.lengthSq() > 0) {
    direction.addScaledVector(lean.normalize(), poleTilt).normalize();
  }
  return {
    target: fromThreeRenderPoint({ renderFrame, point: target }),
    direction: [direction.x, direction.y, direction.z],
    up: [up.x, up.y, up.z],
    verticalSpan,
  };
};

/** The cube's label up for the view's up axis. */
const upVectors = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
} as const;

/**
 * How far the cube sits in from the stage's edges, in CSS pixels: the navigation buttons ring the cube outside its box.
 */
const navigationOffset = 24;

/**
 * The cube's `ViewportGizmo` options for a style, an up axis and an orbit style. Turntable keeps the view upright
 * (`roll: false`, no roll arrows or roll keys); Tumble turns every click, side triangle and roll by the single shortest
 * rotation (`roll: 'free'`), roll ruling E. The side triangles, the roll arrows while the view may roll and Home are
 * the library's own navigation buttons.
 *
 * @param options - The cube's style, up axis, orbit style, placement container and size.
 * @returns The options to build or regenerate the cube with.
 * @public
 */
export const viewportGizmoOptions = ({
  style,
  upDirection,
  orbitStyle = 'turntable',
  container,
  placeTopRight,
  size,
  styleConfig,
}: Readonly<{
  style: ViewportGizmoStyle;
  upDirection: ViewportGizmoAppearance['upDirection'];
  orbitStyle?: OrbitStyle;
  container: HTMLElement;
  placeTopRight: boolean;
  size: number;
  styleConfig: ViewportGizmoStyleConfig;
}>): GizmoOptions => ({
  up: upVectors[upDirection],
  // Every pose goes through the camera actor (TA1).
  controlled: true,
  roll: orbitStyle === 'tumble' ? 'free' : false,
  navigation: { enabled: true },
  placement: placeTopRight ? 'top-right' : 'bottom-right',
  size,
  font: { weight: 500, family: style.font },
  offset: { top: navigationOffset, bottom: navigationOffset, right: navigationOffset },
  className: viewportGizmoClassName,
  resolution: viewportGizmoMetrics.textureSize,
  container,
  ...styleConfig.options,
});

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
      const {
        store,
        container,
        size,
        backend,
        rig,
        consumersRef,
        graphics,
        planePicker,
        gizmoStyle = 'cube',
        orbitStyle,
      } = host;
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

      const readStyle = (): ViewportGizmoStyle =>
        readViewportGizmoStyle({ container: containerElement, ...appearance.environment });
      const resolveStyle = (style: ViewportGizmoStyle): ViewportGizmoStyleConfig =>
        resolveViewportGizmoStyleConfig({ gizmoStyle, colors: style, radius: viewportGizmoMetrics.radius });
      const options = (style: ViewportGizmoStyle): GizmoOptions =>
        viewportGizmoOptions({
          style,
          upDirection: appearance.upDirection,
          orbitStyle,
          container: containerElement,
          placeTopRight: container !== undefined,
          size,
          styleConfig: resolveStyle(style),
        });

      // The node materials the cube draws with on WebGPU; the cube leaves them to the host.
      // ponytail: freed at stop, so a restyle's spares wait until then; free by `use` if theme churn shows in memory.
      const nodeMaterials = new Set<GizmoMaterial>();
      const onMaterial = backend === 'webgpu' ? viewportGizmoNodeMaterials(nodeMaterials) : undefined;
      let style = readStyle();
      const gizmo = new ViewportGizmo(rig.activeCamera, gl, {
        ...options(style),
        onMaterial,
        fieldOfView: gizmoFieldOfView(selectCameraDriver(rig).view.requestedVerticalFieldOfView),
      });
      gizmo.enabled = resolveStyle(style).clickable;

      /*
       * Pipeline pre-warm (Policy Rule 13): on WebGPU the cube's surface and axes need pipelines, so the first draw would
       * otherwise wait on `createRenderPipelineAsync` and skip frames. Each paint builds new materials, so each warms.
       */
      const warmUp = (): void => {
        // async-iife: bootstrap — the warm-up is asynchronous; a stop before it resolves makes it a no-op.
        void (async () => {
          try {
            await gizmo.compile();
          } catch (error) {
            console.error('ViewportGizmoCube pipeline warm-up failed', error);
            return;
          }
          if (!stopped) {
            invalidate();
          }
        })();
      };

      /* Paints what `ViewportGizmo` does not: the plane picker's style. */
      const decorate = (): void => {
        planePicker?.setStyle(style);
        warmUp();
        invalidate();
      };

      /* Restyles the cube in place: the same instance, element, camera, target and listeners. */
      const repaint = (): void => {
        style = readStyle();
        gizmo.set(options(style));
        gizmo.enabled = resolveStyle(style).clickable;
        decorate();
      };

      /* Camera to cube: retarget its camera and field of view, follow the target, turn with the camera. */
      const follow: CameraUpdateHandler = (camera, snapshot) => {
        gizmo.camera = camera;
        const fieldOfView = gizmoFieldOfView(snapshot.view.requestedVerticalFieldOfView);
        if (gizmo.options.fieldOfView !== fieldOfView) {
          gizmo.set({ fieldOfView });
        }
        if (!locked && !gizmo.animating) {
          gizmo.target.copy(
            toThreeRenderPoint({ renderFrame: snapshot.renderFrame, pointMeters: snapshot.view.target }),
          );
        }
        gizmo.update();
      };

      /* Cube to camera. */
      const onPress = (): void => {
        sendBack({ type: 'gizmoPressed' });
      };
      const onChange = (event: ViewportGizmoEventMap['change']): void => {
        const presented = selectCameraDriver(rig);
        const pose = readViewportGizmoPose({
          pose: event.pose,
          target: gizmo.target,
          renderFrame: rig.renderFrame,
          verticalSpan: presented.view.verticalSpan,
        });
        rig.actorRef.send({ type: 'poseObserved', ...pose, source: 'gizmo' });
        sendBack({ type: 'gizmoTurned', cause: event.cause });
      };
      const onEnd = (): void => {
        sendBack({ type: 'gizmoReleased' });
      };

      const takeLock = (): void => {
        if (locked) {
          return;
        }
        locked = true;
        const { controls } = store.getState() as { controls?: { enabled?: boolean } };
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
        const { controls } = store.getState() as { controls?: { enabled?: boolean } };
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
            break;
          }
        }
      });

      /* The cube's draw, into its sub-viewport of the shared canvas. */
      const draw = {
        current(state: RootState): void {
          renderViewportGizmoFrame({
            gizmo,
            planePicker:
              planePicker && selectSectionViewActive(graphics)
                ? { picker: planePicker, renderer: state.gl, camera: state.camera }
                : undefined,
          });
        },
      };

      decorate();
      gizmo.addEventListener('press', onPress);
      gizmo.addEventListener('change', onChange);
      gizmo.addEventListener('end', onEnd);
      gizmo.addEventListener('invalidate', invalidate);
      consumersRef.current.add(follow);
      follow(rig.activeCamera, selectCameraDriver(rig));
      const root = store.getState();
      const unsubscribeFrame = (root.internal.subscribe as FrameSubscribe)(draw, viewportGizmoRenderPriority, store);
      finishSpan();

      return () => {
        stopped = true;
        unsubscribeFrame();
        consumersRef.current.delete(follow);
        gizmo.removeEventListener('press', onPress);
        gizmo.removeEventListener('change', onChange);
        gizmo.removeEventListener('end', onEnd);
        gizmo.removeEventListener('invalidate', invalidate);
        releaseLock();
        gizmo.dispose();
        for (const material of nodeMaterials) {
          material.dispose();
        }
        invalidate();
      };
    },
  );
