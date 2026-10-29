import { VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Auth } from 'better-auth';
import { afterEach, describe, expect, it } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { evidenceLimits } from '@taucad/agent-observability/contract';
import { AuthGuard } from '#auth/auth.guard.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import {
  EvidenceIngressController,
  evidenceContentType,
} from '#api/agent-observability/evidence-ingress.controller.js';
import { EvidenceIngressService } from '#api/agent-observability/evidence-ingress.service.js';
import type { EvidenceReceipt } from '#api/agent-observability/evidence-admission.js';

type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;

const receipt: EvidenceReceipt = {
  receipt: 'evr_1',
  disposition: 'accepted',
  duplicate: false,
  receivedAt: '2026-10-29T00:00:00.000Z',
  expiresAt: '2027-04-27T00:00:00.000Z',
};
const marker = 'PRIVATE_DESIGN_MARKER_http';

const apps: NestFastifyApplication[] = [];
const createApp = async (signedIn = true) => {
  const auth = mockDeep<Auth>();
  auth.api.getSession.mockResolvedValue(signedIn ? mock<Session>({ user: { id: 'user-1' } }) : null);
  const ingress = mock<EvidenceIngressService>();
  ingress.admit.mockResolvedValue(receipt);
  const module = await Test.createTestingModule({
    controllers: [EvidenceIngressController],
    providers: [
      Reflector,
      AuthGuard,
      { provide: EvidenceIngressService, useValue: ingress },
      { provide: authInstanceKey, useValue: auth },
    ],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableVersioning({ type: VersioningType.URI });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  return { app, ingress };
};

const post = async (
  app: NestFastifyApplication,
  payload: string | Uint8Array<ArrayBuffer>,
  contentType = evidenceContentType,
) =>
  app.inject({
    method: 'POST',
    url: '/v1/agent-observability/evidence',
    headers: { 'content-type': contentType },
    payload: typeof payload === 'string' ? payload : Buffer.from(payload),
  });

describe('EvidenceIngressController', () => {
  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  it('hands the exact envelope bytes to ingress for the session principal', async () => {
    const { app, ingress } = await createApp();
    const body = JSON.stringify({ marker });

    const response = await post(app, body);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(receipt);
    expect(ingress.admit).toHaveBeenCalledWith('user-1', Uint8Array.from(Buffer.from(body)));
  });

  it('refuses a signed-out caller before reading the envelope', async () => {
    const { app, ingress } = await createApp(false);

    const response = await post(app, JSON.stringify({ marker }));

    expect(response.statusCode).toBe(401);
    expect(ingress.admit).not.toHaveBeenCalled();
  });

  it('refuses the general JSON parser and an envelope over the contract limit without echoing either', async () => {
    const { app, ingress } = await createApp();

    const json = await post(app, JSON.stringify({ marker }), 'application/json');
    const oversized = await post(app, Uint8Array.from(Buffer.alloc(evidenceLimits.bytes + 1, marker)));

    expect(json.statusCode).toBe(415);
    expect(json.json()).toMatchObject({ code: 'EVIDENCE_MEDIA_TYPE' });
    expect(oversized.statusCode).toBe(413);
    expect(json.body + oversized.body).not.toContain(marker);
    expect(ingress.admit).not.toHaveBeenCalled();
  });
});
