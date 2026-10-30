import { describe, expect, it } from 'vitest';
import type { TierSubscription } from '#api/billing/subscription-tier.js';
import { planToTier, recognisedTier, subscriptionTierAssuranceOf } from '#api/billing/subscription-tier.js';

const now = Date.UTC(2026, 9, 29);
const later = new Date(now + 86_400_000);
const earlier = new Date(now - 86_400_000);

const sub = (overrides: Partial<TierSubscription> = {}): TierSubscription => ({
  plan: 'pro',
  paidThrough: later,
  failedRenewalInvoiceId: null,
  graceEndsAt: null,
  ...overrides,
});

describe('recognisedTier', () => {
  it('names the tiers this build knows and nothing else', () => {
    expect(recognisedTier('pro')).toBe('pro');
    expect(recognisedTier('enterprise')).toBe('enterprise');
    expect(recognisedTier('team-2027')).toBeUndefined();
    expect(recognisedTier('')).toBeUndefined();
  });

  it('agrees with planToTier wherever planToTier grants something', () => {
    for (const plan of ['pro', 'enterprise', 'team-2027', 'free']) {
      const tier = planToTier(plan);
      expect(tier === 'free' || tier === recognisedTier(plan)).toBe(true);
    }
  });
});

describe('subscriptionTierAssuranceOf', () => {
  it('assures a paid tier', () => {
    expect(subscriptionTierAssuranceOf([sub()], now)).toEqual({ tier: 'pro', assured: true });
    expect(subscriptionTierAssuranceOf([sub({ plan: 'enterprise' })], now)).toEqual({
      tier: 'enterprise',
      assured: true,
    });
  });

  it('assures free for an account with no subscription at all', () => {
    expect(subscriptionTierAssuranceOf([], now)).toEqual({ tier: 'free', assured: true });
  });

  it('assures free for a lapsed subscription on a plan it recognises', () => {
    const lapsed = sub({ paidThrough: earlier });

    expect(subscriptionTierAssuranceOf([lapsed], now)).toEqual({ tier: 'free', assured: true });
  });

  it('withholds assurance when the deciding plan name is unrecognised', () => {
    /* `planToTier` answers free here too, so access is unchanged. What differs is
     * that nobody established the account is free, which the reuse and training
     * purposes refuse on. */
    const unknown = sub({ plan: 'team-2027' });

    expect(planToTier(unknown.plan)).toBe('free');
    expect(subscriptionTierAssuranceOf([unknown], now)).toEqual({ tier: 'free', assured: false });
  });

  it('withholds assurance for an unrecognised plan that has also lapsed', () => {
    const unknown = sub({ plan: 'team-2027', paidThrough: earlier });

    expect(subscriptionTierAssuranceOf([unknown], now)).toEqual({ tier: 'free', assured: false });
  });

  it('assures the tier a renewal grace keeps alive', () => {
    const grace = sub({ paidThrough: earlier, failedRenewalInvoiceId: 'in_1', graceEndsAt: later });

    expect(subscriptionTierAssuranceOf([grace], now)).toEqual({ tier: 'pro', assured: true });
  });
});
