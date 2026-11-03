import { AlertCircle, ArrowLeft, LoaderCircle, RefreshCcw, WifiOff } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useSyncExternalStore } from 'react';
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { chatObservationConflict, quarantineChatObservation } from '#lib/chat-observation-guard.js';
import { PageNotFound } from '#components/page-not-found.js';
import { reportUiError } from '#lib/error-reporting.js';
import { isTransientNetworkFailure } from '#lib/network-failure.js';
import { isWeakKey } from '#lib/weak-key.js';
import { describeSupersession, readServerVerdict, subscribeServerVerdict } from '#filesystem/build-skew.js';
import type { ServerVerdict } from '#filesystem/build-skew.js';
import { useSupersedingBuild } from '#hooks/use-superseding-build.js';
import { useReloadPromptOwner } from '#components/nav/browser-update.js';
import {
  isStaleModuleError,
  readReloadState,
  readStaleBuildOutcome,
  recoverFromStaleBuild,
  showsUpdatePrompt,
  subscribeReloadState,
  subscribeStaleBuildOutcomes,
} from '#lib/stale-build-recovery.js';
import type { ReloadState, StaleBuildOutcome } from '#lib/stale-build-recovery.js';

const CollapsibleCodeBlock = lazy(async () => {
  const m = await import('#components/ui/collapsible-code-block.js');
  return { default: m.CollapsibleCodeBlock };
});

const serverReloadState = (): ReloadState => 'idle';
const serverVerdict = (): ServerVerdict => 'unknown';

/** The `Error` reported for each route error response, so a remount reports the same value again. */
const reportedForResponse = new WeakMap<WeakKey, Error>();

/**
 * The value to report for an error the route caught: the error itself, or one `Error` per route
 * error response (named `route_error`).
 */
const toReported = (error: unknown): Error | undefined => {
  if (isRouteErrorResponse(error)) {
    let reported = isWeakKey(error) ? reportedForResponse.get(error) : undefined;
    if (reported === undefined) {
      reported = new Error(`${error.status} ${error.statusText}`);
      reported.name = 'route_error';
      if (isWeakKey(error)) {
        reportedForResponse.set(error, reported);
      }
    }
    return reported;
  }
  return error instanceof Error ? error : undefined;
};
const serverOutcome = (): StaleBuildOutcome | undefined => undefined;

export function ErrorPage(): React.JSX.Element {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();
  const isNetworkFailure = isTransientNetworkFailure(error);
  const observationConflict = chatObservationConflict(error);
  const isModuleLoadFailure = isStaleModuleError(error);
  /* TAU-UI-6: the recovery owns a module load failure, its outcome and its report; this page only
   * shows it, decided once, with the live verdict below choosing the prompt or the error. */
  const outcome = useSyncExternalStore(subscribeStaleBuildOutcomes, () => readStaleBuildOutcome(error), serverOutcome);
  const staleOutcome = isModuleLoadFailure ? outcome : undefined;
  // The recovery's own reload: the button waits while it is pending and returns once it stalls.
  const reloadState = useSyncExternalStore(subscribeReloadState, readReloadState, serverReloadState);
  const { supersedingBuildId, isRolledBack } = useSupersedingBuild();
  const verdict = useSyncExternalStore(subscribeServerVerdict, readServerVerdict, serverVerdict);
  /* The prompt follows the live verdict: it shows while a deploy explains the failure and the server
   * has not named this build since, or once the server confirms another build, and gives way to the
   * error itself when the server confirms this build live (a rollback ended). */
  const isExplained = isModuleLoadFailure && showsUpdatePrompt(staleOutcome, verdict);
  // This screen is the reload prompt while it shows; the floating banner would only repeat it.
  useReloadPromptOwner(isExplained);

  const conflictingChatId = observationConflict?.chatId;
  useEffect(() => {
    if (conflictingChatId !== undefined) {
      quarantineChatObservation(conflictingChatId);
    }
  }, [conflictingChatId]);

  useEffect(() => {
    if (isModuleLoadFailure) {
      // async-iife: bootstrap -- an effect cannot await; the outcome arrives through the subscription.
      void recoverFromStaleBuild(error);
      return;
    }
    // A route error response under 500 (a 404, a refusal) is expected; the error tracker hears the rest, once
    // (`reportUiError` deduplicates, so a remount or the root's `onCaughtError` reporting it first costs nothing).
    // A module load failure is the recovery's to report.
    if (isRouteErrorResponse(error) && error.status < 500) {
      return;
    }
    const captured = toReported(error);
    if (captured !== undefined) {
      void reportUiError(captured);
    }
  }, [error, isModuleLoadFailure]);

  /* Navigating to the location that failed runs its loaders again; a device coming back online retries by itself. */
  const failedLocation = `${location.pathname}${location.search}${location.hash}`;
  const retryNavigation = useCallback((): void => {
    void navigate(failedLocation, { replace: true });
  }, [navigate, failedLocation]);
  useEffect(() => {
    if (!isNetworkFailure) {
      return undefined;
    }
    globalThis.addEventListener('online', retryNavigation);
    return () => {
      globalThis.removeEventListener('online', retryNavigation);
    };
  }, [isNetworkFailure, retryNavigation]);

  const goBack = (): void => {
    if (observationConflict !== undefined) {
      quarantineChatObservation(observationConflict.chatId);
      void navigate('/', { replace: true });
      return;
    }
    void navigate(-1);
  };

  const refreshPage = (): void => {
    if (observationConflict !== undefined) {
      quarantineChatObservation(observationConflict.chatId);
    }
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

  // TAU-UI-E: a request that never reached the server is a connection problem to retry, not a crash to investigate.
  if (isNetworkFailure) {
    return (
      <div className='flex min-h-full flex-1 flex-col items-center justify-center gap-6 px-4 py-8'>
        <div className='flex flex-col items-center gap-3 text-center'>
          <div className='flex size-12 items-center justify-center rounded-full bg-feature/10'>
            <WifiOff className='size-6 text-feature' />
          </div>
          <h1 className='text-lg font-semibold text-foreground'>Couldn’t reach Tau</h1>
          <p className='max-w-xs text-sm text-pretty text-muted-foreground'>
            Check your connection, then try again. Tau retries when your device is back online.
          </p>
        </div>
        <div className='flex flex-wrap items-center justify-center gap-2'>
          <Button variant='default' size='sm' className='gap-2' onClick={retryNavigation}>
            <RefreshCcw className='size-4' />
            Try Again
          </Button>
          <Button variant='outline' size='sm' className='gap-2' onClick={goBack}>
            <ArrowLeft className='size-4' />
            Go Back
          </Button>
        </div>
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
