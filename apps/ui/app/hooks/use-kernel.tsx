import type { KernelEntry, KernelId } from '@taucad/types/constants';
import { isKernelId, resolveKernel } from '@taucad/types/constants';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

const defaultKernel: KernelId = 'openscad';

type UseKernelResult = {
  readonly kernel: KernelId;
  readonly setKernel: (next: KernelId) => void;
  readonly selectedKernel: KernelEntry;
};

export const useKernel = (): UseKernelResult => {
  const [raw, setKernel] = useCookie<KernelId>(cookieName.cadKernel, defaultKernel);
  // Heal a stale or tampered cookie at the boundary so downstream
  // consumers can treat `selectedKernel` as a definite `KernelConfiguration`.
  // Without this, retiring a kernel from `kernelConfigurations` would
  // silently surface as the OpenSCAD fallback on every render.
  const kernel = isKernelId(raw) ? raw : defaultKernel;
  const selectedKernel = resolveKernel(kernel);

  return { kernel, setKernel, selectedKernel };
};
