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
 * Whether a refusal the remote wrote is D20's repository ceiling.
 *
 * A ceiling is a quota answer, not a rule the caller broke: *Sync now* replays
 * the same bytes and can never clear it, so the only useful affordance is
 * Upgrade.
 *
 * @param message - The sentence the remote sent, verbatim.
 * @returns True when it is the ceiling refusal.
 * @public
 */
export const isCeilingRefusal = (message: string | undefined): boolean =>
  message?.includes(ceilingRefusalMarker) ?? false;
