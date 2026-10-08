import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { and, count, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { financialEnvironmentSchema } from '@taucad/billing';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import type { DatabaseService } from '#database/database.service.js';
import { billingFinancialCase, creditOperation } from '#database/schema.js';

type Transaction = Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0];

const caseKind = 'supplier_invoice_total_mismatch';
const unsignedIntegerString = z.string().regex(/^(0|[1-9][0-9]{0,38})$/u);

/**
 * The confirmed provider invoice total for one provider credential and period.
 *
 * A local metered cost and a confirmed invoice cost stay separate, and
 * aggregate-only provider evidence stays aggregate. The total is therefore an
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

export type SupplierInvoiceReconciliation = {
  readonly status: 'matched' | 'mismatched';
  /** Sum of the supplier cost written on each settled operation's receipt for this provider credential. */
  readonly localEstimatePicoUsd: string;
  readonly confirmedTotalPicoUsd: string;
  readonly differencePicoUsd: string;
  /** Terminal operations of this provider credential whose usage falls in the period. */
  readonly operations: number;
  /** Of those, operations whose receipt carries no supplier cost (a cut stream or an unpriced dimension). */
  readonly unpricedOperations: number;
  /** Terminal operations in the period that name no provider or no invocation, so no credential can claim them. */
  readonly unattributedOperations: number;
};

/**
 * The operator's monthly check of a confirmed provider invoice against Tau's own supplier meter.
 *
 * Read-only over the journal: the only write is the one aggregate case. Nothing
 * here debits a customer, allocates provider cost to a user, edits a historical
 * amount, or blocks any admission.
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
   * Compares the confirmed provider invoice total with the metered supplier cost of the period.
   *
   * Aggregate in, aggregate out: a mismatch opens exactly one account-less case
   * and never distributes the difference across the period's operations. A
   * later import that matches resolves it.
   */
  public async reconcileInvoiceTotal(input: unknown): Promise<SupplierInvoiceReconciliation> {
    const invoice = operatorSupplierInvoiceSchema.parse(input);
    const periodStart = new Date(invoice.periodStart);
    const periodEnd = new Date(invoice.periodEnd);
    if (invoice.environment !== this.config.environment || periodStart >= periodEnd) {
      throw new ConflictException('invalid_supplier_invoice');
    }
    const attributed = sql`${creditOperation.providerId} = ${invoice.provider}
      AND ${creditOperation.invocation}->>'credentialAccount' = ${invoice.credentialAccount}`;
    // One bounded aggregate per operator-invoked period. The cost on each receipt is already
    // ceiled to pico-USD, so the meter carries at most one pico-USD of rounding per operation,
    // which belongs inside the operator's tolerance rather than in a reallocation.
    const [totals] = await this.databaseService.database
      .select({
        metered: sql<string>`coalesce(sum(${creditOperation.supplierCostPicoUsd}) filter (where ${attributed}), 0)::text`,
        operations: count(sql`case when ${attributed} then 1 end`),
        unpriced: count(sql`case when ${attributed} and ${creditOperation.supplierCostPicoUsd} is null then 1 end`),
        unattributed: count(
          sql`case when ${creditOperation.providerId} is null or ${creditOperation.invocation} is null then 1 end`,
        ),
      })
      .from(creditOperation)
      .where(
        and(
          eq(creditOperation.environment, invoice.environment),
          ne(creditOperation.customerState, 'pending'),
          gte(creditOperation.usageOccurredAt, periodStart),
          lt(creditOperation.usageOccurredAt, periodEnd),
        ),
      );
    const metered = BigInt(totals?.metered ?? '0');
    const confirmed = BigInt(invoice.confirmedTotalPicoUsd);
    const difference = metered > confirmed ? metered - confirmed : confirmed - metered;
    const dedupeKey = `${invoice.provider}:${invoice.credentialAccount}:${invoice.periodStart}/${invoice.periodEnd}`;
    const result: SupplierInvoiceReconciliation = {
      status: difference > BigInt(invoice.tolerancePicoUsd) ? 'mismatched' : 'matched',
      localEstimatePicoUsd: metered.toString(),
      confirmedTotalPicoUsd: confirmed.toString(),
      differencePicoUsd: difference.toString(),
      operations: totals?.operations ?? 0,
      unpricedOperations: totals?.unpriced ?? 0,
      unattributedOperations: totals?.unattributed ?? 0,
    };
    const evidence = {
      version: 'supplier-invoice-reconciliation-v2',
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
        await openCase(tx, this.config, { dedupeKey, firstEffectiveAt: periodStart, evidence });
        return;
      }
      await resolveCase(tx, this.config, { dedupeKey, disposition: evidence });
    });
    return result;
  }
}

async function openCase(
  tx: Transaction,
  config: { readonly environment: FinancialEnvironment; readonly stripeAccountId: string; readonly livemode: boolean },
  input: { readonly dedupeKey: string; readonly firstEffectiveAt: Date; readonly evidence: Record<string, unknown> },
): Promise<void> {
  const nextStep = 'compare_confirmed_invoice_with_local_estimate';
  await tx
    .insert(billingFinancialCase)
    .values({
      id: randomUUID(),
      environment: config.environment,
      stripeAccountId: config.stripeAccountId,
      livemode: config.livemode,
      kind: caseKind,
      dedupeKey: input.dedupeKey,
      sourceType: 'supplier_invoice',
      sourceId: input.dedupeKey,
      evidence: input.evidence,
      owner: 'billing-operations',
      nextStep,
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
        nextStep,
      },
    });
}

/** Closes the period's case once a later import matches the meter. */
async function resolveCase(
  tx: Transaction,
  config: { readonly environment: FinancialEnvironment; readonly stripeAccountId: string; readonly livemode: boolean },
  input: { readonly dedupeKey: string; readonly disposition: Record<string, unknown> },
): Promise<void> {
  await tx
    .update(billingFinancialCase)
    .set({
      state: 'resolved',
      resolvedAt: sql`clock_timestamp()`,
      resolutionEvidence: { ...input.disposition, disposition: 'supplier_source_qualified' },
    })
    .where(
      and(
        eq(billingFinancialCase.environment, config.environment),
        eq(billingFinancialCase.stripeAccountId, config.stripeAccountId),
        eq(billingFinancialCase.livemode, config.livemode),
        eq(billingFinancialCase.kind, caseKind),
        eq(billingFinancialCase.dedupeKey, input.dedupeKey),
        ne(billingFinancialCase.state, 'resolved'),
      ),
    );
}
