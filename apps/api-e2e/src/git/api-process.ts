/* oxlint-disable no-await-in-loop -- Server readiness polling is intentionally sequential. */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import type { WriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Booting one API process of this tier (charter W8, W10).
 *
 * Extracted from `global-setup.ts` unchanged so W10's local-only suites can
 * boot processes of their own — a third process whose object store is a fault
 * proxy, and a fourth this tier is allowed to kill mid-push — without a second
 * copy of the environment block that review C56 had to correct once already.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
export const apiRoot = resolve(workspaceRoot, 'apps/api');
export const logDirectory = resolve(workspaceRoot, 'out/test-results/api-e2e-git');

export const isApiLive = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(new URL('/health/live', url));
    return response.ok;
  } catch {
    return false;
  }
};

export const waitForApi = async (child: ChildProcess, url: string): Promise<void> => {
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

export const stopChild = async (child: ChildProcess): Promise<void> => {
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
 * The environment every process of this tier boots with, minus the port-shaped
 * values.
 *
 * There is no `TAU_GIT_ROOT`: it is retired, and the schema now refuses to boot
 * a process that carries it (charter S3). Repositories live in the object store
 * this tier's MinIO provides, and each process hydrates its own lease under its
 * own `os.tmpdir()`.
 *
 * @param frontendUrl - The origin better-auth must trust.
 * @returns The environment block.
 */
export const sharedEnvironment = (frontendUrl: string): NodeJS.ProcessEnv => {
  const environment = { ...process.env };
  environment['NODE_ENV'] = 'development';
  environment['TAU_FRONTEND_URL'] = frontendUrl;
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

/**
 * One API process, live and with its git toolchain reported up.
 *
 * @param args - `url`, the origin the process listens on and answers as;
 *   `label`, the log file's name; `frontendUrl`, the origin better-auth must
 *   trust; and `overrides`, environment applied over the shared block for a
 *   process whose object store differs from the tier's default.
 * @returns The child and its log stream.
 */
export const startApi = async (args: {
  readonly url: string;
  readonly label: string;
  readonly frontendUrl: string;
  readonly overrides?: Readonly<Record<string, string>>;
}): Promise<{ child: ChildProcess; log: WriteStream }> => {
  const { url, label, frontendUrl, overrides = {} } = args;
  if (await isApiLive(url)) {
    throw new Error(`Git-server E2E requires ownership of its dedicated API at ${url}`);
  }
  mkdirSync(logDirectory, { recursive: true });

  const environment = sharedEnvironment(frontendUrl);
  environment['AUTH_URL'] = url;
  environment['PORT'] = new URL(url).port;
  environment['TAU_API_URL'] = url;
  Object.assign(environment, overrides);

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
