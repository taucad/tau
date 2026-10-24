import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CreateBucketCommand, GetObjectLockConfigurationCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { commitLease } from '#api/git/store/commit.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';

/**
 * Real repositories for the second-copy suites (DR1, DR2): packs git wrote and
 * `index-pack` accepts, committed through the store's own lease and commit, and
 * the compliance-locked MinIO bucket that stands in for B2.
 */

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const isolatedGit = (extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv => {
  const environment: Record<string, string> = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: tmpdir(),
    LANG: 'C',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    ...extra,
  };
  return environment as NodeJS.ProcessEnv;
};
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

export const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: isolatedGit() });

/** Scratch directories, removed by {@link removeScratch}. */
export type Scratch = { readonly make: (label: string) => string; readonly remove: () => void };

export const scratchDirectories = (prefix: string): Scratch => {
  const made: string[] = [];
  return {
    make: (label) => {
      const directory = mkdtempSync(path.join(tmpdir(), `${prefix}-${label}-`));
      made.push(directory);
      return directory;
    },
    remove: () => {
      for (const directory of made.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  };
};

/** A client repository on `main` with an annotated tag; `revise` adds a commit. */
export const newClient = (scratch: Scratch): { directory: string; revise: (n: number) => void } => {
  const directory = scratch.make('client');
  git(directory, 'init', '--quiet', '--initial-branch=main', '.');
  git(directory, 'config', 'user.name', 'DR1');
  git(directory, 'config', 'user.email', 'dr1@tau.test');
  const revise = (n: number): void => {
    writeFileSync(path.join(directory, 'main.scad'), `cube(${String(n)});\n`);
    git(directory, 'add', '.');
    git(directory, 'commit', '--quiet', '-m', `rev ${String(n)}`);
  };
  revise(1);
  git(directory, 'tag', '-a', 'v1', '-m', 'v1');
  return { directory, revise };
};

/** Pushes `client`'s `main` and `v1` into a lease over `store` and commits it, as the write path does. */
// oxlint-disable-next-line max-params -- the store, the repository, the client and where leases go
export const pushReal = async (
  store: RepositoryStore,
  locator: RepositoryLocator,
  client: string,
  scratch: Scratch,
): Promise<Manifest> => {
  const lease = await hydrateLease({ store, locator, parentDirectory: scratch.make('lease') });
  try {
    execFileSync('git', ['push', '--quiet', lease.directory, 'main', 'v1'], {
      cwd: client,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment name
      env: isolatedGit({ TAU_GIT_PUSH_ADMITTED: '1' }),
    });
    await commitLease({ store, lease, committedBy: 'user_dr1' });
  } finally {
    await lease.dispose();
  }
  const read = await store.readManifest(locator);
  if (read === undefined) {
    throw new Error('the push committed no manifest');
  }
  return decodeManifest(read.manifest);
};

/** The local B2 stand-in: refuses any bucket but the local one, creates it under Object Lock if missing. */
export const lockedCopyBucket = async (raw: S3Client, endpoint: string, bucket: string): Promise<void> => {
  const { hostname } = new URL(endpoint);
  if (bucket !== 'tau-content-second-copy' || !['localhost', '127.0.0.1'].includes(hostname)) {
    throw new Error(`Refusing to write compliance-locked objects to '${bucket}' at a non-local endpoint`);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the S3 wire shape
    await raw.send(new CreateBucketCommand({ Bucket: bucket, ObjectLockEnabledForBucket: true }));
  } catch (error) {
    if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes((error as Error).name)) {
      throw error;
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the S3 wire shape
  const lock = await raw.send(new GetObjectLockConfigurationCommand({ Bucket: bucket }));
  if (lock.ObjectLockConfiguration?.ObjectLockEnabled !== 'Enabled') {
    throw new Error(`'${bucket}' has no Object Lock`);
  }
};
