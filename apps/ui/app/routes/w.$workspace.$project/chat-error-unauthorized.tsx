import { memo, useMemo } from 'react';
import type React from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';
import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { useIdentity } from '#hooks/use-identity.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';
import { ChatErrorPausedTurn } from '#routes/w.$workspace.$project/chat-error-paused-turn.js';

type ChatErrorUnauthorizedProps = {
  readonly className?: string;
  /**
   * Whether Resume answers this failure: a run stopped for want of a session, which the host will continue. A turn
   * the page refused to start has no run, so its card promises none.
   */
  readonly resumable: boolean;
};

/**
 * A turn that needs a signed-in account.
 *
 * The card is presentation only. It reads who is signed in from the identity owner, because the failure it is shown
 * for can be older than the session: with someone signed in it offers Resume and never a sign-in. Signed out, it
 * links to sign-in, and for a paused run arms the consume-once return marker that `ChatSignInReturn` takes, the one
 * owner of the resume after sign-in. The app already carries post-redirect intent this way (the payment and portal
 * returns), so a link pasted without the marker simply resumes nothing.
 */
export const ChatErrorUnauthorized = memo(function ({
  className,
  resumable,
}: ChatErrorUnauthorizedProps): React.JSX.Element {
  const { pathname, search, hash } = useLocation();
  const isSignedIn = useIdentity().state === 'verified';
  const returnTo = useMemo(() => {
    const parameters = new URLSearchParams(search);
    if (resumable) {
      parameters.set(searchParameterName.chatResume, '1');
    } else {
      parameters.delete(searchParameterName.chatResume);
    }
    const remaining = parameters.toString();
    return `${pathname}${remaining ? `?${remaining}` : ''}${hash}`;
  }, [hash, pathname, resumable, search]);
  const { signIn, signUp } = useAuthLinks({ redirectTo: returnTo });

  if (isSignedIn && resumable) {
    return <ChatErrorPausedTurn className={className} title='You’re signed in' resumable />;
  }
  if (isSignedIn) {
    return (
      <ChatErrorCard
        tone='neutral'
        className={className}
        title='You’re signed in'
        description='Send your message to continue.'
      />
    );
  }

  return (
    <ChatErrorCard
      tone='neutral'
      className={className}
      title='Sign in to continue'
      description={
        resumable
          ? 'Your turn is paused. Sign in and Tau resumes where it stopped.'
          : 'Nothing has run yet. Sign in, then send your message.'
      }
      actions={
        <>
          <Button asChild variant='default' size='xs'>
            <NavLink to={signIn}>
              {({ isPending }) => (
                <span aria-busy={isPending} className='inline-flex items-center gap-1.5'>
                  {isPending ? <Loader className='size-3.5' /> : <LogIn className='size-3.5' />}
                  Sign in
                </span>
              )}
            </NavLink>
          </Button>
          <Button asChild variant='outline' size='xs'>
            <NavLink to={signUp}>
              {({ isPending }) => (
                <span aria-busy={isPending} className='inline-flex items-center gap-1.5'>
                  {isPending ? <Loader className='size-3.5' /> : <UserPlus className='size-3.5' />}
                  Create account
                </span>
              )}
            </NavLink>
          </Button>
        </>
      }
    />
  );
});
