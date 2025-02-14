import { useModels } from '@/hooks/use-models';
import { useChat, MessageRole, MessageStatus } from '@/hooks/use-chat';
import { ChatTextarea } from '@/components/chat-textarea';
import { ProjectGrid } from './project-grid';
import { mockProjects } from './mock-projects';

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
      <div className="max-w-3xl mx-auto py-6 px-4 sm:py-12 sm:px-6 space-y-6 sm:space-y-8">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight">What can I help you build?</h1>
        </div>

        <ChatTextarea onSubmit={onSubmit} models={models ?? []} />
      </div>
      <ProjectGrid projects={mockProjects} />
    </>
  );
}
