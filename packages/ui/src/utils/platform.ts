/**
 * Platform detection utilities.
 *
 * Uses the User-Agent Client Hints API (`navigator.userAgentData.platform`)
 * when available (Chrome 93+, Edge 90+), with a fallback to the deprecated
 * `navigator.platform` for Firefox and Safari which do not yet support the
 * modern API.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData/platform
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/platform
 */

/**
 * Detected OS platform: `'mac'` for macOS/iOS, `'other'` for everything else.
 * @public
 */
export type DetectedPlatform = 'mac' | 'other';

/**
 * The platform server rendering and hydration both assume, since neither can read a
 * `navigator`. Anything rendered from the platform reads it through
 * `@taucad/ui/hooks/use-platform`, so the server markup and the hydrating client render
 * agree and React swaps in the real platform once hydration is done.
 *
 * @public
 */
export const serverPlatform: DetectedPlatform = 'mac';

const macPlatformPattern = /mac|iphone|ipad|ipod/i;

/**
 * Detect the platform a document request came from, so a server render can label shortcuts
 * the way the browser will. Reads the `Sec-CH-UA-Platform` client hint, which Chromium sends
 * on every secure request without opting in, and falls back to the `User-Agent` string for
 * Firefox and Safari. A request that names neither gets {@link serverPlatform}.
 *
 * @param headers - Carries `Sec-CH-UA-Platform` and `User-Agent`.
 * @returns `'mac'` for macOS and iOS clients, `'other'` for the rest.
 * @public
 *
 * @example <caption>Pass the request platform to the render</caption>
 * ```typescript
 * import { detectRequestPlatform } from '@taucad/ui/utils/platform';
 *
 * export const loader = ({ request }: { request: Request }) => ({
 *   platform: detectRequestPlatform(request.headers),
 * });
 * ```
 */
export function detectRequestPlatform(headers: Headers): DetectedPlatform {
  const platform = headers.get('Sec-CH-UA-Platform') ?? headers.get('User-Agent');
  if (!platform) {
    return serverPlatform;
  }
  return macPlatformPattern.test(platform) ? 'mac' : 'other';
}

/**
 * Extended Navigator type that includes the experimental `userAgentData` property.
 * This property is available in Chromium-based browsers (Chrome 90+, Edge 90+)
 * but not in Firefox or Safari as of early 2026.
 */
type NavigatorWithUaData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

/**
 * Detect the current platform. Returns `'mac'` for macOS/iOS, `'other'` for
 * Windows, Linux, and everything else.
 *
 * During SSR (when `navigator` is unavailable), returns {@link serverPlatform}.
 * Calling this during a render is a hydration hazard: a subtree that hydrates after
 * the client has detected a non-Mac platform would render text the server never sent.
 * Rendered platform labels read `usePlatform` from `@taucad/ui/hooks/use-platform`
 * instead; this function serves event matching and other non-rendering callers.
 *
 * @public
 *
 * @example <caption>Pick the modifier glyph</caption>
 * ```typescript
 * import { detectPlatform } from '@taucad/ui/utils/platform';
 *
 * const modifierSymbol = detectPlatform() === 'mac' ? '⌘' : 'Ctrl';
 * ```
 */
export function detectPlatform(): DetectedPlatform {
  if (typeof navigator === 'undefined') {
    return serverPlatform;
  }

  // Prefer the modern User-Agent Client Hints API (Chromium 93+).
  // Falls back to the deprecated navigator.platform for Firefox/Safari.
  const { userAgentData } = navigator as NavigatorWithUaData;

  // oxlint-disable-next-line @typescript-eslint/no-deprecated -- Required fallback for Firefox/Safari
  const platform = userAgentData?.platform ?? navigator.platform;

  return macPlatformPattern.test(platform) ? 'mac' : 'other';
}
