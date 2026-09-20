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
 * *Try again* on an error card is the fifth admission route, and the rows below
 * drive it. It is no longer a rewind: a run the host can still continue is
 * continued under its own run id (`chat-turn-host.tsx:313-334`), so a refused
 * turn retried is one run with two attempts, not two runs.
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
import { composerSelector, pdfModelName, selectModel, sendDraft } from '#support/chat-attachments.js';
import {
  chatLog,
  completeFirstTurn,
  continueAction,
  editFirstMessage,
  expectLogInvariant,
  expectNoAdmissionRefusal,
  gatewayAsksByTurn,
  gatewayPendingCount,
  gatewayRequestCount,
  gatewayUserTexts,
  openChat,
  reply,
  sendRefused,
  switchToChat,
  tryAgain,
} from '#support/chat-admission.js';

const twoTurnScript = [reply('Reply one.'), reply('Reply two.')];

/**
 * One fresh provider ask per turn, read once the last reply is on screen.
 *
 * A cumulative `>=` poll returned the instant the expected call landed and the
 * length read that followed it could not see a call already in flight — the row
 * passed while the product asked three times (T5 M1/M4/M11). A per-turn ask
 * count names *which* turn was charged twice, which is the fact the contract is
 * about: one ask per attempt, and a turn with two attempts is asked twice.
 */
const expectAsksByTurn = async (asks: ReadonlyArray<readonly [string, number]>): Promise<void> => {
  expect(await gatewayAsksByTurn()).toEqual(asks.map(([turn, count]) => ({ turn, asks: count })));
};

/** How many rewinds one chat's log records; a continuation records none. */
const rewindCountOf = async (chatId: string): Promise<number> => {
  const records = await chatLog(chatId);
  return records.filter((record) => record.type === 'history.rewound').length;
};

/**
 * Send from the composer with Enter.
 *
 * `sendDraft` clicks the composer's send button, and that button *is* the stop
 * button while the chat's AI SDK status is `submitted` or `streaming`
 * (`chat-textarea-submit-button.tsx:78-82`). `handleSubmit` is not gated on the
 * status (`chat-textarea-types.ts:426-434`), so Enter is how a person makes a
 * gesture over a turn that is already live.
 *
 * @param text - The message to send.
 * @returns Nothing.
 */
const sendWhileLive = async (text: string): Promise<void> => {
  const composer = selectors.getByCss(composerSelector).first();
  await target.type(composer, text);
  await target.press(composer, 'Enter');
};

test('sends a second plain message after a completed turn', async () => {
  const [chatId] = await openChat(twoTurnScript);
  await completeFirstTurn();

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
  await completeFirstTurn();

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
  /* A stopped run never reaches its merge, so the root releases its lease and
   * records `turn.failed` (`describeTurnRelease`) — the count alone passed a
   * cancelled run that claimed to have recorded work. */
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.failed', 'turn.finalized'] });
});

test('sends a second message after reloading a completed chat', async () => {
  const [chatId] = await openChat(twoTurnScript);
  await completeFirstTurn();

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
  await completeFirstTurn();

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

test('edits a turn after resuming a refused one', async () => {
  const [chatId] = await openChat([reply('Reply one.'), reply('Reply two.')]);
  await sendRefused('First plain message.');

  await tryAgain();
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  await target.expectVisible(selectors.getByText(/Rev 1 saved/u).first(), 60_000);

  await editFirstMessage(' Edited.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  /* Two runs, three attempts: the refused turn's continuation keeps its run,
   * and only the edit mints a new one. */
  await expectLogInvariant(chatId!, {
    runs: 2,
    attempts: [2, 1],
    settlements: ['turn.failed', 'turn.finalized', 'turn.finalized'],
  });
});

test('edits twice in a row after a completed turn', async () => {
  const [chatId] = await openChat([reply('Reply one.'), reply('Reply two.'), reply('Reply three.')]);
  await completeFirstTurn();

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

test('resumes a refused turn that follows a completed one', async () => {
  const [chatId] = await openChat([reply('Reply one.'), reply('Reply two.')]);
  await completeFirstTurn();
  await sendRefused('Second plain message.');

  await tryAgain();

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  /* A continuation carries the turn it is continuing, so the last user message
   * on the wire is still turn 2's. Deriving a rewind point from the last
   * *assistant* message retained the prefix before turn 1 and sent turn 2's
   * text, which the host refused as an invalid history prefix (F2). */
  const texts = await gatewayUserTexts();
  expect(texts.at(-1)).toContain('Second plain message.');
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, {
    runs: 2,
    attempts: [1, 2],
    settlements: ['turn.finalized', 'turn.failed', 'turn.finalized'],
  });
  await expectAsksByTurn([
    ['First plain message.', 1],
    ['Second plain message.', 2],
  ]);
});

test('resumes a refused turn twice', async () => {
  const [chatId] = await openChat([reply('Reply one.')]);
  await sendRefused('First plain message.');

  await target.setAgentHostGatewayFailure({ status: 400, message: 'Refused twice.' });
  await tryAgain();
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(continueAction, 120_000);
  await target.setAgentHostGatewayFailure();

  await tryAgain();

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  /* The third attempt is the one that records a revision, and its settlement
   * is written with it — the log invariant is only meaningful once it has. */
  await target.expectVisible(selectors.getByText(/Rev 1 saved/u).first(), 60_000);
  await expectNoAdmissionRefusal();
  /* One run, three attempts, three settlements. The retry verb used to rewind
   * and mint a fresh run id, which paid for the refused prefix again (W7). */
  await expectLogInvariant(chatId!, {
    runs: 1,
    attempts: [3],
    settlements: ['turn.failed', 'turn.failed', 'turn.finalized'],
  });
});

test('edits a turn before its revision is saved', async () => {
  const [chatId] = await openChat(twoTurnScript);
  await sendDraft('First plain message.');
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);

  /* Deliberately *not* waiting for `Rev 1 saved`: the previous run's turn actor
   * is still retiring, and the edit leases the same turn id. The root now
   * queues that admission until the hold clears instead of refusing it (F7). */
  await editFirstMessage(' Edited.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
});

test('resumes, edits, then sends a new message', async () => {
  const [chatId] = await openChat([reply('Reply one.'), reply('Reply two.'), reply('Reply three.')]);
  await sendRefused('First plain message.');

  await tryAgain();
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  await target.expectVisible(selectors.getByText(/Rev 1 saved/u).first(), 60_000);

  await editFirstMessage(' Edited.');
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);

  await sendDraft('Second plain message.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(4);
  await target.expectVisible(selectors.getByText('Reply three.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, {
    runs: 3,
    attempts: [2, 1, 1],
    settlements: ['turn.failed', 'turn.finalized', 'turn.finalized', 'turn.finalized'],
  });
});

test('alternates turns between two chats of one project', async () => {
  const chatIds = await openChat([reply('Reply one.'), reply('Reply two.'), reply('Reply three.')], '?chats=2');
  await completeFirstTurn();

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

test('queues a gesture made while a turn is dispatched', async () => {
  const [chatId] = await openChat(twoTurnScript);
  /* The turn is parked at the request's *entry* — dispatched, not one byte
   * answered — which is the only way to press a gesture while the chat sits in
   * `run.queued.dispatched`. That child handler records the gesture and
   * interrupts the live turn (`chat-session.machine.ts:518-520`); nothing there
   * takes a second lease, and no row anywhere held that state before (V1(b)). */
  await target.holdNextAgentHostGatewayRequest();
  await sendDraft('First plain message.');
  await target.waitForAgentHostGatewayGate({ kind: 'request', turn: 'First plain message.' });
  expect(await gatewayPendingCount()).toBe(1);

  await sendWhileLive('Second plain message.');

  /* No second provider call while the first is held: a cumulative total cannot
   * say this, because the first turn's own call already satisfies it. */
  expect(await gatewayPendingCount()).toBe(1);
  await target.releaseAgentHostGatewayRequest('First plain message.');

  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectAsksByTurn([
    ['First plain message.', 1],
    ['Second plain message.', 1],
  ]);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.failed', 'turn.finalized'] });
});

test('hands a send displaced from the one-slot queue back to the composer', async () => {
  const [chatId] = await openChat(twoTurnScript);
  await target.holdNextAgentHostGatewayRequest();
  await sendDraft('First plain message.');
  await target.waitForAgentHostGatewayGate({ kind: 'request', turn: 'First plain message.' });

  /* A chat holds one gesture. The second of these two takes the slot, and the
   * first must come back to the composer rather than vanish: its text was
   * never in the transcript, so the composer was its only copy (I5, ruling E2 —
   * `chat-session-store.ts` `#settleComposer` / `#restoreDraftMessage`). */
  await sendWhileLive('Second plain message.');
  /* The gesture that was taken clears the composer; typing the next one before
   * that lands would append to it rather than replace it. */
  await target.expectText(selectors.getByCss(composerSelector).first(), '', 30_000);
  await sendWhileLive('Third plain message.');

  await target.expectContainingText(selectors.getByCss(composerSelector).first(), 'Second plain message.', 30_000);
  await target.releaseAgentHostGatewayRequest('First plain message.');

  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  /* The displaced send never reached the provider — it is in the composer, not
   * on the wire, and it was never charged for. */
  await expectAsksByTurn([
    ['First plain message.', 1],
    ['Third plain message.', 1],
  ]);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.failed', 'turn.finalized'] });
});

test('reaches no provider while a turn is admitting', async () => {
  const [chatId] = await openChat([reply('Reply one.')]);
  /* The admission window takes the checkout lease, and it takes it *before* the
   * turn is dispatched — so a hold here parks the turn in `run.queued.admitting`
   * with nothing spent (`chat-host-binding.ts` `chatTurnAdmission`: the hold is
   * awaited after the turn service is published and before `admit`). Nothing
   * outside the page can hold that state open, which is why the seam exists. */
  await target.holdChatTurn('admission');
  await sendDraft('First plain message.');

  await target.delay(3000);
  expect(await gatewayRequestCount()).toBe(0);

  await target.releaseChatTurn('admission');

  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  await expectAsksByTurn([['First plain message.', 1]]);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, { runs: 1, settlements: ['turn.finalized'] });
});

test('edits a turn queued behind a live one', async () => {
  const [chatId] = await openChat(twoTurnScript);
  await target.holdNextAgentHostGatewayRequest();
  await sendDraft('First plain message.');
  await target.waitForAgentHostGatewayGate({ kind: 'request', turn: 'First plain message.' });

  /* An edit derives its rewind point when it is *admitted*, from the transcript
   * as it is then — and the live turn's interruption truncates that transcript
   * in between. Clamping a missing target to index 0 leased a checkout for a
   * rewind point that does not exist (T3-D5); refusing it is the contract. */
  await editFirstMessage(' Edited.');
  await target.releaseAgentHostGatewayRequest('First plain message.');

  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectAsksByTurn([
    ['First plain message.', 1],
    ['First plain message. Edited.', 1],
  ]);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.failed', 'turn.finalized'] });
});

test('resumes a refused turn under its own run, rewinding nothing', async () => {
  const [chatId] = await openChat([reply('Reply one.')]);
  await sendRefused('First plain message.');

  await tryAgain();

  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  await target.expectVisible(selectors.getByText(/Rev 1 saved/u).first(), 60_000);
  /* One run, two attempts. *Try again* entered as a `regenerate` before W7: it
   * rewound, minted a fresh run id and paid for the refused prefix again, and
   * the host's record for the old id was orphaned so `drop` could not match it. */
  await expectLogInvariant(chatId!, {
    runs: 1,
    attempts: [2],
    settlements: ['turn.failed', 'turn.finalized'],
  });
  expect(await rewindCountOf(chatId!)).toBe(0);
  /* Two attempts, two asks. The refused call never reached a reply, so the
   * continuation asks the provider again for the same turn — the charge the
   * person consented to by pressing the card's own verb. */
  await expectAsksByTurn([['First plain message.', 2]]);
  await expectNoAdmissionRefusal();
});

test('sends again after reloading while a turn is queued', async () => {
  const [chatId] = await openChat(twoTurnScript);
  /* The turn is parked at the request's *entry* — dispatched, not one byte
   * answered — which is the only way to reload a turn that is still in
   * `queued.dispatched`. The stream gate parks after the text block is written,
   * so waiting for it would have made this "reload while streaming" and deleted
   * the file's only queued-state coverage (T5 Q2 defect 1). */
  await target.holdNextAgentHostGatewayRequest();
  await sendDraft('First plain message.');
  await target.waitForAgentHostGatewayGate({ kind: 'request', turn: 'First plain message.' });
  expect(await gatewayPendingCount()).toBe(1);

  await target.reload();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await target.releaseAgentHostGatewayRequest('First plain message.');

  /* I4: the document that placed the run is gone, so the new document's attach
   * *records* it — one `turn.failed` carrying `RUN_ABANDONED` — and never
   * drives it. The turn keeps its single ask; the reload spends nothing. */
  await expectLogInvariant(chatId!, { runs: 1, settlements: ['turn.failed'], timeoutMilliseconds: 120_000 });
  await expectAsksByTurn([['First plain message.', 1]]);

  await selectModel(pdfModelName);
  await sendDraft('Second plain message.');

  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectAsksByTurn([
    ['First plain message.', 1],
    ['Second plain message.', 1],
  ]);
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.failed', 'turn.finalized'] });
  /* `RUN_ABANDONED` is the record the takeover just wrote, so the page reports
   * it; every other refusal in the union is still a failure here. */
  await expectNoAdmissionRefusal(['RUN_ABANDONED']);
});

test('resumes the turn a navigation abandoned, then sends another', async () => {
  const [chatId] = await openChat([reply('Reply one.', { gated: true }), reply('Reply two.')]);
  await sendDraft('First plain message.');
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  const projectUrl = new URL(await target.currentUrl());

  await target.navigate('/');
  await target.expectUrl(/\/$|\/\?/u, 60_000);
  await target.navigate(`${projectUrl.pathname}${projectUrl.search}`);
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await target.releaseAgentHostGatewayFixture();

  /* Ruling E1: the run the departed document left behind is recorded, not
   * resumed. The takeover used to resume it on the next gesture's attach — a
   * full-price re-ask of a turn the person had already paid for, with the reply
   * they watched erased and no settlement written at all (Finding 1). */
  await expectLogInvariant(chatId!, { runs: 1, settlements: ['turn.failed'], timeoutMilliseconds: 120_000 });
  await expectAsksByTurn([['First plain message.', 1]]);

  /* The person's own gesture is what spends: the saved turn's card continues
   * the same run rather than rewinding it. A partial stream is never durable,
   * so the continuation asks for that turn a second time and the script replays
   * its own entry. */
  await target.expectVisible(continueAction, 60_000);
  await target.click(continueAction);
  await target.waitForAgentHostGatewayGate({ kind: 'stream', turn: 'First plain message.' });
  await target.releaseAgentHostGatewayFixture('First plain message.');
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  await target.expectVisible(selectors.getByText(/Rev 1 saved/u).first(), 60_000);

  await selectModel(pdfModelName);
  await sendDraft('Second plain message.');

  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectAsksByTurn([
    ['First plain message.', 2],
    ['Second plain message.', 1],
  ]);
  await expectLogInvariant(chatId!, {
    runs: 2,
    attempts: [2, 1],
    settlements: ['turn.failed', 'turn.finalized', 'turn.finalized'],
  });
  await expectNoAdmissionRefusal(['RUN_ABANDONED']);
});
