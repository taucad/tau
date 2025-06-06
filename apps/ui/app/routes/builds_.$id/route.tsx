import { Link, useParams } from 'react-router';
import { useCallback, useEffect } from 'react';
import type { JSX } from 'react';
import type { Message } from '@ai-sdk/react';
import { useActorRef } from '@xstate/react';
import { PackagePlus } from 'lucide-react';
// eslint-disable-next-line no-restricted-imports -- allowed for router types
import type { Route } from './+types/route.js';
import { ChatInterface } from '~/routes/builds_.$id/chat-interface.js';
import { BuildProvider, useBuild } from '~/hooks/use-build.js';
import { Button } from '~/components/ui/button.js';
import type { Handle } from '~/types/matches.js';
import { useChatConstants } from '~/utils/chat.js';
import { AiChatProvider, useAiChat } from '~/components/chat/ai-chat-provider.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { BuildNameEditor } from '~/routes/builds_.$id/build-name-editor.js';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';
import { orthographicViews, screenshotRequestMachine } from '~/machines/screenshot-request.js';

export const handle: Handle = {
  breadcrumb(match) {
    const { id } = match.params as Route.LoaderArgs['params'];

    if (!id) {
      throw new Error('No build id provided');
    }

    return (
      <BuildProvider buildId={id}>
        <BuildNameEditor />
      </BuildProvider>
    );
  },
  actions() {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="outline" className="md:hidden" size="icon">
            <Link to="/">
              <PackagePlus className="size-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>New Build</TooltipContent>
      </Tooltip>
    );
  },
};

function Chat() {
  const { id } = useParams();
  const { build, isLoading, activeChat, activeChatId, setChatMessages, setCodeParameters } = useBuild();

  // Create screenshot request machine instance
  const screenshotActorRef = useActorRef(screenshotRequestMachine, {
    input: { graphicsRef: graphicsActor },
  });

  // Function to capture screenshots
  const captureScreenshots = useCallback(async (): Promise<{
    compositeScreenshot?: string;
  }> => {
    return new Promise((resolve) => {
      // Capture composite screenshot (all views)
      screenshotActorRef.send({
        type: 'requestCompositeScreenshot',
        options: {
          output: {
            format: 'image/webp', // Use PNG for transparent backgrounds
            quality: 0.75,
            isPreview: true,
          },
          cameraAngles: orthographicViews.slice(0, 6),
          aspectRatio: 1, // Square images for better grid layout
          maxResolution: 800, // Reduced from 1000 for faster generation
          zoomLevel: 1.2, // Slightly lower zoom for smaller images
          composite: {
            enabled: true,
            preferredRatio: { columns: 3, rows: 2 }, // Prefer 3x2 grid as requested
            showLabels: true,
            padding: 12, // Increase padding for better visual separation
            labelHeight: 24,
            backgroundColor: 'transparent',
            dividerColor: '#666666', // Dark dividers for visibility on transparent background
            dividerWidth: 1,
          },
        },
        async onSuccess(dataUrls) {
          const compositeDataUrl = dataUrls[0];
          if (compositeDataUrl) {
            resolve({ compositeScreenshot: compositeDataUrl });
          } else {
            console.error('No composite screenshot data received');
            resolve({ compositeScreenshot: undefined });
          }
        },
        onError(error) {
          console.error('Composite screenshot failed:', error);
          resolve({ compositeScreenshot: undefined });
        },
      });
    });
  }, [screenshotActorRef]);

  const { setMessages, messages, reload, status } = useAiChat({
    onToolCall: new Map([
      [
        'file_edit',
        async ({ toolCall }) => {
          console.log('Capturing screenshots...');
          const screenshots = await captureScreenshots();
          console.log('Captured screenshots:', screenshots);

          const toolCallArgs = toolCall.args as { content: string };
          // Instead of setting both, we just set the code in the CAD actor
          // which will handle all downstream updates
          cadActor.send({ type: 'setCode', code: toolCallArgs.content, screenshot: screenshots.compositeScreenshot });

          // Return a Promise that resolves when CAD actor processing is complete
          return new Promise((resolve) => {
            const subscription = cadActor.subscribe((state) => {
              // Check if processing completed
              if (state.value === 'ready' || state.value === 'error') {
                // Format CAD and Monaco errors for AI
                const errorMessages = [];

                // Add CAD kernel errors if any
                if (state.context.kernelError) {
                  errorMessages.push(`CAD Error: ${state.context.kernelError}`);
                }

                // Add Monaco/TS errors if any
                if (state.context.codeErrors && state.context.codeErrors.length > 0) {
                  for (const error of state.context.codeErrors) {
                    errorMessages.push(`Line ${error.startLineNumber}: ${error.message}`);
                  }
                }

                // Prepare the result
                const result = {
                  success: state.value === 'ready' && errorMessages.length === 0,
                  // Screenshot: screenshots.compositeScreenshot,
                  message:
                    errorMessages.length > 0
                      ? `Code updated but has errors:\n${errorMessages.join('\n')}`
                      : 'Code updated successfully',
                };

                // Clean up the subscription
                subscription.unsubscribe();

                // Resolve the Promise with the result
                resolve(result);
              }
            });
          });
        },
      ],
    ]),
  });

  // Subscribe the build to persist code & parameters changes
  useEffect(() => {
    const subscription = cadActor.on('modelUpdated', ({ code, parameters }) => {
      setCodeParameters(code, parameters);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setCodeParameters]);

  useEffect(() => {
    // On init, set the code and parameters
    if (!build || isLoading) return;

    // Initialize model
    cadActor.send({
      type: 'initializeModel',
      code: build.assets.mechanical?.files[build.assets.mechanical.main]?.content ?? '',
      parameters: build.assets.mechanical?.parameters ?? {},
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on init
  }, [id, isLoading]);

  useEffect(() => {
    if (!build || isLoading) return;

    // Set initial messages based on active chat or legacy messages
    if (activeChat) {
      setMessages(activeChat.messages);

      // Reload when the last message is not an assistant message
      if (activeChat.messages.length > 0 && activeChat.messages.at(-1)?.role !== 'assistant') {
        void reload();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when build, activeChat, or loading state changes
  }, [id, isLoading, activeChatId]);

  // Persist message changes to the active build chat
  useEffect(() => {
    if (!activeChatId || !activeChat) return;

    if (status === 'submitted') {
      // A message just got submitted, set the build messages to include the new message.
      setChatMessages(activeChatId, messages as Message[]);
    } else if (
      status === 'ready' &&
      messages.length > 0 &&
      activeChat.messages.length > 0 &&
      activeChat.messages.length !== messages.length
    ) {
      // The chat became ready again, set the build messages to include the new messages.
      setChatMessages(activeChatId, messages as Message[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- this is effectively a subscription to useChat, so we only respond to status & message changes
  }, [status, setChatMessages, messages]);

  return <ChatInterface />;
}

export default function ChatRoute(): JSX.Element {
  const { id } = useParams();

  if (!id) {
    throw new Error('No build id provided');
  }

  return (
    <BuildProvider buildId={id}>
      <AiChatProvider value={{ ...useChatConstants, id }}>
        <Chat />
      </AiChatProvider>
    </BuildProvider>
  );
}
