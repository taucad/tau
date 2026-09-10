import 'reflect-metadata'; // oxlint-disable-line import/no-unassigned-import -- Nest decorators require metadata before service imports
import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { runBillingLifecycleCommand } from '#api/billing/billing-lifecycle.command.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import process from 'node:process';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { financialEnvironmentSchema } from '@taucad/billing';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { registerBillableModelMeterContracts } from '#api/billing/billable-model-qualification.js';
import { runBillingPolicyCommand } from '#api/billing/billing-policy.command.js';
import { installBillingProtections } from '#database/billing-protections.js';
import * as schema from '#database/schema.js';
import { MetricsService } from '#telemetry/metrics.js';

/** Protected billing entry in the API image; no HTTP server, dotenv or provider initialization. */
async function main(): Promise<void> {
  registerBillableModelMeterContracts();
  const databaseUrl = process.env['BILLING_DATABASE_URL'];
  const environment = process.env.BILLING_ENVIRONMENT;
  if (!databaseUrl || !environment) {
    throw new Error('BILLING_DATABASE_URL and BILLING_ENVIRONMENT are required');
  }
  const args = process.argv.slice(2);
  const flags = args.filter((argument) => argument.startsWith('--')).map((argument) => argument.split('=')[0]);
  if (new Set(flags).size !== flags.length) {
    throw new Error('Duplicate command options are not permitted');
  }
  const environmentIndex = args.indexOf('--environment');
  if (args[0] !== 'protect' && (environmentIndex === -1 || args[environmentIndex + 1] !== environment)) {
    throw new Error('Command environment must match the protected deployment environment');
  }
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    switch (args[0]) {
      case 'lifecycle': {
        if (args.length !== 5 || args[1] !== '--environment' || args[3] !== '--request' || !args[4]) {
          throw new Error('Usage: lifecycle --environment ENVIRONMENT --request JSON_FILE');
        }
        const secretKey = process.env.STRIPE_READ_SECRET_KEY;
        const stripeAccountId = process.env.STRIPE_ACCOUNT_ID;
        const mode = String(process.env.STRIPE_LIVEMODE);
        if (!secretKey || !stripeAccountId || (mode !== 'true' && mode !== 'false')) {
          throw new Error('Read-only Stripe source key, account and explicit mode are required');
        }
        const fixtureUrl = process.env['BILLING_STRIPE_FIXTURE_URL'];
        const sourceStripe = createBillingStripeClient({ secretKey, fixtureUrl });
        const protectedKey = process.env['BILLING_PROTECTED_STRIPE_SECRET_KEY'];
        const monthlyPriceId = process.env['BILLING_FIXTURE_MONTHLY_PRICE_ID'];
        const topupProductId = process.env['BILLING_FIXTURE_TOPUP_PRODUCT_ID'];
        if (
          protectedKey &&
          (environment !== 'development' || mode !== 'false' || !fixtureUrl || !monthlyPriceId || !topupProductId)
        ) {
          throw new Error('Protected mutation key requires a complete development loopback fixture');
        }
        await client`SET ROLE tau_billing_runtime`;
        const result = await runBillingLifecycleCommand({
          database: { database: drizzle(client, { schema }) },
          sourceStripe,
          ...(protectedKey && fixtureUrl && monthlyPriceId && topupProductId
            ? {
                protectedStripe: createBillingStripeClient({ secretKey: protectedKey, fixtureUrl }),
                fixture: { monthlyPriceId, topupProductId },
              }
            : {}),
          environment: financialEnvironmentSchema.parse(environment),
          stripeAccountId,
          livemode: mode === 'true',
          request: JSON.parse(await readFile(args[4], 'utf8')),
        });
        console.log(
          JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)),
        );
        break;
      }
      case 'protect': {
        if (args.length !== 1) {
          throw new Error('protect takes no arguments');
        }
        await installBillingProtections(client);
        console.log('Billing database protections installed');
        break;
      }
      case 'recover-payments': {
        if (
          args.length !== 5 ||
          args[1] !== '--environment' ||
          args[3] !== '--limit' ||
          !/^[1-9][0-9]{0,2}$/u.test(args[4]!) ||
          Number(args[4]) > 100
        ) {
          throw new Error('Usage: recover-payments --environment ENVIRONMENT --limit 1..100');
        }
        const secretKey = process.env.STRIPE_READ_SECRET_KEY;
        const stripeAccountId = process.env.STRIPE_ACCOUNT_ID;
        const livemode = String(process.env.STRIPE_LIVEMODE);
        if (!secretKey || !stripeAccountId || (livemode !== 'true' && livemode !== 'false')) {
          throw new Error('Read-only Stripe source key, account and explicit mode are required');
        }
        const sourceStripe = createBillingStripeClient({
          secretKey,
          fixtureUrl: process.env['BILLING_STRIPE_FIXTURE_URL'],
        });
        await client`SET ROLE tau_billing_runtime`;
        const database = { database: drizzle(client, { schema }) };
        const policy = new BillingPolicyService(database);
        const ledger = new CreditLedgerService(database, policy);
        const cash = new BillingCashService(database, sourceStripe, sourceStripe, ledger, {
          environment: financialEnvironmentSchema.parse(environment),
          stripeAccountId,
          livemode: livemode === 'true',
        });
        // This command holds only the read-only key and never dispatches a creation/cancellation.
        const payments = new BillingPaymentsService(
          database,
          sourceStripe,
          sourceStripe,
          {
            environment: financialEnvironmentSchema.parse(environment),
            stripeAccountId,
            livemode: livemode === 'true',
            uiOrigin: 'https://unused.invalid',
            webhookSecret: '',
            collection: null,
          },
          policy,
          ledger,
          cash,
        );
        const result = await payments.recoverPayments({
          environment: financialEnvironmentSchema.parse(environment),
          limit: Number(args[4]),
        });
        console.log(JSON.stringify(result));
        if (result.failed.length > 0) {
          process.exitCode = 1;
        }
        break;
      }
      case 'recover-llm': {
        if (
          args.length !== 5 ||
          args[1] !== '--environment' ||
          args[3] !== '--limit' ||
          !/^[1-9][0-9]{0,2}$/u.test(args[4]!)
        ) {
          throw new Error('Usage: recover-llm --environment ENVIRONMENT --limit 1..100');
        }
        const limit = Number(args[4]);
        if (limit > 100) {
          throw new Error('Recovery limit must not exceed 100');
        }
        await client`SET ROLE tau_billing_runtime`;
        const database = { database: drizzle(client, { schema }) };
        const ledger = new CreditLedgerService(database, new BillingPolicyService(database));
        const result = await ledger.recoverDueLlmOperations({
          environment: financialEnvironmentSchema.parse(environment),
          limit,
        });
        console.log(JSON.stringify(result));
        if (result.failedOperationIds.length > 0) {
          process.exitCode = 1;
        }
        break;
      }
      case 'recover-llm-worker': {
        if (
          args.length !== 7 ||
          args[1] !== '--environment' ||
          args[3] !== '--limit' ||
          !/^[1-9][0-9]{0,2}$/u.test(args[4]!) ||
          Number(args[4]) > 100 ||
          args[5] !== '--poll-milliseconds' ||
          !/^[1-9][0-9]{0,4}$/u.test(args[6]!) ||
          Number(args[6]) > 30_000
        ) {
          throw new Error(
            'Usage: recover-llm-worker --environment ENVIRONMENT --limit 1..100 --poll-milliseconds 1..30000',
          );
        }
        const limit = Number(args[4]);
        const pollMilliseconds = Number(args[6]);
        const billingEnvironment = financialEnvironmentSchema.parse(environment);
        await client`SET ROLE tau_billing_runtime`;
        const database = { database: drizzle(client, { schema }) };
        const ledger = new CreditLedgerService(database, new BillingPolicyService(database));
        const { sdk } = await import('#telemetry/otel.js');
        const metrics = new MetricsService();
        const shutdown = new AbortController();
        const stop = (): void => {
          shutdown.abort();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        let consecutiveFailures = 0;
        try {
          while (!shutdown.signal.aborted) {
            let failed = 0;
            let fullBatch = false;
            for (const pool of ['primary', 'helper'] as const) {
              const startedAt = Date.now();
              const attributes = {
                'deployment.environment': billingEnvironment,
                'tau.billing.capacity_pool': pool,
              } as const;
              metrics.billingFundedOperationRecoveries.add(1, {
                ...attributes,
                'tau.billing.recovery.outcome': 'attempted',
              });
              try {
                // oxlint-disable-next-line no-await-in-loop -- the two disjoint capacity pools share one bounded DB connection
                const result = await ledger.recoverDueLlmOperations({
                  environment: billingEnvironment,
                  limit,
                  pool,
                });
                failed += result.failedOperationIds.length;
                fullBatch ||= result.claimed === limit;
                if (result.claimed > 0) {
                  metrics.billingFundedOperationRecoveries.add(result.claimed, {
                    ...attributes,
                    'tau.billing.recovery.outcome': 'claimed',
                  });
                }
                if (result.resolved > 0) {
                  metrics.billingFundedOperationRecoveries.add(result.resolved, {
                    ...attributes,
                    'tau.billing.recovery.outcome': 'resolved',
                  });
                }
                if (result.failedOperationIds.length > 0) {
                  metrics.billingFundedOperationRecoveries.add(result.failedOperationIds.length, {
                    ...attributes,
                    'tau.billing.recovery.outcome': 'failed',
                  });
                }
                metrics.billingFundedOperationCurrent.record(result.pending, {
                  ...attributes,
                  'tau.billing.pending.state': 'pending',
                });
                metrics.billingFundedOperationCurrent.record(result.remainingDue, {
                  ...attributes,
                  'tau.billing.pending.state': 'due',
                });
                metrics.billingFundedOperationOldestDueAge.record(result.oldestDueAgeMilliseconds ?? 0, attributes);
                metrics.billingFundedOperationRecoveryProviderExecutions.record(0, attributes);
                metrics.billingFundedOperationRecoveryBatchDuration.record((Date.now() - startedAt) / 1000, {
                  ...attributes,
                  'tau.billing.recovery.batch.outcome': result.failedOperationIds.length === 0 ? 'succeeded' : 'failed',
                });
                console.log(
                  JSON.stringify({
                    event: 'billing.llm_recovery_batch',
                    environment,
                    pool,
                    claimed: result.claimed,
                    resolved: result.resolved,
                    pending: result.pending,
                    remainingDue: result.remainingDue,
                    leasedDue: result.leasedDue,
                    oldestDueAgeMilliseconds: result.oldestDueAgeMilliseconds,
                    failed: result.failedOperationIds.length,
                    providerExecutions: 0,
                    durationMilliseconds: Date.now() - startedAt,
                  }),
                );
              } catch (error) {
                failed += 1;
                metrics.billingFundedOperationRecoveries.add(1, {
                  ...attributes,
                  'tau.billing.recovery.outcome': 'failed',
                });
                metrics.billingFundedOperationRecoveryBatchDuration.record((Date.now() - startedAt) / 1000, {
                  ...attributes,
                  'tau.billing.recovery.batch.outcome': 'failed',
                });
                console.error(
                  JSON.stringify({
                    event: 'billing.llm_recovery_batch',
                    environment,
                    pool,
                    outcome: 'failed',
                    failureKind: error instanceof Error ? error.name : 'UnknownError',
                    durationMilliseconds: Date.now() - startedAt,
                  }),
                );
              }
            }
            consecutiveFailures = failed === 0 ? 0 : consecutiveFailures + 1;
            if (fullBatch && failed === 0) {
              continue;
            }
            const backoff = Math.min(30_000, pollMilliseconds * 2 ** Math.min(consecutiveFailures, 4));
            try {
              // oxlint-disable-next-line no-await-in-loop -- the continuous worker deliberately sleeps between polls
              await wait(backoff, undefined, { signal: shutdown.signal });
            } catch {
              break;
            }
          }
        } finally {
          process.removeListener('SIGINT', stop);
          process.removeListener('SIGTERM', stop);
          await sdk.shutdown();
        }
        break;
      }
      default: {
        await client`SET ROLE tau_billing_policy_publisher`;
        const service = new BillingPolicyService({ database: drizzle(client, { schema }) });
        const result = await runBillingPolicyCommand(service, args);
        const [published] = await client`
        SELECT p.content_hash, a.policy_id, a.announced_at, a.effective_at
        FROM billing.billing_policy_activation a
        JOIN billing.billing_policy p ON p.id = a.policy_id AND p.environment = a.environment
        WHERE a.environment = ${environment} AND a.id = ${result.activationId}
      `;
        if (!published) {
          throw new Error('Published activation readback failed');
        }
        console.log(
          JSON.stringify({ ...result, published }, (_key, value: unknown) =>
            typeof value === 'bigint' ? value.toString() : value,
          ),
        );
      }
    }
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Billing command failed');
  process.exitCode = 1;
}
