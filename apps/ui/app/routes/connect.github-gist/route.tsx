import { useAuthenticate } from '@better-auth-ui/react';
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';

import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { Spinner } from '#components/ui/spinner.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { authClient } from '#lib/auth-client.js';
import { connectGithubGist, parseGithubGistAuthorizationReturn } from '#lib/share-providers.js';
import type { GithubGistAuthorizationReturn } from '#lib/share-providers.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  enablePageWrapper: false,
};

const outcomeTitle: Record<GithubGistAuthorizationReturn['outcome'], string> = {
  returned: 'Gist access granted',
  cancelled: 'Gist access was not granted',
  failed: 'GitHub authorization could not be completed',
};

/**
 * Web page that grants Gist access to the signed-in Tau account (D16c).
 *
 * The desktop app opens this page in the system browser rather than running
 * the grant in its own window: Better Auth's OAuth `state` cookie has to live
 * in the same browser GitHub's callback returns to. The desktop then watches
 * the account for the new scope, so this page only has to say how it went.
 * It works the same when opened on the web.
 *
 * Nothing is requested on mount; the grant starts from the button, so a
 * navigation to this URL alone never sends anyone to GitHub.
 *
 * @returns The Gist access card.
 */
export default function ConnectGithubGistRoute(): React.JSX.Element {
  const { pathname, search } = useLocation();
  const authorizationReturn = useMemo(() => parseGithubGistAuthorizationReturn(search), [search]);
  // Redirects to /auth/sign-in?redirectTo=<this URL> when signed out, so the person comes back here.
  const { data: session } = useAuthenticate(authClient);
  const { signOut } = useAuthLinks({ redirectTo: pathname });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  const allow = useCallback(async (): Promise<void> => {
    setStarting(true);
    setError(undefined);
    try {
      /* The bare path, so a retry never carries the previous return's `error`. */
      const started = await connectGithubGist({
        returnUrl: `${globalThis.location.origin}${pathname}`,
        surface: 'share-page',
      });
      /* Only a redirect leaves this page; anything else (opened inside the desktop app) must not spin forever (R-U8). */
      if (started !== 'redirect') {
        setStarting(false);
      }
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'GitHub authorization could not be started.');
      setStarting(false);
    }
  }, [pathname]);

  /* Pending or signed out: `useAuthenticate` is already sending a signed-out visitor to sign-in. */
  if (!session) {
    return (
      <div className='flex min-h-svh items-center justify-center p-6'>
        <Card className='w-full max-w-sm' role='status' aria-busy='true'>
          <CardHeader>
            <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
              <Spinner className='size-5' />
            </div>
            <CardTitle className='text-xl font-semibold'>Checking your Tau account</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const outcome = authorizationReturn?.outcome;
  const granted = outcome === 'returned';

  return (
    <div className='flex min-h-svh items-center justify-center p-6'>
      <Card
        className='w-full max-w-sm'
        role={outcome === undefined ? undefined : outcome === 'failed' ? 'alert' : 'status'}
      >
        <CardHeader>
          <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
            {granted ? (
              <CircleCheck className='size-5' aria-hidden='true' />
            ) : outcome === undefined ? (
              <SvgIcon id='github' className='size-5' aria-hidden='true' />
            ) : (
              <CircleAlert className='size-5' aria-hidden='true' />
            )}
          </div>
          <CardTitle className='text-xl font-semibold'>
            {outcome === undefined ? 'Allow Gist access' : outcomeTitle[outcome]}
          </CardTitle>
          <CardDescription>
            {granted ? (
              'You can return to Tau.'
            ) : authorizationReturn?.failure === undefined ? (
              <>
                Tau shares projects as GitHub Gists. This adds Gist access to the Tau account{' '}
                <strong className='break-all'>{session.user.email}</strong>.
              </>
            ) : (
              authorizationReturn.failure
            )}
          </CardDescription>
        </CardHeader>

        {granted ? undefined : (
          <CardContent className='flex flex-col gap-2'>
            {error === undefined ? undefined : (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            )}
            <Button
              className='w-full'
              disabled={starting}
              onClick={() => {
                // async-iife: user gesture -- a click handler cannot await; `allow` settles every branch into state.
                void allow();
              }}
            >
              {starting ? (
                <Loader2 className='size-4 animate-spin' aria-hidden='true' />
              ) : (
                <SvgIcon id='github' className='size-4' aria-hidden='true' />
              )}
              Allow Gist access
            </Button>
            <Button asChild variant='ghost' className='w-full'>
              <Link to={signOut}>Use a different Tau account</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
