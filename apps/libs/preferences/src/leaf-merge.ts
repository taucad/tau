type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The value that resets a leaf in a {@link LeafPatch}: the leaf is removed, so it reads as not chosen again.
 *
 * @public
 */
export const resetLeaf: unique symbol = Symbol('resetLeaf');

/**
 * The type of {@link resetLeaf}.
 *
 * @public
 */
export type ResetLeaf = typeof resetLeaf;

type LeafPatchValue<T> =
  NonNullable<T> extends readonly unknown[]
    ? NonNullable<T> | (undefined extends T ? ResetLeaf : never)
    : NonNullable<T> extends PlainObject
      ? LeafPatch<NonNullable<T>>
      : NonNullable<T> | (undefined extends T ? ResetLeaf : never);

/**
 * A leaf-by-leaf write to a section. A leaf given a value is set, whatever the value; an optional leaf given
 * {@link resetLeaf} is reset (removed); a leaf left out is untouched. Arrays are leaves. `version` is never written.
 *
 * @public
 */
export type LeafPatch<T> = {
  [K in Exclude<keyof T, 'version'>]?: LeafPatchValue<T[K]>;
};

function mergeObject(stored: PlainObject, patch: PlainObject): PlainObject {
  const reset = new Set<string>();
  const next: PlainObject = { ...stored };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || key === 'version') {
      continue;
    }
    if (value === resetLeaf) {
      reset.add(key);
    } else if (isPlainObject(value)) {
      const current = next[key];
      next[key] = mergeObject(isPlainObject(current) ? current : {}, value);
    } else {
      next[key] = value;
    }
  }
  return reset.size === 0 ? next : Object.fromEntries(Object.entries(next).filter(([key]) => !reset.has(key)));
}

/**
 * Apply a leaf-by-leaf write to a stored value without changing the leaves it leaves out. The input is not mutated.
 *
 * @param stored - The value as stored, read immediately before the write.
 * @param patch - The leaves to set or reset.
 * @returns The merged value.
 *
 * @example <caption>Set the grid default and reset the preset</caption>
 * ```typescript
 * import { emptyViewerPreferences, mergeLeaves, resetLeaf } from '@taucad/preferences';
 *
 * const next = mergeLeaves(emptyViewerPreferences, {
 *   viewDefaults: { 'display.grid': false },
 *   controls: { preset: resetLeaf },
 * });
 * console.log(next.viewDefaults); // { 'display.grid': false }
 * ```
 *
 * @public
 */
export const mergeLeaves = <T extends PlainObject>(stored: T, patch: LeafPatch<T>): T =>
  mergeObject(stored, patch as PlainObject) as T;

function overlayObject(base: PlainObject, top: PlainObject): PlainObject {
  const next: PlainObject = { ...base };
  for (const [key, value] of Object.entries(top)) {
    if (value === undefined) {
      continue;
    }
    const current = next[key];
    next[key] = isPlainObject(value) && isPlainObject(current) ? overlayObject(current, value) : value;
  }
  return next;
}

/**
 * Lay one copy over another leaf by leaf: every leaf `top` holds wins, and `base` fills only the leaves `top` does not
 * hold. Arrays are leaves.
 *
 * @param base - The copy whose leaves fill the gaps.
 * @param top - The copy whose leaves win.
 * @returns The combined value.
 *
 * @public
 */
export const overlayLeaves = <T extends PlainObject>(base: T, top: T): T => overlayObject(base, top) as T;
