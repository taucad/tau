/**
 * Shared utilities for viewport gizmo components: the cube's field of view and its container.
 */

import { MathUtils } from 'three';
import { calculateGizmoFovFromAngle } from '#graphics/three/utils/math.utils.js';

/**
 * The view cube's `fieldOfView` option for the viewport camera's field of view slider: the dampened gizmo field of
 * view, in radians. The library keeps the cube's apparent size.
 *
 * @param cameraFovAngle - The viewport's field of view slider value, 0 to 90.
 * @returns Radians, for `GizmoOptions.fieldOfView`.
 */
export function gizmoFieldOfView(cameraFovAngle: number): number {
  return MathUtils.degToRad(calculateGizmoFovFromAngle(cameraFovAngle));
}

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
