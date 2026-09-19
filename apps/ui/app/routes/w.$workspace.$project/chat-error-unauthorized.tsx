import { memo, useEffect, useMemo, useRef } from 'react';
import type React from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '#components/ui/loader.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

/**
 * The search parameter a sign-in leaves on its return URL to resume the turn it
 * interrupted.
 *
 * The app already carries post-redirect intent this way (the share panel's
 * GitHub authorization return), so the paused turn rides the same mechanism
 * rather than a second store: the card arms it on the way out and consumes it
 * on the way back, and a link pasted without it simply resumes nothing.
 */
const resumeReturnParameter = 'chatResume';

export const ChatErrorUnauthorized = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const { continueChat } = useChatActions();
  // One shot: the effect strips the parameter it fires on, and the card must
  // not re-arm itself off its own cleanup.
  const isReturning = useRef(new URLSearchParams(search).has(resumeReturnParameter));
  const returnTo = useMemo(() => {
    const parameters = new URLSearchParams(search);
    parameters.set(resumeReturnParameter, '1');
    return `${pathname}?${parameters.toString()}${hash}`;
  }, [hash, pathname, search]);
  const { signIn, signUp } = useAuthLinks({ redirectTo: returnTo });

  useEffect(() => {
    if (!isReturning.current) {
      return;
    }
    isReturning.current = false;
    const parameters = new URLSearchParams(search);
    parameters.delete(resumeReturnParameter);
    const remaining = parameters.toString();
    void navigate(`${pathname}${remaining ? `?${remaining}` : ''}${hash}`, { replace: true });
    // The turn is still paused at the call the session expired on, so this
    // continues it rather than asking the person to type the message again.
    continueChat();
  }, [continueChat, hash, navigate, pathname, search]);

  return (
    <ChatErrorCard
      tone='neutral'
      className={className}
      title='Sign in to continue'
      description='Your turn is paused. Sign in and Tau resumes where it stopped.'
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
