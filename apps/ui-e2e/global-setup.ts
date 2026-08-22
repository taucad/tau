/* oxlint-disable no-await-in-loop -- Server readiness polling is intentionally sequential. */
import { spawn } from 'node:child_process';
import process from 'node:process';
import { resolve } from 'node:path';
// oxlint-disable-next-line no-restricted-imports -- Vitest loads global setup before test aliases exist.
import { testBaseURL, testPort } from './src/support/base-url.ts';
// oxlint-disable-next-line no-restricted-imports -- Vitest loads global setup before test aliases exist.
import { resolveTestServerAction } from './src/support/server-readiness.ts';

const uiRoot = resolve(import.meta.dirname, '../ui');
const debugProbeUrl = new URL('/__e2e/project-creation-location?fixture=health-check', testBaseURL);

const isReady = async (): Promise<boolean> => {
  try {
    const response = await fetch(testBaseURL);
    return response.ok;
  } catch {
    return false;
  }
};

const isDebugReady = async (): Promise<boolean> => {
  try {
    const response = await fetch(debugProbeUrl);
    return response.ok;
  } catch {
    return false;
  }
};

export const setup = async (): Promise<() => void> => {
  const rootReady = await isReady();
  const serverAction = resolveTestServerAction({
    baseUrl: testBaseURL,
    rootReady,
    debugReady: rootReady ? await isDebugReady() : false,
  });
  if (serverAction === 'reuse') {
    return () => undefined;
  }

  const environment = { ...process.env };
  environment['PORT'] = testPort;
  environment['TAU_DEBUG'] = 'true';
  environment['TAU_API_URL'] = 'http://localhost:4000';
  environment['TAU_WEBSOCKET_URL'] = 'ws://localhost:4001';
  environment['TAU_FRONTEND_URL'] = testBaseURL;
  environment['NODE_ENV'] = 'production';

  const server = spawn('node', ['--env-file-if-exists=.env', '--import', '@oxc-node/core/register', 'server.ts'], {
    cwd: uiRoot,
    env: environment,
    stdio: 'inherit',
  });

  const deadline = Date.now() + 180_000;
  while (!(await isReady())) {
    if (server.exitCode !== null) {
      throw new Error(`UI test server exited with code ${server.exitCode}`);
    }
    if (Date.now() >= deadline) {
      server.kill('SIGTERM');
      throw new Error(`UI test server did not become ready at ${testBaseURL}`);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  if (!(await isDebugReady())) {
    server.kill('SIGTERM');
    throw new Error(`UI test server started at ${testBaseURL} without its TAU_DEBUG route`);
  }

  return () => {
    server.kill('SIGTERM');
  };
};
