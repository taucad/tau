import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraBounds, CameraVector } from '@taucad/camera';
import { useCameraRig, useGraphics, useViewCameraFraming } from '#hooks/use-graphics.js';
import type { StageOptions } from '#components/geometry/graphics/three/stage.js';
import { defaultStageOptions } from '#components/geometry/graphics/three/stage.js';
import { resolveCameraUp } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';

const significantRadiusChangeRatio = 0.1;
const significantAspectChangeRatio = 0.1;

const toCameraBounds = (bounds: THREE.Box3): CameraBounds => ({
  min: [bounds.min.x, bounds.min.y, bounds.min.z],
  max: [bounds.max.x, bounds.max.y, bounds.max.z],
});

const directionFromRotation = ({
  side,
  vertical,
}: {
  readonly side: number;
  readonly vertical: number;
}): CameraVector => {
  const horizontalScale = Math.cos(vertical);
  return [horizontalScale * Math.cos(side), horizontalScale * Math.sin(side), Math.sin(vertical)];
};

/**
 * Sends geometry framing policy to the provider-owned portable camera actor.
 *
 * The first real geometry uses configured angles and becomes the reset home.
 * Later significant bounds/aspect changes preserve the user's direction.
 */
export function useCameraFraming<
  Options extends {
    geometryRadius: number;
    geometryBounds: THREE.Box3;
    stageOptions?: StageOptions;
  },
>({
  geometryRadius,
  geometryBounds,
  stageOptions = defaultStageOptions,
}: Options): (options?: { enableConfiguredAngles?: boolean }) => void {
  const rig = useCameraRig();
  const framing = useViewCameraFraming();
  const graphicsActor = useGraphics();
  const { size } = useThree();
  const viewportAspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1;
  const resolvedOptions = useMemo(
    () => ({
      ...defaultStageOptions,
      ...stageOptions,
      rotation: { ...defaultStageOptions.rotation, ...stageOptions.rotation },
    }),
    [stageOptions],
  );
  /* Mount-scoped: `undefined` means this Stage has not handled geometry yet. The session's
   * `framing` record carries the entry-scoped half, so a remount does not re-frame. */
  const previousRadiusRef = useRef<number | undefined>(undefined);
  const previousBoundsRef = useRef<THREE.Box3 | undefined>(undefined);
  const previousAspectRef = useRef(viewportAspect);

  const frame = useCallback(
    (options?: { enableConfiguredAngles?: boolean }) => {
      if (geometryRadius <= 0 || geometryBounds.isEmpty()) {
        return;
      }

      const actor = rig.actorRef;
      const { view } = actor.getSnapshot().context;
      if (options?.enableConfiguredAngles ?? true) {
        const direction = directionFromRotation(resolvedOptions.rotation);
        const up = resolveCameraUp({
          direction: new THREE.Vector3(...direction),
          preferredUp: new THREE.Vector3(...view.up),
        });
        actor.send({
          type: 'setView',
          target: view.target,
          direction,
          up: [up.x, up.y, up.z],
          verticalSpan: view.verticalSpan,
        });
      }
      actor.send({ type: 'setBounds', bounds: toCameraBounds(geometryBounds) });
      actor.send({ type: 'frame', margin: resolvedOptions.fitMargin });
    },
    [geometryBounds, geometryRadius, resolvedOptions.fitMargin, resolvedOptions.rotation, rig],
  );

  useLayoutEffect(() => {
    if (geometryRadius <= 0 || geometryBounds.isEmpty()) {
      return;
    }

    const commit = (): void => {
      previousRadiusRef.current = geometryRadius;
      previousBoundsRef.current = geometryBounds.clone();
      previousAspectRef.current = viewportAspect;
    };

    if (!framing.initialized) {
      frame({ enableConfiguredAngles: true });
      rig.actorRef.send({ type: 'saveHome' });
      if (framing.pendingView) {
        rig.actorRef.send({ type: 'setView', ...framing.pendingView });
      }
      // oxlint-disable-next-line react/immutability -- the framing record is session state the canvas consumes exactly once; its owner is the graphics actor, not this mount.
      framing.initialized = true;
      commit();
      return;
    }

    if (previousRadiusRef.current === undefined) {
      // A remount over a camera the person already placed: keep the pose, refresh the bounds only.
      rig.actorRef.send({ type: 'setBounds', bounds: toCameraBounds(geometryBounds) });
      commit();
      return;
    }

    const previousRadius = previousRadiusRef.current;
    const radiusChange = previousRadius === 0 ? Infinity : Math.abs((geometryRadius - previousRadius) / previousRadius);
    const previousBounds = previousBoundsRef.current;
    const scale = Math.max(previousRadius, geometryRadius);
    const boundsChange = previousBounds
      ? Math.max(
          Math.abs(previousBounds.min.x - geometryBounds.min.x),
          Math.abs(previousBounds.min.y - geometryBounds.min.y),
          Math.abs(previousBounds.min.z - geometryBounds.min.z),
          Math.abs(previousBounds.max.x - geometryBounds.max.x),
          Math.abs(previousBounds.max.y - geometryBounds.max.y),
          Math.abs(previousBounds.max.z - geometryBounds.max.z),
        ) / scale
      : Infinity;

    if (radiusChange > significantRadiusChangeRatio || boundsChange > significantRadiusChangeRatio) {
      frame({ enableConfiguredAngles: false });
      previousRadiusRef.current = geometryRadius;
      previousBoundsRef.current = geometryBounds.clone();
    }
  }, [framing, frame, geometryBounds, geometryRadius, rig, viewportAspect]);

  useLayoutEffect(() => {
    if (previousRadiusRef.current === undefined || geometryRadius <= 0) {
      previousAspectRef.current = viewportAspect;
      return;
    }
    const previousAspect = previousAspectRef.current;
    const aspectChange = Math.abs(viewportAspect - previousAspect) / Math.max(previousAspect, 1e-9);
    if (aspectChange > significantAspectChangeRatio) {
      previousAspectRef.current = viewportAspect;
      frame({ enableConfiguredAngles: false });
    }
  }, [frame, geometryRadius, viewportAspect]);

  useLayoutEffect(() => {
    const subscription = graphicsActor.on('viewResetRequested', () => {
      rig.actorRef.send({ type: 'reset' });
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [graphicsActor, rig]);

  return frame;
}
