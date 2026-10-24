import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import type { RecordFile } from '#support/chat-attachments.js';
import {
  composerSelector,
  countOf,
  readHomeJson,
  recordDraftText,
  recordPaths,
  seededChatIds,
} from '#support/chat-attachments.js';
import {
  anySurface,
  currentPath,
  detent,
  detents,
  followSidebarLink,
  grabber,
  moveSheet,
  navButton,
  openFromAll,
  openPhone,
  phoneViewports,
  projectTitle,
  sheetSettled,
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
 *   (`use-chat-interface-state.ts`); a file opens at full (WB-07).
 * - A chat draft lives in the chat's composer record, so it outlives every unmount and stays with its chat.
 * - Scroll offsets are not asserted: the canvas and charter specify none, and the phone mounts only the active
 *   surface, the chat reopening at its latest turn.
 */

const composer = (): Locator => selectors.getByCss(composerSelector).first();
const composerText = async (): Promise<string> => {
  const text = await target.textContent(composer());
  return text?.trim() ?? '';
};

/** The project the top bar names. */
const projectName = async (): Promise<string> => {
  const name = await target.textContent(projectTitle().getByCss(':scope > span').first());
  return name?.trim() ?? '';
};

const usage = { inputTokens: 12, outputTokens: 6 };

test.each(phoneViewports)(
  'reopens the surface each project had after a reload and across Back and Forward at $width×$height',
  async (viewport) => {
    await openPhone(viewport, '/__e2e/project-navigation');
    await expect.poll(projectName, { timeout: 60_000 }).toBe('Project Navigation A');
    const projectA = await currentPath();
    // A fresh project rests on its model.
    await target.expectCount(anySurface(), 0);
    expect(await target.getAttribute(navButton('Model'), 'aria-current')).toBe('page');

    await tapDestination('Parameters');
    await target.expectVisible(surface('Parameters'), 60_000);
    expect(await detent()).toBe(detents.half);
    await moveSheet('End', detents.full);

    // Reload: the project's surface comes back, at the height a surface reopens at.
    await target.reload();
    await target.expectVisible(surface('Parameters'), 60_000);
    expect(await target.getAttribute(navButton('Parameters'), 'aria-current')).toBe('page');
    await expect.poll(detent).toBe(detents.half);

    // Another project: its own state, never the surface this one had open.
    await followSidebarLink('Project Navigation B');
    await expect.poll(currentPath, { timeout: 60_000 }).not.toBe(projectA);
    const projectB = await currentPath();
    await expect.poll(projectName, { timeout: 60_000 }).toBe('Project Navigation B');
    await expect.poll(async () => target.getAttribute(navButton('Model'), 'aria-current')).toBe('page');
    await target.expectCount(anySurface(), 0);
    await openFromAll('Files');

    // Back returns to A with A's surface; Forward to B with B's.
    expect(await traverseHistory('back')).toBe(projectA);
    await expect.poll(projectName, { timeout: 60_000 }).toBe('Project Navigation A');
    await target.expectVisible(surface('Parameters'), 60_000);
    await target.expectCount(surface('Files'), 0);
    await expect.poll(detent).toBe(detents.half);

    expect(await traverseHistory('forward')).toBe(projectB);
    await expect.poll(projectName, { timeout: 60_000 }).toBe('Project Navigation B');
    await target.expectVisible(surface('Files'), 60_000);
    await target.expectCount(surface('Parameters'), 0);

    // The Model restores the stage, and that too is the project's state across a step back and forward.
    await tapDestination('Model');
    await target.expectCount(anySurface(), 0);
    expect(await traverseHistory('back')).toBe(projectA);
    await target.expectVisible(surface('Parameters'), 60_000);
    expect(await traverseHistory('forward')).toBe(projectB);
    await expect.poll(projectName, { timeout: 60_000 }).toBe('Project Navigation B');
    await expect.poll(async () => target.getAttribute(navButton('Model'), 'aria-current')).toBe('page');
    await target.expectCount(anySurface(), 0);
  },
);

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
    await target.expectCount(anySurface(), 0);
    await tapDestination('Chat');
    await expect.poll(composerText, { timeout: 30_000 }).toBe(draft);

    // Another surface, a surface from All, then the Model: the draft is still the chat's.
    await tapDestination('Parameters');
    await target.expectVisible(surface('Parameters'), 60_000);
    await openFromAll('Details');
    await tapDestination('Model');
    await target.expectCount(anySurface(), 0);
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

    await moveSheet('Home', detents.peek);
    await moveSheet('End', detents.full);
    await target.expectValue(width, '31');

    await openFromAll('Files');
    await tapDestination('Model');
    await target.expectCount(anySurface(), 0);
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

/**
 * Ask for the peek, full and half in turn and look at each part. A surface whose decision or failure no longer fits
 * raises itself (I5, `useRaiseWhenClipped`), so a request may settle higher than asked; it never settles lower, and it
 * never leaves a part cut off.
 *
 * @param parts - What must be wholly on screen.
 * @returns The detent each request settled on.
 */
const expectShownAtEveryDetent = async (parts: readonly Locator[]): Promise<readonly string[]> => {
  const shownAll = async (): Promise<ReadonlyArray<string | undefined>> =>
    Promise.all(parts.map(async (part) => unshownEverywhere(part)));
  const settled: string[] = [];
  for (const [key, requested] of [
    ['Home', detents.peek],
    ['End', detents.full],
    ['ArrowDown', detents.half],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one detent at a time.
    await target.press(grabber(), key);
    // oxlint-disable-next-line no-await-in-loop -- one detent at a time.
    await sheetSettled();
    // A raise lands within a frame or two of the move; let it, then let the sheet finish moving.
    // oxlint-disable-next-line no-await-in-loop -- one detent at a time.
    await target.delay(300);
    // oxlint-disable-next-line no-await-in-loop -- one detent at a time.
    await sheetSettled();
    // oxlint-disable-next-line no-await-in-loop -- one detent at a time.
    const landed = (await detent()) ?? '';
    expect(Number(landed), `asked for detent ${requested}`).toBeGreaterThanOrEqual(Number(requested));
    settled.push(landed);
    // oxlint-disable-next-line no-await-in-loop -- one detent at a time.
    await expect.poll(shownAll, { timeout: 10_000 }).toEqual(parts.map(() => undefined));
  }
  return settled;
};

test.each(phoneViewports)(
  'keeps a pending question and both answers on screen at peek, half and full at $width×$height (I5, WB-09, PN-CHAT-4)',
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
    await send('Design a desk ornament');

    const question = selectors.getByText('Which form should the desk ornament take?', { exact: true });
    const recommended = selectors.getByRole('button', {
      name: 'A, Twisted ribbon, recommended. Prints without supports.',
    });
    const other = selectors.getByRole('button', { name: 'B, Faceted gem. Crisp at 0.2 mm layers.' });
    await expect.poll(async () => countOf(other), { timeout: 120_000 }).toBeGreaterThan(0);
    await expectShownAtEveryDetent([question, recommended, other]);

    // Away and back: the question is still waiting.
    await tapDestination('Parameters');
    await target.expectVisible(surface('Parameters'), 60_000);
    // Back on Chat the question is still there, and answering it finishes the turn.
    await tapDestination('Chat');
    await expect.poll(async () => unshownEverywhere(other), { timeout: 30_000 }).toBeUndefined();
    await target.click(other.first(), { touch: true });
    await target.expectVisible(selectors.getByText('Going with the faceted gem.', { exact: true }), 120_000);
  },
);

test.each(phoneViewports)(
  'keeps a failed run and its recovery on screen at peek, half and full at $width×$height (I5, PN-CHAT-7)',
  async (viewport) => {
    await openPhone(viewport, '/__e2e/chat-attachments');
    await target.installAgentHostGatewayFixture([{ text: 'Recovered reply.', usage }]);
    await tapDestination('Chat');
    await target.expectVisible(composer(), 60_000);
    await target.setAgentHostGatewayFailure({ status: 400, message: 'Refused once.', type: 'INVALID_REQUEST' });
    await send('Model a bracket');

    const recovery = selectors.getByRole('button', { name: /^(?:Resume|Try again)$/u });
    await target.expectVisible(recovery, 120_000);
    await target.setAgentHostGatewayFailure();
    const failure = selectors.getByRole('alert').filter({ has: recovery });
    await expectShownAtEveryDetent([failure, recovery]);

    // Away and back, the failure is still the chat's last word, and its recovery finishes the turn.
    await tapDestination('Parameters');
    await target.expectVisible(surface('Parameters'), 60_000);
    await tapDestination('Chat');
    await target.expectVisible(recovery, 30_000);
    await target.click(recovery, { touch: true });
    await target.expectVisible(selectors.getByText('Recovered reply.', { exact: true }), 120_000);
  },
);
