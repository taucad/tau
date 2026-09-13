import { describe, expect, it } from 'vitest';
import { billingTiers, tierMeets } from '#billing-tier.js';

describe('billingTiers', () => {
  it('lists all tiers in ascending privilege order', () => {
    expect(billingTiers).toEqual(['free', 'pro', 'enterprise']);
  });
});

describe('tierMeets', () => {
  it.each([
    ['free', 'free', true],
    ['free', 'pro', false],
    ['free', 'enterprise', false],
    ['pro', 'free', true],
    ['pro', 'pro', true],
    ['pro', 'enterprise', false],
    ['enterprise', 'free', true],
    ['enterprise', 'pro', true],
    ['enterprise', 'enterprise', true],
  ] as const)('returns %s when current=%s required=%s', (current, required, expected) => {
    expect(tierMeets(current, required)).toBe(expected);
  });
});
