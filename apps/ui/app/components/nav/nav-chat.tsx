import { PackagePlus } from 'lucide-react';
import { NavLink, useMatch, useNavigate } from 'react-router';
import { SidebarGroup, SidebarMenuButton } from '#components/ui/sidebar.js';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';

export function NavChat({ isCompact = false }: { readonly isCompact?: boolean }): React.JSX.Element {
  const navigate = useNavigate();
  const isMatch = useMatch('/projects/new');
  const { formattedKeyCombination } = useKeybinding(
    {
      key: 'n',
      ctrlKey: true,
    },
    () => {
      // Already there: replace, so repeated presses do not stack history entries.
      void navigate('/projects/new', { replace: Boolean(isMatch) });
    },
  );
  return (
    // Elevate the sidebar group above the other items to ensure the new project button is always clickable
    <SidebarGroup className={cn('z-10 px-0', isCompact && 'py-0')}>
      <NavLink to='/projects/new'>
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
