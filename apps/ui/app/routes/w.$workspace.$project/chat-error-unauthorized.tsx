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
import { ChatErrorCredits } from '#routes/w.$workspace.$project/chat-error-credits.js';
import { useCreditStanding } from '#hooks/use-credit-standing.js';

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
  const standing = useCreditStanding();

  if (isSignedIn && resumable) {
    return <ChatErrorPausedTurn className={className} title='You’re signed in' resumable />;
  }
  // Back from sign-up with nothing to spend: the send would be refused, so say what it takes now.
  if (isSignedIn && standing?.isEmpty === true) {
    return <ChatErrorCredits className={className} resumable={false} details={{ availableCreditAtoms: '0' }} />;
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

  const signInButton = (
    <Button key='sign-in' asChild variant={resumable ? 'default' : 'outline'} size='xs'>
      <NavLink to={signIn}>
        {({ isPending }) => (
          <span aria-busy={isPending} className='inline-flex items-center gap-1.5'>
            {isPending ? <Loader className='size-3.5' /> : <LogIn className='size-3.5' />}
            Sign in
          </span>
        )}
      </NavLink>
    </Button>
  );
  const createAccountButton = (
    <Button key='sign-up' asChild variant={resumable ? 'outline' : 'default'} size='xs'>
      <NavLink to={signUp}>
        {({ isPending }) => (
          <span aria-busy={isPending} className='inline-flex items-center gap-1.5'>
            {isPending ? <Loader className='size-3.5' /> : <UserPlus className='size-3.5' />}
            Create account
          </span>
        )}
      </NavLink>
    </Button>
  );

  // A paused run belongs to someone who was signed in, so Sign in leads. A send refused before it ran is almost always
  // a new person's first prompt, so Create account leads, and nothing about credits is said before sign-up.
  return (
    <ChatErrorCard
      tone='neutral'
      className={className}
      title={resumable ? 'Sign in to continue' : 'Create an account to send this'}
      description={
        resumable
          ? 'Your turn is paused. Sign in and Tau resumes where it stopped.'
          : 'Your message stays here. Sign up free, then send it.'
      }
      actions={resumable ? [signInButton, createAccountButton] : [createAccountButton, signInButton]}
    />
  );
});
