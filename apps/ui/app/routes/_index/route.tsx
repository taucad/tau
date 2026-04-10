import { Link, NavLink, useNavigate } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea-types.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import { KernelSelector } from '#components/chat/kernel-selector.js';
import { Button } from '#components/ui/button.js';
import { CommunityProjectGrid } from '#components/project-grid.js';
import { sampleProjects } from '#constants/project-examples.js';
import { LazySection } from '#components/ui/lazy-section.js';
import { LazyHeroViewer } from '#routes/_index/hero-viewer-gate.js';
import { HeroImage } from '#routes/_index/hero-image.js';
import { KernelsSection } from '#routes/_index/kernels-section.js';
import { IntegrationSection } from '#routes/_index/integration-section.js';
import { ComingSoonSection } from '#routes/_index/coming-soon-section.js';
import { CtaSection } from '#routes/_index/cta-section.js';
import {
  CommunityGridSkeleton,
  HeroImageSkeleton,
  KernelsSkeleton,
  IntegrationSkeleton,
  ComingSoonSkeleton,
  CtaSkeleton,
} from '#routes/_index/section-skeletons.js';
import { ChatProvider, useChatActions, useChatContext } from '#hooks/use-chat.js';
import { Separator } from '#components/ui/separator.js';
import { InteractiveHoverButton } from '#components/magicui/interactive-hover-button.js';
import { toast } from '#components/ui/sonner.js';
import { Loader } from '#components/ui/loader.js';
import type { Handle } from '#types/matches.types.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useKernel } from '#hooks/use-kernel.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';

const homepageChatResourceId = 'homepage_main_chat_resource';
const homepageChatId = 'chat_homepage_main';

function useHomepageChatSession(): { chatId: string | undefined; resourceId: string; isReady: boolean } {
  const projectManager = useProjectManager();
  const [isReady, setIsReady] = useState(false);
  const createInFlightRef = useRef(false);

  useEffect(() => {
    if (isReady || createInFlightRef.current) {
      return;
    }

    createInFlightRef.current = true;
    const ensureHomepageChat = async (): Promise<void> => {
      try {
        const existingChat = await projectManager.getChat(homepageChatId);
        if (!existingChat) {
          await projectManager.createChat(homepageChatResourceId, {
            id: homepageChatId,
            name: 'Homepage chat',
            messages: [],
          });
        }
        setIsReady(true);
      } catch (error) {
        console.error('Failed to initialize homepage chat session:', error);
        toast.error('Failed to restore homepage chat draft');
      } finally {
        createInFlightRef.current = false;
      }
    };

    void ensureHomepageChat();
  }, [isReady, projectManager]);

  return {
    chatId: isReady ? homepageChatId : undefined,
    resourceId: homepageChatResourceId,
    isReady,
  };
}

function HomepageChatFlushOnCloseGuard(): React.JSX.Element {
  const { persistenceActorRef, draftActorRef } = useChatContext();

  useFlushOnClose(() => {
    persistenceActorRef.send({ type: 'flushNow' });
  });
  useFlushOnClose(() => {
    draftActorRef.send({ type: 'flushNow' });
  });

  // oxlint-disable-next-line react/jsx-no-useless-fragment -- headless hook-only component
  return <></>;
}

export const handle: Handle = {
  enableOverflowY: true,
  enablePageFooter: true,
};

export default function ChatStart(): React.JSX.Element {
  const { kernel, setKernel } = useKernel();
  const homepageChatSession = useHomepageChatSession();
  return (
    <>
      {/* Chat Input Section */}
      <div className='container mx-auto px-4 py-6 pb-12 md:px-6 md:pt-32'>
        <div className='mx-auto max-w-3xl space-y-6 md:space-y-8'>
          <div className='mb-12 text-center'>
            <h1 className='mx-auto max-w-[16ch] text-3xl font-semibold tracking-tight text-balance md:max-w-[20ch] md:text-5xl'>
              What can I help you build?
            </h1>
          </div>

          {homepageChatSession.chatId ? (
            <ChatProvider chatId={homepageChatSession.chatId} resourceId={homepageChatSession.resourceId}>
              <HomepageChatFlushOnCloseGuard />
              <HomepageChatInput kernel={kernel} setKernel={setKernel} />
            </ChatProvider>
          ) : (
            <div className='space-y-4'>
              <div className='flex justify-center'>
                <KernelSelector selectedKernel={kernel} onKernelChange={setKernel} />
              </div>
              <div className='flex justify-center py-6'>
                <Loader />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Community Projects */}
      <LazySection minHeight='400px' rootMargin='200px' fallback={<CommunityGridSkeleton />}>
        <div className='container mx-auto px-4 py-8'>
          <div className='mb-2 flex flex-row items-center justify-between'>
            <h1 className='text-lg font-medium tracking-tight'>From the Community</h1>
            <Button asChild variant='link' size='lg' className='p-0'>
              <Link to='/projects/community'>View All</Link>
            </Button>
          </div>
          <CommunityProjectGrid projects={sampleProjects} limit={10} />
        </div>
      </LazySection>

      {/* Hero Image with Features */}
      <LazySection minHeight='600px' fallback={<HeroImageSkeleton />}>
        <HeroImage />
      </LazySection>

      {/* Kernels Section */}
      <LazySection minHeight='400px' fallback={<KernelsSkeleton />}>
        <KernelsSection />
      </LazySection>

      {/* Interactive Demo */}
      <div className='container mx-auto px-4 py-16'>
        <LazyHeroViewer />
      </div>

      {/* Integration Section */}
      <LazySection minHeight='300px' fallback={<IntegrationSkeleton />}>
        <IntegrationSection />
      </LazySection>

      {/* Coming Soon Section */}
      <LazySection minHeight='200px' fallback={<ComingSoonSkeleton />}>
        <ComingSoonSection />
      </LazySection>

      {/* Final CTA Section */}
      <LazySection minHeight='200px' fallback={<CtaSkeleton />}>
        <CtaSection />
      </LazySection>
    </>
  );
}

function HomepageChatInput({
  kernel,
  setKernel,
}: {
  readonly kernel: ReturnType<typeof useKernel>['kernel'];
  readonly setKernel: ReturnType<typeof useKernel>['setKernel'];
}): React.JSX.Element {
  const navigate = useNavigate();
  const projectManager = useProjectManager();
  const { clearDraft } = useChatActions();
  const { draftActorRef } = useChatContext();

  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, model, metadata, imageUrls }) => {
      try {
        const createProject = await projectManager.createProject({
          kernel,
          initialMessage: { content, model, metadata, imageUrls },
          // Set initial panel state: chat open
          editorState: { panelState: { openPanels: { chat: true } } },
        });

        clearDraft();
        draftActorRef.send({ type: 'flushNow' });

        // Navigate immediately - the project page will handle the streaming
        await navigate(`/projects/${createProject.id}`);
      } catch (error) {
        console.error('Failed to create project:', error);
        toast.error('Failed to create project');
      }
    },
    [clearDraft, draftActorRef, kernel, navigate, projectManager],
  );

  return (
    <>
      <div className='space-y-4'>
        <div className='flex justify-center'>
          <KernelSelector selectedKernel={kernel} onKernelChange={setKernel} />
        </div>
        <ChatTextarea enableContextActions={false} enableKernelSelector={false} className='pt-1' onSubmit={onSubmit} />
      </div>
      <div className='mx-auto my-6 flex w-20 items-center justify-center'>
        <Separator />
        <div className='mx-4 text-sm font-light text-muted-foreground'>or</div>
        <Separator />
      </div>
      <div className='flex justify-center'>
        <NavLink to='/projects/new' tabIndex={-1}>
          {({ isPending }) => (
            <InteractiveHoverButton className='flex items-center gap-2 font-light [&_svg]:size-4 [&_svg]:stroke-1'>
              {isPending ? <Loader /> : 'Build from code'}
            </InteractiveHoverButton>
          )}
        </NavLink>
      </div>
    </>
  );
}
