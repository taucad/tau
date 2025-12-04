import { Link, useNavigate } from 'react-router';
import { useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import { messageRole, messageStatus } from '@taucad/chat/constants';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { createInitialBuild } from '#constants/build.constants.js';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import { KernelSelector } from '#components/chat/kernel-selector.js';
import { Button } from '#components/ui/button.js';
import { createMessage } from '#utils/chat.utils.js';
import { getMainFile, getEmptyCode } from '#utils/kernel.utils.js';
import { encodeTextFile } from '#utils/filesystem.utils.js';
import { defaultBuildName } from '#constants/build-names.js';
import { ChatProvider } from '#hooks/use-chat.js';
import { toast } from '#components/ui/sonner.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useBuildManager } from '#hooks/use-build-manager.js';
import { useChatManager } from '#hooks/use-chat-manager.js';
import { useKernel } from '#hooks/use-kernel.js';

export function CtaSection(): React.JSX.Element {
  const navigate = useNavigate();
  const { kernel, setKernel } = useKernel();
  const [, setIsChatOpen] = useCookie(cookieName.chatOpHistory, true);
  const buildManager = useBuildManager();
  const chatManager = useChatManager();

  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, model, metadata, imageUrls }) => {
      try {
        const mainFileName = getMainFile(kernel);
        const emptyCode = getEmptyCode(kernel);

        const userMessage = createMessage({
          content,
          role: messageRole.user,
          metadata: { ...metadata, kernel, model, status: messageStatus.pending },
          imageUrls,
        });

        const chatId = generatePrefixedId(idPrefix.chat);

        const { buildData, files } = createInitialBuild({
          buildName: defaultBuildName,
          chatId,
          initialMessage: userMessage,
          mainFileName,
          emptyCodeContent: encodeTextFile(emptyCode),
        });

        const createdBuild = await buildManager.createBuild(buildData, files);

        await chatManager.createChat(createdBuild.id, {
          id: chatId,
          name: 'Initial design',
          messages: [userMessage],
        });

        setIsChatOpen(true);
        await navigate(`/builds/${createdBuild.id}`);
      } catch (error) {
        console.error('Failed to create build:', error);
        toast.error('Failed to create build');
      }
    },
    [kernel, buildManager, chatManager, setIsChatOpen, navigate],
  );

  return (
    <div className="border-t bg-gradient-to-b from-muted/50 to-background">
      <div className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-3xl">
          {/* Heading */}
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              We can&apos;t wait to see what you build
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Start designing with AI assistance, or dive straight into code.
            </p>
          </div>

          {/* Chat Input */}
          <ChatProvider value={{}}>
            <div className="space-y-4">
              <div className="flex justify-center">
                <KernelSelector selectedKernel={kernel} onKernelChange={setKernel} />
              </div>
              <ChatTextarea
                enableContextActions={false}
                enableKernelSelector={false}
                className="pt-1"
                onSubmit={onSubmit}
              />
            </div>
          </ChatProvider>

          {/* CTA Button */}
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg" className="gap-2">
              <Link to="/builds/new">
                Create New Build
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
