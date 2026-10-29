import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import process from 'node:process';
/* oxlint-disable no-restricted-imports -- Vitest loads global setup before test aliases exist. */
import { apiRoot, logDirectory, startApi, startStorage, stopChild } from './api-process.ts';
import { gitE2EApiUrl, gitE2EFrontendUrl, gitE2ESecondaryApiUrl, gitE2EStorageUrls } from './config.ts';
/* oxlint-enable no-restricted-imports */
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- merging into vitest's `ProvidedContext` requires `interface`.
  export interface ProvidedContext {
    /** The pids of the two API processes this setup owns. */
    gitE2EApiPids: readonly number[];
    /** The pids of the two tau-storage workers this setup owns: whose lease folders a spec may count (DC1). */
    gitE2EStoragePids: readonly number[];
  }
}

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
 * **Two workers behind them (DC1).** Since DC1 the API holds no lease and runs
 * no git child: it signs a grant and streams each RPC to tau-storage. This
 * setup boots two workers first and points both APIs at both of them, so the
 * tier is the deployed topology: two APIs, two workers, one MinIO.
 *
 * Docker (postgres/redis/minio) and `api:db-migrate` run ahead of vitest from
 * the Nx target, exactly as `desktop-e2e`'s `test:e2e` does.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../..');

export const setup = async (project: TestProject): Promise<() => Promise<void>> => {
  mkdirSync(logDirectory, { recursive: true });

  /* Unconditional and cheap (~200 ms warm): a stale `dist/main.js` is the one
   * failure mode of this tier that misattributes itself to the server code
   * under test. */
  if (process.env['TAU_E2E_COMPLETED_ARTIFACT'] === 'true') {
    if (process.env['TAU_E2E_EXTERNAL_SERVICES'] !== 'true' || !process.env['TAU_E2E_API_CWD']) {
      throw new Error('Completed API acceptance requires external services and an isolated API working directory.');
    }
    for (const [value, defaultPort] of [
      [process.env['DATABASE_URL'], '5432'],
      [process.env['REDIS_URL'], '6379'],
      [process.env['TAU_S3_ENDPOINT'], '9000'],
      [gitE2EApiUrl, '4014'],
      [gitE2ESecondaryApiUrl, '4016'],
      ...gitE2EStorageUrls.map((url) => [url, '4021'] as const),
    ]) {
      const url = new URL(value ?? 'http://invalid');
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port || url.port === defaultPort) {
        throw new Error('Completed API acceptance requires explicit alternate-port loopback services.');
      }
    }
    if (
      !existsSync(resolve(apiRoot, 'dist/main.js')) ||
      !existsSync(resolve(apiRoot, 'dist/storage-worker.js')) ||
      !existsSync(resolve(workspaceRoot, 'packages/cli/dist/bin/tau.mjs'))
    ) {
      throw new Error('Build the API and CLI before completed-artifact acceptance.');
    }
  } else {
    execFileSync(resolve(workspaceRoot, 'node_modules/.bin/vite'), ['build'], { cwd: apiRoot, stdio: 'ignore' });
    execFileSync(
      resolve(workspaceRoot, 'node_modules/.bin/vite'),
      ['build', '--config', 'vite.storage-worker.config.ts'],
      {
        cwd: apiRoot,
        stdio: 'ignore',
      },
    );
  }

  const workers: Array<Awaited<ReturnType<typeof startStorage>>> = [];
  const stopWorkers = async (): Promise<void> => {
    await Promise.all(workers.map(async (worker) => stopChild(worker.child)));
    for (const worker of workers) {
      worker.log.end();
    }
  };
  try {
    for (const [index, url] of gitE2EStorageUrls.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- sequential, like the APIs below
      workers.push(await startStorage({ url, label: `worker-${String(index + 1)}` }));
    }
  } catch (error) {
    await stopWorkers();
    throw error;
  }

  /* Sequential, not concurrent: the second process must fail for its own
   * reasons, not because it raced the first through boot. */
  let primary;
  try {
    primary = await startApi({ url: gitE2EApiUrl, label: 'primary', frontendUrl: gitE2EFrontendUrl });
  } catch (error) {
    await stopWorkers();
    throw error;
  }
  let secondary;
  try {
    secondary = await startApi({ url: gitE2ESecondaryApiUrl, label: 'secondary', frontendUrl: gitE2EFrontendUrl });
  } catch (error) {
    await stopChild(primary.child);
    primary.log.end();
    await stopWorkers();
    throw error;
  }

  project.provide(
    'gitE2EApiPids',
    [primary.child.pid, secondary.child.pid].filter((pid) => pid !== undefined),
  );
  project.provide(
    'gitE2EStoragePids',
    workers.map((worker) => worker.child.pid).filter((pid) => pid !== undefined),
  );

  return async () => {
    await Promise.all([stopChild(primary.child), stopChild(secondary.child)]);
    primary.log.end();
    secondary.log.end();
    await stopWorkers();
  };
};
