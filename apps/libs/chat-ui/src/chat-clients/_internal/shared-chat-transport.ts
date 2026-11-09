import { Chat } from '@ai-sdk/react';
import type { MyUIMessage } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import type { BrowserPlacementChatTransport } from '#chat-clients/_internal/browser-agent-host-transport.js';

type CreateChatInstanceOptions = {
  readonly chatId: string;
  readonly transport: BrowserPlacementChatTransport<MyUIMessage>;
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
export const createChatInstance = ({
  chatId,
  transport,
  onFinish,
  onError,
}: CreateChatInstanceOptions): Chat<MyUIMessage> =>
  new Chat<MyUIMessage>({
    id: chatId,
    transport,
    generateId: () => generatePrefixedId(idPrefix.message),
    onFinish,
    onError,
  });
