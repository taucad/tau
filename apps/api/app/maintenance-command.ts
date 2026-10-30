import 'reflect-metadata'; // oxlint-disable-line import/no-unassigned-import -- Nest decorators require metadata before service imports
import process from 'node:process';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, gt, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getMaintenanceEnvironment } from '#config/maintenance-environment.config.js';
import type { MaintenanceEnvironment } from '#config/maintenance-environment.config.js';
import * as schema from '#database/schema.js';
import { project, projectGitLfsObject, storageTombstone } from '#database/schema.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import type { StorageAccount } from '#storage/object-storage.service.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { dueCondition, lfsRetirementWindowMilliseconds, retireDueLfsObjects } from '#api/git/lfs-retirement.js';
import { collectZeroCountBlobs } from '#api/git/maintenance/blob-collector.js';
import { liveOwnerIds, purgeTombstonedTenants } from '#api/git/maintenance/purge.js';
import { assertProjectActive } from '#database/project-lifecycle.js';
import { purgeDeletedProject, purgeDeletedProjects } from '#api/git/maintenance/project-purge.js';
import { recoverProjectDeletions, runMaintenanceWorker } from '#api/git/maintenance/worker.js';
import { restoreRepository } from '#api/git/maintenance/restore.js';
import { copiedProjects, listCopySnapshots, restoreFromCopy } from '#api/git/maintenance/restore-copy.js';
import { S3MirrorDestination } from '#api/git/mirror/destination.js';
import { assertSingletonProcessGroup } from '#api/git/maintenance/singleton.js';
import { readMaintenanceLiveness, recordMaintenancePass } from '#api/git/maintenance/liveness.js';
import { freezeEverything, parseFreezeSeconds, thawEverything } from '#api/git/routing/global-freeze.js';
import { RedisInFlightRegistry } from '#api/git/routing/in-flight.js';
import type { ScheduledMaintenanceCommand } from '#api/git/maintenance/liveness.js';
import { holdInStandby } from '#api/git/maintenance/standby.js';
import { applicationNameOf } from '#database/application-name.js';

/**
 * `revisions-maintenance`: the singleton entry for everything that must happen
 * once rather than in every API replica (charter D21, W6). It is the whole of
 * the private `tau-maintenance` app (north star DC4): the Dockerfile's
 * `maintenance` target runs it, `apps/maintenance/fly.*.toml` deploys it as one
 * Machine with no service, and its module graph opens no listener
 * (`maintenance-app.test.ts`). Until the cutover it also still ships in the API
 * image as that app's `revisions-maintenance` process group, and the new app
 * holds in standby (`TAU_MAINTENANCE_STANDBY`) so only one worker runs.
 *
 * Nothing here is reachable from a request. That is the point: purge deletes
 * whole tenant prefixes and `mark-erasure` opens that window, so both exist
 * only as operator subcommands of a process the request path never starts.
 */

/** Wait for the output sink so backlog outcomes cannot accumulate behind a slow log consumer. */
const writeLine = async (line: string): Promise<void> =>
  new Promise((resolve, reject) => {
    process.stdout.write(`${line}\n`, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

const usage = `Usage: revisions-maintenance <command>

  worker
      Run non-overlapping 60-second project recovery ticks alongside daily heavy
      maintenance. Project receipts are audited before tenant purges. With
      TAU_MAINTENANCE_STANDBY=true it instead verifies its database login and
      storage token, logs one revisions_maintenance.standby line and runs no
      pass until stopped (the DC4 cutover holds the new app there).

  purge-projects [--project <id>] [--dry-run] [--confirm-owner <id> --confirm-project <id> --confirm-plan <sha256>]
      List or purge due project receipts, retaining identity sentinels. Oversized
      plans require the exact owner, project and inventory fingerprint. Without
      --project the scheduled pass also audits completed receipts for late objects.

  recover-projects
      Attempt up to 100 due deletion intents within a 50-second storage budget,
      oldest retry first. The next tick starts on the 60-second cadence.

  purge [--owner <id>] [--confirm <ownerId>] [--dry-run]
      Purge every tenant whose storage tombstone is due, or only --owner: plan the
      tenants/<ownerId>/repos and /lfs prefixes, tombstone each manifest, then
      delete. Above 10 000 objects an owner is skipped unless --confirm names it.
      An owner whose user row still exists is reported and skipped, never purged.

  restore --project <id> --owner <id> [--operator <name>] [--dry-run]
          [--generation <G> [--confirm-snapshot <sha256>]] [--generation-floor <N>]
  restore --project <id> --owner <id> --list
      Rebuild a repository in the primary from the B2 second copy alone (DR1),
      through the read-only restore key (TAU_S3_RESTORE_*). The snapshot is
      found by version listing; by default only the one whose SHA-256 is
      project_git.copied_manifest_sha256 is restored. Another generation needs
      --generation and --confirm-snapshot with the SHA-256 --list prints. Every
      pack, index and LFS object is the version that verifies against its name;
      into an empty prefix the push-log chain comes too. It commits a fresh
      incarnation above the primary's, the snapshot's, Postgres's and any
      --generation-floor generation. Nothing in the primary is deleted or
      overwritten. Refuses an owner with a storage_tombstone row or a tombstone
      marker in the copy. --dry-run prints the plan and writes nothing.

  restore-owner --owner <id> [--operator <name>] [--dry-run]
      restore, with defaults, for every repository of the owner the copy holds
      and Postgres still has as an active project. Prints one line per
      repository; exits 1 when any was refused or failed.

  restore-store --project <id> --owner <id> [--operator <name>]
      The pre-DR1 restore from a bucket in Tau's own layout (a manifest.json and
      the packs it names) at TAU_S3_RESTORE_*: for a store move's copy, not B2.

  retire-lfs [--dry-run]
      Retire every LFS object whose unreachable mark is older than the 30-day
      window and that a fresh walk of its repository still does not reach. One
      read-only lease per project that has a candidate; --dry-run lists the
      candidates and hydrates nothing.

  collect-blobs [--dry-run]
      Delete publication blobs whose reference count is zero, in one bounded batch.

  mark-erasure --owner <id>
      Record a verified erasure request: the owner's tombstone becomes due now.

  freeze-all --for <seconds> --reason <incident or restore id>
      Freeze every repository at the API (the restore runbook's global freeze,
      DW1): git requests are held up to 5 s, then answered 429 with
      Retry-After: 1. Waits 5 s for every Machine's route cache to see it,
      then up to 16 s for requests in flight, and prints whether they
      drained. The freeze lapses on its own after --for (at most 86400); run
      it again to extend it. Needs REDIS_URL, which only the API app holds:
      run it from an API Machine, not from tau-maintenance.

  thaw-all
      Lift the global freeze.

  status
      Read-only worker liveness. Recovery must complete within 120 seconds;
      each heavy command must complete within 30 hours or be inside a 6-hour
      pass. Prints one revisions_maintenance.liveness JSON line. Runs in any process group, so it answers from an
      app Machine when the maintenance Machine is down.

Run bare, recover-projects, purge-projects, purge, retire-lfs and collect-blobs
are scheduled passes: each
records its start, completion or failure for status and logs one
revisions_maintenance.pass line. Any flag makes it an operator run, which
records nothing.

Environment: DATABASE_URL, the DATABASE_* timeouts and the TAU_S3_* storage
settings (maintenance-environment.config.ts), plus TAU_S3_RESTORE_ENDPOINT,
TAU_S3_RESTORE_BUCKET, TAU_S3_RESTORE_ACCESS_KEY_ID,
TAU_S3_RESTORE_SECRET_ACCESS_KEY and the optional TAU_S3_RESTORE_REGION and
TAU_S3_RESTORE_FORCE_PATH_STYLE for restore, and REDIS_URL for freeze-all.`;

/** `--flag value`, with no positional arguments anywhere in this command. */
const option = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

const required = (args: readonly string[], name: string): string => {
  const value = option(args, name);
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error(`--${name} is required\n\n${usage}`);
  }
  return value;
};

const environmentValue = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for restore`);
  }
  return value;
};

/**
 * The store the copy lives in. Declared additively as its own `TAU_S3_RESTORE_*`
 * family rather than in `environment.config.ts`, because the API never reads
 * it: only this command does, and only for `restore`. W8 carries the family
 * into the deployment as secrets on the maintenance group.
 */
const restoreAccount = (): StorageAccount => ({
  id: 'tau-restore-source',
  endpoint: environmentValue('TAU_S3_RESTORE_ENDPOINT'),
  region: process.env['TAU_S3_RESTORE_REGION'] ?? 'auto',
  bucket: environmentValue('TAU_S3_RESTORE_BUCKET'),
  forcePathStyle: process.env['TAU_S3_RESTORE_FORCE_PATH_STYLE'] !== 'false',
  credentials: {
    accessKeyId: environmentValue('TAU_S3_RESTORE_ACCESS_KEY_ID'),
    secretAccessKey: environmentValue('TAU_S3_RESTORE_SECRET_ACCESS_KEY'),
  },
});

/** A whole-number `--flag`, or `undefined` when absent. */
const optionalInteger = (args: readonly string[], name: string): number | undefined => {
  const value = option(args, name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a whole number\n\n${usage}`);
  }
  return parsed;
};

/** The B2 copy through the restore key, guarded to list, head and get. */
const copyReader = (): S3MirrorDestination => {
  const account = restoreAccount();
  return new S3MirrorDestination(
    {
      endpoint: account.endpoint,
      region: account.region,
      bucket: account.bucket,
      forcePathStyle: account.forcePathStyle,
      credentials: account.credentials,
    },
    undefined,
    { readOnly: true },
  );
};

/** What a restore prints: the plan and what it wrote, never object bytes. */
const summary = (result: Awaited<ReturnType<typeof restoreFromCopy>>) => ({
  dryRun: result.manifest === undefined,
  plan: result.plan,
  committedGeneration: result.manifest?.generation,
  incarnation: result.manifest?.incarnation,
  packs: result.packs.length,
  segments: result.segments.length,
  lfs: result.lfs,
});

// oxlint-disable-next-line max-lines-per-function -- one switch over the subcommands; splitting it hides the argument contract
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? '';
  if (command === '' || command === '--help') {
    console.log(usage);
    return;
  }

  const environment = getMaintenanceEnvironment();
  const configService = new ConfigService<MaintenanceEnvironment, true>(environment);
  const driver = new ObjectStorageService(configService);

  if (command === 'status') {
    // Read-only, so exempt from the singleton guard: it must answer from an
    // `app` Machine precisely when the maintenance Machine is gone.
    const liveness = await readMaintenanceLiveness(driver, new Date());
    console.log(JSON.stringify({ event: 'revisions_maintenance.liveness', ...liveness }));
    if (!liveness.ok) {
      process.exitCode = 1;
    }
    return;
  }

  assertSingletonProcessGroup();

  /* eslint-disable @typescript-eslint/naming-convention -- PostgreSQL connection options */
  const client = postgres(environment.DATABASE_URL, {
    max: 2,
    prepare: false,
    connect_timeout: environment.DATABASE_CONNECT_TIMEOUT_SECONDS,
    idle_timeout: environment.DATABASE_IDLE_TIMEOUT_SECONDS,
    connection: {
      application_name: applicationNameOf('maintenance'),
      statement_timeout: environment.DATABASE_STATEMENT_TIMEOUT_MS,
      lock_timeout: environment.DATABASE_LOCK_TIMEOUT_MS,
      idle_in_transaction_session_timeout: environment.DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    },
  });
  /* eslint-enable @typescript-eslint/naming-convention -- end PostgreSQL options */
  const database = drizzle(client, { schema });
  const report = (line: string): void => {
    console.log(line);
  };
  /** The project of `ownerId`, active and in Tau's own account: the only repositories the copy holds (D26). */
  const copiedLocator = async (projectId: string, ownerId: string) => {
    await assertProjectActive(database, projectId);
    const [held] = await database
      .select({ storageAccountId: project.storageAccountId })
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.ownerId, ownerId)))
      .limit(1);
    if (held === undefined) {
      throw new Error('Project owner not found');
    }
    if (held.storageAccountId !== null) {
      throw new Error('The second copy holds only repositories in the Tau default account');
    }
    return repositoryLocator({ ownerId, projectId });
  };
  /** `restore-owner`'s step: one repository, reported as one line; false when it was refused or failed. */
  const restoreOneOfOwner = async (copy: S3MirrorDestination, ownerId: string, projectId: string): Promise<boolean> => {
    try {
      const result = await restoreFromCopy({
        database,
        copy,
        primary: new S3RepositoryStore(driver),
        lfs: driver,
        locator: await copiedLocator(projectId, ownerId),
        operator: option(args, 'operator') ?? 'operator',
        dryRun: args.includes('--dry-run'),
        report,
      });
      await writeLine(JSON.stringify({ event: 'revisions_maintenance.restore', projectId, ...summary(result) }));
      return true;
    } catch (error) {
      await writeLine(
        JSON.stringify({
          event: 'revisions_maintenance.restore_refused',
          projectId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    }
  };
  /* The loop runs each subcommand bare; that form alone is the scheduled pass
     `status` judges. A flagged run is an operator's and leaves no record. */
  const pass = async <T>(scheduled: ScheduledMaintenanceCommand, run: () => Promise<T>): Promise<T> =>
    args.length === 1 ? recordMaintenancePass({ store: driver, command: scheduled, run, report }) : run();

  try {
    switch (command) {
      case 'worker': {
        const stop = new AbortController();
        const stopWorker = (): void => {
          stop.abort();
        };
        process.once('SIGTERM', stopWorker);
        process.once('SIGINT', stopWorker);
        try {
          if (environment.TAU_MAINTENANCE_STANDBY) {
            await holdInStandby({
              signal: stop.signal,
              report,
              checks: {
                database: async () => client`select 1`,
                privateStorage: async () => readMaintenanceLiveness(driver, new Date()),
                publicStorage: async () => driver.headProbeObject(AbortSignal.timeout(5000)),
              },
            });
            break;
          }
          await runMaintenanceWorker({
            signal: stop.signal,
            reportFailure: (lane, error) => {
              report(
                JSON.stringify({
                  event: 'revisions_maintenance.failure',
                  lane,
                  error: error instanceof Error ? error.name : 'MaintenanceError',
                }),
              );
            },
            recover: async () => {
              let details = { pending: 0, oldestPendingAge: 0 };
              await recordMaintenancePass({
                store: driver,
                command: 'recover-projects',
                report,
                details: () => details,
                run: async () => {
                  details = await recoverProjectDeletions({
                    database,
                    store: new S3RepositoryStore(driver),
                    signal: stop.signal,
                  });
                },
              });
            },
            heavy: async () => {
              stop.signal.throwIfAborted();
              await pass('purge-projects', async () => {
                for await (const outcome of purgeDeletedProjects({
                  database,
                  driver,
                  store: new S3RepositoryStore(driver),
                })) {
                  // oxlint-disable-next-line no-await-in-loop -- report with backpressure.
                  await writeLine(JSON.stringify(outcome));
                  stop.signal.throwIfAborted();
                }
              });
              stop.signal.throwIfAborted();
              await pass('purge', async () => {
                for await (const outcome of purgeTombstonedTenants({ database, driver, report: writeLine })) {
                  // oxlint-disable-next-line no-await-in-loop -- report with backpressure.
                  await writeLine(JSON.stringify(outcome));
                  stop.signal.throwIfAborted();
                }
              });
              stop.signal.throwIfAborted();
              await pass('retire-lfs', async () => {
                for await (const outcome of retireDueLfsObjects(
                  { database, store: new S3RepositoryStore(driver), storage: driver },
                  { now: new Date() },
                )) {
                  // oxlint-disable-next-line no-await-in-loop -- report with backpressure.
                  await writeLine(JSON.stringify(outcome));
                  stop.signal.throwIfAborted();
                }
              });
              stop.signal.throwIfAborted();
              await pass('collect-blobs', async () => {
                await collectZeroCountBlobs({ database, driver, report });
              });
            },
          });
        } finally {
          process.removeListener('SIGTERM', stopWorker);
          process.removeListener('SIGINT', stopWorker);
        }
        break;
      }
      case 'recover-projects': {
        let details = { pending: 0, oldestPendingAge: 0 };
        await recordMaintenancePass({
          store: driver,
          command: 'recover-projects',
          report,
          details: () => details,
          run: async () => {
            details = await recoverProjectDeletions({ database, store: new S3RepositoryStore(driver) });
          },
        });
        console.log(JSON.stringify(details));
        break;
      }
      case 'purge-projects': {
        const projectId = option(args, 'project');
        if (projectId === undefined && args.length !== 1) {
          throw new Error('Project purge flags require --project');
        }
        await pass('purge-projects', async () => {
          if (projectId === undefined) {
            for await (const outcome of purgeDeletedProjects({
              database,
              driver,
              store: new S3RepositoryStore(driver),
            })) {
              // oxlint-disable-next-line no-await-in-loop -- report with backpressure.
              await writeLine(JSON.stringify(outcome));
            }
          } else {
            const outcome = await purgeDeletedProject({
              database,
              driver,
              store: new S3RepositoryStore(driver),
              projectId,
              dryRun: args.includes('--dry-run'),
              ...(option(args, 'confirm-plan') === undefined
                ? {}
                : {
                    confirmation: {
                      ownerId: required(args, 'confirm-owner'),
                      projectId: required(args, 'confirm-project'),
                      fingerprint: required(args, 'confirm-plan'),
                    },
                  }),
            });
            await writeLine(JSON.stringify(outcome));
          }
        });
        break;
      }
      case 'purge': {
        await pass('purge', async () => {
          for await (const outcome of purgeTombstonedTenants({
            database,
            driver,
            report: writeLine,
            dryRun: args.includes('--dry-run'),
            ...(option(args, 'owner') === undefined ? {} : { ownerIds: [required(args, 'owner')] }),
            ...(option(args, 'confirm') === undefined ? {} : { confirmOwnerId: required(args, 'confirm') }),
          })) {
            // oxlint-disable-next-line no-await-in-loop -- backpressure bounds backlog output
            await writeLine(JSON.stringify(outcome));
          }
        });
        break;
      }
      case 'restore': {
        const projectId = required(args, 'project');
        const ownerId = required(args, 'owner');
        const locator = await copiedLocator(projectId, ownerId);
        const copy = copyReader();
        try {
          if (args.includes('--list')) {
            for (const snapshot of await listCopySnapshots({ database, copy, locator })) {
              // oxlint-disable-next-line no-await-in-loop -- backpressure bounds operator output
              await writeLine(JSON.stringify({ event: 'revisions_maintenance.restore_snapshot', ...snapshot }));
            }
            break;
          }
          const generation = optionalInteger(args, 'generation');
          const generationFloor = optionalInteger(args, 'generation-floor');
          const confirmSnapshot = option(args, 'confirm-snapshot');
          const result = await restoreFromCopy({
            database,
            copy,
            primary: new S3RepositoryStore(driver),
            lfs: driver,
            locator,
            operator: option(args, 'operator') ?? 'operator',
            dryRun: args.includes('--dry-run'),
            ...(generation === undefined ? {} : { generation }),
            ...(generationFloor === undefined ? {} : { generationFloor }),
            ...(confirmSnapshot === undefined ? {} : { confirmSnapshot }),
            report,
          });
          console.log(JSON.stringify({ event: 'revisions_maintenance.restore', projectId, ...summary(result) }));
        } finally {
          copy.destroy();
        }
        break;
      }
      case 'restore-owner': {
        const ownerId = required(args, 'owner');
        const copy = copyReader();
        let failed = 0;
        try {
          for (const projectId of await copiedProjects(copy, ownerId)) {
            // oxlint-disable-next-line no-await-in-loop -- one repository at a time
            failed += (await restoreOneOfOwner(copy, ownerId, projectId)) ? 0 : 1;
          }
        } finally {
          copy.destroy();
        }
        if (failed > 0) {
          process.exitCode = 1;
        }
        break;
      }
      case 'restore-store': {
        const projectId = required(args, 'project');
        const ownerId = required(args, 'owner');
        await assertProjectActive(database, projectId);
        const [held] = await database
          .select({ storageAccountId: project.storageAccountId })
          .from(project)
          .where(and(eq(project.id, projectId), eq(project.ownerId, ownerId)))
          .limit(1);
        if (held === undefined) {
          throw new Error('Project owner not found');
        }
        if (held.storageAccountId !== null && held.storageAccountId !== driver.account.id) {
          throw new Error('Restore storage account unavailable');
        }
        const primary = new S3RepositoryStore(driver);
        const source = new S3RepositoryStore(driver.forAccount(restoreAccount()));
        const result = await restoreRepository({
          source,
          primary,
          database,
          locator: repositoryLocator({
            ownerId,
            projectId,
            ...(held.storageAccountId === null ? {} : { accountId: held.storageAccountId }),
          }),
          operator: option(args, 'operator') ?? 'operator',
          report,
        });
        console.log(JSON.stringify(result));
        break;
      }
      case 'retire-lfs': {
        const now = new Date();
        if (args.includes('--dry-run')) {
          /* The same predicate `retireDueLfsObjects` selects on, imported
             rather than restated: nothing is hydrated and nothing is deleted. */
          let cursor: { projectId: string; oid: string } | undefined;
          for (;;) {
            // oxlint-disable-next-line no-await-in-loop -- bounded keyset pages for operator output
            const due = await database
              .select({ projectId: projectGitLfsObject.projectId, oid: projectGitLfsObject.oid })
              .from(projectGitLfsObject)
              .where(
                and(
                  dueCondition(now, lfsRetirementWindowMilliseconds),
                  cursor === undefined
                    ? undefined
                    : or(
                        gt(projectGitLfsObject.projectId, cursor.projectId),
                        and(
                          eq(projectGitLfsObject.projectId, cursor.projectId),
                          gt(projectGitLfsObject.oid, cursor.oid),
                        ),
                      ),
                ),
              )
              .orderBy(asc(projectGitLfsObject.projectId), asc(projectGitLfsObject.oid))
              .limit(500);
            if (due.length === 0) {
              break;
            }
            cursor = due.at(-1)!;
            // oxlint-disable-next-line no-await-in-loop -- backpressure bounds dry-run output
            await writeLine(JSON.stringify(due));
          }
          break;
        }
        await pass('retire-lfs', async () => {
          for await (const outcome of retireDueLfsObjects(
            { database, store: new S3RepositoryStore(driver), storage: driver },
            { now },
          )) {
            // oxlint-disable-next-line no-await-in-loop -- backpressure bounds backlog output
            await writeLine(JSON.stringify(outcome));
          }
        });
        break;
      }
      case 'collect-blobs': {
        const result = await pass('collect-blobs', async () =>
          collectZeroCountBlobs({ database, driver, report, dryRun: args.includes('--dry-run') }),
        );
        console.log(JSON.stringify(result));
        break;
      }
      case 'mark-erasure': {
        /*
         * The one writer of `erasure`, and it exists only here: a verified
         * erasure request removes the 30-day wait, so it is an operator action
         * by construction rather than by an authorization check (D10, D31).
         */
        const ownerId = required(args, 'owner');
        const live = await liveOwnerIds(database, [ownerId]);
        if (live.size > 0) {
          // The same gate the purge applies: a live account is never given a
          // due tombstone, whatever its erasure paperwork says.
          throw new Error(`'${ownerId}' still has a user row: delete the account before recording its erasure.`);
        }
        const at = new Date();
        const marked = await database
          .update(storageTombstone)
          .set({ erasure: true, purgeAfter: at })
          .where(eq(storageTombstone.ownerId, ownerId))
          .returning({ ownerId: storageTombstone.ownerId, purgeAfter: storageTombstone.purgeAfter });
        if (marked.length === 0) {
          // Never creates a tombstone: the row is written when the account is
          // deleted, and marking one that does not exist would aim the purge at
          // a live tenant.
          throw new Error(`No storage tombstone for '${ownerId}': the account must be deleted before its erasure.`);
        }
        console.log(JSON.stringify(marked));
        break;
      }
      case 'freeze-all': {
        const forSeconds = parseFreezeSeconds(option(args, 'for'));
        const reason = required(args, 'reason');
        if (environment.REDIS_URL === undefined) {
          // The tau-maintenance app holds no Redis (DC4); an API Machine has the URL and this command.
          throw new Error('freeze-all needs REDIS_URL for the in-flight registry: run it from an API Machine');
        }
        const redis = new Redis(environment.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
        await redis.connect();
        const registry = new RedisInFlightRegistry(redis);
        try {
          console.log(JSON.stringify(await freezeEverything({ database, registry, reason, forSeconds })));
        } finally {
          registry.close();
          await redis.quit();
        }
        break;
      }
      case 'thaw-all': {
        console.log(JSON.stringify(await thawEverything(database)));
        break;
      }
      default: {
        throw new Error(`Unknown command '${command}'\n\n${usage}`);
      }
    }
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Maintenance command failed');
  process.exitCode = 1;
}
