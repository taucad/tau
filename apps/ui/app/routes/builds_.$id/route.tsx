import { useParams } from 'react-router';
import { useCallback, useEffect } from 'react';
import { createActor, waitFor } from 'xstate';
import { useActorRef, useSelector } from '@xstate/react';
import { toast } from 'sonner';
import type { FileEditOutput, MyUIMessage } from '@taucad/chat';
import type { ChatOnToolCallCallback } from 'ai';
import { toolName } from '@taucad/chat/constants';
import type { Route } from './+types/route.js';
import { ChatInterface } from '#routes/builds_.$id/chat-interface.js';
import { BuildProvider, useBuild } from '#hooks/use-build.js';
import type { Handle } from '#types/matches.types.js';
import { useChatConstants } from '#utils/chat.utils.js';
import { ChatProvider, useChatSelector, ChatContext } from '#components/chat/chat-provider.js';
import { BuildNameEditor } from '#routes/builds_.$id/build-name-editor.js';
import { fileEditMachine } from '#machines/file-edit.machine.js';
import { ViewContextProvider } from '#routes/builds_.$id/chat-interface-view-context.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { BuildCommandPaletteItems } from '#routes/builds_.$id/build-command-items.js';
import { ChatModeSelector } from '#routes/builds_.$id/chat-mode-selector.js';
import { screenshotRequestMachine } from '#machines/screenshot-request.machine.js';
import { decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { FileManagerProvider, useFileManager } from '#hooks/use-file-manager.js';

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

function Chat() {
  const { buildRef, setChatMessages } = useBuild();
  const activeChatId = useSelector(buildRef, (state) => state.context.build?.lastChatId);
  const activeChat = useSelector(buildRef, (state) =>
    state.context.build?.chats.find((chat) => chat.id === activeChatId),
  );

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

  // Consolidated event-driven coordination
  useEffect(() => {
    // 1. Build loaded - initialize all chat state atomically
    const buildLoadedSub = buildRef.on('buildLoaded', ({ build }) => {
      const activeChat = build.chats.find((c) => c.id === build.lastChatId);
      if (!activeChat) {
        return;
      }

      chatActorRef.send({ type: 'initializeChat', chat: activeChat });
    });

    // 2. Chat switched - initialize new chat state atomically
    const chatChangedSub = buildRef.on('activeChatChanged', ({ chat }) => {
      chatActorRef.send({ type: 'initializeChat', chat });
    });

    // 3. Main draft changed - persist
    const draftChangedSub = chatActorRef.on('draftChanged', ({ chatId, draft }) => {
      buildRef.send({ type: 'updateChatDraft', chatId, draft });
    });

    // 4. Edit draft changed - persist
    const editDraftChangedSub = chatActorRef.on('editDraftChanged', ({ chatId, messageId, draft }) => {
      buildRef.send({ type: 'updateMessageEdit', chatId, messageId, draft });
    });

    // 5. Edit cleared (on submit) - remove from build
    const editClearedSub = chatActorRef.on('messageEditCleared', ({ chatId, messageId }) => {
      buildRef.send({ type: 'clearMessageEdit', chatId, messageId });
    });

    return () => {
      buildLoadedSub.unsubscribe();
      chatChangedSub.unsubscribe();
      draftChangedSub.unsubscribe();
      editDraftChangedSub.unsubscribe();
      editClearedSub.unsubscribe();
    };
  }, [buildRef, chatActorRef]);

  // Persist message changes to the active build chat
  useEffect(() => {
    if (!activeChatId || !activeChat) {
      return;
    }

    if (status === 'submitted') {
      // A message just got submitted, set the build messages to include the new message.
      setChatMessages(activeChatId, messages);
    } else if (
      status === 'ready' &&
      messages.length > 0 &&
      activeChat.messages.length > 0 &&
      activeChat.messages.length !== messages.length
    ) {
      // The chat became ready again, set the build messages to include the new messages.
      setChatMessages(activeChatId, messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- this is effectively a subscription to useChat, so we only respond to status & message changes
  }, [status, setChatMessages, messages]);

  return <ChatInterface />;
}

// Wrapper component that has access to build context and can configure AiChatProvider
function ChatWithProvider() {
  const { cadRef: cadActor, graphicsRef: graphicsActor, buildId, buildRef, getMainFilename } = useBuild();
  const name = useSelector(buildRef, (state) => state.context.build?.name);
  const description = useSelector(buildRef, (state) => state.context.build?.description);
  const activeChatId = useSelector(buildRef, (state) => state.context.build?.lastChatId);
  const fileManager = useFileManager();

  // Create file edit machine
  const fileEditRef = useActorRef(fileEditMachine);

  // Tool call handler that integrates with the new architecture
  const onToolCall: ChatOnToolCallCallback<MyUIMessage> = useCallback(
    async ({ toolCall }) => {
      if (toolCall.toolName === toolName.fileEdit) {
        const toolCallArgs = toolCall.input;

        // Get current code from build machine
        const mainFilePath = await getMainFilename();
        // Const resolvedPath = toolCallArgs.targetFile; TODO: use this when the chat server has knowledge of the filesystem.
        const resolvedPath = mainFilePath;
        const currentCode = await fileManager.readFile(resolvedPath);

        fileEditRef.start();
        fileEditRef.send({
          type: 'applyEdit',
          request: {
            targetFile: resolvedPath,
            originalContent: decodeTextFile(currentCode),
            codeEdit: toolCallArgs.codeEdit,
          },
        });

        // Wait for file edit to complete
        const fileEditSnapshot = await waitFor(
          fileEditRef,
          (state) => state.matches('success') || state.matches('error'),
        );

        if (fileEditSnapshot.matches('error')) {
          throw new Error(`File edit failed: ${fileEditSnapshot.context.error ?? 'Unknown error'}`);
        }

        const { result } = fileEditSnapshot.context;
        if (!result?.editedContent) {
          throw new Error('No content received from file edit service');
        }

        // Write the edited content to the file
        fileManager.writeFile(resolvedPath, encodeTextFile(result.editedContent));

        // Wait for CAD processing to complete
        const cadSnapshot = await waitFor(cadActor, (state) => state.value === 'ready' || state.value === 'error');

        const toolResult = {
          codeErrors: cadSnapshot.context.codeErrors,
          kernelError: cadSnapshot.context.kernelError,
        } satisfies FileEditOutput;

        return toolResult;
      }

      if (toolCall.toolName === toolName.imageAnalysis) {
        return new Promise<{ screenshot: string }>((resolve, reject) => {
          // Create screenshot request machine instance
          const screenshotActor = createActor(screenshotRequestMachine, {
            input: { graphicsRef: graphicsActor },
          }).start();

          // Request screenshot capture - backend will handle the Vision API call
          screenshotActor.send({
            type: 'requestScreenshot',
            options: {
              output: {
                format: 'image/webp',
                quality: 0.5, // Lower quality for smaller filesize -> less LLM inference token usage.
              },
              aspectRatio: 16 / 9,
              maxResolution: 1200,
              zoomLevel: 1.4,
            },
            onSuccess(dataUrls) {
              const screenshot = dataUrls[0];
              if (!screenshot) {
                screenshotActor.stop();
                reject(new Error('No screenshot data received'));
                return;
              }

              screenshotActor.stop();
              resolve({ screenshot });
            },
            onError(error) {
              screenshotActor.stop();
              reject(new Error(`Screenshot capture failed: ${error}`));
            },
          });
        });
      }

      return undefined;
    },
    [cadActor, fileEditRef, fileManager, getMainFilename, graphicsActor],
  );

  // Use chat ID when available, fallback to build ID
  // Backend can distinguish: chat IDs start with "chat_", build IDs start with "bld_"
  const threadId = activeChatId ?? buildId;

  return (
    <ChatProvider value={{ ...useChatConstants, id: threadId, onToolCall }} chatId={activeChatId}>
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
