/* oxlint-disable @typescript-eslint/no-unnecessary-condition -- TODO: review these types, some are actually required */
import { useThree } from '@react-three/fiber';
import type { GizmoAxisOptions, GizmoOptions } from 'three-viewport-gizmo';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Object3D, Camera } from 'three';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import type { ThreeCamera } from '@taucad/three/camera';
import { useColor } from '#hooks/use-color.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { createViewportGizmoCubeAxes } from '#components/geometry/graphics/three/controls/viewport-gizmo-cube-axes.js';
import { bindViewportGizmoControls } from '#components/geometry/graphics/three/controls/viewport-gizmo-controls-adapter.js';
import type { ViewportGizmoControlsBinding } from '#components/geometry/graphics/three/controls/viewport-gizmo-controls-adapter.js';
import { useViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import {
  bindViewportGizmoInvalidationEvents,
  useViewportGizmoRenderLoop,
} from '#components/geometry/graphics/three/controls/viewport-gizmo-render-loop.js';
import { useCameraRetarget, useCameraRig, useGraphics } from '#hooks/use-graphics.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import {
  resolveGizmoContainer,
  syncGizmoFov,
  useGizmoResizeSync,
} from '#components/geometry/graphics/three/utils/gizmo.utils.js';

type ViewportGizmoCubeProps = {
  readonly size?: number;
  /**
   * A container element or selector to append the gizmo to.
   *
   * When provided, the gizmo will be appended to this container instead of the renderer's parent.
   */
  readonly container?: HTMLElement | string;
  /**
   * Optional dependencies array that will be appended to the effect dependencies.
   * When any of these values change, the gizmo will be disposed and recreated.
   * Useful for triggering recreation when coordinate systems or other external state changes.
   *
   * @example <caption>Recreate the gizmo when the coordinate system changes.</caption>
   * ```tsx
   * <ViewportGizmoCube dependencies={[enableYupRotation]} />
   * ```
   */
  readonly dependencies?: readonly unknown[];
};

const className = 'viewport-gizmo-cube';
const emptyDependencies: readonly unknown[] = [];

export function ViewportGizmoCube({
  size = 96,
  container,
  dependencies = emptyDependencies,
}: ViewportGizmoCubeProps): ReactNode {
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const interactionLock = useViewportGizmoInteractionLock();
  const graphicsActor = useGraphics();
  const cameraRig = useCameraRig();

  const { serialized } = useColor();
  const { theme, isHighContrast } = useTheme();

  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref
  const gizmoRef = useRef<ViewportGizmo | undefined>(undefined);
  const controlsBindingRef = useRef<ViewportGizmoControlsBinding | undefined>(undefined);
  const initialCameraRef = useRef(cameraRig.activeCamera);

  const retargetCamera = useCallback((camera: ThreeCamera, snapshot: CameraDriverSnapshot): void => {
    const gizmo = gizmoRef.current;
    if (!gizmo) {
      return;
    }
    gizmo.camera = camera;
    controlsBindingRef.current?.setCamera?.(camera);
    syncGizmoFov(gizmo, snapshot.view.requestedVerticalFieldOfView);
    gizmo.cameraUpdate();
  }, []);
  useCameraRetarget(retargetCamera);

  const graphicsBackendThree = useThreeGraphicsBackend();

  useViewportGizmoRenderLoop({ gizmoRef, renderer: gl, controlsBindingRef, invalidate });

  // ViewportGizmo overlays into a sub-viewport of the shared R3F canvas (same pattern as three-viewport-gizmo docs).
  useEffect(() => {
    if (!gl || !controls) {
      return;
    }

    const containerToUse = resolveGizmoContainer(container, gl.domElement);
    if (!containerToUse) {
      return;
    }

    const faceColor = isHighContrast
      ? theme === Theme.DARK
        ? 0x66_66_66
        : 0x8c_8c_8c
      : theme === Theme.DARK
        ? 0x33_33_33
        : 0xdd_dd_dd;
    const edgeColor = isHighContrast
      ? theme === Theme.DARK
        ? 0xff_ff_ff
        : 0x22_22_22
      : theme === Theme.DARK
        ? 0x55_55_55
        : 0xee_ee_ee;
    const faceConfig = {
      color: faceColor,
      labelColor: theme === Theme.DARK ? 0xff_ff_ff : 0x00_00_00,
      hover: {
        color: serialized.hex,
      },
    } as const satisfies GizmoAxisOptions;
    const edgeConfig = {
      color: edgeColor,
      opacity: 1,
      hover: {
        color: serialized.hex,
      },
    } as const satisfies GizmoAxisOptions;
    const cornerConfig = {
      ...faceConfig,
      color: faceColor,
      hover: {
        color: serialized.hex,
      },
    } as const satisfies GizmoAxisOptions;

    const gizmoConfig: GizmoOptions = {
      type: 'rounded-cube',
      placement: container ? 'top-right' : 'bottom-right',
      size,
      font: {
        weight: 'normal',
        family: 'monospace',
      },
      radius: 0.3,
      offset: {
        bottom: 0,
        right: 0,
      },
      className,
      resolution: 256,
      container: containerToUse,
      background: {
        enabled: false,
      },
      corners: cornerConfig,
      edges: edgeConfig,
      right: faceConfig,
      top: faceConfig,
      front: faceConfig,
      back: faceConfig,
      left: faceConfig,
      bottom: faceConfig,
    };

    const gizmo = new ViewportGizmo(initialCameraRef.current, gl, gizmoConfig);
    gizmoRef.current = gizmo;

    syncGizmoFov(gizmo, cameraRig.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView);

    const removeInvalidationListeners = bindViewportGizmoInvalidationEvents({ gizmo, invalidate });

    gizmo.scale.multiplyScalar(0.7);
    const gizmoAxes = createViewportGizmoCubeAxes({
      axesSize: 2.1,
      rendererSize: size,
      xAxisColor: 'red',
      yAxisColor: 'green',
      // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js axis color
      zAxisColor: 'rgb(37, 78, 136)',
      xLabelColor: 'red',
      yLabelColor: 'green',
      // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js axis color
      zLabelColor: 'rgb(37, 78, 136)',
      lineWidth: 2,
      renderingBackend: graphicsBackendThree,
    });
    gizmo.add(gizmoAxes);

    const controlsBinding = bindViewportGizmoControls({
      camera: initialCameraRef.current,
      controls,
      gizmo,
      interactionLock,
      modelPointerInteraction: {
        onStart: () => {
          graphicsActor.send({
            type: 'beginViewerModelHoverSuppression',
            reason: 'viewportGizmo',
            source: 'viewer',
          });
        },
        onMove: () => {
          graphicsActor.send({ type: 'markModelPointerGestureMoved' });
        },
        onEnd: () => {
          graphicsActor.send({
            type: 'endViewerModelHoverSuppression',
            reason: 'viewportGizmo',
            source: 'viewer',
          });
        },
      },
    });
    if (!controlsBinding) {
      gizmoRef.current = undefined;
      removeInvalidationListeners();
      gizmo.dispose();
      return;
    }
    controlsBindingRef.current = controlsBinding;

    // Pipeline pre-warm (Policy Rule 13): when the WebGPU backend is active the gizmo
    // axes use Tau's `Line2NodeMaterial`, so the first `gizmo.render()` call would
    // otherwise pay the `createRenderPipelineAsync` latency and skip frames until the
    // pipeline resolves. `WebGPURenderer.compileAsync(scene, camera)` warms the pipeline
    // off the critical path. Same warmup contract as `AxesWebGpuFatLine` and
    // `post-processing-webgpu.tsx`.
    const warmupCancellation = { cancelled: false };
    const renderer = gl as unknown as {
      compileAsync?: (scene: Object3D, camera: Camera) => Promise<unknown>;
    };
    const warmupCompile = renderer.compileAsync;
    if (graphicsBackendThree === 'webgpu' && typeof warmupCompile === 'function') {
      // async-iife: bootstrap — effects cannot be async; the cancellation flag ensures a
      // teardown before resolution is a no-op.
      void (async () => {
        try {
          await Promise.all([
            warmupCompile.call(renderer, gizmoAxes, cameraRig.perspectiveCamera),
            warmupCompile.call(renderer, gizmoAxes, cameraRig.orthographicCamera),
          ]);
        } catch (error) {
          console.error('ViewportGizmoCube pipeline warm-up failed', error);
          return;
        }
        if (warmupCancellation.cancelled) {
          return;
        }
        invalidate();
      })();
    }

    invalidate();

    return () => {
      warmupCancellation.cancelled = true;

      const existing = gizmoRef.current;
      gizmoRef.current = undefined;
      controlsBindingRef.current = undefined;

      if (existing) {
        controlsBinding.detach();
        removeInvalidationListeners();
        existing.dispose();
      }
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- dependencies array is user-provided for custom recreation triggers
  }, [
    gl,
    controls,
    graphicsBackendThree,
    scene,
    serialized.hex,
    theme,
    isHighContrast,
    size,
    container,
    invalidate,
    interactionLock,
    graphicsActor,
    cameraRig,
    ...dependencies,
  ]);

  useGizmoResizeSync(gizmoRef);

  return null;
}
