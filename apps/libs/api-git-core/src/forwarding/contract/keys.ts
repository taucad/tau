import { createPrivateKey, createPublicKey } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { z } from 'zod';

/**
 * The Ed25519 keys of the tau-api <-> tau-storage contract (DC1; W9 Finding 2,
 * "Key distribution and rotation"; secrets register § 3a).
 *
 * Two pairs, never one: the grant pair (`TAU_STORAGE_GRANT_SIGNING_KEY` on
 * tau-api, `TAU_STORAGE_GRANT_PUBLIC_KEYS` on tau-storage) and the receipt pair
 * (`TAU_STORAGE_RECEIPT_SIGNING_KEY` on tau-storage,
 * `TAU_STORAGE_RECEIPT_PUBLIC_KEYS` on tau-api). Terraform mints them
 * (tau-cloud `modules/storage-signing-keys`) as JSON: a signer value
 * `{kid, alg, privateKeyPem}` (PKCS#8) and a verifier value, an array of one or
 * two `{kid, alg, publicKeyPem}` (SPKI) — two while a rotation is in flight.
 *
 * Every refusal names the variable and never echoes its value.
 */

/** A key id: `<purpose>-<generation>-<16 hex>`, and never a dot, which separates a token's parts. */
const kidPattern = /^[\w-]{1,64}$/u;

/** The algorithm name tau-cloud writes. */
const algorithm = 'Ed25519';

export type SigningKey = { readonly kid: string; readonly key: KeyObject };

/** The verifier's keys by kid. */
export type VerificationKeys = ReadonlyMap<string, KeyObject>;

const signingKeySchema = z.object({
  kid: z.string().regex(kidPattern),
  alg: z.literal(algorithm),
  privateKeyPem: z.string().min(1),
});

const publicKeySchema = z.object({
  kid: z.string().regex(kidPattern),
  alg: z.literal(algorithm),
  publicKeyPem: z.string().min(1),
});

const parseJson = (raw: string, name: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${name} is not JSON`);
  }
};

/**
 * Reads a signer's key.
 *
 * @param raw - The variable's value.
 * @param name - The variable's name, for the refusal.
 * @returns The key id and the private key.
 * @throws Error naming `name` when the value is not one Ed25519 PKCS#8 key with a kid.
 */
export const parseSigningKey = (raw: string, name: string): SigningKey => {
  const parsed = signingKeySchema.safeParse(parseJson(raw, name));
  if (!parsed.success) {
    throw new Error(`${name} must be JSON {kid, alg: "Ed25519", privateKeyPem}`);
  }
  let key: KeyObject;
  try {
    key = createPrivateKey(parsed.data.privateKeyPem);
  } catch {
    throw new Error(`${name} does not hold a readable private key`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(`${name} must hold an Ed25519 key`);
  }
  return { kid: parsed.data.kid, key };
};

/**
 * Reads a verifier's key list.
 *
 * @param raw - The variable's value.
 * @param name - The variable's name, for the refusal.
 * @returns The public keys by kid, in the order given.
 * @throws Error naming `name` when the value is not one or two Ed25519 SPKI keys with distinct kids.
 */
export const parsePublicKeys = (raw: string, name: string): VerificationKeys => {
  const parsed = z.array(publicKeySchema).min(1).max(2).safeParse(parseJson(raw, name));
  if (!parsed.success) {
    throw new Error(`${name} must be a JSON array of one or two {kid, alg: "Ed25519", publicKeyPem}`);
  }
  const keys = new Map<string, KeyObject>();
  for (const entry of parsed.data) {
    if (keys.has(entry.kid)) {
      throw new Error(`${name} names one kid twice`);
    }
    let key: KeyObject;
    try {
      key = createPublicKey(entry.publicKeyPem);
    } catch {
      throw new Error(`${name} holds a key that is not a readable public key`);
    }
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error(`${name} must hold Ed25519 keys only`);
    }
    keys.set(entry.kid, key);
  }
  return keys;
};
