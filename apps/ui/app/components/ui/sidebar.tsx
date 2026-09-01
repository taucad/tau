import * as React from 'react';
import * as DesignSystemSidebar from '@taucad/ui/components/sidebar';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
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
  children,
  ...properties
}: React.ComponentProps<typeof Button>): React.JSX.Element => {
  const { toggleSidebar, open } = useSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-sidebar='trigger'
          data-slot='sidebar-trigger'
          data-open={open}
          variant='ghost'
          size='icon'
          className={cn('size-7', open ? 'cursor-w-resize' : 'cursor-e-resize', className)}
          onClick={(event) => {
            onClick?.(event);
            toggleSidebar();
          }}
          {...properties}
        >
          {children}
          <span className='sr-only'>Toggle Sidebar</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {open ? 'Close Sidebar' : 'Open Sidebar'}{' '}
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
