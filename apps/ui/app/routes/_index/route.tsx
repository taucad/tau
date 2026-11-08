import type { MetaFunction } from 'react-router';
import { ProjectLibrary } from '#components/project-library/project-library.js';
import { HomepageChatHero } from '#routes/_index/homepage-chat-hero.js';
import type { Handle } from '#types/matches.types.js';
import { metaConfig } from '#constants/meta.constants.js';

export const meta: MetaFunction = () => [
  { title: metaConfig.name },
  { name: 'description', content: metaConfig.description },
];

export const handle: Handle = {
  enableOverflowY: true,
  enablePageWrapper: true,
};

/** Session-neutral app home; the marketing site (`apps/www`) is served by the edge before this app. */
export default function WebHome(): React.JSX.Element {
  return (
    <div className='pb-10'>
      <HomepageChatHero />
      <ProjectLibrary headingLevel={2} />
    </div>
  );
}
