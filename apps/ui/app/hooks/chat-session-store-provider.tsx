/**
 * ChatSessionStoreProvider
 *
 * App-shell-singleton provider that owns one `ChatSessionStore` for the
 * lifetime of the app. The store outlives every React subtree and owns the
 * per-chat AI SDK `Chat`, persistence actor, draft actor and composer record
 * actor, plus each project's unread record; React components subscribe via
 * `useChatSession(chatId)` (acquire/release) and
 * `useChatSessionSnapshot(chatId, selector)` (re-render gate).
 *
 * The provider mirrors the closures from `useProjectManager()` and the file
 * client the composer records are written through into the store on every
 * render via `setDependencies`, so the store always invokes the latest
 * worker-backed methods.
 */

import { createContext, useContext, useState } from 'react';
import { ChatSessionStore } from '#services/chat-session-store.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useFileManager } from '#hooks/use-file-manager.js';

const ChatSessionStoreContext = createContext<ChatSessionStore | undefined>(undefined);

type ChatSessionStoreProviderProps = {
  readonly children: React.ReactNode;
};

export function ChatSessionStoreProvider({ children }: ChatSessionStoreProviderProps): React.JSX.Element {
  const [store] = useState(() => new ChatSessionStore());
  const projectManager = useProjectManager();
  const { files } = useFileManager();

  // Mirror the latest project manager closures into the store synchronously
  // during render so child subtrees that acquire a session in the same
  // render pass (e.g. `<ActiveChatProvider>` → `useChatSession()`) see the
  // real worker-backed closures instead of the default throwing stubs. The
  // store reads `#deps` at call time, so this swap is atomic and never
  // tears in-flight work; calling it on every render is explicitly
  // supported (see `ChatSessionStore.setDependencies`).
  store.setDependencies({
    getChat: projectManager.getChat,
    patchChat: projectManager.patchChat,
    touchChatRecency: projectManager.touchChatRecency,
    consumeChatStartupRequest: projectManager.consumeChatStartupRequest,
    commitCancelledDraftRestore: projectManager.commitCancelledDraftRestore,
    // Composer records and chat attachments are files, reached through the root that owns them.
    client: files,
  });

  return <ChatSessionStoreContext.Provider value={store}>{children}</ChatSessionStoreContext.Provider>;
}

export function useChatSessionStore(): ChatSessionStore {
  const store = useContext(ChatSessionStoreContext);
  if (!store) {
    throw new Error('useChatSessionStore must be used within a ChatSessionStoreProvider');
  }
  return store;
}
