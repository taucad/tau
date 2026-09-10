import 'reflect-metadata'; // oxlint-disable-line import/no-unassigned-import -- Nest decorators require metadata before service imports
import { parseArgs } from 'node:util';
import process from 'node:process';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '#database/schema.js';
import { billingBudget, billingBudgetFunding, billingOwnerBinding, user } from '#database/schema.js';
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { fulfillPaidFixture, seedPaidPurchase } from '#testing/billing-payment.fixture.js';

/**
 * Fund or close one developer billing account on the local development ledger.
 *
 * ```
 * node --import @oxc-node/core/register apps/api/app/testing/development-billing-account.ts \
 *   fund (--email <address> | --user-id <id>) [--atoms <credit atoms>]
 * node --import @oxc-node/core/register apps/api/app/testing/development-billing-account.ts \
 *   close (--email <address> | --user-id <id>)
 * node --import @oxc-node/core/register apps/api/app/testing/development-billing-account.ts budgets
 * ```
 *
 * Required env: `BILLING_ENVIRONMENT=development` and `DATABASE_URL` (`BILLING_DATABASE_URL` wins when set, so the
 * publish target's budgets step lands in the same database as the tariff). Publish the
 * development policy first with `pnpm nx run api:billing-policy:publish:development`;
 * that target also installs the billing protections this path depends on.
 *
 * `fund` grants by a paid cause through the same fixtures the billing foundation
 * suites use, never `issueCurrentPromotion`, and adds no HTTP route. `close` runs the
 * production closure so `DELETE FROM "user"` passes `billing.require_financial_closure`,
 * which those same protections install.
 *
 * `budgets` seeds the two supplier budgets every enabled policy route points at;
 * without them admission denies `budget_unavailable`. It is idempotent and runs from
 * the same publish target, so the local bootstrap stays one command.
 */
const developmentEnvironment = 'development';

/* One lifetime-funded period per budget covers local proofs; raise the cap rather than
 * adding periods or a flag. ponytail: deliberate. */
/* $10,000 in pico USD: admission holds the whole-context supplier maximum per turn (up to ~$26 for the
 * largest route) and the API allows four pending turns per account, so a $10 cap denied a quarter of the routes. */
const developmentBudgetCap = 10_000_000_000_000_000n;
const developmentBudgets = [
  { id: 'development-spend', kind: 'spend' },
  { id: 'development-risk', kind: 'risk' },
] as const;

const closureCancellation = {
  recoverAndCancel(): never {
    throw new Error('Development accounts have no subscription obligations to cancel');
  },
};

const main = async (): Promise<void> => {
  if (process.env.BILLING_ENVIRONMENT !== developmentEnvironment) {
    throw new Error('This entry point runs only against BILLING_ENVIRONMENT=development');
  }
  const databaseUrl = process.env['BILLING_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      email: { type: 'string' },
      'user-id': { type: 'string' },
      atoms: { type: 'string', default: '5000000' },
    },
  });
  const action = positionals[0];
  if (action !== 'fund' && action !== 'close' && action !== 'budgets') {
    throw new Error('Expected the action fund, close or budgets');
  }
  if (action !== 'budgets' && (values.email === undefined) === (values['user-id'] === undefined)) {
    throw new Error('Pass exactly one of --email or --user-id');
  }
  if (!/^[1-9][0-9]{0,17}$/u.test(values.atoms)) {
    throw new Error('--atoms must be a positive integer');
  }
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const database = drizzle(client, { schema });
    if (action === 'budgets') {
      await database
        .insert(billingBudgetFunding)
        .values(
          developmentBudgets.map((budget) => ({
            id: `${budget.id}-funding`,
            environment: developmentEnvironment,
            kind: budget.kind,
            scope: developmentEnvironment,
            fundedLifetime: developmentBudgetCap,
          })),
        )
        .onConflictDoNothing();
      await database
        .insert(billingBudget)
        .values(
          developmentBudgets.map((budget) => ({
            id: budget.id,
            environment: developmentEnvironment,
            fundingId: `${budget.id}-funding`,
            kind: budget.kind,
            scope: developmentEnvironment,
            periodStart: new Date('2020-01-01Z'),
            periodEnd: new Date('2030-01-01Z'),
            quantum: 'pico_usd',
            approvedCap: developmentBudgetCap,
          })),
        )
        .onConflictDoNothing();
      console.log(JSON.stringify({ budgets: developmentBudgets.map((budget) => budget.id) }));
      return;
    }
    const authUserId =
      values['user-id'] ??
      (await database
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, values.email!))
        .then(([row]) => row?.id));
    if (authUserId === undefined) {
      throw new Error(`No auth user for ${values.email ?? 'the requested id'}`);
    }
    if (action === 'close') {
      const [retained] = await database
        .select({ id: billingOwnerBinding.id })
        .from(billingOwnerBinding)
        .where(
          and(
            eq(billingOwnerBinding.environment, developmentEnvironment),
            eq(billingOwnerBinding.authUserId, authUserId),
            isNull(billingOwnerBinding.revokedAt),
          ),
        );
      if (!retained) {
        console.log(JSON.stringify({ authUserId, closed: false }));
        return;
      }
      const closure = await new BillingAccountClosureService(
        { database },
        closureCancellation,
        developmentEnvironment,
      ).prepare({ authUserId, requestId: `development-teardown:${authUserId}` });
      console.log(JSON.stringify({ authUserId, closed: true, closureId: closure.closureId, state: closure.state }));
      return;
    }
    const atoms = BigInt(values.atoms);
    const ledger = new CreditLedgerService({ database }, new BillingPolicyService({ database }));
    const accountId = await ledger.ensureAccountBinding({ environment: developmentEnvironment, authUserId });
    const { purchaseId } = await seedPaidPurchase({
      database,
      accountId,
      environment: developmentEnvironment,
      atoms,
    });
    const receipt = await fulfillPaidFixture({
      database,
      ledger,
      accountId,
      causeId: purchaseId,
      source: 'purchased',
    });
    console.log(
      JSON.stringify({
        authUserId,
        accountId,
        purchaseId,
        receiptId: receipt.receiptId,
        grantedAtoms: receipt.grantedAtoms.toString(),
      }),
    );
  } finally {
    await client.end();
  }
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Development billing account command failed');
  process.exitCode = 1;
}
