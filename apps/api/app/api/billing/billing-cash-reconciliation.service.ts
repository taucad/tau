/* oxlint-disable curly, no-await-in-loop, unicorn/switch-case-braces, eslint/complexity -- Stripe cursors are sequential and provider unions require explicit guards */
/* eslint-disable max-params-no-constructor/max-params-no-constructor -- persisted scan and case inputs are explicit */
import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import { z } from 'zod';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import type { DatabaseService } from '#database/database.service.js';
import {
  billingCashFact,
  billingCashScan,
  billingCashScanFact,
  billingFinancialCase,
  billingPeriod,
  billingProviderLeg,
  billingPurchase,
  billingRefundIntent,
  billingReversalCase,
  creditAccount,
  creditTransaction,
} from '#database/schema.js';
import {
  listStripeBalancePage,
  listStripeChargePage,
  listStripePaymentIntentPage,
  listStripeRefundPage,
  retrieveStripeCharge,
  retrieveStripePaymentIntent,
} from '#api/billing/billing-cash-stripe.js';
import { paidPaymentEvidenceSchema } from '#api/billing/billing-payment-contract.js';
import { journalBlockingFinancialCaseKinds } from '#api/billing/billing-journal-reconciliation.service.js';
import { purchaseBlockingFinancialCaseKinds } from '#api/billing/billing-purchase-reconciliation.service.js';

type Scan = typeof billingCashScan.$inferSelect;
type StreamName = 'balance' | 'paymentIntent' | 'charge' | 'refund';
type CashObject = Stripe.BalanceTransaction | Stripe.PaymentIntent | Stripe.Charge | Stripe.Refund;
type Transaction = Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0];

export const cashBlockingFinancialCaseKinds: readonly string[] = [
  'orphan_local_receipt',
  'missing_local_payment',
  'gross_fee_net_mismatch',
  'paid_unfulfilled_recovery',
  'refund_unresolved',
  'dispute_unresolved',
  // Purchase and entitlement reconciliation opens account-scoped cases through the same stop.
  ...purchaseBlockingFinancialCaseKinds,
  // Journal conservation cases always name their own account, so the same stop pauses only that account.
  ...journalBlockingFinancialCaseKinds,
];

export async function assertNewCollectionCashScope(
  databaseService: Pick<DatabaseService, 'database'>,
  config: { readonly environment: FinancialEnvironment; readonly stripeAccountId: string; readonly livemode: boolean },
  accountId: string,
  transaction?: Transaction,
): Promise<void> {
  const database = transaction ?? databaseService.database;
  const [open] = await database
    .select({ id: billingFinancialCase.id })
    .from(billingFinancialCase)
    .where(
      and(
        eq(billingFinancialCase.environment, config.environment),
        eq(billingFinancialCase.stripeAccountId, config.stripeAccountId),
        eq(billingFinancialCase.livemode, config.livemode),
        or(eq(billingFinancialCase.accountId, accountId), isNull(billingFinancialCase.accountId)),
        inArray(billingFinancialCase.kind, cashBlockingFinancialCaseKinds),
        or(eq(billingFinancialCase.state, 'open'), eq(billingFinancialCase.state, 'attention')),
      ),
    )
    .limit(1);
  if (open !== undefined) throw new ConflictException('cash_scope_attention');
}

@Injectable()
export class BillingCashReconciliationService {
  public constructor(
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly sourceStripe: Stripe,
    private readonly config: {
      readonly environment: FinancialEnvironment;
      readonly stripeAccountId: string;
      readonly livemode: boolean;
    },
  ) {}

  public async createScan(input: {
    readonly environment: FinancialEnvironment;
    readonly currency: string;
    readonly windowStart: Date;
    readonly windowEnd: Date;
    readonly lookbackStart: Date;
  }): Promise<string> {
    if (
      input.environment !== this.config.environment ||
      !/^[a-z]{3}$/u.test(input.currency) ||
      input.lookbackStart > input.windowStart ||
      input.windowStart >= input.windowEnd
    ) {
      throw new ConflictException('invalid_cash_scan');
    }
    const id = randomUUID();
    const [scan] = await this.databaseService.database
      .insert(billingCashScan)
      .values({
        id,
        environment: input.environment,
        stripeAccountId: this.config.stripeAccountId,
        livemode: this.config.livemode,
        currency: input.currency,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        lookbackStart: input.lookbackStart,
      })
      .onConflictDoNothing()
      .returning({ id: billingCashScan.id });
    if (scan !== undefined) return scan.id;
    const [existing] = await this.databaseService.database
      .select({ id: billingCashScan.id })
      .from(billingCashScan)
      .where(
        and(
          eq(billingCashScan.environment, input.environment),
          eq(billingCashScan.stripeAccountId, this.config.stripeAccountId),
          eq(billingCashScan.livemode, this.config.livemode),
          eq(billingCashScan.currency, input.currency),
          eq(billingCashScan.windowStart, input.windowStart),
          eq(billingCashScan.windowEnd, input.windowEnd),
        ),
      );
    if (existing === undefined) throw new ServiceUnavailableException('cash_scan_conflict');
    return existing.id;
  }

  public async runScan(input: { readonly scanId: string; readonly maximumPagesPerStream: number }): Promise<{
    readonly status: 'complete' | 'incomplete';
  }> {
    if (
      !Number.isSafeInteger(input.maximumPagesPerStream) ||
      input.maximumPagesPerStream < 1 ||
      input.maximumPagesPerStream > 100
    ) {
      throw new ConflictException('invalid_cash_scan_ceiling');
    }
    const claim = await this.claimScan(input.scanId);
    for (const stream of ['balance', 'paymentIntent', 'charge', 'refund'] satisfies readonly StreamName[]) {
      await this.scanStream(claim, stream, input.maximumPagesPerStream);
    }
    await this.compareJournal(claim);
    const [journal] = await this.databaseService.database
      .select({ done: billingCashScan.journalDone })
      .from(billingCashScan)
      .where(and(eq(billingCashScan.id, claim.id), eq(billingCashScan.generation, claim.generation)));
    if (journal?.done) await this.compareFacts(claim);
    const [finished] = await this.databaseService.database
      .update(billingCashScan)
      .set({ state: 'complete', completedAt: sql`transaction_timestamp()`, leaseUntil: null })
      .where(
        and(
          eq(billingCashScan.id, claim.id),
          eq(billingCashScan.generation, claim.generation),
          sql`${billingCashScan.leaseUntil} > clock_timestamp()`,
          eq(billingCashScan.balanceDone, true),
          eq(billingCashScan.paymentIntentDone, true),
          eq(billingCashScan.chargeDone, true),
          eq(billingCashScan.refundDone, true),
          eq(billingCashScan.journalDone, true),
          eq(billingCashScan.factDone, true),
        ),
      )
      .returning({ id: billingCashScan.id });
    if (finished === undefined) {
      await this.releaseIncomplete(claim.id, claim.generation, 'cash_scan_incomplete');
      return { status: 'incomplete' };
    }
    return { status: 'complete' };
  }

  public async assertCashScopeClear(accountId: string): Promise<void> {
    await assertNewCollectionCashScope(this.databaseService, this.config, accountId);
  }

  private async claimScan(id: string): Promise<Scan> {
    const [scan] = await this.databaseService.database
      .update(billingCashScan)
      .set({
        state: 'running',
        generation: sql`${billingCashScan.generation} + 1`,
        attempts: sql`${billingCashScan.attempts} + 1`,
        leaseUntil: sql`date_trunc('milliseconds', clock_timestamp()) + interval '30 seconds'`,
      })
      .where(
        and(
          eq(billingCashScan.id, id),
          eq(billingCashScan.environment, this.config.environment),
          eq(billingCashScan.stripeAccountId, this.config.stripeAccountId),
          eq(billingCashScan.livemode, this.config.livemode),
          or(
            eq(billingCashScan.state, 'pending'),
            eq(billingCashScan.state, 'incomplete'),
            eq(billingCashScan.state, 'running'),
          ),
          sql`(${billingCashScan.leaseUntil} IS NULL OR ${billingCashScan.leaseUntil} <= clock_timestamp())`,
        ),
      )
      .returning();
    if (scan === undefined) throw new ServiceUnavailableException('cash_scan_claimed');
    return scan;
  }

  private async scanStream(claim: Scan, stream: StreamName, maximumPages: number): Promise<void> {
    let cursor = cursorOf(claim, stream);
    if (doneOf(claim, stream)) return;
    for (let pageIndex = 0; pageIndex < maximumPages; pageIndex += 1) {
      const page = await this.fetchPage(claim, stream, cursor);
      await this.commitPage(claim, stream, page.data, page.nextCursor, !page.hasMore);
      if (!page.hasMore) return;
      cursor = page.nextCursor;
    }
  }

  private async fetchPage(claim: Scan, stream: StreamName, cursor: string | undefined) {
    const request = {
      created: {
        gte: Math.floor(claim.lookbackStart.getTime() / 1000),
        lt: Math.floor(claim.windowEnd.getTime() / 1000),
      },
      startingAfter: cursor,
    };
    switch (stream) {
      case 'balance':
        return listStripeBalancePage(this.sourceStripe, request);
      case 'paymentIntent':
        return listStripePaymentIntentPage(this.sourceStripe, request);
      case 'charge':
        return listStripeChargePage(this.sourceStripe, request);
      case 'refund':
        return listStripeRefundPage(this.sourceStripe, request);
    }
  }

  private async commitPage(
    claim: Scan,
    stream: StreamName,
    objects: readonly CashObject[],
    nextCursor: string | undefined,
    done: boolean,
  ): Promise<void> {
    await this.databaseService.database.transaction(async (tx) => {
      const [live] = await tx
        .select({ id: billingCashScan.id })
        .from(billingCashScan)
        .where(
          and(
            eq(billingCashScan.id, claim.id),
            eq(billingCashScan.generation, claim.generation),
            sql`${billingCashScan.leaseUntil} > clock_timestamp()`,
          ),
        )
        .for('update');
      if (live === undefined) throw new ServiceUnavailableException('stale_cash_scan');
      await persistFacts(tx, claim, stream, objects);
      await tx
        .update(billingCashScan)
        .set(streamUpdate(stream, nextCursor, done))
        .where(and(eq(billingCashScan.id, claim.id), eq(billingCashScan.generation, claim.generation)));
    });
  }

  private async compareJournal(claim: Scan): Promise<void> {
    const receiptPredicates = [
      gte(creditTransaction.occurredAt, claim.lookbackStart),
      lt(creditTransaction.occurredAt, claim.windowEnd),
      eq(creditAccount.environment, claim.environment),
      eq(creditTransaction.stripeAccountId, claim.stripeAccountId),
      eq(creditTransaction.livemode, claim.livemode),
      or(isNotNull(creditTransaction.paymentIntentId), isNotNull(creditTransaction.chargeId)),
    ];
    if (claim.journalCursor !== null) receiptPredicates.push(gt(creditTransaction.id, claim.journalCursor));
    const receiptPage = await this.databaseService.database
      .select({ transaction: creditTransaction })
      .from(creditTransaction)
      .innerJoin(creditAccount, eq(creditAccount.id, creditTransaction.accountId))
      .where(and(...receiptPredicates))
      .orderBy(asc(creditTransaction.id))
      .limit(1001);
    const receipts = receiptPage.slice(0, 1000).map((row) => row.transaction);
    for (const receipt of receipts) {
      const recovered = await this.retrieveLateReceiptSource(claim, receipt);
      if (!recovered) {
        await this.openCase(claim, 'orphan_local_receipt', receipt.id, receipt.accountId, {
          receiptId: receipt.id,
          paymentIntentId: receipt.paymentIntentId,
          chargeId: receipt.chargeId,
        });
      }
    }
    const journalDone = receiptPage.length <= 1000;
    await this.databaseService.database
      .update(billingCashScan)
      .set({ journalCursor: receipts.at(-1)?.id ?? claim.journalCursor, journalDone })
      .where(
        and(
          eq(billingCashScan.id, claim.id),
          eq(billingCashScan.generation, claim.generation),
          sql`${billingCashScan.leaseUntil} > clock_timestamp()`,
        ),
      );
  }

  private async compareFacts(claim: Scan): Promise<void> {
    const rows = await this.databaseService.database
      .select({ fact: billingCashFact })
      .from(billingCashScanFact)
      .innerJoin(billingCashFact, eq(billingCashFact.id, billingCashScanFact.factId))
      .where(
        and(
          eq(billingCashScanFact.scanId, claim.id),
          ...(claim.factCursor === null ? [] : [gt(billingCashFact.id, claim.factCursor)]),
        ),
      )
      .orderBy(asc(billingCashFact.id))
      .limit(1001);
    const facts = rows.slice(0, 1000).map((row) => row.fact);
    for (const fact of facts) {
      if (
        fact.sourceType === 'balance_transaction' &&
        (fact.amountMinor === null ||
          fact.feeMinor === null ||
          fact.netMinor === null ||
          fact.amountMinor - fact.feeMinor !== fact.netMinor ||
          fact.currency !== claim.currency)
      ) {
        await this.openCase(claim, 'gross_fee_net_mismatch', fact.sourceId, undefined, {
          factId: fact.id,
          amountMinor: fact.amountMinor?.toString() ?? null,
          feeMinor: fact.feeMinor?.toString() ?? null,
          netMinor: fact.netMinor?.toString() ?? null,
          currency: fact.currency,
        });
      }
      if (fact.sourceType === 'payment_intent' && fact.evidence['status'] === 'succeeded') {
        const disposition = await this.localPaymentDisposition(claim, fact.sourceId);
        if (disposition.status === 'paid_unfulfilled') {
          await this.openCase(claim, 'paid_unfulfilled_recovery', fact.sourceId, disposition.accountId, fact.evidence);
        } else if (disposition.status === 'missing') {
          await this.openCase(claim, 'missing_local_payment', fact.sourceId, undefined, fact.evidence);
        } else {
          await this.resolveCase(claim, 'missing_local_payment', fact.sourceId);
          await this.resolveCase(claim, 'paid_unfulfilled_recovery', fact.sourceId);
        }
      }
      if (fact.sourceType === 'refund') {
        const owned = fact.evidence['status'] === 'succeeded' && (await this.hasOwnedRefund(fact));
        if (
          fact.evidence['status'] === 'pending' ||
          fact.evidence['status'] === 'requires_action' ||
          (fact.evidence['status'] === 'succeeded' && !owned)
        ) {
          await this.openCase(claim, 'refund_unresolved', fact.sourceId, undefined, fact.evidence);
        } else if (owned) {
          await this.resolveCase(claim, 'refund_unresolved', fact.sourceId);
        }
      }
      if (
        fact.sourceType === 'balance_transaction' &&
        typeof fact.evidence['type'] === 'string' &&
        fact.evidence['type'].includes('dispute')
      ) {
        const disputeId = fact.evidence['source'];
        if (typeof disputeId !== 'string') {
          await this.openCase(claim, 'dispute_unresolved', fact.sourceId, undefined, fact.evidence);
        } else if (await this.hasQualifiedDispute(claim, disputeId)) {
          await this.resolveCase(claim, 'dispute_unresolved', disputeId);
        } else {
          await this.openCase(claim, 'dispute_unresolved', disputeId, undefined, fact.evidence);
        }
      }
    }
    await this.databaseService.database
      .update(billingCashScan)
      .set({ factCursor: facts.at(-1)?.id ?? claim.factCursor, factDone: rows.length <= 1000 })
      .where(
        and(
          eq(billingCashScan.id, claim.id),
          eq(billingCashScan.generation, claim.generation),
          sql`${billingCashScan.leaseUntil} > clock_timestamp()`,
        ),
      );
  }

  private async localPaymentDisposition(
    claim: Scan,
    paymentIntentId: string,
  ): Promise<
    { readonly status: 'fulfilled' | 'missing' } | { readonly status: 'paid_unfulfilled'; readonly accountId: string }
  > {
    const [receipt] = await this.databaseService.database
      .select({ id: creditTransaction.id })
      .from(creditTransaction)
      .innerJoin(creditAccount, eq(creditAccount.id, creditTransaction.accountId))
      .where(
        and(
          eq(creditTransaction.paymentIntentId, paymentIntentId),
          eq(creditAccount.environment, claim.environment),
          eq(creditTransaction.stripeAccountId, claim.stripeAccountId),
          eq(creditTransaction.livemode, claim.livemode),
        ),
      )
      .limit(1);
    if (receipt !== undefined) return { status: 'fulfilled' };
    const [purchase] = await this.databaseService.database
      .select({ accountId: billingPurchase.accountId })
      .from(billingPurchase)
      .innerJoin(creditAccount, eq(creditAccount.id, billingPurchase.accountId))
      .where(
        and(
          eq(billingPurchase.paymentIntentId, paymentIntentId),
          eq(creditAccount.environment, claim.environment),
          eq(billingPurchase.stripeAccountId, claim.stripeAccountId),
          eq(billingPurchase.livemode, claim.livemode),
          eq(billingPurchase.state, 'paid_unfulfilled'),
        ),
      )
      .limit(1);
    return purchase === undefined
      ? { status: 'missing' }
      : { status: 'paid_unfulfilled', accountId: purchase.accountId };
  }

  private async hasOwnedRefund(fact: typeof billingCashFact.$inferSelect): Promise<boolean> {
    const { refundIntentId: intentId, reversalCaseId } = fact.evidence;
    if (typeof intentId !== 'string' || typeof reversalCaseId !== 'string') return false;
    const [owned] = await this.databaseService.database
      .select({ id: billingRefundIntent.id })
      .from(billingRefundIntent)
      .innerJoin(billingProviderLeg, eq(billingProviderLeg.refundIntentId, billingRefundIntent.id))
      .where(
        and(
          eq(billingRefundIntent.id, intentId),
          eq(billingRefundIntent.reversalCaseId, reversalCaseId),
          eq(billingRefundIntent.state, 'succeeded'),
          eq(billingProviderLeg.providerObjectId, fact.sourceId),
        ),
      )
      .limit(1);
    return owned !== undefined;
  }

  private async hasQualifiedDispute(claim: Scan, disputeId: string): Promise<boolean> {
    const [cashCase] = await this.databaseService.database
      .select({ id: billingReversalCase.id })
      .from(billingReversalCase)
      .where(
        and(
          eq(billingReversalCase.environment, claim.environment),
          eq(billingReversalCase.stripeAccountId, claim.stripeAccountId),
          eq(billingReversalCase.livemode, claim.livemode),
          isNotNull(billingReversalCase.projectionEvidence),
          sql`${billingReversalCase.projectionEvidence}->'disputeIds' ? ${disputeId}`,
        ),
      )
      .limit(1);
    return cashCase !== undefined;
  }

  private async retrieveLateReceiptSource(
    claim: Scan,
    receipt: typeof creditTransaction.$inferSelect,
  ): Promise<boolean> {
    const paymentIntentId = receipt.paymentIntentId ?? undefined;
    const chargeId = receipt.chargeId ?? undefined;
    if (paymentIntentId === undefined || chargeId === undefined) return false;
    const [cause] =
      receipt.purchaseId === null
        ? receipt.periodId === null
          ? []
          : await this.databaseService.database
              .select({ paidEvidence: billingPeriod.paidEvidence })
              .from(billingPeriod)
              .where(eq(billingPeriod.id, receipt.periodId))
        : await this.databaseService.database
            .select({ paidEvidence: billingPurchase.paidEvidence })
            .from(billingPurchase)
            .where(eq(billingPurchase.id, receipt.purchaseId));
    const parsed = paidPaymentEvidenceSchema.safeParse(cause?.paidEvidence);
    if (!parsed.success) return false;
    const paid = parsed.data;
    const paidGross = BigInt(paid.grossMinor);
    if (
      paid.stripeAccountId !== claim.stripeAccountId ||
      paid.livemode !== claim.livemode ||
      paid.currency !== claim.currency ||
      paid.paymentIntentIds.length !== 1 ||
      paid.paymentIntentIds[0] !== paymentIntentId ||
      paid.chargeIds.length !== 1 ||
      paid.chargeIds[0] !== chargeId ||
      paidGross > BigInt(Number.MAX_SAFE_INTEGER)
    )
      return false;
    try {
      const [paymentIntent, charge] = await Promise.all([
        retrieveStripePaymentIntent(this.sourceStripe, paymentIntentId),
        retrieveStripeCharge(this.sourceStripe, chargeId),
      ]);
      if (
        paymentIntent.status !== 'succeeded' ||
        !isSafeMinor(paymentIntent.amount_received) ||
        !isSafeMinor(charge.amount) ||
        !isSafeMinor(charge.amount_captured) ||
        paymentIntent.currency !== claim.currency ||
        paymentIntent.livemode !== claim.livemode ||
        idOf(paymentIntent.customer) !== paid.customerId ||
        idOf(paymentIntent.latest_charge) !== charge.id ||
        paymentIntent.amount_received !== charge.amount ||
        charge.id !== chargeId ||
        charge.status !== 'succeeded' ||
        !charge.paid ||
        charge.amount_captured !== charge.amount ||
        charge.currency !== claim.currency ||
        charge.livemode !== claim.livemode ||
        idOf(charge.customer) !== paid.customerId ||
        idOf(charge.payment_intent) !== paymentIntent.id
      )
        return false;
      if (charge.amount !== Number(paidGross)) return false;
      await this.commitLateFacts(claim, 'paymentIntent', [paymentIntent]);
      await this.commitLateFacts(claim, 'charge', [charge]);
      return true;
    } catch {
      return false;
    }
  }

  private async commitLateFacts(claim: Scan, stream: StreamName, objects: readonly CashObject[]): Promise<void> {
    await this.databaseService.database.transaction(async (tx) => {
      const [live] = await tx
        .select({ id: billingCashScan.id })
        .from(billingCashScan)
        .where(
          and(
            eq(billingCashScan.id, claim.id),
            eq(billingCashScan.generation, claim.generation),
            eq(billingCashScan.journalDone, false),
            eq(billingCashScan.factDone, false),
            sql`${billingCashScan.leaseUntil} > clock_timestamp()`,
          ),
        )
        .for('update');
      if (live === undefined) throw new ServiceUnavailableException('stale_cash_scan');
      await persistFacts(tx, claim, stream, objects);
    });
  }

  private async openCase(
    scan: Scan,
    kind: string,
    sourceId: string,
    accountId: string | undefined,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    const dedupeKey = `${kind}:${sourceId}`;
    await this.databaseService.database.transaction(async (tx) => {
      if (accountId !== undefined) {
        const [account] = await tx
          .select({ id: creditAccount.id })
          .from(creditAccount)
          .where(eq(creditAccount.id, accountId))
          .for('update');
        if (account === undefined) throw new ServiceUnavailableException('cash_case_account_missing');
      }
      const [live] = await tx
        .select({ id: billingCashScan.id })
        .from(billingCashScan)
        .where(
          and(
            eq(billingCashScan.id, scan.id),
            eq(billingCashScan.generation, scan.generation),
            sql`${billingCashScan.leaseUntil} > clock_timestamp()`,
          ),
        )
        .for('update');
      if (live === undefined) throw new ServiceUnavailableException('stale_cash_scan');
      await tx
        .insert(billingFinancialCase)
        .values({
          id: randomUUID(),
          environment: scan.environment,
          stripeAccountId: scan.stripeAccountId,
          livemode: scan.livemode,
          kind,
          dedupeKey,
          accountId,
          sourceType: kind === 'orphan_local_receipt' ? 'credit_transaction' : 'payment_intent',
          sourceId,
          currency: typeof evidence['currency'] === 'string' ? evidence['currency'] : null,
          knownAmountMinor:
            typeof evidence['amount'] === 'number' && Number.isSafeInteger(evidence['amount'])
              ? BigInt(evidence['amount'])
              : null,
          evidence,
          owner: 'billing-operations',
          nextStep: 'qualify_source_and_resolve',
          firstEffectiveAt: scan.windowStart,
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
            evidence,
            nextStep: 'qualify_source_and_resolve',
          },
        });
    });
  }

  private async resolveCase(scan: Scan, kind: string, sourceId: string): Promise<void> {
    const dedupeKey = `${kind}:${sourceId}`;
    const [existing] = await this.databaseService.database
      .select({ accountId: billingFinancialCase.accountId })
      .from(billingFinancialCase)
      .where(
        and(
          eq(billingFinancialCase.environment, scan.environment),
          eq(billingFinancialCase.stripeAccountId, scan.stripeAccountId),
          eq(billingFinancialCase.livemode, scan.livemode),
          eq(billingFinancialCase.kind, kind),
          eq(billingFinancialCase.dedupeKey, dedupeKey),
        ),
      );
    if (existing === undefined) return;
    await this.databaseService.database.transaction(async (tx) => {
      if (existing.accountId !== null) {
        await tx
          .select({ id: creditAccount.id })
          .from(creditAccount)
          .where(eq(creditAccount.id, existing.accountId))
          .for('update');
      }
      const [live] = await tx
        .select({ id: billingCashScan.id })
        .from(billingCashScan)
        .where(
          and(
            eq(billingCashScan.id, scan.id),
            eq(billingCashScan.generation, scan.generation),
            sql`${billingCashScan.leaseUntil} > clock_timestamp()`,
          ),
        )
        .for('update');
      if (live === undefined) throw new ServiceUnavailableException('stale_cash_scan');
      await tx
        .update(billingFinancialCase)
        .set({
          state: 'resolved',
          resolvedAt: sql`clock_timestamp()`,
          resolutionEvidence: { scanId: scan.id, sourceId, disposition: 'source_qualified' },
        })
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
    });
  }

  private async releaseIncomplete(id: string, generation: bigint, code: string): Promise<void> {
    await this.databaseService.database
      .update(billingCashScan)
      .set({ state: 'incomplete', errorCode: code, leaseUntil: null })
      .where(
        and(
          eq(billingCashScan.id, id),
          eq(billingCashScan.generation, generation),
          sql`${billingCashScan.leaseUntil} > clock_timestamp()`,
        ),
      );
  }
}

function cursorOf(scan: Scan, stream: StreamName): string | undefined {
  const value =
    stream === 'balance'
      ? scan.balanceCursor
      : stream === 'paymentIntent'
        ? scan.paymentIntentCursor
        : stream === 'charge'
          ? scan.chargeCursor
          : scan.refundCursor;
  return value ?? undefined;
}

function doneOf(scan: Scan, stream: StreamName): boolean {
  return stream === 'balance'
    ? scan.balanceDone
    : stream === 'paymentIntent'
      ? scan.paymentIntentDone
      : stream === 'charge'
        ? scan.chargeDone
        : scan.refundDone;
}

function streamUpdate(stream: StreamName, cursor: string | undefined, done: boolean) {
  switch (stream) {
    case 'balance':
      return { balanceCursor: cursor, balanceDone: done };
    case 'paymentIntent':
      return { paymentIntentCursor: cursor, paymentIntentDone: done };
    case 'charge':
      return { chargeCursor: cursor, chargeDone: done };
    case 'refund':
      return { refundCursor: cursor, refundDone: done };
  }
}

async function persistFacts(
  tx: Transaction,
  claim: Scan,
  stream: StreamName,
  objects: readonly CashObject[],
): Promise<void> {
  for (const object of objects) {
    const normalized = normalizeFact(claim, stream, object);
    const [created] = await tx
      .insert(billingCashFact)
      .values(normalized)
      .onConflictDoNothing()
      .returning({ id: billingCashFact.id });
    const existing = await tx
      .select({ id: billingCashFact.id })
      .from(billingCashFact)
      .where(
        and(
          eq(billingCashFact.environment, normalized.environment),
          eq(billingCashFact.stripeAccountId, normalized.stripeAccountId),
          eq(billingCashFact.livemode, normalized.livemode),
          eq(billingCashFact.sourceType, normalized.sourceType),
          eq(billingCashFact.sourceId, normalized.sourceId),
          eq(billingCashFact.objectDigest, normalized.objectDigest),
        ),
      );
    const fact = created ?? existing[0];
    if (fact === undefined) throw new ServiceUnavailableException('cash_fact_conflict');
    await tx.insert(billingCashScanFact).values({ scanId: claim.id, factId: fact.id }).onConflictDoNothing();
  }
}

function normalizeFact(scan: Scan, stream: StreamName, object: CashObject): typeof billingCashFact.$inferInsert {
  if (
    !Number.isSafeInteger(object.created) ||
    object.created < 0 ||
    object.created > 8_640_000_000_000 ||
    ('amount' in object && !Number.isSafeInteger(object.amount)) ||
    ('fee' in object && !Number.isSafeInteger(object.fee)) ||
    ('net' in object && !Number.isSafeInteger(object.net))
  )
    throw new ConflictException('unsafe_cash_fact');
  const sourceType =
    stream === 'paymentIntent' ? 'payment_intent' : stream === 'balance' ? 'balance_transaction' : stream;
  const evidence = z.record(z.string(), z.unknown()).parse({
    id: object.id,
    object: object.object,
    created: object.created,
    ...(object.object === 'payment_intent' || object.object === 'charge' || object.object === 'refund'
      ? { status: object.status }
      : {}),
    ...('currency' in object ? { currency: object.currency } : {}),
    ...('amount' in object ? { amount: object.amount } : {}),
    ...('fee' in object ? { fee: object.fee } : {}),
    ...('net' in object ? { net: object.net } : {}),
    ...('customer' in object ? { customer: idOf(object.customer) } : {}),
    ...('payment_intent' in object ? { paymentIntent: idOf(object.payment_intent) } : {}),
    ...('charge' in object ? { charge: idOf(object.charge) } : {}),
    ...('balance_transaction' in object ? { balanceTransaction: idOf(object.balance_transaction) } : {}),
    ...('source' in object ? { source: idOf(object.source) } : {}),
    ...('type' in object ? { type: object.type } : {}),
    ...(object.object === 'refund'
      ? {
          refundIntentId: object.metadata?.['tau_refund_intent_id'] ?? null,
          reversalCaseId: object.metadata?.['tau_reversal_case_id'] ?? null,
        }
      : {}),
  });
  return {
    id: randomUUID(),
    scanId: scan.id,
    environment: scan.environment,
    stripeAccountId: scan.stripeAccountId,
    livemode: scan.livemode,
    sourceType,
    sourceId: object.id,
    sourceCreatedAt: new Date(object.created * 1000),
    currency: 'currency' in object ? object.currency : null,
    amountMinor: 'amount' in object ? BigInt(object.amount) : null,
    feeMinor: 'fee' in object ? BigInt(object.fee) : null,
    netMinor: 'net' in object ? BigInt(object.net) : null,
    customerId: 'customer' in object ? idOf(object.customer) : null,
    paymentIntentId:
      object.object === 'payment_intent' ? object.id : 'payment_intent' in object ? idOf(object.payment_intent) : null,
    chargeId: object.object === 'charge' ? object.id : 'charge' in object ? idOf(object.charge) : null,
    refundId: object.object === 'refund' ? object.id : null,
    balanceTransactionId: object.object === 'balance_transaction' ? object.id : null,
    objectDigest: digest(evidence),
    evidence,
  };
}

function idOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string') return value.id;
  return undefined;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isSafeMinor(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
