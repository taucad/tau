import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import type { RecordFile } from '#support/chat-attachments.js';
import { countOf, readHomeJson, recordDraftText, recordPaths, seededChatIds } from '#support/chat-attachments.js';
import {
  currentPath,
  detent,
  detents,
  expectDetentHeld,
  followSidebarLink,
  grabber,
  moveSheet,
  navButton,
  openFromAll,
  openPhone,
  openSheet,
  phoneViewports,
  projectTitle,
  stableDetent,
  surface,
  tapDestination,
  traverseHistory,
  unshownReason,
} from '#support/phone-shell.js';

/**
 * T2 and T8 on the production phone route (WB-04, WB-09, PN-CHAT-4, PN-CHAT-7): what the person was doing
 * survives what a phone does to a page — a reload, Back and Forward, a switch to another project or chat, the sheet
 * closing, another surface, the Model — and a decision or a failure is never folded away at any detent (I5).
 *
 * What the product intends, and so what is asserted:
 * - The open surface is the project's own state (`panelState.mobileActiveTab`, stored per project), so a reload or a
 *   history step back into a project reopens the surface that project had, and another project never shows it.
 * - The sheet's height is not stored: a surface reopens at half, the height every reopen takes
 *   (`use-chat-interface-state.ts`), whether it was left at full or collapsed; a file opens at full (WB-07).
 * - A chat draft lives in the chat's composer record, so it outlives every unmount and stays with its chat.
 * - Scroll offsets are not asserted: the canvas and charter specify none, and the phone mounts only the active
 *   surface, the chat reopening at its latest turn.
 */

const composer = (): Locator =>
  selectors.getByRole('textbox', { name: 'Ask Tau to build anything...', exact: true }).first();
const composerText = async (): Promise<string> => {
  const text = await target.textContent(composer());
  return text?.trim() ?? '';
};

const usage = { inputTokens: 12, outputTokens: 6 };

test.each(phoneViewports)(
  'reopens the surface each project had after a reload and across Back and Forward at $width×$height',
  async (viewport) => {
    await openPhone(viewport, '/__e2e/project-navigation');
    await target.expectVisible(projectTitle('Project Navigation A'), 60_000);
    const projectA = await currentPath();
    // A fresh project rests on its model.
    await target.expectCount(openSheet(), 0);
    expect(await target.getAttribute(navButton('Model'), 'aria-current')).toBe('page');

    await tapDestination('Parameters');
    await target.expectVisible(surface('Parameters'), 60_000);
    expect(await detent()).toBe(detents.half);
    await moveSheet('End', detents.full);

    // Reload: the project's surface comes back, at the height a surface reopens at, by name as well as by place.
    await target.reload();
    await target.expectVisible(surface('Parameters'), 60_000);
    expect(await target.getAttribute(navButton('Parameters'), 'aria-current')).toBe('page');
    await expect.poll(detent).toBe(detents.half);
    await target.expectAttribute(grabber(), 'aria-valuetext', 'Half');

    // Another project: its own state, never the surface this one had open.
    await followSidebarLink('Project Navigation B');
    await expect.poll(currentPath, { timeout: 60_000 }).not.toBe(projectA);
    const projectB = await currentPath();
    await target.expectVisible(projectTitle('Project Navigation B'), 60_000);
    await expect.poll(async () => target.getAttribute(navButton('Model'), 'aria-current')).toBe('page');
    await target.expectCount(openSheet(), 0);
    await openFromAll('Files');

    // Back returns to A with A's surface; Forward to B with B's.
    expect(await traverseHistory('back')).toBe(projectA);
    await target.expectVisible(projectTitle('Project Navigation A'), 60_000);
    await target.expectVisible(surface('Parameters'), 60_000);
    await target.expectCount(surface('Files'), 0);
    await expect.poll(detent).toBe(detents.half);

    expect(await traverseHistory('forward')).toBe(projectB);
    await target.expectVisible(projectTitle('Project Navigation B'), 60_000);
    await target.expectVisible(surface('Files'), 60_000);
    await target.expectCount(surface('Parameters'), 0);

    // The Model restores the stage, and that too is the project's state across a step back and forward.
    await tapDestination('Model');
    await target.expectCount(openSheet(), 0);
    expect(await traverseHistory('back')).toBe(projectA);
    await target.expectVisible(surface('Parameters'), 60_000);
    expect(await traverseHistory('forward')).toBe(projectB);
    await target.expectVisible(projectTitle('Project Navigation B'), 60_000);
    await expect.poll(async () => target.getAttribute(navButton('Model'), 'aria-current')).toBe('page');
    await target.expectCount(openSheet(), 0);
  },
);

test.each(phoneViewports)('reopens a surface collapsed from full at half at $width×$height', async (viewport) => {
  await openPhone(viewport, '/__e2e/project-navigation');
  await target.expectVisible(projectTitle('Project Navigation A'), 60_000);
  await tapDestination('Parameters');
  await target.expectVisible(surface('Parameters'), 60_000);
  await moveSheet('End', detents.full);
  await target.expectAttribute(grabber(), 'aria-valuetext', 'Full');

  // Collapsed is the sheet closed: the Model has the screen.
  await tapDestination('Model');
  await target.expectCount(openSheet(), 0);

  // No detent is stored: the surface comes back at the height every reopen takes.
  await tapDestination('Parameters');
  await target.expectVisible(surface('Parameters'), 60_000);
  await expect.poll(detent).toBe(detents.half);
  await target.expectAttribute(grabber(), 'aria-valuetext', 'Half');
});

test.each(phoneViewports)(
  'keeps a chat draft across the sheet, other surfaces, the Model, a reload and a chat switch at $width×$height',
  async (viewport) => {
    await openPhone(viewport, '/__e2e/chat-attachments?chats=2');
    const { projectId, chatIds } = await seededChatIds();
    await tapDestination('Chat');
    await target.expectVisible(composer(), 60_000);

    const draft = 'Fillet the outer edges at 1 mm';
    await target.type(composer(), draft);
    await expect
      .poll(async () => recordDraftText(await readHomeJson<RecordFile>(recordPaths.chat(projectId, chatIds[0]!))), {
        timeout: 30_000,
      })
      .toBe(draft);

    // The sheet's own Close, then Chat again.
    await target.click(surface('Chat').getByRole('button', { name: 'Close Chat', exact: true }), { touch: true });
    await target.expectCount(openSheet(), 0);
    await tapDestination('Chat');
    await expect.poll(composerText, { timeout: 30_000 }).toBe(draft);

    // Another surface, a surface from All, then the Model: the draft is still the chat's.
    await tapDestination('Parameters');
    await target.expectVisible(surface('Parameters'), 60_000);
    await openFromAll('Details');
    await tapDestination('Model');
    await target.expectCount(openSheet(), 0);
    await tapDestination('Chat');
    await expect.poll(composerText, { timeout: 30_000 }).toBe(draft);

    // A reload reopens Chat, the surface this project had, with the draft.
    await target.reload();
    await target.expectVisible(surface('Chat'), 60_000);
    await expect.poll(composerText, { timeout: 30_000 }).toBe(draft);

    // Another chat has its own composer: no draft leaks into it, and none is lost coming back.
    await followSidebarLink('Second chat');
    await target.expectVisible(surface('Chat'), 60_000);
    await expect
      .poll(async () => target.evaluate(() => new URL(location.href).searchParams.get('chat')), { timeout: 30_000 })
      .toBe(chatIds[1]);
    await expect.poll(composerText, { timeout: 30_000 }).not.toContain(draft);
    await followSidebarLink('Attachments chat');
    await expect
      .poll(async () => target.evaluate(() => new URL(location.href).searchParams.get('chat')), { timeout: 30_000 })
      .toBe(chatIds[0]);
    await target.expectVisible(surface('Chat'), 60_000);
    await expect.poll(composerText, { timeout: 30_000 }).toBe(draft);
  },
);

test.each(phoneViewports)(
  'keeps an edited parameter across detents, another surface and the Model at $width×$height (WB-04)',
  async (viewport) => {
    await openPhone(viewport, '/__e2e/project-file-tree?main=touch-parameters');
    await tapDestination('Parameters');
    const width = surface('Parameters').getByLabelText('Input for Width').first();
    await target.expectVisible(width, 60_000);
    await target.fill(width, '31');
    await target.press(width, 'Enter');
    await target.expectValue(width, '31', 30_000);

    await moveSheet('End', detents.full);
    await moveSheet('Home', detents.half);
    await target.expectValue(width, '31');

    await openFromAll('Files');
    await tapDestination('Model');
    await target.expectCount(openSheet(), 0);
    await tapDestination('Parameters');
    await target.expectValue(surface('Parameters').getByLabelText('Input for Width').first(), '31', 30_000);
  },
);

/** One agent question with two answers, held open long enough to look at it at every detent. */
const formQuestion = (chatId: string): Readonly<Record<string, unknown>> => ({
  chatId,
  waitSeconds: 240,
  questions: [
    {
      id: 'form',
      header: 'Form',
      question: 'Which form should the desk ornament take?',
      options: [
        { label: 'Twisted ribbon', description: 'Prints without supports.' },
        { label: 'Faceted gem', description: 'Crisp at 0.2 mm layers.' },
      ],
    },
  ],
});

const send = async (text: string): Promise<void> => {
  await target.type(composer(), text);
  await target.click(
    selectors.getByRole('region', { name: 'Chat composer' }).getByRole('button', { name: 'Send', exact: true }),
    { touch: true },
  );
};

/**
 * Why no match of a locator is wholly on screen, or `undefined` when one is. A pending question has two homes — its
 * card in the transcript and, while that card is out of view, the tray above the composer — and either one counts.
 *
 * @param locator - The part.
 * @returns The reasons, one per match, or `undefined`.
 */
const unshownEverywhere = async (locator: Locator): Promise<string | undefined> => {
  const count = await countOf(locator);
  const reasons: string[] = [];
  for (let index = 0; index < count; index++) {
    // oxlint-disable-next-line no-await-in-loop -- one match at a time.
    const reason = await unshownReason(locator.nth(index));
    if (reason === undefined) {
      return undefined;
    }
    reasons.push(reason);
  }
  return reasons.length === 0 ? 'is not rendered' : reasons.join('; ');
};

/** Wait until every part has a wholly shown copy. */
const expectShown = async (parts: readonly Locator[], where: string): Promise<void> => {
  await expect
    .poll(async () => Promise.all(parts.map(async (part) => unshownEverywhere(part))), {
      timeout: 10_000,
      message: `every part should be wholly shown at ${where}`,
    })
    .toEqual(parts.map(() => undefined));
};

/**
 * The person's moves after a decision has raised the sheet: full shows it whole, and a lower detent they choose holds,
 * with no snap back (I5 raises for a decision that arrives, never against the person's own move).
 *
 * @param parts - What must be wholly shown at full.
 * @param shownAtHalf - Whether the decision also fits at half, where it must then be wholly shown.
 */
const expectPersonsDetentsHold = async (parts: readonly Locator[], shownAtHalf: boolean): Promise<void> => {
  await moveSheet('End', detents.full);
  expect(await stableDetent()).toBe(detents.full);
  await expectShown(parts, 'full');
  await moveSheet('ArrowDown', detents.half);
  await expectDetentHeld(detents.half);
  if (shownAtHalf) {
    await expectShown(parts, 'half');
  }
};

/**
 * Where the sheet settles when a decision arrives at half, per phone: the lowest detent that shows it whole. Half is
 * half the screen, so the question and its answers need full on both phones; a failure and its recovery fit half at
 * 390 but not at 320.
 */
const questionArrivalDetent: Readonly<Record<number, string>> = { 320: detents.full, 390: detents.full };
const failureArrivalDetent: Readonly<Record<number, string>> = { 320: detents.full, 390: detents.half };

test.each(phoneViewports)(
  'keeps a pending question and both answers on screen at half and full at $width×$height (I5, WB-09, PN-CHAT-4)',
  async (viewport) => {
    await openPhone(viewport, '/__e2e/chat-attachments');
    const { chatIds } = await seededChatIds();
    const script: readonly GatewayScriptTurn[] = [
      {
        text: 'Before I model anything, one decision about the form.',
        toolCalls: [{ name: 'ask_questions', args: formQuestion(chatIds[0]!) }],
        usage,
      },
      { text: 'Going with the faceted gem.', usage },
    ];
    await target.installAgentHostGatewayFixture(script);
    await tapDestination('Chat');
    await target.expectVisible(composer(), 60_000);
    // The person rests the sheet at half; the question then arrives.
    await moveSheet('Home', detents.half);
    await send('Design a desk ornament');

    const question = selectors.getByText('Which form should the desk ornament take?', { exact: true });
    const recommended = selectors.getByRole('button', {
      name: 'A, Twisted ribbon, recommended. Prints without supports.',
    });
    const other = selectors.getByRole('button', { name: 'B, Faceted gem. Crisp at 0.2 mm layers.' });
    await expect.poll(async () => countOf(other), { timeout: 120_000 }).toBeGreaterThan(0);
    // The decision raises the sheet exactly as far as it needs, and is wholly shown there.
    expect(await stableDetent()).toBe(questionArrivalDetent[viewport.width]);
    await expectShown([question, recommended, other], 'the detent it raised the sheet to');
    await expectPersonsDetentsHold([question, recommended, other], false);

    // Away and back: the question is still waiting, and Chat says so while another surface has the sheet (I5, WB-08).
    await tapDestination('Parameters');
    await target.expectVisible(surface('Parameters'), 60_000);
    await target.expectAccessibleDescription(navButton('Chat'), 'A chat needs you', 30_000);
    await target.expectAttribute(navButton('Chat').getByCss('[data-slot="destination-cue"]'), 'data-tone', 'attention');
    // Back on Chat the question is still there at the half a reopen takes; raised to full, answering it finishes
    // the turn.
    await tapDestination('Chat');
    await moveSheet('End', detents.full);
    await expect.poll(async () => unshownEverywhere(other), { timeout: 30_000 }).toBeUndefined();
    await target.click(other.first(), { touch: true });
    await target.expectVisible(selectors.getByText('Going with the faceted gem.', { exact: true }), 120_000);
  },
);

test.each(phoneViewports)(
  'shows one activity line for a streaming run and no second cue on Chat from another surface at $width×$height (WB-08)',
  async (viewport) => {
    await openPhone(viewport, '/__e2e/chat-attachments');
    await target.installAgentHostGatewayFixture([{ text: 'Thickening the wall now.', gated: true, usage }]);
    await tapDestination('Chat');
    await target.expectVisible(composer(), 60_000);
    await moveSheet('Home', detents.half);
    await send('Thicken the wall');
    await target.waitForAgentHostGatewayGate({ kind: 'stream' });

    // While the run streams, half carries its one activity line above the composer.
    const activity = surface('Chat').getByRole('status', { name: 'Current activity', exact: true });
    await target.expectCount(activity, 1, 60_000);
    await target.expectCount(selectors.getByRole('status', { name: 'Current activity', exact: true }), 1);

    // Another surface: a run in flight is not a decision, so Chat carries no cue of its own (I5 cues decisions only).
    await tapDestination('Parameters');
    await target.expectVisible(surface('Parameters'), 60_000);
    await target.expectCount(navButton('Chat').getByCss('[data-slot="destination-cue"]'), 0);
    expect(await target.getAttribute(navButton('Chat'), 'aria-describedby')).toBeNull();

    await target.releaseAgentHostGatewayFixture();
    await tapDestination('Chat');
    await target.expectVisible(selectors.getByText('Thickening the wall now.', { exact: true }), 120_000);
    await target.expectCount(selectors.getByRole('status', { name: 'Current activity', exact: true }), 0, 60_000);
  },
);

/** The chat transcript's scroller, which names itself (`chat-history.tsx`), moved as a person's swipe would. */
const scrollTranscript = async (to: 'top' | 'end'): Promise<void> =>
  target.evaluateLocator(
    surface('Chat').getByRole('region', { name: 'Chat history', exact: true }),
    (scroller, where) => {
      scroller.scrollTop = where === 'top' ? 0 : scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll'));
    },
    to,
  );

const longReply = Array.from({ length: 24 }, (_, index) => `Step ${String(index + 1)} of the bracket plan.`).join(
  '\n\n',
);

test.each(phoneViewports)(
  'keeps a failed run and its recovery on screen, and holds for a scrolled transcript at $width×$height (I5, PN-CHAT-7)',
  async (viewport) => {
    await openPhone(viewport, '/__e2e/chat-attachments');
    await target.installAgentHostGatewayFixture([
      { text: longReply, usage },
      { text: 'Recovered reply.', usage },
    ]);
    await tapDestination('Chat');
    await target.expectVisible(composer(), 60_000);
    // A transcript long enough to scroll at every detent.
    await send('Plan a bracket');
    await target.expectVisible(selectors.getByText('Step 24 of the bracket plan.', { exact: true }), 120_000);

    // The person rests the sheet at half; the next turn is refused there.
    await moveSheet('Home', detents.half);
    await target.setAgentHostGatewayFailure({ status: 400, message: 'Refused once.', type: 'INVALID_REQUEST' });
    await send('Model a bracket');
    const recovery = selectors.getByRole('button', { name: /^(?:Resume|Try again)$/u });
    const failure = selectors.getByRole('alert').filter({ has: recovery });
    await expect.poll(async () => countOf(recovery), { timeout: 120_000 }).toBeGreaterThan(0);
    await target.setAgentHostGatewayFailure();
    // The failure raises the sheet only as far as it must: it stays at half where half shows it whole.
    const arrival = failureArrivalDetent[viewport.width]!;
    expect(await stableDetent()).toBe(arrival);
    await expectShown([failure, recovery], 'the detent the failure settled at');

    // The person scrolls up past it: the failure leaves the transcript's view, and the sheet stays where it is.
    await scrollTranscript('top');
    await expect.poll(async () => unshownEverywhere(failure)).toBeDefined();
    await expectDetentHeld(arrival);
    await scrollTranscript('end');
    await expectShown([failure, recovery], 'scrolled back');

    await expectPersonsDetentsHold([failure, recovery], arrival === detents.half);

    // Away and back, the failure is still the chat's last word, and its recovery finishes the turn.
    await tapDestination('Parameters');
    await target.expectVisible(surface('Parameters'), 60_000);
    await tapDestination('Chat');
    await target.expectVisible(recovery, 30_000);
    await target.click(recovery, { touch: true });
    await target.expectVisible(selectors.getByText('Recovered reply.', { exact: true }), 120_000);
  },
);
