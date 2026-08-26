import * as React from 'react';
import { act } from '@testing-library/react';
import { createRoot, events as createPointerEvents, extend, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { createActor, fromPromise } from 'xstate';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import CameraControlsImpl from 'camera-controls';
import * as THREE from 'three';
import { ActorBridge } from '#components/geometry/graphics/three/actor-bridge.js';
import { Scene } from '#components/geometry/graphics/three/scene.js';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

vi.mock('#components/geometry/graphics/three/up-direction-handler.js', () => ({
  UpDirectionHandler: () => undefined,
}));

vi.mock('#components/geometry/graphics/three/use-geometry-bounds.js', async () => {
  const three = await import('three');
  const geometryCenter = new three.Vector3(10, 20, 30);
  const geometryBounds = new three.Box3().setFromCenterAndSize(geometryCenter, new three.Vector3(40, 20, 10));

  return {
    useGeometryBounds: () => ({
      geometryRadius: geometryBounds.getBoundingSphere(new three.Sphere()).radius,
      geometryCenter,
      geometryBounds,
    }),
  };
});

vi.mock('#components/geometry/graphics/three/react/lights.js', () => ({
  Lights: () => null,
}));

vi.mock('#components/geometry/graphics/three/react/measure-tool.js', () => ({
  MeasureTool: () => null,
}));

vi.mock('#components/geometry/graphics/three/react/section-contour-fill.js', () => ({
  SectionContourFills: () => null,
}));

vi.mock('#components/geometry/graphics/three/react/section-view-controls.js', () => ({
  SectionViewControls: () => null,
}));

vi.mock('#components/geometry/graphics/three/react/section-view-test-bridge.js', () => ({
  SectionViewTestBridge: () => null,
}));

vi.mock('#components/geometry/graphics/three/react/section-clipping-group.js', () => ({
  SectionClippingGroup: ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
    <group>{children}</group>
  ),
}));

vi.mock('#components/geometry/graphics/three/controls/viewport-gizmo-cube.js', () => ({
  ViewportGizmoCube: () => null,
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeature: () => false,
}));

type SceneSample = {
  readonly camera: THREE.Camera;
  readonly controls: RootState['controls'];
};

function SceneProbe({ onSample }: { readonly onSample: (sample: SceneSample) => void }): undefined {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);

  React.useLayoutEffect(() => {
    onSample({ camera, controls });
  }, [camera, controls, onSample]);

  return undefined;
}

function createStubWebGlRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = Object.create(THREE.WebGLRenderer.prototype) as THREE.WebGLRenderer;
  Object.defineProperties(renderer, {
    dispose: { value: vi.fn() },
    domElement: { value: canvas },
    render: { value: vi.fn() },
    setPixelRatio: { value: vi.fn() },
    setSize: { value: vi.fn() },
    outputColorSpace: { value: '', writable: true },
    toneMapping: { value: 0, writable: true },
    toneMappingExposure: { value: 1, writable: true },
  });
  return renderer;
}

describe('Scene camera lifecycle', () => {
  beforeAll(() => {
    extend({ Group: THREE.Group });
  });

  it('should keep one camera and controls binding through initial Stage framing', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    document.body.append(canvas);

    const root = createRoot(canvas);
    const samples: SceneSample[] = [];
    const graphicsActor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }),
      { input: { defaultCameraFovAngle: 60, graphicsBackendPreference: 'webgl' } },
    );
    graphicsActor.start();

    try {
      await act(async () => {
        await root.configure({
          camera: new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 100_000),
          events: createPointerEvents,
          gl: createStubWebGlRenderer(canvas),
          size: { height: 600, left: 0, top: 0, width: 800 },
        });
        root.render(
          <GraphicsProvider graphicsRef={graphicsActor}>
            <Scene enableZoom zoomSpeed={2}>
              <group />
            </Scene>
            <ActorBridge />
            <SceneProbe
              onSample={(sample) => {
                samples.push(sample);
              }}
            />
          </GraphicsProvider>,
        );
      });

      await expect.poll(() => samples.at(-1)?.controls).toBeInstanceOf(CameraControlsImpl);

      const finalSample = samples.at(-1);
      if (
        !finalSample ||
        !(finalSample.camera instanceof THREE.PerspectiveCamera) ||
        !(finalSample.controls instanceof CameraControlsImpl)
      ) {
        throw new Error('Scene test did not capture CameraControls.');
      }

      const { camera: finalCamera, controls } = finalSample;

      const cameras = new Set(samples.map((sample) => sample.camera));
      const controlsInstances = new Set(samples.map((sample) => sample.controls).filter(Boolean));
      expect(cameras.size).toBe(1);
      expect(controlsInstances.size).toBe(1);
      expect(controls.camera).toBe(finalCamera);

      const expectedTarget = new THREE.Vector3(10, 20, 30);
      const target = controls.getTarget(new THREE.Vector3());
      const { distance } = controls;
      expect(target).toEqual(expectedTarget);
      expect(distance).toBeCloseTo(finalCamera.position.distanceTo(expectedTarget), 10);

      const framedPosition = finalCamera.position.clone();
      const framedZoom = finalCamera.zoom;
      controls.update(1 / 60);
      expect(finalCamera.position.distanceTo(framedPosition)).toBeLessThan(1e-10);
      expect(finalCamera.zoom).toBeCloseTo(framedZoom, 10);
      expect(controls.getTarget(new THREE.Vector3())).toEqual(expectedTarget);

      await expect.poll(() => graphicsActor.getSnapshot().context.cameraPosition).toBeCloseTo(controls.distance, 10);
      const graphicsContext = graphicsActor.getSnapshot().context;
      expect(graphicsContext.cameraFovAngleComputed).toBeCloseTo(finalCamera.getEffectiveFOV(), 10);
      expect(graphicsContext.gridSizesComputed.baseSize).toBeCloseTo(controls.distance, 10);
      expect(graphicsContext.gridSizesComputed.fov).toBeCloseTo(finalCamera.getEffectiveFOV(), 10);
      expect(graphicsContext.gridSizesComputed).not.toMatchObject({ smallSize: 0.1, largeSize: 1 });
    } finally {
      await act(async () => {
        root.unmount();
      });
      graphicsActor.stop();
      canvas.remove();
    }
  });
});
