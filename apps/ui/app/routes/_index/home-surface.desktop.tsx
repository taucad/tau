import type { MetaFunction } from 'react-router';
import { Link } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { ProjectLibrary } from '#components/project-library/project-library.js';
import { CommunityProjectGrid } from '#components/project-grid.js';
import { galleryProjects } from '#constants/project-examples.js';
import { HomepageChatHero } from '#routes/_index/homepage-chat-hero.js';
import type { Handle } from '#types/matches.types.js';
import { metaConfig } from '#constants/meta.constants.js';

export const meta: MetaFunction = () => [
  { title: metaConfig.name },
  { name: 'description', content: metaConfig.description },
];

export const handle: Handle = {
  enableOverflowY: true,
  enablePageFooter: false,
  enablePageWrapper: true,
};

export default function DesktopHome(): React.JSX.Element {
  return (
    <>
      <HomepageChatHero />
      <ProjectLibrary />
      {/* DR-C4: the desktop has no marketing page, so the gallery's strip lives under the library. */}
      <section className='container mx-auto px-4 pb-8'>
        <div className='mb-4 flex items-center justify-between gap-4'>
          <h2 className='text-2xl font-semibold tracking-tight'>Built with Tau</h2>
          <Button asChild variant='link' className='p-0'>
            <Link to='/community'>View all</Link>
          </Button>
        </div>
        <CommunityProjectGrid projects={galleryProjects} limit={10} />
      </section>
    </>
  );
}
