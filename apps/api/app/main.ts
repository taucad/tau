import '#telemetry/otel.js'; // oxlint-disable-line eslint-plugin-import/no-unassigned-import -- OTEL SDK must initialize before any other module
import '#telemetry/sentry.js'; // oxlint-disable-line eslint-plugin-import/no-unassigned-import -- error reporting must initialize before the app can throw

import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { FastifyOtelInstrumentation } from '@fastify/otel';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { AppModule } from '#app.module.js';
import { getEnvironment } from '#config/environment.config.js';
import type { Environment } from '#config/environment.config.js';
import { getFastifyLoggingConfig } from '#logger/fastify.logger.js';
import { redactUrlQuery } from '#logger/logger-factory.js';
import { corsBaseConfiguration } from '#constants/cors.constant.js';
import { createTauCorsOriginValidator } from '#utils/cors.utils.js';
import { getTrustProxyOption } from '#utils/trust-proxy.utils.js';
import { httpBodyLimit } from '#constants/http-body.constant.js';
import { installApiUnhandledRejectionHandler } from '#api-unhandled-rejection-handler.js';
import { closeGracefullyOnSignal, drainingServerOptions } from '#lifecycle/graceful-shutdown.js';

async function createApiApp() {
  const fastifyAdapter = new FastifyAdapter({
    bodyLimit: httpBodyLimit,
    genReqId: () => generatePrefixedId(idPrefix.request),
    disableRequestLogging: true, // Disables automatic 'incoming request'/'request completed' logs - these are handled by custom loggers.
    // On Fly, `request.ip` is the client address Fly Proxy forwards rather than the proxy's own;
    // every per-IP budget keys on it. See `trustFlyProxy` for why it cannot be spoofed.
    trustProxy: getTrustProxyOption(),
    logger: getFastifyLoggingConfig(),
    ...drainingServerOptions,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(getEnvironment()), fastifyAdapter, {
    bufferLogs: true, // Buffer logs until pino logger is ready. This ensures all logs are consistently formatted.
  });

  const appConfig = app.get(ConfigService<Environment, true>);

  app.useLogger(app.get(PinoLogger));
  app.flushLogs(); // Standalone applications require flushing after configuring the logger - https://github.com/iamolegga/nestjs-pino/issues/553

  const frontendUrl = appConfig.get('TAU_FRONTEND_URL', { infer: true });
  const additionalCorsOrigins = appConfig.get('ADDITIONAL_CORS_ORIGINS', { infer: true });

  app.enableCors({
    origin: createTauCorsOriginValidator(
      frontendUrl,
      additionalCorsOrigins,
      appConfig.get('NODE_ENV', { infer: true }),
    ),
    ...corsBaseConfiguration,
  });
  app.enableVersioning({
    type: VersioningType.URI,
  });
  // CORP `cross-origin` so the Netlify-hosted UI — which sets COEP
  // `require-corp` — can read cross-origin API responses. Helmet defaults to
  // CORP `same-origin`, which would block those reads.
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  const fastifyInstance = app.getHttpAdapter().getInstance();
  const fastifyOtel = new FastifyOtelInstrumentation({
    // The request span records `url.path` with its query; OAuth callbacks carry `code` and `state` there.
    requestHook: (span, request) => {
      span.setAttribute('url.path', redactUrlQuery(request.url));
    },
  });
  await fastifyInstance.register(fastifyOtel.plugin());

  const viewCookieSecret = appConfig.get('TAU_VIEW_COOKIE_SECRET', { infer: true });
  await fastifyInstance.register(cookie, {
    secret: viewCookieSecret,
    hook: 'onRequest',
  });

  return app;
}

async function startStandaloneApiApp(app: NestFastifyApplication): Promise<void> {
  const appConfig = app.get(ConfigService<Environment, true>);
  const fastifyInstance = app.getHttpAdapter().getInstance();

  await app.init();
  await fastifyInstance.ready();

  closeGracefullyOnSignal(app);

  const port = appConfig.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0'); // Listen on all network interfaces
  Logger.log(`🚀 Application is running on: http://localhost:${port}`, 'Bootstrap');
}

const viteNodeApp = await createApiApp();

if (!import.meta.env.DEV) {
  installApiUnhandledRejectionHandler();
  await startStandaloneApiApp(viteNodeApp);
}

export { viteNodeApp };
