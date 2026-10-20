import * as React from 'react';
import * as DesignSystemSidebar from '@taucad/ui/components/sidebar';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { PanelLeft } from 'lucide-react';
import { useLocation } from 'react-router';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { cookieName } from '#constants/cookie.constants.js';
import { sidebarDefaultOpen } from '#constants/sidebar.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { formatKeyCombination } from '@taucad/ui/utils/keys';
import type { KeyCombination } from '@taucad/ui/utils/keys';

const {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider: DesignSystemSidebarProvider,
  SidebarRail,
  SidebarSeparator,
  useSidebar: useDesignSystemSidebar,
} = DesignSystemSidebar;

const sidebarToggleKeyCombo = {
  key: 'b',
  modKey: true,
} as const satisfies KeyCombination;

const useSidebar = useDesignSystemSidebar;

const MobileSidebarRouteReset = () => {
  const { isMobile, setOpenMobile } = useSidebar();
  React.useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  return null;
};

const SidebarBehavior = () => {
  const { toggleSidebar } = useSidebar();
  const { key } = useLocation();

  useKeybinding(sidebarToggleKeyCombo, toggleSidebar, {
    preventDefault: true,
    stopPropagation: true,
  });

  return <MobileSidebarRouteReset key={key} />;
};

const SidebarProvider = ({
  onOpenChange: setOpenProperty,
  children,
  ...properties
}: React.ComponentProps<'div'> & {
  readonly onOpenChange?: (open: boolean) => void;
}): React.JSX.Element => {
  const [open, setOpenCookie] = useCookie(cookieName.sidebarOp, sidebarDefaultOpen);
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (setOpenProperty) {
        setOpenProperty(nextOpen);
        return;
      }

      setOpenCookie(nextOpen);
    },
    [setOpenCookie, setOpenProperty],
  );

  return (
    <DesignSystemSidebarProvider {...properties} open={open} onOpenChange={setOpen} keyboardShortcutKey=''>
      <SidebarBehavior />
      {children}
    </DesignSystemSidebarProvider>
  );
};

const SidebarTrigger = ({
  className,
  onClick,
  onKeyDown,
  onSidebarResize,
  children,
  ...properties
}: React.ComponentProps<typeof Button> & {
  readonly onSidebarResize?: (direction: 'narrower' | 'wider') => void;
}): React.JSX.Element => {
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar();
  const isOpen = isMobile ? openMobile : open;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-sidebar='trigger'
          data-slot='sidebar-trigger'
          data-open={isOpen}
          type='button'
          variant='ghost'
          size='icon-sm'
          className={cn(
            'size-7 shrink-0 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground',
            className,
          )}
          aria-controls={isMobile ? undefined : 'app-sidebar'}
          aria-expanded={isOpen}
          aria-keyshortcuts={onSidebarResize ? 'ArrowLeft ArrowRight' : undefined}
          onClick={(event) => {
            onClick?.(event);
            toggleSidebar();
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.defaultPrevented || !isOpen || !onSidebarResize) {
              return;
            }

            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              onSidebarResize('narrower');
              return;
            }

            if (event.key === 'ArrowRight') {
              event.preventDefault();
              onSidebarResize('wider');
            }
          }}
          {...properties}
        >
          {children ?? <PanelLeft aria-hidden data-slot='sidebar-panel-icon' className='size-3.5' />}
          <span className='sr-only'>Toggle Sidebar</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Sidebar{' '}
        <KeyShortcut className='ml-1' variant='tooltip'>
          {formatKeyCombination(sidebarToggleKeyCombo)}
        </KeyShortcut>
      </TooltipContent>
    </Tooltip>
  );
};

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
