import process from 'node:process';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';
import { consoleLoggingConfig, logServiceConfig } from '#logger/logger-factory.js';

/**
 * The logger Fastify is constructed with, before the ConfigService exists.
 *
 * Selected with a `switch` rather than a record of three values, because a
 * record evaluates every branch: `logServiceConfig(process.env.LOG_SERVICE)`
 * ran for *every* `NODE_ENV` and threw `Unknown log service: undefined` before
 * the `development` entry was ever read. `apps/api/.env` is untracked, so a
 * clean checkout, CI, and every e2e tier that boots the API in `development`
 * died on that line (review C55). `LOG_SERVICE` is only read on the branch that
 * needs it, which is also the only branch a deployment configures.
 *
 * @returns The Fastify logger options for this process's `NODE_ENV`.
 */
export function getFastifyLoggingConfig(): PinoLoggerOptions | boolean {
  // We use process.env here as the config service is not available when this function is called during app bootstrap.
  switch (process.env.NODE_ENV) {
    case 'production': {
      return logServiceConfig(process.env.LOG_SERVICE);
    }

    case 'test': {
      // In test mode, disable logs.
      return false;
    }

    default: {
      return consoleLoggingConfig();
    }
  }
}
