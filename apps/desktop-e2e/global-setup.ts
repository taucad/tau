/* oxlint-disable no-await-in-loop -- Server readiness polling is intentionally sequential. */
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
/* oxlint-disable no-restricted-imports -- Vitest loads global setup before test aliases exist. */
import {
  desktopE2EApiUrl,
  desktopE2ECompletedArtifact,
  desktopE2EFrontendUrl,
  desktopE2EPackagedExecutable,
  desktopE2EProviderStubKey,
  desktopE2EProviderStubUrl,
} from './src/support/config.ts';
/* oxlint-enable no-restricted-imports */

/**
 * Desktop smoke E2E stack boot (work item Z2).
 *
 * A port of `apps/ui-e2e/global-setup.ts`'s chat-vertical half, minus the UI
 * server: the desktop shell serves its own SPA from `app://tau`, so the only
 * thing this lane owns is a dedicated API on its own exclusive port. Docker
 * (postgres/redis/minio) and `api:db-migrate` run ahead of vitest, from the
 * nx target — the same split `test:e2e:chat` uses.
 */

const workspaceRoot = resolve(import.meta.dirname, '../..');
const apiRoot = resolve(import.meta.dirname, '../api');
const apiLiveUrl = new URL('/health/live', desktopE2EApiUrl);

const isApiReady = async (): Promise<boolean> => {
  try {
    const response = await fetch(apiLiveUrl);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForApi = async (child: ChildProcess): Promise<void> => {
  const deadline = Date.now() + 180_000;
  while (!(await isApiReady())) {
    if (child.exitCode !== null) {
      throw new Error(`Tau API test server exited with code ${String(child.exitCode)}`);
    }
    if (Date.now() >= deadline) {
      child.kill('SIGTERM');
      throw new Error(`Tau API test server did not become ready at ${desktopE2EApiUrl}`);
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

const closeLog = async (apiLog: ReturnType<typeof createWriteStream>): Promise<void> =>
  new Promise<void>((resolve) => {
    apiLog.end(resolve);
  });

export const setup = async (): Promise<() => void> => {
  if (desktopE2ECompletedArtifact) {
    desktopE2EPackagedExecutable();
    const apiUrl = new URL(desktopE2EApiUrl);
    if (
      !['127.0.0.1', '[::1]', 'localhost'].includes(apiUrl.hostname) ||
      desktopE2EApiUrl === 'http://localhost:4014' ||
      process.env['TAU_E2E_EXTERNAL_SERVICES'] !== 'true'
    ) {
      throw new Error(
        'Completed-artifact E2E requires TAU_E2E_EXTERNAL_SERVICES=true and a non-default loopback-only TAU_E2E_API_URL.',
      );
    }
  }

  if (await isApiReady()) {
    throw new Error(`Desktop E2E requires ownership of its dedicated API at ${desktopE2EApiUrl}`);
  }

  /* Unconditional, because it costs ~500 ms and a stale `dist/main.js` cost
   * this lane a whole round of misattributed auth failures: `apps/api`'s bundle
   * was six days old and predated the bearer plugin. `nx build api` cannot be
   * used — its dependency chain reaches `runtime:build`, which is red on Node
   * 24 for a tsdown config-loader bug. */
  execFileSync(resolve(workspaceRoot, 'node_modules/.bin/vite'), ['build'], { cwd: apiRoot, stdio: 'ignore' });

  const environment = { ...process.env };
  environment['AUTH_URL'] = desktopE2EApiUrl;
  environment['NODE_ENV'] = 'development';
  environment['PORT'] = new URL(desktopE2EApiUrl).port;
  environment['TAU_API_URL'] = desktopE2EApiUrl;
  environment['TAU_FRONTEND_URL'] = desktopE2EFrontendUrl;
  environment['TAU_TEST_MODE'] = 'true';
  /* No `TAU_GIT_ROOT`: the git storage substrate charter retired it (D1, S3)
   * and `environment.config.ts` now *refuses to boot* a process that carries
   * one, which is what stopped this whole tier starting (W10 defect 3).
   * Repositories live in the object store and each process hydrates its own
   * lease under `os.tmpdir()`, so the 825 MB of bare repositories the old
   * comment worried about cannot accumulate anywhere. */
  /* P50, for the two-client tier only: the local `git http-backend` fixture
   * charter AC18 is written around lives on `127.0.0.1`, which the proxy
   * refuses by default. `apps/api-e2e` must never set this — three of its rows
   * assert exactly those refusals. */
  environment['TAU_GIT_REMOTE_ALLOW_PRIVATE'] = '1';
  /* D16/D19: the deterministic tier drives the *real* gateway — admission,
   * qualification, the catalog→supplier rewrite and metering all run — and only the
   * last hop lands on this suite's own stub. Process environment beats
   * `--env-file-if-exists=.env`, so the fixture key wins over both an empty
   * `.env.example` value and a developer's real one.
   *
   * The live tier keeps it too: the seam rewrites only the Anthropic host
   * (`billing.module.ts`), so the seed turn on the fixture route stays mocked
   * while the live turn's own wire (`TAU_E2E_LIVE_MODEL`, OpenAI by default)
   * reaches the real provider and earns the credit delta; an Anthropic live
   * model would be stubbed and is not a supported live selection. Not the
   * completed-artifact tier: its isolated API has no billing environment, and
   * `environmentSchema` refuses this name without `BILLING_ENVIRONMENT=development`. */
  if (!desktopE2ECompletedArtifact) {
    environment['TAU_CLOUD_ENABLED'] = 'true';
    environment['BILLING_ENVIRONMENT'] = 'development';
    environment['BILLING_USAGE_CURSOR_SECRET'] = 'desktop-e2e-usage-cursor-secret-min-32-chars';
    environment['BILLING_REQUEST_DIGEST_SECRET'] = 'desktop-e2e-request-digest-secret-min-32-chars';
    environment['STRIPE_SECRET_KEY'] = 'rk_test_desktop_e2e_create';
    environment['STRIPE_READ_SECRET_KEY'] = 'rk_test_desktop_e2e';
    environment['STRIPE_ACCOUNT_ID'] = 'acct_desktop_e2e';
    environment['STRIPE_LIVEMODE'] = 'false';
    environment['STRIPE_WEBHOOK_SECRET'] = 'whsec_desktop_e2e';
    environment['STRIPE_PRICE_ID_PRO_MONTHLY'] = 'price_desktop_e2e';
    environment['STRIPE_PRODUCT_ID_CREDIT_PACK'] = 'prod_desktop_e2e';
    environment['TAU_LLM_PROVIDER_UPSTREAM_URL'] = desktopE2EProviderStubUrl;
    environment['ANTHROPIC_API_KEY'] = desktopE2EProviderStubKey;
  }

  /* Kept, unlike `ui-e2e`'s `stdio: 'ignore'`: a chat run that fails
   * server-side is otherwise invisible from the Electron side of the glass. */
  const logDirectory = resolve(import.meta.dirname, '../../out/test-results/desktop-e2e');
  mkdirSync(logDirectory, { recursive: true });
  const apiLog = createWriteStream(resolve(logDirectory, 'api.log'), { flags: 'w' });
  // Nest also loads .env from cwd. Completed-package tests use the fixture's
  // private directory so neither Node nor Nest can read real API credentials.
  const apiCwd = desktopE2ECompletedArtifact ? process.env['TAU_E2E_API_CWD'] : apiRoot;
  if (!apiCwd) {
    throw new Error('Completed-artifact E2E requires the isolated launcher API directory.');
  }
  const api = spawn(
    process.execPath,
    [
      ...(desktopE2ECompletedArtifact ? [] : ['--env-file-if-exists=.env']),
      '--import',
      new URL('register.mjs', pathToFileURL(createRequire(import.meta.url).resolve('@oxc-node/core/package.json')))
        .href,
      resolve(apiRoot, 'dist/main.js'),
    ],
    { cwd: apiCwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  api.stdout.pipe(apiLog);
  api.stderr.pipe(apiLog);

  try {
    await waitForApi(api);
  } catch (error) {
    await stopChild(api);
    await closeLog(apiLog);
    throw error;
  }

  return async () => {
    await stopChild(api);
    await closeLog(apiLog);
  };
};
