import process from 'node:process';

/**
 * The PostgreSQL `application_name` each Tau process sets on its connections, so the storage
 * accounting scheduler's `tau.db.connections` (W14 OB3, N48) can tell them apart in `pg_stat_activity`.
 * Keyed by the metric's `tau.db.application` value.
 */
export const databaseApplicationNames = {
  api: 'tau-api',
  'billing-operations': 'tau-billing-operations',
  maintenance: 'tau-maintenance',
  mirror: 'tau-mirror',
  release: 'tau-release',
} as const;

/**
 * The `application_name` a process sets: `PGAPPNAME` when the environment names one (libpq's own
 * variable, which a test harness uses to find a worker's sessions), otherwise Tau's name for it.
 *
 * @param application - The process, as `tau.db.application` names it.
 * @param environment - The process environment.
 * @returns The startup parameter's value.
 */
export const applicationNameOf = (
  application: keyof typeof databaseApplicationNames,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string => {
  const override = environment['PGAPPNAME'];
  return override === undefined || override === '' ? databaseApplicationNames[application] : override;
};
