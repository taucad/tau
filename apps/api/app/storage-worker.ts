import '#telemetry/otel.js'; // oxlint-disable-line eslint-plugin-import/no-unassigned-import -- OTEL SDK must initialize before any other module; OTEL_SERVICE_NAME names it tau-storage
import 'reflect-metadata'; // oxlint-disable-line import/no-unassigned-import -- Nest decorators on the store and driver need metadata before they load
import process from 'node:process';
import { Logger } from '@nestjs/common';
import { getStorageEnvironment } from '#config/storage-environment.config.js';
import { JsonLineLogger } from '#api/git/worker/json-logger.js';
import { startStorageApp } from '#api/git/worker/storage-app.js';

/**
 * `tau-storage`: the private git execution app (north star component 4, DC1).
 *
 * The API authorizes every git request, signs a grant naming its facts and
 * forwards the request here over the private network; this process verifies
 * the grant before reading a byte, hydrates a lease from the object store,
 * runs stock git, commits by compare-and-swap and answers with a signed
 * receipt the API checks before it touches a row. It holds no database and no
 * Redis connection and imports neither (`storage-app.test.ts` holds its module
 * graph to that), so its Machine count never touches the connection budget.
 *
 * The Dockerfile's `storage` target runs this file; `apps/storage/fly.*.toml`
 * deploys it.
 */

/** Kept below the Fly `kill_timeout`, so post-reply work finishes before the Machine is killed. */
const stopGraceMilliseconds = 100_000;

const levelFor = (level: string): 'log' | 'warn' | 'error' | 'debug' | 'verbose' =>
  level === 'error' || level === 'fatal'
    ? 'error'
    : level === 'warn'
      ? 'warn'
      : level === 'debug'
        ? 'debug'
        : level === 'trace'
          ? 'verbose'
          : 'log';

const main = async (): Promise<void> => {
  const environment = getStorageEnvironment();
  Logger.overrideLogger(new JsonLineLogger('tau-storage', undefined, levelFor(environment.LOG_LEVEL)));
  const logger = new Logger('StorageWorker');
  const app = await startStorageApp({ environment });
  logger.log({ port: environment.PORT }, 'tau-storage is listening');
  let stopping = false;
  const stop = async (signal: string): Promise<void> => {
    if (stopping) {
      return;
    }
    stopping = true;
    logger.log({ signal }, 'tau-storage is stopping');
    try {
      await app.close(stopGraceMilliseconds);
    } catch (error) {
      logger.error({ err: error }, 'tau-storage did not stop cleanly');
      process.exitCode = 1;
    } finally {
      // oxlint-disable-next-line unicorn/no-process-exit -- the drain is over; an exporter's open handle must not hold the Machine past it
      process.exit();
    }
  };
  process.once('SIGTERM', () => {
    void stop('SIGTERM');
  });
  process.once('SIGINT', () => {
    void stop('SIGINT');
  });
};

try {
  await main();
} catch (error) {
  process.stderr.write(`tau-storage failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
