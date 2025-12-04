import type { KernelProvider } from '@taucad/types';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

const defaultKernel: KernelProvider = 'openscad';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- intentionally allowing inference
export const useKernel = () => {
  const [kernel, setKernel] = useCookie<KernelProvider>(cookieName.cadKernel, defaultKernel);

  return { kernel, setKernel };
};
