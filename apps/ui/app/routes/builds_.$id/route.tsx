import { useParams } from 'react-router';
import { useEffect } from 'react';
import { useSelector } from '@xstate/react';
import { toast } from 'sonner';
import type { Route } from './+types/route.js';
import { ChatInterface } from '#routes/builds_.$id/chat-interface.js';
import { BuildProvider, useBuild } from '#hooks/use-build.js';
import type { Handle } from '#types/matches.types.js';
import { useChatConstants } from '#utils/chat.utils.js';
import { ChatProvider, ChatContext, useChatSelector } from '#hooks/use-chat.js';
import { BuildNameEditor } from '#routes/builds_.$id/build-name-editor.js';
import { ViewContextProvider } from '#routes/builds_.$id/chat-interface-view-context.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { BuildCommandPaletteItems } from '#routes/builds_.$id/build-command-items.js';
import { ChatModeSelector } from '#routes/builds_.$id/chat-mode-selector.js';
import { FileManagerProvider } from '#hooks/use-file-manager.js';
import { useChatManager } from '#hooks/use-chat-manager.js';
import { useChatTools } from '#hooks/use-chat-tools.js';

// Define provider component at module level for stable reference across HMR
function RouteProvider({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  const { id } = useParams();
  return (
    <FileManagerProvider rootDirectory={`/builds/${id}`}>
      <BuildProvider buildId={id!}>{children}</BuildProvider>
    </FileManagerProvider>
  );
}

export const handle: Handle = {
  breadcrumb(match) {
    const { id } = match.params as Route.LoaderArgs['params'];

    return [<BuildNameEditor key={`${id}-build-name-editor`} />, <ChatModeSelector key={`${id}-chat-mode-selector`} />];
  },
  commandPalette(match) {
    return <BuildCommandPaletteItems match={match} />;
  },
  providers: () => RouteProvider,
  enableFloatingSidebar: true,
};

function Chat(): React.JSX.Element {
  const { buildRef } = useBuild();
  const { getChat, updateChat } = useChatManager();
  const activeChatId = useSelector(buildRef, (state) => state.context.build?.lastChatId);

  const messages = useChatSelector((state) => state.context.messages);
  const status = useChatSelector((state) => state.context.status);
  const chatActorRef = ChatContext.useActorRef();

  useKeydown(
    {
      key: 's',
      metaKey: true,
    },
    () => {
      toast.success('Your build is saved automatically');
    },
  );

  // Chat persistence coordination with ChatManager
  // Load chat when activeChatId changes
  useEffect(() => {
    const loadChat = async () => {
      if (!activeChatId) {
        console.log('[Chat Init] No activeChatId yet');
        return;
      }

      console.log('[Chat Init] Loading chat:', activeChatId);
      const activeChat = await getChat(activeChatId);
      console.log('[Chat Init] Fetched chat:', activeChat);

      if (!activeChat) {
        console.log('[Chat Init] Chat not found');
        return;
      }

      console.log('[Chat Init] Sending initializeChat with', activeChat.messages.length, 'messages');
      chatActorRef.send({ type: 'initializeChat', chat: activeChat });
    };

    void loadChat();
  }, [activeChatId, chatActorRef, getChat]);

  // Set up event listeners for chat persistence
  useEffect(() => {
    // 1. Main draft changed - persist to chat manager
    const draftChangedSub = chatActorRef.on('draftChanged', async ({ chatId, draft }) => {
      await updateChat(chatId, { draft });
    });

    // 2. Edit draft changed - persist to chat manager
    const editDraftChangedSub = chatActorRef.on('editDraftChanged', async ({ chatId, messageId, draft }) => {
      await updateChat(chatId, { messageEdits: { [messageId]: draft } });
    });

    // 3. Edit cleared (on submit) - remove from chat manager
    const editClearedSub = chatActorRef.on('messageEditCleared', async ({ chatId, messageId }) => {
      // Get current chat and remove the specific message edit
      const chat = await getChat(chatId);
      if (chat?.messageEdits?.[messageId]) {
        const updatedEdits = { ...chat.messageEdits };
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- need to remove message edit
        delete updatedEdits[messageId];
        await updateChat(chatId, { messageEdits: updatedEdits }, { ignoreKeys: ['messageEdits'] });
      }
    });

    return () => {
      draftChangedSub.unsubscribe();
      editDraftChangedSub.unsubscribe();
      editClearedSub.unsubscribe();
    };
  }, [chatActorRef, getChat, updateChat]);

  // Persist message changes to the chat manager
  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    const persistMessages = async () => {
      const chat = await getChat(activeChatId);
      if (!chat) {
        return;
      }

      if (status === 'submitted') {
        // A message just got submitted, save the messages
        await updateChat(activeChatId, { messages });
      } else if (
        status === 'ready' &&
        messages.length > 0 &&
        chat.messages.length > 0 &&
        chat.messages.length !== messages.length
      ) {
        // The chat became ready again, save the new messages
        await updateChat(activeChatId, { messages });
      }
    };

    void persistMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only respond to status & message changes
  }, [status, messages]);

  return <ChatInterface />;
}

// Wrapper component that has access to build context and can configure AiChatProvider
function ChatWithProvider(): React.JSX.Element {
  const { buildId, buildRef } = useBuild();
  const name = useSelector(buildRef, (state) => state.context.build?.name);
  const description = useSelector(buildRef, (state) => state.context.build?.description);
  const activeChatId = useSelector(buildRef, (state) => state.context.build?.lastChatId);

  // Get chat tools handler
  const { onToolCall } = useChatTools();

  return (
    <ChatProvider
      key={activeChatId}
      value={{ ...useChatConstants, onToolCall }}
      chatId={activeChatId}
      resourceId={buildId}
    >
      <ViewContextProvider>
        {name ? <title>{name}</title> : null}
        {description ? <meta name="description" content={description} /> : null}
        <Chat />
      </ViewContextProvider>
    </ChatProvider>
  );
}

export default function ChatRoute(): React.JSX.Element {
  return <ChatWithProvider />;
}
