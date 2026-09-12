import { readFileSync } from 'node:fs';
import { VersioningType } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Auth } from 'better-auth';
import { describe, expect, it } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { wireModelEstimatesSchema } from '@taucad/billing';
/* oxlint-disable no-restricted-imports -- the generator owns the checked-in policy and lives outside the `#` app aliases. */
import { developmentPolicyPath } from '../../../scripts/generate-development-billing-policy.mjs';
/* oxlint-enable no-restricted-imports */
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { BillingEstimatesService } from '#api/billing/billing-estimates.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import type { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { BillingService } from '#api/billing/billing.service.js';
import { BillingUsageService } from '#api/billing/billing-usage.service.js';
import { BillingController } from '#api/billing/billing.controller.js';
import { validateCommercialPolicy } from '#api/billing/billing-policy.js';
import type { BillableModelProviderAdapter } from '#api/billing/billable-model-invocation.types.js';
import {
  billableModelRouteIds,
  CodeOwnedBillableModelQualificationResolver,
  registerBillableModelMeterContracts,
} from '#api/billing/billable-model-qualification.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import type { Environment } from '#config/environment.config.js';

const instant = new Date('2026-09-12T12:00:00.000Z');
const owner = {
  id: 'owner-a',
  name: 'Owner',
  email: 'owner@test.invalid',
  emailVerified: true,
  createdAt: instant,
  updatedAt: instant,
  image: null,
};
const session = {
  id: 'session',
  userId: owner.id,
  token: 'test-session',
  expiresAt: new Date('2027-01-01T00:00:00.000Z'),
  createdAt: instant,
  updatedAt: instant,
  ipAddress: null,
  userAgent: null,
};

/* The real resolver against mocked transports: the estimate must come from the
 * admission path's own qualification, not a parallel pricing formula. */
const resolver = new CodeOwnedBillableModelQualificationResolver({
  adapters: new Map(billableModelRouteIds.map((routeId) => [routeId, mock<BillableModelProviderAdapter>()])),
  credentialAccounts: new Map(
    ['anthropic', 'openai', 'vertexai', 'together', 'morph', 'xai'].map((provider) => [
      provider,
      `${provider}-primary`,
    ]),
  ),
  executionTimeout: 30_000,
});

const developmentPolicy = () => {
  const { policy, contentHash } = validateCommercialPolicy(readFileSync(developmentPolicyPath, 'utf8'));
  return { policyId: 'policy-a', activationId: 'activation-a', policy, contentHash, selectedAt: instant };
};

const harness = (environment = 'development') => {
  registerBillableModelMeterContracts();
  const policyService = mock<BillingPolicyService>();
  policyService.selectEffectivePolicy.mockResolvedValue(developmentPolicy());
  const config = mock<ConfigService<Environment, true>>();
  config.get.mockReturnValue(environment);
  return { policyService, service: new BillingEstimatesService(resolver, policyService, config) };
};

describe('BillingEstimatesService', () => {
  it('publishes the hold admission would authorize for a representative turn', async () => {
    const estimates = wireModelEstimatesSchema.parse(
      await harness().service.getModelEstimates({ authUserId: owner.id }),
    );

    expect(estimates.environment).toBe('development');
    expect(estimates.ownerId).toBe(owner.id);
    /* W1's reported number for a 120 KB body at 16,384 output on the base tariff.
     * The whole-context reserve held 42,445,000 atoms for the same turn. */
    expect(estimates.routes).toContainEqual({
      routeId: 'openai-gpt-6-astra',
      modelId: 'gpt-6-astra',
      typicalHoldAtoms: '3084332',
      minimumHoldAtoms: '1133877',
      tier: 'base',
    });
    expect(estimates.routes).toContainEqual({
      routeId: 'openai-gpt-5.6-sol',
      modelId: 'gpt-5.6-sol',
      typicalHoldAtoms: '1233733',
      minimumHoldAtoms: '453551',
      tier: 'base',
    });
    expect(estimates.routes).toContainEqual({
      routeId: 'openai-gpt-5.6-luna',
      modelId: 'gpt-5.6-luna',
      typicalHoldAtoms: '65947',
      minimumHoldAtoms: '26938',
      tier: 'base',
    });
    expect(estimates.routes).toContainEqual({
      routeId: 'google-gemini-3.7-flash',
      modelId: 'gemini-3.7-flash',
      typicalHoldAtoms: '213164',
      minimumHoldAtoms: '84464',
      tier: 'base',
    });
  });

  /* The floor a client refuses against. The live probe's own Astra turn (a 22-character
   * prompt at the same 16,384 output) authorized 1,134,234 atoms — above this floor and
   * far below the representative hold, which is exactly why refusing on the
   * representative hold denied turns the ledger would have admitted. */
  it('publishes a minimum hold no admissible turn on the route can go below', async () => {
    const estimates = await harness().service.getModelEstimates({ authUserId: owner.id });

    expect(estimates.routes.every((route) => BigInt(route.minimumHoldAtoms) > 0n)).toBe(true);
    expect(estimates.routes.every((route) => BigInt(route.minimumHoldAtoms) < BigInt(route.typicalHoldAtoms))).toBe(
      true,
    );
    const astra = estimates.routes.find((route) => route.routeId === 'openai-gpt-6-astra');
    expect(BigInt(astra!.minimumHoldAtoms)).toBeLessThan(1_134_234n);
  });

  it('covers every funded route across all three provider wires at a proved tier', async () => {
    const estimates = await harness().service.getModelEstimates({ authUserId: owner.id });

    expect(estimates.routes.map((route) => route.routeId)).toStrictEqual([...billableModelRouteIds]);
    /* A 120 KB body proves the premium threshold unreachable on every tiered route. */
    expect(estimates.routes.every((route) => route.tier === 'base')).toBe(true);
    expect(estimates.routes.every((route) => BigInt(route.typicalHoldAtoms) > 0n)).toBe(true);
  });

  it('reads the effective policy once rather than per route', async () => {
    const { policyService, service } = harness();

    await service.getModelEstimates({ authUserId: owner.id });
    await service.getModelEstimates({ authUserId: owner.id });

    expect(policyService.selectEffectivePolicy).toHaveBeenCalledTimes(2);
    expect(policyService.selectEffectivePolicy).toHaveBeenCalledWith({
      environment: 'development',
      replica: { schemaVersion: 1, meterContractIds: expect.any(Array) as string[] },
    });
  });

  it('refuses to report against an unconfigured billing environment', async () => {
    await expect(harness('not-an-environment').service.getModelEstimates({ authUserId: owner.id })).rejects.toThrow(
      'Billing reporting is unavailable',
    );
  });
});

describe('GET /v1/billing/model-estimates', () => {
  it('authenticates before estimating and binds the session owner', async () => {
    const estimates = mock<BillingEstimatesService>();
    const auth = mockDeep<Auth>();
    auth.api.getSession.mockResolvedValue(null);
    estimates.getModelEstimates.mockResolvedValue({ environment: 'development', ownerId: owner.id, routes: [] });
    const module = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        Reflector,
        AuthGuard,
        { provide: authInstanceKey, useValue: auth },
        { provide: BillingService, useValue: mock<BillingService>() },
        { provide: BillingUsageService, useValue: mock<BillingUsageService>() },
        { provide: BillingPaymentsService, useValue: mock<BillingPaymentsService>() },
        { provide: BillingAccountClosureService, useValue: mock<BillingAccountClosureService>() },
        { provide: BillingEstimatesService, useValue: estimates },
      ],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.enableVersioning({ type: VersioningType.URI });
    try {
      await app.init();
      const unauthorized = await app.inject({ method: 'GET', url: '/v1/billing/model-estimates' });
      expect(unauthorized.statusCode).toBe(401);
      expect(estimates.getModelEstimates).not.toHaveBeenCalled();

      auth.api.getSession.mockResolvedValue({ user: owner, session });
      const response = await app.inject({ method: 'GET', url: '/v1/billing/model-estimates' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(estimates.getModelEstimates).toHaveBeenCalledWith({ authUserId: owner.id });
      expect(wireModelEstimatesSchema.parse(response.json())).toStrictEqual({
        environment: 'development',
        ownerId: owner.id,
        routes: [],
      });
    } finally {
      await app.close();
    }
  });
});
