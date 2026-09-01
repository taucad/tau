import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '#components/ui/sidebar.js';
import { Loader } from '#components/ui/loader.js';
import { cn } from '@taucad/ui/utils/cn';

export function NavMain({
  items,
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
                  {({ isActive, isPending }) => (
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <span>
                          {isPending ? <Loader /> : item.icon ? <item.icon className='size-4 shrink-0' /> : null}
                          <span className='flex-1 truncate'>{item.title}</span>
                          {hasItems ? (
                            <ChevronRight className='ml-2 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                          ) : null}
                        </span>
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                  )}
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
      </SidebarMenu>
    </SidebarGroup>
  );
}
