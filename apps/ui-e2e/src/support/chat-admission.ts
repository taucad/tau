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
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import type { ChatLogExpectation, LogRecord } from '#support/chat-admission-log.js';
import { foldChatLog, shapeOf } from '#support/chat-admission-log.js';
import {
  composerSelector,
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
 * The settlement each run of one chat ended with, oldest run first.
 *
 * @param chatId - The chat to read.
 * @returns One kind per run, `'none'` for a run that never settled.
 */
export const settlementKinds = async (chatId: string): Promise<readonly string[]> => {
  const records = await chatLog(chatId);
  return [...new Set(records.map((record) => record.runId))].map((runId) => shapeOf(records, runId).settlement);
};

/**
 * Assert the admission and attempt invariants over one chat's log, waiting for
 * them to hold.
 *
 * The last run's settlement is written as its turn leaves `finishing`, a moment
 * after its reply is on screen, so a single read races it: every row of this
 * file failed with `settlements: 0` on the last run when the machine was
 * loaded. Waiting cannot hide a missing settlement — a run that never settles
 * still fails the row, it just takes the timeout to say so.
 *
 * @param chatId - The chat to read.
 * @param expected - The run count, or the full expectation.
 * @returns Nothing.
 */
export const expectLogInvariant = async (chatId: string, expected: number | ChatLogExpectation): Promise<void> => {
  const wanted: ChatLogExpectation = typeof expected === 'number' ? { runs: expected } : expected;
  await expect
    .poll(async () => foldChatLog(await chatLog(chatId), wanted), { timeout: 60_000 })
    .toEqual({
      runs: wanted.runs,
      ...(wanted.settlements === undefined ? {} : { settlements: wanted.settlements }),
      ...(wanted.executions === undefined ? {} : { executions: wanted.executions }),
      violations: [],
    });
};

/*
 * W1: this is `agentHostRefusalCodes` (`packages/agent-host/src/host/tau-agent-host.ts`),
 * re-exported as the wire contract by `libs/chat/src/types/agent-host-refusal.types.ts`.
 * Swap these two declarations for
 *
 *   import { agentHostRefusalCodes } from '@taucad/chat';
 *   export { agentHostRefusalCodes as admissionRefusalCodes };
 *
 * once that module resolves — the point of a union is that a new code is
 * excluded here by construction, which a copy cannot do. It is still a copy
 * only because W1 landed after this file and does not typecheck yet
 * (`Cannot find module '@taucad/agent-host'`). The ten names are identical.
 */
export const admissionRefusalCodes = [
  'CHAT_RUN_LIVE',
  'RUN_ID_TAKEN',
  'RESUME_UNAVAILABLE',
  'RUN_ABANDONED',
  'HISTORY_PREFIX_INVALID',
  'SETTLEMENT_CONFLICT',
  'SETTLEMENT_WITHOUT_RUN',
  'TURN_ALREADY_LEASED',
  'LEADERSHIP_LOST',
  'NO_RUN_ADMITTED',
] as const;

/** One way an admission is refused. */
export type AdmissionRefusalCode = (typeof admissionRefusalCodes)[number];

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
  const editComposer = selectors.getByCss(`article ${composerSelector}`).first();
  await target.expectVisible(editComposer, 30_000);
  await target.type(editComposer, suffix);
  await target.press(editComposer, 'Enter');
};

/**
 * Refuse the next provider call, send `text`, and wait for the error card.
 *
 * @param text - The message to send.
 * @returns Nothing.
 */
export const sendRefused = async (text: string): Promise<void> => {
  await target.setAgentHostGatewayFailure({ status: 400, message: 'Refused once.' });
  await sendDraft(text);
  await target.expectVisible(selectors.getByRole('button', { name: 'Try again' }), 120_000);
  await target.setAgentHostGatewayFailure();
};

/**
 * Press the error card's *Try again* — the fifth admission route.
 *
 * @returns Nothing.
 */
export const tryAgain = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Try again' }));
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
