/* oxlint-disable no-await-in-loop -- Server readiness polling is intentionally sequential. */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import process from 'node:process';
import { resolve } from 'node:path';
// Aliased: `waitForServer` below uses the global, callback-style `setTimeout`.
import { setTimeout as delay } from 'node:timers/promises';
// oxlint-disable-next-line no-restricted-imports -- Vitest loads global setup before test aliases exist.
import { testBaseURL, testPort } from './src/support/base-url.ts';
// oxlint-disable-next-line no-restricted-imports -- Vitest loads global setup before test aliases exist.
import { resolveTestServerAction } from './src/support/server-readiness.ts';
// oxlint-disable-next-line no-restricted-imports -- Vitest loads global setup before test aliases exist.
import { snapshotUiBuild } from './src/support/ui-build-snapshot.ts';

const uiRoot = resolve(import.meta.dirname, '../ui');
const debugProbeUrl = new URL('/__e2e/project-creation-location?fixture=health-check', testBaseURL);
const viteClientUrl = new URL('/@vite/client', testBaseURL);
/**
 * Serve a private copy of `apps/ui/build` instead of the live one.
 *
 * `apps/ui/server.ts` reads `build/client` off disk on every request, so a peer
 * session's `react-router build` — which empties the directory first — 404s
 * every asset under a running run. Opt-in rather than the default for
 * production because a snapshot is ~650 MB per run.
 */
const snapshotBuild = process.env['TAU_E2E_UI_SNAPSHOT'] === 'true';

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

const isDevelopmentReady = async (): Promise<boolean> => {
  try {
    const response = await fetch(viteClientUrl);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForServer = async (options: {
  readonly child: ChildProcess;
  readonly isReady: () => Promise<boolean>;
  readonly label: string;
  readonly url: string;
}): Promise<void> => {
  const deadline = Date.now() + 180_000;
  while (!(await options.isReady())) {
    if (options.child.exitCode !== null) {
      throw new Error(`${options.label} exited with code ${String(options.child.exitCode)}`);
    }
    if (Date.now() >= deadline) {
      options.child.kill('SIGTERM');
      throw new Error(`${options.label} did not become ready at ${options.url}`);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    });
  }
};

export const setup = async (): Promise<() => Promise<void> | void> => {
  const development = process.env['TAU_E2E_SERVER_MODE'] === 'development';
  const rootReady = await isReady();
  if (development && rootReady && !(await isDevelopmentReady())) {
    throw new Error(`Development UI E2E requires ownership of its dedicated server at ${testBaseURL}`);
  }
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
  environment['NODE_ENV'] = development ? 'development' : 'production';

  /* The snapshot server is `apps/ui/server.ts` minus its dev-TLS and QR
   * banners, pointed at a private build root — so it keeps `apps/ui` as its cwd
   * and loads the same `.env` the real one does. */
  const snapshot = !development && snapshotBuild ? await snapshotUiBuild(uiRoot) : undefined;
  if (snapshot) {
    environment['TAU_E2E_UI_BUILD_ROOT'] = resolve(snapshot, 'build');
  }

  const server = development
    ? spawn('pnpm', ['exec', 'react-router', 'dev', '--port', testPort, '--strictPort'], {
        cwd: uiRoot,
        env: environment,
        stdio: 'inherit',
      })
    : spawn(
        'node',
        [
          '--env-file-if-exists=.env',
          '--import',
          '@oxc-node/core/register',
          snapshot ? resolve(import.meta.dirname, 'production-server.ts') : 'server.ts',
        ],
        { cwd: uiRoot, env: environment, stdio: 'inherit' },
      );
  const stop = async (): Promise<void> => {
    server.kill('SIGTERM');
    if (snapshot) {
      // Let the server exit before the directory it is serving disappears:
      // deleting first leaves it answering out of a half-removed tree.
      if (server.exitCode === null) {
        await Promise.race([
          new Promise<void>((resolve) => {
            server.once('exit', () => {
              resolve();
            });
          }),
          delay(5000),
        ]);
      }
      await rm(snapshot, { force: true, recursive: true });
    }
  };

  try {
    await waitForServer({ child: server, isReady, label: 'UI test server', url: testBaseURL });

    if (!(await isDebugReady())) {
      throw new Error(`UI test server started at ${testBaseURL} without its TAU_DEBUG route`);
    }
  } catch (error) {
    await stop();
    throw error;
  }

  return stop;
};
