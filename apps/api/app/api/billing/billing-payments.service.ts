/* oxlint-disable curly, no-await-in-loop, unicorn/no-await-expression-member, typescript/consistent-type-assertions, typescript/no-unnecessary-condition -- sequential payment transitions and explicit provider guards are intentional */
/* eslint-disable @typescript-eslint/naming-convention, max-params-no-constructor/max-params-no-constructor -- provider field names and payment request boundaries are protocol-defined */
import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Stripe } from 'stripe';
import { wireAutoReloadConsentSchema, wirePaymentActionSchema } from '@taucad/billing';
import type { WireAutoReloadConsent, WireFinancialCase, WirePaymentAction } from '@taucad/billing';
import { qualifiedMeterContracts } from '#api/billing/billing-policy.js';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import type { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { BillingTaxService } from '#api/billing/billing-tax.service.js';
import type { QualifiedCashTaxCorrection } from '#api/billing/billing-tax.service.js';
import {
  cashOccurredAt,
  checkoutExpiryEvidenceSchema,
  exactPaymentOfferTotals,
  noChargeEvidenceSchema,
  paidPaymentEvidenceSchema,
  paymentOfferSnapshotSchema,
} from '#api/billing/billing-payment-contract.js';
import type { PaymentOfferSnapshot } from '#api/billing/billing-payment-contract.js';
import {
  cancelStripePaymentIntent,
  createStripeReloadTaxCalculationOnce,
  createStripeSetupCheckoutOnce,
  createStripeSubscriptionScheduleOnce,
  createStripeTaxTransactionOnce,
  dispatchStripeLegOnce,
  expireStripeCheckoutSession,
  fetchStripeCheckoutSource,
  fetchStripeInvoiceEvidence,
  fetchStripeTaxCalculationEvidence,
  fetchStripeTaxTransactionEvidence,
  isLoopbackBillingStripeClient,
  parseStripeCreateLeg,
  parseVerifiedStripeEvent,
  recoverStripeLegSource,
  retrieveStripePaymentEvidence,
  retrieveStripeBillingCustomer,
  retrieveStripeSetupEvidence,
  retrieveStripeSubscriptionSchedule,
  updateStripeSubscriptionScheduleOnce,
} from '#api/billing/billing-stripe.js';
import {
  isConclusiveNoCharge,
  qualifyManualPayment,
  qualifyReloadCustomerLocation,
  qualifyReloadSetup,
  qualifyReloadTaxCalculation,
  qualifySubscriptionInvoice,
} from '#api/billing/billing-payments.recovery.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { DatabaseService } from '#database/database.service.js';
import {
  billingOwnerBinding,
  billingPeriod,
  billingProviderLeg,
  billingPurchase,
  billingReloadConsent,
  billingReloadWork,
  billingRecoveryNotice,
  billingSubscriptionOffer,
  billingStripeCustomer,
  billingStripeSource,
  creditAccount,
  stripeEventInbox,
  subscription,
} from '#database/schema.js';

type Database = DatabaseService['database'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type ActionRequest = { readonly requestId: string; readonly returnPath: string };
type TopupRequest = ActionRequest & { readonly amountMinor: string; readonly method: 'saved_card' | 'checkout' };
type ReloadConsentRequest = ActionRequest & { readonly taxLocationRevision?: string };
export type SubscriptionOfferView = {
  readonly subscriptionId: string;
  readonly current: PaymentOfferSnapshot;
  readonly future?: {
    readonly effectivePeriodStart: string;
    readonly disclosedAt: string;
    readonly offer: PaymentOfferSnapshot;
    readonly state: 'prepared' | 'dispatched' | 'confirmed' | 'attention';
  };
};
export type PrepareRenewalOfferInput = {
  readonly environment: FinancialEnvironment;
  readonly accountId: string;
  readonly subscriptionId: string;
  readonly policyId: string;
  readonly effectivePeriodStart: Date;
  readonly disclosedAt: Date;
  readonly disclosureEvidence: Record<string, unknown>;
  readonly requestId: string;
};
type SourceClaim = {
  readonly id: string;
  readonly generation: bigint;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly environment: FinancialEnvironment;
  readonly stripeAccountId: string;
  readonly livemode: boolean;
  readonly sourceAcceptedAt?: Date;
  readonly hasFailureEvent: boolean;
  readonly inbox: Array<{ id: string; generation: bigint }>;
};
type CustomerIntent = {
  binding: typeof billingStripeCustomer.$inferSelect;
  dispatch: boolean;
  leg: typeof billingProviderLeg.$inferSelect | undefined;
};
type ProviderLegClaim = { readonly leg: typeof billingProviderLeg.$inferSelect; readonly leaseUntil: Date };

export type BillingPaymentsConfig = {
  readonly environment: FinancialEnvironment;
  readonly stripeAccountId: string;
  readonly livemode: boolean;
  readonly uiOrigin: string;
  readonly webhookSecret: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- null structurally disables collection
  readonly collection: null | {
    readonly kind: 'local_fixture' | 'stripe_test';
    readonly monthlyPriceId: string;
    readonly topupProductId: string;
  };
};

type Owner = { readonly ownerId: string; readonly accountId: string; readonly subjectId: string };

export type CashQualificationResult =
  | {
      readonly status: 'qualified';
      readonly sourceClaimId: string;
      readonly sourceGeneration: bigint;
      readonly projectionDigest: string;
      readonly principalLossMinor: bigint;
      readonly taxLossMinor: bigint;
      readonly grossLossMinor: bigint;
      readonly evidence: Record<string, unknown>;
      readonly taxCorrectionEvidence?: QualifiedCashTaxCorrection['taxCorrectionEvidence'];
    }
  | { readonly status: 'pending' | 'attention'; readonly reason: string };

type UnclaimedCashProjection = {
  readonly status: 'qualified';
  readonly evidence: unknown;
  readonly digest: string;
};

export type BillingCashQualification = {
  assertNewCollectionScope(accountId: string, transaction?: Transaction): Promise<void>;
  releaseQualifiedClaim(input: {
    readonly environment: FinancialEnvironment;
    readonly stripeAccountId: string;
    readonly livemode: boolean;
    readonly sourceClaimId: string;
    readonly sourceGeneration: bigint;
    readonly reason: string;
  }): Promise<void>;
  qualifyInitialPayment(input: {
    readonly environment: FinancialEnvironment;
    readonly accountId: string;
    readonly causeId: string;
    readonly source: 'plan' | 'purchased';
    readonly stripeAccountId: string;
    readonly livemode: boolean;
    readonly customerId: string;
    readonly paymentIntentId: string;
    readonly chargeId: string;
    readonly currency: string;
    readonly originalPrincipalMinor: bigint;
    readonly originalTaxMinor: bigint;
    readonly maximumRefundPages: number;
  }): Promise<CashQualificationResult | UnclaimedCashProjection>;
};

/** Detail rows for the renewal-failed notice, as display strings. Absent fields drop their row. */
const describeRenewalFailure = (
  invoice: Stripe.Invoice,
): { readonly amount?: string; readonly nextAttemptAt?: string } => ({
  ...(invoice.amount_due > 0
    ? {
        amount: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: invoice.currency.toUpperCase(),
        }).format(invoice.amount_due / 100),
      }
    : {}),
  ...(invoice.next_payment_attempt === null || invoice.next_payment_attempt === undefined
    ? {}
    : {
        nextAttemptAt: new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeZone: 'UTC' }).format(
          new Date(invoice.next_payment_attempt * 1000),
        ),
      }),
});

export type BillingRecoveryNoticeTransport = {
  deliver(input: {
    readonly kind: string;
    readonly payload: Record<string, unknown>;
    readonly dedupeKey: string;
  }): Promise<{ readonly receipt: string }>;
};

@Injectable()
export class BillingPaymentsService {
  public constructor(
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly stripe: Stripe,
    private readonly sourceStripe: Stripe,
    private readonly config: BillingPaymentsConfig,
    private readonly policy: BillingPolicyService,
    private readonly ledger: CreditLedgerService,
    private readonly cash: BillingCashQualification,
    private readonly noticeTransport?: BillingRecoveryNoticeTransport,
    private readonly tax = new BillingTaxService(databaseService),
  ) {}

  public assertMutationOrigin(origin: string | undefined): void {
    if (origin === undefined) throw new ForbiddenException('payment_origin_required');
    let actual: URL;
    let expected: URL;
    try {
      actual = new URL(origin);
      expected = new URL(this.config.uiOrigin);
    } catch {
      throw new ForbiddenException('payment_origin_invalid');
    }
    if (actual.origin !== expected.origin || actual.href !== actual.origin + '/')
      throw new ForbiddenException('payment_origin_mismatch');
  }

  public async prepareReloadConsent(userId: string, input: ReloadConsentRequest): Promise<WirePaymentAction> {
    this.assertCollectionEnabled();
    const owner = await this.ensureOwner(userId);
    const requestHash = digest(input);
    const replay = await this.databaseService.database
      .select()
      .from(billingReloadConsent)
      .where(
        and(eq(billingReloadConsent.accountId, owner.accountId), eq(billingReloadConsent.requestId, input.requestId)),
      )
      .limit(1);
    if (replay[0] !== undefined) {
      if (replay[0].requestHash !== requestHash) throw new ConflictException({ code: 'request_payload_conflict' });
      return this.reloadConsentAction(owner, replay[0]);
    }
    const effective = await this.policy.selectEffectivePolicy({
      environment: this.config.environment,
      replica: { schemaVersion: 1, meterContractIds: [...qualifiedMeterContracts.keys()] },
    });
    const controls = effective.policy.autoReload;
    const offer = effective.policy.offers.find((candidate) => candidate.kind === 'top_up');
    if (!controls?.enabled || offer === undefined || this.config.collection === null) {
      throw new ConflictException({ code: 'automatic_reload_unavailable' });
    }
    const binding = await this.ensureCustomer(owner);
    const customer = await retrieveStripeBillingCustomer(this.sourceStripe, binding.stripeCustomerId);
    const location = qualifyReloadCustomerLocation({
      accountId: owner.accountId,
      customerBindingId: binding.id,
      customerId: binding.stripeCustomerId,
      livemode: this.config.livemode,
      customer,
    });
    if (location === undefined) throw new ConflictException({ code: 'customer_tax_location_invalid' });
    if (input.taxLocationRevision !== undefined && input.taxLocationRevision !== location.revision) {
      throw new ConflictException({ code: 'tax_location_changed' });
    }
    const taxReference = `reload:${input.requestId}`;
    // The durable leg owns the single Tax Calculation POST; the consent record is written only afterwards.
    const calculationId = await this.claimReloadTaxCalculation({
      accountId: owner.accountId,
      customerBindingId: binding.id,
      customerId: binding.stripeCustomerId,
      reloadConsentId: null,
      requestId: `reload-consent-tax:${digest({
        accountId: owner.accountId,
        customerBindingId: binding.id,
        requestId: input.requestId,
        principalMinor: controls.principalMinor,
        locationRevision: location.revision,
      })}`,
      reference: taxReference,
      principalMinor: Number(controls.principalMinor),
      productId: this.config.collection.topupProductId,
      locationRevision: location.revision,
    });
    const taxSource = await fetchStripeTaxCalculationEvidence(this.sourceStripe, {
      calculationId,
      maximumLinePages: 10,
    });
    const qualified = qualifyReloadTaxCalculation({
      customerId: binding.stripeCustomerId,
      livemode: this.config.livemode,
      principalMinor: Number(controls.principalMinor),
      productId: this.config.collection.topupProductId,
      reference: taxReference,
      location,
      observedAt: new Date(),
      source: taxSource,
    });
    if (qualified.status !== 'qualified') throw new ConflictException({ code: qualified.reason });
    const snapshot = paymentOfferSnapshotSchema.parse({
      version: 'payment-offer-v1',
      policyId: effective.policyId,
      offerId: offer.offerId,
      environment: this.config.environment,
      accountId: owner.accountId,
      stripeAccountId: this.config.stripeAccountId,
      livemode: this.config.livemode,
      currency: 'usd',
      principalMinor: controls.principalMinor,
      taxMinor: String(qualified.taxMinor),
      grossMinor: String(qualified.grossMinor),
      maximumGrossMinor: String(qualified.grossMinor),
      creditAtoms: (BigInt(controls.principalMinor) * BigInt(offer.creditAtomsPerPrincipalMinor)).toString(),
      ceilingCreditAtoms: null,
      stripePriceId: null,
      stripeProductId: this.config.collection.topupProductId,
      quantity: 1,
      term: 'one_time',
      taxBasis: 'stripe_tax',
      paymentMethod: null,
    });
    const consentId = randomUUID();
    const taxEvidence = {
      version: 'stripe-reload-tax-v1',
      calculationId: qualified.calculationId,
      locationRevision: location.revision,
      sourceDigest: digest(taxSource),
      expiresAt: qualified.expiresAt.toISOString(),
    };
    await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, owner.accountId);
      const versions = await tx
        .select({ version: billingReloadConsent.version })
        .from(billingReloadConsent)
        .where(eq(billingReloadConsent.accountId, owner.accountId))
        .orderBy(desc(billingReloadConsent.version))
        .limit(1);
      const active = await tx
        .select({ id: billingReloadConsent.id })
        .from(billingReloadConsent)
        .where(
          and(
            eq(billingReloadConsent.accountId, owner.accountId),
            or(eq(billingReloadConsent.state, 'pending_setup'), eq(billingReloadConsent.state, 'enabled')),
          ),
        )
        .limit(1)
        .for('update');
      if (active[0] !== undefined) throw new ConflictException({ code: 'reload_consent_already_active' });
      await tx.insert(billingReloadConsent).values({
        id: consentId,
        accountId: owner.accountId,
        environment: this.config.environment,
        version: (versions[0]?.version ?? 0) + 1,
        requestId: input.requestId,
        requestHash,
        returnPath: input.returnPath,
        customerBindingId: binding.id,
        policyId: effective.policyId,
        termsDigest: digest({ snapshot, controls, taxEvidence }),
        offerSnapshot: snapshot,
        taxEvidence,
        currency: 'usd',
        principalMinor: BigInt(controls.principalMinor),
        quotedTaxMinor: BigInt(qualified.taxMinor),
        grossCeilingMinor: BigInt(qualified.grossMinor),
        thresholdAtoms: BigInt(controls.thresholdAtoms),
        monthlyGrossCapMinor: BigInt(controls.monthlyGrossCapMinor),
        minimumCadenceSeconds: controls.minimumCadenceSeconds,
        terminalFailureLimit: controls.terminalFailureLimit,
      });
    });
    return this.getReloadConsentAction(owner, consentId);
  }

  public async prepareTopup(userId: string, input: TopupRequest): Promise<WirePaymentAction> {
    this.assertCollectionEnabled();
    const owner = await this.ensureOwner(userId);
    const purpose = input.method === 'saved_card' ? 'manual_saved_card' : 'manual_checkout';
    const requestHash = digest(input);
    const replay = await this.databaseService.database
      .select()
      .from(billingPurchase)
      .where(
        and(
          eq(billingPurchase.accountId, owner.accountId),
          eq(billingPurchase.purpose, purpose),
          eq(billingPurchase.requestId, input.requestId),
        ),
      )
      .limit(1);
    if (replay[0] !== undefined) {
      if (replay[0].requestHash !== requestHash) throw new ConflictException({ code: 'request_payload_conflict' });
      return this.purchaseToWire(owner, replay[0]);
    }
    const pending = await this.findActivePurchase(owner.accountId);
    if (pending !== undefined)
      throw new ConflictException({
        code: 'action_already_pending',
        action: await this.purchaseToWire(owner, pending),
      });
    const effective = await this.policy.selectEffectivePolicy({
      environment: this.config.environment,
      replica: { schemaVersion: 1, meterContractIds: [...qualifiedMeterContracts.keys()] },
    });
    const offer = effective.policy.offers.find((candidate) => candidate.kind === 'top_up');
    if (offer === undefined) throw new Error('Top-up offer is unavailable');
    const principal = BigInt(input.amountMinor);
    if (principal < BigInt(offer.minimumPrincipalMinor) || principal > BigInt(offer.maximumPrincipalMinor)) {
      throw new ConflictException({ code: 'topup_amount_out_of_range' });
    }
    const binding = await this.ensureCustomer(owner);
    const paymentMethod =
      input.method === 'saved_card' ? await this.selectOwnedDefaultCard(binding.stripeCustomerId) : null;
    const savedCardTax =
      input.method === 'saved_card'
        ? await this.quoteSavedCardTax({
            accountId: owner.accountId,
            customerBindingId: binding.id,
            customerId: binding.stripeCustomerId,
            principalMinor: Number(principal),
            productId: this.config.collection?.topupProductId ?? '',
            requestId: input.requestId,
          })
        : undefined;
    const snapshot = paymentOfferSnapshotSchema.parse({
      version: 'payment-offer-v1',
      policyId: effective.policyId,
      offerId: offer.offerId,
      environment: this.config.environment,
      accountId: owner.accountId,
      stripeAccountId: this.config.stripeAccountId,
      livemode: this.config.livemode,
      currency: 'usd',
      principalMinor: principal.toString(),
      taxMinor: savedCardTax === undefined ? null : String(savedCardTax.taxMinor),
      grossMinor: savedCardTax === undefined ? null : String(savedCardTax.grossMinor),
      maximumGrossMinor: savedCardTax === undefined ? null : String(savedCardTax.grossMinor),
      creditAtoms: (principal * BigInt(offer.creditAtomsPerPrincipalMinor)).toString(),
      ceilingCreditAtoms: null,
      stripePriceId: null,
      stripeProductId: this.config.collection?.topupProductId ?? null,
      quantity: 1,
      term: 'one_time',
      taxBasis: savedCardTax === undefined ? 'stripe_checkout' : 'stripe_tax',
      paymentMethod,
    });
    const actionId = randomUUID();
    const legId = randomUUID();
    const providerRequest = this.manualProviderRequest(
      actionId,
      legId,
      binding.id,
      binding.stripeCustomerId,
      snapshot,
      input,
    );
    await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, owner.accountId);
      await this.cash.assertNewCollectionScope(owner.accountId, tx);
      const active = await tx
        .select({ id: billingPurchase.id })
        .from(billingPurchase)
        .where(
          and(
            eq(billingPurchase.accountId, owner.accountId),
            or(
              eq(billingPurchase.state, 'prepared'),
              eq(billingPurchase.state, 'creating'),
              eq(billingPurchase.state, 'pending'),
              eq(billingPurchase.state, 'attention'),
              eq(billingPurchase.state, 'paid_unfulfilled'),
            ),
          ),
        )
        .limit(1);
      if (active[0] !== undefined) return;
      const inserted = await tx
        .insert(billingPurchase)
        .values({
          id: actionId,
          accountId: owner.accountId,
          sourceIdentity: `purchase:${actionId}`,
          offerSnapshot: snapshot,
          creditAtoms: BigInt(snapshot.creditAtoms),
          state: 'prepared',
          customerBindingId: binding.id,
          requestId: input.requestId,
          requestHash,
          purpose,
          taxEvidence: savedCardTax?.evidence,
          returnPath: input.returnPath,
          stripeAccountId: this.config.stripeAccountId,
          livemode: this.config.livemode,
        })
        .onConflictDoNothing()
        .returning({ id: billingPurchase.id });
      if (inserted[0] === undefined) return;
      await tx.insert(billingProviderLeg).values({
        id: legId,
        accountId: owner.accountId,
        environment: this.config.environment,
        customerBindingId: binding.id,
        purchaseId: actionId,
        kind: input.method === 'saved_card' ? 'payment_intent' : 'checkout_payment',
        requestId: input.requestId,
        requestHash: digest(providerRequest),
        request: providerRequest,
        idempotencyKey: `tau:${legId}`,
        nextAttemptAt: new Date(),
      });
    });
    return this.getAction(userId, actionId).catch(async () => {
      const concurrent = await this.findOwnedPurchaseByRequest(owner.accountId, purpose, input.requestId);
      if (concurrent !== undefined) return this.purchaseToWire(owner, concurrent);
      const current = await this.findActivePurchase(owner.accountId);
      if (current !== undefined)
        throw new ConflictException({
          code: 'action_already_pending',
          action: await this.purchaseToWire(owner, current),
        });
      throw new ConflictException({ code: 'payment_action_conflict' });
    });
  }

  public async confirmAction(userId: string, actionId: string): Promise<WirePaymentAction> {
    this.assertCollectionEnabled();
    const owner = await this.resolveOwner(userId);
    const consent = await this.databaseService.database
      .select()
      .from(billingReloadConsent)
      .where(and(eq(billingReloadConsent.id, actionId), eq(billingReloadConsent.accountId, owner.accountId)))
      .limit(1);
    if (consent[0] !== undefined) return this.confirmReloadConsent(owner, consent[0]);
    const claimed = await this.claimPurchaseLeg(owner.accountId, actionId);
    if (claimed !== undefined) {
      const result = await dispatchStripeLegOnce(this.stripe, claimed.leg);
      await this.databaseService.database.transaction(async (tx) => {
        await this.lockPaymentAccount(tx, owner.accountId);
        const purchases = await tx
          .select({ state: billingPurchase.state })
          .from(billingPurchase)
          .where(and(eq(billingPurchase.id, actionId), eq(billingPurchase.accountId, owner.accountId)))
          .for('update');
        const activeLeg = await tx
          .select({ id: billingProviderLeg.id })
          .from(billingProviderLeg)
          .where(
            and(
              eq(billingProviderLeg.id, claimed.id),
              eq(billingProviderLeg.accountId, owner.accountId),
              eq(billingProviderLeg.purchaseId, actionId),
              eq(billingProviderLeg.state, 'dispatched'),
              isNull(billingProviderLeg.providerObjectId),
            ),
          )
          .for('update');
        if (purchases[0]?.state !== 'creating' || activeLeg[0] === undefined)
          throw new ConflictException({ code: 'stale_payment_confirmation' });
        await tx
          .update(billingProviderLeg)
          .set({
            providerObjectId: result.object.id,
            redirectUrl: result.kind === 'checkout' ? result.object.url : null,
            state: 'known',
            errorCode: null,
          })
          .where(and(eq(billingProviderLeg.id, claimed.id), isNull(billingProviderLeg.providerObjectId)));
        await tx
          .update(billingPurchase)
          .set({ state: result.kind === 'checkout' ? 'pending' : 'pending', updatedAt: new Date() })
          .where(
            and(
              eq(billingPurchase.id, actionId),
              eq(billingPurchase.accountId, owner.accountId),
              eq(billingPurchase.state, 'creating'),
            ),
          );
      });
      if (result.kind === 'payment_intent')
        await this.reconcilePurchase(owner.accountId, actionId, result.object.id, undefined, {
          providerLegId: claimed.id,
          customerBindingId: claimed.customerBindingId,
          expectedPaymentMethodId: claimed.expectedPaymentMethodId,
        });
    }
    return this.getAction(userId, actionId);
  }

  public async getReloadConsent(userId: string): Promise<WireAutoReloadConsent | undefined> {
    const owner = await this.resolveOwner(userId);
    const rows = await this.databaseService.database
      .select()
      .from(billingReloadConsent)
      .where(eq(billingReloadConsent.accountId, owner.accountId))
      .orderBy(desc(billingReloadConsent.version))
      .limit(1);
    return rows[0] === undefined ? undefined : this.reloadConsentToWire(owner, rows[0]);
  }

  public async revokeReloadConsent(userId: string, consentId: string): Promise<WireAutoReloadConsent> {
    const owner = await this.resolveOwner(userId);
    const rows = await this.databaseService.database
      .update(billingReloadConsent)
      .set({ state: 'revoked', updatedAt: new Date() })
      .where(
        and(
          eq(billingReloadConsent.id, consentId),
          eq(billingReloadConsent.accountId, owner.accountId),
          or(
            eq(billingReloadConsent.state, 'pending_setup'),
            eq(billingReloadConsent.state, 'enabled'),
            eq(billingReloadConsent.state, 'paused_terms'),
            eq(billingReloadConsent.state, 'disabled_failures'),
          ),
        ),
      )
      .returning();
    const current = rows[0] ?? (await this.ownedReloadConsent(owner.accountId, consentId));
    return this.reloadConsentToWire(owner, current);
  }

  public async prepareRenewalOffer(input: PrepareRenewalOfferInput): Promise<SubscriptionOfferView['future']> {
    if (input.environment !== this.config.environment || input.disclosedAt > input.effectivePeriodStart) {
      throw new ConflictException({ code: 'renewal_offer_scope' });
    }
    const effective = await this.policy.selectEffectivePolicy({
      environment: input.environment,
      replica: { schemaVersion: 1, meterContractIds: [...qualifiedMeterContracts.keys()] },
    });
    if (effective.policyId !== input.policyId) throw new ConflictException({ code: 'renewal_policy_not_approved' });
    const offer = effective.policy.offers.find((candidate) => candidate.kind === 'pro_monthly');
    const [owned] = await this.databaseService.database
      .select()
      .from(subscription)
      .where(
        and(
          eq(subscription.id, input.subscriptionId),
          eq(subscription.accountId, input.accountId),
          eq(subscription.environment, input.environment),
        ),
      )
      .limit(1);
    if (
      offer === undefined ||
      owned?.stripeSubscriptionId === null ||
      owned?.stripeSubscriptionId === undefined ||
      owned.customerBindingId === null ||
      owned.offerSnapshot === null
    )
      throw new ConflictException({ code: 'renewal_source_missing' });
    await this.assertOpenCollectionScope(input.accountId);
    const current = paymentOfferSnapshotSchema.parse(owned.offerSnapshot);
    const customer = await this.ownedCustomer(input.accountId, owned.customerBindingId);
    const remote = await this.sourceStripe.subscriptions.retrieve(owned.stripeSubscriptionId);
    const item = remote.items.data.length === 1 ? remote.items.data[0] : undefined;
    if (item === undefined || item.current_period_end * 1000 !== input.effectivePeriodStart.getTime()) {
      throw new ConflictException({ code: 'renewal_boundary_mismatch' });
    }
    // The disclosed boundary alone is not lineage: bind the owned Customer, scope, item and current price.
    const [priorItem] = await this.databaseService.database
      .select({ id: billingSubscriptionOffer.stripeSubscriptionItemId })
      .from(billingSubscriptionOffer)
      .where(
        and(
          eq(billingSubscriptionOffer.subscriptionId, input.subscriptionId),
          eq(billingSubscriptionOffer.accountId, input.accountId),
        ),
      )
      .orderBy(desc(billingSubscriptionOffer.effectivePeriodStart))
      .limit(1);
    if (
      remote.id !== owned.stripeSubscriptionId ||
      remote.livemode !== this.config.livemode ||
      stripeObjectId(remote.customer) !== customer.stripeCustomerId ||
      stripeObjectId(item.price) !== current.stripePriceId ||
      (priorItem !== undefined && priorItem.id !== item.id)
    ) {
      throw new ConflictException({ code: 'renewal_source_tuple_mismatch' });
    }
    const snapshot = paymentOfferSnapshotSchema.parse({
      ...current,
      policyId: effective.policyId,
      offerId: offer.offerId,
      principalMinor: offer.principalMinor,
      taxMinor: null,
      grossMinor: null,
      maximumGrossMinor: null,
      creditAtoms: offer.grantCreditAtoms,
      ceilingCreditAtoms: offer.ceilingCreditAtoms,
      stripePriceId: this.config.collection?.monthlyPriceId ?? null,
      stripeProductId: null,
      taxBasis: 'stripe_checkout',
      paymentMethod: null,
    });
    const id = randomUUID();
    const evidence = {
      requestId: input.requestId,
      disclosureEvidence: input.disclosureEvidence,
      source: {
        stripeAccountId: this.config.stripeAccountId,
        livemode: remote.livemode,
        customerId: customer.stripeCustomerId,
        subscriptionId: remote.id,
        subscriptionItemId: item.id,
        currentPriceId: current.stripePriceId,
      },
    };
    await this.databaseService.database.transaction(async (tx) => {
      await this.assertOpenCollectionScope(input.accountId, tx);
      await tx.insert(billingSubscriptionOffer).values({
        id,
        accountId: input.accountId,
        environment: input.environment,
        subscriptionId: input.subscriptionId,
        effectivePeriodStart: input.effectivePeriodStart,
        disclosedAt: input.disclosedAt,
        policyId: input.policyId,
        offerSnapshot: snapshot,
        termsDigest: digest({ snapshot, ...evidence }),
        sourceEvidence: evidence,
        stripePriceId: snapshot.stripePriceId ?? '',
        stripeProductId: snapshot.stripeProductId ?? '',
        stripeSubscriptionItemId: item.id,
      });
    });
    return {
      effectivePeriodStart: input.effectivePeriodStart.toISOString(),
      disclosedAt: input.disclosedAt.toISOString(),
      offer: snapshot,
      state: 'prepared',
    };
  }

  public async recoverRenewalOffers(input: {
    readonly environment: FinancialEnvironment;
    readonly limit: number;
  }): Promise<{ processed: string[]; pending: string[]; failed: string[] }> {
    if (input.environment !== this.config.environment || input.limit < 1 || input.limit > 100)
      throw new RangeError('Invalid renewal scope');
    const rows = await this.databaseService.database
      .select()
      .from(billingSubscriptionOffer)
      .where(
        and(
          eq(billingSubscriptionOffer.environment, input.environment),
          ne(billingSubscriptionOffer.state, 'confirmed'),
        ),
      )
      .orderBy(asc(billingSubscriptionOffer.createdAt))
      .limit(input.limit);
    const result = { processed: [] as string[], pending: [] as string[], failed: [] as string[] };
    for (const row of rows) {
      try {
        const [owned] = await this.databaseService.database
          .select()
          .from(subscription)
          .where(and(eq(subscription.id, row.subscriptionId), eq(subscription.accountId, row.accountId)))
          .limit(1);
        if (owned?.stripeSubscriptionId === null || owned?.stripeSubscriptionId === undefined)
          throw new Error('Renewal subscription missing');
        const remote = await this.sourceStripe.subscriptions.retrieve(owned.stripeSubscriptionId);
        const existingScheduleId =
          row.stripeScheduleId ?? (typeof remote.schedule === 'string' ? remote.schedule : remote.schedule?.id);
        const createRequest = { subscriptionId: owned.stripeSubscriptionId };
        const createClaim = await this.claimRenewalLeg(
          row,
          owned.customerBindingId ?? '',
          'subscription_schedule',
          createRequest,
        );
        let scheduleId = existingScheduleId ?? createClaim.providerObjectId ?? undefined;
        if (scheduleId === undefined && createClaim.mayDispatch) {
          const created = await createStripeSubscriptionScheduleOnce(this.stripe, {
            subscriptionId: owned.stripeSubscriptionId,
            idempotencyKey: createClaim.idempotencyKey,
          });
          scheduleId = created.id;
        }
        if (scheduleId === undefined) throw new ConflictException({ code: 'renewal_schedule_outcome_unknown' });
        await this.finishRenewalLeg(createClaim, scheduleId);
        const sourceSchedule = await retrieveStripeSubscriptionSchedule(this.sourceStripe, scheduleId);
        const current = paymentOfferSnapshotSchema.parse(owned.offerSnapshot);
        const updateRequest = {
          scheduleId,
          subscriptionOfferId: row.id,
          currentStart: remote.items.data[0]?.current_period_start ?? 0,
          effectivePeriodStart: Math.floor(row.effectivePeriodStart.getTime() / 1000),
          currentPriceId: current.stripePriceId ?? '',
          futurePriceId: row.stripePriceId,
        };
        const updateClaim = await this.claimRenewalLeg(
          row,
          owned.customerBindingId ?? '',
          'subscription_update',
          updateRequest,
        );
        if (updateClaim.mayDispatch) {
          await updateStripeSubscriptionScheduleOnce(this.stripe, {
            ...updateRequest,
            sourceSchedule,
            idempotencyKey: updateClaim.idempotencyKey,
          });
          await this.finishRenewalLeg(updateClaim, scheduleId);
        }
        const source = await retrieveStripeSubscriptionSchedule(this.sourceStripe, scheduleId);
        const futurePhase = source.phases.find(
          (phase) => phase.start_date === Math.floor(row.effectivePeriodStart.getTime() / 1000),
        );
        if (
          source.id !== scheduleId ||
          source.subscription !== owned.stripeSubscriptionId ||
          source.metadata?.['tau_subscription_offer_id'] !== row.id ||
          futurePhase?.items.length !== 1 ||
          futurePhase.items[0]?.price !== row.stripePriceId ||
          futurePhase.items[0]?.quantity !== 1
        ) {
          throw new Error('Renewal schedule qualification failed');
        }
        await this.databaseService.database
          .update(billingSubscriptionOffer)
          .set({
            stripeScheduleId: scheduleId,
            scheduleEvidence: { scheduleId: source.id, status: source.status, digest: digest(source) },
            state: 'confirmed',
            errorCode: null,
          })
          .where(and(eq(billingSubscriptionOffer.id, row.id), ne(billingSubscriptionOffer.state, 'confirmed')));
        result.processed.push(row.id);
      } catch {
        result.failed.push(row.id);
      }
    }
    return result;
  }

  public async getSubscriptionOffer(userId: string, subscriptionId: string): Promise<SubscriptionOfferView> {
    const owner = await this.resolveOwner(userId);
    const owned = await this.databaseService.database
      .select()
      .from(subscription)
      .where(and(eq(subscription.id, subscriptionId), eq(subscription.accountId, owner.accountId)))
      .limit(1);
    if (owned[0] === undefined) throw new NotFoundException('Subscription not found');
    const current = paymentOfferSnapshotSchema.parse(owned[0].offerSnapshot);
    const future = await this.databaseService.database
      .select()
      .from(billingSubscriptionOffer)
      .where(
        and(
          eq(billingSubscriptionOffer.subscriptionId, subscriptionId),
          eq(billingSubscriptionOffer.accountId, owner.accountId),
        ),
      )
      .orderBy(desc(billingSubscriptionOffer.effectivePeriodStart))
      .limit(1);
    return {
      subscriptionId,
      current,
      ...(future[0] === undefined
        ? {}
        : {
            future: {
              effectivePeriodStart: future[0].effectivePeriodStart.toISOString(),
              disclosedAt: future[0].disclosedAt.toISOString(),
              offer: paymentOfferSnapshotSchema.parse(future[0].offerSnapshot),
              state: subscriptionOfferState(future[0].state),
            },
          }),
    };
  }

  public async cancelAction(userId: string, actionId: string): Promise<WirePaymentAction> {
    const owner = await this.resolveOwner(userId);
    const changed = await this.databaseService.database.transaction(async (tx) => {
      const rows = await tx
        .update(billingPurchase)
        .set({ state: 'canceled', updatedAt: new Date() })
        .where(
          and(
            eq(billingPurchase.id, actionId),
            eq(billingPurchase.accountId, owner.accountId),
            eq(billingPurchase.state, 'prepared'),
          ),
        )
        .returning({ id: billingPurchase.id });
      return rows[0] !== undefined;
    });
    if (!changed) {
      const current = await this.ownedPurchase(owner.accountId, actionId);
      if (current.state !== 'canceled') throw new ConflictException({ code: 'action_not_cancelable' });
    }
    return this.getAction(userId, actionId);
  }

  public async recoverAction(userId: string, actionId: string): Promise<WirePaymentAction> {
    this.assertCollectionEnabled();
    const owner = await this.resolveOwner(userId);
    const purchase = await this.ownedPurchase(owner.accountId, actionId);
    if (purchase.state !== 'attention') throw new ConflictException({ code: 'action_not_recoverable' });
    const legs = await this.databaseService.database
      .select()
      .from(billingProviderLeg)
      .where(and(eq(billingProviderLeg.purchaseId, actionId), ne(billingProviderLeg.state, 'no_charge')))
      .limit(1);
    const original = legs[0];
    if (
      original?.kind !== 'payment_intent' ||
      original.providerObjectId === null ||
      original.errorCode !== 'authentication_required'
    )
      throw new ConflictException({ code: 'action_not_recoverable' });
    const binding = await this.databaseService.database
      .select()
      .from(billingStripeCustomer)
      .where(eq(billingStripeCustomer.id, original.customerBindingId))
      .limit(1);
    if (binding[0]?.stripeCustomerId === null || binding[0]?.stripeCustomerId === undefined)
      throw new Error('Customer binding is incomplete');
    const offer = paymentOfferSnapshotSchema.parse(purchase.offerSnapshot);
    const cancellationKey = `${original.id}:cancel`;
    if (original.cancellationRequestedAt === null) {
      const claimed = await this.databaseService.database
        .update(billingProviderLeg)
        .set({ cancellationRequestedAt: new Date() })
        .where(and(eq(billingProviderLeg.id, original.id), isNull(billingProviderLeg.cancellationRequestedAt)))
        .returning({ id: billingProviderLeg.id });
      if (claimed[0] !== undefined)
        await cancelStripePaymentIntent(this.stripe, {
          paymentIntentId: original.providerObjectId,
          idempotencyKey: cancellationKey,
        });
    }
    const cancellationEvidence = await retrieveStripePaymentEvidence(this.sourceStripe, original.providerObjectId);
    if (
      !isConclusiveNoCharge(cancellationEvidence, {
        customerId: binding[0].stripeCustomerId,
        customerBindingId: original.customerBindingId,
        grossMinor: Number(exactPaymentOfferTotals(offer).grossMinor),
        livemode: offer.livemode,
        paymentIntentId: original.providerObjectId,
        paymentMethodId: paymentMethodId(original.request),
        providerLegId: original.id,
        purchaseId: purchase.id,
      })
    ) {
      await this.databaseService.database
        .update(billingProviderLeg)
        .set({ state: 'attention', errorCode: 'cancellation_not_conclusive' })
        .where(eq(billingProviderLeg.id, original.id));
      return this.purchaseToWire(owner, purchase);
    }
    const noChargeEvidence = noChargeEvidenceSchema.parse({
      version: 'stripe-no-charge-v1',
      status: 'canceled',
      paymentIntentId: cancellationEvidence.paymentIntent.id,
      customerId: binding[0].stripeCustomerId,
      stripeAccountId: offer.stripeAccountId,
      livemode: offer.livemode,
      amountReceived: '0',
      amountCapturable: '0',
      chargeId: cancellationEvidence.latestCharge?.id ?? null,
      amountCaptured: '0',
      sourceDigest: digest({
        paymentIntentId: cancellationEvidence.paymentIntent.id,
        customerId: binding[0].stripeCustomerId,
        amountReceived: cancellationEvidence.paymentIntent.amount_received,
        amountCapturable: cancellationEvidence.paymentIntent.amount_capturable,
        chargeId: cancellationEvidence.latestCharge?.id ?? null,
        amountCaptured: cancellationEvidence.latestCharge?.amount_captured ?? 0,
      }),
      observedAt: new Date().toISOString(),
    });
    const replacementId = randomUUID();
    if (purchase.returnPath === null) throw new Error('Payment recovery return path is missing');
    if (offer.stripeProductId === null) throw new Error('Payment recovery product is missing');
    const returnUrl = this.returnUrl(purchase.returnPath, actionId);
    const metadata = {
      tau_purchase_id: actionId,
      tau_provider_leg_id: replacementId,
      tau_customer_binding_id: original.customerBindingId,
    };
    const request: Record<string, unknown> = {
      mode: 'payment',
      customer: binding[0].stripeCustomerId,
      client_reference_id: actionId,
      success_url: returnUrl,
      cancel_url: returnUrl,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product: offer.stripeProductId,
            tax_behavior: 'exclusive',
            unit_amount: Number(offer.principalMinor),
          },
          quantity: 1,
        },
      ],
      metadata,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      payment_method_types: ['card'],
      payment_intent_data: { metadata, setup_future_usage: 'on_session' },
      tax_id_collection: { enabled: true },
    };
    const replacementWon = await this.databaseService.database.transaction(async (tx) => {
      const closed = await tx
        .update(billingProviderLeg)
        .set({ state: 'no_charge', cancellationConfirmedAt: new Date(), noChargeEvidence, errorCode: null })
        .where(
          and(
            eq(billingProviderLeg.id, original.id),
            eq(billingProviderLeg.providerObjectId, cancellationEvidence.paymentIntent.id),
            isNull(billingProviderLeg.noChargeEvidence),
            or(eq(billingProviderLeg.state, 'known'), eq(billingProviderLeg.state, 'attention')),
          ),
        )
        .returning({ id: billingProviderLeg.id });
      if (closed[0] === undefined) return false;
      await tx.insert(billingProviderLeg).values({
        id: replacementId,
        accountId: owner.accountId,
        environment: this.config.environment,
        customerBindingId: original.customerBindingId,
        purchaseId: actionId,
        kind: 'checkout_payment',
        requestId: `${purchase.requestId}:hosted`,
        requestHash: digest(request),
        request,
        idempotencyKey: `tau:${replacementId}`,
        state: 'dispatched',
        dispatchStartedAt: new Date(),
        nextAttemptAt: new Date(),
      });
      await tx
        .update(billingPurchase)
        .set({ state: 'creating', updatedAt: new Date() })
        .where(and(eq(billingPurchase.id, actionId), eq(billingPurchase.state, 'attention')));
      return true;
    });
    if (!replacementWon) return this.purchaseToWire(owner, await this.ownedPurchase(owner.accountId, actionId));
    const result = await dispatchStripeLegOnce(
      this.stripe,
      parseStripeCreateLeg({
        kind: 'checkout',
        idempotencyKey: `tau:${replacementId}`,
        request,
        checkoutContract: {
          kind: 'top_up',
          productId: offer.stripeProductId,
          principalMinor: Number(offer.principalMinor),
        },
        onSessionSaveConsent: true,
      }),
    );
    if (result.kind !== 'checkout') throw new Error('Unexpected recovery Checkout result');
    await this.databaseService.database.transaction(async (tx) => {
      await tx
        .update(billingProviderLeg)
        .set({ state: 'known', providerObjectId: result.object.id, redirectUrl: result.object.url })
        .where(eq(billingProviderLeg.id, replacementId));
      await tx
        .update(billingPurchase)
        .set({ state: 'pending', updatedAt: new Date() })
        .where(eq(billingPurchase.id, actionId));
    });
    return this.purchaseToWire(owner, await this.ownedPurchase(owner.accountId, actionId));
  }

  public async prepareSubscription(userId: string, input: ActionRequest): Promise<WirePaymentAction> {
    this.assertCollectionEnabled();
    const owner = await this.ensureOwner(userId);
    const requestHash = digest(input);
    const replay = await this.databaseService.database
      .select()
      .from(subscription)
      .where(and(eq(subscription.accountId, owner.accountId), eq(subscription.requestId, input.requestId)))
      .limit(1);
    if (replay[0] !== undefined) {
      if (replay[0].requestHash !== requestHash) throw new ConflictException({ code: 'request_payload_conflict' });
      return this.subscriptionToWire(owner, replay[0]);
    }
    const effective = await this.policy.selectEffectivePolicy({
      environment: this.config.environment,
      replica: { schemaVersion: 1, meterContractIds: [...qualifiedMeterContracts.keys()] },
    });
    const offer = effective.policy.offers.find((candidate) => candidate.kind === 'pro_monthly');
    if (offer === undefined) throw new Error('Monthly offer is unavailable');
    const binding = await this.ensureCustomer(owner);
    const snapshot = paymentOfferSnapshotSchema.parse({
      version: 'payment-offer-v1',
      policyId: effective.policyId,
      offerId: offer.offerId,
      environment: this.config.environment,
      accountId: owner.accountId,
      stripeAccountId: this.config.stripeAccountId,
      livemode: this.config.livemode,
      currency: 'usd',
      principalMinor: offer.principalMinor,
      taxMinor: null,
      grossMinor: null,
      maximumGrossMinor: null,
      creditAtoms: offer.grantCreditAtoms,
      ceilingCreditAtoms: offer.ceilingCreditAtoms,
      stripePriceId: this.config.collection?.monthlyPriceId ?? null,
      stripeProductId: null,
      quantity: 1,
      term: 'month',
      taxBasis: 'stripe_checkout',
      paymentMethod: null,
    });
    const active = await this.databaseService.database
      .select()
      .from(subscription)
      .where(
        and(
          eq(subscription.accountId, owner.accountId),
          or(
            eq(subscription.slotState, 'pending'),
            eq(subscription.slotState, 'current'),
            eq(subscription.slotState, 'attention'),
          ),
        ),
      )
      .limit(1);
    if (active[0] !== undefined) {
      if (active[0].slotState === 'current') throw new ConflictException({ code: 'subscription_already_exists' });
      throw new ConflictException({
        code: 'action_already_pending',
        action: await this.subscriptionToWire(owner, active[0]),
      });
    }
    const actionId = randomUUID();
    const legId = randomUUID();
    const returnUrl = this.returnUrl(input.returnPath, actionId);
    if (snapshot.stripePriceId === null) throw new Error('Subscription price is missing');
    const request: Record<string, unknown> = {
      mode: 'subscription',
      customer: binding.stripeCustomerId,
      client_reference_id: actionId,
      success_url: returnUrl,
      cancel_url: returnUrl,
      line_items: [{ price: snapshot.stripePriceId, quantity: 1 }],
      metadata: { tau_subscription_id: actionId },
      subscription_data: { metadata: { tau_subscription_id: actionId } },
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      tax_id_collection: { enabled: true },
    };
    const won = await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, owner.accountId);
      await this.cash.assertNewCollectionScope(owner.accountId, tx);
      const inserted = await tx
        .insert(subscription)
        .values({
          id: actionId,
          plan: 'pro',
          referenceId: `financial:${actionId}`,
          accountId: owner.accountId,
          environment: this.config.environment,
          customerBindingId: binding.id,
          requestId: input.requestId,
          requestHash,
          offerSnapshot: snapshot,
          slotState: 'pending',
          status: 'incomplete',
        })
        .onConflictDoNothing()
        .returning({ id: subscription.id });
      if (inserted[0] === undefined) return false;
      await tx.insert(billingProviderLeg).values({
        id: legId,
        accountId: owner.accountId,
        environment: this.config.environment,
        customerBindingId: binding.id,
        subscriptionId: actionId,
        kind: 'checkout_subscription',
        requestId: input.requestId,
        requestHash: digest(request),
        request,
        idempotencyKey: `tau:${legId}`,
        state: 'dispatched',
        dispatchStartedAt: new Date(),
        nextAttemptAt: new Date(),
      });
      return true;
    });
    if (!won) {
      const concurrent = await this.databaseService.database
        .select()
        .from(subscription)
        .where(and(eq(subscription.accountId, owner.accountId), eq(subscription.requestId, input.requestId)))
        .limit(1);
      if (concurrent[0]?.requestHash === requestHash) return this.subscriptionToWire(owner, concurrent[0]);
      if (concurrent[0] !== undefined) throw new ConflictException({ code: 'request_payload_conflict' });
      const winner = await this.databaseService.database
        .select()
        .from(subscription)
        .where(
          and(
            eq(subscription.accountId, owner.accountId),
            or(
              eq(subscription.slotState, 'pending'),
              eq(subscription.slotState, 'current'),
              eq(subscription.slotState, 'attention'),
            ),
          ),
        )
        .limit(1);
      if (winner[0] !== undefined && winner[0].slotState !== 'current')
        throw new ConflictException({
          code: 'action_already_pending',
          action: await this.subscriptionToWire(owner, winner[0]),
        });
      throw new ConflictException({ code: 'subscription_already_exists' });
    }
    const result = await dispatchStripeLegOnce(
      this.stripe,
      parseStripeCreateLeg({
        kind: 'checkout',
        idempotencyKey: `tau:${legId}`,
        request,
        checkoutContract: { kind: 'subscription', priceId: snapshot.stripePriceId },
      }),
    );
    if (result.kind !== 'checkout') throw new Error('Unexpected subscription Checkout result');
    await this.databaseService.database
      .update(billingProviderLeg)
      .set({ providerObjectId: result.object.id, redirectUrl: result.object.url, state: 'known' })
      .where(eq(billingProviderLeg.id, legId));
    const stored = (
      await this.databaseService.database.select().from(subscription).where(eq(subscription.id, actionId)).limit(1)
    )[0];
    if (stored === undefined) throw new Error('Subscription action disappeared');
    return this.subscriptionToWire(owner, stored);
  }

  public async createPortal(userId: string, input: ActionRequest): Promise<WirePaymentAction> {
    this.assertCollectionEnabled();
    const owner = await this.resolveOwner(userId);
    const requestHash = digest(input);
    const existing = await this.databaseService.database
      .select()
      .from(billingProviderLeg)
      .where(
        and(
          eq(billingProviderLeg.accountId, owner.accountId),
          eq(billingProviderLeg.kind, 'portal'),
          eq(billingProviderLeg.requestId, input.requestId),
        ),
      )
      .limit(1);
    if (existing[0] !== undefined) {
      if (existing[0].requestHash !== requestHash) throw new ConflictException({ code: 'request_payload_conflict' });
      return this.portalToWire(owner, existing[0], existing[0].redirectUrl ?? undefined);
    }
    const active = await this.databaseService.database
      .select()
      .from(subscription)
      .where(and(eq(subscription.accountId, owner.accountId), eq(subscription.slotState, 'current')))
      .limit(1);
    if (active[0]?.customerBindingId === null || active[0]?.customerBindingId === undefined)
      throw new ConflictException({ code: 'billing_portal_not_available' });
    const binding = await this.databaseService.database
      .select()
      .from(billingStripeCustomer)
      .where(eq(billingStripeCustomer.id, active[0].customerBindingId))
      .limit(1);
    if (binding[0]?.stripeCustomerId === null || binding[0]?.stripeCustomerId === undefined)
      throw new ConflictException({ code: 'billing_portal_not_available' });
    const actionId = randomUUID();
    const returnUrl = this.returnUrl(input.returnPath, actionId);
    const request = { customer: binding[0].stripeCustomerId, return_url: returnUrl };
    const inserted = await this.databaseService.database
      .insert(billingProviderLeg)
      .values({
        id: actionId,
        accountId: owner.accountId,
        environment: this.config.environment,
        customerBindingId: binding[0].id,
        kind: 'portal',
        requestId: input.requestId,
        requestHash,
        request,
        idempotencyKey: `tau:${actionId}`,
        state: 'dispatched',
        dispatchStartedAt: new Date(),
        nextAttemptAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: billingProviderLeg.id });
    if (inserted[0] === undefined) {
      const replay = await this.databaseService.database
        .select()
        .from(billingProviderLeg)
        .where(
          and(
            eq(billingProviderLeg.accountId, owner.accountId),
            eq(billingProviderLeg.kind, 'portal'),
            eq(billingProviderLeg.requestId, input.requestId),
          ),
        )
        .limit(1);
      if (replay[0]?.requestHash !== requestHash) throw new ConflictException({ code: 'request_payload_conflict' });
      if (replay[0] === undefined) throw new ConflictException({ code: 'portal_action_conflict' });
      return this.portalToWire(owner, replay[0], replay[0].redirectUrl ?? undefined);
    }
    const result = await dispatchStripeLegOnce(this.stripe, {
      kind: 'portal',
      idempotencyKey: `tau:${actionId}`,
      request,
    });
    if (result.kind !== 'portal') throw new Error('Unexpected Portal result');
    await this.databaseService.database
      .update(billingProviderLeg)
      .set({ providerObjectId: result.object.id, redirectUrl: result.object.url, state: 'known' })
      .where(eq(billingProviderLeg.id, actionId));
    const stored = (
      await this.databaseService.database
        .select()
        .from(billingProviderLeg)
        .where(eq(billingProviderLeg.id, actionId))
        .limit(1)
    )[0];
    if (stored === undefined) throw new Error('Portal action disappeared');
    return this.portalToWire(owner, stored, result.object.url);
  }

  public async getAction(userId: string, actionId: string): Promise<WirePaymentAction> {
    const owner = await this.resolveOwner(userId);
    const purchase = await this.databaseService.database
      .select()
      .from(billingPurchase)
      .where(and(eq(billingPurchase.id, actionId), eq(billingPurchase.accountId, owner.accountId)))
      .limit(1);
    if (purchase[0] !== undefined) return this.purchaseToWire(owner, purchase[0]);
    const subscriptionRows = await this.databaseService.database
      .select()
      .from(subscription)
      .where(and(eq(subscription.id, actionId), eq(subscription.accountId, owner.accountId)))
      .limit(1);
    if (subscriptionRows[0] !== undefined) return this.subscriptionToWire(owner, subscriptionRows[0]);
    const portal = await this.databaseService.database
      .select()
      .from(billingProviderLeg)
      .where(
        and(
          eq(billingProviderLeg.id, actionId),
          eq(billingProviderLeg.accountId, owner.accountId),
          eq(billingProviderLeg.kind, 'portal'),
        ),
      )
      .limit(1);
    if (portal[0] !== undefined) return this.portalToWire(owner, portal[0], portal[0].redirectUrl ?? undefined);
    throw new NotFoundException('payment_action_not_found');
  }

  public async listActions(userId: string, purpose?: string): Promise<WirePaymentAction[]> {
    const owner = await this.findOwner(userId);
    if (owner === undefined) return [];
    const actions: WirePaymentAction[] = [];
    if (purpose === undefined || purpose === 'manual_topup') {
      const rows = await this.databaseService.database
        .select()
        .from(billingPurchase)
        .where(
          and(
            eq(billingPurchase.accountId, owner.accountId),
            ne(billingPurchase.state, 'fulfilled'),
            ne(billingPurchase.state, 'failed'),
            ne(billingPurchase.state, 'canceled'),
          ),
        )
        .orderBy(desc(billingPurchase.updatedAt))
        .limit(20);
      actions.push(...(await Promise.all(rows.map(async (row) => this.purchaseToWire(owner, row)))));
    }
    if (purpose === undefined || purpose === 'subscription_checkout') {
      const rows = await this.databaseService.database
        .select()
        .from(subscription)
        .where(
          and(
            eq(subscription.accountId, owner.accountId),
            or(eq(subscription.slotState, 'pending'), eq(subscription.slotState, 'attention')),
          ),
        )
        .orderBy(desc(subscription.updatedAt))
        .limit(20);
      actions.push(...(await Promise.all(rows.map(async (row) => this.subscriptionToWire(owner, row)))));
    }
    if (purpose === undefined || purpose === 'billing_portal') {
      const rows = await this.databaseService.database
        .select()
        .from(billingProviderLeg)
        .where(
          and(
            eq(billingProviderLeg.accountId, owner.accountId),
            eq(billingProviderLeg.kind, 'portal'),
            ne(billingProviderLeg.state, 'no_charge'),
          ),
        )
        .orderBy(desc(billingProviderLeg.createdAt))
        .limit(20);
      actions.push(...rows.map((row) => this.portalToWire(owner, row, row.redirectUrl ?? undefined)));
    }
    return actions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 20);
  }

  public async receiveWebhook(rawBody: Uint8Array<ArrayBuffer>, signature: string): Promise<void> {
    if (this.config.webhookSecret.length === 0 || this.config.stripeAccountId.length === 0)
      throw new ServiceUnavailableException('payment_webhook_not_configured');
    let event: ReturnType<typeof parseVerifiedStripeEvent>;
    try {
      event = parseVerifiedStripeEvent(this.stripe, {
        rawBody,
        signature,
        secret: this.config.webhookSecret,
        livemode: this.config.livemode,
      });
    } catch {
      throw new BadRequestException('invalid_stripe_webhook');
    }
    try {
      await this.databaseService.database.transaction(async (tx) => {
        const inserted = await tx
          .insert(stripeEventInbox)
          .values({
            id: randomUUID(),
            eventId: event.id,
            environment: this.config.environment,
            stripeAccountId: this.config.stripeAccountId,
            livemode: this.config.livemode,
            apiVersion: event.apiVersion,
            eventType: event.type,
            sourceType: event.sourceType,
            sourceId: event.sourceId,
            eventCreatedAt: new Date(event.created * 1000),
            payloadDigest: event.payloadDigest,
            evidence: event.evidence,
            nextAttemptAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ id: stripeEventInbox.id });
        if (inserted[0] === undefined) {
          const existing = await tx
            .select()
            .from(stripeEventInbox)
            .where(
              and(
                eq(stripeEventInbox.environment, this.config.environment),
                eq(stripeEventInbox.stripeAccountId, this.config.stripeAccountId),
                eq(stripeEventInbox.livemode, this.config.livemode),
                eq(stripeEventInbox.eventId, event.id),
              ),
            )
            .limit(1);
          if (
            existing[0]?.payloadDigest !== event.payloadDigest ||
            existing[0]?.eventType !== event.type ||
            existing[0]?.sourceId !== event.sourceId ||
            existing[0]?.sourceType !== event.sourceType
          )
            throw new ConflictException({ code: 'stripe_event_conflict' });
          return;
        }
        await tx
          .insert(billingStripeSource)
          .values({
            id: randomUUID(),
            environment: this.config.environment,
            stripeAccountId: this.config.stripeAccountId,
            livemode: this.config.livemode,
            sourceType: event.sourceType,
            sourceId: event.sourceId,
            nextAttemptAt: new Date(),
          })
          .onConflictDoNothing();
        await tx
          .update(billingStripeSource)
          .set({ state: 'pending', nextAttemptAt: new Date(), generation: sql`${billingStripeSource.generation} + 1` })
          .where(
            and(
              eq(billingStripeSource.environment, this.config.environment),
              eq(billingStripeSource.stripeAccountId, this.config.stripeAccountId),
              eq(billingStripeSource.livemode, this.config.livemode),
              eq(billingStripeSource.sourceType, event.sourceType),
              eq(billingStripeSource.sourceId, event.sourceId),
            ),
          );
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException('stripe_webhook_persistence_failed');
    }
  }

  public async recoverPayments(input: {
    readonly environment: FinancialEnvironment;
    readonly limit: number;
  }): Promise<{ processed: string[]; pending: string[]; failed: string[] }> {
    if (
      input.environment !== this.config.environment ||
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    )
      throw new RangeError('Invalid payment recovery scope');
    const result = { processed: [] as string[], pending: [] as string[], failed: [] as string[] };
    const claims = await this.claimSources(input.limit);
    for (const claim of claims) {
      try {
        if (await this.reconcileClaimedSource(claim)) {
          await this.finishSourceClaim(claim);
          result.processed.push(claim.id);
        } else {
          await this.releaseSourceClaim(claim, 'source_pending');
          result.pending.push(claim.id);
        }
      } catch (error) {
        await this.releaseSourceClaim(claim, paymentRecoveryErrorCode(error));
        result.failed.push(claim.id);
      }
    }
    const remaining = input.limit - claims.length;
    if (remaining === 0) return result;
    const due = await this.claimProviderLegs(remaining);
    for (const { leg, leaseUntil } of due) {
      try {
        if (leg.kind === 'payment_intent' && leg.state === 'prepared' && leg.purchaseId !== null) {
          const workGeneration = automaticWorkGeneration(leg.request);
          if (leg.reloadConsentId === null || workGeneration === undefined)
            throw new ConflictException({ code: 'automatic_payment_request_invalid' });
          await this.confirmAutomaticPurchase(
            leg.accountId,
            leg.reloadConsentId,
            leg.purchaseId,
            leg.id,
            leg.request,
            workGeneration,
          );
          result.processed.push(leg.id);
          continue;
        }
        if (leg.purchaseId !== null) {
          const purchase = await this.ownedPurchase(leg.accountId, leg.purchaseId);
          if (purchase.state === 'paid_unfulfilled') {
            const evidence = paidPaymentEvidenceSchema.parse(purchase.paidEvidence);
            const paymentIntentId = evidence.paymentIntentIds[0];
            if (paymentIntentId === undefined) throw new ConflictException({ code: 'cash_source_identity_missing' });
            const applied = await this.reconcilePurchase(
              leg.accountId,
              leg.purchaseId,
              paymentIntentId,
              undefined,
              undefined,
              { id: leg.id, leaseUntil },
            );
            if (applied) {
              result.processed.push(leg.id);
            } else {
              await this.releaseProviderLegClaim(leg.id, leaseUntil, 'cash_source_pending');
              result.pending.push(leg.id);
            }
            continue;
          }
        }
        if (leg.kind === 'checkout_setup' && leg.reloadConsentId !== null && leg.providerObjectId !== null) {
          const consent = await this.ownedReloadConsent(leg.accountId, leg.reloadConsentId);
          const customer = await this.ownedCustomer(leg.accountId, consent.customerBindingId);
          const qualification = qualifyReloadSetup({
            consentId: consent.id,
            consentVersion: consent.version,
            customerId: customer.stripeCustomerId,
            livemode: this.config.livemode,
            providerLegId: leg.id,
            source: await retrieveStripeSetupEvidence(this.sourceStripe, leg.providerObjectId),
          });
          if (qualification.status !== 'qualified') {
            await this.releaseProviderLegClaim(leg.id, leaseUntil, qualification.reason);
            result.pending.push(leg.id);
            continue;
          }
          await this.databaseService.database.transaction(async (tx) => {
            await this.lockPaymentAccount(tx, leg.accountId);
            await this.assertProviderLegClaim(tx, leg.id, leaseUntil);
            await tx
              .update(billingReloadConsent)
              .set({
                checkoutSessionId: leg.providerObjectId,
                setupIntentId: qualification.setupIntentId,
                paymentMethodId: qualification.paymentMethodId,
                paymentMethod: {
                  id: qualification.paymentMethodId,
                  brand: qualification.brand,
                  last4: qualification.last4,
                },
                state: 'enabled',
                updatedAt: new Date(),
              })
              .where(and(eq(billingReloadConsent.id, consent.id), eq(billingReloadConsent.state, 'pending_setup')));
            await tx
              .update(billingProviderLeg)
              .set({ state: 'known', nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
              .where(eq(billingProviderLeg.id, leg.id));
          });
          result.processed.push(leg.id);
          continue;
        }
        // Paid-unfulfilled rows deliberately re-enter source and cash qualification below;
        // a persisted nominal paid proof is not enough to issue credit after a crash.
        const recovered = await recoverStripeLegSource(this.sourceStripe, recoveryQuery(leg));
        if (recovered.status !== 'known') {
          await this.releaseProviderLegClaim(
            leg.id,
            leaseUntil,
            recovered.status === 'ambiguous' ? 'provider_source_ambiguous' : 'provider_source_unknown',
          );
          result.pending.push(leg.id);
          continue;
        }
        if (leg.providerObjectId !== null && leg.providerObjectId !== recovered.object.object.id)
          throw new ConflictException({ code: 'provider_object_mismatch' });
        const linked = await this.databaseService.database
          .update(billingProviderLeg)
          .set({
            providerObjectId: recovered.object.object.id,
            redirectUrl: recovered.object.kind === 'checkout' ? recovered.object.object.url : null,
            state: 'known',
            errorCode: null,
          })
          .where(
            and(
              eq(billingProviderLeg.id, leg.id),
              eq(billingProviderLeg.nextAttemptAt, leaseUntil),
              leg.providerObjectId === null
                ? isNull(billingProviderLeg.providerObjectId)
                : eq(billingProviderLeg.providerObjectId, leg.providerObjectId),
            ),
          )
          .returning({ id: billingProviderLeg.id });
        if (linked[0] === undefined) {
          result.pending.push(leg.id);
          continue;
        }
        if (recovered.object.kind === 'customer') {
          await this.databaseService.database
            .update(billingStripeCustomer)
            .set({ stripeCustomerId: recovered.object.object.id })
            .where(
              and(eq(billingStripeCustomer.id, leg.customerBindingId), isNull(billingStripeCustomer.stripeCustomerId)),
            );
        }
        if (leg.purchaseId !== null && recovered.object.kind === 'payment_intent')
          await this.reconcilePurchase(
            leg.accountId,
            leg.purchaseId,
            recovered.object.object.id,
            undefined,
            {
              providerLegId: leg.id,
              customerBindingId: leg.customerBindingId,
              expectedPaymentMethodId: paymentMethodId(leg.request),
            },
            { id: leg.id, leaseUntil },
          );
        if (recovered.object.kind === 'checkout')
          await this.linkRecoveredCheckout(leg, leaseUntil, recovered.object.object);
        result.processed.push(leg.id);
      } catch (error) {
        await this.releaseProviderLegClaim(leg.id, leaseUntil, paymentRecoveryErrorCode(error));
        result.failed.push(leg.id);
      }
    }
    return result;
  }

  public async processReloadWork(input: {
    readonly environment: FinancialEnvironment;
    readonly limit: number;
  }): Promise<{ processed: string[]; pending: string[]; failed: string[] }> {
    if (input.environment !== this.config.environment || input.limit < 1 || input.limit > 100) {
      throw new RangeError('Invalid reload recovery scope');
    }
    this.assertCollectionEnabled();
    const claims = await this.databaseService.database.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(billingReloadWork)
        .where(
          and(
            eq(billingReloadWork.environment, this.config.environment),
            sql`${billingReloadWork.nextAttemptAt} <= clock_timestamp()`,
            or(
              eq(billingReloadWork.state, 'pending'),
              and(eq(billingReloadWork.state, 'processing'), sql`${billingReloadWork.leaseUntil} <= clock_timestamp()`),
            ),
          ),
        )
        .orderBy(asc(billingReloadWork.nextAttemptAt))
        .limit(input.limit)
        .for('update', { skipLocked: true });
      const claimed: Array<{ accountId: string; generation: bigint }> = [];
      for (const row of rows) {
        const updated = await tx
          .update(billingReloadWork)
          .set({
            state: 'processing',
            generation: sql`${billingReloadWork.generation} + 1`,
            leaseUntil: sql`date_trunc('milliseconds', clock_timestamp()) + interval '30 seconds'`,
            errorCode: null,
          })
          .where(and(eq(billingReloadWork.accountId, row.accountId), eq(billingReloadWork.generation, row.generation)))
          .returning({ accountId: billingReloadWork.accountId, generation: billingReloadWork.generation });
        if (updated[0] !== undefined) claimed.push(updated[0]);
      }
      return claimed;
    });
    const result = { processed: [] as string[], pending: [] as string[], failed: [] as string[] };
    for (const claim of claims) {
      try {
        const created = await this.createAutomaticPurchase(claim.accountId, claim.generation);
        result[created ? 'processed' : 'pending'].push(claim.accountId);
      } catch (error) {
        await this.releaseReloadWork(claim.accountId, claim.generation, paymentRecoveryErrorCode(error));
        result.failed.push(claim.accountId);
      }
    }
    return result;
  }

  public async expireReloadRecoveries(input: {
    readonly environment: FinancialEnvironment;
    readonly limit: number;
  }): Promise<{ processed: string[]; pending: string[]; failed: string[] }> {
    if (input.environment !== this.config.environment || input.limit < 1 || input.limit > 100) {
      throw new RangeError('Invalid reload expiry scope');
    }
    const legs = await this.databaseService.database.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(billingProviderLeg)
        .where(
          and(
            eq(billingProviderLeg.environment, this.config.environment),
            eq(billingProviderLeg.kind, 'checkout_setup'),
            eq(billingProviderLeg.state, 'known'),
            isNull(billingProviderLeg.expirationRequestedAt),
            sql`${billingProviderLeg.expiresAt} <= clock_timestamp()`,
          ),
        )
        .orderBy(asc(billingProviderLeg.expiresAt))
        .limit(input.limit)
        .for('update', { skipLocked: true });
      const claimed: typeof rows = [];
      for (const row of rows) {
        const updated = await tx
          .update(billingProviderLeg)
          .set({ expirationRequestedAt: sql`clock_timestamp()` })
          .where(and(eq(billingProviderLeg.id, row.id), isNull(billingProviderLeg.expirationRequestedAt)))
          .returning();
        if (updated[0] !== undefined) claimed.push(updated[0]);
      }
      return claimed;
    });
    const result = { processed: [] as string[], pending: [] as string[], failed: [] as string[] };
    for (const leg of legs) {
      try {
        if (leg.providerObjectId === null) throw new Error('Setup expiry has no Session identity');
        await expireStripeCheckoutSession(this.stripe, {
          sessionId: leg.providerObjectId,
          idempotencyKey: `expire:${leg.id}`,
        });
        const session = await this.sourceStripe.checkout.sessions.retrieve(leg.providerObjectId);
        const customer = await this.ownedCustomer(leg.accountId, leg.customerBindingId);
        if (
          session.status !== 'expired' ||
          session.mode !== 'setup' ||
          session.livemode !== this.config.livemode ||
          (typeof session.customer === 'string' ? session.customer : session.customer?.id) !== customer.stripeCustomerId
        ) {
          result.pending.push(leg.id);
          continue;
        }
        const evidence = checkoutExpiryEvidenceSchema.parse({
          version: 'stripe-checkout-expiry-v1',
          checkoutSessionId: session.id,
          customerId: customer.stripeCustomerId,
          stripeAccountId: this.config.stripeAccountId,
          livemode: this.config.livemode,
          status: 'expired',
          mode: 'setup',
          sourceDigest: digest(session),
          observedAt: new Date().toISOString(),
        });
        const changed = await this.databaseService.database
          .update(billingProviderLeg)
          .set({
            state: 'expired',
            terminalEvidence: evidence,
            redirectUrl: null,
            nextAttemptAt: new Date('9999-12-31T00:00:00Z'),
          })
          .where(
            and(
              eq(billingProviderLeg.id, leg.id),
              eq(billingProviderLeg.state, 'known'),
              eq(billingProviderLeg.expirationRequestedAt, leg.expirationRequestedAt ?? new Date(0)),
            ),
          )
          .returning({ id: billingProviderLeg.id });
        if (changed[0] === undefined) throw new ConflictException({ code: 'stale_setup_expiry' });
        result.processed.push(leg.id);
      } catch {
        result.failed.push(leg.id);
      }
    }
    return result;
  }

  public async deliverRecoveryNotices(input: {
    readonly environment: FinancialEnvironment;
    readonly limit: number;
  }): Promise<{ processed: string[]; pending: string[]; failed: string[] }> {
    const result = { processed: [] as string[], pending: [] as string[], failed: [] as string[] };
    if (input.environment !== this.config.environment || input.limit < 1 || input.limit > 100) {
      throw new RangeError('Invalid notice recovery scope');
    }
    if (this.noticeTransport === undefined) return result;
    const claims = await this.databaseService.database.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(billingRecoveryNotice)
        .where(
          and(
            eq(billingRecoveryNotice.environment, this.config.environment),
            sql`${billingRecoveryNotice.nextAttemptAt} <= clock_timestamp()`,
            or(
              eq(billingRecoveryNotice.state, 'pending'),
              and(
                eq(billingRecoveryNotice.state, 'processing'),
                sql`${billingRecoveryNotice.leaseUntil} <= clock_timestamp()`,
              ),
            ),
          ),
        )
        .orderBy(asc(billingRecoveryNotice.nextAttemptAt), asc(billingRecoveryNotice.id))
        .limit(input.limit)
        .for('update', { skipLocked: true });
      const output: typeof rows = [];
      for (const row of rows) {
        const updated = await tx
          .update(billingRecoveryNotice)
          .set({
            state: 'processing',
            generation: sql`${billingRecoveryNotice.generation} + 1`,
            leaseUntil: sql`date_trunc('milliseconds', clock_timestamp()) + interval '30 seconds'`,
            attemptCount: sql`${billingRecoveryNotice.attemptCount} + 1`,
            errorCode: null,
          })
          .where(and(eq(billingRecoveryNotice.id, row.id), eq(billingRecoveryNotice.generation, row.generation)))
          .returning();
        if (updated[0] !== undefined) output.push(updated[0]);
      }
      return output;
    });
    for (const claim of claims) {
      try {
        const delivered = await this.noticeTransport.deliver({
          kind: claim.kind,
          payload: claim.payload,
          dedupeKey: claim.dedupeKey,
        });
        const changed = await this.databaseService.database
          .update(billingRecoveryNotice)
          .set({
            state: 'delivered',
            leaseUntil: null,
            deliveredAt: new Date(),
            deliveryReceipt: delivered.receipt,
            updatedAt: new Date(),
            nextAttemptAt: new Date('9999-12-31T00:00:00Z'),
          })
          .where(
            and(
              eq(billingRecoveryNotice.id, claim.id),
              eq(billingRecoveryNotice.generation, claim.generation),
              eq(billingRecoveryNotice.state, 'processing'),
              sql`${billingRecoveryNotice.leaseUntil} > clock_timestamp()`,
            ),
          )
          .returning({ id: billingRecoveryNotice.id });
        if (changed[0] === undefined) throw new Error('Stale recovery notice claim');
        result.processed.push(claim.id);
      } catch {
        await this.databaseService.database
          .update(billingRecoveryNotice)
          .set({
            state: 'pending',
            leaseUntil: null,
            errorCode: 'delivery_failed',
            nextAttemptAt: sql`clock_timestamp() + interval '30 seconds'`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(billingRecoveryNotice.id, claim.id),
              eq(billingRecoveryNotice.generation, claim.generation),
              eq(billingRecoveryNotice.state, 'processing'),
              sql`${billingRecoveryNotice.leaseUntil} > clock_timestamp()`,
            ),
          );
        result.failed.push(claim.id);
      }
    }
    return result;
  }

  public async requestEnterpriseVatInvoice(
    userId: string,
    input: { readonly requestId: string; readonly invoiceId: string },
  ): Promise<WireFinancialCase> {
    return this.tax.requestOwnedEnterpriseVatInvoice({
      environment: this.config.environment,
      authUserId: userId,
      ...input,
    });
  }

  private async linkRecoveredCheckout(
    leg: typeof billingProviderLeg.$inferSelect,
    leaseUntil: Date,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    if (session.client_reference_id !== (leg.purchaseId ?? leg.subscriptionId))
      throw new ConflictException({ code: 'checkout_owner_mismatch' });
    if (session.livemode !== this.config.livemode) throw new ConflictException({ code: 'checkout_scope_mismatch' });
    const binding = await this.databaseService.database
      .select()
      .from(billingStripeCustomer)
      .where(
        and(
          eq(billingStripeCustomer.id, leg.customerBindingId),
          eq(billingStripeCustomer.accountId, leg.accountId),
          eq(billingStripeCustomer.environment, this.config.environment),
          eq(billingStripeCustomer.stripeAccountId, this.config.stripeAccountId),
          eq(billingStripeCustomer.livemode, this.config.livemode),
        ),
      )
      .limit(1);
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (binding[0]?.stripeCustomerId !== customerId)
      throw new ConflictException({ code: 'checkout_customer_mismatch' });
    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (leg.purchaseId !== null && paymentIntentId !== null && paymentIntentId !== undefined) {
      await this.reconcilePurchase(
        leg.accountId,
        leg.purchaseId,
        paymentIntentId,
        undefined,
        {
          providerLegId: leg.id,
          customerBindingId: leg.customerBindingId,
          expectedPaymentMethodId: paymentMethodId(leg.request),
          checkoutSessionId: session.id,
        },
        { id: leg.id, leaseUntil },
      );
    }
    const remoteSubscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (leg.subscriptionId !== null && remoteSubscriptionId !== null && remoteSubscriptionId !== undefined) {
      const leaseToken = leaseUntil.toISOString();
      await this.databaseService.database
        .update(subscription)
        .set({ stripeSubscriptionId: remoteSubscriptionId, updatedAt: new Date() })
        .where(
          and(
            eq(subscription.id, leg.subscriptionId),
            eq(subscription.accountId, leg.accountId),
            isNull(subscription.stripeSubscriptionId),
            sql`exists (select 1 from billing.billing_provider_leg p where p.id = ${leg.id} and p.next_attempt_at = ${leaseToken}::timestamptz)`,
          ),
        );
    }
  }

  private async claimProviderLegs(limit: number): Promise<ProviderLegClaim[]> {
    return this.databaseService.database.transaction(async (tx) => {
      const paymentLeg = alias(billingProviderLeg, 'payment_leg');
      const rows = await tx
        .select({ leg: paymentLeg })
        .from(paymentLeg)
        .innerJoin(
          billingStripeCustomer,
          and(
            eq(billingStripeCustomer.id, paymentLeg.customerBindingId),
            eq(billingStripeCustomer.accountId, paymentLeg.accountId),
            eq(billingStripeCustomer.environment, this.config.environment),
            eq(billingStripeCustomer.stripeAccountId, this.config.stripeAccountId),
            eq(billingStripeCustomer.livemode, this.config.livemode),
          ),
        )
        .leftJoin(
          billingPurchase,
          and(eq(billingPurchase.id, paymentLeg.purchaseId), eq(billingPurchase.accountId, paymentLeg.accountId)),
        )
        .leftJoin(
          subscription,
          and(eq(subscription.id, paymentLeg.subscriptionId), eq(subscription.accountId, paymentLeg.accountId)),
        )
        .where(
          and(
            eq(paymentLeg.environment, this.config.environment),
            sql`${paymentLeg.nextAttemptAt} <= clock_timestamp()`,
            // Tax source legs are recovered by their owning payment path. Generic source recovery cannot
            // qualify their provider objects and would re-claim them forever as `provider_source_unknown`.
            ne(paymentLeg.kind, 'tax_calculation'),
            ne(paymentLeg.kind, 'tax_transaction'),
            or(
              and(
                eq(paymentLeg.state, 'prepared'),
                eq(paymentLeg.kind, 'payment_intent'),
                eq(billingPurchase.purpose, 'automatic'),
              ),
              eq(paymentLeg.state, 'dispatched'),
              eq(paymentLeg.state, 'attention'),
              and(
                eq(paymentLeg.state, 'known'),
                or(
                  and(eq(paymentLeg.kind, 'customer'), isNull(billingStripeCustomer.stripeCustomerId)),
                  and(
                    sql`${paymentLeg.purchaseId} is not null`,
                    or(
                      eq(billingPurchase.state, 'creating'),
                      eq(billingPurchase.state, 'pending'),
                      eq(billingPurchase.state, 'attention'),
                      eq(billingPurchase.state, 'paid_unfulfilled'),
                    ),
                  ),
                  and(sql`${paymentLeg.subscriptionId} is not null`, isNull(subscription.stripeSubscriptionId)),
                  eq(paymentLeg.kind, 'checkout_setup'),
                ),
              ),
            ),
          ),
        )
        .orderBy(asc(paymentLeg.nextAttemptAt), asc(paymentLeg.id))
        .limit(limit)
        .for('update', { of: paymentLeg, skipLocked: true });
      const claims: ProviderLegClaim[] = [];
      for (const { leg } of rows) {
        const updated = await tx
          .update(billingProviderLeg)
          .set({ nextAttemptAt: sql`date_trunc('milliseconds', clock_timestamp()) + interval '30 seconds'` })
          .where(and(eq(billingProviderLeg.id, leg.id), eq(billingProviderLeg.state, leg.state)))
          .returning({ leaseUntil: billingProviderLeg.nextAttemptAt });
        if (updated[0] !== undefined) claims.push({ leg, leaseUntil: updated[0].leaseUntil });
      }
      return claims;
    });
  }

  private async claimRenewalLeg(
    offer: typeof billingSubscriptionOffer.$inferSelect,
    customerBindingId: string,
    kind: 'subscription_schedule' | 'subscription_update',
    request: Record<string, unknown>,
  ) {
    return this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, offer.accountId);
      await tx
        .select({ id: billingSubscriptionOffer.id })
        .from(billingSubscriptionOffer)
        .where(and(eq(billingSubscriptionOffer.id, offer.id), ne(billingSubscriptionOffer.state, 'confirmed')))
        .for('update');
      let [leg] = await tx
        .select()
        .from(billingProviderLeg)
        .where(and(eq(billingProviderLeg.subscriptionOfferId, offer.id), eq(billingProviderLeg.kind, kind)))
        .limit(1)
        .for('update');
      if (leg === undefined) {
        const id = randomUUID();
        [leg] = await tx
          .insert(billingProviderLeg)
          .values({
            id,
            accountId: offer.accountId,
            environment: offer.environment,
            customerBindingId,
            subscriptionId: offer.subscriptionId,
            subscriptionOfferId: offer.id,
            kind,
            requestId: offer.id,
            requestHash: digest(request),
            request,
            idempotencyKey: `tau:${id}`,
          })
          .returning();
      }
      if (leg === undefined) throw new Error('Renewal provider leg missing');
      // A reused leg may only authorize the exact frozen request it recorded.
      if (leg.requestHash !== digest(request) || requestDigest(leg.request) !== requestDigest(request))
        throw new ConflictException({ code: 'renewal_leg_request_conflict' });
      if (leg.providerObjectId !== null) return { ...leg, mayDispatch: false };
      const mayDispatch = leg.state === 'prepared';
      // Closure or a paused cash scope blocks a new schedule dispatch; recovering an unknown outcome stays allowed.
      if (mayDispatch) await this.assertOpenCollectionScope(offer.accountId, tx);
      const [claimed] = await tx
        .update(billingProviderLeg)
        .set({
          state: 'dispatched',
          generation: sql`${billingProviderLeg.generation} + 1`,
          leaseUntil: sql`date_trunc('milliseconds', clock_timestamp()) + interval '30 seconds'`,
          dispatchStartedAt: sql`coalesce(${billingProviderLeg.dispatchStartedAt}, clock_timestamp())`,
        })
        .where(
          and(
            eq(billingProviderLeg.id, leg.id),
            or(
              eq(billingProviderLeg.state, 'prepared'),
              eq(billingProviderLeg.state, 'attention'),
              and(
                eq(billingProviderLeg.state, 'dispatched'),
                sql`${billingProviderLeg.leaseUntil} <= clock_timestamp()`,
              ),
            ),
          ),
        )
        .returning();
      if (claimed === undefined) throw new ConflictException({ code: 'renewal_leg_busy' });
      return { ...claimed, mayDispatch };
    });
  }

  private async finishRenewalLeg(
    claim: typeof billingProviderLeg.$inferSelect,
    providerObjectId: string,
  ): Promise<void> {
    if (claim.providerObjectId !== null) return;
    const [finished] = await this.databaseService.database
      .update(billingProviderLeg)
      .set({ providerObjectId, state: 'known', leaseUntil: null, errorCode: null })
      .where(
        and(
          eq(billingProviderLeg.id, claim.id),
          eq(billingProviderLeg.generation, claim.generation),
          eq(billingProviderLeg.state, 'dispatched'),
          sql`${billingProviderLeg.leaseUntil} > clock_timestamp()`,
        ),
      )
      .returning({ id: billingProviderLeg.id });
    if (finished === undefined) throw new ConflictException({ code: 'stale_renewal_leg' });
  }

  private async quoteSavedCardTax(input: {
    readonly accountId: string;
    readonly customerBindingId: string;
    readonly customerId: string;
    readonly principalMinor: number;
    readonly productId: string;
    readonly requestId: string;
  }): Promise<{
    readonly taxMinor: number;
    readonly grossMinor: number;
    readonly evidence: Record<string, unknown>;
  }> {
    const customer = await retrieveStripeBillingCustomer(this.sourceStripe, input.customerId);
    const location = qualifyReloadCustomerLocation({
      accountId: input.accountId,
      customerBindingId: input.customerBindingId,
      customerId: input.customerId,
      livemode: this.config.livemode,
      customer,
    });
    if (location === undefined) throw new ConflictException({ code: 'customer_tax_location_invalid' });
    const reference = `manual:${input.requestId}`;
    const calculationId = await this.claimReloadTaxCalculation({
      accountId: input.accountId,
      customerBindingId: input.customerBindingId,
      customerId: input.customerId,
      reloadConsentId: null,
      requestId: `manual-tax:${input.requestId}`,
      reference,
      principalMinor: input.principalMinor,
      productId: input.productId,
      locationRevision: location.revision,
    });
    const source = await fetchStripeTaxCalculationEvidence(this.sourceStripe, {
      calculationId,
      maximumLinePages: 10,
    });
    const qualified = qualifyReloadTaxCalculation({
      customerId: input.customerId,
      livemode: this.config.livemode,
      principalMinor: input.principalMinor,
      productId: input.productId,
      reference,
      location,
      observedAt: new Date(),
      source,
    });
    if (qualified.status !== 'qualified') throw new ConflictException({ code: qualified.reason });
    return {
      taxMinor: qualified.taxMinor,
      grossMinor: qualified.grossMinor,
      evidence: {
        version: 'stripe-payment-tax-v1',
        calculationId: qualified.calculationId,
        locationRevision: location.revision,
        reference,
        sourceDigest: digest(source),
        expiresAt: qualified.expiresAt.toISOString(),
      },
    };
  }

  private async paidTaxTransaction(
    purchase: typeof billingPurchase.$inferSelect,
    paid: ReturnType<typeof paidPaymentEvidenceSchema.parse>,
  ): Promise<Awaited<ReturnType<typeof fetchStripeTaxTransactionEvidence>> | undefined> {
    const offer = paymentOfferSnapshotSchema.parse(purchase.offerSnapshot);
    if (offer.taxBasis !== 'stripe_tax') return undefined;
    const calculationId = purchase.taxEvidence?.['calculationId'];
    if (typeof calculationId !== 'string' || purchase.customerBindingId === null) {
      throw new ConflictException({ code: 'tax_calculation_lineage_missing' });
    }
    const postedAt = Math.floor(new Date(paid.paidAt).getTime() / 1000);
    const reference = `tau:${this.config.environment}:purchase:${purchase.id}`;
    const request = { calculationId, reference, postedAt };
    const owned = and(
      eq(billingProviderLeg.accountId, purchase.accountId),
      eq(billingProviderLeg.kind, 'tax_transaction'),
      eq(billingProviderLeg.requestId, purchase.id),
    );
    const intent = await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, purchase.accountId);
      let [leg] = await tx.select().from(billingProviderLeg).where(owned).limit(1).for('update');
      if (leg === undefined) {
        const id = randomUUID();
        [leg] = await tx
          .insert(billingProviderLeg)
          .values({
            id,
            accountId: purchase.accountId,
            environment: this.config.environment,
            customerBindingId: purchase.customerBindingId!,
            purchaseId: purchase.id,
            kind: 'tax_transaction',
            requestId: purchase.id,
            requestHash: digest(request),
            request,
            idempotencyKey: `tau:${id}`,
            nextAttemptAt: new Date(),
          })
          .onConflictDoNothing()
          .returning();
        if (leg === undefined) [leg] = await tx.select().from(billingProviderLeg).where(owned).limit(1).for('update');
      }
      if (leg === undefined || leg.requestHash !== digest(request)) {
        throw new ConflictException({ code: 'tax_transaction_request_conflict' });
      }
      if (leg.providerObjectId !== null) return { leg, dispatch: false };
      if (
        leg.state === 'dispatched' &&
        (leg.dispatchStartedAt === null || Date.now() - leg.dispatchStartedAt.getTime() >= 23 * 60 * 60 * 1000)
      ) {
        throw new ConflictException({ code: 'tax_transaction_outcome_unknown' });
      }
      if (leg.state === 'prepared') {
        const [claimed] = await tx
          .update(billingProviderLeg)
          .set({ state: 'dispatched', dispatchStartedAt: new Date() })
          .where(and(eq(billingProviderLeg.id, leg.id), eq(billingProviderLeg.state, 'prepared')))
          .returning();
        if (claimed === undefined) throw new ConflictException({ code: 'tax_transaction_outcome_unknown' });
        leg = claimed;
      }
      if (leg.state !== 'dispatched') throw new ConflictException({ code: 'tax_transaction_outcome_unknown' });
      return { leg, dispatch: true };
    });
    let transactionId = intent.leg.providerObjectId;
    if (intent.dispatch) {
      const created = await createStripeTaxTransactionOnce(this.stripe, {
        calculationId,
        reference,
        postedAt,
        idempotencyKey: intent.leg.idempotencyKey,
      });
      const [stored] = await this.databaseService.database
        .update(billingProviderLeg)
        .set({ state: 'known', providerObjectId: created.id, errorCode: null })
        .where(and(eq(billingProviderLeg.id, intent.leg.id), isNull(billingProviderLeg.providerObjectId)))
        .returning({ providerObjectId: billingProviderLeg.providerObjectId });
      transactionId = stored?.providerObjectId ?? created.id;
    }
    if (transactionId === null) throw new ConflictException({ code: 'tax_transaction_identity_missing' });
    const evidence = await fetchStripeTaxTransactionEvidence(this.sourceStripe, {
      transactionId,
      maximumLinePages: 10,
    });
    if (evidence.transaction.reference !== reference) {
      throw new ConflictException({ code: 'tax_transaction_reference_mismatch' });
    }
    return evidence;
  }

  /**
   * Wins one immutable tax-calculation leg per request identity before any Stripe I/O and returns its
   * calculation identity. A dispatched leg whose identity was never persisted stays unknown and never POSTs again.
   */
  private async claimReloadTaxCalculation(input: {
    readonly accountId: string;
    readonly customerBindingId: string;
    readonly customerId: string;
    // oxlint-disable-next-line typescript/no-restricted-types -- the consent leg has no consent row yet.
    readonly reloadConsentId: string | null;
    readonly requestId: string;
    readonly reference: string;
    readonly principalMinor: number;
    readonly productId: string;
    readonly locationRevision: string;
  }): Promise<string> {
    const request: Record<string, unknown> = {
      kind: 'tax_calculation',
      customerId: input.customerId,
      productId: input.productId,
      principalMinor: input.principalMinor,
      reference: input.reference,
      locationRevision: input.locationRevision,
    };
    const owned = and(
      eq(billingProviderLeg.accountId, input.accountId),
      eq(billingProviderLeg.kind, 'tax_calculation'),
      eq(billingProviderLeg.requestId, input.requestId),
    );
    const intent = await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, input.accountId);
      const existing = await tx.select().from(billingProviderLeg).where(owned).limit(1).for('update');
      let leg = existing[0];
      if (leg === undefined) {
        const legId = randomUUID();
        [leg] = await tx
          .insert(billingProviderLeg)
          .values({
            id: legId,
            accountId: input.accountId,
            environment: this.config.environment,
            customerBindingId: input.customerBindingId,
            reloadConsentId: input.reloadConsentId,
            kind: 'tax_calculation',
            requestId: input.requestId,
            requestHash: digest(request),
            request,
            idempotencyKey: `tau:${legId}`,
            nextAttemptAt: new Date(),
          })
          .onConflictDoNothing()
          .returning();
        if (leg === undefined) [leg] = await tx.select().from(billingProviderLeg).where(owned).limit(1).for('update');
      }
      if (leg === undefined || leg.requestHash !== digest(request))
        throw new ConflictException({ code: 'reload_tax_request_conflict' });
      if (leg.providerObjectId !== null) return { leg, dispatch: false };
      if (leg.state !== 'prepared') throw new ConflictException({ code: 'reload_tax_outcome_unknown' });
      const [claimed] = await tx
        .update(billingProviderLeg)
        .set({ state: 'dispatched', dispatchStartedAt: new Date() })
        .where(and(eq(billingProviderLeg.id, leg.id), eq(billingProviderLeg.state, 'prepared')))
        .returning();
      if (claimed === undefined) throw new ConflictException({ code: 'reload_tax_outcome_unknown' });
      return { leg: claimed, dispatch: true };
    });
    if (!intent.dispatch) {
      if (intent.leg.providerObjectId === null) throw new ConflictException({ code: 'reload_tax_outcome_unknown' });
      return intent.leg.providerObjectId;
    }
    const created = await createStripeReloadTaxCalculationOnce(this.stripe, {
      idempotencyKey: intent.leg.idempotencyKey,
      customerId: input.customerId,
      productId: input.productId,
      reference: input.reference,
      principalMinor: input.principalMinor,
    });
    if (created.id === null) throw new ServiceUnavailableException('stripe_tax_identity_missing');
    const updated = await this.databaseService.database
      .update(billingProviderLeg)
      .set({ providerObjectId: created.id, state: 'known', errorCode: null })
      .where(and(eq(billingProviderLeg.id, intent.leg.id), eq(billingProviderLeg.state, 'dispatched')))
      .returning({ id: billingProviderLeg.id });
    if (updated[0] === undefined) throw new ConflictException({ code: 'reload_tax_result_stale' });
    return created.id;
  }

  private async createAutomaticPurchase(accountId: string, generation: bigint): Promise<boolean> {
    const rows = await this.databaseService.database
      .select()
      .from(billingReloadConsent)
      .where(and(eq(billingReloadConsent.accountId, accountId), eq(billingReloadConsent.state, 'enabled')))
      .limit(1);
    const consent = rows[0];
    if (
      consent?.paymentMethodId === null ||
      consent?.paymentMethodId === undefined ||
      this.config.collection === null
    ) {
      await this.finishReloadWork(accountId, generation);
      return false;
    }
    const { paymentMethodId } = consent;
    const account = await this.databaseService.database
      .select()
      .from(creditAccount)
      .where(and(eq(creditAccount.id, accountId), eq(creditAccount.environment, this.config.environment)))
      .limit(1);
    const owned = account[0];
    if (owned?.status !== 'open' || owned.debtAtoms !== 0n) {
      await this.finishReloadWork(accountId, generation);
      return false;
    }
    const available =
      owned.promoAtoms +
      owned.planAtoms +
      owned.purchasedAtoms -
      owned.debtAtoms -
      owned.promoHeldAtoms -
      owned.planHeldAtoms -
      owned.purchasedHeldAtoms;
    if (available >= consent.thresholdAtoms) {
      await this.finishReloadWork(accountId, generation);
      return false;
    }
    const eligibleWork = await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, accountId);
      const [freshAccount] = await tx
        .select()
        .from(creditAccount)
        .where(and(eq(creditAccount.id, accountId), eq(creditAccount.environment, this.config.environment)))
        .for('update');
      const [freshConsent] = await tx
        .select()
        .from(billingReloadConsent)
        .where(
          and(
            eq(billingReloadConsent.id, consent.id),
            eq(billingReloadConsent.version, consent.version),
            eq(billingReloadConsent.state, 'enabled'),
            eq(billingReloadConsent.paymentMethodId, paymentMethodId),
            or(
              isNull(billingReloadConsent.lastAutomaticStartedAt),
              sql`${billingReloadConsent.lastAutomaticStartedAt} + (${billingReloadConsent.minimumCadenceSeconds} * interval '1 second') <= clock_timestamp()`,
            ),
          ),
        )
        .for('update');
      const [work] = await tx
        .select()
        .from(billingReloadWork)
        .where(
          and(
            eq(billingReloadWork.accountId, accountId),
            eq(billingReloadWork.generation, generation),
            eq(billingReloadWork.state, 'processing'),
            sql`${billingReloadWork.leaseUntil} > clock_timestamp()`,
            sql`${billingReloadWork.updatedAt} >= clock_timestamp() - interval '15 minutes'`,
          ),
        )
        .for('update');
      if (
        freshAccount?.status !== 'open' ||
        freshAccount.debtAtoms !== 0n ||
        freshConsent === undefined ||
        work === undefined
      )
        return undefined;
      const freshAvailable =
        freshAccount.promoAtoms +
        freshAccount.planAtoms +
        freshAccount.purchasedAtoms -
        freshAccount.debtAtoms -
        freshAccount.promoHeldAtoms -
        freshAccount.planHeldAtoms -
        freshAccount.purchasedHeldAtoms;
      return freshAvailable < freshConsent.thresholdAtoms ? work : undefined;
    });
    if (eligibleWork === undefined) {
      await this.finishReloadWork(accountId, generation);
      return false;
    }
    const customer = await this.ownedCustomer(accountId, consent.customerBindingId);
    const remoteCustomer = await retrieveStripeBillingCustomer(this.sourceStripe, customer.stripeCustomerId);
    const location = qualifyReloadCustomerLocation({
      accountId,
      customerBindingId: consent.customerBindingId,
      customerId: customer.stripeCustomerId,
      livemode: this.config.livemode,
      customer: remoteCustomer,
    });
    const acceptedRevision =
      typeof consent.taxEvidence['locationRevision'] === 'string' ? consent.taxEvidence['locationRevision'] : undefined;
    if (location === undefined || location.revision !== acceptedRevision) {
      await this.databaseService.database
        .update(billingReloadConsent)
        .set({ state: 'paused_terms', updatedAt: new Date() })
        .where(and(eq(billingReloadConsent.id, consent.id), eq(billingReloadConsent.state, 'enabled')));
      await this.finishReloadWork(accountId, generation);
      return false;
    }
    const taxRequestId = `reload-tax:${digest({
      accountId,
      consentId: consent.id,
      consentVersion: consent.version,
      reasonKind: eligibleWork.reasonKind,
      reasonOperationId: eligibleWork.reasonOperationId,
      reasonAttemptKey: eligibleWork.reasonAttemptKey,
      reasonRequestDigest: eligibleWork.reasonRequestDigest,
      observedAccountRevision: eligibleWork.observedAccountRevision.toString(),
    })}`;
    const reference = `automatic:${taxRequestId}`;
    const calculationId = await this.claimReloadTaxCalculation({
      accountId,
      customerBindingId: consent.customerBindingId,
      customerId: customer.stripeCustomerId,
      reloadConsentId: consent.id,
      requestId: taxRequestId,
      reference,
      principalMinor: Number(consent.principalMinor),
      productId: this.config.collection.topupProductId,
      locationRevision: location.revision,
    });
    const taxSource = await fetchStripeTaxCalculationEvidence(this.sourceStripe, {
      calculationId,
      maximumLinePages: 10,
    });
    const tax = qualifyReloadTaxCalculation({
      customerId: customer.stripeCustomerId,
      livemode: this.config.livemode,
      principalMinor: Number(consent.principalMinor),
      productId: this.config.collection.topupProductId,
      reference,
      location,
      observedAt: new Date(),
      source: taxSource,
    });
    if (tax.status !== 'qualified' || BigInt(tax.grossMinor) > consent.grossCeilingMinor) {
      await this.databaseService.database
        .update(billingReloadConsent)
        .set({ state: 'paused_terms', updatedAt: new Date() })
        .where(and(eq(billingReloadConsent.id, consent.id), eq(billingReloadConsent.state, 'enabled')));
      await this.finishReloadWork(accountId, generation);
      return false;
    }
    const purchaseId = randomUUID();
    const paymentLegId = randomUUID();
    const base = paymentOfferSnapshotSchema.parse(consent.offerSnapshot);
    const offer = paymentOfferSnapshotSchema.parse({
      ...base,
      taxMinor: String(tax.taxMinor),
      grossMinor: String(tax.grossMinor),
      maximumGrossMinor: consent.grossCeilingMinor.toString(),
      paymentMethod: consent.paymentMethod,
    });
    const providerRequest = {
      kind: 'payment_intent',
      idempotencyKey: `tau:${paymentLegId}`,
      automaticReload: true,
      request: {
        amount: tax.grossMinor,
        currency: 'usd',
        customer: customer.stripeCustomerId,
        payment_method: consent.paymentMethodId,
        confirm: true,
        off_session: true,
        metadata: {
          tau_purchase_id: purchaseId,
          tau_customer_binding_id: consent.customerBindingId,
          tau_provider_leg_id: paymentLegId,
          tau_reload_consent_id: consent.id,
          tau_reload_consent_version: String(consent.version),
          tau_reload_work_generation: String(generation),
        },
      },
    };
    const automaticStartedAt = new Date();
    const inserted = await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, accountId);
      await this.cash.assertNewCollectionScope(accountId, tx);
      const [lockedAccount] = await tx
        .select()
        .from(creditAccount)
        .where(and(eq(creditAccount.id, accountId), eq(creditAccount.environment, this.config.environment)))
        .for('update');
      const [live] = await tx
        .select()
        .from(billingReloadWork)
        .where(
          and(
            eq(billingReloadWork.accountId, accountId),
            eq(billingReloadWork.generation, generation),
            eq(billingReloadWork.state, 'processing'),
            sql`${billingReloadWork.leaseUntil} > clock_timestamp()`,
            sql`${billingReloadWork.updatedAt} >= clock_timestamp() - interval '15 minutes'`,
          ),
        )
        .for('update');
      const [current] = await tx
        .select()
        .from(billingReloadConsent)
        .where(
          and(
            eq(billingReloadConsent.id, consent.id),
            eq(billingReloadConsent.state, 'enabled'),
            or(
              isNull(billingReloadConsent.lastAutomaticStartedAt),
              sql`${billingReloadConsent.lastAutomaticStartedAt} + (${billingReloadConsent.minimumCadenceSeconds} * interval '1 second') <= clock_timestamp()`,
            ),
          ),
        )
        .for('update');
      if (
        live === undefined ||
        current === undefined ||
        lockedAccount?.status !== 'open' ||
        lockedAccount.debtAtoms !== 0n ||
        current.version !== consent.version ||
        current.paymentMethodId !== consent.paymentMethodId
      )
        return false;
      const lockedAvailable =
        lockedAccount.promoAtoms +
        lockedAccount.planAtoms +
        lockedAccount.purchasedAtoms -
        lockedAccount.debtAtoms -
        lockedAccount.promoHeldAtoms -
        lockedAccount.planHeldAtoms -
        lockedAccount.purchasedHeldAtoms;
      if (lockedAvailable >= current.thresholdAtoms) return false;
      const sums = await tx
        .select({
          total: sql<string>`coalesce(sum(case when ${billingPurchase.automaticSourceAcceptedAt} is null then ${billingPurchase.automaticGrossCeilingMinor} else (${billingPurchase.offerSnapshot}->>'grossMinor')::numeric end), 0)::text`,
        })
        .from(billingPurchase)
        .where(
          and(
            eq(billingPurchase.accountId, accountId),
            eq(billingPurchase.purpose, 'automatic'),
            or(
              and(isNull(billingPurchase.automaticSourceAcceptedAt), isNull(billingPurchase.automaticTerminalOutcome)),
              sql`${billingPurchase.automaticSourceAcceptedAt} >= date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC'`,
            ),
          ),
        );
      if (BigInt(sums[0]?.total ?? '0') + consent.grossCeilingMinor > consent.monthlyGrossCapMinor) return false;
      await tx.insert(billingPurchase).values({
        id: purchaseId,
        accountId,
        sourceIdentity: `purchase:${purchaseId}`,
        offerSnapshot: offer,
        creditAtoms: BigInt(offer.creditAtoms),
        state: 'prepared',
        customerBindingId: consent.customerBindingId,
        requestId: purchaseId,
        requestHash: digest(providerRequest),
        purpose: 'automatic',
        returnPath: consent.returnPath,
        reloadConsentId: consent.id,
        reloadConsentVersion: consent.version,
        automaticStartedAt,
        automaticGrossCeilingMinor: consent.grossCeilingMinor,
        taxEvidence: {
          version: 'stripe-reload-tax-v1',
          calculationId: tax.calculationId,
          locationRevision: location.revision,
          sourceDigest: digest(taxSource),
          expiresAt: tax.expiresAt.toISOString(),
        },
        stripeAccountId: this.config.stripeAccountId,
        livemode: this.config.livemode,
      });
      await tx.insert(billingProviderLeg).values({
        id: paymentLegId,
        accountId,
        environment: this.config.environment,
        customerBindingId: consent.customerBindingId,
        purchaseId,
        reloadConsentId: consent.id,
        kind: 'payment_intent',
        requestId: purchaseId,
        requestHash: digest(providerRequest),
        request: providerRequest,
        idempotencyKey: `tau:${paymentLegId}`,
        nextAttemptAt: new Date(),
      });
      await tx
        .update(billingReloadConsent)
        .set({ lastAutomaticStartedAt: automaticStartedAt, updatedAt: new Date() })
        .where(eq(billingReloadConsent.id, consent.id));
      await tx
        .update(billingReloadWork)
        .set({ state: 'done', leaseUntil: null, nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
        .where(and(eq(billingReloadWork.accountId, accountId), eq(billingReloadWork.generation, generation)));
      return true;
    });
    if (!inserted) {
      await this.finishReloadWork(accountId, generation);
      return false;
    }
    await this.confirmAutomaticPurchase(accountId, consent.id, purchaseId, paymentLegId, providerRequest, generation);
    return true;
  }

  private async confirmAutomaticPurchase(
    accountId: string,
    consentId: string,
    purchaseId: string,
    legId: string,
    request: Record<string, unknown>,
    workGeneration: bigint,
  ): Promise<void> {
    const allowed = await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, accountId);
      await this.cash.assertNewCollectionScope(accountId, tx);
      // Read the consent in any state: a revoked one is the permanent reason that must close the purchase below.
      const [consent] = await tx
        .select()
        .from(billingReloadConsent)
        .where(and(eq(billingReloadConsent.id, consentId), eq(billingReloadConsent.accountId, accountId)))
        .for('update');
      const [account] = await tx
        .select()
        .from(creditAccount)
        .where(and(eq(creditAccount.id, accountId), eq(creditAccount.environment, this.config.environment)))
        .for('update');
      const [purchase] = await tx
        .select()
        .from(billingPurchase)
        .where(and(eq(billingPurchase.id, purchaseId), eq(billingPurchase.accountId, accountId)))
        .for('update');
      const [work] = await tx
        .select()
        .from(billingReloadWork)
        .where(and(eq(billingReloadWork.accountId, accountId), eq(billingReloadWork.generation, workGeneration)))
        .for('update');
      // Closes a never-dispatched attempt so it stops holding the account's single automatic slot and its ceiling
      // in the monthly cap sum. No provider evidence exists because nothing was dispatched; `dispatch_started_at
      // IS NULL` is what `billing_provider_no_charge` accepts as the proof, and the cancellation pair satisfies
      // `billing_provider_leg_state`. Every permanent refusal below closes through here.
      const closeUncharged = async (errorCode: string): Promise<undefined> => {
        const abandoned = await tx
          .update(billingProviderLeg)
          .set({
            state: 'no_charge',
            cancellationRequestedAt: sql`coalesce(${billingProviderLeg.cancellationRequestedAt}, clock_timestamp())`,
            cancellationConfirmedAt: sql`coalesce(${billingProviderLeg.cancellationConfirmedAt}, clock_timestamp())`,
            errorCode,
          })
          .where(
            and(
              eq(billingProviderLeg.id, legId),
              eq(billingProviderLeg.accountId, accountId),
              eq(billingProviderLeg.purchaseId, purchaseId),
              eq(billingProviderLeg.state, 'prepared'),
            ),
          )
          .returning({ id: billingProviderLeg.id });
        if (abandoned[0] !== undefined)
          await tx
            .update(billingPurchase)
            .set({
              state: 'failed',
              automaticTerminalOutcome: 'no_charge_failure',
              automaticTerminalAt: sql`clock_timestamp()`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(billingPurchase.id, purchaseId),
                eq(billingPurchase.accountId, accountId),
                eq(billingPurchase.state, 'prepared'),
                isNull(billingPurchase.automaticTerminalOutcome),
              ),
            );
        return undefined;
      };
      if (
        consent?.state !== 'enabled' ||
        account?.status !== 'open' ||
        account.debtAtoms !== 0n ||
        purchase?.state !== 'prepared' ||
        purchase.reloadConsentVersion !== consent.version ||
        purchase.automaticStartedAt === null ||
        consent.lastAutomaticStartedAt?.getTime() !== purchase.automaticStartedAt.getTime() ||
        work?.state !== 'done'
      ) {
        // A superseded wake can never confirm this purchase again: the work generation, the consent version and
        // `lastAutomaticStartedAt` only move forward, and a revoked consent never returns (re-consent is a new
        // row). The remaining fence clauses (closed account, outstanding debt) are transient and leave the
        // purchase alone for the next recovery pass.
        const revoked = consent?.state === 'revoked';
        if (
          purchase?.state === 'prepared' &&
          (revoked ||
            work?.state !== 'done' ||
            (consent !== undefined &&
              (purchase.reloadConsentVersion !== consent.version ||
                consent.lastAutomaticStartedAt?.getTime() !== purchase.automaticStartedAt?.getTime())))
        )
          return closeUncharged(revoked ? 'automatic_consent_revoked' : 'automatic_wake_superseded');
        return undefined;
      }
      // The purchase was prepared against one Tax Calculation and may only be charged while that calculation is
      // live. Confirm never re-quotes: a new calculation is a provider call the wake path owns, so an expired (or
      // unreadable) quote is permanent here and closes the purchase; a fresh wake then re-prepares it with a fresh
      // calculation. The frozen value is compared against the same database clock as every other fence above.
      const frozenExpiry = purchase.taxEvidence?.['expiresAt'];
      const quotedUntil = typeof frozenExpiry === 'string' ? new Date(frozenExpiry) : undefined;
      if (quotedUntil === undefined || Number.isNaN(quotedUntil.getTime()))
        return closeUncharged('automatic_tax_calculation_expired');
      const [quote] = await tx.execute<{ expired: boolean }>(
        sql`select ${quotedUntil.toISOString()}::timestamptz <= clock_timestamp() as expired`,
      );
      if (quote?.expired !== false) return closeUncharged('automatic_tax_calculation_expired');
      const available =
        account.promoAtoms +
        account.planAtoms +
        account.purchasedAtoms -
        account.debtAtoms -
        account.promoHeldAtoms -
        account.planHeldAtoms -
        account.purchasedHeldAtoms;
      if (available >= consent.thresholdAtoms) return undefined;
      const sums = await tx
        .select({
          total: sql<string>`coalesce(sum(case when ${billingPurchase.automaticSourceAcceptedAt} is null then ${billingPurchase.automaticGrossCeilingMinor} else (${billingPurchase.offerSnapshot}->>'grossMinor')::numeric end), 0)::text`,
        })
        .from(billingPurchase)
        .where(
          and(
            eq(billingPurchase.accountId, accountId),
            eq(billingPurchase.purpose, 'automatic'),
            or(
              and(isNull(billingPurchase.automaticSourceAcceptedAt), isNull(billingPurchase.automaticTerminalOutcome)),
              sql`${billingPurchase.automaticSourceAcceptedAt} >= date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC'`,
            ),
          ),
        );
      if (BigInt(sums[0]?.total ?? '0') > consent.monthlyGrossCapMinor) {
        // The cap counts accepted purchases that only roll off at the UTC month boundary, so the refusal cannot
        // change before then: park the still-`prepared` leg there instead of letting recovery re-claim it every 30 s.
        await tx
          .update(billingProviderLeg)
          .set({
            nextAttemptAt: sql`(date_trunc('month', clock_timestamp() at time zone 'UTC') + interval '1 month') at time zone 'UTC'`,
            errorCode: 'automatic_monthly_cap_reached',
          })
          .where(
            and(
              eq(billingProviderLeg.id, legId),
              eq(billingProviderLeg.accountId, accountId),
              eq(billingProviderLeg.purchaseId, purchaseId),
              eq(billingProviderLeg.state, 'prepared'),
            ),
          );
        return undefined;
      }
      // The frozen request is compared independently of JSONB key ordering; a recovered leg carries the stored shape.
      const [leg] = await tx
        .select()
        .from(billingProviderLeg)
        .where(
          and(
            eq(billingProviderLeg.id, legId),
            eq(billingProviderLeg.accountId, accountId),
            eq(billingProviderLeg.purchaseId, purchaseId),
            eq(billingProviderLeg.reloadConsentId, consentId),
            eq(billingProviderLeg.state, 'prepared'),
          ),
        )
        .for('update');
      // A leg that is no longer `prepared` belongs to another writer; a frozen request that no longer matches the
      // canonical one can never match again, so it closes like a superseded wake.
      if (leg === undefined) return undefined;
      if (requestDigest(leg.request) !== requestDigest(request))
        return closeUncharged('automatic_request_digest_mismatch');
      const changed = await tx
        .update(billingPurchase)
        .set({ state: 'creating', updatedAt: new Date() })
        .where(
          and(
            eq(billingPurchase.id, purchaseId),
            eq(billingPurchase.accountId, accountId),
            eq(billingPurchase.state, 'prepared'),
          ),
        )
        .returning({ id: billingPurchase.id });
      if (changed[0] === undefined) return undefined;
      const dispatched = await tx
        .update(billingProviderLeg)
        .set({ state: 'dispatched', dispatchStartedAt: new Date() })
        .where(
          and(
            eq(billingProviderLeg.id, leg.id),
            eq(billingProviderLeg.requestHash, leg.requestHash),
            eq(billingProviderLeg.state, 'prepared'),
          ),
        )
        .returning({ id: billingProviderLeg.id });
      return dispatched[0] === undefined ? undefined : leg.requestHash;
    });
    if (allowed === undefined) return;
    const result = await dispatchStripeLegOnce(this.stripe, parseStripeCreateLeg(request));
    if (result.kind !== 'payment_intent') throw new Error('Automatic payment leg produced the wrong object kind');
    await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, accountId);
      const linked = await tx
        .update(billingProviderLeg)
        .set({ providerObjectId: result.object.id, state: 'known', errorCode: null })
        .where(
          and(
            eq(billingProviderLeg.id, legId),
            eq(billingProviderLeg.accountId, accountId),
            eq(billingProviderLeg.purchaseId, purchaseId),
            eq(billingProviderLeg.requestHash, allowed),
            eq(billingProviderLeg.state, 'dispatched'),
          ),
        )
        .returning({ id: billingProviderLeg.id });
      if (linked[0] === undefined) throw new ConflictException({ code: 'reload_payment_result_stale' });
      await tx
        .update(billingPurchase)
        .set({ state: 'pending', updatedAt: new Date() })
        .where(and(eq(billingPurchase.id, purchaseId), eq(billingPurchase.state, 'creating')));
    });
  }

  private async finishReloadWork(accountId: string, generation: bigint): Promise<void> {
    await this.databaseService.database
      .update(billingReloadWork)
      .set({
        state: 'done',
        leaseUntil: null,
        nextAttemptAt: new Date('9999-12-31T00:00:00Z'),
        errorCode: null,
      })
      .where(
        and(
          eq(billingReloadWork.accountId, accountId),
          eq(billingReloadWork.generation, generation),
          eq(billingReloadWork.state, 'processing'),
          sql`${billingReloadWork.leaseUntil} > clock_timestamp()`,
        ),
      );
  }

  private async releaseReloadWork(accountId: string, generation: bigint, errorCode: string): Promise<void> {
    await this.databaseService.database
      .update(billingReloadWork)
      .set({
        state: 'pending',
        leaseUntil: null,
        nextAttemptAt: sql`clock_timestamp() + interval '30 seconds'`,
        errorCode,
      })
      .where(
        and(
          eq(billingReloadWork.accountId, accountId),
          eq(billingReloadWork.generation, generation),
          eq(billingReloadWork.state, 'processing'),
          sql`${billingReloadWork.leaseUntil} > clock_timestamp()`,
        ),
      );
  }

  private async releaseProviderLegClaim(id: string, leaseUntil: Date, errorCode: string): Promise<void> {
    await this.databaseService.database
      .update(billingProviderLeg)
      .set({ nextAttemptAt: sql`clock_timestamp() + interval '30 seconds'`, errorCode })
      .where(
        and(
          eq(billingProviderLeg.id, id),
          eq(billingProviderLeg.nextAttemptAt, leaseUntil),
          sql`${billingProviderLeg.nextAttemptAt} > clock_timestamp()`,
        ),
      );
  }

  private async claimSources(limit: number): Promise<SourceClaim[]> {
    return this.databaseService.database.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(billingStripeSource)
        .where(
          and(
            eq(billingStripeSource.environment, this.config.environment),
            eq(billingStripeSource.stripeAccountId, this.config.stripeAccountId),
            eq(billingStripeSource.livemode, this.config.livemode),
            ne(billingStripeSource.sourceType, 'cash_charge'),
            or(
              and(
                eq(billingStripeSource.state, 'pending'),
                sql`${billingStripeSource.nextAttemptAt} <= clock_timestamp()`,
              ),
              and(
                eq(billingStripeSource.state, 'processing'),
                sql`${billingStripeSource.leaseUntil} <= clock_timestamp()`,
              ),
            ),
          ),
        )
        .orderBy(asc(billingStripeSource.nextAttemptAt), asc(billingStripeSource.id))
        .limit(limit)
        .for('update', { skipLocked: true });
      const claims: SourceClaim[] = [];
      for (const row of rows) {
        const generation = row.generation + 1n;
        await tx
          .update(billingStripeSource)
          .set({ state: 'processing', generation, leaseUntil: sql`clock_timestamp() + interval '30 seconds'` })
          .where(and(eq(billingStripeSource.id, row.id), eq(billingStripeSource.generation, row.generation)));
        const pending = await tx
          .select()
          .from(stripeEventInbox)
          .where(
            and(
              eq(stripeEventInbox.environment, row.environment),
              eq(stripeEventInbox.stripeAccountId, row.stripeAccountId),
              eq(stripeEventInbox.livemode, row.livemode),
              eq(stripeEventInbox.sourceType, row.sourceType),
              eq(stripeEventInbox.sourceId, row.sourceId),
              or(
                eq(stripeEventInbox.state, 'pending'),
                and(eq(stripeEventInbox.state, 'processing'), sql`${stripeEventInbox.leaseUntil} <= clock_timestamp()`),
              ),
            ),
          )
          .orderBy(asc(stripeEventInbox.id))
          .limit(100)
          .for('update', { skipLocked: true });
        const inbox: SourceClaim['inbox'] = [];
        let sourceAcceptedAt: Date | undefined;
        let hasFailureEvent = false;
        for (const item of pending) {
          const itemGeneration = item.claimGeneration + 1n;
          await tx
            .update(stripeEventInbox)
            .set({
              state: 'processing',
              claimGeneration: itemGeneration,
              leaseUntil: sql`clock_timestamp() + interval '30 seconds'`,
              attempts: item.attempts + 1,
            })
            .where(and(eq(stripeEventInbox.id, item.id), eq(stripeEventInbox.claimGeneration, item.claimGeneration)));
          inbox.push({ id: item.id, generation: itemGeneration });
          if (
            item.eventType === 'payment_intent.succeeded' &&
            (sourceAcceptedAt === undefined || item.eventCreatedAt > sourceAcceptedAt)
          )
            sourceAcceptedAt = item.eventCreatedAt;
          if (
            [
              'invoice.payment_failed',
              'invoice.payment_action_required',
              'invoice.payment_attempt_required',
              'invoice.finalization_failed',
            ].includes(item.eventType)
          )
            hasFailureEvent = true;
        }
        claims.push({
          id: row.id,
          generation,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          environment: row.environment as FinancialEnvironment,
          stripeAccountId: row.stripeAccountId,
          livemode: row.livemode,
          sourceAcceptedAt,
          hasFailureEvent,
          inbox,
        });
      }
      return claims;
    });
  }

  private async reconcileClaimedSource(claim: SourceClaim): Promise<boolean> {
    if (claim.sourceType === 'payment_intent') {
      const source = await retrieveStripePaymentEvidence(this.sourceStripe, claim.sourceId);
      const providerLegId = source.paymentIntent.metadata['tau_provider_leg_id'];
      if (providerLegId === undefined) return false;
      const legs = await this.databaseService.database
        .select({ leg: billingProviderLeg })
        .from(billingProviderLeg)
        .innerJoin(
          billingStripeCustomer,
          and(
            eq(billingStripeCustomer.id, billingProviderLeg.customerBindingId),
            eq(billingStripeCustomer.accountId, billingProviderLeg.accountId),
          ),
        )
        .where(
          and(
            eq(billingProviderLeg.id, providerLegId),
            eq(billingProviderLeg.environment, this.config.environment),
            eq(billingStripeCustomer.environment, this.config.environment),
            eq(billingStripeCustomer.stripeAccountId, this.config.stripeAccountId),
            eq(billingStripeCustomer.livemode, this.config.livemode),
          ),
        )
        .limit(1);
      const leg = legs[0]?.leg;
      if (
        leg?.purchaseId === null ||
        leg?.purchaseId === undefined ||
        (leg.kind === 'payment_intent' && leg.providerObjectId !== claim.sourceId)
      )
        return false;
      return this.reconcilePurchase(leg.accountId, leg.purchaseId, claim.sourceId, claim, {
        providerLegId: leg.id,
        customerBindingId: leg.customerBindingId,
        expectedPaymentMethodId: paymentMethodId(leg.request),
        checkoutSessionId: leg.kind === 'checkout_payment' ? (leg.providerObjectId ?? undefined) : undefined,
      });
    }
    if (claim.sourceType === 'checkout.session') {
      const session = await this.sourceStripe.checkout.sessions.retrieve(claim.sourceId);
      const legs = await this.databaseService.database
        .select()
        .from(billingProviderLeg)
        .where(
          and(
            or(eq(billingProviderLeg.kind, 'checkout_payment'), eq(billingProviderLeg.kind, 'checkout_subscription')),
            eq(billingProviderLeg.providerObjectId, claim.sourceId),
          ),
        )
        .limit(1);
      const leg = legs[0];
      if (leg === undefined || session.client_reference_id !== (leg.purchaseId ?? leg.subscriptionId)) return false;
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (leg.purchaseId !== null && paymentIntentId !== null && paymentIntentId !== undefined) {
        return this.reconcilePurchase(leg.accountId, leg.purchaseId, paymentIntentId, claim, {
          providerLegId: leg.id,
          customerBindingId: leg.customerBindingId,
          expectedPaymentMethodId: paymentMethodId(leg.request),
          checkoutSessionId: leg.providerObjectId ?? undefined,
        });
      }
      const remoteSubscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (leg.subscriptionId !== null && remoteSubscriptionId !== null && remoteSubscriptionId !== undefined) {
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const bindings = await this.databaseService.database
          .select()
          .from(billingStripeCustomer)
          .where(
            and(
              eq(billingStripeCustomer.id, leg.customerBindingId),
              eq(billingStripeCustomer.accountId, leg.accountId),
              eq(billingStripeCustomer.environment, this.config.environment),
              eq(billingStripeCustomer.stripeAccountId, this.config.stripeAccountId),
              eq(billingStripeCustomer.livemode, this.config.livemode),
            ),
          )
          .limit(1);
        if (session.livemode !== this.config.livemode || bindings[0]?.stripeCustomerId !== customerId) return false;
        await this.databaseService.database.transaction(async (tx) => {
          await this.lockPaymentAccount(tx, leg.accountId);
          await tx
            .select({ id: subscription.id })
            .from(subscription)
            .where(and(eq(subscription.id, leg.subscriptionId ?? ''), eq(subscription.accountId, leg.accountId)))
            .for('update');
          await this.assertSourceClaim(tx, claim);
          await tx
            .update(subscription)
            .set({ stripeSubscriptionId: remoteSubscriptionId, updatedAt: new Date() })
            .where(
              and(
                eq(subscription.id, leg.subscriptionId ?? ''),
                eq(subscription.accountId, leg.accountId),
                isNull(subscription.stripeSubscriptionId),
              ),
            );
        });
        return true;
      }
    }
    if (claim.sourceType === 'invoice') return this.reconcileInvoice(claim.sourceId, claim);
    if (claim.sourceType === 'customer.subscription') {
      const remote = await this.sourceStripe.subscriptions.retrieve(claim.sourceId);
      if (remote.livemode !== this.config.livemode) return false;
      const remoteCustomerId = typeof remote.customer === 'string' ? remote.customer : remote.customer.id;
      const rows = await this.databaseService.database
        .select({ owned: subscription })
        .from(subscription)
        .innerJoin(
          billingStripeCustomer,
          and(
            eq(billingStripeCustomer.id, subscription.customerBindingId),
            eq(billingStripeCustomer.accountId, subscription.accountId),
          ),
        )
        .where(
          and(
            eq(subscription.environment, this.config.environment),
            eq(subscription.stripeSubscriptionId, remote.id),
            eq(billingStripeCustomer.stripeAccountId, this.config.stripeAccountId),
            eq(billingStripeCustomer.livemode, this.config.livemode),
            eq(billingStripeCustomer.stripeCustomerId, remoteCustomerId),
          ),
        )
        .limit(1);
      const ownedSubscription = rows[0]?.owned;
      const accountId = ownedSubscription?.accountId;
      if (!accountId) return false;
      const ended =
        remote.status === 'canceled' || remote.status === 'unpaid' || remote.status === 'incomplete_expired';
      await this.databaseService.database.transaction(async (tx) => {
        await this.lockPaymentAccount(tx, accountId);
        await tx
          .select({ id: subscription.id })
          .from(subscription)
          .where(eq(subscription.id, ownedSubscription.id))
          .for('update');
        await this.assertSourceClaim(tx, claim);
        await tx
          .update(subscription)
          .set({
            status: remote.status,
            slotState: ended ? 'ended' : ownedSubscription.slotState,
            cancelAtPeriodEnd: remote.cancel_at_period_end,
            canceledAt: remote.canceled_at === null ? null : new Date(remote.canceled_at * 1000),
            endedAt: remote.ended_at === null ? null : new Date(remote.ended_at * 1000),
            updatedAt: new Date(),
          })
          .where(and(eq(subscription.id, ownedSubscription.id), eq(subscription.accountId, accountId)));
      });
      return true;
    }
    return false;
  }

  private async reconcileInvoice(invoiceId: string, claim: SourceClaim): Promise<boolean> {
    const source = await fetchStripeInvoiceEvidence(this.sourceStripe, {
      invoiceId,
      maximumLinePages: 10,
      maximumPaymentPages: 10,
    });
    const remoteSubscriptionId =
      source.invoice.parent?.type === 'subscription_details'
        ? typeof source.invoice.parent.subscription_details?.subscription === 'string'
          ? source.invoice.parent.subscription_details.subscription
          : source.invoice.parent.subscription_details?.subscription?.id
        : undefined;
    if (remoteSubscriptionId === undefined) return false;
    const rows = await this.databaseService.database
      .select()
      .from(subscription)
      .where(eq(subscription.stripeSubscriptionId, remoteSubscriptionId))
      .limit(1);
    const owned = rows[0];
    if (
      owned?.accountId === null ||
      owned?.accountId === undefined ||
      owned.customerBindingId === null ||
      owned.offerSnapshot === null
    )
      return false;
    const { accountId, offerSnapshot } = owned;
    const bindings = await this.databaseService.database
      .select()
      .from(billingStripeCustomer)
      .where(
        and(
          eq(billingStripeCustomer.id, owned.customerBindingId),
          eq(billingStripeCustomer.accountId, accountId),
          eq(billingStripeCustomer.environment, this.config.environment),
          eq(billingStripeCustomer.stripeAccountId, this.config.stripeAccountId),
          eq(billingStripeCustomer.livemode, this.config.livemode),
        ),
      )
      .limit(1);
    const customerId = bindings[0]?.stripeCustomerId;
    if (customerId === null || customerId === undefined) return false;
    const parsedOffer = paymentOfferSnapshotSchema.parse(offerSnapshot);
    if (
      parsedOffer.accountId !== accountId ||
      parsedOffer.environment !== this.config.environment ||
      parsedOffer.stripeAccountId !== this.config.stripeAccountId ||
      parsedOffer.livemode !== this.config.livemode
    )
      throw new ConflictException({ code: 'invoice_scope_mismatch' });
    if (source.invoice.status !== 'paid') {
      const onlyLine = source.lines.length === 1 ? source.lines[0] : undefined;
      const details = onlyLine?.parent?.subscription_item_details;
      const priceId =
        onlyLine?.pricing?.price_details === undefined
          ? undefined
          : typeof onlyLine.pricing.price_details.price === 'string'
            ? onlyLine.pricing.price_details.price
            : onlyLine.pricing.price_details.price.id;
      const offer = parsedOffer;
      const failureTaxMinor = source.invoice.amount_due - source.invoice.subtotal;
      const exactFailureMatches =
        offer.taxMinor === null || offer.grossMinor === null
          ? offer.taxBasis === 'stripe_checkout'
          : Number(offer.taxMinor) === failureTaxMinor && Number(offer.grossMinor) === source.invoice.amount_due;
      const qualifiedFailure =
        claim.hasFailureEvent &&
        source.complete &&
        source.invoice.billing_reason === 'subscription_cycle' &&
        source.invoice.livemode === offer.livemode &&
        source.invoice.currency === offer.currency &&
        source.invoice.subtotal === Number(offer.principalMinor) &&
        failureTaxMinor >= 0 &&
        source.invoice.automatic_tax?.status === 'complete' &&
        exactFailureMatches &&
        source.invoice.amount_paid === 0 &&
        (typeof source.invoice.customer === 'string' ? source.invoice.customer : source.invoice.customer?.id) ===
          customerId &&
        onlyLine?.currency === 'usd' &&
        onlyLine.quantity === 1 &&
        details !== null &&
        details !== undefined &&
        !details.proration &&
        details.subscription === remoteSubscriptionId &&
        priceId === offer.stripePriceId &&
        onlyLine.amount === Number(offer.principalMinor) &&
        onlyLine.period.end > onlyLine.period.start;
      const boundary = qualifiedFailure && onlyLine !== undefined ? new Date(onlyLine.period.start * 1000) : undefined;
      if (boundary !== undefined) {
        await this.databaseService.database.transaction(async (tx) => {
          await this.lockPaymentAccount(tx, accountId);
          const locked = await tx
            .select({
              paidThrough: subscription.paidThrough,
              dunningStartedAt: subscription.dunningStartedAt,
              slotState: subscription.slotState,
            })
            .from(subscription)
            .where(eq(subscription.id, owned.id))
            .for('update');
          await this.assertSourceClaim(tx, claim);
          if (
            locked[0] !== undefined &&
            locked[0].slotState !== 'ended' &&
            (locked[0].paidThrough === null || boundary >= locked[0].paidThrough) &&
            locked[0].dunningStartedAt === null
          ) {
            const changed = await tx
              .update(subscription)
              .set({
                failedRenewalInvoiceId: invoiceId,
                dunningStartedAt: boundary,
                graceEndsAt: new Date(boundary.getTime() + 7 * 24 * 60 * 60 * 1000),
                updatedAt: new Date(),
              })
              .where(and(eq(subscription.id, owned.id), isNull(subscription.dunningStartedAt)))
              .returning({ id: subscription.id });
            if (changed[0] !== undefined) {
              await tx
                .insert(billingRecoveryNotice)
                .values({
                  id: randomUUID(),
                  accountId,
                  environment: this.config.environment,
                  kind: 'renewal_failed',
                  dedupeKey: `renewal-failed:${invoiceId}`,
                  subscriptionId: owned.id,
                  invoiceId,
                  payload: {
                    subscriptionId: owned.id,
                    invoiceId,
                    accountId,
                    // Pre-formatted here, where the Stripe invoice is already in hand, so the
                    // notice transport never has to call Stripe or format money and dates itself.
                    ...describeRenewalFailure(source.invoice),
                  },
                })
                .onConflictDoNothing();
            }
          }
        });
      }
      return false;
    }
    if (!source.complete || source.payments.length !== 1 || source.payments[0]?.payment.type !== 'payment_intent')
      return false;
    const paymentIntentId =
      typeof source.payments[0].payment.payment_intent === 'string'
        ? source.payments[0].payment.payment_intent
        : source.payments[0].payment.payment_intent?.id;
    if (paymentIntentId === undefined) return false;
    const remoteSubscription = await this.sourceStripe.subscriptions.retrieve(remoteSubscriptionId);
    const qualification = qualifySubscriptionInvoice({
      offer: parsedOffer,
      customerId,
      subscriptionId: remoteSubscriptionId,
      subscription: remoteSubscription,
      invoice: source,
      payment: await retrieveStripePaymentEvidence(this.sourceStripe, paymentIntentId),
    });
    if (qualification.status !== 'verified') return false;
    const periodId = await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, accountId);
      const existing = await tx
        .select()
        .from(billingPeriod)
        .where(eq(billingPeriod.invoiceId, invoiceId))
        .limit(1)
        .for('update');
      let periodId = existing[0]?.id;
      if (
        existing[0] !== undefined &&
        (existing[0].accountId !== accountId ||
          existing[0].subscriptionId !== owned.id ||
          existing[0].periodStart.getTime() !== qualification.periodStart.getTime() ||
          existing[0].periodEnd.getTime() !== qualification.periodEnd.getTime() ||
          existing[0].creditAtoms !== BigInt(offerSnapshot.creditAtoms))
      ) {
        throw new ConflictException({ code: 'invoice_period_conflict' });
      }
      if (periodId === undefined) {
        const overlapping = await tx
          .select({ id: billingPeriod.id })
          .from(billingPeriod)
          .where(
            and(
              eq(billingPeriod.subscriptionId, owned.id),
              ne(billingPeriod.invoiceId, invoiceId),
              lt(billingPeriod.periodStart, qualification.periodEnd),
              gt(billingPeriod.periodEnd, qualification.periodStart),
            ),
          )
          .limit(1)
          .for('update');
        await this.assertSourceClaim(tx, claim);
        if (overlapping[0] !== undefined) return undefined;
        periodId = randomUUID();
        await tx.insert(billingPeriod).values({
          id: periodId,
          accountId,
          sourceIdentity: `period:${owned.id}:${qualification.periodStart.toISOString()}:${qualification.periodEnd.toISOString()}`,
          creditAtoms: BigInt(offerSnapshot.creditAtoms),
          periodStart: qualification.periodStart,
          periodEnd: qualification.periodEnd,
          subscriptionId: owned.id,
          invoiceId,
          offerSnapshot,
          paidEvidence: qualification.evidence,
          state: 'verified',
          paidAt: new Date(qualification.evidence.paidAt),
        });
      } else {
        await this.assertSourceClaim(tx, claim);
      }
      return periodId;
    });
    if (periodId === undefined) return false;
    const cash = await this.qualifyInitialCash(accountId, periodId, 'plan', qualification.evidence);
    if (cash.status !== 'qualified' || !('sourceClaimId' in cash)) return false;
    try {
      await this.tax.observePaidSource({
        claim: {
          id: cash.sourceClaimId,
          generation: cash.sourceGeneration,
          environment: this.config.environment,
          stripeAccountId: this.config.stripeAccountId,
          livemode: this.config.livemode,
          sourceType: 'cash_charge',
          sourceId: qualification.evidence.chargeIds[0] ?? '',
          digest: cash.projectionDigest,
        },
        accountId,
        paidEvidence: qualification.evidence,
        invoice: source.invoice,
      });
      await this.databaseService.database.transaction(async (tx) => {
        await this.lockPaymentAccount(tx, accountId);
        await tx
          .select({ id: billingPeriod.id })
          .from(billingPeriod)
          .where(and(eq(billingPeriod.id, periodId), eq(billingPeriod.accountId, accountId)))
          .for('update');
        await this.assertSourceClaim(tx, claim);
        await this.ledger.applyCashDisposition(
          {
            accountId,
            causeId: periodId,
            source: 'plan',
            ...cash,
            occurredAt: cashOccurredAt(cash, qualification.evidence.paidAt),
          },
          tx,
        );
        await this.tax.observeQualifiedCashCorrection({
          transaction: tx,
          causeId: periodId,
          source: 'plan',
          qualified: cash,
        });
        await this.finishCashClaim(tx, cash.sourceClaimId, cash.sourceGeneration);
      });
    } catch (error) {
      await this.releaseQualifiedCashClaim(cash, 'paid_period_application_failed');
      throw error;
    }
    await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, accountId);
      await tx
        .select({ id: subscription.id })
        .from(subscription)
        .where(and(eq(subscription.id, owned.id), eq(subscription.accountId, accountId)))
        .for('update');
      await this.assertSourceClaim(tx, claim);
      const remoteEnded =
        remoteSubscription.status === 'canceled' ||
        remoteSubscription.status === 'unpaid' ||
        remoteSubscription.status === 'incomplete_expired';
      const periodEnd = qualification.periodEnd.toISOString();
      await tx
        .update(subscription)
        .set({
          slotState: remoteEnded
            ? 'ended'
            : sql`case when ${subscription.slotState} = 'ended' then 'ended' else 'current' end`,
          status: remoteEnded
            ? remoteSubscription.status
            : sql`case when ${subscription.slotState} = 'ended' then ${subscription.status} else ${remoteSubscription.status} end`,
          paidThrough: sql`greatest(coalesce(${subscription.paidThrough}, '-infinity'::timestamptz), ${periodEnd}::timestamptz)`,
          failedRenewalInvoiceId: sql`case when ${subscription.paidThrough} is null or ${periodEnd}::timestamptz > ${subscription.paidThrough} then null else ${subscription.failedRenewalInvoiceId} end`,
          dunningStartedAt: sql`case when ${subscription.paidThrough} is null or ${periodEnd}::timestamptz > ${subscription.paidThrough} then null else ${subscription.dunningStartedAt} end`,
          graceEndsAt: sql`case when ${subscription.paidThrough} is null or ${periodEnd}::timestamptz > ${subscription.paidThrough} then null else ${subscription.graceEndsAt} end`,
          updatedAt: new Date(),
        })
        .where(and(eq(subscription.id, owned.id), eq(subscription.accountId, accountId)));
    });
    return true;
  }

  private async finishSourceClaim(claim: SourceClaim): Promise<void> {
    await this.databaseService.database.transaction(async (tx) => {
      const source = await tx
        .select()
        .from(billingStripeSource)
        .where(
          and(
            eq(billingStripeSource.id, claim.id),
            eq(billingStripeSource.generation, claim.generation),
            eq(billingStripeSource.state, 'processing'),
            sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
          ),
        )
        .for('update');
      if (source[0] === undefined) return;
      for (const item of claim.inbox)
        await tx
          .update(stripeEventInbox)
          .set({ state: 'done', leaseUntil: null, errorCode: null })
          .where(
            and(
              eq(stripeEventInbox.id, item.id),
              eq(stripeEventInbox.claimGeneration, item.generation),
              eq(stripeEventInbox.state, 'processing'),
              sql`${stripeEventInbox.leaseUntil} > clock_timestamp()`,
            ),
          );
      const remaining = await tx
        .select({ id: stripeEventInbox.id })
        .from(stripeEventInbox)
        .where(
          and(
            eq(stripeEventInbox.environment, source[0].environment),
            eq(stripeEventInbox.stripeAccountId, source[0].stripeAccountId),
            eq(stripeEventInbox.livemode, source[0].livemode),
            eq(stripeEventInbox.sourceType, source[0].sourceType),
            eq(stripeEventInbox.sourceId, source[0].sourceId),
            ne(stripeEventInbox.state, 'done'),
          ),
        )
        .limit(1);
      await tx
        .update(billingStripeSource)
        .set({
          state: remaining[0] === undefined ? 'done' : 'pending',
          leaseUntil: null,
          errorCode: null,
          nextAttemptAt: sql`clock_timestamp()`,
        })
        .where(
          and(
            eq(billingStripeSource.id, claim.id),
            eq(billingStripeSource.generation, claim.generation),
            sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
          ),
        );
    });
  }

  private async releaseSourceClaim(claim: SourceClaim, errorCode: string): Promise<void> {
    await this.databaseService.database.transaction(async (tx) => {
      await tx
        .update(billingStripeSource)
        .set({
          state: 'pending',
          leaseUntil: null,
          nextAttemptAt: sql`clock_timestamp() + interval '30 seconds'`,
          errorCode,
        })
        .where(
          and(
            eq(billingStripeSource.id, claim.id),
            eq(billingStripeSource.generation, claim.generation),
            eq(billingStripeSource.state, 'processing'),
            sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
          ),
        );
      for (const item of claim.inbox)
        await tx
          .update(stripeEventInbox)
          .set({
            state: 'pending',
            leaseUntil: null,
            nextAttemptAt: sql`clock_timestamp() + interval '30 seconds'`,
            errorCode,
          })
          .where(
            and(
              eq(stripeEventInbox.id, item.id),
              eq(stripeEventInbox.claimGeneration, item.generation),
              eq(stripeEventInbox.state, 'processing'),
              sql`${stripeEventInbox.leaseUntil} > clock_timestamp()`,
            ),
          );
    });
  }

  private assertCollectionEnabled(): void {
    if (
      this.config.collection === null ||
      this.config.livemode ||
      this.config.environment.startsWith('prod-') ||
      (this.config.collection.kind === 'local_fixture') !== isLoopbackBillingStripeClient(this.stripe)
    ) {
      throw new ForbiddenException('payment_collection_disabled');
    }
  }

  private async ensureOwner(userId: string): Promise<Owner> {
    await this.ledger.ensureAccountBinding({ authUserId: userId, environment: this.config.environment });
    return this.resolveOwner(userId);
  }

  private async findOwner(userId: string): Promise<Owner | undefined> {
    const rows = await this.databaseService.database
      .select({ accountId: billingOwnerBinding.accountId })
      .from(billingOwnerBinding)
      .where(
        and(
          eq(billingOwnerBinding.authUserId, userId),
          eq(billingOwnerBinding.environment, this.config.environment),
          isNull(billingOwnerBinding.revokedAt),
        ),
      )
      .limit(1);
    return rows[0] === undefined
      ? undefined
      : { ownerId: userId, accountId: rows[0].accountId, subjectId: rows[0].accountId };
  }

  private async resolveOwner(userId: string): Promise<Owner> {
    const owner = await this.findOwner(userId);
    if (owner === undefined) throw new ForbiddenException('billing_owner_not_found');
    return owner;
  }

  private async ensureCustomer(owner: Owner): Promise<{ id: string; stripeCustomerId: string }> {
    const intent = await this.databaseService.database.transaction(async (tx): Promise<CustomerIntent> => {
      const candidateId = randomUUID();
      await tx
        .insert(billingStripeCustomer)
        .values({
          id: candidateId,
          accountId: owner.accountId,
          environment: this.config.environment,
          stripeAccountId: this.config.stripeAccountId,
          livemode: this.config.livemode,
        })
        .onConflictDoNothing();
      const rows = await tx
        .select()
        .from(billingStripeCustomer)
        .where(
          and(
            eq(billingStripeCustomer.accountId, owner.accountId),
            eq(billingStripeCustomer.environment, this.config.environment),
            eq(billingStripeCustomer.stripeAccountId, this.config.stripeAccountId),
            eq(billingStripeCustomer.livemode, this.config.livemode),
          ),
        )
        .limit(1)
        .for('update');
      const binding = rows[0];
      if (binding === undefined) throw new Error('Customer binding disappeared');
      if (binding.stripeCustomerId !== null) return { binding, dispatch: false, leg: undefined };
      const existing = await tx
        .select()
        .from(billingProviderLeg)
        .where(and(eq(billingProviderLeg.customerBindingId, binding.id), eq(billingProviderLeg.kind, 'customer')))
        .limit(1)
        .for('update');
      if (existing[0] !== undefined) return { binding, dispatch: false, leg: existing[0] };
      const legId = randomUUID();
      const request = { metadata: { tau_account_id: owner.accountId, tau_customer_binding_id: binding.id } };
      const inserted = await tx
        .insert(billingProviderLeg)
        .values({
          id: legId,
          accountId: owner.accountId,
          environment: this.config.environment,
          customerBindingId: binding.id,
          kind: 'customer',
          requestId: `customer:${binding.id}`,
          requestHash: digest(request),
          request,
          idempotencyKey: `tau:${legId}`,
          state: 'dispatched',
          dispatchStartedAt: new Date(),
          nextAttemptAt: new Date(),
        })
        .returning();
      return { binding, dispatch: true, leg: inserted[0] };
    });
    if (intent.binding.stripeCustomerId !== null)
      return { id: intent.binding.id, stripeCustomerId: intent.binding.stripeCustomerId };
    if (intent.leg === undefined) throw new Error('Customer creation intent is missing');
    const customerLeg = intent.leg;
    let customer: Stripe.Customer;
    if (intent.dispatch) {
      const created = await dispatchStripeLegOnce(
        this.stripe,
        parseStripeCreateLeg({
          kind: 'customer',
          idempotencyKey: customerLeg.idempotencyKey,
          request: customerLeg.request,
        }),
      );
      if (created.kind !== 'customer') throw new Error('Unexpected Stripe customer result');
      customer = created.object;
    } else {
      const recovered = await recoverStripeLegSource(this.sourceStripe, {
        kind: 'customer',
        providerObjectId: customerLeg.providerObjectId ?? undefined,
        metadataKey: 'tau_customer_binding_id',
        metadataValue: intent.binding.id,
      });
      if (recovered.status !== 'known') throw new ConflictException({ code: 'customer_creation_outcome_unknown' });
      if (recovered.object.kind !== 'customer') throw new Error('Unexpected Stripe customer result');
      customer = recovered.object.object;
    }
    const expectedMetadata = intent.leg.request['metadata'];
    const expectedAccountId =
      typeof expectedMetadata === 'object' && expectedMetadata !== null
        ? (expectedMetadata as Record<string, unknown>)['tau_account_id']
        : undefined;
    const expectedBindingId =
      typeof expectedMetadata === 'object' && expectedMetadata !== null
        ? (expectedMetadata as Record<string, unknown>)['tau_customer_binding_id']
        : undefined;
    if (
      customer.livemode !== this.config.livemode ||
      customer.metadata['tau_account_id'] !== expectedAccountId ||
      customer.metadata['tau_customer_binding_id'] !== expectedBindingId ||
      expectedAccountId !== owner.accountId ||
      expectedBindingId !== intent.binding.id
    ) {
      throw new ConflictException({ code: 'customer_creation_scope_mismatch' });
    }
    await this.databaseService.database.transaction(async (tx) => {
      await tx
        .update(billingStripeCustomer)
        .set({ stripeCustomerId: customer.id })
        .where(and(eq(billingStripeCustomer.id, intent.binding.id), isNull(billingStripeCustomer.stripeCustomerId)));
      await tx
        .update(billingProviderLeg)
        .set({ providerObjectId: customer.id, state: 'known' })
        .where(and(eq(billingProviderLeg.id, customerLeg.id), isNull(billingProviderLeg.providerObjectId)));
    });
    return { id: intent.binding.id, stripeCustomerId: customer.id };
  }

  private async selectOwnedDefaultCard(
    customerId: string,
  ): Promise<NonNullable<PaymentOfferSnapshot['paymentMethod']>> {
    const customer = await this.sourceStripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if (customer.deleted) throw new ConflictException({ code: 'customer_deleted' });
    // Same preference as resolveDefaultCard (the card shown is the card charged): the invoice default,
    // else the most recent saved card. Hosted Checkout saves cards without setting an invoice default.
    const value =
      customer.invoice_settings.default_payment_method ??
      (await this.sourceStripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })).data[0];
    const id = typeof value === 'string' ? value : value?.id;
    if (id === undefined) throw new ConflictException({ code: 'saved_card_not_found' });
    const method =
      typeof value === 'object' && value !== null ? value : await this.sourceStripe.paymentMethods.retrieve(id);
    if (
      (typeof method.customer === 'string' ? method.customer : method.customer?.id) !== customerId ||
      method.type !== 'card' ||
      method.card === undefined
    )
      throw new ConflictException({ code: 'saved_card_not_owned' });
    return { id, brand: method.card.brand, last4: method.card.last4 };
  }

  private manualProviderRequest(
    actionId: string,
    providerLegId: string,
    customerBindingId: string,
    customerId: string,
    offer: PaymentOfferSnapshot,
    input: TopupRequest,
  ): Record<string, unknown> {
    const returnUrl = new URL(input.returnPath, this.config.uiOrigin);
    returnUrl.searchParams.set('payment_action', actionId);
    const metadata = {
      tau_purchase_id: actionId,
      tau_provider_leg_id: providerLegId,
      tau_customer_binding_id: customerBindingId,
    };
    if (input.method === 'saved_card') {
      const totals = exactPaymentOfferTotals(offer);
      return {
        amount: Number(totals.grossMinor),
        currency: 'usd',
        customer: customerId,
        payment_method: offer.paymentMethod?.id,
        confirm: true,
        metadata,
      };
    }
    return {
      mode: 'payment',
      customer: customerId,
      client_reference_id: actionId,
      success_url: returnUrl.href,
      cancel_url: returnUrl.href,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product: offer.stripeProductId,
            tax_behavior: 'exclusive',
            unit_amount: Number(offer.principalMinor),
          },
          quantity: 1,
        },
      ],
      metadata,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      payment_method_types: ['card'],
      payment_intent_data: { metadata, setup_future_usage: 'on_session' },
      tax_id_collection: { enabled: true },
    };
  }

  private async claimPurchaseLeg(accountId: string, actionId: string) {
    return this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, accountId);
      await this.cash.assertNewCollectionScope(accountId, tx);
      const purchase = await this.ownedPurchase(accountId, actionId, tx);
      if (purchase.state !== 'prepared') return undefined;
      const rows = await tx
        .select()
        .from(billingProviderLeg)
        .where(and(eq(billingProviderLeg.purchaseId, actionId), eq(billingProviderLeg.state, 'prepared')))
        .limit(1)
        .for('update');
      const row = rows[0];
      if (row === undefined) return undefined;
      if (row.kind === 'payment_intent' && purchase.purpose === 'manual_saved_card') {
        const frozenExpiry = purchase.taxEvidence?.['expiresAt'];
        const quotedUntil = typeof frozenExpiry === 'string' ? new Date(frozenExpiry) : undefined;
        const [quote] =
          quotedUntil === undefined || Number.isNaN(quotedUntil.getTime())
            ? []
            : await tx.execute<{ expired: boolean }>(
                sql`select ${quotedUntil.toISOString()}::timestamptz <= clock_timestamp() as expired`,
              );
        if (quote?.expired !== false) {
          await tx
            .update(billingProviderLeg)
            .set({ state: 'no_charge', errorCode: 'manual_tax_calculation_expired' })
            .where(and(eq(billingProviderLeg.id, row.id), eq(billingProviderLeg.state, 'prepared')));
          await tx
            .update(billingPurchase)
            .set({ state: 'failed', updatedAt: new Date() })
            .where(and(eq(billingPurchase.id, actionId), eq(billingPurchase.state, 'prepared')));
          return undefined;
        }
      }
      await tx
        .update(billingPurchase)
        .set({ state: 'creating', updatedAt: new Date() })
        .where(eq(billingPurchase.id, actionId));
      await tx
        .update(billingProviderLeg)
        .set({ state: 'dispatched', dispatchStartedAt: new Date() })
        .where(and(eq(billingProviderLeg.id, row.id), eq(billingProviderLeg.state, 'prepared')));
      if (row.kind === 'payment_intent') {
        return {
          id: row.id,
          customerBindingId: row.customerBindingId,
          expectedPaymentMethodId: paymentMethodId(row.request),
          leg: parseStripeCreateLeg({
            kind: 'payment_intent',
            idempotencyKey: row.idempotencyKey,
            request: row.request,
          }),
        };
      }
      const offer = paymentOfferSnapshotSchema.parse(purchase.offerSnapshot);
      return {
        id: row.id,
        customerBindingId: row.customerBindingId,
        expectedPaymentMethodId: paymentMethodId(row.request),
        leg: parseStripeCreateLeg({
          kind: 'checkout',
          idempotencyKey: row.idempotencyKey,
          request: row.request,
          checkoutContract: {
            kind: 'top_up',
            productId: offer.stripeProductId ?? '',
            principalMinor: Number(offer.principalMinor),
          },
          onSessionSaveConsent: true,
        }),
      };
    });
  }

  private async reconcilePurchase(
    accountId: string,
    purchaseId: string,
    paymentIntentId: string,
    claim?: SourceClaim,
    expected?: {
      providerLegId: string;
      customerBindingId: string;
      expectedPaymentMethodId?: string;
      checkoutSessionId?: string;
    },
    providerClaim?: { readonly id: string; readonly leaseUntil: Date },
  ): Promise<boolean> {
    const purchase = await this.ownedPurchase(accountId, purchaseId);
    if (purchase.state === 'fulfilled') {
      const source = await retrieveStripePaymentEvidence(this.sourceStripe, paymentIntentId);
      const chargeId = source.latestCharge?.id;
      return paymentIntentId === purchase.paymentIntentId && chargeId === purchase.chargeId;
    }
    if (purchase.state === 'paid_unfulfilled') {
      const evidence = paidPaymentEvidenceSchema.parse(purchase.paidEvidence);
      if (evidence.paymentIntentIds[0] !== paymentIntentId || evidence.chargeIds[0] !== purchase.chargeId) {
        throw new ConflictException({ code: 'payment_proof_scope_mismatch' });
      }
      const cash = await this.qualifyInitialCash(accountId, purchaseId, 'purchased', evidence);
      if (cash.status !== 'qualified' || !('sourceClaimId' in cash)) return false;
      try {
        await this.tax.observePaidSource({
          claim: {
            id: cash.sourceClaimId,
            generation: cash.sourceGeneration,
            environment: this.config.environment,
            stripeAccountId: this.config.stripeAccountId,
            livemode: this.config.livemode,
            sourceType: 'cash_charge',
            sourceId: evidence.chargeIds[0] ?? '',
            digest: cash.projectionDigest,
          },
          accountId,
          paidEvidence: evidence,
        });
        await this.databaseService.database.transaction(async (tx) => {
          await this.lockPaymentAccount(tx, accountId);
          await tx
            .select({ id: billingPurchase.id })
            .from(billingPurchase)
            .where(
              and(
                eq(billingPurchase.id, purchaseId),
                eq(billingPurchase.accountId, accountId),
                eq(billingPurchase.state, 'paid_unfulfilled'),
              ),
            )
            .for('update');
          if (claim !== undefined) await this.assertSourceClaim(tx, claim);
          if (providerClaim !== undefined)
            await this.assertProviderLegClaim(tx, providerClaim.id, providerClaim.leaseUntil);
          await this.ledger.applyCashDisposition(
            {
              accountId,
              causeId: purchaseId,
              source: 'purchased',
              ...cash,
              occurredAt: cashOccurredAt(cash, evidence.paidAt),
            },
            tx,
          );
          await this.tax.observeQualifiedCashCorrection({
            transaction: tx,
            causeId: purchaseId,
            source: 'purchased',
            qualified: cash,
          });
          await this.finishCashClaim(tx, cash.sourceClaimId, cash.sourceGeneration);
        });
      } catch (error) {
        await this.releaseQualifiedCashClaim(cash, 'paid_purchase_application_failed');
        throw error;
      }
      return true;
    }
    const bindingRows = await this.databaseService.database
      .select()
      .from(billingStripeCustomer)
      .where(
        and(
          eq(billingStripeCustomer.id, purchase.customerBindingId ?? ''),
          eq(billingStripeCustomer.accountId, accountId),
          eq(billingStripeCustomer.environment, this.config.environment),
          eq(billingStripeCustomer.stripeAccountId, this.config.stripeAccountId),
          eq(billingStripeCustomer.livemode, this.config.livemode),
        ),
      )
      .limit(1);
    const binding = bindingRows[0];
    if (binding?.stripeCustomerId === null || binding?.stripeCustomerId === undefined)
      throw new Error('Customer binding is incomplete');
    if (expected === undefined) throw new Error('Payment leg proof is missing');
    const checkout =
      expected.checkoutSessionId === undefined
        ? undefined
        : await fetchStripeCheckoutSource(this.sourceStripe, {
            sessionId: expected.checkoutSessionId,
            maximumLinePages: 10,
          });
    const offer = paymentOfferSnapshotSchema.parse(purchase.offerSnapshot);
    if (
      offer.accountId !== accountId ||
      offer.environment !== this.config.environment ||
      offer.stripeAccountId !== this.config.stripeAccountId ||
      offer.livemode !== this.config.livemode ||
      expected.customerBindingId !== binding.id
    ) {
      throw new ConflictException({ code: 'payment_proof_scope_mismatch' });
    }
    const paymentSource = await retrieveStripePaymentEvidence(this.sourceStripe, paymentIntentId);
    const qualification = qualifyManualPayment({
      offer,
      customerId: binding.stripeCustomerId,
      customerBindingId: expected.customerBindingId,
      providerLegId: expected.providerLegId,
      purchaseId,
      paymentMethod: expected.expectedPaymentMethodId === undefined ? null : offer.paymentMethod,
      checkout,
      sourceAcceptance:
        claim?.sourceAcceptedAt === undefined
          ? undefined
          : { type: 'payment_intent.succeeded', createdAt: claim.sourceAcceptedAt },
      source: paymentSource,
    });
    if (qualification.status !== 'paid') {
      const quotedGrossMinor = offer.grossMinor === null ? undefined : Number(offer.grossMinor);
      const authenticationRequired =
        paymentSource.paymentIntent.status === 'requires_action' &&
        paymentSource.paymentIntent.id === paymentIntentId &&
        paymentSource.paymentIntent.livemode === offer.livemode &&
        stripeObjectId(paymentSource.paymentIntent.customer) === binding.stripeCustomerId &&
        paymentSource.paymentIntent.currency === offer.currency &&
        quotedGrossMinor !== undefined &&
        paymentSource.paymentIntent.amount === quotedGrossMinor &&
        paymentSource.paymentIntent.metadata['tau_purchase_id'] === purchaseId &&
        paymentSource.paymentIntent.metadata['tau_provider_leg_id'] === expected.providerLegId &&
        paymentSource.paymentIntent.metadata['tau_customer_binding_id'] === expected.customerBindingId &&
        expected.expectedPaymentMethodId !== undefined &&
        offer.paymentMethod?.id === expected.expectedPaymentMethodId &&
        stripeObjectId(paymentSource.paymentIntent.payment_method) === expected.expectedPaymentMethodId;
      const automaticNoCharge = qualification.status === 'no_charge' && purchase.purpose === 'automatic';
      await this.databaseService.database.transaction(async (tx) => {
        await this.lockPaymentAccount(tx, accountId);
        await tx
          .select({ id: billingPurchase.id })
          .from(billingPurchase)
          .where(and(eq(billingPurchase.id, purchaseId), eq(billingPurchase.accountId, accountId)))
          .for('update');
        if (claim !== undefined) await this.assertSourceClaim(tx, claim);
        if (providerClaim !== undefined)
          await this.assertProviderLegClaim(tx, providerClaim.id, providerClaim.leaseUntil);
        if (automaticNoCharge) {
          const noChargeEvidence = noChargeEvidenceSchema.parse({
            version: 'stripe-no-charge-v1',
            status: 'canceled',
            paymentIntentId,
            customerId: binding.stripeCustomerId,
            stripeAccountId: this.config.stripeAccountId,
            livemode: this.config.livemode,
            amountReceived: '0',
            amountCapturable: '0',
            chargeId: paymentSource.latestCharge?.id ?? null,
            amountCaptured: String(paymentSource.latestCharge?.amount_captured ?? 0),
            sourceDigest: digest(paymentSource),
            observedAt: new Date().toISOString(),
          });
          await tx
            .update(billingProviderLeg)
            .set({
              state: 'no_charge',
              // A provider-side cancellation closes the same lifecycle the constraint requires to be opened first.
              cancellationRequestedAt: sql`coalesce(${billingProviderLeg.cancellationRequestedAt}, clock_timestamp())`,
              cancellationConfirmedAt: sql`coalesce(${billingProviderLeg.cancellationConfirmedAt}, clock_timestamp())`,
              noChargeEvidence,
              errorCode: null,
            })
            .where(
              and(eq(billingProviderLeg.id, expected.providerLegId), eq(billingProviderLeg.purchaseId, purchaseId)),
            );
          await tx
            .update(billingPurchase)
            .set({
              state: 'failed',
              automaticTerminalOutcome: 'no_charge_failure',
              automaticTerminalAt: sql`clock_timestamp()`,
              updatedAt: new Date(),
            })
            .where(and(eq(billingPurchase.id, purchaseId), isNull(billingPurchase.automaticTerminalOutcome)));
          if (purchase.reloadConsentId !== null) {
            const consentState = await tx
              .update(billingReloadConsent)
              .set({
                consecutiveTerminalFailures: sql`${billingReloadConsent.consecutiveTerminalFailures} + 1`,
                state: sql`case when ${billingReloadConsent.consecutiveTerminalFailures} + 1 >= ${billingReloadConsent.terminalFailureLimit} then 'disabled_failures' else ${billingReloadConsent.state} end`,
                updatedAt: new Date(),
              })
              .where(
                and(eq(billingReloadConsent.id, purchase.reloadConsentId), eq(billingReloadConsent.state, 'enabled')),
              )
              .returning({ state: billingReloadConsent.state });
            if (consentState[0]?.state === 'disabled_failures') {
              await tx
                .insert(billingRecoveryNotice)
                .values({
                  id: randomUUID(),
                  accountId,
                  environment: this.config.environment,
                  kind: 'consent_disabled',
                  dedupeKey: `consent-disabled:${purchase.reloadConsentId}`,
                  purchaseId,
                  consentId: purchase.reloadConsentId,
                  payload: { consentId: purchase.reloadConsentId, actionId: purchaseId },
                })
                .onConflictDoNothing();
            }
          }
        } else if (authenticationRequired) {
          await tx
            .update(billingProviderLeg)
            .set({ state: 'attention', errorCode: 'authentication_required' })
            .where(
              and(
                eq(billingProviderLeg.id, expected.providerLegId),
                eq(billingProviderLeg.purchaseId, purchaseId),
                eq(billingProviderLeg.kind, 'payment_intent'),
              ),
            );
          if (purchase.purpose === 'automatic' && purchase.reloadConsentId !== null) {
            await tx
              .insert(billingRecoveryNotice)
              .values({
                id: randomUUID(),
                accountId,
                environment: this.config.environment,
                kind: 'authentication_required',
                dedupeKey: `authentication-required:${purchaseId}`,
                purchaseId,
                consentId: purchase.reloadConsentId,
                payload: { actionId: purchaseId, consentId: purchase.reloadConsentId },
              })
              .onConflictDoNothing();
          }
        } else {
          await tx
            .update(billingProviderLeg)
            .set({
              state: qualification.status === 'pending' ? 'known' : 'attention',
              errorCode: qualification.status === 'pending' ? null : 'provider_source_invalid',
            })
            .where(
              and(eq(billingProviderLeg.id, expected.providerLegId), eq(billingProviderLeg.purchaseId, purchaseId)),
            );
        }
        if (!automaticNoCharge)
          await tx
            .update(billingPurchase)
            .set({
              state: authenticationRequired || qualification.status !== 'pending' ? 'attention' : 'pending',
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(billingPurchase.id, purchaseId),
                ne(billingPurchase.state, 'paid_unfulfilled'),
                ne(billingPurchase.state, 'fulfilled'),
              ),
            );
      });
      return false;
    }
    await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, accountId);
      await tx
        .select({ id: billingPurchase.id })
        .from(billingPurchase)
        .where(and(eq(billingPurchase.id, purchaseId), eq(billingPurchase.accountId, accountId)))
        .for('update');
      if (claim !== undefined) await this.assertSourceClaim(tx, claim);
      if (providerClaim !== undefined)
        await this.assertProviderLegClaim(tx, providerClaim.id, providerClaim.leaseUntil);
      await tx
        .update(billingPurchase)
        .set({
          state: 'paid_unfulfilled',
          paidAt: new Date(qualification.evidence.paidAt),
          paidEvidence: qualification.evidence,
          paymentIntentId: qualification.evidence.paymentIntentIds[0],
          chargeId: qualification.evidence.chargeIds[0],
          automaticSourceAcceptedAt: sql`case when ${billingPurchase.purpose} = 'automatic' then coalesce(${billingPurchase.automaticSourceAcceptedAt}, ${new Date(qualification.evidence.paidAt).toISOString()}::timestamptz) else ${billingPurchase.automaticSourceAcceptedAt} end`,
          automaticTerminalOutcome: sql`case when ${billingPurchase.purpose} = 'automatic' then 'paid' else ${billingPurchase.automaticTerminalOutcome} end`,
          automaticTerminalAt: sql`case when ${billingPurchase.purpose} = 'automatic' then coalesce(${billingPurchase.automaticTerminalAt}, clock_timestamp()) else ${billingPurchase.automaticTerminalAt} end`,
          updatedAt: new Date(),
        })
        .where(and(eq(billingPurchase.id, purchaseId), ne(billingPurchase.state, 'fulfilled')));
      if (purchase.reloadConsentId !== null) {
        await tx
          .update(billingReloadConsent)
          .set({ consecutiveTerminalFailures: 0, updatedAt: new Date() })
          .where(eq(billingReloadConsent.id, purchase.reloadConsentId));
      }
    });
    const taxTransaction = await this.paidTaxTransaction(purchase, qualification.evidence);
    const cash = await this.qualifyInitialCash(accountId, purchaseId, 'purchased', qualification.evidence);
    if (cash.status !== 'qualified' || !('sourceClaimId' in cash)) return false;
    try {
      await this.tax.observePaidSource({
        claim: {
          id: cash.sourceClaimId,
          generation: cash.sourceGeneration,
          environment: this.config.environment,
          stripeAccountId: this.config.stripeAccountId,
          livemode: this.config.livemode,
          sourceType: 'cash_charge',
          sourceId: qualification.evidence.chargeIds[0] ?? '',
          digest: cash.projectionDigest,
        },
        accountId,
        paidEvidence: qualification.evidence,
        ...(checkout === undefined ? {} : { checkout: checkout.session }),
        ...(taxTransaction === undefined ? {} : { taxTransaction }),
      });
      await this.databaseService.database.transaction(async (tx) => {
        await this.lockPaymentAccount(tx, accountId);
        await tx
          .select({ id: billingPurchase.id })
          .from(billingPurchase)
          .where(and(eq(billingPurchase.id, purchaseId), eq(billingPurchase.accountId, accountId)))
          .for('update');
        if (claim !== undefined) await this.assertSourceClaim(tx, claim);
        if (providerClaim !== undefined)
          await this.assertProviderLegClaim(tx, providerClaim.id, providerClaim.leaseUntil);
        await this.ledger.applyCashDisposition(
          {
            accountId,
            causeId: purchaseId,
            source: 'purchased',
            ...cash,
            occurredAt: cashOccurredAt(cash, qualification.evidence.paidAt),
          },
          tx,
        );
        await this.tax.observeQualifiedCashCorrection({
          transaction: tx,
          causeId: purchaseId,
          source: 'purchased',
          qualified: cash,
        });
        await this.finishCashClaim(tx, cash.sourceClaimId, cash.sourceGeneration);
      });
    } catch (error) {
      await this.releaseQualifiedCashClaim(cash, 'paid_purchase_application_failed');
      throw error;
    }
    return true;
  }

  private async releaseQualifiedCashClaim(
    cash: Extract<CashQualificationResult, { status: 'qualified' }>,
    reason: string,
  ): Promise<void> {
    await this.cash.releaseQualifiedClaim({
      environment: this.config.environment,
      stripeAccountId: this.config.stripeAccountId,
      livemode: this.config.livemode,
      sourceClaimId: cash.sourceClaimId,
      sourceGeneration: cash.sourceGeneration,
      reason,
    });
  }

  private async qualifyInitialCash(
    accountId: string,
    causeId: string,
    source: 'plan' | 'purchased',
    evidence: {
      readonly stripeAccountId: string;
      readonly livemode: boolean;
      readonly customerId: string;
      readonly paymentIntentIds: readonly string[];
      readonly chargeIds: readonly string[];
      readonly currency: string;
      readonly principalMinor: string;
      readonly taxMinor: string;
    },
  ): Promise<CashQualificationResult | UnclaimedCashProjection> {
    const paymentIntentId = evidence.paymentIntentIds[0];
    const chargeId = evidence.chargeIds[0];
    if (paymentIntentId === undefined || chargeId === undefined) {
      return { status: 'attention', reason: 'cash_source_identity_missing' };
    }
    return this.cash.qualifyInitialPayment({
      environment: this.config.environment,
      accountId,
      causeId,
      source,
      stripeAccountId: evidence.stripeAccountId,
      livemode: evidence.livemode,
      customerId: evidence.customerId,
      paymentIntentId,
      chargeId,
      currency: evidence.currency,
      originalPrincipalMinor: BigInt(evidence.principalMinor),
      originalTaxMinor: BigInt(evidence.taxMinor),
      maximumRefundPages: 10,
    });
  }

  private async finishCashClaim(tx: Transaction, id: string, generation: bigint): Promise<void> {
    const rows = await tx
      .update(billingStripeSource)
      .set({
        state: 'done',
        leaseUntil: null,
        nextAttemptAt: new Date('9999-12-31T00:00:00Z'),
        errorCode: null,
      })
      .where(
        and(
          eq(billingStripeSource.id, id),
          eq(billingStripeSource.generation, generation),
          eq(billingStripeSource.state, 'processing'),
          sql`${billingStripeSource.leaseUntil} > clock_timestamp()`,
        ),
      )
      .returning({ id: billingStripeSource.id });
    if (rows[0] === undefined) throw new ConflictException({ code: 'stale_cash_source_claim' });
  }

  private async confirmReloadConsent(
    owner: Owner,
    consent: typeof billingReloadConsent.$inferSelect,
  ): Promise<WirePaymentAction> {
    if (consent.state !== 'pending_setup') throw new ConflictException({ code: 'reload_consent_not_confirmable' });
    const returnUrl = this.returnUrl(consent.returnPath, consent.id);
    const request: Record<string, unknown> = {
      kind: 'checkout_setup',
      customerBindingId: consent.customerBindingId,
      consentId: consent.id,
      consentVersion: consent.version,
      successUrl: returnUrl,
      cancelUrl: returnUrl,
    };
    const intent = await this.databaseService.database.transaction(async (tx) => {
      await this.lockPaymentAccount(tx, owner.accountId);
      const [current] = await tx
        .select()
        .from(billingReloadConsent)
        .where(
          and(
            eq(billingReloadConsent.id, consent.id),
            eq(billingReloadConsent.accountId, owner.accountId),
            eq(billingReloadConsent.state, 'pending_setup'),
            eq(billingReloadConsent.version, consent.version),
            eq(billingReloadConsent.customerBindingId, consent.customerBindingId),
          ),
        )
        .for('update');
      if (current === undefined) throw new ConflictException({ code: 'reload_consent_not_confirmable' });
      await tx
        .update(billingReloadConsent)
        .set({
          consentedAt: sql`coalesce(${billingReloadConsent.consentedAt}, clock_timestamp())`,
          updatedAt: new Date(),
        })
        .where(eq(billingReloadConsent.id, consent.id));
      let [leg] = await tx
        .select()
        .from(billingProviderLeg)
        .where(and(eq(billingProviderLeg.reloadConsentId, consent.id), eq(billingProviderLeg.kind, 'checkout_setup')))
        .limit(1)
        .for('update');
      if (leg === undefined) {
        const legId = randomUUID();
        [leg] = await tx
          .insert(billingProviderLeg)
          .values({
            id: legId,
            accountId: owner.accountId,
            environment: this.config.environment,
            customerBindingId: consent.customerBindingId,
            reloadConsentId: consent.id,
            kind: 'checkout_setup',
            requestId: consent.requestId,
            requestHash: digest(request),
            request,
            idempotencyKey: `tau:${legId}`,
            nextAttemptAt: new Date(),
          })
          .returning();
      }
      if (leg === undefined || leg.requestHash !== digest(request))
        throw new ConflictException({ code: 'reload_setup_request_conflict' });
      if (leg.providerObjectId !== null) return { leg, dispatch: false };
      if (leg.state !== 'prepared') throw new ConflictException({ code: 'reload_setup_outcome_unknown' });
      const [claimed] = await tx
        .update(billingProviderLeg)
        .set({ state: 'dispatched', dispatchStartedAt: new Date() })
        .where(and(eq(billingProviderLeg.id, leg.id), eq(billingProviderLeg.state, 'prepared')))
        .returning();
      if (claimed === undefined) throw new ConflictException({ code: 'reload_setup_outcome_unknown' });
      return { leg: claimed, dispatch: true };
    });
    if (intent.dispatch) {
      const customer = await this.ownedCustomer(owner.accountId, consent.customerBindingId);
      const session = await createStripeSetupCheckoutOnce(this.stripe, {
        idempotencyKey: intent.leg.idempotencyKey,
        customerId: customer.stripeCustomerId,
        consentId: consent.id,
        consentVersion: consent.version,
        providerLegId: intent.leg.id,
        successUrl: returnUrl,
        cancelUrl: returnUrl,
      });
      if (session.url === null) throw new ServiceUnavailableException('stripe_setup_redirect_missing');
      const linked = await this.databaseService.database
        .update(billingProviderLeg)
        .set({
          providerObjectId: session.id,
          redirectUrl: session.url,
          expiresAt: new Date(session.expires_at * 1000),
          state: 'known',
          errorCode: null,
        })
        .where(
          and(
            eq(billingProviderLeg.id, intent.leg.id),
            eq(billingProviderLeg.accountId, owner.accountId),
            eq(billingProviderLeg.reloadConsentId, consent.id),
            eq(billingProviderLeg.requestHash, digest(request)),
            eq(billingProviderLeg.state, 'dispatched'),
          ),
        )
        .returning({ id: billingProviderLeg.id });
      if (linked[0] === undefined) throw new ConflictException({ code: 'reload_setup_result_stale' });
    }
    return this.getReloadConsentAction(owner, consent.id);
  }

  private async getReloadConsentAction(owner: Owner, consentId: string): Promise<WirePaymentAction> {
    return this.reloadConsentAction(owner, await this.ownedReloadConsent(owner.accountId, consentId));
  }

  private async ownedReloadConsent(
    accountId: string,
    consentId: string,
  ): Promise<typeof billingReloadConsent.$inferSelect> {
    const rows = await this.databaseService.database
      .select()
      .from(billingReloadConsent)
      .where(and(eq(billingReloadConsent.id, consentId), eq(billingReloadConsent.accountId, accountId)))
      .limit(1);
    if (rows[0] === undefined) throw new NotFoundException('Reload consent not found');
    return rows[0];
  }

  private async ownedCustomer(accountId: string, bindingId: string): Promise<{ readonly stripeCustomerId: string }> {
    const rows = await this.databaseService.database
      .select()
      .from(billingStripeCustomer)
      .where(
        and(
          eq(billingStripeCustomer.id, bindingId),
          eq(billingStripeCustomer.accountId, accountId),
          eq(billingStripeCustomer.environment, this.config.environment),
          eq(billingStripeCustomer.stripeAccountId, this.config.stripeAccountId),
          eq(billingStripeCustomer.livemode, this.config.livemode),
        ),
      )
      .limit(1);
    const stripeCustomerId = rows[0]?.stripeCustomerId;
    if (stripeCustomerId === null || stripeCustomerId === undefined)
      throw new ConflictException({ code: 'stripe_customer_missing' });
    return { stripeCustomerId };
  }

  private paymentFrozen(offer: PaymentOfferSnapshot): NonNullable<WirePaymentAction['frozen']> {
    return {
      offerId: offer.offerId,
      currency: 'usd',
      principalMinor: offer.principalMinor,
      taxMinor: offer.taxMinor,
      grossMinor: offer.grossMinor,
      maximumGrossMinor: offer.maximumGrossMinor,
      creditAtoms: offer.creditAtoms,
      paymentMethod:
        offer.paymentMethod === null ? null : { brand: offer.paymentMethod.brand, last4: offer.paymentMethod.last4 },
    };
  }

  private async reloadConsentAction(
    owner: Owner,
    consent: typeof billingReloadConsent.$inferSelect,
  ): Promise<WirePaymentAction> {
    const legs = await this.databaseService.database
      .select()
      .from(billingProviderLeg)
      .where(and(eq(billingProviderLeg.reloadConsentId, consent.id), eq(billingProviderLeg.kind, 'checkout_setup')))
      .orderBy(desc(billingProviderLeg.createdAt))
      .limit(1);
    const leg = legs[0];
    const state =
      consent.state === 'enabled'
        ? 'completed'
        : leg?.redirectUrl
          ? 'redirect_required'
          : consent.state === 'revoked'
            ? 'canceled'
            : 'prepared';
    return wirePaymentActionSchema.parse({
      version: 'payment-action-v1',
      actionId: consent.id,
      environment: this.config.environment,
      ownerId: owner.ownerId,
      subjectId: owner.subjectId,
      purpose: 'reload_setup',
      state,
      frozen: this.paymentFrozen(paymentOfferSnapshotSchema.parse(consent.offerSnapshot)),
      redirectUrl: state === 'redirect_required' ? (leg?.redirectUrl ?? null) : null,
      attention: null,
      receipt: null,
      updatedAt: consent.updatedAt.toISOString(),
    });
  }

  private async reloadConsentToWire(
    owner: Owner,
    consent: typeof billingReloadConsent.$inferSelect,
  ): Promise<WireAutoReloadConsent> {
    const evidence = consent.taxEvidence;
    const expiresAt = typeof evidence['expiresAt'] === 'string' ? evidence['expiresAt'] : undefined;
    if (expiresAt === undefined) throw new Error('Reload consent tax expiry is missing');
    const action = await this.reloadConsentAction(owner, consent);
    return wireAutoReloadConsentSchema.parse({
      version: 'auto-reload-consent-v1',
      environment: this.config.environment,
      ownerId: owner.ownerId,
      subjectId: owner.subjectId,
      consentId: consent.id,
      consentVersion: consent.version,
      state: consent.state,
      setupAction: action,
      paymentMethod:
        consent.paymentMethod === null
          ? null
          : {
              brand: consent.paymentMethod.brand,
              last4: consent.paymentMethod.last4,
            },
      terms: {
        offerId: paymentOfferSnapshotSchema.parse(consent.offerSnapshot).offerId,
        currency: 'usd',
        thresholdAtoms: consent.thresholdAtoms.toString(),
        principalMinor: consent.principalMinor.toString(),
        quotedTaxMinor: consent.quotedTaxMinor.toString(),
        grossCeilingMinor: consent.grossCeilingMinor.toString(),
        monthlyGrossCapMinor: consent.monthlyGrossCapMinor.toString(),
        minimumCadenceSeconds: consent.minimumCadenceSeconds,
        terminalFailureLimit: consent.terminalFailureLimit,
        taxQuoteExpiresAt: expiresAt,
      },
      updatedAt: consent.updatedAt.toISOString(),
    });
  }

  private async assertSourceClaim(tx: Transaction, claim: Pick<SourceClaim, 'id' | 'generation'>): Promise<void> {
    const rows = await tx
      .select({ generation: billingStripeSource.generation, state: billingStripeSource.state })
      .from(billingStripeSource)
      .where(and(eq(billingStripeSource.id, claim.id), sql`${billingStripeSource.leaseUntil} > clock_timestamp()`))
      .for('update');
    if (rows[0]?.generation !== claim.generation || rows[0]?.state !== 'processing')
      throw new ConflictException({ code: 'stale_payment_source_claim' });
  }

  private async assertProviderLegClaim(tx: Transaction, id: string, leaseUntil: Date): Promise<void> {
    const rows = await tx
      .select({ id: billingProviderLeg.id })
      .from(billingProviderLeg)
      .where(
        and(
          eq(billingProviderLeg.id, id),
          eq(billingProviderLeg.nextAttemptAt, leaseUntil),
          sql`${billingProviderLeg.nextAttemptAt} > clock_timestamp()`,
        ),
      )
      .for('update');
    if (rows[0] === undefined) throw new ConflictException({ code: 'stale_provider_leg_claim' });
  }

  /** Locks the account and refuses new collection for a closed account or an unresolved cash-integrity case. */
  private async assertOpenCollectionScope(accountId: string, transaction?: Transaction): Promise<void> {
    const gate = async (tx: Transaction): Promise<void> => {
      await this.lockPaymentAccount(tx, accountId);
      const rows = await tx
        .select({ status: creditAccount.status })
        .from(creditAccount)
        .where(and(eq(creditAccount.id, accountId), eq(creditAccount.environment, this.config.environment)))
        .limit(1);
      if (rows[0]?.status !== 'open') throw new ConflictException({ code: 'payment_account_not_open' });
      await this.cash.assertNewCollectionScope(accountId, tx);
    };
    if (transaction === undefined) {
      await this.databaseService.database.transaction(gate);
      return;
    }
    await gate(transaction);
  }

  private async lockPaymentAccount(tx: Transaction, accountId: string): Promise<void> {
    const rows = await tx
      .select({ id: creditAccount.id })
      .from(creditAccount)
      .where(and(eq(creditAccount.id, accountId), eq(creditAccount.environment, this.config.environment)))
      .for('update');
    if (rows[0] === undefined) throw new ConflictException({ code: 'payment_account_scope_mismatch' });
  }

  private async ownedPurchase(
    accountId: string,
    actionId: string,
    database: Database | Transaction = this.databaseService.database,
  ) {
    const rows = await database
      .select()
      .from(billingPurchase)
      .where(and(eq(billingPurchase.id, actionId), eq(billingPurchase.accountId, accountId)))
      .limit(1);
    if (rows[0] === undefined) throw new NotFoundException('payment_action_not_found');
    return rows[0];
  }
  private async findOwnedPurchaseByRequest(accountId: string, purpose: string, requestId: string) {
    const rows = await this.databaseService.database
      .select()
      .from(billingPurchase)
      .where(
        and(
          eq(billingPurchase.accountId, accountId),
          eq(billingPurchase.purpose, purpose),
          eq(billingPurchase.requestId, requestId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  private async findActivePurchase(accountId: string) {
    const rows = await this.databaseService.database
      .select()
      .from(billingPurchase)
      .where(
        and(
          eq(billingPurchase.accountId, accountId),
          or(
            eq(billingPurchase.state, 'prepared'),
            eq(billingPurchase.state, 'creating'),
            eq(billingPurchase.state, 'pending'),
            eq(billingPurchase.state, 'attention'),
            eq(billingPurchase.state, 'paid_unfulfilled'),
          ),
        ),
      )
      .limit(1);
    return rows[0];
  }
  private async purchaseToWire(
    owner: Owner,
    purchase: typeof billingPurchase.$inferSelect,
  ): Promise<WirePaymentAction> {
    const offer = paymentOfferSnapshotSchema.parse(purchase.offerSnapshot);
    const leg = await this.databaseService.database
      .select()
      .from(billingProviderLeg)
      .where(and(eq(billingProviderLeg.purchaseId, purchase.id), ne(billingProviderLeg.state, 'no_charge')))
      .orderBy(desc(billingProviderLeg.createdAt))
      .limit(1);
    const provider = leg[0];
    const state =
      purchase.state === 'fulfilled'
        ? 'fulfilled'
        : purchase.state === 'canceled'
          ? 'canceled'
          : purchase.state === 'failed'
            ? 'failed'
            : purchase.state === 'attention'
              ? 'attention_required'
              : purchase.state === 'paid_unfulfilled' || purchase.state === 'paid'
                ? 'funds_received'
                : provider?.kind === 'checkout_payment' && provider.redirectUrl !== null
                  ? 'redirect_required'
                  : purchase.state === 'creating'
                    ? 'creating'
                    : purchase.state === 'pending'
                      ? 'processing'
                      : 'prepared';
    const redirectUrl = state === 'redirect_required' ? (provider?.redirectUrl ?? null) : null;
    const canContinueHosted =
      state === 'attention_required' &&
      provider?.kind === 'payment_intent' &&
      provider.state === 'attention' &&
      provider.errorCode === 'authentication_required';
    return wirePaymentActionSchema.parse({
      version: 'payment-action-v1',
      actionId: purchase.id,
      environment: this.config.environment,
      ownerId: owner.ownerId,
      subjectId: owner.subjectId,
      purpose: purchase.purpose === 'automatic' ? 'automatic_topup' : 'manual_topup',
      state,
      frozen: {
        offerId: offer.offerId,
        currency: 'usd',
        principalMinor: offer.principalMinor,
        taxMinor: offer.taxMinor,
        grossMinor: offer.grossMinor,
        maximumGrossMinor: offer.maximumGrossMinor,
        creditAtoms: offer.creditAtoms,
        paymentMethod:
          offer.paymentMethod === null ? null : { brand: offer.paymentMethod.brand, last4: offer.paymentMethod.last4 },
      },
      redirectUrl,
      attention:
        state === 'attention_required'
          ? canContinueHosted
            ? { reason: 'authentication_required', action: 'continue_hosted' }
            : { reason: 'provider_outcome_unknown', action: 'wait' }
          : null,
      receipt:
        state === 'fulfilled' &&
        purchase.receiptId !== null &&
        purchase.grantedAtoms !== null &&
        purchase.fulfilledRevision !== null
          ? {
              receiptId: purchase.receiptId,
              grantedCreditAtoms: purchase.grantedAtoms.toString(),
              revision: purchase.fulfilledRevision.toString(),
              chargedPaymentMethod:
                purchase.paidEvidence?.paymentMethod === null || purchase.paidEvidence?.paymentMethod === undefined
                  ? null
                  : {
                      brand: purchase.paidEvidence.paymentMethod.brand,
                      last4: purchase.paidEvidence.paymentMethod.last4,
                    },
            }
          : null,
      updatedAt: purchase.updatedAt.toISOString(),
    });
  }

  private async subscriptionToWire(owner: Owner, row: typeof subscription.$inferSelect): Promise<WirePaymentAction> {
    const offer = paymentOfferSnapshotSchema.parse(row.offerSnapshot);
    const legs = await this.databaseService.database
      .select()
      .from(billingProviderLeg)
      .where(eq(billingProviderLeg.subscriptionId, row.id))
      .orderBy(asc(billingProviderLeg.createdAt))
      .limit(1);
    const leg = legs[0];
    const periods = await this.databaseService.database
      .select()
      .from(billingPeriod)
      .where(and(eq(billingPeriod.subscriptionId, row.id), eq(billingPeriod.state, 'fulfilled')))
      .orderBy(desc(billingPeriod.periodEnd))
      .limit(1);
    const entitlementPeriod = periods[0];
    const redirectUrl = entitlementPeriod === undefined ? (leg?.redirectUrl ?? null) : null;
    const state: WirePaymentAction['state'] =
      entitlementPeriod === undefined
        ? row.slotState === 'attention'
          ? 'attention_required'
          : redirectUrl === null
            ? 'creating'
            : 'redirect_required'
        : 'fulfilled';
    return wirePaymentActionSchema.parse({
      version: 'payment-action-v1',
      actionId: row.id,
      environment: this.config.environment,
      ownerId: owner.ownerId,
      subjectId: owner.subjectId,
      purpose: 'subscription_checkout',
      state,
      frozen: {
        offerId: offer.offerId,
        currency: 'usd',
        principalMinor: offer.principalMinor,
        taxMinor: offer.taxMinor,
        grossMinor: offer.grossMinor,
        maximumGrossMinor: offer.maximumGrossMinor,
        creditAtoms: offer.creditAtoms,
        paymentMethod: null,
      },
      redirectUrl,
      attention: state === 'attention_required' ? { reason: 'provider_outcome_unknown', action: 'wait' } : null,
      receipt:
        entitlementPeriod?.receiptId === null ||
        entitlementPeriod?.receiptId === undefined ||
        entitlementPeriod.grantedAtoms === null ||
        entitlementPeriod.fulfilledRevision === null
          ? null
          : {
              receiptId: entitlementPeriod.receiptId,
              grantedCreditAtoms: entitlementPeriod.grantedAtoms.toString(),
              revision: entitlementPeriod.fulfilledRevision.toString(),
              chargedPaymentMethod:
                entitlementPeriod.paidEvidence?.paymentMethod === null ||
                entitlementPeriod.paidEvidence?.paymentMethod === undefined
                  ? null
                  : {
                      brand: entitlementPeriod.paidEvidence.paymentMethod.brand,
                      last4: entitlementPeriod.paidEvidence.paymentMethod.last4,
                    },
            },
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private portalToWire(
    owner: Owner,
    leg: typeof billingProviderLeg.$inferSelect,
    redirectUrl?: string,
  ): WirePaymentAction {
    const state: WirePaymentAction['state'] = redirectUrl === undefined ? 'attention_required' : 'redirect_required';
    return wirePaymentActionSchema.parse({
      version: 'payment-action-v1',
      actionId: leg.id,
      environment: this.config.environment,
      ownerId: owner.ownerId,
      subjectId: owner.subjectId,
      purpose: 'billing_portal',
      state,
      frozen: null,
      redirectUrl: redirectUrl ?? null,
      attention:
        state === 'attention_required' ? { reason: 'provider_outcome_unknown', action: 'contact_support' } : null,
      receipt: null,
      updatedAt: (leg.dispatchStartedAt ?? leg.createdAt).toISOString(),
    });
  }

  private returnUrl(returnPath: string, actionId: string): string {
    const value = new URL(returnPath, this.config.uiOrigin);
    value.searchParams.set('payment_action', actionId);
    return value.href;
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Digests a persisted provider request independently of JSONB key ordering. */
function requestDigest(value: unknown): string {
  return digest(canonicalRequest(value));
}

function canonicalRequest(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalRequest(item));
  if (typeof value !== 'object' || value === null) return value;
  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalRequest(nested)]);
}

/** Reads the frozen card from a flat manual leg or from an automatic leg's nested provider request. */
function paymentMethodId(request: Readonly<Record<string, unknown>>): string | undefined {
  const nested = request['request'];
  const source =
    typeof nested === 'object' && nested !== null && !Array.isArray(nested)
      ? (nested as Readonly<Record<string, unknown>>)
      : request;
  return typeof source['payment_method'] === 'string' ? source['payment_method'] : undefined;
}

function automaticWorkGeneration(request: Readonly<Record<string, unknown>>): bigint | undefined {
  const nested = request['request'];
  if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) return undefined;
  const { metadata } = nested as Readonly<Record<string, unknown>>;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return undefined;
  const value = (metadata as Readonly<Record<string, unknown>>)['tau_reload_work_generation'];
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) return undefined;
  return BigInt(value);
}

// oxlint-disable-next-line typescript/no-restricted-types -- Stripe SDK represents an absent expandable field as null.
function stripeObjectId(value: string | { readonly id: string } | null): string | undefined {
  return typeof value === 'string' ? value : value?.id;
}

function subscriptionOfferState(value: string): NonNullable<SubscriptionOfferView['future']>['state'] {
  if (value === 'prepared' || value === 'dispatched' || value === 'confirmed' || value === 'attention') return value;
  throw new Error('Unsupported subscription offer state');
}

function paymentRecoveryErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[0-9A-Z]{5}$/u.test(error.code)
  ) {
    return `source_database_${error.code.toLowerCase()}`;
  }
  if (error instanceof ConflictException) return 'source_fence_conflict';
  if (error instanceof RangeError) return 'source_financial_range_error';
  return 'source_fetch_or_application_failed';
}

function recoveryQuery(leg: typeof billingProviderLeg.$inferSelect): Parameters<typeof recoverStripeLegSource>[1] {
  if (leg.kind === 'customer')
    return {
      kind: 'customer',
      providerObjectId: leg.providerObjectId ?? undefined,
      metadataKey: 'tau_customer_binding_id',
      metadataValue: leg.customerBindingId,
    };
  if (leg.kind === 'payment_intent')
    return {
      kind: 'payment_intent',
      providerObjectId: leg.providerObjectId ?? undefined,
      metadataKey: 'tau_purchase_id',
      metadataValue: leg.purchaseId ?? '',
    };
  if (leg.kind === 'checkout_payment' || leg.kind === 'checkout_subscription')
    return {
      kind: 'checkout',
      providerObjectId: leg.providerObjectId ?? undefined,
      clientReferenceId: leg.purchaseId ?? leg.subscriptionId ?? '',
    };
  return { kind: 'portal', providerObjectId: leg.providerObjectId ?? undefined };
}
