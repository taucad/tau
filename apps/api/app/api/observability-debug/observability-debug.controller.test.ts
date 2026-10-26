/* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
/* oxlint-disable new-cap -- NestJS decorators use PascalCase. */
import { Module, VersioningType } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { ObservabilityHarnessFailure } from '#api/observability-debug/observability-debug.controller.js';
import { isObservabilityFailureRouteEnabled } from '#api/observability-debug/observability-debug.gate.js';
import { ObservabilityDebugModule } from '#api/observability-debug/observability-debug.module.js';
import type * as Sentry from '#telemetry/sentry.js';

const reportServerError = vi.hoisted(() => vi.fn<(error: unknown, requestId?: string) => void>());
vi.mock('#telemetry/sentry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof Sentry>()),
  reportServerError,
}));

const dsn = 'https://public@o0.ingest.sentry.io/1';
const failurePath = '/v1/__debug/observability/failure';

let app: NestFastifyApplication | undefined;

/** The API's exception filter and URI versioning over the module the gate configured, as `main.ts` composes them. */
const start = async (environment: Record<string, string>): Promise<NestFastifyApplication> => {
  @Module({ imports: [ObservabilityDebugModule.forRoot(environment)] })
  class HarnessHost {}
  const root: DynamicModule = {
    module: HarnessHost,
    providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
  };
  const moduleRef = await Test.createTestingModule({ imports: [root] }).compile();
  const started = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  started.enableVersioning({ type: VersioningType.URI });
  await started.init();
  await started.getHttpAdapter().getInstance().ready();
  app = started;
  return started;
};

afterEach(async () => {
  await app?.close();
  app = undefined;
  reportServerError.mockReset();
});

describe('isObservabilityFailureRouteEnabled', () => {
  it('should enable the route only on a Sentry-reporting staging API', () => {
    expect(isObservabilityFailureRouteEnabled({ SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'staging' })).toBe(true);
  });

  it.each([
    ['production', { SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'production' }],
    ['prod-us', { SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'prod-us' }],
    ['no environment', { SENTRY_DSN: dsn }],
    ['staging without Sentry', { SENTRY_ENVIRONMENT: 'staging' }],
    ['a near miss', { SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'Staging' }],
  ])('should refuse %s', (_name, environment) => {
    expect(isObservabilityFailureRouteEnabled(environment)).toBe(false);
  });
});

describe('GET /v1/__debug/observability/failure', () => {
  it('should answer 404 on a production API and report nothing', async () => {
    const production = await start({ SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'production' });

    const response = await production.inject({ method: 'GET', url: failurePath });

    expect(response.statusCode).toBe(404);
    expect(reportServerError).not.toHaveBeenCalled();
  });

  it('should answer 404 on an API without Sentry', async () => {
    const local = await start({ SENTRY_ENVIRONMENT: 'staging' });

    const response = await local.inject({ method: 'GET', url: failurePath });

    expect(response.statusCode).toBe(404);
  });

  it('should fail with a reported 500 that carries its request id on staging', async () => {
    const staging = await start({ SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'staging' });

    const response = await staging.inject({ method: 'GET', url: failurePath });

    expect(response.statusCode).toBe(500);
    const requestId = response.headers['request-id'];
    expect(typeof requestId).toBe('string');
    expect(response.json()).toMatchObject({ code: 'INTERNAL_SERVER_ERROR', requestId });
    expect(reportServerError).toHaveBeenCalledOnce();
    expect(reportServerError).toHaveBeenCalledWith(expect.any(ObservabilityHarnessFailure), requestId);
  });
});
