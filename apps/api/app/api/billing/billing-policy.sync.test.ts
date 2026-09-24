import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import {
  billableModelRouteMeters,
  registerBillableModelMeterContracts,
} from '#api/billing/billable-model-qualification.js';
import { composeTariff, parseCommercialOverlay, syncPolicy } from '#api/billing/billing-policy.sync.js';
import type { CommercialOverlay } from '#api/billing/billing-policy.sync.js';
import { runBillingPolicySyncCommand } from '#api/billing/billing-policy.command.js';
import type { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import type { DatabaseType } from '#database/database.service.js';

/* The checked-in development overlay is the only tariff input an operator owns; the rest of the
 * document is derived here from the same route table the API dispatches. */
const overlayPath = resolve(import.meta.dirname, '../../../../../infra/billing/development.commercial.json');
const developmentOverlay = parseCommercialOverlay(readFileSync(overlayPath, 'utf8'), 'development');

/** The lock-free reads only index rows; the driver's result metadata is irrelevant to them. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
const rows = (values: ReadonlyArray<Record<string, unknown>>): Awaited<ReturnType<DatabaseType['execute']>> =>
  values as unknown as Awaited<ReturnType<DatabaseType['execute']>>;

// oxlint-disable-next-line typescript/no-restricted-types -- financial meter tiers use explicit null
const rateKey = (dimension: string, tier: string | null): string =>
  `${dimension.replaceAll('_', '-')}:${tier ?? 'none'}`;

describe('commercial overlay', () => {
  it('refuses an overlay published against another environment', () => {
    expect(() => parseCommercialOverlay({ ...developmentOverlay, environment: 'staging' }, 'development')).toThrow(
      'does not match command development',
    );
  });

  it('refuses an unknown key rather than silently dropping it', () => {
    expect(() => parseCommercialOverlay({ ...developmentOverlay, rates: [] }, 'development')).toThrow();
  });

  it('refuses a markup outside the document schema', () => {
    expect(() => parseCommercialOverlay({ ...developmentOverlay, markupBps: 10_001 }, 'development')).toThrow();
  });
});

describe('composeTariff', () => {
  beforeEach(() => {
    registerBillableModelMeterContracts();
  });

  it('projects every funded route of the code table onto the overlay', () => {
    const { policy } = composeTariff({ overlay: developmentOverlay });

    expect(policy.environment).toBe('development');
    expect(policy.markupBps).toBe(developmentOverlay.markupBps);
    expect(policy.offers).toEqual(developmentOverlay.offers);
    expect(policy.promotionalIssuance).toEqual(developmentOverlay.promotionalIssuance);
    expect(policy.autoReload).toEqual(developmentOverlay.autoReload);
    expect(composeTariff({ overlay: { ...developmentOverlay, autoReload: null } }).policy.autoReload).toBeUndefined();
    expect(policy.fleet.meterContractIds).toEqual(billableModelRouteMeters.map((route) => route.meterContractId));

    const routes = new Map(policy.routes.map((route) => [route.routeId, route]));
    const rates = new Map(policy.rates.map((rate) => [rate.rateId, rate]));
    expect(routes.size).toBe(billableModelRouteMeters.length);
    for (const meter of billableModelRouteMeters) {
      const route = routes.get(meter.routeId);
      expect(route, meter.routeId).toBeDefined();
      expect(route?.sku).toBe(`model:${meter.routeId}`);
      expect(route?.meterContractId).toBe(meter.meterContractId);
      expect(route?.enabled).toBe(true);
      expect(route?.spendBudgetId).toBe(developmentOverlay.budgets.spendBudgetId);
      expect(route?.riskBudgetId).toBe(developmentOverlay.budgets.riskBudgetId);
      expect(route?.rateIds).toEqual(
        meter.rates.map((rate) => `${meter.routeId}:${rateKey(rate.dimension, rate.tier)}`),
      );
      for (const rate of meter.rates) {
        const composed = rates.get(`${meter.routeId}:${rateKey(rate.dimension, rate.tier)}`);
        expect(composed, `${meter.routeId}:${rate.dimension}`).toMatchObject({
          meterContractId: meter.meterContractId,
          dimension: rate.dimension,
          tier: rate.tier,
          unit: 'token',
          referenceNumeratorPicoUsd: rate.numeratorPicoUsd.toString(),
          denominatorUnits: '1000000',
          retailOverride: null,
        });
      }
    }
  });

  it('derives a stable version from the content and a new one when the content moves', () => {
    const base = composeTariff({ overlay: developmentOverlay });
    expect(base.policy.policyVersion).toMatch(/^development-[0-9a-f]{12}$/u);
    expect(composeTariff({ overlay: developmentOverlay }).policy.policyVersion).toBe(base.policy.policyVersion);
    expect(composeTariff({ overlay: developmentOverlay }).contentHash).toBe(base.contentHash);

    const raised = composeTariff({ overlay: { ...developmentOverlay, markupBps: 3100 } });
    expect(raised.policy.policyVersion).not.toBe(base.policy.policyVersion);

    const retired = composeTariff({ overlay: developmentOverlay, routes: billableModelRouteMeters.slice(1) });
    expect(retired.policy.policyVersion).not.toBe(base.policy.policyVersion);
    expect(retired.policy.routes.map((route) => route.routeId)).not.toContain(billableModelRouteMeters[0]!.routeId);
  });

  it('refuses an overlay whose budget ids do not separate spend from risk', () => {
    const overlay: CommercialOverlay = {
      ...developmentOverlay,
      budgets: { spendBudgetId: 'development-spend', riskBudgetId: 'development-spend' },
    };
    expect(() => composeTariff({ overlay })).toThrow('is not qualified');
  });
});

describe('sync command', () => {
  /* One row satisfies every lock-free read: an empty head, the database clock, and no pending hash. */
  const row = { revision: 0, currentActivationId: null, pendingActivationId: null, now: new Date() };
  const database = mock<Pick<DatabaseType, 'execute' | 'insert'>>();
  const service = mock<BillingPolicyService>();

  beforeEach(() => {
    vi.clearAllMocks();
    registerBillableModelMeterContracts();
    database.execute.mockResolvedValue(rows([row]));
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the seed only chains values().onConflictDoNothing()
    database.insert.mockReturnValue({
      values: () => ({ onConflictDoNothing: async () => undefined }),
    } as unknown as ReturnType<DatabaseType['insert']>);
    service.selectEffectivePolicy.mockRejectedValue(new Error('no effective billing policy'));
    service.publishPolicy.mockResolvedValue({ activationId: 'sync-a', headRevision: 1n, replay: false });
  });

  it('publishes the overlay read from --commercial-file', async () => {
    const result = await runBillingPolicySyncCommand(service, database, [
      'sync',
      '--environment',
      'development',
      '--commercial-file',
      overlayPath,
    ]);

    expect(result).toMatchObject({ status: 'published', activationId: 'sync-a', headRevision: 1n });
    const [published] = service.publishPolicy.mock.calls[0]!;
    expect(JSON.parse(published.policyJson)).toMatchObject({
      environment: 'development',
      markupBps: developmentOverlay.markupBps,
      policyVersion: composeTariff({ overlay: developmentOverlay }).policy.policyVersion,
    });
    expect(published.expectedHeadRevision).toBe(0n);
    expect(published.expectedPredecessorActivationId).toBeUndefined();
  });

  it('publishes the overlay read from the BILLING_COMMERCIAL_POLICY secret', async () => {
    vi.stubEnv('BILLING_COMMERCIAL_POLICY', readFileSync(overlayPath, 'utf8'));
    try {
      await runBillingPolicySyncCommand(service, database, ['sync', '--environment', 'development']);
    } finally {
      vi.unstubAllEnvs();
    }
    const [published] = service.publishPolicy.mock.calls[0]!;
    expect(JSON.parse(published.policyJson)).toMatchObject({ markupBps: developmentOverlay.markupBps });
  });

  it('refuses to run without a file and without the secret', async () => {
    vi.stubEnv('BILLING_COMMERCIAL_POLICY', '');
    try {
      await expect(
        runBillingPolicySyncCommand(service, database, ['sync', '--environment', 'development']),
      ).rejects.toThrow('sync needs --commercial-file or the BILLING_COMMERCIAL_POLICY secret');
    } finally {
      vi.unstubAllEnvs();
    }
    expect(service.publishPolicy).not.toHaveBeenCalled();
  });

  it('seeds the development supplier budgets only in development', async () => {
    const replica = { schemaVersion: 1, meterContractIds: billableModelRouteMeters.map((r) => r.meterContractId) };
    await syncPolicy(service, database, { environment: 'development', overlay: developmentOverlay, replica });
    // One insert for the funding row and one for the budget row.
    expect(database.insert).toHaveBeenCalledTimes(2);

    database.insert.mockClear();
    await syncPolicy(service, database, {
      environment: 'staging',
      overlay: { ...developmentOverlay, environment: 'staging' },
      replica,
    });
    expect(database.insert).not.toHaveBeenCalled();
  });

  /* Two racers publishing the same scheduled rise derive the same activation id but read the database
   * clock separately, so the loser is refused on the job key rather than on the head. Its retry must
   * find the winner's pending activation instead of failing the release job. */
  it('retries a job-key conflict and settles on the winner as unchanged', async () => {
    const { contentHash } = composeTariff({ overlay: developmentOverlay });
    const head = { revision: 0, currentActivationId: null, now: new Date() };
    database.execute
      .mockResolvedValueOnce(rows([{ ...head, pendingActivationId: null }]))
      .mockResolvedValueOnce(rows([{ now: new Date() }]))
      .mockResolvedValueOnce(rows([{ ...head, pendingActivationId: 'sync-winner' }]))
      .mockResolvedValueOnce(rows([{ contentHash }]));
    service.publishPolicy.mockRejectedValueOnce(new Error('policy publication job key conflicts with prior payload'));

    await expect(
      syncPolicy(service, database, {
        environment: 'development',
        overlay: developmentOverlay,
        replica: { schemaVersion: 1, meterContractIds: billableModelRouteMeters.map((r) => r.meterContractId) },
      }),
    ).resolves.toEqual({ status: 'unchanged', activationId: 'sync-winner', contentHash });
    expect(service.publishPolicy).toHaveBeenCalledTimes(1);
  });

  it('surfaces a publication failure it cannot retry', async () => {
    service.publishPolicy.mockRejectedValue(new Error('policy meter contract is incompatible with this replica'));
    await expect(
      syncPolicy(service, database, {
        environment: 'staging',
        overlay: { ...developmentOverlay, environment: 'staging' },
        replica: { schemaVersion: 1, meterContractIds: [] },
      }),
    ).rejects.toThrow('incompatible with this replica');
    expect(service.publishPolicy).toHaveBeenCalledTimes(1);
  });

  it('reports unchanged when the effective policy already carries the derived content', async () => {
    const { contentHash, policy } = composeTariff({ overlay: developmentOverlay });
    service.selectEffectivePolicy.mockResolvedValue({
      policyId: 'policy-1',
      activationId: 'sync-existing',
      policy,
      contentHash,
      selectedAt: new Date(),
    });

    await expect(
      syncPolicy(service, database, {
        environment: 'development',
        overlay: developmentOverlay,
        replica: { schemaVersion: 1, meterContractIds: billableModelRouteMeters.map((r) => r.meterContractId) },
      }),
    ).resolves.toEqual({ status: 'unchanged', activationId: 'sync-existing', contentHash });
    expect(service.publishPolicy).not.toHaveBeenCalled();
  });
});
