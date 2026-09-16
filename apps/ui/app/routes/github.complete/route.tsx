import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { githubConnections } from '#lib/github-connections.js';

export default function GithubConnectionCompleteRoute(): React.JSX.Element {
  const [parameters] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const attemptId = parameters.get('attempt');
  const returnTo = parameters.get('returnTo') ?? '/import';
  const desktopPolling = parameters.get('mode') === 'desktop-poll';

  useEffect(() => {
    if (desktopPolling) {
      return;
    }
    if (attemptId === null) {
      setError('This GitHub connection return is incomplete.');
      return;
    }
    let active = true;
    const complete = async (): Promise<void> => {
      try {
        await githubConnections.complete(attemptId);
        if (active) {
          await navigate(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/import', {
            replace: true,
          });
        }
      } catch (error) {
        if (active) {
          setError(error instanceof Error ? error.message : 'GitHub could not be connected.');
        }
      }
    };
    // async-iife: bootstrap -- effect cleanup fences completion from an unmounted route.
    void complete();
    return () => {
      active = false;
    };
  }, [attemptId, desktopPolling, navigate, returnTo]);

  return (
    <main className='flex min-h-full items-center justify-center p-6'>
      <div
        role={error === undefined ? 'status' : 'alert'}
        aria-busy={!desktopPolling && error === undefined}
        className='max-w-md text-center'
      >
        <h1 className='text-xl font-semibold'>
          {desktopPolling
            ? 'GitHub connected'
            : error === undefined
              ? 'Connecting GitHub…'
              : 'GitHub connection failed'}
        </h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          {desktopPolling
            ? 'Return to the Tau desktop app to continue.'
            : (error ?? 'You will return to Tau automatically.')}
        </p>
      </div>
    </main>
  );
}
