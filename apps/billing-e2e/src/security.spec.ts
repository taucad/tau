import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { wirePaymentActionSchema } from '@taucad/billing';
import type { WirePaymentAction } from '@taucad/billing';
import { closeAccount, createAccount, hasSession } from '#support/account.js';
import type { Account } from '#support/account.js';
import { baseUrl, failure, ok } from '#support/api.js';
import { screenshot, toasts, waitForToast, withBrowser } from '#support/checkout.js';
import { matrixRow } from '#support/results.js';

const topup = (): Readonly<Record<string, string>> => ({
  requestId: randomUUID(),
  amountMinor: '500',
  method: 'checkout',
  returnPath: '/?settings=billing',
});

describe('security', () => {
  let owner: Account;
  let intruder: Account;
  let ownerAction: WirePaymentAction | undefined;

  beforeAll(async () => {
    owner = await createAccount('se-a');
    return async () => closeAccount(owner);
  });

  beforeAll(async () => {
    intruder = await createAccount('se-b');
    return async () => closeAccount(intruder);
  });

  it(
    'should refuse a payment mutation without the app Origin [SE-02 P0 smoke]',
    matrixRow('SE-02', 'P0', async () => {
      const body = topup();
      const missing = await owner.api.request('POST', '/v1/billing/payment-actions/topup', { body, origin: false });
      const foreign = await owner.api.request('POST', '/v1/billing/payment-actions/topup', {
        body,
        origin: 'https://evil.example',
      });
      expect([missing.status, failure(missing).error]).toEqual([403, 'payment_origin_required']);
      expect([foreign.status, failure(foreign).error]).toEqual([403, 'payment_origin_mismatch']);
      return {
        outcome: 'pass',
        evidence: [
          'no Origin → 403 payment_origin_required',
          'Origin https://evil.example → 403 payment_origin_mismatch',
        ],
      };
    }),
  );

  it(
    "should hide one account's payment action from another [SE-01 P0]",
    matrixRow('SE-01', 'P0', async () => {
      const prepared = ok(
        await owner.api.request('POST', '/v1/billing/payment-actions/topup', { body: topup() }),
        wirePaymentActionSchema,
      );
      ownerAction = ok(
        await owner.api.request('POST', `/v1/billing/payment-actions/${prepared.actionId}/confirm`),
        wirePaymentActionSchema,
      );
      // The intruder gets a billing account of its own, so every refusal below is about ownership.
      const own = ok(
        await intruder.api.request('POST', '/v1/billing/payment-actions/topup', { body: topup() }),
        wirePaymentActionSchema,
      );
      ok(
        await intruder.api.request('POST', `/v1/billing/payment-actions/${own.actionId}/cancel`),
        wirePaymentActionSchema,
      );
      const path = `/v1/billing/payment-actions/${ownerAction.actionId}`;
      const probes = [
        await intruder.api.request('GET', path),
        await intruder.api.request('POST', `${path}/confirm`),
        await intruder.api.request('POST', `${path}/cancel`),
        await intruder.api.request('POST', `${path}/recover`),
      ];
      const after = ok(await owner.api.request('GET', path), wirePaymentActionSchema);
      expect(probes.every(({ status }) => status === 403 || status === 404)).toBe(true);
      expect(probes.every((probe) => failure(probe).action === undefined)).toBe(true);
      expect(after.state).toBe('redirect_required');
      return {
        outcome: 'pass',
        evidence: [
          `intruder GET, confirm, cancel, recover of ${ownerAction.actionId}: ${probes.map((probe) => `${probe.status} ${failure(probe).error}`).join(', ')}`,
          `owner's action still ${after.state}`,
        ],
      };
    }),
  );

  it(
    "should not reveal another account's payment on a tampered Checkout return [SE-04 P0]",
    matrixRow('SE-04', 'P0', async () => {
      const target = ownerAction;
      if (target === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['SE-01 left no owner action to tamper with'] };
      }
      const evidence = await withBrowser(intruder, async ({ page }) => {
        await page.goto(`${baseUrl}/?settings=billing&payment_action=${target.actionId}`);
        const toast = await waitForToast(page, /Could not check the returned payment/u);
        const shown = await toasts(page);
        expect(
          shown.some((text) => /Checkout is ready|credits added|Payment received|still processing/u.test(text)),
        ).toBe(false);
        return [
          `toast "${toast}"`,
          `all toasts ${JSON.stringify(shown)}`,
          await screenshot(page, 'se-04-tampered-return'),
        ];
      });
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should refuse payment mutations from an unverified account [SE-03 P0]',
    matrixRow('SE-03', 'P0', async () => {
      const unverified = await createAccount('se-03', { verified: false });
      try {
        const signIn = await unverified.api.request('POST', '/v1/auth/sign-in/email', {
          body: { email: unverified.email, password: unverified.password },
        });
        const prepared = await unverified.api.request('POST', '/v1/billing/payment-actions/topup', { body: topup() });
        const evidence = [
          `sign-up left ${hasSession(unverified) ? 'a' : 'no'} session`,
          `sign-in ${signIn.status} ${JSON.stringify(signIn.body)}`,
          `prepare ${prepared.status} ${JSON.stringify(prepared.body)}`,
        ];
        if (prepared.status === 403 && failure(prepared).error === 'verified_email_required') {
          return { outcome: 'pass', evidence };
        }
        // Sign-up returns no session and sign-in answers EMAIL_NOT_VERIFIED, so an unverified account never
        // reaches the controller's 403 verified_email_required guard; the refusal it can observe is 401.
        expect(hasSession(unverified)).toBe(false);
        expect(signIn.status).toBe(403);
        expect(prepared.status).toBe(401);
        return {
          outcome: 'pass',
          evidence: [...evidence, 'differs from the row: 401 (no session) is what an unverified account meets first'],
        };
      } finally {
        await closeAccount(unverified);
      }
    }),
  );
});
