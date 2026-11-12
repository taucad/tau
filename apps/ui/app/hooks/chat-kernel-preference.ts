import { isKernelId, isKernelPreference } from '@taucad/types/constants';
import type { KernelId, KernelPreference } from '@taucad/types/constants';

/**
 * A chat row's kernel preference under the legacy-row rule (automatic kernel selection blueprint D2): a stored
 * preference wins; a row without one reads as Auto, unless its legacy `activeKernel` differs from the project's owner,
 * which marks a real manual pick. A seeded row whose kernel is the owner's reads as Auto, which behaves the same.
 *
 * @param input - The row's stored preference and legacy kernel, and the project's owner kernel.
 * @returns The chat's preference.
 */
export const chatKernelPreference = (
  input: Readonly<{ stored: unknown; legacyKernel: unknown; ownerKernel: KernelId | undefined }>,
): KernelPreference => {
  if (isKernelPreference(input.stored)) {
    return input.stored;
  }
  if (isKernelId(input.legacyKernel) && input.ownerKernel !== undefined && input.legacyKernel !== input.ownerKernel) {
    return input.legacyKernel;
  }
  return 'auto';
};
