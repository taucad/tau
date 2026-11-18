import { createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import type { GatewayBillingOptions, GatewayModelTransportOptions } from '#transport/gateway-model-transport.js';
import type { InvocationFunding, ModelTransport } from '#waist/ports.js';

type CloudOptions = Omit<GatewayModelTransportOptions, 'fundedOperations' | 'billing'> & {
  /**
   * The account the gateway charges, read from the host's credential port on every prepare (W6 RH-S6; W11 GI-Q6).
   * Absent or `undefined`, the host cannot check an attempt's account.
   */
  readonly principal?: GatewayBillingOptions['principal'];
};

/**
 * Create Tau Cloud's funded gateway transport: every run funded, with no deployment answer asked.
 *
 * A compatibility export over {@link createGatewayModelTransport}, whose `billing` option now carries the billing layer
 * (operation binding, attempt resolution, the charged account) into every agent-host build, self-host ones included,
 * and enables it per run from the API's deployment answer (D1). It goes once no host imports it.
 *
 * @param options - Gateway configuration shared with the provider transport.
 * @returns A provider transport with mandatory operation binding and recovery, and its `funded` facet.
 * @public
 */
export const createTauCloudGatewayModelTransport = (
  options: CloudOptions,
): ModelTransport & { readonly funding: InvocationFunding } => {
  const { principal, ...gateway } = options;
  const unified = createGatewayModelTransport({
    ...gateway,
    billing: { deployment: async () => 'funded', ...(principal === undefined ? {} : { principal }) },
  });
  return unified.deployment!.forRun('funded');
};
