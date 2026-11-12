import { useSyncExternalStore } from 'react';
import type { MetaFunction } from 'react-router';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { toast } from '@taucad/ui/components/sonner';
import { SetupFlow } from '#components/onboarding/setup-flow.js';
import { setupChromeCopy, setupFinishCopy, setupStepIds } from '#components/onboarding/setup-copy.js';
import type { SetupStepId } from '#components/onboarding/setup-copy.js';
import { metaConfig } from '#constants/meta.constants.js';
import { useFeature } from '#flags/use-feature.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { isDesktopTarget } from '#lib/build-target.js';
import type { Handle } from '#types/matches.types.js';

/*
 * No server `loader`, `action` or `headers`: the desktop route manifest drops any module with one, and setup runs
 * there too (Finding 10).
 */

export const meta: MetaFunction = () => [{ title: `${setupChromeCopy.pageTitle} · ${metaConfig.name}` }];

export const handle: Handle = {
  enableOverflowY: true,
  enablePageWrapper: true,
};

const subscribeNever = (): (() => void) => () => undefined;

/**
 * False in the server render and while hydrating, true after: the flag store answers with its defaults until then, so
 * deciding to redirect before it would send everyone home.
 *
 * @returns Whether this render runs after hydration.
 */
const useIsHydrated = (): boolean =>
  useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

/**
 * Desktop: the Finish screen's Open a folder, which connects a folder of projects and goes home.
 *
 * @returns The action on the desktop, or `undefined` in the browser.
 */
const useOpenFolder = (): (() => Promise<void>) | undefined => {
  const navigate = useNavigate();
  const { connectWorkspace } = useProjectManager();
  if (!isDesktopTarget()) {
    return undefined;
  }
  return async () => {
    try {
      if ((await connectWorkspace()) !== undefined) {
        await navigate('/');
      }
    } catch {
      toast.error(setupFinishCopy.openFolderFailed);
    }
  };
};

const isSetupStepId = (value: string | undefined): value is SetupStepId =>
  value !== undefined && (setupStepIds as readonly string[]).includes(value);

/** Setup (onboarding blueprint, Finding 2), behind `onboarding`. With the flag off the route sends the person home. */
export default function WelcomeRoute(): React.JSX.Element {
  const isHydrated = useIsHydrated();
  const isOnboardingEnabled = useFeature('onboarding');
  const [searchParameters] = useSearchParams();
  const onOpenFolder = useOpenFolder();
  if (!isHydrated) {
    return <div className='min-h-full' />;
  }
  if (!isOnboardingEnabled) {
    return <Navigate to='/' replace />;
  }
  const step = searchParameters.get('step') ?? undefined;
  return <SetupFlow initialStep={isSetupStepId(step) ? step : undefined} onOpenFolder={onOpenFolder} />;
}
