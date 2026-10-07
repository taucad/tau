import { describe, expect, it, vi } from 'vitest';
import { BillingRecoveryScheduler } from '#api/billing/billing-recovery.scheduler.js';
import type { BillingRecoveryMetrics } from '#api/billing/billing-recovery.scheduler.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { LlmRecoveryResult } from '#api/billing/credit-ledger.types.js';

const idle: LlmRecoveryResult = {
  claimed: 0,
  resolved: 0,
  pending: 0,
  remainingDue: 0,
  leasedDue: 0,
  failedOperationIds: [],
};

const fakeMetrics = () => {
  const instrument = () => ({ add: vi.fn(), record: vi.fn() });
  return {
    billingFundedOperationRecoveries: instrument(),
    billingFundedOperationCurrent: instrument(),
    billingFundedOperationOldestDueAge: instrument(),
    billingFundedOperationRecoveryProviderExecutions: instrument(),
    billingFundedOperationRecoveryBatchDuration: instrument(),
    billingWorkerPasses: instrument(),
  };
};

const scheduler = (
  recoverDueLlmOperations: CreditLedgerService['recoverDueLlmOperations'],
  metrics = fakeMetrics(),
): BillingRecoveryScheduler =>
  new BillingRecoveryScheduler({ recoverDueLlmOperations }, metrics as unknown as BillingRecoveryMetrics, {
    environment: 'prod-eu',
    intervalMilliseconds: 1,
    limit: 100,
  });

describe('BillingRecoveryScheduler', () => {
  it('should claim due work in each capacity pool for the configured environment on one pass', async () => {
    const recover = vi.fn(async () => ({ ...idle, claimed: 2, resolved: 2 }));

    await scheduler(recover).runOnce();

    expect(recover.mock.calls).toEqual([
      [{ environment: 'prod-eu', limit: 100, pool: 'primary' }],
      [{ environment: 'prod-eu', limit: 100, pool: 'helper' }],
    ]);
  });

  it('should emit the recovery gauges and an ok pass that the alerts read', async () => {
    const metrics = fakeMetrics();
    const recover = vi.fn(async () => ({ ...idle, pending: 3, remainingDue: 1, oldestDueAgeMilliseconds: 4000 }));

    await scheduler(recover, metrics).runOnce();

    const attributes = { 'deployment.environment': 'prod-eu', 'tau.billing.capacity_pool': 'primary' };
    expect(metrics.billingFundedOperationCurrent.record).toHaveBeenCalledWith(3, {
      ...attributes,
      'tau.billing.pending.state': 'pending',
    });
    expect(metrics.billingFundedOperationOldestDueAge.record).toHaveBeenCalledWith(4000, attributes);
    expect(metrics.billingFundedOperationRecoveryProviderExecutions.record).toHaveBeenCalledWith(0, attributes);
    expect(metrics.billingFundedOperationRecoveryBatchDuration.record).toHaveBeenCalledTimes(2);
    expect(metrics.billingWorkerPasses.add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.worker': 'recovery',
      outcome: 'ok',
    });
  });

  it('should still drain the other pool and record an error pass when one pool throws', async () => {
    const metrics = fakeMetrics();
    const recover = vi
      .fn<CreditLedgerService['recoverDueLlmOperations']>()
      .mockRejectedValueOnce(new Error('Controlled unavailable storage'))
      .mockResolvedValue({ ...idle, claimed: 100, resolved: 100 });

    const pass = await scheduler(recover, metrics).runOnce();

    expect(recover).toHaveBeenCalledTimes(2);
    expect(pass).toMatchObject({ failed: 1, fullBatch: true });
    expect(pass.batches[0]).toMatchObject({
      pool: 'primary',
      outcome: 'failed',
      failureKind: 'Error',
      failureMessage: 'Controlled unavailable storage',
    });
    expect(metrics.billingWorkerPasses.add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.worker': 'recovery',
      outcome: 'error',
    });
  });

  it('should keep polling after a failed pass until it is destroyed', async () => {
    const recover = vi
      .fn<CreditLedgerService['recoverDueLlmOperations']>()
      .mockRejectedValueOnce(new Error('Controlled unavailable storage'))
      .mockResolvedValue({ ...idle, claimed: 1, resolved: 1 });
    const subject = scheduler(recover);

    subject.onModuleInit();
    await vi.waitFor(() => {
      expect(recover.mock.calls.length).toBeGreaterThan(2);
    });
    await subject.onModuleDestroy();
    const passes = recover.mock.calls.length;
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(recover.mock.calls.length).toBe(passes);
  });
});
