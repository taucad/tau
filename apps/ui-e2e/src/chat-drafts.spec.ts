import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import type { RecordFile } from '#support/chat-attachments.js';
import {
  agentTrigger,
  composerSelector,
  editComposerSelector,
  dismissCookies,
  imageOnlyModelName,
  pdfModelName,
  prepareComposerPage,
  readHomeJson,
  recordDraftText,
  recordPaths,
  seededChatIds,
  selectModel,
  selectReasoningLevel,
  sendDraft,
} from '#support/chat-attachments.js';

/**
 * The blueprint's browser proof for composer records (W15): every composer field
 * and the project's unread record live in Home files, so a reload restores them,
 * and a chat's draft never leaks into another chat.
 */

const replyText = 'Draft reply.';
const replyScript: readonly GatewayScriptTurn[] = [{ text: replyText, usage: { inputTokens: 20, outputTokens: 3 } }];

const openSeededChats = async (
  script: readonly GatewayScriptTurn[] = replyScript,
): Promise<{ projectId: string; chatIds: readonly string[] }> => {
  await prepareComposerPage();
  await target.installAgentHostGatewayFixture(script);
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate('/__e2e/chat-attachments?chats=2&seed=drafts');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await dismissCookies();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  return seededChatIds();
};

const chatMark = async (name: string): Promise<string | undefined> =>
  target.evaluate(
    (chatName) =>
      [...document.querySelectorAll<HTMLElement>('[data-slot="chat-trigger"]')]
        .find((row) => row.querySelector('a')?.textContent.trim() === chatName)
        ?.querySelector<HTMLElement>('[data-glyph]')?.dataset['glyph'],
    name,
  );

const openChat = async (name: string): Promise<void> => {
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

test('restores draft text and the reasoning level after a reload, and keeps the draft per chat', async () => {
  const { projectId, chatIds } = await openSeededChats();
  const recordPath = recordPaths.chat(projectId, chatIds[0]!);

  // A model that offers levels, so the sheet shows its reasoning control.
  await selectModel(imageOnlyModelName);
  await selectReasoningLevel('Low');
  await target.expectVisible(
    selectors.getByRole('button', { name: `Agent and model: ${imageOnlyModelName}, reasoning Low` }),
  );

  const draftText = 'Draft that must survive a reload.';
  await target.type(selectors.getByCss(composerSelector).first(), draftText);
  await expect
    .poll(async () => recordDraftText(await readHomeJson<RecordFile>(recordPath)), { timeout: 30_000 })
    .toBe(draftText);

  await target.reload();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await target.expectContainingText(selectors.getByCss(composerSelector).first(), draftText, 30_000);
  await expect
    .poll(async () => target.getAttribute(agentTrigger(), 'aria-label'), { timeout: 30_000 })
    .toBe(`Agent and model: ${imageOnlyModelName}, reasoning Low`);

  // The other chat has its own record: no draft.
  await openChat('Second chat');
  await target.expectVisible(agentTrigger(), 30_000);
  expect(await target.textContent(selectors.getByCss(composerSelector).first())).not.toContain(draftText);

  await openChat('Attachments chat');
  await target.expectContainingText(selectors.getByCss(composerSelector).first(), draftText, 30_000);
});

test('restores an open message edit after a reload', async () => {
  const { projectId, chatIds } = await openSeededChats();
  await selectModel(pdfModelName);
  const original = 'Original message for the edit proof.';
  await sendDraft(original);
  await target.expectVisible(selectors.getByText(replyText, { exact: true }).last(), 120_000);

  const bubble = selectors.getByRole('button', { name: original, exact: true });
  const editComposer = selectors.getByCss(editComposerSelector).first();
  await target.click(bubble);
  await target.expectVisible(editComposer);
  const revision = ' Revised before the reload.';
  await target.type(editComposer, revision);

  await expect
    .poll(
      async () => {
        const record = await readHomeJson<RecordFile>(recordPaths.chat(projectId, chatIds[0]!));
        return Object.values(record?.messageEdits ?? {}).some((edit) =>
          edit.parts.some((part) => part.type === 'text' && (part.text ?? '').includes(revision.trim())),
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  await target.reload();
  // A restored edit is what the bubble shows, so its name now carries the revision too.
  const editedBubble = selectors.getByRole('button', { name: /^Original message for the edit proof\. Revised/u });
  await target.expectVisible(editedBubble, 60_000);
  await target.click(editedBubble);
  await target.expectVisible(editComposer);
  await target.expectContainingText(editComposer, revision.trim(), 30_000);
});

test('keeps unread across a reload and clears it when the chat is focused', async () => {
  const { projectId, chatIds } = await openSeededChats();
  const secondChatId = chatIds[1]!;

  await expect.poll(async () => chatMark('Second chat'), { timeout: 30_000 }).toBe('unread');
  await target.reload();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await expect.poll(async () => chatMark('Second chat'), { timeout: 30_000 }).toBe('unread');
  const unreadRecord = await readHomeJson<RecordFile>(recordPaths.unread(projectId));
  expect(unreadRecord?.unread?.[secondChatId]).toBe(true);

  await openChat('Second chat');
  await expect.poll(async () => chatMark('Second chat'), { timeout: 30_000 }).not.toBe('unread');
  // D8: an entry exists only while true.
  await expect
    .poll(
      async () => {
        const record = await readHomeJson<RecordFile>(recordPaths.unread(projectId));
        return record?.unread?.[secondChatId];
      },
      {
        timeout: 30_000,
      },
    )
    .toBeUndefined();

  await target.reload();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await expect.poll(async () => chatMark('Second chat'), { timeout: 30_000 }).not.toBe('unread');
});

/* F2/R3: a sidebar row holds a view of its chat, so a turn that finishes in a chat
 * the person is not looking at is unread even while the window has focus. */
test('marks a turn that finishes in another chat unread with the window focused, and keeps it across a reload', async () => {
  const { projectId, chatIds } = await openSeededChats([
    { text: replyText, gated: true, usage: { inputTokens: 20, outputTokens: 3 } },
  ]);
  const firstChatId = chatIds[0]!;
  await openChat('Attachments chat');
  await sendDraft('Finish while I look elsewhere.');
  await target.expectVisible(selectors.getByText(replyText, { exact: true }).last(), 60_000);

  await openChat('Second chat');
  await target.releaseAgentHostGatewayFixture();

  await expect.poll(async () => chatMark('Attachments chat'), { timeout: 60_000 }).toBe('unread');
  await expect
    .poll(
      async () => {
        const record = await readHomeJson<RecordFile>(recordPaths.unread(projectId));
        return record?.unread?.[firstChatId];
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  await target.reload();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await expect.poll(async () => chatMark('Attachments chat'), { timeout: 30_000 }).toBe('unread');
});
