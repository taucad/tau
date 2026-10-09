import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  formatCreditAtoms,
  wireEntitlementsSchema,
  wireOpenHoldsSchema,
  wirePaymentActionSchema,
} from '@taucad/billing';
import type { WireOpenHolds, WireOperationReceipt, WirePaymentAction } from '@taucad/billing';
import { closeAccount, createAccount } from '#support/account.js';
import type { Account } from '#support/account.js';
import { baseUrl, failure, ok } from '#support/api.js';
import type { ApiResponse } from '#support/api.js';
import {
  checkoutSession,
  evidenceStamp,
  openBrowser,
  payInCheckout,
  screenshot,
  testCards,
  toasts,
  visibleText,
  waitForToast,
  watchPaymentReads,
} from '#support/checkout.js';
import type { Browsing, Page, PayAttempt, PaymentRead } from '#support/checkout.js';
import {
  callGateway,
  describeCall,
  describeOperation,
  finalUsage,
  gatewayRoutes,
  insufficientCreditDetailsSchema,
  lookupAttempt,
  streamRefusal,
  waitForTerminal,
} from '#support/gateway.js';
import type { GatewayCall } from '#support/gateway.js';
import { deleteMailbox } from '#support/mailbox.js';
import { assertPaymentAllowed, recordPayment } from '#support/budget.js';
import {
  billingSettings,
  chatCards,
  isShown,
  pageText,
  projectChat,
  topupModal,
  usagePage,
  watchGateway,
} from '#support/pages.js';
import type { GatewayRead } from '#support/pages.js';
import {
  availableAtoms,
  describeAction,
  describeReads,
  readAction,
  readCredits,
  returnPath,
  settlingStates,
  summaryTaxMinor,
  uiRecheckSeconds,
  waitForSettlement,
} from '#support/payments.js';
import { matrixRow, runDirectory, runId } from '#support/results.js';
import type { Verdict } from '#support/results.js';

const billingReturnPath = '/?settings=billing';
/** The short design request the FD rows send, as a customer types it. */
const designPrompt = 'Design a 20 mm cube with a 5 mm through hole in OpenSCAD.';
/** A Checkout payment and its settlement can each take a minute; these rows get room for both. */
const paymentRowTimeout = 360_000;

/** Every paid Checkout return this file saw, for TU-08: which row paid, and the app's own reads after the return. */
const paidReturns: Array<{ readonly row: string; readonly reads: readonly PaymentRead[] }> = [];

/** Settings → Billing → Add credits → `dollars` → Review in Checkout → Continue: the page is then on Checkout. */
const startCheckoutTopup = async (
  page: Page,
  dollars: number,
): Promise<{ readonly quote: WirePaymentAction; readonly reads: PaymentRead[] }> => {
  const settings = billingSettings(page);
  const modal = topupModal(page);
  await settings.open();
  await settings.addCredits();
  await modal.chooseAmount(dollars);
  const { action: quote } = await modal.reviewInCheckout();
  // Registered before Continue, so the return page's own GET and recover are all seen.
  const reads = watchPaymentReads(page, quote.actionId);
  await modal.confirm();
  return { quote, reads };
};

/** The H-01 verdict for a Checkout whose Pay click never submitted. */
const unsubmitted = async (
  page: Page,
  payment: { readonly sessionId: string; readonly trace?: string },
  shot: string,
): Promise<Verdict> => ({
  outcome: 'blocked',
  defect: 'H-01',
  evidence: [
    `${payment.sessionId} filled; Pay never submitted (click, Enter, Enter in CVC)`,
    `trace ${payment.trace ?? 'none'}`,
    await screenshot(page, shot),
  ],
});

/** Whether any Pay attempt met and completed a 3D Secure challenge. */
const challenged = (attempts: readonly PayAttempt[]): boolean =>
  attempts.some((attempt) => attempt.outcome !== 'refused' && attempt.challenged);

/** Open holds on the account. */
const readHolds = async (account: Account): Promise<WireOpenHolds> =>
  ok(await account.api.request('GET', '/v1/billing/holds'), wireOpenHoldsSchema);

/** Waits up to 90 s for the page's first gateway answer. */
const firstGatewayRead = async (page: Page, reads: readonly GatewayRead[]): Promise<GatewayRead | undefined> => {
  const deadline = Date.now() + 90_000;
  while (reads.length === 0 && Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- bounded polling
    await page.waitForTimeout(1000);
  }
  // A refusal's body is read after the status, so give it a moment to land.
  await page.waitForTimeout(1000);
  return reads[0];
};

/** One evidence line for a gateway answer the page received. */
const describeRead = (read: GatewayRead): string =>
  [
    `page gateway ${read.path} ${read.status}`,
    read.refusal,
    read.operationId === undefined ? undefined : `operation ${read.operationId}`,
    read.attemptId === undefined ? undefined : `attempt ${read.attemptId}`,
    read.requestId === undefined ? undefined : `(${read.requestId})`,
  ]
    .filter((part): part is string => part !== undefined)
    .join(' ');

/**
 * What the return page told the customer about a paid Checkout: waits up to 30 s for the page's own first read of
 * the action, then a moment for the toast it raises from that read.
 */
const returnAnnouncement = async (page: Page, reads: readonly PaymentRead[]): Promise<string[]> => {
  const deadline = Date.now() + 30_000;
  while (reads.length === 0 && Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- bounded polling
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2000);
  return toasts(page);
};

/** A paid Checkout the return page reports as needing attention: what a customer reads after paying. */
const attentionAfterPayment = (announced: readonly string[], reads: readonly PaymentRead[]): boolean =>
  reads[0]?.state === 'attention_required' || announced.some((text) => text.startsWith('Your payment needs attention'));

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
      const settings = billingSettings(page);
      const modal = topupModal(page);
      await settings.open();
      await settings.addCredits();
      const { action, requestId } = await modal.reviewInCheckout();
      quoted = action;
      await modal.dialog.getByText('Calculated in secure Checkout before payment').waitFor();
      const credits = await modal.quotedCredits();
      expect(action.state).toBe('prepared');
      expect(action.frozen).toMatchObject({ principalMinor: '2500', creditAtoms: '25000000', taxMinor: null });
      // The program row reads "2,500"; formatCreditAtoms prints whole credits without grouping.
      expect(credits).toBe('2500');
      return {
        outcome: 'pass',
        evidence: [
          `action ${action.actionId} prepared (${requestId}): 2500 minor, 25000000 atoms, tax left to Checkout`,
          `quote shows Credits ${credits}`,
          await screenshot(page, 'tu-02-quote'),
        ],
      };
    }),
  );

  it(
    'should come back from Checkout with a resumable action and cancel it from the dialog [TU-07 P0]',
    matrixRow('TU-07', 'P0', async (evidence) => {
      const quote = quoted;
      if (quote === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['TU-02 left no quote to return from Checkout with'] };
      }
      const { page } = browsing;
      const modal = topupModal(page);
      await modal.confirm();
      await page.waitForURL(/checkout\.stripe\.com/u);
      evidence.push(checkoutSession(page.url()));
      // Stripe's Back link is the session's cancel_url, which carries payment_action.
      await page.locator('a[href*="payment_action="]').first().click();
      await page.waitForURL((url) => url.origin === baseUrl);
      const toast = await waitForToast(page, /Checkout is ready to continue/u);
      evidence.push(`toast "${toast}"`, await screenshot(page, 'tu-07-return'));
      const returned = await readAction(account, quote.actionId);
      // The dialog reopens on the pending action: "Resume Checkout" or "Cancel payment" (main's label for this state).
      await billingSettings(page).addCredits();
      await modal.status('Waiting for Checkout').waitFor();
      evidence.push(`dialog "${await modal.text()}"`);
      const { action: canceled, requestId } = await modal.cancelPayment();
      const after = await readAction(account, quote.actionId);
      evidence.push(
        `action ${quote.actionId} ${returned.state} after Back; Cancel payment → ${canceled.state} (${requestId}); read back ${after.state}`,
      );
      expect(toast).toContain('Resume Checkout');
      expect(returned.state).toBe('redirect_required');
      expect(canceled.state).toBe('canceled');
      expect(after.state).toBe('canceled');
      return { outcome: 'pass', evidence };
    }),
  );
});

describe('funded journey', () => {
  let account: Account;
  let browsing: Browsing;
  let isDeleted = false;
  let projectUrl: string | undefined;
  /** TU-01's settled action, the Checkout summary it paid and the return page's reads. */
  let paid:
    | { readonly action: WirePaymentAction; readonly summary: string; readonly reads: readonly PaymentRead[] }
    | undefined;
  /**
   * The call FD-02 saw settle and its receipt: the Haiku design, or GPT-6 Luna standing in while the provider refuses
   * Anthropic routes (F-24). The usage rows read it.
   */
  let settled:
    | { readonly call: GatewayCall; readonly operation: WireOperationReceipt; readonly modelName: string }
    | undefined;
  let haiku: GatewayCall | undefined;
  let savedCardReceipt: { readonly action: WirePaymentAction; readonly text: string } | undefined;

  beforeAll(async () => {
    account = await createAccount('fund');
    return async () => {
      // AC-01 deletes the user itself; its inbox is then the only thing left to clean.
      await (isDeleted ? deleteMailbox(account.mailbox).catch(() => undefined) : closeAccount(account));
    };
  });

  beforeAll(async () => {
    browsing = await openBrowser(account, { kernel: 'openscad' });
    return async () => browsing.browser.close();
  });

  it(
    'should refuse a design turn with no credits before it runs, with the shortfall [FD-01 P0]',
    matrixRow('FD-01', 'P0', async (evidence) => {
      const { page } = browsing;
      const chat = projectChat(page);
      const cards = chatCards(page);
      const gateway = watchGateway(page);
      projectUrl = await chat.create(`E2E FD-01 ${runId}`);
      await chat.selectModel(gatewayRoutes.haiku.modelName);
      await chat.send(designPrompt);
      const title = await cards.visibleTitle(90_000);
      const text = title === undefined ? await pageText(page) : await cards.text(title);
      const buttons = title === undefined ? [] : await cards.buttons(title);
      const holds = await readHolds(account);
      evidence.push(
        `project ${projectUrl}`,
        `card "${title ?? 'none'}": ${text}`,
        `buttons ${JSON.stringify(buttons)}`,
        gateway.length === 0
          ? 'no gateway call: the browser preflight refused before dispatch'
          : `gateway ${gateway.map((read) => `${read.status} ${read.refusal ?? ''}`).join(', ')}`,
        `open holds ${holds.holds.length}`,
        await screenshot(page, 'fd-01-credits-card'),
      );
      expect(title).toBe('Credit limit reached');
      // Main's preflight card has no run behind it: it says "Add credits, then send your message." and offers no
      // Resume; a gateway 402 instead prefixes "Tau paused this turn:" and offers Resume.
      expect(text).toMatch(/\b\d+ more credits? needed for Haiku 4\.5\./u);
      expect(buttons).toEqual(expect.arrayContaining(['Billing', 'Switch model']));
      expect(holds.holds).toHaveLength(0);
      return { outcome: 'pass', evidence };
    }),
    paymentRowTimeout,
  );

  it(
    'should refuse a gateway call with no credits with the typed shortfall [FD-03 P0]',
    matrixRow('FD-03', 'P0', async (evidence) => {
      const call = await callGateway(account.api, 'haiku');
      const holds = await readHolds(account);
      evidence.push(describeCall(call), `open holds afterwards ${holds.holds.length}`);
      expect(call.status).toBe(402);
      expect(call.refusal?.error.type).toBe('INSUFFICIENT_CREDIT');
      const details = insufficientCreditDetailsSchema.parse(call.refusal?.error.details);
      expect(details.availableCreditAtoms).toBe('0');
      expect(details.routeId).toBe(gatewayRoutes.haiku.routeId);
      expect(BigInt(details.requiredCreditAtoms) > 0n).toBe(true);
      expect(holds.holds).toHaveLength(0);
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should not answer budget_unavailable, which #431 retired [FD-04 P0]',
    matrixRow('FD-04', 'P0', async () => ({
      outcome: 'skipped',
      evidence: [
        'not run: #431 (a85b66f1) retired the pre-dispatch supplier budgets, so no route answers 503 "Model admission failed: budget_unavailable" (F-03) any more',
        'FD-03 records what a zero-credit call meets now: 402 INSUFFICIENT_CREDIT',
      ],
    })),
  );

  it(
    'should add 500 credits after a US$5 hosted Checkout payment [TU-01 P0]',
    matrixRow('TU-01', 'P0', async (evidence) => {
      const { page } = browsing;
      const { quote, reads } = await startCheckoutTopup(page, 5);
      const payment = await payInCheckout(page, { row: 'TU-01', email: account.email, cards: [testCards.visa] });
      if (!payment.isPaid) {
        return unsubmitted(page, payment, 'tu-01-checkout-stuck');
      }
      // From here the row gathers into matrixRow's list, so a throw during the poll or the reads below still
      // leaves the paid session and everything seen since in the record.
      evidence.push(`${payment.sessionId} paid with 4242; summary "${payment.summary}"`);
      const { action: topup, seconds } = await waitForSettlement(account, quote.actionId);
      paidReturns.push({ row: 'TU-01', reads });
      paid = { action: topup, summary: payment.summary, reads };
      // The page announces its first read and re-checks for only uiRecheckSeconds; the credits toast is the verdict
      // only when the page could still have seen the grant. Every toast shown stays in the evidence either way.
      const announceable = topup.state === 'fulfilled' && seconds <= uiRecheckSeconds;
      const creditsToast = announceable
        ? await waitForToast(page, /credits added/u, 10_000).catch(() => undefined)
        : undefined;
      // Read before Settings reloads the page, which starts a new toast record.
      const returnToasts = await toasts(page);
      const credits = await readCredits(account);
      const entitlements = ok(await account.api.request('GET', '/v1/billing/entitlements'), wireEntitlementsSchema);
      const settings = billingSettings(page);
      await settings.open();
      const shown =
        (await settings
          .balance()
          .textContent()
          .catch(() => null)) ?? 'no balance shown';
      evidence.push(
        `${describeAction(topup)}, ${seconds} s after return`,
        describeReads(reads),
        `toasts on the return page ${JSON.stringify(returnToasts)}`,
        ...(topup.state === 'fulfilled' && !announceable
          ? [`granted after the page's ${uiRecheckSeconds} s re-check: no credits toast expected`]
          : []),
        `available ${availableAtoms(credits)} atoms; settings shows ${shown}; hasPaymentMethod ${String(
          entitlements.hasPaymentMethod,
        )}`,
        await screenshot(page, 'tu-01-balance'),
      );
      // The row evaluated the payment, so these fail the run.
      if (topup.state === 'redirect_required') {
        // Nothing accepted the payment in 60 s: no webhook, and no recover or sweep settled the session.
        return { outcome: 'fail', defect: 'F-01', evidence };
      }
      if (settlingStates.has(topup.state)) {
        // The payment was accepted (processing, or funds received) but the grant did not follow in 60 s.
        return { outcome: 'fail', defect: 'unclassified', evidence };
      }
      expect(topup.state).toBe('fulfilled');
      expect(topup.receipt?.grantedCreditAtoms).toBe('5000000');
      expect(availableAtoms(credits)).toBe('5000000');
      expect(shown).toBe('500');
      expect(entitlements.hasPaymentMethod).toBe(true);
      if (announceable) {
        // The exact sentence the page builds from the receipt, so a wrong amount cannot pass as a substring.
        expect(creditsToast).toBe(`${formatCreditAtoms(5_000_000n)} credits added.`);
      }
      return { outcome: 'pass', evidence };
    }),
    paymentRowTimeout,
  );

  it(
    'should charge no tax to an NZ address and grant the whole principal [TX-01 P0]',
    matrixRow('TX-01', 'P0', async (evidence) => {
      if (paid === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['TU-01 left no paid top-up to read'] };
      }
      const { action, summary } = paid;
      const taxMinor = summaryTaxMinor(summary);
      const principal = BigInt(action.frozen?.principalMinor ?? '0');
      evidence.push(`Checkout summary with an Auckland address: "${summary}"`, describeAction(action));
      expect(taxMinor).toBe(0);
      expect(action.frozen?.taxMinor ?? '0').toBe('0');
      expect(action.receipt?.grantedCreditAtoms).toBe(String(principal * 10_000n));
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should settle the paid top-up through the staging webhook [WH-03 P0]',
    matrixRow('WH-03', 'P0', async (evidence) => {
      if (paid === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['TU-01 left no paid top-up to read'] };
      }
      const settledBy = returnPath(paid.reads);
      evidence.push(
        describeAction(paid.action),
        describeReads(paid.reads),
        settledBy === 'webhook'
          ? 'the return page found the payment already accepted: the webhook (or the leg sweep) settled it'
          : `settled by ${settledBy}: the return page found the session unpaid and its recover moved it on`,
      );
      expect(paid.action.state).toBe('fulfilled');
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should run the refused design once funded [FD-05 P0]',
    matrixRow('FD-05', 'P0', async (evidence): Promise<Verdict> => {
      if (projectUrl === undefined || paid?.action.state !== 'fulfilled') {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['FD-01 and TU-01 left no funded project chat'] };
      }
      const { page } = browsing;
      const chat = projectChat(page);
      await chat.open(projectUrl);
      const gateway = watchGateway(page);
      await chat.selectModel(gatewayRoutes.haiku.modelName);
      // The preflight card had no run to resume, so the customer sends the request again once funded.
      await chat.send(designPrompt);
      const first = await firstGatewayRead(page, gateway);
      const title = first?.status === 200 ? undefined : await chatCards(page).visibleTitle(30_000);
      evidence.push(
        first === undefined ? 'no gateway call within 90 s' : describeRead(first),
        `card "${title ?? 'none'}": ${title === undefined ? '' : await chatCards(page).text(title)}`,
        await screenshot(page, 'fd-05-after-topup'),
      );
      if (first?.status === 200 && first.operationId !== undefined) {
        const operation = await waitForTerminal(account.api, first.operationId, 120_000);
        evidence.push(describeOperation(operation));
        expect(operation.state).toBe('terminal');
        return { outcome: 'pass', evidence };
      }
      if (first?.refusal?.startsWith('UPSTREAM_REJECTED') === true) {
        // The provider refuses every Anthropic route on staging (F-24): admission and the hold worked, the model did not.
        return { outcome: 'blocked', defect: 'F-24', evidence };
      }
      return { outcome: 'fail', defect: 'unclassified', evidence };
    }),
    paymentRowTimeout,
  );

  it(
    'should hold, settle and record a short design on the funded pathway [FD-02 P0]',
    matrixRow('FD-02', 'P0', async (evidence): Promise<Verdict> => {
      if (paid?.action.state !== 'fulfilled') {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['TU-01 left no funded account'] };
      }
      // The program's pathway: a short design on Haiku 4.5, its hold read while the answer still streams.
      haiku = await callGateway(account.api, 'haiku', {
        prompt: designPrompt,
        maximumTokens: 400,
        whileStreaming: async () => readHolds(account),
      });
      evidence.push(`Haiku 4.5: ${describeCall(haiku)}`);
      const isUpstreamRefused = haiku.refusal?.error.type === 'UPSTREAM_REJECTED';
      let call = haiku;
      if (isUpstreamRefused) {
        // F-24: the provider refuses every Anthropic route, so GPT-6 Luna proves the same funded pathway instead.
        evidence.push(`Haiku attempt lookup: ${describeOperation(await lookupAttempt(account.api, haiku.attemptId))}`);
        call = await callGateway(account.api, 'luna', {
          prompt: 'In about 300 words, explain how to model a parametric enclosure in OpenSCAD.',
          maximumTokens: 600,
          whileStreaming: async () => readHolds(account),
        });
        evidence.push(`GPT-6 Luna: ${describeCall(call)}`);
      }
      const holds = wireOpenHoldsSchema.safeParse(call.probe);
      const held = holds.success
        ? holds.data.holds.find(({ operationId }) => operationId === call.operationId)
        : undefined;
      evidence.push(
        held === undefined
          ? 'hold not open by the time the mid-stream read answered'
          : `hold ${held.heldCreditAtoms} atoms open mid-stream (${held.dispatchState})`,
      );
      expect(call.status).toBe(200);
      expect(call.operationId).toBeDefined();
      const operation = await waitForTerminal(account.api, call.operationId ?? '', 90_000);
      evidence.push(describeOperation(operation));
      expect(operation.state).toBe('terminal');
      if (operation.state !== 'terminal') {
        return { outcome: 'fail', defect: 'unclassified', evidence };
      }
      settled = {
        call,
        operation,
        modelName: call === haiku ? gatewayRoutes.haiku.modelName : gatewayRoutes.luna.modelName,
      };
      const usage = await account.api.request('GET', '/v1/billing/usage');
      const row = JSON.stringify(usage.body).includes(operation.operationId);
      evidence.push(`usage snapshot ${usage.status}, ${row ? 'lists' : 'does not list'} ${operation.operationId}`);
      expect(operation.receipt.customerState).toBe('settled');
      expect(BigInt(operation.receipt.chargedCreditAtoms) > 0n).toBe(true);
      expect(BigInt(operation.receipt.authorizedMaxCreditAtoms) > 0n).toBe(true);
      expect(row).toBe(true);
      return isUpstreamRefused ? { outcome: 'blocked', defect: 'F-24', evidence } : { outcome: 'pass', evidence };
    }),
    paymentRowTimeout,
  );

  it(
    'should charge a funded GPT-6 Luna turn once OpenAI reports its usage [FD-12 P0]',
    matrixRow('FD-12', 'P0', async (evidence): Promise<Verdict> => {
      if (paid?.action.state !== 'fulfilled') {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['TU-01 left no funded account'] };
      }
      // The OpenAI pathway prices a cache-write dimension Anthropic's does not; Run 1 saw its hold outlive the row.
      const call = await callGateway(account.api, 'luna', {
        prompt: 'Reply with the single word OK.',
        maximumTokens: 32,
      });
      // The whole stream is the evidence of what billing had to price; the usage event alone cannot say what is missing.
      const streamFile = `${evidenceStamp()}-fd-12-luna-stream.txt`;
      await writeFile(join(runDirectory, streamFile), call.stream ?? '');
      evidence.push(
        `GPT-6 Luna: ${describeCall(call)}`,
        `final usage event: ${finalUsage(call.stream) ?? 'none in the stream'}`,
        streamFile,
      );
      expect(call.status).toBe(200);
      expect(call.operationId).toBeDefined();
      const refusal = streamRefusal(call.stream);
      /* A stream the gateway ended with its own refusal (Tau's supplier account exhausted, a rate limit) ran nothing,
       * so billing must release the hold at once, as it does a refusal before the stream (F-30). A stream with an
       * answer settles when its usage is priced; the invocation deadline is 300 s, and a turn billing cannot price
       * settles only when that runs out. */
      const operation = await waitForTerminal(
        account.api,
        call.operationId ?? '',
        refusal === undefined ? 330_000 : 60_000,
      );
      const operationFile = `${evidenceStamp()}-fd-12-luna-operation.json`;
      await writeFile(join(runDirectory, operationFile), JSON.stringify(operation, null, 2));
      evidence.push(describeOperation(operation), operationFile);
      if (refusal !== undefined) {
        evidence.push(
          `the gateway ended the stream with ${refusal.code}${refusal.providerCode === undefined ? '' : ` (${refusal.providerCode})`}`,
        );
        if (operation.state !== 'terminal') {
          evidence.push('hold still open 60 s after the failed stream');
          return { outcome: 'fail', defect: 'F-30', evidence };
        }
        if (operation.receipt.customerState !== 'released' || BigInt(operation.receipt.chargedCreditAtoms) !== 0n) {
          evidence.push(
            `a failed stream settled ${operation.receipt.customerState} at ${operation.receipt.chargedCreditAtoms} atoms instead of released at 0`,
          );
          return { outcome: 'fail', defect: 'F-30', evidence };
        }
        evidence.push(
          "Tau's supplier account refuses the route, so a priced OpenAI turn cannot be observed until it is topped up",
        );
        return { outcome: 'blocked', defect: 'H-09', evidence };
      }
      if (operation.state !== 'terminal') {
        evidence.push('still pending 330 s after the stream ended');
        return { outcome: 'fail', defect: 'F-30', evidence };
      }
      const charged = BigInt(operation.receipt.chargedCreditAtoms);
      if (operation.receipt.customerState !== 'settled' || charged <= 0n) {
        evidence.push(`billing never priced the turn: ${operation.receipt.customerState} at ${charged} atoms`);
        return { outcome: 'fail', defect: 'F-30', evidence };
      }
      return { outcome: 'pass', evidence };
    }),
    // Up to 330 s of settlement wait on top of the call itself.
    400_000,
  );

  it(
    'should explain a settled model call by its operation receipt [US-03 P1]',
    matrixRow('US-03', 'P1', async (evidence) => {
      if (settled === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['FD-02 left no settled model call'] };
      }
      const { operation } = settled;
      evidence.push(describeOperation(operation));
      expect(operation.state).toBe('terminal');
      if (operation.state === 'terminal') {
        const { receipt } = operation;
        expect(receipt.kind).toBe('base');
        expect(receipt.accountDeltaCreditAtoms).toBe(`-${receipt.chargedCreditAtoms}`);
        expect(receipt.meterItems.length).toBeGreaterThan(0);
        evidence.push(
          `meter items ${receipt.meterItems.length}, metering ${receipt.meteringStatus}, policy ${receipt.policyVersion}`,
        );
      }
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should resolve a gateway attempt id to its receipt [US-04 P1]',
    matrixRow('US-04', 'P1', async (evidence) => {
      if (settled === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['FD-02 left no settled model call'] };
      }
      const { call } = settled;
      const answer = await lookupAttempt(account.api, call.attemptId);
      evidence.push(`${settled.modelName} attempt ${call.attemptId}: ${describeOperation(answer)}`);
      expect(answer.state).toBe('terminal');
      expect(answer.state === 'terminal' ? answer.operationId : undefined).toBe(call.operationId);
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should split the balance by source and list its history [US-01 P0]',
    matrixRow('US-01', 'P0', async (evidence) => {
      if (settled === undefined || paid === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['TU-01 and FD-02 left no purchase and usage'] };
      }
      const credits = await readCredits(account);
      const { page } = browsing;
      await billingSettings(page).open();
      // The split renders once the balance loads, after the card's title.
      const splitLine = page.getByText(/ from your plan \+ .+ purchased \(never expire\)$/u);
      await isShown(splitLine, 30_000);
      const shown = (await visibleText(splitLine)) || 'no split shown';
      evidence.push(await screenshot(page, 'us-01-balance'));
      if (credits.balance === null) {
        return { outcome: 'fail', defect: 'unclassified', evidence: [...evidence, 'balance unavailable'] };
      }
      const { balance, history, journalTotals } = credits;
      const kinds = history.items.map(({ kind, accountDeltaCreditAtoms }) => `${kind} ${accountDeltaCreditAtoms}`);
      const split = `${formatCreditAtoms(BigInt(balance.planGrantCreditAtoms))} from your plan + ${formatCreditAtoms(
        BigInt(balance.purchasedCreditAtoms),
      )} purchased (never expire)`;
      evidence.push(
        `plan ${balance.planGrantCreditAtoms}, purchased ${balance.purchasedCreditAtoms}, promo ${balance.promoGrantCreditAtoms}, available ${balance.eligibleAvailableCreditAtoms}`,
        `history ${JSON.stringify(kinds)}; totals ${journalTotals.byKind.map(({ kind, accountDeltaCreditAtoms }) => `${kind} ${accountDeltaCreditAtoms}`).join(', ')}`,
        `settings shows "${shown}"`,
      );
      expect(balance.planGrantCreditAtoms).toBe('0');
      expect(
        history.items.some(
          ({ kind, accountDeltaCreditAtoms }) => kind === 'purchase_grant' && accountDeltaCreditAtoms === '5000000',
        ),
      ).toBe(true);
      expect(history.items.some(({ kind }) => kind === 'operation_resolution')).toBe(true);
      expect(shown).toBe(split);
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should show the settled call on the usage page [US-02 P0]',
    matrixRow('US-02', 'P0', async (evidence) => {
      if (settled === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['FD-02 left no settled model call'] };
      }
      const { page } = browsing;
      const usage = usagePage(page);
      await usage.open();
      const row = usage.row(new RegExp(settled.modelName.replaceAll('.', String.raw`\.`), 'u'));
      await row.waitFor({ timeout: 60_000 });
      const text = await visibleText(row);
      evidence.push(`row "${text}"`, await screenshot(page, 'us-02-usage'));
      expect(text).toContain('succeeded · settled');
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should list the design on the usage page [FD-11 P1]',
    matrixRow('FD-11', 'P1', async (evidence): Promise<Verdict> => {
      if (haiku === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['FD-02 made no Haiku call'] };
      }
      const { page } = browsing;
      await usagePage(page).open();
      const text = await pageText(page, 4000);
      evidence.push(`Haiku 4.5: ${describeCall(haiku)}`, await screenshot(page, 'fd-11-usage'));
      if (haiku.status !== 200) {
        evidence.push(
          `no Haiku design ran to list; /usage lists the GPT-6 Luna call (US-02): ${text.includes('GPT-6 Luna') ? 'yes' : 'no'}`,
        );
        return haiku.refusal?.error.type === 'UPSTREAM_REJECTED'
          ? { outcome: 'blocked', defect: 'F-24', evidence }
          : { outcome: 'fail', defect: 'unclassified', evidence };
      }
      expect(text).toContain('Haiku 4.5');
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should top up with the saved card in place, without Checkout [TU-03 P0]',
    matrixRow('TU-03', 'P0', async (evidence) => {
      if (paid?.action.state !== 'fulfilled') {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['TU-01 saved no card'] };
      }
      const { page } = browsing;
      const settings = billingSettings(page);
      const modal = topupModal(page);
      const before = BigInt(availableAtoms(await readCredits(account)));
      await settings.open();
      await settings.addCredits();
      await modal.chooseAmount(5);
      const { action: quote, requestId } = await modal.reviewWithSavedCard();
      evidence.push(`quote ${describeAction(quote)} (${requestId}): "${await modal.text()}"`);
      await assertPaymentAllowed('TU-03');
      const confirmed = Date.now();
      await modal.confirm();
      // Booked once the saved card is asked to pay, whatever the row then reads.
      await recordPayment('TU-03', quote.actionId);
      await modal.dialog.getByRole('heading', { name: 'Credits added' }).waitFor({ timeout: 60_000 });
      const seconds = (Date.now() - confirmed) / 1000;
      const text = await modal.text();
      const topup = await readAction(account, quote.actionId);
      const after = BigInt(availableAtoms(await readCredits(account)));
      savedCardReceipt = { action: topup, text };
      evidence.push(
        `${describeAction(topup)}, receipt shown ${seconds.toFixed(1)} s after Confirm quote, still on ${new URL(page.url()).origin}`,
        `available ${before} → ${after} atoms`,
        await screenshot(page, 'tu-03-saved-card'),
      );
      expect(quote.frozen?.grossMinor).not.toBeNull();
      expect(quote.frozen?.paymentMethod?.last4).toBe('4242');
      expect(topup.state).toBe('fulfilled');
      expect(after - before).toBe(5_000_000n);
      expect(new URL(page.url()).origin).toBe(baseUrl);
      if (seconds > 10) {
        return { outcome: 'fail', defect: 'unclassified', evidence: [...evidence, 'the grant took longer than 10 s'] };
      }
      return { outcome: 'pass', evidence };
    }),
    paymentRowTimeout,
  );

  it(
    'should show the receipt for a saved-card top-up [TU-14 P1]',
    matrixRow('TU-14', 'P1', async (evidence) => {
      if (savedCardReceipt === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['TU-03 left no receipt to read'] };
      }
      const { action, text } = savedCardReceipt;
      const gross = action.frozen?.grossMinor ?? '0';
      const charged = `US$${(Number(gross) / 100).toFixed(2)} charged to Visa •••• 4242`;
      evidence.push(`dialog "${text}"`);
      expect(text).toContain('Credits added');
      expect(text).toContain(`${formatCreditAtoms(BigInt(action.receipt?.grantedCreditAtoms ?? '0'))} credits added.`);
      expect(text).toContain(charged);
      await topupModal(browsing.page).dialog.getByRole('button', { name: 'Done' }).click();
      return { outcome: 'pass', evidence };
    }),
  );

  it(
    'should close an account that holds credits from Settings and refuse sign-in afterwards [AC-01 P0]',
    matrixRow('AC-01', 'P0', async (evidence) => {
      const { page } = browsing;
      const settings = billingSettings(page);
      const credits = await readCredits(account);
      await settings.open();
      await settings.closure.confirm();
      const preparing = page.waitForResponse(
        (response) => response.url().endsWith('/v1/billing/account-closure') && response.request().method() === 'POST',
      );
      await settings.closure.prepare().click();
      const prepared = await preparing;
      await page.getByText('Closure status: ready for auth deletion').waitFor();
      evidence.push(
        `available ${availableAtoms(credits)} atoms at closure`,
        `closure prepare ${prepared.status()} (${prepared.headers()['request-id'] ?? 'no request id'})`,
      );
      const deleting = page.waitForResponse((response) => response.url().endsWith('/v1/auth/delete-user'));
      await settings.closure.deleteAccount().click();
      const deletion = await deleting;
      isDeleted = deletion.ok();
      evidence.push(
        `delete-user ${deletion.status()} (${deletion.headers()['request-id'] ?? 'no request id'})`,
        await screenshot(page, 'ac-01-deleted'),
      );
      const session = await account.api.request('GET', '/v1/auth/get-session');
      const signIn = await account.api.request('POST', '/v1/auth/sign-in/email', {
        body: { email: account.email, password: account.password },
      });
      evidence.push(`get-session afterwards ${JSON.stringify(session.body)}, sign-in afterwards ${signIn.status}`);
      expect(BigInt(availableAtoms(credits)) > 0n).toBe(true);
      expect(isDeleted).toBe(true);
      expect(session.body).toBeNull();
      expect(signIn.status).toBe(401);
      return { outcome: 'pass', evidence };
    }),
  );
});

describe('3D Secure', () => {
  let account: Account;
  let browsing: Browsing;

  beforeAll(async () => {
    account = await createAccount('tu04');
    return async () => closeAccount(account);
  });

  beforeAll(async () => {
    browsing = await openBrowser(account);
    return async () => browsing.browser.close();
  });

  it(
    'should complete 3D Secure in Checkout and continue a saved-card challenge in Checkout, charging once [TU-04 P0]',
    matrixRow('TU-04', 'P0', async (evidence): Promise<Verdict> => {
      const { page } = browsing;
      // Leg 1: a new card in Checkout, challenged there.
      const first = await startCheckoutTopup(page, 5);
      const payment = await payInCheckout(page, {
        row: 'TU-04',
        email: account.email,
        cards: [testCards.threeDomainSecure],
      });
      if (!payment.isPaid) {
        return unsubmitted(page, payment, 'tu-04-checkout-stuck');
      }
      evidence.push(
        `${payment.sessionId} paid with 3184, challenge ${challenged(payment.attempts) ? 'completed' : 'not shown'}`,
      );
      const firstSettlement = await waitForSettlement(account, first.quote.actionId);
      const firstAnnounced = await returnAnnouncement(page, first.reads);
      paidReturns.push({ row: 'TU-04 Checkout', reads: first.reads });
      evidence.push(
        `${describeAction(firstSettlement.action)}; states since return ${firstSettlement.timeline}`,
        describeReads(first.reads),
        `toasts on the return page ${JSON.stringify(firstAnnounced)}`,
        await screenshot(page, 'tu-04-return'),
      );
      if (attentionAfterPayment(firstAnnounced, first.reads)) {
        // The second leg would spend the row's second payment on a journey that already failed.
        return {
          outcome: 'fail',
          defect: 'unclassified',
          evidence: [...evidence, 'paid, then told the payment needs attention'],
        };
      }
      expect(firstSettlement.action.state).toBe('fulfilled');
      // Leg 2: the saved 3184 card off session needs authentication, which only Checkout can collect.
      const settings = billingSettings(page);
      const modal = topupModal(page);
      await settings.open();
      await settings.addCredits();
      await modal.chooseAmount(5);
      const { action: quote } = await modal.reviewWithSavedCard();
      await modal.confirm();
      await modal.dialog.getByRole('button', { name: 'Continue in Checkout' }).waitFor({ timeout: 90_000 });
      const paused = await readAction(account, quote.actionId);
      evidence.push(
        `saved-card quote ${describeAction(quote)}`,
        `paused ${describeAction(paused)}: "${await modal.text()}"`,
      );
      evidence.push(await screenshot(page, 'tu-04-attention'));
      const reads = watchPaymentReads(page, quote.actionId);
      await modal.continueInCheckout();
      const continued = await payInCheckout(page, {
        row: 'TU-04',
        email: account.email,
        cards: [testCards.threeDomainSecure],
      });
      if (!continued.isPaid) {
        return unsubmitted(page, continued, 'tu-04-continue-stuck');
      }
      const { action: secondSettled } = await waitForSettlement(account, quote.actionId);
      paidReturns.push({ row: 'TU-04 continued', reads });
      const credits = await readCredits(account);
      const grants =
        credits.balance === null
          ? []
          : credits.history.items
              .filter(({ kind }) => kind === 'purchase_grant')
              .map(({ accountDeltaCreditAtoms }) => accountDeltaCreditAtoms);
      evidence.push(
        `${continued.sessionId} paid with 3184 after Continue in Checkout, challenge ${
          challenged(continued.attempts) ? 'completed' : 'not shown'
        }`,
        describeAction(secondSettled),
        describeReads(reads),
        `purchase grants ${JSON.stringify(grants)}; available ${availableAtoms(credits)} atoms`,
        'Stripe-side charges are not listed here; the ledger grants and both receipts stand in for them',
        await screenshot(page, 'tu-04-continued'),
      );
      expect(challenged(payment.attempts)).toBe(true);
      expect(challenged(continued.attempts)).toBe(true);
      expect(paused.state).toBe('attention_required');
      expect(paused.attention).toEqual({ reason: 'authentication_required', action: 'continue_hosted' });
      expect(secondSettled.state).toBe('fulfilled');
      // Two quotes, two grants: a grant for the paused attempt as well would show as a third.
      expect(grants).toEqual(['5000000', '5000000']);
      expect(availableAtoms(credits)).toBe('10000000');
      return { outcome: 'pass', evidence };
    }),
    2 * paymentRowTimeout,
  );
});

describe('declined cards', () => {
  let account: Account;
  let browsing: Browsing;
  let open: { readonly quote: WirePaymentAction; readonly reads: PaymentRead[] } | undefined;

  beforeAll(async () => {
    account = await createAccount('tu05');
    return async () => closeAccount(account);
  });

  beforeAll(async () => {
    browsing = await openBrowser(account);
    return async () => browsing.browser.close();
  });

  it(
    'should show a declined card in Checkout and grant nothing [TU-05 P0]',
    matrixRow('TU-05', 'P0', async (evidence) => {
      const { page } = browsing;
      const started = await startCheckoutTopup(page, 5);
      open = started;
      const payment = await payInCheckout(page, { row: 'TU-05', email: account.email, cards: [testCards.declined] });
      const [attempt] = payment.attempts;
      // The decline's webhook lands seconds later; the Checkout must still be open to pay, and the action resumable.
      const { action, timeline } = await waitForSettlement(account, started.quote.actionId, 30_000);
      const credits = await readCredits(account);
      evidence.push(
        `${payment.sessionId} with 0002: ${JSON.stringify(attempt)}`,
        `${describeAction(action)}; states over 30 s ${timeline}`,
        `available ${availableAtoms(credits)} atoms`,
        await screenshot(page, 'tu-05-declined'),
      );
      expect(attempt?.outcome).toBe('refused');
      expect(availableAtoms(credits)).toBe('0');
      if (action.state !== 'redirect_required') {
        // Still payable in Checkout, yet the action no longer offers Resume or Cancel and says to wait.
        return {
          outcome: 'fail',
          defect: 'unclassified',
          evidence: [...evidence, 'a decline took the open Checkout out of redirect_required'],
        };
      }
      return { outcome: 'pass', evidence };
    }),
    paymentRowTimeout,
  );

  it(
    'should accept a working card in the same Checkout after insufficient funds [TU-06 P0]',
    matrixRow('TU-06', 'P0', async (evidence): Promise<Verdict> => {
      if (open === undefined) {
        return { outcome: 'blocked', defect: 'H-03', evidence: ['TU-05 left no open Checkout'] };
      }
      const { page } = browsing;
      const payment = await payInCheckout(page, {
        row: 'TU-06',
        email: account.email,
        cards: [testCards.insufficientFunds, testCards.visa],
      });
      evidence.push(`${payment.sessionId}: ${JSON.stringify(payment.attempts)}`);
      if (!payment.isPaid) {
        return payment.attempts.at(-1)?.outcome === 'stuck'
          ? unsubmitted(page, payment, 'tu-06-checkout-stuck')
          : {
              outcome: 'fail',
              defect: 'unclassified',
              evidence: [...evidence, await screenshot(page, 'tu-06-refused')],
            };
      }
      const { action, timeline } = await waitForSettlement(account, open.quote.actionId);
      const announced = await returnAnnouncement(page, open.reads);
      paidReturns.push({ row: 'TU-06', reads: open.reads });
      const credits = await readCredits(account);
      evidence.push(
        `${describeAction(action)}; states since return ${timeline}`,
        describeReads(open.reads),
        `toasts on the return page ${JSON.stringify(announced)}`,
        `available ${availableAtoms(credits)} atoms`,
        await screenshot(page, 'tu-06-paid'),
      );
      expect(payment.attempts[0]?.outcome).toBe('refused');
      if (attentionAfterPayment(announced, open.reads)) {
        return {
          outcome: 'fail',
          defect: 'unclassified',
          evidence: [...evidence, 'paid, then told the payment needs attention'],
        };
      }
      expect(action.state).toBe('fulfilled');
      expect(availableAtoms(credits)).toBe('5000000');
      return { outcome: 'pass', evidence };
    }),
    paymentRowTimeout,
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
      body: { requestId: id, amountMinor, method: 'checkout', returnPath: billingReturnPath },
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

describe('recovering a paid Checkout', () => {
  it(
    'should let the return page recover a paid Checkout the webhook has not settled [TU-08 P0]',
    matrixRow('TU-08', 'P0', async (evidence): Promise<Verdict> => {
      for (const { row, reads } of paidReturns) {
        evidence.push(`${row}: ${returnPath(reads)}; ${describeReads(reads)}`);
      }
      const refused = paidReturns.filter(({ reads }) =>
        reads.some(({ path, status }) => path.endsWith('/recover') && status >= 400),
      );
      if (refused.length > 0) {
        // A refused recover of a paid Checkout leaves its credits to the webhook alone (F-02).
        return { outcome: 'fail', defect: 'F-02', evidence };
      }
      if (paidReturns.some(({ reads }) => returnPath(reads) === 'recover')) {
        return { outcome: 'pass', evidence };
      }
      return {
        outcome: 'skipped',
        evidence: [
          ...evidence,
          paidReturns.length === 0
            ? 'not run: no Checkout was paid in this file'
            : 'not run: the webhook had settled every paid Checkout before the return page could recover it',
        ],
      };
    }),
  );
});
