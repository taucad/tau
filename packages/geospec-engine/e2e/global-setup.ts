/* oxlint-disable no-await-in-loop -- Readiness polling is intentionally sequential. */
import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { geospecBaseURL, geospecServerLog } from '#e2e/browser-command.js';

const execFileAsync = promisify(execFile);
const browserFixtureRoot = import.meta.dirname;
const vite = resolve(browserFixtureRoot, '../../../node_modules/.bin/vite');

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

export const setup = async (): Promise<() => Promise<void>> => {
  await mkdir(resolve(geospecServerLog, '..'), { recursive: true });
  await writeFile(geospecServerLog, '');
  const build = await execFileAsync(vite, ['build'], { cwd: browserFixtureRoot, maxBuffer: 20 * 1024 * 1024 });
  await writeFile(geospecServerLog, `${build.stdout}${build.stderr}`);

  const log = createWriteStream(geospecServerLog, { flags: 'a' });
  const server = execFile(vite, ['preview', '--host', '127.0.0.1', '--port', '4330', '--strictPort'], {
    cwd: browserFixtureRoot,
  });
  server.stdout?.pipe(log, { end: false });
  server.stderr?.pipe(log, { end: false });

  const deadline = Date.now() + 180_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      log.end();
      throw new Error(`GeoSpec preview exited with code ${server.exitCode}. See ${geospecServerLog}`);
    }
    try {
      const response = await fetch(geospecBaseURL, { signal: AbortSignal.timeout(1000) });
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
    throw new Error(`GeoSpec preview did not become ready at ${geospecBaseURL}. See ${geospecServerLog}`);
  }

  return async () => {
    await stop(server);
    log.end();
  };
};
