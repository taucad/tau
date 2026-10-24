import process from 'node:process';
import { z } from 'zod';
import { environmentSchemaBase } from '#config/environment.config.js';
import { developmentPublicKeysJson, developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';

/**
 * The configuration tau-storage boots with (north star DC1).
 *
 * `tau-storage` is a private app on its own network. It holds its own R2
 * token (`TAU_S3_*`, write on the private bucket only), the API's grant
 * verification keys and its own receipt signing key, and nothing else: no
 * `DATABASE_URL`, no `REDIS_URL`, no auth secret (Z1). Production refuses
 * boot if either of the first two is present, so a mis-pushed secret cannot
 * quietly widen what a worker can reach.
 */

/** Names of the variables a production worker must never hold. */
export const storageForbiddenVariables = ['DATABASE_URL', 'REDIS_URL'] as const;

const positiveInteger = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export const storageEnvironmentSchema = environmentSchemaBase
  .pick({
    /* eslint-disable @typescript-eslint/naming-convention -- environment variables are UPPER_CASED */
    NODE_ENV: true,
    TAU_S3_ENDPOINT: true,
    TAU_S3_REGION: true,
    TAU_S3_ACCESS_KEY_ID: true,
    TAU_S3_SECRET_ACCESS_KEY: true,
    TAU_S3_FORCE_PATH_STYLE: true,
    TAU_S3_BUCKET: true,
    TAU_S3_PUBLIC_BASE_URL: true,
    TAU_S3_PRIVATE_BUCKET: true,
    TAU_GIT_ROOT: true,
  })
  .extend({
    PORT: positiveInteger(3100).describe('The storage HTTP port; Flycast forwards to it'),
    TAU_STORAGE_GRANT_PUBLIC_KEYS: z
      .string()
      .optional()
      .describe('JSON array of one or two {kid, alg: "Ed25519", publicKeyPem}: the API grant verification keys'),
    TAU_STORAGE_RECEIPT_SIGNING_KEY: z
      .string()
      .optional()
      .describe('JSON {kid, alg: "Ed25519", privateKeyPem}: this app’s receipt signing key'),
    TAU_STORAGE_RECEIPT_URL: z
      .url()
      .optional()
      .describe('The API’s internal receipt route; only a post-reply `retained` receipt is posted'),
    TAU_STORAGE_SLOW_BODY_MINIMUM_BYTES: positiveInteger(8 * 1024).describe(
      'A request body moving fewer bytes than this in one window is aborted',
    ),
    TAU_STORAGE_SLOW_BODY_WINDOW_SECONDS: positiveInteger(30).describe('The slow-body window'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    /* eslint-enable @typescript-eslint/naming-convention -- end of environment variables */
  })
  .superRefine((data, context) => {
    if (data.NODE_ENV !== 'production') {
      return;
    }
    for (const name of ['TAU_STORAGE_GRANT_PUBLIC_KEYS', 'TAU_STORAGE_RECEIPT_SIGNING_KEY'] as const) {
      if (data[name] === undefined) {
        context.addIssue({ code: 'custom', message: `${name} is required in production`, path: [name] });
      }
    }
    if (data.TAU_STORAGE_RECEIPT_URL === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'TAU_STORAGE_RECEIPT_URL is required in production',
        path: ['TAU_STORAGE_RECEIPT_URL'],
      });
    }
    if (data.TAU_S3_PRIVATE_BUCKET === data.TAU_S3_BUCKET) {
      context.addIssue({
        code: 'custom',
        message: 'TAU_S3_PRIVATE_BUCKET must differ from TAU_S3_BUCKET in production',
        path: ['TAU_S3_PRIVATE_BUCKET'],
      });
    }
    if (data.TAU_S3_ACCESS_KEY_ID === 'tau-api' || data.TAU_S3_SECRET_ACCESS_KEY === 'tau-api-dev-secret') {
      context.addIssue({
        code: 'custom',
        message:
          'TAU_S3_ACCESS_KEY_ID and TAU_S3_SECRET_ACCESS_KEY must not use the default dev credential in production',
        path: ['TAU_S3_ACCESS_KEY_ID'],
      });
    }
  });

/** The parsed configuration, with the development keys filled in outside production. */
export type StorageEnvironment = z.infer<typeof storageEnvironmentSchema> & {
  readonly TAU_STORAGE_GRANT_PUBLIC_KEYS: string;
  readonly TAU_STORAGE_RECEIPT_SIGNING_KEY: string;
};

/**
 * Parses tau-storage's configuration, naming the failing fields and never
 * their values.
 *
 * @param environment - The process environment; defaults to `process.env`.
 * @returns The parsed configuration.
 */
export const getStorageEnvironment = (environment: NodeJS.ProcessEnv = process.env): StorageEnvironment => {
  const result = storageEnvironmentSchema.safeParse(environment);
  const forbidden =
    // oxlint-disable-next-line typescript-eslint/dot-notation -- ProcessEnv is index-signature-only
    environment['NODE_ENV'] === 'production'
      ? storageForbiddenVariables.filter((name) => {
          /* Read untyped: the API's ambient ProcessEnv types these names as always set. */
          const variables: Readonly<Record<string, string | undefined>> = environment;
          const value = variables[name];
          return value !== undefined && value !== '';
        })
      : [];
  if (!result.success || forbidden.length > 0) {
    const fields = [
      ...new Set([...(result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))), ...forbidden]),
    ].join(', ');
    throw new Error(`Invalid storage environment configuration: ${fields}`);
  }
  /* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
  return {
    ...result.data,
    TAU_STORAGE_GRANT_PUBLIC_KEYS: result.data.TAU_STORAGE_GRANT_PUBLIC_KEYS ?? developmentPublicKeysJson('grant'),
    TAU_STORAGE_RECEIPT_SIGNING_KEY:
      result.data.TAU_STORAGE_RECEIPT_SIGNING_KEY ?? developmentSigningKeyJson('receipt'),
  };
  /* eslint-enable @typescript-eslint/naming-convention -- end of the environment variable names */
};
