import { AlertCircle, ArrowLeft, LoaderCircle, RefreshCcw } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useSyncExternalStore } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { useAnalytics } from '#hooks/use-analytics.js';
import { PageNotFound } from '#components/page-not-found.js';
import { reportUiError } from '#lib/error-reporting.js';
import { describeSupersession } from '#filesystem/build-skew.js';
import { useSupersedingBuild } from '#hooks/use-superseding-build.js';
import { useReloadPromptOwner } from '#components/nav/browser-update.js';
import {
  isStaleModuleError,
  readReloadState,
  readStaleBuildOutcome,
  recoverFromStaleBuild,
  subscribeReloadState,
  subscribeStaleBuildOutcomes,
} from '#lib/stale-build-recovery.js';
import type { ReloadState, StaleBuildOutcome } from '#lib/stale-build-recovery.js';

const CollapsibleCodeBlock = lazy(async () => {
  const m = await import('#components/ui/collapsible-code-block.js');
  return { default: m.CollapsibleCodeBlock };
});

const serverReloadState = (): ReloadState => 'idle';
const serverOutcome = (): StaleBuildOutcome | undefined => undefined;

export function ErrorPage(): React.JSX.Element {
  const error = useRouteError();
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const isModuleLoadFailure = isStaleModuleError(error);
  /* TAU-UI-6: the recovery owns a module load failure, its outcome and its report; this page only
   * shows the outcome, which changes when the server names this build again (genuine after all). */
  const outcome = useSyncExternalStore(subscribeStaleBuildOutcomes, () => readStaleBuildOutcome(error), serverOutcome);
  const staleOutcome = isModuleLoadFailure ? outcome : undefined;
  // The recovery's own reload: the button waits while it is pending and returns once it stalls.
  const reloadState = useSyncExternalStore(subscribeReloadState, readReloadState, serverReloadState);
  const { supersedingBuildId, isRolledBack } = useSupersedingBuild();
  const isExplained = staleOutcome === 'reloading' || staleOutcome === 'superseded';
  // This screen is the reload prompt while it shows; the floating banner would only repeat it.
  useReloadPromptOwner(isExplained);
  // Each other error is reported once, however often the effect runs again (a new `analytics`, a remount).
  const reportedError = useRef<unknown>(undefined);

  useEffect(() => {
    if (isModuleLoadFailure) {
      // async-iife: bootstrap -- an effect cannot await; the outcome arrives through the subscription.
      void recoverFromStaleBuild(error);
      return;
    }
    // Don't report 404 errors to analytics - they're expected user behavior
    if (reportedError.current === error || (isRouteErrorResponse(error) && error.status === 404)) {
      return;
    }
    let captured: Error | undefined;
    let toErrorTracker = true;
    if (isRouteErrorResponse(error)) {
      captured = new Error(`${error.status} ${error.statusText}`);
      captured.name = 'route_error';
      toErrorTracker = error.status >= 500;
    } else if (error instanceof Error) {
      captured = error;
    }
    if (captured === undefined) {
      return;
    }
    reportedError.current = error;
    analytics.captureException(captured, { context: { component: 'ErrorPage' } });
    if (toErrorTracker) {
      void reportUiError(captured);
    }
  }, [error, analytics, isModuleLoadFailure]);

  const goBack = (): void => {
    void navigate(-1);
  };

  const refreshPage = (): void => {
    globalThis.location.reload();
  };

  // Handle 404 errors with the dedicated PageNotFound component
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <PageNotFound />;
  }

  if (isRouteErrorResponse(error)) {
    return (
      <div className='flex min-h-full flex-1 flex-col items-center justify-center gap-6 px-4 py-8'>
        <div className='flex flex-col items-center gap-3 text-center'>
          <div className='flex size-12 items-center justify-center rounded-full bg-feature/10'>
            <AlertCircle className='size-6 text-feature' />
          </div>
          <h1 className='text-lg font-semibold text-foreground'>
            {error.status} {error.statusText}
          </h1>
          {error.data ? <p className='max-w-sm text-sm text-muted-foreground'>{error.data}</p> : undefined}
          <p className='max-w-xs text-sm text-pretty text-muted-foreground'>
            Our team has been notified and will investigate shortly.
          </p>
        </div>
        <div className='flex flex-wrap items-center justify-center gap-2'>
          <Button variant='default' size='sm' className='gap-2' onClick={goBack}>
            <ArrowLeft className='size-4' />
            Go Back
          </Button>
          <Button variant='outline' size='sm' className='gap-2' onClick={refreshPage}>
            <RefreshCcw className='size-4' />
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

  if (isModuleLoadFailure && staleOutcome === undefined) {
    return (
      <div className='flex min-h-full flex-1 flex-col items-center justify-center gap-3 px-4 py-8'>
        <LoaderCircle className='size-6 spin-glyph text-muted-foreground' />
        <p role='status' className='text-sm text-muted-foreground'>
          Checking for a newer version of Tau…
        </p>
      </div>
    );
  }

  if (isExplained) {
    return (
      <div className='flex min-h-full flex-1 flex-col items-center justify-center gap-6 px-4 py-8'>
        <div className='flex flex-col items-center gap-3 text-center'>
          <div className='flex size-12 items-center justify-center rounded-full bg-feature/10'>
            <RefreshCcw className='size-6 text-feature' />
          </div>
          <h1 className='text-lg font-semibold text-foreground'>
            {isRolledBack ? 'Tau has been replaced' : 'Tau has been updated'}
          </h1>
          <p className='max-w-xs text-sm text-pretty text-muted-foreground'>
            {describeSupersession(supersedingBuildId)}
          </p>
        </div>
        <Button
          variant='default'
          size='sm'
          className='gap-2'
          disabled={staleOutcome === 'reloading' && reloadState === 'pending'}
          onClick={refreshPage}
        >
          <RefreshCcw className='size-4' />
          Reload
        </Button>
      </div>
    );
  }

  if (error instanceof Error) {
    return (
      <div className='flex min-h-full flex-1 flex-col items-center justify-center px-4 py-8'>
        <div className='flex w-full max-w-lg flex-col items-center gap-4 p-6 text-center'>
          {/* Error Icon */}
          <div className='flex size-12 items-center justify-center rounded-full bg-feature/10'>
            <AlertCircle className='size-6 text-feature' />
          </div>

          {/* Error Title */}
          <h1 className='text-lg font-semibold text-foreground'>Something went wrong</h1>

          {/* Reassurance Message */}
          <p className='max-w-xs text-sm text-pretty text-muted-foreground'>
            Our team has been notified of the error and will investigate it shortly.
          </p>

          {/* A module that failed to load must not be answered by loading another one. */}
          {error.stack && !isModuleLoadFailure ? (
            <Suspense
              fallback={
                <div className='w-full rounded-md border border-border bg-muted/30 p-3 text-left'>
                  <p className='text-xs font-medium text-muted-foreground'>{error.message}</p>
                </div>
              }
            >
              <CollapsibleCodeBlock
                language='bash'
                title={error.message}
                text={error.stack}
                collapsedLineCount={3}
                className='text-left text-muted-foreground'
                containerClassName='w-full'
              />
            </Suspense>
          ) : (
            <div className='w-full rounded-md border border-border bg-muted/30 p-3 text-left'>
              <p className='text-xs font-medium text-muted-foreground'>{error.message}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className='flex flex-wrap items-center justify-center gap-2'>
            <Button variant='default' size='sm' className='gap-2' onClick={goBack}>
              <ArrowLeft className='size-4' />
              Go Back
            </Button>
            <Button variant='outline' size='sm' className='gap-2' onClick={refreshPage}>
              <RefreshCcw className='size-4' />
              Reload Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <h1>Unknown Error</h1>;
}
