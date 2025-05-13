import { PackagePlus } from 'lucide-react';
import { NavLink, useMatch, useNavigate } from 'react-router';
import type { JSX } from 'react';
import { SidebarGroup, SidebarMenuButton } from '@/components/ui/sidebar.js';
import { KeyShortcut } from '@/components/ui/key-shortcut.js';
import { useKeydown } from '@/hooks/use-keydown.js';

export function NavChat(): JSX.Element {
  const navigate = useNavigate();
  const isMatch = useMatch('/');
  const { formattedKeyCombination } = useKeydown(
    {
      key: 'n',
      ctrlKey: true,
    },
    () => {
      if (!isMatch) {
        void navigate('/');
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
            // This padding hack is to ensure the icon is centered correctly when the sidebar is collapsed
            className="pl-[7px]! whitespace-nowrap group-data-[collapsible=icon]:pl-[7px]!"
          >
            <PackagePlus className="size-4 shrink-0" />
            <span className="flex-1">New Build</span>
            <KeyShortcut className="ml-2 shrink-0">{formattedKeyCombination}</KeyShortcut>
          </SidebarMenuButton>
        )}
      </NavLink>
    </SidebarGroup>
  );
}
