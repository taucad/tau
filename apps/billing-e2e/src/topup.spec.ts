import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { formatCreditAtoms, wireBalanceExplanationSchema, wirePaymentActionSchema } from '@taucad/billing';
import type { WirePaymentAction } from '@taucad/billing';
import { closeAccount, createAccount } from '#support/account.js';
import type { Account } from '#support/account.js';
import { baseUrl, failure, ok } from '#support/api.js';
import type { ApiResponse } from '#support/api.js';
import {
  checkoutSession,
  openBrowser,
  payWithTestCard,
  screenshot,
  toasts,
  waitForToast,
  withBrowser,
} from '#support/checkout.js';
import type { Browsing, Page } from '#support/checkout.js';
import { matrixRow } from '#support/results.js';
import type { Verdict } from '#support/results.js';

const returnPath = '/?settings=billing';
/** States a just-paid action passes through before the grant lands: the UI's own set (root-billing.cloud.tsx). */
const settlingStates = new Set<string>(['redirect_required', 'processing', 'funds_received']);
/** The return page re-checks a settling action 10 × 2 s (root-billing.cloud.tsx); a later grant is never announced. */
const uiRecheckSeconds = 20;

/** Settings → Billing → Add credits → amount → Review: the prepared quote and its request id. */
const reviewTopup = async (
  page: Page,
  dollars?: string,
): Promise<{ readonly action: WirePaymentAction; readonly requestId: string }> => {
  await page.goto(`${baseUrl}${returnPath}`);
  await page.getByRole('button', { name: 'Add credits' }).first().click();
  if (dollars !== undefined) {
    await page.getByRole('button', { name: 'Other', exact: true }).click();
    await page.getByLabel('Custom amount').fill(dollars);
  }
  const prepared = page.waitForResponse((response) => response.url().endsWith('/v1/billing/payment-actions/topup'));
  await page.getByRole('button', { name: /^Review .+ purchase$/u }).click();
  const response = await prepared;
  return {
    action: wirePaymentActionSchema.parse(await response.json()),
    requestId: response.headers()['request-id'] ?? 'no request id',
  };
};

describe('top-up in the browser', () => {
  let account: Account;
  let browsing: Browsing;
  let quoted: WirePaymentAction | undefined;

  beforeAll(async () => {
    account = await createAccount('tu07');
    return async () => closeAccount(account);
  });

  beforeAll(async () => {
    browsing = await openBrowser(account);
    return async () => browsing.browser.close();
  });

  it(
    'should quote the US$25 default with tax and total left to Checkout [TU-02 P0]',
    matrixRow('TU-02', 'P0', async () => {
      const { page } = browsing;
      const { action, requestId } = await reviewTopup(page);
      quoted = action;
      const dialog = page.getByRole('dialog');
      await dialog.getByText('Calculated in secure Checkout before payment').waitFor();
      const credits = await dialog
        .locator('div')
        .filter({ has: page.getByText('Credits', { exact: true }) })
        .locator('dd')
        .first()
        .textContent();
      expect(action.state).toBe('prepared');
      expect(action.frozen).toMatchObject({ principalMinor: '2500', creditAtoms: '25000000', taxMinor: null });
      // The program row reads "2,500"; formatCreditAtoms prints whole credits without grouping.
      expect(credits).toBe('2500');
      return {
        outcome: 'pass',
        evidence: [
          `action ${action.actionId} prepared (${requestId}): 2500 minor, 25000000 atoms, tax left to Checkout`,
          `quote shows Credits ${credits ?? ''}`,
          await screenshot(page, 'tu-02-quote'),
        ],
      };
    }),
  );

  it(
    'should come back from Checkout with a resumable action and cancel it [TU-07 P0]',
    matrixRow('TU-07', 'P0', async () => {
      const quote = quoted;
      if (quote === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['TU-02 left no quote to return from Checkout with'] };
      }
      const { page } = browsing;
      await page.getByRole('button', { name: 'Continue to secure Checkout' }).click();
      await page.waitForURL(/checkout\.stripe\.com/u);
      const session = checkoutSession(page.url());
      // Stripe's Back link is the session's cancel_url, which carries payment_action.
      await page.locator('a[href*="payment_action="]').first().click();
      await page.waitForURL((url) => url.origin === baseUrl);
      const toast = await waitForToast(page, /Checkout is ready to continue/u);
      const shot = await screenshot(page, 'tu-07-return');
      const path = `/v1/billing/payment-actions/${quote.actionId}`;
      const returned = ok(await account.api.request('GET', path), wirePaymentActionSchema);
      const canceled = ok(await account.api.request('POST', `${path}/cancel`), wirePaymentActionSchema);
      expect(toast).toContain('Resume Checkout');
      expect(returned.state).toBe('redirect_required');
      expect(canceled.state).toBe('canceled');
      return {
        outcome: 'pass',
        evidence: [
          session,
          `toast "${toast}"`,
          shot,
          `action ${quote.actionId} redirect_required after Back; cancel → canceled (Checkout session expired)`,
        ],
      };
    }),
  );
});

describe('paid top-up', () => {
  let account: Account;
  let paid: { readonly actionId: string; readonly state: WirePaymentAction['state'] } | undefined;
  /** Set only when TU-01's Pay click never submitted (H-01); any other unfinished TU-01 leaves `paid` unset. */
  let unsubmitted = false;

  beforeAll(async () => {
    account = await createAccount('tu01');
    return async () => closeAccount(account);
  });

  it(
    'should add 500 credits after a US$5 hosted Checkout payment [TU-01 P0]',
    matrixRow('TU-01', 'P0', async (evidence) =>
      withBrowser(account, async ({ page }): Promise<Verdict> => {
        const { action } = await reviewTopup(page, '5');
        await page.getByRole('button', { name: 'Continue to secure Checkout' }).click();
        const payment = await payWithTestCard(page, account.email);
        if (!payment.isPaid) {
          unsubmitted = true;
          return {
            outcome: 'blocked',
            defect: 'H-01',
            evidence: [
              `${payment.sessionId} filled; Pay never submitted (click, Enter, Enter in CVC)`,
              `trace ${payment.trace ?? 'none'}`,
              await screenshot(page, 'tu-01-checkout-stuck'),
            ],
          };
        }
        // From here the row gathers into matrixRow's list, so a throw during the poll or the reads below still
        // leaves the paid session and everything seen since in the record.
        evidence.push(`${payment.sessionId} paid with 4242`);
        // Poll the action every 2 s until it leaves the settling states or 60 s pass: a slow but healthy webhook
        // then shows as its settle time instead of being misread as F-01.
        const returned = Date.now();
        const readAction = async (): Promise<WirePaymentAction> =>
          ok(
            await account.api.request('GET', `/v1/billing/payment-actions/${action.actionId}`),
            wirePaymentActionSchema,
          );
        let settled = await readAction();
        while (settlingStates.has(settled.state) && Date.now() - returned < 60_000) {
          // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of one action
          await delay(2000);
          // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of one action
          settled = await readAction();
        }
        const settleSeconds = Math.round((Date.now() - returned) / 1000);
        // The page announces its first read, which can beat the webhook ("Checkout is ready to continue."), and
        // re-checks for only uiRecheckSeconds; the credits toast is the verdict only when the page could still have
        // seen the grant. Every toast shown stays in the evidence either way.
        const announceable = settled.state === 'fulfilled' && settleSeconds <= uiRecheckSeconds;
        const creditsToast = announceable
          ? await waitForToast(page, /credits added/u, 10_000).catch(() => undefined)
          : undefined;
        const credits = ok(await account.api.request('GET', '/v1/billing/credits'), wireBalanceExplanationSchema);
        paid = { actionId: action.actionId, state: settled.state };
        evidence.push(
          `action ${action.actionId} ${settled.state}${
            settled.attention === null ? '' : ` ${JSON.stringify(settled.attention)}`
          } ${settleSeconds} s after return`,
          `toasts ${JSON.stringify(await toasts(page))}`,
          ...(settled.state === 'fulfilled' && !announceable
            ? [`granted after the page's ${uiRecheckSeconds} s re-check: no credits toast expected`]
            : []),
          `available ${credits.balance?.eligibleAvailableCreditAtoms ?? 'unavailable'} atoms`,
          await screenshot(page, 'tu-01-return'),
        );
        // The row evaluated the payment, so these fail the run (recordRow holds `blocked` to the H-nn rows).
        if (settled.state === 'redirect_required') {
          // Nothing accepted the payment in 60 s: no webhook, and no sweep settled the session.
          return { outcome: 'fail', defect: 'F-01', evidence };
        }
        if (settlingStates.has(settled.state)) {
          // The payment was accepted (processing, or funds received) but the grant did not follow in 60 s.
          return { outcome: 'fail', defect: 'F-24', evidence };
        }
        expect(settled.state).toBe('fulfilled');
        expect(settled.receipt?.grantedCreditAtoms).toBe('5000000');
        expect(credits.balance?.eligibleAvailableCreditAtoms).toBe('5000000');
        if (announceable) {
          // The exact sentence the page builds from the receipt, so a wrong amount cannot pass as a substring.
          expect(creditsToast).toBe(`${formatCreditAtoms(5_000_000n)} credits added.`);
        }
        return { outcome: 'pass', evidence };
      }),
    ),
  );

  it(
    'should let the customer recover a paid Checkout the webhook has not settled [TU-08 P0]',
    matrixRow('TU-08', 'P0', async () => {
      if (unsubmitted) {
        return { outcome: 'blocked', defect: 'H-01', evidence: ['no paid action: the TU-01 payment did not submit'] };
      }
      if (paid === undefined) {
        return {
          outcome: 'blocked',
          defect: 'H-03',
          evidence: ['TU-01 did not finish, so there is no paid action to recover'],
        };
      }
      if (paid.state === 'fulfilled') {
        return {
          outcome: 'skipped',
          evidence: ['the webhook settled TU-01 at once; a late webhook needs the worker paused (WH-05)'],
        };
      }
      const path = `/v1/billing/payment-actions/${paid.actionId}`;
      const recovered = await account.api.request('POST', `${path}/recover`);
      if (recovered.status === 200) {
        const action = wirePaymentActionSchema.parse(recovered.body);
        expect(['processing', 'funds_received', 'fulfilled']).toContain(action.state);
        return { outcome: 'pass', evidence: [`paid action ${paid.actionId}: recover → ${action.state}`] };
      }
      const canceled = await account.api.request('POST', `${path}/cancel`);
      return {
        outcome: 'fail',
        defect: 'F-02',
        evidence: [
          `paid action ${paid.actionId}: recover ${recovered.status} ${failure(recovered).code}, cancel ${canceled.status} ${
            canceled.status === 200 ? 'canceled' : failure(canceled).code
          }`,
          'the refused recover of a paid Checkout is F-02 (WP-4); its credits then arrive only by webhook',
        ],
      };
    }),
  );
});

describe('top-up through the API', () => {
  let account: Account;
  let first: WirePaymentAction;
  const requestId = randomUUID();

  beforeAll(async () => {
    account = await createAccount('tu');
    return async () => closeAccount(account);
  });

  const prepare = async (id: string, amountMinor: string): Promise<ApiResponse> =>
    account.api.request('POST', '/v1/billing/payment-actions/topup', {
      body: { requestId: id, amountMinor, method: 'checkout', returnPath },
    });
  const confirm = async (actionId: string): Promise<ApiResponse> =>
    account.api.request('POST', `/v1/billing/payment-actions/${actionId}/confirm`);

  it(
    'should answer a repeated prepare and confirm with one action and one Checkout session [TU-09 P0 smoke]',
    matrixRow('TU-09', 'P0', async () => {
      first = ok(await prepare(requestId, '500'), wirePaymentActionSchema);
      const replayed = ok(await prepare(requestId, '500'), wirePaymentActionSchema);
      const confirmed = ok(await confirm(first.actionId), wirePaymentActionSchema);
      const reconfirmed = ok(await confirm(first.actionId), wirePaymentActionSchema);
      expect(first).toMatchObject({ state: 'prepared', frozen: { principalMinor: '500', creditAtoms: '5000000' } });
      expect(replayed.actionId).toBe(first.actionId);
      expect(confirmed.state).toBe('redirect_required');
      expect(reconfirmed.redirectUrl).toBe(confirmed.redirectUrl);
      return {
        outcome: 'pass',
        evidence: [
          `one requestId prepared twice → action ${first.actionId} both times`,
          `confirm twice → ${reconfirmed.state}, one ${checkoutSession(confirmed.redirectUrl ?? '')}`,
        ],
      };
    }),
  );

  it(
    'should refuse a second purchase while one is pending and return the pending one [TU-10 P0]',
    matrixRow('TU-10', 'P0', async () => {
      const second = await prepare(randomUUID(), '500');
      const refusal = failure(second);
      expect(second.status).toBe(409);
      expect(refusal.code).toBe('action_already_pending');
      expect(refusal.action?.actionId).toBe(first.actionId);
      return {
        outcome: 'pass',
        evidence: [`409 action_already_pending carrying ${first.actionId} (${refusal.action?.state ?? 'no state'})`],
      };
    }),
  );

  it(
    'should refuse a changed amount under a used requestId [TU-13 P1]',
    matrixRow('TU-13', 'P1', async () => {
      const changed = await prepare(requestId, '600');
      expect(changed.status).toBe(409);
      expect(failure(changed).code).toBe('request_payload_conflict');
      return { outcome: 'pass', evidence: ['same requestId with 600 minor → 409 request_payload_conflict'] };
    }),
  );

  it(
    'should refuse amounts outside US$5 to US$5,000 and fractional cents [TU-11 P1]',
    matrixRow('TU-11', 'P1', async () => {
      const amounts = ['499', '500001', '500.5'];
      const answers = await Promise.all(amounts.map(async (amountMinor) => prepare(randomUUID(), amountMinor)));
      const messages = answers.map((answer) => `${answer.status} ${(failure(answer).message ?? []).join(' ')}`);
      expect(answers.map(({ status }) => status)).toEqual([400, 400, 400]);
      expect(messages[0]).toContain('Top-up amount is outside the supported range');
      expect(messages[1]).toContain('Top-up amount is outside the supported range');
      return {
        outcome: 'pass',
        evidence: amounts.map((amount, index) => `${amount} minor → ${messages[index] ?? ''}`),
      };
    }),
  );
});
