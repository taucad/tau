import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { SidebarTrigger } from '#components/ui/sidebar.js';

type BrowserNavigation = EventTarget & {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
};

const getNavigation = (): BrowserNavigation | undefined =>
  (globalThis as typeof globalThis & { navigation?: BrowserNavigation }).navigation;

const HistoryButton = ({
  direction,
  isDisabled,
}: {
  readonly direction: 'Back' | 'Forward';
  readonly isDisabled: boolean;
}): React.JSX.Element => {
  const Icon = direction === 'Back' ? ArrowLeft : ArrowRight;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          className='size-7 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground'
          aria-label={direction}
          disabled={isDisabled}
          onClick={() => {
            if (direction === 'Back') {
              history.back();
              return;
            }
            history.forward();
          }}
        >
          <Icon aria-hidden className='size-4' />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{direction}</TooltipContent>
    </Tooltip>
  );
};

export const DesktopTitlebarControls = ({
  onSidebarResize,
}: {
  readonly onSidebarResize: (direction: 'narrower' | 'wider') => void;
}): React.JSX.Element => {
  const [availability, setAvailability] = useState({ back: false, forward: false });

  useEffect(() => {
    const navigation = getNavigation();
    if (!navigation) {
      return;
    }

    const update = (): void => {
      setAvailability({ back: navigation.canGoBack, forward: navigation.canGoForward });
    };
    update();
    navigation.addEventListener('currententrychange', update);
    return () => {
      navigation.removeEventListener('currententrychange', update);
    };
  }, []);

  return (
    <div
      data-slot='desktop-titlebar'
      className='fixed top-0 left-0 z-50 h-9 w-(--titlebar-controls-width) bg-transparent'
    >
      <div
        data-slot='desktop-titlebar-controls'
        className='flex h-9 items-center gap-1 bg-transparent pr-2 pl-22 [app-region:no-drag] [&_button]:[app-region:no-drag]'
      >
        <span
          aria-hidden
          data-slot='desktop-titlebar-drag-region'
          className='absolute inset-y-0 left-0 w-[84px] [app-region:drag]'
        />
        <SidebarTrigger aria-label='Toggle Sidebar' onSidebarResize={onSidebarResize} />
        <HistoryButton direction='Back' isDisabled={!availability.back} />
        <HistoryButton direction='Forward' isDisabled={!availability.forward} />
      </div>
    </div>
  );
};
