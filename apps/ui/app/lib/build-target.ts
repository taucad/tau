/**
 * The single read of the `TAU_TARGET` build define (charter D2).
 *
 * Two properties this file exists to protect:
 *
 * 1. **Dotted, not bracketed.** Vite's `define` is a textual substitution of
 *    `import.meta.env.TAU_TARGET`; `import.meta.env['TAU_TARGET']` is not
 *    replaced, so it reads `undefined` at runtime and the branch survives
 *    minification instead of folding away.
 * 2. **A function, not a module constant.** `vi.stubEnv('TAU_TARGET', …)`
 *    cannot reach a value captured at module evaluation, and six suites drive
 *    both branches that way.
 *
 * @returns Whether this bundle is the Electron desktop build.
 */
export const isDesktopTarget = (): boolean => import.meta.env.TAU_TARGET === 'desktop';
