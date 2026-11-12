/**
 * How a graphics owner machine records a defect its root `onError` caught (MC-R12).
 *
 * @module
 */

/**
 * The defect's message: an `Error`'s, or the one XState gives a send to no child (a plain object), or the value
 * itself as text.
 *
 * @param error - What the root `onError` was handed.
 * @returns The text to keep as the machine's `fault`.
 */
export const describeFault = (error: unknown): string =>
  String(typeof error === 'object' && error !== null && 'message' in error ? error.message : error);
