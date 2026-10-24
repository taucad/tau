import process from 'node:process';
import type { z } from 'zod';
import { environmentSchemaBase, withWorktreeDatabases } from '#config/environment.config.js';

/**
 * The configuration the maintenance command boots with (north star DC4).
 *
 * `tau-maintenance` is a private app with no inbound service. It holds
 * `DATABASE_URL` under the `tau_maintenance` login, the maintenance R2 token
 * as `TAU_S3_*`, and the restore key as `TAU_S3_RESTORE_*` (read only by
 * `restore`, in `maintenance-command.ts`). It holds none of the API's own
 * secrets — no auth secret, no OAuth client, no Redis — so it cannot parse the
 * API's schema, and must not need to (`REDIS_URL` is optional here, for
 * `freeze-all` run from an API Machine). Every field here is one the command
 * reads; the values and their defaults are the API's, picked from the same
 * schema so the two never disagree on a meaning.
 *
 * The API image's `revisions-maintenance` process group parses this same
 * schema from the API's environment, a superset, until that group retires.
 */
export const maintenanceEnvironmentSchema = environmentSchemaBase
  .pick({
    /* eslint-disable @typescript-eslint/naming-convention -- environment variables are UPPER_CASED */
    NODE_ENV: true,
    DATABASE_URL: true,
    DATABASE_CONNECT_TIMEOUT_SECONDS: true,
    DATABASE_IDLE_TIMEOUT_SECONDS: true,
    DATABASE_STATEMENT_TIMEOUT_MS: true,
    DATABASE_LOCK_TIMEOUT_MS: true,
    DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS: true,
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
    /*
     * Charter D21 allows one maintenance worker. While the API's
     * `revisions-maintenance` group still runs it, the new app starts in
     * standby: it proves its database login and storage token, logs one
     * `revisions_maintenance.standby` line and runs no pass. The cutover turns
     * this off in `apps/maintenance/fly.*.toml` in the same change that scales the
     * API's group to zero.
     */
    /*
     * Only `freeze-all` reads it, for the in-flight registry its drain waits on
     * (DW1). `tau-maintenance` holds no Redis, so there it is unset and
     * `freeze-all` refuses by name; the operator runs it from an API Machine,
     * whose image carries this command and whose environment has the URL.
     */
    REDIS_URL: environmentSchemaBase.shape.REDIS_URL.optional(),
    // The API's strict boolean, default off (as `TAU_CLOUD_ENABLED` parses it).
    TAU_MAINTENANCE_STANDBY: environmentSchemaBase.shape.TAU_CLOUD_ENABLED.describe(
      'Hold the maintenance worker in standby: verify credentials, run no pass (DC4 cutover)',
    ),
    /* eslint-enable @typescript-eslint/naming-convention -- end of environment variables */
  })
  .superRefine((data, context) => {
    if (data.NODE_ENV !== 'production') {
      return;
    }
    // The same refusals the API's schema applies to these fields in production.
    if (data.TAU_S3_PRIVATE_BUCKET === data.TAU_S3_BUCKET) {
      context.addIssue({
        code: 'custom',
        message: 'TAU_S3_PRIVATE_BUCKET must differ from TAU_S3_BUCKET in production',
        path: ['TAU_S3_PRIVATE_BUCKET'],
      });
    }
    if (data.TAU_S3_ACCESS_KEY_ID === 'tau-api') {
      context.addIssue({
        code: 'custom',
        message: 'TAU_S3_ACCESS_KEY_ID must not use the default dev credential in production',
        path: ['TAU_S3_ACCESS_KEY_ID'],
      });
    }
    if (data.TAU_S3_SECRET_ACCESS_KEY === 'tau-api-dev-secret') {
      context.addIssue({
        code: 'custom',
        message: 'TAU_S3_SECRET_ACCESS_KEY must not use the default dev credential in production',
        path: ['TAU_S3_SECRET_ACCESS_KEY'],
      });
    }
  });

export type MaintenanceEnvironment = z.infer<typeof maintenanceEnvironmentSchema>;

/**
 * Parses the maintenance command's configuration, naming the failing fields
 * and never their values.
 *
 * @param environment - The process environment; defaults to `process.env`.
 * @returns The parsed configuration.
 */
export const getMaintenanceEnvironment = (environment: NodeJS.ProcessEnv = process.env): MaintenanceEnvironment => {
  const result = maintenanceEnvironmentSchema.safeParse(withWorktreeDatabases(environment));
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new Error(`Invalid maintenance environment configuration: ${fields}`);
  }
  return result.data;
};
