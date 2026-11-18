/**
 * Test fixture: the chat store provider as it was before A2, for the component tests that mock `useProjectManager`
 * and `useFileManager` and render no app runtime. It builds its own store and mirrors those hooks' closures into it in
 * render through `setDependencies`, then hands it to the real `ChatSessionStoreProvider`. Production builds the store
 * in the runtime with the library's ports (A2).
 */
import { useState } from 'react';
import type { EventRejection } from 'xstate';
import { ChatSessionStore } from '#services/chat-session-store.js';
import type { ChatSessionStoreOptions } from '#services/chat-session-store.js';
import { ChatSessionStoreProvider } from '#hooks/chat-session-store-provider.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { peekRevisionClient } from '@taucad/revisions-ui/services/revision-client-registry';
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
 * @param props - The tree, and the live project sessions the store follows.
 * @returns The provider element.
 */
export function MirroredChatSessionStoreProvider({
  children,
  projectSessions,
}: {
  readonly children: React.ReactNode;
  /** The live project sessions the store follows, as the runtime hands it the registry's (A7c). */
  readonly projectSessions?: ChatSessionStoreOptions['projectSessions'];
}): React.JSX.Element {
  const [store] = useState(
    () =>
      new ChatSessionStore({
        ...(inspect === undefined ? {} : { inspect }),
        ...(import.meta.env.DEV ? { onRejectedEvent: warnRejectedEvent } : {}),
        ...(projectSessions === undefined ? {} : { projectSessions }),
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
