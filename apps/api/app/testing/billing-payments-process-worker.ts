import { BillingCashService } from '#api/billing/billing-cash.service.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';

type Command =
  | { readonly stripeUrl: string; readonly operation: 'recover'; readonly limit: number }
  | { readonly stripeUrl: string; readonly operation: 'reload'; readonly limit: number }
  | {
      readonly stripeUrl: string;
      readonly operation: 'confirm' | 'recover-action';
      readonly userId: string;
      readonly actionId: string;
    };

const send = (state: string, detail?: unknown): void => {
  process.send?.({ state, detail });
};
const command = await new Promise<Command>((resolve) => {
  process.once('message', (value: unknown) => {
    if (
      value === null ||
      typeof value !== 'object' ||
      !('stripeUrl' in value) ||
      typeof value.stripeUrl !== 'string' ||
      !value.stripeUrl.startsWith('http://127.0.0.1:') ||
      !('operation' in value) ||
      !['recover', 'reload', 'confirm', 'recover-action'].includes(String(value.operation))
    ) {
      throw new Error('Invalid payment process command');
    }
    if (
      (value.operation === 'recover' || value.operation === 'reload') &&
      'limit' in value &&
      typeof value.limit === 'number' &&
      Number.isSafeInteger(value.limit) &&
      value.limit >= 1 &&
      value.limit <= 100
    ) {
      resolve({ stripeUrl: value.stripeUrl, operation: value.operation, limit: value.limit });
      return;
    }
    if (
      (value.operation === 'confirm' || value.operation === 'recover-action') &&
      'userId' in value &&
      typeof value.userId === 'string' &&
      'actionId' in value &&
      typeof value.actionId === 'string'
    ) {
      resolve({
        stripeUrl: value.stripeUrl,
        operation: value.operation,
        userId: value.userId,
        actionId: value.actionId,
      });
      return;
    }
    throw new Error('Invalid payment process operation arguments');
  });
});
// oxlint-disable-next-line typescript/dot-notation -- test-only key is outside the application's parsed environment shape.
const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
// oxlint-disable-next-line typescript/dot-notation -- launcher ownership marker is intentionally test-only.
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use the isolated billing launcher');
}
const client = postgres(databaseUrl, { max: 1, prepare: false, connection: { role: 'tau_billing_runtime' } });
const database = drizzle(client, { schema });
const policy = new BillingPolicyService({ database });
const ledger = new CreditLedgerService({ database }, policy);
const stripe = createBillingStripeClient({ secretKey: 'sk_test_process', fixtureUrl: command.stripeUrl });
const service = new BillingPaymentsService(
  { database },
  stripe,
  stripe,
  {
    environment: 'development',
    stripeAccountId: 'acct_fixture',
    livemode: false,
    uiOrigin: 'http://127.0.0.1:3000',
    webhookSecret: 'whsec_process',
    collection: { kind: 'local_fixture', monthlyPriceId: 'price_monthly', topupProductId: 'prod_topup' },
  },
  policy,
  ledger,
  new BillingCashService({ database }, stripe, stripe, ledger, {
    environment: 'development',
    stripeAccountId: 'acct_fixture',
    livemode: false,
  }),
);
send('ready');
try {
  const result =
    command.operation === 'reload'
      ? await service.processReloadWork({ environment: 'development', limit: command.limit })
      : command.operation === 'recover'
        ? await service.recoverPayments({ environment: 'development', limit: command.limit })
        : command.operation === 'confirm'
          ? await service.confirmAction(command.userId, command.actionId)
          : await service.recoverAction(command.userId, command.actionId);
  send('complete', result);
} catch (error) {
  send('failed', error instanceof Error ? error.message : String(error));
} finally {
  await client.end();
}
