import type { MetaFunction } from 'react-router';
import { PageContent } from '#components/layout/page-content.js';
import { ProjectLibrary } from '#components/project-library/project-library.js';
import { BuiltWithTau } from '#routes/_index/built-with-tau.js';
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

export default function DesktopHome(): React.JSX.Element {
  return (
    <>
      <HomepageChatHero />
      <ProjectLibrary headingLevel={2} emptyContent={null} />
      {/* DR-C4: the desktop has no marketing page, so the gallery's strip lives under the library. */}
      <PageContent>
        <BuiltWithTau />
      </PageContent>
    </>
  );
}
