import { useParams } from 'react-router';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { Message } from '@ai-sdk/react';
import { useChat } from '@ai-sdk/react';
import type { Route } from './+types/route.js';
import { ChatInterface } from '@/routes/builds_.$id/chat-interface.js';
import { CadProvider, useCad } from '@/components/geometry/kernel/cad-context.js';
import { BuildProvider, useBuild } from '@/hooks/use-build2.js';
import { Button } from '@/components/ui/button.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Input } from '@/components/ui/input.js';
import { LogProvider } from '@/contexts/log-context.js';
import { defaultBuildName } from '@/constants/build-constants.js';
import type { Handle } from '@/types/matches.js';
import { useChatConstants } from '@/contexts/use-chat.js';
import { AiChatProvider, useAiChat } from '@/components/chat/ai-chat-provider.js';
import { KernelProvider } from '@/components/geometry/kernel/kernel-context.js';

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

    if (build.name === defaultBuildName && build.messages[0]) {
      // Create and send message for name generation
      const message = {
        ...build.messages[0],
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
};

function Chat() {
  const { id } = useParams();
  const { build, isLoading, setMessages: setBuildMessages, setCode: setBuildCode } = useBuild();
  const { setCode, setParameters } = useCad();
  const { setMessages, messages, reload, status, addToolResult } = useAiChat({
    onToolCall: new Map([
      [
        'file_edit',
        ({ toolCall }) => {
          const toolCallArgs = toolCall.args as { content: string };
          setBuildCode(toolCallArgs.content);
          return {
            success: true,
          };
        },
      ],
    ]),
  });

  // Load and respond to build changes
  useEffect(() => {
    if (!build || isLoading) return;
    // Set code
    setCode(build.assets.mechanical?.files[build.assets.mechanical.main]?.content ?? '');

    // Set parameters
    const parameters = build.assets.mechanical?.parameters;
    setParameters(parameters ?? {});
  }, [id, build, isLoading]);

  useEffect(() => {
    // Set initial messages
    if (!build || isLoading) return;
    setMessages(build.messages);

    // Reload when the last message is not an assistant message.
    // This can happen when the user is offline when sending the initial message.
    if (build.messages.length > 0 && build.messages.at(-1)?.role !== 'assistant') {
      void reload();
    }
  }, [id, isLoading]);

  useEffect(() => {
    if (status === 'submitted') {
      // A message just got submitted, set the build messages to include the new message.

      setBuildMessages(messages as Message[]);
    } else if (status === 'ready' && messages.length > 0) {
      // The chat became ready again, set the build messages to include the new messages.

      setBuildMessages(messages as Message[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- we don't want to trigger the effect for all message changes.
  }, [status, setBuildMessages]);

  return <ChatInterface />;
}

export default function ChatRoute(): JSX.Element {
  const { id } = useParams();

  if (!id) {
    throw new Error('No build id provided');
  }

  return (
    <LogProvider>
      <BuildProvider buildId={id}>
        <KernelProvider withExceptions>
          <CadProvider evaluateDebounceTime={300}>
            <AiChatProvider value={{ ...useChatConstants, id }}>
              <div className="flex h-full">
                <Chat />
              </div>
            </AiChatProvider>
          </CadProvider>
        </KernelProvider>
      </BuildProvider>
    </LogProvider>
  );
}
