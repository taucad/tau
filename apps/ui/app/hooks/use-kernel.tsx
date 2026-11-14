import type { KernelEntry, KernelId, KernelPreference } from '@taucad/types/constants';
import { isKernelId, resolveKernel } from '@taucad/types/constants';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { isKernelAvailable } from '#constants/available-kernel-configurations.js';

const defaultKernel: KernelId = 'openscad';

/** What `/projects/new` preselects when the remembered choice is not a concrete kernel (blueprint E5). */
const newProjectFallbackKernel: KernelId = 'replicad';

type UseKernelResult = {
  /** A concrete kernel: the remembered one, or the default while the remembered choice is Auto. */
  readonly kernel: KernelId;
  /**
   * The remembered Home selection (blueprint E4): Auto or one kernel. A new device starts on Auto.
   */
  readonly preference: KernelPreference;
  readonly setKernel: (next: KernelId) => void;
  /** Remember a Home selection, Auto included. */
  readonly setPreference: (next: KernelPreference) => void;
  readonly selectedKernel: KernelEntry;
  /** `/projects/new` has no prompt to route on: the remembered kernel when concrete, else replicad (E5). */
  readonly newProjectKernel: KernelId;
};

/**
 * Resolve the device's remembered kernel choice from its cookie value.
 *
 * @param input - The cookie's raw value.
 * @returns The concrete kernel, the preference and the `/projects/new` preselection.
 */
export const resolveRememberedKernel = (
  input: Readonly<{ raw: unknown }>,
): Pick<UseKernelResult, 'kernel' | 'preference' | 'newProjectKernel'> => {
  // Heal a stale or tampered cookie at the boundary so downstream
  // consumers can treat `selectedKernel` as a definite `KernelConfiguration`.
  // Without this, a retired kernel id could reach the closed-union resolver.
  const concrete = isKernelId(input.raw) && isKernelAvailable(input.raw) ? input.raw : undefined;
  return {
    kernel: concrete ?? defaultKernel,
    preference: concrete ?? 'auto',
    newProjectKernel: concrete ?? newProjectFallbackKernel,
  };
};

export const useKernel = (): UseKernelResult => {
  const [raw, setRaw] = useCookie<KernelPreference>(cookieName.cadKernel, 'auto');
  const { kernel, preference, newProjectKernel } = resolveRememberedKernel({ raw });
  const selectedKernel = resolveKernel(kernel);

  return { kernel, preference, setKernel: setRaw, setPreference: setRaw, selectedKernel, newProjectKernel };
};
