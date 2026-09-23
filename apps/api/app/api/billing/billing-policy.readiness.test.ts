import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { BillingPolicyReadiness, billingPolicyMigrateHint } from '#api/billing/billing-policy.readiness.js';
import type { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { composeTariff, parseCommercialOverlay } from '#api/billing/billing-policy.sync.js';
import { registerBillableModelMeterContracts } from '#api/billing/billable-model-qualification.js';

const workspaceRoot = resolve(import.meta.dirname, '../../../../..');
const overlayDocument = readFileSync(resolve(workspaceRoot, 'infra/billing/development.commercial.json'), 'utf8');
const overlay = parseCommercialOverlay(overlayDocument, 'development');

const effectiveOf = (policy: ReturnType<typeof composeTariff>) => ({
  policyId: 'policy-a',
  activationId: 'sync-abcdef012345-r1',
  policy: policy.policy,
  contentHash: policy.contentHash,
  selectedAt: new Date('2026-09-21T00:00:00.000Z'),
});

/* Nest's own `Logger.warn` is typed `(message: any, ...optionalParams: any[])`; this check only ever
   passes it one JSON line, and narrowing it here keeps the assertions free of `any`. */
const spyOnLogger = (method: 'warn' | 'log'): MockInstance<(message: string) => void> =>
  vi.spyOn(Logger.prototype, method).mockReturnValue() as unknown as MockInstance<(message: string) => void>;

const readinessOf = (
  effective: () => Promise<ReturnType<typeof effectiveOf>>,
  cloudEnabled = true,
): BillingPolicyReadiness => {
  const policy = mock<BillingPolicyService>();
  policy.selectEffectivePolicy.mockImplementation(effective);
  return new BillingPolicyReadiness(policy, { environment: 'development', cloudEnabled });
};

describe('BillingPolicyReadiness', () => {
  beforeEach(() => {
    registerBillableModelMeterContracts();
    vi.restoreAllMocks();
    /* The check prefers the repository file, exactly as `api:db-migrate` does, and falls back to the
       secret. The test process runs from `apps/api`, where that relative path does not resolve, so
       these cases exercise the fallback; the precedence itself is pinned in its own case below. */
    vi.stubEnv('BILLING_COMMERCIAL_POLICY', overlayDocument);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails readiness with the migrate hint when the environment has no tariff', async () => {
    const readiness = readinessOf(async () => {
      throw new Error('no effective billing policy');
    });

    await expect(readiness.onModuleInit()).rejects.toThrow(
      `No effective billing policy for development. ${billingPolicyMigrateHint}`,
    );
  });

  it('passes a connectivity failure through untouched rather than blaming the tariff', async () => {
    const readiness = readinessOf(async () => {
      throw new Error('connection terminated unexpectedly');
    });

    await expect(readiness.onModuleInit()).rejects.toThrow('connection terminated unexpectedly');
  });

  it('accepts the tariff this build would derive without warning', async () => {
    const warn = spyOnLogger('warn');
    const log = spyOnLogger('log');
    const readiness = readinessOf(async () => effectiveOf(composeTariff({ overlay })));

    await expect(readiness.onModuleInit()).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('warns once, and resolves, when the effective tariff still enables a retired route', async () => {
    const stale = composeTariff({ overlay });
    const { routes } = stale.policy;
    const effective = effectiveOf(stale);
    // A policy published before the last route was retired: it enables a route this build cannot dispatch.
    effective.policy = {
      ...stale.policy,
      routes: [...stale.policy.routes, { ...routes[0]!, routeId: 'google-gemini-3.7-flash' }],
    };
    effective.contentHash = 'a'.repeat(64);
    const warn = spyOnLogger('warn');
    const readiness = readinessOf(async () => effective);

    await expect(readiness.onModuleInit()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    const reported = JSON.parse(warn.mock.calls[0]![0]) as Record<string, unknown>;
    expect(reported).toMatchObject({
      event: 'billing.tariff_stale',
      activationId: effective.activationId,
      retiredRoutes: ['google-gemini-3.7-flash'],
      unpublishedRoutes: [],
      hint: billingPolicyMigrateHint,
    });
  });

  it('prefers the repository overlay over an exported secret in development', async () => {
    /* Regression for the W6 review: a developer with `BILLING_COMMERCIAL_POLICY` exported for a
       staging errand was told every boot that the local tariff is stale, because the check read the
       secret while `api:db-migrate` published from `--commercial-file`. */
    vi.stubEnv('BILLING_COMMERCIAL_POLICY', JSON.stringify({ ...overlay, markupBps: 1234 }));
    const warn = spyOnLogger('warn');
    const readiness = readinessOf(async () => effectiveOf(composeTariff({ overlay })));
    const cwd = process.cwd();
    process.chdir(workspaceRoot);

    try {
      await expect(readiness.onModuleInit()).resolves.toBeUndefined();
    } finally {
      process.chdir(cwd);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('reads nothing at all when cloud mode is off', async () => {
    const log = spyOnLogger('log');
    const readiness = readinessOf(async () => {
      throw new Error('no effective billing policy');
    }, false);

    await expect(readiness.onModuleInit()).resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });
});
