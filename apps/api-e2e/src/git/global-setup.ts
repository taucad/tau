/* oxlint-disable no-await-in-loop -- Server readiness polling is intentionally sequential. */
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import type { WriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
/* oxlint-disable no-restricted-imports -- Vitest loads global setup before test aliases exist. */
import { gitE2EApiUrl, gitE2EFrontendUrl, gitE2ESecondaryApiUrl } from './config.ts';
/* oxlint-enable no-restricted-imports */

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
 * Docker (postgres/redis/minio) and `api:db-migrate` run ahead of vitest from
 * the Nx target, exactly as `desktop-e2e`'s `test:e2e` does.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const apiRoot = resolve(workspaceRoot, 'apps/api');
const logDirectory = resolve(workspaceRoot, 'out/test-results/api-e2e-git');

const isApiLive = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(new URL('/health/live', url));
    return response.ok;
  } catch {
    return false;
  }
};

const waitForApi = async (child: ChildProcess, url: string): Promise<void> => {
  const deadline = Date.now() + 180_000;
  while (!(await isApiLive(url))) {
    if (child.exitCode !== null) {
      throw new Error(`Tau API test server on ${url} exited with code ${String(child.exitCode)}`);
    }
    if (Date.now() >= deadline) {
      child.kill('SIGTERM');
      throw new Error(`Tau API test server did not become ready at ${url}`);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    });
  }
};

const stopChild = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    const exited = (): void => {
      clearTimeout(killTimeout);
      resolve();
    };
    const killTimeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5000);
    child.once('exit', exited);
    child.kill('SIGTERM');
  });
};

/**
 * The environment both processes boot with, minus the port-shaped values.
 *
 * There is no `TAU_GIT_ROOT`: it is retired, and the schema now refuses to boot
 * a process that carries it (charter S3). Repositories live in the object store
 * this tier's MinIO provides, and each process hydrates its own lease under its
 * own `os.tmpdir()`.
 */
const sharedEnvironment = (): NodeJS.ProcessEnv => {
  const environment = { ...process.env };
  environment['NODE_ENV'] = 'development';
  environment['TAU_FRONTEND_URL'] = gitE2EFrontendUrl;
  environment['TAU_TEST_MODE'] = 'true';
  /* Without this the API selects `SelfHostCommercialEntitlementsService`, which
   * hands every caller `canSyncFiles: true` and Pro's allowance — so this
   * tier's whole plan dimension was inert and `should refuse a push from a
   * free-tier owner` passed with `200` for the wrong reason (review C56). The
   * schema requires the rest of this block whenever the flag is set; the values
   * are the same fixtures `apps/desktop-e2e/global-setup.ts` uses, and nothing
   * here reaches Stripe. */
  environment['TAU_CLOUD_ENABLED'] = 'true';
  environment['BILLING_ENVIRONMENT'] = 'development';
  environment['BILLING_USAGE_CURSOR_SECRET'] = 'api-e2e-git-usage-cursor-secret-min-32-chars';
  environment['BILLING_REQUEST_DIGEST_SECRET'] = 'api-e2e-git-request-digest-secret-min-32-chars';
  environment['STRIPE_SECRET_KEY'] = 'rk_test_api_e2e_git_create';
  environment['STRIPE_READ_SECRET_KEY'] = 'rk_test_api_e2e_git';
  environment['STRIPE_ACCOUNT_ID'] = 'acct_api_e2e_git';
  environment['STRIPE_LIVEMODE'] = 'false';
  environment['STRIPE_WEBHOOK_SECRET'] = 'whsec_api_e2e_git';
  environment['STRIPE_PRICE_ID_PRO_MONTHLY'] = 'price_api_e2e_git';
  environment['STRIPE_PRODUCT_ID_CREDIT_PACK'] = 'prod_api_e2e_git';
  /* Never set `TAU_GIT_REMOTE_ALLOW_PRIVATE` here: three rows in this tier
   * assert the proxy's loopback and private-address refusals, and P50's
   * relaxation inverts two of them (W18 review, Q2). */
  return environment;
};

/** One API process, live and with its git toolchain reported up. */
const startApi = async (url: string, label: string): Promise<{ child: ChildProcess; log: WriteStream }> => {
  if (await isApiLive(url)) {
    throw new Error(`Git-server E2E requires ownership of its dedicated API at ${url}`);
  }

  const environment = sharedEnvironment();
  environment['AUTH_URL'] = url;
  environment['PORT'] = new URL(url).port;
  environment['TAU_API_URL'] = url;

  const log = createWriteStream(resolve(logDirectory, `api-${label}.log`), { flags: 'w' });
  const child = spawn(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      '--import',
      new URL('register.mjs', pathToFileURL(createRequire(import.meta.url).resolve('@oxc-node/core/package.json')))
        .href,
      resolve(apiRoot, 'dist/main.js'),
    ],
    { cwd: apiRoot, env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.pipe(log);
  child.stderr.pipe(log);

  try {
    await waitForApi(child, url);
    /* W11a §10: `/health/ready` carries the `git` indicator, so a machine
     * without `git` or `git-lfs` fails here by name instead of failing
     * mysteriously in the middle of a push. */
    const readyResponse = await fetch(new URL('/health/ready', url));
    const ready = (await readyResponse.json()) as {
      readonly info?: Readonly<Record<string, Readonly<{ status: string }>>>;
    };
    if (ready.info?.['git']?.status !== 'up') {
      throw new Error(
        `The API on ${url} reports its git toolchain unavailable: ${JSON.stringify(ready.info?.['git'])}`,
      );
    }
  } catch (error) {
    await stopChild(child);
    log.end();
    throw error;
  }

  return { child, log };
};

export const setup = async (): Promise<() => Promise<void>> => {
  mkdirSync(logDirectory, { recursive: true });

  /* Unconditional and cheap (~200 ms warm): a stale `dist/main.js` is the one
   * failure mode of this tier that misattributes itself to the server code
   * under test. */
  execFileSync(resolve(workspaceRoot, 'node_modules/.bin/vite'), ['build'], { cwd: apiRoot, stdio: 'ignore' });

  /* Sequential, not concurrent: the second process must fail for its own
   * reasons, not because it raced the first through boot. */
  const primary = await startApi(gitE2EApiUrl, 'primary');
  let secondary;
  try {
    secondary = await startApi(gitE2ESecondaryApiUrl, 'secondary');
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
