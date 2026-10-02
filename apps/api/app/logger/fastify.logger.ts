import process from 'node:process';
import type { FastifyRequest } from 'fastify';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';
import { logServiceProvider } from '#constants/app.constant.js';
import type { LogServiceProvider } from '#constants/app.constant.js';
import { consoleLoggingConfig, logServiceConfig, redactUrlQuery } from '#logger/logger-factory.js';

/** Fastify's own request projection, with an OAuth callback's query dropped as the request logger drops it. */
const serializers = {
  req: (request: FastifyRequest) => ({
    method: request.method,
    url: redactUrlQuery(request.url),
    version: request.headers['accept-version'],
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket.remotePort,
  }),
};

/**
 * The logger Fastify is constructed with, before the ConfigService exists.
 *
 * Selected with a `switch` rather than a record of three values, because a
 * record evaluates every branch: `logServiceConfig(process.env.LOG_SERVICE)`
 * ran for *every* `NODE_ENV` and threw `Unknown log service: undefined` before
 * the `development` entry was ever read. `apps/api/.env` is untracked, so a
 * clean checkout, CI, and every e2e tier that boots the API in `development`
 * died on that line (review C55). `LOG_SERVICE` is only read on the branch that
 * needs it, which is also the only branch a deployment configures. An unset
 * `LOG_SERVICE` falls back to `console`, the environment schema's default, so a
 * production container started without it (the CI image smoke test) still boots.
 *
 * @returns The Fastify logger options for this process's `NODE_ENV`.
 */
export function getFastifyLoggingConfig(): PinoLoggerOptions | boolean {
  // We use process.env here as the config service is not available when this function is called during app bootstrap.
  switch (process.env.NODE_ENV) {
    case 'production': {
      // The ambient type claims LOG_SERVICE is always set; at bootstrap it has not been validated yet.
      const logService = process.env.LOG_SERVICE as LogServiceProvider | undefined;
      return { ...logServiceConfig(logService ?? logServiceProvider.console), serializers };
    }

    case 'test': {
      // In test mode, disable logs.
      return false;
    }

    default: {
      return { ...consoleLoggingConfig(), serializers };
    }
  }
}
