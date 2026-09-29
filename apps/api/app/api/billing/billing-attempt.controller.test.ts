import { ForbiddenException, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { attemptReceiptSchema } from '@taucad/agent-host/wire';
import type { Auth } from 'better-auth';
import { afterEach, describe, expect, it } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { BillingAttemptController } from '#api/billing/billing-attempt.controller.js';
import { BillingUsageService } from '#api/billing/billing-usage.service.js';
import { HostsService } from '#api/hosts/hosts.service.js';
import { LlmGatewayAuthGuard } from '#api/llm/llm-gateway.guard.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';

type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
type Device = NonNullable<Awaited<ReturnType<HostsService['authenticateDevice']>>>;

const createApp = async (input: { readonly sessionUserId?: string; readonly deviceOwnerId?: string }) => {
  const usage = mock<BillingUsageService>();
  usage.getAttemptReceipt.mockResolvedValue({ state: 'not_found', voided: true });
  const auth = mockDeep<Auth>();
  // The guards read only the principal's id; the rest of each record is out of scope.
  auth.api.getSession.mockResolvedValue(
    input.sessionUserId === undefined ? null : mock<Session>({ user: { id: input.sessionUserId } }),
  );
  const hosts = mock<HostsService>();
  hosts.authenticateDevice.mockImplementation(async (authorization) =>
    authorization === 'Bearer device-token' && input.deviceOwnerId !== undefined
      ? mock<Device>({ ownerId: input.deviceOwnerId })
      : undefined,
  );
  const module = await Test.createTestingModule({
    controllers: [BillingAttemptController],
    providers: [
      Reflector,
      LlmGatewayAuthGuard,
      { provide: authInstanceKey, useValue: auth },
      { provide: HostsService, useValue: hosts },
      { provide: BillingUsageService, useValue: usage },
      {
        provide: ConfigService,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment keys
        useValue: new ConfigService({ TAU_FRONTEND_URL: 'https://tau.new', ADDITIONAL_CORS_ORIGINS: [] }),
      },
    ],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableVersioning({ type: VersioningType.URI });
  await app.init();
  return { app, usage };
};

describe('billing attempt lookup route (GI-S3b)', () => {
  const apps: NestFastifyApplication[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  it('should resolve an attempt through a paired daemon', async () => {
    const { app, usage } = await createApp({ deviceOwnerId: 'owner-device' });
    apps.push(app);

    const answer = await app.inject({
      method: 'GET',
      url: '/v1/billing/attempts/gateway/attempt-a',
      headers: { authorization: 'Bearer device-token' },
    });

    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-store');
    expect(attemptReceiptSchema.parse(answer.json())).toEqual({ state: 'not_found', voided: true });
    expect(usage.getAttemptReceipt).toHaveBeenCalledWith({
      authUserId: 'owner-device',
      surface: 'gateway',
      attemptKey: 'attempt-a',
      rawQuery: {},
    });
  });

  it('should resolve an attempt through a browser session', async () => {
    const { app, usage } = await createApp({ sessionUserId: 'owner-session' });
    apps.push(app);

    const answer = await app.inject({ method: 'GET', url: '/v1/billing/attempts/gateway/attempt-b' });

    expect(answer.statusCode).toBe(200);
    expect(usage.getAttemptReceipt).toHaveBeenCalledWith(expect.objectContaining({ authUserId: 'owner-session' }));
  });

  it('should refuse a lookup on a closed account as BILLING_ACCOUNT_CLOSED, not as a sign-in failure', async () => {
    const { app, usage } = await createApp({ sessionUserId: 'owner-closed' });
    apps.push(app);
    usage.getAttemptReceipt.mockRejectedValue(
      new ForbiddenException({ code: 'billing_account_closed', message: 'Financial owner is revoked or closed' }),
    );

    const answer = await app.inject({ method: 'GET', url: '/v1/billing/attempts/gateway/attempt-closed' });

    expect(answer.statusCode).toBe(403);
    expect(answer.json()).toMatchObject({ type: 'error', error: { type: 'BILLING_ACCOUNT_CLOSED' } });
  });

  it('should refuse a lookup that proves no owner with 401 UNAUTHENTICATED before reading', async () => {
    const { app, usage } = await createApp({});
    apps.push(app);

    const answer = await app.inject({
      method: 'GET',
      url: '/v1/billing/attempts/gateway/attempt-c',
      headers: { authorization: 'Bearer revoked-token' },
    });

    expect(answer.statusCode).toBe(401);
    expect(answer.json()).toMatchObject({ error: { type: 'UNAUTHENTICATED' } });
    expect(usage.getAttemptReceipt).not.toHaveBeenCalled();
  });
});
