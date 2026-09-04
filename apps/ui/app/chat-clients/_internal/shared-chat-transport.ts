import { Chat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import type { MyUIMessage } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { BrowserPlacementChatTransport } from '#chat-clients/_internal/browser-agent-host-transport.js';

/**
 * Single shared transport. Constructed once at module load so N concurrent
 * sessions share one fetch factory.
 *
 * Lives under `chat-clients/_internal/` to enforce the rule that *only* the
 * profile-scoped chat clients (and the session store that owns the live
 * `Chat` instances they consume) may touch the AI SDK transport surface.
 * Every other UI site must reach the wire through a chat-client verb so
 * `body: { agent }` composition stays centralised (blueprint R7-R10).
 *
 * @internal
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- @internal, scoped to chat-clients & chat-session-store
export const sharedChatTransport = new BrowserPlacementChatTransport<MyUIMessage>();

/** Seeds the exact durable run selected by project-scoped reload discovery. */
export const bindDurableChatRun = (chatId: string, runId: string): void => {
  sharedChatTransport.bindRun(chatId, runId);
};

/** Reads the exact run captured by admission before the AI SDK finish callback. */
export const getBoundDurableChatRunId = (chatId: string): string | undefined =>
  sharedChatTransport.getBoundRunId(chatId);

type CreateChatInstanceOptions = {
  readonly chatId: string;
  readonly onFinish: NonNullable<ConstructorParameters<typeof Chat<MyUIMessage>>[0]['onFinish']>;
  readonly onError: NonNullable<ConstructorParameters<typeof Chat<MyUIMessage>>[0]['onError']>;
};

/**
 * Factory for a per-session AI SDK `Chat<MyUIMessage>` instance.
 *
 * The chat-session store calls this once per chat acquisition; clients then
 * read the instance via `useActiveChatInstance` and never construct one
 * directly. Centralising `id` / `transport` / `generateId` here means a
 * change to the API surface (e.g. a new transport, a different id format)
 * is one edit.
 *
 * @internal
 */
export const createChatInstance = ({ chatId, onFinish, onError }: CreateChatInstanceOptions): Chat<MyUIMessage> =>
  new Chat<MyUIMessage>({
    id: chatId,
    transport: sharedChatTransport,
    generateId: () => generatePrefixedId(idPrefix.message),
    onFinish,
    onError,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
