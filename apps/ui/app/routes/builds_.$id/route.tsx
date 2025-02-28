import { ChatInterface } from '@/routes/builds_.$id/chat-interface';
import { ReplicadProvider, useReplicad } from '@/components/geometry/kernel/replicad/replicad-context';
import { Link, UIMatch, useParams } from '@remix-run/react';
import { useEffect } from 'react';
import { MessageStatus } from '@/types/chat';
import { BuildProvider, useBuild } from '@/hooks/use-build2';
import { Button } from '@/components/ui/button';
import { ChatProvider, useChat } from '@/contexts/use-chat';

export const handle = {
  breadcrumb: (match: UIMatch) => {
    return (
      <Link to={`/builds/${match.params.id}`} tabIndex={-1}>
        <Button variant="ghost" className="p-2">
          {match.params.id}
        </Button>
      </Link>
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
