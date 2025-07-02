import process from 'node:process';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';
import type { Environment } from '~/config/environment.config.js';
import { consoleLoggingConfig, logServiceConfig } from '~/logger/logger-factory.js';

export function getFastifyLoggingConfig(): PinoLoggerOptions | boolean {
  const envToLogger: Record<Environment['NODE_ENV'], PinoLoggerOptions | boolean> = {
    development: consoleLoggingConfig(),
    production: logServiceConfig(process.env.LOG_SERVICE),
    test: false, // In test mode, disable logs.
  } as const;

  // We use process.env here as the config service is not available when this function is called during app bootstrap.
  const environment = process.env.NODE_ENV;

  return envToLogger[environment];
}
