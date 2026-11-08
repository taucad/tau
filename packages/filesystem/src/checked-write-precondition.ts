import type { CheckedWritePrecondition, FileDigestPrecondition } from '@taucad/types';

/**
 * Whether a checked-write precondition names a digest (charter D17) rather
 * than bytes or absence.
 *
 * @param precondition - One precondition of a checked write.
 * @returns `true` for a {@link FileDigestPrecondition}.
 * @public
 */
export const isDigestPrecondition = (precondition: CheckedWritePrecondition): precondition is FileDigestPrecondition =>
  'expectedSha256' in precondition;
