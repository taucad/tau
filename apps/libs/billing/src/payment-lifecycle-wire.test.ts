import { describe, expect, it } from 'vitest';
import { wireAutoReloadConsentSchema } from '#payment-lifecycle-wire.js';

const consent = {
  version: 'auto-reload-consent-v1',
  environment: 'development',
  ownerId: 'user_a',
  subjectId: 'account_a',
  consentId: 'consent_a',
  consentVersion: 1,
  state: 'pending_setup',
  paymentMethod: null,
  setupAction: {
    version: 'payment-action-v1',
    actionId: 'consent_a',
    environment: 'development',
    ownerId: 'user_a',
    subjectId: 'account_a',
    purpose: 'reload_setup',
    state: 'prepared',
    frozen: {
      offerId: 'offer_a',
      currency: 'usd',
      principalMinor: '2500',
      taxMinor: '500',
      grossMinor: '3000',
      maximumGrossMinor: '3000',
      creditAtoms: '250000',
      paymentMethod: null,
    },
    redirectUrl: null,
    attention: null,
    receipt: null,
    updatedAt: '2026-09-06T00:00:00Z',
  },
  terms: {
    offerId: 'offer_a',
    currency: 'usd',
    thresholdAtoms: '100000',
    principalMinor: '2500',
    quotedTaxMinor: '500',
    grossCeilingMinor: '3000',
    monthlyGrossCapMinor: '10000',
    minimumCadenceSeconds: 3600,
    terminalFailureLimit: 2,
    taxQuoteExpiresAt: '2026-09-06T01:00:00Z',
  },
  updatedAt: '2026-09-06T00:00:00Z',
};

describe('reload consent wire authority', () => {
  it('binds setup ownership and exact monetary limits', () => {
    expect(wireAutoReloadConsentSchema.safeParse(consent).success).toBe(true);
    for (const changed of [
      { ...consent, setupAction: { ...consent.setupAction, ownerId: 'user_b' } },
      { ...consent, terms: { ...consent.terms, principalMinor: '2600' } },
      { ...consent, terms: { ...consent.terms, monthlyGrossCapMinor: '2999' } },
      { ...consent, state: 'enabled' },
      { ...consent, setupAction: { ...consent.setupAction, state: 'funds_received' } },
    ]) {
      expect(wireAutoReloadConsentSchema.safeParse(changed).success).toBe(false);
    }
  });
});
