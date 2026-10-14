/**
 * Shared utilities for viewport gizmo components.
 *
 * Extracts common logic (FOV synchronization, container resolution) so that the
 * individual gizmo components only need to declare their configuration differences.
 */

import { useStore } from '@react-three/fiber';
import type { ViewportGizmo } from 'three-viewport-gizmo';
import { useLayoutEffect } from 'react';
import * as THREE from 'three';
import {
  calculateGizmoFovFromAngle,
  calculateFovDistanceCompensation,
  gizmoBaseFov,
  gizmoBaseDistance,
  gizmoDepthMargin,
  gizmoFocusOffset,
} from '#graphics/three/utils/math.utils.js';

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
 * Refresh the gizmo's DOM placement and saved viewport synchronously after R3F
 * resizes the renderer. A React effect can run after a demand frame has already
 * restored the gizmo's old viewport, making that stale viewport permanent.
 * In particular, native fullscreen also enters through react-use-measure's
 * window resize listener, outside the Canvas ResizeObserver's React flush.
 * @param gizmoRef - The gizmo owned by this canvas; read at notification time.
 */
export function useGizmoResizeSync(gizmoRef: GizmoRefLike): void {
  const store = useStore();
  useLayoutEffect(() => {
    let previousSize = store.getState().size;
    let previousDpr = store.getState().viewport.dpr;
    return store.subscribe(({ size, viewport }) => {
      if (
        size.width === previousSize.width &&
        size.height === previousSize.height &&
        size.top === previousSize.top &&
        size.left === previousSize.left &&
        viewport.dpr === previousDpr
      ) {
        return;
      }
      previousSize = size;
      previousDpr = viewport.dpr;
      if (size.width > 0 && size.height > 0) {
        // R3F's renderer-sizing subscription was registered before ours.
        // domUpdate avoids advancing controls or allocating a new gizmo.
        gizmoRef.current?.domUpdate();
      }
    });
  }, [gizmoRef, store]);
}
