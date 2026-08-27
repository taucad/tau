import { OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraView, frameCameraBounds, maximumProjectedPixelDelta } from '@taucad/camera';
import { selectCameraDriverSnapshot, selectCameraProjection } from '@taucad/camera/machine';
import { createThreeCameraRig, readThreeCameraState } from '#camera.js';

const initialView = createCameraView({
  requestedVerticalFieldOfView: 60,
  perspectiveZoom: 1,
  target: [35, -20, 12],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 600,
  viewport: { width: 1536, height: 900, pixelRatio: 2 },
  bounds: { min: [-220, -180, -55], max: [220, 180, 55] },
});

describe('createThreeCameraRig', () => {
  it('reads complete perspective and orthographic camera state', () => {
    const target = new Vector3(1, 2, 3);
    const perspective = new PerspectiveCamera(52, 16 / 9, 0.2, 900);
    perspective.position.set(8, -6, 4);
    perspective.up.set(0, 0, 1);
    perspective.zoom = 1.4;
    perspective.lookAt(target);
    perspective.rotateZ(Math.PI / 8);
    perspective.updateMatrixWorld(true);

    const perspectiveState = readThreeCameraState({ camera: perspective, target });
    expect(perspectiveState.position).toEqual([8, -6, 4]);
    expect(perspectiveState.target).toEqual([1, 2, 3]);
    expect(perspectiveState.projection).toEqual({
      kind: 'perspective',
      verticalFieldOfView: 52,
      zoom: 1.4,
    });
    expect(perspectiveState.clipping).toEqual({ near: 0.2, far: 900 });
    expect(perspectiveState.aspect).toBeCloseTo(16 / 9, 12);
    expect(perspectiveState.up).not.toEqual([0, 0, 1]);

    const orthographic = new OrthographicCamera(-8, 8, 4.5, -4.5, 0.5, 500);
    orthographic.position.copy(perspective.position);
    orthographic.quaternion.copy(perspective.quaternion);
    orthographic.zoom = 2;
    orthographic.updateMatrixWorld(true);
    const orthographicState = readThreeCameraState({ camera: orthographic, target });
    expect(orthographicState.projection).toEqual({ kind: 'orthographic', verticalSpan: 9, zoom: 2 });
    expect(orthographicState.aspect).toBeCloseTo(16 / 9, 12);
  });

  it('synchronizes persistent native endpoint cameras', () => {
    const rig = createThreeCameraRig({ initialView });
    const perspectiveId = rig.perspectiveCamera.uuid;
    const orthographicId = rig.orthographicCamera.uuid;
    rig.actorRef.start();

    expect(rig.activeCamera).toBe(rig.perspectiveCamera);
    expect(rig.activeCamera).toBeInstanceOf(PerspectiveCamera);
    const perspectiveTarget = new Vector3(...initialView.target).project(rig.activeCamera);
    expect(Math.hypot(perspectiveTarget.x, perspectiveTarget.y)).toBeCloseTo(0, 12);

    rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    const handoffSnapshot = rig.actorRef.getSnapshot();
    expect(rig.activeCamera).toBe(rig.orthographicCamera);
    expect(
      maximumProjectedPixelDelta({
        view: initialView,
        perspectiveVerticalFieldOfView: selectCameraDriverSnapshot(handoffSnapshot).handoffVerticalFieldOfView ?? 60,
      }),
    ).toBeLessThanOrEqual(0.25);
    expect(rig.activeCamera).toBe(rig.orthographicCamera);
    expect(rig.activeCamera).toBeInstanceOf(OrthographicCamera);
    expect(rig.perspectiveCamera.uuid).toBe(perspectiveId);
    expect(rig.orthographicCamera.uuid).toBe(orthographicId);
    const orthographicTarget = new Vector3(...initialView.target).project(rig.activeCamera);
    expect(Math.hypot(orthographicTarget.x, orthographicTarget.y)).toBeCloseTo(0, 12);

    rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 60 });
    expect(rig.activeCamera).toBe(rig.perspectiveCamera);
    expect(rig.perspectiveCamera.uuid).toBe(perspectiveId);
    expect(rig.orthographicCamera.uuid).toBe(orthographicId);

    rig.dispose();
  });

  it('projects a fitted volumetric box through the native matrix without losing distance or zoom', () => {
    const fittedBounds = { min: [0, 0, 0], max: [20, 14, 8] } as const;
    const fittedView = frameCameraBounds({
      view: createCameraView({
        ...initialView,
        requestedVerticalFieldOfView: 45,
        direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
        viewport: { width: 768, height: 576, pixelRatio: 1 },
      }),
      bounds: fittedBounds,
      margin: 0.1,
    });
    const rig = createThreeCameraRig({ initialView: fittedView });
    rig.actorRef.start();

    expect(rig.perspectiveCamera.position.distanceTo(new Vector3(...fittedView.target))).toBeCloseTo(
      35.808_573_937_594_36,
      10,
    );
    expect(rig.perspectiveCamera.zoom).toBeCloseTo(1.078_034_861_982_213_3, 10);
    expect(rig.orthographicCamera.zoom).toBe(1);
    const projectedCorners = [
      [0, 0, 0],
      [20, 0, 0],
      [0, 14, 0],
      [20, 14, 0],
      [0, 0, 8],
      [20, 0, 8],
      [0, 14, 8],
      [20, 14, 8],
    ].map((point) => new Vector3(...(point as [number, number, number])).project(rig.perspectiveCamera));
    expect(projectedCorners[1]!.x).toBeCloseTo(0.151_130_912_782_328_93, 10);
    expect(projectedCorners[1]!.y).toBeCloseTo(-0.9, 10);
    expect(projectedCorners[7]!.x).toBeCloseTo(0.733_907_379_246_009_8, 10);
    expect(projectedCorners[7]!.y).toBeCloseTo(0.195_649_892_264_690_48, 10);
    expect(projectedCorners.every(({ x, y }) => Math.abs(x) <= 0.9 + 1e-12 && Math.abs(y) <= 0.9 + 1e-12)).toBe(true);
    rig.dispose();
  });

  it('uses correct native ray semantics at both endpoints', () => {
    const rig = createThreeCameraRig({ initialView });
    rig.actorRef.start();
    const raycaster = new Raycaster();
    const coordinates = new Vector2(0.4, -0.2);

    raycaster.setFromCamera(coordinates, rig.activeCamera);
    const perspectiveOrigin = raycaster.ray.origin.clone();
    const perspectiveDirection = raycaster.ray.direction.clone();

    rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    raycaster.setFromCamera(coordinates, rig.activeCamera);

    expect(raycaster.ray.origin.equals(perspectiveOrigin)).toBe(false);
    expect(raycaster.ray.direction.equals(perspectiveDirection)).toBe(false);
    expect(raycaster.ray.direction.length()).toBeCloseTo(1, 12);
    rig.dispose();
  });

  it('keeps finite bounds-derived clip planes for off-origin targets', () => {
    const rig = createThreeCameraRig({ initialView });
    rig.actorRef.start();

    for (const camera of [rig.perspectiveCamera, rig.orthographicCamera]) {
      expect(camera.near).toBeGreaterThan(0);
      expect(camera.far).toBeGreaterThan(camera.near);
      expect(Number.isFinite(camera.far)).toBe(true);
      expect(camera.far / camera.near).toBeLessThan(100);
    }
    rig.dispose();
  });

  it('preserves a broad perspective envelope without collapsing orthographic depth precision', () => {
    const rig = createThreeCameraRig({ initialView });
    rig.actorRef.start();
    const boundsDerivedOrthographicFar = rig.orthographicCamera.far;
    rig.setClipPlanes({
      near: 1e-3,
      minimumPerspectiveFar: 10_000_000_000,
      orthographicFarMultiplier: 5,
    });
    expect(rig.orthographicCamera.far).toBeCloseTo(boundsDerivedOrthographicFar * 5, 10);

    rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    rig.actorRef.send({ type: 'setViewport', viewport: { width: 900, height: 600, pixelRatio: 1 } });

    expect(rig.perspectiveCamera.near).toBe(1e-3);
    expect(rig.perspectiveCamera.far).toBe(10_000_000_000);
    expect(rig.orthographicCamera.near).toBe(1e-3);
    expect(rig.orthographicCamera.far).toBeLessThan(10_000_000_000);
    expect(rig.orthographicCamera.far / rig.orthographicCamera.near).toBeLessThan(10_000_000);
    expect(() => {
      rig.setClipPlanes({ near: 1, minimumPerspectiveFar: 2, orthographicFarMultiplier: 0.5 });
    }).toThrow(RangeError);
    rig.dispose();
  });

  it('publishes updates in revision order and disposes once', () => {
    const revisions: number[] = [];
    const rig = createThreeCameraRig({
      initialView,
      onUpdate(_camera, snapshot) {
        revisions.push(snapshot.revision);
      },
    });
    let completionCount = 0;
    rig.actorRef.subscribe({
      complete() {
        completionCount += 1;
      },
    });
    rig.actorRef.start();
    rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 45 });
    rig.actorRef.send({ type: 'setViewport', viewport: { width: 900, height: 600, pixelRatio: 1 } });

    expect(revisions).toEqual([0, 1, 2]);
    expect(selectCameraProjection(rig.actorRef.getSnapshot())).toEqual({
      kind: 'perspective',
      verticalFieldOfView: 45,
    });
    rig.dispose();
    rig.dispose();
    expect(completionCount).toBe(1);
  });
});
