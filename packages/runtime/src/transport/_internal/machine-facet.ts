/**
 * The machines facet a transport client carries beside the CAD channel.
 *
 * One shape, two wires: the WebSocket and Electron clients both take it from
 * here. The channel is dialled on first use — a renderer that
 * never opens the Print pane never opens a machines channel — and closed with
 * the transport.
 */

import type { MachineChannelClient } from '#machines/machine-channel.js';
import type { MachineClient } from '#machines/machine-client.js';
import type { RuntimeTransportFacet } from '#transport/runtime-transport.types.js';

/** What a transport consumer passes to reach an authenticated machines service. @public */
export type MachineFacetOption =
  | Readonly<{ available: true; connect: () => MachineChannelClient }>
  | Readonly<{ available: false; reason: 'not-granted' | 'unsupported' }>;

/**
 * Project a lazily-connected machine channel as a transport facet.
 *
 * @param option - The consumer's machines option; absent means unsupported.
 * @returns The facet and the close that ends whatever channel it opened.
 */
export const createLazyMachineFacet = (
  option: MachineFacetOption | undefined,
  transport: string,
): Readonly<{ facet: RuntimeTransportFacet<MachineClient>; close(): void }> => {
  let channel: MachineChannelClient | undefined;
  const get = (): MachineChannelClient => {
    if (!option?.available) {
      throw new Error(`${transport}: machines route is unavailable`);
    }
    channel ??= option.connect();
    return channel;
  };
  const client: MachineClient = {
    listProviders: async (input) => get().listProviders(input),
    discover: (input) => get().discover(input),
    beginBinding: async (input) => get().beginBinding(input),
    removeBinding: async (input) => get().removeBinding(input),
    list: async (input) => get().list(input),
    get: async (input) => get().get(input),
    watch: (input) => get().watch(input),
    captureStill: async (input) => get().captureStill(input),
    checkJob: async (input) => get().checkJob(input),
    requestJob: async (input) => get().requestJob(input),
    listJobs: async (input) => get().listJobs(input),
    watchJobs: (input) => get().watchJobs(input),
    resolveJob: async (input) => get().resolveJob(input),
    withdrawJob: async (input) => get().withdrawJob(input),
    applyAction: async (input) => get().applyAction(input),
    approveAction: async (input) => get().approveAction(input),
    stop: async (input) => get().stop(input),
    beginHold: async (input) => get().beginHold(input),
    renewHold: async (input) => get().renewHold(input),
    endHold: async (input) => get().endHold(input),
    reconcileOperation: async (input) => get().reconcileOperation(input),
    setTesting: async (input) => get().setTesting(input),
  };
  return {
    facet: option?.available ? { available: true, ...client } : (option ?? { available: false, reason: 'unsupported' }),
    close: () => {
      channel?.close();
    },
  };
};
