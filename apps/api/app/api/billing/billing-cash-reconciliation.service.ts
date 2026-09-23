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
  billingStripeCustomer,
  creditAccount,
  creditTransaction,
} from '#database/schema.js';
import {
  listStripeBalancePage,
  listStripeChargePage,
  listStripePaymentIntentPage,
  listStripeRefundPage,
  retrieveStripeCharge,
  retrieveStripeDispute,
  retrieveStripeCustomer,
  retrieveStripePaymentIntent,
} from '#api/billing/billing-cash-stripe.js';
import { paidPaymentEvidenceSchema } from '#api/billing/billing-payment-contract.js';
import { journalBlockingFinancialCaseKinds } from '#api/billing/billing-journal-reconciliation.service.js';
import { purchaseBlockingFinancialCaseKinds } from '#api/billing/billing-purchase-reconciliation.service.js';

type Scan = typeof billingCashScan.$inferSelect;
type StreamName = 'balance' | 'paymentIntent' | 'charge' | 'refund';
type CashObject = Stripe.BalanceTransaction | Stripe.PaymentIntent | Stripe.Charge | Stripe.Refund;
type Transaction = Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0];
/** Kinds that were once opened without an account; their owned rows use a distinct key. */
const attributedCaseKinds = new Set([
  'refund_unresolved',
  'dispute_unresolved',
  'missing_local_payment',
  'gross_fee_net_mismatch',
]);

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

  /** True once the window's scan finished; the hourly job then has no cash work left for that window. */
  public async isComplete(scanId: string): Promise<boolean> {
    const [scan] = await this.databaseService.database
      .select({ state: billingCashScan.state })
      .from(billingCashScan)
      .where(eq(billingCashScan.id, scanId));
    return scan?.state === 'complete';
  }

  /**
   * Operator disposition for a case the scan cannot close itself: a reviewed resolution, or a
   * re-scope that retires an unattributed row once its owned successor exists.
   */
  public async resolveCaseByOperator(input: {
    readonly environment: FinancialEnvironment;
    readonly caseId: string;
    readonly disposition: 'resolved' | 'rescoped';
    readonly reviewActorId: string;
    readonly reason: string;
  }): Promise<{ readonly caseId: string; readonly before: string; readonly after: 'resolved' }> {
    if (input.environment !== this.config.environment) throw new ConflictException('case_scope');
    return this.databaseService.database.transaction(async (tx) => {
      const [found] = await tx
        .select()
        .from(billingFinancialCase)
        .where(
          and(
            eq(billingFinancialCase.id, input.caseId),
            eq(billingFinancialCase.environment, this.config.environment),
            eq(billingFinancialCase.stripeAccountId, this.config.stripeAccountId),
            eq(billingFinancialCase.livemode, this.config.livemode),
          ),
        );
      if (found === undefined) throw new ConflictException('case_not_found');
      if (found.state === 'resolved') return { caseId: found.id, before: 'resolved', after: 'resolved' };
      if (found.accountId !== null) {
        await tx
          .select({ id: creditAccount.id })
          .from(creditAccount)
          .where(eq(creditAccount.id, found.accountId))
          .for('update');
      }
      if (input.disposition === 'rescoped') {
        const [owned] = await tx
          .select({ id: billingFinancialCase.id })
          .from(billingFinancialCase)
          .where(
            and(
              eq(billingFinancialCase.environment, found.environment),
              eq(billingFinancialCase.stripeAccountId, found.stripeAccountId),
              eq(billingFinancialCase.livemode, found.livemode),
              eq(billingFinancialCase.kind, found.kind),
              sql`${billingFinancialCase.dedupeKey} LIKE ${`${found.dedupeKey}:%`}`,
              isNotNull(billingFinancialCase.accountId),
            ),
          )
          .limit(1);
        if (found.accountId !== null || owned === undefined) throw new ConflictException('case_rescope_unowned');
      }
      const [updated] = await tx
        .update(billingFinancialCase)
        .set({
          state: 'resolved',
          resolvedAt: sql`clock_timestamp()`,
          resolutionEvidence: {
            disposition: input.disposition,
            reviewActorId: input.reviewActorId,
            reason: input.reason,
            previousState: found.state,
          },
        })
        .where(and(eq(billingFinancialCase.id, found.id), eq(billingFinancialCase.state, found.state)))
        .returning({ id: billingFinancialCase.id });
      if (updated === undefined) throw new ServiceUnavailableException('case_changed');
      return { caseId: found.id, before: found.state, after: 'resolved' };
    });
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

  /** Extends a live claim before each unit of provider I/O; a lapsed or superseded claim stops the pass. */
  private async renewLease(claim: Scan): Promise<void> {
    const [renewed] = await this.databaseService.database
      .update(billingCashScan)
      .set({ leaseUntil: sql`date_trunc('milliseconds', clock_timestamp()) + interval '30 seconds'` })
      .where(
        and(
          eq(billingCashScan.id, claim.id),
          eq(billingCashScan.generation, claim.generation),
          sql`${billingCashScan.leaseUntil} > clock_timestamp()`,
        ),
      )
      .returning({ id: billingCashScan.id });
    if (renewed === undefined) throw new ServiceUnavailableException('stale_cash_scan');
  }

  private async scanStream(claim: Scan, stream: StreamName, maximumPages: number): Promise<void> {
    let cursor = cursorOf(claim, stream);
    if (doneOf(claim, stream)) return;
    for (let pageIndex = 0; pageIndex < maximumPages; pageIndex += 1) {
      await this.renewLease(claim);
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
        .set({
          ...streamUpdate(stream, nextCursor, done),
          leaseUntil: sql`date_trunc('milliseconds', clock_timestamp()) + interval '30 seconds'`,
        })
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
      await this.renewLease(claim);
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
    const [advanced] = await this.databaseService.database
      .update(billingCashScan)
      .set({ journalCursor: receipts.at(-1)?.id ?? claim.journalCursor, journalDone })
      .where(
        and(
          eq(billingCashScan.id, claim.id),
          eq(billingCashScan.generation, claim.generation),
          sql`${billingCashScan.leaseUntil} > clock_timestamp()`,
        ),
      )
      .returning({ id: billingCashScan.id });
    if (advanced === undefined) throw new ServiceUnavailableException('stale_cash_scan');
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
      await this.renewLease(claim);
      // The scan currency scopes the presentment streams; a balance transaction carries the account's
      // settlement currency, which differs whenever the account settles outside its presentment currency.
      // Only the gross/fee/net identity is currency-independent, so only that is asserted here.
      if (
        fact.sourceType === 'balance_transaction' &&
        (fact.amountMinor === null ||
          fact.feeMinor === null ||
          fact.netMinor === null ||
          fact.amountMinor - fact.feeMinor !== fact.netMinor)
      ) {
        await this.openCase(
          claim,
          'gross_fee_net_mismatch',
          fact.sourceId,
          await this.owningAccount(claim, fact.evidence),
          {
            factId: fact.id,
            amountMinor: fact.amountMinor?.toString() ?? null,
            feeMinor: fact.feeMinor?.toString() ?? null,
            netMinor: fact.netMinor?.toString() ?? null,
            currency: fact.currency,
          },
        );
      }
      if (fact.sourceType === 'payment_intent' && fact.evidence['status'] === 'succeeded') {
        const disposition = await this.localPaymentDisposition(claim, fact.sourceId);
        if (disposition.status === 'paid_unfulfilled') {
          await this.openCase(claim, 'paid_unfulfilled_recovery', fact.sourceId, disposition.accountId, fact.evidence);
        } else if (disposition.status === 'missing') {
          const owner = await this.owningAccount(claim, fact.evidence);
          await (owner === undefined && (await this.belongsToAnotherEnvironment(claim, fact.evidence))
            ? this.resolveCase(claim, 'missing_local_payment', fact.sourceId)
            : this.openCase(claim, 'missing_local_payment', fact.sourceId, owner, fact.evidence));
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
          const owner = await this.owningAccount(claim, fact.evidence);
          await (owner === undefined && (await this.belongsToAnotherEnvironment(claim, fact.evidence))
            ? this.resolveCase(claim, 'refund_unresolved', fact.sourceId)
            : this.openCase(claim, 'refund_unresolved', fact.sourceId, owner, fact.evidence));
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
          await this.openCase(
            claim,
            'dispute_unresolved',
            fact.sourceId,
            await this.owningAccount(claim, fact.evidence),
            fact.evidence,
          );
        } else if (await this.hasQualifiedDispute(claim, disputeId)) {
          await this.resolveCase(claim, 'dispute_unresolved', disputeId);
        } else {
          await this.openCase(
            claim,
            'dispute_unresolved',
            disputeId,
            await this.owningAccount(claim, { ...fact.evidence, charge: await this.disputedCharge(disputeId) }),
            fact.evidence,
          );
        }
      }
    }
    const [advanced] = await this.databaseService.database
      .update(billingCashScan)
      .set({ factCursor: facts.at(-1)?.id ?? claim.factCursor, factDone: rows.length <= 1000 })
      .where(
        and(
          eq(billingCashScan.id, claim.id),
          eq(billingCashScan.generation, claim.generation),
          sql`${billingCashScan.leaseUntil} > clock_timestamp()`,
        ),
      )
      .returning({ id: billingCashScan.id });
    if (advanced === undefined) throw new ServiceUnavailableException('stale_cash_scan');
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
    // An external (dashboard) refund is resolved once a qualified projection has applied it to the ledger.
    const [projected] = await this.databaseService.database
      .select({ id: billingReversalCase.id })
      .from(billingReversalCase)
      .where(
        and(
          eq(billingReversalCase.environment, fact.environment),
          eq(billingReversalCase.stripeAccountId, fact.stripeAccountId),
          eq(billingReversalCase.livemode, fact.livemode),
          isNotNull(billingReversalCase.projectionEvidence),
          sql`${billingReversalCase.projectionEvidence}->'refundIds' ? ${fact.sourceId}`,
        ),
      )
      .limit(1);
    if (projected !== undefined) return true;
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

  /**
   * The account a provider fact belongs to, so its case restricts only that customer. Resolution runs
   * through the fulfilled cause, then the purchase, then the Customer binding; `undefined` stays global.
   */
  private async owningAccount(scan: Scan, evidence: Record<string, unknown>): Promise<string | undefined> {
    const text = (value: unknown): string | undefined =>
      typeof value === 'string' && value.length > 0 ? value : undefined;
    const source = text(evidence['source']);
    const charge =
      text(evidence['charge']) ??
      (evidence['object'] === 'charge' ? text(evidence['id']) : undefined) ??
      (source !== undefined && (source.startsWith('ch_') || source.startsWith('py_')) ? source : undefined);
    const paymentIntent =
      text(evidence['paymentIntent']) ?? (evidence['object'] === 'payment_intent' ? text(evidence['id']) : undefined);
    const scope = (table: typeof billingReversalCase | typeof billingStripeCustomer) =>
      and(
        eq(table.environment, scan.environment),
        eq(table.stripeAccountId, scan.stripeAccountId),
        eq(table.livemode, scan.livemode),
      );
    const bySource = (table: typeof billingReversalCase | typeof billingPurchase) =>
      or(
        charge === undefined ? sql`false` : eq(table.chargeId, charge),
        paymentIntent === undefined ? sql`false` : eq(table.paymentIntentId, paymentIntent),
      );
    if (charge !== undefined || paymentIntent !== undefined) {
      const [cause] = await this.databaseService.database
        .select({ accountId: billingReversalCase.accountId })
        .from(billingReversalCase)
        .where(and(scope(billingReversalCase), bySource(billingReversalCase)))
        .limit(1);
      if (cause !== undefined) return cause.accountId;
      const [purchase] = await this.databaseService.database
        .select({ accountId: billingPurchase.accountId })
        .from(billingPurchase)
        .innerJoin(creditAccount, eq(creditAccount.id, billingPurchase.accountId))
        .where(and(eq(creditAccount.environment, scan.environment), bySource(billingPurchase)))
        .limit(1);
      if (purchase !== undefined) return purchase.accountId;
    }
    const customer = text(evidence['customer']);
    if (customer === undefined) return undefined;
    const [binding] = await this.databaseService.database
      .select({ accountId: billingStripeCustomer.accountId })
      .from(billingStripeCustomer)
      .where(and(scope(billingStripeCustomer), eq(billingStripeCustomer.stripeCustomerId, customer)))
      .limit(1);
    return binding?.accountId;
  }

  /**
   * Whether an unattributed test-mode fact provably belongs to another Tau environment. Test mode
   * shares one Stripe account between local development, the acceptance suite and staging, so
   * their customers' cash appears in every scan; each Tau-created customer carries the
   * environment that created it. Live mode backs exactly one environment, so a stamp there
   * proves nothing and the case opens as before. An unstamped or unreadable customer stays
   * unexplained cash.
   */
  private async belongsToAnotherEnvironment(scan: Scan, evidence: Record<string, unknown>): Promise<boolean> {
    const customerId = evidence['customer'];
    if (scan.livemode || typeof customerId !== 'string' || customerId.length === 0) return false;
    try {
      const customer = await retrieveStripeCustomer(this.sourceStripe, customerId);
      const stamp =
        'deleted' in customer && customer.deleted === true ? undefined : customer.metadata['tau_environment'];
      return typeof stamp === 'string' && stamp.length > 0 && stamp !== scan.environment;
    } catch {
      return false;
    }
  }

  /** The charge a dispute withdrew from; a failed read leaves the case unattributed rather than failing the scan. */
  private async disputedCharge(disputeId: string): Promise<string | undefined> {
    try {
      const dispute = await retrieveStripeDispute(this.sourceStripe, disputeId);
      return typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
    } catch {
      return undefined;
    }
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
    // An owned case keys on its account, so an unattributed row for the same source never reopens it.
    const dedupeKey =
      accountId === undefined || !attributedCaseKinds.has(kind)
        ? `${kind}:${sourceId}`
        : `${kind}:${sourceId}:${accountId}`;
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

  /** Resolves every open row for the source, whether it was opened for an account or unattributed. */
  private async resolveCase(scan: Scan, kind: string, sourceId: string): Promise<void> {
    const matching = and(
      eq(billingFinancialCase.environment, scan.environment),
      eq(billingFinancialCase.stripeAccountId, scan.stripeAccountId),
      eq(billingFinancialCase.livemode, scan.livemode),
      eq(billingFinancialCase.kind, kind),
      or(
        eq(billingFinancialCase.dedupeKey, `${kind}:${sourceId}`),
        sql`${billingFinancialCase.dedupeKey} LIKE ${`${kind}:${sourceId}:%`}`,
      ),
      or(eq(billingFinancialCase.state, 'open'), eq(billingFinancialCase.state, 'attention')),
    );
    const rows = await this.databaseService.database
      .select({ id: billingFinancialCase.id, accountId: billingFinancialCase.accountId })
      .from(billingFinancialCase)
      .where(matching);
    if (rows.length === 0) return;
    await this.databaseService.database.transaction(async (tx) => {
      const accounts = [...new Set(rows.flatMap((row) => (row.accountId === null ? [] : [row.accountId])))].sort();
      if (accounts.length > 0) {
        await tx
          .select({ id: creditAccount.id })
          .from(creditAccount)
          .where(inArray(creditAccount.id, accounts))
          .orderBy(asc(creditAccount.id))
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
        .where(matching);
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
