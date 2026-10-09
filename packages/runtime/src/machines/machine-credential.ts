import { sha256StringSync } from '@taucad/utils/hash';

const safePhysicalId = /^[A-Za-z0-9._-]{1,128}$/u;

/**
 * The vault reference a machine's credential lives under: one per provider and physical printer.
 *
 * A physical id that is not a safe name segment is replaced by the first 16 hex digits of its SHA-256,
 * so one printer always maps to one reference. Synchronous and dependency-free, so it runs in any realm.
 *
 * @public
 * @param providerId - Trusted provider id, e.g. `acme`.
 * @param physicalId - The printer's claimed physical identity, e.g. its serial.
 * @returns `vault:machine/<providerId>/<physicalId>`, or `vault:machine/<providerId>/sha256-<16 hex>` for an unsafe id.
 */
export const machineCredentialReference = (providerId: string, physicalId: string): string => {
  if (providerId.length === 0 || physicalId.length === 0) {
    throw new TypeError('MACHINE_CREDENTIAL_REFERENCE_INVALID');
  }
  const segment = safePhysicalId.test(physicalId) ? physicalId : `sha256-${sha256StringSync(physicalId).slice(0, 16)}`;
  return `vault:machine/${providerId}/${segment}`;
};
