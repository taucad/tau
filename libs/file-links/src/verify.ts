import { decodeBase64, encodeBase64Url, fileLinkKeyIdPattern } from '#key.js';
import { parseFileLinkPath } from '#path.js';
import type { FileLinkLocation } from '#path.js';
import {
  fileLinkClockSkewSeconds,
  fileLinkMaximumBytes,
  fileLinkMaximumLifetimeSeconds,
  fileLinkMessage,
} from '#sign.js';

/**
 * Why a link was refused, as `X-Tau-Files-Error` spells it.
 *
 * `malformed` is a path, id or query that is not a link at all (400).
 * `expired` is a link outside its validity window: past its expiry plus skew,
 * or valid for longer than any link the API mints (403). `key` names a key id
 * the Worker does not hold (403). `signature` is a signature that does not
 * verify (403).
 *
 * @public
 */
export type FileLinkRefusal = 'malformed' | 'expired' | 'key' | 'signature';

/**
 * A verified link: the object it names and the claims it carried.
 *
 * @public
 */
export type VerifiedFileLink = Readonly<{
  location: FileLinkLocation;
  size: number;
  expiresAt: number;
  kid: string;
}>;

/**
 * The outcome of {@link verifyFileLink}.
 *
 * @public
 */
export type FileLinkVerification =
  | Readonly<{ ok: true; link: VerifiedFileLink }>
  | Readonly<{ ok: false; reason: FileLinkRefusal }>;

/**
 * What the Worker hands the verifier.
 *
 * @public
 */
export type VerifyFileLinkInput = Readonly<{
  /** The request's raw path, exactly as sent. */
  path: string;
  /** The request's raw query, with or without its leading `?`. */
  search: string;
  /** This Worker's own host (`FILES_AUDIENCE`). */
  audience: string;
  /** Unix time now, in seconds. */
  now: number;
  /** The verify key for a key id, or `undefined` when this Worker does not hold that generation. */
  keyFor: (kid: string) => CryptoKey | undefined;
}>;

const sizePattern = /^(?:0|[1-9]\d{0,8})$/u;
const expiryPattern = /^[1-9]\d{0,10}$/u;
const signaturePattern = /^[A-Za-z0-9_-]{43}$/u;
const parameterNames: ReadonlySet<string> = new Set(['n', 'x', 'k', 's']);

const refuse = (reason: FileLinkRefusal): FileLinkVerification => ({ ok: false, reason });

/**
 * Read a raw query into exactly the four link parameters.
 *
 * Nothing is percent-decoded: no valid value needs an escape. An unknown, a
 * repeated or an empty parameter refuses the whole link, so a signed URL can
 * never be extended.
 *
 * @param search - The raw query.
 * @returns The four values, or `undefined`.
 */
const linkParameters = (search: string): ReadonlyMap<string, string> | undefined => {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const values = new Map<string, string>();
  for (const pair of query.split('&')) {
    const separator = pair.indexOf('=');
    const name = separator === -1 ? pair : pair.slice(0, separator);
    if (separator === -1 || !parameterNames.has(name) || values.has(name)) {
      return undefined;
    }
    values.set(name, pair.slice(separator + 1));
  }
  return values.size === parameterNames.size ? values : undefined;
};

/**
 * Every claim a link's path and query carry, or `undefined` when any is not well formed.
 *
 * @param path - The raw path.
 * @param search - The raw query.
 * @returns The parsed claims and the decoded signature.
 */
const readClaims = (
  path: string,
  search: string,
):
  | Readonly<{
      location: FileLinkLocation;
      size: number;
      expiresAt: number;
      kid: string;
      signature: Uint8Array<ArrayBuffer>;
    }>
  | undefined => {
  const location = parseFileLinkPath(path);
  const parameters = linkParameters(search);
  if (location === undefined || parameters === undefined) {
    return undefined;
  }
  const sizeText = parameters.get('n') ?? '';
  const expiryText = parameters.get('x') ?? '';
  const kid = parameters.get('k') ?? '';
  const signatureText = parameters.get('s') ?? '';
  const signature = signaturePattern.test(signatureText) ? decodeBase64(signatureText) : undefined;
  /* Canonical only: the last of 43 characters carries two spare bits, so four spellings would decode alike. */
  if (
    !sizePattern.test(sizeText) ||
    !expiryPattern.test(expiryText) ||
    !fileLinkKeyIdPattern.test(kid) ||
    signature?.byteLength !== 32 ||
    encodeBase64Url(signature) !== signatureText ||
    Number(sizeText) > fileLinkMaximumBytes
  ) {
    return undefined;
  }
  return { location, size: Number(sizeText), expiresAt: Number(expiryText), kid, signature };
};

/**
 * Verify one files link, in the order the Worker refuses: shape, then expiry,
 * then key, then signature, all before any storage read.
 *
 * The signature is checked with `crypto.subtle.verify`, which compares in
 * constant time and is the only operation a verify-only key allows.
 *
 * @param input - The raw path and query, this Worker's audience, the time and its keys.
 * @returns The verified link, or why it was refused.
 * @public
 *
 * @example <caption>Verify a request in the Worker</caption>
 * ```typescript
 * import { verifyFileLink } from '@taucad/file-links';
 *
 * declare const request: Request;
 * declare const key: CryptoKey;
 * const url = new URL(request.url);
 * const verdict = await verifyFileLink({
 *   path: url.pathname,
 *   search: url.search,
 *   audience: 'files.taucad.dev',
 *   now: Math.floor(Date.now() / 1000),
 *   keyFor: (kid) => (kid === 'files-1-0123456789abcdef' ? key : undefined),
 * });
 * ```
 */
export const verifyFileLink = async (input: VerifyFileLinkInput): Promise<FileLinkVerification> => {
  const claims = readClaims(input.path, input.search);
  if (claims === undefined) {
    return refuse('malformed');
  }
  const { location, size, expiresAt, kid, signature } = claims;
  if (input.now > expiresAt + fileLinkClockSkewSeconds || expiresAt - input.now > fileLinkMaximumLifetimeSeconds) {
    return refuse('expired');
  }
  const key = input.keyFor(kid);
  if (key === undefined) {
    return refuse('key');
  }
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    fileLinkMessage({ audience: input.audience, path: input.path, size, expiresAt, kid }),
  );
  return valid ? { ok: true, link: Object.freeze({ location, size, expiresAt, kid }) } : refuse('signature');
};
