import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertTestModeKey, stripeReadKey } from '#support/stripe.js';

describe('assertTestModeKey', () => {
  it('should refuse live keys before anything is sent', () => {
    expect(() => {
      assertTestModeKey('sk_live_123');
    }).toThrow(/live Stripe key/u);
    expect(() => {
      assertTestModeKey('rk_live_123');
    }).toThrow(/live Stripe key/u);
  });

  it('should refuse anything that is not a test-mode key', () => {
    expect(() => {
      assertTestModeKey('pk_test_123');
    }).toThrow(/test-mode key/u);
  });

  it('should accept test-mode secret and restricted keys', () => {
    expect(() => {
      assertTestModeKey('sk_test_123');
    }).not.toThrow();
    expect(() => {
      assertTestModeKey('rk_test_123');
    }).not.toThrow();
  });
});

describe('stripeReadKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should be undefined when no key is configured', () => {
    vi.stubEnv('STRIPE_TEST_READ_KEY', '');
    expect(stripeReadKey()).toBeUndefined();
  });

  it('should return a test key and refuse a live one', () => {
    vi.stubEnv('STRIPE_TEST_READ_KEY', 'rk_test_abc');
    expect(stripeReadKey()).toBe('rk_test_abc');
    vi.stubEnv('STRIPE_TEST_READ_KEY', 'rk_live_abc');
    expect(() => stripeReadKey()).toThrow(/live Stripe key/u);
  });
});
