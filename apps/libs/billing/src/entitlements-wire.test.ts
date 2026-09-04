import { describe, expect, it } from 'vitest';
import { entitlementsFromTier } from '#entitlements.js';
import { parseEntitlements, serializeEntitlements } from '#entitlements-wire.js';

describe('entitlements wire round-trip', () => {
  it('should round-trip every tier projection losslessly', () => {
    for (const tier of ['free', 'pro', 'enterprise'] as const) {
      const original = entitlementsFromTier(tier);
      expect(parseEntitlements(serializeEntitlements(original))).toStrictEqual(original);
    }
  });

  it('should represent unlimited quotas as null on the wire instead of silently corrupting them', () => {
    const wire = serializeEntitlements(entitlementsFromTier('enterprise'));

    expect(wire.apiCadGatewayMonthlyLimit).toBeNull();
    expect(wire.geospecValidationMonthlyLimit).toBeNull();
    // The whole point: JSON.stringify(Infinity) is 'null' — the wire form must survive JSON.
    // oxlint-disable-next-line prefer-structured-clone -- structuredClone preserves Infinity, defeating the JSON-fidelity assertion
    const rehydrated = parseEntitlements(JSON.parse(JSON.stringify(wire)));
    expect(rehydrated.apiCadGatewayMonthlyLimit).toBe(Number.POSITIVE_INFINITY);
  });

  it('should round-trip a saved payment method (object and null)', () => {
    const withCard = { ...entitlementsFromTier('pro'), paymentMethod: { brand: 'visa', last4: '4242' } };
    expect(parseEntitlements(serializeEntitlements(withCard))).toStrictEqual(withCard);

    const withoutCard = entitlementsFromTier('free');
    expect(withoutCard.paymentMethod).toBeUndefined();
    expect(parseEntitlements(serializeEntitlements(withoutCard)).paymentMethod).toBeUndefined();
  });

  it('should round-trip period-end dates through ISO strings', () => {
    const periodEnd = new Date('2026-08-17T00:00:00.000Z');
    const original = { ...entitlementsFromTier('pro'), currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true };

    // oxlint-disable-next-line prefer-structured-clone -- structuredClone preserves Date, defeating the JSON-fidelity assertion
    const rehydrated = parseEntitlements(JSON.parse(JSON.stringify(serializeEntitlements(original))));

    expect(rehydrated.currentPeriodEnd).toStrictEqual(periodEnd);
    expect(rehydrated.cancelAtPeriodEnd).toBe(true);
  });

  it('should reject malformed wire payloads', () => {
    expect(() => parseEntitlements({ tier: 'platinum' })).toThrow();
    expect(() => parseEntitlements(null)).toThrow();
  });
});
