import { OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraView, frameCameraBounds, maximumProjectedPixelDelta } from '@taucad/camera';
import type { RenderFrame } from '@taucad/spatial';
import { selectCameraDriverSnapshot, selectCameraProjection } from '@taucad/camera/machine';
import { createThreeCameraRig, readThreeCameraState } from '#camera.js';

const initialView = createCameraView({
  frameId: 'test-root',
  requestedVerticalFieldOfView: 60,
  perspectiveZoom: 1,
  target: [35, -20, 12],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 600,
  viewport: { width: 1536, height: 900, pixelRatio: 2 },
  bounds: { min: [-220, -180, -55], max: [220, 180, 55] },
});

const planeDepthAtViewportGuard = ({
  camera,
  edge,
  normal,
  offset,
  viewport,
}: {
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly edge: 'lower' | 'upper';
  readonly normal: readonly [number, number, number];
  readonly offset: number;
  readonly viewport: Readonly<{ height: number; pixelRatio: number }>;
}): number => {
  const guardedViewportMagnitude = 1 + 4 / (viewport.height * viewport.pixelRatio);
  const guardedViewportY = edge === 'lower' ? -guardedViewportMagnitude : guardedViewportMagnitude;
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(0, guardedViewportY), camera);
  const planeNormal = new Vector3(...normal).normalize();
  const distance = (offset - planeNormal.dot(raycaster.ray.origin)) / planeNormal.dot(raycaster.ray.direction);
  const intersection = raycaster.ray.at(distance, new Vector3());
  return -camera.worldToLocal(intersection).z;
};

const presentationPlaneGuardOracle = ({
  camera,
  normal,
  offset,
  viewport,
}: {
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly normal: readonly [number, number, number];
  readonly offset: number;
  readonly viewport: Readonly<{ height: number; pixelRatio: number }>;
}): Readonly<{
  approachesZeroFromForward: boolean;
  lowerDepth: number;
  lowerSignedDistance: number;
  requiredDepth: number;
  upperDepth: number;
  upperSignedDistance: number;
}> => {
  const guardedViewportMagnitude = 1 + 4 / (viewport.height * viewport.pixelRatio);
  const planeNormal = new Vector3(...normal).normalize();
  const readRay = (guardedViewportY: number) => {
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, guardedViewportY), camera);
    const signedDistance = offset - planeNormal.dot(raycaster.ray.origin);
    const denominator = planeNormal.dot(raycaster.ray.direction);
    const distance = signedDistance / denominator;
    const intersection = raycaster.ray.at(distance, new Vector3());
    return {
      denominator,
      depth: -camera.worldToLocal(intersection).z,
      signedDistance,
    };
  };
  const lower = readRay(-guardedViewportMagnitude);
  const upper = readRay(guardedViewportMagnitude);
  const minimumSignedDistance = Math.min(lower.signedDistance, upper.signedDistance);
  const maximumSignedDistance = Math.max(lower.signedDistance, upper.signedDistance);
  const approachesZeroFromForward =
    camera instanceof OrthographicCamera &&
    Number.isFinite(lower.signedDistance) &&
    Number.isFinite(upper.signedDistance) &&
    Number.isFinite(lower.denominator) &&
    lower.denominator !== 0 &&
    minimumSignedDistance <= 0 &&
    maximumSignedDistance >= 0 &&
    (lower.denominator > 0 ? maximumSignedDistance > 0 : minimumSignedDistance < 0);
  const minimumPositiveDepth = Math.min(
    ...[lower.depth, upper.depth].filter((depth) => Number.isFinite(depth) && depth > 0),
  );
  const crossingDepth = Math.min(lower.depth, upper.depth);

  return {
    approachesZeroFromForward,
    lowerDepth: lower.depth,
    lowerSignedDistance: lower.signedDistance,
    requiredDepth: approachesZeroFromForward ? crossingDepth : minimumPositiveDepth,
    upperDepth: upper.depth,
    upperSignedDistance: upper.signedDistance,
  };
};

const expectedPresentationNear = ({
  boundsNear,
  camera,
  normal,
  offset,
  target,
  viewport,
}: {
  readonly boundsNear: number;
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly normal: readonly [number, number, number];
  readonly offset: number;
  readonly target: readonly [number, number, number];
  readonly viewport: Readonly<{ height: number; pixelRatio: number }>;
}): Readonly<{ floor: number; near: number; oracle: ReturnType<typeof presentationPlaneGuardOracle> }> => {
  const oracle = presentationPlaneGuardOracle({ camera, normal, offset, viewport });
  const floor = camera.position.distanceTo(new Vector3(...target)) * 1e-9;
  const near = Math.min(boundsNear, oracle.requiredDepth);
  return {
    floor,
    near: camera instanceof OrthographicCamera && oracle.approachesZeroFromForward ? near : Math.max(floor, near),
    oracle,
  };
};

describe('createThreeCameraRig', () => {
  it('preserves physical camera state and projection across render-frame changes', () => {
    const firstFrame: RenderFrame = {
      anchorFrameId: initialView.frameId,
      originMeters: [30, -25, 10],
      metersPerRenderUnit: 1e-3,
    };
    const rig = createThreeCameraRig({
      initialView,
      renderFrame: firstFrame,
      clipPlanes: { farPaddingVerticalSpans: 4 },
    });
    rig.actorRef.start();
    const firstCameraId = rig.activeCamera.uuid;
    const before = readThreeCameraState({
      camera: rig.activeCamera,
      target: new Vector3(...initialView.target)
        .sub(new Vector3(...firstFrame.originMeters))
        .divideScalar(firstFrame.metersPerRenderUnit),
      renderFrame: firstFrame,
    });

    const secondFrame: RenderFrame = {
      anchorFrameId: initialView.frameId,
      originMeters: [34, -21, 11],
      metersPerRenderUnit: 1e-2,
    };
    rig.setRenderFrame(secondFrame);
    const nativeTarget = new Vector3(...initialView.target)
      .sub(new Vector3(...secondFrame.originMeters))
      .divideScalar(secondFrame.metersPerRenderUnit);
    const after = readThreeCameraState({ camera: rig.activeCamera, target: nativeTarget, renderFrame: secondFrame });

    expect(after.position).toEqual(before.position);
    expect(after.target).toEqual(before.target);
    expect(after.projection).toEqual(before.projection);
    expect(after.clipping.near).toBeCloseTo(before.clipping.near, 12);
    expect(after.clipping.far).toBeCloseTo(before.clipping.far, 12);
    expect(rig.activeCamera.uuid).toBe(firstCameraId);
    rig.dispose();
  });

  it('reads complete perspective and orthographic camera state', () => {
    const target = new Vector3(1, 2, 3);
    const perspective = new PerspectiveCamera(52, 16 / 9, 0.2, 900);
    perspective.position.set(8, -6, 4);
    perspective.up.set(0, 0, 1);
    perspective.zoom = 1.4;
    perspective.lookAt(target);
    perspective.rotateZ(Math.PI / 8);
    perspective.updateMatrixWorld(true);

    const perspectiveState = readThreeCameraState({
      camera: perspective,
      target,
      renderFrame: { anchorFrameId: 'test-root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
    });
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
    const orthographicState = readThreeCameraState({
      camera: orthographic,
      target,
      renderFrame: { anchorFrameId: 'test-root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
    });
    expect(orthographicState.projection).toEqual({ kind: 'orthographic', verticalSpan: 9, zoom: 2 });
    expect(orthographicState.aspect).toBeCloseTo(16 / 9, 12);

    orthographic.near = -4;
    orthographic.updateProjectionMatrix();
    const presentationExtendedState = readThreeCameraState({
      camera: orthographic,
      target,
      renderFrame: { anchorFrameId: 'test-root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
    });
    expect(presentationExtendedState.clipping.near).toBeCloseTo(orthographic.position.distanceTo(target) * 1e-9, 12);
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

  it('should preserve the complete finite grid fade beyond fitted model bounds', () => {
    const rig = createThreeCameraRig({ initialView });
    rig.actorRef.start();
    const boundsDerivedState = rig.readState();
    const boundsDerivedPerspectiveNear = rig.perspectiveCamera.near;
    const boundsDerivedPerspectiveFar = rig.perspectiveCamera.far;
    const boundsDerivedOrthographicNear = rig.orthographicCamera.near;
    const boundsDerivedOrthographicFar = rig.orthographicCamera.far;
    const fadeEndVerticalSpans = 4;
    const expectedFarPadding = initialView.verticalSpan * fadeEndVerticalSpans;

    rig.setClipPlanes({
      farPaddingVerticalSpans: fadeEndVerticalSpans,
      presentationPlaneOffsetMeters: 0,
    });

    const paddedState = rig.readState();
    expect(paddedState.position).toEqual(boundsDerivedState.position);
    expect(paddedState.target).toEqual(boundsDerivedState.target);
    expect(paddedState.projection).toEqual(boundsDerivedState.projection);
    expect(paddedState.aspect).toBe(boundsDerivedState.aspect);
    expect(rig.perspectiveCamera.near).toBeLessThan(boundsDerivedPerspectiveNear);
    expect(rig.perspectiveCamera.near).toBeCloseTo(
      planeDepthAtViewportGuard({
        camera: rig.perspectiveCamera,
        edge: 'lower',
        normal: initialView.up,
        offset: 0,
        viewport: initialView.viewport,
      }),
      10,
    );
    expect(rig.perspectiveCamera.far).toBeCloseTo(boundsDerivedPerspectiveFar + expectedFarPadding, 10);
    expect(rig.orthographicCamera.near).toBeLessThan(boundsDerivedOrthographicNear);
    expect(rig.orthographicCamera.near).toBeCloseTo(
      planeDepthAtViewportGuard({
        camera: rig.orthographicCamera,
        edge: 'lower',
        normal: initialView.up,
        offset: 0,
        viewport: initialView.viewport,
      }),
      10,
    );
    expect(rig.orthographicCamera.far).toBeCloseTo(boundsDerivedOrthographicFar + expectedFarPadding, 10);

    rig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    rig.actorRef.send({ type: 'setViewport', viewport: { width: 900, height: 600, pixelRatio: 1 } });

    const synchronizedView = selectCameraDriverSnapshot(rig.actorRef.getSnapshot()).view;
    const synchronizedPerspectiveFar = rig.perspectiveCamera.far;
    const synchronizedOrthographicFar = rig.orthographicCamera.far;

    rig.setClipPlanes(undefined);
    expect(synchronizedPerspectiveFar).toBeCloseTo(
      rig.perspectiveCamera.far + synchronizedView.verticalSpan * fadeEndVerticalSpans,
      10,
    );
    expect(synchronizedOrthographicFar).toBeCloseTo(
      rig.orthographicCamera.far + synchronizedView.verticalSpan * fadeEndVerticalSpans,
      10,
    );
    const tightPerspectiveNear = rig.perspectiveCamera.near;
    const tightPerspectiveFar = rig.perspectiveCamera.far;
    const tightOrthographicNear = rig.orthographicCamera.near;
    const tightOrthographicFar = rig.orthographicCamera.far;

    rig.setClipPlanes({
      farPaddingVerticalSpans: fadeEndVerticalSpans,
      presentationPlaneOffsetMeters: 0,
    });
    rig.setClipPlanes(undefined);
    expect(rig.perspectiveCamera.near).toBe(tightPerspectiveNear);
    expect(rig.perspectiveCamera.far).toBe(tightPerspectiveFar);
    expect(rig.orthographicCamera.near).toBe(tightOrthographicNear);
    expect(rig.orthographicCamera.far).toBe(tightOrthographicFar);

    rig.dispose();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects an invalid far-padding multiplier (%s)',
    (farPaddingVerticalSpans) => {
      const rig = createThreeCameraRig({ initialView });

      expect(() => {
        rig.setClipPlanes({ farPaddingVerticalSpans });
      }).toThrow('clipPlanes.farPaddingVerticalSpans must be finite and non-negative.');
      rig.dispose();
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects an invalid presentation-plane offset (%s)',
    (presentationPlaneOffsetMeters) => {
      const rig = createThreeCameraRig({ initialView });

      expect(() => {
        rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters });
      }).toThrow('clipPlanes.presentationPlaneOffsetMeters must be finite.');
      rig.dispose();
    },
  );

  it.each([
    {
      axis: 'x',
      target: [0, -20, 35] as const,
      direction: [0.7, -1, 1] as const,
      up: [1, 0, 0] as const,
      bounds: { min: [-55, -180, -220], max: [55, 180, 220] } as const,
    },
    {
      axis: 'y',
      target: [35, 12, -20] as const,
      direction: [1, 0.7, -1] as const,
      up: [0, 1, 0] as const,
      bounds: { min: [-220, -55, -180], max: [220, 55, 180] } as const,
    },
    {
      axis: 'z',
      target: initialView.target,
      direction: initialView.direction,
      up: initialView.up,
      bounds: initialView.bounds,
    },
  ])('contains the guarded physical zero plane for $axis-up at both endpoints', ({ bounds, direction, target, up }) => {
    const view = createCameraView({ ...initialView, bounds, direction, target, up });
    const rig = createThreeCameraRig({ initialView: view });
    const boundsNear = {
      perspective: rig.perspectiveCamera.near,
      orthographic: rig.orthographicCamera.near,
    };

    rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 });

    const perspectivePlaneDepth = planeDepthAtViewportGuard({
      camera: rig.perspectiveCamera,
      edge: 'lower',
      normal: up,
      offset: 0,
      viewport: view.viewport,
    });
    const orthographicPlaneDepth = planeDepthAtViewportGuard({
      camera: rig.orthographicCamera,
      edge: 'lower',
      normal: up,
      offset: 0,
      viewport: view.viewport,
    });
    expect(rig.perspectiveCamera.near).toBeCloseTo(Math.min(boundsNear.perspective, perspectivePlaneDepth), 10);
    expect(rig.orthographicCamera.near).toBeCloseTo(Math.min(boundsNear.orthographic, orthographicPlaneDepth), 10);
    expect(rig.perspectiveCamera.near).toBeGreaterThan(0);
    expect(rig.orthographicCamera.near).toBeGreaterThan(0);
    rig.dispose();
  });

  it.each([
    { fov: 30, zoom: 0.75, viewport: { width: 1600, height: 500, pixelRatio: 1 } },
    { fov: 60, zoom: 1, viewport: { width: 900, height: 900, pixelRatio: 2 } },
    { fov: 85, zoom: 1.5, viewport: { width: 600, height: 1200, pixelRatio: 2 } },
  ] as const)('uses effective FOV/zoom and a DPR-aware guard ($fov°, zoom $zoom)', ({ fov, viewport, zoom }) => {
    const view = createCameraView({
      ...initialView,
      requestedVerticalFieldOfView: fov,
      perspectiveZoom: zoom,
      viewport,
    });
    const rig = createThreeCameraRig({ initialView: view });
    const boundsNear = rig.perspectiveCamera.near;

    rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 });

    const planeDepth = planeDepthAtViewportGuard({
      camera: rig.perspectiveCamera,
      edge: 'lower',
      normal: view.up,
      offset: 0,
      viewport,
    });
    expect(rig.perspectiveCamera.near).toBeCloseTo(Math.min(boundsNear, planeDepth), 10);
    rig.dispose();
  });

  it('contains a non-zero physical plane offset without changing camera placement', () => {
    const rig = createThreeCameraRig({ initialView });
    const before = rig.readState();
    const planeOffsetMeters = 10;

    rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: planeOffsetMeters });

    expect(rig.perspectiveCamera.near).toBeCloseTo(
      planeDepthAtViewportGuard({
        camera: rig.perspectiveCamera,
        edge: 'lower',
        normal: initialView.up,
        offset: planeOffsetMeters,
        viewport: initialView.viewport,
      }),
      10,
    );
    const after = rig.readState();
    expect(after.position).toEqual(before.position);
    expect(after.target).toEqual(before.target);
    expect(after.projection).toEqual(before.projection);
    rig.dispose();
  });

  it.each([
    { direction: [1, -1, -0.7], planeOffsetMeters: 0, projection: 'perspective' },
    { direction: [1, -1, -0.7], planeOffsetMeters: 0, projection: 'orthographic' },
    { direction: [1, -1, -0.2], planeOffsetMeters: 0, projection: 'perspective' },
    { direction: [1, -1, -0.7], planeOffsetMeters: -10, projection: 'perspective' },
  ] as const)(
    'contains the guarded plane from below for $projection at offset $planeOffsetMeters',
    ({ direction, planeOffsetMeters, projection }) => {
      const view = createCameraView({ ...initialView, direction });
      const rig = createThreeCameraRig({ initialView: view });
      const camera = projection === 'perspective' ? rig.perspectiveCamera : rig.orthographicCamera;
      const boundsNear = camera.near;

      rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: planeOffsetMeters });

      const upperDepth = planeDepthAtViewportGuard({
        camera,
        edge: 'upper',
        normal: view.up,
        offset: planeOffsetMeters,
        viewport: view.viewport,
      });
      const expected = expectedPresentationNear({
        boundsNear,
        camera,
        normal: view.up,
        offset: planeOffsetMeters,
        target: view.target,
        viewport: view.viewport,
      });
      expect(upperDepth).toBeGreaterThan(0);
      expect(upperDepth).toBeLessThan(boundsNear);
      expect(camera.near).toBeCloseTo(expected.near, 10);
      rig.dispose();
    },
  );

  it('contains the guarded plane at both endpoints after crossing camera half-spaces', () => {
    const rig = createThreeCameraRig({ initialView });
    rig.actorRef.start();
    rig.actorRef.send({
      type: 'setView',
      target: initialView.target,
      direction: [1, -1, -0.7],
      up: initialView.up,
      verticalSpan: initialView.verticalSpan,
      perspectiveZoom: initialView.perspectiveZoom,
    });
    const { view } = selectCameraDriverSnapshot(rig.actorRef.getSnapshot());
    const boundsNear = {
      perspective: rig.perspectiveCamera.near,
      orthographic: rig.orthographicCamera.near,
    };
    rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 });

    for (const [projection, camera] of [
      ['perspective', rig.perspectiveCamera],
      ['orthographic', rig.orthographicCamera],
    ] as const) {
      const expected = expectedPresentationNear({
        boundsNear: boundsNear[projection],
        camera,
        normal: view.up,
        offset: 0,
        target: view.target,
        viewport: view.viewport,
      });
      expect(camera.near).toBeCloseTo(expected.near, 10);
      expect(camera.near).toBeGreaterThan(0);
      expect(camera.far).toBeGreaterThan(camera.near);
    }
    rig.dispose();
  });

  it('contains the guarded presentation plane across axes, projections, and finite viewing angles', () => {
    const axes = [
      {
        axis: 'x',
        bounds: { min: [-55, -180, -220], max: [55, 180, 220] } as const,
        target: [12, -20, 35] as const,
        up: [1, 0, 0] as const,
      },
      {
        axis: 'y',
        bounds: { min: [-220, -55, -180], max: [220, 55, 180] } as const,
        target: [35, 12, -20] as const,
        up: [0, 1, 0] as const,
      },
      {
        axis: 'z',
        bounds: initialView.bounds,
        target: initialView.target,
        up: initialView.up,
      },
    ] as const;
    const viewports = [
      { fov: 0.1, viewport: { width: 1600, height: 500, pixelRatio: 1 }, zoom: 0.5 },
      { fov: 15, viewport: { width: 1200, height: 700, pixelRatio: 2 }, zoom: 2 },
      { fov: 30, viewport: { width: 1600, height: 500, pixelRatio: 1 }, zoom: 0.75 },
      { fov: 60, viewport: { width: 900, height: 900, pixelRatio: 2 }, zoom: 1 },
      { fov: 85, viewport: { width: 600, height: 1200, pixelRatio: 2 }, zoom: 1.5 },
    ] as const;

    /* oxlint-disable max-depth -- the exhaustive Cartesian camera matrix is intentionally nested. */
    for (const { axis, bounds, target, up } of axes) {
      for (const elevationDegrees of [-75, -45, -30, -15, -7.5, -5, -1, -0.1, 0.1, 1, 5, 7.5, 15, 30, 45, 75]) {
        const elevation = (elevationDegrees * Math.PI) / 180;
        for (const azimuthDegrees of [0, 90, 180, 270]) {
          const azimuth = (azimuthDegrees * Math.PI) / 180;
          const tangentA = Math.cos(elevation) * Math.cos(azimuth);
          const tangentB = Math.cos(elevation) * Math.sin(azimuth);
          const normal = Math.sin(elevation);
          const direction = (
            axis === 'x'
              ? [normal, tangentA, tangentB]
              : axis === 'y'
                ? [tangentA, normal, tangentB]
                : [tangentA, tangentB, normal]
          ) as [number, number, number];

          for (const { fov, viewport, zoom } of viewports) {
            const view = createCameraView({
              ...initialView,
              bounds,
              direction,
              perspectiveZoom: zoom,
              requestedVerticalFieldOfView: fov,
              target,
              up,
              viewport,
            });
            const rig = createThreeCameraRig({ initialView: view });
            const boundsNear = {
              perspective: rig.perspectiveCamera.near,
              orthographic: rig.orthographicCamera.near,
            };
            const boundsFar = {
              perspective: rig.perspectiveCamera.far,
              orthographic: rig.orthographicCamera.far,
            };

            rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 });

            for (const [projection, camera] of [
              ['perspective', rig.perspectiveCamera],
              ['orthographic', rig.orthographicCamera],
            ] as const) {
              const expected = expectedPresentationNear({
                boundsNear: boundsNear[projection],
                camera,
                normal: up,
                offset: 0,
                target,
                viewport,
              });
              const context = JSON.stringify({
                axis,
                azimuthDegrees,
                elevationDegrees,
                expected,
                fov,
                projection,
                viewport,
                zoom,
              });
              expect(
                Math.abs(camera.near - expected.near) / Math.max(1, Math.abs(expected.near)),
                context,
              ).toBeLessThan(1e-12);
              expect(camera.far, context).toBeCloseTo(boundsFar[projection] + view.verticalSpan * 4, 8);
              if (projection === 'orthographic' && expected.oracle.approachesZeroFromForward) {
                expect(camera.near, context).toBeLessThanOrEqual(0);
              } else {
                expect(camera.near, context).toBeGreaterThan(0);
              }
              expect(camera.far, context).toBeGreaterThan(camera.near);
            }
            rig.dispose();
          }
        }
      }
    }
    /* oxlint-enable max-depth -- exhaustive camera matrix ends. */
  });

  it.each([
    {
      axis: 'x',
      bounds: { min: [-55, -180, -220], max: [55, 180, 220] } as const,
      direction: [-0.01, -1, 1] as const,
      side: 'below',
      target: [0, -20, 35] as const,
      up: [1, 0, 0] as const,
    },
    {
      axis: 'x',
      bounds: { min: [-55, -180, -220], max: [55, 180, 220] } as const,
      direction: [0.001, -1, 1] as const,
      side: 'above',
      target: [12, -20, 35] as const,
      up: [1, 0, 0] as const,
    },
    {
      axis: 'y',
      bounds: { min: [-220, -55, -180], max: [220, 55, 180] } as const,
      direction: [1, -0.01, -1] as const,
      side: 'below',
      target: [35, 0, -20] as const,
      up: [0, 1, 0] as const,
    },
    {
      axis: 'y',
      bounds: { min: [-220, -55, -180], max: [220, 55, 180] } as const,
      direction: [1, 0.01, -1] as const,
      side: 'above',
      target: [35, 0, -20] as const,
      up: [0, 1, 0] as const,
    },
    {
      axis: 'z',
      bounds: initialView.bounds,
      direction: [1, -1, -0.01] as const,
      side: 'below',
      target: [35, -20, 0] as const,
      up: initialView.up,
    },
    {
      axis: 'z',
      bounds: initialView.bounds,
      direction: [1, -1, 0.01] as const,
      side: 'above',
      target: [35, -20, 0] as const,
      up: initialView.up,
    },
  ])(
    'contains the signed orthographic presentation depth when the guarded viewport crosses it for $axis-up from $side',
    ({ bounds, direction, target, up }) => {
      const view = createCameraView({ ...initialView, bounds, direction, target, up });
      const rig = createThreeCameraRig({ initialView: view });
      const boundsNear = rig.orthographicCamera.near;

      rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 });

      const expected = expectedPresentationNear({
        boundsNear,
        camera: rig.orthographicCamera,
        normal: up,
        offset: 0,
        target,
        viewport: view.viewport,
      });
      expect(expected.oracle.approachesZeroFromForward).toBe(true);
      expect(expected.oracle.requiredDepth).toBeLessThan(0);
      expect(Math.abs(rig.orthographicCamera.near - expected.near) / Math.abs(expected.near)).toBeLessThan(1e-12);
      rig.dispose();
    },
  );

  it.each([
    { edge: 'lower', approachesZeroFromForward: false },
    { edge: 'upper', approachesZeroFromForward: true },
  ] as const)(
    'classifies an exact orthographic $edge depth-zero boundary by its forward side',
    ({ approachesZeroFromForward, edge }) => {
      const rig = createThreeCameraRig({ initialView });
      const camera = rig.orthographicCamera;
      const boundsNear = camera.near;
      const guardedViewportMagnitude = 1 + 4 / (initialView.viewport.height * initialView.viewport.pixelRatio);
      const raycaster = new Raycaster();
      raycaster.setFromCamera(
        new Vector2(0, edge === 'lower' ? -guardedViewportMagnitude : guardedViewportMagnitude),
        camera,
      );
      const normal = new Vector3(...initialView.up).normalize();
      const planeOffsetMeters = normal.dot(raycaster.ray.origin);

      rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: planeOffsetMeters });

      const expected = expectedPresentationNear({
        boundsNear,
        camera,
        normal: initialView.up,
        offset: planeOffsetMeters,
        target: initialView.target,
        viewport: initialView.viewport,
      });
      expect(expected.oracle.approachesZeroFromForward).toBe(approachesZeroFromForward);
      expect(camera.near).toBeCloseTo(expected.near, 12);
      rig.dispose();
    },
  );

  it('updates both persistent endpoints across shallow orthographic and projection transitions', () => {
    const transitionView = createCameraView({
      ...initialView,
      target: [35, -20, 0],
    });
    const referenceRig = createThreeCameraRig({ initialView: transitionView });
    const protectedRig = createThreeCameraRig({
      initialView: transitionView,
      clipPlanes: { farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 },
    });
    referenceRig.actorRef.start();
    protectedRig.actorRef.start();
    const events = [
      {
        type: 'setView',
        target: transitionView.target,
        direction: [1, -1, 0.01],
        up: transitionView.up,
        verticalSpan: transitionView.verticalSpan,
        perspectiveZoom: transitionView.perspectiveZoom,
      },
      { type: 'setVerticalFieldOfView', verticalFieldOfView: 0 },
      {
        type: 'setView',
        target: transitionView.target,
        direction: [1, -1, -0.01],
        up: transitionView.up,
        verticalSpan: transitionView.verticalSpan,
        perspectiveZoom: transitionView.perspectiveZoom,
      },
      { type: 'setVerticalFieldOfView', verticalFieldOfView: 0.1 },
      { type: 'setVerticalFieldOfView', verticalFieldOfView: 0 },
      { type: 'setViewport', viewport: { width: 600, height: 1200, pixelRatio: 2 } },
    ] as const;

    for (const event of events) {
      referenceRig.actorRef.send(event);
      protectedRig.actorRef.send(event);
      const { view } = selectCameraDriverSnapshot(protectedRig.actorRef.getSnapshot());
      for (const [projection, protectedCamera, referenceCamera] of [
        ['perspective', protectedRig.perspectiveCamera, referenceRig.perspectiveCamera],
        ['orthographic', protectedRig.orthographicCamera, referenceRig.orthographicCamera],
      ] as const) {
        const expected = expectedPresentationNear({
          boundsNear: referenceCamera.near,
          camera: protectedCamera,
          normal: view.up,
          offset: 0,
          target: view.target,
          viewport: view.viewport,
        });
        const context = JSON.stringify({ event, expected, projection });
        expect(
          Math.abs(protectedCamera.near - expected.near) / Math.max(1, Math.abs(expected.near)),
          context,
        ).toBeLessThan(1e-12);
        expect(protectedCamera.far, context).toBeGreaterThan(protectedCamera.near);
      }
    }

    referenceRig.dispose();
    protectedRig.dispose();
  });

  it('retains bounds-derived orthographic near when the view ray is parallel to the plane', () => {
    const horizontalView = createCameraView({
      ...initialView,
      direction: [1, -1, 0],
      target: [35, -20, 12],
      up: [0, 0, 1],
    });
    const rig = createThreeCameraRig({ initialView: horizontalView });
    const boundsNear = rig.orthographicCamera.near;

    rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 });

    expect(rig.orthographicCamera.near).toBe(boundsNear);
    rig.dispose();
  });

  it.each([
    { endpoint: 'perspective', planePosition: 'on-camera', offsetFromCamera: 0 },
    { endpoint: 'orthographic', planePosition: 'on-camera', offsetFromCamera: 0 },
    { endpoint: 'orthographic', planePosition: 'behind-camera', offsetFromCamera: 1 },
  ] as const)('classifies $endpoint near for a $planePosition presentation plane', ({ endpoint, offsetFromCamera }) => {
    const rig = createThreeCameraRig({ initialView });
    const camera = endpoint === 'perspective' ? rig.perspectiveCamera : rig.orthographicCamera;
    const boundsNear = camera.near;
    const normal = new Vector3(...initialView.up).normalize();
    const planeOffsetMeters = normal.dot(camera.position) + offsetFromCamera;

    rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: planeOffsetMeters });

    const expected = expectedPresentationNear({
      boundsNear,
      camera,
      normal: initialView.up,
      offset: planeOffsetMeters,
      target: initialView.target,
      viewport: initialView.viewport,
    });
    expect(camera.near).toBeCloseTo(expected.near, 12);
    rig.dispose();
  });

  it('contains a perspective plane behind the center ray when a guarded viewport ray still sees it', () => {
    const rig = createThreeCameraRig({ initialView });
    const camera = rig.perspectiveCamera;
    const boundsNear = camera.near;
    const normal = new Vector3(...initialView.up).normalize();
    const planeOffsetMeters = normal.dot(camera.position) + 1;

    rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: planeOffsetMeters });

    const expected = expectedPresentationNear({
      boundsNear,
      camera,
      normal: initialView.up,
      offset: planeOffsetMeters,
      target: initialView.target,
      viewport: initialView.viewport,
    });
    expect(expected.oracle.requiredDepth).toBeLessThan(boundsNear);
    expect(camera.near).toBeCloseTo(expected.near, 10);
    rig.dispose();
  });

  it('uses the relative positive floor when the guarded plane depth is smaller', () => {
    const rig = createThreeCameraRig({ initialView });
    const camera = rig.perspectiveCamera;
    const raycaster = new Raycaster();
    const guardedViewportY = -1 - 4 / (initialView.viewport.height * initialView.viewport.pixelRatio);
    raycaster.setFromCamera(new Vector2(0, guardedViewportY), camera);
    const forward = camera.getWorldDirection(new Vector3());
    const cameraDistance = camera.position.distanceTo(new Vector3(...initialView.target));
    const desiredPlaneDepth = cameraDistance * 1e-12;
    const planePoint = raycaster.ray.at(desiredPlaneDepth / raycaster.ray.direction.dot(forward), new Vector3());
    const planeOffsetMeters = new Vector3(...initialView.up).normalize().dot(planePoint);

    rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: planeOffsetMeters });

    expect(camera.near).toBeCloseTo(cameraDistance * 1e-9, 12);
    rig.dispose();
  });

  it('does not resynchronize for an equal clipping policy', () => {
    let updates = 0;
    const rig = createThreeCameraRig({
      initialView,
      onUpdate() {
        updates += 1;
      },
    });
    rig.actorRef.start();
    rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 });
    const afterFirstPolicy = updates;

    rig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 });

    expect(updates).toBe(afterFirstPolicy);
    rig.dispose();
  });

  it('keeps clipping policy state isolated between camera rigs', () => {
    const firstRig = createThreeCameraRig({ initialView });
    const secondRig = createThreeCameraRig({ initialView });
    const secondNear = secondRig.perspectiveCamera.near;
    const secondFar = secondRig.perspectiveCamera.far;

    firstRig.setClipPlanes({ farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 });

    expect(secondRig.perspectiveCamera.near).toBe(secondNear);
    expect(secondRig.perspectiveCamera.far).toBe(secondFar);
    firstRig.dispose();
    secondRig.dispose();
  });

  it.each([1e-12, 1e-9, 1e-6, 1e-3, 1, 1e3, 1e6, 1e9, 1e12])(
    'keeps visible-span clip padding covariant at physical scale %s',
    (scale) => {
      const scaledView = createCameraView({
        ...initialView,
        target: initialView.target.map((value) => value * scale) as [number, number, number],
        verticalSpan: initialView.verticalSpan * scale,
        bounds: {
          min: initialView.bounds.min.map((value) => value * scale) as [number, number, number],
          max: initialView.bounds.max.map((value) => value * scale) as [number, number, number],
        },
      });
      const rig = createThreeCameraRig({
        initialView: scaledView,
        renderFrame: {
          anchorFrameId: scaledView.frameId,
          originMeters: [0, 0, 0],
          metersPerRenderUnit: scale,
        },
        clipPlanes: { farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 },
      });
      const referenceRig = createThreeCameraRig({
        initialView,
        clipPlanes: { farPaddingVerticalSpans: 4, presentationPlaneOffsetMeters: 0 },
      });

      expect(rig.perspectiveCamera.near).toBeCloseTo(referenceRig.perspectiveCamera.near, 8);
      expect(rig.perspectiveCamera.far).toBeCloseTo(referenceRig.perspectiveCamera.far, 8);
      expect(rig.orthographicCamera.near).toBeCloseTo(referenceRig.orthographicCamera.near, 8);
      expect(rig.orthographicCamera.far).toBeCloseTo(referenceRig.orthographicCamera.far, 8);
      referenceRig.dispose();
      rig.dispose();
    },
  );

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
