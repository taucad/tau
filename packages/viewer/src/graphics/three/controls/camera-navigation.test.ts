import { describe, expect, it } from 'vitest';
import CameraControlsImpl from 'camera-controls';
import {
  Box3,
  MathUtils,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import {
  applyCameraNavigationStep,
  cameraNavigationSteps,
  cameraOrbitStepRadians,
} from '#graphics/three/controls/camera-navigation.js';
import type { CameraNavigationStep } from '#graphics/three/controls/camera-navigation.js';

/* eslint-disable @typescript-eslint/naming-convention -- `camera-controls` requires this exact install shape. */
CameraControlsImpl.install({
  THREE: {
    Box3,
    MathUtils: { clamp: MathUtils.clamp },
    Matrix4,
    Quaternion,
    Raycaster,
    Sphere,
    Spherical,
    Vector2,
    Vector3,
    Vector4,
  },
});
/* eslint-enable @typescript-eslint/naming-convention -- The install shape ends here. */

const makeControls = (projection: 'perspective' | 'orthographic'): CameraControlsImpl => {
  const camera =
    projection === 'perspective' ? new PerspectiveCamera(60, 4 / 3, 0.1, 1000) : new OrthographicCamera(-4, 4, 3, -3);
  camera.up.set(0, 0, 1);
  const controls = new CameraControlsImpl(camera);
  controls.updateCameraUp();
  void controls.setLookAt(10, -10, 7, 0, 0, 0, false);
  controls.update(0);
  return controls;
};

type Reading = Readonly<{
  azimuth: number;
  polar: number;
  distance: number;
  zoom: number;
  target: Vector3;
}>;

const read = (controls: CameraControlsImpl): Reading => {
  controls.update(0);
  return {
    azimuth: controls.azimuthAngle,
    polar: controls.polarAngle,
    distance: controls.distance,
    zoom: controls.camera.zoom,
    target: controls.getTarget(new Vector3()),
  };
};

const epsilon = 1e-6;

/** Which of orbit, pan and zoom a change is: the same classification the acceptance rows use. */
const classify = (before: Reading, after: Reading): 'orbit' | 'pan' | 'zoom' | 'none' | 'mixed' => {
  const rotated = Math.abs(after.azimuth - before.azimuth) > epsilon || Math.abs(after.polar - before.polar) > epsilon;
  const panned = after.target.distanceTo(before.target) > epsilon;
  const zoomed = Math.abs(after.distance - before.distance) > epsilon || Math.abs(after.zoom - before.zoom) > epsilon;
  const changes = [rotated && 'orbit', panned && 'pan', zoomed && 'zoom'].filter(Boolean);
  if (changes.length === 0) {
    return 'none';
  }
  return changes.length === 1 ? (changes[0] as 'orbit' | 'pan' | 'zoom') : 'mixed';
};

describe('applyCameraNavigationStep', () => {
  it('names every step once', () => {
    expect(cameraNavigationSteps.map((step) => `${step.kind}:${step.direction}`)).toEqual([
      'orbit:left',
      'orbit:right',
      'orbit:up',
      'orbit:down',
      'pan:left',
      'pan:right',
      'pan:up',
      'pan:down',
      'zoom:in',
      'zoom:out',
    ]);
  });

  describe.each(['perspective', 'orthographic'] as const)('in %s', (projection) => {
    it.each(cameraNavigationSteps)('$kind $direction changes only its own gesture', (step) => {
      const controls = makeControls(projection);
      const before = read(controls);
      expect(applyCameraNavigationStep({ controls, step })).toBe(true);
      expect(classify(before, read(controls))).toBe(step.kind);
    });
  });

  it('orbits by a fixed angle, left and right in opposite directions', () => {
    const controls = makeControls('perspective');
    const start = read(controls).azimuth;
    applyCameraNavigationStep({
      controls,
      step: { kind: 'orbit', direction: 'left' },
    });
    const left = read(controls).azimuth;
    expect(Math.abs(left - start)).toBeCloseTo(cameraOrbitStepRadians);
    applyCameraNavigationStep({
      controls,
      step: { kind: 'orbit', direction: 'right' },
    });
    applyCameraNavigationStep({
      controls,
      step: { kind: 'orbit', direction: 'right' },
    });
    expect(Math.sign(read(controls).azimuth - start)).toBe(-Math.sign(left - start));
  });

  it('zooms in toward the target and out away from it, in both projections', () => {
    const perspective = makeControls('perspective');
    const { distance } = read(perspective);
    applyCameraNavigationStep({
      controls: perspective,
      step: { kind: 'zoom', direction: 'in' },
    });
    expect(read(perspective).distance).toBeLessThan(distance);
    applyCameraNavigationStep({
      controls: perspective,
      step: { kind: 'zoom', direction: 'out' },
    });
    expect(read(perspective).distance).toBeCloseTo(distance);

    const orthographic = makeControls('orthographic');
    const { zoom } = read(orthographic);
    applyCameraNavigationStep({
      controls: orthographic,
      step: { kind: 'zoom', direction: 'in' },
    });
    expect(read(orthographic).zoom).toBeGreaterThan(zoom);
  });

  it('pans by a share of the visible height, so the step suits any model size', () => {
    const near = makeControls('perspective');
    const far = makeControls('perspective');
    void far.dollyTo(near.distance * 10, false);
    const pan: CameraNavigationStep = { kind: 'pan', direction: 'left' };
    const nearStart = read(near).target;
    const farStart = read(far).target;
    applyCameraNavigationStep({ controls: near, step: pan });
    applyCameraNavigationStep({ controls: far, step: pan });
    const nearMove = read(near).target.distanceTo(nearStart);
    expect(read(far).target.distanceTo(farStart)).toBeCloseTo(nearMove * 10);
  });

  it('does nothing while the controls are disabled, or when panning or zooming is off', () => {
    const controls = makeControls('perspective');
    const before = read(controls);
    controls.enabled = false;
    expect(
      applyCameraNavigationStep({
        controls,
        step: { kind: 'orbit', direction: 'up' },
      }),
    ).toBe(false);
    controls.enabled = true;
    expect(
      applyCameraNavigationStep({
        controls,
        step: { kind: 'pan', direction: 'up' },
        enablePan: false,
      }),
    ).toBe(false);
    expect(
      applyCameraNavigationStep({
        controls,
        step: { kind: 'zoom', direction: 'in' },
        enableZoom: false,
      }),
    ).toBe(false);
    expect(classify(before, read(controls))).toBe('none');
  });
});
