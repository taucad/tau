import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useSession } from '@better-auth-ui/react';
import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import { stringParameter } from '@taucad/ui-core/utils/search-parameter.codecs';
import { projectChatIdFromSearch } from '@taucad/files-ui/utils/project-url.utils';
import { authClient } from '#lib/auth-client.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { useIdentity } from '#hooks/use-identity.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { selectVisibleChatErrorEntry } from '#utils/run-auto-resume-plan.js';
import { selectAwaitsSignIn, signInReturnStep } from '#utils/sign-in-return.js';

/* Module scope: the setter is memoised on the codec's identity. */
const signInReturnParameter = stringParameter();

/* The arrival the marker was last taken on: a chat at one history entry. Module scope, so a remount between taking the
 * marker and the router committing its removal cannot take it again; a later return is another history entry. */
let takenArrival: string | undefined;

/**
 * The one owner of a chat's return from sign-in (launch audit N-2), mounted once beside the chat's turn host.
 *
 * It takes the sign-in card's consume-once marker when `signInReturnStep` has an answer: it removes the marker, and
 * resumes the paused turn if someone is now signed in and the chat still shows that turn. Removing the marker changes
 * the URL's search only, which the root's `shouldRevalidate` loads nothing for.
 *
 * It also asks the auth server again when a run fails for want of a session while this page believes someone is
 * signed in: the gateway's refusal is newer than the page's answer, and the sign-in card reads that answer.
 *
 * @returns Nothing: this owner renders no markup.
 * @public
 */
export function ChatSignInReturn(): undefined {
  const [marker, setMarker] = useSearchParameter(searchParameterName.chatResume, signInReturnParameter);
  const { key, search } = useLocation();
  const { activeChatId } = useActiveChatSession();
  const { continueChat } = useChatActions();
  const { state: identity } = useIdentity();
  const { refetch } = useSession(authClient);
  const routeChatId = projectChatIdFromSearch(search);
  const isArmed = marker !== '';
  const step = useChatSelector((state) =>
    isArmed
      ? signInReturnStep({
          identity,
          chatShown: routeChatId === undefined || routeChatId === activeChatId,
          transcript: state.transcript,
          hasRequest: state.messages.some((message) => message.role === 'user'),
          failure: state,
        })
      : 'wait',
  );
  /* Held in refs rather than dependencies: React Router hands out a new `setSearchParams` identity on every URL
   * change, and the chat's actions change with the chat. */
  const latest = useRef({ setMarker, continueChat });
  useEffect(() => {
    latest.current = { setMarker, continueChat };
  }, [setMarker, continueChat]);
  useEffect(() => {
    if (!isArmed || step === 'wait') {
      return;
    }
    const arrival = `${activeChatId}@${key}`;
    if (takenArrival === arrival) {
      return;
    }
    takenArrival = arrival;
    latest.current.setMarker('');
    if (step === 'resume') {
      latest.current.continueChat();
    }
  }, [activeChatId, isArmed, key, step]);

  /* The failed attempt whose refusal contradicts a signed-in page, asked about once. */
  const refusedAttempt = useChatSelector((state) =>
    selectAwaitsSignIn(state) ? selectVisibleChatErrorEntry(state)?.id : undefined,
  );
  const asked = useRef<string | undefined>(undefined);
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);
  useEffect(() => {
    if (refusedAttempt === undefined || identity !== 'verified' || isArmed || asked.current === refusedAttempt) {
      return;
    }
    asked.current = refusedAttempt;
    void refetchRef.current();
  }, [identity, isArmed, refusedAttempt]);

  return undefined;
}
