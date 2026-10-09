import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { wirePaymentActionSchema } from '@taucad/billing';
import type { WirePaymentAction } from '@taucad/billing';
import { apiUrl, baseUrl } from '#support/api.js';
import { bodyUnlessNavigated, visibleText } from '#support/checkout.js';
import type { Locator, Page } from '#support/checkout.js';

/**
 * Page objects for the app surfaces the rows drive. Each one names the control by the role and text a customer
 * sees, from the component that renders it, so a copy change fails the row that depends on that copy.
 */

/**
 * Clicks the first of `candidates` that becomes visible; throws naming them all when none shows.
 *
 * @param candidates - The controls to try, in order of preference.
 * @param appearBudget - Milliseconds to wait for one of them.
 */
export const clickFirstVisible = async (candidates: readonly Locator[], appearBudget = 20_000): Promise<number> => {
  const deadline = Date.now() + appearBudget;
  while (Date.now() < deadline) {
    for (const [index, candidate] of candidates.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- candidates are probed in priority order
      if (await candidate.isVisible().catch(() => false)) {
        // oxlint-disable-next-line no-await-in-loop -- the first visible candidate is the one to click
        await candidate.click();
        return index;
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- bounded polling
    await delay(500);
  }
  throw new Error(`None of ${candidates.length} controls became visible: ${candidates.map(String).join(', ')}`);
};

/**
 * Whether `locator` becomes visible in time; false instead of a throw.
 *
 * @param locator - The element to wait for.
 * @param appearBudget - Milliseconds to wait for it.
 */
export const isShown = async (locator: Locator, appearBudget: number): Promise<boolean> => {
  try {
    await locator.waitFor({ timeout: appearBudget });
    return true;
  } catch {
    return false;
  }
};

/** The visible text of the page, whitespace folded, cut for an evidence line. */
export const pageText = async (page: Page, limit = 600): Promise<string> => {
  const text = await visibleText(page.locator('body'));
  return text.slice(0, limit);
};

/** A payment action the app received, with the request id of the answer. */
export type ActionAnswer = { readonly action: WirePaymentAction; readonly requestId: string };

/** The body of the first answer to a payment-action request that `predicate` selects, parsed with its wire schema. */
const actionResponse = async (
  page: Page,
  predicate: (path: string, method: string) => boolean,
  trigger: () => Promise<void>,
): Promise<ActionAnswer> => {
  const answered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === apiUrl && predicate(url.pathname, response.request().method());
  });
  await trigger();
  const response = await answered;
  if (!response.ok()) {
    throw new Error(`${new URL(response.url()).pathname} answered ${response.status()}: ${await response.text()}`);
  }
  const body: unknown = await response.json();
  return {
    action: wirePaymentActionSchema.parse(body),
    requestId: response.headers()['request-id'] ?? 'no request id',
  };
};

/** A payment-action answer after which the page may leave for Checkout at once, taking the body with it. */
export type ActionSubmission = {
  readonly status: number;
  readonly requestId: string;
  /** The answer's action, when the page had not navigated away from it yet. */
  readonly action?: WirePaymentAction;
};

/** The status and request id of the first payment-action answer `predicate` selects, and its action when readable. */
const actionSubmission = async (
  page: Page,
  predicate: (path: string, method: string) => boolean,
  trigger: () => Promise<void>,
): Promise<ActionSubmission> => {
  const answered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === apiUrl && predicate(url.pathname, response.request().method());
  });
  await trigger();
  const response = await answered;
  const body = await bodyUnlessNavigated(response);
  if (!response.ok()) {
    const shown = body === undefined ? 'body gone with the page' : JSON.stringify(body);
    throw new Error(`${new URL(response.url()).pathname} answered ${response.status()}: ${shown}`);
  }
  const parsed = wirePaymentActionSchema.safeParse(body);
  return {
    status: response.status(),
    requestId: response.headers()['request-id'] ?? 'no request id',
    ...(parsed.success ? { action: parsed.data } : {}),
  };
};

/** Settings → Billing: plan, credit balance, automatic reload and account closure. */
export type BillingSettings = {
  readonly open: () => Promise<void>;
  /** The spendable balance the card prints (`data-testid="credit-balance"`). */
  readonly balance: () => Locator;
  readonly addCredits: () => Promise<void>;
  readonly manageSubscription: () => Locator;
  readonly subscribe: () => Locator;
  /** "Pro until <date> — reactivate any time from Manage Subscription." */
  readonly cancellationBanner: () => Locator;
  readonly closure: {
    readonly confirm: () => Promise<void>;
    readonly prepare: () => Locator;
    readonly status: () => Locator;
    readonly deleteAccount: () => Locator;
  };
};

/** Settings → Billing (`/?settings=billing`). */
export const billingSettings = (page: Page): BillingSettings => ({
  async open(): Promise<void> {
    const heading = page.getByText('Credit balance', { exact: true });
    await page.goto(`${baseUrl}/?settings=billing`);
    // One reload for a page that stalled while loading; a second stall fails the row.
    if (!(await isShown(heading, 45_000))) {
      await page.reload();
      await heading.waitFor({ timeout: 45_000 });
    }
  },
  balance: () => page.getByTestId('credit-balance'),
  addCredits: async () => page.getByRole('button', { name: 'Add credits' }).first().click(),
  manageSubscription: () => page.getByRole('button', { name: /Manage Subscription/u }),
  subscribe: () => page.getByRole('button', { name: /Subscribe Now/u }),
  cancellationBanner: () => page.getByText(/^Pro until .+ reactivate any time from Manage Subscription\.$/u),
  closure: {
    confirm: async () => page.getByLabel('I understand and want to close this account.').check(),
    prepare: () => page.getByRole('button', { name: 'Prepare account closure' }),
    status: () => page.getByText(/^Closure status: /u),
    deleteAccount: () => page.getByRole('button', { name: 'Delete my account' }),
  },
});

/** The Add credits dialog (`topup-modal.tsx`). */
export type TopupModal = {
  readonly dialog: Locator;
  /** A preset ($10, $25, $50, $100) or any other whole-dollar amount through Other. */
  readonly chooseAmount: (dollars: number) => Promise<void>;
  /** Review with a new card in Checkout, whichever label the card-on-file state gives that button. */
  readonly reviewInCheckout: () => Promise<ActionAnswer>;
  readonly reviewWithSavedCard: () => Promise<ActionAnswer>;
  /** "Confirm quote" for a quoted total, "Continue to secure Checkout" when Checkout computes it. */
  readonly confirm: () => Promise<ActionSubmission>;
  readonly discardQuote: () => Promise<ActionAnswer>;
  readonly cancelPayment: () => Promise<ActionAnswer>;
  readonly continueInCheckout: () => Promise<ActionSubmission>;
  /** The quote's "Credits" row. */
  readonly quotedCredits: () => Promise<string>;
  /** "Payment status: <label>" under the title. */
  readonly status: (label: string) => Locator;
  readonly text: () => Promise<string>;
};

/** The Add credits dialog, found by its title. */
export const topupModal = (page: Page): TopupModal => {
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: /^(?:Add credits|Credits added)$/u }) });
  const isTopup = (path: string, method: string): boolean =>
    method === 'POST' && path === '/v1/billing/payment-actions/topup';
  const isAction =
    (suffix: string) =>
    (path: string, method: string): boolean =>
      method === 'POST' && new RegExp(`^/v1/billing/payment-actions/[^/]+/${suffix}$`, 'u').test(path);
  return {
    dialog,
    async chooseAmount(dollars: number): Promise<void> {
      if ([10, 25, 50, 100].includes(dollars)) {
        await dialog.getByRole('button', { name: `$${dollars}`, exact: true }).click();
        return;
      }
      await dialog.getByRole('button', { name: 'Other', exact: true }).click();
      await dialog.getByLabel('Custom amount').fill(String(dollars));
    },
    reviewInCheckout: async () =>
      actionResponse(page, isTopup, async () => {
        await clickFirstVisible([
          dialog.getByRole('button', { name: 'Use another card in Checkout' }),
          dialog.getByRole('button', { name: /^Review .+ purchase$/u }),
        ]);
      }),
    reviewWithSavedCard: async () =>
      actionResponse(page, isTopup, async () => {
        await dialog.getByRole('button', { name: 'Review purchase with saved card' }).click();
      }),
    confirm: async () =>
      actionSubmission(page, isAction('confirm'), async () => {
        await clickFirstVisible([
          dialog.getByRole('button', { name: 'Confirm quote' }),
          dialog.getByRole('button', { name: 'Continue to secure Checkout' }),
        ]);
      }),
    discardQuote: async () =>
      actionResponse(page, isAction('cancel'), async () => {
        await dialog.getByRole('button', { name: 'Discard quote' }).click();
      }),
    cancelPayment: async () =>
      actionResponse(page, isAction('cancel'), async () => {
        await dialog.getByRole('button', { name: 'Cancel payment' }).click();
      }),
    continueInCheckout: async () =>
      actionSubmission(page, isAction('recover'), async () => {
        await dialog.getByRole('button', { name: 'Continue in Checkout' }).click();
      }),
    quotedCredits: async () =>
      visibleText(
        dialog
          .locator('div')
          .filter({ has: page.getByText('Credits', { exact: true }) })
          .locator('dd'),
      ),
    status: (label: string) => dialog.getByText(`Payment status: ${label}`, { exact: true }),
    text: async () => visibleText(dialog),
  };
};

/** The project chat: a new project from `/projects/new`, the composer and its model picker. */
export type ProjectChat = {
  readonly composer: Locator;
  /**
   * Creates a project the way a new customer does and waits for its chat, or only for the project's URL when the
   * composer is not what the row looks at; returns the chat's URL.
   */
  readonly create: (name: string, options?: { readonly composer?: boolean }) => Promise<string>;
  /** Reopens a chat by its URL, with its lane open. */
  readonly open: (url: string) => Promise<void>;
  /** Picks a catalog model through the agent sheet (the composer's own selector, as a customer does). */
  readonly selectModel: (name: string) => Promise<void>;
  /** Replaces whatever draft the composer holds with `prompt` and sends it. */
  readonly send: (prompt: string) => Promise<void>;
};

/** The project chat of the open page. */
export const projectChat = (page: Page): ProjectChat => {
  const composer = page.locator('[aria-label="Ask Tau to build anything..."]').first();
  /** A narrow window starts the project with its chat lane collapsed; the lane's toggle opens it. */
  const openLane = async (): Promise<void> => {
    if (!(await composer.isVisible())) {
      await page.getByRole('button', { name: 'Toggle Chat lane' }).click();
    }
    await composer.waitFor({ timeout: 30_000 });
  };
  return {
    composer,
    async create(name: string, options = {}): Promise<string> {
      await page.goto(`${baseUrl}/projects/new`);
      await page.getByLabel('Project Name *').fill(name);
      await page.getByRole('button', { name: /Create Project/u }).click();
      await page.waitForURL(/\/w\/[^/]+\/[^/?]+\?(?:.*&)?chat=/u, { timeout: 90_000 });
      if (options.composer !== false) {
        await composer.waitFor({ state: 'attached', timeout: 90_000 });
        await openLane();
      }
      return page.url();
    },
    async open(url: string): Promise<void> {
      await page.goto(url);
      await composer.waitFor({ state: 'attached', timeout: 90_000 });
      await openLane();
    },
    async selectModel(name: string): Promise<void> {
      await openLane();
      await page.getByRole('button', { name: /^Agent and model: /u }).click();
      await page.getByRole('button', { name: /^Model: .*\. Change$/u }).click();
      await page
        .getByRole('option', { name: new RegExp(`^${name.replaceAll('.', String.raw`\.`)}\\b`, 'u') })
        .first()
        .click();
      await page.getByRole('button', { name: `Model: ${name}. Change` }).waitFor();
      await page.keyboard.press('Escape');
      await page
        .getByRole('button', { name: new RegExp(`^Agent and model: ${name.replaceAll('.', String.raw`\.`)}`, 'u') })
        .waitFor();
    },
    async send(prompt: string): Promise<void> {
      await openLane();
      // A refused turn leaves its text in the composer. Cleared in place: the app binds Ctrl+A to its panel layout
      // even while the composer has focus.
      await composer.fill('');
      await composer.click();
      await page.keyboard.type(prompt);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
    },
  };
};

/** One model-gateway answer the page's agent host received. */
export type GatewayRead = {
  readonly path: string;
  readonly status: number;
  readonly attemptId?: string;
  readonly operationId?: string;
  readonly requestId?: string;
  /** The refusal's code and message, when the gateway refused. */
  readonly refusal?: string;
};

const refusalEnvelopeSchema = z.object({ error: z.object({ type: z.string(), message: z.string() }).loose() }).loose();

/**
 * Records every model-gateway answer the page receives from now on (`/v1/llm/...`), with the refusal's code and
 * message read from its envelope; a streamed answer's body is never read here.
 */
export const watchGateway = (page: Page): GatewayRead[] => {
  const reads: GatewayRead[] = [];
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.origin !== apiUrl || !url.pathname.startsWith('/v1/llm/')) {
      return;
    }
    const headers = response.headers();
    const read: GatewayRead = {
      path: url.pathname,
      status: response.status(),
      attemptId: response.request().headers()['x-tau-attempt-id'],
      operationId: headers['x-tau-operation-id'],
      requestId: headers['request-id'],
    };
    // Recorded in answer order now; a refusal's code is filled in once its body is read.
    const index = reads.length;
    reads.push(read);
    if (response.ok()) {
      return;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const envelope = refusalEnvelopeSchema.safeParse(body);
    reads[index] = {
      ...read,
      refusal: envelope.success
        ? `${envelope.data.error.type} "${envelope.data.error.message}"`
        : 'no gateway envelope',
    };
  });
  return reads;
};

/** The chat's error cards, found by title. */
export type ChatCards = {
  readonly card: (title: string) => Locator;
  /** Waits up to `appearBudget` milliseconds for any known card and returns its title, or undefined when none showed. */
  readonly visibleTitle: (appearBudget?: number) => Promise<string | undefined>;
  /** The card's visible text, whitespace folded. */
  readonly text: (title: string) => Promise<string>;
  /** The card's button labels. */
  readonly buttons: (title: string) => Promise<string[]>;
};

/** The card titles a refused or paused turn shows (`chat-error*.tsx`). */
const cardTitles = [
  'Credit limit reached',
  'Tau paused this turn',
  'The model refused this request',
  'This model is paused',
  'Tau could not start this turn',
  'Funded operation limit reached',
  'Finalizing earlier work',
] as const;

/** The open chat's error cards. */
export const chatCards = (page: Page): ChatCards => {
  // The innermost block that holds both the title and the card's actions (every card offers at least one).
  const card = (title: string): Locator =>
    page
      .locator('div')
      .filter({ has: page.getByText(title, { exact: true }) })
      .filter({ has: page.getByRole('button') })
      .last();
  const shown = async (): Promise<string | undefined> => {
    for (const title of cardTitles) {
      const heading = page.getByText(title, { exact: true }).last();
      // oxlint-disable-next-line no-await-in-loop -- titles are probed in order
      const visible = await heading.isVisible().catch(() => false);
      if (visible) {
        return title;
      }
    }
    return undefined;
  };
  return {
    card,
    async visibleTitle(appearBudget = 120_000): Promise<string | undefined> {
      const deadline = Date.now() + appearBudget;
      let title = await shown();
      while (title === undefined && Date.now() < deadline) {
        // oxlint-disable-next-line no-await-in-loop -- bounded polling
        await delay(1000);
        // oxlint-disable-next-line no-await-in-loop -- bounded polling
        title = await shown();
      }
      return title;
    },
    async text(title: string): Promise<string> {
      const text = await visibleText(card(title));
      return text.slice(0, 600);
    },
    async buttons(title: string): Promise<string[]> {
      const labels = await card(title).getByRole('button').allInnerTexts();
      return labels.map((label) => label.replaceAll(/\s+/gu, ' ').trim());
    },
  };
};

/** `/usage`: the account's metered usage, its summary and its rows. */
export type UsagePage = {
  readonly open: () => Promise<void>;
  /** The activity table's row whose text matches `pattern`; the "Reserved right now" holds table is not searched. */
  readonly row: (pattern: RegExp) => Locator;
};

/** The usage page of the open browser. */
export const usagePage = (page: Page): UsagePage => ({
  async open(): Promise<void> {
    await page.goto(`${baseUrl}/usage`);
    await page.getByRole('heading', { name: 'Tau usage' }).waitFor({ timeout: 60_000 });
  },
  row: (pattern: RegExp) =>
    page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: 'Activity' }) })
      .getByRole('row')
      .filter({ hasText: pattern })
      .first(),
});

/** Stripe's hosted customer portal (billing.stripe.com), driven by the labels its test-mode pages show. */
export type StripePortal = {
  readonly waitForOpen: () => Promise<void>;
  /**
   * Cancel subscription → confirm. Stripe's reason survey is passed with "Continue to cancellation" and no reason
   * wherever it opens: over the confirmation (seen in Run 1) or after it.
   */
  readonly cancelAtPeriodEnd: () => Promise<void>;
  readonly renew: () => Promise<void>;
  /** Back to the app through the portal's own return link, or straight to Settings → Billing when it has none. */
  readonly returnToApp: () => Promise<'link' | 'direct'>;
};

/** The customer portal open in `page`. */
export const stripePortal = (page: Page): StripePortal => ({
  async waitForOpen(): Promise<void> {
    await page.waitForURL((url) => url.hostname === 'billing.stripe.com', { timeout: 60_000 });
    await page.waitForLoadState('domcontentloaded');
  },
  async cancelAtPeriodEnd(): Promise<void> {
    await clickFirstVisible([
      page.locator('[data-test="cancel-subscription"]'),
      page.getByRole('link', { name: /^Cancel (?:subscription|plan)$/iu }),
      page.getByRole('button', { name: /^Cancel (?:subscription|plan)$/iu }),
    ]);
    // The confirmation is its own page; waiting for it keeps the next click off the overview's own Cancel control.
    await page.waitForURL(/\/cancel(?:$|[/?#])/u, { timeout: 30_000 }).catch(() => undefined);
    // Stripe can open its "why are you leaving" survey over that page, where it takes every click until it is left.
    const survey = page.getByRole('button', { name: /^Continue to cancellation$/iu });
    if (await isShown(survey, 5000)) {
      await survey.click({ timeout: 15_000 });
      await survey.waitFor({ state: 'hidden', timeout: 15_000 });
    }
    if (new URL(page.url()).pathname.endsWith('/cancel')) {
      await clickFirstVisible([
        page.locator('[data-testid="confirm"]'),
        page.getByRole('button', { name: /^Cancel (?:subscription|plan)$/iu }),
      ]);
    }
    await page.waitForURL((url) => !url.pathname.endsWith('/cancel'), { timeout: 30_000 }).catch(() => undefined);
    await clickFirstVisible(
      [
        page.getByRole('button', { name: /^(?:Skip|No thanks|Not now)$/iu }),
        page.getByText(/Cancels? on|Your (?:subscription|plan) will be canceled/iu),
      ],
      30_000,
    ).catch(() => -1);
  },
  async renew(): Promise<void> {
    const before = page.url();
    await clickFirstVisible([
      page.locator('[data-test="renew-subscription"]'),
      page.getByRole('button', { name: /^(?:Renew|Don.t cancel|Reactivate)(?: subscription| plan)?$/iu }),
      page.getByRole('link', { name: /^(?:Renew|Don.t cancel|Reactivate)(?: subscription| plan)?$/iu }),
    ]);
    // Renewal may confirm on its own page; give it the chance to open before looking for its button.
    await page.waitForURL((url) => url.href !== before, { timeout: 10_000 }).catch(() => undefined);
    await clickFirstVisible(
      [
        page.locator('[data-testid="confirm"]'),
        page.getByRole('button', { name: /^(?:Renew|Reactivate)(?: subscription| plan)?$/iu }),
      ],
      15_000,
    ).catch(() => -1);
  },
  async returnToApp(): Promise<'link' | 'direct'> {
    const clicked = await clickFirstVisible(
      [
        page.locator('[data-test="return-to-business-link"]'),
        page.getByRole('link', { name: /^Return to /iu }),
        page.getByRole('link', { name: /Back|Return/iu }),
      ],
      15_000,
    ).catch(() => -1);
    if (clicked === -1) {
      await page.goto(`${baseUrl}/?settings=billing`);
      return 'direct';
    }
    await page.waitForURL((url) => url.origin === baseUrl, { timeout: 60_000 });
    return 'link';
  },
});

/**
 * Loads the marketing page at `path` and reads the hrefs of `links` as a visitor's browser shows them, each resolved
 * against the page. The site serves one build to tau.new and taucad.dev, so its HTML names tau.new; on staging its own
 * script (apps/www `client.mjs`) then points those links at taucad.dev.
 *
 * @param page - The page to load it in.
 * @param path - The marketing path, such as `/pricing/`.
 * @param links - The links to read, located on `page`.
 * @returns The page's status and the hrefs in document order.
 */
export const marketingLinks = async (
  page: Page,
  path: string,
  links: Locator,
): Promise<{ readonly status: number | undefined; readonly hrefs: readonly string[] }> => {
  // The page loads that script as a module, which runs once the document is parsed and before DOMContentLoaded, and it
  // rewrites the links at its top level: from that event on they read as a visitor sees them.
  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
  const anchors = await links.all();
  const hrefs = await Promise.all(anchors.map(async (anchor) => anchor.getAttribute('href')));
  return {
    status: response?.status(),
    hrefs: hrefs.flatMap((href) => (href === null ? [] : [new URL(href, page.url()).href])),
  };
};
