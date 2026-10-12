import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { wireBalanceExplanationSchema, wireEntitlementsSchema } from '@taucad/billing';
import { closeAccount, createAccount, magicLinkMail, signIn, verificationMail } from '#support/account.js';
import type { Account } from '#support/account.js';
import { apiUrl, baseUrl, createApi, ok, retryAfterSeconds } from '#support/api.js';
import { screenshot, toasts, waitForToast, withBrowser } from '#support/checkout.js';
import type { Page } from '#support/checkout.js';
import { listMail, waitForMail } from '#support/mailbox.js';
import { isShown, pageText, usagePage } from '#support/pages.js';
import { matrixRow } from '#support/results.js';

/**
 * Usage snapshots the app keeps for offline viewing (`tau-billing` → `usageSnapshots`): the count, or a negative
 * number when the database or store does not exist yet.
 */
const savedUsageScript = `(async () => {
  const names = (await indexedDB.databases()).map((database) => database.name);
  if (!names.includes('tau-billing')) return -1;
  return await new Promise((resolve) => {
    const open = indexedDB.open('tau-billing');
    open.onerror = () => resolve(-3);
    open.onsuccess = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains('usageSnapshots')) {
        database.close();
        resolve(-2);
        return;
      }
      const count = database.transaction('usageSnapshots', 'readonly').objectStore('usageSnapshots').count();
      count.onsuccess = () => { database.close(); resolve(count.result); };
      count.onerror = () => { database.close(); resolve(-3); };
    };
  });
})()`;

const savedUsage = async (page: Page): Promise<number> => z.number().parse(await page.evaluate(savedUsageScript));

/** What the signed-in browser's own session read answers (`null` once signed out). */
const browserSession = async (page: Page): Promise<unknown> =>
  page.evaluate(
    `fetch(${JSON.stringify(`${apiUrl}/v1/auth/get-session`)}, { credentials: 'include' }).then((response) => response.json())`,
  );

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

  it(
    'should sign in through an emailed magic link [AU-03 P1]',
    matrixRow('AU-03', 'P1', async (evidence) => {
      const account = await createAccount('au03');
      accounts.push(account);
      const inbox = await listMail(account.mailbox);
      const seen = new Set(inbox.map(({ id }) => id));
      // Requested signed out, as the sign-in form's magic-link option does.
      const requested = await createApi().request('POST', '/v1/auth/sign-in/magic-link', {
        body: { email: account.email, callbackURL: `${baseUrl}/` },
      });
      expect(requested.status).toBe(200);
      const mail = await magicLinkMail(account, seen);
      evidence.push(
        `magic-link request ${requested.status}; mail ${mail.id} from ${mail.from} links ${mail.link.origin}${mail.link.pathname}`,
      );
      const landed = await withBrowser(undefined, async ({ context, page }) => {
        // Every API answer while the page verifies: the verify call, and where its redirect led.
        const answers: string[] = [];
        page.on('response', (response) => {
          if (response.url().startsWith(apiUrl)) {
            const { pathname } = new URL(response.url());
            const { location, 'request-id': requestId } = response.headers();
            answers.push(
              `${response.request().method()} ${pathname} ${response.status()}${
                location === undefined ? '' : ` → ${location}`
              } (${requestId ?? 'no request id'})`,
            );
          }
        });
        await page.goto(mail.link.href);
        const verified = await isShown(page.getByText('Magic link verified'), 60_000);
        if (verified) {
          await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 });
        }
        evidence.push(
          `API answers ${answers.join(', ')}`,
          `page "${await pageText(page, 160)}"`,
          await screenshot(page, 'au-03-verify'),
        );
        // Whatever the page said, does the browser now hold a session?
        const browser = createApi();
        for (const cookie of await context.cookies(apiUrl)) {
          browser.jar.set(cookie.name, cookie.value);
        }
        return { verified, session: await browser.request('GET', '/v1/auth/get-session') };
      });
      const signedIn = z
        .object({ user: z.object({ id: z.string(), email: z.string() }) })
        .safeParse(landed.session.body);
      evidence.push(
        signedIn.success ? `browser holds a session for ${signedIn.data.user.id}` : 'browser holds no session',
      );
      expect(mail.link.origin).toBe(baseUrl);
      if (!landed.verified) {
        return {
          outcome: 'fail',
          defect: 'unclassified',
          evidence: [...evidence, '"Magic link verified" never showed'],
        };
      }
      expect(signedIn.success && signedIn.data.user.id).toBe(account.userId);
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should clear the saved billing state on sign-out [AU-06 P1]',
    matrixRow('AU-06', 'P1', async (evidence) => {
      const account = await createAccount('au06');
      accounts.push(account);
      const observed = await withBrowser(account, async ({ page }) => {
        await usagePage(page).open();
        let before = await savedUsage(page);
        const deadline = Date.now() + 20_000;
        while (before <= 0 && Date.now() < deadline) {
          // oxlint-disable-next-line no-await-in-loop -- bounded polling for the offline save
          await page.waitForTimeout(1000);
          // oxlint-disable-next-line no-await-in-loop -- bounded polling for the offline save
          before = await savedUsage(page);
        }
        await page.goto(`${baseUrl}/auth/sign-out`);
        await page.waitForURL((url) => url.pathname.startsWith('/auth/sign-in'), { timeout: 30_000 });
        await page.waitForTimeout(2000);
        return {
          before,
          after: await savedUsage(page),
          session: await browserSession(page),
          shot: await screenshot(page, 'au-06-signed-out'),
        };
      });
      evidence.push(
        `saved usage snapshots before sign-out ${observed.before}, after ${observed.after} (negative: no store)`,
        `browser session afterwards ${JSON.stringify(observed.session)}`,
        observed.shot,
      );
      // Signing the browser out revoked the session the harness shares with it; cleanup needs its own.
      evidence.push(`harness sign-in again ${(await signIn(account)) ? 'ok' : 'refused'}`);
      expect(observed.before).toBeGreaterThan(0);
      expect(observed.after).toBeLessThanOrEqual(0);
      expect(observed.session).toBeNull();
      return { outcome: 'pass', evidence };
    }),
  );

  // Last in this file: the burst fills the sign-in window, and the wait below drains it before the next row signs
  // in (a later file that meets a leftover 429 retries it through api.ts).
  it(
    'should rate limit a sign-in burst without locking the account out [AU-09 P1]',
    matrixRow('AU-09', 'P1', async () => {
      const account = await createAccount('au09');
      accounts.push(account);
      // Better Auth's built-in rule for /sign-in* allows 3 per 10 s per process (apps/api/app/config/auth.ts only
      // overrides /get-session), so a burst of 101 meets the limit even split across staging's two API machines;
      // Run 1 saw 3 × 401, 98 × 429. No 429 at all means sign-in is not rate limited: a product finding.
      const responses = await Promise.all(
        Array.from({ length: 101 }, async () =>
          account.api.request('POST', '/v1/auth/sign-in/email', {
            body: { email: account.email, password: 'not-the-password-1' },
            retryRateLimit: false,
          }),
        ),
      );
      const limited = responses.filter(({ status }) => status === 429);
      const refused = responses.filter(({ status }) => status === 401);
      if (limited.length === 0) {
        const statuses = [...new Set(responses.map(({ status }) => status))].join('/');
        return {
          outcome: 'fail',
          defect: 'unclassified',
          evidence: [`101 wrong-password sign-ins answered ${statuses} and never 429: sign-in is not rate limited`],
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
          `101 wrong-password sign-ins: ${refused.length} × 401, ${limited.length} × 429 (X-Retry-After ${observedRetryAfter}; waited ${retryAfter + 1} s)`,
          `right password after the window: ${signIn.status}`,
        ],
      };
    }),
  );
});
