import { describe, expect, it } from 'vitest';
import type { Stripe } from 'stripe';
import {
  isConclusiveNoCharge,
  qualifyManualPayment,
  qualifyReloadCustomerLocation,
  qualifyReloadSetup,
  qualifyReloadTaxCalculation,
  qualifySubscriptionInvoice,
} from '#api/billing/billing-payments.recovery.js';
import { cashOccurredAt } from '#api/billing/billing-payment-contract.js';
import type { PaymentOfferSnapshot } from '#api/billing/billing-payment-contract.js';

/* eslint-disable @typescript-eslint/naming-convention -- Stripe source fixtures preserve provider response field names. */

const offer: PaymentOfferSnapshot = {
  version: 'payment-offer-v1',
  policyId: 'policy',
  offerId: 'topup',
  environment: 'development',
  accountId: 'account',
  stripeAccountId: 'acct_fixture',
  livemode: false,
  currency: 'usd',
  principalMinor: '537',
  taxMinor: '0',
  grossMinor: '537',
  maximumGrossMinor: '50000',
  creditAtoms: '537000',
  ceilingCreditAtoms: null,
  stripePriceId: null,
  quantity: 1,
  stripeProductId: 'prod_topup',
  term: 'one_time',
  taxBasis: 'synthetic_local_zero_tax',
  paymentMethod: { id: 'pm_card', brand: 'visa', last4: '4242' },
};

const intent = {
  id: 'pi_paid',
  object: 'payment_intent',
  amount: 537,
  amount_capturable: 0,
  amount_received: 537,
  created: 1_788_650_000,
  currency: 'usd',
  customer: 'cus_owned',
  latest_charge: 'ch_paid',
  livemode: false,
  metadata: { tau_customer_binding_id: 'binding', tau_provider_leg_id: 'leg', tau_purchase_id: 'purchase' },
  payment_method: 'pm_card',
  status: 'succeeded',
} as unknown as Stripe.PaymentIntent;
const charge = {
  id: 'ch_paid',
  object: 'charge',
  amount: 537,
  amount_captured: 537,
  amount_refunded: 0,
  created: 1_788_650_001,
  currency: 'usd',
  customer: 'cus_owned',
  livemode: false,
  paid: true,
  payment_intent: 'pi_paid',
  payment_method: 'pm_card',
  payment_method_details: { card: { brand: 'visa', last4: '4242' } },
  refunded: false,
  status: 'succeeded',
} as unknown as Stripe.Charge;

describe('reload source qualification', () => {
  it('requires independent matching metadata through the hosted setup chain', () => {
    const source = {
      session: {
        id: 'cs_setup',
        mode: 'setup',
        status: 'complete',
        livemode: false,
        customer: 'cus_owned',
        client_reference_id: 'consent',
        setup_intent: 'seti_owned',
        metadata: {
          tau_reload_consent_id: 'consent',
          tau_reload_consent_version: '1',
          tau_provider_leg_id: 'leg_setup',
        },
      } as unknown as Stripe.Checkout.Session,
      setupIntent: {
        id: 'seti_owned',
        status: 'succeeded',
        usage: 'off_session',
        livemode: false,
        customer: 'cus_owned',
        payment_method: 'pm_reload',
        metadata: {
          tau_reload_consent_id: 'consent',
          tau_reload_consent_version: '1',
          tau_provider_leg_id: 'leg_setup',
        },
      } as unknown as Stripe.SetupIntent,
      paymentMethod: {
        id: 'pm_reload',
        type: 'card',
        customer: 'cus_owned',
        card: { brand: 'visa', last4: '4242' },
      } as unknown as Stripe.PaymentMethod,
    };
    expect(
      qualifyReloadSetup({
        consentId: 'consent',
        consentVersion: 1,
        customerId: 'cus_owned',
        livemode: false,
        providerLegId: 'leg_setup',
        source,
      }),
    ).toMatchObject({ status: 'qualified', paymentMethodId: 'pm_reload' });
    expect(
      qualifyReloadSetup({
        consentId: 'consent',
        consentVersion: 1,
        customerId: 'cus_owned',
        livemode: false,
        providerLegId: 'foreign',
        source,
      }),
    ).toEqual({ status: 'unsupported', reason: 'setup_source_mismatch' });
  });

  it('rejects incomplete, expired, and mismatched reload tax evidence', () => {
    const location = qualifyReloadCustomerLocation({
      accountId: 'account',
      customerBindingId: 'binding',
      customerId: 'cus_owned',
      livemode: false,
      customer: {
        id: 'cus_owned',
        object: 'customer',
        livemode: false,
        metadata: { tau_account_id: 'account', tau_customer_binding_id: 'binding' },
        address: {
          city: 'Auckland',
          country: 'NZ',
          line1: '1 Queen Street',
          line2: null,
          postal_code: '1010',
          state: null,
        },
      } as unknown as Stripe.Customer,
    });
    if (location === undefined) {
      throw new Error('Fixture Customer must have a qualified billing location');
    }
    const calculation = {
      id: 'taxcalc_1',
      object: 'tax.calculation',
      livemode: false,
      customer: 'cus_owned',
      currency: 'usd',
      expires_at: 1_900_000_000,
      amount_total: 2750,
      tax_amount_exclusive: 250,
      tax_amount_inclusive: 0,
      customer_details: {
        address_source: 'billing',
        address: {
          city: 'Auckland',
          country: 'NZ',
          line1: '1 Queen Street',
          line2: null,
          postal_code: '1010',
          state: null,
        },
      },
    } as unknown as Stripe.Tax.Calculation;
    const line = {
      id: 'taxli_1',
      object: 'tax.calculation_line_item',
      livemode: false,
      amount: 2500,
      amount_tax: 250,
      product: 'prod_topup',
      quantity: 1,
      reference: 'consent',
      tax_behavior: 'exclusive',
    } as unknown as Stripe.Tax.CalculationLineItem;
    const input = {
      customerId: 'cus_owned',
      livemode: false,
      principalMinor: 2500,
      productId: 'prod_topup',
      reference: 'consent',
      location,
      observedAt: new Date('2026-09-06T00:00:00Z'),
      source: { calculation, lines: [line], complete: true },
    };
    expect(qualifyReloadTaxCalculation(input)).toMatchObject({ status: 'qualified', taxMinor: 250, grossMinor: 2750 });
    expect(qualifyReloadTaxCalculation({ ...input, source: { ...input.source, complete: false } })).toEqual({
      status: 'pending',
      reason: 'tax_lines_incomplete',
    });
    expect(
      qualifyReloadTaxCalculation({
        ...input,
        source: { ...input.source, calculation: { ...calculation, amount_total: 2749 } },
      }).status,
    ).toBe('unsupported');
  });
});

describe('payment source qualification', () => {
  const qualify = (source: {
    readonly paymentIntent: Stripe.PaymentIntent;
    readonly latestCharge: Stripe.Charge | undefined;
  }) =>
    qualifyManualPayment({
      offer,
      customerId: 'cus_owned',
      customerBindingId: 'binding',
      providerLegId: 'leg',
      purchaseId: 'purchase',
      paymentMethod: offer.paymentMethod,
      source,
      sourceAcceptance: { type: 'payment_intent.succeeded', createdAt: new Date('2026-09-06T00:00:00.000Z') },
    });

  it('accepts only the exact owned amount and charged card', () => {
    const result = qualify({ paymentIntent: intent, latestCharge: charge });
    expect(result.status).toBe('paid');
    if (result.status === 'paid') {
      expect(result.evidence.grossMinor).toBe('537');
      expect(result.evidence.paymentMethod).toEqual({ id: 'pm_card', brand: 'visa', last4: '4242' });
    }
  });

  it('rejects owner and amount disagreement', () => {
    expect(qualify({ paymentIntent: { ...intent, customer: 'cus_other' }, latestCharge: charge })).toEqual({
      status: 'unsupported',
      reason: 'payment_owner_or_amount_mismatch',
    });
  });

  it('requires canceled intents to prove zero received and capturable funds', () => {
    const canceled: Stripe.PaymentIntent = { ...intent, status: 'canceled', amount_received: 0, amount_capturable: 0 };
    const ambiguous: Stripe.PaymentIntent = { ...canceled, amount_received: 1 };
    expect(qualify({ paymentIntent: canceled, latestCharge: undefined }).status).toBe('no_charge');
    expect(qualify({ paymentIntent: ambiguous, latestCharge: undefined }).status).toBe('unsupported');
    expect(
      isConclusiveNoCharge(
        { paymentIntent: canceled, latestCharge: { ...charge, amount_captured: 1 } },
        {
          customerId: 'cus_owned',
          customerBindingId: 'binding',
          grossMinor: 537,
          livemode: false,
          paymentIntentId: 'pi_paid',
          paymentMethodId: 'pm_card',
          providerLegId: 'leg',
          purchaseId: 'purchase',
        },
      ),
    ).toBe(false);
  });

  it('keeps succeeded payment pending without a source-confirmed acceptance time', () => {
    expect(
      qualifyManualPayment({
        offer,
        customerId: 'cus_owned',
        customerBindingId: 'binding',
        providerLegId: 'leg',
        purchaseId: 'purchase',
        paymentMethod: offer.paymentMethod,
        source: { paymentIntent: intent, latestCharge: charge },
      }),
    ).toEqual({ status: 'pending', reason: 'payment_acceptance_time_unknown' });
  });

  it('rejects mode, linkage, settlement, refund, and immutable-card mismatches', () => {
    expect(qualify({ paymentIntent: { ...intent, livemode: true }, latestCharge: charge }).status).toBe('unsupported');
    expect(
      qualify({
        paymentIntent: { ...intent, metadata: { ...intent.metadata, tau_provider_leg_id: 'other' } },
        latestCharge: charge,
      }).status,
    ).toBe('unsupported');
    expect(qualify({ paymentIntent: intent, latestCharge: { ...charge, payment_intent: 'pi_other' } }).status).toBe(
      'unsupported',
    );
    expect(
      qualify({ paymentIntent: intent, latestCharge: { ...charge, refunded: true, amount_refunded: 537 } }).status,
    ).toBe('unsupported');
    expect(qualify({ paymentIntent: intent, latestCharge: { ...charge, payment_method: 'pm_other' } }).status).toBe(
      'unsupported',
    );
  });

  it('allows a hosted replacement to qualify its own newly selected card', () => {
    const checkoutOffer: PaymentOfferSnapshot = {
      ...offer,
      taxMinor: null,
      grossMinor: null,
      maximumGrossMinor: null,
      taxBasis: 'stripe_checkout',
      paymentMethod: null,
    };
    const session = {
      id: 'cs_hosted',
      amount_subtotal: 537,
      amount_total: 537,
      automatic_tax: { enabled: true, status: 'complete' },
      client_reference_id: 'purchase',
      currency: 'usd',
      customer_details: { address: { country: 'US' } },
      customer: 'cus_owned',
      livemode: false,
      metadata: { tau_customer_binding_id: 'binding', tau_provider_leg_id: 'leg', tau_purchase_id: 'purchase' },
      mode: 'payment',
      payment_intent: 'pi_paid',
      payment_status: 'paid',
      status: 'complete',
      total_details: { amount_tax: 0 },
    } as unknown as Stripe.Checkout.Session;
    const hostedLine = {
      id: 'li_hosted',
      amount_subtotal: 537,
      amount_total: 537,
      currency: 'usd',
      quantity: 1,
      price: { product: 'prod_topup' },
    } as unknown as Stripe.LineItem;
    const result = qualifyManualPayment({
      offer: checkoutOffer,
      customerId: 'cus_owned',
      customerBindingId: 'binding',
      providerLegId: 'leg',
      purchaseId: 'purchase',
      paymentMethod: null,
      checkout: { session, lines: [hostedLine], complete: true },
      source: { paymentIntent: intent, latestCharge: { ...charge, payment_method: 'pm_new' } },
      sourceAcceptance: { type: 'payment_intent.succeeded', createdAt: new Date('2026-09-06T00:00:00.000Z') },
    });
    expect(result.status).toBe('paid');
    expect(
      qualifyManualPayment({
        offer: checkoutOffer,
        customerId: 'cus_owned',
        customerBindingId: 'binding',
        providerLegId: 'leg',
        purchaseId: 'purchase',
        paymentMethod: null,
        checkout: { session, lines: [hostedLine], complete: false },
        source: { paymentIntent: intent, latestCharge: charge },
        sourceAcceptance: { type: 'payment_intent.succeeded', createdAt: new Date('2026-09-06T00:00:00.000Z') },
      }),
    ).toEqual({ status: 'pending', reason: 'checkout_pagination_incomplete' });
  });
});

const monthlyOffer: PaymentOfferSnapshot = {
  ...offer,
  offerId: 'monthly',
  principalMinor: '2000',
  taxMinor: null,
  grossMinor: null,
  maximumGrossMinor: null,
  creditAtoms: '20000000',
  ceilingCreditAtoms: '40000000',
  stripePriceId: 'price_monthly',
  term: 'month',
  taxBasis: 'stripe_checkout',
  paymentMethod: null,
  stripeProductId: null,
};
const invoice = {
  id: 'in_paid',
  amount_due: 2000,
  amount_paid: 2000,
  amount_remaining: 0,
  currency: 'usd',
  customer: 'cus_owned',
  customer_address: { country: 'US' },
  automatic_tax: { enabled: true, status: 'complete' },
  livemode: false,
  parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_owned' } },
  status: 'paid',
  subtotal: 2000,
  total: 2000,
} as unknown as Stripe.Invoice;
const line = {
  id: 'il_month',
  amount: 2000,
  currency: 'usd',
  parent: { subscription_item_details: { proration: false, subscription: 'sub_owned', subscription_item: 'si_owned' } },
  period: { start: 1_788_650_000, end: 1_791_242_000 },
  pricing: { type: 'price_details', price_details: { price: 'price_monthly', product: 'prod_monthly' } },
  quantity: 1,
  subtotal: 2000,
} as unknown as Stripe.InvoiceLineItem;
const allocation = {
  id: 'inpay_paid',
  amount_paid: 2000,
  currency: 'usd',
  payment: { type: 'payment_intent', payment_intent: 'pi_invoice' },
  status: 'paid',
  status_transitions: { paid_at: 1_788_650_100 },
} as unknown as Stripe.InvoicePayment;
const invoiceIntent = {
  ...intent,
  id: 'pi_invoice',
  amount: 2000,
  amount_received: 2000,
  latest_charge: 'ch_invoice',
  metadata: {},
  payment_method: 'pm_invoice',
};
const invoiceCharge = {
  ...charge,
  id: 'ch_invoice',
  amount: 2000,
  amount_captured: 2000,
  payment_intent: 'pi_invoice',
  payment_method: 'pm_invoice',
};
const remoteSubscription = {
  id: 'sub_owned',
  customer: 'cus_owned',
  livemode: false,
  items: { data: [{ id: 'si_owned', price: { id: 'price_monthly' } }] },
} as unknown as Stripe.Subscription;

describe('subscription invoice source qualification', () => {
  const qualify = (overrides?: {
    readonly complete?: boolean;
    readonly invoice?: Stripe.Invoice;
    readonly lines?: readonly Stripe.InvoiceLineItem[];
    readonly payments?: readonly Stripe.InvoicePayment[];
    readonly paymentIntent?: Stripe.PaymentIntent;
    readonly latestCharge?: Stripe.Charge;
    readonly subscription?: Stripe.Subscription;
  }) =>
    qualifySubscriptionInvoice({
      offer: monthlyOffer,
      customerId: 'cus_owned',
      subscriptionId: 'sub_owned',
      subscription: overrides?.subscription ?? remoteSubscription,
      invoice: {
        invoice: overrides?.invoice ?? invoice,
        lines: overrides?.lines ?? [line],
        payments: overrides?.payments ?? [allocation],
        complete: overrides?.complete ?? true,
      },
      payment: {
        paymentIntent: overrides?.paymentIntent ?? invoiceIntent,
        latestCharge: overrides?.latestCharge ?? invoiceCharge,
      },
    });

  it('qualifies the complete subscription, invoice line, allocation, intent, and charge chain', () => {
    const result = qualify();
    expect(result.status).toBe('verified');
    if (result.status === 'verified') {
      expect(result.evidence.paidAt).toBe('2026-09-05T23:15:00.000Z');
    }
  });

  it('keeps incomplete pagination pending and rejects ownership, price, allocation, cash, and mode mismatches', () => {
    const { pricing } = line;
    const priceDetails = pricing?.price_details;
    if (pricing?.type !== 'price_details' || priceDetails === undefined) {
      throw new Error('Fixture line must have price details');
    }
    expect(qualify({ complete: false })).toEqual({ status: 'pending', reason: 'invoice_pagination_incomplete' });
    expect(qualify({ subscription: { ...remoteSubscription, customer: 'cus_other' } }).status).toBe('unsupported');
    expect(
      qualify({
        lines: [
          {
            ...line,
            pricing: {
              type: pricing.type,
              unit_amount_decimal: pricing.unit_amount_decimal,
              price_details: { ...priceDetails, price: 'price_other' },
            },
          },
        ],
      }).status,
    ).toBe('unsupported');
    expect(
      qualify({ payments: [{ ...allocation, payment: { type: 'payment_intent', payment_intent: 'pi_other' } }] })
        .status,
    ).toBe('unsupported');
    expect(qualify({ latestCharge: { ...invoiceCharge, amount_captured: 1999 } }).status).toBe('unsupported');
    expect(qualify({ paymentIntent: { ...invoiceIntent, livemode: true } }).status).toBe('unsupported');
  });

  it('does not fabricate a paid timestamp when the allocation lacks one', () => {
    expect(
      qualify({ payments: [{ ...allocation, status_transitions: { canceled_at: null, paid_at: null } }] }).status,
    ).toBe('unsupported');
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End Stripe provider response fixtures. */

describe('cash disposition time', () => {
  const paidAt = '2026-09-06T00:00:00.000Z';
  const effectiveAt = '2026-09-08T12:00:00.000Z';

  it('dates a loss at the correction movement and an untouched payment at its own acceptance', () => {
    expect(cashOccurredAt({ grossLossMinor: 0n }, paidAt).toISOString()).toBe(paidAt);
    expect(cashOccurredAt({ grossLossMinor: 537n, taxCorrectionEvidence: { effectiveAt } }, paidAt).toISOString()).toBe(
      effectiveAt,
    );
    expect(cashOccurredAt({ grossLossMinor: 0n, taxCorrectionEvidence: { effectiveAt } }, paidAt).toISOString()).toBe(
      effectiveAt,
    );
  });

  it('refuses a loss without a provider movement time and an unusable time', () => {
    expect(() => cashOccurredAt({ grossLossMinor: 537n }, paidAt)).toThrow('cash_effective_time_missing');
    expect(() => cashOccurredAt({ grossLossMinor: 0n }, 'not-a-time')).toThrow('cash_effective_time_invalid');
  });
});
