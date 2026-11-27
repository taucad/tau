/**
 * Multi-turn admission on the browser placement: resumes and gestures made
 * over a queued or admitting turn.
 *
 * These rows were split from `chat-multi-turn.spec.ts` so each file fits one
 * shadow row of the CI decomposition (DC-25, at most 6.5 minutes of specs per
 * row). That file's header states the regression they exist for, the three
 * things every row asserts and how each attempt settles; the reads and gestures
 * come from `#support/chat-admission.js`, the one owner of both halves.
 *
 * *Try again* on an error card is the fifth admission route, and the rows below
 * drive it. It is no longer a rewind: a run the host can still continue is
 * continued under its own run id (`chat-turn-host.tsx:313-334`), so a refused
 * turn retried is one run with two attempts, not two runs.
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
  expectAsksByTurn,
  expectFinalizedTurns,
  expectLogInvariant,
  expectNoAdmissionRefusal,
  gatewayPendingCount,
  gatewayRequestCount,
  gatewayUserTexts,
  openChat,
  reply,
  sendRefused,
  tryAgain,
  twoTurnScript,
} from '#support/chat-admission.js';

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
  /* The refused attempt and its continuation each settle. */
  await expectFinalizedTurns(chatId!, 2);

  await editFirstMessage(' Edited.');

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  /* Two runs, three attempts: the refused turn's continuation keeps its run,
   * and only the edit mints a new one. */
  await expectLogInvariant(chatId!, {
    runs: 2,
    attempts: [2, 1],
    settlements: ['turn.finalized', 'turn.finalized', 'turn.finalized'],
  });
});

test('resumes a refused turn that follows a completed one', async () => {
  const [chatId] = await openChat([reply('Reply one.'), reply('Reply two.')]);
  await completeFirstTurn(chatId!);
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
    settlements: ['turn.finalized', 'turn.finalized', 'turn.finalized'],
  });
  await expectAsksByTurn([
    ['First plain message.', 1],
    ['Second plain message.', 2],
  ]);
});

test('resumes a refused turn twice', async () => {
  const [chatId] = await openChat([reply('Reply one.')]);
  await sendRefused('First plain message.');

  await target.setAgentHostGatewayFailure({ status: 400, message: 'Refused twice.', type: 'INVALID_REQUEST' });
  await tryAgain();
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(continueAction, 120_000);
  /* The card can be on screen before the second attempt has settled — the
   * first refusal's card, or the second's while its run is still finishing —
   * and a press then reaches a run that is not yet resumable. Its settlement
   * is what says the second refusal is over. */
  await expectFinalizedTurns(chatId!, 2);
  await target.setAgentHostGatewayFailure();

  await tryAgain();

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(3);
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  /* The third attempt is the last to settle, and the log invariant is only
   * meaningful once it has. */
  await expectFinalizedTurns(chatId!, 3);
  await expectNoAdmissionRefusal();
  /* One run, three attempts, three settlements. The retry verb used to rewind
   * and mint a fresh run id, which paid for the refused prefix again (W7). */
  await expectLogInvariant(chatId!, {
    runs: 1,
    attempts: [3],
    settlements: ['turn.finalized', 'turn.finalized', 'turn.finalized'],
  });
});

test('resumes, edits, then sends a new message', async () => {
  const [chatId] = await openChat([reply('Reply one.'), reply('Reply two.'), reply('Reply three.')]);
  await sendRefused('First plain message.');

  await tryAgain();
  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBe(2);
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  /* The refused attempt and its continuation each settle. */
  await expectFinalizedTurns(chatId!, 2);

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
    settlements: ['turn.finalized', 'turn.finalized', 'turn.finalized', 'turn.finalized'],
  });
});

test('queues a gesture made while a turn is dispatched', async () => {
  const [chatId] = await openChat(twoTurnScript);
  /* The turn is parked at the request's *entry* — dispatched, not one byte
   * answered — which is the only way to press a gesture while the chat sits in
   * `run.queued.dispatched`. A follow-up made then waits for the live turn to
   * finish instead of interrupting it (19d8ea9e51, #588: only Steer
   * interrupts), so both turns complete and nothing takes a second lease. */
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
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
});

/*
 * No row for the one-slot queue's *displacement* (I5, ruling E2): the real UI
 * cannot produce it, and the row that claimed to was asserting a state the
 * product never reaches.
 *
 * - Over a **dispatched** turn, a second gesture joins the chat's saved
 *   follow-up queue and waits for the live turn to finish (19d8ea9e51, #588),
 *   so a third gesture queues behind it rather than displacing it.
 * - Over an **admitting** turn nothing can be typed at all: the composer's
 *   busy-lock renders it `contenteditable="false"` for the whole admission
 *   window (S01), which is what `reaches no provider while a turn is admitting`
 *   below holds open — `locator.fill` fails on it outright.
 *
 * So the displaced slot is only ever occupied between two gestures made in the
 * same tick, which no browser gesture pair can straddle. `#settleComposer` and
 * `#restoreDraftMessage` are pinned by `chat-session-store.test.ts`
 * (*returns a displaced send to the composer whichever requestTurn call
 * observes it*, *returns a send displaced by an edit to the composer*), which
 * drive the store directly and are the right tier for it.
 */

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
   * as it is then, not when it is pressed. It waits for the live turn to finish
   * (19d8ea9e51, #588), and clamping a missing target to index 0 leased a
   * checkout for a rewind point that does not exist (T3-D5). */
  await editFirstMessage(' Edited.');
  await target.releaseAgentHostGatewayRequest('First plain message.');

  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectAsksByTurn([
    ['First plain message.', 1],
    ['First plain message. Edited.', 1],
  ]);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
});

test('resumes a refused turn under its own run, rewinding nothing', async () => {
  const [chatId] = await openChat([reply('Reply one.')]);
  await sendRefused('First plain message.');

  await tryAgain();

  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  /* One run, two attempts. *Try again* entered as a `regenerate` before W7: it
   * rewound, minted a fresh run id and paid for the refused prefix again, and
   * the host's record for the old id was orphaned so `drop` could not match it. */
  await expectLogInvariant(chatId!, {
    runs: 1,
    attempts: [2],
    settlements: ['turn.finalized', 'turn.finalized'],
  });
  /* The one `history.rewound` a continuation records is the *failure marker*
   * retraction, not a turn rewind: the host drops the assistant message that
   * carried the transport diagnostic so the provider is asked from the person's
   * own turn again (`tau-agent-host.ts` `failureMarkerClearance`). What says the
   * turn was not rewound is the run count and the attempt count above — one run,
   * two attempts, no second admission. */
  expect(await rewindCountOf(chatId!)).toBeLessThanOrEqual(1);
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

  /* Reload killed the browser Worker. Discovery records the orphan
   * (`RUN_ABANDONED`) and the reloaded page cuts its held lease, but it neither
   * re-asks the provider nor resumes the run on its own. */
  await expectLogInvariant(chatId!, { runs: 1, settlements: ['turn.finalized'], timeoutMilliseconds: 120_000 });
  await expectAsksByTurn([['First plain message.', 1]]);

  await selectModel(pdfModelName);
  await sendDraft('Second plain message.');

  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectAsksByTurn([
    ['First plain message.', 1],
    ['Second plain message.', 1],
  ]);
  await expectLogInvariant(chatId!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
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
  await expectLogInvariant(chatId!, { runs: 1, settlements: ['turn.finalized'], timeoutMilliseconds: 120_000 });
  await expectAsksByTurn([['First plain message.', 1]]);

  await target.expectVisible(continueAction, 60_000);
  await target.click(continueAction);
  await expect.poll(gatewayRequestCount, { timeout: 120_000 }).toBe(2);
  await expect.poll(gatewayPendingCount, { timeout: 120_000 }).toBe(2);
  await target.releaseAgentHostGatewayFixture('First plain message.');
  await target.expectVisible(selectors.getByText('Reply one.', { exact: true }).last(), 120_000);
  await expectLogInvariant(chatId!, {
    runs: 1,
    attempts: [2],
    settlements: ['turn.finalized', 'turn.finalized'],
    timeoutMilliseconds: 120_000,
  });

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
    settlements: ['turn.finalized', 'turn.finalized', 'turn.finalized'],
  });
  await expectNoAdmissionRefusal(['RUN_ABANDONED']);
});
