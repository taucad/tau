import { defineConfiguration } from '@taucad/runtime/configuration';
import { defineMachine } from '@taucad/runtime/machine';
import type { MachineDiscoveryEvent, MachineFailureCode } from '@taucad/runtime/machine';
import { z } from 'zod';

import { carveraManifest, carveraSubmissionConfiguration } from '#carvera.manifest.js';
import { carveraDiscoveryPort, carveraIdleDrop, carveraTcpPort, parseCarveraBroadcast } from '#carvera.protocol.js';

/** Nothing beyond where the machine is, which is the discovery endpoint. @internal */
export const carveraBindingConfiguration = defineConfiguration({
  id: 'makera.carvera.binding',
  version: '2.0.0',
  schema: z.object({}),
  ui: { version: 1, rjsf: {} },
});

/** Milliseconds one discovery listens for broadcasts; the machine sends one a second. */
const discoveryListen = 5000;
/** Milliseconds a found machine stays a candidate without another broadcast. */
const candidateLifetime = 5000;
/** Milliseconds an entered address stays a candidate: long enough to bind it. */
const manualCandidateLifetime = 30_000;

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
    if (input.endpoint !== undefined) {
      // A person's entry is taken as it is, as broadcasts do not cross subnets; connecting proves a Carvera answers.
      // A serial endpoint finds nothing: the host refuses one before it reaches a network provider.
      if (input.endpoint.transport !== 'network') {
        return;
      }
      const observedAt = runtime.clock.now();
      yield {
        type: 'found',
        candidate: {
          id: `carvera:${input.endpoint.address}`,
          name: `Carvera at ${input.endpoint.address}`,
          endpoint: { ...input.endpoint, interface: 'manual' },
          claimedIdentity: { model: 'Carvera' },
          observedAt,
          expiresAt: new Date(Date.parse(observedAt) + manualCandidateLifetime).toISOString(),
        },
      };
      return;
    }
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
      if (broadcast === undefined) {
        continue;
      }
      const observedAt = runtime.clock.now();
      const id = `carvera:${address}`;
      yield {
        type: seen.has(id) ? 'updated' : 'found',
        candidate: {
          id,
          name: broadcast.name,
          endpoint: { transport: 'network', address, interface: datagram.peer.interface },
          claimedIdentity: { model: 'Carvera' },
          observedAt,
          expiresAt: new Date(Date.parse(observedAt) + candidateLifetime).toISOString(),
        },
      };
      seen.add(id);
    }
  },
  async connect(input, runtime) {
    const { endpoint } = input.candidate;
    if (endpoint.transport !== 'network') {
      throw Object.assign(new Error('A Carvera is reached over the network, not a serial port.'), {
        code: 'MACHINE_UNAVAILABLE' satisfies MachineFailureCode,
      });
    }
    const { connectCarveraSession } = await import('#carvera.session.js');
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
          endpoint: { address: endpoint.address, port: endpoint.port ?? carveraTcpPort },
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
