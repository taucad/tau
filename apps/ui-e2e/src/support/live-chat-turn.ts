/* oxlint-disable no-await-in-loop -- Opening one activity group at a time is how the transcript reveals the next one. */
/* oxlint-disable typescript/no-restricted-types, typescript/no-unnecessary-condition -- The live billing boundary returns explicit JSON nulls and is checked again at runtime before evidence is accepted. */
/**
 * Shared drive-and-settle helpers for the two opt-in live provider specs.
 *
 * `gemini-browser-agent-host.live.spec.ts` and `provider-switch.live.spec.ts`
 * both run the real browser agent host against the real API and real
 * providers, so they share one definition of "the turn settled": the composer's
 * Stop control is gone, no error card rendered, and the billing receipt the
 * turn produced reached `settled`/`complete`. Nothing here polls prose.
 */
import { expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { readProjectStorageState, readProjectTree } from '#support/project-storage-state.js';
import { classifyReceipts } from '#support/usage-receipt.js';
import type { UsageReceipt } from '#support/usage-receipt.js';

/** A catalog row a live spec drives: the selector/cookie id and the provider that bills it. */
export type LiveModel = {
  readonly id: string;
  readonly providerId: string;
};

/** The chat composer every live spec types into. */
export const composerSelector = '[aria-label="Ask Tau to build anything..."]';
const stopButton = (): ReturnType<typeof selectors.getByCss> =>
  selectors.getByCss('button:has(svg.lucide-square)').last();
const cookieValue = (value: unknown): string => encodeURIComponent(JSON.stringify(value));
const testPassword = 'Tau-test-password-7!';

/**
 * Fail with the transcript's tail and the page's own diagnostics rather than an
 * opaque locator timeout — a live provider refusal reaches the console with its
 * reason long before the card summarising it does.
 */
const withPageText = async (message: string, assertion: () => Promise<void>): Promise<void> => {
  try {
    await assertion();
  } catch (error) {
    const pageText = await target.evaluate(() => document.body.textContent ?? '');
    const { consoleMessages, pageErrors } = await target.events();
    const failures = [
      ...consoleMessages.filter(({ type }) => type === 'error').map(({ text }) => text),
      ...pageErrors,
    ].slice(-20);
    throw new Error(`${message}\nConsole errors:\n${failures.join('\n')}\nPage text:\n${pageText.slice(-6000)}`, {
      cause: error,
    });
  }
};

/**
 * Sign a funded test account in, pin the model and kernel, and open a new project's chat.
 *
 * @param options - The account email, the catalog model the first turn runs on, and the project name.
 */
export const openLiveChat = async (options: {
  readonly email: string;
  readonly modelId: string;
  readonly projectName: string;
}): Promise<void> => {
  await target.authenticateTauTestUser({
    creditAtoms: '100000000',
    email: options.email,
    name: 'Live provider E2E',
    password: testPassword,
  });
  await target.setViewport({ width: 1440, height: 900 });
  await target.addCookies(
    [
      ['tau-chat-model', cookieValue(options.modelId)],
      ['tau-cad-kernel', cookieValue('openscad')],
      ['tau-chat-testing-enabled', cookieValue(true)],
      ['tau-cookie-consent', cookieValue('declined')],
    ].map(([name, value]) => ({ domain: 'localhost', name: name!, path: '/', value: value! })),
  );
  await target.navigate('/projects/new');
  await target.expectVisible(selectors.getByLabelText('Project Name *'), 60_000);
  await target.fill(selectors.getByLabelText('Project Name *'), options.projectName);
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/[^/?]+\?chat=[^&]+$/u, 60_000);
  await target.waitFor(() => document.querySelector('[aria-label="Ask Tau to build anything..."]') !== null, null, {
    timeout: 60_000,
  });
};

/**
 * Switch the live chat onto another catalog row through the composer's model selector.
 *
 * Matched on `data-value`, which is the model id verbatim; the option's
 * accessible name also carries a credit affordance that an exact-name match
 * would break on.
 *
 * @param modelId - The catalog model id to select.
 */
export const selectModel = async (modelId: string): Promise<void> => {
  await target.click(selectors.getByCss(composerSelector).first());
  await target.keyboardPress('ControlOrMeta+Slash');
  await target.click(selectors.getByCss(`[role="option"][data-value="${modelId}"]`));
  await target.expectCount(selectors.getByCss('[role="option"]'), 0, 30_000);
};

const collapsedActivities = (): ReturnType<typeof selectors.getByCss> =>
  selectors.getByCss('[class*="group/chat-tool-trigger"][data-state="closed"]');

/**
 * Open every collapsed activity group in the transcript.
 *
 * A collapsed group unmounts its tool rows, so nothing about a tool call is
 * readable — or falsifiable — until its group is open.
 */
export const expandActivities = async (): Promise<void> => {
  for (let guard = 0; guard < 40; guard += 1) {
    const collapsed = await target.read(collapsedActivities());
    if (collapsed.count === 0) {
      return;
    }
    await target.click(collapsedActivities().first());
  }
  throw new Error('The transcript still has collapsed activity groups after 40 expansions.');
};

/** Assert the transcript is carrying neither error-card shape (the generic one has no `data-slot`). */
export const expectNoChatError = async (): Promise<void> => {
  await withPageText('The turn ended with a chat error.', async () => {
    await target.expectCount(selectors.getByCss('[data-slot="chat-error-card"]'), 0);
    await target.expectCount(selectors.getByRole('button', { name: 'Try again' }), 0);
  });
};

/**
 * Send one user turn and wait for it to settle.
 *
 * The composer's Stop control mounts for `submitted`/`streaming` only, so its
 * disappearance is the turn boundary; a provider failure is then read off the
 * error card rather than off streamed prose.
 *
 * @param prompt - The user message to send.
 */
export const submitTurn = async (prompt: string): Promise<void> => {
  await target.type(composerSelector, prompt);
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
  await target.expectVisible(stopButton(), 30_000);
  await target.expectCount(stopButton(), 0, 600_000);
  await expectNoChatError();
};

/**
 * Assert the assistant rendered closing prose, not just tool activity.
 *
 * Every live prompt asks for a marker line, so a turn that ended on a silent
 * tool loop (the masked-stream failure of W7) fails here.
 *
 * @param marker - The sentinel the prompt asked the assistant to close with.
 */
export const expectAssistantText = async (marker: RegExp): Promise<void> => {
  await withPageText(`The assistant never rendered ${String(marker)}.`, async () => {
    await target.expectVisible(selectors.getByText(marker).last(), 120_000);
  });
};

/**
 * Whether the API this browser talks to mounts billing.
 *
 * A self-hosted API answers 404 on the usage route and writes no receipts, so
 * there the transcript, files and revision graph are the whole proof. The
 * answer comes from the API itself, never from this runner's environment, and
 * any other refusal throws rather than skipping the receipt assertions.
 *
 * @returns `false` only when the usage route does not exist.
 */
export const billingMounted = async (): Promise<boolean> => {
  const status = await target.evaluate<number, string>(async (query) => {
    const origin = (globalThis as unknown as { ENV?: { TAU_API_URL?: string } }).ENV?.TAU_API_URL;
    if (origin === undefined) {
      throw new Error('The page did not publish TAU_API_URL.');
    }
    const response = await fetch(`${origin}${query}`, { credentials: 'include' });
    return response.status;
  }, '/v1/billing/usage?range=all_time&collection=rows&pageSize=1');
  if (status !== 404 && (status < 200 || status >= 300)) {
    throw new Error(`Billing usage returned HTTP ${String(status)}.`);
  }
  return status !== 404;
};

/** Every base usage row the signed-in account has, newest run included. */
export const readUsageReceipts = async (): Promise<readonly UsageReceipt[]> => {
  const snapshot = await target.evaluate<
    {
      readonly rows?: { readonly items: readonly UsageReceipt[] };
    },
    string
  >(async (query) => {
    // The served build publishes the API origin this browser actually talks to.
    const origin = (globalThis as unknown as { ENV?: { TAU_API_URL?: string } }).ENV?.TAU_API_URL;
    if (origin === undefined) {
      throw new Error('The page did not publish TAU_API_URL.');
    }
    const response = await fetch(`${origin}${query}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Billing usage returned HTTP ${String(response.status)}.`);
    }
    return (await response.json()) as {
      readonly rows?: { readonly items: readonly UsageReceipt[] };
    };
  }, '/v1/billing/usage?range=all_time&collection=rows&pageSize=100');
  return (snapshot.rows?.items ?? []).filter((row) => row.kind === 'base');
};

/**
 * Wait until at least `minimumCount` matching receipts were charged, and refuse an absorbed one.
 *
 * The floor is over the *settled* receipts rather than over every match: a turn
 * that recovered from a transient provider refusal writes a `released` receipt
 * for the same model beside the charged ones, and failing on it would call a
 * correct run a defect (`classifyReceipts`).
 *
 * @param match - Which receipts this assertion owns (by provider or provider-side model).
 * @param minimumCount - How many charged receipts the turns so far must have produced.
 * @returns The charged receipts.
 */
export const expectSettledReceipts = async (
  match: (receipt: UsageReceipt) => boolean,
  minimumCount: number,
): Promise<readonly UsageReceipt[]> => {
  let verdict = classifyReceipts([], match);
  await expect
    .poll(
      async () => {
        verdict = classifyReceipts(await readUsageReceipts(), match);
        return verdict.settled.length;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThanOrEqual(minimumCount);
  // Tau paying for the call instead of the customer is a defect in its own right, never a recovery.
  expect(verdict.absorbed.map((receipt) => receipt.operationId)).toEqual([]);
  for (const receipt of verdict.settled) {
    expect(BigInt(receipt.tokens.output!)).toBeGreaterThanOrEqual(BigInt(receipt.tokens.reasoning ?? '0'));
  }
  return verdict.settled;
};

/** The live project's physical file tree, read through the backend its durable config names. */
export const readActiveProjectTree = async (): Promise<Readonly<Record<string, string>>> => {
  const storage = await readProjectStorageState();
  const config = storage.configs.at(-1);
  if (!config) {
    throw new Error('The live project has no filesystem configuration.');
  }
  return readProjectTree(config);
};
