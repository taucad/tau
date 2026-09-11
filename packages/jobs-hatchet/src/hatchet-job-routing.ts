import { WorkerLabelComparator } from '@hatchet-dev/typescript-sdk/v1/index.js';
import type { JobCapabilityRequirement, JobCapabilityValue } from '@taucad/jobs';

/** One required Hatchet worker label translated from Tau placement semantics. @public */
export type HatchetDesiredWorkerLabel = {
  readonly value: string | number;
  readonly required: true;
  readonly comparator?: WorkerLabelComparator;
};

/** Result of translating a complete Tau requirement set for Hatchet. @public */
export type HatchetJobRoutingOutcome =
  | {
      readonly matched: true;
      readonly labels: Readonly<Record<string, HatchetDesiredWorkerLabel>>;
    }
  | {
      readonly matched: false;
      readonly reason: 'duplicate-key' | 'unsupported-one-of';
      readonly key: string;
    };

const toHatchetValue = (value: JobCapabilityValue): string | number =>
  typeof value === 'boolean' ? String(value) : value;

/**
 * Translate Tau placement requirements into Hatchet's runtime worker-label routing.
 *
 * @param requirements - Immutable requirements from one job definition.
 * @returns Hatchet labels or a typed result for semantics Hatchet cannot represent.
 * @public
 */
export const toHatchetDesiredWorkerLabels = (
  requirements: readonly JobCapabilityRequirement[],
): HatchetJobRoutingOutcome => {
  const labels: Record<string, HatchetDesiredWorkerLabel> = {};
  for (const requirement of requirements) {
    if (labels[requirement.key]) {
      return { matched: false, reason: 'duplicate-key', key: requirement.key };
    }
    if (requirement.condition === 'one-of') {
      if (requirement.values.length !== 1) {
        return { matched: false, reason: 'unsupported-one-of', key: requirement.key };
      }
      labels[requirement.key] = {
        value: toHatchetValue(requirement.values[0]!),
        required: true,
      };
      continue;
    }
    if (requirement.condition === 'at-least') {
      labels[requirement.key] = {
        value: requirement.value,
        required: true,
        // Hatchet compares the requested value on the left to the worker label
        // on the right, so requested <= available implements Tau's at-least.
        comparator: WorkerLabelComparator.LESS_THAN_OR_EQUAL,
      };
      continue;
    }
    labels[requirement.key] = {
      value: toHatchetValue(requirement.value),
      required: true,
    };
  }
  return { matched: true, labels };
};

/**
 * Convert Tau runner capabilities into Hatchet worker labels.
 *
 * @param capabilities - Scalar capabilities advertised by one Tau runner.
 * @returns Equivalent Hatchet labels, with booleans encoded as strings.
 * @public
 */
export const toHatchetWorkerLabels = (
  capabilities: Readonly<Record<string, JobCapabilityValue>>,
): Readonly<Record<string, string | number>> =>
  Object.fromEntries(Object.entries(capabilities).map(([key, value]) => [key, toHatchetValue(value)]));
