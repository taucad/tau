import { defineConfiguration } from '@taucad/runtime/configuration';
import { defineMachine } from '@taucad/runtime/machine';
import type { MachineDiscoveryEvent } from '@taucad/runtime/machine';
import { z } from 'zod';

import { carveraManifest, carveraSubmissionConfiguration } from '#carvera.manifest.js';
import { carveraDiscoveryPort, carveraIdleDrop, carveraTcpPort, parseCarveraBroadcast } from '#carvera.protocol.js';

/** The address a binding is pinned to; absent while discovering every Carvera on the network. @internal */
export const carveraBindingConfiguration = defineConfiguration({
  id: 'makera.carvera.binding',
  version: '1.0.0',
  schema: z.object({
    address: z
      .string()
      .min(1)
      .max(253)
      .optional()
      .meta({ title: 'Address', description: 'The machine’s IPv4 address.' }),
  }),
  ui: { version: 1, rjsf: {} },
});

/** Milliseconds one discovery listens for broadcasts; the machine sends one a second. */
const discoveryListen = 5000;
/** Milliseconds a found machine stays a candidate without another broadcast. */
const candidateLifetime = 5000;

/** Makera Carvera C1 on stock firmware 1.0.7, over its LAN protocol (TCP 2222, UDP 3333 discovery). @public */
export const carveraMachine = defineMachine({
  id: 'makera-carvera',
  name: 'Makera Carvera LAN',
  version: '1.0.0',
  protocolVersion: 2,
  vendor: 'Makera',
  manifest: carveraManifest(),
  bindingConfiguration: carveraBindingConfiguration,
  submissionConfiguration: carveraSubmissionConfiguration,
  async *discover(input, runtime): AsyncIterable<MachineDiscoveryEvent> {
    const seen = new Set<string>();
    for await (const datagram of runtime.listenDatagrams({
      port: carveraDiscoveryPort,
      durationMs: discoveryListen,
      maximumDatagrams: 256,
      maximumDatagramBytes: 256,
      signal: input.signal,
    })) {
      const broadcast = parseCarveraBroadcast(datagram.bytes);
      // The observed sender is the address; the broadcast's own field is a claim and may name the other subnet.
      const { address } = datagram.peer;
      if (
        broadcast === undefined ||
        (input.configuration.address !== undefined && input.configuration.address !== address)
      ) {
        continue;
      }
      const observedAt = runtime.clock.now();
      const id = `carvera:${address}`;
      yield {
        type: seen.has(id) ? 'updated' : 'found',
        candidate: {
          id,
          name: broadcast.name,
          endpoint: { address, interface: datagram.peer.interface },
          claimedIdentity: { model: 'Carvera' },
          observedAt,
          expiresAt: new Date(Date.parse(observedAt) + candidateLifetime).toISOString(),
        },
      };
      seen.add(id);
    }
  },
  async connect(input, runtime) {
    const { connectCarveraSession } = await import('#carvera.session.js');
    const address = input.configuration.address ?? input.candidate.endpoint.address;
    return connectCarveraSession({
      id: input.candidate.id,
      name: input.candidate.name,
      manifest: carveraManifest(),
      clock: runtime.clock,
      async *readArtifact(read) {
        yield* runtime.readArtifact(read);
      },
      log: async (entry) => runtime.log(entry),
      open: async (signal) =>
        runtime.connectStream({
          endpoint: { address, port: carveraTcpPort },
          transport: 'tcp',
          trust: { type: 'system' },
          connectTimeout: 5000,
          // The machine drops a silent client after 10 s; the session polls well inside that.
          idleTimeout: carveraIdleDrop,
          maximumReadBytes: 256 * 1024 * 1024,
          maximumWriteBytes: 256 * 1024 * 1024,
          signal,
        }),
    });
  },
});
