import { join } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page as DriverPage } from 'playwright';
import { z } from 'zod';
import type { Account } from '#support/account.js';
import { apiUrl } from '#support/api.js';
import { runDirectory } from '#support/results.js';

export type Browsing = { readonly browser: Browser; readonly context: BrowserContext; readonly page: Page };
/** The driver's page handle, named here so this module stays the harness's only direct driver import. */
export type Page = DriverPage;
type Cookie = Parameters<BrowserContext['addCookies']>[0][number];

/** Sonner drops a toast after a few seconds; this keeps the text of every toast the page showed. */
const toastRecorder = `
  window.tauToasts = [];
  new MutationObserver(() => {
    for (const toast of document.querySelectorAll('[data-sonner-toast]')) {
      const text = toast.textContent.trim();
      if (text !== '' && !window.tauToasts.includes(text)) window.tauToasts.push(text);
    }
  }).observe(document, { childList: true, subtree: true, characterData: true });
`;

/** Chromium with the toast recorder, signed in as `account` (its API session cookie) when given. */
export const openBrowser = async (account?: Account): Promise<Browsing> => {
  // BILLING_E2E_CHANNEL=chrome drives an installed Chrome instead of Playwright's Chromium (an H-01 experiment).
  const browser = await chromium.launch({ channel: process.env['BILLING_E2E_CHANNEL'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript({ content: toastRecorder });
  if (account !== undefined) {
    const { hostname, protocol } = new URL(apiUrl);
    await context.addCookies(
      [...account.api.jar].map(
        ([name, value]): Cookie => ({
          name,
          value,
          domain: hostname,
          path: '/',
          secure: protocol === 'https:',
          httpOnly: true,
          sameSite: 'Lax',
        }),
      ),
    );
  }
  return { browser, context, page: await context.newPage() };
};

/** Runs `use` in a fresh browser and always closes it. */
export const withBrowser = async <Result>(
  account: Account | undefined,
  use: (browsing: Browsing) => Promise<Result>,
): Promise<Result> => {
  const browsing = await openBrowser(account);
  try {
    return await use(browsing);
  } finally {
    await browsing.browser.close();
  }
};

/** Every toast text the page has shown so far. */
export const toasts = async (page: Page): Promise<string[]> =>
  z.array(z.string()).parse(await page.evaluate('window.tauToasts ?? []'));

/** Waits (30 s unless told otherwise) for a toast whose text matches `pattern`, including one already dismissed. */
export const waitForToast = async (page: Page, pattern: RegExp, toastTimeout = 30_000): Promise<string> => {
  const found = await page.waitForFunction(
    `(window.tauToasts ?? []).find((text) => new RegExp(${JSON.stringify(pattern.source)}, 'u').test(text))`,
    undefined,
    { timeout: toastTimeout },
  );
  return z.string().parse(await found.jsonValue());
};

/** Saves a full-page screenshot beside results.json and returns its file name for the evidence column. */
export const screenshot = async (page: Page, name: string): Promise<string> => {
  await page.screenshot({ path: join(runDirectory, `${name}.png`), fullPage: true });
  return `${name}.png`;
};

/** The test-mode Checkout Session id in a hosted Checkout URL. */
export const checkoutSession = (url: string): string => /cs_test_\w+/u.exec(url)?.[0] ?? 'no Checkout session id';

export type Payment = { readonly isPaid: boolean; readonly sessionId: string; readonly trace?: string };

const leavesCheckout = async (page: Page, leaveTimeout: number): Promise<boolean> => {
  try {
    await page.waitForURL((url) => url.hostname !== 'checkout.stripe.com', { timeout: leaveTimeout });
    return true;
  } catch {
    return false;
  }
};

/**
 * Pays the open hosted Checkout with Visa 4242 and an NZ address (test mode collects no NZ tax).
 * From some hosts headless Chromium fills the form but the Pay click never submits (H-01), so it
 * waits for the network to settle, clicks, then presses Enter on the button and in the CVC field,
 * and keeps a Playwright trace (beside results.json) when Checkout is still open after all three.
 */
export const payWithTestCard = async (page: Page, email: string): Promise<Payment> => {
  await page.waitForURL(/checkout\.stripe\.com/u);
  const sessionId = /cs_test_\w+/u.exec(page.url())?.[0];
  // Test mode only: a live session never reaches the card fields.
  if (sessionId === undefined) {
    throw new Error(`Refusing to pay ${new URL(page.url()).pathname}: not a test-mode Checkout session`);
  }
  const { tracing } = page.context();
  await tracing.start({ screenshots: true, snapshots: true });
  await page.locator('#cardNumber').waitFor();
  const fillIfShown = async (selector: string, value: string): Promise<void> => {
    const field = page.locator(selector);
    if ((await field.isVisible()) && (await field.isEditable())) {
      await field.fill(value);
    }
  };
  await fillIfShown('#email', email);
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('12 / 34');
  await page.locator('#cardCvc').fill('123');
  await page.locator('#billingName').fill('Tau E2E');
  await page.locator('#billingCountry').selectOption('NZ');
  await fillIfShown('#billingAddressLine1', '1 Queen Street');
  await fillIfShown('#billingLocality', 'Auckland');
  await fillIfShown('#billingPostalCode', '1010');
  const link = page.locator('#enableStripePass');
  if ((await link.isVisible()) && (await link.isChecked())) {
    await link.uncheck();
  }
  try {
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
  } catch {
    // Stripe keeps telemetry requests open; idle is only a best effort before the click.
  }
  const submit = page.locator('[data-testid="hosted-payment-submit-button"]');
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
  let isPaid = await leavesCheckout(page, 30_000);
  if (!isPaid) {
    await submit.press('Enter');
    isPaid = await leavesCheckout(page, 30_000);
  }
  if (!isPaid) {
    await page.locator('#cardCvc').press('Enter');
    isPaid = await leavesCheckout(page, 30_000);
  }
  const trace = isPaid ? undefined : `${sessionId}-trace.zip`;
  await tracing.stop(trace === undefined ? {} : { path: join(runDirectory, trace) });
  return { isPaid, sessionId, trace };
};
