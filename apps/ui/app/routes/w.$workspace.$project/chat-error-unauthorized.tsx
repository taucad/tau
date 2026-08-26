import { memo } from 'react';
import type React from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { NavLink } from 'react-router';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { Loader } from '#components/ui/loader.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';

export const ChatErrorUnauthorized = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const { signIn, signUp } = useAuthLinks();

  return (
    <div className={cn('flex flex-col gap-3 rounded-md border bg-muted p-3 text-sm', className)}>
      <div className='flex flex-col gap-1'>
        <p className='font-medium text-foreground'>Sign in to continue</p>
        <p className='text-xs text-muted-foreground'>Create an account or sign in to chat with Tau.</p>
      </div>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Button asChild variant='default' className='flex-1'>
          <NavLink to={signIn} tabIndex={-1}>
            {({ isPending }) =>
              isPending ? (
                <Loader />
              ) : (
                <>
                  <LogIn className='size-4' />
                  Sign In
                </>
              )
            }
          </NavLink>
        </Button>
        <Button asChild variant='outline' className='flex-1'>
          <NavLink to={signUp} tabIndex={-1}>
            {({ isPending }) =>
              isPending ? (
                <Loader />
              ) : (
                <>
                  <UserPlus className='size-4' />
                  Create Account
                </>
              )
            }
          </NavLink>
        </Button>
      </div>
    </div>
  );
});
