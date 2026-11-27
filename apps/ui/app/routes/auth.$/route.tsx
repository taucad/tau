import { Heading } from '@taucad/ui/components/heading';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { MetaFunction } from 'react-router';
import { useSession } from '@better-auth-ui/react';
import { Auth } from '#components/auth/auth.js';
import { AuthEmailDraftProvider } from '#components/auth/auth-email-draft.js';
import { AuthShowcase } from '#components/auth/auth-showcase.js';
import { MagicLinkVerify } from '#components/auth/magic-link-verify.js';
import { sanitizeVerifyEmailRedirectTo, VerifyEmail } from '#components/auth/verify-email.js';
import { TauWordmark } from '@taucad/ui-kit/icons/tau-wordmark';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import type { Handle } from '#types/matches.types.js';
import { setEntryPreference } from '@taucad/ui-core/lib/entry-preference';
import { authClient } from '#lib/auth-client.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { desktopContinuationPath, readDesktopAuthorization } from '#lib/desktop-oauth.js';
import type { DesktopSignInOutcome, ShellAuthHandoff } from '#providers/auth-provider.js';
import {
  authLocalization,
  callDesktopShell,
  startDesktopSignIn,
  useDesktopSignInOutcome,
  useDesktopSignInStatus,
  useShellAuthHandoff,
} from '#providers/auth-provider.js';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';

export const handle: Handle = {
  enablePageWrapper: false,
};

/** Each auth page's name, for its document title and the session check's heading. */
const authPageTitles: Readonly<Record<string, string>> = {
  'sign-in': authLocalization.auth.signIn,
  'sign-up': authLocalization.auth.signUp,
  'magic-link': authLocalization.auth.signIn,
  'magic-link/verify': 'Magic link',
  'forgot-password': authLocalization.auth.forgotPassword,
  'reset-password': authLocalization.auth.resetPassword,
  'verify-email': authLocalization.auth.verifyEmail,
  'sign-out': authLocalization.auth.signOut,
};

const authPageTitle = (segment: string | undefined): string => authPageTitles[segment ?? ''] ?? 'Account';

export const meta: MetaFunction = ({ params }) => [{ title: `${authPageTitle(params['*'])} · Tau` }];

/**
 * What the desktop window shows once the shell owns the flow.
 *
 * Signing out is immediate and needs no browser, so only the sign-in family
 * gets the handoff copy and its retry. A missing bridge never falls back to the
 * embedded web form.
 *
 * @param handoff - The shell-owned destination and whether its bridge exists.
 * @returns The handoff panel.
 */
function ShellHandoff({ handoff }: { readonly handoff: ShellAuthHandoff }): React.JSX.Element | undefined {
  if (!handoff.isBridgeAvailable) {
    return (
      <div className='w-full max-w-md text-center'>
        <Heading level={1} variant='title'>
          Sign-in is unavailable
        </Heading>
        <p className='mt-2 text-sm text-muted-foreground'>
          Tau could not reach the desktop app&apos;s sign-in service. Restart Tau and try again.
        </p>
      </div>
    );
  }

  if (handoff.action === 'signOut') {
    return undefined;
  }

  return <DesktopSignInPanel />;
}

/** What each ended attempt says, and whether it offers another account. */
const endedAttemptCopy: Readonly<
  Record<Exclude<DesktopSignInOutcome, 'signed-in'>, { readonly title: string; readonly detail: string }>
> = {
  canceled: {
    title: 'Sign-in canceled',
    detail: 'Tau Desktop was not signed in.',
  },
  expired: {
    title: 'Sign-in timed out',
    detail: 'The browser did not finish signing in within ten minutes.',
  },
  error: {
    title: "Couldn't sign in",
    detail: 'Something went wrong while signing in. Try again.',
  },
};

/**
 * The desktop window's side of a sign-in (DSI-4): waiting for the browser (Copy link, Open browser again, Cancel
 * sign-in), finishing, signed in, ended (canceled, timed out, failed) and offline.
 *
 * @returns The panel.
 */
function DesktopSignInPanel(): React.JSX.Element {
  const status = useDesktopSignInStatus();
  const outcome = useDesktopSignInOutcome();
  const isOnline = useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
  const attempt = status?.attempt;
  const retry = (
    <div className='mt-6 flex flex-wrap justify-center gap-2'>
      <Button
        onClick={() => {
          void startDesktopSignIn('consent');
        }}
      >
        Sign in
      </Button>
      <Button
        variant='outline'
        onClick={() => {
          void startDesktopSignIn('different-account');
        }}
      >
        Use a different account
      </Button>
    </div>
  );

  if (outcome === 'signed-in') {
    return (
      <div className='w-full max-w-md text-center'>
        <Heading level={1} variant='title'>
          Signed in
        </Heading>
        {status?.email === undefined ? undefined : (
          <p className='mt-2 text-sm text-muted-foreground'>Tau Desktop is signed in as {status.email}.</p>
        )}
      </div>
    );
  }

  if (attempt?.phase === 'finishing') {
    return (
      <div className='w-full max-w-md text-center' role='status'>
        <Heading level={1} variant='title'>
          Finishing sign-in…
        </Heading>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className='w-full max-w-md text-center'>
        <Heading level={1} variant='title'>
          You&apos;re offline
        </Heading>
        <p className='mt-2 text-sm text-muted-foreground'>Connect to the internet, then sign in.</p>
        {attempt === undefined ? retry : undefined}
      </div>
    );
  }

  if (outcome !== undefined && attempt === undefined) {
    const copy = endedAttemptCopy[outcome];
    return (
      <div className='w-full max-w-md text-center'>
        <Heading level={1} variant='title'>
          {copy.title}
        </Heading>
        <p className='mt-2 text-sm text-muted-foreground'>{copy.detail}</p>
        {retry}
      </div>
    );
  }

  return (
    <div className='w-full max-w-md text-center'>
      <Heading level={1} variant='title'>
        Continue in your browser
      </Heading>
      <p className='mt-2 text-sm text-muted-foreground'>
        {attempt?.browserFailed
          ? "Tau couldn't open your browser. Copy the link and open it in a browser on this computer."
          : 'Tau signs you in through your browser, then hands the sign-in back to this window.'}
      </p>
      <div className='mt-6 flex flex-wrap justify-center gap-2'>
        <Button
          variant='outline'
          disabled={attempt === undefined}
          onClick={() => {
            if (attempt !== undefined) {
              void navigator.clipboard.writeText(attempt.url);
            }
          }}
        >
          Copy link
        </Button>
        <Button
          variant='outline'
          onClick={() => {
            void startDesktopSignIn('consent');
          }}
        >
          Open browser again
        </Button>
        <Button
          variant='ghost'
          disabled={attempt === undefined}
          onClick={() => {
            const bridge = globalThis.window.tauAuth;
            if (bridge) {
              void callDesktopShell(bridge.cancelSignIn);
            }
          }}
        >
          Cancel sign-in
        </Button>
      </div>
    </div>
  );
}

export default function AuthPage(): React.JSX.Element {
  const desktopTarget = isDesktopTarget();
  const { '*': segment } = useParams();
  const shellHandoff = useShellAuthHandoff(`/auth/${segment ?? ''}`);
  /* A session on a sign-in page continues to `redirectTo`: in the desktop window
     main only announces that the session changed, and a browser that is already
     signed in (e.g. `/auth/desktop` bouncing here) must not ask again. */
  const { data: session, isSuccess, isFetching, isError, refetch } = useSession(authClient);
  const [hasWaitExpired, setHasWaitExpired] = useState(false);
  const [shouldShowForm, setShouldShowForm] = useState(false);
  const [searchParameters, setSearchParameters] = useSearchParams();
  const search = searchParameters.toString();
  const navigate = useNavigate();
  /* Tau Desktop's OAuth sign-in (DSI-3): the provider sends the browser here with a signed request when no one is
     signed in, or when "Use a different account" asked for `prompt=login`. The form shows even over a session, and
     every sign-in (password, an emailed link, a provider round trip) returns through `redirectTo` to the consent page,
     which asks the provider again with the same signed request. */
  const desktopAuthorization = useMemo(() => readDesktopAuthorization(search), [search]);
  const desktopContinuation =
    desktopAuthorization === undefined ? undefined : desktopContinuationPath(desktopAuthorization);
  useEffect(() => {
    if (desktopContinuation !== undefined && searchParameters.get('redirectTo') !== desktopContinuation) {
      setSearchParameters(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('redirectTo', desktopContinuation);
          return next;
        },
        { replace: true },
      );
    }
  }, [desktopContinuation, searchParameters, setSearchParameters]);
  const requestedDestination = sanitizeVerifyEmailRedirectTo(searchParameters.get('redirectTo') ?? undefined);
  const destinationPath = requestedDestination.split(/[?#]/u)[0]?.replace(/\/+$/u, '');
  const redirectTo =
    destinationPath === '/auth/sign-in' || destinationPath === '/auth/sign-up' ? '/' : requestedDestination;
  const isSignInPage =
    shellHandoff === undefined ? segment === 'sign-in' || segment === 'sign-up' : shellHandoff.action === 'signIn';
  /* A desktop request asking for `login` wants a fresh sign-in: a session older than the request is not one. */
  const isStaleForDesktop =
    desktopAuthorization?.prompts.includes('login') === true &&
    session !== undefined &&
    session !== null &&
    (desktopAuthorization.issuedAt === undefined ||
      new Date(session.session.createdAt).getTime() < desktopAuthorization.issuedAt);
  const isSignedIn = isSignInPage && Boolean(session) && !isStaleForDesktop;
  useEffect(() => {
    // Preserve explicit app intent before OAuth leaves this origin or a magic
    // link finishes. An older website choice must not intercept its callback.
    if (!desktopTarget && (isSignInPage || segment === 'magic-link/verify' || segment === 'verify-email')) {
      setEntryPreference('app');
    }
  }, [desktopTarget, isSignInPage, segment]);
  useEffect(() => {
    if (isSignedIn) {
      if (!desktopTarget) {
        setEntryPreference('app');
      }
      void navigate(redirectTo, { replace: true });
    }
  }, [desktopTarget, isSignedIn, navigate, redirectTo]);
  useEffect(() => {
    if (isSuccess && !isFetching && (!session || isStaleForDesktop)) {
      setShouldShowForm(true);
    }
  }, [isSuccess, isFetching, session, isStaleForDesktop]);
  useEffect(() => {
    if (!isSignInPage || shouldShowForm || hasWaitExpired || shellHandoff !== undefined) {
      return;
    }
    // Milliseconds. Give a stalled session request a visible recovery path.
    const sessionTimer = setTimeout(() => {
      setHasWaitExpired(true);
    }, 5000);
    return () => {
      clearTimeout(sessionTimer);
    };
  }, [hasWaitExpired, isSignInPage, shouldShowForm, shellHandoff]);
  const shouldContinue = isSignInPage && (isSignedIn || !shouldShowForm);
  if (shellHandoff === undefined && shouldContinue) {
    return (
      <main className='flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 text-foreground'>
        <TauWordmark className='h-7 text-primary' />
        {/* The form's own title is the heading once it shows; until then the page still names itself. */}
        <h1 className='sr-only'>{authPageTitle(segment)}</h1>
        <div className='w-full max-w-md text-center'>
          {!isSignedIn && (isError || hasWaitExpired) ? (
            <>
              <p role='alert'>Couldn&apos;t check that you&apos;re signed in.</p>
              <div className='mt-4 flex justify-center gap-2'>
                <Button
                  variant='outline'
                  onClick={() => {
                    setHasWaitExpired(false);
                    void refetch();
                  }}
                >
                  Retry
                </Button>
                <Button
                  onClick={() => {
                    setShouldShowForm(true);
                  }}
                >
                  Continue to sign in
                </Button>
              </div>
            </>
          ) : (
            <p role='status' aria-label='Opening Tau' aria-busy='true' className='text-sm text-muted-foreground'>
              Opening Tau…
            </p>
          )}
        </div>
      </main>
    );
  }
  return (
    <AuthEmailDraftProvider>
      {/* The form is the page's main content; the sign-in check above is a `<main>` too. */}
      <main className='grid min-h-svh lg:grid-cols-2'>
        <div className={cn('flex flex-col gap-4 p-6 md:p-10', desktopTarget && 'gap-0 p-0 md:p-0')}>
          <div
            className={cn(
              'flex justify-center gap-2 md:justify-start',
              // Shell-less window: this row overlaps the desktop drag band.
              desktopTarget &&
                'h-9 shrink-0 items-center justify-start pl-(--desktop-titlebar-inset) md:justify-start [&_a]:[app-region:no-drag]',
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild className='flex items-center gap-2 font-medium'>
                <Link to='/' aria-label='Go home' className={cn(desktopTarget && 'h-7')}>
                  <TauWordmark className={cn('h-7 text-primary', desktopTarget && 'h-5')} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side='right'>Go home</TooltipContent>
            </Tooltip>
          </div>
          <div className={cn('flex flex-1 items-center justify-center', desktopTarget && 'p-6 md:p-10')}>
            {shellHandoff === undefined ? (
              segment === 'verify-email' ? (
                <VerifyEmail className='w-full max-w-md' />
              ) : segment === 'magic-link/verify' ? (
                <MagicLinkVerify className='w-full max-w-md' />
              ) : (
                <Auth path={segment} className='w-full max-w-md' />
              )
            ) : (
              <ShellHandoff handoff={shellHandoff} />
            )}
          </div>
        </div>
        <div className='hidden lg:block'>
          <AuthShowcase />
        </div>
      </main>
    </AuthEmailDraftProvider>
  );
}
