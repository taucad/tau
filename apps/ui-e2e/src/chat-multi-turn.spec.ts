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
 * Retry is not covered here: `useCadChatClient`'s `retry` and `regenerateTail`
 * verbs have no caller in the current transcript UI, so there is no control to
 * drive. Their admission path is `withWorkspace` → `prepare`, which the edit
 * row below exercises.
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
): Readonly<{ runId: string; isAdmitted: boolean; settlesAfterAdmission: boolean }> => {
  const own = records.filter((record) => record.runId === runId);
  const admission = own.findIndex((record) => record.type === 'run.lifecycle' && record.state === 'admitted');
  const settlement = own.findIndex((record) => settlementTypes.has(record.type));
  return {
    runId,
    isAdmitted: admission !== -1,
    settlesAfterAdmission: settlement === -1 || (admission !== -1 && settlement > admission),
  };
};

const expectLogInvariant = async (chatId: string, expectedRuns: number): Promise<void> => {
  const records = await chatLog(chatId);
  const runIds = [...new Set(records.map((record) => record.runId))];
  expect(runIds).toHaveLength(expectedRuns);
  expect(runIds.map((runId) => admissionOrderOf(records, runId))).toEqual(
    runIds.map((runId) => ({ runId, isAdmitted: true, settlesAfterAdmission: true })),
  );
};

const expectNoAdmissionRefusal = async (): Promise<void> => {
  const { consoleMessages, pageErrors } = await target.events();
  expect(consoleMessages.filter((message) => message.text.includes('already been admitted'))).toEqual([]);
  expect(pageErrors.filter((error) => JSON.stringify(error).includes('already been admitted'))).toEqual([]);
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
