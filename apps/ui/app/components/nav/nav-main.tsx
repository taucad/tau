import { ChevronRight, type LucideIcon } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { NavLink, useMatch, useNavigate } from '@remix-run/react';
import { formatKeyCombination, KeyCombination } from '@/utils/keys';
import { useKeydown } from '@/hooks/use-keydown';
import { KeyShortcut } from '../ui/key-shortcut';

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: LucideIcon;
    isActive?: boolean;
    items?: {
      title: string;
      url: string;
    }[];
    keyCombination?: KeyCombination;
  }[];
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const hasItems = item.items !== undefined && item.items.length > 0;
          return (
            <Collapsible key={item.title} asChild defaultOpen={item.isActive} className="group/collapsible">
              <SidebarMenuItem>
                <NavLink to={item.url} tabIndex={-1}>
                  {({ isActive }) => (
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={
                          item.keyCombination && {
                            children: (
                              <>
                                {item.title}
                                {` `}
                                <KeyShortcut variant="tooltip" className="ml-1">
                                  {formatKeyCombination(item.keyCombination)}
                                </KeyShortcut>
                              </>
                            ),
                          }
                        }
                      >
                        {item.icon && <item.icon className="size-4 shrink-0" />}
                        <span className="flex-1">{item.title}</span>
                        {hasItems && (
                          <ChevronRight className="ml-2 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        )}
                        {item.keyCombination && (
                          <NavKeyboardShortcut
                            className="ml-2 shrink-0"
                            keyCombination={item.keyCombination}
                            url={item.url}
                          />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                  )}
                </NavLink>
                {hasItems && (
                  <CollapsibleContent asChild>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <NavLink to={subItem.url} tabIndex={-1}>
                            {({ isActive }) => (
                              <SidebarMenuSubButton isActive={isActive} asChild>
                                <span className="flex-1">{subItem.title}</span>
                              </SidebarMenuSubButton>
                            )}
                          </NavLink>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                )}
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

const NavKeyboardShortcut = ({
  keyCombination,
  url,
  className,
}: {
  keyCombination: KeyCombination;
  url: string;
  className: string;
}) => {
  const isMatch = useMatch(url);
  const navigate = useNavigate();
  const { formattedKeyCombination } = useKeydown(keyCombination, () => {
    if (isMatch) return;
    navigate(url);
  });
  return <KeyShortcut className={className}>{formattedKeyCombination}</KeyShortcut>;
};
