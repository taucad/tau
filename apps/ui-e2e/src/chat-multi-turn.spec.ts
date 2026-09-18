/**
 * Multi-turn admission on the browser placement.
 *
 * The regression these rows exist for: after one completed browser-placed turn,
 * every later turn of that chat was refused with `Run … has already been
 * admitted` and ended as *Work interrupted*, because the page abandoned the new
 * turn's revision lease while settling the previous run and the root's
 * `turn.failed` was written under the new run id before the host admitted it.
 *
 * Each row asserts three things, because any one of them alone passed while the
 * chat was broken: the provider was reached again, the console carries no
 * admission refusal, and every run in the chat's durable log is admitted before
 * anything settles it.
 *
 * *Try again* on an error card is the fifth admission route (`continueChat` →
 * a bodyless `continue`), and the rows below drive it: it is the one verb that
 * derives its own rewind point, and it derived the wrong one for every turn
 * after the first.
 */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
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

const reply = (text: string, extra: Partial<GatewayScriptTurn> = {}): GatewayScriptTurn => ({
  text,
  usage: { inputTokens: 20, outputTokens: 4 },
  ...extra,
});

const twoTurnScript: readonly GatewayScriptTurn[] = [reply('Reply one.'), reply('Reply two.')];

/** One durable record, as far as these rows read it. */
type LogRecord = Readonly<{ runId: string; type: string; state?: string; reason?: string }>;

/** Every record of one chat's durable log, oldest first. */
const chatLog = async (chatId: string): Promise<readonly LogRecord[]> => {
  const text = await readHomeGlobText(`/*/.tau/chats/${chatId}/events.jsonl`);
  return (text ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogRecord);
};

const settlementTypes = new Set(['turn.finalized', 'turn.conflicted', 'turn.failed']);

/**
 * How one run sits against the log's admission invariant.
 *
 * The invariant is *settlement follows admission*, not "admission is the first
 * record": a rewinding trigger writes its `history.rewound` from inside the
 * same `admit` call, ahead of the lifecycle row, so an edit's run legitimately
 * opens with the rewind. What an abandoned lease did is the thing being
 * excluded — it wrote `turn.failed` under a run id the host had never admitted,
 * and the host then read that record as proof the run *was* admitted.
 */
const admissionOrderOf = (
  records: readonly LogRecord[],
  runId: string,
): Readonly<{ runId: string; isAdmitted: boolean; settlesAfterAdmission: boolean; settlements: number }> => {
  const own = records.filter((record) => record.runId === runId);
  const admission = own.findIndex((record) => record.type === 'run.lifecycle' && record.state === 'admitted');
  const settlement = own.findIndex((record) => settlementTypes.has(record.type));
  return {
    runId,
    isAdmitted: admission !== -1,
    settlesAfterAdmission: settlement === -1 || (admission !== -1 && settlement > admission),
    /* V10: an admitted run has exactly one settlement. Zero was the common
     * case for a refused or cancelled run — whether one was written depended
     * on whether the revision root answered before the stream closed. */
    settlements: own.filter((record) => settlementTypes.has(record.type)).length,
  };
};

/**
 * The settlement each run of one chat ended with, oldest run first.
 *
 * `expectLogInvariant` counts settlements without reading their kind, because a
 * stopped or refused run settles as `turn.failed` and still settles exactly
 * once. A row that drives turns it expects to *record* asserts the kind here.
 */
const settlementKinds = async (chatId: string): Promise<readonly string[]> => {
  const records = await chatLog(chatId);
  const runIds = [...new Set(records.map((record) => record.runId))];
  return runIds.map(
    (runId) => records.find((record) => record.runId === runId && settlementTypes.has(record.type))?.type ?? 'none',
  );
};

const expectLogInvariant = async (chatId: string, expectedRuns: number): Promise<void> => {
  const records = await chatLog(chatId);
  const runIds = [...new Set(records.map((record) => record.runId))];
  expect(runIds).toHaveLength(expectedRuns);
  expect(runIds.map((runId) => admissionOrderOf(records, runId))).toEqual(
    runIds.map((runId) => ({ runId, isAdmitted: true, settlesAfterAdmission: true, settlements: 1 })),
  );
};

/**
 * Every way an admission is refused, as the page reports it.
 *
 * One list rather than one assertion per row: each of these ended a turn as
 * *Work interrupted* at some point in this capability's history, and a row
 * that only excluded the refusal it was written for stayed green through the
 * next one.
 */
const admissionRefusals = [
  /* The chat's host registration was empty when a rewinding dispatch ran (F1). */
  'is not configured',
  /* The rewind point named a turn the durable log had moved past (F2). */
  'strict history prefix',
  'HISTORY_PREFIX_INVALID',
  /* The same run id admitted twice. */
  'already been admitted',
  /* A lease taken for a turn whose previous run was still retiring (F7). */
  'TURN_ALREADY_LEASED',
  /* A settlement written under a run the durable log never admitted. */
  'SETTLEMENT_WITHOUT_RUN',
];

const expectNoAdmissionRefusal = async (): Promise<void> => {
  const { consoleMessages, pageErrors } = await target.events();
  const refused = (text: string): boolean => admissionRefusals.some((marker) => text.includes(marker));
  expect(consoleMessages.filter((message) => refused(message.text)).map((message) => message.text)).toEqual([]);
  expect(pageErrors.filter((error) => refused(JSON.stringify(error))).map((error) => JSON.stringify(error))).toEqual(
    [],
  );
};

const gatewayRequestCount = async (): Promise<number> => {
  const requests = await target.readAgentHostGatewayRequests();
  return requests.length;
};

/** Open the chat fixture with a scripted gateway and pick the fixture's wire model. */
const openChat = async (script: readonly GatewayScriptTurn[]): Promise<string> => {
  await prepareComposerPage();
  await target.installAgentHostGatewayFixture(script);
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await dismissCookies();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await selectModel(pdfModelName);
  const { chatIds } = await seededChatIds();
  return chatIds[0]!;
};

/** Send the first message and wait out its reply and its revision. */
const completeFirstTurn = async (): Promise<void> => {
  await sendDraft('First plain message.');
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  await target.expectVisible(selectors.getByText(/Rev 1 saved/u).first(), 60_000);
  await expect.poll(gatewayRequestCount, { timeout: 30_000 }).toBe(1);
};

/** Edit the first user message in place and send it. */
const editFirstMessage = async (suffix: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: /First plain message/u }).first());
  const editComposer = selectors.getByCss(`article ${composerSelector}`).first();
  await target.expectVisible(editComposer, 30_000);
  await target.type(editComposer, suffix);
  await target.press(editComposer, 'Enter');
};

/** Refuse the next provider call, send `text`, and wait for the error card. */
const sendRefused = async (text: string): Promise<void> => {
  await target.setAgentHostGatewayFailure({ status: 400, message: 'Refused once.' });
  await sendDraft(text);
  await target.expectVisible(selectors.getByRole('button', { name: 'Try again' }), 120_000);
  await target.setAgentHostGatewayFailure();
};

/** Press the error card's *Try again* — the fifth admission route. */
const tryAgain = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Try again' }));
};

/** The user text of every provider call this fixture captured, oldest first. */
const gatewayUserTexts = async (): Promise<readonly string[]> => {
  const requests = (await target.readAgentHostGatewayRequests()) as ReadonlyArray<
    Readonly<{ messages?: ReadonlyArray<Readonly<{ role?: string; content?: unknown }>> }>
  >;
  return requests.map((request) =>
    JSON.stringify(request.messages?.findLast((message) => message.role === 'user')?.content ?? null),
  );
};

test('sends a second plain message after a completed turn', async () => {
  const chatId = await openChat(twoTurnScript);
  await completeFirstTurn();

  await sendDraft('Second plain message.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId, 2);
});

test('sends an edit of the first message after a completed turn', async () => {
  const chatId = await openChat(twoTurnScript);
  await completeFirstTurn();

  await target.click(selectors.getByRole('button', { name: /First plain message/u }).first());
  const editComposer = selectors.getByCss(`article ${composerSelector}`).first();
  await target.expectVisible(editComposer, 30_000);
  await target.type(editComposer, ' Edited.');
  await target.press(editComposer, 'Enter');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId, 2);
});

test('sends a new message after stopping a gated turn', async () => {
  const chatId = await openChat([reply('Reply one.', { gated: true }), reply('Reply two.')]);
  await sendDraft('First plain message.');
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  await target.click(selectors.getByCss('button:has(svg.lucide-square)').last());
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await target.releaseAgentHostGatewayFixture();

  await sendDraft('Second plain message.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  /* The settlement of the second turn is written when that turn ends, so the
   * log invariant is only meaningful once its reply has landed. */
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId, 2);
});

test('sends a second message after reloading a completed chat', async () => {
  const chatId = await openChat(twoTurnScript);
  await completeFirstTurn();

  await target.reload();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 60_000);
  await selectModel(pdfModelName);
  await sendDraft('Second plain message.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId, 2);
});

test('sends a third message after two completed turns', async () => {
  const chatId = await openChat([reply('Reply one.'), reply('Reply two.'), reply('Reply three.')]);
  await completeFirstTurn();

  await sendDraft('Second plain message.');
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await sendDraft('Third plain message.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply three.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId, 3);
});

/*
 * The six rows below are this capability's closeout (W1). Each drives a gesture
 * interleaving the first sweep never pressed, and each failed before the waves
 * that own it landed.
 */

test('edits a turn after retrying a refused one', async () => {
  const chatId = await openChat([reply('Reply one.'), reply('Reply two.')]);
  await sendRefused('First plain message.');

  await tryAgain();
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  await target.expectVisible(selectors.getByText(/Rev 1 saved/u).first(), 60_000);

  await editFirstMessage(' Edited.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId, 3);
});

test('edits twice in a row after a completed turn', async () => {
  const chatId = await openChat([reply('Reply one.'), reply('Reply two.'), reply('Reply three.')]);
  await completeFirstTurn();

  await editFirstMessage(' Edited.');
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);

  await editFirstMessage(' Again.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply three.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId, 3);
  /* An edit rewinds the turn and records it again: the revision ordinal the
   * card shows does not move, so what says the work was recorded is the
   * settlement kind, per run. */
  await expect
    .poll(async () => settlementKinds(chatId), { timeout: 60_000 })
    .toEqual(['turn.finalized', 'turn.finalized', 'turn.finalized']);
});

test('retries a refused turn that follows a completed one', async () => {
  const chatId = await openChat([reply('Reply one.'), reply('Reply two.')]);
  await completeFirstTurn();
  await sendRefused('Second plain message.');

  await tryAgain();

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  /* The rewind point of a *Try again* is the last **user** message. Deriving it
   * from the last assistant message retained the prefix before turn 1 and sent
   * turn 2's text, which the host refused as an invalid history prefix (F2). */
  const texts = await gatewayUserTexts();
  expect(texts.at(-1)).toContain('Second plain message.');
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId, 3);
});

test('retries a refused turn twice', async () => {
  const chatId = await openChat([reply('Reply one.')]);
  await sendRefused('First plain message.');

  await target.setAgentHostGatewayFailure({ status: 400, message: 'Refused twice.' });
  await tryAgain();
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByRole('button', { name: 'Try again' }), 120_000);
  await target.setAgentHostGatewayFailure();

  await tryAgain();

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  /* The third attempt is the one that records a revision, and its settlement
   * is written with it — the log invariant is only meaningful once it has. */
  await target.expectVisible(selectors.getByText(/Rev 1 saved/u).first(), 60_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId, 3);
});

test('edits a turn before its revision is saved', async () => {
  const chatId = await openChat([reply('Reply one.'), reply('Reply two.')]);
  await sendDraft('First plain message.');
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);

  /* Deliberately *not* waiting for `Rev 1 saved`: the previous run's turn actor
   * is still retiring, and the edit leases the same turn id. The root now
   * queues that admission until the hold clears instead of refusing it (F7). */
  await editFirstMessage(' Edited.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId, 2);
});

test('sends again after navigating away mid-turn and back', async () => {
  const chatId = await openChat([reply('Reply one.', { gated: true }), reply('Reply two.')]);
  await sendDraft('First plain message.');
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  const projectUrl = new URL(await target.currentUrl());

  await target.navigate('/');
  await target.expectUrl(/\/$|\/\?/u, 60_000);
  await target.navigate(`${projectUrl.pathname}${projectUrl.search}`);
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await target.releaseAgentHostGatewayFixture();
  await selectModel(pdfModelName);

  await sendDraft('Second plain message.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId, 2);
});
