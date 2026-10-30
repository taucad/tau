import type { DatabaseType } from '#database/database.service.js';
import type { AccountingTask } from '#api/storage-accounting/accounting-figures.js';
import { readDatabaseConnections } from '#api/storage-accounting/database-connections.js';
import { readR2Analytics } from '#api/storage-accounting/r2-analytics.js';
import type { R2AnalyticsSource } from '#api/storage-accounting/r2-analytics.js';
import { readUsage } from '#api/storage-accounting/usage.js';
import type { OwnerPlanSettings } from '#api/storage-accounting/owner-plans.js';

const minute = 60 * 1000;
const hour = 60 * minute;

/**
 * The R2 task's source, or `undefined` when either Cloudflare setting is unset: the task then counts a
 * skipped pass and exports no `tau_r2_*` series, and the other tasks run as usual.
 *
 * @param settings - The two Cloudflare settings and the environment's bucket names.
 * @returns The account, token and bucket roles, or `undefined`.
 */
export const r2SourceOf = (settings: {
  /** `TAU_CLOUDFLARE_ACCOUNT_ID`. */
  readonly accountId: string | undefined;
  /** `TAU_CLOUDFLARE_ANALYTICS_TOKEN`. */
  readonly token: string | undefined;
  /** `TAU_S3_BUCKET`. */
  readonly publicBucket: string;
  /** `TAU_S3_PRIVATE_BUCKET`. */
  readonly privateBucket: string;
}): R2AnalyticsSource | undefined =>
  settings.accountId === undefined || settings.token === undefined
    ? undefined
    : {
        accountId: settings.accountId,
        token: settings.token,
        buckets: {
          public: settings.publicBucket,
          private: settings.privateBucket,
        },
      };

/**
 * The scheduler's tasks (W14 Finding 6): usage over Postgres and R2 analytics hourly, Postgres
 * connections every minute.
 *
 * The catalogue's `hot_projects` and `route` tasks are not here: the hot-project ranks are still counted
 * per Machine by the storage worker (OB2's `HotProjects`), and the route freeze gauges read the route
 * table at collection (OB5's `observeFrozenRoutes`), so neither has a periodic pass yet.
 *
 * @param dependencies - The database, the plan settings and the R2 source, if configured.
 * @returns The tasks in the order a tick runs them.
 */
export const accountingTasks = (dependencies: {
  readonly database: DatabaseType;
  readonly plans: OwnerPlanSettings;
  readonly r2: R2AnalyticsSource | undefined;
}): AccountingTask[] => {
  const { database, plans, r2 } = dependencies;
  return [
    {
      name: 'db',
      intervalMilliseconds: minute,
      run: async () => readDatabaseConnections(database),
    },
    {
      name: 'usage',
      intervalMilliseconds: hour,
      run: async (signal) => readUsage(database, plans, signal),
    },
    {
      name: 'r2_analytics',
      intervalMilliseconds: hour,
      run: r2 === undefined ? undefined : async (signal) => readR2Analytics(r2, Date.now(), signal),
    },
  ];
};
