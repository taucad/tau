/**
 * Response headers and error bodies (blueprint §3.9, §3.11).
 *
 * No error body names a key, an owner, a project or the request path: only a
 * code, so nothing a client logs can leak which object it tried.
 */

/* eslint-disable @typescript-eslint/naming-convention -- R2 binding names (tau-cloud's contract) and HTTP header names are spelled by their owners. */

/** Why a request was refused, as `X-Tau-Files-Error` spells it. */
export type FilesErrorReason = 'malformed' | 'expired' | 'signature' | 'key' | 'missing' | 'range' | 'size' | 'storage';

/** Each refusal's status and body code. */
export const filesErrors = {
  malformed: { status: 400, code: 'FILES_MALFORMED' },
  expired: { status: 403, code: 'FILES_EXPIRED' },
  signature: { status: 403, code: 'FILES_SIGNATURE' },
  key: { status: 403, code: 'FILES_KEY' },
  missing: { status: 404, code: 'FILES_MISSING' },
  range: { status: 416, code: 'FILES_RANGE_NOT_SATISFIABLE' },
  size: { status: 502, code: 'FILES_SIZE_MISMATCH' },
  storage: { status: 503, code: 'FILES_STORAGE_UNAVAILABLE' },
} as const satisfies Record<FilesErrorReason, Readonly<{ status: number; code: string }>>;

/** The body code of a method other than GET, HEAD and OPTIONS. */
export const methodNotAllowedCode = 'FILES_METHOD_NOT_ALLOWED';

/** A private, content-addressed object never changes: cache it for a year, never transform it. */
export const objectCacheControl = 'private, max-age=31536000, immutable, no-transform';

/**
 * A JSON body response that is never cached.
 *
 * @param status - The HTTP status.
 * @param body - The JSON body.
 * @param extra - Further headers.
 * @returns The response headers and status, ready for CORS.
 */
export const jsonResponse = (
  status: number,
  body: Readonly<Record<string, unknown>>,
  extra: Readonly<Record<string, string>> = {},
): Readonly<{ status: number; headers: Headers; body: string }> => ({
  status,
  headers: new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  }),
  body: JSON.stringify(body),
});

/**
 * A refusal: its status, `{"code":"FILES_…"}` and `X-Tau-Files-Error`.
 *
 * @param reason - Why.
 * @param size - The signed size, for a `416`'s `Content-Range`.
 * @returns The response parts.
 */
export const refusal = (
  reason: FilesErrorReason,
  size?: number,
): Readonly<{ status: number; headers: Headers; body: string }> => {
  const { status, code } = filesErrors[reason];
  return jsonResponse(
    status,
    { code },
    {
      'X-Tau-Files-Error': reason,
      ...(reason === 'range' && size !== undefined ? { 'Content-Range': `bytes */${String(size)}` } : {}),
    },
  );
};

/**
 * The headers of a served object, full or partial.
 *
 * @param oid - The object's id, its strong ETag.
 * @param length - The bytes this response carries.
 * @param range - The served range and the full size, when partial.
 * @returns The headers.
 */
export const objectHeaders = (
  oid: string,
  length: number,
  range?: Readonly<{ offset: number; size: number }>,
): Headers =>
  new Headers({
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(length),
    'Cache-Control': objectCacheControl,
    ETag: `"${oid}"`,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    ...(range === undefined
      ? {}
      : {
          'Content-Range': `bytes ${String(range.offset)}-${String(range.offset + length - 1)}/${String(range.size)}`,
        }),
  });

/**
 * The headers of a `304`: the validator and caching, no length or type.
 *
 * @param oid - The object's id, its strong ETag.
 * @returns The headers.
 */
export const notModifiedHeaders = (oid: string): Headers =>
  new Headers({ 'Cache-Control': objectCacheControl, ETag: `"${oid}"`, 'Accept-Ranges': 'bytes' });

/**
 * Whether an `If-None-Match` value matches the object's ETag (weak comparison, RFC 9110 §13.1.2).
 *
 * @param header - The request's `If-None-Match`, if any.
 * @param oid - The object's id.
 * @returns Whether the client already holds these bytes.
 */
export const notModified = (header: string | undefined, oid: string): boolean => {
  if (header === undefined) {
    return false;
  }
  return header
    .split(',')
    .map((tag) => tag.trim().replace(/^W\//u, ''))
    .some((tag) => tag === '*' || tag === `"${oid}"`);
};
