import { Link, useNavigate } from 'react-router';
import { useCallback } from 'react';
import type { JSX } from 'react';
import { PencilRuler } from 'lucide-react';
import type { ChatTextareaProperties } from '~/components/chat/chat-textarea.js';
import { ChatTextarea } from '~/components/chat/chat-textarea.js';
import { Button } from '~/components/ui/button.js';
import { storage } from '~/db/storage.js';
import { MessageRole, MessageStatus } from '~/types/chat.js';
import { createMessage } from '~/utils/chat.js';
import { emptyCode } from '~/constants/build-code-examples.js';
import { CommunityBuildGrid } from '~/components/project-grid.js';
import { sampleBuilds } from '~/constants/build-examples.js';
import { defaultBuildName } from '~/constants/build-names.js';
import { AiChatProvider } from '~/components/chat/ai-chat-provider.js';

export default function ChatStart(): JSX.Element {
  const navigate = useNavigate();

  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, model, metadata, imageUrls }) => {
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
              files: { 'model.ts': { content: emptyCode } },
              main: 'model.ts',
              language: 'replicad',
              parameters: {},
            },
          },
        });

        // Navigate immediately - the build page will handle the streaming
        await navigate(`/builds/${build.id}`);
      } catch (error) {
        console.error('Failed to create build:', error);
        // TODO: Show error toast
      }
    },
    [navigate],
  );

  const handleStartFromScratch = useCallback(async () => {
    try {
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
        messages: [],
        assets: {
          mechanical: {
            files: { 'model.ts': { content: emptyCode } },
            main: 'model.ts',
            language: 'replicad',
            parameters: {},
          },
        },
      });
      await navigate(`/builds/${build.id}`);
    } catch (error) {
      console.error('Failed to create empty build:', error);
    }
  }, [navigate]);

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-12 md:space-y-8 md:px-6 md:pt-32">
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">What can I help you build?</h1>
        </div>

        <AiChatProvider value={{}}>
          <ChatTextarea withContextActions={false} onSubmit={onSubmit} />
          <div className="relative mx-auto my-6 flex w-48 items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <span className="border-gray-300 w-full border-t" />
            </div>
            <div className="relative bg-background px-4 text-sm text-muted-foreground">or</div>
          </div>
          <div className="flex justify-center">
            <Button variant="outline" className="font-light" onClick={handleStartFromScratch}>
              Start from scratch
              <PencilRuler className="stroke-1" />
            </Button>
          </div>
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
