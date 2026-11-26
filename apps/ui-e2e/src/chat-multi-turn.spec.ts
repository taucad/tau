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
 * chat was broken: the provider was asked once per *attempt*, the console
 * carries no admission refusal, and every run in the chat's durable log is
 * admitted before the settlements its attempts earned.
 *
 * The resume and queued-gesture rows are in `chat-multi-turn-resume.spec.ts`:
 * the vertical was split in two so each file fits one shadow row of the CI
 * decomposition (DC-25, at most 6.5 minutes of specs per row).
 *
 * Every attempt that was placed settles `turn.finalized`, whatever its run's
 * lifecycle says: a refused call, an abandoned run and a stop all complete with
 * `cut: true` (`chat-run.machine.ts` `unsettled`, 1d488bdf66; RM-R13 *every
 * completion cuts*, a3775bd976), and a held lease a new page adopts is cut too
 * (TS-Q5). A refused attempt's settlement names no revision because it changed
 * nothing. Only an attempt released before it was placed records `turn.failed`,
 * and no row here reaches one — so which attempts ended badly is the run
 * lifecycle's to say, and the attempt counts below say it.
 *
 * Every read and gesture comes from `#support/chat-admission.js`. The sweep that
 * used to live in `zz-gesture-sweep.spec.ts` kept its own diverging copy of them
 * and stayed green through a refusal the copy had never heard of (blueprint
 * Finding 10; T5 defect 4), so there is one owner and the promoted rows are
 * here.
 */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { composerSelector, pdfModelName, readHomeGlobText, selectModel, sendDraft } from '#support/chat-attachments.js';
import {
  chatLog,
  completeFirstTurn,
  editFirstMessage,
  expectAsksByTurn,
  expectFinalizedTurns,
  expectLogInvariant,
  expectNoAdmissionRefusal,
  gatewayRequestCount,
  openChat,
  reply,
  switchToChat,
  twoTurnScript,
} from '#support/chat-admission.js';

test('sends a second plain message after a completed turn', async () => {
  const [chatId] = await openChat(twoTurnScript);
  await completeFirstTurn(chatId!);

  await sendDraft('Second plain message.');

  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectAsksByTurn([
    ['First plain message.', 1],
    ['Second plain message.', 1],
  ]);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
});

test('sends an edit of the first message after a completed turn', async () => {
  const [chatId] = await openChat(twoTurnScript);
  await completeFirstTurn(chatId!);

  await editFirstMessage(' Edited.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
});

test('sends a new message after stopping a gated turn', async () => {
  const [chatId] = await openChat([reply('Reply one.', { gated: true }), reply('Reply two.')]);
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
  /* Every completion cuts (RM-R13, `turn.machine.ts`), a stop included, so the
   * stopped run settles `turn.finalized`; it changed no file, so its settlement
   * names no revision. A release, not a stop, is what records `turn.failed`. */
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
  const records = await chatLog(chatId!);
  const stopped = records.find((record) => record.type === 'turn.finalized');
  expect(stopped?.revisionId).toBeUndefined();
});

test('shows the revision of a turn stopped after it changed files', async () => {
  const [chatId] = await openChat([
    reply('The proof file is written.', {
      toolCalls: [
        { name: 'create_file', args: { targetFile: 'interrupted-proof.txt', content: 'saved before stop\n' } },
      ],
    }),
    reply('Checking the saved file.', { gated: true }),
  ]);
  await sendDraft('First plain message.');
  await target.waitForAgentHostGatewayGate({ kind: 'stream', turn: 'First plain message.' }, 120_000);
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);

  await target.click(selectors.getByCss('button:has(svg.lucide-square)').last());
  await target.expectVisible(selectors.getByText(/Saved · stopped early/u).first(), 120_000);
  await expectLogInvariant(chatId!, { runs: 1, settlements: ['turn.finalized'] });
  expect(await readHomeGlobText('/*/interrupted-proof.txt')).toBe('saved before stop\n');
  const records = await chatLog(chatId!);
  const finalized = records.find((record) => record.type === 'turn.finalized');
  expect(finalized?.revisionId).toBeDefined();
  expect(finalized?.changedPaths).toContain('interrupted-proof.txt');
  await target.releaseAgentHostGatewayFixture('First plain message.');
  await expectAsksByTurn([['First plain message.', 1]]);
});

test('sends a second message after reloading a completed chat', async () => {
  const [chatId] = await openChat(twoTurnScript);
  await completeFirstTurn(chatId!);

  await target.reload();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 60_000);
  await selectModel(pdfModelName);
  await sendDraft('Second plain message.');

  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  /* Run 1 is terminal before the reload, so nothing may re-ask it: a second ask
   * of turn 1 is the reload double charge this file exists to exclude. */
  await expectAsksByTurn([
    ['First plain message.', 1],
    ['Second plain message.', 1],
  ]);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
});

test('sends a third message after two completed turns', async () => {
  const [chatId] = await openChat([reply('Reply one.'), reply('Reply two.'), reply('Reply three.')]);
  await completeFirstTurn(chatId!);

  await sendDraft('Second plain message.');
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await sendDraft('Third plain message.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply three.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, {
    runs: 3,
    settlements: ['turn.finalized', 'turn.finalized', 'turn.finalized'],
  });
});

/*
 * The rows below drive gesture interleavings the first sweep never pressed, and
 * each failed before the waves that own it landed.
 */

test('edits twice in a row after a completed turn', async () => {
  const [chatId] = await openChat([reply('Reply one.'), reply('Reply two.'), reply('Reply three.')]);
  await completeFirstTurn(chatId!);

  await editFirstMessage(' Edited.');
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);

  await editFirstMessage(' Again.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply three.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  /* An edit rewinds the turn and records it again: the revision ordinal the
   * card shows does not move, so what says the work was recorded is the
   * settlement kind, per run. */
  await expectLogInvariant(chatId!, {
    runs: 3,
    settlements: ['turn.finalized', 'turn.finalized', 'turn.finalized'],
  });
});

test('edits a turn before its revision is saved', async () => {
  const [chatId] = await openChat(twoTurnScript);
  await sendDraft('First plain message.');
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);

  /* Deliberately *not* waiting for the marker's *Saved*: the previous run's turn actor
   * is still retiring, and the edit leases the same turn id. The root now
   * queues that admission until the hold clears instead of refusing it (F7). */
  await editFirstMessage(' Edited.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
});

test('alternates turns between two chats of one project', async () => {
  const chatIds = await openChat([reply('Reply one.'), reply('Reply two.'), reply('Reply three.')], '?chats=2');
  await completeFirstTurn(chatIds[0]!);

  await switchToChat('Second chat');
  await selectModel(pdfModelName);
  await sendDraft('Second chat message.');
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);

  await switchToChat('Attachments chat');
  await sendDraft('Back in the first chat.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply three.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  /* One ask per turn across both chats: a chat switch that re-dispatched the
   * chat it left would charge the same turn twice, and a cumulative count
   * cannot see it. */
  await expectAsksByTurn([
    ['First plain message.', 1],
    ['Second chat message.', 1],
    ['Back in the first chat.', 1],
  ]);
  await expectLogInvariant(chatIds[0]!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
  await expectLogInvariant(chatIds[1]!, { runs: 1, settlements: ['turn.finalized'] });
});

/*
 * W9 PV-S9 (V5 B1, B2). A turn's first model call writes a file, so its attempt
 * has something to save; the second is its reply.
 */
const writingTurn = (reply2: ReturnType<typeof reply>): Array<ReturnType<typeof reply>> => [
  reply('Writing the proof.', {
    toolCalls: [{ name: 'create_file', args: { targetFile: 'turn-proof.txt', content: 'written by the turn\n' } }],
  }),
  reply2,
];

/* PV-A7: the run reads Done at its terminal row; only the revision card waits on the settlement row. */
test('reads Done, never Finishing, while a finished turn saves its revision', async () => {
  const [chatId] = await openChat(writingTurn(reply('Reply one.')));
  await target.evaluate(() => {
    const seen = { finishing: false };
    Object.assign(globalThis, { pvS9: seen });
    new MutationObserver(() => {
      seen.finishing ||= /Finishing/u.test(document.body.textContent);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });

  await sendDraft('First plain message.');

  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  await expectLogInvariant(chatId!, { runs: 1, settlements: ['turn.finalized'] });
  await target.expectText(selectors.getByRole('status', { name: 'Save status' }), /^Saved$/u, 60_000);
  expect(await target.evaluate(() => (globalThis as unknown as { pvS9: { finishing: boolean } }).pvS9.finishing)).toBe(
    false,
  );
});

/* PV-A20, TS-R11: W8 cuts every attempt that executed, so a Stop after a change settles with a revision. */
test('shows the revision of a turn stopped after it changed files', async () => {
  const [chatId] = await openChat(writingTurn(reply('Reply one.', { gated: true })));
  await sendDraft('First plain message.');
  await target.expectVisible(selectors.getByText('Writing the proof.', { exact: true }).last(), 120_000);
  /* The first call's text shows before its `create_file` runs, so a Stop there changed nothing and settles as plain
   * Saved. The second call parks at its stream gate only after the tool has written the file. */
  await target.waitForAgentHostGatewayGate({ kind: 'stream', turn: 'First plain message.' }, 120_000);

  await target.click(selectors.getByRole('button', { name: 'Stop' }).last());
  /* Stop is a keyed host cancel that the host log confirms (`ChatSessionStore.stopRun`), a few hundred ms after the
   * click. Releasing the parked stream before then let the reply finish first, so the run completed and the card read
   * plain `Saved`. The stop's settlement says the cancel landed; the release after it must not reopen the run. */
  await expectFinalizedTurns(chatId!, 1);
  await target.releaseAgentHostGatewayFixture();

  await target.expectText(selectors.getByRole('status', { name: 'Save status' }), /^Saved · stopped early$/u, 60_000);
  await expectLogInvariant(chatId!, { runs: 1, settlements: ['turn.finalized'] });
});
