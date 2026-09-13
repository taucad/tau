import { lazy } from 'react';
import { Link, useParams } from 'react-router';
import { Auth } from '#components/auth/auth.js';
import { AuthEmailDraftProvider } from '#components/auth/auth-email-draft.js';
import { VerifyEmail } from '#components/auth/verify-email.js';
import { TauWordmark } from '#components/icons/tau-wordmark.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import type { Handle } from '#types/matches.types.js';
import { ClientOnly } from '#components/ui/utils/client-only.js';

const AuthSplashbackLazy = lazy(async () => {
  const m = await import('#routes/auth.$/splashback/auth-splashback.js');
  return { default: m.AuthSplashback };
});

export const handle: Handle = {
  enablePageWrapper: false,
};

export default function AuthPage(): React.JSX.Element {
  const { '*': segment } = useParams();
  return (
    <AuthEmailDraftProvider>
      <div className='grid min-h-svh lg:grid-cols-2'>
        <div className='flex flex-col gap-4 p-6 md:p-10'>
          <div className='flex justify-center gap-2 md:justify-start'>
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
            {segment === 'verify-email' ? (
              <VerifyEmail className='w-full max-w-md' />
            ) : (
              <Auth path={segment} className='w-full max-w-md' />
            )}
          </div>
        </div>
        <div className='relative hidden lg:block'>
          <ClientOnly>
            <AuthSplashbackLazy />
          </ClientOnly>
        </div>
      </div>
    </AuthEmailDraftProvider>
  );
}
