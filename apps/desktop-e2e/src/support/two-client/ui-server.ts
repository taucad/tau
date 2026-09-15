/* oxlint-disable no-await-in-loop -- Server readiness polling is intentionally sequential. */
/* eslint-disable @typescript-eslint/naming-convention -- Process environment names keep their wire spelling. */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { desktopE2EApiUrl, desktopE2EFrontendUrl } from '#support/config.js';

/**
 * The web frontend for the browser half of a two-client run (blueprint S40).
 *
 * `desktopE2EFrontendUrl` has always been `http://localhost:3014` and nothing
 * has ever listened on it: the desktop shell serves its own SPA from
 * `app://tau`, and the URL existed only so the API could derive better-auth's
 * `trustedOrigins`, the socket handshake origin and its email links. A real
 * browser client needs a real server there, so this starts `apps/ui/server.ts`
 * against the same API the shell uses.
 *
 * Started by the spec rather than by `global-setup.ts`, so every other spec in
 * this project keeps booting exactly what it booted before.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../../..');
const uiRoot = resolve(workspaceRoot, 'apps/ui');

/** One running UI server. */
export type UiServer = Readonly<{ url: string; close: () => Promise<void> }>;

const isReady = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
};

const stopChild = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    const killTimeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5000);
    child.once('exit', () => {
      clearTimeout(killTimeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
};

/**
 * Start the built UI on the origin the API already trusts.
 *
 * @returns The server, with the URL a browser client opens.
 */
export const startUiServer = async (): Promise<UiServer> => {
  const url = desktopE2EFrontendUrl;
  if (await isReady(url)) {
    throw new Error(`The two-client run requires ownership of its UI server at ${url}`);
  }

  const environment = { ...process.env };
  environment['PORT'] = new URL(url).port;
  environment['NODE_ENV'] = 'production';
  /* Turns on the `tauDebug` flag the `/__e2e/*` seed routes are gated behind —
   * the same switch `ui-e2e`'s own server runs with. */
  environment['TAU_DEBUG'] = 'true';
  environment['TAU_API_URL'] = desktopE2EApiUrl;
  environment['TAU_WEBSOCKET_URL'] = desktopE2EApiUrl.replace(/^http/u, 'ws');
  environment['TAU_FRONTEND_URL'] = url;
  /* P50's client half: `gitRemoteUrlProblem(url, { allowPrivate })` reads this
   * through `ClientEnvironment`, and without it the Connect dialog refuses the
   * `http://127.0.0.1:<port>` address charter AC18's `git http-backend` fixture
   * lives on — before any request is made. Set only here, never in
   * `apps/api-e2e`, whose proxy-refusal rows invert under it. */
  environment['TAU_GIT_REMOTE_ALLOW_PRIVATE'] = '1';

  const logDirectory = resolve(workspaceRoot, 'out/test-results/desktop-e2e');
  mkdirSync(logDirectory, { recursive: true });
  const log = createWriteStream(resolve(logDirectory, 'two-client-ui.log'), { flags: 'w' });
  const server = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', '--import', '@oxc-node/core/register', 'server.ts'],
    { cwd: uiRoot, env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout.pipe(log);
  server.stderr.pipe(log);

  const close = async (): Promise<void> => {
    await stopChild(server);
    log.end();
  };

  const deadline = Date.now() + 180_000;
  while (!(await isReady(url))) {
    if (server.exitCode !== null) {
      log.end();
      throw new Error(`The UI server exited with code ${String(server.exitCode)}; see two-client-ui.log`);
    }
    if (Date.now() >= deadline) {
      await close();
      throw new Error(`The UI server did not become ready at ${url}`);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  /* `apps/ui/server.ts` binds `127.0.0.1` unless `--host` is passed. Node's own
   * `fetch` resolves `localhost` to both families, and so does Chromium; this
   * is the assertion that the debug routes the specs seed through are actually
   * being served, not just that something answered. */
  const probe = await fetch(new URL('/__e2e/project-creation-location?fixture=health-check', url));
  if (!probe.ok) {
    await close();
    throw new Error(`The UI server started at ${url} without its TAU_DEBUG routes`);
  }

  return { url, close };
};
