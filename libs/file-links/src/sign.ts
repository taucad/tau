import { encodeBase64Url } from '#key.js';
import type { FileLinkKey } from '#key.js';
import { fileLinkPath } from '#path.js';
import type { FileLinkLocation } from '#path.js';

/** The canonical message's version line. A new format is a new line, never a reinterpretation. @public */
export const fileLinkVersion = 'tau-files-v1';

/** The largest object a link may name: STO-18's 100 MiB per-file limit. @public */
export const fileLinkMaximumBytes = 104_857_600;

/** How long the API makes a link live, the same as its presigned transfers. Seconds. @public */
export const fileLinkLifetimeSeconds = 900;

/** Clock skew tolerated between the API that mints and the Worker that verifies. Seconds. @public */
export const fileLinkClockSkewSeconds = 30;

/** The longest validity a Worker accepts: the lifetime plus twice the skew. Seconds. @public */
export const fileLinkMaximumLifetimeSeconds = fileLinkLifetimeSeconds + 2 * fileLinkClockSkewSeconds;

/**
 * The claims one link carries, all of them signed.
 *
 * @public
 */
export type FileLinkClaims = Readonly<{
  /** The files host the link is for, e.g. `files.taucad.dev`; never in the URL, always in the message. */
  audience: string;
  /** The exact request path, from {@link fileLinkPath}. */
  path: string;
  /** The object's size in bytes. */
  size: number;
  /** Unix time, in seconds, after which the link is refused (plus skew). */
  expiresAt: number;
  /** The id of the key that signed it. */
  kid: string;
}>;

/**
 * The exact bytes a link's signature covers.
 *
 * UTF-8 of `tau-files-v1\n<audience>\nGET\n<path>\n<n>\n<x>\n<k>`. The method
 * is fixed to GET; a HEAD is verified against the same signature.
 *
 * @param claims - The link's claims.
 * @returns The message to sign or verify.
 * @public
 */
export const fileLinkMessage = (claims: FileLinkClaims): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(
    [
      fileLinkVersion,
      claims.audience,
      'GET',
      claims.path,
      String(claims.size),
      String(claims.expiresAt),
      claims.kid,
    ].join('\n'),
  );

/**
 * What the API needs to mint one link.
 *
 * @public
 */
export type SignFileLinkInput = Readonly<{
  /** The files origin, `https://files.<zone>`: `TAU_FILES_BASE_URL`. Its host is the audience. */
  baseUrl: string;
  location: FileLinkLocation;
  /** The object's size in bytes, as the batch request and the store agree. */
  size: number;
  /** Unix time in seconds after which the link is refused. */
  expiresAt: number;
  /** The signing key (`usages: ["sign"]`). */
  key: FileLinkKey;
}>;

/**
 * The origin a files base URL names, refusing anything with a path, query or credentials.
 *
 * @param baseUrl - `TAU_FILES_BASE_URL`.
 * @returns The URL's origin and host.
 * @throws TypeError - When it is not a bare `http(s)` origin.
 * @public
 */
export const fileLinkOrigin = (baseUrl: string): Readonly<{ origin: string; audience: string }> => {
  const url = new URL(baseUrl);
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username !== '' ||
    url.password !== '' ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new TypeError('The files base URL must be a bare origin, such as https://files.taucad.dev.');
  }
  return Object.freeze({ origin: url.origin, audience: url.host });
};

/**
 * Mint one files link.
 *
 * @param input - The origin, object, size, expiry and key.
 * @returns `https://files.<zone>/v1/lfs/...?n=<size>&x=<exp>&k=<kid>&s=<sig>`.
 * @throws RangeError - When the size is not a whole number up to {@link fileLinkMaximumBytes}, or the expiry is not whole seconds.
 * @public
 *
 * @example <caption>Mint a link with the API secret</caption>
 * ```typescript
 * import { importFileLinkSigningKey, parseFileLinkSigningSecret, signFileLink } from '@taucad/file-links';
 *
 * declare const secretJson: string;
 * const key = await importFileLinkSigningKey(parseFileLinkSigningSecret(secretJson));
 * const href = await signFileLink({
 *   baseUrl: 'https://files.taucad.dev',
 *   location: { layout: 'tenant', ownerId: 'user_1', projectId: 'proj_1', oid: 'a'.repeat(64) },
 *   size: 1024,
 *   expiresAt: Math.floor(Date.now() / 1000) + 900,
 *   key,
 * });
 * ```
 */
export const signFileLink = async (input: SignFileLinkInput): Promise<string> => {
  if (!Number.isSafeInteger(input.size) || input.size < 0 || input.size > fileLinkMaximumBytes) {
    throw new RangeError(`A files link names an object of 0 to ${String(fileLinkMaximumBytes)} bytes.`);
  }
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt < 1) {
    throw new RangeError('A files link expiry is whole Unix seconds.');
  }
  const { origin, audience } = fileLinkOrigin(input.baseUrl);
  const path = fileLinkPath(input.location);
  const claims: FileLinkClaims = { audience, path, size: input.size, expiresAt: input.expiresAt, kid: input.key.kid };
  const signature = await crypto.subtle.sign('HMAC', input.key.key, fileLinkMessage(claims));
  const query = `n=${String(input.size)}&x=${String(input.expiresAt)}&k=${input.key.kid}&s=${encodeBase64Url(
    new Uint8Array(signature),
  )}`;
  return `${origin}${path}?${query}`;
};
