import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { wireBalanceExplanationSchema, wireEntitlementsSchema } from '@taucad/billing';
import { closeAccount, createAccount, verificationMail } from '#support/account.js';
import type { Account } from '#support/account.js';
import { apiUrl, baseUrl, ok, retryAfterSeconds } from '#support/api.js';
import type { ApiResponse } from '#support/api.js';
import { screenshot, toasts, waitForToast, withBrowser } from '#support/checkout.js';
import { listMail, waitForMail } from '#support/mailbox.js';
import { matrixRow } from '#support/results.js';

describe('auth and onboarding', () => {
  const accounts: Account[] = [];

  afterAll(async () => {
    await Promise.all(accounts.map(async (account) => closeAccount(account)));
  });

  it(
    'should verify a new account through the emailed link and start free with no credits [AU-01 P0 smoke]',
    matrixRow('AU-01', 'P0', async () => {
      const account = await createAccount('au01', { verified: false });
      accounts.push(account);
      const mail = await verificationMail(account);
      const landed = await withBrowser(undefined, async ({ context, page }) => {
        await page.goto(mail.link.href);
        await page.getByText('Email verified').waitFor();
        await page.waitForURL((url) => url.origin === baseUrl && url.pathname === '/');
        for (const cookie of await context.cookies(apiUrl)) {
          account.api.jar.set(cookie.name, cookie.value);
        }
        return screenshot(page, 'au-01-landed');
      });
      const entitlements = ok(await account.api.request('GET', '/v1/billing/entitlements'), wireEntitlementsSchema);
      const credits = ok(await account.api.request('GET', '/v1/billing/credits'), wireBalanceExplanationSchema);
      expect(entitlements.tier).toBe('free');
      expect(credits.balance?.eligibleAvailableCreditAtoms).toBe('0');
      expect(credits.balance?.promoGrantCreditAtoms).toBe('0');
      return {
        outcome: 'pass',
        evidence: [
          `${account.userId} verified by the link from ${mail.from}, landed on /`,
          landed,
          `tier ${entitlements.tier}, 0 credits, 0 promo`,
        ],
      };
    }),
  );

  it(
    'should refuse sign-in before verification and resend the verification email [AU-02 P0]',
    matrixRow('AU-02', 'P0', async () => {
      const account = await createAccount('au02', { verified: false });
      accounts.push(account);
      await verificationMail(account);
      const evidence = await withBrowser(undefined, async ({ page }) => {
        await page.goto(`${baseUrl}/auth/sign-in`);
        await page.locator('#email').fill(account.email);
        await page.locator('#password').fill(account.password);
        await page.locator('#password').press('Enter');
        const refused = await waitForToast(page, /not verified/iu);
        // Sonner dismisses the toast after about 4 s, so Resend is clicked at once. Sign-in may send a mail of
        // its own (sendOnSignIn), so the send-verification-email answer is the evidence that Resend worked.
        const inbox = await listMail(account.mailbox);
        const before = new Set(inbox.map(({ id }) => id));
        const resending = page.waitForResponse((response) =>
          response.url().endsWith('/v1/auth/send-verification-email'),
        );
        await page.getByRole('button', { name: /resend/iu }).click();
        const resend = await resending;
        expect(resend.status()).toBe(200);
        const resent = await waitForMail(
          account.mailbox,
          ({ id, subject }) => !before.has(id) && subject.includes('Confirm your email'),
        );
        return [
          `sign-in toast "${refused}"`,
          `Resend → send-verification-email ${resend.status()} (${resend.headers()['request-id'] ?? 'no request id'})`,
          `new verification mail ${resent.id} from ${resent.from.address}`,
          `toasts ${JSON.stringify(await toasts(page))}`,
          await screenshot(page, 'au-02-resend'),
        ];
      });
      return { outcome: 'pass', evidence };
    }),
  );

  // Last in this file, which Vitest runs first: the burst fills the sign-in window, and the wait below drains it
  // before any later file signs in.
  it(
    'should rate limit a sign-in burst without locking the account out [AU-09 P1]',
    matrixRow('AU-09', 'P1', async () => {
      const account = await createAccount('au09');
      accounts.push(account);
      // The better-auth limiter counts in memory per API process (apps/api/app/config/auth.ts: window 10, max 100)
      // and staging keeps two awake (fly.staging.toml), so Fly can split one burst under the budget on each; a
      // second burst in the same window fills a process the first one only half-filled.
      const burst = async (): Promise<ApiResponse[]> =>
        Promise.all(
          Array.from({ length: 101 }, async () =>
            account.api.request('POST', '/v1/auth/sign-in/email', {
              body: { email: account.email, password: 'not-the-password-1' },
              retryRateLimit: false,
            }),
          ),
        );
      let responses = await burst();
      let bursts = 1;
      if (!responses.some(({ status }) => status === 429)) {
        responses = [...responses, ...(await burst())];
        bursts = 2;
      }
      const limited = responses.filter(({ status }) => status === 429);
      const refused = responses.filter(({ status }) => status === 401);
      if (limited.length === 0) {
        // More awake processes than two bursts fill: not a product fault this row can name. The window drains
        // before the next file signs in.
        await delay(11_000);
        return {
          outcome: 'blocked',
          defect: 'H-05',
          evidence: [
            `${responses.length} wrong-password sign-ins in two bursts: ${refused.length} × 401 and no 429, spread across API processes each under its own budget`,
          ],
        };
      }
      expect(limited.length + refused.length).toBe(responses.length);
      const retryAfter = Math.max(...limited.map(({ headers }) => retryAfterSeconds(headers)));
      const observedRetryAfter = [
        ...new Set(
          limited.map(({ headers }) => headers.get('x-retry-after') ?? headers.get('retry-after') ?? 'absent'),
        ),
      ].join('/');
      await delay((retryAfter + 1) * 1000);
      const signIn = await account.api.request('POST', '/v1/auth/sign-in/email', {
        body: { email: account.email, password: account.password },
      });
      expect(signIn.status).toBe(200);
      return {
        outcome: 'pass',
        evidence: [
          `${responses.length} wrong-password sign-ins${bursts === 2 ? ' in two bursts (the first split across API processes)' : ''}: ${refused.length} × 401, ${limited.length} × 429 (X-Retry-After ${observedRetryAfter}; waited ${retryAfter + 1} s)`,
          `right password after the window: ${signIn.status}`,
        ],
      };
    }),
  );
});
