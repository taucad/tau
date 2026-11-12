import { useCallback } from 'react';
import type { KernelEntry, KernelId, KernelPreference } from '@taucad/types/constants';
import { isKernelId, resolveKernel } from '@taucad/types/constants';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { isKernelAvailable } from '#constants/available-kernel-configurations.js';
import { useFeature } from '#flags/use-feature.js';

const defaultKernel: KernelId = 'openscad';

/** What `/projects/new` preselects when the remembered choice is not a concrete kernel (blueprint E5). */
const newProjectFallbackKernel: KernelId = 'replicad';

type UseKernelResult = {
  /** A concrete kernel: the remembered one, or the default while the remembered choice is Auto. */
  readonly kernel: KernelId;
  /**
   * The remembered Home selection (blueprint E4): Auto or one kernel. With the `autoKernel` flag off it is always
   * {@link UseKernelResult.kernel}, and a new device starts on the default; with it on, a new device starts on Auto.
   */
  readonly preference: KernelPreference;
  readonly setKernel: (next: KernelId) => void;
  /** Remember a Home selection. Auto is kept only while the `autoKernel` flag is on. */
  readonly setPreference: (next: KernelPreference) => void;
  readonly selectedKernel: KernelEntry;
  /** `/projects/new` has no prompt to route on: the remembered kernel when concrete, else replicad (E5). */
  readonly newProjectKernel: KernelId;
};

/**
 * Resolve the device's remembered kernel choice from its cookie value.
 *
 * @param input - The cookie's raw value and whether the `autoKernel` flag is on.
 * @returns The concrete kernel, the preference and the `/projects/new` preselection.
 */
export const resolveRememberedKernel = (
  input: Readonly<{ raw: unknown; isAutoEnabled: boolean }>,
): Pick<UseKernelResult, 'kernel' | 'preference' | 'newProjectKernel'> => {
  // Heal a stale or tampered cookie at the boundary so downstream
  // consumers can treat `selectedKernel` as a definite `KernelConfiguration`.
  // Without this, a retired kernel id could reach the closed-union resolver.
  const concrete = isKernelId(input.raw) && isKernelAvailable(input.raw) ? input.raw : undefined;
  if (!input.isAutoEnabled) {
    const kernel = concrete ?? defaultKernel;
    return { kernel, preference: kernel, newProjectKernel: kernel };
  }
  return {
    kernel: concrete ?? defaultKernel,
    preference: concrete ?? 'auto',
    newProjectKernel: concrete ?? newProjectFallbackKernel,
  };
};

export const useKernel = (): UseKernelResult => {
  const isAutoEnabled = useFeature('autoKernel');
  const [raw, setRaw] = useCookie<KernelPreference>(cookieName.cadKernel, isAutoEnabled ? 'auto' : defaultKernel);
  const { kernel, preference, newProjectKernel } = resolveRememberedKernel({ raw, isAutoEnabled });
  const selectedKernel = resolveKernel(kernel);
  const setPreference = useCallback(
    (next: KernelPreference): void => {
      if (next === 'auto' && !isAutoEnabled) {
        return;
      }
      setRaw(next);
    },
    [isAutoEnabled, setRaw],
  );

  return { kernel, preference, setKernel: setRaw, setPreference, selectedKernel, newProjectKernel };
};
