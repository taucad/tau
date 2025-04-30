import { Link, useNavigate } from '@remix-run/react';
import type { JSX } from 'react';
import { useModels } from '@/hooks/use-models.js';
import type { ChatTextareaProperties } from '@/components/chat/chat-textarea.js';
import { ChatTextarea } from '@/components/chat/chat-textarea.js';
import { Button } from '@/components/ui/button.js';
import { storage } from '@/db/storage.js';
import { MessageRole, MessageStatus } from '@/types/chat.js';
import { createMessage } from '@/contexts/use-chat.js';
import { cubeCode } from '@/components/mock-code.js';
import { CommunityBuildGrid } from '@/components/project-grid.js';
import { sampleBuilds } from '@/components/mock-builds.js';
import { defaultBuildName } from '@/constants/build-constants.js';
import { AiChatProvider } from '@/components/chat/ai-chat-provider.js';

export default function ChatStart(): JSX.Element {
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
        name: defaultBuildName,
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
            // eslint-disable-next-line @typescript-eslint/naming-convention -- filenames include extensions
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

        <AiChatProvider value={{}}>
          <ChatTextarea models={models ?? []} onSubmit={onSubmit} />
        </AiChatProvider>
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
