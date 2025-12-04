import { Link, NavLink, useNavigate } from 'react-router';
import { useCallback } from 'react';
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
import { CommunityBuildGrid } from '#components/project-grid.js';
import { sampleBuilds } from '#constants/build-examples.js';
import { HeroViewer } from '#routes/_index/hero-viewer.js';
import { HeroImage } from '#routes/_index/hero-image.js';
import { KernelsSection } from '#routes/_index/kernels-section.js';
import { IntegrationSection } from '#routes/_index/integration-section.js';
import { ComingSoonSection } from '#routes/_index/coming-soon-section.js';
import { CtaSection } from '#routes/_index/cta-section.js';
import { defaultBuildName } from '#constants/build-names.js';
import { ChatProvider } from '#hooks/use-chat.js';
import { Separator } from '#components/ui/separator.js';
import { InteractiveHoverButton } from '#components/magicui/interactive-hover-button.js';
import { toast } from '#components/ui/sonner.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { LoadingSpinner } from '#components/ui/loading-spinner.js';
import type { Handle } from '#types/matches.types.js';
import { useBuildManager } from '#hooks/use-build-manager.js';
import { useChatManager } from '#hooks/use-chat-manager.js';
import { useKernel } from '#hooks/use-kernel.js';

export const handle: Handle = {
  enableOverflowY: true,
  enablePageFooter: true,
};

export default function ChatStart(): React.JSX.Element {
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

        // Create the initial message as pending
        const userMessage = createMessage({
          content,
          role: messageRole.user,
          metadata: { ...metadata, kernel, model, status: messageStatus.pending },
          imageUrls,
        });

        // Pre-generate the chat ID
        const chatId = generatePrefixedId(idPrefix.chat);

        // Create initial build using factory function with the pre-generated chatId
        const { buildData, files } = createInitialBuild({
          buildName: defaultBuildName,
          chatId,
          initialMessage: userMessage,
          mainFileName,
          emptyCodeContent: encodeTextFile(emptyCode),
        });

        // Create the build with lastChatId already set
        const createdBuild = await buildManager.createBuild(buildData, files);

        // Create the chat with the same pre-generated ID
        await chatManager.createChat(createdBuild.id, {
          id: chatId,
          name: 'Initial design',
          messages: [userMessage],
        });

        // Ensure chat is open when navigating to the build page
        setIsChatOpen(true);

        // Navigate immediately - the build page will handle the streaming
        await navigate(`/builds/${createdBuild.id}`);
      } catch (error) {
        console.error('Failed to create build:', error);
        toast.error('Failed to create build');
      }
    },
    [kernel, buildManager, chatManager, setIsChatOpen, navigate],
  );

  return (
    <>
      {/* Chat Input Section */}
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-12 md:space-y-8 md:px-6 md:pt-32">
        <div className="mb-12 text-center">
          <h1 className="mx-auto max-w-[16ch] text-3xl font-semibold tracking-tight text-balance md:max-w-[20ch] md:text-5xl">
            What can I help you build?
          </h1>
        </div>

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
          <div className="mx-auto my-6 flex w-20 items-center justify-center">
            <Separator />
            <div className="mx-4 text-sm font-light text-muted-foreground">or</div>
            <Separator />
          </div>
          <div className="flex justify-center">
            <NavLink to="/builds/new" tabIndex={-1}>
              {({ isPending }) => (
                <InteractiveHoverButton className="flex items-center gap-2 font-light [&_svg]:size-6 [&_svg]:stroke-1">
                  {isPending ? <LoadingSpinner /> : 'Build from code'}
                </InteractiveHoverButton>
              )}
            </NavLink>
          </div>
        </ChatProvider>
      </div>

      {/* Community Builds */}
      <div className="container mx-auto px-4 py-8">
        <div className="mb-2 flex flex-row items-center justify-between">
          <h1 className="text-lg font-medium tracking-tight">From the Community</h1>
          <Button asChild variant="link" size="lg" className="p-0">
            <Link to="/builds/community">View All</Link>
          </Button>
        </div>
        <CommunityBuildGrid builds={sampleBuilds} limit={10} />
      </div>

      {/* Hero Image with Features */}
      <HeroImage />

      {/* Kernels Section */}
      <KernelsSection />

      {/* Interactive Demo */}
      <div className="container mx-auto px-4 py-16">
        <HeroViewer />
      </div>

      {/* Integration Section */}
      <IntegrationSection />

      {/* Coming Soon Section */}
      <ComingSoonSection />

      {/* Final CTA Section */}
      <CtaSection />
    </>
  );
}
