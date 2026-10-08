import 'reflect-metadata'; // oxlint-disable-line import/no-unassigned-import -- Nest decorators require metadata before service imports
import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { ensureWorktreeDatabase } from '@taucad/utils/worktree-database';
import { runBillingLifecycleCommand } from '#api/billing/billing-lifecycle.command.js';
import { runBillingBudgetCommand } from '#api/billing/billing-budget.command.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import { resolveBillingCollection } from '#api/billing/billing-collection.js';
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { recoverAndCancelStripeClosure } from '#api/billing/billing-account-closure-stripe.js';
import process from 'node:process';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { financialEnvironmentSchema } from '@taucad/billing';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillingRecoveryScheduler } from '#api/billing/billing-recovery.scheduler.js';
import { BillingJournalReconciliationService } from '#api/billing/billing-journal-reconciliation.service.js';
import {
  BillingCashReconciliationService,
  cashBlockingFinancialCaseKinds,
} from '#api/billing/billing-cash-reconciliation.service.js';
import { BillingPurchaseReconciliationService } from '#api/billing/billing-purchase-reconciliation.service.js';
import { BillingSupplierReconciliationService } from '#api/billing/billing-supplier-reconciliation.service.js';
import { registerBillableModelMeterContracts } from '#api/billing/billable-model-qualification.js';
import { runBillingPolicyCommand, runBillingPolicySyncCommand } from '#api/billing/billing-policy.command.js';
import { installBillingProtections } from '#database/billing-protections.js';
import { runMigrationJob } from '#database/database-migration.js';
import * as schema from '#database/schema.js';
import { MetricsService } from '#telemetry/metrics.js';
import { BillingRecoveryNoticeEmailTransport } from '#api/billing/billing-recovery-notice.transport.js';
import { EmailService } from '#email/email.service.js';
import type { DatabaseService } from '#database/database.service.js';

/**
 * Recovery notices become email only when this worker knows where the app lives and how to send.
 * Without both the notices stay pending, which is the correct outcome: a link to nowhere is worse
 * than a delayed one, and `deliverRecoveryNotices` keeps retrying every pass.
 */
const createRecoveryNoticeTransport = (
  database: Pick<DatabaseService, 'database'>,
): BillingRecoveryNoticeEmailTransport | undefined => {
  const frontendURL = process.env.TAU_FRONTEND_URL;
  if (!frontendURL) {
    return undefined;
  }
  // EmailService reads its configuration through the Nest ConfigService shape; this worker has no
  // Nest container, so it gets the same keys straight from the environment.
  const config = {
    get: (key: string): string => process.env[key] ?? (key === 'TAU_EMAIL_REPLY_TO' ? 'help@taucad.dev' : ''),
  };
  return new BillingRecoveryNoticeEmailTransport(
    database,
    new EmailService(config as unknown as ConstructorParameters<typeof EmailService>[0]),
    frontendURL,
  );
};

/** Protected billing entry in the API image; no HTTP server, dotenv or provider initialization. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // `migrate` is the release command for the whole API schema, so a cloud-off deployment still needs it.
  if (args[0] !== 'migrate' && String(process.env.TAU_CLOUD_ENABLED) !== 'true') {
    throw new Error('billing-command requires TAU_CLOUD_ENABLED=true');
  }
  registerBillableModelMeterContracts();
  const configuredDatabaseUrl = process.env['BILLING_DATABASE_URL'];
  const environment = process.env.BILLING_ENVIRONMENT;
  if (!configuredDatabaseUrl || !environment) {
    throw new Error('BILLING_DATABASE_URL and BILLING_ENVIRONMENT are required');
  }
  // A linked worktree's development commands run against that worktree's database fork.
  const databaseUrl =
    environment === 'development' ? ensureWorktreeDatabase(configuredDatabaseUrl) : configuredDatabaseUrl;
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
    'recover-llm': 'tau_billing_runtime',
    'recover-llm-worker': 'tau_billing_runtime',
    'reconcile-journal': 'tau_billing_runtime',
  };
  const command = args[0] ?? '';
  const role =
    command === 'protect' || command === 'migrate' || command === 'provision-budgets' || command === 'sync'
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
  /* One routine for `sync` and for the tariff half of `migrate`, so local and cloud bootstraps
   * derive and publish the same way. */
  const syncTariff = async (): Promise<string> => {
    const database = drizzle(client, { schema });
    const result = await runBillingPolicySyncCommand(new BillingPolicyService({ database }), database, args);
    return JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));
  };
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
        // Outside the fixture, the deployment's write key performs mutations only where it collects.
        const writeKey = process.env.STRIPE_SECRET_KEY;
        const collection = protectedKey
          ? null
          : resolveBillingCollection({
              environment,
              stripeAccountId,
              livemode: mode === 'true',
              liveCollectionEnabled: String(process.env.BILLING_LIVE_COLLECTION_ENABLED) === 'true',
              monthlyPriceId: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
              topupProductId: process.env.STRIPE_PRODUCT_ID_CREDIT_PACK,
            });
        const result = await runBillingLifecycleCommand({
          database: { database: drizzle(client, { schema }) },
          sourceStripe,
          ...(protectedKey && fixtureUrl && monthlyPriceId && topupProductId
            ? {
                protectedStripe: createBillingStripeClient({ secretKey: protectedKey, fixtureUrl }),
                fixture: { monthlyPriceId, topupProductId },
              }
            : writeKey && collection
              ? { protectedStripe: createBillingStripeClient({ secretKey: writeKey, fixtureUrl }), collection }
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
        if (
          args[1] !== '--environment' ||
          (args.length !== 3 && (args.length !== 5 || args[3] !== '--commercial-file' || !args[4]))
        ) {
          throw new Error('Usage: migrate --environment ENVIRONMENT [--commercial-file JSON_FILE]');
        }
        // Protected one-shot DDL identity on its own `max: 1` connection; API replicas never migrate.
        const migration = await runMigrationJob(databaseUrl);
        console.log(JSON.stringify(migration));
        /* The release job owns the tariff the way it owns the schema. A cloud-off deployment still
         * migrates; it just has no tariff to derive. */
        if (String(process.env.TAU_CLOUD_ENABLED) === 'true') {
          console.log(await syncTariff());
        }
        break;
      }
      case 'sync': {
        // `sync` seeds development budgets and publishes, so it needs the owner identity and the protections.
        await installBillingProtections(client);
        console.log(await syncTariff());
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
        // The same pass the API's in-process scheduler runs, metrics included: this worker is optional scale-out.
        const recovery = new BillingRecoveryScheduler(ledger, metrics, {
          environment: billingEnvironment,
          intervalMilliseconds: pollMilliseconds,
          limit,
        });
        let consecutiveFailures = 0;
        try {
          while (!shutdown.signal.aborted) {
            // oxlint-disable-next-line no-await-in-loop -- the continuous worker runs one pass at a time
            const { failed, fullBatch, batches } = await recovery.runOnce();
            for (const batch of batches) {
              (batch.outcome === 'failed' ? console.error : console.log)(JSON.stringify(batch));
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
        const readSecretKey = process.env.STRIPE_READ_SECRET_KEY;
        const writeSecretKey = process.env.STRIPE_SECRET_KEY;
        const stripeAccountId = process.env.STRIPE_ACCOUNT_ID;
        const livemode = String(process.env.STRIPE_LIVEMODE);
        if (!readSecretKey || !writeSecretKey || !stripeAccountId || (livemode !== 'true' && livemode !== 'false')) {
          throw new Error('Separate write and read Stripe keys, account and explicit mode are required');
        }
        const limit = Number(args[4]);
        const pollMilliseconds = Number(args[6]);
        const billingEnvironment = financialEnvironmentSchema.parse(environment);
        const fixtureUrl = process.env['BILLING_STRIPE_FIXTURE_URL'];
        const sourceStripe = createBillingStripeClient({ secretKey: readSecretKey, fixtureUrl });
        const stripe = createBillingStripeClient({ secretKey: writeSecretKey, fixtureUrl });
        // The same resolver as the API: this worker charges reloads and cancels subscriptions, so it
        // collects exactly when the API may, and never in a mode the API would refuse.
        const collection = resolveBillingCollection({
          environment: billingEnvironment,
          stripeAccountId,
          livemode: livemode === 'true',
          liveCollectionEnabled: String(process.env.BILLING_LIVE_COLLECTION_ENABLED) === 'true',
          monthlyPriceId: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
          topupProductId: process.env.STRIPE_PRODUCT_ID_CREDIT_PACK,
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
          stripe,
          sourceStripe,
          {
            environment: billingEnvironment,
            stripeAccountId,
            livemode: livemode === 'true',
            // Worker charges never build redirect URLs; the hosted origin belongs to the API process.
            uiOrigin: 'https://unused.invalid',
            webhookSecret: '',
            collection,
          },
          policy,
          ledger,
          cash,
          createRecoveryNoticeTransport(database),
        );
        const closures = new BillingAccountClosureService(
          database,
          {
            recoverAndCancel: async (input) =>
              recoverAndCancelStripeClosure(
                {
                  database: database.database,
                  sourceStripe,
                  protectedStripe: stripe,
                  environment: billingEnvironment,
                  stripeAccountId,
                  livemode: livemode === 'true',
                },
                input,
              ),
          },
          billingEnvironment,
        );
        const { sdk } = await import('#telemetry/otel.js');
        const sourceConfig = {
          environment: billingEnvironment,
          stripeAccountId,
          livemode: livemode === 'true',
        };
        const caseMetrics = new MetricsService();
        const journal = new BillingJournalReconciliationService(database, caseMetrics, sourceConfig);
        const cashScans = new BillingCashReconciliationService(database, sourceStripe, sourceConfig);
        const purchaseScans = new BillingPurchaseReconciliationService(database, sourceStripe, sourceConfig);
        const supplier = new BillingSupplierReconciliationService(database, sourceConfig);
        // Each scheduled job owns its failure: one provider or data fault must not stop the others.
        let passFailed = false;
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
            passFailed = true;
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
        // Due at boot: a worker restarted more often than hourly must still scan. A window whose cash scan
        // already completed costs one row read, so restarts do not repeat provider I/O.
        let lastScanAt = Number.NEGATIVE_INFINITY;
        try {
          while (!shutdown.signal.aborted) {
            const startedAt = Date.now();
            passFailed = false;
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
              passFailed = true;
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
                passFailed = true;
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
            if (payments.collectionAvailable) {
              // oxlint-disable-next-line no-await-in-loop -- one worker serializes its jobs on one DB connection
              await runJob('billing.reload_work', async () =>
                payments.processReloadWork({ environment: billingEnvironment, limit }),
              );
            }
            // oxlint-disable-next-line no-await-in-loop -- one worker serializes its jobs on one DB connection
            await runJob('billing.account_closure', async () => closures.reconcileDue({ limit }));
            // oxlint-disable-next-line no-await-in-loop -- one worker serializes its jobs on one DB connection
            await runJob('billing.reload_expiry', async () =>
              payments.expireReloadRecoveries({ environment: billingEnvironment, limit }),
            );
            // oxlint-disable-next-line no-await-in-loop -- one worker serializes its jobs on one DB connection
            await runJob('billing.renewal_recovery', async () =>
              payments.recoverRenewalOffers({ environment: billingEnvironment, limit }),
            );
            // Drains the dunning outbox `recordRenewalFailure` fills; a send failure leaves the row
            // pending with its own backoff rather than failing the pass.
            // oxlint-disable-next-line no-await-in-loop -- one worker serializes its jobs on one DB connection
            await runJob('billing.recovery_notices', async () =>
              payments.deliverRecoveryNotices({ environment: billingEnvironment, limit }),
            );
            if (Date.now() - lastScanAt >= scanIntervalMilliseconds) {
              lastScanAt = Date.now();
              // Refused calls recorded as cost-unknown before the collector kept their kind: finalized
              // at zero first, so the sweep closes their route-pausing cases instead of reopening them.
              // oxlint-disable-next-line no-await-in-loop -- one worker serializes its jobs on one DB connection
              await runJob('billing.rejected_supplier_repair', async () =>
                ledger.finalizeRejectedSupplierLiabilities({ environment: billingEnvironment, limit: 100 }),
              );
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
                // The purchase comparison is stateless per pass, so it runs even when the cash scan is done or busy.
                let cash: string;
                try {
                  if (await cashScans.isComplete(scanId)) {
                    cash = 'complete';
                  } else {
                    const scanned = await cashScans.runScan({ scanId, maximumPagesPerStream: 20 });
                    cash = scanned.status;
                  }
                } catch (error) {
                  cash = error instanceof Error ? `failed:${error.message}` : 'failed';
                }
                // A paid obligation with no grant (for example a lost success webhook) holds the customer's
                // money without credit; the per-kind gauge is what the alert watches. It reports the case
                // table, so it is recorded even when a Stripe scan fails: that is when the alert matters most.
                const recordOpenCases = async (): Promise<void> => {
                  const openCases = await client<Array<{ kind: string; open: number }>>`
                    SELECT kind, count(*)::int AS open FROM billing.billing_financial_case
                    WHERE environment = ${billingEnvironment} AND state IN ('open', 'attention')
                    GROUP BY kind`;
                  for (const kind of new Set([
                    ...cashBlockingFinancialCaseKinds,
                    ...openCases.map((row) => row.kind),
                  ])) {
                    caseMetrics.billingOpenFinancialCases.record(
                      openCases.find((row) => row.kind === kind)?.open ?? 0,
                      {
                        kind,
                      },
                    );
                  }
                  const unfulfilled =
                    openCases.find((row) => row.kind === 'unfulfilled_purchase_obligation')?.open ?? 0;
                  if (unfulfilled > 0) {
                    console.error(
                      JSON.stringify({
                        event: 'billing.alert',
                        environment,
                        kind: 'unfulfilled_purchase_obligation',
                        open: unfulfilled,
                      }),
                    );
                  }
                };
                let purchase: Awaited<ReturnType<typeof purchaseScans.runScan>>;
                try {
                  purchase = await purchaseScans.runScan({
                    scanId,
                    maximumObligations: 100,
                    maximumGrants: 100,
                    maximumSubscriptions: 100,
                  });
                } catch (error) {
                  // The gauge still records when the scan fails, but its own failure must not replace the
                  // scan's error, which is the diagnosis the operator needs.
                  await recordOpenCases().catch((gaugeError: unknown) => {
                    console.error(
                      JSON.stringify({ event: 'billing.case_gauge_failed', environment, error: String(gaugeError) }),
                    );
                  });
                  throw error;
                }
                await recordOpenCases();
                if (cash !== 'complete' && cash !== 'incomplete') {
                  throw new Error(`cash scan ${cash}; purchases ${purchase.status}`);
                }
                return { scanId, cash, purchases: purchase.status };
              });
            }
            // F-10: one count per completed pass is the heartbeat a stalled or thrashing worker stops sending.
            caseMetrics.billingWorkerPasses.add(1, {
              'tau.worker': 'operations',
              outcome: passFailed ? 'error' : 'ok',
            });
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
