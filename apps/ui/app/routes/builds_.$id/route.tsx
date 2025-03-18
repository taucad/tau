import { ChatInterface } from '@/routes/builds_.$id/chat-interface';
import { ReplicadProvider, useReplicad } from '@/components/geometry/kernel/replicad/replicad-context';
import { useParams } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { BuildProvider, useBuild } from '@/hooks/use-build2';
import { Button } from '@/components/ui/button';
import { ChatProvider, useChat } from '@/contexts/use-chat';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { LogProvider } from '@/contexts/log-context';
import { replicadSystemPrompt } from './chat-prompt-replicad';
import { Message, MessageRole, MessageStatus } from '@/types/chat';

const nameGenerationSystemPrompt = `
You are a helpful assistant that generates titles for AI chat conversations.

The conversations primarily revolve around designing and building 3D models,
but can include other topics. When the conversation is about 3D models,
the title should be a single sentence that describes the item being designed.

The title should be 1-3 words, and should not include any special characters.
`;

const BuildNameEditor = () => {
  const { build, updateName } = useBuild();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState<string>();
  const { addMessage, messages, status } = useChat();

  // Set initial name and trigger generation if needed
  useEffect(() => {
    if (build?.name === 'New Build' && build.messages?.[0]) {
      // Create and send message for name generation
      const message = {
        ...build.messages[0],
        model: 'openai-gpt-4o',
        metadata: {
          systemHints: ['no-search'],
        },
      } as const satisfies Message;
      addMessage(message);
    }
  }, [build?.name, build?.messages]);

  // Update name as it streams in
  useEffect(() => {
    const lastMessage = messages.at(-1);

    if (!lastMessage) return;

    if (
      lastMessage.role === MessageRole.Assistant &&
      lastMessage.content[0].type === 'text' &&
      lastMessage.content[0].text
    ) {
      setName(lastMessage.content[0].text);
      if (lastMessage.status === MessageStatus.Success) {
        updateName(lastMessage.content[0].text);
      }
    }
  }, [messages, status]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (name) {
      updateName(name);
      setIsEditing(false);
    }
  };

  return (
    <Popover open={isEditing} onOpenChange={setIsEditing}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="p-2">
          {build?.name}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="-translate-x-2 w-64 p-1">
        <form onSubmit={handleSubmit} className="flex gap-2  align-middle items-center">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            onFocus={(event) => event.target.select()}
            className="h-8"
          />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
};

export const handle = {
  breadcrumb: () => {
    const { id } = useParams();

    if (!id) {
      throw new Error('No build id provided');
    }

    return (
      <BuildProvider buildId={id}>
        <ChatProvider systemMessageText={nameGenerationSystemPrompt}>
          <BuildNameEditor />
        </ChatProvider>
      </BuildProvider>
    );
  },
};

const Chat = () => {
  const { id } = useParams();
  const { build, isLoading, setMessages: setBuildMessages } = useBuild();
  const { setCode, setParameters } = useReplicad();
  const { setMessages, messages } = useChat();

  // Load and respond to build changes
  useEffect(() => {
    if (!build || isLoading) return;
    // Set code
    setCode(build.assets.mechanical?.files[build.assets.mechanical?.main as string]?.content || '');

    // Set parameters
    const parameters = build.assets.mechanical?.parameters;
    setParameters(parameters || {});
  }, [id, build, isLoading]);

  useEffect(() => {
    // Set initial messages
    if (!build || isLoading) return;
    setMessages(build.messages);
  }, [id, isLoading]);

  // Handle message changes
  useEffect(() => {
    if (!build || isLoading) return;
    setBuildMessages(messages);
  }, [messages]);

  return <ChatInterface />;
};

export default function ChatRoute() {
  const { id } = useParams();

  if (!id) {
    throw new Error('No build id provided');
  }

  return (
    <LogProvider>
      <BuildProvider buildId={id}>
        <ReplicadProvider withExceptions>
          <ChatProvider systemMessageText={replicadSystemPrompt}>
            <div className="flex h-full">
              <Chat />
            </div>
          </ChatProvider>
        </ReplicadProvider>
      </BuildProvider>
    </LogProvider>
  );
}
