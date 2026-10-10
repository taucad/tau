import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { wireAccountClosureSchema, wirePaymentActionSchema } from '@taucad/billing';
import type { WirePaymentAction } from '@taucad/billing';
import { closeAccount, createAccount } from '#support/account.js';
import type { Account } from '#support/account.js';
import { baseUrl, failure, ok, refusalCode } from '#support/api.js';
import { screenshot, visibleText, withBrowser } from '#support/checkout.js';
import { callGateway, describeCall } from '#support/gateway.js';
import { deleteMailbox } from '#support/mailbox.js';
import { billingSettings } from '#support/pages.js';
import { matrixRow } from '#support/results.js';

const billingReturnPath = '/?settings=billing';

describe('account closure', () => {
  let account: Account;
  let pending: WirePaymentAction | undefined;
  let isDeleted = false;

  beforeAll(async () => {
    account = await createAccount('ac04');
    return async () => {
      // AC-03 deletes the user itself; its inbox is then the only thing left to clean.
      await (isDeleted ? deleteMailbox(account.mailbox).catch(() => undefined) : closeAccount(account));
    };
  });

  const prepareClosure = async () =>
    account.api.request('POST', '/v1/billing/account-closure', { body: { requestId: randomUUID() } });

  it(
    'should refuse to close an account while a payment is pending, naming the payment [AC-04 P0]',
    matrixRow('AC-04', 'P0', async (evidence) => {
      const prepared = ok(
        await account.api.request('POST', '/v1/billing/payment-actions/topup', {
          body: { requestId: randomUUID(), amountMinor: '500', method: 'checkout', returnPath: billingReturnPath },
        }),
        wirePaymentActionSchema,
      );
      pending = ok(
        await account.api.request('POST', `/v1/billing/payment-actions/${prepared.actionId}/confirm`),
        wirePaymentActionSchema,
      );
      const refused = await prepareClosure();
      const refusal = failure(refused);
      evidence.push(`closure with ${pending.actionId} ${pending.state}: ${refused.status} ${refusal.code}`);
      // The same refusal in Settings: the notice names what to finish and opens the dialog that can.
      const shown = await withBrowser(account, async ({ page }) => {
        const settings = billingSettings(page);
        await settings.open();
        await settings.closure.confirm();
        await settings.closure.prepare().click();
        const notice = page.getByRole('alert', { name: 'Account closure notice' });
        await notice.waitFor();
        return [`notice "${await visibleText(notice)}"`, await screenshot(page, 'ac-04-pending')];
      });
      evidence.push(...shown);
      const canceled = ok(
        await account.api.request('POST', `/v1/billing/payment-actions/${pending.actionId}/cancel`),
        wirePaymentActionSchema,
      );
      evidence.push(`pending action canceled → ${canceled.state}`);
      expect(refused.status).toBe(409);
      expect(refusal.code).toBe('payment_action_pending');
      expect(refusal.action?.actionId).toBe(pending.actionId);
      expect(shown[0]).toContain('Finish or cancel your pending payment first.');
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should refuse purchases and model calls once closure starts [AC-03 P1]',
    matrixRow('AC-03', 'P1', async (evidence) => {
      const closure = ok(await prepareClosure(), wireAccountClosureSchema);
      const topup = await account.api.request('POST', '/v1/billing/payment-actions/topup', {
        body: { requestId: randomUUID(), amountMinor: '500', method: 'checkout', returnPath: billingReturnPath },
      });
      const credits = await account.api.request('GET', '/v1/billing/credits');
      const model = await callGateway(account.api, 'luna');
      const lookup = await account.api.request('GET', `/v1/billing/attempts/gateway/${randomUUID()}`, {
        origin: baseUrl,
      });
      evidence.push(
        `closure ${closure.closureId} ${closure.state}`,
        `top-up prepare ${topup.status} ${refusalCode(topup)}`,
        `credits read ${credits.status} ${credits.status === 200 ? 'answered' : refusalCode(credits)}`,
        `model call ${describeCall(model)}`,
        `attempt lookup ${lookup.status} ${refusalCode(lookup)}`,
      );
      const deletion = await account.api.request('POST', '/v1/auth/delete-user', { body: {} });
      isDeleted = deletion.status === 200;
      evidence.push(`delete-user ${deletion.status}`);
      expect(closure.state).toBe('ready_for_auth_deletion');
      expect([topup.status, refusalCode(topup)]).toEqual([403, 'billing_account_closed']);
      expect([model.status, model.refusal?.error.type]).toEqual([403, 'BILLING_ACCOUNT_CLOSED']);
      expect([lookup.status, refusalCode(lookup)]).toEqual([403, 'BILLING_ACCOUNT_CLOSED']);
      expect(isDeleted).toBe(true);
      return { outcome: 'pass', evidence };
    }),
  );
});
