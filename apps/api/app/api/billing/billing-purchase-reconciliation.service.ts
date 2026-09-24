/* oxlint-disable curly, no-await-in-loop -- Source reads and case writes are deliberately sequential per row */
/* eslint-disable max-params-no-constructor/max-params-no-constructor -- persisted scan and case inputs are explicit */
import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import type { DatabaseService } from '#database/database.service.js';
import {
  billingCashFact,
  billingCashScan,
  billingFinancialCase,
  billingPeriod,
  billingPromotionIssuance,
  billingProviderLeg,
  billingPurchase,
  billingReversalCase,
  billingStripeCustomer,
  creditAccount,
  creditTransaction,
  subscription,
} from '#database/schema.js';
import { retrieveStripePaymentIntent } from '#api/billing/billing-cash-stripe.js';

type Scan = typeof billingCashScan.$inferSelect;
type Grant = typeof creditTransaction.$inferSelect;

/**
 * Reconciliation kinds that pause only the affected account's new collection.
 *
 * `assertNewCollectionCashScope` treats an account-scoped open case as an
 * attention stop for that account alone, so every kind listed here is opened
 * with the owning `accountId` set.
 */
export const purchaseBlockingFinancialCaseKinds = [
  'unfulfilled_purchase_obligation',
  'invalid_grant_cause',
  'entitlement_source_disagreement',
] as const;

const grantKinds = ['purchase_grant', 'period_grant', 'promotion_grant'] as const;
const obligationLegKinds = ['payment_intent', 'checkout_payment'] as const;
const entitledSlotStates = ['pending', 'current', 'attention'] as const;
const collectingSourceStatuses = new Set(['active', 'trialing', 'past_due']);
const dunningSourceStatuses = new Set(['past_due', 'unpaid']);
/** One bounded page of periods per subscription. ponytail: widen it when a subscription can outlive the page. */
const maximumPeriodsPerSubscription = 24;

/**
 * Customer-purchase and entitlement reconciliation over one durable cash-scan window.
 *
 * The scan row created by `BillingCashReconciliationService` owns the durable
 * paginated source checkpoints (opaque Stripe object cursors per stream, a
 * `lookbackStart` overlap that re-reads the previous window, and immutable
 * `billing_cash_fact` coverage). This service reuses that checkpoint rather
 * than keeping one of its own: obligations prefer the persisted listing fact
 * and fall back to a single bounded source retrieval for an object the listing
 * has not reached. Nothing here mutates money or history; every disagreement
 * becomes an idempotent `billing_financial_case`.
 */
@Injectable()
export class BillingPurchaseReconciliationService {
  public constructor(
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly sourceStripe: Stripe,
    private readonly config: {
      readonly environment: FinancialEnvironment;
      readonly stripeAccountId: string;
      readonly livemode: boolean;
    },
  ) {}

  /** Compares obligations, grant causes and entitlements against the source over one scan window. */
  public async runScan(input: {
    readonly scanId: string;
    readonly maximumObligations: number;
    readonly maximumGrants: number;
    readonly maximumSubscriptions: number;
  }): Promise<{
    readonly status: 'complete' | 'incomplete';
    readonly obligations: number;
    readonly grants: number;
    readonly subscriptions: number;
  }> {
    for (const bound of [input.maximumObligations, input.maximumGrants, input.maximumSubscriptions]) {
      if (!Number.isSafeInteger(bound) || bound < 1 || bound > 1000) {
        throw new ConflictException('invalid_purchase_scan_ceiling');
      }
    }
    const scan = await this.loadScan(input.scanId);
    const obligations = await this.reconcileObligations(scan, input.maximumObligations);
    const grants = await this.reconcileGrantCauses(scan, input.maximumGrants);
    const subscriptions = await this.reconcileEntitlements(scan, input.maximumSubscriptions);
    const complete = obligations.complete && grants.complete && subscriptions.complete;
    return {
      status: complete ? 'complete' : 'incomplete',
      obligations: obligations.count,
      grants: grants.count,
      subscriptions: subscriptions.count,
    };
  }

  private async loadScan(scanId: string): Promise<Scan> {
    const [scan] = await this.databaseService.database
      .select()
      .from(billingCashScan)
      .where(
        and(
          eq(billingCashScan.id, scanId),
          eq(billingCashScan.environment, this.config.environment),
          eq(billingCashScan.stripeAccountId, this.config.stripeAccountId),
          eq(billingCashScan.livemode, this.config.livemode),
        ),
      );
    if (scan === undefined) throw new ServiceUnavailableException('purchase_scan_window_missing');
    return scan;
  }

  /**
   * Every owned obligation the provider acknowledged maps to one grant, or to an
   * explicit pending or refund disposition. Local leg state is never the proof:
   * settlement is decided by the persisted source fact or a source retrieval.
   */
  private async reconcileObligations(
    scan: Scan,
    maximum: number,
  ): Promise<{ readonly complete: boolean; readonly count: number }> {
    const page = await this.databaseService.database
      .select({ leg: billingProviderLeg, purchase: billingPurchase, grant: creditTransaction })
      .from(billingProviderLeg)
      .innerJoin(
        billingPurchase,
        and(
          eq(billingPurchase.accountId, billingProviderLeg.accountId),
          eq(billingPurchase.id, billingProviderLeg.purchaseId),
        ),
      )
      .leftJoin(
        creditTransaction,
        and(eq(creditTransaction.purchaseId, billingPurchase.id), eq(creditTransaction.kind, 'purchase_grant')),
      )
      .where(
        and(
          eq(billingProviderLeg.environment, scan.environment),
          inArray(billingProviderLeg.kind, [...obligationLegKinds]),
          eq(billingProviderLeg.state, 'known'),
          gte(billingProviderLeg.createdAt, scan.lookbackStart),
          lt(billingProviderLeg.createdAt, scan.windowEnd),
          eq(billingPurchase.stripeAccountId, scan.stripeAccountId),
          eq(billingPurchase.livemode, scan.livemode),
        ),
      )
      .orderBy(asc(billingProviderLeg.id))
      .limit(maximum + 1);
    const rows = page.slice(0, maximum);
    for (const row of rows) {
      const dedupeKey = `obligation:${row.leg.id}`;
      const settlement = await this.qualifyObligationSettlement(scan, row.leg, row.purchase);
      const granted =
        row.grant !== null && row.purchase.state === 'fulfilled' && row.purchase.receiptId === row.grant.id;
      if (settlement.status === 'pending' || granted || (await this.hasReversalCase(row.purchase.id))) {
        await this.resolveCase(scan, 'unfulfilled_purchase_obligation', dedupeKey, settlement.status);
        continue;
      }
      await this.openCase(scan, {
        kind: 'unfulfilled_purchase_obligation',
        dedupeKey,
        accountId: row.purchase.accountId,
        sourceType: 'billing_provider_leg',
        sourceId: row.leg.id,
        currency: offerCurrency(row.purchase.offerSnapshot),
        firstEffectiveAt: row.leg.createdAt,
        evidence: {
          providerLegId: row.leg.id,
          providerLegKind: row.leg.kind,
          providerObjectId: row.leg.providerObjectId,
          purchaseId: row.purchase.id,
          purchaseState: row.purchase.state,
          creditAtoms: row.purchase.creditAtoms.toString(),
          settledPaymentIntentId: settlement.paymentIntentId ?? null,
          grantId: row.grant?.id ?? null,
        },
      });
    }
    return { complete: page.length <= maximum, count: rows.length };
  }

  private async qualifyObligationSettlement(
    scan: Scan,
    leg: typeof billingProviderLeg.$inferSelect,
    purchase: typeof billingPurchase.$inferSelect,
  ): Promise<{ readonly status: 'settled' | 'pending'; readonly paymentIntentId: string | undefined }> {
    const legPaymentIntentId = leg.kind === 'payment_intent' ? (leg.providerObjectId ?? undefined) : undefined;
    const paymentIntentId = purchase.paymentIntentId ?? legPaymentIntentId;
    if (paymentIntentId !== undefined) {
      const status = await this.sourcePaymentIntentStatus(scan, paymentIntentId);
      return { status: status === 'succeeded' ? 'settled' : 'pending', paymentIntentId };
    }
    if (leg.kind !== 'checkout_payment' || leg.providerObjectId === null) {
      return { status: 'pending', paymentIntentId: undefined };
    }
    const session = await this.sourceStripe.checkout.sessions.retrieve(leg.providerObjectId);
    const settled = session.payment_status === 'paid' && session.livemode === scan.livemode;
    return { status: settled ? 'settled' : 'pending', paymentIntentId: stripeId(session.payment_intent) };
  }

  /** Prefers the checkpointed listing fact; one bounded retrieval covers an object the listing has not reached. */
  private async sourcePaymentIntentStatus(scan: Scan, paymentIntentId: string): Promise<string> {
    const [fact] = await this.databaseService.database
      .select({ evidence: billingCashFact.evidence })
      .from(billingCashFact)
      .where(
        and(
          eq(billingCashFact.environment, scan.environment),
          eq(billingCashFact.stripeAccountId, scan.stripeAccountId),
          eq(billingCashFact.livemode, scan.livemode),
          eq(billingCashFact.sourceType, 'payment_intent'),
          eq(billingCashFact.sourceId, paymentIntentId),
        ),
      )
      .orderBy(desc(billingCashFact.observedAt))
      .limit(1);
    const observed = fact?.evidence['status'];
    if (typeof observed === 'string') return observed;
    const paymentIntent = await retrieveStripePaymentIntent(this.sourceStripe, paymentIntentId);
    return paymentIntent.livemode === scan.livemode ? paymentIntent.status : 'source_livemode_mismatch';
  }

  private async hasReversalCase(purchaseId: string): Promise<boolean> {
    const [reversal] = await this.databaseService.database
      .select({ id: billingReversalCase.id })
      .from(billingReversalCase)
      .where(eq(billingReversalCase.purchaseId, purchaseId))
      .limit(1);
    return reversal !== undefined;
  }

  /**
   * Every grant carries a qualified cause. The ledger's own receipt invariant is
   * the comparison: a fulfilled cause points back at the grant by receipt,
   * granted atoms and fulfilled revision.
   */
  private async reconcileGrantCauses(
    scan: Scan,
    maximum: number,
  ): Promise<{ readonly complete: boolean; readonly count: number }> {
    const page = await this.databaseService.database
      .select({ grant: creditTransaction })
      .from(creditTransaction)
      .innerJoin(creditAccount, eq(creditAccount.id, creditTransaction.accountId))
      .where(
        and(
          eq(creditAccount.environment, scan.environment),
          gte(creditTransaction.occurredAt, scan.lookbackStart),
          lt(creditTransaction.occurredAt, scan.windowEnd),
          inArray(creditTransaction.kind, [...grantKinds]),
          or(
            isNull(creditTransaction.stripeAccountId),
            and(
              eq(creditTransaction.stripeAccountId, scan.stripeAccountId),
              eq(creditTransaction.livemode, scan.livemode),
            ),
          ),
        ),
      )
      .orderBy(asc(creditTransaction.id))
      .limit(maximum + 1);
    const rows = page.slice(0, maximum).map((row) => row.grant);
    for (const grant of rows) {
      const dedupeKey = `grant:${grant.id}`;
      const reason = await this.disqualifyGrantCause(grant);
      if (reason === undefined) {
        await this.resolveCase(scan, 'invalid_grant_cause', dedupeKey, 'cause_qualified');
        continue;
      }
      await this.openCase(scan, {
        kind: 'invalid_grant_cause',
        dedupeKey,
        accountId: grant.accountId,
        sourceType: 'credit_transaction',
        sourceId: grant.id,
        currency: undefined,
        firstEffectiveAt: grant.occurredAt,
        evidence: {
          grantId: grant.id,
          grantKind: grant.kind,
          reason,
          purchaseId: grant.purchaseId,
          periodId: grant.periodId,
          promotionIssuanceId: grant.promotionIssuanceId,
          accountDeltaAtoms: grant.accountDeltaAtoms.toString(),
          revision: grant.revision.toString(),
        },
      });
    }
    return { complete: page.length <= maximum, count: rows.length };
  }

  private async disqualifyGrantCause(grant: Grant): Promise<string | undefined> {
    if (grant.kind === 'promotion_grant') {
      const [issuance] = await this.databaseService.database
        .select()
        .from(billingPromotionIssuance)
        .where(eq(billingPromotionIssuance.id, grant.promotionIssuanceId ?? ''));
      if (issuance === undefined) return 'promotion_cause_missing';
      if (issuance.accountId !== grant.accountId) return 'promotion_cause_owner_mismatch';
      // The ledger issues the whole entitlement, splitting it between assets and debt repayment.
      if (issuance.atoms !== grant.accountDeltaAtoms) return 'promotion_cause_atoms_mismatch';
      return undefined;
    }
    if (grant.kind === 'period_grant') {
      const [period] = await this.databaseService.database
        .select()
        .from(billingPeriod)
        .where(eq(billingPeriod.id, grant.periodId ?? ''));
      if (period === undefined) return 'period_cause_missing';
      if (period.invoiceId === null || period.paidEvidence === null || period.paidAt === null) {
        return 'period_cause_unpaid';
      }
      return disqualifyReceipt(period, grant);
    }
    const [purchase] = await this.databaseService.database
      .select()
      .from(billingPurchase)
      .where(eq(billingPurchase.id, grant.purchaseId ?? ''));
    if (purchase === undefined) return 'purchase_cause_missing';
    if (purchase.paidEvidence === null || purchase.paidAt === null) return 'purchase_cause_unpaid';
    if (
      purchase.paymentIntentId !== grant.paymentIntentId ||
      purchase.chargeId !== grant.chargeId ||
      purchase.stripeAccountId !== grant.stripeAccountId ||
      purchase.livemode !== grant.livemode
    ) {
      return 'purchase_cause_payment_mismatch';
    }
    return disqualifyReceipt(purchase, grant);
  }

  /**
   * Locally entitled subscriptions agree with the source independently of any
   * webhook or cache: Customer binding, lifecycle status, cancellation intent,
   * dunning state and every paid period's invoice are read from Stripe.
   */
  private async reconcileEntitlements(
    scan: Scan,
    maximum: number,
  ): Promise<{ readonly complete: boolean; readonly count: number }> {
    const page = await this.databaseService.database
      .select({ subscription, binding: billingStripeCustomer })
      .from(subscription)
      .innerJoin(billingStripeCustomer, eq(billingStripeCustomer.id, subscription.customerBindingId))
      .where(
        and(
          eq(subscription.environment, scan.environment),
          isNotNull(subscription.stripeSubscriptionId),
          inArray(subscription.slotState, [...entitledSlotStates]),
          eq(billingStripeCustomer.stripeAccountId, scan.stripeAccountId),
          eq(billingStripeCustomer.livemode, scan.livemode),
        ),
      )
      .orderBy(asc(subscription.id))
      .limit(maximum + 1);
    const rows = page.slice(0, maximum);
    for (const row of rows) {
      const { accountId, stripeSubscriptionId } = row.subscription;
      if (stripeSubscriptionId === null) continue;
      const source = await this.sourceStripe.subscriptions.retrieve(stripeSubscriptionId);
      const reasons = disagreeSubscription(scan, row.subscription, row.binding, source);
      const dedupeKey = `subscription:${row.subscription.id}`;
      if (reasons.length === 0) {
        await this.resolveCase(scan, 'entitlement_source_disagreement', dedupeKey, 'source_agrees');
      } else {
        await this.openCase(scan, {
          kind: 'entitlement_source_disagreement',
          dedupeKey,
          accountId,
          sourceType: 'subscription',
          sourceId: row.subscription.id,
          currency: undefined,
          firstEffectiveAt: scan.windowStart,
          evidence: {
            subscriptionId: row.subscription.id,
            stripeSubscriptionId,
            reasons,
            localStatus: row.subscription.status,
            localSlotState: row.subscription.slotState,
            localCancelAtPeriodEnd: row.subscription.cancelAtPeriodEnd,
            localDunningStartedAt: row.subscription.dunningStartedAt?.toISOString() ?? null,
            sourceStatus: source.status,
            sourceCancelAtPeriodEnd: source.cancel_at_period_end,
            sourceCustomerId: stripeId(source.customer) ?? null,
            boundCustomerId: row.binding.stripeCustomerId,
          },
        });
      }
      await this.reconcilePeriods(scan, row.subscription, row.binding, stripeSubscriptionId);
    }
    return { complete: page.length <= maximum, count: rows.length };
  }

  private async reconcilePeriods(
    scan: Scan,
    local: typeof subscription.$inferSelect,
    binding: typeof billingStripeCustomer.$inferSelect,
    stripeSubscriptionId: string,
  ): Promise<void> {
    const periods = await this.databaseService.database
      .select()
      .from(billingPeriod)
      .where(
        and(
          eq(billingPeriod.subscriptionId, local.id),
          isNotNull(billingPeriod.invoiceId),
          gt(billingPeriod.periodEnd, scan.lookbackStart),
          lt(billingPeriod.periodStart, scan.windowEnd),
        ),
      )
      .orderBy(asc(billingPeriod.periodStart))
      .limit(maximumPeriodsPerSubscription);
    for (const paidPeriod of periods) {
      if (paidPeriod.invoiceId === null) continue;
      const dedupeKey = `period:${paidPeriod.id}`;
      const invoice = await this.sourceStripe.invoices.retrieve(paidPeriod.invoiceId);
      const invoiceSubscription =
        invoice.parent?.type === 'subscription_details'
          ? stripeId(invoice.parent.subscription_details?.subscription ?? undefined)
          : undefined;
      const reasons: string[] = [];
      if (invoice.status !== 'paid') reasons.push('period_invoice_unpaid');
      if (invoice.livemode !== scan.livemode) reasons.push('period_invoice_livemode_mismatch');
      if (stripeId(invoice.customer) !== binding.stripeCustomerId) reasons.push('period_invoice_customer_mismatch');
      if (invoiceSubscription !== stripeSubscriptionId) reasons.push('period_invoice_subscription_mismatch');
      if (reasons.length === 0) {
        await this.resolveCase(scan, 'entitlement_source_disagreement', dedupeKey, 'source_agrees');
        continue;
      }
      await this.openCase(scan, {
        kind: 'entitlement_source_disagreement',
        dedupeKey,
        accountId: paidPeriod.accountId,
        sourceType: 'billing_period',
        sourceId: paidPeriod.id,
        currency: invoice.currency,
        firstEffectiveAt: paidPeriod.periodStart,
        evidence: {
          periodId: paidPeriod.id,
          subscriptionId: local.id,
          invoiceId: paidPeriod.invoiceId,
          periodState: paidPeriod.state,
          reasons,
          sourceInvoiceStatus: invoice.status,
          sourceInvoiceSubscriptionId: invoiceSubscription ?? null,
          sourceInvoiceCustomerId: stripeId(invoice.customer) ?? null,
        },
      });
    }
  }

  private async openCase(
    scan: Scan,
    input: {
      readonly kind: (typeof purchaseBlockingFinancialCaseKinds)[number];
      readonly dedupeKey: string;
      readonly accountId: string;
      readonly sourceType: string;
      readonly sourceId: string;
      readonly currency: string | undefined;
      readonly firstEffectiveAt: Date;
      readonly evidence: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.databaseService.database.transaction(async (tx) => {
      const [account] = await tx
        .select({ id: creditAccount.id })
        .from(creditAccount)
        .where(eq(creditAccount.id, input.accountId))
        .for('update');
      if (account === undefined) throw new ServiceUnavailableException('purchase_case_account_missing');
      await tx
        .insert(billingFinancialCase)
        .values({
          id: randomUUID(),
          environment: scan.environment,
          stripeAccountId: scan.stripeAccountId,
          livemode: scan.livemode,
          kind: input.kind,
          dedupeKey: input.dedupeKey,
          accountId: input.accountId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          currency: input.currency,
          evidence: input.evidence,
          owner: 'billing-operations',
          nextStep: nextStepOf(input.kind),
          firstEffectiveAt: input.firstEffectiveAt,
        })
        .onConflictDoUpdate({
          target: [
            billingFinancialCase.environment,
            billingFinancialCase.stripeAccountId,
            billingFinancialCase.livemode,
            billingFinancialCase.kind,
            billingFinancialCase.dedupeKey,
          ],
          set: {
            state: 'open',
            lastSeenAt: sql`clock_timestamp()`,
            resolvedAt: null,
            resolutionEvidence: null,
            evidence: input.evidence,
            nextStep: nextStepOf(input.kind),
          },
        });
    });
  }

  private async resolveCase(scan: Scan, kind: string, dedupeKey: string, disposition: string): Promise<void> {
    const [existing] = await this.databaseService.database
      .select({ id: billingFinancialCase.id })
      .from(billingFinancialCase)
      .where(
        and(
          eq(billingFinancialCase.environment, scan.environment),
          eq(billingFinancialCase.stripeAccountId, scan.stripeAccountId),
          eq(billingFinancialCase.livemode, scan.livemode),
          eq(billingFinancialCase.kind, kind),
          eq(billingFinancialCase.dedupeKey, dedupeKey),
          or(eq(billingFinancialCase.state, 'open'), eq(billingFinancialCase.state, 'attention')),
        ),
      );
    if (existing === undefined) return;
    await this.databaseService.database
      .update(billingFinancialCase)
      .set({
        state: 'resolved',
        resolvedAt: sql`clock_timestamp()`,
        resolutionEvidence: { scanId: scan.id, dedupeKey, disposition },
      })
      .where(eq(billingFinancialCase.id, existing.id));
  }
}

/** The operator action each reconciliation case asks for. */
function nextStepOf(kind: (typeof purchaseBlockingFinancialCaseKinds)[number]): string {
  switch (kind) {
    case 'unfulfilled_purchase_obligation': {
      return 'qualify_obligation_and_fulfil_or_refund';
    }
    case 'invalid_grant_cause': {
      return 'qualify_grant_cause_and_correct';
    }
    case 'entitlement_source_disagreement': {
      return 'qualify_source_entitlement_and_realign';
    }
  }
}

/** The ledger writes a receipt into its cause; a grant whose cause disagrees has no valid cause. */
function disqualifyReceipt(
  cause: Pick<
    typeof billingPurchase.$inferSelect,
    'accountId' | 'state' | 'receiptId' | 'grantedAtoms' | 'fulfilledRevision'
  >,
  grant: Grant,
): string | undefined {
  if (cause.accountId !== grant.accountId) return 'cause_owner_mismatch';
  if (cause.state !== 'fulfilled' || cause.receiptId !== grant.id) return 'cause_receipt_missing';
  if (cause.grantedAtoms !== grant.accountDeltaAtoms) return 'cause_atoms_mismatch';
  if (cause.fulfilledRevision !== grant.revision) return 'cause_revision_mismatch';
  return undefined;
}

function disagreeSubscription(
  scan: Scan,
  local: typeof subscription.$inferSelect,
  binding: typeof billingStripeCustomer.$inferSelect,
  source: Stripe.Subscription,
): readonly string[] {
  const reasons: string[] = [];
  if (source.livemode !== scan.livemode) reasons.push('subscription_livemode_mismatch');
  if (stripeId(source.customer) !== binding.stripeCustomerId) reasons.push('customer_binding_mismatch');
  if (source.status !== local.status) reasons.push('subscription_status_mismatch');
  if (source.cancel_at_period_end !== (local.cancelAtPeriodEnd ?? false)) reasons.push('cancellation_intent_mismatch');
  if (dunningSourceStatuses.has(source.status) !== (local.dunningStartedAt !== null)) {
    reasons.push('dunning_state_mismatch');
  }
  if (!collectingSourceStatuses.has(source.status)) reasons.push('entitled_slot_without_collecting_source');
  return reasons;
}

function offerCurrency(offerSnapshot: unknown): string | undefined {
  if (typeof offerSnapshot !== 'object' || offerSnapshot === null || !('currency' in offerSnapshot)) return undefined;
  return typeof offerSnapshot.currency === 'string' ? offerSnapshot.currency : undefined;
}

function stripeId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string') return value.id;
  return undefined;
}
