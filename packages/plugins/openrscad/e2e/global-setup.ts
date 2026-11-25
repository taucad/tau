/* oxlint-disable no-await-in-loop -- Readiness polling is intentionally sequential. */
import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { TestProject } from 'vitest/node';
import { openrscadBaseURL, openrscadServerLog } from '#e2e/browser-command.js';

const execFileAsync = promisify(execFile);
const browserFixtureRoot = import.meta.dirname;
const vite = resolve(browserFixtureRoot, '../../../../node_modules/.bin/vite');

const isRunning = (child: ChildProcess): boolean => child.exitCode === null && child.signalCode === null;

const stop = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 5000);
    }),
  ]);
  if (isRunning(child)) {
    child.kill('SIGKILL');
  }
};

/** A launch must own its port: polling cannot tell our preview from one already listening there. */
const assertEndpointFree = async (url: string): Promise<void> => {
  const { hostname, port } = new URL(url);
  const listening = await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: hostname, port: Number(port) });
    const settle = (value: boolean): void => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1000, () => {
      settle(false);
    });
    socket.once('connect', () => {
      settle(true);
    });
    socket.once('error', () => {
      settle(false);
    });
  });
  if (listening) {
    throw new Error(`${url} already accepts connections before launch; another process owns the port.`);
  }
};

export const setup = async (project: TestProject): Promise<() => Promise<void>> => {
  /* Vitest runs a config's globalSetup once for every browser instance with specs in the run and
   * once more for the root project, which it always initializes. The root project owns the preview. */
  if (!project.isRootProject()) {
    return async () => undefined;
  }
  await assertEndpointFree(openrscadBaseURL);
  await mkdir(resolve(openrscadServerLog, '..'), { recursive: true });
  await writeFile(openrscadServerLog, '');
  const build = await execFileAsync(vite, ['build'], { cwd: browserFixtureRoot, maxBuffer: 20 * 1024 * 1024 });
  await writeFile(openrscadServerLog, `${build.stdout}${build.stderr}`);

  const log = createWriteStream(openrscadServerLog, { flags: 'a' });
  const server = execFile(vite, ['preview', '--host', '127.0.0.1', '--port', '4331', '--strictPort'], {
    cwd: browserFixtureRoot,
  });
  server.stdout?.pipe(log, { end: false });
  server.stderr?.pipe(log, { end: false });

  const deadline = Date.now() + 180_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      log.end();
      throw new Error(`OpenRSCAD preview exited with code ${server.exitCode}. See ${openrscadServerLog}`);
    }
    try {
      const response = await fetch(openrscadBaseURL, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Keep polling until the deadline while Vite starts.
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  if (!ready) {
    await stop(server);
    log.end();
    throw new Error(`OpenRSCAD preview did not become ready at ${openrscadBaseURL}. See ${openrscadServerLog}`);
  }

  return async () => {
    await stop(server);
    log.end();
  };
};
