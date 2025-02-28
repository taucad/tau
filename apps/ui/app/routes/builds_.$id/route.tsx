import { ChatInterface } from '@/routes/builds_.$id/chat-interface';
import { ReplicadProvider, useReplicad } from '@/components/geometry/kernel/replicad/replicad-context';
import { useParams } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { MessageStatus } from '@/types/chat';
import { BuildProvider, useBuild } from '@/hooks/use-build2';
import { Button } from '@/components/ui/button';
import { ChatProvider, useChat } from '@/contexts/use-chat';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

const BuildNameEditor = () => {
  const { build, updateName } = useBuild();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState<string>();

  useEffect(() => {
    setName(build?.name || 'Untitled Build');
  }, [build?.name]);

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
    return (
      <BuildProvider buildId={id!}>
        <BuildNameEditor />
      </BuildProvider>
    );
  },
};

const Chat = () => {
  const { id } = useParams();
  const { build, isLoading, setMessages: setBuildMessages } = useBuild();
  const { setCode, setParameters } = useReplicad();
  const { sendMessage, setMessages, messages } = useChat();

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

  // Handle any pending messages
  useEffect(() => {
    if (!build || isLoading) return;

    const lastMessage = build.messages.at(-1);
    if (!lastMessage) return;

    if (lastMessage.status === MessageStatus.Pending) {
      sendMessage({
        message: lastMessage,
        model: lastMessage.model,
      });
    }
  }, [id, isLoading]);

  return <ChatInterface />;
};

export default function ChatRoute() {
  const { id } = useParams();

  if (!id) {
    throw new Error('No build id provided');
  }

  return (
    <BuildProvider buildId={id}>
      <ReplicadProvider>
        <ChatProvider>
          <div className="flex h-full">
            <Chat />
          </div>
        </ChatProvider>
      </ReplicadProvider>
    </BuildProvider>
  );
}
