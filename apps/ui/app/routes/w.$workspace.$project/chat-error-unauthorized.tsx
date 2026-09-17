import { memo } from 'react';
import type React from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { NavLink } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '#components/ui/loader.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

export const ChatErrorUnauthorized = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const { signIn, signUp } = useAuthLinks();

  return (
    <ChatErrorCard
      tone='neutral'
      className={className}
      title='Sign in to continue'
      description='Create an account or sign in to chat with Tau.'
      actions={
        <>
          <Button asChild variant='default' size='sm'>
            <NavLink to={signIn} tabIndex={-1}>
              {({ isPending }) =>
                isPending ? (
                  <Loader />
                ) : (
                  <>
                    <LogIn className='size-3.5' />
                    Sign in
                  </>
                )
              }
            </NavLink>
          </Button>
          <Button asChild variant='outline' size='sm'>
            <NavLink to={signUp} tabIndex={-1}>
              {({ isPending }) =>
                isPending ? (
                  <Loader />
                ) : (
                  <>
                    <UserPlus className='size-3.5' />
                    Create account
                  </>
                )
              }
            </NavLink>
          </Button>
        </>
      }
    />
  );
});
