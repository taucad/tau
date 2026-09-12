import { z } from 'zod';
import type { Stripe } from 'stripe';
import { financialEnvironmentSchema, financialIdentitySchema } from '@taucad/billing';
import type { DatabaseService } from '#database/database.service.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import { BillingCashReconciliationService } from '#api/billing/billing-cash-reconciliation.service.js';
import {
  BillingSupplierReconciliationService,
  operatorSupplierInvoiceSchema,
} from '#api/billing/billing-supplier-reconciliation.service.js';
import { BillingPurchaseReconciliationService } from '#api/billing/billing-purchase-reconciliation.service.js';
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { recoverAndCancelStripeClosure } from '#api/billing/billing-account-closure-stripe.js';
import { BillingTaxService } from '#api/billing/billing-tax.service.js';

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
      reason: z.string().min(1).max(2000),
      requestId: id,
    })
    .strict(),
  z.object({ operation: z.literal('execute-refund'), environment, intentId: id, reviewActorId: id }).strict(),
  z.object({ operation: z.literal('recover-refund'), environment, intentId: id, maximumPages: limit }).strict(),
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
    .object({
      operation: z.literal('sweep-supplier'),
      environment,
      pageSize: limit,
      /** Milliseconds. */
      unresolvedMaximumAge: z.number().int().min(0).max(2_592_000_000),
    })
    .strict(),
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

/** Strict protected-job composition; provider mutations remain restricted to an isolated local fixture. */
export async function runBillingLifecycleCommand(input: {
  database: Pick<DatabaseService, 'database'>;
  sourceStripe: Stripe;
  protectedStripe?: Stripe;
  environment: z.infer<typeof environment>;
  stripeAccountId: string;
  livemode: boolean;
  fixture?: { monthlyPriceId: string; topupProductId: string };
  request: unknown;
}): Promise<unknown> {
  const request = requestSchema.parse(input.request);
  if (request.environment !== input.environment) {
    throw new Error('Lifecycle request environment mismatch');
  }
  const writeOperation = ['reload-work', 'expire-reload', 'prepare-renewal', 'recover-renewals', 'execute-refund'];
  const fixture = input.environment === 'development' && !input.livemode ? input.fixture : undefined;
  if (writeOperation.includes(request.operation) && (!fixture || !input.protectedStripe)) {
    throw new Error('Lifecycle provider mutations require an isolated development fixture');
  }
  const config = { environment: input.environment, stripeAccountId: input.stripeAccountId, livemode: input.livemode };
  const policy = new BillingPolicyService(input.database);
  const ledger = new CreditLedgerService(input.database, policy);
  const cash = new BillingCashService(
    input.database,
    input.protectedStripe ?? input.sourceStripe,
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
      collection: fixture ? { kind: 'local_fixture', ...fixture } : null,
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
      return cash.prepareReviewedRefund(request);
    }
    case 'execute-refund': {
      return cash.executeReviewedRefund({
        ...request,
        capability: {
          qualification: 'controlled-local-protected-refund',
          environment: 'development',
          stripeAccountId: input.stripeAccountId,
          livemode: false,
        },
      });
    }
    case 'recover-refund': {
      return cash.recoverRefundIntent(request);
    }
    case 'create-cash-scan': {
      return reconciliation.createScan(request);
    }
    case 'run-cash-scan': {
      return reconciliation.runScan(request);
    }
    case 'sweep-supplier': {
      return supplier.sweepSupplierUsage(request);
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
                ...(fixture && input.protectedStripe ? { protectedStripe: input.protectedStripe } : {}),
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
