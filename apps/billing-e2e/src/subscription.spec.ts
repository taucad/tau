import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { wireAccountClosureSchema, wireEntitlementsSchema, wirePaymentActionSchema } from '@taucad/billing';
import type { WireEntitlements, WirePaymentAction } from '@taucad/billing';
import { closeAccount, createAccount } from '#support/account.js';
import type { Account } from '#support/account.js';
import { apiUrl, failure, ok } from '#support/api.js';
import {
  bodyUnlessNavigated,
  openBrowser,
  payInCheckout,
  screenshot,
  testCards,
  toasts,
  visibleText,
  watchPaymentReads,
} from '#support/checkout.js';
import type { Browsing } from '#support/checkout.js';
import { deleteMailbox } from '#support/mailbox.js';
import { billingSettings, isShown, stripePortal } from '#support/pages.js';
import {
  availableAtoms,
  describeAction,
  describeReads,
  readCredits,
  readOpenActions,
  waitForSettlement,
} from '#support/payments.js';
import { matrixRow } from '#support/results.js';
import type { Verdict } from '#support/results.js';
import { stripeReadKey, subscriptionOfSession } from '#support/stripe.js';

/** A Checkout payment, its settlement and a portal round trip each take up to a minute. */
const rowTimeout = 360_000;

const readEntitlements = async (account: Account): Promise<WireEntitlements> =>
  ok(await account.api.request('GET', '/v1/billing/entitlements'), wireEntitlementsSchema);

/** Polls entitlements every 3 s for up to 90 s until `accept` holds; the webhook updates them after the portal. */
const waitForEntitlements = async (
  account: Account,
  accept: (entitlements: WireEntitlements) => boolean,
): Promise<{ readonly entitlements: WireEntitlements; readonly seconds: number }> => {
  const started = Date.now();
  let entitlements = await readEntitlements(account);
  while (!accept(entitlements) && Date.now() - started < 90_000) {
    // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling
    await delay(3000);
    // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling
    entitlements = await readEntitlements(account);
  }
  return { entitlements, seconds: Math.round((Date.now() - started) / 1000) };
};

const describeEntitlements = ({
  tier,
  status,
  cancelAtPeriodEnd,
  paidThrough,
  canUseProKernels,
}: WireEntitlements): string =>
  `tier ${tier} ${status}, cancelAtPeriodEnd ${String(cancelAtPeriodEnd)}, paidThrough ${paidThrough ?? 'none'}, pro kernels ${String(canUseProKernels)}`;

describe('Pro subscription', () => {
  let account: Account;
  let browsing: Browsing;
  let isDeleted = false;
  let subscribed: { readonly action: WirePaymentAction; readonly sessionId: string } | undefined;

  beforeAll(async () => {
    account = await createAccount('pr');
    return async () => {
      // AC-02 deletes the user itself; its inbox is then the only thing left to clean.
      await (isDeleted ? deleteMailbox(account.mailbox).catch(() => undefined) : closeAccount(account));
    };
  });

  beforeAll(async () => {
    browsing = await openBrowser(account);
    return async () => browsing.browser.close();
  });

  it(
    'should subscribe to Pro through Checkout and grant 2,000 plan credits [PR-01 P0]',
    matrixRow('PR-01', 'P0', async (evidence): Promise<Verdict> => {
      const { page } = browsing;
      const settings = billingSettings(page);
      await settings.open();
      const subscribing = page.waitForResponse(
        (response) =>
          new URL(response.url()).origin === apiUrl &&
          response.url().endsWith('/v1/billing/payment-actions/subscription') &&
          response.request().method() === 'POST',
      );
      const reads = watchPaymentReads(page);
      await settings.subscribe().click();
      const started = await subscribing;
      // The page leaves for Checkout as soon as this answer lands, which can take the body with it.
      const body = await bodyUnlessNavigated(started);
      const [pending] = body === undefined ? await readOpenActions(account, 'subscription_checkout') : [];
      const action = pending ?? wirePaymentActionSchema.parse(body);
      evidence.push(
        `${describeAction(action)}${body === undefined ? ', read back from the open actions' : ''} (${
          started.headers()['request-id'] ?? 'no request id'
        })`,
      );
      expect(action).toMatchObject({
        purpose: 'subscription_checkout',
        frozen: { principalMinor: '2000', creditAtoms: '20000000' },
      });
      const payment = await payInCheckout(page, { row: 'PR-01', email: account.email, cards: [testCards.visa] });
      if (!payment.isPaid) {
        return {
          outcome: 'blocked',
          defect: 'H-01',
          evidence: [
            ...evidence,
            `${payment.sessionId} filled; Pay never submitted`,
            await screenshot(page, 'pr-01-stuck'),
          ],
        };
      }
      const { action: settled, seconds } = await waitForSettlement(account, action.actionId, 90_000);
      subscribed = { action: settled, sessionId: payment.sessionId };
      const { entitlements } = await waitForEntitlements(account, ({ tier }) => tier === 'pro');
      const credits = await readCredits(account);
      await page.waitForTimeout(3000);
      const shown = await toasts(page);
      await settings.open();
      // The plan card loads after the balance; give it the time the page takes to resolve entitlements.
      const manage = await isShown(settings.manageSubscription(), 30_000);
      evidence.push(
        `${payment.sessionId} paid with 4242; summary "${payment.summary}"`,
        `${describeAction(settled)}, ${seconds} s after return`,
        describeReads(reads),
        describeEntitlements(entitlements),
        `plan ${credits.balance?.planGrantCreditAtoms ?? 'unavailable'} atoms, available ${availableAtoms(credits)}`,
        `toasts ${JSON.stringify(shown)}; Manage Subscription ${manage ? 'shown' : 'missing'}`,
        await screenshot(page, 'pr-01-pro'),
      );
      expect(settled.state).toBe('fulfilled');
      expect(entitlements.tier).toBe('pro');
      expect(credits.balance?.planGrantCreditAtoms).toBe('20000000');
      expect(manage).toBe(true);
      if (!shown.some((text) => text.includes('Tau Pro is active.'))) {
        // The return page says "Tau Pro is active." only for a `completed` action; a paid subscription projects
        // `fulfilled` with its plan grant, so the customer reads "2000 credits added." instead.
        return { outcome: 'fail', defect: 'unclassified', evidence: [...evidence, 'no "Tau Pro is active." toast'] };
      }
      return { outcome: 'pass', evidence };
    }),
    rowTimeout,
  );

  it(
    'should refuse a second subscription [PR-02 P0]',
    matrixRow('PR-02', 'P0', async () => {
      if (subscribed === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['PR-01 left no active subscription'] };
      }
      const second = await account.api.request('POST', '/v1/billing/payment-actions/subscription', {
        body: { requestId: randomUUID(), returnPath: '/?settings=billing' },
      });
      const refusal = failure(second);
      expect(second.status).toBe(409);
      expect(refusal.code).toBe('subscription_already_exists');
      return { outcome: 'pass', evidence: [`409 ${refusal.code}`] };
    }),
  );

  it(
    'should open the Stripe customer portal from Manage Subscription [PR-03 P0]',
    matrixRow('PR-03', 'P0', async (evidence) => {
      if (subscribed === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['PR-01 left no active subscription'] };
      }
      const { page } = browsing;
      const settings = billingSettings(page);
      await settings.open();
      const opening = page.waitForResponse((response) => response.url().endsWith('/v1/billing/payment-actions/portal'));
      await settings.manageSubscription().click();
      const portal = await opening;
      await stripePortal(page).waitForOpen();
      evidence.push(
        `portal action ${portal.status()} (${portal.headers()['request-id'] ?? 'no request id'})`,
        `opened ${new URL(page.url()).hostname}`,
        await screenshot(page, 'pr-03-portal'),
      );
      expect(portal.ok()).toBe(true);
      return { outcome: 'pass', evidence };
    }),
    rowTimeout,
  );

  it(
    'should cancel at period end from the portal and show the Pro-until banner [PR-04 P0]',
    matrixRow('PR-04', 'P0', async (evidence) => {
      if (subscribed === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['PR-01 left no active subscription'] };
      }
      const { page } = browsing;
      const portal = stripePortal(page);
      if (new URL(page.url()).hostname !== 'billing.stripe.com') {
        await billingSettings(page).open();
        await billingSettings(page).manageSubscription().click();
        await portal.waitForOpen();
      }
      await portal.cancelAtPeriodEnd();
      evidence.push(await screenshot(page, 'pr-04-portal-canceled'));
      const returned = await portal.returnToApp();
      const { entitlements, seconds } = await waitForEntitlements(
        account,
        ({ cancelAtPeriodEnd }) => cancelAtPeriodEnd,
      );
      const settings = billingSettings(page);
      await settings.open();
      const banner = settings.cancellationBanner();
      // The plan card and its banner render once the entitlements query answers, after the credit balance shows.
      const bannerText = (await isShown(banner, 30_000)) ? await visibleText(banner) : 'no banner';
      evidence.push(
        `returned by ${returned}`,
        `${describeEntitlements(entitlements)} ${seconds} s after the return`,
        `banner "${bannerText}"`,
        await screenshot(page, 'pr-04-banner'),
      );
      expect(entitlements.cancelAtPeriodEnd).toBe(true);
      expect(entitlements.tier).toBe('pro');
      expect(bannerText).toMatch(/^Pro until .+ reactivate any time from Manage Subscription\.$/u);
      return { outcome: 'pass', evidence };
    }),
    rowTimeout,
  );

  it(
    'should reactivate from the portal and drop the banner [PR-05 P0]',
    matrixRow('PR-05', 'P0', async (evidence) => {
      if (subscribed === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['PR-01 left no active subscription'] };
      }
      const { page } = browsing;
      const settings = billingSettings(page);
      const portal = stripePortal(page);
      await settings.open();
      await settings.manageSubscription().click();
      await portal.waitForOpen();
      await portal.renew();
      evidence.push(await screenshot(page, 'pr-05-portal-renewed'));
      const returned = await portal.returnToApp();
      const { entitlements, seconds } = await waitForEntitlements(
        account,
        ({ cancelAtPeriodEnd }) => !cancelAtPeriodEnd,
      );
      await settings.open();
      await settings.waitForPlan();
      const isBannerShown = await settings.cancellationBanner().isVisible();
      evidence.push(
        `returned by ${returned}`,
        `${describeEntitlements(entitlements)} ${seconds} s after the return`,
        `banner ${isBannerShown ? 'still shown' : 'gone'}`,
        await screenshot(page, 'pr-05-renewed'),
      );
      expect(entitlements.cancelAtPeriodEnd).toBe(false);
      expect(entitlements.tier).toBe('pro');
      expect(isBannerShown).toBe(false);
      return { outcome: 'pass', evidence };
    }),
    rowTimeout,
  );

  it(
    'should close a Pro account and cancel its subscription in Stripe [AC-02 P0]',
    matrixRow('AC-02', 'P0', async (evidence): Promise<Verdict> => {
      if (subscribed === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['PR-01 left no Pro account to close'] };
      }
      const { page } = browsing;
      const settings = billingSettings(page);
      await settings.open();
      await settings.closure.confirm();
      const preparing = page.waitForResponse(
        (response) => response.url().endsWith('/v1/billing/account-closure') && response.request().method() === 'POST',
      );
      await settings.closure.prepare().click();
      const prepared = await preparing;
      const closure = wireAccountClosureSchema.parse(await prepared.json());
      await page.getByText('Closure status: ready for auth deletion').waitFor({ timeout: 60_000 });
      const deleting = page.waitForResponse((response) => response.url().endsWith('/v1/auth/delete-user'));
      await settings.closure.deleteAccount().click();
      const deletion = await deleting;
      isDeleted = deletion.ok();
      const signIn = await account.api.request('POST', '/v1/auth/sign-in/email', {
        body: { email: account.email, password: account.password },
      });
      evidence.push(
        `closure ${closure.closureId} ${closure.state}`,
        `delete-user ${deletion.status()} (${deletion.headers()['request-id'] ?? 'no request id'}), sign-in afterwards ${signIn.status}`,
        await screenshot(page, 'ac-02-deleted'),
      );
      expect(isDeleted).toBe(true);
      expect(signIn.status).toBe(401);
      const key = stripeReadKey();
      if (key === undefined) {
        // The closure cancels the subscription from a scheduled reconcile ("may finish after sign-out"): only
        // Stripe can show it happened.
        return {
          outcome: 'blocked',
          defect: 'H-05',
          evidence: [...evidence, `no STRIPE_TEST_READ_KEY to read ${subscribed.sessionId}'s subscription`],
        };
      }
      const deadline = Date.now() + 180_000;
      let subscription = await subscriptionOfSession(key, subscribed.sessionId);
      while ('status' in subscription && subscription.status !== 'canceled' && Date.now() < deadline) {
        // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of Stripe
        await delay(10_000);
        // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of Stripe
        subscription = await subscriptionOfSession(key, subscribed.sessionId);
      }
      if ('refusal' in subscription) {
        return {
          outcome: 'blocked',
          defect: 'H-02',
          evidence: [...evidence, `Stripe answered ${subscription.refusal}`],
        };
      }
      evidence.push(`Stripe ${subscription.id} ${subscription.status}`);
      return subscription.status === 'canceled'
        ? { outcome: 'pass', evidence }
        : { outcome: 'fail', defect: 'unclassified', evidence: [...evidence, 'not canceled within 3 minutes'] };
    }),
    rowTimeout,
  );
});
