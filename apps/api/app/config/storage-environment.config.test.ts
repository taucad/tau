import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getStorageEnvironment } from '#config/storage-environment.config.js';

/**
 * DC1: tau-storage runs with no `DATABASE_URL` or `REDIS_URL` (W9 Finding 2),
 * and a production worker refuses to start without its own keys and the
 * receipt route, rather than with a development key anyone can compute.
 */

const pair = (kid: string): { signing: string; verifying: string } => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    signing: JSON.stringify({
      kid,
      alg: 'Ed25519',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
    verifying: JSON.stringify([
      { kid, alg: 'Ed25519', publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) },
    ]),
  };
};

const grant = pair('grant-1-0315d27631832128');
const receipt = pair('receipt-1-3ba45a8542d7d595');

/* eslint-disable @typescript-eslint/naming-convention -- environment variable names throughout this suite */

/** A plain variable map; the app's `ProcessEnv` augmentation types the API's schema, not this one. */
type Variables = Record<string, string | undefined>;

const parse = (variables: Variables): ReturnType<typeof getStorageEnvironment> =>
  getStorageEnvironment(variables as unknown as NodeJS.ProcessEnv);

const production: Variables = {
  NODE_ENV: 'production',
  TAU_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  TAU_S3_REGION: 'auto',
  TAU_S3_ACCESS_KEY_ID: 'storage-access-key-id',
  TAU_S3_SECRET_ACCESS_KEY: 'storage-secret-access-key-value',
  TAU_S3_BUCKET: 'tau-content',
  TAU_S3_PRIVATE_BUCKET: 'tau-content-private',
  TAU_S3_PUBLIC_BASE_URL: 'https://content.tau.new',
  TAU_STORAGE_GRANT_PUBLIC_KEYS: grant.verifying,
  TAU_STORAGE_RECEIPT_SIGNING_KEY: receipt.signing,
  TAU_STORAGE_RECEIPT_URL: 'http://tau-api-staging.flycast/v1/internal/storage/receipts',
};

describe('tau-storage environment (DC1)', () => {
  it('should start in production with its keys, the receipt route and the object store alone', () => {
    const environment = parse(production);
    expect(environment.PORT).toBe(3100);
    expect(environment.TAU_STORAGE_SLOW_BODY_MINIMUM_BYTES).toBe(8 * 1024);
    expect(environment.TAU_STORAGE_SLOW_BODY_WINDOW_SECONDS).toBe(30);
  });

  it.each(['DATABASE_URL', 'REDIS_URL'])(
    'should refuse to start in production with %s set, without echoing it',
    (name) => {
      const value = `postgres://tau:never-print-this@db.internal:5432/${name.toLowerCase()}`;
      let message = '';
      try {
        parse({ ...production, [name]: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(name);
      expect(message).not.toContain('never-print-this');
    },
  );

  it.each(['TAU_STORAGE_GRANT_PUBLIC_KEYS', 'TAU_STORAGE_RECEIPT_SIGNING_KEY', 'TAU_STORAGE_RECEIPT_URL'])(
    'should refuse to start in production without %s',
    (name) => {
      const environment: Variables = { ...production };
      // oxlint-disable-next-line typescript/no-dynamic-delete -- the variable under test is removed by name
      delete environment[name];
      expect(() => parse(environment)).toThrow(name);
    },
  );

  it('should never echo a key it was given in a refusal', () => {
    let message = '';
    try {
      parse({ ...production, DATABASE_URL: 'postgres://x', TAU_STORAGE_RECEIPT_URL: undefined });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain('PRIVATE KEY');
    expect(message).not.toContain(JSON.parse(receipt.signing).kid as string);
  });

  it('should fill the development keys outside production, and ignore a database there', () => {
    const environment = parse({
      ...production,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://dev',
      TAU_STORAGE_GRANT_PUBLIC_KEYS: undefined,
      TAU_STORAGE_RECEIPT_SIGNING_KEY: undefined,
      TAU_STORAGE_RECEIPT_URL: undefined,
    });
    expect(environment.TAU_STORAGE_GRANT_PUBLIC_KEYS).toContain('grant-development');
    expect(environment.TAU_STORAGE_RECEIPT_SIGNING_KEY).toContain('receipt-development');
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- end of the suite */
