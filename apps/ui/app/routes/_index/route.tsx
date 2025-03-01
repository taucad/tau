import { useModels } from '@/hooks/use-models';
import { ChatTextarea } from '@/components/chat/chat-textarea';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from '@remix-run/react';
import { storage } from '@/db/storage';
import { MessageRole, MessageStatus } from '@/types/chat';
import { ChatProvider, createMessage } from '@/contexts/use-chat';
import { cubeCode } from '@/components/mock-code';
import { CommunityBuildGrid } from '@/components/project-grid';
import { sampleBuilds } from '@/components/mock-builds';

export default function ChatStart() {
  const { data: models } = useModels();
  const navigate = useNavigate();

  const onSubmit = async ({
    content,
    model,
    metadata,
  }: {
    content: string;
    model: string;
    metadata?: { systemHints?: string[] };
  }) => {
    try {
      // Create the initial message as pending
      const userMessage = createMessage({
        content,
        role: MessageRole.User,
        model,
        status: MessageStatus.Pending, // Set as pending
        metadata: { systemHints: metadata?.systemHints ?? [] },
      });

      const build = await storage.createBuild({
        name: 'New Build',
        description: '',
        stars: 0,
        forks: 0,
        author: {
          name: 'You',
          avatar: '/avatar-sample.png',
        },
        tags: [],
        thumbnail: '',
        messages: [userMessage],
        assets: {
          mechanical: {
            files: { 'model.ts': { content: cubeCode } },
            main: 'model.ts',
            language: 'replicad',
            parameters: {},
          },
        },
      });

      // Navigate immediately - the build page will handle the streaming
      navigate(`/builds/${build.id}`, { replace: true });
    } catch (error) {
      console.error('Failed to create build:', error);
      // TODO: Show error toast
    }
  };

  return (
    <>
      <div className="max-w-3xl mx-auto py-6 px-4 md:pt-32 md:px-6 space-y-6 md:space-y-8 pb-12">
        <div className="mb-12 text-center">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">What can I help you build?</h1>
        </div>

        <ChatProvider>
          <ChatTextarea onSubmit={onSubmit} models={models ?? []} />
        </ChatProvider>
      </div>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-row justify-between items-center mb-2">
          <h1 className="text-lg font-medium tracking-tight">From the Community</h1>
          <Link to="/builds/community" tabIndex={-1}>
            <Button variant="link" size="lg" className="p-0">
              View All
            </Button>
          </Link>
        </div>
        <CommunityBuildGrid builds={sampleBuilds} />
      </div>
    </>
  );
}
