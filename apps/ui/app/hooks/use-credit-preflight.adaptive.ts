import { useCloudFacts } from '#cloud/cloud-port.js';
import { useCreditPreflight as useSelfHostCreditPreflight } from '#hooks/use-credit-preflight.self-host.js';

/** The adaptive credit preflight (adaptive app deployment mode W2 skeleton): a no-op until W4 reads the port. */
export const useCreditPreflight: typeof useSelfHostCreditPreflight = () => {
  useCloudFacts(undefined);
  return useSelfHostCreditPreflight();
};
