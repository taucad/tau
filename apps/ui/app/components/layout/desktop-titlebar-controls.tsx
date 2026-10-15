import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { SidebarTrigger, useSidebar } from '#components/ui/sidebar.js';
import { Link } from 'react-router';
import { TauTextWordmark } from '#components/icons/tau-text-wordmark.js';
import { cn } from '@taucad/ui/utils/cn';

type BrowserNavigation = EventTarget & {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
};

const getNavigation = (): BrowserNavigation | undefined =>
  (globalThis as typeof globalThis & { navigation?: BrowserNavigation }).navigation;

const HistoryButton = ({
  direction,
  isDisabled,
  className,
}: {
  readonly direction: 'Back' | 'Forward';
  readonly isDisabled: boolean;
  readonly className?: string;
}): React.JSX.Element => {
  const Icon = direction === 'Back' ? ArrowLeft : ArrowRight;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          className={cn('rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground', className)}
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

export const TitlebarNavigation = ({
  onSidebarResize,
  hasHistory = false,
  hasWordmark = true,
}: {
  readonly hasHistory?: boolean;
  readonly hasWordmark?: boolean;
  readonly onSidebarResize: (direction: 'narrower' | 'wider') => void;
}): React.JSX.Element => {
  const { open, isMobile } = useSidebar();
  const [availability, setAvailability] = useState({ back: false, forward: false });

  useEffect(() => {
    if (!hasHistory) {
      return;
    }
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
  }, [hasHistory]);

  return (
    <>
      <SidebarTrigger aria-label='Toggle Sidebar' onSidebarResize={onSidebarResize} />
      {hasWordmark && open && !isMobile ? (
        <Link
          to='/'
          aria-label='Home'
          className='flex h-7 shrink-0 items-center rounded-sm outline-none [app-region:no-drag] focus-visible:focus-outline'
        >
          <TauTextWordmark aria-hidden className='h-5 w-auto text-primary' />
        </Link>
      ) : null}
      {hasHistory ? (
        <>
          <HistoryButton
            direction='Back'
            isDisabled={!availability.back}
            className={open && !isMobile ? 'ml-auto' : undefined}
          />
          <HistoryButton direction='Forward' isDisabled={!availability.forward} />
        </>
      ) : null}
    </>
  );
};

export const DesktopTitlebarControls = ({
  onSidebarResize,
  isFullscreen,
}: {
  readonly isFullscreen: boolean;
  readonly onSidebarResize: (direction: 'narrower' | 'wider') => void;
}): React.JSX.Element => {
  const { open, isMobile } = useSidebar();
  return (
    <div
      data-slot='desktop-titlebar'
      className='fixed top-0 left-0 z-50 h-9 w-(--titlebar-controls-width) bg-transparent'
    >
      <div
        data-slot='desktop-titlebar-controls'
        className={cn(
          'flex h-9 items-center gap-1 bg-transparent pl-(--desktop-titlebar-inset) [&_button]:[app-region:no-drag] [&_a]:[app-region:no-drag]',
          open && !isMobile ? 'pr-2' : 'pr-1',
        )}
      >
        <TitlebarNavigation hasHistory hasWordmark={isFullscreen} onSidebarResize={onSidebarResize} />
      </div>
    </div>
  );
};
