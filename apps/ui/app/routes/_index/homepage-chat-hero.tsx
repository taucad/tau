import { NavLink } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { NewProjectChatComposer } from '#components/chat/new-project-chat-composer.js';
import { KernelSelector } from '#components/chat/kernel-selector.js';
import { ActiveChatProvider } from '#hooks/active-chat-provider.js';
import { Separator } from '#components/ui/separator.js';
import { InteractiveHoverButton } from '#components/magicui/interactive-hover-button.js';
import { toast } from '#components/ui/sonner.js';
import { Loader } from '#components/ui/loader.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useKernel } from '#hooks/use-kernel.js';

const homepageChatResourceId = 'homepage_main_chat_resource';
const homepageChatId = 'chat_homepage_main';

function useHomepageChatSession(): { chatId: string | undefined; isReady: boolean } {
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
    isReady,
  };
}

/**
 * The homepage chat hero: "What can I help you build?" over the real chat
 * composer (kernel selector + textarea) with a "Build from code" escape hatch.
 * Shared by the legacy landing (flag off) and the signed-in home view (flag on),
 * both of which start new projects from the same persistent homepage draft.
 */
export function HomepageChatHero(): React.JSX.Element {
  const { kernel, setKernel } = useKernel();
  const homepageChatSession = useHomepageChatSession();

  return (
    <div className='container mx-auto px-4 py-6 pb-12 md:px-6 md:pt-32'>
      <div className='mx-auto max-w-3xl space-y-6 md:space-y-8'>
        <div className='mb-12 text-center'>
          <h1 className='mx-auto max-w-[16ch] text-3xl font-semibold tracking-tight text-balance md:max-w-[20ch] md:text-5xl'>
            What can I help you build?
          </h1>
        </div>

        {homepageChatSession.chatId ? (
          <ActiveChatProvider chatId={homepageChatSession.chatId}>
            <NewProjectChatComposer />
          </ActiveChatProvider>
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
      </div>
    </div>
  );
}
