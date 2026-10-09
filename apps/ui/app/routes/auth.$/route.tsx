import { useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useSession } from '@better-auth-ui/react';
import { Auth } from '#components/auth/auth.js';
import { AuthEmailDraftProvider } from '#components/auth/auth-email-draft.js';
import { MagicLinkVerify } from '#components/auth/magic-link-verify.js';
import { sanitizeVerifyEmailRedirectTo, VerifyEmail } from '#components/auth/verify-email.js';
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import type { Handle } from '#types/matches.types.js';
import { DesignStory } from '#components/geometry/splash/design-story.js';
import { authClient } from '#lib/auth-client.js';
import { isDesktopTarget } from '#lib/build-target.js';
import type { ShellAuthHandoff } from '#providers/auth-provider.js';
import { callDesktopShell, useShellAuthHandoff } from '#providers/auth-provider.js';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';

export const handle: Handle = {
  enablePageWrapper: false,
};

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
        <h1 className='text-lg font-medium'>Sign-in is unavailable</h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          Tau could not reach the desktop app&apos;s sign-in service. Restart Tau and try again.
        </p>
      </div>
    );
  }

  if (handoff.action === 'signOut') {
    return undefined;
  }

  return (
    <div className='w-full max-w-md text-center'>
      <h1 className='text-lg font-medium'>Continue in your browser</h1>
      <p className='mt-2 text-sm text-muted-foreground'>
        Tau signs you in through your browser, then hands the session back to this window.
      </p>
      <Button
        className='mt-6'
        variant='outline'
        onClick={() => {
          const bridge = globalThis.window.tauAuth;
          if (bridge) {
            void callDesktopShell(bridge.signIn);
          }
        }}
      >
        Open my browser again
      </Button>
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
  const { data: session } = useSession(authClient);
  const [searchParameters] = useSearchParams();
  const navigate = useNavigate();
  const redirectTo = sanitizeVerifyEmailRedirectTo(searchParameters.get('redirectTo') ?? undefined);
  const isSignInPage =
    shellHandoff === undefined ? segment === 'sign-in' || segment === 'sign-up' : shellHandoff.action === 'signIn';
  const isSignedIn = isSignInPage && Boolean(session);
  useEffect(() => {
    if (isSignedIn) {
      void navigate(redirectTo, { replace: true });
    }
  }, [isSignedIn, navigate, redirectTo]);
  return (
    <AuthEmailDraftProvider>
      <div className='grid min-h-svh lg:grid-cols-2'>
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
        <div className='relative hidden lg:block'>
          <DesignStory />
        </div>
      </div>
    </AuthEmailDraftProvider>
  );
}
