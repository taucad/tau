import { useParams } from 'react-router';
import { useCallback, useEffect } from 'react';
import { createActor } from 'xstate';
import { toast } from 'sonner';
// eslint-disable-next-line no-restricted-imports -- allowed for route types
import type { Route } from './+types/route.js';
import { ChatInterface } from '#routes/builds_.$id/chat-interface.js';
import { BuildProvider, useBuild } from '#hooks/use-build.js';
import type { Handle } from '#types/matches.types.js';
import { useChatConstants } from '#utils/chat.utils.js';
import { AiChatProvider, useChatActions, useChatSelector } from '#components/chat/ai-chat-provider.js';
import { BuildNameEditor } from '#routes/builds_.$id/build-name-editor.js';
import { fileEditMachine } from '#machines/file-edit.machine.js';
import type { FileEditToolResult } from '#routes/builds_.$id/chat-message-tool-file-edit.js';
import { ViewContextProvider } from '#routes/builds_.$id/chat-interface-controls.js';
import { CommandPaletteTrigger } from '#routes/builds_.$id/command-palette.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { ChatControls } from '#routes/builds_.$id/chat-controls.js';
import { ChatModeSelector } from '#routes/builds_.$id/chat-mode-selector.js';
import { screenshotRequestMachine } from '#machines/screenshot-request.machine.js';
import { BuildGitConnector } from '#routes/builds_.$id/build-git-connector.js';

// Define provider component at module level for stable reference across HMR
function RouteProvider({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  const { id } = useParams();
  return <BuildProvider buildId={id!}>{children}</BuildProvider>;
}

export const handle: Handle = {
  breadcrumb(match) {
    const { id } = match.params as Route.LoaderArgs['params'];

    return [<BuildNameEditor key={`${id}-build-name-editor`} />, <ChatModeSelector key={`${id}-chat-mode-selector`} />];
  },
  actions() {
    return (
      <>
        <ChatControls />
        <BuildGitConnector />
      </>
    );
  },
  commandPalette() {
    return <CommandPaletteTrigger />;
  },
  providers: () => RouteProvider,
  enableFloatingSidebar: true,
};

function Chat() {
  const { id } = useParams();
  const { build, isLoading, activeChat, activeChatId, setChatMessages } = useBuild();

  const messages = useChatSelector((state) => state.context.messages);
  const status = useChatSelector((state) => state.context.status);
  const { setMessages, reload } = useChatActions();

  useKeydown(
    {
      key: 's',
      metaKey: true,
    },
    () => {
      toast.success('Your build is saved automatically');
    },
  );

  useEffect(() => {
    if (!build || isLoading) {
      return;
    }

    // Set initial messages based on active chat or legacy messages
    if (activeChat) {
      setMessages(activeChat.messages);

      // Reload when the last message is not an assistant message
      if (activeChat.messages.length > 0 && activeChat.messages.at(-1)?.role !== 'assistant') {
        reload();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when build, activeChat, or loading state changes
  }, [id, isLoading, activeChatId]);

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
  const { cadRef: cadActor, graphicsRef: graphicsActor, activeChatId, buildId, build } = useBuild();

  // Tool call handler that integrates with the new architecture
  const onToolCall = useCallback(
    async ({ toolCall }: { toolCall: { toolName: string; args: unknown } }) => {
      console.log('Tool call received:', toolCall);

      if (toolCall.toolName === 'edit_file') {
        const toolCallArgs = toolCall.args as { targetFile: string; codeEdit: string };

        // Get current code from CAD actor
        const currentCode = cadActor.getSnapshot().context.code;

        // Create file edit actor to process the edit through Morph
        const fileEditActor = createActor(fileEditMachine).start();

        return new Promise<FileEditToolResult['result']>((resolve, reject) => {
          // Subscribe to file edit actor state changes
          const subscription = fileEditActor.subscribe((state) => {
            if (state.matches('success') || state.matches('error')) {
              const { result } = state.context;
              if (result?.editedContent) {
                // Set the processed code from Morph to the CAD actor
                // On error, this will be the original content as fallback
                cadActor.send({ type: 'setCode', code: result.editedContent });

                // Wait for CAD processing to complete
                const cadSubscription = cadActor.subscribe((cadState) => {
                  if (cadState.value === 'ready' || cadState.value === 'error') {
                    const toolResult = {
                      codeErrors: cadState.context.codeErrors,
                      kernelError: cadState.context.kernelError,
                    } satisfies FileEditToolResult['result'];

                    cadSubscription.unsubscribe();
                    subscription.unsubscribe();
                    fileEditActor.stop();
                    resolve(toolResult);
                  }
                });
              } else {
                subscription.unsubscribe();
                fileEditActor.stop();
                reject(new Error('No content received from file edit service'));
              }
            }
          });

          // Send the edit request to Morph
          fileEditActor.send({
            type: 'applyEdit',
            request: {
              targetFile: toolCallArgs.targetFile,
              originalContent: currentCode,
              codeEdit: toolCallArgs.codeEdit,
            },
          });
        });
      }

      if (toolCall.toolName === 'analyze_image') {
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
    [cadActor, graphicsActor],
  );

  // Use chat ID when available, fallback to build ID
  // Backend can distinguish: chat IDs start with "chat_", build IDs start with "bld_"
  const threadId = activeChatId ?? buildId;

  return (
    <AiChatProvider value={{ ...useChatConstants, id: threadId, onToolCall }}>
      <ViewContextProvider>
        {build?.name ? <title>{build.name}</title> : null}
        {build?.description ? <meta name="description" content={build.description} /> : null}
        <Chat />
      </ViewContextProvider>
    </AiChatProvider>
  );
}

export default function ChatRoute(): React.JSX.Element {
  return <ChatWithProvider />;
}
