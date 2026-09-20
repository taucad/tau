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
 * chat was broken: the provider was asked once per turn, the console carries no
 * admission refusal, and every run in the chat's durable log is admitted before
 * exactly one settlement of the kind the gesture earned.
 *
 * *Try again* on an error card is the fifth admission route (`continueChat` →
 * a bodyless `continue`), and the rows below drive it: it is the one verb that
 * derives its own rewind point, and it derived the wrong one for every turn
 * after the first.
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
  completeFirstTurn,
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
 * about.
 */
const expectOneAskPerTurn = async (turns: readonly string[]): Promise<void> => {
  expect(await gatewayAsksByTurn()).toEqual(turns.map((turn) => ({ turn, asks: 1 })));
};

test('sends a second plain message after a completed turn', async () => {
  const [chatId] = await openChat(twoTurnScript);
  await completeFirstTurn();

  await sendDraft('Second plain message.');

  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectOneAskPerTurn(['First plain message.', 'Second plain message.']);
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
  await expectOneAskPerTurn(['First plain message.', 'Second plain message.']);
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

test('edits a turn after retrying a refused one', async () => {
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
  await expectLogInvariant(chatId!, {
    runs: 3,
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

test('retries a refused turn that follows a completed one', async () => {
  const [chatId] = await openChat([reply('Reply one.'), reply('Reply two.')]);
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
  await expectLogInvariant(chatId!, {
    runs: 3,
    settlements: ['turn.finalized', 'turn.failed', 'turn.finalized'],
  });
});

test('retries a refused turn twice', async () => {
  const [chatId] = await openChat([reply('Reply one.')]);
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
  await expectLogInvariant(chatId!, {
    runs: 3,
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

test('retries, edits, then sends a new message', async () => {
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
    runs: 4,
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
  await expectOneAskPerTurn(['First plain message.', 'Second chat message.', 'Back in the first chat.']);
  await expectLogInvariant(chatIds[0]!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
  await expectLogInvariant(chatIds[1]!, { runs: 1, settlements: ['turn.finalized'] });
});

test('sends again after reloading while a turn is queued', async () => {
  await openChat(twoTurnScript);
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
  await selectModel(pdfModelName);

  await sendDraft('Second plain message.');

  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  // W8b: what the reloaded turn 1 owes — whether it is re-asked, what it
  // settles, and whether the next send may be refused meanwhile — is the
  // Resume/discovery lane's contract (blueprint E1, D1, D4). Assert the ask
  // counts, the settlement kinds and `expectNoAdmissionRefusal` here once it
  // lands. Until then this row holds only what is certain: a chat reloaded out
  // of `queued.dispatched` still runs its next turn.
});

test('sends again after navigating away mid-turn and back', async () => {
  const [chatId] = await openChat([reply('Reply one.', { gated: true }), reply('Reply two.')]);
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

  await expect.poll(gatewayRequestCount, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  // W8b: this row's contract is the one the Resume/discovery lane is
  // redefining — today's takeover re-asks turn 1, so the texts are
  // `[First, First, Second]` and the count below is the wrong assertion
  // (blueprint Q5 defect 1, E1). Left as it stands until that lane lands.
  expect(await gatewayUserTexts()).toHaveLength(2);
  await target.expectVisible(selectors.getByText('Reply two.', { exact: true }).last(), 120_000);
  await expectNoAdmissionRefusal();
  await expectLogInvariant(chatId!, 2);
});
