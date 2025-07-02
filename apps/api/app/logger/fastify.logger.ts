import process from 'node:process';
import type { FastifyLoggerOptions } from 'fastify';
import type { Environment } from '~/config/environment.config.js';
import { consoleLoggingConfig } from '~/logger/logger-factory.js';

export function getFastifyLoggingConfig(): FastifyLoggerOptions | boolean {
  const envToLogger: Record<`${Environment['NODE_ENV']}`, FastifyLoggerOptions | boolean> = {
    development: consoleLoggingConfig() as FastifyLoggerOptions,
    production: true, // In production, we don't want pretty logs. So we use the default pino-http options.
    test: false, // In test mode, disable logs.
  } as const;

  // We use process.env here as the config service is not available when this function is called during app bootstrap.
  const environment = process.env.NODE_ENV;

  return envToLogger[environment];
}
