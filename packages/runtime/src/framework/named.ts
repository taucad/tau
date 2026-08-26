/**
 * Minification-resilient function naming utilities.
 *
 * Bundlers strip function names during minification, producing unreadable
 * stack traces in production (e.g. `async`, `Tm`, `D`). These helpers
 * use `Object.defineProperty` on `Function.prototype.name` to restore
 * meaningful names that survive any bundler configuration.
 */

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- must accept any callable signature
type AnyFunction = (...args: any[]) => any;

/**
 * Set a function's `.name` property so it survives minification.
 * Returns the same function reference for inline use at assignment sites.
 *
 * @public
 *
 * @param name - the desired `.name` for the function
 * @param callable - the function whose `.name` to override
 * @returns the same function reference (for inline chaining)
 *
 * @example <caption>Naming an anonymous function</caption>
 * ```typescript
 * import { named } from '@taucad/runtime/kernel';
 *
 * const handler = named('kernelHandler', async (input: string) => input);
 * ```
 */
export function named<T extends AnyFunction>(name: string, callable: T): T {
  try {
    Object.defineProperty(callable, 'name', { value: name, configurable: true });
  } catch {
    // Some built-in or frozen functions have non-configurable name properties
  }

  return callable;
}

/**
 * Preserve method names on a class prototype for readable production stack traces.
 * Call after the class definition to restore names that bundlers strip.
 *
 * @internal
 *
 * @param target - the class constructor whose prototype methods to name
 * @param methods - array of method names to preserve
 *
 * @example <caption>Preserving method names after bundling</caption>
 * ```typescript
 * class MyWorker { render() {} createGeometry() {} }
 * preserveMethodNames(MyWorker, ['render', 'createGeometry']);
 * ```
 */
export function preserveMethodNames(
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- class instances don't satisfy Record<string, unknown>; object is correct here
  target: abstract new (...args: never[]) => object,
  methods: readonly string[],
): void {
  for (const method of methods) {
    const value = (target.prototype as Record<string, unknown>)[method];
    if (typeof value === 'function') {
      named(method, value as AnyFunction);
    }
  }
}
