import { z } from 'zod';

/**
 * `tau-mirror`'s environment: the names Tau Cloud writes as its Fly secrets
 * (tau-cloud change proposal 2026-10-24-hosted-storage-stage1, P2.2), and
 * nothing the API's own schema requires. The copier never reads the API's
 * secrets, and the API never reads these, so they are declared here rather than
 * in `environment.config.ts`.
 *
 * `TAU_S3_COPY_ERASE_*` is held by the app for DX1's purge and collector and is
 * deliberately **not** read here: no copier path can reach a delete key.
 */
const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const positiveInteger = (fallback: number) => z.coerce.number().int().positive().default(fallback);

/* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
export const mirrorEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_CONNECT_TIMEOUT_SECONDS: positiveInteger(10),
  DATABASE_IDLE_TIMEOUT_SECONDS: positiveInteger(60),
  DATABASE_STATEMENT_TIMEOUT_MS: positiveInteger(15_000),
  DATABASE_LOCK_TIMEOUT_MS: positiveInteger(5000),
  DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS: positiveInteger(15_000),

  // The primary: R2's private bucket, through the mirror's read-only token (FR1).
  TAU_S3_ENDPOINT: z.url(),
  TAU_S3_ACCESS_KEY_ID: z.string().min(1),
  TAU_S3_SECRET_ACCESS_KEY: z.string().min(1),
  TAU_S3_PRIVATE_BUCKET: z.string().min(1),
  TAU_S3_REGION: z.string().min(1).default('auto'),
  TAU_S3_FORCE_PATH_STYLE: booleanFlag,

  // The second copy: B2 through the copy key (W13 Finding 5).
  TAU_S3_COPY_ENDPOINT: z.url(),
  TAU_S3_COPY_BUCKET: z.string().min(1),
  TAU_S3_COPY_REGION: z.string().min(1),
  TAU_S3_COPY_ACCESS_KEY_ID: z.string().min(1),
  TAU_S3_COPY_SECRET_ACCESS_KEY: z.string().min(1),
  TAU_S3_COPY_FORCE_PATH_STYLE: booleanFlag,

  /** W13 B4: the poll interval. */
  TAU_MIRROR_POLL_MILLISECONDS: positiveInteger(10_000),
  /** Repositories copied at once. */
  TAU_MIRROR_CONCURRENCY: positiveInteger(4),
  /** The share of each poll's batch backfill may take, so new commits are never starved (W13 Finding 2). */
  TAU_MIRROR_BACKFILL_SHARE: z.coerce.number().min(0).max(1).default(0.5),

  /** The deployment the drill reads, its `mirror_drill_run.environment` and its series' `environment` label. */
  TAU_MIRROR_ENVIRONMENT: z.enum(['staging', 'production', 'development']).default('development'),
  /** Repositories the daily verify drill (DR2-lite) reads back from the copy; 0 turns it off. */
  TAU_MIRROR_DRILL_SAMPLE: z.coerce.number().int().min(0).max(50).default(3),
});
/* eslint-enable @typescript-eslint/naming-convention -- end environment variable names */

export type MirrorEnvironment = z.infer<typeof mirrorEnvironmentSchema>;

/**
 * Parses the environment, naming every missing or malformed variable and never a value.
 *
 * @param source - Usually `process.env`.
 * @returns The validated configuration.
 * @throws Error - Listing the variable names that failed.
 */
export const readMirrorEnvironment = (source: NodeJS.ProcessEnv): MirrorEnvironment => {
  const parsed = mirrorEnvironmentSchema.safeParse(source);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].sort();
    throw new Error(`tau-mirror configuration is missing or invalid: ${names.join(', ')}`);
  }
  return parsed.data;
};
