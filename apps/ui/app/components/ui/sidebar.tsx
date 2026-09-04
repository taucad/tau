import * as React from 'react';
import * as DesignSystemSidebar from '@taucad/ui/components/sidebar';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { PanelLeft } from 'lucide-react';
import { useLocation } from 'react-router';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import type { KeyCombination } from '#utils/keys.utils.js';

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

const sidebarDefaultOpen = true;
const sidebarToggleKeyCombo = {
  key: 'b',
  modKey: true,
} as const satisfies KeyCombination;

const useSidebar = useDesignSystemSidebar;

const SidebarBehavior = () => {
  const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const location = useLocation();

  useKeybinding(sidebarToggleKeyCombo, toggleSidebar, {
    preventDefault: true,
    stopPropagation: true,
  });

  React.useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [location, isMobile, setOpenMobile]);

  return null;
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
          {children ?? <PanelLeft aria-hidden data-slot='sidebar-panel-icon' className='size-4' />}
          <span className='sr-only'>Toggle Sidebar</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Toggle Sidebar{' '}
        <KeyShortcut className='ml-1' variant='tooltip'>
          {formatKeyCombination(sidebarToggleKeyCombo)}
        </KeyShortcut>
        {onSidebarResize && !isMobile ? <span className='ml-1 text-muted-foreground'>· ←/→ Resize</span> : null}
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
