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
