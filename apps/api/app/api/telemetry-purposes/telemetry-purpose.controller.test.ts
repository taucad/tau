import { VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Auth } from 'better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import { afterEach, describe, expect, it } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { AuthGuard } from '#auth/auth.guard.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { CloudHostEvidenceGuard } from '#api/hosts/cloud-host-evidence.guard.js';
import { HostsService } from '#api/hosts/hosts.service.js';
import { TelemetryPurposeController } from '#api/telemetry-purposes/telemetry-purpose.controller.js';
import type { EffectiveTelemetryPurposes } from '#api/telemetry-purposes/telemetry-purpose.schema.js';
import { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';

type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
type Device = NonNullable<Awaited<ReturnType<HostsService['authenticateDevice']>>>;

/* A plain value: a mock proxy is not serialisable. Its shape is the service's concern. */
const effective = { epoch: 'epoch-1', purposes: [] } as unknown as EffectiveTelemetryPurposes;
const cloudHost = mock<Device>({ id: 'device-1', ownerId: 'owner-1', cloudProjectId: 'project-1' });

const apps: NestFastifyApplication[] = [];
const createApp = async () => {
  const auth = mockDeep<Auth>();
  auth.api.getSession.mockResolvedValue(null);
  const purposes = mock<TelemetryPurposeService>();
  purposes.getEffectivePurposes.mockResolvedValue(effective);
  const hosts = mock<HostsService>();
  hosts.authenticateDevice.mockImplementation(async (authorization) =>
    authorization === 'Bearer device-credential' ? cloudHost : undefined,
  );
  const module = await Test.createTestingModule({
    controllers: [TelemetryPurposeController],
    providers: [
      Reflector,
      AuthGuard,
      CloudHostEvidenceGuard,
      { provide: TelemetryPurposeService, useValue: purposes },
      { provide: HostsService, useValue: hosts },
      { provide: authInstanceKey, useValue: auth },
    ],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ZodValidationPipe());
  app.enableVersioning({ type: VersioningType.URI });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  return { app, auth, purposes };
};

const asHost = { authorization: 'Bearer device-credential' };

describe('TelemetryPurposeController', () => {
  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  it('answers a cloud host with its owner’s purposes for its own project', async () => {
    const { app, purposes } = await createApp();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/telemetry-purposes?projectId=project-1',
      headers: asHost,
    });

    expect(response.statusCode).toBe(200);
    expect(purposes.getEffectivePurposes).toHaveBeenCalledWith('owner-1', 'project-1');
  });

  it.each([
    { name: 'another project', url: '/v1/telemetry-purposes?projectId=project-2' },
    { name: 'no project', url: '/v1/telemetry-purposes' },
  ])('answers a cloud host asking about $name as not found', async ({ url }) => {
    const { app, purposes } = await createApp();

    const response = await app.inject({ method: 'GET', url, headers: asHost });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'PROJECT_NOT_FOUND' });
    expect(purposes.getEffectivePurposes).not.toHaveBeenCalled();
  });

  it('never lets a cloud host record decisions', async () => {
    const { app, purposes } = await createApp();

    const response = await app.inject({
      method: 'PUT',
      url: '/v1/telemetry-purposes',
      headers: asHost,
      payload: { noticeVersion: 'n1', decisions: [] },
    });

    expect(response.statusCode).toBe(401);
    expect(purposes.recordDecisions).not.toHaveBeenCalled();
  });

  it('still answers a session for any project it names', async () => {
    const { app, auth, purposes } = await createApp();
    auth.api.getSession.mockResolvedValue(mock<Session>({ user: { id: 'user-1' } }));

    const response = await app.inject({ method: 'GET', url: '/v1/telemetry-purposes?projectId=project-2' });

    expect(response.statusCode).toBe(200);
    expect(purposes.getEffectivePurposes).toHaveBeenCalledWith('user-1', 'project-2');
  });
});
