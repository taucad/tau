import type postgres from 'postgres';
import { cashBlockingFinancialCaseKinds } from '#billing-cash-reconciliation.service.js';
import type { BillingCashReconciliationService } from '#billing-cash-reconciliation.service.js';
import type { BillingPurchaseReconciliationService } from '#billing-purchase-reconciliation.service.js';
import type { BillingPaymentsService } from '#billing-payments.service.js';
import type { FinancialEnvironment } from '#billing-policy.js';
import type { MetricsService } from '@taucad/api-observability/metrics';

/** Unpriced terminal operations of one provider, SKU and reason. */
type UnpricedOperations = {
  // oxlint-disable-next-line typescript/no-restricted-types -- SQL NULL: an operation admitted with no provider
  readonly provider: string | null;
  readonly sku: string;
  readonly reason: string;
  readonly operations: number;
};

/** Open or attention financial cases of one kind and attribution. */
type OpenCases = {
  readonly kind: string;
  /** Whether the cases name an account; an unattributed case is operator work that pages at once. */
  readonly attributed: boolean;
  readonly open: number;
  /** Seconds since the oldest of these cases was first seen. */
  readonly oldestAgeSeconds: number;
};

/** The hourly gauges' two reads, separated from the recording so the pass can be tested without a database. */
export type OperationsGaugeSource = {
  /** Open or attention financial cases of this environment, per kind and attribution. */
  readonly openCases: () => Promise<readonly OpenCases[]>;
  /** Terminal operations of this environment whose receipt carries no supplier cost, per provider, SKU and reason. */
  readonly unpricedOperations: () => Promise<readonly UnpricedOperations[]>;
};

export type OperationsGaugeMetrics = Pick<
  MetricsService,
  'billingOpenFinancialCases' | 'billingOpenFinancialCaseAge' | 'billingSupplierUnpricedOperations'
>;

/**
 * Every case kind the hourly pass reports, so each gets a zero for both attribution values and a rule
 * on it reads Normal rather than NoData: the cash, purchase and journal kinds, tax registration review
 * (`billing-tax.service.ts`) and the supplier invoice check (`billing-supplier-reconciliation.service.ts`).
 */
const reportedFinancialCaseKinds: readonly string[] = [
  ...cashBlockingFinancialCaseKinds,
  'tax_registration_review',
  'supplier_invoice_total_mismatch',
];

const attributionValues = [true, false] as const;

/**
 * Reads the gauges from the durable tables, so operations settled by recovery count the same as live ones.
 *
 * Operations terminalized before the receipt carried a supplier cost have neither a cost nor a
 * reason; they predate the meter and are not reported as unpriced.
 */
export const createOperationsGaugeSource = (
  sql: postgres.Sql,
  environment: FinancialEnvironment,
): OperationsGaugeSource => ({
  // `first_seen_at`, not `first_effective_at`: the effective time is the scan window start, a day old on a first pass.
  openCases: async () => sql<OpenCases[]>`
    SELECT kind, account_id IS NOT NULL AS attributed, count(*)::int AS open,
      extract(epoch FROM clock_timestamp() - min(first_seen_at))::int AS "oldestAgeSeconds"
    FROM billing.billing_financial_case
    WHERE environment = ${environment} AND state IN ('open', 'attention')
    GROUP BY kind, attributed`,
  unpricedOperations: async () => sql<UnpricedOperations[]>`
    SELECT provider_id AS provider, sku, supplier_cost_unpriced_reason AS reason, count(*)::int AS operations
    FROM billing.credit_operation
    WHERE environment = ${environment} AND customer_state <> 'pending'
      AND supplier_cost_pico_usd IS NULL AND supplier_cost_unpriced_reason IS NOT NULL
    GROUP BY provider_id, sku, supplier_cost_unpriced_reason`,
});

/**
 * Records the open-case count and oldest-case age gauges per kind and attribution, and the
 * unpriced-operation gauge per provider, SKU and reason.
 *
 * A case that names no account is operator work nobody else will see, so its attribution is a label
 * the paging rule selects on, and each pass also writes it to stderr as a `billing.alert`. The age
 * gauge lets a rule ask "open for a day" without a `for:` that a restart resets. A paid obligation
 * with no grant (for example a lost success webhook) holds the customer's money without credit. The
 * unpriced gauge is the durable cross-check of the supplier meter: a cut stream or an unpriced
 * dimension leaves a receipt with no supplier cost, and the monthly invoice check cannot see what it
 * does not count.
 */
export const recordOpenCases = async (input: {
  readonly source: OperationsGaugeSource;
  readonly metrics: OperationsGaugeMetrics;
  readonly environment: FinancialEnvironment;
}): Promise<void> => {
  const openCases = await input.source.openCases();
  let unattributed = 0;
  let unfulfilled = 0;
  for (const row of openCases) {
    unattributed += row.attributed ? 0 : row.open;
    unfulfilled += row.kind === 'unfulfilled_purchase_obligation' ? row.open : 0;
  }
  for (const kind of new Set([...reportedFinancialCaseKinds, ...openCases.map((row) => row.kind)])) {
    for (const attributed of attributionValues) {
      const row = openCases.find((candidate) => candidate.kind === kind && candidate.attributed === attributed);
      const attributes = { kind, attributed: String(attributed) };
      input.metrics.billingOpenFinancialCases.record(row?.open ?? 0, attributes);
      input.metrics.billingOpenFinancialCaseAge.record(row?.oldestAgeSeconds ?? 0, attributes);
    }
  }
  if (unattributed > 0) {
    console.error(
      JSON.stringify({
        event: 'billing.alert',
        environment: input.environment,
        kind: 'unattributed_financial_case',
        open: unattributed,
      }),
    );
  }
  if (unfulfilled > 0) {
    console.error(
      JSON.stringify({
        event: 'billing.alert',
        environment: input.environment,
        kind: 'unfulfilled_purchase_obligation',
        open: unfulfilled,
      }),
    );
  }
  for (const row of await input.source.unpricedOperations()) {
    input.metrics.billingSupplierUnpricedOperations.record(row.operations, {
      'deployment.environment': input.environment,
      'gen_ai.provider.name': row.provider ?? 'unattributed',
      'tau.billing.sku': row.sku,
      'tau.billing.unpriced.reason': row.reason,
    });
  }
};

/**
 * The worker turns recovery notices into email only when it knows where the app lives and how to send.
 * Without either, no transport is built and the notices stay pending, untouched: `EmailService` without
 * `RESEND_API_KEY` renders and returns, which would mark a notice delivered that nobody received.
 */
export const recoveryNoticeEmailOrigin = (env: Readonly<Record<string, string | undefined>>): string | undefined => {
  const frontendURL = env['TAU_FRONTEND_URL']?.trim() ?? '';
  const resendApiKey = env['RESEND_API_KEY']?.trim() ?? '';
  return frontendURL !== '' && resendApiKey !== '' ? frontendURL : undefined;
};

/**
 * Drains the recovery-notice outbox once. A notice that used its last attempt is a `billing.alert`:
 * its customer was never told, and only an operator can re-queue it.
 */
export const deliverRecoveryNotices = async (input: {
  readonly payments: Pick<BillingPaymentsService, 'deliverRecoveryNotices'>;
  readonly environment: FinancialEnvironment;
  readonly limit: number;
}): Promise<Awaited<ReturnType<BillingPaymentsService['deliverRecoveryNotices']>>> => {
  const report = await input.payments.deliverRecoveryNotices({ environment: input.environment, limit: input.limit });
  if (report.abandoned.length > 0) {
    console.error(
      JSON.stringify({
        event: 'billing.alert',
        environment: input.environment,
        kind: 'recovery_notice_abandoned',
        notices: report.abandoned,
      }),
    );
  }
  return report;
};

/** Everything the hourly reconciliation needs from the operations worker. */
export type HourlyOperationsJobs = {
  /** The worker's job runner: logs one JSON line per job and owns its failure. */
  readonly runJob: (event: string, run: () => Promise<unknown>) => Promise<void>;
  readonly cashScans: Pick<BillingCashReconciliationService, 'createScan' | 'isComplete' | 'runScan'>;
  readonly purchaseScans: Pick<BillingPurchaseReconciliationService, 'runScan'>;
  readonly recordOpenCases: () => Promise<void>;
  readonly environment: FinancialEnvironment;
  /** Milliseconds since the epoch. */
  readonly now: number;
};

const dayMilliseconds = 24 * 60 * 60_000;

/**
 * The operations worker's hourly jobs: independent source reconciliation over the previous
 * complete UTC day, then the case and supplier-meter gauges.
 */
export const runHourlyOperationsJobs = async (jobs: HourlyOperationsJobs): Promise<void> => {
  await jobs.runJob('billing.source_reconciliation', async () => {
    const windowEnd = new Date(Math.floor(jobs.now / dayMilliseconds) * dayMilliseconds);
    const windowStart = new Date(windowEnd.getTime() - dayMilliseconds);
    // The scan row is idempotent per window, so an hourly retry resumes the same durable cursors.
    const scanId = await jobs.cashScans.createScan({
      environment: jobs.environment,
      currency: 'usd',
      windowStart,
      windowEnd,
      lookbackStart: new Date(windowStart.getTime() - dayMilliseconds),
    });
    // The purchase comparison is stateless per pass, so it runs even when the cash scan is done or busy.
    let cash: string;
    try {
      if (await jobs.cashScans.isComplete(scanId)) {
        cash = 'complete';
      } else {
        const scanned = await jobs.cashScans.runScan({ scanId, maximumPagesPerStream: 20 });
        cash = scanned.status;
      }
    } catch (error) {
      cash = error instanceof Error ? `failed:${error.message}` : 'failed';
    }
    let purchase: Awaited<ReturnType<HourlyOperationsJobs['purchaseScans']['runScan']>>;
    try {
      purchase = await jobs.purchaseScans.runScan({
        scanId,
        maximumObligations: 100,
        maximumGrants: 100,
        maximumSubscriptions: 100,
      });
    } catch (error) {
      // The gauges report the case table, so they are recorded even when a Stripe scan fails: that is
      // when the alert matters most. Their own failure must not replace the scan's error, which is the
      // diagnosis the operator needs.
      await jobs.recordOpenCases().catch((gaugeError: unknown) => {
        console.error(
          JSON.stringify({
            event: 'billing.case_gauge_failed',
            environment: jobs.environment,
            error: String(gaugeError),
          }),
        );
      });
      throw error;
    }
    await jobs.recordOpenCases();
    if (cash !== 'complete' && cash !== 'incomplete') {
      throw new Error(`cash scan ${cash}; purchases ${purchase.status}`);
    }
    return { scanId, cash, purchases: purchase.status };
  });
};
