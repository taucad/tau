import '#telemetry/otel.js'; // oxlint-disable-line eslint-plugin-import/no-unassigned-import -- OTEL SDK must initialize before any other module

import process from 'node:process';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from '@fastify/helmet';
import { FastifyOtelInstrumentation } from '@fastify/otel';
import { apiHeaders } from '@taucad/runtime/cross-origin-isolation';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { AppModule } from '#app.module.js';
import type { Environment } from '#config/environment.config.js';
import { getFastifyLoggingConfig } from '#logger/fastify.logger.js';
import { corsBaseConfiguration } from '#constants/cors.constant.js';
import { createCorsOriginValidatorFromList } from '#utils/cors.utils.js';
import { httpBodyLimit } from '#constants/http-body.constant.js';
import { RedisService } from '#redis/redis.service.js';
import { RedisIoAdapter } from '#api/websocket/redis-io.adapter.js';
import { isTrackedAbortError } from '#api/chat/utils/chat-abort.js';

// ---------------------------------------------------------------------------
// Chat Abort Error Handling (see docs/policy/api-error-policy.md)
// ---------------------------------------------------------------------------

// Layer 2: Suppress unhandled AbortError rejections from chat cancellations.
// LangGraph's internal abort propagation creates fire-and-forget promises in
// node-fetch that reject with AbortError. The tracker ensures we only suppress
// errors that correlate with a known chat abort.
process.on('unhandledRejection', (reason: unknown) => {
  if (isTrackedAbortError(reason)) {
    return;
  }

  // Defense in depth against route-registration races (e.g. the vite-plugin-node
  // `NestHandler` concurrent-init race, axe-me/vite-plugin-node#33). The
  // bootstrap below now eagerly initializes the app so this branch should
  // never fire in practice — if it does, log loudly rather than crash-loop.
  if (reason instanceof Error && 'code' in reason && reason.code === 'FST_ERR_DUPLICATED_ROUTE') {
    Logger.error(
      `Suppressed Fastify duplicate-route registration: ${reason.message}. ` +
        `This indicates an unexpected concurrent app.init() — investigate.`,
      reason.stack,
      'Bootstrap',
    );
    return;
  }

  // Re-throw non-abort rejections so Node.js treats them as uncaught exceptions,
  // preserving the default crash-on-unhandled-rejection behavior.
  if (reason instanceof Error) {
    throw reason;
  }

  throw new Error(typeof reason === 'string' ? reason : 'Unhandled promise rejection');
});

async function bootstrap() {
  const fastifyAdapter = new FastifyAdapter({
    bodyLimit: httpBodyLimit,
    genReqId: () => generatePrefixedId(idPrefix.request),
    disableRequestLogging: true, // Disables automatic 'incoming request'/'request completed' logs - these are handled by custom loggers.
    logger: getFastifyLoggingConfig(),
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
    bufferLogs: true, // Buffer logs until pino logger is ready. This ensures all logs are consistently formatted.
  });

  const appConfig = app.get(ConfigService<Environment, true>);

  app.useLogger(app.get(PinoLogger));
  app.flushLogs(); // Standalone applications require flushing after configuring the logger - https://github.com/iamolegga/nestjs-pino/issues/553

  const frontendUrl = appConfig.get('TAU_FRONTEND_URL', { infer: true });
  const additionalCorsOrigins = appConfig.get('ADDITIONAL_CORS_ORIGINS', { infer: true });

  app.enableCors({
    origin: createCorsOriginValidatorFromList([frontendUrl, ...additionalCorsOrigins]),
    ...corsBaseConfiguration,
  });
  app.enableVersioning({
    type: VersioningType.URI,
  });
  // Consume the canonical `apiHeaders` CORP value so the Netlify-hosted UI —
  // which sets COEP `require-corp` — can read cross-origin API responses. Helmet
  // defaults to CORP `same-origin`, which would block those reads.
  await app.register(helmet, {
    crossOriginResourcePolicy: {
      policy: apiHeaders['Cross-Origin-Resource-Policy'] as 'cross-origin',
    },
  });

  const fastifyInstance = app.getHttpAdapter().getInstance();
  const fastifyOtel = new FastifyOtelInstrumentation();
  await fastifyInstance.register(fastifyOtel.plugin());

  // Initialize the Nest app and seal the Fastify router BEFORE the first
  // request can flow through `vite-plugin-node`'s `NestHandler`. That handler
  // lazily initializes behind a non-atomic `if (!app.isInitialized)` guard, so
  // concurrent cold requests (UI SSE `/v1/chat` + Socket.IO `/v1/chat/rpc`
  // reconnects landing in the same tick) would otherwise all pass the guard
  // and race `app.init()` against a single Fastify instance, crashing with
  // `FST_ERR_DUPLICATED_ROUTE`. Upstream: axe-me/vite-plugin-node#33.
  await app.init();
  await fastifyInstance.ready();

  if (import.meta.env.PROD) {
    app.enableShutdownHooks();

    // Set up Socket.IO with Redis adapter for horizontal scaling
    const redisService = app.get(RedisService);
    const redisIoAdapter = new RedisIoAdapter(app, redisService);
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);

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
