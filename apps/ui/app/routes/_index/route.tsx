import { Link, useNavigate } from 'react-router';
import { useCallback } from 'react';
import type { JSX } from 'react';
import type { ChatTextareaProperties } from '~/components/chat/chat-textarea.js';
import { ChatTextarea } from '~/components/chat/chat-textarea.js';
import { Button } from '~/components/ui/button.js';
import { storage } from '~/db/storage.js';
import { messageRole, messageStatus } from '~/types/chat.types.js';
import { createMessage } from '~/utils/chat.js';
import { emptyCode } from '~/constants/build-code-examples.js';
import { CommunityBuildGrid } from '~/components/project-grid.js';
import { sampleBuilds } from '~/constants/build-examples.js';
import { defaultBuildName } from '~/constants/build-names.js';
import { AiChatProvider } from '~/components/chat/ai-chat-provider.js';
import { Separator } from '~/components/ui/separator.js';
import { InteractiveHoverButton } from '~/components/magicui/interactive-hover-button.js';
import { toast } from '~/components/ui/sonner.js';
import { generatePrefixedId } from '~/utils/id.js';
import { idPrefix } from '~/constants/id.js';

export default function ChatStart(): JSX.Element {
  const navigate = useNavigate();

  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, model, metadata, imageUrls }) => {
      try {
        // Create the initial message as pending
        const userMessage = createMessage({
          content,
          role: messageRole.user,
          model,
          status: messageStatus.pending, // Set as pending
          metadata: metadata ?? {},
          imageUrls,
        });

        const chatId = generatePrefixedId(idPrefix.chat);
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
          chats: [
            {
              id: chatId,
              name: 'Initial design',
              messages: [userMessage],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          lastChatId: chatId,
          assets: {
            mechanical: {
              // eslint-disable-next-line @typescript-eslint/naming-convention -- filenames include extensions
              files: { 'main.ts': { content: emptyCode } },
              main: 'main.ts',
              language: 'replicad',
              parameters: {},
            },
          },
        });

        // Navigate immediately - the build page will handle the streaming
        await navigate(`/builds/${build.id}`);
      } catch {
        toast.error('Failed to create build');
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
        chats: [],
        assets: {
          mechanical: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- filenames include extensions
            files: { 'main.ts': { content: emptyCode } },
            main: 'main.ts',
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
          <ChatTextarea enableContextActions={false} onSubmit={onSubmit} />
          <div className="mx-auto my-6 flex w-20 items-center justify-center">
            <Separator />
            <div className="mx-4 text-sm font-light text-muted-foreground">or</div>
            <Separator />
          </div>
          <div className="flex justify-center">
            <InteractiveHoverButton
              className="flex items-center gap-2 font-light [&_svg]:size-6 [&_svg]:stroke-1"
              onClick={handleStartFromScratch}
            >
              Build from code
            </InteractiveHoverButton>
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
