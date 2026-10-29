/**
 * Whether a value can key a `WeakMap` or `WeakSet`: an object or a function, not a primitive.
 *
 * @param value - Any value, such as a caught error.
 * @returns `true` when it can be held weakly.
 */
export const isWeakKey = (value: unknown): value is WeakKey =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';
