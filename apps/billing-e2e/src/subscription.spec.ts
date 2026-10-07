import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { wirePaymentActionSchema } from '@taucad/billing';
import type { WirePaymentAction } from '@taucad/billing';
import { closeAccount, createAccount } from '#support/account.js';
import type { Account } from '#support/account.js';
import { failure, ok } from '#support/api.js';
import type { ApiResponse } from '#support/api.js';
import { checkoutSession } from '#support/checkout.js';
import { matrixRow } from '#support/results.js';

describe('Pro subscription', () => {
  let account: Account;
  let pending: WirePaymentAction | undefined;

  // Closing the account cancels the pending Pro action, which expires its Checkout session.
  beforeAll(async () => {
    account = await createAccount('pr');
    return async () => closeAccount(account);
  });

  const subscribe = async (): Promise<ApiResponse> =>
    account.api.request('POST', '/v1/billing/payment-actions/subscription', {
      body: { requestId: randomUUID(), returnPath: '/?settings=billing' },
    });

  it(
    'should open Pro Checkout for US$20 a month with 2,000 credits [PR-01 P0]',
    matrixRow('PR-01', 'P0', async () => {
      pending = ok(await subscribe(), wirePaymentActionSchema);
      expect(pending).toMatchObject({
        purpose: 'subscription_checkout',
        state: 'redirect_required',
        frozen: { principalMinor: '2000', creditAtoms: '20000000' },
      });
      expect(new URL(pending.redirectUrl ?? '').hostname).toBe('checkout.stripe.com');
      // The harness does not pay the Pro Checkout (H-04). Since #376 a paid one settles its first invoice through
      // the leg sweep, so paying from here is what the row needs next, not the webhook.
      return {
        outcome: 'blocked',
        defect: 'H-04',
        evidence: [
          `action ${pending.actionId} redirect_required at ${checkoutSession(pending.redirectUrl ?? '')}`,
          'frozen 2000 minor a month, 20000000 atoms; not paid: the harness does not pay the Pro Checkout (H-04)',
        ],
      };
    }),
  );

  it(
    'should refuse a second subscription [PR-02 P0]',
    matrixRow('PR-02', 'P0', async () => {
      const first = pending;
      if (first === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['PR-01 left no pending Pro action to collide with'] };
      }
      const second = await subscribe();
      const refusal = failure(second);
      expect(second.status).toBe(409);
      if (refusal.code === 'subscription_already_exists') {
        return { outcome: 'pass', evidence: ['409 subscription_already_exists'] };
      }
      expect(refusal.code).toBe('action_already_pending');
      expect(refusal.action?.actionId).toBe(first.actionId);
      return {
        outcome: 'blocked',
        defect: 'H-04',
        evidence: [
          `409 action_already_pending carrying the pending Pro action ${first.actionId}`,
          'subscription_already_exists needs an active subscription, so a paid PR-01 (H-04)',
        ],
      };
    }),
  );
});
