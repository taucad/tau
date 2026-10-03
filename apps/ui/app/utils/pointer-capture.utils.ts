/**
 * Pointer capture that never throws into an event handler.
 *
 * `setPointerCapture` and `releasePointerCapture` raise a `NotFoundError`
 * DOMException when the pointer id is no longer an active pointer, which
 * happens when the browser has already ended the pointer session (Safari
 * reports it as "The object can not be found here."). Capture is an
 * enhancement for drags that leave the element; the gesture still ends through
 * its own pointerup or pointercancel handling, so a refused capture is ignored
 * rather than surfaced as an uncaught error.
 */

/**
 * Capture a pointer on an element, ignoring a pointer the browser no longer tracks.
 *
 * @param element - The element that should receive the pointer's events.
 * @param pointerId - The `pointerId` of the pointer to capture.
 */
export const capturePointer = (element: Element, pointerId: number): void => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // The pointer session already ended; the gesture's own end handling still runs.
  }
};

/**
 * Release a pointer the element holds, ignoring one it no longer holds.
 *
 * @param element - The element that captured the pointer.
 * @param pointerId - The `pointerId` of the captured pointer.
 */
export const releasePointer = (element: Element, pointerId: number): void => {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // The pointer session already ended, which released the capture implicitly.
  }
};
