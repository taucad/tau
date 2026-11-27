import { createPublicKey } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { z } from 'zod';
import { parseSigningKey } from '#forwarding/contract/keys.js';
import type { SigningKey } from '#forwarding/contract/keys.js';

/**
 * The attestation key set (cloud backup admission blueprint D3, R3-6; contracts § 2): a pair of its own, never the
 * grant's or the receipt's.
 *
 * - `TAU_STORAGE_ATTESTATION_SIGNING_KEY` (tau-storage; tau-api in `in_process` mode): `{kid, alg, privateKeyPem}`,
 *   the same signer value as the receipt key.
 * - `TAU_STORAGE_ATTESTATION_PUBLIC_KEYS` (tau-api, tau-mirror, tau-maintenance): a JSON array of
 *   `{kid, alg, publicKeyPem, notBefore, revokedAt?}`. Rotation **adds** a kid and keeps the retired one for the
 *   life of the data, so this list is not capped at two like the grant's. A compromise sets `revokedAt`: readers then
 *   ignore that kid's objects, and only a re-attested sibling under a new kid counts (`reattest`).
 *
 * The kid is part of every object key (`attestations/<k>/<kid>.<origin>.json`), so it never holds a dot.
 * Every refusal names the variable and never echoes its value.
 */

/** One verifier key and its life. */
export type AttestationKey = Readonly<{
  key: KeyObject;
  notBefore: string;
  revokedAt?: string;
}>;

/** Every attestation verifier key by kid, revoked ones included (a reader filters; `reattest` needs them). */
export type AttestationKeys = ReadonlyMap<string, AttestationKey>;

/** The signing key's variable. */
export const attestationSigningKeyName = 'TAU_STORAGE_ATTESTATION_SIGNING_KEY';

/** The verifier list's variable. */
export const attestationPublicKeysName = 'TAU_STORAGE_ATTESTATION_PUBLIC_KEYS';

const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

const entrySchema = z.object({
  kid: z.string().regex(/^[\w-]{1,64}$/u),
  alg: z.literal('Ed25519'),
  publicKeyPem: z.string().min(1),
  notBefore: timestamp,
  revokedAt: timestamp.optional(),
});

/**
 * Reads the attestation signer. A missing value is not an error here: the commit path then admits every push with
 * no attestation and counts `signing_failed` (R3-2), which pages; it never refuses.
 *
 * @param raw - The variable's value, or `undefined` when unset.
 * @returns The key, or `undefined` when unset.
 * @throws Error naming the variable when a value is set and unreadable.
 */
export const parseAttestationSigningKey = (raw: string | undefined): SigningKey | undefined =>
  raw === undefined || raw === '' ? undefined : parseSigningKey(raw, attestationSigningKeyName);

/**
 * Reads the attestation verifier list.
 *
 * @param raw - The variable's value.
 * @returns The keys by kid.
 * @throws Error naming the variable when the value is not a list of distinct Ed25519 SPKI keys with their dates.
 */
export const parseAttestationPublicKeys = (raw: string): AttestationKeys => {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${attestationPublicKeysName} is not JSON`);
  }
  const parsed = z.array(entrySchema).min(1).max(64).safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `${attestationPublicKeysName} must be a JSON array of {kid, alg: "Ed25519", publicKeyPem, notBefore, revokedAt?}`,
    );
  }
  const keys = new Map<string, AttestationKey>();
  for (const entry of parsed.data) {
    if (keys.has(entry.kid)) {
      throw new Error(`${attestationPublicKeysName} names one kid twice`);
    }
    let key: KeyObject;
    try {
      key = createPublicKey(entry.publicKeyPem);
    } catch {
      throw new Error(`${attestationPublicKeysName} holds a key that is not a readable public key`);
    }
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error(`${attestationPublicKeysName} must hold Ed25519 keys only`);
    }
    keys.set(entry.kid, {
      key,
      notBefore: entry.notBefore,
      ...(entry.revokedAt === undefined ? {} : { revokedAt: entry.revokedAt }),
    });
  }
  return keys;
};
