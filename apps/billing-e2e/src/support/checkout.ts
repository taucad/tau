import { join } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import type {
  Browser,
  BrowserContext,
  Page as DriverPage,
  Locator as DriverLocator,
  Response as DriverResponse,
} from 'playwright';
import { z } from 'zod';
import type { Account } from '#support/account.js';
import { apiUrl, baseUrl } from '#support/api.js';
import { assertPaymentAllowed, recordPayment } from '#support/budget.js';
import { collectOnFailure, runDirectory } from '#support/results.js';

export type Browsing = { readonly browser: Browser; readonly context: BrowserContext; readonly page: Page };
/** The driver's page handle, named here so this module stays the harness's only direct driver import. */
export type Page = DriverPage;
/** The driver's element handle, for the page objects. */
export type Locator = DriverLocator;
/** One network answer the page received. */
export type PageResponse = DriverResponse;
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

/** The app's cookies hold JSON values (`es-cookie` with `JSON.stringify`), as the app writes them itself. */
const appCookie = (name: string, value: string): Cookie => {
  const { hostname, protocol } = new URL(baseUrl);
  return {
    name,
    value: encodeURIComponent(JSON.stringify(value)),
    domain: hostname,
    path: '/',
    secure: protocol === 'https:',
    sameSite: 'Lax',
  };
};

type BrowserOptions = {
  /** The CAD kernel new projects start with (`tau-cad-kernel`). */
  readonly kernel?: string;
};

/**
 * Chromium with the toast recorder and the cookie banner declined, signed in as `account` (its API session cookie)
 * when given.
 */
export const openBrowser = async (account?: Account, options: BrowserOptions = {}): Promise<Browsing> => {
  // BILLING_E2E_CHANNEL=chrome drives an installed Chrome instead of Playwright's Chromium (an H-01 experiment).
  const browser = await chromium.launch({
    channel: process.env['BILLING_E2E_CHANNEL'],
    executablePath: process.env['BILLING_E2E_CHROMIUM'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-NZ' });
  await context.addInitScript({ content: toastRecorder });
  await context.addCookies([
    appCookie('tau-cookie-consent', 'declined'),
    ...(options.kernel === undefined ? [] : [appCookie('tau-cad-kernel', options.kernel)]),
  ]);
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
  const page = await context.newPage();
  // A row that throws while this browser is open gets a screenshot of where the page stood.
  const release = collectOnFailure(async (id) => screenshot(page, `${id.toLowerCase()}-failure`));
  browser.on('disconnected', release);
  return { browser, context, page };
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

/** `2026-10-09-0912`: the program's evidence prefix, in UTC. */
export const evidenceStamp = (at: Date = new Date()): string =>
  at.toISOString().slice(0, 16).replace('T', '-').replace(':', '');

/**
 * Saves a full-page screenshot beside results.json, named `<UTC stamp>-<name>.png` as the program files evidence, and
 * returns its file name for the evidence column.
 */
export const screenshot = async (page: Page, name: string): Promise<string> => {
  const file = `${evidenceStamp()}-${name}.png`;
  await page.screenshot({ path: join(runDirectory, file), fullPage: true });
  return file;
};

/** The test-mode Checkout Session id in a hosted Checkout URL. */
export const checkoutSession = (url: string): string => /cs_test_\w+/u.exec(url)?.[0] ?? 'no Checkout session id';

/** Stripe's test cards the rows use. */
export const testCards = {
  visa: '4242424242424242',
  threeDomainSecure: '4000002760003184',
  declined: '4000000000000002',
  insufficientFunds: '4000000000009995',
} as const;

/** How one Pay attempt ended: back on the app, refused in Checkout with its message, or still sitting there. */
export type PayAttempt =
  | { readonly outcome: 'left'; readonly challenged: boolean }
  | { readonly outcome: 'refused'; readonly message: string }
  | { readonly outcome: 'stuck'; readonly challenged: boolean };

const checkoutErrors = '[role=alert], .FieldError, .Error, #cardNumber-fieldset-error';

/** A decline in Checkout's own words, for when its error element carries none of the selectors above. */
const declineText = /card (?:has been|was) declined|insufficient funds/iu;

/** Any card or payment error Checkout shows now. */
const checkoutError = async (page: Page): Promise<string | undefined> => {
  const texts = await page
    .locator(checkoutErrors)
    .allInnerTexts()
    .catch(() => []);
  const message = texts.map((text) => text.trim()).find((text) => text !== '');
  if (message !== undefined) {
    return message.replaceAll(/\s+/gu, ' ');
  }
  const decline = page.getByText(declineText).first();
  return (await decline.isVisible().catch(() => false)) ? visibleText(decline) : undefined;
};

/** Completes Stripe's test-mode 3D Secure challenge if one is open; true when it clicked Complete. */
const completeChallenge = async (page: Page): Promise<boolean> => {
  for (const frame of page.frames()) {
    const complete = frame.locator('#test-source-authorize-3ds, button:has-text("Complete")').first();
    // oxlint-disable-next-line no-await-in-loop -- frames are probed one at a time
    if (await complete.isVisible().catch(() => false)) {
      // oxlint-disable-next-line no-await-in-loop -- the first visible challenge is the one to answer
      await complete.click();
      return true;
    }
  }
  return false;
};

/**
 * Clicks Pay (or Subscribe) and follows what Checkout does next for up to `budget` ms: it leaves for the app, shows a
 * card error, or opens a 3D Secure challenge, which this completes. An error still showing from the previous card is
 * not this attempt's answer: it is ignored until Checkout clears it, and only an error shown after that is a refusal.
 * From some hosts the click never submits (H-01), so a quiet page gets Enter on the button and then in the CVC field
 * before the attempt counts as stuck.
 */
const submitPayment = async (page: Page, budget = 90_000): Promise<PayAttempt> => {
  const submit = page.locator('[data-testid="hosted-payment-submit-button"]');
  const previous = await checkoutError(page);
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
  const deadline = Date.now() + budget;
  let challenged = false;
  let nudges = 0;
  let quietSince = Date.now();
  let previousCleared = previous === undefined;
  while (Date.now() < deadline) {
    if (new URL(page.url()).hostname !== 'checkout.stripe.com') {
      return { outcome: 'left', challenged };
    }
    // oxlint-disable-next-line no-await-in-loop -- one poll of the open Checkout page at a time
    const message = await checkoutError(page);
    if (message === undefined) {
      previousCleared = true;
    } else if (previousCleared || message !== previous) {
      return { outcome: 'refused', message };
    }
    // oxlint-disable-next-line no-await-in-loop -- one poll of the open Checkout page at a time
    if (await completeChallenge(page)) {
      challenged = true;
      quietSince = Date.now();
    }
    if (!challenged && Date.now() - quietSince > 30_000 && nudges < 2) {
      nudges += 1;
      quietSince = Date.now();
      // oxlint-disable-next-line no-await-in-loop -- the H-01 fallbacks run in order
      await (nudges === 1 ? submit.press('Enter') : page.locator('#cardCvc').press('Enter')).catch(() => undefined);
    }
    // oxlint-disable-next-line no-await-in-loop -- bounded polling
    await page.waitForTimeout(1000);
  }
  return { outcome: 'stuck', challenged };
};

/** Fills the card (replacing any earlier number) and an NZ billing address; the Link save box stays unticked. */
const fillCard = async (page: Page, card: string, email: string): Promise<void> => {
  await page.locator('#cardNumber').waitFor({ timeout: 60_000 });
  const fillIfShown = async (selector: string, value: string): Promise<void> => {
    const field = page.locator(selector);
    if ((await field.isVisible()) && (await field.isEditable())) {
      await field.fill(value);
    }
  };
  await fillIfShown('#email', email);
  await page.locator('#cardNumber').fill(card);
  await page.locator('#cardExpiry').fill('12 / 34');
  await page.locator('#cardCvc').fill('123');
  await fillIfShown('#billingName', 'Tau E2E');
  const country = page.locator('#billingCountry');
  if (await country.isVisible()) {
    await country.selectOption('NZ');
  }
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
};

/** The rendered text of the first element `locator` matches, whitespace folded; empty when none is attached. */
export const visibleText = async (locator: Locator): Promise<string> => {
  const texts = await locator
    .first()
    .allInnerTexts()
    .catch(() => []);
  return texts.join(' ').replaceAll(/\s+/gu, ' ').trim();
};

/**
 * The JSON body of an answer, or undefined once the page has navigated away from it: the app leaves for Checkout as
 * soon as a confirm, recover or subscription answer arrives, and the browser then drops the body.
 */
export const bodyUnlessNavigated = async (response: PageResponse): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

/** The order summary Checkout shows once the address is in: amounts and tax lines, whitespace folded. */
export const checkoutSummary = async (page: Page): Promise<string> => {
  const summary = page.locator('[data-testid="order-summary"], .OrderDetails, #OrderDetails').first();
  const text = (await summary.isVisible().catch(() => false))
    ? await visibleText(summary)
    : await visibleText(page.locator('body'));
  return text.slice(0, 600);
};

/** Cards Stripe always refuses: paying with only these spends none of a row's payment allowance. */
const refusedCards: ReadonlySet<string> = new Set([testCards.declined, testCards.insufficientFunds]);

/**
 * Pays the open hosted Checkout with each card in turn (a refused card is replaced by the next) and an NZ address,
 * completing a 3D Secure challenge when the card asks for one. Test mode only: a live session never reaches the
 * card fields. A card that can succeed is tried only while `row` has payments left in this run (H-06
 * otherwise), and a payment that leaves Checkout is booked against it. A Playwright trace is kept beside
 * results.json when the page never leaves Checkout.
 *
 * @returns The session, every attempt in order, and whether the page left Checkout for the app.
 */
export const payInCheckout = async (
  page: Page,
  input: { readonly row: string; readonly email: string; readonly cards: readonly string[] },
): Promise<{
  readonly sessionId: string;
  readonly attempts: readonly PayAttempt[];
  readonly isPaid: boolean;
  readonly summary: string;
  readonly trace?: string;
}> => {
  await page.waitForURL(/checkout\.stripe\.com/u, { timeout: 60_000 });
  const sessionId = /cs_test_\w+/u.exec(page.url())?.[0];
  if (sessionId === undefined) {
    throw new Error(`Refusing to pay ${new URL(page.url()).pathname}: not a test-mode Checkout session`);
  }
  if (input.cards.some((card) => !refusedCards.has(card))) {
    await assertPaymentAllowed(input.row);
  }
  const { tracing } = page.context();
  await tracing.start({ screenshots: true, snapshots: true });
  const attempts: PayAttempt[] = [];
  let summary = '';
  let isPaid = false;
  try {
    for (const card of input.cards) {
      // oxlint-disable-next-line no-await-in-loop -- each card is tried only after the previous one was refused
      await fillCard(page, card, input.email);
      // oxlint-disable-next-line no-await-in-loop -- the summary is read with the address in, before the click
      summary = await checkoutSummary(page);
      // oxlint-disable-next-line no-await-in-loop -- one Pay attempt at a time
      const attempt = await submitPayment(page);
      attempts.push(attempt);
      if (attempt.outcome !== 'refused') {
        break;
      }
    }
    isPaid = attempts.at(-1)?.outcome === 'left';
    if (isPaid) {
      await recordPayment(input.row, sessionId);
    }
  } finally {
    // Stopped however the attempts ended: a trace left running fails the next payment's `tracing.start` in this
    // context, and an attempt that threw is the one whose trace matters most.
    await tracing.stop(isPaid ? {} : { path: join(runDirectory, `${sessionId}-trace.zip`) });
  }
  const trace = isPaid ? undefined : `${sessionId}-trace.zip`;
  return { sessionId, attempts, isPaid, summary, trace };
};

/** What the app read about a payment action after a Checkout return: each GET and recover, in order. */
export type PaymentRead = {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly state?: string;
  readonly requestId?: string;
};

/** The app's payment-action reads: `GET …/payment-actions/<id>` and `POST …/payment-actions/<id>/recover`. */
const paymentActionPath = /^\/v1\/billing\/payment-actions\/[^/]+(?:\/recover)?$/u;

/**
 * Whether `pathname` reads or recovers a payment action: the one `actionId` names, or any action when the watcher
 * was registered before its action existed.
 */
export const isWatchedPaymentPath = (pathname: string, actionId?: string): boolean => {
  if (!paymentActionPath.test(pathname)) {
    return false;
  }
  if (actionId === undefined) {
    return true;
  }
  const scope = `/v1/billing/payment-actions/${actionId}`;
  return pathname === scope || pathname === `${scope}/recover`;
};

/**
 * Records the app's own payment-action reads and recovers from now on, so a row can tell whether the webhook settled
 * a paid Checkout before the return page looked, or the return page's recover settled it. The listener lives as long
 * as the page, so a row that knows its `actionId` names it and gets that action's reads only, not a later row's; the
 * subscription row registers before its action exists and leaves the id out.
 */
export const watchPaymentReads = (page: Page, actionId?: string): PaymentRead[] => {
  const reads: PaymentRead[] = [];
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.origin !== apiUrl || !isWatchedPaymentPath(url.pathname, actionId)) {
      return;
    }
    // Recorded in answer order now; the state is filled in once the body is read.
    const index = reads.length;
    const read: PaymentRead = {
      method: response.request().method(),
      path: url.pathname,
      status: response.status(),
      requestId: response.headers()['request-id'],
    };
    reads.push(read);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const state = z.object({ state: z.string() }).safeParse(body);
    reads[index] = { ...read, state: state.success ? state.data.state : undefined };
  });
  return reads;
};
