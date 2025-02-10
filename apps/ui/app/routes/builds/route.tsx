import ChatInterface from '@/components/chat-interface';
import { ReplicadProvider } from '@/components/geometry/kernel/replicad/replicad-context';

export default function ChatRoute() {
  return (
    <ReplicadProvider>
      <ChatInterface />
    </ReplicadProvider>
  );
}
