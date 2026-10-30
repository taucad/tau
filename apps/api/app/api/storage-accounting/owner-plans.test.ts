import { describe, expect, it, vi } from 'vitest';
import { storageLimitBytesByTier } from '@taucad/billing';
import type { DatabaseType } from '#database/database.service.js';
import { ownerPlansOf, readOwnerPlans } from '#api/storage-accounting/owner-plans.js';
import type { OwnerPlanSettings, OwnerSubscriptionRow } from '#api/storage-accounting/owner-plans.js';

const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const cloud: OwnerPlanSettings = { tauCloudEnabled: true, environment: 'staging', freeTierSync: false };

const row = (ownerId: string, overrides: Partial<OwnerSubscriptionRow> = {}): OwnerSubscriptionRow => ({
  ownerId,
  plan: 'pro',
  paidThrough: new Date(now + day),
  failedRenewalInvoiceId: null,
  graceEndsAt: null,
  overrides: null,
  ...overrides,
});

describe('ownerPlansOf (W14 OB3, as storageLimitOf enforces)', () => {
  it('should give a paid owner its tier and allowance, and an owner without one `free`', () => {
    const plans = ownerPlansOf(
      ['paid', 'lapsed', 'grace', 'none', 'enterprise'],
      [
        row('paid'),
        row('lapsed', { paidThrough: new Date(now - day) }),
        row('grace', {
          paidThrough: new Date(now - day),
          failedRenewalInvoiceId: 'in_1',
          graceEndsAt: new Date(now + day),
        }),
        row('enterprise', { plan: 'enterprise' }),
      ],
      { ...cloud, now },
    );

    expect(Object.fromEntries(plans)).toStrictEqual({
      paid: { plan: 'pro', limitBytes: storageLimitBytesByTier.pro },
      lapsed: { plan: 'free', limitBytes: 0 },
      grace: { plan: 'pro', limitBytes: storageLimitBytesByTier.pro },
      none: { plan: 'free', limitBytes: 0 },
      enterprise: { plan: 'enterprise', limitBytes: storageLimitBytesByTier.enterprise },
    });
  });

  it('should open the free allowance only with D23’s free-tier sync gate', () => {
    expect(ownerPlansOf(['none'], [], { ...cloud, freeTierSync: true, now }).get('none')).toStrictEqual({
      plan: 'free',
      limitBytes: storageLimitBytesByTier.free,
    });
  });

  it('should honour an Enterprise override that turns sync off', () => {
    const plans = ownerPlansOf(['e'], [row('e', { plan: 'enterprise', overrides: { canSyncFiles: false } })], {
      ...cloud,
      now,
    });
    expect(plans.get('e')).toStrictEqual({ plan: 'enterprise', limitBytes: 0 });
  });

  it('should count every owner of a self-host build as `pro` with the Pro allowance', () => {
    const plans = ownerPlansOf(['a'], [], { ...cloud, tauCloudEnabled: false, now });
    expect(plans.get('a')).toStrictEqual({ plan: 'pro', limitBytes: storageLimitBytesByTier.pro });
  });
});

describe('readOwnerPlans', () => {
  it('should read every owner in batched SQL, never one call per owner', async () => {
    const ownerIds = Array.from({ length: 2500 }, (_, index) => `owner-${String(index)}`);
    const orderBy = vi.fn(async () => [row('owner-1')]);
    const chain = { from: () => chain, innerJoin: () => chain, leftJoin: () => chain, where: () => ({ orderBy }) };
    const select = vi.fn(() => chain);

    const plans = await readOwnerPlans({ select } as unknown as DatabaseType, ownerIds, cloud);

    expect(select).toHaveBeenCalledTimes(3);
    expect(plans.size).toBe(2500);
    expect(plans.get('owner-1')?.plan).toBe('pro');
    expect(plans.get('owner-2')?.plan).toBe('free');
  });

  it('should not query billing without a billing environment', async () => {
    const select = vi.fn();
    const plans = await readOwnerPlans({ select } as unknown as DatabaseType, ['a'], {
      ...cloud,
      environment: undefined,
    });
    expect(select).not.toHaveBeenCalled();
    expect(plans.get('a')?.plan).toBe('free');
  });
});
