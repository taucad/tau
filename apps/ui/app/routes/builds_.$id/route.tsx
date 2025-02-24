import { ChatInterface } from '@/routes/builds_.$id/chat-interface';
import { ReplicadProvider, useReplicad } from '@/components/geometry/kernel/replicad/replicad-context';
import { Link, UIMatch, useParams } from '@remix-run/react';
import { useEffect } from 'react';
import { useChat } from '@/contexts/use-chat';
import { MessageStatus } from '@/types/chat';
import { useBuild } from '@/hooks/use-build';
import { Button } from '@/components/ui/button';

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
  const { build, isLoading } = useBuild(id!);
  const { setCode } = useReplicad();
  const { sendMessage } = useChat();
  const main = build?.assets.mechanical?.main;
  const code = build?.assets.mechanical?.files[main as string]?.content;

  useEffect(() => {
    if (code) {
      setCode(code);
    }
  }, [id, build, setCode]);

  // Handle initial pending message
  useEffect(() => {
    if (!build || isLoading) return;

    const lastMessage = build.messages.at(-1);
    if (!lastMessage) return;

    if (lastMessage.status === MessageStatus.Pending) {
      console.log('sending message');
      sendMessage({
        message: lastMessage,
        model: lastMessage.model,
      });
    }
  }, [id, build]); // Only run when build ID changes

  return <ChatInterface />;
};

export default function ChatRoute() {
  return (
    <ReplicadProvider>
      <Chat />
    </ReplicadProvider>
  );
}
