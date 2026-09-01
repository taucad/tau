/**
 * `/projects` — the project library (blueprint L3). It used to redirect to `/`
 * and host the library one level down under a `library` child; the page grammar
 * collapsed onto this route and `/projects/new` is the only child left.
 */
import { Link, Outlet, useLocation } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { ProjectLibrary } from '#components/project-library/project-library.js';
import type { Handle } from '#types/matches.types.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { formatKeyCombination } from '#utils/keys.utils.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant='ghost'>
            <Link to='/projects'>Projects</Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent className='flex items-center gap-2 align-baseline'>
          View all projects{` `}
          <KeyShortcut variant='tooltip'>{formatKeyCombination({ key: 'b', ctrlKey: true })}</KeyShortcut>
        </TooltipContent>
      </Tooltip>
    );
  },
  enableOverflowY: true,
};

export default function Projects(): React.JSX.Element {
  const location = useLocation();
  return location.pathname === '/projects' ? <ProjectLibrary /> : <Outlet />;
}
