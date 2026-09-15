import { Link, useParams } from 'react-router';
import { Auth } from '#components/auth/auth.js';
import { AuthEmailDraftProvider } from '#components/auth/auth-email-draft.js';
import { MagicLinkVerify } from '#components/auth/magic-link-verify.js';
import { VerifyEmail } from '#components/auth/verify-email.js';
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import type { Handle } from '#types/matches.types.js';
import { DesignStory } from '#components/geometry/splash/design-story.js';
import { isDesktopTarget } from '#lib/build-target.js';
import type { DesktopAuthAction } from '#providers/auth-provider.js';
import { useShellAuthHandoff } from '#providers/auth-provider.js';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';

export const handle: Handle = {
  enablePageWrapper: false,
};

/**
 * What the desktop window shows once the shell has taken the flow.
 *
 * Signing out is immediate and needs no browser, so only the sign-in family
 * gets the handoff copy and its retry.
 *
 * @param action - The bridge call the shell ran.
 * @returns The handoff panel.
 */
function ShellHandoff({ action }: { readonly action: DesktopAuthAction }): React.JSX.Element | undefined {
  if (action === 'signOut') {
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
          void globalThis.window.tauAuth?.signIn();
        }}
      >
        Open my browser again
      </Button>
    </div>
  );
}

export default function AuthPage(): React.JSX.Element {
  const { '*': segment } = useParams();
  const shellAction = useShellAuthHandoff(`/auth/${segment ?? ''}`);
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
            {shellAction === undefined ? (
              segment === 'verify-email' ? (
                <VerifyEmail className='w-full max-w-md' />
              ) : segment === 'magic-link/verify' ? (
                <MagicLinkVerify className='w-full max-w-md' />
              ) : (
                <Auth path={segment} className='w-full max-w-md' />
              )
            ) : (
              <ShellHandoff action={shellAction} />
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
