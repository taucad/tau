/**
 * Minimal `document` stub for Web Worker contexts.
 *
 * Bundlers like Vite wrap dynamic `import()` calls with a modulepreload helper
 * (`__vite_preload`) that injects `<link rel="modulepreload">` elements via the
 * DOM. When those chunks are loaded inside a Web Worker — where `document` is
 * undefined — the helper crashes with "document is not defined".
 *
 * This polyfill provides no-op DOM stubs so the preload helper's link-injection
 * branch executes harmlessly (creating inert objects that are never rendered).
 * The actual dynamic `import()` still runs normally.
 *
 * IMPORTANT: Only `document` is stubbed, NOT `window`. Our environment detection
 * (`getEnvironment()`) checks `globalThis.window === undefined` to distinguish
 * workers from browsers, so `window` must remain absent.
 *
 * This module MUST be the first static import in the worker entry point so that
 * the stub is in place before any bundler-injected preload code executes.
 */

if (typeof document === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op for DOM stub
  const noop = (): void => {};
  const noopElement = {
    rel: '',
    as: '',
    crossOrigin: '',
    href: '',
    setAttribute: noop,
    addEventListener: noop,
  };

  (globalThis as unknown as Record<string, unknown>)['document'] = {
    getElementsByTagName: () => [],
    querySelector: () => null,
    createElement: () => noopElement,
    head: { appendChild: noop },
  };
}
