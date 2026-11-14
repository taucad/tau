/**
 * Test fixture: the chat store provider as it was before A2, for the component tests that mock `useProjectManager`
 * and `useFileManager` and render no app runtime. It builds its own store and mirrors those hooks' closures into it in
 * render through `setDependencies`, then hands it to the real `ChatSessionStoreProvider`. Production builds the store
 * in the runtime with the library's ports (A2).
 */
import { useState } from 'react';
import type { EventRejection } from 'xstate';
import { ChatSessionStore } from '#services/chat-session-store.js';
import { ChatSessionStoreProvider } from '#hooks/chat-session-store-provider.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { peekRevisionClient } from '#services/revision-client-registry.js';
import { inspect } from '#machines/inspector.js';
import {
  isPlacementOnThisDevice,
  isPlacementOnThisDeviceNow,
  onPlacementReachabilityChanged,
} from '#lib/agent-host-placement.js';

const warnRejectedEvent = (rejection: EventRejection): void => {
  console.warn('[ChatSessionStore] an actor rejected an event', rejection);
};

/**
 * A chat store provider over the mocked project manager and file manager.
 *
 * @param props - The tree.
 * @returns The provider element.
 */
export function MirroredChatSessionStoreProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [store] = useState(
    () =>
      new ChatSessionStore({
        ...(inspect === undefined ? {} : { inspect }),
        ...(import.meta.env.DEV ? { onRejectedEvent: warnRejectedEvent } : {}),
      }),
  );
  const projectManager = useProjectManager();
  const { recordFiles, watchRecordFile } = useFileManager();
  store.setDependencies({
    getChat: projectManager.getChat,
    patchChat: projectManager.patchChat,
    adoptLegacyChatPlacement: projectManager.adoptLegacyChatPlacement,
    isPlacementOnThisDevice,
    isPlacementOnThisDeviceNow,
    onPlacementReachabilityChanged,
    touchChatRecency: projectManager.touchChatRecency,
    consumeChatStartupRequest: projectManager.consumeChatStartupRequest,
    commitCancelledDraftRestore: projectManager.commitCancelledDraftRestore,
    client: recordFiles,
    watchRecordFile,
    pullRemote: async (projectId, chatId) => (await peekRevisionClient(projectId)?.pullRemote(chatId)) ?? true,
  });
  return <ChatSessionStoreProvider store={store}>{children}</ChatSessionStoreProvider>;
}
