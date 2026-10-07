import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { wireAccountClosureSchema, wirePaymentActionSchema } from '@taucad/billing';
import { closeAccount, createAccount } from '#support/account.js';
import type { Account } from '#support/account.js';
import { baseUrl, ok } from '#support/api.js';
import { screenshot, withBrowser } from '#support/checkout.js';
import { deleteMailbox } from '#support/mailbox.js';
import { matrixRow } from '#support/results.js';

describe('account closure', () => {
  let account: Account;
  let isDeleted = false;

  beforeAll(async () => {
    account = await createAccount('ac01');
    return async () => {
      // The row deletes the user itself; its inbox is then the only thing left to clean.
      await (isDeleted ? deleteMailbox(account.mailbox).catch(() => undefined) : closeAccount(account));
    };
  });

  it(
    'should close a free account from Settings and refuse sign-in afterwards [AC-01 P0]',
    matrixRow('AC-01', 'P0', async () => {
      // Settings offers closure once a billing account exists, which the first payment action creates.
      const prepared = ok(
        await account.api.request('POST', '/v1/billing/payment-actions/topup', {
          body: { requestId: randomUUID(), amountMinor: '500', method: 'checkout', returnPath: '/?settings=billing' },
        }),
        wirePaymentActionSchema,
      );
      ok(
        await account.api.request('POST', `/v1/billing/payment-actions/${prepared.actionId}/cancel`),
        wirePaymentActionSchema,
      );
      const evidence = await withBrowser(account, async ({ page }) => {
        await page.goto(`${baseUrl}/?settings=billing`);
        await page.getByLabel('I understand and want to close this account.').check();
        const preparing = page.waitForResponse(
          (response) =>
            response.url().endsWith('/v1/billing/account-closure') && response.request().method() === 'POST',
        );
        await page.getByRole('button', { name: 'Prepare account closure' }).click();
        const prepareResponse = await preparing;
        const closure = wireAccountClosureSchema.parse(await prepareResponse.json());
        await page.getByText('Closure status: ready for auth deletion').waitFor();
        const deleting = page.waitForResponse((response) => response.url().endsWith('/v1/auth/delete-user'));
        await page.getByRole('button', { name: 'Delete my account' }).click();
        const deletion = await deleting;
        isDeleted = deletion.ok();
        return [
          `closure ${closure.closureId} ${closure.state}`,
          `delete-user ${deletion.status()} (${deletion.headers()['request-id'] ?? 'no request id'})`,
          await screenshot(page, 'ac-01-deleted'),
        ];
      });
      const session = await account.api.request('GET', '/v1/auth/get-session');
      const signIn = await account.api.request('POST', '/v1/auth/sign-in/email', {
        body: { email: account.email, password: account.password },
      });
      expect(isDeleted).toBe(true);
      expect(session.body).toBeNull();
      expect(signIn.status).toBe(401);
      return {
        outcome: 'pass',
        evidence: [
          ...evidence,
          `get-session afterwards ${JSON.stringify(session.body)}, sign-in afterwards ${signIn.status}`,
          'balance was 0: this row closes an account that never topped up',
        ],
      };
    }),
  );
});
