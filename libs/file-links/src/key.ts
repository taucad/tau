/**
 * Files link keys: ids, the API's signing-key secret and WebCrypto import.
 *
 * Only `globalThis.crypto.subtle` is used, so the same code runs in Node (the
 * API) and in a Cloudflare Worker. The Worker never imports key bytes: it gets
 * a verify-only, non-extractable `CryptoKey` from a `secret_key` binding.
 */

import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';

/**
 * A key id: `files-<generation>-<first 16 hex of sha256(key)>`.
 *
 * @public
 */
export const fileLinkKeyIdPattern = /^files-[1-9]\d{0,5}-[0-9a-f]{16}$/u;

/** The HMAC key length the generator (`random_bytes`, 32) produces, and the least accepted. @public */
export const fileLinkKeyBytes = 32;

/** The import parameters every files link key uses, on both sides. @public */
export const fileLinkKeyAlgorithm = Object.freeze({ name: 'HMAC', hash: 'SHA-256' });

/**
 * The API's signing secret (`TAU_FILES_LINK_SIGNING_KEY`), parsed.
 *
 * @public
 */
export type FileLinkSigningSecret = Readonly<{ kid: string; alg: 'HS256'; keyBase64: string }>;

/**
 * A key ready to sign or verify, with its id.
 *
 * @public
 */
export type FileLinkKey = Readonly<{ kid: string; key: CryptoKey }>;

/**
 * Decode standard or URL-safe base64, padded or not.
 *
 * @param value - The base64 text.
 * @returns The bytes, or `undefined` when the text is not base64.
 * @public
 */
export const decodeBase64 = (value: string): Uint8Array<ArrayBuffer> | undefined => {
  const unpadded = value.replace(/={1,2}$/u, '');
  if (!/^[A-Za-z0-9+/_-]*$/u.test(unpadded) || unpadded.length % 4 === 1) {
    return undefined;
  }
  try {
    return new Uint8Array(base64ToUint8Array(unpadded.replaceAll('+', '-').replaceAll('/', '_')));
  } catch {
    return undefined;
  }
};

/**
 * Encode bytes as unpadded base64url, the signature's spelling in a link.
 *
 * @param bytes - The bytes.
 * @returns Base64url text without `=` padding.
 * @public
 */
export const encodeBase64Url = (bytes: Uint8Array<ArrayBuffer>): string => uint8ArrayToBase64(bytes, { urlSafe: true });

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * The key id a generation's key bytes earn, as tau-cloud's `files-link-keys` module computes it.
 *
 * @param generation - The key generation, from 1.
 * @param keyBytes - The raw HMAC key.
 * @returns `files-<generation>-<first 16 hex of sha256(key)>`.
 * @public
 */
export const fileLinkKeyId = async (generation: number, keyBytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  if (!Number.isInteger(generation) || generation < 1 || generation > 999_999) {
    throw new RangeError('A files link key generation is a whole number from 1.');
  }
  const digest = await crypto.subtle.digest('SHA-256', keyBytes);
  return `files-${String(generation)}-${hex(digest).slice(0, 16)}`;
};

/**
 * Parse `TAU_FILES_LINK_SIGNING_KEY`: JSON `{kid, alg: "HS256", keyBase64}`.
 *
 * The error never repeats the value, so a refused secret cannot reach a log.
 *
 * @param json - The secret's text.
 * @returns The parsed secret.
 * @throws TypeError - When the text is not that shape, the kid is not a files key id, or the key is shorter than 32 bytes.
 * @public
 */
export const parseFileLinkSigningSecret = (json: string): FileLinkSigningSecret => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new TypeError('The files link signing key is not JSON.');
  }
  const record = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Readonly<Record<string, unknown>>;
  const { kid, alg, keyBase64 } = record;
  if (typeof kid !== 'string' || !fileLinkKeyIdPattern.test(kid)) {
    throw new TypeError('The files link signing key has no valid kid (files-<generation>-<16 hex>).');
  }
  if (alg !== 'HS256') {
    throw new TypeError('The files link signing key must have alg "HS256".');
  }
  const bytes = typeof keyBase64 === 'string' ? decodeBase64(keyBase64) : undefined;
  if (typeof keyBase64 !== 'string' || bytes === undefined || bytes.byteLength < fileLinkKeyBytes) {
    throw new TypeError(`The files link signing key must hold at least ${String(fileLinkKeyBytes)} base64 bytes.`);
  }
  return Object.freeze({ kid, alg, keyBase64 });
};

/**
 * Import the API's signing secret as a sign-only, non-extractable key.
 *
 * The kid's hash suffix is checked against the key bytes, so a secret whose
 * kid and key were copied from different generations is refused at boot, not
 * discovered as a universal `403` at the Worker.
 *
 * @param secret - The parsed secret.
 * @returns The key and its id.
 * @throws TypeError - When the kid does not name these key bytes.
 * @public
 */
export const importFileLinkSigningKey = async (secret: FileLinkSigningSecret): Promise<FileLinkKey> => {
  const bytes = decodeBase64(secret.keyBase64);
  const generation = Number(secret.kid.split('-')[1]);
  if (bytes === undefined || (await fileLinkKeyId(generation, bytes)) !== secret.kid) {
    throw new TypeError('The files link signing key kid does not match its key bytes.');
  }
  const key = await crypto.subtle.importKey('raw', bytes, fileLinkKeyAlgorithm, false, ['sign']);
  return Object.freeze({ kid: secret.kid, key });
};

/**
 * Import raw key bytes as a verify-only key, as the Worker's `secret_key` binding does.
 *
 * For tests and local development; the deployed Worker receives its keys from bindings.
 *
 * @param keyBytes - The raw HMAC key.
 * @returns A non-extractable verify-only key.
 * @public
 */
export const importFileLinkVerifyKey = async (keyBytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', keyBytes, fileLinkKeyAlgorithm, false, ['verify']);
