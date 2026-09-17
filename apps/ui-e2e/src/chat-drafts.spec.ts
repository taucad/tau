import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import type { RecordFile } from '#support/chat-attachments.js';
import {
  composerSelector,
  dismissCookies,
  pdfModelName,
  prepareComposerPage,
  readHomeJson,
  recordDraftText,
  recordPaths,
  seededChatIds,
  selectModel,
  sendDraft,
} from '#support/chat-attachments.js';

/**
 * The blueprint's browser proof for composer records (W15): every composer field
 * and the project's unread record live in Home files, so a reload restores them,
 * and a chat's selection never leaks into another chat.
 */

const replyText = 'Draft reply.';
const replyScript: readonly GatewayScriptTurn[] = [{ text: replyText, usage: { inputTokens: 20, outputTokens: 3 } }];
const toolLabels = ['Auto', 'No tools', 'Any tool', 'Custom'];

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

/** The tool selector's label: its trigger is rendered but hidden in the product until MCP ships. */
const toolChoiceLabel = async (): Promise<string | undefined> =>
  target.evaluate(
    (labels) =>
      [...document.querySelectorAll('button')]
        .map((button) => button.textContent.trim())
        .find((text) => labels.includes(text)),
    toolLabels,
  );

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

test('restores draft text, mode and tool choice after a reload, and keeps mode per chat', async () => {
  const { projectId, chatIds } = await openSeededChats();
  const recordPath = recordPaths.chat(projectId, chatIds[0]!);

  // The seeded record hydrates a pristine composer (D7).
  await expect.poll(toolChoiceLabel, { timeout: 30_000 }).toBe('No tools');

  const draftText = 'Draft that must survive a reload.';
  await target.type(selectors.getByCss(composerSelector).first(), draftText);
  await target.click(selectors.getByRole('button', { name: 'Select mode (Agent)' }));
  await target.click(selectors.getByRole('option', { name: 'Plan' }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Select mode (Plan)' }));

  await expect
    .poll(
      async () => {
        const record = await readHomeJson<RecordFile>(recordPath);
        return { text: recordDraftText(record), mode: record?.mode, toolChoice: record?.toolChoice };
      },
      { timeout: 30_000 },
    )
    .toEqual({ text: draftText, mode: 'plan', toolChoice: 'none' });

  await target.reload();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  await target.expectContainingText(selectors.getByCss(composerSelector).first(), draftText, 30_000);
  await target.expectVisible(selectors.getByRole('button', { name: 'Select mode (Plan)' }), 30_000);
  await expect.poll(toolChoiceLabel).toBe('No tools');

  // The other chat has its own record: no draft, and the default mode.
  await openChat('Second chat');
  await target.expectVisible(selectors.getByRole('button', { name: 'Select mode (Agent)' }), 30_000);
  expect(await target.textContent(selectors.getByCss(composerSelector).first())).not.toContain(draftText);
  const secondRecord = await readHomeJson<RecordFile>(recordPaths.chat(projectId, chatIds[1]!));
  expect(secondRecord?.mode).toBeUndefined();

  await openChat('Attachments chat');
  await target.expectVisible(selectors.getByRole('button', { name: 'Select mode (Plan)' }), 30_000);
  await target.expectContainingText(selectors.getByCss(composerSelector).first(), draftText, 30_000);
});

test('restores an open message edit after a reload', async () => {
  const { projectId, chatIds } = await openSeededChats();
  await selectModel(pdfModelName);
  const original = 'Original message for the edit proof.';
  await sendDraft(original);
  await target.expectVisible(selectors.getByText(replyText, { exact: true }).last(), 120_000);

  const bubble = selectors.getByRole('button', { name: original, exact: true });
  const editComposer = selectors.getByCss(`article ${composerSelector}`).first();
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
