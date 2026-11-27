/**
 * The server half of the provenance module (`@taucad/revisions/provenance/server`).
 *
 * The only functions that see a plaintext address or handle. The storage
 * worker's coverage pass and tau-api's claim check import it; no rendering
 * surface does (blueprint D1, I11). What leaves is bits, never an address.
 */

import { commitParts, readCommit } from '#provenance/read.js';
import type { CommitReading, CoverageInputs, ServerBits } from '#provenance/types.js';

/* `<id>+<login>@users.noreply.github.com` for exactly this numeric id (R2-27). */
const isForgeAddressOf = (email: string, forgeId: string | undefined): boolean => {
  if (forgeId === undefined || !/^\d+$/u.test(forgeId)) {
    return false;
  }
  const prefix = `${forgeId}+`;
  const suffix = '@users.noreply.github.com';
  if (!email.startsWith(prefix) || !email.endsWith(suffix)) {
    return false;
  }
  return /^[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?$/u.test(email.slice(prefix.length, -suffix.length));
};

const isVerifiedEmail = (email: string, verifiedEmail: string | undefined): boolean =>
  verifiedEmail !== undefined && email !== '' && email.toLowerCase() === verifiedEmail.trim().toLowerCase();

/**
 * Whether a commit's `claimable` identity is exactly one of these identities.
 * A commit that names an account is never covered (I12).
 *
 * @param reading - The commit's reading.
 * @param identities - The claim's identities.
 * @returns `true` when the claim covers the commit.
 * @public
 */
export const claimMatches = (reading: CommitReading, identities: readonly string[]): boolean =>
  reading.claimable !== undefined && !reading.namesAccount && identities.includes(reading.claimable);

/**
 * The server bits of one commit against the grant's inputs (blueprint D3).
 * Total: an unreadable commit gets no bit.
 *
 * @param commit - The raw commit object body.
 * @param inputs - The inline claim's identities, the pusher's verified email and linked GitHub id.
 * @returns The bits, with no address in them.
 * @public
 */
export const coverageOf = (commit: string, inputs: CoverageInputs): ServerBits => {
  const { author, committer } = commitParts(commit);
  const authorEmail = author?.email ?? '';
  const committerEmail = committer?.email ?? '';
  const bits: ServerBits = {
    ...(claimMatches(readCommit(commit), inputs.identities) ? { claim: true } : {}),
    ...(isVerifiedEmail(authorEmail, inputs.verifiedEmail) ? { address: true } : {}),
    ...(isForgeAddressOf(authorEmail, inputs.forgeId) ? { forge: true } : {}),
    ...(isVerifiedEmail(committerEmail, inputs.verifiedEmail) ? { committerAddress: true } : {}),
    ...(isForgeAddressOf(committerEmail, inputs.forgeId) ? { committerForge: true } : {}),
  };
  return Object.freeze(bits);
};
