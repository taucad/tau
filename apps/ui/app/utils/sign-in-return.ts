import { errorCategory } from '@taucad/types/constants';
import { cardOf } from '@taucad/chat-ui/utils/chat-error-card';
import { selectCaughtUp } from '#machines/chat-projection.logic.js';
import { selectVisibleChatErrorEntry, selectVisibleFailureResumable } from '#utils/run-auto-resume-plan.js';
import type { VisibleFailureSource } from '#utils/run-auto-resume-plan.js';

/**
 * The return from a sign-in a paused turn asked for (launch audit N-2).
 *
 * The sign-in card arms a consume-once marker on its return URL. One owner per chat reads it, and this is that owner's
 * decision: a pure function of the facts a resume depends on, so the resume is asked for once, when the chat can take
 * it, and the marker is dropped when there is nothing it could resume. The card used to resume from its own mount
 * effect, which fired on every mount, before the transcript had loaded and whether or not anyone had signed in.
 */

/** What the owner does with an armed marker now. @public */
export type SignInReturnStep = 'wait' | 'resume' | 'drop';

/** The facts the decision reads. @public */
export type SignInReturnFacts = Readonly<{
  /** The identity owner's answer. */
  identity: 'verified' | 'unverified' | 'signed-out' | 'unknown';
  /** The chat the return URL names is the chat this page shows. */
  chatShown: boolean;
  /** The transcript's load state. */
  transcript: 'loading' | 'loaded' | 'empty';
  /** The transcript holds a request, which a resumed turn's lease is taken under. */
  hasRequest: boolean;
  /** The chat's projection, attachment and errors. */
  failure: VisibleFailureSource;
}>;

/**
 * Whether the chat's visible failure is a turn waiting for a sign-in: the sign-in card's failure, on a run Resume
 * answers.
 *
 * @param state - The chat's projection, attachment and errors.
 * @returns `true` while a sign-in is what the turn waits for.
 * @public
 */
export const selectAwaitsSignIn = (state: VisibleFailureSource): boolean => {
  const error = selectVisibleChatErrorEntry(state)?.error;
  return (
    error !== undefined &&
    cardOf(error.code, error.category).category === errorCategory.auth &&
    selectVisibleFailureResumable(state)
  );
};

/**
 * The identity of the chat's visible failure when it is a refusal for want of a session, resumable or not: a refused
 * send, edit or retry is one too, and its card is what tells the person to sign in.
 *
 * @param state - The chat's projection, attachment and errors.
 * @returns The failure's identity, or `undefined` when the visible failure is not a sign-in one.
 * @public
 */
export const selectSignInFailureId = (state: VisibleFailureSource): string | undefined => {
  const entry = selectVisibleChatErrorEntry(state);
  return entry !== undefined && cardOf(entry.error.code, entry.error.category).category === errorCategory.auth
    ? entry.id
    : undefined;
};

/**
 * What to do with an armed return marker.
 *
 * - `wait`: an answer is still coming (who is signed in, which chat is shown, the log, the transcript).
 * - `resume`: someone is signed in and the chat shows a turn that waits for exactly that.
 * - `drop`: nothing here can be resumed by a sign-in: nobody signed in, or the chat holds no such turn.
 *
 * @param facts - The identity, the chat shown, its transcript and its failure.
 * @returns The step.
 * @public
 */
export const signInReturnStep = (facts: SignInReturnFacts): SignInReturnStep => {
  if (facts.identity === 'signed-out') {
    return 'drop';
  }
  if (facts.identity !== 'verified' || !facts.chatShown) {
    return 'wait';
  }
  if (!selectAwaitsSignIn(facts.failure)) {
    /* Only a log this page has read to its end says there is no such turn: a projection reads as caught up before
     * its first answer, and the attachment reports `attached` only after one. */
    const { projection, attachmentStatus } = facts.failure;
    return projection !== undefined && selectCaughtUp(projection) && attachmentStatus === 'attached' ? 'drop' : 'wait';
  }
  if (facts.transcript === 'loading') {
    return 'wait';
  }
  return facts.hasRequest ? 'resume' : 'drop';
};
