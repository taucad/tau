/* oxlint-disable no-await-in-loop -- Server readiness polling is intentionally sequential. */
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
// oxlint-disable-next-line no-restricted-imports -- Vitest loads global setup before test aliases exist.
import { desktopE2EApiUrl, desktopE2EFrontendUrl } from './src/support/config.ts';

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

export const setup = async (): Promise<() => void> => {
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

  /* Kept, unlike `ui-e2e`'s `stdio: 'ignore'`: a chat run that fails
   * server-side is otherwise invisible from the Electron side of the glass. */
  const logDirectory = resolve(import.meta.dirname, '../../out/test-results/desktop-e2e');
  mkdirSync(logDirectory, { recursive: true });
  const apiLog = createWriteStream(resolve(logDirectory, 'api.log'), { flags: 'w' });
  const api = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', '--import', '@oxc-node/core/register', 'dist/main.js'],
    { cwd: apiRoot, env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  api.stdout.pipe(apiLog);
  api.stderr.pipe(apiLog);

  try {
    await waitForApi(api);
  } catch (error) {
    api.kill('SIGTERM');
    throw error;
  }

  return () => {
    api.kill('SIGTERM');
  };
};
