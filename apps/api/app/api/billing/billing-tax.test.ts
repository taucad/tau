import { describe, expect, it } from 'vitest';
import {
  classifyTaxEvidence,
  earliestRollingCrossing,
  projectPaidTaxEvidence,
  taxFactEvidenceSchema,
} from '#api/billing/billing-tax.service.js';
import type Stripe from 'stripe';
import type { PaidPaymentEvidence } from '#api/billing/billing-payment-contract.js';

const evidence = (overrides: Record<string, unknown> = {}) =>
  taxFactEvidenceSchema.parse({
    version: 'tax-fact-evidence-v1',
    sourceComplete: true,
    countryCode: 'FR',
    countryEvidenceSource: 'invoice',
    customerType: 'consumer',
    vat: { type: null, countryCode: null, reference: null, validation: 'unavailable', validatedAt: null },
    currency: 'usd',
    principalMinor: '1000',
    taxMinor: '200',
    grossMinor: '1200',
    cumulativeRefundPrincipalMinor: '0',
    cumulativeRefundTaxMinor: '0',
    cumulativeRefundGrossMinor: '0',
    fx: {
      reportingCurrency: 'eur',
      numerator: '91',
      denominator: '100',
      provider: 'ecb',
      sourceRevision: '2026-09-05',
      effectiveAt: '2026-09-05T00:00:00.000Z',
      retrievedAt: '2026-09-06T00:00:00.000Z',
    },
    automaticTaxStatus: 'complete',
    productTaxCode: null,
    taxabilityReason: null,
    classificationReason: 'invoice snapshot',
    lineage: { kind: 'sale', canonicalSourceId: 'in_1' },
    ...overrides,
  });

describe('tax fact evidence', () => {
  it('classifies EU and UK consumers without treating unknown identity as consumer', () => {
    expect(classifyTaxEvidence(evidence())).toBe('eu_b2c');
    expect(classifyTaxEvidence(evidence({ countryCode: 'GB' }))).toBe('uk_b2c');
    expect(classifyTaxEvidence(evidence({ countryCode: null }))).toBe('unknown');
    expect(classifyTaxEvidence(evidence({ customerType: 'unknown' }))).toBe('unknown');
  });

  it('requires verified VAT evidence before classifying an enterprise invoice request', () => {
    expect(
      classifyTaxEvidence(
        evidence({
          customerType: 'business',
          vat: {
            type: 'eu_vat',
            countryCode: 'FR',
            reference: 'restricted:vat-1',
            validation: 'verified',
            validatedAt: '2026-09-05T00:00:00.000Z',
          },
        }),
      ),
    ).toBe('enterprise_vat_invoice');
    expect(classifyTaxEvidence(evidence({ customerType: 'business' }))).toBe('unknown');
  });

  it('rejects inconsistent gross and cumulative refund components', () => {
    expect(() => evidence({ grossMinor: '1199' })).toThrow('principal_plus_tax_must_equal_gross');
    expect(() => evidence({ cumulativeRefundPrincipalMinor: '1001', cumulativeRefundGrossMinor: '1001' })).toThrow(
      'refund_must_be_component_bounded',
    );
    expect(() =>
      evidence({
        fx: {
          reportingCurrency: 'eur',
          numerator: '0',
          denominator: '100',
          provider: 'ecb',
          sourceRevision: '2026-09-05',
          effectiveAt: '2026-09-05T00:00:00.000Z',
          retrievedAt: '2026-09-06T00:00:00.000Z',
        },
      }),
    ).toThrow();
  });
});

describe('tax registration history', () => {
  it('retains a sale crossing even when a later refund exists before the first evaluation', () => {
    const saleAt = new Date('2026-01-01T00:00:00Z');
    const crossing = earliestRollingCrossing(
      [
        { id: 'sale', supersedesFactId: null, amount: 1_000_000n, effectiveAt: saleAt },
        { id: 'refund', supersedesFactId: 'sale', amount: 100_000n, effectiveAt: new Date('2026-02-01T00:00:00Z') },
      ],
      1_000_000n,
    );
    expect(crossing).toEqual({ effectiveAt: saleAt, amount: 1_000_000n });
  });

  it('places a late-observed backdated sale at its economic effective time', () => {
    const effectiveAt = new Date('2025-04-01T00:00:00Z');
    expect(
      earliestRollingCrossing([{ id: 'late', supersedesFactId: null, amount: 1_100_000n, effectiveAt }], 1_000_000n)
        ?.effectiveAt,
    ).toEqual(effectiveAt);
  });
});

const paidEvidence = {
  version: 'stripe-paid-v1',
  stripeAccountId: 'acct_platform',
  livemode: false,
  customerId: 'cus_1',
  currency: 'usd',
  principalMinor: '1000',
  taxMinor: '200',
  grossMinor: '1200',
  paymentIntentIds: ['pi_1'],
  chargeIds: ['ch_1'],
  invoiceId: 'in_1',
  subscriptionId: 'sub_1',
  subscriptionItemId: 'si_1',
  sourceDigest: 'a'.repeat(64),
  paidAt: '2026-09-05T00:00:00.000Z',
  paymentMethod: null,
} satisfies PaidPaymentEvidence;

describe('paid tax source projection', () => {
  /* eslint-disable @typescript-eslint/naming-convention -- Stripe fixtures preserve provider field names */
  it('returns incomplete without an immutable checkout or invoice snapshot', async () => {
    await expect(projectPaidTaxEvidence({ paidEvidence })).resolves.toBeUndefined();
  });

  it('preserves a qualified rational FX observation for an EU consumer invoice', async () => {
    const invoice = {
      id: 'in_1',
      customer_address: { country: 'FR' },
      customer_tax_ids: [],
      automatic_tax: { status: 'complete' },
    } as unknown as Stripe.Invoice;
    const projected = await projectPaidTaxEvidence({
      paidEvidence,
      invoice,
      resolveFx: async () => ({
        reportingCurrency: 'eur',
        numerator: '91',
        denominator: '100',
        provider: 'fixture',
        sourceRevision: '2026-09-05',
        effectiveAt: '2026-09-05T00:00:00.000Z',
        retrievedAt: '2026-09-06T00:00:00.000Z',
      }),
    });
    expect(projected).toMatchObject({ countryCode: 'FR', customerType: 'consumer', fx: { numerator: '91' } });
    expect(classifyTaxEvidence(projected!)).toBe('eu_b2c');
  });

  it('keeps an unverified business tax ID in unknown review', async () => {
    const invoice = {
      id: 'in_1',
      customer_address: { country: 'FR' },
      customer_tax_ids: [{ type: 'eu_vat', value: 'FR123' }],
      automatic_tax: { status: 'complete' },
    } as unknown as Stripe.Invoice;
    const projected = await projectPaidTaxEvidence({ paidEvidence, invoice });
    expect(projected).toMatchObject({ customerType: 'business', vat: { validation: 'unverified' } });
    expect(classifyTaxEvidence(projected!)).toBe('unknown');
  });

  it('rejects a paid invoice identity mismatch', async () => {
    const invoice = { id: 'in_other' } as unknown as Stripe.Invoice;
    await expect(projectPaidTaxEvidence({ paidEvidence, invoice })).rejects.toThrow('tax_invoice_identity_mismatch');
  });
  /* eslint-enable @typescript-eslint/naming-convention -- Stripe fixture field block ends */
});
