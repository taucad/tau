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
  /* Main only announces that the session changed; the link a signed-out window
     was holding (`redirectTo`, e.g. a `tau://invitations/…` arrival) is opened
     here, or the person is left on this panel with a session and nowhere to go. */
  const { data: session } = useSession(authClient);
  const [searchParameters] = useSearchParams();
  const navigate = useNavigate();
  const redirectTo = sanitizeVerifyEmailRedirectTo(searchParameters.get('redirectTo') ?? undefined);
  const isSignedIn = handoff.action === 'signIn' && Boolean(session);
  useEffect(() => {
    if (isSignedIn) {
      void navigate(redirectTo, { replace: true });
    }
  }, [isSignedIn, navigate, redirectTo]);

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
  const { '*': segment } = useParams();
  const shellHandoff = useShellAuthHandoff(`/auth/${segment ?? ''}`);
  return (
    <AuthEmailDraftProvider>
      <div className='grid min-h-svh lg:grid-cols-2'>
        <div className='flex flex-col gap-4 p-6 md:p-10'>
          <div
            className={cn(
              'flex justify-center gap-2 md:justify-start',
              // Shell-less window: this row overlaps the desktop drag band.
              isDesktopTarget() && '[&_a]:[app-region:no-drag]',
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild className='flex items-center gap-2 font-medium'>
                <Link to='/'>
                  <TauWordmark className='h-7 text-primary' />
                </Link>
              </TooltipTrigger>
              <TooltipContent side='right'>Go home</TooltipContent>
            </Tooltip>
          </div>
          <div className='flex flex-1 items-center justify-center'>
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
