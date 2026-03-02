/**
 * Resolve a CJS default export that may be double-wrapped under dynamic import().
 *
 * When a CJS module sets `module.exports.__esModule = true` with a `default` property:
 * - Static `import x from 'cjs-module'` (tsx/vitest): resolves to `fn` directly
 * - Dynamic `import('cjs-module')` (Node.js native): resolves to `{ default: { __esModule, default: fn } }`,
 *   so the static import binding `x` becomes `{ __esModule, default: fn }` -- not callable.
 *
 * This helper normalizes both cases by unwrapping one level of `default` nesting when the
 * imported value is not directly callable.
 */
export function resolveCjsDefault<T>(imported: T): T {
  if (typeof imported === 'function') {
    return imported;
  }

  if (imported !== null && typeof imported === 'object' && 'default' in imported) {
    const nested = (imported as Record<string, unknown>)['default'];
    if (typeof nested === 'function') {
      return nested as T;
    }
  }

  return imported;
}
