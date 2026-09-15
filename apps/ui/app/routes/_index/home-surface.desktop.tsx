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
  enablePageFooter: false,
  enablePageWrapper: true,
};

export default function DesktopHome(): React.JSX.Element {
  return (
    <>
      <HomepageChatHero />
      <ProjectLibrary />
    </>
  );
}
