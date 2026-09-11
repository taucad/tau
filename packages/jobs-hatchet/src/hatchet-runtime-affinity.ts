import { createHash } from 'node:crypto';

/** Runtime-owned Hatchet affinity, kept outside immutable job definitions. @public */
export type HatchetJobRuntimeAffinity =
  | { readonly kind: 'owner'; readonly value: string }
  | { readonly kind: 'pool'; readonly value: string };

/** Hatchet label reserved for owner-bound Tau workers. @public */
export const hatchetOwnerAffinityLabel = 'tau.runtime.owner-affinity';

/** Hatchet label reserved for explicitly pooled Tau workers. @public */
export const hatchetPoolAffinityLabel = 'tau.runtime.pool-affinity';

/**
 * Derive the stable non-PII worker affinity for one Tau owner.
 *
 * @param ownerId - Server-authoritative Tau owner identity.
 * @returns An opaque SHA-256 owner affinity suitable for scheduler labels.
 * @public
 */
export const createHatchetOwnerAffinity = (ownerId: string): HatchetJobRuntimeAffinity => {
  if (!ownerId.trim()) {
    throw new TypeError('createHatchetOwnerAffinity: ownerId must be non-empty.');
  }
  const value = `sha256:${createHash('sha256').update(`tau-owner-affinity-v1\0${ownerId}`).digest('hex')}`;
  return Object.freeze({ kind: 'owner', value });
};

/**
 * Convert one explicit runtime affinity into exact Hatchet worker labels.
 *
 * @param affinity - Owner-bound or explicitly pooled worker affinity.
 * @returns The single reserved worker label for the selected scope.
 * @public
 */
export const toHatchetRuntimeWorkerLabels = (affinity: HatchetJobRuntimeAffinity): Readonly<Record<string, string>> => {
  if (!affinity.value.trim()) {
    throw new TypeError('Hatchet runtime affinity value must be non-empty.');
  }
  return Object.freeze({
    [affinity.kind === 'owner' ? hatchetOwnerAffinityLabel : hatchetPoolAffinityLabel]: affinity.value,
  });
};
