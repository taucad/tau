import { Injectable } from '@nestjs/common';
import { RedisService } from '#redis/redis.service.js';
import { Span } from '#telemetry/tracer.service.js';
import { BillingService } from '#api/billing/billing.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { ModelService } from '#api/models/model.service.js';
import {
  creditsTurnBucketRedisKey,
  freeTierDailyTurnCap,
  freeTierMonthlyGrantMicro,
  freeTierRolloverCeilingMicro,
} from '#api/billing/billing.constants.js';
import { DailyTurnCapExceededError, FreeTierAiDisabledError } from '#api/billing/billing.errors.js';

const dayBucketExpirySeconds = 60 * 60 * 24 + 60 * 60; // A day plus slack past the UTC rollover.

const incrByExpireLua = `
local count = redis.call('INCRBY', KEYS[1], ARGV[2])
if count == tonumber(ARGV[2]) then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

const utcDayBucket = (): string => new Date().toISOString().slice(0, 10).replaceAll('-', '');

/**
 * Tau-hosted turn-scoped billing checks, run once per chat turn BEFORE streaming starts
 * (throws here reach `ChatExceptionFilter` as clean 402/429 JSON). Order:
 * kill switch → free-tier lazy monthly grant → daily cap LAST so blocked
 * requests never burn a turn slot. Balance is deliberately NOT checked here —
 * it changes mid-turn and is the enforcement middleware's per-call job.
 */
@Injectable()
export class ChatPreflightService {
  public constructor(
    private readonly billingService: BillingService,
    private readonly creditLedgerService: CreditLedgerService,
    private readonly redisService: RedisService,
    private readonly modelService: ModelService,
  ) {}

  @Span()
  public async assertChatTurnAllowed(input: { userId: string; modelId: string }): Promise<void> {
    if (this.modelService.getProviderKind(input.modelId) !== 'tau-hosted') {
      return;
    }

    const entitlements = await this.billingService.getEntitlements(input.userId);

    // AD19: the ops kill switch zeroes Free-tier AI without a deploy.
    if (!entitlements.aiEnabled) {
      throw new FreeTierAiDisabledError();
    }

    if (entitlements.tier === 'free') {
      // Free users have no invoice.paid to grant from — the monthly allotment
      // lands lazily on their first turn of each UTC month, race-safe via the
      // synthetic-event unique index (S62).
      await this.applyLazyFreeGrant(input.userId);
      await this.consumeDailyTurnSlot(input.userId);
    }
  }

  private async applyLazyFreeGrant(userId: string): Promise<void> {
    const month = new Date().toISOString().slice(0, 7).replace('-', '');
    await this.creditLedgerService.grantMonthly({
      userId,
      monthlyGrantMicro: freeTierMonthlyGrantMicro,
      rolloverCeilingMicro: freeTierRolloverCeilingMicro,
      stripeEventId: `free:${userId}:${month}`,
    });
  }

  private async consumeDailyTurnSlot(userId: string): Promise<void> {
    const key = creditsTurnBucketRedisKey(userId, utcDayBucket());
    const countRaw = await this.redisService.client.eval(
      incrByExpireLua,
      1,
      key,
      dayBucketExpirySeconds.toString(),
      '1',
    );
    const count = typeof countRaw === 'number' ? countRaw : Number(countRaw);
    if (count > freeTierDailyTurnCap) {
      throw new DailyTurnCapExceededError({ cap: freeTierDailyTurnCap });
    }
  }
}
