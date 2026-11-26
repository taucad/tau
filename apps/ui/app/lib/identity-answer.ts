/**
 * The identity owner's last answer, for code that runs outside render (launch audit N-5).
 *
 * `useIdentity` is the one owner of who is signed in, and it is a hook. A turn's admission runs after several waits
 * and must read the answer as it stands then, never a value a render captured before them. The owner publishes its
 * answer here on every commit; nothing else writes it. This module imports nothing, so a reader does not pull the
 * auth client into its chunk.
 */

/** The identity owner's states. @public */
export type IdentityState = 'verified' | 'unverified' | 'signed-out' | 'unknown';

/* Every mounted `useIdentity` computes the same answer from the same session query and record, so whichever commits
 * last writes what the others would. */
let lastState: IdentityState = 'unknown';

/**
 * The identity owner's answer when called. `unknown` until a `useIdentity` has committed.
 *
 * @returns The owner's state.
 * @public
 */
export const readIdentityState = (): IdentityState => lastState;

/**
 * Publish the identity owner's answer. Called by `useIdentity` only.
 *
 * @param state - The owner's state.
 * @public
 */
export const publishIdentityState = (state: IdentityState): void => {
  lastState = state;
};
