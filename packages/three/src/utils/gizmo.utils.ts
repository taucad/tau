/**
 * Shared utilities for viewport gizmo components.
 *
 * Extracts common logic (canvas/renderer creation, FOV synchronization,
 * container resolution, resource cleanup) so that the individual gizmo
 * components only need to declare their configuration differences.
 */

import type { ViewportGizmo } from 'three-viewport-gizmo';
import * as THREE from 'three';
import {
  calculateGizmoFovFromAngle,
  calculateFovDistanceCompensation,
  gizmoBaseFov,
  gizmoBaseDistance,
  gizmoDepthMargin,
  gizmoFocusOffset,
} from '#utils/math.utils.js';

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

// ── Canvas & renderer creation ──────────────────────────────────────────────

/**
 * Create and configure a canvas element for a viewport gizmo overlay.
 *
 * The canvas is absolutely positioned at bottom-right with a z-index of 10,
 * matching the convention used by all gizmo variants.
 */
export function createGizmoCanvas(className: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.style.position = 'absolute';
  canvas.style.bottom = '0';
  canvas.style.right = '0';
  canvas.style.zIndex = '10';
  return canvas;
}

/**
 * Create and configure a WebGL renderer for a viewport gizmo.
 *
 * Uses alpha + antialias, caps pixel ratio at 2, and clears to transparent.
 */
export function createGizmoRenderer(canvas: HTMLCanvasElement, size: number): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setSize(size, size);
  const dpr = Math.min(globalThis.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x00_00_00, 0);
  return renderer;
}

// ── Resource cleanup ────────────────────────────────────────────────────────

/**
 * Dispose all resources created for a viewport gizmo.
 *
 * Removes event listeners, disposes the gizmo and renderer, removes the
 * canvas from the DOM, and forces WebGL context loss to prevent GPU context
 * exhaustion.
 */
export function disposeGizmoResources({
  gizmo,
  renderer,
  canvas,
  handleChange,
}: {
  gizmo: ViewportGizmo;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  handleChange: () => void;
}): void {
  gizmo.removeEventListener('change', handleChange);
  gizmo.dispose();

  if (canvas.parentElement) {
    canvas.remove();
  }

  renderer.forceContextLoss();
  renderer.dispose();
}
