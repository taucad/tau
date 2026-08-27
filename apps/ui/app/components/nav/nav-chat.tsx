import { PackagePlus } from 'lucide-react';
import { NavLink, useMatch, useNavigate } from 'react-router';
import { SidebarGroup, SidebarMenuButton } from '#components/ui/sidebar.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { Loader } from '#components/ui/loader.js';

export function NavChat(): React.JSX.Element {
  const navigate = useNavigate();
  const isMatch = useMatch('/');
  const { formattedKeyCombination } = useKeybinding(
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
    // Elevate the sidebar group above the other items to ensure the new project button is always clickable
    <SidebarGroup className='z-10 px-0'>
      <NavLink to='/'>
        {({ isActive, isPending }) => (
          <SidebarMenuButton
            asChild
            isActive={isActive}
            tooltip={{
              children: (
                <>
                  New Project{` `}
                  <KeyShortcut variant='tooltip' className='ml-1'>
                    {formattedKeyCombination}
                  </KeyShortcut>
                </>
              ),
            }}
            variant='outline'
          >
            <span>
              {isPending ? <Loader /> : <PackagePlus className='size-4 shrink-0' />}
              <span className='flex-1 whitespace-nowrap'>New Project</span>
              <KeyShortcut className='ml-2 shrink-0'>{formattedKeyCombination}</KeyShortcut>
            </span>
          </SidebarMenuButton>
        )}
      </NavLink>
    </SidebarGroup>
  );
}
