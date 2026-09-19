/* oxlint-disable no-await-in-loop -- one batch transaction writes its cases in a deterministic order */
import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import type { DatabaseService } from '#database/database.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { billingFinancialCase, billingJournalCheckpoint, creditAccount, creditTransaction } from '#database/schema.js';

type Checkpoint = typeof billingJournalCheckpoint.$inferSelect;
type Transaction = Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0];
type CheckpointAdvance = Partial<
  Pick<Checkpoint, 'incrementalOccurredAt' | 'incrementalTransactionId' | 'sweepAccountId' | 'sweepCycles'>
>;

/** Only the two drift gauges are consumed; the sweep never touches the rest of the catalog. */
type DriftGauges = Pick<MetricsService, 'billingLedgerDrift' | 'billingDriftedAccounts'>;

/**
 * Case kinds this sweep opens.
 *
 * An open or attention case here pauses new admission for its own account through the existing
 * `credit-ledger.service.ts` financial-case gate; see the lane report's Lead seam for the
 * one-line union that admits this list alongside `cashBlockingFinancialCaseKinds`.
 */
export const journalBlockingFinancialCaseKinds: readonly string[] = [
  'journal_balance_drift',
  'journal_hold_drift',
  'journal_resolution_drift',
  'journal_missing_cause',
  'journal_revision_conflict',
  'journal_budget_residual',
];

export type JournalReconciliationReport = {
  readonly incrementalAccounts: number;
  readonly sweptAccounts: number;
  readonly driftedAccounts: number;
  /** Maximum absolute per-account, per-source drift in credit atoms (1 atom = 1 microUSD). */
  readonly maximumDriftAtoms: string;
  readonly openedCases: number;
  readonly resolvedCases: number;
  readonly incrementalComplete: boolean;
  readonly sweepCycleComplete: boolean;
};

const atoms = z.string().regex(/^-?(0|[1-9][0-9]*)$/u);
const count = z.coerce.number().int().min(0);
const differenceSchema = z.object({
  accountId: z.string(),
  accountRevision: atoms,
  promoDrift: atoms,
  planDrift: atoms,
  purchasedDrift: atoms,
  debtDrift: atoms,
  promoHoldDrift: atoms,
  planHoldDrift: atoms,
  purchasedHoldDrift: atoms,
  unresolvedOperations: count,
  orphanResolutions: count,
  missingCause: count,
  duplicateRevisions: count,
  revisionAhead: z.boolean(),
  residualBudgetHolds: count,
  oldestEvidence: z.coerce.date(),
});
type Difference = z.infer<typeof differenceSchema>;

type Finding = {
  readonly kind: string;
  readonly driftAtoms: bigint;
  readonly nextStep: string;
  readonly evidence: Record<string, unknown>;
};

/**
 * B7 R7 account-journal reconciliation.
 *
 * Compares every materialised `credit_account` counter against its independent cause — the
 * journal for the four source balances, still-pending operations plus held refund intents for
 * the three hold columns — and turns each remaining difference into an actionable financial
 * case instead of a repair. R9: an incremental pass walks changed accounts from a durable
 * checkpoint and a bounded keyset sweep re-checks every account independently, so a missed
 * change marker is still detected; neither pass advances its cursor outside the transaction
 * that commits its own case effects.
 */
@Injectable()
export class BillingJournalReconciliationService {
  public constructor(
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly metrics: DriftGauges,
    private readonly config: {
      readonly environment: FinancialEnvironment;
      readonly stripeAccountId: string;
      readonly livemode: boolean;
    },
  ) {}

  /** Runs one incremental batch and one bounded full-sweep batch, then records the drift gauges. */
  public async runSweep(input: { readonly batchLimit: number }): Promise<JournalReconciliationReport> {
    if (!Number.isSafeInteger(input.batchLimit) || input.batchLimit < 1 || input.batchLimit > 500) {
      throw new ConflictException('invalid_journal_batch');
    }
    const claim = await this.claimCheckpoint();
    const incremental = await this.runIncremental(claim, input.batchLimit);
    const sweep = await this.runFullSweep(claim, input.batchLimit);
    await this.releaseCheckpoint(claim);
    const maximumDriftAtoms =
      incremental.maximumDriftAtoms > sweep.maximumDriftAtoms ? incremental.maximumDriftAtoms : sweep.maximumDriftAtoms;
    // Both passes can reach the same account; the gauge counts accounts, not visits.
    const driftedAccounts = new Set([...incremental.driftedAccountIds, ...sweep.driftedAccountIds]).size;
    // The gauges are recorded on every sweep, including a clean one, so `billing-ledger-drift`
    // alerts on real drift instead of on a missing series.
    this.metrics.billingLedgerDrift.record(Number(maximumDriftAtoms));
    this.metrics.billingDriftedAccounts.record(driftedAccounts);
    return {
      incrementalAccounts: incremental.checkedAccounts,
      sweptAccounts: sweep.checkedAccounts,
      driftedAccounts,
      maximumDriftAtoms: maximumDriftAtoms.toString(),
      openedCases: incremental.openedCases + sweep.openedCases,
      resolvedCases: incremental.resolvedCases + sweep.resolvedCases,
      incrementalComplete: incremental.checkedAccounts === 0,
      sweepCycleComplete: sweep.cycleComplete,
    };
  }

  /** Claims the scope's checkpoint row, creating it on first use. */
  private async claimCheckpoint(): Promise<Checkpoint> {
    await this.databaseService.database
      .insert(billingJournalCheckpoint)
      .values({
        id: randomUUID(),
        environment: this.config.environment,
        stripeAccountId: this.config.stripeAccountId,
        livemode: this.config.livemode,
      })
      .onConflictDoNothing();
    const [claim] = await this.databaseService.database
      .update(billingJournalCheckpoint)
      .set({
        generation: sql`${billingJournalCheckpoint.generation} + 1`,
        leaseUntil: sql`date_trunc('milliseconds', clock_timestamp()) + interval '60 seconds'`,
      })
      .where(
        and(
          eq(billingJournalCheckpoint.environment, this.config.environment),
          eq(billingJournalCheckpoint.stripeAccountId, this.config.stripeAccountId),
          eq(billingJournalCheckpoint.livemode, this.config.livemode),
          sql`(${billingJournalCheckpoint.leaseUntil} IS NULL OR ${billingJournalCheckpoint.leaseUntil} <= clock_timestamp())`,
        ),
      )
      .returning();
    if (claim === undefined) {
      throw new ServiceUnavailableException('journal_checkpoint_claimed');
    }
    return claim;
  }

  /**
   * Verifies the accounts touched by the next page of journal movements.
   *
   * ponytail: the change marker is the journal keyset `(occurred_at, id)`, which needs no new
   * column; a movement that commits behind the cursor, and an account whose only change was a
   * hold, are both left to the full sweep. Narrow the window by adding a lookback overlap here
   * only if the sweep cycle ever becomes too slow to be that safety net.
   */
  private async runIncremental(claim: Checkpoint, limit: number): Promise<BatchOutcome> {
    const markers = await this.databaseService.database
      .select({ id: creditTransaction.id, accountId: creditTransaction.accountId, at: creditTransaction.occurredAt })
      .from(creditTransaction)
      .innerJoin(creditAccount, eq(creditAccount.id, creditTransaction.accountId))
      .where(
        and(
          eq(creditAccount.environment, this.config.environment),
          claim.incrementalOccurredAt === null || claim.incrementalTransactionId === null
            ? undefined
            : // The ISO cast keeps the driver from encoding a bare `Date` inside the row comparison.
              sql`(${creditTransaction.occurredAt}, ${creditTransaction.id}) > (${claim.incrementalOccurredAt.toISOString()}::timestamptz, ${claim.incrementalTransactionId})`,
        ),
      )
      .orderBy(asc(creditTransaction.occurredAt), asc(creditTransaction.id))
      .limit(limit);
    const last = markers.at(-1);
    if (last === undefined) {
      return emptyOutcome;
    }
    return this.verifyBatch(claim, [...new Set(markers.map((marker) => marker.accountId))], {
      incrementalOccurredAt: last.at,
      incrementalTransactionId: last.id,
    });
  }

  /** Verifies the next keyset page of accounts, independently of any change marker. */
  private async runFullSweep(claim: Checkpoint, limit: number): Promise<BatchOutcome> {
    const accounts = await this.databaseService.database
      .select({ id: creditAccount.id })
      .from(creditAccount)
      .where(
        and(
          eq(creditAccount.environment, this.config.environment),
          claim.sweepAccountId === null ? undefined : gt(creditAccount.id, claim.sweepAccountId),
        ),
      )
      .orderBy(asc(creditAccount.id))
      .limit(limit);
    const last = accounts.at(-1);
    if (last === undefined) {
      // The cycle ended: restart it from the first account on the next run.
      const restarted = await this.verifyBatch(claim, [], {
        sweepAccountId: null,
        sweepCycles: claim.sweepCycles + 1n,
      });
      return { ...restarted, cycleComplete: true };
    }
    return this.verifyBatch(
      claim,
      accounts.map((account) => account.id),
      { sweepAccountId: last.id },
    );
  }

  /** One batch: lock, compare, case, advance the cursor — all in a single transaction. */
  private async verifyBatch(
    claim: Checkpoint,
    accountIds: readonly string[],
    advance: CheckpointAdvance,
  ): Promise<BatchOutcome> {
    return this.databaseService.database.transaction(async (tx) => {
      const [live] = await tx
        .select({ id: billingJournalCheckpoint.id })
        .from(billingJournalCheckpoint)
        .where(
          and(
            eq(billingJournalCheckpoint.id, claim.id),
            eq(billingJournalCheckpoint.generation, claim.generation),
            sql`${billingJournalCheckpoint.leaseUntil} > clock_timestamp()`,
          ),
        )
        .for('update');
      if (live === undefined) {
        throw new ServiceUnavailableException('stale_journal_checkpoint');
      }
      let outcome: BatchOutcome = { ...emptyOutcome, checkedAccounts: accountIds.length };
      if (accountIds.length > 0) {
        // Account-first lock order matches the ledger's, so a concurrent admission cannot
        // expose a half-applied account/journal pair as drift.
        await tx
          .select({ id: creditAccount.id })
          .from(creditAccount)
          .where(inArray(creditAccount.id, [...accountIds]))
          .orderBy(asc(creditAccount.id))
          .for('update');
        for (const difference of await readDifferences(tx, this.config.environment, accountIds)) {
          const findings = findingsOf(difference);
          for (const finding of findings) {
            await this.openCase(tx, difference, finding);
          }
          const resolved = await this.resolveConverged(
            tx,
            difference.accountId,
            journalBlockingFinancialCaseKinds.filter((kind) => !findings.some((found) => found.kind === kind)),
          );
          outcome = {
            ...outcome,
            driftedAccountIds:
              findings.length > 0 ? [...outcome.driftedAccountIds, difference.accountId] : outcome.driftedAccountIds,
            openedCases: outcome.openedCases + findings.length,
            resolvedCases: outcome.resolvedCases + resolved,
            maximumDriftAtoms: largestOf([...findings.map((finding) => finding.driftAtoms), outcome.maximumDriftAtoms]),
          };
        }
      }
      await tx
        .update(billingJournalCheckpoint)
        .set(advance)
        .where(
          and(eq(billingJournalCheckpoint.id, claim.id), eq(billingJournalCheckpoint.generation, claim.generation)),
        );
      return outcome;
    });
  }

  /** Opens or refreshes one actionable case; history is never edited to close a difference. */
  private async openCase(tx: Transaction, difference: Difference, finding: Finding): Promise<void> {
    await tx
      .insert(billingFinancialCase)
      .values({
        id: randomUUID(),
        environment: this.config.environment,
        stripeAccountId: this.config.stripeAccountId,
        livemode: this.config.livemode,
        kind: finding.kind,
        dedupeKey: `${finding.kind}:${difference.accountId}`,
        accountId: difference.accountId,
        sourceType: 'credit_account',
        sourceId: difference.accountId,
        evidence: {
          ...finding.evidence,
          driftAtoms: finding.driftAtoms.toString(),
          accountRevision: difference.accountRevision,
          oldestEvidenceAt: difference.oldestEvidence.toISOString(),
        },
        owner: 'billing-operations',
        nextStep: finding.nextStep,
        firstEffectiveAt: difference.oldestEvidence,
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
          evidence: {
            ...finding.evidence,
            driftAtoms: finding.driftAtoms.toString(),
            accountRevision: difference.accountRevision,
            oldestEvidenceAt: difference.oldestEvidence.toISOString(),
          },
          nextStep: finding.nextStep,
        },
      });
  }

  /** Closes the account's cases whose difference is gone, so the pause lifts with the cause. */
  private async resolveConverged(tx: Transaction, accountId: string, kinds: readonly string[]): Promise<number> {
    if (kinds.length === 0) {
      return 0;
    }
    const resolved = await tx
      .update(billingFinancialCase)
      .set({
        state: 'resolved',
        resolvedAt: sql`clock_timestamp()`,
        resolutionEvidence: { accountId, disposition: 'journal_reconciled' },
      })
      .where(
        and(
          eq(billingFinancialCase.environment, this.config.environment),
          eq(billingFinancialCase.stripeAccountId, this.config.stripeAccountId),
          eq(billingFinancialCase.livemode, this.config.livemode),
          eq(billingFinancialCase.accountId, accountId),
          inArray(billingFinancialCase.kind, [...kinds]),
          inArray(billingFinancialCase.state, ['open', 'attention']),
        ),
      )
      .returning({ id: billingFinancialCase.id });
    return resolved.length;
  }

  private async releaseCheckpoint(claim: Checkpoint): Promise<void> {
    await this.databaseService.database
      .update(billingJournalCheckpoint)
      .set({ leaseUntil: null, lastCompletedAt: sql`clock_timestamp()` })
      .where(and(eq(billingJournalCheckpoint.id, claim.id), eq(billingJournalCheckpoint.generation, claim.generation)));
  }
}

type BatchOutcome = {
  readonly checkedAccounts: number;
  readonly driftedAccountIds: readonly string[];
  readonly openedCases: number;
  readonly resolvedCases: number;
  readonly maximumDriftAtoms: bigint;
  readonly cycleComplete: boolean;
};

const emptyOutcome: BatchOutcome = {
  checkedAccounts: 0,
  driftedAccountIds: [],
  openedCases: 0,
  resolvedCases: 0,
  maximumDriftAtoms: 0n,
  cycleComplete: false,
};

const absolute = (value: string): bigint => {
  const parsed = BigInt(value);
  return parsed < 0n ? -parsed : parsed;
};

const largestOf = (values: readonly bigint[]): bigint => {
  let maximum = 0n;
  for (const value of values) {
    if (value > maximum) {
      maximum = value;
    }
  }
  return maximum;
};

const largest = (...values: readonly string[]): bigint => largestOf(values.map((value) => absolute(value)));

/** Turns one compared account into the differences that deserve a case. */
function findingsOf(difference: Difference): readonly Finding[] {
  const findings: Finding[] = [];
  const balance = largest(difference.promoDrift, difference.planDrift, difference.purchasedDrift, difference.debtDrift);
  if (balance > 0n) {
    findings.push({
      kind: 'journal_balance_drift',
      driftAtoms: balance,
      nextStep: 'replay_journal_causes_then_authorize_a_linked_correction',
      evidence: {
        promoDriftAtoms: difference.promoDrift,
        planDriftAtoms: difference.planDrift,
        purchasedDriftAtoms: difference.purchasedDrift,
        debtDriftAtoms: difference.debtDrift,
      },
    });
  }
  const holds = largest(difference.promoHoldDrift, difference.planHoldDrift, difference.purchasedHoldDrift);
  if (holds > 0n) {
    findings.push({
      kind: 'journal_hold_drift',
      driftAtoms: holds,
      nextStep: 'requalify_pending_operation_and_held_refund_causes',
      evidence: {
        promoHoldDriftAtoms: difference.promoHoldDrift,
        planHoldDriftAtoms: difference.planHoldDrift,
        purchasedHoldDriftAtoms: difference.purchasedHoldDrift,
      },
    });
  }
  if (difference.unresolvedOperations > 0 || difference.orphanResolutions > 0) {
    findings.push({
      kind: 'journal_resolution_drift',
      driftAtoms: 0n,
      nextStep: 'reconcile_terminal_operations_with_their_resolution_movements',
      evidence: {
        operationsWithoutExactlyOneResolution: difference.unresolvedOperations,
        pendingOperationsWithResolution: difference.orphanResolutions,
      },
    });
  }
  if (difference.missingCause > 0) {
    findings.push({
      kind: 'journal_missing_cause',
      driftAtoms: 0n,
      nextStep: 'attach_or_reverse_the_uncaused_movements',
      evidence: { uncausedMovements: difference.missingCause },
    });
  }
  if (difference.duplicateRevisions > 0 || difference.revisionAhead) {
    findings.push({
      kind: 'journal_revision_conflict',
      driftAtoms: 0n,
      nextStep: 'fence_writers_then_replay_the_account_from_its_journal',
      evidence: {
        duplicatedRevisions: difference.duplicateRevisions,
        journalAheadOfAccount: difference.revisionAhead,
      },
    });
  }
  if (difference.residualBudgetHolds > 0) {
    findings.push({
      kind: 'journal_budget_residual',
      driftAtoms: 0n,
      nextStep: 'release_supplier_final_budget_holds',
      evidence: { residualBudgetHolds: difference.residualBudgetHolds },
    });
  }
  return findings;
}

/**
 * Reads every per-account comparison for the batch in one statement.
 *
 * The four source sums, the pending-operation hold sums and the resolution counts keep the
 * shape of the C09-I3 load-harness invariant queries; held refund intents, uncaused movements,
 * revision conflicts and residual supplier-final budget holds extend them. Per-account,
 * per-source comparison is what the internal total cannot do: two opposite missing effects
 * cancel in a global sum and survive here.
 */
async function readDifferences(
  tx: Transaction,
  environment: FinancialEnvironment,
  accountIds: readonly string[],
): Promise<readonly Difference[]> {
  const identifiers = sql.join(
    accountIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = await tx.execute(sql`
    select a.id as "accountId", a.revision::text as "accountRevision",
      (a.promo_atoms - j.promo)::text as "promoDrift",
      (a.plan_atoms - j.plan)::text as "planDrift",
      (a.purchased_atoms - j.purchased)::text as "purchasedDrift",
      (a.debt_atoms - j.debt)::text as "debtDrift",
      (a.promo_held_atoms - h.promo)::text as "promoHoldDrift",
      (a.plan_held_atoms - h.plan - r.plan)::text as "planHoldDrift",
      (a.purchased_held_atoms - h.purchased - r.purchased)::text as "purchasedHoldDrift",
      res.unresolved::text as "unresolvedOperations",
      res.orphan::text as "orphanResolutions",
      cause.total::text as "missingCause",
      rev.duplicates::text as "duplicateRevisions",
      (rev.maximum > a.revision) as "revisionAhead",
      budget.total::text as "residualBudgetHolds",
      coalesce(j.oldest, transaction_timestamp()) as "oldestEvidence"
    from billing.credit_account a
    join lateral (select coalesce(sum(t.promo_delta_atoms), 0) as promo,
        coalesce(sum(t.plan_delta_atoms), 0) as plan, coalesce(sum(t.purchased_delta_atoms), 0) as purchased,
        coalesce(sum(t.debt_delta_atoms), 0) as debt, min(t.occurred_at) as oldest
      from billing.credit_transaction t where t.account_id = a.id) j on true
    join lateral (select coalesce(sum(o.promo_held_atoms), 0) as promo,
        coalesce(sum(o.plan_held_atoms), 0) as plan, coalesce(sum(o.purchased_held_atoms), 0) as purchased
      from billing.credit_operation o where o.account_id = a.id and o.customer_state = 'pending') h on true
    join lateral (select coalesce(sum(i.hold_atoms) filter (where c.source = 'plan'), 0) as plan,
        coalesce(sum(i.hold_atoms) filter (where c.source = 'purchased'), 0) as purchased
      from billing.billing_refund_intent i
      join billing.billing_reversal_case c on c.id = i.reversal_case_id
      where i.account_id = a.id and i.hold_state = 'held') r on true
    join lateral (select count(*) filter (where o.customer_state <> 'pending' and n.total <> 1) as unresolved,
        count(*) filter (where o.customer_state = 'pending' and n.total <> 0) as orphan
      from billing.credit_operation o
      cross join lateral (select count(*) as total from billing.credit_transaction t
        where t.operation_id = o.id and t.kind = 'operation_resolution') n
      where o.account_id = a.id) res on true
    join lateral (select count(*) as total from billing.credit_transaction t
      where t.account_id = a.id and not (
        (t.kind = 'operation_resolution' and t.operation_id is not null)
        or (t.kind = 'purchase_grant' and t.purchase_id is not null)
        or (t.kind = 'period_grant' and t.period_id is not null)
        or (t.kind = 'promotion_grant' and t.promotion_issuance_id is not null)
        or (t.kind = 'reversal' and t.reversal_case_id is not null)
        or (t.kind = 'deferred_grant' and t.reversal_case_id is not null and t.correction_of is not null)
        or (t.kind = 'compensation' and t.correction_of is not null))) cause on true
    join lateral (select count(*) - count(distinct t.revision) as duplicates,
        coalesce(max(t.revision), 0) as maximum
      from billing.credit_transaction t where t.account_id = a.id) rev on true
    join lateral (select count(*) as total from billing.billing_budget_hold bh
      join billing.credit_operation o on o.id = bh.operation_id
      where o.account_id = a.id and o.supplier_state in ('final', 'funded_exception')
        and bh.remaining_held <> 0) budget on true
    where a.environment = ${environment} and a.id in (${identifiers})
    order by a.id`);
  return rows.map((row) => differenceSchema.parse(row));
}
