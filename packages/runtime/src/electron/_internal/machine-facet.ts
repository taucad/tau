/**
 * The machines facet a transport client carries beside the CAD channel.
 *
 * One shape, two wires: the WebSocket client builds the same lazily-connected
 * projection inline (`transport/web-socket-client.ts`), and the Electron client
 * takes it from here. The channel is dialled on first use — a renderer that
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
): Readonly<{ facet: RuntimeTransportFacet<MachineClient>; close(): void }> => {
  let channel: MachineChannelClient | undefined;
  const get = (): MachineChannelClient => {
    if (!option?.available) {
      throw new Error('electronUtilityTransport: machines route is unavailable');
    }
    channel ??= option.connect();
    return channel;
  };
  const facet: RuntimeTransportFacet<MachineClient> = option?.available
    ? {
        available: true,
        listProviders: async (input) => get().listProviders(input),
        discover: (input) => get().discover(input),
        beginBinding: async (input) => get().beginBinding(input),
        preparePrint: async (input) => get().preparePrint(input),
        uploadPrint: async (input) => get().uploadPrint(input),
        startPrint: async (input) => get().startPrint(input),
        reconcileOperation: async (input) => get().reconcileOperation(input),
        controlRun: async (input) => get().controlRun(input),
        captureStill: async (input) => get().captureStill(input),
        list: async (input) => get().list(input),
        get: async (input) => get().get(input),
        watch: (input) => get().watch(input),
        requestPrint: async (input) => get().requestPrint(input),
        listPrintRequests: async (input) => get().listPrintRequests(input),
        watchPrintRequests: (input) => get().watchPrintRequests(input),
        resolvePrintRequest: async (input) => get().resolvePrintRequest(input),
        withdrawPrintRequest: async (input) => get().withdrawPrintRequest(input),
      }
    : (option ?? { available: false, reason: 'unsupported' });
  return {
    facet,
    close: () => {
      channel?.close();
    },
  };
};
