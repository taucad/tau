import { minimatch } from 'minimatch';

/**
 * Type for CORS origin callback function
 * Note: Uses null instead of undefined to match Node.js callback conventions
 */
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Node.js callback pattern requires null for no error
type OriginCallback = (error: Error | null, allow: boolean) => void;

/**
 * Type for CORS origin validation function
 */
type CorsOriginValidatorFunction = (origin: string | undefined, callback: OriginCallback) => void;

/**
 * Maximum number of glob patterns allowed to prevent DoS attacks.
 */
const maxGlobPatterns = 50;

/**
 * Creates a CORS origin validator that supports exact matches and glob patterns.
 * Includes DoS protection via pattern limiting and result caching.
 *
 * @param allowedOrigins - Array of exact origin strings (e.g., "https://example.com")
 * @param globPatterns - Array of glob patterns (e.g., "https://*.example.com")
 * @returns CORS origin validation function
 */
export const createCorsOriginValidator = (
  allowedOrigins: string[],
  globPatterns: string[],
): CorsOriginValidatorFunction => {
  // DoS protection: Limit number of patterns
  if (globPatterns.length > maxGlobPatterns) {
    throw new Error(`Too many CORS glob patterns (${globPatterns.length}). Maximum allowed: ${maxGlobPatterns}`);
  }

  // Cache for glob pattern matching results to avoid repeated computations
  const cache = new Map<string, boolean>();
  const cacheSizeLimit = 1000;

  return (origin, callback) => {
    // Allow requests with no origin (e.g., same-origin, mobile apps, curl)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Validate origin format to prevent malicious inputs
    let isValidUrl = false;
    try {
      const parsedUrl = new URL(origin);
      isValidUrl = Boolean(parsedUrl);
    } catch {
      callback(new Error('Invalid origin format'), false);
      return;
    }

    if (!isValidUrl) {
      callback(new Error('Invalid origin format'), false);
      return;
    }

    // Check exact matches first (fastest)
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    // Check cache for glob pattern results
    if (cache.has(origin)) {
      callback(null, cache.get(origin)!);
      return;
    }

    // Check glob patterns
    const isAllowed = globPatterns.some((pattern) =>
      minimatch(origin, pattern, {
        nocase: false, // Case-sensitive matching for security
        dot: true, // Match dotfiles
        nobrace: true, // Disable brace expansion for performance
        noglobstar: false, // Allow ** patterns
      }),
    );

    // Cache the result (with size limit to prevent memory exhaustion)
    if (cache.size < cacheSizeLimit) {
      cache.set(origin, isAllowed);
    }

    callback(null, isAllowed);
  };
};

/**
 * Separates origins into exact matches and glob patterns.
 *
 * @param origins - Array of origin strings (can be exact URLs or glob patterns)
 * @returns Object with separated exactOrigins and globPatterns arrays
 */
export const separateOriginsAndPatterns = (
  origins: string[],
): {
  exactOrigins: string[];
  globPatterns: string[];
} => {
  const exactOrigins: string[] = [];
  const globPatterns: string[] = [];

  for (const origin of origins) {
    // Check if the origin contains glob special characters
    if (origin.includes('*') || origin.includes('?') || origin.includes('[')) {
      globPatterns.push(origin);
    } else {
      exactOrigins.push(origin);
    }
  }

  return { exactOrigins, globPatterns };
};

/**
 * Creates a CORS origin validator from a list of origins (exact and patterns).
 * Automatically separates exact origins from glob patterns.
 *
 * @param origins - Array of origin strings (can be exact URLs or glob patterns)
 * @returns CORS origin validation function
 */
export const createCorsOriginValidatorFromList = (origins: string[]): CorsOriginValidatorFunction => {
  const { exactOrigins, globPatterns } = separateOriginsAndPatterns(origins);
  return createCorsOriginValidator(exactOrigins, globPatterns);
};

/**
 * The Electron renderer's document origin (rulings D4/C5).
 *
 * A fixed product constant, not a deployment value: the desktop app serves its
 * own SPA over `app://tau`, so this can never be derived from
 * `TAU_FRONTEND_URL`. Admitted for **CORS only** — better-auth's
 * `trustedOrigins` is a separate list, and ruling D7 leaves it untouched.
 *
 * Kept out of `ADDITIONAL_CORS_ORIGINS` deliberately: an ops-level env var is
 * the wrong home for a first-party origin every deployment needs, and B7 was
 * exactly the failure of expecting one to be configured.
 */
export const desktopAppOrigin = 'app://tau';

/**
 * Origins admitted only outside production.
 *
 * `nx dev:desktop ui` serves the desktop renderer from port 3001
 * (`apps/ui/desktop/vite.config.ts:61`) — the web dev server keeps 3000, which
 * is already `TAU_FRONTEND_URL` in a dev setup. Exact strings, and a deployed
 * API must never answer a loopback origin.
 */
const developmentOnlyOrigins = ['http://localhost:3001'];

/**
 * Builds the API's CORS origin validator from the deployment's frontend URL and
 * any extra configured origins, always including {@link desktopAppOrigin}.
 *
 * Every origin allowlist in the API goes through here so a new caller cannot
 * reintroduce B7 by rebuilding the list and forgetting the desktop.
 *
 * @param frontendUrl - The deployment's `TAU_FRONTEND_URL`.
 * @param additionalOrigins - `ADDITIONAL_CORS_ORIGINS`; exact origins or globs.
 * @param nodeEnvironment - The deployment's `NODE_ENV`. Required rather than
 *   optional so a new caller cannot leak {@link developmentOnlyOrigins} into a
 *   production deployment by omitting it.
 * @returns CORS origin validation function.
 */
export const createTauCorsOriginValidator = (
  frontendUrl: string,
  additionalOrigins: readonly string[],
  nodeEnvironment: string,
): CorsOriginValidatorFunction =>
  // `desktopAppOrigin` carries no glob characters, so it is matched exactly —
  // load-bearing, since `new URL()` accepts `app://<anything>`.
  createCorsOriginValidatorFromList([
    frontendUrl,
    desktopAppOrigin,
    ...(nodeEnvironment === 'production' ? [] : developmentOnlyOrigins),
    ...additionalOrigins,
  ]);
