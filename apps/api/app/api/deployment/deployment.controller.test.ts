/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
/**
 * `GET /v1/deployment` over Fastify inject, through the guard, the pipe and the controller, for both editions: the
 * answer hosts read to choose their model transport's billing layer per run (Unified Model Transport W1).
 */
/* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
import { Module, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard, SessionResolver } from '@taucad/api-auth';
import { fakeSessionResolver } from '@taucad/api-auth/testing';
import type { FakeSessionLookup } from '@taucad/api-auth/testing';
import { deploymentAnswerPath, parseDeploymentAnswer } from '@taucad/types/deployment';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { DeploymentModule } from '#api/deployment/deployment.module.js';
import { answerDeployment } from '#api/deployment/deployment.controller.js';

const apps: NestFastifyApplication[] = [];

/** Stands in for the global configuration and auth modules the application root registers. */
@Module({})
class FakeGlobalsModule {}

const createApp = async (tauCloudEnabled: boolean, environment: Record<string, unknown> = {}) => {
  const getSession = vi.fn<FakeSessionLookup>(async () => null);
  const module = await Test.createTestingModule({
    imports: [
      {
        module: FakeGlobalsModule,
        global: true,
        providers: [
          Reflector,
          AuthGuard,
          { provide: SessionResolver, useValue: fakeSessionResolver(getSession) },
          { provide: ConfigService, useValue: { get: (key: string) => environment[key] } },
        ],
        exports: [Reflector, AuthGuard, SessionResolver, ConfigService],
      },
      DeploymentModule.forRoot({ tauCloudEnabled }),
    ],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableVersioning({ type: VersioningType.URI });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  return { app, getSession };
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('GET /v1/deployment', () => {
  it('should answer a funded Cloud deployment with its billing environment', async () => {
    const { app } = await createApp(true, { BILLING_ENVIRONMENT: 'staging' });
    const response = await app.inject({ method: 'GET', url: deploymentAnswerPath });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      version: 1,
      edition: 'cloud',
      billing: { funded: true, environment: 'staging' },
      maxAgeSeconds: 300,
    });
    expect(parseDeploymentAnswer(response.json()).status).toBe('valid');
  });

  it('should answer an unfunded self-host deployment when TAU_CLOUD_ENABLED is unset', async () => {
    const { app } = await createApp(false, { BILLING_ENVIRONMENT: 'development' });
    const response = await app.inject({ method: 'GET', url: deploymentAnswerPath });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      version: 1,
      edition: 'self-host',
      billing: { funded: false },
      maxAgeSeconds: 300,
    });
    expect(parseDeploymentAnswer(response.json()).status).toBe('valid');
  });

  it.each([true, false])('should mark the answer publicly cacheable for its max age (Cloud: %s)', async (cloud) => {
    const { app } = await createApp(cloud, { BILLING_ENVIRONMENT: 'staging' });
    const response = await app.inject({ method: 'GET', url: deploymentAnswerPath });
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('should answer without a session and never look one up, even when the request carries a cookie', async () => {
    const { app, getSession } = await createApp(true, { BILLING_ENVIRONMENT: 'prod-us' });
    const anonymous = await app.inject({ method: 'GET', url: deploymentAnswerPath });
    const withCookie = await app.inject({
      method: 'GET',
      url: deploymentAnswerPath,
      headers: { cookie: 'better-auth.session_token=fixture', authorization: 'Bearer fixture' },
    });
    expect(anonymous.statusCode).toBe(200);
    expect(withCookie.statusCode).toBe(200);
    expect(withCookie.json()).toEqual(anonymous.json());
    expect(getSession).not.toHaveBeenCalled();
  });
});

describe('answerDeployment', () => {
  it('should carry no billing environment on a self-host API, whatever the environment names', () => {
    expect(answerDeployment({ tauCloudEnabled: false, billingEnvironment: 'staging' }).billing).toEqual({
      funded: false,
    });
  });

  it('should omit an absent billing environment rather than publish an empty one', () => {
    const answer = answerDeployment({ tauCloudEnabled: true, billingEnvironment: undefined });
    expect(answer.billing).toEqual({ funded: true });
    expect(parseDeploymentAnswer(answer).status).toBe('valid');
  });
});
