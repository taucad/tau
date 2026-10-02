/**
 * Shared utilities for viewport gizmo components.
 *
 * Extracts common logic (FOV synchronization, container resolution) so that the
 * individual gizmo components only need to declare their configuration differences.
 */

import { useThree } from '@react-three/fiber';
import type { ViewportGizmo } from 'three-viewport-gizmo';
import { useEffect } from 'react';
import * as THREE from 'three';
import {
  calculateGizmoFovFromAngle,
  calculateFovDistanceCompensation,
  gizmoBaseFov,
  gizmoBaseDistance,
  gizmoDepthMargin,
  gizmoFocusOffset,
} from '#components/geometry/graphics/three/utils/math.utils.js';

// ── FOV synchronization ─────────────────────────────────────────────────────

/**
 * Synchronize the gizmo's internal camera FOV with the viewport camera FOV.
 *
 * The `three-viewport-gizmo` library creates its own internal PerspectiveCamera
 * (accessed via the private `_camera` property) with hardcoded defaults (FOV=26,
 * distance=7). This function updates that internal camera so the gizmo shows the
 * same perspective as the main viewport, while compensating the camera distance to
 * keep the gizmo cube at a consistent apparent size.
 *
 * NOTE: `_camera` is a non-public property. If the library ever exposes a public
 * FOV API, this should be migrated. The runtime `instanceof` guard ensures a
 * silent no-op if the internal structure changes.
 */
export function syncGizmoFov(gizmo: ViewportGizmo, cameraFovAngle: number): void {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- accessing private _camera property; no public FOV API exists
  const internalCamera = (gizmo as unknown as { _camera: THREE.PerspectiveCamera })._camera;
  if (!(internalCamera instanceof THREE.PerspectiveCamera)) {
    return;
  }

  const gizmoFov = calculateGizmoFovFromAngle(cameraFovAngle);
  const newDistance = calculateFovDistanceCompensation(gizmoBaseFov, gizmoFov, gizmoBaseDistance, gizmoFocusOffset);

  internalCamera.fov = gizmoFov;
  internalCamera.position.set(0, 0, newDistance);
  internalCamera.near = Math.max(0.01, newDistance - gizmoDepthMargin);
  internalCamera.far = newDistance + gizmoDepthMargin;
  internalCamera.updateProjectionMatrix();
}

// ── Container resolution ────────────────────────────────────────────────────

/**
 * Resolve the gizmo container element from a string selector, an element
 * reference, or fall back to the renderer's parent element.
 *
 * @returns The resolved container, or `undefined` if none could be found.
 */
export function resolveGizmoContainer(
  container: HTMLElement | string | undefined,
  glDomElement: HTMLCanvasElement,
): HTMLElement | undefined {
  if (typeof container === 'string') {
    return document.querySelector<HTMLElement>(container) ?? undefined;
  }

  return container ?? glDomElement.parentElement ?? undefined;
}

// ── Canvas resize sync (shared R3F `gl`) ─────────────────────────────────────

type GizmoRefLike = Readonly<{
  current: ViewportGizmo | undefined;
}>;

/**
 * Re-run `ViewportGizmo.update()` when the R3F canvas size changes so
 * `ViewportGizmo.render()` restores the correct full-canvas viewport (the library
 * caches `_originalViewport` and has no built-in resize listener).
 */
export function useGizmoResizeSync(gizmoRef: GizmoRefLike): void {
  const size = useThree((state) => state.size);
  useEffect(() => {
    gizmoRef.current?.update();
  }, [gizmoRef, size.width, size.height]);
}
