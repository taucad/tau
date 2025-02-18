import { useModels } from '@/hooks/use-models';
import { useChat, MessageRole, MessageStatus } from '@/hooks/use-chat';
import { ChatTextarea } from '@/components/chat/chat-textarea';
import { ProjectGrid } from '@/components/project-grid';
import { mockProjects } from '@/components/mock-projects';
import { Button } from '@/components/ui/button';
import { Link } from '@remix-run/react';

export const handle = {
  breadcrumb: () => {
    return (
      <Link to="/builds/new">
        <Button variant="ghost" className="p-2">
          New
        </Button>
      </Link>
    );
  },
};

export default function ChatStart() {
  const { data: models } = useModels();
  const { sendMessage } = useChat();

  const onSubmit = async (text: string, model: string, metadata?: { systemHints: string[] }) => {
    await sendMessage({
      message: {
        content: text,
        role: MessageRole.User,
        status: MessageStatus.Success,
        metadata,
      },
      model,
    });
  };

  return (
    <>
      <div className="max-w-3xl mx-auto py-6 px-4 md:pt-32 md:px-6 space-y-6 md:space-y-8">
        <div className="mb-12 text-center">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">What can I help you build?</h1>
        </div>

        <ChatTextarea onSubmit={onSubmit} models={models ?? []} />
      </div>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-row justify-between items-center mb-2">
          <h1 className="text-lg font-medium tracking-tight">From the Community</h1>
          <Link to="/builds/community">
            <Button variant="link" size="lg" className="p-0">
              View All
            </Button>
          </Link>
        </div>
        <ProjectGrid projects={mockProjects} />
      </div>
    </>
  );
}
