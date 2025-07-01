/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
import process from 'node:process';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import type { FastifyLoggerOptions } from 'fastify';
import { AppModule } from '~/app.module.js';
import { generatePrefixedId, idPrefix } from '~/utils/id.js';
import type { Environment } from '~/config/environment.config.js';
import { consoleLoggingConfig } from '~/logger/logger-factory.js';

async function bootstrap() {
  const envToLogger: Record<`${Environment['NODE_ENV']}`, unknown> = {
    development: consoleLoggingConfig(),
    production: true,
    test: false,
  } as const;
  // Create Fastify adapter with custom options for body size limits and logger
  const fastifyAdapter = new FastifyAdapter({
    bodyLimit: 50 * 1024 * 1024, // 50MB in bytes
    genReqId: () => generatePrefixedId(idPrefix.request),
    disableRequestLogging: true,
    logger: envToLogger[process.env.NODE_ENV] as FastifyLoggerOptions,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
    bufferLogs: true, // Buffer logs until pino logger is ready. This ensures all logs are consistently formatted.
  });

  const appConfig = app.get(ConfigService<Environment, true>);

  app.useLogger(app.get(PinoLogger));
  app.flushLogs(); // Standalone applications require flushing after configuring the logger - https://github.com/iamolegga/nestjs-pino/issues/553

  app.enableCors({
    origin: [appConfig.get('TAU_FRONTEND_URL', { infer: true })],
    credentials: true,
  });
  app.enableVersioning({
    type: VersioningType.URI,
  });

  if (import.meta.env.PROD) {
    const port = appConfig.get('PORT', { infer: true });
    await app.listen(port, '0.0.0.0'); // Listen on all network interfaces
    Logger.log(`🚀 Application is running on: http://localhost:${port}`, 'Bootstrap');
  }

  // Hot Module Replacement using Vite's HMR API
  if (import.meta.hot) {
    import.meta.hot.accept();
    import.meta.hot.dispose(async () => {
      await app.close();
    });
  }

  return app;
}

const app = await bootstrap();

export const viteNodeApp = app;
