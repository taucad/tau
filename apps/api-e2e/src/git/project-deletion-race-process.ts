/* eslint-disable @typescript-eslint/naming-convention -- Child environment keys are external names. */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { isApiLive, sharedEnvironment, stopChild, waitForApi } from '#git/api-process.js';

/** Boot only an existing built artifact, with logs under the acceptance-owned output. */
export const startProjectDeletionRaceApi = async (
  url: string,
  logPath: string,
  overrides: Readonly<Record<string, string>>,
): Promise<{ pid: number | undefined; close(): Promise<void> }> => {
  const origin = new URL(url);
  if (origin.hostname !== 'localhost' || !origin.port || ['4014', '4016', '60329', '60330'].includes(origin.port)) {
    throw new Error('Race API requires a distinct owned loopback port.');
  }
  if (await isApiLive(url)) {
    throw new Error('Race API port already has a server.');
  }
  // Detect any listener, including one which does not implement Tau health checks.
  const portCheck = createServer();
  await new Promise<void>((resolve, reject) => {
    portCheck.once('error', reject);
    portCheck.listen(Number(origin.port), resolve);
  });
  await new Promise<void>((resolve) => {
    portCheck.close(() => {
      resolve();
    });
  });
  const cwd = process.env['TAU_E2E_API_CWD'];
  if (
    !cwd ||
    process.env['TAU_E2E_COMPLETED_ARTIFACT'] !== 'true' ||
    process.env['TAU_E2E_EXTERNAL_SERVICES'] !== 'true'
  ) {
    throw new Error('Race API requires explicit completed artifacts and owned external services.');
  }
  const environment = sharedEnvironment('http://localhost:3014');
  Object.assign(environment, { AUTH_URL: url, PORT: origin.port, TAU_API_URL: url }, overrides);
  const database = new URL(environment['DATABASE_URL'] ?? 'http://invalid');
  database.searchParams.set('application_name', `cpd-race-${origin.port}`);
  environment['DATABASE_URL'] = database.href;
  const log = createWriteStream(logPath, { flags: 'wx', mode: 0o600 });
  const child = spawn(
    process.execPath,
    [
      '--import',
      new URL('register.mjs', pathToFileURL(createRequire(import.meta.url).resolve('@oxc-node/core/package.json')))
        .href,
      resolve(import.meta.dirname, '../../../api/dist/main.js'),
    ],
    { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  // Private application logs are never echoed; the runner redacts its own public test log.
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  try {
    await waitForApi(child, url);
  } catch (error) {
    await stopChild(child);
    log.end();
    throw error;
  }
  return {
    pid: child.pid,
    async close(): Promise<void> {
      await stopChild(child);
      await new Promise<void>((resolve) => {
        log.end(resolve);
      });
    },
  };
};
