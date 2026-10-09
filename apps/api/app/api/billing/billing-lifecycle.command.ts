import { z } from 'zod';
import type { Stripe } from 'stripe';
import { financialEnvironmentSchema, financialIdentitySchema } from '@taucad/billing';
import type { DatabaseService } from '#database/database.service.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { BillingCashService, maximumRefundReasonLength } from '#api/billing/billing-cash.service.js';
import { BillingCashReconciliationService } from '#api/billing/billing-cash-reconciliation.service.js';
import {
  BillingSupplierReconciliationService,
  operatorSupplierInvoiceSchema,
} from '#api/billing/billing-supplier-reconciliation.service.js';
import { BillingPurchaseReconciliationService } from '#api/billing/billing-purchase-reconciliation.service.js';
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { recoverAndCancelStripeClosure } from '#api/billing/billing-account-closure-stripe.js';
import { BillingTaxService } from '#api/billing/billing-tax.service.js';
import type { BillingCollection } from '#api/billing/billing-collection.js';

const id = financialIdentitySchema;
const money = z.string().regex(/^(0|[1-9][0-9]*)$/u);
const date = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const limit = z.number().int().min(1).max(100);
const environment = financialEnvironmentSchema;
const requestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('reload-work'), environment, limit }).strict(),
  z.object({ operation: z.literal('expire-reload'), environment, limit }).strict(),
  z.object({ operation: z.literal('recover-renewals'), environment, limit }).strict(),
  z
    .object({
      operation: z.literal('prepare-renewal'),
      environment,
      accountId: id,
      subscriptionId: id,
      policyId: id,
      effectivePeriodStart: date,
      disclosedAt: date,
      disclosureEvidence: z.record(z.string(), z.unknown()),
      requestId: id,
    })
    .strict(),
  z
    .object({
      operation: z.literal('prepare-refund'),
      environment,
      accountId: id,
      reversalCaseId: id,
      requestedPrincipalMinor: money,
      requestedTaxMinor: money,
      approvedMaximumGrossMinor: money,
      reviewActorId: id,
      reviewedAt: date,
      reason: z.string().min(1).max(maximumRefundReasonLength),
      requestId: id,
    })
    .strict(),
  z.object({ operation: z.literal('execute-refund'), environment, intentId: id, reviewActorId: id }).strict(),
  z.object({ operation: z.literal('recover-refund'), environment, intentId: id, maximumPages: limit }).strict(),
  z.object({ operation: z.literal('requalify-charge'), environment, chargeId: id, maximumRefundPages: limit }).strict(),
  z
    .object({
      operation: z.literal('resolve-case'),
      environment,
      caseId: id,
      disposition: z.enum(['resolved', 'rescoped']),
      reviewActorId: id,
      reason: z.string().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      operation: z.literal('create-cash-scan'),
      environment,
      currency: z.literal('usd'),
      windowStart: date,
      windowEnd: date,
      lookbackStart: date,
    })
    .strict(),
  z.object({ operation: z.literal('run-cash-scan'), environment, scanId: id, maximumPagesPerStream: limit }).strict(),
  z.object({ operation: z.literal('recover-closure'), environment, accountId: id, closureId: id }).strict(),
  z.object({ operation: z.literal('monitor-tax'), environment, asOf: date }).strict(),
  z
    .object({ operation: z.literal('reconcile-supplier-invoice'), environment, invoice: operatorSupplierInvoiceSchema })
    .strict(),
  z
    .object({
      operation: z.literal('run-purchase-scan'),
      environment,
      scanId: id,
      maximumObligations: limit,
      maximumGrants: limit,
      maximumSubscriptions: limit,
    })
    .strict(),
]);

/**
 * Refuses a refund key that cannot be this mode's Refunds-Write restricted key. The API's environment
 * schema makes the same checks when it boots with the key set; `billing-command lifecycle` reads the key
 * from the operator's shell, so it checks here before a Stripe client is built from it.
 */
export function assertRefundKey(input: {
  readonly refundKey: string;
  readonly livemode: boolean;
  readonly createKey: string | undefined;
  readonly readKey: string | undefined;
}): void {
  const prefix = input.livemode ? 'rk_live_' : 'rk_test_';
  if (!input.refundKey.startsWith(prefix)) {
    throw new Error(`STRIPE_REFUND_SECRET_KEY must be a ${prefix} restricted key for this Stripe mode`);
  }
  if (input.refundKey === input.createKey || input.refundKey === input.readKey) {
    throw new Error('STRIPE_REFUND_SECRET_KEY must differ from the create and read keys');
  }
}

/**
 * Strict protected-job composition. Provider mutations need the write key together with either the
 * isolated local fixture or a collection the deployment is allowed to perform. A refund is sent only with
 * the operator-held refund key (`refundStripe`): Stripe refuses refunds from the deployment's create key.
 */
export async function runBillingLifecycleCommand(input: {
  database: Pick<DatabaseService, 'database'>;
  sourceStripe: Stripe;
  protectedStripe?: Stripe;
  refundStripe?: Stripe;
  environment: z.infer<typeof environment>;
  stripeAccountId: string;
  livemode: boolean;
  fixture?: { monthlyPriceId: string; topupProductId: string };
  collection?: BillingCollection;
  request: unknown;
}): Promise<unknown> {
  const request = requestSchema.parse(input.request);
  if (request.environment !== input.environment) {
    throw new Error('Lifecycle request environment mismatch');
  }
  const writeOperation = ['reload-work', 'expire-reload', 'prepare-renewal', 'recover-renewals'];
  const fixture = input.environment === 'development' && !input.livemode ? input.fixture : undefined;
  const collection = fixture ? ({ kind: 'local_fixture', ...fixture } as const) : input.collection;
  if (writeOperation.includes(request.operation) && (!collection || !input.protectedStripe)) {
    throw new Error('Lifecycle provider mutations require a write key and an enabled collection');
  }
  // The loopback fixture's one protected key stands in for every Stripe key, the refund key included.
  const refundStripe = fixture ? input.protectedStripe : input.refundStripe;
  if (request.operation === 'execute-refund') {
    if (!collection) {
      throw new Error('Lifecycle provider mutations require a write key and an enabled collection');
    }
    if (!refundStripe) {
      throw new Error('execute-refund requires STRIPE_REFUND_SECRET_KEY, the Refunds-Write restricted key');
    }
  }
  const config = { environment: input.environment, stripeAccountId: input.stripeAccountId, livemode: input.livemode };
  const policy = new BillingPolicyService(input.database);
  const ledger = new CreditLedgerService(input.database, policy);
  const cash = new BillingCashService(
    input.database,
    (request.operation === 'execute-refund' ? refundStripe : input.protectedStripe) ?? input.sourceStripe,
    input.sourceStripe,
    ledger,
    config,
  );
  const payments = new BillingPaymentsService(
    input.database,
    input.protectedStripe ?? input.sourceStripe,
    input.sourceStripe,
    {
      ...config,
      uiOrigin: 'http://127.0.0.1',
      webhookSecret: '',
      collection: collection ?? null,
    },
    policy,
    ledger,
    cash,
  );
  const reconciliation = new BillingCashReconciliationService(input.database, input.sourceStripe, config);
  const supplier = new BillingSupplierReconciliationService(input.database, config);
  const purchases = new BillingPurchaseReconciliationService(input.database, input.sourceStripe, config);
  switch (request.operation) {
    case 'reload-work': {
      return payments.processReloadWork(request);
    }
    case 'expire-reload': {
      return payments.expireReloadRecoveries(request);
    }
    case 'prepare-renewal': {
      return payments.prepareRenewalOffer(request);
    }
    case 'recover-renewals': {
      return payments.recoverRenewalOffers(request);
    }
    case 'prepare-refund': {
      // The refund service parses a strict reviewed request, so the command's own `operation` key stays here.
      const { operation, ...reviewed } = request;
      return cash.prepareReviewedRefund(reviewed);
    }
    case 'execute-refund': {
      return cash.executeReviewedRefund({
        ...request,
        capability: {
          qualification: 'protected-refund',
          environment: input.environment,
          stripeAccountId: input.stripeAccountId,
          livemode: input.livemode,
        },
      });
    }
    case 'recover-refund': {
      return cash.recoverRefundIntent(request);
    }
    case 'requalify-charge': {
      return cash.reconcileCharge(request);
    }
    case 'resolve-case': {
      return reconciliation.resolveCaseByOperator(request);
    }
    case 'create-cash-scan': {
      return reconciliation.createScan(request);
    }
    case 'run-cash-scan': {
      return reconciliation.runScan(request);
    }
    case 'reconcile-supplier-invoice': {
      return supplier.reconcileInvoiceTotal(request.invoice);
    }
    case 'run-purchase-scan': {
      return purchases.runScan(request);
    }
    case 'monitor-tax': {
      return new BillingTaxService(input.database).evaluateRegistration({ ...request, ...config });
    }
    case 'recover-closure': {
      const closure = new BillingAccountClosureService(
        input.database,
        {
          recoverAndCancel: async (obligation) =>
            recoverAndCancelStripeClosure(
              {
                ...config,
                database: input.database.database,
                sourceStripe: input.sourceStripe,
                ...(collection && input.protectedStripe ? { protectedStripe: input.protectedStripe } : {}),
              },
              obligation,
            ),
        },
        input.environment,
      );
      return closure.reconcile(request);
    }
  }
}
