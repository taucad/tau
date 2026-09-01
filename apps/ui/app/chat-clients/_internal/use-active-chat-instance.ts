import type { Chat } from '@ai-sdk/react';
import type { MyUIMessage } from '@taucad/chat';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';

/**
 * Module-private accessor for the live AI SDK `Chat` instance bound to the
 * active chat session. Calling this hook is now a **compile-time** assertion
 * that the call site lives under `<ActiveChatProvider>` — the session
 * context's existence guarantees the `Chat` instance, so the previous
 * defensive runtime `throw` is gone.
 *
 * Keeping this hook under `_internal/` (and importing it only from the three
 * chat-client files) is what stops the `body` / `metadata` literal sprawl
 * the blueprint removes — UI sites must reach the wire through a profile-
 * scoped client, never directly through `chat.sendMessage`.
 *
 * @internal
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- @internal, scoped to chat-clients
export const useActiveChatInstance = (): Chat<MyUIMessage> => useActiveChatSession().chat;
