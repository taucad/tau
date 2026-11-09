import { describe, expect, it } from 'vitest';
import { getMaintenanceEnvironment, maintenanceEnvironmentSchema } from '#config/maintenance-environment.config.js';

/** Exactly the names `tau-maintenance` holds (apps/maintenance/fly.*.toml plus its Fly secrets), nothing of the API's. */
/* eslint-disable @typescript-eslint/naming-convention -- environment variables are UPPER_CASED */
const maintenanceOnly: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://tau_maintenance.example:password@pooler.example:5432/postgres',
  TAU_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  TAU_S3_ACCESS_KEY_ID: 'maintenance-key-id',
  TAU_S3_SECRET_ACCESS_KEY: 'maintenance-secret-value',
  TAU_S3_BUCKET: 'tau-staging-au-content',
  TAU_S3_PRIVATE_BUCKET: 'tau-staging-au-content-private',
  TAU_S3_PUBLIC_BASE_URL: 'https://cdn.taucad.dev',
  TAU_S3_REGION: 'auto',
  TAU_S3_FORCE_PATH_STYLE: 'false',
  TAU_MAINTENANCE_STANDBY: 'true',
};

/** `NodeJS.ProcessEnv` is augmented with the API's parsed fields; the maintenance app's environment holds none of them. */
const processEnvironment = (values: Record<string, string>): NodeJS.ProcessEnv => values as NodeJS.ProcessEnv;

describe('maintenanceEnvironmentSchema (DC4)', () => {
  it('should boot from the maintenance app secrets alone, without the API auth, OAuth or Redis settings', () => {
    const environment = getMaintenanceEnvironment(processEnvironment(maintenanceOnly));

    expect(environment.TAU_MAINTENANCE_STANDBY).toBe(true);
    expect(environment.DATABASE_STATEMENT_TIMEOUT_MS).toBe(15_000);
    expect(environment.TAU_S3_FORCE_PATH_STYLE).toBe(false);
    expect(environment.REDIS_URL).toBeUndefined();
  });

  it('should keep REDIS_URL for freeze-all when it runs from an API Machine', () => {
    const environment = getMaintenanceEnvironment(
      processEnvironment({ ...maintenanceOnly, REDIS_URL: 'rediss://redis.example:6379' }),
    );

    expect(environment.REDIS_URL).toBe('rediss://redis.example:6379');
  });

  it('should default to running the worker, which is what the API group parses today', () => {
    const { TAU_MAINTENANCE_STANDBY: _standby, ...rest } = maintenanceOnly;

    expect(getMaintenanceEnvironment(processEnvironment(rest)).TAU_MAINTENANCE_STANDBY).toBe(false);
  });

  it('should refuse the dev storage credentials and a shared bucket in production', () => {
    const result = maintenanceEnvironmentSchema.safeParse({
      ...maintenanceOnly,
      TAU_S3_ACCESS_KEY_ID: 'tau-api',
      TAU_S3_SECRET_ACCESS_KEY: 'tau-api-dev-secret',
      TAU_S3_PRIVATE_BUCKET: maintenanceOnly['TAU_S3_BUCKET'],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.')).toSorted()).toEqual([
      'TAU_S3_ACCESS_KEY_ID',
      'TAU_S3_PRIVATE_BUCKET',
      'TAU_S3_SECRET_ACCESS_KEY',
    ]);
  });

  it('should name a failing field without printing any value', () => {
    const { DATABASE_URL: _url, ...rest } = maintenanceOnly;
    const parse = (): unknown =>
      getMaintenanceEnvironment(processEnvironment({ ...rest, TAU_MAINTENANCE_STANDBY: 'yes' }));

    expect(parse).toThrow('Invalid maintenance environment configuration: DATABASE_URL, TAU_MAINTENANCE_STANDBY');
    expect(parse).not.toThrow(/maintenance-secret-value|yes/u);
  });

  it('should still refuse a retired TAU_GIT_ROOT', () => {
    expect(maintenanceEnvironmentSchema.safeParse({ ...maintenanceOnly, TAU_GIT_ROOT: '/data/git' }).success).toBe(
      false,
    );
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- end of environment variables */
