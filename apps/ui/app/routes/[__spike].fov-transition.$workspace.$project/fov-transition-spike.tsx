import CameraControlsImpl from 'camera-controls';
import { ViewportGizmo } from 'three-viewport-gizmo';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { CanvasProps, RootState } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, RefObject } from 'react';
import type { Geometry } from '@taucad/types';
import { createCameraView, maximumProjectedPixelDelta, perspectiveVerticalSpan } from '@taucad/camera';
import type { CameraBounds, CameraVector } from '@taucad/camera';
import { selectCameraDriverSnapshot } from '@taucad/camera/machine';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import { OrthographicCamera, PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import type { Box3, Euler, Group } from 'three';
import { GltfMesh } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { Lights } from '#components/geometry/graphics/three/react/lights.js';
import { MeasureTool } from '#components/geometry/graphics/three/react/measure-tool.js';
import { SectionClippingGroup } from '#components/geometry/graphics/three/react/section-clipping-group.js';
import { SectionContourFills } from '#components/geometry/graphics/three/react/section-contour-fill.js';
import { SectionViewControls } from '#components/geometry/graphics/three/react/section-view-controls.js';
import { TauCameraControls } from '#components/geometry/graphics/three/controls/tau-camera-controls.js';
import { bindViewportGizmoControls } from '#components/geometry/graphics/three/controls/viewport-gizmo-controls-adapter.js';
import { bindViewportGizmoInvalidationEvents } from '#components/geometry/graphics/three/controls/viewport-gizmo-render-loop.js';
import { ViewportGizmoInteractionLockProvider } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import { createTauR3fGlProp } from '#components/geometry/graphics/three/canvas-three-gl.js';
import { useSectionView } from '#components/geometry/graphics/three/use-section-view.js';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { useGeometryBounds } from '#components/geometry/graphics/three/use-geometry-bounds.js';
import { WebglErrorBoundary } from '#components/geometry/cad/webgl-error-boundary.js';
import { WebglErrorFallback } from '#components/geometry/cad/webgl-fallback.js';
import { mergeGraphicsBackendWithQueryOverride } from '#components/geometry/graphics/graphics-backend.js';
import { Loader } from '#components/ui/loader.js';
import { Button } from '#components/ui/button.js';
import { Slider } from '#components/ui/slider.js';
import {
  GraphicsProvider,
  useGraphics,
  useGraphicsSelector,
  useModelInteractionSelector,
} from '#hooks/use-graphics.js';
import { MeasureControl } from '#components/geometry/cad/measure-control.js';
import { SectionViewControl } from '#components/geometry/cad/section-view-control.js';
import { useCadPreview } from '#hooks/use-cad-preview.js';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';

const initialFov = 60;
const sliderStep = 0.1;
const gizmoSize = 96;
const gizmoContainerSelector = '#fov-transition-spike-viewer';
const initialViewDirection = new Vector3(1, -1, 0.7).normalize();

const getPixelRatio = (): number => {
  const devicePixelRatio = Reflect.get(globalThis, 'devicePixelRatio');
  return Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
};

const toCameraBounds = (bounds: Box3): CameraBounds => ({
  min: [bounds.min.x, bounds.min.y, bounds.min.z],
  max: [bounds.max.x, bounds.max.y, bounds.max.z],
});

const toCameraVector = (vector: Vector3): CameraVector => [vector.x, vector.y, vector.z];

type SpikeCameraConnector = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;

const createSpikeCameraRig = (onUpdate: SpikeCameraConnector): ThreeCameraRig =>
  createThreeCameraRig({
    pixelBudget: 0.25,
    onUpdate,
    initialView: createCameraView({
      requestedVerticalFieldOfView: initialFov,
      perspectiveZoom: 1,
      target: [0, 0, 0],
      direction: toCameraVector(initialViewDirection),
      up: [0, 0, 1],
      verticalSpan: 2,
      viewport: { width: 1, height: 1, pixelRatio: getPixelRatio() },
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    }),
  });

type SpikeDiagnostics = {
  readonly activeCamera: 'orthographic' | 'perspective';
  readonly controlsInstances: number;
  readonly effectiveFov: number;
  readonly endpointDeltaPixels: number | undefined;
  readonly handoffFov: number | undefined;
  readonly direction: CameraVector;
  readonly target: readonly [number, number, number];
  readonly verticalSpan: number;
};

type SpikeHandoffDiagnostics = Readonly<{
  blankFrames: number;
  requestToFrameMilliseconds: number;
  requestToSyncMilliseconds: number;
  staleFrames: number;
}>;

type SpikeCapture = Readonly<{
  byteLength: number;
  projection: 'orthographic' | 'perspective';
}>;

type SpikeCameraActions = Readonly<{
  capture: () => SpikeCapture;
  frame: () => void;
  reset: () => void;
  setVerticalFieldOfView: (verticalFieldOfView: number) => void;
}>;

type SpikeFrameProbeResult = Readonly<{
  frames: number;
  maximumMilliseconds: number;
  meanMilliseconds: number;
  medianMilliseconds: number;
  projection: 'orthographic' | 'perspective';
}>;

const frameProbeWarmupFrames = 30;
const frameProbeMeasuredFrames = 90;
const frameProbeTotalFrames = frameProbeWarmupFrames + frameProbeMeasuredFrames;

const initialDiagnostics: SpikeDiagnostics = {
  activeCamera: 'perspective',
  controlsInstances: 0,
  effectiveFov: initialFov,
  endpointDeltaPixels: undefined,
  handoffFov: undefined,
  direction: toCameraVector(initialViewDirection),
  target: [0, 0, 0],
  verticalSpan: 2,
};

const initialHandoffDiagnostics: SpikeHandoffDiagnostics = {
  blankFrames: 0,
  requestToFrameMilliseconds: 0,
  requestToSyncMilliseconds: 0,
  staleFrames: 0,
};

type PendingHandoff = {
  readonly expectedCamera: ThreeCamera;
  readonly requestStartedAt: number;
  requestToSyncMilliseconds: number;
};

function DedicatedSpikeGizmo({
  controlsRef,
  rig,
  onWarmupChange,
}: {
  // oxlint-disable-next-line typescript/no-restricted-types -- React ref.
  readonly controlsRef: RefObject<CameraControlsImpl | null>;
  readonly rig: ThreeCameraRig;
  readonly onWarmupChange: (isWarm: boolean) => void;
}): undefined {
  const invalidate = useThree((state) => state.invalidate);
  const gizmoRef = useRef<ViewportGizmo | undefined>(undefined);
  const bindingRef = useRef<ReturnType<typeof bindViewportGizmoControls>>(undefined);

  useEffect(() => {
    onWarmupChange(false);
    const container = document.querySelector(gizmoContainerSelector);
    const controls = controlsRef.current;
    if (!(container instanceof HTMLElement) || !controls) {
      return;
    }

    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.top = '12px';
    host.style.right = '12px';
    host.style.zIndex = '10';
    host.style.width = `${gizmoSize}px`;
    host.style.height = `${gizmoSize}px`;
    container.append(host);

    const renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0, 0);
    renderer.setPixelRatio(getPixelRatio());
    renderer.setSize(gizmoSize, gizmoSize, false);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.pointerEvents = 'none';
    host.append(renderer.domElement);

    const gizmo = new ViewportGizmo(rig.activeCamera, renderer, {
      type: 'rounded-cube',
      placement: 'top-right',
      size: gizmoSize,
      container: host,
      background: { enabled: false },
    });
    const binding = bindViewportGizmoControls({ camera: rig.activeCamera, controls, gizmo });
    const removeInvalidationListeners = bindViewportGizmoInvalidationEvents({ gizmo, invalidate });
    gizmoRef.current = gizmo;
    bindingRef.current = binding;
    gizmo.camera = rig.orthographicCamera;
    binding?.setCamera?.(rig.orthographicCamera);
    gizmo.update(false);
    gizmo.render();
    gizmo.camera = rig.perspectiveCamera;
    binding?.setCamera?.(rig.perspectiveCamera);
    gizmo.update(false);
    gizmo.render();
    gizmo.camera = rig.activeCamera;
    binding?.setCamera?.(rig.activeCamera);
    gizmo.update(false);
    gizmo.render();
    onWarmupChange(true);

    return () => {
      gizmoRef.current = undefined;
      bindingRef.current = undefined;
      binding?.detach();
      removeInvalidationListeners();
      gizmo.dispose();
      renderer.dispose();
      host.remove();
    };
  }, [controlsRef, invalidate, onWarmupChange, rig]);

  useFrame(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) {
      return;
    }
    if (gizmo.camera !== rig.activeCamera) {
      gizmo.camera = rig.activeCamera;
      bindingRef.current?.setCamera?.(rig.activeCamera);
      gizmo.update(false);
    }
    gizmo.render();
    if (gizmo.animating) {
      invalidate();
    }
  }, 3);

  return undefined;
}

function ProjectionRig({
  bounds,
  connectorRef,
  controlsRef,
  geometryHash,
  lastMainSceneCameraRef,
  rig,
  upDirection,
  onActionsChange,
  onDiagnostics,
  onHandoffDiagnostics,
  onWarmupChange,
}: {
  readonly bounds: Box3;
  readonly connectorRef: RefObject<SpikeCameraConnector | undefined>;
  // oxlint-disable-next-line typescript/no-restricted-types -- React ref.
  readonly controlsRef: RefObject<CameraControlsImpl | null>;
  readonly geometryHash: string;
  readonly lastMainSceneCameraRef: RefObject<ThreeCamera | undefined>;
  readonly rig: ThreeCameraRig;
  readonly upDirection: 'y' | 'z';
  readonly onActionsChange: (actions: SpikeCameraActions | undefined) => void;
  readonly onDiagnostics: (diagnostics: SpikeDiagnostics) => void;
  readonly onHandoffDiagnostics: (diagnostics: SpikeHandoffDiagnostics) => void;
  readonly onWarmupChange: (isWarm: boolean) => void;
}): undefined {
  const size = useThree((state) => state.size);
  const set = useThree((state) => state.set);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const renderer = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const configuredGeometryRef = useRef<string | undefined>(undefined);
  const synchronizingControlsRef = useRef(false);
  const controlsInstanceRef = useRef<CameraControlsImpl | undefined>(undefined);
  const controlsInstancesRef = useRef(0);
  const pendingHandoffRef = useRef<PendingHandoff | undefined>(undefined);
  const blankFramesRef = useRef(0);
  const staleFramesRef = useRef(0);

  useLayoutEffect(() => {
    Reflect.set(rig.perspectiveCamera, 'manual', true);
    Reflect.set(rig.orthographicCamera, 'manual', true);

    const publish: SpikeCameraConnector = (camera, snapshot) => {
      const { effectiveVerticalFieldOfView: effectiveFov, handoffVerticalFieldOfView: handoffFov, view } = snapshot;
      const controls = controlsRef.current;
      const state = get();

      if (controls && controlsInstanceRef.current !== controls) {
        controlsInstanceRef.current = controls;
        controlsInstancesRef.current += 1;
      }

      if (controls) {
        synchronizingControlsRef.current = true;
        if (controls.camera !== camera) {
          controls.cancel();
          controls.camera = camera;
          controls.mouseButtons.wheel =
            camera instanceof OrthographicCamera ? CameraControlsImpl.ACTION.ZOOM : CameraControlsImpl.ACTION.DOLLY;
          controls.touches.two =
            camera instanceof OrthographicCamera
              ? CameraControlsImpl.ACTION.TOUCH_ZOOM_TRUCK
              : CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK;
          controls.updateCameraUp();
        }
        const { target } = snapshot.view;
        void controls.setLookAt(
          camera.position.x,
          camera.position.y,
          camera.position.z,
          target[0],
          target[1],
          target[2],
          false,
        );
        controls.update(0);
        synchronizingControlsRef.current = false;
      }

      state.raycaster.near = camera.near;
      state.raycaster.far = camera.far;
      if (state.camera !== camera) {
        set({ camera });
      }

      onDiagnostics({
        activeCamera: camera instanceof OrthographicCamera ? 'orthographic' : 'perspective',
        controlsInstances: controlsInstancesRef.current,
        effectiveFov,
        endpointDeltaPixels:
          handoffFov === undefined
            ? undefined
            : maximumProjectedPixelDelta({ view, perspectiveVerticalFieldOfView: handoffFov }),
        handoffFov,
        direction: view.direction,
        target: view.target,
        verticalSpan: view.verticalSpan,
      });
      invalidate();
    };

    connectorRef.current = publish;
    publish(rig.activeCamera, selectCameraDriverSnapshot(rig.actorRef.getSnapshot()));
    return () => {
      if (connectorRef.current === publish) {
        connectorRef.current = undefined;
      }
    };
  }, [connectorRef, controlsRef, get, invalidate, onDiagnostics, rig, set]);

  useLayoutEffect(() => {
    if (bounds.isEmpty() || size.width <= 0 || size.height <= 0) {
      return;
    }

    rig.actorRef.send({
      type: 'setViewport',
      viewport: { width: size.width, height: size.height, pixelRatio: getPixelRatio() },
    });
    if (configuredGeometryRef.current === geometryHash) {
      return;
    }
    rig.actorRef.send({ type: 'setBounds', bounds: toCameraBounds(bounds) });
    rig.actorRef.send({ type: 'frame' });
    rig.actorRef.send({ type: 'saveHome' });
    configuredGeometryRef.current = geometryHash;
  }, [bounds, geometryHash, rig, size.height, size.width]);

  useEffect(() => {
    const { view } = rig.actorRef.getSnapshot().context;
    rig.actorRef.send({
      type: 'setView',
      target: view.target,
      direction: view.direction,
      up: upDirection === 'z' ? [0, 0, 1] : [0, 1, 0],
      verticalSpan: view.verticalSpan,
    });
  }, [rig, upDirection]);

  useEffect(() => {
    onActionsChange({
      capture: () => {
        renderer.render(scene, rig.activeCamera);
        const dataUrl = renderer.domElement.toDataURL('image/png');
        const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
        return {
          byteLength: globalThis.atob(payload).length,
          projection: rig.activeCamera instanceof OrthographicCamera ? 'orthographic' : 'perspective',
        };
      },
      frame: () => {
        rig.actorRef.send({ type: 'frame' });
      },
      reset: () => {
        rig.actorRef.send({ type: 'reset' });
      },
      setVerticalFieldOfView: (verticalFieldOfView) => {
        const requestStartedAt = performance.now();
        lastMainSceneCameraRef.current = undefined;
        pendingHandoffRef.current = {
          expectedCamera: verticalFieldOfView === 0 ? rig.orthographicCamera : rig.perspectiveCamera,
          requestStartedAt,
          requestToSyncMilliseconds: 0,
        };
        rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView });
        const pendingHandoff = pendingHandoffRef.current;
        pendingHandoff.requestToSyncMilliseconds = performance.now() - requestStartedAt;
        invalidate();
      },
    });
    return () => {
      onActionsChange(undefined);
    };
  }, [invalidate, lastMainSceneCameraRef, onActionsChange, renderer, rig, scene]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    const handleControlsUpdate = (): void => {
      if (synchronizingControlsRef.current) {
        return;
      }
      const { camera } = controls;
      if (!(camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera)) {
        return;
      }
      const target = controls.getTarget(new Vector3(), false);
      const offset = camera.position.clone().sub(target);
      if (offset.lengthSq() <= 1e-12) {
        return;
      }
      const verticalSpan =
        camera instanceof OrthographicCamera
          ? (camera.top - camera.bottom) / camera.zoom
          : perspectiveVerticalSpan({
              distance: offset.length(),
              verticalFieldOfView: camera.fov,
              zoom: camera.zoom,
            });
      rig.actorRef.send({
        type: 'setView',
        target: toCameraVector(target),
        direction: toCameraVector(offset.normalize()),
        up: toCameraVector(camera.up),
        verticalSpan,
        ...(camera instanceof PerspectiveCamera ? { perspectiveZoom: camera.zoom } : {}),
      });
    };

    controls.addEventListener('update', handleControlsUpdate);
    return () => {
      controls.removeEventListener('update', handleControlsUpdate);
    };
  }, [controlsRef, rig]);

  useEffect(() => {
    if (bounds.isEmpty()) {
      return;
    }

    let cancelled = false;
    onWarmupChange(false);
    const { compileAsync } = renderer as unknown as {
      compileAsync?: (scene: RootState['scene'], camera: PerspectiveCamera | OrthographicCamera) => Promise<unknown>;
    };
    if (typeof compileAsync !== 'function') {
      onWarmupChange(true);
      return;
    }

    // async-iife: bootstrap both native endpoint shader variants before enabling the slider.
    void (async (): Promise<void> => {
      const initialVerticalFieldOfView = rig.actorRef.getSnapshot().context.view.requestedVerticalFieldOfView;
      try {
        rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
        for (const camera of [rig.perspectiveCamera, rig.orthographicCamera]) {
          // CompileAsync does not perform render()'s renderer-coordinate-system camera preparation.
          // Without this, WebGPU can cull the dormant orthographic endpoint during warmup and flash
          // an empty main scene on its first real render.
          camera.coordinateSystem = renderer.coordinateSystem;
          camera.updateProjectionMatrix();
        }
        await compileAsync.call(renderer, scene, rig.perspectiveCamera);
        await compileAsync.call(renderer, scene, rig.orthographicCamera);
        renderer.render(scene, rig.orthographicCamera);
        rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: sliderStep });
        renderer.render(scene, rig.perspectiveCamera);
      } catch {
        // Rendering remains usable through the synchronous fallback path.
      } finally {
        rig.actorRef.send({
          type: 'setVerticalFieldOfView',
          verticalFieldOfView: initialVerticalFieldOfView,
        });
        renderer.render(scene, rig.activeCamera);
      }
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup may run while compilation is pending.
      if (!cancelled) {
        onWarmupChange(true);
        invalidate();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bounds, geometryHash, invalidate, onWarmupChange, renderer, rig, scene]);

  useFrame((state) => {
    const pendingHandoff = pendingHandoffRef.current;
    if (!pendingHandoff) {
      return;
    }

    const controls = controlsRef.current;
    const mainSceneRendered = lastMainSceneCameraRef.current === pendingHandoff.expectedCamera;
    const cameraStateIsCurrent =
      state.camera === pendingHandoff.expectedCamera &&
      rig.activeCamera === pendingHandoff.expectedCamera &&
      controls?.camera === pendingHandoff.expectedCamera;
    if (!mainSceneRendered) {
      blankFramesRef.current += 1;
    }
    if (!cameraStateIsCurrent) {
      staleFramesRef.current += 1;
    }
    onHandoffDiagnostics({
      blankFrames: blankFramesRef.current,
      requestToFrameMilliseconds: performance.now() - pendingHandoff.requestStartedAt,
      requestToSyncMilliseconds: pendingHandoff.requestToSyncMilliseconds,
      staleFrames: staleFramesRef.current,
    });
    pendingHandoffRef.current = undefined;
  }, 4);

  return undefined;
}

function SpikeInteractionTools({ upDirection }: { readonly upDirection: 'y' | 'z' }): React.JSX.Element {
  const graphicsActor = useGraphics();
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const selectedPlaneId = useGraphicsSelector((state) => state.context.selectedSectionViewId);
  const rotation = useGraphicsSelector((state) => state.context.sectionViewRotation);
  const pivot = useGraphicsSelector((state) => state.context.sectionViewPivot);
  const availablePlanes = useGraphicsSelector((state) => state.context.availableSectionViews);
  const planeName = useGraphicsSelector((state) => state.context.planeName);
  const hoveredSectionViewId = useGraphicsSelector((state) => state.context.hoveredSectionViewId);

  const handleSelectPlane = (planeId: 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy'): void => {
    const isInverse = planeId === 'yx' || planeId === 'zx' || planeId === 'zy';
    const base = planeId === 'xy' || planeId === 'yx' ? 'xy' : planeId === 'xz' || planeId === 'zx' ? 'xz' : 'yz';
    graphicsActor.send({ type: 'selectSectionView', payload: base });
    graphicsActor.send({ type: 'setSectionViewDirection', payload: isInverse ? -1 : 1 });
  };

  return (
    <>
      <MeasureTool />
      <SectionViewControls
        isActive={isSectionViewActive}
        selectedPlaneId={selectedPlaneId}
        availablePlanes={availablePlanes}
        rotation={rotation}
        pivot={pivot}
        planeName={planeName}
        hoveredSectionViewId={hoveredSectionViewId}
        upDirection={upDirection}
        onSelectPlane={handleSelectPlane}
        onHover={(planeId) => {
          graphicsActor.send({ type: 'setHoveredSectionView', payload: planeId });
        }}
        onSetRotation={(nextRotation: Euler) => {
          graphicsActor.send({
            type: 'setSectionViewRotation',
            payload: [nextRotation.x, nextRotation.y, nextRotation.z],
          });
        }}
        onSetPivot={(nextPivot) => {
          graphicsActor.send({ type: 'setSectionViewPivot', payload: nextPivot });
        }}
        onTransformDragStart={() => {
          graphicsActor.send({
            type: 'beginViewerModelHoverSuppression',
            reason: 'sectionViewTransform',
            source: 'viewer',
          });
        }}
        onTransformDragMove={() => {
          graphicsActor.send({ type: 'markModelPointerGestureMoved' });
        }}
        onTransformDragEnd={() => {
          graphicsActor.send({
            type: 'endViewerModelHoverSuppression',
            reason: 'sectionViewTransform',
            source: 'viewer',
          });
        }}
      />
    </>
  );
}

function SpikeScene({
  connectorRef,
  controlsRef,
  geometry,
  lastMainSceneCameraRef,
  rig,
  upDirection,
  onActionsChange,
  onCameraWarmupChange,
  onDiagnostics,
  onGizmoWarmupChange,
  onHandoffDiagnostics,
}: {
  readonly connectorRef: RefObject<SpikeCameraConnector | undefined>;
  // oxlint-disable-next-line typescript/no-restricted-types -- React ref.
  readonly controlsRef: RefObject<CameraControlsImpl | null>;
  readonly geometry: Extract<Geometry, { format: 'gltf' }>;
  readonly lastMainSceneCameraRef: RefObject<ThreeCamera | undefined>;
  readonly rig: ThreeCameraRig;
  readonly upDirection: 'y' | 'z';
  readonly onActionsChange: (actions: SpikeCameraActions | undefined) => void;
  readonly onCameraWarmupChange: (isWarm: boolean) => void;
  readonly onDiagnostics: (diagnostics: SpikeDiagnostics) => void;
  readonly onGizmoWarmupChange: (isWarm: boolean) => void;
  readonly onHandoffDiagnostics: (diagnostics: SpikeHandoffDiagnostics) => void;
}): React.JSX.Element {
  const outerRef = useRef<Group>(null);
  const innerRef = useRef<Group>(null);
  const { geometryBounds, geometryRadius } = useGeometryBounds(innerRef, outerRef);
  const sectionView = useSectionView();

  return (
    <ViewportGizmoInteractionLockProvider>
      <TauCameraControls
        ref={controlsRef}
        makeDefault
        dollySpeed={1}
        truckSpeed={2}
        smoothTime={0}
        draggingSmoothTime={0}
      />
      <SpikeInteractionTools upDirection={upDirection} />
      <group ref={outerRef}>
        <SectionClippingGroup
          enableLines={sectionView.enableLines}
          enableMesh={sectionView.enableMesh}
          enabled={sectionView.isActive}
          innerRef={innerRef}
          plane={sectionView.plane}
        >
          <group ref={innerRef}>
            <GltfMesh
              key={geometry.hash}
              gltfFile={geometry.content}
              geometryHash={geometry.hash}
              enableMatcap={false}
              enableSurfaces
              enableLines
            />
          </group>
        </SectionClippingGroup>
        <SectionContourFills
          enabled={sectionView.isActive && sectionView.enableMesh}
          innerRef={innerRef}
          plane={sectionView.plane}
          stripeFrequency={sectionView.stripeFrequency}
          stripeWidth={sectionView.stripeWidth}
        />
      </group>
      <Lights sceneRadius={geometryRadius} environmentPreset='performance' upDirection={upDirection} />
      <ProjectionRig
        bounds={geometryBounds}
        connectorRef={connectorRef}
        controlsRef={controlsRef}
        geometryHash={geometry.hash}
        lastMainSceneCameraRef={lastMainSceneCameraRef}
        rig={rig}
        upDirection={upDirection}
        onActionsChange={onActionsChange}
        onDiagnostics={onDiagnostics}
        onHandoffDiagnostics={onHandoffDiagnostics}
        onWarmupChange={onCameraWarmupChange}
      />
      {geometryRadius > 0 ? (
        <DedicatedSpikeGizmo controlsRef={controlsRef} rig={rig} onWarmupChange={onGizmoWarmupChange} />
      ) : null}
    </ViewportGizmoInteractionLockProvider>
  );
}

function SpikeMainScene({
  lastMainSceneCameraRef,
}: {
  readonly lastMainSceneCameraRef: RefObject<ThreeCamera | undefined>;
}): undefined {
  useFrame((state) => {
    state.gl.render(state.scene, state.camera);
    if (state.camera instanceof PerspectiveCamera || state.camera instanceof OrthographicCamera) {
      lastMainSceneCameraRef.current = state.camera;
    }
  }, 1);

  return undefined;
}

function SpikeFrameProbe({
  sequence,
  onResult,
}: {
  readonly sequence: number;
  readonly onResult: (result: SpikeFrameProbeResult) => void;
}): undefined {
  const invalidate = useThree((state) => state.invalidate);
  const remainingRef = useRef(0);
  const samplesRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (sequence === 0) {
      return;
    }
    remainingRef.current = frameProbeTotalFrames;
    samplesRef.current = [];
    invalidate();
  }, [invalidate, sequence]);

  useFrame(() => {
    if (remainingRef.current > 0) {
      startedAtRef.current = performance.now();
    }
  }, -2);

  useFrame((state) => {
    if (remainingRef.current <= 0) {
      return;
    }
    const duration = performance.now() - startedAtRef.current;
    if (remainingRef.current <= frameProbeMeasuredFrames) {
      samplesRef.current.push(duration);
    }
    remainingRef.current -= 1;
    if (remainingRef.current > 0) {
      invalidate();
      return;
    }
    const samples = samplesRef.current;
    const sortedSamples = samples.toSorted((left, right) => left - right);
    const medianIndex = Math.floor(sortedSamples.length / 2);
    const upperMedian = sortedSamples.at(medianIndex) ?? 0;
    const lowerMedian = sortedSamples.at(medianIndex - 1) ?? upperMedian;
    onResult({
      frames: samples.length,
      maximumMilliseconds: Math.max(...samples),
      meanMilliseconds: samples.reduce((total, sample) => total + sample, 0) / samples.length,
      medianMilliseconds: sortedSamples.length % 2 === 0 ? (lowerMedian + upperMedian) / 2 : upperMedian,
      projection: state.camera instanceof OrthographicCamera ? 'orthographic' : 'perspective',
    });
  }, 4);

  return undefined;
}

function ActiveSpikeCanvas({
  backend,
  connectorRef,
  geometry,
  rig,
  upDirection,
  onActionsChange,
  onDiagnostics,
  onFrameProbeResult,
  onHandoffDiagnostics,
  probeSequence,
  onWarmupChange,
}: {
  readonly backend: ResolvedGraphicsBackend;
  readonly connectorRef: RefObject<SpikeCameraConnector | undefined>;
  readonly geometry: Extract<Geometry, { format: 'gltf' }>;
  readonly rig: ThreeCameraRig;
  readonly upDirection: 'y' | 'z';
  readonly onActionsChange: (actions: SpikeCameraActions | undefined) => void;
  readonly onDiagnostics: (diagnostics: SpikeDiagnostics) => void;
  readonly onFrameProbeResult: (result: SpikeFrameProbeResult) => void;
  readonly onHandoffDiagnostics: (diagnostics: SpikeHandoffDiagnostics) => void;
  readonly probeSequence: number;
  readonly onWarmupChange: (isWarm: boolean) => void;
}): React.JSX.Element {
  const controlsRef = useRef<CameraControlsImpl>(null);
  const lastMainSceneCameraRef = useRef<ThreeCamera | undefined>(undefined);
  const [isCameraWarm, setIsCameraWarm] = useState(false);
  const [isGizmoWarm, setIsGizmoWarm] = useState(false);
  const glProperty: CanvasProps['gl'] = useMemo(() => createTauR3fGlProp(backend), [backend]);
  const handleCreated = useCallback((state: RootState): void => {
    state.gl.toneMappingExposure = 1;
  }, []);
  useEffect(() => {
    onWarmupChange(isCameraWarm && isGizmoWarm);
  }, [isCameraWarm, isGizmoWarm, onWarmupChange]);

  return (
    <Canvas
      camera={rig.perspectiveCamera}
      gl={glProperty}
      dpr={getPixelRatio()}
      frameloop='demand'
      className='bg-background'
      onCreated={handleCreated}
    >
      <ThreeGraphicsBackendProvider value={backend}>
        <SpikeScene
          connectorRef={connectorRef}
          controlsRef={controlsRef}
          geometry={geometry}
          lastMainSceneCameraRef={lastMainSceneCameraRef}
          rig={rig}
          upDirection={upDirection}
          onActionsChange={onActionsChange}
          onCameraWarmupChange={setIsCameraWarm}
          onDiagnostics={onDiagnostics}
          onGizmoWarmupChange={setIsGizmoWarm}
          onHandoffDiagnostics={onHandoffDiagnostics}
        />
        <SpikeMainScene lastMainSceneCameraRef={lastMainSceneCameraRef} />
        <SpikeFrameProbe sequence={probeSequence} onResult={onFrameProbeResult} />
      </ThreeGraphicsBackendProvider>
    </Canvas>
  );
}

function SpikeCanvas(
  properties: Omit<ComponentProps<typeof ActiveSpikeCanvas>, 'connectorRef' | 'rig'>,
): React.JSX.Element {
  const [rig, setRig] = useState<ThreeCameraRig | undefined>(undefined);
  const connectorRef = useRef<SpikeCameraConnector | undefined>(undefined);

  useEffect(() => {
    const nextRig = createSpikeCameraRig((camera, snapshot) => {
      connectorRef.current?.(camera, snapshot);
    });
    nextRig.actorRef.start();
    setRig(nextRig);
    return () => {
      nextRig.dispose();
    };
  }, []);

  if (!rig) {
    return <div className='size-full bg-background' />;
  }

  return <ActiveSpikeCanvas {...properties} connectorRef={connectorRef} rig={rig} />;
}

function ResolvedSpikeViewer({
  geometry,
  upDirection,
  onActionsChange,
  onDiagnostics,
  onFrameProbeResult,
  onHandoffDiagnostics,
  probeSequence,
  onWarmupChange,
}: {
  readonly geometry: Extract<Geometry, { format: 'gltf' }>;
  readonly upDirection: 'y' | 'z';
  readonly onActionsChange: (actions: SpikeCameraActions | undefined) => void;
  readonly onDiagnostics: (diagnostics: SpikeDiagnostics) => void;
  readonly onFrameProbeResult: (result: SpikeFrameProbeResult) => void;
  readonly onHandoffDiagnostics: (diagnostics: SpikeHandoffDiagnostics) => void;
  readonly probeSequence: number;
  readonly onWarmupChange: (isWarm: boolean) => void;
}): React.JSX.Element {
  const machineResolvedBackend = useGraphicsSelector((state) => state.context.resolvedGraphicsBackend);
  const graphicsPreference = useGraphicsSelector((state) => state.context.graphicsBackendPreference);
  const gpuAvailable = useGraphicsSelector((state) => state.context.webGpuAvailable);
  const backend = useMemo(
    () => mergeGraphicsBackendWithQueryOverride(machineResolvedBackend, graphicsPreference, gpuAvailable),
    [gpuAvailable, graphicsPreference, machineResolvedBackend],
  );

  return (
    <div data-graphics-backend={backend} className='contents'>
      <WebglErrorBoundary fallback={(properties) => <WebglErrorFallback {...properties} />}>
        <SpikeCanvas
          key={backend}
          backend={backend}
          geometry={geometry}
          upDirection={upDirection}
          onActionsChange={onActionsChange}
          onDiagnostics={onDiagnostics}
          onFrameProbeResult={onFrameProbeResult}
          onHandoffDiagnostics={onHandoffDiagnostics}
          probeSequence={probeSequence}
          onWarmupChange={onWarmupChange}
        />
      </WebglErrorBoundary>
    </div>
  );
}

const formatFov = (fov: number): string => (Number.isInteger(fov) ? String(fov) : fov.toFixed(2));

function SpikeFeaturePanel({
  actions,
  capture,
  target,
  upDirection,
  onCapture,
  onProbe,
  onUpDirectionChange,
}: {
  readonly actions: SpikeCameraActions | undefined;
  readonly capture: SpikeCapture | undefined;
  readonly target: readonly [number, number, number];
  readonly upDirection: 'y' | 'z';
  readonly onCapture: (capture: SpikeCapture) => void;
  readonly onProbe: () => void;
  readonly onUpDirectionChange: () => void;
}): React.JSX.Element {
  const graphicsActor = useGraphics();
  const isMeasureActive = useGraphicsSelector((state) => state.matches({ operational: 'measure' }));
  const measurementCount = useGraphicsSelector((state) => state.context.measurements.length);
  const isSectionActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const selectedSection = useGraphicsSelector((state) => state.context.selectedSectionViewId);
  const selectedComponentCount = useModelInteractionSelector((state) =>
    Object.values(state.context.unitsById).reduce((count, unit) => count + unit.selectedComponentIds.length, 0),
  );

  return (
    <div
      id='fov-spike-features'
      data-capture-bytes={capture?.byteLength}
      data-capture-projection={capture?.projection}
      data-measure-active={isMeasureActive}
      data-measurement-count={measurementCount}
      data-section-active={isSectionActive}
      data-section-plane={selectedSection}
      data-selected-component-count={selectedComponentCount}
      className='shadow-lg absolute top-4 left-4 z-10 flex flex-wrap gap-1 rounded-xl border bg-background/90 p-2 backdrop-blur'
    >
      <MeasureControl />
      <SectionViewControl />
      <Button
        variant='outline'
        size='sm'
        aria-label='Select XY section plane'
        onClick={() => {
          graphicsActor.send({ type: 'setSectionViewActive', payload: true });
          graphicsActor.send({ type: 'selectSectionView', payload: 'xy' });
          graphicsActor.send({ type: 'setSectionViewPivot', payload: [target[0], target[1], target[2]] });
        }}
      >
        XY section
      </Button>
      <Button variant='outline' size='sm' disabled={!actions} onClick={actions?.frame}>
        Frame
      </Button>
      <Button variant='outline' size='sm' disabled={!actions} onClick={actions?.reset}>
        Reset
      </Button>
      <Button variant='outline' size='sm' disabled={!actions} onClick={onUpDirectionChange}>
        {upDirection.toUpperCase()} up
      </Button>
      <Button
        variant='outline'
        size='sm'
        disabled={!actions}
        onClick={() => {
          if (actions) {
            onCapture(actions.capture());
          }
        }}
      >
        Capture
      </Button>
      <Button variant='outline' size='sm' disabled={!actions} onClick={onProbe}>
        Probe
      </Button>
    </div>
  );
}

export default function FovTransitionSpike(): React.JSX.Element {
  const { error, geometry, graphicsRef, status } = useCadPreview();
  const [fov, setFov] = useState(initialFov);
  const [isWarm, setIsWarm] = useState(false);
  const [upDirection, setUpDirection] = useState<'y' | 'z'>('z');
  const [actions, setActions] = useState<SpikeCameraActions | undefined>(undefined);
  const [capture, setCapture] = useState<SpikeCapture | undefined>(undefined);
  const [frameProbe, setFrameProbe] = useState<SpikeFrameProbeResult | undefined>(undefined);
  const [probeSequence, setProbeSequence] = useState(0);
  const [diagnostics, setDiagnostics] = useState<SpikeDiagnostics>(initialDiagnostics);
  const [handoffDiagnostics, setHandoffDiagnostics] = useState<SpikeHandoffDiagnostics>(initialHandoffDiagnostics);
  const handleActionsChange = useCallback((nextActions: SpikeCameraActions | undefined): void => {
    setActions(() => nextActions);
  }, []);
  const handleFovChange = useCallback(
    (values: number[]): void => {
      const nextFov = values[0];
      if (nextFov !== undefined) {
        const normalizedFov = Math.round(nextFov * 100) / 100;
        actions?.setVerticalFieldOfView(normalizedFov);
        setFov(normalizedFov);
      }
    },
    [actions],
  );

  const gltfGeometry = geometry?.format === 'gltf' ? geometry : undefined;
  const endpointDelta = diagnostics.endpointDeltaPixels?.toFixed(3) ?? '—';
  const handoffFov = diagnostics.handoffFov?.toFixed(5) ?? '—';

  return (
    <GraphicsProvider graphicsRef={graphicsRef}>
      <main
        id='fov-transition-spike-viewer'
        data-active-camera={diagnostics.activeCamera}
        data-camera-count={2}
        data-controls-instances={diagnostics.controlsInstances}
        data-direction={diagnostics.direction.join(',')}
        data-effective-fov={diagnostics.effectiveFov}
        data-endpoint-delta-px={diagnostics.endpointDeltaPixels}
        data-gizmo-count={gltfGeometry ? 1 : 0}
        data-handoff-fov={diagnostics.handoffFov}
        data-handoff-blank-frames={handoffDiagnostics.blankFrames}
        data-handoff-request-to-frame-ms={handoffDiagnostics.requestToFrameMilliseconds}
        data-handoff-request-to-sync-ms={handoffDiagnostics.requestToSyncMilliseconds}
        data-handoff-stale-frames={handoffDiagnostics.staleFrames}
        data-post-processing='off'
        data-probe-frame-count={frameProbe?.frames}
        data-probe-max-ms={frameProbe?.maximumMilliseconds}
        data-probe-mean-ms={frameProbe?.meanMilliseconds}
        data-probe-median-ms={frameProbe?.medianMilliseconds}
        data-probe-projection={frameProbe?.projection}
        data-target={diagnostics.target.join(',')}
        data-up-direction={upDirection}
        data-vertical-span={diagnostics.verticalSpan}
        data-warmed={isWarm}
        className='relative h-dvh min-h-96 w-full overflow-hidden bg-background'
      >
        {gltfGeometry ? (
          <ResolvedSpikeViewer
            geometry={gltfGeometry}
            upDirection={upDirection}
            onActionsChange={handleActionsChange}
            onDiagnostics={setDiagnostics}
            onFrameProbeResult={setFrameProbe}
            onHandoffDiagnostics={setHandoffDiagnostics}
            probeSequence={probeSequence}
            onWarmupChange={setIsWarm}
          />
        ) : status === 'error' || error ? (
          <div role='alert' className='flex size-full items-center justify-center p-8 text-center text-destructive'>
            {error?.message ?? 'The project did not produce glTF geometry.'}
          </div>
        ) : (
          <div role='status' aria-label='Loading racing drone' className='flex size-full items-center justify-center'>
            <Loader className='size-16 text-primary' />
          </div>
        )}

        {gltfGeometry ? (
          <SpikeFeaturePanel
            actions={actions}
            capture={capture}
            target={diagnostics.target}
            upDirection={upDirection}
            onCapture={setCapture}
            onProbe={() => {
              setFrameProbe(undefined);
              setProbeSequence((sequence) => sequence + 1);
            }}
            onUpDirectionChange={() => {
              const nextUpDirection = upDirection === 'z' ? 'y' : 'z';
              graphicsRef.send({ type: 'setUpDirection', payload: nextUpDirection });
              setUpDirection(nextUpDirection);
            }}
          />
        ) : null}

        <div className='pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4'>
          <div className='shadow-lg pointer-events-auto flex w-full max-w-xl flex-col gap-2 rounded-xl border bg-background/90 px-4 py-3 backdrop-blur'>
            <div className='flex items-center gap-3'>
              <span className='text-xs text-muted-foreground'>Orthographic</span>
              <Slider
                aria-label='Field of view'
                disabled={!isWarm}
                min={0}
                max={90}
                step={sliderStep}
                value={[fov]}
                onKeyDown={(event) => {
                  event.stopPropagation();
                }}
                onValueChange={handleFovChange}
              />
              <span className='text-xs text-muted-foreground'>Perspective</span>
              <output className='w-14 text-right font-mono text-sm font-semibold'>{formatFov(fov)}°</output>
            </div>
            <div className='flex justify-between font-mono text-[10px] text-muted-foreground'>
              <span>{diagnostics.activeCamera}</span>
              <span>
                handoff {handoffFov}° / {endpointDelta} physical px
              </span>
              <span>
                sync {handoffDiagnostics.requestToSyncMilliseconds.toFixed(2)} ms / frame{' '}
                {handoffDiagnostics.requestToFrameMilliseconds.toFixed(2)} ms / blank {handoffDiagnostics.blankFrames} /
                stale {handoffDiagnostics.staleFrames}
              </span>
            </div>
          </div>
        </div>
      </main>
    </GraphicsProvider>
  );
}
