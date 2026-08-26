import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, X } from 'lucide-react';
import { useProjects } from '#hooks/use-projects.js';
import { projectUrlOr } from '#utils/project-url.utils.js';

/**
 * Slim ribbon shown to signed-out visitors who already have local (offline-first)
 * projects: a one-click path back to their most recent work without leaving the
 * marketing page (OQ2). Renders nothing when there are no local projects.
 */
export function ContinueRibbon(): React.ReactNode {
  const { projects } = useProjects();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || projects.length === 0) {
    return null;
  }

  const mostRecent = [...projects].sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0];
  if (!mostRecent) {
    return null;
  }

  return (
    <div className='border-b bg-primary/5'>
      <div className='container mx-auto flex items-center justify-between gap-3 px-4 py-2 text-sm'>
        <Link
          to={projectUrlOr(mostRecent.slugs)}
          className='flex min-w-0 items-center gap-2 text-foreground transition-colors hover:text-primary'
        >
          <span className='text-muted-foreground'>Continue where you left off</span>
          <span className='truncate font-medium'>{mostRecent.name}</span>
          <ArrowRight className='size-3.5 shrink-0' />
        </Link>
        <button
          type='button'
          aria-label='Dismiss'
          className='shrink-0 text-muted-foreground transition-colors hover:text-foreground'
          onClick={() => {
            setDismissed(true);
          }}
        >
          <X className='size-4' />
        </button>
      </div>
    </div>
  );
}
