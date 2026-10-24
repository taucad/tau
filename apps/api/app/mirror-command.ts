import 'reflect-metadata'; // oxlint-disable-line import/no-unassigned-import -- Nest decorators on the storage driver need metadata
import process from 'node:process';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Environment } from '#config/environment.config.js';
import { assertSchemaCompatibility } from '#database/database-migration.js';
import * as schema from '#database/schema.js';
import { ObjectStorageService, TAU_DEFAULT_STORAGE_ACCOUNT_ID } from '#storage/object-storage.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { readMirrorEnvironment } from '#api/git/mirror/config.js';
import type { MirrorEnvironment } from '#api/git/mirror/config.js';
import { copyRepository, markTombstonedOwners } from '#api/git/mirror/copier.js';
import type { CopierContext } from '#api/git/mirror/copier.js';
import { S3MirrorDestination } from '#api/git/mirror/destination.js';
import { MirrorMetrics } from '#api/git/mirror/metrics.js';
import { reconcile } from '#api/git/mirror/reconcile.js';
import { runRetentionSweep } from '#api/git/mirror/retention.js';
import { R2MirrorSource } from '#api/git/mirror/source.js';
import { PostgresMirrorLedger } from '#api/git/mirror/watermark.js';
import { exportBacklog, runMirrorWorker } from '#api/git/mirror/worker.js';

/**
 * `tau-mirror`: the B2 second copy's copier (W13 DM1, B3a). It runs in its own
 * private Fly app from the API image's `mirror` target, holding the only B2
 * copy key, R2's read-only mirror token and the `tau_mirror` Postgres role.
 * Nothing here is reachable from a request, and nothing here deletes or hides.
 */

const usage = `Usage: mirror-command <command>

  worker
      Poll every TAU_MIRROR_POLL_MILLISECONDS (10 s): mark deleted owners in the
      copy, copy every repository behind it, export the tau_mirror_* metrics on
      OTEL_METRICS_PORT. Daily: the retention sweep and the active reconcile;
      Sundays (UTC): the full reconcile.

  copy --project <id>
      One copy round for one repository, printed as JSON.

  sweep
      One retention sweep: extend the newest snapshot and every dependency of each
      live repository whose earliest lock has fewer than 20 days left.

  reconcile [--full]
      One reconcile of repositories written in the last 48 hours, or of all.

  mark-owners
      Write the marker of every deleted owner not yet marked in the copy.

  status
      Print the lag and backlog as one tau_mirror.status JSON line; exit 1 when
      the copy lag is above 15 minutes.

Environment: DATABASE_URL (the tau_mirror login); TAU_S3_ENDPOINT,
TAU_S3_ACCESS_KEY_ID, TAU_S3_SECRET_ACCESS_KEY, TAU_S3_PRIVATE_BUCKET (R2,
read-only); TAU_S3_COPY_ENDPOINT, TAU_S3_COPY_BUCKET, TAU_S3_COPY_REGION,
TAU_S3_COPY_ACCESS_KEY_ID, TAU_S3_COPY_SECRET_ACCESS_KEY (B2 copy key).`;

const report = (event: Readonly<Record<string, unknown>>): void => {
  console.log(JSON.stringify(event));
};

/** The R2 driver over the private bucket alone, with the mirror's read-only token. */
const sourceDriver = (environment: MirrorEnvironment, metrics: MetricsService): ObjectStorageService => {
  /* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
  const configuration = {
    TAU_S3_ENDPOINT: environment.TAU_S3_ENDPOINT,
    TAU_S3_REGION: environment.TAU_S3_REGION,
    TAU_S3_ACCESS_KEY_ID: environment.TAU_S3_ACCESS_KEY_ID,
    TAU_S3_SECRET_ACCESS_KEY: environment.TAU_S3_SECRET_ACCESS_KEY,
    TAU_S3_FORCE_PATH_STYLE: environment.TAU_S3_FORCE_PATH_STYLE,
    TAU_S3_BUCKET: environment.TAU_S3_PRIVATE_BUCKET,
    TAU_S3_PRIVATE_BUCKET: environment.TAU_S3_PRIVATE_BUCKET,
  };
  /* eslint-enable @typescript-eslint/naming-convention -- end environment variable names */
  // The driver reads only these keys; the mirror holds none of the API's other configuration.
  const config = new ConfigService(configuration) as unknown as ConfigService<Environment, true>;
  return new ObjectStorageService(
    config,
    {
      id: TAU_DEFAULT_STORAGE_ACCOUNT_ID,
      endpoint: environment.TAU_S3_ENDPOINT,
      region: environment.TAU_S3_REGION,
      bucket: environment.TAU_S3_PRIVATE_BUCKET,
      forcePathStyle: environment.TAU_S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: environment.TAU_S3_ACCESS_KEY_ID,
        secretAccessKey: environment.TAU_S3_SECRET_ACCESS_KEY,
      },
    },
    metrics,
  );
};

const option = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  const value = index === -1 ? undefined : args[index + 1];
  return value === undefined || value.startsWith('--') ? undefined : value;
};

// oxlint-disable-next-line max-lines-per-function -- one switch over six subcommands keeps the argument contract in one place
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? '';
  if (command === '' || command === '--help') {
    console.log(usage);
    return;
  }
  if (!['worker', 'copy', 'sweep', 'reconcile', 'mark-owners', 'status'].includes(command)) {
    throw new Error(`Unknown command '${command}'\n\n${usage}`);
  }

  const environment = readMirrorEnvironment(process.env);
  // Started before any instrument is created, as in billing-command; the worker's metrics port opens here.
  const { sdk } = await import('#telemetry/otel.js');
  /* eslint-disable @typescript-eslint/naming-convention -- PostgreSQL connection options */
  const client = postgres(environment.DATABASE_URL, {
    max: 4,
    prepare: false,
    connect_timeout: environment.DATABASE_CONNECT_TIMEOUT_SECONDS,
    idle_timeout: environment.DATABASE_IDLE_TIMEOUT_SECONDS,
    connection: {
      statement_timeout: environment.DATABASE_STATEMENT_TIMEOUT_MS,
      lock_timeout: environment.DATABASE_LOCK_TIMEOUT_MS,
      idle_in_transaction_session_timeout: environment.DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    },
  });
  /* eslint-enable @typescript-eslint/naming-convention -- end PostgreSQL options */
  const destination = new S3MirrorDestination({
    endpoint: environment.TAU_S3_COPY_ENDPOINT,
    region: environment.TAU_S3_COPY_REGION,
    bucket: environment.TAU_S3_COPY_BUCKET,
    forcePathStyle: environment.TAU_S3_COPY_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: environment.TAU_S3_COPY_ACCESS_KEY_ID,
      secretAccessKey: environment.TAU_S3_COPY_SECRET_ACCESS_KEY,
    },
  });
  const stop = new AbortController();
  const abort = (): void => {
    stop.abort();
  };
  process.once('SIGTERM', abort);
  process.once('SIGINT', abort);

  try {
    // The copier writes the copy columns of a schema it was built for, or not at all.
    await assertSchemaCompatibility(client);
    const driver = sourceDriver(environment, new MetricsService());
    const context: CopierContext = {
      source: new R2MirrorSource(new S3RepositoryStore(driver), driver),
      destination,
      ledger: new PostgresMirrorLedger(drizzle(client, { schema })),
      metrics: new MirrorMetrics(),
      report,
      signal: stop.signal,
    };

    switch (command) {
      case 'worker': {
        report({
          event: 'tau_mirror.start',
          pollMilliseconds: environment.TAU_MIRROR_POLL_MILLISECONDS,
        });
        await runMirrorWorker({
          context,
          signal: stop.signal,
          pollMilliseconds: environment.TAU_MIRROR_POLL_MILLISECONDS,
          concurrency: environment.TAU_MIRROR_CONCURRENCY,
          backfillShare: environment.TAU_MIRROR_BACKFILL_SHARE,
        });
        break;
      }
      case 'copy': {
        const projectId = option(args, 'project');
        if (projectId === undefined) {
          throw new Error(`--project is required\n\n${usage}`);
        }
        const candidate = await context.ledger.candidate(projectId);
        if (candidate === undefined) {
          throw new Error(`No project_git row in the Tau default account for '${projectId}'`);
        }
        const result = await copyRepository(context, candidate);
        report({
          event: 'tau_mirror.round',
          projectId,
          outcome: result.outcome,
          ...(result.outcome === 'failed'
            ? { stage: result.failure.stage, reason: result.failure.reason }
            : { generation: result.generation }),
        });
        if (result.outcome === 'failed') {
          process.exitCode = 1;
        }
        break;
      }
      case 'sweep': {
        const result = await runRetentionSweep(context);
        if (result.failed > 0) {
          process.exitCode = 1;
        }
        break;
      }
      case 'reconcile': {
        await reconcile(context, args.includes('--full') ? 'full' : 'active');
        break;
      }
      case 'mark-owners': {
        report({
          event: 'tau_mirror.owners_marked',
          owners: await markTombstonedOwners(context),
        });
        break;
      }
      case 'status': {
        const reading = await context.ledger.backlog();
        await exportBacklog(context);
        const lagSeconds =
          reading.oldestPendingSince === undefined ? 0 : (Date.now() - reading.oldestPendingSince.getTime()) / 1000;
        report({
          event: 'tau_mirror.status',
          lagSeconds: Math.round(lagSeconds),
          lagGenerations: reading.lagGenerations,
          steady: reading.steady,
          backfill: reading.backfill,
          lfsBacklog: reading.lfsBacklog,
          earliestLockedUntil: reading.earliestLockedUntil?.toISOString(),
        });
        if (lagSeconds > 900) {
          process.exitCode = 1;
        }
        break;
      }
      default: {
        break;
      }
    }
  } finally {
    process.removeListener('SIGTERM', abort);
    process.removeListener('SIGINT', abort);
    destination.destroy();
    await client.end();
    await sdk.shutdown();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Mirror command failed');
  process.exitCode = 1;
}
