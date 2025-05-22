import { Link, useParams } from 'react-router';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { Message } from '@ai-sdk/react';
import { useChat } from '@ai-sdk/react';
import { PackagePlus } from 'lucide-react';
// eslint-disable-next-line no-restricted-imports -- allowed for router types
import type { Route } from './+types/route.js';
import { ChatInterface } from '~/routes/builds_.$id/chat-interface.js';
import { BuildProvider, useBuild } from '~/hooks/use-build.js';
import { Button } from '~/components/ui/button.js';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover.js';
import { Input } from '~/components/ui/input.js';
import { defaultBuildName } from '~/constants/build-names.js';
import type { Handle } from '~/types/matches.js';
import { useChatConstants } from '~/utils/chat.js';
import { AiChatProvider, useAiChat } from '~/components/chat/ai-chat-provider.js';
import { GraphicsProvider } from '~/components/geometry/graphics/graphics-context.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';

function BuildNameEditor() {
  const { build, updateName, isLoading } = useBuild();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState<string>();
  const [displayName, setDisplayName] = useState<string>(build?.name ?? '');
  const { append } = useChat({
    ...useChatConstants,
    onFinish(message) {
      const textPart = message.parts?.find((part) => part.type === 'text');
      if (textPart) {
        updateName(textPart.text);
        setDisplayName(textPart.text);
      }
    },
  });

  // Set initial name and trigger generation if needed
  useEffect(() => {
    if (isLoading || !build) return;

    const activeChat = build.chats?.find((chat) => chat.id === build.lastChatId);

    if (build.name === defaultBuildName && activeChat?.messages[0]) {
      // Create and send message for name generation
      const message = {
        ...activeChat.messages[0],
        model: 'name-generator',
        metadata: {
          toolChoice: 'none',
        },
      } as const satisfies Message;
      void append(message);
    } else if (!isLoading) {
      setName(build.name);
      setDisplayName(build.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run after loading completes
  }, [build?.name, isLoading]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (name) {
      updateName(name);
      setDisplayName(name);
      setIsEditing(false);
    }
  };

  return (
    <Popover open={isEditing} onOpenChange={setIsEditing}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="cursor-text justify-start p-2">
          <span
            data-animate={displayName.length > 0 && !(!name || name === build?.name || isEditing)}
            className="data-[animate=true]:animate-typewriter-20"
          >
            {displayName}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 -translate-x-2 p-1">
        <form className="flex items-center gap-2 align-middle" onSubmit={handleSubmit}>
          <Input
            autoFocus
            autoComplete="off"
            value={name}
            className="h-8"
            onChange={(event) => {
              setName(event.target.value);
            }}
            onFocus={(event) => {
              event.target.select();
            }}
          />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

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
  const {
    build,
    isLoading,
    activeChat,
    activeChatId,
    setChatMessages: setBuildChatMessages,
    setCode: setBuildCode,
    setCodeParameters: setBuildCodeParameters,
  } = useBuild();

  const { setMessages, messages, reload, status, addToolResult } = useAiChat({
    onToolCall: new Map([
      [
        'file_edit',
        ({ toolCall }) => {
          const toolCallArgs = toolCall.args as { content: string };
          // Instead of setting both, we just set the code in the CAD actor
          // which will handle all downstream updates
          cadActor.send({ type: 'setCode', code: toolCallArgs.content });

          // We need to update the build's code too for persistence
          setBuildCode(toolCallArgs.content);

          // We now track the CAD actor state to determine success/failure
          const unsubscribe = cadActor.subscribe((state) => {
            // Check if processing completed
            if (state.value === 'rendered' || state.value === 'error') {
              // Format CAD and Monaco errors for AI
              const errorMessages = [];

              // Add CAD kernel errors if any
              if (state.context.error) {
                errorMessages.push(`CAD Error: ${state.context.error}`);
              }

              // Add Monaco/TS errors if any
              if (state.context.monacoErrors && state.context.monacoErrors.length > 0) {
                for (const error of state.context.monacoErrors) {
                  errorMessages.push(`Line ${error.startLineNumber}: ${error.message}`);
                }
              }

              // Prepare the result
              const result = {
                success: state.value === 'rendered' && errorMessages.length === 0,
                message:
                  errorMessages.length > 0
                    ? `Code updated but has errors:\n${errorMessages.join('\n')}`
                    : 'Code updated successfully',
              };

              // Send the result to the AI chat
              addToolResult({
                toolCallId: toolCall.toolCallId,
                result,
              });

              // Clean up the subscription
              unsubscribe.unsubscribe();
            }
          });

          // Return a pending response to indicate we're handling it asynchronously
          return { pending: true };
        },
      ],
    ]),
  });

  // Subscribe the build to persist code & parameters changes
  useEffect(() => {
    const subscription = cadActor.subscribe((state) => {
      if (state.value === 'rendering') {
        setBuildCodeParameters(state.context.code, state.context.parameters);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setBuildCodeParameters]);

  useEffect(() => {
    // On init, set the code and parameters
    if (!build || isLoading) return;

    // Set code
    cadActor.send({
      type: 'setCode',
      code: build.assets.mechanical?.files[build.assets.mechanical.main]?.content ?? '',
    });

    // Set parameters
    const parameters = build.assets.mechanical?.parameters;
    cadActor.send({ type: 'setParameters', parameters: parameters ?? {} });
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
      setBuildChatMessages(activeChatId, messages as Message[]);
    } else if (
      status === 'ready' &&
      messages.length > 0 &&
      activeChat.messages.length > 0 &&
      activeChat.messages.length !== messages.length
    ) {
      // The chat became ready again, set the build messages to include the new messages.
      setBuildChatMessages(activeChatId, messages as Message[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- this is effectively a subscription to useChat, so we only respond to status & message changes
  }, [status, setBuildChatMessages, messages]);

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
        <GraphicsProvider defaultCameraAngle={60}>
          <Chat />
        </GraphicsProvider>
      </AiChatProvider>
    </BuildProvider>
  );
}
