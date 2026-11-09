import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';

/**
 * The fixed development key pairs (DC1), for a local stack and the test
 * suites, where nothing provisions `TAU_STORAGE_*` keys. Derived from a public
 * seed rather than checked in as PEM: anyone can compute these, which is the
 * point. Neither app falls back to them in production: tau-storage's
 * environment schema requires both of its keys there, and tau-api refuses a
 * development kid at boot (`git-execution.ts`, `forwarding.providers.ts`).
 * tau-storage does not inspect the kid of a key it is given.
 */

/** The DER prefix of a PKCS#8 Ed25519 private key; the 32-byte seed follows. */
const pkcs8Ed25519Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');

/** The two development key pairs, by what they sign. */
export type DevelopmentKeyName = 'grant' | 'receipt';

/** The kid each development key carries; production kids come from tau-cloud. */
export const developmentKid = (name: DevelopmentKeyName): string => `${name}-development`;

const privateKeyFor = (name: DevelopmentKeyName) =>
  createPrivateKey({
    key: Buffer.concat([
      pkcs8Ed25519Prefix,
      createHash('sha256').update(`tau-storage development ${name} key`).digest(),
    ]),
    format: 'der',
    type: 'pkcs8',
  });

/**
 * The signer value of a development key, as tau-cloud would write it.
 *
 * @param name - Which pair.
 * @returns `{kid, alg, privateKeyPem}` as JSON.
 */
export const developmentSigningKeyJson = (name: DevelopmentKeyName): string =>
  JSON.stringify({
    kid: developmentKid(name),
    alg: 'Ed25519',
    privateKeyPem: privateKeyFor(name).export({ type: 'pkcs8', format: 'pem' }),
  });

/**
 * The verifier value of a development key, as tau-cloud would write it.
 *
 * @param name - Which pair.
 * @returns `[{kid, alg, publicKeyPem}]` as JSON.
 */
export const developmentPublicKeysJson = (name: DevelopmentKeyName): string =>
  JSON.stringify([
    {
      kid: developmentKid(name),
      alg: 'Ed25519',
      publicKeyPem: createPublicKey(privateKeyFor(name)).export({ type: 'spki', format: 'pem' }),
    },
  ]);
