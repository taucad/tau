import { useEffect } from 'react';
import type { MetaFunction } from 'react-router';
import { useSearchParams } from 'react-router';
import { PageContent } from '#components/layout/page-content.js';
import { ProjectLibrary } from '#components/project-library/project-library.js';
import { BuiltWithTau } from '#routes/_index/built-with-tau.js';
import { HomepageChatHero } from '#routes/_index/homepage-chat-hero.js';
import { SetupInvite } from '#components/onboarding/setup-invite.js';
import { useSetupOffer } from '#components/onboarding/use-setup-offer.js';
import type { Handle } from '#types/matches.types.js';
import { metaConfig } from '#constants/meta.constants.js';
import { setEntryPreference } from '@taucad/ui-core/lib/entry-preference';

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
  useAppEntryParameter();
  useSetupOffer({ isDesktopFirstRun: false });
  return (
    <div className='pb-10'>
      <HomepageChatHero />
      <SetupInvite />
      <ProjectLibrary
        headingLevel={2}
        emptyContent={
          <PageContent>
            <BuiltWithTau />
          </PageContent>
        }
      />
    </div>
  );
}

/**
 * Marketing links reach Home as `/?app` so they work even where their click hook could not write the app preference
 * (a new tab, a modified click, blocked cookies). Record the preference here and drop the marker from the address.
 */
function useAppEntryParameter(): void {
  const [searchParameters, setSearchParameters] = useSearchParams();
  const hasAppParameter = searchParameters.has('app');
  useEffect(() => {
    if (!hasAppParameter) {
      return;
    }
    setEntryPreference('app');
    setSearchParameters(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('app');
        return next;
      },
      { replace: true },
    );
  }, [hasAppParameter, setSearchParameters]);
}
