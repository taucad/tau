import IORedisMock from 'ioredis-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Redis } from 'ioredis';
import { entitlementsFromTier } from '@taucad/billing';
import { ChatPreflightService } from '#api/billing/chat-preflight.service.js';
import { DailyTurnCapExceededError, FreeTierAiDisabledError } from '#api/billing/billing.errors.js';
import type { BillingService } from '#api/billing/billing.service.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { ModelProviderKind } from '#api/models/model.schema.js';
import type { ModelService } from '#api/models/model.service.js';
import type { RedisService } from '#redis/redis.service.js';

type Harness = {
  service: ChatPreflightService;
  billingService: ReturnType<typeof mock<BillingService>>;
  creditLedgerService: ReturnType<typeof mock<CreditLedgerService>>;
  modelService: ReturnType<typeof mock<ModelService>>;
  redis: Redis;
};

const createPreflight = async (options: {
  tier: 'free' | 'pro';
  aiEnabled?: boolean;
  providerKind?: ModelProviderKind;
}): Promise<Harness> => {
  const billingService = mock<BillingService>();
  billingService.getEntitlements.mockResolvedValue({
    ...entitlementsFromTier(options.tier),
    aiEnabled: options.aiEnabled ?? true,
  });
  const creditLedgerService = mock<CreditLedgerService>();
  creditLedgerService.grantMonthly.mockResolvedValue(true);
  const redis = new IORedisMock() as unknown as Redis;
  await redis.flushall();
  const redisService = { client: redis } as unknown as RedisService;
  const modelService = mock<ModelService>();
  modelService.getProviderKind.mockReturnValue(options.providerKind ?? 'tau-hosted');

  return {
    service: new ChatPreflightService(billingService, creditLedgerService, redisService, modelService),
    billingService,
    creditLedgerService,
    modelService,
    redis,
  };
};

describe('ChatPreflightService.assertChatTurnAllowed', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('should skip billing preflight for local provider models', async () => {
    const { service, billingService, creditLedgerService, modelService, redis } = await createPreflight({
      tier: 'free',
      aiEnabled: false,
      providerKind: 'local',
    });

    await expect(service.assertChatTurnAllowed({ userId: 'u1', modelId: 'local-model' })).resolves.toBeUndefined();

    expect(modelService.getProviderKind).toHaveBeenCalledWith('local-model');
    expect(billingService.getEntitlements).not.toHaveBeenCalled();
    expect(creditLedgerService.grantMonthly).not.toHaveBeenCalled();
    expect(await redis.keys('tau:credits:turns:*')).toHaveLength(0);
  });

  it('should enforce the AD19 kill switch for Tau-hosted models', async () => {
    const { service, creditLedgerService, modelService } = await createPreflight({
      tier: 'free',
      aiEnabled: false,
      providerKind: 'tau-hosted',
    });

    await expect(service.assertChatTurnAllowed({ userId: 'u1', modelId: 'tau-hosted-model' })).rejects.toBeInstanceOf(
      FreeTierAiDisabledError,
    );
    expect(modelService.getProviderKind).toHaveBeenCalledWith('tau-hosted-model');
    expect(creditLedgerService.grantMonthly).not.toHaveBeenCalled();
  });

  it('should apply the lazy free-tier monthly grant with a month-stable synthetic event id (S62)', async () => {
    const { service, creditLedgerService } = await createPreflight({ tier: 'free' });

    await service.assertChatTurnAllowed({ userId: 'u1', modelId: 'm' });
    await service.assertChatTurnAllowed({ userId: 'u1', modelId: 'm' });

    const month = new Date().toISOString().slice(0, 7).replace('-', '');
    expect(creditLedgerService.grantMonthly).toHaveBeenCalledTimes(2);
    expect(creditLedgerService.grantMonthly).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        monthlyGrantMicro: 500_000n,
        rolloverCeilingMicro: 1_000_000n,
        stripeEventId: `free:u1:${month}`,
      }),
    );
  });

  it('should block the 11th free turn of the UTC day (S31) while leaving pro uncapped', async () => {
    const free = await createPreflight({ tier: 'free' });
    for (let turn = 0; turn < 10; turn += 1) {
      // oxlint-disable-next-line no-await-in-loop -- turns are inherently sequential
      await free.service.assertChatTurnAllowed({ userId: 'u_cap', modelId: 'm' });
    }

    await expect(free.service.assertChatTurnAllowed({ userId: 'u_cap', modelId: 'm' })).rejects.toBeInstanceOf(
      DailyTurnCapExceededError,
    );

    const pro = await createPreflight({ tier: 'pro' });
    for (let turn = 0; turn < 12; turn += 1) {
      // oxlint-disable-next-line no-await-in-loop -- turns are inherently sequential
      await pro.service.assertChatTurnAllowed({ userId: 'u_pro', modelId: 'm' });
    }
    expect(pro.creditLedgerService.grantMonthly).not.toHaveBeenCalled();
  });

  it('should never grant or caps paid tiers', async () => {
    const { service, creditLedgerService, redis } = await createPreflight({ tier: 'pro' });

    await service.assertChatTurnAllowed({ userId: 'u_pro', modelId: 'm' });

    expect(creditLedgerService.grantMonthly).not.toHaveBeenCalled();
    expect(await redis.keys('tau:credits:turns:*')).toHaveLength(0);
  });
});
