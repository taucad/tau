import { Link } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { CommunityProjectGrid } from '#components/project-grid.js';
import { galleryProjects } from '#constants/project-examples.js';

/**
 * The first curated examples and a way into the Community gallery. The desktop home
 * always shows it; the web home shows it while the library has no projects.
 *
 * @param props - The component props.
 * @param props.className - Spacing owned by the host surface.
 * @returns The section.
 */
export function BuiltWithTau({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <section className={cn(className)}>
      <div className='mb-4 flex items-center justify-between gap-4'>
        <h2 className='text-2xl font-semibold tracking-tight'>Built with Tau</h2>
        <Button asChild variant='link' className='p-0'>
          <Link to='/community'>View all</Link>
        </Button>
      </div>
      <CommunityProjectGrid projects={galleryProjects} limit={10} />
    </section>
  );
}
