/**
 * The sentences a Tau remote's refusals are recognised by.
 *
 * A leaf on purpose: it imports nothing, so both the transport classifier
 * (`remotes.ts`) and the host-neutral scheduler (`sync.machine.ts`) can read it
 * without either one depending on the other, and the same refusal is filed the
 * same way whichever leg it arrives on (W10 defect 4).
 */

/**
 * The fixed first words of the hosted remote's D20 ceiling refusal.
 *
 * A `pre-receive` refusal carries no HTTP status, so this sentence is the only
 * thing that distinguishes "this repository is full" from "that ref was
 * refused". The server prints it from `ceilingRefusalMarker` in
 * `apps/api/app/api/git/git.constants.ts`, which carries the same string
 * because the API does not depend on this package; those two copies — both
 * tested — are the only ones.
 */
export const ceilingRefusalMarker = 'Tau: repository size limit exceeded';

/**
 * The fixed first words of the hosted remote's plan-quota refusal (D17).
 *
 * The same kind of answer as {@link ceilingRefusalMarker}, from the same hook:
 * the owner's plan has no room for what this push brings. The server prints
 * it from `quotaRefusalMarker` in `apps/api/app/api/git/git.constants.ts`;
 * those two copies, both tested, are the only ones.
 */
export const quotaRefusalMarker = 'Tau: storage quota exceeded';

/**
 * Whether a refusal the remote wrote is a storage answer: D20's repository
 * ceiling or the owner's plan quota (D17).
 *
 * Neither is a rule the caller broke: *Sync now* replays the same bytes and
 * can never clear one, so the refusal is filed as `quota`, whose one action is
 * chosen by who is asking.
 *
 * @param message - The sentence the remote sent, verbatim.
 * @returns True when it is the ceiling or the quota refusal.
 * @public
 */
export const isStorageRefusal = (message: string | undefined): boolean =>
  message !== undefined && (message.includes(ceilingRefusalMarker) || message.includes(quotaRefusalMarker));

/**
 * The fixed first words of the hosted remote's `GIT_REPOSITORY_INCOMPLETE` refusal.
 *
 * The manifest names a pack the store does not hold, so no retry can repair
 * the repository; only an operator restore can. A leg that reads the JSON
 * envelope keys on its body `code`; stock git sees only the `text/plain`
 * sentence, so this marker is the other half. The server prints it from
 * `incompleteRepositoryMarker` in `apps/api/app/api/git/git.constants.ts`;
 * those two copies, both tested, are the only ones.
 */
export const incompleteRepositoryMarker = "Tau: this project's cloud copy is damaged";

/**
 * Whether a refusal the remote wrote says its repository is damaged.
 *
 * @param message - The sentence the remote sent, verbatim.
 * @returns True when it is the incomplete-repository refusal.
 * @public
 */
export const isIncompleteRepositoryRefusal = (message: string | undefined): boolean =>
  message?.includes(incompleteRepositoryMarker) ?? false;
