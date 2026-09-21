import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { recoverAndCancelStripeClosure } from '#api/billing/billing-account-closure-stripe.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Stripe } from 'stripe';
import { financialEnvironmentSchema } from '@taucad/billing';
import { DatabaseService } from '#database/database.service.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import { BillingSupplierReconciliationService } from '#api/billing/billing-supplier-reconciliation.service.js';
import { BillingRecoveryScheduler, recoveryPassLimit } from '#api/billing/billing-recovery.scheduler.js';
import { BillingJournalReconciliationService } from '#api/billing/billing-journal-reconciliation.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { BillingRecoveryNoticeEmailTransport } from '#api/billing/billing-recovery-notice.transport.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import { resolveBillingCollection } from '#api/billing/billing-collection.js';
import { fundedGatewayProviderIds, isGatewayProviderConfigured } from '#api/providers/provider-gateway.js';
import { DatabaseModule } from '#database/database.module.js';
import { EmailModule } from '#email/email.module.js';
import { EmailService } from '#email/email.service.js';
import { ModelModule } from '#api/models/model.module.js';
import { BillingController } from '#api/billing/billing.controller.js';
import { BillingService } from '#api/billing/billing.service.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { BillingPolicyReadiness } from '#api/billing/billing-policy.readiness.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillingUsageService } from '#api/billing/billing-usage.service.js';
import { BillingEstimatesService } from '#api/billing/billing-estimates.service.js';
import { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';
import { billableModelQualificationResolverKey } from '#api/billing/billable-model-invocation.types.js';
import {
  CodeOwnedBillableModelQualificationResolver,
  registerBillableModelMeterContracts,
} from '#api/billing/billable-model-qualification.js';
import {
  createBillableModelInputCounters,
  createBillableModelProviderAdapters,
} from '#api/billing/billable-model-provider.js';
import { stripeClientKey, stripeReadClientKey } from '#api/billing/billing.constants.js';
import type { Environment } from '#config/environment.config.js';

/**
 * Send every funded provider call to a local upstream instead, path preserved.
 *
 * The development-only seam behind `TAU_LLM_PROVIDER_UPSTREAM_URL` (refused by
 * `environmentSchema` outside `BILLING_ENVIRONMENT=development`): the desktop e2e
 * suite drives the *real* gateway — admission, qualification, normalization,
 * metering — and only the last hop lands on its own stub, which is what makes
 * D16 assertable end to end without a provider key.
 *
 * ponytail: only the Anthropic host is rewritten, because that is the wire the
 * desktop turn drives; the API's own OpenAI-wire callers (chat naming) keep
 * their real upstream, or no adapter at all without a key. Widen the host set
 * if another development stub is ever needed.
 */
const providerUpstreamFetch =
  (upstream: string): typeof fetch =>
  async (input, init) => {
    const target = input instanceof Request ? new URL(input.url) : new URL(input);
    if (target.host !== 'api.anthropic.com') {
      return fetch(input, init);
    }
    return fetch(new URL(`${target.pathname}${target.search}`, upstream), init);
  };

/** PostgreSQL financial authority; unqualified legacy collection and hosted callers remain closed. */
@Module({
  imports: [DatabaseModule, EmailModule, ModelModule],
  controllers: [BillingController],
  providers: [
    {
      provide: stripeClientKey,
      useFactory(configService: ConfigService<Environment, true>): Stripe {
        const secretKey = configService.get('STRIPE_SECRET_KEY', { infer: true });
        return createBillingStripeClient({ secretKey: secretKey || 'sk_test_dummy_dev_only' });
      },
      inject: [ConfigService],
    },
    {
      provide: stripeReadClientKey,
      inject: [ConfigService],
      useFactory(config: ConfigService<Environment, true>): Stripe {
        return createBillingStripeClient({
          secretKey: config.get('STRIPE_READ_SECRET_KEY', { infer: true }) || 'rk_test_unconfigured',
        });
      },
    },
    {
      provide: BillingAccountClosureService,
      inject: [DatabaseService, stripeReadClientKey, stripeClientKey, ConfigService],
      // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- Nest resolves four distinct provider tokens.
      useFactory(
        database: DatabaseService,
        sourceStripe: Stripe,
        protectedStripe: Stripe,
        config: ConfigService<Environment, true>,
      ): BillingAccountClosureService {
        const parsed = financialEnvironmentSchema.safeParse(config.get('BILLING_ENVIRONMENT', { infer: true }));
        const environment = parsed.success ? parsed.data : 'development';
        return new BillingAccountClosureService(
          database,
          {
            recoverAndCancel: async (input) =>
              recoverAndCancelStripeClosure(
                {
                  database: database.database,
                  sourceStripe,
                  protectedStripe,
                  environment,
                  stripeAccountId: config.get('STRIPE_ACCOUNT_ID', { infer: true }),
                  livemode: config.get('STRIPE_LIVEMODE', { infer: true }),
                },
                input,
              ),
          },
          environment,
        );
      },
    },
    {
      provide: BillingCashService,
      inject: [DatabaseService, stripeReadClientKey, CreditLedgerService, ConfigService],
      // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- Nest resolves four distinct provider tokens.
      useFactory(
        database: DatabaseService,
        sourceStripe: Stripe,
        ledger: CreditLedgerService,
        config: ConfigService<Environment, true>,
      ): BillingCashService {
        const environment = financialEnvironmentSchema.safeParse(config.get('BILLING_ENVIRONMENT', { infer: true }));
        // Ordinary app composition has no protected refund credential.
        return new BillingCashService(database, sourceStripe, sourceStripe, ledger, {
          environment: environment.success ? environment.data : 'development',
          stripeAccountId: config.get('STRIPE_ACCOUNT_ID', { infer: true }),
          livemode: config.get('STRIPE_LIVEMODE', { infer: true }),
        });
      },
    },
    {
      provide: BillingSupplierReconciliationService,
      inject: [DatabaseService, ConfigService],
      useFactory(
        database: DatabaseService,
        config: ConfigService<Environment, true>,
      ): BillingSupplierReconciliationService {
        const environment = financialEnvironmentSchema.safeParse(config.get('BILLING_ENVIRONMENT', { infer: true }));
        return new BillingSupplierReconciliationService(database, {
          environment: environment.success ? environment.data : 'development',
          stripeAccountId: config.get('STRIPE_ACCOUNT_ID', { infer: true }),
          livemode: config.get('STRIPE_LIVEMODE', { infer: true }),
        });
      },
    },
    {
      provide: BillingRecoveryScheduler,
      inject: [CreditLedgerService, ConfigService],
      useFactory(ledger: CreditLedgerService, config: ConfigService<Environment, true>): BillingRecoveryScheduler {
        const environment = financialEnvironmentSchema.safeParse(config.get('BILLING_ENVIRONMENT', { infer: true }));
        return new BillingRecoveryScheduler(ledger, {
          environment: environment.success ? environment.data : 'development',
          intervalMilliseconds: config.get('BILLING_RECOVERY_INTERVAL_MS', { infer: true }),
          limit: recoveryPassLimit,
        });
      },
    },
    {
      provide: BillingJournalReconciliationService,
      inject: [DatabaseService, MetricsService, ConfigService],
      useFactory(
        database: DatabaseService,
        metrics: MetricsService,
        config: ConfigService<Environment, true>,
      ): BillingJournalReconciliationService {
        const environment = financialEnvironmentSchema.safeParse(config.get('BILLING_ENVIRONMENT', { infer: true }));
        return new BillingJournalReconciliationService(database, metrics, {
          environment: environment.success ? environment.data : 'development',
          stripeAccountId: config.get('STRIPE_ACCOUNT_ID', { infer: true }),
          livemode: config.get('STRIPE_LIVEMODE', { infer: true }),
        });
      },
    },
    {
      provide: BillingPaymentsService,
      inject: [
        DatabaseService,
        stripeClientKey,
        stripeReadClientKey,
        ConfigService,
        BillingPolicyService,
        CreditLedgerService,
        BillingCashService,
        EmailService,
      ],
      // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- Nest resolves the eight explicitly declared provider tokens.
      useFactory(
        database: DatabaseService,
        stripe: Stripe,
        sourceStripe: Stripe,
        config: ConfigService<Environment, true>,
        policy: BillingPolicyService,
        ledger: CreditLedgerService,
        cash: BillingCashService,
        email: EmailService,
      ): BillingPaymentsService {
        const environment = financialEnvironmentSchema.safeParse(config.get('BILLING_ENVIRONMENT', { infer: true }));
        const accountId = config.get('STRIPE_ACCOUNT_ID', { infer: true });
        const livemode = config.get('STRIPE_LIVEMODE', { infer: true });
        return new BillingPaymentsService(
          database,
          stripe,
          sourceStripe,
          {
            environment: environment.success ? environment.data : 'development',
            stripeAccountId: accountId,
            livemode: livemode ?? false,
            uiOrigin: config.get('TAU_FRONTEND_URL', { infer: true }),
            webhookSecret:
              environment.success && accountId && livemode !== undefined
                ? config.get('STRIPE_WEBHOOK_SECRET', { infer: true })
                : '',
            collection: resolveBillingCollection({
              environment: environment.success ? environment.data : undefined,
              stripeAccountId: accountId,
              livemode,
              liveCollectionEnabled: config.get('BILLING_LIVE_COLLECTION_ENABLED', { infer: true }),
              monthlyPriceId: config.get('STRIPE_PRICE_ID_PRO_MONTHLY', { infer: true }),
              topupProductId: config.get('STRIPE_PRODUCT_ID_CREDIT_PACK', { infer: true }),
            }),
          },
          policy,
          ledger,
          cash,
          new BillingRecoveryNoticeEmailTransport(database, email, config.get('TAU_FRONTEND_URL', { infer: true })),
        );
      },
    },
    BillingService,
    CreditLedgerService,
    BillingPolicyService,
    {
      provide: BillingPolicyReadiness,
      inject: [BillingPolicyService, ConfigService],
      useFactory(policy: BillingPolicyService, config: ConfigService<Environment, true>): BillingPolicyReadiness {
        const environment = financialEnvironmentSchema.safeParse(config.get('BILLING_ENVIRONMENT', { infer: true }));
        return new BillingPolicyReadiness(policy, {
          environment: environment.success ? environment.data : 'development',
          cloudEnabled: config.get('TAU_CLOUD_ENABLED', { infer: true }),
        });
      },
    },
    BillingUsageService,
    BillingEstimatesService,
    BillableModelInvocationService,
    {
      provide: billableModelQualificationResolverKey,
      inject: [ConfigService],
      useFactory(config: ConfigService<Environment, true>): CodeOwnedBillableModelQualificationResolver {
        registerBillableModelMeterContracts();
        const accounts = config.get('BILLING_PROVIDER_ACCOUNTS', { infer: true });
        const credentialAccounts = new Map(Object.entries(accounts));
        // A funded route with a provider key but no billing account can never settle; refuse to start
        // rather than advertise its models and answer every call with an error.
        const unaccounted = fundedGatewayProviderIds.filter(
          (provider) => isGatewayProviderConfigured(config, provider) && !credentialAccounts.has(provider),
        );
        if (unaccounted.length > 0) {
          throw new Error(
            `BILLING_PROVIDER_ACCOUNTS has no entry for configured provider(s): ${unaccounted.join(', ')}`,
          );
        }
        const upstream = config.get('TAU_LLM_PROVIDER_UPSTREAM_URL', { infer: true });
        const environment = financialEnvironmentSchema.safeParse(config.get('BILLING_ENVIRONMENT', { infer: true }));
        return new CodeOwnedBillableModelQualificationResolver({
          adapters: createBillableModelProviderAdapters(
            config,
            upstream === undefined ? undefined : providerUpstreamFetch(upstream),
          ),
          credentialAccounts,
          // Configuration alone selects exact counting; an unresolved environment supplies none.
          inputCounters: createBillableModelInputCounters({
            enabled: environment.success && config.get('BILLING_EXACT_INPUT_COUNT', { infer: true }),
            environment: environment.success ? environment.data : 'development',
            apiKey: config.get('OPENAI_API_KEY', { infer: true }),
            credentialAccount: credentialAccounts.get('openai'),
          }),
          executionTimeout: config.get('BILLING_INVOCATION_DEADLINE', { infer: true }),
        });
      },
    },
  ],
  exports: [
    BillingAccountClosureService,
    stripeClientKey,
    stripeReadClientKey,
    BillingPaymentsService,
    BillingService,
    CreditLedgerService,
    BillingPolicyService,
    BillableModelInvocationService,
    BillingSupplierReconciliationService,
  ],
})
export class BillingModule {}
