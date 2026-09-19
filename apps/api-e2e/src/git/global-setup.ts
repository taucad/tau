import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
/* oxlint-disable no-restricted-imports -- Vitest loads global setup before test aliases exist. */
import { apiRoot, logDirectory, startApi, stopChild } from './api-process.ts';
import { gitE2EApiUrl, gitE2EFrontendUrl, gitE2ESecondaryApiUrl } from './config.ts';
/* oxlint-enable no-restricted-imports */
import { resolve } from 'node:path';

/**
 * The git-server tier's own API processes (charter W18, W8; success criterion S2).
 *
 * `apps/api/app/api/git/git.http.integration.test.ts` already drives every
 * route in-process, with the database, the object store and the caller's
 * identity stubbed. What it cannot show is the part this tier exists for: a
 * real Nest process behind a real Fastify, a real Postgres deciding whether the
 * caller owns the project and what their plan entitles, real MinIO issuing the
 * presigned LFS transfers, and `git`'s own `receive.maxInputSize` on a real
 * child.
 *
 * **Two processes, not one.** The Hosted Remote's durable state is the object
 * store and its leases are ephemeral directories under each process's own
 * `os.tmpdir()`, so nothing is shared between these two but PostgreSQL and
 * MinIO — which is exactly the deployed shape (`fly.*.toml`, `app` at two or
 * more Machines). `two-process.spec.ts` reads through the second what stock git
 * pushed through the first. The in-process S2 suite proves the same property
 * against two Nest applications; this one proves it across two operating-system
 * processes that never see each other's memory or disk.
 *
 * Booting one process is `api-process.ts`, which W10's local-only suites reuse
 * for the processes they proxy and kill.
 *
 * Docker (postgres/redis/minio) and `api:db-migrate` run ahead of vitest from
 * the Nx target, exactly as `desktop-e2e`'s `test:e2e` does.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../..');

export const setup = async (): Promise<() => Promise<void>> => {
  mkdirSync(logDirectory, { recursive: true });

  /* Unconditional and cheap (~200 ms warm): a stale `dist/main.js` is the one
   * failure mode of this tier that misattributes itself to the server code
   * under test. */
  execFileSync(resolve(workspaceRoot, 'node_modules/.bin/vite'), ['build'], { cwd: apiRoot, stdio: 'ignore' });

  /* Sequential, not concurrent: the second process must fail for its own
   * reasons, not because it raced the first through boot. */
  const primary = await startApi({ url: gitE2EApiUrl, label: 'primary', frontendUrl: gitE2EFrontendUrl });
  let secondary;
  try {
    secondary = await startApi({ url: gitE2ESecondaryApiUrl, label: 'secondary', frontendUrl: gitE2EFrontendUrl });
  } catch (error) {
    await stopChild(primary.child);
    primary.log.end();
    throw error;
  }

  return async () => {
    await Promise.all([stopChild(primary.child), stopChild(secondary.child)]);
    primary.log.end();
    secondary.log.end();
  };
};
