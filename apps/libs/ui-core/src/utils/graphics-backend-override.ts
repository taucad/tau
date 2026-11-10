import type { GraphicsBackendPreference, ResolvedGraphicsBackend } from '@taucad/viewer/graphics/graphics-settings';
import { resolveGraphicsBackendPreference } from '@taucad/viewer/graphics/graphics-backend';
import { searchParameterName } from '#constants/search-parameter.constants.js';

/**
 * Query-param override for e2e and manual testing (whole-tab).
 *
 * Neither {@link useSearchParameter} nor a codec fits this one (D3): it is read
 * outside React, and its "absent" value is `undefined` rather than a member of
 * `GraphicsBackendPreference`, so a codec would need a sentinel that the domain
 * type does not have. What it does share is the name.
 */
const graphicsBackendQueryValues: readonly string[] = ['webgl', 'webgpu'] satisfies GraphicsBackendPreference[];

/**
 * Parse `graphicsBackend` from a URL search string.
 *
 * Validates against `GraphicsBackendPreference` tokens and returns undefined when absent / invalid.
 *
 * @param search - A `location.search` string, with or without the leading `?`.
 * @returns The override, or undefined when the parameter is absent or outside the vocabulary.
 */
export function parseGraphicsBackendQueryOverride(search: string): GraphicsBackendPreference | undefined {
  const raw = new URLSearchParams(search).get(searchParameterName.graphicsBackend);
  return raw !== null && graphicsBackendQueryValues.includes(raw) ? (raw as GraphicsBackendPreference) : undefined;
}

/**
 * Read `graphicsBackend` from the current URL (browser only), for callers outside React. React callers parse the
 * router location instead, so a client-side navigation that changes the parameter re-renders them.
 *
 * Validates against `GraphicsBackendPreference` tokens and returns undefined when absent / invalid.
 */
export function readGraphicsBackendQueryOverride(): GraphicsBackendPreference | undefined {
  const browserWindow = Reflect.get(globalThis, 'window') as Window | undefined;
  if (browserWindow === undefined) {
    return undefined;
  }

  return parseGraphicsBackendQueryOverride(browserWindow.location.search);
}

/**
 * The viewer's backend preference: the internal URL override, else the experimental flag.
 *
 * @param webGpuEnabled - The `webGpu` feature flag.
 * @param override - The URL override, if any.
 * @returns The preference the viewer should request.
 */
export function resolveViewerGraphicsBackendPreference(
  webGpuEnabled: boolean,
  override: GraphicsBackendPreference | undefined,
): GraphicsBackendPreference {
  return override ?? (webGpuEnabled ? 'webgpu' : 'webgl');
}

/** Resolve the experimental viewer flag, with the internal URL override taking precedence. */
export function resolveViewerGraphicsBackend(webGpuEnabled: boolean, gpuAvailable: boolean): ResolvedGraphicsBackend {
  return resolveGraphicsBackendPreference(
    resolveViewerGraphicsBackendPreference(webGpuEnabled, readGraphicsBackendQueryOverride()),
    gpuAvailable,
  );
}
