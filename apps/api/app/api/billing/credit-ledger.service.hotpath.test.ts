import IORedisMock from 'ioredis-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { CreditLedgerOutbox } from '#api/billing/credit-ledger-outbox.service.js';
import { creditsRedisKey, creditsReservationRedisKey } from '#api/billing/billing.constants.js';
import type { DatabaseService } from '#database/database.service.js';
import type { RedisService } from '#redis/redis.service.js';
import type { Environment } from '#config/environment.config.js';

const userId = 'user_hotpath';

type Harness = {
  service: CreditLedgerService;
  redis: Redis;
  databaseService: ReturnType<typeof mockDeep<DatabaseService>>;
};

const createLedger = async (
  options: { pgAccount?: { grantBalanceMicro: bigint; topupBalanceMicro: bigint } } = {},
): Promise<Harness> => {
  // The ioredis-mock instances SHARE one emulated keyspace per process — flush
  // at harness creation so residual reservations never leak across tests.
  const redis = new IORedisMock() as unknown as Redis;
  await redis.flushall();
  const redisService = { client: redis } as unknown as RedisService;
  const databaseService = mockDeep<DatabaseService>();
  databaseService.database.query.creditAccount.findFirst.mockResolvedValue(options.pgAccount as never);
  const configService = mock<ConfigService<Environment, true>>();
  configService.get.mockImplementation(((key: string) =>
    key === 'TAU_CREDIT_LEDGER_PG_FALLBACK' ? false : '') as never);

  const service = new CreditLedgerService(
    databaseService,
    redisService,
    configService,
    new CreditLedgerOutbox(databaseService),
  );
  service.onModuleInit();
  return { service, redis, databaseService };
};

const seedBalances = async (redis: Redis, balances: { grant: bigint; topup: bigint }): Promise<void> => {
  await redis.hset(creditsRedisKey(userId), {
    grant: balances.grant.toString(),
    topup: balances.topup.toString(),
    reserved: '0',
    version: '0',
  });
};

const readBalances = async (redis: Redis): Promise<{ grant: bigint; topup: bigint; reserved: bigint }> => {
  const hash = await redis.hgetall(creditsRedisKey(userId));
  return {
    grant: BigInt(hash['grant'] ?? '0'),
    topup: BigInt(hash['topup'] ?? '0'),
    reserved: BigInt(hash['reserved'] ?? '0'),
  };
};

const reserveInput = (amountMicro: bigint) =>
  ({
    userId,
    amountMicro,
    inputFloorMicro: amountMicro / 4n,
    chatId: 'chat_1',
    turnId: 'turn_1',
    modelId: 'test-model',
    category: 'llm',
  }) as const;

describe('CreditLedgerService hot path (Lua on ioredis-mock)', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createLedger();
    await seedBalances(harness.redis, { grant: 10_000_000n, topup: 5_000_000n });
  });

  it('should reserve against the available balance and hold without spending (S13)', async () => {
    const result = await harness.service.reserve(reserveInput(4_000_000n));

    expect(result.ok).toBe(true);
    const balances = await readBalances(harness.redis);
    expect(balances).toStrictEqual({ grant: 10_000_000n, topup: 5_000_000n, reserved: 4_000_000n });
  });

  it('should reject a reservation that exceeds available-minus-held funds (S14)', async () => {
    await harness.service.reserve(reserveInput(12_000_000n));

    const second = await harness.service.reserve(reserveInput(4_000_000n));

    expect(second).toStrictEqual({ ok: false, balanceMicro: 15_000_000n });
    const balances = await readBalances(harness.redis);
    expect(balances.reserved).toBe(12_000_000n);
  });

  it('should block all reservations while the account is in debt (S16/Q37)', async () => {
    await seedBalances(harness.redis, { grant: -1_000_000n, topup: 0n });

    const result = await harness.service.reserve(reserveInput(1n));

    expect(result.ok).toBe(false);
  });

  it('should consume top-up balance before grant balance at commit (S17)', async () => {
    const reservation = await harness.service.reserve(reserveInput(8_000_000n));
    if (!reservation.ok) {
      throw new Error('expected the reservation to succeed');
    }

    const outcome = await harness.service.commit({
      reservationId: reservation.reservationId,
      userId,
      actualMicro: 6_000_000n,
      modelId: 'test-model',
      category: 'llm',
    });

    expect(outcome).toStrictEqual({ committed: true, balanceMicro: 9_000_000n });
    const balances = await readBalances(harness.redis);
    // Top-up (5M) drains first; the remaining 1M comes from grant (10M → 9M).
    expect(balances).toStrictEqual({ grant: 9_000_000n, topup: 0n, reserved: 0n });
  });

  it('should implicitly refunds the over-reservation (S15)', async () => {
    const reservation = await harness.service.reserve(reserveInput(10_000_000n));
    if (!reservation.ok) {
      throw new Error('expected the reservation to succeed');
    }

    await harness.service.commit({
      reservationId: reservation.reservationId,
      userId,
      actualMicro: 100n,
      modelId: 'test-model',
      category: 'llm',
    });

    const balances = await readBalances(harness.redis);
    expect(balances.reserved).toBe(0n);
    expect(balances.grant + balances.topup).toBe(14_999_900n);
  });

  it('should let a commit exceed its reservation into debt (S16)', async () => {
    const reservation = await harness.service.reserve(reserveInput(1_000_000n));
    if (!reservation.ok) {
      throw new Error('expected the reservation to succeed');
    }

    const outcome = await harness.service.commit({
      reservationId: reservation.reservationId,
      userId,
      actualMicro: 20_000_000n,
      modelId: 'test-model',
      category: 'llm',
    });

    expect(outcome.balanceMicro).toBe(-5_000_000n);
    await expect(harness.service.reserve(reserveInput(1n))).resolves.toMatchObject({ ok: false });
  });

  it('should treat a second commit of the same reservation as a no-op (S28)', async () => {
    const reservation = await harness.service.reserve(reserveInput(2_000_000n));
    if (!reservation.ok) {
      throw new Error('expected the reservation to succeed');
    }
    const commitInput = {
      reservationId: reservation.reservationId,
      userId,
      actualMicro: 1_000_000n,
      modelId: 'test-model',
      category: 'llm',
    } as const;

    await harness.service.commit(commitInput);
    const second = await harness.service.commit(commitInput);

    expect(second.committed).toBe(false);
    const balances = await readBalances(harness.redis);
    expect(balances.grant + balances.topup).toBe(14_000_000n);
  });

  it('should return the full hold on a provider-rejected release (S20)', async () => {
    const reservation = await harness.service.reserve(reserveInput(3_000_000n));
    if (!reservation.ok) {
      throw new Error('expected the reservation to succeed');
    }

    await harness.service.release({ reservationId: reservation.reservationId, userId, reason: 'provider-rejected' });

    const balances = await readBalances(harness.redis);
    expect(balances).toStrictEqual({ grant: 10_000_000n, topup: 5_000_000n, reserved: 0n });
  });

  it('should debit secondary-surface usage without a reservation, into debt if needed (S38/Q37)', async () => {
    const outcome = await harness.service.debit({
      userId,
      amountMicro: 16_000_000n,
      category: 'llm',
      modelId: 'openai-gpt-4o-mini',
      note: 'name-generator',
    });

    expect(outcome.balanceMicro).toBe(-1_000_000n);
  });

  it('should rehydrate from the durable account when the hot hash is missing (S24)', async () => {
    const rehydrated = await createLedger({
      pgAccount: { grantBalanceMicro: 7_000_000n, topupBalanceMicro: 1_000_000n },
    });

    const result = await rehydrated.service.reserve(reserveInput(5_000_000n));

    expect(result.ok).toBe(true);
    const balances = await readBalances(rehydrated.redis);
    expect(balances).toStrictEqual({ grant: 7_000_000n, topup: 1_000_000n, reserved: 5_000_000n });
  });

  it('should recompute holds from surviving reservation entries during rehydration (S24)', async () => {
    await harness.redis.hset(creditsReservationRedisKey(userId), 'cres_survivor', '2000000:500000:9999999999999');
    await harness.redis.del(creditsRedisKey(userId));
    harness.databaseService.database.query.creditAccount.findFirst.mockResolvedValue({
      grantBalanceMicro: 4_000_000n,
      topupBalanceMicro: 0n,
    } as never);

    const result = await harness.service.reserve(reserveInput(1_000_000n));

    expect(result.ok).toBe(true);
    const balances = await readBalances(harness.redis);
    expect(balances.reserved).toBe(3_000_000n);
  });
});
