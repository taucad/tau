/* oxlint-disable no-await-in-loop -- case and checkpoint writes are sequential inside one page transaction */
import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { financialEnvironmentSchema } from '@taucad/billing';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import type { DatabaseService } from '#database/database.service.js';
import { billingFinancialCase, creditOperation, supplierCostEvidence } from '#database/schema.js';

type Transaction = Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0];
type Operation = typeof creditOperation.$inferSelect;
type Evidence = typeof supplierCostEvidence.$inferSelect;

/** Supplier exceptions an operator must close before the affected provider route is trusted again. */
export const supplierBlockingFinancialCaseKinds: readonly string[] = [
  'supplier_evidence_missing',
  'supplier_evidence_mismatched',
  'supplier_charge_unmatched',
  'supplier_state_unresolved',
  'supplier_invoice_total_mismatch',
];

/** Checkpoint rows are resolved-at-birth bookkeeping, never an operator exception. */
const checkpointKind = 'supplier_sweep_checkpoint';
const checkpointDedupeKey = 'supplier_usage_sweep';
const picoUsdPerUsd = 1_000_000_000_000n;
const unsignedIntegerString = z.string().regex(/^(0|[1-9][0-9]{0,38})$/u);

/**
 * The confirmed provider invoice total for one provider credential and period.
 *
 * B7 R7 separates a local cost *estimate* from a *confirmed* invoice cost, and
 * keeps aggregate-only provider evidence aggregate. The total is therefore an
 * operator import — a reviewed JSON document read from the provider's console
 * or billing statement and handed to `reconcileInvoiceTotal` — not a provider
 * billing API call, and never a per-user allocation.
 */
export const operatorSupplierInvoiceSchema = z
  .object({
    version: z.literal('operator-supplier-invoice-total-v1'),
    environment: financialEnvironmentSchema,
    provider: z.string().min(1).max(200),
    credentialAccount: z.string().min(1).max(200),
    periodStart: z.iso.datetime({ offset: true }),
    periodEnd: z.iso.datetime({ offset: true }),
    currency: z.literal('usd'),
    /** Confirmed invoice total in pico-USD; provider cost units are never credit atoms or cash minor units. */
    confirmedTotalPicoUsd: unsignedIntegerString,
    /** Accepted absolute difference in pico-USD, covering provider rounding and quantization. */
    tolerancePicoUsd: unsignedIntegerString,
    /** Operator provenance of the total, for example the statement or console page it was read from. */
    source: z.string().min(1).max(500),
    importedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type OperatorSupplierInvoice = z.infer<typeof operatorSupplierInvoiceSchema>;

export type SupplierSweepResult = {
  readonly operationsScanned: number;
  readonly evidenceScanned: number;
  readonly casesOpened: number;
  readonly pass: number;
  /** A complete pass finished; the next sweep starts a fresh bounded full pass. */
  readonly done: boolean;
};

export type SupplierInvoiceReconciliation = {
  readonly status: 'matched' | 'mismatched';
  readonly localEstimatePicoUsd: string;
  readonly confirmedTotalPicoUsd: string;
  readonly differencePicoUsd: string;
  readonly evidenceRows: number;
  readonly foreignCurrencyRows: number;
};

const checkpointSchema = z
  .object({
    operationCursor: z.string().nullish(),
    evidenceCursor: z.string().nullish(),
    pass: z.number().int().nonnegative(),
  })
  .partial()
  .transform((value) => ({
    operationCursor: value.operationCursor ?? undefined,
    evidenceCursor: value.evidenceCursor ?? undefined,
    pass: value.pass ?? 0,
  }));

/**
 * Reconciles local supplier evidence against admitted operations and the confirmed provider invoice.
 *
 * Read-only over the journal: the only writes are operator cases and this
 * sweep's own checkpoint. Nothing here debits a customer, allocates aggregate
 * provider cost to a user, or edits a historical amount.
 */
@Injectable()
export class BillingSupplierReconciliationService {
  public constructor(
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly config: {
      readonly environment: FinancialEnvironment;
      readonly stripeAccountId: string;
      readonly livemode: boolean;
    },
  ) {}

  /**
   * Advances one bounded, keyset-paginated page of the supplier usage sweep.
   *
   * Effects and checkpoint commit together (R9): a crash mid-page replays the
   * same page rather than skipping it, and case identities are idempotent, so a
   * replay opens no duplicate.
   */
  public async sweepSupplierUsage(input: {
    readonly pageSize: number;
    /** Milliseconds after which a still-`unresolved` supplier state becomes an operator case. */
    readonly unresolvedMaximumAge: number;
  }): Promise<SupplierSweepResult> {
    if (!Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 1000) {
      throw new ConflictException('invalid_supplier_sweep_page');
    }
    if (!Number.isSafeInteger(input.unresolvedMaximumAge) || input.unresolvedMaximumAge < 0) {
      throw new ConflictException('invalid_supplier_sweep_age');
    }
    return this.databaseService.database.transaction(async (tx) => {
      const checkpoint = await this.claimCheckpoint(tx);
      const operations = await this.sweepOperations(tx, checkpoint.operationCursor, input);
      const evidence = await this.sweepUnmatchedEvidence(tx, checkpoint.evidenceCursor, input.pageSize);
      const done = operations.done && evidence.done;
      await tx
        .update(billingFinancialCase)
        .set({
          evidence: {
            version: 'supplier-sweep-checkpoint-v1',
            // A finished pass restarts from the beginning: operation and evidence ids are
            // random UUIDs, so a retained cursor would permanently hide later rows sorting
            // below it. Each pass is therefore a bounded *full* sweep.
            operationCursor: done ? undefined : operations.cursor,
            evidenceCursor: done ? undefined : evidence.cursor,
            pass: done ? checkpoint.pass + 1 : checkpoint.pass,
            operationsScanned: operations.rows.length,
            evidenceScanned: evidence.rows.length,
          },
          lastSeenAt: sql`clock_timestamp()`,
        })
        .where(
          and(
            eq(billingFinancialCase.environment, this.config.environment),
            eq(billingFinancialCase.stripeAccountId, this.config.stripeAccountId),
            eq(billingFinancialCase.livemode, this.config.livemode),
            eq(billingFinancialCase.kind, checkpointKind),
            eq(billingFinancialCase.dedupeKey, checkpointDedupeKey),
          ),
        );
      return {
        operationsScanned: operations.rows.length,
        evidenceScanned: evidence.rows.length,
        casesOpened: operations.casesOpened + evidence.casesOpened,
        pass: done ? checkpoint.pass + 1 : checkpoint.pass,
        done,
      };
    });
  }

  /**
   * Compares the confirmed provider invoice total with the summed local estimate.
   *
   * Aggregate in, aggregate out: a mismatch opens exactly one account-less case
   * and never distributes the difference across the period's operations.
   */
  public async reconcileInvoiceTotal(input: unknown): Promise<SupplierInvoiceReconciliation> {
    const invoice = operatorSupplierInvoiceSchema.parse(input);
    const periodStart = new Date(invoice.periodStart);
    const periodEnd = new Date(invoice.periodEnd);
    if (invoice.environment !== this.config.environment || periodStart >= periodEnd) {
      throw new ConflictException('invalid_supplier_invoice');
    }
    const window = and(
      eq(supplierCostEvidence.environment, invoice.environment),
      eq(supplierCostEvidence.provider, invoice.provider),
      eq(supplierCostEvidence.credentialAccount, invoice.credentialAccount),
      eq(supplierCostEvidence.completeness, 'complete'),
      eq(supplierCostEvidence.finality, 'final'),
      gte(supplierCostEvidence.receivedAt, periodStart),
      lt(supplierCostEvidence.receivedAt, periodEnd),
    );
    // One bounded aggregate per operator-invoked period, not a per-replica all-history
    // sum. Each row is ceiled to pico-USD exactly as `finalizeSupplier` consumes it, so
    // the estimate carries at most one pico-USD of rounding per row — that belongs inside
    // the operator's tolerance, not in a reallocation.
    const [totals] = await this.databaseService.database
      .select({
        estimate: sql<string>`coalesce(sum(ceil((${supplierCostEvidence.numerator} * ${picoUsdPerUsd})::numeric
          / ${supplierCostEvidence.denominator})) filter (where ${supplierCostEvidence.currency} = ${invoice.currency}), 0)::text`,
        rows: count(sql`case when ${supplierCostEvidence.currency} = ${invoice.currency} then 1 end`),
        foreign: count(sql`case when ${supplierCostEvidence.currency} <> ${invoice.currency} then 1 end`),
      })
      .from(supplierCostEvidence)
      .where(window);
    const localEstimate = BigInt(totals?.estimate ?? '0');
    const confirmed = BigInt(invoice.confirmedTotalPicoUsd);
    const difference = localEstimate > confirmed ? localEstimate - confirmed : confirmed - localEstimate;
    const foreignCurrencyRows = totals?.foreign ?? 0;
    const dedupeKey = `${invoice.provider}:${invoice.credentialAccount}:${invoice.periodStart}/${invoice.periodEnd}`;
    const result: SupplierInvoiceReconciliation = {
      status: difference > BigInt(invoice.tolerancePicoUsd) || foreignCurrencyRows > 0 ? 'mismatched' : 'matched',
      localEstimatePicoUsd: localEstimate.toString(),
      confirmedTotalPicoUsd: confirmed.toString(),
      differencePicoUsd: difference.toString(),
      evidenceRows: totals?.rows ?? 0,
      foreignCurrencyRows,
    };
    const evidence = {
      version: 'supplier-invoice-reconciliation-v1',
      provider: invoice.provider,
      credentialAccount: invoice.credentialAccount,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      currency: invoice.currency,
      tolerancePicoUsd: invoice.tolerancePicoUsd,
      invoiceSource: invoice.source,
      importedAt: invoice.importedAt,
      /** Aggregate only: the difference is never attributed to an account or operation. */
      allocation: 'aggregate_only',
      ...result,
    };
    await this.databaseService.database.transaction(async (tx) => {
      if (result.status === 'mismatched') {
        await openCase(tx, this.config, {
          kind: 'supplier_invoice_total_mismatch',
          dedupeKey,
          accountId: undefined,
          sourceType: 'supplier_invoice',
          sourceId: dedupeKey,
          nextStep: 'compare_confirmed_invoice_with_local_estimate',
          firstEffectiveAt: periodStart,
          evidence,
        });
      } else {
        await resolveCases(tx, this.config, {
          kind: 'supplier_invoice_total_mismatch',
          dedupeKeys: [dedupeKey],
          disposition: evidence,
        });
      }
    });
    return result;
  }

  /** Creates the checkpoint on first use and locks it for this page. */
  private async claimCheckpoint(tx: Transaction): Promise<{
    readonly operationCursor: string | undefined;
    readonly evidenceCursor: string | undefined;
    readonly pass: number;
  }> {
    const identity = and(
      eq(billingFinancialCase.environment, this.config.environment),
      eq(billingFinancialCase.stripeAccountId, this.config.stripeAccountId),
      eq(billingFinancialCase.livemode, this.config.livemode),
      eq(billingFinancialCase.kind, checkpointKind),
      eq(billingFinancialCase.dedupeKey, checkpointDedupeKey),
    );
    // The sweep checkpoint reuses the existing case row rather than a new table,
    // because no schema edit is in this lane's scope. It is born `resolved` with an
    // empty next step, so it never reaches an operator queue.
    // ponytail: one shared row serializes concurrent sweeps of an environment;
    // upgrade path is the `billing_supplier_scan` table in this lane's Lead seam.
    await tx
      .insert(billingFinancialCase)
      .values({
        id: randomUUID(),
        environment: this.config.environment,
        stripeAccountId: this.config.stripeAccountId,
        livemode: this.config.livemode,
        kind: checkpointKind,
        dedupeKey: checkpointDedupeKey,
        sourceType: 'supplier_sweep',
        sourceId: checkpointDedupeKey,
        evidence: { version: 'supplier-sweep-checkpoint-v1', operationCursor: null, evidenceCursor: null, pass: 0 },
        owner: 'billing-operations',
        nextStep: 'none',
        state: 'resolved',
        firstEffectiveAt: new Date(0),
        resolvedAt: sql`clock_timestamp()`,
        resolutionEvidence: { version: 'supplier-sweep-checkpoint-v1', role: 'sweep_checkpoint' },
      })
      .onConflictDoNothing();
    const [row] = await tx
      .select({ evidence: billingFinancialCase.evidence })
      .from(billingFinancialCase)
      .where(identity)
      .for('update');
    return checkpointSchema.parse(row?.evidence ?? {});
  }

  private async sweepOperations(
    tx: Transaction,
    cursor: string | undefined,
    /** `unresolvedMaximumAge` is in milliseconds. */
    input: { readonly pageSize: number; readonly unresolvedMaximumAge: number },
  ): Promise<{
    readonly rows: readonly Operation[];
    readonly cursor: string | undefined;
    readonly done: boolean;
    readonly casesOpened: number;
  }> {
    const page = await tx
      .select()
      .from(creditOperation)
      .where(
        and(
          eq(creditOperation.environment, this.config.environment),
          ...(cursor === undefined ? [] : [gt(creditOperation.id, cursor)]),
        ),
      )
      .orderBy(asc(creditOperation.id))
      .limit(input.pageSize + 1);
    const rows = page.slice(0, input.pageSize);
    const identifiers = rows.map((operation) => operation.id);
    const attached =
      identifiers.length === 0
        ? []
        : await tx.select().from(supplierCostEvidence).where(inArray(supplierCostEvidence.operationId, identifiers));
    const byOperation = new Map<string, Evidence[]>();
    for (const row of attached) {
      if (row.operationId === null) {
        continue;
      }
      byOperation.set(row.operationId, [...(byOperation.get(row.operationId) ?? []), row]);
    }
    let casesOpened = 0;
    const now = Date.now();
    const qualified = new Map<string, string[]>([
      ['supplier_evidence_missing', []],
      ['supplier_evidence_mismatched', []],
      ['supplier_state_unresolved', []],
    ]);
    for (const operation of rows) {
      casesOpened += await this.qualifyOperation(tx, operation, {
        attached: byOperation.get(operation.id) ?? [],
        now,
        qualified,
        unresolvedMaximumAge: input.unresolvedMaximumAge,
      });
    }
    // One bulk resolution per kind per page keeps a clean page at three statements
    // instead of three per row.
    for (const [kind, identities] of qualified) {
      await resolveCases(tx, this.config, { kind, dedupeKeys: identities });
    }
    return { rows, cursor: rows.at(-1)?.id ?? cursor, done: page.length <= input.pageSize, casesOpened };
  }

  private async qualifyOperation(
    tx: Transaction,
    operation: Operation,
    page: {
      readonly attached: readonly Evidence[];
      readonly now: number;
      readonly qualified: Map<string, string[]>;
      /** Milliseconds. */
      readonly unresolvedMaximumAge: number;
    },
  ): Promise<number> {
    const { attached } = page;
    let opened = 0;
    if (operation.supplierState === 'final' && operation.customerState !== 'pending') {
      const qualified = attached.filter((row) => row.completeness === 'complete' && row.finality === 'final');
      const mismatches = attached.flatMap((row) =>
        identityMismatch(operation, row).map((reason) => ({ evidenceId: row.id, reason })),
      );
      if (qualified.length === 0) {
        opened += await openCase(tx, this.config, {
          kind: 'supplier_evidence_missing',
          dedupeKey: operation.id,
          accountId: operation.accountId,
          sourceType: 'credit_operation',
          sourceId: operation.id,
          nextStep: 'recover_provider_usage_record_or_fund_as_supplier_risk',
          firstEffectiveAt: operation.resolvedAt ?? operation.dueAt,
          evidence: {
            version: 'supplier-usage-reconciliation-v1',
            supplierState: operation.supplierState,
            providerId: operation.providerId,
            modelId: operation.modelId,
            sku: operation.sku,
            attachedEvidence: attached.length,
            costPicoUsd: null,
          },
        });
      } else {
        page.qualified.get('supplier_evidence_missing')?.push(operation.id);
      }
      if (mismatches.length > 0) {
        opened += await openCase(tx, this.config, {
          kind: 'supplier_evidence_mismatched',
          dedupeKey: operation.id,
          accountId: operation.accountId,
          sourceType: 'credit_operation',
          sourceId: operation.id,
          nextStep: 'qualify_provider_identity_before_trusting_the_cost',
          firstEffectiveAt: operation.resolvedAt ?? operation.dueAt,
          evidence: {
            version: 'supplier-usage-reconciliation-v1',
            providerId: operation.providerId,
            modelId: operation.modelId,
            credentialAccount: operation.invocation?.credentialAccount ?? null,
            mismatches,
            costPicoUsd: picoUsdOf(attached),
          },
        });
      } else if (attached.length > 0) {
        page.qualified.get('supplier_evidence_mismatched')?.push(operation.id);
      }
    }
    if (operation.supplierState === 'unresolved') {
      const oldest = operation.resolvedAt ?? operation.admittedAt ?? operation.dueAt;
      if (page.now - oldest.getTime() >= page.unresolvedMaximumAge) {
        opened += await openCase(tx, this.config, {
          kind: 'supplier_state_unresolved',
          dedupeKey: operation.id,
          accountId: operation.accountId,
          sourceType: 'credit_operation',
          sourceId: operation.id,
          nextStep: 'close_unresolved_supplier_liability_under_the_route_pause',
          firstEffectiveAt: oldest,
          evidence: {
            version: 'supplier-usage-reconciliation-v1',
            supplierState: operation.supplierState,
            customerState: operation.customerState,
            providerId: operation.providerId,
            sku: operation.sku,
            oldestEvidenceAt: oldest.toISOString(),
            costPicoUsd: picoUsdOf(attached),
          },
        });
      }
    } else {
      page.qualified.get('supplier_state_unresolved')?.push(operation.id);
    }
    return opened;
  }

  private async sweepUnmatchedEvidence(
    tx: Transaction,
    cursor: string | undefined,
    pageSize: number,
  ): Promise<{
    readonly rows: readonly Evidence[];
    readonly cursor: string | undefined;
    readonly done: boolean;
    readonly casesOpened: number;
  }> {
    const page = await tx
      .select()
      .from(supplierCostEvidence)
      .where(
        and(
          eq(supplierCostEvidence.environment, this.config.environment),
          isNull(supplierCostEvidence.operationId),
          ...(cursor === undefined ? [] : [gt(supplierCostEvidence.id, cursor)]),
        ),
      )
      .orderBy(asc(supplierCostEvidence.id))
      .limit(pageSize + 1);
    const rows = page.slice(0, pageSize);
    let casesOpened = 0;
    for (const row of rows) {
      casesOpened += await openCase(tx, this.config, {
        kind: 'supplier_charge_unmatched',
        dedupeKey: row.id,
        accountId: undefined,
        sourceType: 'supplier_cost_evidence',
        sourceId: row.sourceObjectId,
        nextStep: 'match_the_provider_charge_to_an_admitted_operation_or_keep_it_aggregate',
        firstEffectiveAt: row.receivedAt,
        evidence: {
          version: 'supplier-usage-reconciliation-v1',
          provider: row.provider,
          credentialAccount: row.credentialAccount,
          sourceObjectId: row.sourceObjectId,
          sourceRevision: row.sourceRevision,
          currency: row.currency,
          costPicoUsd: picoUsdOf([row]),
          oldestEvidenceAt: row.receivedAt.toISOString(),
          /** Never allocated to a user: an unmatched provider charge stays aggregate (B7 R7). */
          allocation: 'aggregate_only',
        },
      });
    }
    return { rows, cursor: rows.at(-1)?.id ?? cursor, done: page.length <= pageSize, casesOpened };
  }
}

/**
 * Reports every way retained evidence fails to name the operation's admitted route.
 *
 * The null-provider sentinels are the ones the ledger's own recovery path writes
 * for an operation that never reached a qualified provider identity
 * (`credit-ledger.service.ts:1303–1305,1349–1351`).
 */
function identityMismatch(operation: Operation, evidence: Evidence): readonly string[] {
  const reasons: string[] = [];
  const sentinels = new Set(['undispatched', 'unknown']);
  if (evidence.environment !== operation.environment) {
    reasons.push('environment');
  }
  if (operation.providerId === null ? !sentinels.has(evidence.provider) : evidence.provider !== operation.providerId) {
    reasons.push('provider');
  }
  const credentialAccount = operation.invocation?.credentialAccount;
  if (
    credentialAccount === undefined
      ? !sentinels.has(evidence.credentialAccount)
      : evidence.credentialAccount !== credentialAccount
  ) {
    reasons.push('credential_account');
  }
  // Every writer keys per-operation supplier evidence by the operation id
  // (`billable-model-invocation.service.ts:542`, `credit-ledger.service.ts:1305,1351`),
  // so this is the request identity the admitted route can be checked against.
  if (evidence.sourceObjectId !== operation.id) {
    reasons.push('request_identity');
  }
  return reasons;
}

/** Ceils each observation to pico-USD exactly as supplier finalization consumes it. */
function picoUsdOf(evidence: readonly Evidence[]): string {
  return evidence
    .reduce((total, row) => total + (row.numerator * picoUsdPerUsd + row.denominator - 1n) / row.denominator, 0n)
    .toString();
}

async function openCase(
  tx: Transaction,
  config: { readonly environment: FinancialEnvironment; readonly stripeAccountId: string; readonly livemode: boolean },
  input: {
    readonly kind: string;
    readonly dedupeKey: string;
    readonly accountId: string | undefined;
    readonly sourceType: string;
    readonly sourceId: string;
    readonly nextStep: string;
    readonly firstEffectiveAt: Date;
    readonly evidence: Record<string, unknown>;
  },
): Promise<number> {
  await tx
    .insert(billingFinancialCase)
    .values({
      id: randomUUID(),
      environment: config.environment,
      stripeAccountId: config.stripeAccountId,
      livemode: config.livemode,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      accountId: input.accountId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      evidence: input.evidence,
      owner: 'billing-operations',
      nextStep: input.nextStep,
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
      // `first_effective_at` is deliberately absent: the protected trigger refuses to
      // postpone the oldest evidence a case already carries.
      set: {
        state: 'open',
        lastSeenAt: sql`clock_timestamp()`,
        resolvedAt: null,
        resolutionEvidence: null,
        evidence: input.evidence,
        nextStep: input.nextStep,
      },
    });
  return 1;
}

/** Closes every named case of one kind that the sweep has just qualified. */
async function resolveCases(
  tx: Transaction,
  config: { readonly environment: FinancialEnvironment; readonly stripeAccountId: string; readonly livemode: boolean },
  input: {
    readonly kind: string;
    readonly dedupeKeys: readonly string[];
    readonly disposition?: Record<string, unknown>;
  },
): Promise<void> {
  const { kind, dedupeKeys, disposition = {} } = input;
  if (dedupeKeys.length === 0) {
    return;
  }
  await tx
    .update(billingFinancialCase)
    .set({
      state: 'resolved',
      resolvedAt: sql`clock_timestamp()`,
      resolutionEvidence: { ...disposition, disposition: 'supplier_source_qualified' },
    })
    .where(
      and(
        eq(billingFinancialCase.environment, config.environment),
        eq(billingFinancialCase.stripeAccountId, config.stripeAccountId),
        eq(billingFinancialCase.livemode, config.livemode),
        eq(billingFinancialCase.kind, kind),
        inArray(billingFinancialCase.dedupeKey, dedupeKeys),
        ne(billingFinancialCase.state, 'resolved'),
      ),
    );
}
