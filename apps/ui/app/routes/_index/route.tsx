import { useModels } from '@/hooks/use-models';
import { ChatTextarea, ChatTextareaProperties } from '@/components/chat/chat-textarea';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from '@remix-run/react';
import { storage } from '@/db/storage';
import { MessageRole, MessageStatus } from '@/types/chat';
import { ChatProvider, createMessage } from '@/contexts/use-chat';
import { cubeCode } from '@/components/mock-code';
import { CommunityBuildGrid } from '@/components/project-grid';
import { sampleBuilds } from '@/components/mock-builds';
import { DEFAULT_BUILD_NAME } from '@/constants/build.constants';

export default function ChatStart() {
  const { data: models } = useModels();
  const navigate = useNavigate();

  const onSubmit: ChatTextareaProperties['onSubmit'] = async ({ content, model, metadata, imageUrls }) => {
    try {
      // Create the initial message as pending
      const userMessage = createMessage({
        content,
        role: MessageRole.User,
        model,
        status: MessageStatus.Pending, // Set as pending
        metadata: metadata ?? {},
        imageUrls,
      });

      const build = await storage.createBuild({
        name: DEFAULT_BUILD_NAME,
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
      navigate(`/builds/${build.id}`);
    } catch (error) {
      console.error('Failed to create build:', error);
      // TODO: Show error toast
    }
  };

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-12 md:space-y-8 md:px-6 md:pt-32">
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">What can I help you build?</h1>
        </div>

        <ChatProvider>
          <ChatTextarea onSubmit={onSubmit} models={models ?? []} />
        </ChatProvider>
      </div>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-2 flex flex-row items-center justify-between">
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
