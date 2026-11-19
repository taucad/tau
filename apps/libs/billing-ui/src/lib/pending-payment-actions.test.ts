import { beforeEach, describe, expect, it } from 'vitest';
import { purgePendingPaymentActions } from '#lib/pending-payment-actions-purge.js';
import {
  forgetPendingPaymentAction,
  pendingPaymentActionLifetimeMilliseconds,
  pendingPaymentActions,
  rememberPendingPaymentAction,
} from '#lib/pending-payment-actions.js';

/* Adaptive app deployment mode D14: a desktop's opened payments, per identity, for a day, cleared by the purge. */
describe('pending payment actions', () => {
  const alice = { environment: 'staging', ownerId: 'alice' };
  const bob = { environment: 'staging', ownerId: 'bob' };

  beforeEach(() => {
    localStorage.clear();
  });

  it('should keep an action per identity across a reload, and forget it once announced', () => {
    rememberPendingPaymentAction({ actionId: 'pa_1', ...alice, openedAt: 1000 });
    rememberPendingPaymentAction({ actionId: 'pa_2', ...bob, openedAt: 1000 });
    expect(pendingPaymentActions(alice, 2000)).toEqual(['pa_1']);
    forgetPendingPaymentAction('pa_1');
    expect(pendingPaymentActions(alice, 2000)).toEqual([]);
    expect(pendingPaymentActions(bob, 2000)).toEqual(['pa_2']);
  });

  it('should expire an action after 24 hours', () => {
    rememberPendingPaymentAction({ actionId: 'pa_1', ...alice, openedAt: 0 });
    expect(pendingPaymentActions(alice, pendingPaymentActionLifetimeMilliseconds - 1)).toEqual(['pa_1']);
    expect(pendingPaymentActions(alice, pendingPaymentActionLifetimeMilliseconds)).toEqual([]);
  });

  /* The Core purge repeats the store's key (gate G1): this row holds the two together. */
  it("should be cleared by the owner's purge, keeping only the new owner's", () => {
    rememberPendingPaymentAction({ actionId: 'pa_1', ...alice, openedAt: 1 });
    rememberPendingPaymentAction({ actionId: 'pa_2', ...bob, openedAt: 1 });
    purgePendingPaymentActions(bob);
    expect(pendingPaymentActions(alice, 2)).toEqual([]);
    expect(pendingPaymentActions(bob, 2)).toEqual(['pa_2']);
    purgePendingPaymentActions();
    expect(pendingPaymentActions(bob, 2)).toEqual([]);
  });

  it('should read a corrupt store as empty', () => {
    localStorage.setItem('tau-pending-payment-actions', '{bad');
    expect(pendingPaymentActions(alice, 1)).toEqual([]);
  });
});
