import { sign, verify } from 'node:crypto';
import type { SigningKey, VerificationKeys } from '#api/git/forwarding/contract/keys.js';

/**
 * The one token shape the grant and the receipt share (W9 Finding 2):
 * `v.kid.payload.signature`, the payload base64url of canonical JSON and the
 * signature Ed25519 over the ASCII of `v.kid.payload`.
 *
 * `v` and `kid` are outside the payload so a verifier picks the key and the
 * version before it parses anything, and inside it so the signature covers
 * them: a header whose outer `v` or `kid` disagrees with its payload is
 * malformed.
 */

/**
 * JSON with object keys sorted at every depth and `undefined` members dropped,
 * so signer and verifier never disagree on the bytes.
 *
 * @param value - A JSON-shaped value.
 * @returns Its canonical encoding.
 */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('A signed payload holds only finite numbers');
  }
  return JSON.stringify(value);
};

/** Why a token's envelope was refused, before its payload's meaning is looked at. */
export type EnvelopeRejection = 'malformed' | 'unknown_kid' | 'version' | 'signature';

/**
 * Signs a payload that carries its own `v` and `kid`.
 *
 * @param payload - The facts, `v` and `kid` included.
 * @param key - The signer's key; its kid must be the payload's.
 * @returns The token.
 */
export const signToken = <Payload extends { readonly v: number; readonly kid: string }>(
  payload: Payload,
  key: SigningKey,
): string => {
  if (payload.kid !== key.kid) {
    throw new Error('A token is signed under the kid its payload names');
  }
  const head = `${String(payload.v)}.${payload.kid}.${Buffer.from(canonicalJson(payload)).toString('base64url')}`;
  return `${head}.${sign(null, Buffer.from(head), key.key).toString('base64url')}`;
};

/**
 * Opens a token: its version is accepted, its kid is held, its signature is
 * the kid's and its payload agrees with its envelope.
 *
 * @param token - The token as received.
 * @param args - The verifier's keys and the contract versions it accepts.
 * @returns The parsed payload, or why the envelope was refused.
 */
export const openToken = (
  token: string,
  args: { readonly keys: VerificationKeys; readonly acceptedVersions: ReadonlySet<number> },
):
  | { readonly ok: true; readonly payload: Record<string, unknown> }
  | { readonly ok: false; readonly reason: EnvelopeRejection } => {
  const parts = token.split('.');
  if (parts.length !== 4 || parts.some((part) => part === '')) {
    return { ok: false, reason: 'malformed' };
  }
  const [versionText = '', kid = '', encoded = '', signature = ''] = parts;
  const version = Number(versionText);
  if (!/^\d{1,4}$/u.test(versionText) || !Number.isSafeInteger(version)) {
    return { ok: false, reason: 'malformed' };
  }
  if (!args.acceptedVersions.has(version)) {
    return { ok: false, reason: 'version' };
  }
  const key = args.keys.get(kid);
  if (key === undefined) {
    return { ok: false, reason: 'unknown_kid' };
  }
  const head = `${versionText}.${kid}.${encoded}`;
  if (!verify(null, Buffer.from(head), key, Buffer.from(signature, 'base64url'))) {
    return { ok: false, reason: 'signature' };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    (payload as { v?: unknown }).v !== version ||
    (payload as { kid?: unknown }).kid !== kid
  ) {
    return { ok: false, reason: 'malformed' };
  }
  return { ok: true, payload: payload as Record<string, unknown> };
};

/**
 * The versions a verifier at `current` accepts: N and N-1, so either side can
 * be one release behind the other while a deploy rolls (FR12).
 *
 * @param current - The verifier's own contract version.
 * @returns `{current, current - 1}`.
 */
export const acceptedVersions = (current: number): ReadonlySet<number> => new Set([current, current - 1]);
