import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSession } from '@better-auth-ui/react';
import { useFeature } from '#flags/use-feature.js';
import { authClient } from '#lib/auth-client.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { hasUsedPageSince } from '#components/onboarding/home-interaction.js';
import { readAccountCreatedAt, shouldOfferSetup } from '#components/onboarding/should-offer-setup.js';
import { setupEntryParameter } from '#components/onboarding/setup-entry.js';

/**
 * Open setup from home when {@link shouldOfferSetup} says so. It decides again whenever the location
 * or the session changes, so it sees the address after home removed its `?app` marker and a session that arrives
 * after the page. Before navigating it stores `setup.status = 'offered'`, so a reload or a second tab does nothing.
 * The decision reads the loaded session and the device only; it makes no request.
 *
 * @param input - Whether this is the desktop's first run.
 */
export const useSetupOffer = ({ isDesktopFirstRun }: Readonly<{ isDesktopFirstRun: boolean }>): void => {
  const isOnboardingEnabled = useFeature('onboarding');
  const isAutoOpenEnabled = useFeature('onboardingAutoOpen');
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession(authClient);
  const { onboarding, writeOnboarding } = usePersonRecord();
  const accountCreatedAt = readAccountCreatedAt(session?.user.createdAt);
  const [homeMountedAt] = useState(() => performance.now());

  useEffect(() => {
    if (isPending && !isDesktopFirstRun) {
      return;
    }
    const isOffered = shouldOfferSetup({
      isOnboardingEnabled,
      isAutoOpenEnabled,
      location: { pathname, search },
      onboarding,
      accountCreatedAt,
      isDesktopFirstRun,
      hasUsedHome: hasUsedPageSince(homeMountedAt),
      now: Date.now(),
    });
    if (!isOffered) {
      return;
    }
    writeOnboarding({ setupStatus: 'offered' });
    const entry = accountCreatedAt === undefined ? 'first_launch' : 'signup';
    void navigate(`/welcome?${setupEntryParameter}=${entry}`);
  }, [
    accountCreatedAt,
    homeMountedAt,
    isAutoOpenEnabled,
    isDesktopFirstRun,
    isOnboardingEnabled,
    isPending,
    navigate,
    onboarding,
    pathname,
    search,
    writeOnboarding,
  ]);
};
