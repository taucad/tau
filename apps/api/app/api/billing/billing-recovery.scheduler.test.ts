import { describe, expect, it, vi } from 'vitest';
import { BillingRecoveryScheduler } from '#api/billing/billing-recovery.scheduler.js';
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

const scheduler = (recoverDueLlmOperations: CreditLedgerService['recoverDueLlmOperations']): BillingRecoveryScheduler =>
  new BillingRecoveryScheduler(
    { recoverDueLlmOperations },
    { environment: 'prod-eu', intervalMilliseconds: 1, limit: 100 },
  );

describe('BillingRecoveryScheduler', () => {
  it('should claim due work for the configured environment on one pass', async () => {
    const recover = vi.fn(async () => ({ ...idle, claimed: 2, resolved: 2 }));

    await scheduler(recover).runOnce();

    expect(recover).toHaveBeenCalledWith({ environment: 'prod-eu', limit: 100 });
  });

  it('should keep polling after a failed pass until it is destroyed', async () => {
    const recover = vi
      .fn<CreditLedgerService['recoverDueLlmOperations']>()
      .mockRejectedValueOnce(new Error('Controlled unavailable storage'))
      .mockResolvedValue({ ...idle, claimed: 1, resolved: 1 });
    const subject = scheduler(recover);

    subject.onModuleInit();
    await vi.waitFor(() => {
      expect(recover.mock.calls.length).toBeGreaterThan(1);
    });
    await subject.onModuleDestroy();
    const passes = recover.mock.calls.length;
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(recover.mock.calls.length).toBe(passes);
  });
});
