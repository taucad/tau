/* oxlint-disable no-await-in-loop -- Server readiness polling is intentionally sequential. */
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
/* oxlint-disable no-restricted-imports -- Vitest loads global setup before test aliases exist. */
import { gitE2EApiUrl, gitE2EFrontendUrl } from './config.ts';
/* oxlint-enable no-restricted-imports */

/**
 * The git-server tier's own API process (charter W18, blueprint S40).
 *
 * `apps/api/app/api/git/git.http.integration.test.ts` already drives every
 * route in-process, with the database, the object store and the caller's
 * identity stubbed. What it cannot show is the part this tier exists for: a
 * real Nest process behind a real Fastify, a real Postgres deciding whether the
 * caller owns the project and what their plan entitles, real MinIO issuing the
 * presigned LFS transfers, and `git`'s own `receive.maxInputSize` on a real
 * child. So this boots the built API on the same `:4014` the desktop tier owns
 * — the two tiers are separate Nx targets and never run at once — and refuses
 * to start if something already holds it.
 *
 * Docker (postgres/redis/minio) and `api:db-migrate` run ahead of vitest from
 * the Nx target, exactly as `desktop-e2e`'s `test:e2e` does.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const apiRoot = resolve(workspaceRoot, 'apps/api');

const liveUrl = new URL('/health/live', gitE2EApiUrl);
const readyUrl = new URL('/health/ready', gitE2EApiUrl);

const isApiLive = async (): Promise<boolean> => {
  try {
    const response = await fetch(liveUrl);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForApi = async (child: ChildProcess): Promise<void> => {
  const deadline = Date.now() + 180_000;
  while (!(await isApiLive())) {
    if (child.exitCode !== null) {
      throw new Error(`Tau API test server exited with code ${String(child.exitCode)}`);
    }
    if (Date.now() >= deadline) {
      child.kill('SIGTERM');
      throw new Error(`Tau API test server did not become ready at ${gitE2EApiUrl}`);
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

export const setup = async (): Promise<() => Promise<void>> => {
  if (await isApiLive()) {
    throw new Error(`Git-server E2E requires ownership of its dedicated API at ${gitE2EApiUrl}`);
  }

  /* Unconditional and cheap (~200 ms warm): a stale `dist/main.js` is the one
   * failure mode of this tier that misattributes itself to the server code
   * under test. */
  execFileSync(resolve(workspaceRoot, 'node_modules/.bin/vite'), ['build'], { cwd: apiRoot, stdio: 'ignore' });

  const environment = { ...process.env };
  environment['AUTH_URL'] = gitE2EApiUrl;
  environment['NODE_ENV'] = 'development';
  environment['PORT'] = new URL(gitE2EApiUrl).port;
  environment['TAU_API_URL'] = gitE2EApiUrl;
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
  /* `TAU_GIT_ROOT` defaults to `.tau-git` and `git.service.ts` resolves it
   * against the process cwd, which is `apps/api` here — so without this every
   * run of this tier writes bare repositories into the source tree (825 MB of
   * them by W18's review). `out/test-results` is this tier's log home and is
   * gitignored; the repositories are kept rather than removed at teardown,
   * because a failed push is only diagnosable from the volume it landed on. */
  environment['TAU_GIT_ROOT'] = resolve(workspaceRoot, 'out/test-results/api-e2e-git/git-root');
  /* Never set `TAU_GIT_REMOTE_ALLOW_PRIVATE` here: three rows in this tier
   * assert the proxy's loopback and private-address refusals, and P50's
   * relaxation inverts two of them (W18 review, Q2). */

  const logDirectory = resolve(workspaceRoot, 'out/test-results/api-e2e-git');
  mkdirSync(logDirectory, { recursive: true });
  mkdirSync(environment['TAU_GIT_ROOT'], { recursive: true });
  const apiLog = createWriteStream(resolve(logDirectory, 'api.log'), { flags: 'w' });
  const api = spawn(
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
  api.stdout.pipe(apiLog);
  api.stderr.pipe(apiLog);

  try {
    await waitForApi(api);
    /* W11a §10: `/health/ready` carries the `git` indicator, so a machine
     * without `git` or `git-lfs` fails here by name instead of failing
     * mysteriously in the middle of a push. */
    const readyResponse = await fetch(readyUrl);
    const ready = (await readyResponse.json()) as {
      readonly info?: Readonly<Record<string, Readonly<{ status: string }>>>;
    };
    if (ready.info?.['git']?.status !== 'up') {
      throw new Error(`The API reports its git toolchain unavailable: ${JSON.stringify(ready.info?.['git'])}`);
    }
  } catch (error) {
    await stopChild(api);
    apiLog.end();
    throw error;
  }

  return async () => {
    await stopChild(api);
    apiLog.end();
  };
};
