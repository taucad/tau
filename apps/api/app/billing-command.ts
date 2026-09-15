import 'reflect-metadata'; // oxlint-disable-line import/no-unassigned-import -- Nest decorators require metadata before service imports
import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { runBillingLifecycleCommand } from '#api/billing/billing-lifecycle.command.js';
import { runBillingBudgetCommand } from '#api/billing/billing-budget.command.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import process from 'node:process';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { financialEnvironmentSchema } from '@taucad/billing';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillingJournalReconciliationService } from '#api/billing/billing-journal-reconciliation.service.js';
import { BillingCashReconciliationService } from '#api/billing/billing-cash-reconciliation.service.js';
import { BillingPurchaseReconciliationService } from '#api/billing/billing-purchase-reconciliation.service.js';
import { BillingSupplierReconciliationService } from '#api/billing/billing-supplier-reconciliation.service.js';
import { registerBillableModelMeterContracts } from '#api/billing/billable-model-qualification.js';
import { runBillingPolicyCommand } from '#api/billing/billing-policy.command.js';
import { installBillingProtections } from '#database/billing-protections.js';
import { runMigrationJob } from '#database/database-migration.js';
import * as schema from '#database/schema.js';
import { MetricsService } from '#telemetry/metrics.js';

/** Protected billing entry in the API image; no HTTP server, dotenv or provider initialization. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (String(process.env.TAU_CLOUD_ENABLED) !== 'true') {
    throw new Error('billing-command requires TAU_CLOUD_ENABLED=true');
  }
  registerBillableModelMeterContracts();
  const databaseUrl = process.env['BILLING_DATABASE_URL'];
  const environment = process.env.BILLING_ENVIRONMENT;
  if (!databaseUrl || !environment) {
    throw new Error('BILLING_DATABASE_URL and BILLING_ENVIRONMENT are required');
  }
  const flags = args.filter((argument) => argument.startsWith('--')).map((argument) => argument.split('=')[0]);
  if (new Set(flags).size !== flags.length) {
    throw new Error('Duplicate command options are not permitted');
  }
  const environmentIndex = args.indexOf('--environment');
  if (args[0] !== 'protect' && (environmentIndex === -1 || args[environmentIndex + 1] !== environment)) {
    throw new Error('Command environment must match the protected deployment environment');
  }
  /* The de-privileged role is a startup parameter, not a one-off `SET ROLE`: postgres.js opens a
   * fresh session on every reconnect and a fresh session starts as the login role, so the long-running
   * worker would otherwise finish its life outside `tau_billing_runtime` after the first outage.
   * `protect` and `migrate` keep the login role on purpose (they own DDL). */
  const runtimeRoles: Record<string, string> = {
    lifecycle: 'tau_billing_runtime',
    'recover-payments': 'tau_billing_runtime',
    'billing-operations-worker': 'tau_billing_runtime',
    'billing-reload-worker': 'tau_billing_runtime',
    'recover-llm': 'tau_billing_runtime',
    'recover-llm-worker': 'tau_billing_runtime',
    'reconcile-journal': 'tau_billing_runtime',
  };
  const command = args[0] ?? '';
  const role =
    command === 'protect' || command === 'migrate' || command === 'provision-budgets'
      ? undefined
      : (runtimeRoles[command] ?? 'tau_billing_policy_publisher');
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    // Bounded reconnect: the worker loop owns retry pacing, the driver must not park it for up to 20 s + 30 s.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- postgres.js option name
    connect_timeout: 10,
    backoff: () => 1,
    ...(role === undefined ? {} : { connection: { role } }),
  });
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
      case 'migrate': {
        if (args.length !== 3 || args[1] !== '--environment') {
          throw new Error('Usage: migrate --environment ENVIRONMENT');
        }
        // Protected one-shot DDL identity on its own `max: 1` connection; API replicas never migrate.
        const migration = await runMigrationJob(databaseUrl);
        console.log(JSON.stringify(migration));
        break;
      }
      case 'provision-budgets': {
        const result = await runBillingBudgetCommand(client, args, environment);
        console.log(JSON.stringify(result));
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
      case 'reconcile-journal': {
        if (args.length !== 3 || args[1] !== '--environment') {
          throw new Error('Usage: reconcile-journal --environment ENVIRONMENT');
        }
        const stripeAccountId = process.env.STRIPE_ACCOUNT_ID;
        const livemode = String(process.env.STRIPE_LIVEMODE);
        if (!stripeAccountId || (livemode !== 'true' && livemode !== 'false')) {
          throw new Error('Financial case scope requires the Stripe account and an explicit mode');
        }
        // No provider client: the sweep reads and writes only the local financial authority.
        const { sdk } = await import('#telemetry/otel.js');
        const reconciliation = new BillingJournalReconciliationService(
          { database: drizzle(client, { schema }) },
          new MetricsService(),
          {
            environment: financialEnvironmentSchema.parse(environment),
            stripeAccountId,
            livemode: livemode === 'true',
          },
        );
        try {
          // One bounded incremental batch and one bounded sweep batch; the scheduler repeats it.
          const report = await reconciliation.runSweep({ batchLimit: 200 });
          console.log(JSON.stringify({ event: 'billing.journal_reconciliation', environment, ...report }));
          if (report.driftedAccounts > 0) {
            process.exitCode = 1;
          }
        } finally {
          await sdk.shutdown();
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
      case 'billing-operations-worker': {
        if (
          args.length !== 7 ||
          args[1] !== '--environment' ||
          args[3] !== '--limit' ||
          !/^[1-9][0-9]{0,2}$/u.test(args[4]!) ||
          Number(args[4]) > 100 ||
          args[5] !== '--poll-milliseconds' ||
          !/^[1-9][0-9]{3,5}$/u.test(args[6]!) ||
          Number(args[6]) > 300_000
        ) {
          throw new Error(
            'Usage: billing-operations-worker --environment ENVIRONMENT --limit 1..100 --poll-milliseconds 1000..300000',
          );
        }
        const secretKey = process.env.STRIPE_READ_SECRET_KEY;
        const stripeAccountId = process.env.STRIPE_ACCOUNT_ID;
        const livemode = String(process.env.STRIPE_LIVEMODE);
        if (!secretKey || !stripeAccountId || (livemode !== 'true' && livemode !== 'false')) {
          throw new Error('Read-only Stripe source key, account and explicit mode are required');
        }
        const limit = Number(args[4]);
        const pollMilliseconds = Number(args[6]);
        const billingEnvironment = financialEnvironmentSchema.parse(environment);
        const sourceStripe = createBillingStripeClient({
          secretKey,
          fixtureUrl: process.env['BILLING_STRIPE_FIXTURE_URL'],
        });
        const database = { database: drizzle(client, { schema }) };
        const policy = new BillingPolicyService(database);
        const ledger = new CreditLedgerService(database, policy);
        const cash = new BillingCashService(database, sourceStripe, sourceStripe, ledger, {
          environment: billingEnvironment,
          stripeAccountId,
          livemode: livemode === 'true',
        });
        const payments = new BillingPaymentsService(
          database,
          sourceStripe,
          sourceStripe,
          {
            environment: billingEnvironment,
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
        const { sdk } = await import('#telemetry/otel.js');
        const sourceConfig = {
          environment: billingEnvironment,
          stripeAccountId,
          livemode: livemode === 'true',
        };
        const journal = new BillingJournalReconciliationService(database, new MetricsService(), sourceConfig);
        const cashScans = new BillingCashReconciliationService(database, sourceStripe, sourceConfig);
        const purchaseScans = new BillingPurchaseReconciliationService(database, sourceStripe, sourceConfig);
        const supplier = new BillingSupplierReconciliationService(database, sourceConfig);
        // Each scheduled job owns its failure: one provider or data fault must not stop the others.
        const runJob = async (event: string, run: () => Promise<unknown>): Promise<void> => {
          const jobStartedAt = Date.now();
          try {
            const report = await run();
            console.log(
              JSON.stringify(
                { event, environment, report, durationMilliseconds: Date.now() - jobStartedAt },
                (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
              ),
            );
          } catch (error) {
            console.error(
              JSON.stringify({
                event,
                environment,
                outcome: 'failed',
                failureKind: error instanceof Error ? error.name : 'UnknownError',
                durationMilliseconds: Date.now() - jobStartedAt,
              }),
            );
          }
        };
        const shutdown = new AbortController();
        const stop = (): void => {
          shutdown.abort();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        // The journal sweep keeps a fixed 15-minute cadence independent of the payment poll interval.
        const journalSweepIntervalMilliseconds = 15 * 60_000;
        let lastSweepAt = Number.NEGATIVE_INFINITY;
        // Independent source reconciliation is hourly; its window is the previous complete UTC day.
        const scanIntervalMilliseconds = 60 * 60_000;
        const dayMilliseconds = 24 * 60 * 60_000;
        // Start one cadence in: boot stays free of provider I/O, and restarts do not re-scan immediately.
        let lastScanAt = Date.now();
        try {
          while (!shutdown.signal.aborted) {
            const startedAt = Date.now();
            try {
              // oxlint-disable-next-line no-await-in-loop -- one worker serializes provider recovery on one DB connection
              const recovered = await payments.recoverPayments({ environment: billingEnvironment, limit });
              console.log(
                JSON.stringify({
                  event: 'billing.payment_recovery_batch',
                  environment,
                  processed: recovered.processed.length,
                  pending: recovered.pending.length,
                  failed: recovered.failed.length,
                  durationMilliseconds: Date.now() - startedAt,
                }),
              );
            } catch (error) {
              console.error(
                JSON.stringify({
                  event: 'billing.payment_recovery_batch',
                  environment,
                  outcome: 'failed',
                  failureKind: error instanceof Error ? error.name : 'UnknownError',
                  durationMilliseconds: Date.now() - startedAt,
                }),
              );
            }
            if (Date.now() - lastSweepAt >= journalSweepIntervalMilliseconds) {
              const reconciliationStartedAt = Date.now();
              lastSweepAt = reconciliationStartedAt;
              try {
                // oxlint-disable-next-line no-await-in-loop -- the independent sweep runs every fifteen minutes
                const report = await journal.runSweep({ batchLimit: 200 });
                console.log(
                  JSON.stringify({
                    event: 'billing.journal_reconciliation',
                    environment,
                    ...report,
                    durationMilliseconds: Date.now() - reconciliationStartedAt,
                  }),
                );
              } catch (error) {
                console.error(
                  JSON.stringify({
                    event: 'billing.journal_reconciliation',
                    environment,
                    outcome: 'failed',
                    failureKind: error instanceof Error ? error.name : 'UnknownError',
                    durationMilliseconds: Date.now() - reconciliationStartedAt,
                  }),
                );
              }
            }
            // oxlint-disable-next-line no-await-in-loop -- one worker serializes its jobs on one DB connection
            await runJob('billing.reload_expiry', async () =>
              payments.expireReloadRecoveries({ environment: billingEnvironment, limit }),
            );
            // oxlint-disable-next-line no-await-in-loop -- one worker serializes its jobs on one DB connection
            await runJob('billing.renewal_recovery', async () =>
              payments.recoverRenewalOffers({ environment: billingEnvironment, limit }),
            );
            if (Date.now() - lastScanAt >= scanIntervalMilliseconds) {
              lastScanAt = Date.now();
              // oxlint-disable-next-line no-await-in-loop -- one worker serializes its jobs on one DB connection
              await runJob('billing.supplier_sweep', async () =>
                supplier.sweepSupplierUsage({ pageSize: 100, unresolvedMaximumAge: dayMilliseconds }),
              );
              // oxlint-disable-next-line no-await-in-loop -- one worker serializes its jobs on one DB connection
              await runJob('billing.source_reconciliation', async () => {
                const windowEnd = new Date(Math.floor(Date.now() / dayMilliseconds) * dayMilliseconds);
                const windowStart = new Date(windowEnd.getTime() - dayMilliseconds);
                // The scan row is idempotent per window, so an hourly retry resumes the same durable cursors.
                const scanId = await cashScans.createScan({
                  environment: billingEnvironment,
                  currency: 'usd',
                  windowStart,
                  windowEnd,
                  lookbackStart: new Date(windowStart.getTime() - dayMilliseconds),
                });
                const cash = await cashScans.runScan({ scanId, maximumPagesPerStream: 20 });
                const purchase = await purchaseScans.runScan({
                  scanId,
                  maximumObligations: 100,
                  maximumGrants: 100,
                  maximumSubscriptions: 100,
                });
                return { scanId, cash: cash.status, purchases: purchase.status };
              });
            }
            try {
              // oxlint-disable-next-line no-await-in-loop -- the continuous worker deliberately sleeps between polls
              await wait(pollMilliseconds, undefined, { signal: shutdown.signal });
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
      case 'billing-reload-worker': {
        if (
          args.length !== 7 ||
          args[1] !== '--environment' ||
          args[3] !== '--limit' ||
          !/^[1-9][0-9]{0,2}$/u.test(args[4]!) ||
          Number(args[4]) > 100 ||
          args[5] !== '--poll-milliseconds' ||
          !/^[1-9][0-9]{3,5}$/u.test(args[6]!) ||
          Number(args[6]) > 300_000
        ) {
          throw new Error(
            'Usage: billing-reload-worker --environment ENVIRONMENT --limit 1..100 --poll-milliseconds 1000..300000',
          );
        }
        const secretKey = process.env.STRIPE_SECRET_KEY;
        const readSecretKey = process.env.STRIPE_READ_SECRET_KEY;
        const stripeAccountId = process.env.STRIPE_ACCOUNT_ID;
        const livemode = String(process.env.STRIPE_LIVEMODE);
        const monthlyPriceId = process.env.STRIPE_PRICE_ID_PRO_MONTHLY;
        const topupProductId = process.env.STRIPE_PRODUCT_ID_CREDIT_PACK;
        if (!secretKey || !readSecretKey || !stripeAccountId || !monthlyPriceId || !topupProductId) {
          throw new Error('Separate collection and read Stripe keys, account and catalog identifiers are required');
        }
        // The API composes collection only in explicit test mode; a live worker would charge an unqualified catalog.
        // Both refusals are permanent, so they fail the boot rather than letting the loop spin on ForbiddenException.
        if (livemode !== 'false') {
          throw new Error('Automatic reload collection requires explicit Stripe test mode');
        }
        if (environment.startsWith('prod-')) {
          throw new Error('Automatic reload collection is not enabled for production environments');
        }
        const limit = Number(args[4]);
        const pollMilliseconds = Number(args[6]);
        const billingEnvironment = financialEnvironmentSchema.parse(environment);
        const fixtureUrl = process.env['BILLING_STRIPE_FIXTURE_URL'];
        const stripe = createBillingStripeClient({ secretKey, fixtureUrl });
        const sourceStripe = createBillingStripeClient({ secretKey: readSecretKey, fixtureUrl });
        const database = { database: drizzle(client, { schema }) };
        const policy = new BillingPolicyService(database);
        const ledger = new CreditLedgerService(database, policy);
        const config = { environment: billingEnvironment, stripeAccountId, livemode: false };
        const cash = new BillingCashService(database, stripe, sourceStripe, ledger, config);
        const payments = new BillingPaymentsService(
          database,
          stripe,
          sourceStripe,
          {
            ...config,
            // Reload charges never build redirect URLs; the hosted origin belongs to the API process.
            uiOrigin: 'https://unused.invalid',
            webhookSecret: '',
            collection: { kind: 'stripe_test', monthlyPriceId, topupProductId },
          },
          policy,
          ledger,
          cash,
        );
        const { sdk } = await import('#telemetry/otel.js');
        const shutdown = new AbortController();
        const stop = (): void => {
          shutdown.abort();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        try {
          while (!shutdown.signal.aborted) {
            const startedAt = Date.now();
            try {
              // oxlint-disable-next-line no-await-in-loop -- one worker serializes reload charges on one DB connection
              const worked = await payments.processReloadWork({ environment: billingEnvironment, limit });
              console.log(
                JSON.stringify({
                  event: 'billing.reload_work_batch',
                  environment,
                  processed: worked.processed.length,
                  pending: worked.pending.length,
                  failed: worked.failed.length,
                  durationMilliseconds: Date.now() - startedAt,
                }),
              );
            } catch (error) {
              console.error(
                JSON.stringify({
                  event: 'billing.reload_work_batch',
                  environment,
                  outcome: 'failed',
                  failureKind: error instanceof Error ? error.name : 'UnknownError',
                  durationMilliseconds: Date.now() - startedAt,
                }),
              );
            }
            try {
              // oxlint-disable-next-line no-await-in-loop -- the continuous worker deliberately sleeps between polls
              await wait(pollMilliseconds, undefined, { signal: shutdown.signal });
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
