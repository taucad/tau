import { SidebarMenuButton } from '@/components/ui/sidebar';
import { Plus } from 'lucide-react';
import { SidebarGroup } from '../ui/sidebar';
import { NavLink, useMatch, useNavigate } from '@remix-run/react';
import { useKeydown } from '@/hooks/use-keydown';
import { KeyShortcut } from '../ui/key-shortcut';
export const NavChat = () => {
  const navigate = useNavigate();
  const isMatch = useMatch('/');
  const { formattedKeyCombination } = useKeydown(
    {
      key: 'n',
      ctrlKey: true,
    },
    () => {
      if (!isMatch) {
        navigate('/');
      }
    },
  );
  return (
    // Elevate the sidebar group above the other items to ensure the new build button is always clickable
    <SidebarGroup className="z-10">
      <NavLink to="/" tabIndex={-1}>
        {({ isActive }) => (
          <SidebarMenuButton
            isActive={isActive}
            tooltip={{
              children: (
                <>
                  New Build{` `}
                  <KeyShortcut variant="tooltip" className="ml-1">
                    {formattedKeyCombination}
                  </KeyShortcut>
                </>
              ),
            }}
            variant="outline"
            className="whitespace-nowrap group-data-[collapsible=icon]:pl-[7px]! pl-[7px]!"
          >
            <Plus className="size-4 shrink-0" />
            <span className="flex-1">New Build</span>
            <KeyShortcut className="ml-2 shrink-0">{formattedKeyCombination}</KeyShortcut>
          </SidebarMenuButton>
        )}
      </NavLink>
    </SidebarGroup>
  );
};
