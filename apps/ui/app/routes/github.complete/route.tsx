import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import {
  GithubRequestError,
  githubConnectReturn,
  githubConnections,
  githubErrorMessage,
  githubSetupReturn,
  safeReturnPath,
} from '#lib/github-connections.js';

/** What the page says; `code` is the refusal's, when it named one. */
type Outcome = Readonly<{ title: string; detail: string; failed: boolean; code?: string | undefined }>;

/*
 * R24: an attempt lives 600 s. One that outlived its start or completion record
 * is not wrong, only late, so the page starts a fresh one instead of only
 * pointing back.
 */
const expiredAttemptCodes: ReadonlySet<string> = new Set(['GITHUB_CALLBACK_EXPIRED', 'GITHUB_COMPLETION_EXPIRED']);

export default function GithubConnectionCompleteRoute(): React.JSX.Element {
  const [parameters] = useSearchParams();
  const navigate = useNavigate();
  const attemptId = parameters.get('attempt');
  /* An expired attempt's callback names no return: its start record, which held it, is gone. */
  const requestedReturn = safeReturnPath(parameters.get('returnTo') ?? undefined);
  const returnTo = requestedReturn ?? '/import';
  const desktopPolling = parameters.get('mode') === 'desktop-poll';
  /* D7: the API redirects every callback failure here as `?error=<CODE>`. */
  const callbackError = parameters.get('error');
  /* D16d: GitHub's App Setup URL redirect after an install or access change carries no attempt. */
  const setupReturn = attemptId === null && parameters.has('setup_action');
  const [outcome, setOutcome] = useState<Outcome | undefined>(() => {
    if (callbackError !== null) {
      return {
        title: 'GitHub connection failed',
        detail: desktopPolling
          ? `${githubErrorMessage({ code: callbackError })} Return to the Tau desktop app to try again.`
          : githubErrorMessage({ code: callbackError }),
        failed: true,
        code: callbackError,
      };
    }
    if (desktopPolling) {
      return { title: 'GitHub connected', detail: 'Return to the Tau desktop app to continue.', failed: false };
    }
    if (attemptId === null && !setupReturn) {
      return { title: 'GitHub connection failed', detail: 'This GitHub return is incomplete.', failed: true };
    }
    return undefined;
  });
  const [restarting, setRestarting] = useState(false);
  /* R10: the setup return is taken once per page, so an effect that runs again (Strict Mode) still has it. */
  const setupPath = useRef<{ path: string | undefined }>(undefined);

  useEffect(() => {
    if (outcome !== undefined) {
      return;
    }
    if (setupReturn) {
      /* Session storage is read here, not during render, so the server render matches the first client one. */
      setupPath.current ??= { path: githubSetupReturn.take() };
      const { path } = setupPath.current;
      if (path === undefined) {
        // oxlint-disable-next-line react/set-state-in-effect -- the remembered return exists only in this tab's storage.
        setOutcome({
          title: 'GitHub access updated',
          detail: 'Return to Tau and refresh the repository list to see the change.',
          failed: false,
        });
      } else {
        void navigate(path, { replace: true });
      }
      return;
    }
    if (attemptId === null) {
      return;
    }
    let active = true;
    const complete = async (): Promise<void> => {
      try {
        await githubConnections.complete(attemptId);
        if (active) {
          await navigate(returnTo, { replace: true });
        }
      } catch (error) {
        if (active) {
          setOutcome({
            title: 'GitHub connection failed',
            detail: githubErrorMessage(error),
            failed: true,
            code: error instanceof GithubRequestError ? error.code : undefined,
          });
        }
      }
    };
    // async-iife: bootstrap -- effect cleanup fences completion from an unmounted route.
    void complete();
    return () => {
      active = false;
    };
  }, [attemptId, navigate, outcome, returnTo, setupReturn]);

  const connectAgain = async (): Promise<void> => {
    setRestarting(true);
    try {
      const started = await githubConnections.start(requestedReturn ?? githubConnectReturn.read() ?? '/import');
      globalThis.location.assign(started.authorizationUrl);
    } catch (error) {
      setOutcome({ title: 'GitHub connection failed', detail: githubErrorMessage(error), failed: true });
      setRestarting(false);
    }
  };
  const offersConnectAgain = !desktopPolling && outcome?.code !== undefined && expiredAttemptCodes.has(outcome.code);

  return (
    <main className='flex min-h-full items-center justify-center p-6'>
      <div
        role={outcome?.failed === true ? 'alert' : 'status'}
        aria-busy={outcome === undefined}
        className='flex max-w-md flex-col items-center gap-4 text-center'
      >
        <div>
          <h1 className='text-xl font-semibold'>{outcome?.title ?? 'Connecting GitHub…'}</h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            {outcome?.detail ?? 'You will return to Tau automatically.'}
          </p>
        </div>
        {outcome === undefined || desktopPolling ? undefined : (
          <div className='flex flex-wrap justify-center gap-2'>
            {offersConnectAgain ? (
              <Button
                disabled={restarting}
                onClick={() => {
                  void connectAgain();
                }}
              >
                Connect GitHub again
              </Button>
            ) : undefined}
            <Button asChild variant='outline'>
              <Link to={returnTo}>Back to Tau</Link>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
