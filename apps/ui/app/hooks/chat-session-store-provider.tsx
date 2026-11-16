/**
 * ChatSessionStoreProvider
 *
 * Hands down the app runtime's one `ChatSessionStore`, which outlives every
 * React subtree and owns the per-chat AI SDK `Chat`, persistence actor, draft
 * actor and composer record actor, plus each project's unread record; React
 * components subscribe via `useChatSession(chatId, projectId)`
 * (acquire/release) and `useChatSessionSnapshot(chatId, selector)` (re-render
 * gate).
 *
 * The runtime builds the store with its dependencies (A2): the project
 * library's chat-record ports and its record-file facade. Nothing is mirrored
 * here, and the store survives an owner-change remount of the billing fence
 * (B9).
 */

import { createContext, useContext } from 'react';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import { selectRuntimeChatSessions } from '#runtime/app-runtime.js';
import { useAppRuntime } from '#runtime/app-runtime-provider.js';

const ChatSessionStoreContext = createContext<ChatSessionStore | undefined>(undefined);

type ChatSessionStoreProviderProps = {
  readonly children: React.ReactNode;
  /** A store a test composes instead of the runtime's. */
  readonly store?: ChatSessionStore;
};

/**
 * Hand down the chat store: the runtime's, or the one a test passes.
 *
 * @param props - The tree, and a test's store.
 * @returns The provider element.
 * @public
 */
export function ChatSessionStoreProvider({ children, store }: ChatSessionStoreProviderProps): React.JSX.Element {
  return store === undefined ? (
    <RuntimeChatSessionStore>{children}</RuntimeChatSessionStore>
  ) : (
    <ChatSessionStoreContext.Provider value={store}>{children}</ChatSessionStoreContext.Provider>
  );
}

function RuntimeChatSessionStore({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const store = selectRuntimeChatSessions(useAppRuntime());
  return <ChatSessionStoreContext.Provider value={store}>{children}</ChatSessionStoreContext.Provider>;
}

export function useChatSessionStore(): ChatSessionStore {
  const store = useContext(ChatSessionStoreContext);
  if (!store) {
    throw new Error('useChatSessionStore must be used within a ChatSessionStoreProvider');
  }
  return store;
}
