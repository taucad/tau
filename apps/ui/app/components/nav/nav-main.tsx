import { ChevronRight, Ellipsis } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, matchPath, NavLink, useLocation } from 'react-router';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '#components/ui/sidebar.js';
import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';

type NavMoreItem = {
  title: string;
  url: string;
  icon?: LucideIcon;
  action?: () => void;
};

/** The "More" row: secondary destinations in a menu beside the sidebar. */
function NavMore({ items }: { readonly items: readonly NavMoreItem[] }): React.JSX.Element {
  const { isMobile } = useSidebar();
  const { pathname } = useLocation();
  const isActive = items.some((item) => matchPath({ path: item.url, end: false }, pathname) !== null);

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton isActive={isActive}>
            <Ellipsis className='size-4 shrink-0' />
            <span className='flex-1 truncate'>More</span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={isMobile ? 'bottom' : 'right'} align='start' className='min-w-48'>
          {items.map((item) => {
            const content = (
              <>
                {item.icon ? <item.icon className='size-4 shrink-0' /> : null}
                <span className='flex-1 truncate'>{item.title}</span>
              </>
            );
            return item.action ? (
              <DropdownMenuItem key={item.title} onSelect={item.action}>
                {content}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem key={item.title} asChild>
                <Link to={item.url}>{content}</Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

export function NavMain({
  items,
  moreItems,
  groupLabel,
  className,
}: {
  readonly items: Array<{
    title: string;
    url: string;
    icon?: LucideIcon;
    isActive?: boolean;
    action?: () => void;
    items?: Array<{
      title: string;
      url: string;
    }>;
  }>;
  /** Listed under a trailing "More" row; the row is omitted when empty. */
  readonly moreItems?: readonly NavMoreItem[];
  readonly groupLabel?: string;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <SidebarGroup className={cn('px-2', className)}>
      {groupLabel ? <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel> : null}
      <SidebarMenu>
        {items.map((item) => {
          const hasItems = item.items !== undefined && item.items.length > 0;

          // Items with an action callback render a button instead of a NavLink
          if (item.action) {
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton onClick={item.action}>
                  {item.icon ? <item.icon className='size-4 shrink-0' /> : null}
                  <span className='flex-1 truncate'>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return (
            <Collapsible key={item.title} asChild defaultOpen={item.isActive} className='group/collapsible'>
              <SidebarMenuItem>
                <NavLink to={item.url}>
                  {({ isActive, isPending }) => {
                    const row = (
                      <SidebarMenuButton asChild isActive={isActive}>
                        <span>
                          {isPending ? <Loader /> : item.icon ? <item.icon className='size-4 shrink-0' /> : null}
                          <span className='flex-1 truncate'>{item.title}</span>
                          {hasItems ? (
                            <ChevronRight className='ml-2 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                          ) : null}
                        </span>
                      </SidebarMenuButton>
                    );

                    // Leaf rows control nothing, so they must not carry the trigger's aria-expanded/aria-controls.
                    return hasItems ? <CollapsibleTrigger asChild>{row}</CollapsibleTrigger> : row;
                  }}
                </NavLink>
                {hasItems ? (
                  <CollapsibleContent asChild>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <NavLink to={subItem.url} tabIndex={-1}>
                            {({ isActive, isPending }) => (
                              <SidebarMenuSubButton asChild isActive={isActive}>
                                <span>
                                  <span className='flex-1'>{subItem.title}</span>
                                  {isPending ? <Loader /> : null}
                                </span>
                              </SidebarMenuSubButton>
                            )}
                          </NavLink>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                ) : null}
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
        {moreItems !== undefined && moreItems.length > 0 ? <NavMore items={moreItems} /> : null}
      </SidebarMenu>
    </SidebarGroup>
  );
}
