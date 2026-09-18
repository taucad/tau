import 'reflect-metadata'; // oxlint-disable-line import/no-unassigned-import -- Nest decorators require metadata before service imports
import process from 'node:process';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnvironment } from '#config/environment.config.js';
import type { Environment } from '#config/environment.config.js';
import * as schema from '#database/schema.js';
import { projectGitLfsObject, storageTombstone } from '#database/schema.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import type { StorageAccount } from '#storage/object-storage.service.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { dueCondition, lfsRetirementWindowMilliseconds, retireDueLfsObjects } from '#api/git/lfs-retirement.js';
import { collectZeroCountBlobs } from '#api/git/maintenance/blob-collector.js';
import { liveOwnerIds, purgeTombstonedTenants } from '#api/git/maintenance/purge.js';
import { restoreRepository } from '#api/git/maintenance/restore.js';
import { assertSingletonProcessGroup } from '#api/git/maintenance/singleton.js';

/**
 * `revisions-maintenance`: the singleton entry for everything that must happen
 * once rather than in every API replica (charter D21, W6). It ships in the API
 * image beside `billing-command.js` and declares its own Fly process group.
 *
 * Nothing here is reachable from a request. That is the point: purge deletes
 * whole tenant prefixes and `mark-erasure` opens that window, so both exist
 * only as operator subcommands of a process the request path never starts.
 */

const usage = `Usage: revisions-maintenance <command>

  purge [--owner <id>] [--confirm <ownerId>] [--dry-run]
      Purge every tenant whose storage tombstone is due, or only --owner: plan the
      tenants/<ownerId>/repos and /lfs prefixes, tombstone each manifest, then
      delete. Above 10 000 objects an owner is skipped unless --confirm names it.
      An owner whose user row still exists is reported and skipped, never purged.

  restore --project <id> --owner <id> [--operator <name>]
      Rebuild a repository in the primary store from the manifest and packs held
      by the restore source (TAU_S3_RESTORE_*), with a fresh incarnation and a
      higher generation. Nothing in the primary is deleted.

  retire-lfs [--dry-run]
      Retire every LFS object whose unreachable mark is older than the 30-day
      window and that a fresh walk of its repository still does not reach. One
      read-only lease per project that has a candidate; --dry-run lists the
      candidates and hydrates nothing.

  collect-blobs [--dry-run]
      Delete publication blobs whose reference count is zero, in one bounded batch.

  mark-erasure --owner <id>
      Record a verified erasure request: the owner's tombstone becomes due now.

Environment: the API's own configuration, plus TAU_S3_RESTORE_ENDPOINT,
TAU_S3_RESTORE_BUCKET, TAU_S3_RESTORE_ACCESS_KEY_ID,
TAU_S3_RESTORE_SECRET_ACCESS_KEY and the optional TAU_S3_RESTORE_REGION and
TAU_S3_RESTORE_FORCE_PATH_STYLE for restore.`;

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

// oxlint-disable-next-line max-lines-per-function -- one switch over five subcommands; splitting it hides the argument contract
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? '';
  if (command === '' || command === '--help') {
    console.log(usage);
    return;
  }

  assertSingletonProcessGroup();

  const environment = getEnvironment();
  const configService = new ConfigService<Environment, true>(environment);
  const driver = new ObjectStorageService(configService);
  const client = postgres(environment.DATABASE_URL, { max: 1, prepare: false });
  const database = drizzle(client, { schema });
  const report = (line: string): void => {
    console.log(line);
  };

  try {
    switch (command) {
      case 'purge': {
        const outcomes = await purgeTombstonedTenants({
          database,
          driver,
          report,
          dryRun: args.includes('--dry-run'),
          ...(option(args, 'owner') === undefined ? {} : { ownerIds: [required(args, 'owner')] }),
          ...(option(args, 'confirm') === undefined ? {} : { confirmOwnerId: required(args, 'confirm') }),
        });
        console.log(JSON.stringify(outcomes));
        break;
      }
      case 'restore': {
        const primary = new S3RepositoryStore(driver);
        const source = new S3RepositoryStore(driver.forAccount(restoreAccount()));
        const result = await restoreRepository({
          source,
          primary,
          locator: repositoryLocator({ ownerId: required(args, 'owner'), projectId: required(args, 'project') }),
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
          const due = await database
            .select({ projectId: projectGitLfsObject.projectId, oid: projectGitLfsObject.oid })
            .from(projectGitLfsObject)
            .where(dueCondition(now, lfsRetirementWindowMilliseconds));
          console.log(JSON.stringify(due));
          break;
        }
        const outcomes = await retireDueLfsObjects(
          { database, store: new S3RepositoryStore(driver), storage: driver },
          { now },
        );
        console.log(JSON.stringify(outcomes));
        break;
      }
      case 'collect-blobs': {
        const result = await collectZeroCountBlobs({ database, driver, report, dryRun: args.includes('--dry-run') });
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
