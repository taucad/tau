/**
 * The admission vertical's shared reads and gestures.
 *
 * `chat-multi-turn.spec.ts` and the gesture sweep grew two copies of these
 * ~110 lines, and the copies had already diverged — the sweep's `admissionRefusals`
 * was a stale list, which is exactly how the capability's own comment says a row
 * "stayed green through the next one". One owner, both halves (blueprint
 * Finding 10; T5 defect 4).
 */
import { expect } from 'vitest';
import { agentHostRefusalCodes } from '@taucad/agent-host';
import type { AgentHostRefusalCode } from '@taucad/agent-host';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import type { ChatLogExpectation, LogRecord } from '#support/chat-admission-log.js';
import { foldChatLog } from '#support/chat-admission-log.js';
import {
  composerSelector,
  editComposerSelector,
  dismissCookies,
  pdfModelName,
  prepareComposerPage,
  readHomeGlobText,
  seededChatIds,
  selectModel,
  sendDraft,
} from '#support/chat-attachments.js';

/**
 * A scripted plain-text assistant turn.
 *
 * @param text - The reply the turn streams.
 * @param extra - Any other scripted field, `gated` above all.
 * @returns The scripted turn.
 */
export const reply = (text: string, extra: Partial<GatewayScriptTurn> = {}): GatewayScriptTurn => ({
  text,
  usage: { inputTokens: 20, outputTokens: 4 },
  ...extra,
});

/**
 * Every record of one chat's durable log, oldest first.
 *
 * @param chatId - The chat whose log to read.
 * @returns Its records.
 */
export const chatLog = async (chatId: string): Promise<readonly LogRecord[]> => {
  const text = await readHomeGlobText(`/*/.tau/chats/${chatId}/events.jsonl`);
  return (text ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogRecord);
};

/**
 * Assert the admission and attempt invariants over one chat's log, waiting for
 * them to hold.
 *
 * The last attempt's settlement is written as its turn leaves `finishing`, a
 * moment after its reply is on screen, so a single read races it: every row of
 * this file failed with `settlements: 0` on the last run when the machine was
 * loaded. Waiting cannot hide a missing settlement — an attempt that never
 * settles still fails the row, it just takes the timeout to say so.
 *
 * @param chatId - The chat to read.
 * @param expected - The run count, or the full expectation.
 * @returns Nothing.
 */
export const expectLogInvariant = async (chatId: string, expected: number | ChatLogExpectation): Promise<void> => {
  const wanted: ChatLogExpectation = typeof expected === 'number' ? { runs: expected } : expected;
  await expect
    .poll(async () => foldChatLog(await chatLog(chatId), wanted), { timeout: wanted.timeoutMilliseconds ?? 60_000 })
    .toEqual({
      runs: wanted.runs,
      ...(wanted.settlements === undefined ? {} : { settlements: wanted.settlements }),
      ...(wanted.attempts === undefined ? {} : { attempts: wanted.attempts }),
      violations: [],
    });
};

/* The host owns the union, so a new code is excluded here by construction. */
export const admissionRefusalCodes = agentHostRefusalCodes;

/** One way an admission is refused. */
export type AdmissionRefusalCode = AgentHostRefusalCode;

/*
 * W1/W5: refusals that still travel as prose only. Each ended a turn as *Work
 * interrupted* at some point in this capability's history and none of them has
 * a code yet, so the union above cannot exclude them. Delete each line as its
 * owner gives it a code.
 */
export const uncodedAdmissionRefusals = [
  /* The chat's host registration was empty when a rewinding dispatch ran (F1). */
  'is not configured',
  /* The durable live-run refusal, thrown bare by `tau-agent-host` (T5 P1 #4). */
  'has a non-terminal run',
  /* Page-side, `chat-host-binding.ts` (T5 (d)). */
  'This turn was replaced before it started.',
  'This chat is not ready to run a turn yet.',
] as const;

/**
 * Assert that no admission was refused while the row ran.
 *
 * One list rather than one assertion per row: a row that only excluded the
 * refusal it was written for stayed green through the next one.
 *
 * @param allowed - Codes this row drives on purpose, so they are not failures.
 * @returns Nothing.
 */
export const expectNoAdmissionRefusal = async (allowed: readonly AdmissionRefusalCode[] = []): Promise<void> => {
  const markers = [...admissionRefusalCodes.filter((code) => !allowed.includes(code)), ...uncodedAdmissionRefusals];
  const { consoleMessages, pageErrors } = await target.events();
  const refused = (text: string): boolean => markers.some((marker) => text.includes(marker));
  expect(consoleMessages.filter((message) => refused(message.text)).map((message) => message.text)).toEqual([]);
  expect(pageErrors.filter((error) => refused(JSON.stringify(error))).map((error) => JSON.stringify(error))).toEqual(
    [],
  );
};

/**
 * How many provider calls the gateway fixture has captured.
 *
 * @returns The cumulative count, refused calls included.
 */
export const gatewayRequestCount = async (): Promise<number> => {
  const requests = await target.readAgentHostGatewayRequests();
  return requests.length;
};

/**
 * Fresh provider asks per turn, in the order the turns were first asked.
 *
 * The contract a row wants is *one ask per attempt*: a turn re-asked after a
 * reload is a second charge, and a cumulative total cannot say so because a
 * later turn's own call satisfies the same `>=`.
 *
 * @returns One `{ turn, asks }` per turn.
 */
export const gatewayAsksByTurn = async (): Promise<ReadonlyArray<{ readonly turn: string; readonly asks: number }>> => {
  const { turns } = await target.readAgentHostGatewayState();
  return turns.map(({ turn, asks }) => ({ turn, asks }));
};

/**
 * How many provider requests are parked at a fixture gate right now.
 *
 * @returns The pending count.
 */
export const gatewayPendingCount = async (): Promise<number> => {
  const { parked } = await target.readAgentHostGatewayState();
  return parked.length;
};

/**
 * The user text of every provider call this fixture captured, oldest first.
 *
 * @returns One JSON-stringified content per call.
 */
export const gatewayUserTexts = async (): Promise<readonly string[]> => {
  const requests = (await target.readAgentHostGatewayRequests()) as ReadonlyArray<
    Readonly<{ messages?: ReadonlyArray<Readonly<{ role?: string; content?: unknown }>> }>
  >;
  return requests.map((request) =>
    JSON.stringify(request.messages?.findLast((message) => message.role === 'user')?.content ?? null),
  );
};

/**
 * Open the chat fixture with a scripted gateway and pick the fixture's wire model.
 *
 * @param script - The scripted assistant turns.
 * @param query - Extra fixture query, e.g. `'?chats=2'`.
 * @returns The seeded chat ids.
 */
export const openChat = async (script: readonly GatewayScriptTurn[], query = ''): Promise<readonly string[]> => {
  await prepareComposerPage();
  await target.installAgentHostGatewayFixture(script);
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate(`/__e2e/chat-attachments${query}`);
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await dismissCookies();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await selectModel(pdfModelName);
  const { chatIds } = await seededChatIds();
  return chatIds;
};

/**
 * Send the first message and wait out its reply and its revision.
 *
 * @returns Nothing.
 */
export const completeFirstTurn = async (): Promise<void> => {
  await sendDraft('First plain message.');
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  await target.expectVisible(selectors.getByText(/Rev 1 saved/u).first(), 60_000);
  await expect.poll(gatewayRequestCount, { timeout: 30_000 }).toBe(1);
};

/**
 * Edit the first user message in place and send it.
 *
 * @param suffix - Text appended to the message before it is sent.
 * @returns Nothing.
 */
export const editFirstMessage = async (suffix: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: /First plain message/u }).first());
  const editComposer = selectors.getByCss(editComposerSelector).first();
  await target.expectVisible(editComposer, 30_000);
  await target.type(editComposer, suffix);
  await target.press(editComposer, 'Enter');
};

/**
 * The error card's one continuing action.
 *
 * A refusal the host can resume reads *Resume* (the paused-turn card); one it
 * cannot reads *Try again*. Both press the same gesture, and which it is
 * belongs to the row's assertions, not here — so one locator, owned here rather
 * than copied into each spec that waits for the card.
 */
export const continueAction = selectors.getByRole('button', { name: /^(?:Resume|Try again)$/u });

/**
 * Refuse the next provider call with a refusal a resume can continue, send
 * `text`, and wait for the saved-turn card.
 *
 * `INVALID_REQUEST` is the gateway's own code for a call it will not make, and
 * it is in `resumableRunFailureCodes` — so the turn stays whole, the card reads
 * *Resume* and the continuation runs under the run the host still holds (I1).
 * The fixture's default refusal carries the upstream provider's `api_error`,
 * which maps to `UNKNOWN_GATEWAY_ERROR` and is *not* resumable; a row that
 * means to drive the rewind arms that one itself.
 *
 * @param text - The message to send.
 * @returns Nothing.
 */
export const sendRefused = async (text: string): Promise<void> => {
  await target.setAgentHostGatewayFailure({ status: 400, message: 'Refused once.', type: 'INVALID_REQUEST' });
  await sendDraft(text);
  await target.expectVisible(continueAction, 120_000);
  await target.setAgentHostGatewayFailure();
};

/**
 * Press the error card's *Try again* — the fifth admission route.
 *
 * @returns Nothing.
 */
export const tryAgain = async (): Promise<void> => {
  await target.click(continueAction);
};

/**
 * Click the named chat in the sidebar and wait for it to become the active row.
 *
 * @param name - The chat's sidebar label.
 * @returns Nothing.
 */
export const switchToChat = async (name: string): Promise<void> => {
  await target.click(selectors.getByRole('link', { name, exact: true }));
  await expect
    .poll(async () =>
      target.evaluate(
        (expected) =>
          [...document.querySelectorAll<HTMLElement>('[data-slot="chat-trigger"]')]
            .find((row) => row.dataset['active'] === 'true')
            ?.querySelector('a')
            ?.textContent.trim() === expected,
        name,
      ),
    )
    .toBe(true);
};
