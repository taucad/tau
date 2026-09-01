import { useSession } from '@better-auth-ui/react';
import { Lock } from 'lucide-react';
import { NavLink } from 'react-router';
import { Button } from '#components/ui/button.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { Loader } from '#components/ui/loader.js';
import { authClient } from '#lib/auth-client.js';

/**
 * Wraps settings content that requires authentication.
 * When the user is signed out, shows a prompt to sign in
 * instead of redirecting to the auth page.
 */
export function SettingsAuthGate({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { data: session, isPending } = useSession(authClient);
  const { signIn } = useAuthLinks();

  if (isPending) {
    return (
      <div className='flex items-center justify-center py-16'>
        <Loader className='size-6 text-muted-foreground' />
      </div>
    );
  }

  if (!session) {
    return (
      <div className='flex flex-col items-center justify-center gap-4 py-16 text-center'>
        <div className='flex size-12 items-center justify-center rounded-full bg-muted'>
          <Lock className='size-6 text-muted-foreground' />
        </div>
        <div className='flex flex-col gap-1'>
          <p className='font-medium'>Sign in required</p>
          <p className='text-sm text-muted-foreground'>Sign in to access this setting.</p>
        </div>
        <Button asChild>
          <NavLink to={signIn} tabIndex={-1}>
            {({ isPending: isNavigating }) => (isNavigating ? <Loader /> : 'Sign In')}
          </NavLink>
        </Button>
      </div>
    );
  }

  // oxlint-disable-next-line react/jsx-no-useless-fragment -- needed for consistent return type
  return <>{children}</>;
}
