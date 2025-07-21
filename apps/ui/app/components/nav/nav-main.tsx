import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, useMatch, useNavigate } from 'react-router';
import { KeyShortcut } from '~/components/ui/key-shortcut.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible.js';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '~/components/ui/sidebar.js';
import type { KeyCombination } from '~/utils/keys.js';
import { formatKeyCombination } from '~/utils/keys.js';
import { useKeydown } from '~/hooks/use-keydown.js';

export function NavMain({
  items,
}: {
  readonly items: Array<{
    title: string;
    url: string;
    icon?: LucideIcon;
    isActive?: boolean;
    items?: Array<{
      title: string;
      url: string;
    }>;
    keyCombination?: KeyCombination;
  }>;
}): React.JSX.Element {
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
                          item.keyCombination
                            ? {
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
                            : undefined
                        }
                      >
                        {item.icon ? <item.icon className="size-4 shrink-0" /> : null}
                        <span className="flex-1 truncate">{item.title}</span>
                        {hasItems ? (
                          <ChevronRight className="ml-2 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        ) : null}
                        {item.keyCombination ? (
                          <NavKeyboardShortcut
                            className="ml-2 shrink-0"
                            keyCombination={item.keyCombination}
                            url={item.url}
                          />
                        ) : null}
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
                            {({ isActive }) => (
                              <SidebarMenuSubButton asChild isActive={isActive}>
                                <span className="flex-1">{subItem.title}</span>
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

function NavKeyboardShortcut({
  keyCombination,
  url,
  className,
}: {
  readonly keyCombination: KeyCombination;
  readonly url: string;
  readonly className: string;
}) {
  const isMatch = useMatch(url);
  const navigate = useNavigate();
  const { formattedKeyCombination } = useKeydown(keyCombination, () => {
    if (isMatch) {
      return;
    }

    void navigate(url);
  });
  return <KeyShortcut className={className}>{formattedKeyCombination}</KeyShortcut>;
}
