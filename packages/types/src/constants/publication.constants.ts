/**
 * Stable wire-format `code` strings on publication API JSON error bodies (Nest `Exception` payloads).
 *
 * @public
 */
/* eslint-disable @typescript-eslint/naming-convention -- wire-format codes are CONSTANT_CASE */
export const publicationApiCode = {
  INVALID_PATH: 'INVALID_PATH',
  FORBIDDEN_PATH: 'FORBIDDEN_PATH',
  MISSING_ENTRY_FILE: 'MISSING_ENTRY_FILE',
  TOO_MANY_FILES: 'TOO_MANY_FILES',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  PROJECT_FORBIDDEN: 'PROJECT_FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  GONE: 'GONE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  /** Publication view PATCH exceeded per-viewer daily rate limit */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Authenticated owner viewing their own publication — durable counter skipped */
  OWNER_SELF_VIEW: 'OWNER_SELF_VIEW',
  /** Signed `tau_view_id` cookie failed verification */
  INVALID_VIEW_COOKIE: 'INVALID_VIEW_COOKIE',
} as const;
/* eslint-enable @typescript-eslint/naming-convention -- CONSTANT_CASE publicationApiCode ends here */

/**
 * Cookie name for anonymous publication viewer deduplication (signed).
 *
 * @public
 */
export const publicationViewCookieName = 'tau_view_id';

/**
 * @public
 */
export type PublicationApiCode = (typeof publicationApiCode)[keyof typeof publicationApiCode];

/**
 * Every {@link publicationApiCode} value (for guards / iteration).
 *
 * @public
 */
export const publicationApiCodes = Object.values(publicationApiCode) as PublicationApiCode[];

/**
 * @public
 */
export function isPublicationApiCode(value: unknown): value is PublicationApiCode {
  return typeof value === 'string' && publicationApiCodes.includes(value as PublicationApiCode);
}

/**
 * Path prefixes always rejected by publish. Anything under `.tau/` is rejected via the
 * separate {@link isPublishableTauPath} rule which allows `.tau/parameters/` only.
 *
 * @public
 */
export const publishForbiddenPathPrefixes = ['node_modules/', '.git/objects/', 'dist/', 'out-tsc/'] as const;

/**
 * The single subdirectory under `.tau/` that ships with publications (parameter overrides
 * consumed by `parameterFileResolverMiddleware`). Everything else under `.tau/` (artifacts,
 * cache, transcripts, skills, exports, AGENTS.md, etc.) is local-only.
 *
 * @public
 */
export const publishableTauSubdirectory = '.tau/parameters/';

/**
 * Returns `true` when a `.tau/`-prefixed path is allowed in publications.
 *
 * @public
 */
export function isPublishableTauPath(normalizedPath: string): boolean {
  if (!normalizedPath.startsWith(publishableTauSubdirectory)) {
    return false;
  }

  return normalizedPath.length > publishableTauSubdirectory.length;
}

/**
 * Client-side publish collection failures aligned with {@link publicationApiCode} upload validation.
 *
 * @public
 */
export type PublicationCollectFailureCode =
  | typeof publicationApiCode.MISSING_ENTRY_FILE
  | typeof publicationApiCode.TOO_MANY_FILES
  | typeof publicationApiCode.FILE_TOO_LARGE
  | typeof publicationApiCode.PAYLOAD_TOO_LARGE;
