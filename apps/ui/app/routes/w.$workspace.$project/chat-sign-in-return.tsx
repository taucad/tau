import { useEffect, useRef, useState } from 'react';
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
import { selectSignInFailureId, signInReturnStep } from '#utils/sign-in-return.js';

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
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);
  /* A return from sign-in is when who is signed in may just have changed, and the session query can still hold the
   * answer it had before the sign-in: a stale "nobody" would drop the marker the person signed in to use. The owner
   * asks once per arrival and reads the identity only after that answer. */
  const [answeredArrival, setAnsweredArrival] = useState<string | undefined>(undefined);
  const askedArrival = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!isArmed || askedArrival.current === key) {
      return;
    }
    askedArrival.current = key;
    const ask = async (): Promise<void> => {
      try {
        await refetchRef.current();
      } catch {
        /* A failed check is an answer too; the identity owner reads it as it reads any failed check. */
      }
      setAnsweredArrival(key);
    };
    void ask();
  }, [isArmed, key]);
  const step = useChatSelector((state) =>
    isArmed
      ? signInReturnStep({
          identity: answeredArrival === key ? identity : 'unknown',
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

  /* The failure whose refusal contradicts a signed-in page, asked about once: a refused send or edit as much as a run
   * that waits, since either card is drawn from the page's answer of who is signed in. */
  const refusedAttempt = useChatSelector(selectSignInFailureId);
  const asked = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (refusedAttempt === undefined || identity !== 'verified' || isArmed || asked.current === refusedAttempt) {
      return;
    }
    asked.current = refusedAttempt;
    void refetchRef.current();
  }, [identity, isArmed, refusedAttempt]);

  return undefined;
}
