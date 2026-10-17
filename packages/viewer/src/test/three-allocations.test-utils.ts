/**
 * Counts constructions of a Three.js math class while `run` executes. The class constructor's first write to
 * `field` (such as `this.x = x` in `Vector3`) meets a prototype setter that counts it and then defines the
 * ordinary own property, so instances behave as usual. `field` must be an own instance field the constructor
 * assigns, never a prototype accessor of the class.
 */
export const countConstructions = <T>(
  prototype: Readonly<{ constructor: unknown }>,
  field: string,
  run: () => T,
): Readonly<{ result: T; constructions: number }> => {
  let constructions = 0;
  Object.defineProperty(prototype, field, {
    configurable: true,
    // Never read: the constructor's write replaces this accessor with an own property first.
    get: () => undefined,
    set(this: Record<string, unknown>, value: unknown) {
      constructions += 1;
      Object.defineProperty(this, field, { value, writable: true, enumerable: true, configurable: true });
    },
  });
  try {
    return { result: run(), constructions };
  } finally {
    Reflect.deleteProperty(prototype, field);
  }
};
