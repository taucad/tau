import { AlertCircle, ArrowLeft, LoaderCircle, RefreshCcw } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
  recoverFromStaleBuild,
  subscribeReloadState,
} from '#lib/stale-build-recovery.js';
import type { ReloadState, StaleBuildOutcome } from '#lib/stale-build-recovery.js';

const CollapsibleCodeBlock = lazy(async () => {
  const m = await import('#components/ui/collapsible-code-block.js');
  return { default: m.CollapsibleCodeBlock };
});

const serverReloadState = (): ReloadState => 'idle';

export function ErrorPage(): React.JSX.Element {
  const error = useRouteError();
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const isModuleLoadFailure = isStaleModuleError(error);
  const [triaged, setTriaged] = useState<{ readonly error: unknown; readonly outcome: StaleBuildOutcome }>();
  // An outcome belongs to the error it was decided for; a new error starts its own check.
  const staleOutcome = triaged !== undefined && triaged.error === error ? triaged.outcome : undefined;
  // The recovery's own reload: the button waits while it is pending and returns once it stalls.
  const reloadState = useSyncExternalStore(subscribeReloadState, readReloadState, serverReloadState);
  const { supersedingBuildId, isRolledBack } = useSupersedingBuild();
  // This screen is the reload prompt while it shows; the floating banner would only repeat it.
  useReloadPromptOwner(staleOutcome === 'reloading' || staleOutcome === 'superseded');
  // Each failure is reported once, however often the effect runs again (a new `analytics`, a remount of the same error).
  const reportedError = useRef<unknown>(undefined);

  useEffect(() => {
    const reportOnce = (captured: Error, toErrorTracker: boolean): void => {
      if (reportedError.current === error) {
        return;
      }
      reportedError.current = error;
      analytics.captureException(captured, { context: { component: 'ErrorPage' } });
      if (toErrorTracker) {
        void reportUiError(captured);
      }
    };

    // Don't report 404 errors to analytics - they're expected user behavior
    if (isRouteErrorResponse(error) && error.status === 404) {
      return;
    }

    if (isRouteErrorResponse(error)) {
      const routeError = new Error(`${error.status} ${error.statusText}`);
      routeError.name = 'route_error';
      reportOnce(routeError, error.status >= 500);
    } else if (error instanceof Error && isStaleModuleError(error)) {
      // TAU-UI-6: a deploy that replaced this page's chunks is not a bug. Report only a failure the live build has.
      let isCurrent = true;
      const triage = async (): Promise<void> => {
        const outcome = await recoverFromStaleBuild(error);
        if (!isCurrent) {
          return;
        }
        setTriaged((previous) =>
          previous !== undefined && previous.error === error && previous.outcome === outcome
            ? previous
            : { error, outcome },
        );
        if (outcome === 'current') {
          reportOnce(error, true);
        }
      };
      // async-iife: bootstrap -- an effect cannot await; the boundary renders the outcome once it settles.
      void triage();
      return () => {
        isCurrent = false;
      };
    } else if (error instanceof Error) {
      reportOnce(error, true);
    }
    return undefined;
  }, [error, analytics]);

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

  if (staleOutcome === 'reloading' || staleOutcome === 'superseded') {
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
