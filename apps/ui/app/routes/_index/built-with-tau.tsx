import { Link } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { SectionHeader } from '#components/layout/page-header.js';
import { CommunityProjectGrid } from '#components/project-grid.js';
import { galleryProjects } from '#constants/project-examples.js';

/**
 * The first curated examples and a way into the Community gallery. The desktop home
 * always shows it; the web home shows it in place of an empty library.
 *
 * @returns The section.
 */
export function BuiltWithTau(): React.JSX.Element {
  return (
    <section>
      <SectionHeader
        level={2}
        title='Built with Tau'
        className='mb-4'
        action={
          <Button asChild variant='link' className='p-0'>
            <Link to='/community'>View all</Link>
          </Button>
        }
      />
      <CommunityProjectGrid projects={galleryProjects} limit={10} titleLevel={3} />
    </section>
  );
}
