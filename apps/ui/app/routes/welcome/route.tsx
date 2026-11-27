import type { MetaFunction } from 'react-router';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { toast } from '@taucad/ui/components/sonner';
import { SetupFlow } from '#components/onboarding/setup-flow.js';
import { setupChromeCopy, setupFinishCopy, setupStepIds } from '#components/onboarding/setup-copy.js';
import { parseSetupEntry, setupEntryParameter } from '#components/onboarding/setup-entry.js';
import type { SetupStepId } from '#components/onboarding/setup-copy.js';
import { metaConfig } from '#constants/meta.constants.js';
import { useFeatureGate } from '#flags/use-feature.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { useTourReplay } from '#components/tour/tour-menu.js';
import type { Handle } from '#types/matches.types.js';

/*
 * No server `loader`, `action` or `headers`: the desktop route manifest drops any module with one, and setup runs
 * there too.
 */

export const meta: MetaFunction = () => [{ title: `${setupChromeCopy.pageTitle} · ${metaConfig.name}` }];

export const handle: Handle = {
  enablePageWrapper: true,
};

/**
 * Setup's frame while `onboarding`'s answer is still coming: the header and a step's first rows, at their final size.
 *
 * @returns The placeholder.
 */
const SetupPlaceholder = (): React.JSX.Element => (
  <div role='status' aria-busy='true' className='mx-auto flex min-h-full w-full max-w-5xl flex-col'>
    <span className='sr-only'>{setupChromeCopy.pageTitle}</span>
    <div className='flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6' aria-hidden='true'>
      <Skeleton className='h-5 w-24' />
      <Skeleton className='h-8 w-14' />
    </div>
    <div className='flex flex-col gap-5 p-4 sm:p-6' aria-hidden='true'>
      <Skeleton className='h-8 w-2/3 max-w-md' />
      <Skeleton className='h-4 w-1/2 max-w-sm' />
      <Skeleton className='h-40 w-full' />
    </div>
  </div>
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

/**
 * Setup, behind `onboarding` (`useFeatureGate`). Until the answer arrives (the server render, hydration, and on the
 * client until PostHog has answered or the host decided no answer will come) it shows setup's frame: redirecting then
 * would send everyone who opens a setup link home before the flag arrives. An answered `off` sends the person home,
 * but only before setup was shown. A failed flag load shows the requested step, with no error: it decided nothing, so
 * the deep link fails open, and once shown no later answer takes the person away.
 */
export default function WelcomeRoute(): React.JSX.Element {
  const onboarding = useFeatureGate('onboarding');
  const [searchParameters] = useSearchParams();
  const location = useLocation();
  const onOpenFolder = useOpenFolder();
  /* "Take it again" replays the tour in the most recently active project; with none it stays disabled. */
  const onReplayTour = useTourReplay();
  if (onboarding === 'waiting') {
    return <SetupPlaceholder />;
  }
  if (onboarding === 'closed') {
    return <Navigate to='/' replace />;
  }
  const step = searchParameters.get('step') ?? undefined;
  return (
    /* Keyed by navigation: Help's "How Tau works" while setup is open changes only the query, and must open step 4. */
    <SetupFlow
      key={location.key}
      entry={parseSetupEntry(searchParameters.get(setupEntryParameter) ?? undefined)}
      initialStep={isSetupStepId(step) ? step : undefined}
      onOpenFolder={onOpenFolder}
      onReplayTour={onReplayTour}
    />
  );
}
