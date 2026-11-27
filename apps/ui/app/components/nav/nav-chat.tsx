import { PackagePlus } from 'lucide-react';
import { NavLink, useMatch, useNavigate } from 'react-router';
import { SidebarGroup, SidebarMenuButton } from '#components/ui/sidebar.js';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';

/** Starts a project from the Home chat composer; "Build from code" there opens `/projects/new`. */
const newProjectState = { focusChatComposer: true } as const;
const newProjectKeyCombination = { key: 'n', ctrlKey: true } as const;

/**
 * The sidebar's New project button.
 *
 * @param props - `isCompact` tightens the desktop app's row; `isTouchSized` gives the phone sheet its 44px target
 * (canvas SB-02, I3), where the keyboard chip already stays hidden.
 * @returns The button.
 */
export function NavChat({
  isCompact = false,
  isTouchSized = false,
}: {
  readonly isCompact?: boolean;
  readonly isTouchSized?: boolean;
}): React.JSX.Element {
  const navigate = useNavigate();
  const isMatch = useMatch('/');
  const { formattedKeyCombination } = useKeybinding(newProjectKeyCombination, () => {
    // Already there: replace, so repeated presses do not stack history entries.
    void navigate('/', { replace: Boolean(isMatch), state: newProjectState });
  });
  return (
    // Elevate the sidebar group above the other items to ensure the new project button is always clickable
    <SidebarGroup className={cn('z-10 px-0', isCompact && 'py-0')}>
      <NavLink end to='/' state={newProjectState}>
        {({ isActive, isPending }) => (
          <SidebarMenuButton
            asChild
            isActive={isActive}
            tooltip={{
              children: (
                <>
                  New project{` `}
                  <KeyShortcut variant='tooltip' className='ml-1'>
                    {formattedKeyCombination}
                  </KeyShortcut>
                </>
              ),
            }}
            variant='outline'
            size={isTouchSized ? 'lg' : 'default'}
          >
            <span>
              {isPending ? <Loader /> : <PackagePlus className='size-4 shrink-0' />}
              <span className='flex-1 whitespace-nowrap'>New project</span>
              {/* Drawn at first paint, so it carries both platforms' labels (I7): it keeps its box through hydration. */}
              <KeyShortcut className='ml-2 shrink-0' combination={newProjectKeyCombination} />
            </span>
          </SidebarMenuButton>
        )}
      </NavLink>
    </SidebarGroup>
  );
}
