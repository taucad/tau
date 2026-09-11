import type { JobCapabilityRequirement, JobRunnerRegistration } from '#job.types.js';

/** Result of comparing job requirements with one runner. @public */
export type JobCapabilityMatchOutcome =
  | { readonly matched: true; readonly slotCost: number }
  | {
      readonly matched: false;
      readonly reason: 'invalid-slot-cost' | 'insufficient-slots' | 'unsatisfied-capability';
      readonly requirement?: JobCapabilityRequirement;
    };

const satisfiesRequirement = (
  requirement: JobCapabilityRequirement,
  actual: boolean | number | string | undefined,
): boolean => {
  if (actual === undefined) {
    return false;
  }
  if (requirement.condition === 'equals') {
    return actual === requirement.value;
  }
  if (requirement.condition === 'one-of') {
    return requirement.values.includes(actual);
  }
  return typeof actual === 'number' && actual >= requirement.value;
};

/**
 * Match framework-owned job requirements against a runner advertisement.
 *
 * @param input - Job requirements, slot cost, runner, and currently occupied slots.
 * @returns A discriminated match or rejection with the first failed requirement.
 * @public
 *
 * @example <caption>Require a container-capable runner</caption>
 * ```typescript
 * import { matchJobCapabilities } from '@taucad/jobs';
 *
 * const outcome = matchJobCapabilities({
 *   requirements: [{ key: 'container', condition: 'equals', value: true }],
 *   slotCost: 2,
 *   occupiedSlots: 0,
 *   runner: { runnerId: 'local', capabilities: { container: true }, slots: 4 },
 * });
 * ```
 */
export const matchJobCapabilities = (input: {
  readonly requirements: readonly JobCapabilityRequirement[];
  readonly slotCost: number;
  readonly occupiedSlots: number;
  readonly runner: JobRunnerRegistration;
}): JobCapabilityMatchOutcome => {
  if (!Number.isInteger(input.slotCost) || input.slotCost < 1) {
    return { matched: false, reason: 'invalid-slot-cost' };
  }
  if (input.occupiedSlots + input.slotCost > input.runner.slots) {
    return { matched: false, reason: 'insufficient-slots' };
  }
  for (const requirement of input.requirements) {
    if (!satisfiesRequirement(requirement, input.runner.capabilities[requirement.key])) {
      return { matched: false, reason: 'unsatisfied-capability', requirement };
    }
  }
  return { matched: true, slotCost: input.slotCost };
};
