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
 * `apps/libs/api-git-core/src/git.constants.ts`, which carries the same string
 * because the API does not depend on this package; those two copies — both
 * tested — are the only ones.
 */
export const ceilingRefusalMarker = 'Tau: repository size limit exceeded';

/**
 * The fixed first words of the hosted remote's plan-quota refusal (D17).
 *
 * The same kind of answer as {@link ceilingRefusalMarker}, from the same hook:
 * the owner's plan has no room for what this push brings. The server prints
 * it from `quotaRefusalMarker` in `apps/libs/api-git-core/src/git.constants.ts`;
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
 * Whether a refusal the remote wrote is D20's per-repository ceiling.
 *
 * The ceiling is the same on every plan, so no *Upgrade* clears it: a surface
 * that offers a plan action for {@link isStorageRefusal} withholds it here and
 * shows the file list alone (RV-W8 F2).
 *
 * @param message - The sentence the remote sent, verbatim.
 * @returns True when it is the ceiling refusal.
 * @public
 */
export const isCeilingRefusal = (message: string | undefined): boolean =>
  message?.includes(ceilingRefusalMarker) ?? false;

/**
 * The fixed first words of the hosted remote's `GIT_REPOSITORY_INCOMPLETE` refusal.
 *
 * The manifest names a pack the store does not hold, so no retry can repair
 * the repository; only an operator restore can. A leg that reads the JSON
 * envelope keys on its body `code`; stock git sees only the `text/plain`
 * sentence, so this marker is the other half. The server prints it from
 * `incompleteRepositoryMarker` in `apps/libs/api-git-core/src/git.constants.ts`;
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

/**
 * The fixed first words of the hosted remote's `GIT_PUSH_VERSION_NUMBER_TAKEN`
 * refusal (blueprint B6): a version tag whose number another version already
 * holds on Tau Cloud. The server prints it from `versionNumberTakenMarker` in
 * `apps/libs/api-git-core/src/git.constants.ts`; those two copies, both
 * tested, are the only ones.
 */
export const versionNumberTakenMarker = 'Tau: version number taken';

/**
 * Whether a refusal the remote wrote says a version's number is taken.
 *
 * The one refusal this device clears by itself: it gives its own version that
 * is not backed up the next free number and pushes again.
 *
 * @param message - The sentence the remote sent, verbatim.
 * @returns True when it is the taken-number refusal.
 * @public
 */
export const isVersionNumberRefusal = (message: string | undefined): boolean =>
  message?.includes(versionNumberTakenMarker) ?? false;

/**
 * The fixed first words of a hosted-remote refusal that names one commit of
 * the push: one that does not name its pusher, one with an address Tau Cloud
 * does not keep, or one Tau did not record and was not made with the pusher's
 * Tau identity. The server prints it from `commitRefusalMarker` in
 * `apps/libs/api-git-core/src/git.constants.ts`; those two copies, both
 * tested, are the only ones.
 */
export const commitRefusalMarker = 'Tau: refused commit';

/**
 * Whether a refusal the remote wrote refuses a commit for what it records.
 *
 * The commit stays in every later push of its branch, so a retry is refused
 * the same way: only the person can clear it, by making that commit again
 * (the sentence says how) and asking for *Try again*. The scheduler files it
 * as terminal, so the refusal is shown once rather than on every backoff.
 *
 * @param message - The sentence the remote sent, verbatim.
 * @returns True when the remote refused a named commit.
 * @public
 */
export const isCommitRefusal = (message: string | undefined): boolean =>
  message?.includes(commitRefusalMarker) ?? false;
