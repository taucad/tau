/**
 * Discovery and binding: the candidates a discovery reports, the ceremony that binds one, and the removal that
 * unbinds a machine. A new binding is handed to reconnect supervision, which keeps it connected from then on.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';

import type { CacheValue } from '@taucad/cache-core';
import { z } from 'zod';

import { cloneBoundedJson } from '@taucad/parameters/json';
import { digest, identity } from '#host/node-machine-context.js';
import type {
  CompleteNodeMachineBindingInput,
  NodeMachineHostContext,
  RemoveNodeMachineBindingInput,
} from '#host/node-machine-context.js';
import { bindingBusyStates } from '#host/node-machine-jobs.js';
import { machineDisplayName } from '#host/node-machine-store.js';
import type { MachineBindingRecord } from '#host/node-machine-store.js';
import type { NodeMachineSupervision } from '#host/node-machine-supervision.js';
import type { MachineChannelHostOperations } from '#machines/machine-channel.js';
import type { MachineBindingRemoval } from '#machines/machine-client.js';
import { machineCredentialReference } from '#machines/machine-credential.js';
import { machineCandidateEndpointSchema, machineEndpointSchema } from '#machines/machine.js';
import type { MachineBindingOutcome, MachineCandidate } from '#machines/machine.js';

/* A live discovery candidate: every provider names its endpoint's transport. Bindings stored before R17 are read by
 * the store's own, lenient schema. */
const candidateSchema = z.strictObject({
  id: identity,
  name: identity,
  endpoint: machineCandidateEndpointSchema,
  claimedIdentity: z.strictObject({
    serial: identity.optional(),
    model: identity.optional(),
  }),
  observedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
});
const trustSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('system') }),
  z.strictObject({ type: z.literal('pinned'), digest }),
]);
const discoveryEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.enum(['found', 'updated']),
    candidate: candidateSchema,
  }),
  z.strictObject({
    type: z.literal('lost'),
    candidateId: identity,
    observedAt: z.iso.datetime({ offset: true }),
  }),
]);
const discoveryLimits = {
  code: 'NODE_MACHINE_DISCOVERY',
  maximumDepth: 8,
  maximumNodes: 1024,
  maximumCharacters: 32_768,
};
/** The host alerts whose remedy is binding the machine again. */
const rebindRemedies: ReadonlySet<string> = new Set(['tau.rebind-required', 'tau.reconnect-required']);
const connectionContextSchema = z.strictObject({
  secretRef: identity,
  serviceTrust: z.record(identity, trustSchema).refine((value) => Object.keys(value).length <= 8),
});

/** What discovery and binding serve: the channel's operations and the host's trusted ceremony completion. @internal */
export type NodeMachineBindings = Readonly<{
  operations: Pick<MachineChannelHostOperations, 'discover' | 'beginBinding' | 'removeBinding'>;
  completeBinding(input: CompleteNodeMachineBindingInput): Promise<MachineBindingOutcome>;
  describeBinding(ceremonyId: string): Readonly<{ providerId: string; candidate: MachineCandidate }> | undefined;
  /** Unbind one machine; a channel removal checks its admission through `assertCurrent` once it is queued. */
  removeBinding(
    removal: RemoveNodeMachineBindingInput & Readonly<{ assertCurrent?(): void }>,
  ): Promise<MachineBindingRemoval>;
  /** Forget every discovered candidate and pending ceremony, as the host closes. */
  clear(): void;
}>;

/**
 * Serve discovery and binding over the host's shared state.
 * @internal
 * @param context - The host's shared state.
 * @param supervise - Reconnect supervision, which takes over each machine a ceremony binds.
 * @returns The binding operations.
 */
export const createNodeMachineBindings = (
  context: NodeMachineHostContext,
  supervise: NodeMachineSupervision['supervise'],
): NodeMachineBindings => {
  const {
    connectedSessions,
    definitionOf,
    directory,
    effectQueue,
    jobs,
    machines,
    now,
    operations,
    preparations,
    providerSources,
    report,
    sessionLost,
    stillCaptureTimes,
    store,
    supervisors,
  } = context;
  type DiscoveredCandidate = Readonly<{
    providerId: string;
    configuration: CacheValue;
    candidate: MachineCandidate;
  }>;
  type PendingCeremony = DiscoveredCandidate & Readonly<{ name: string }>;
  const discovered = new Map<string, DiscoveredCandidate>();
  const ceremonies = new Map<string, PendingCeremony>();
  // Whether the host lists an alert on this machine whose remedy is binding it again (its address answers as another
  // machine or with another certificate, or reconnecting would reset its controller): a ceremony then confirms it.
  const asksRebind = async (machineId: string): Promise<boolean> => {
    const listed = await directory.snapshot();
    const entry = listed.entries.find((candidate) => candidate.machineId === machineId);
    return entry?.snapshot.alerts.some(({ code }) => rebindRemedies.has(code)) === true;
  };
  // Mark a candidate whose claimed identity already has a saved credential; a failed lookup leaves it unmarked.
  const withCredentialFlag = async (providerId: string, candidate: MachineCandidate): Promise<MachineCandidate> => {
    const { serial } = candidate.claimedIdentity;
    const credentials = context.runtime?.credentials;
    if (serial === undefined || !credentials) {
      return candidate;
    }
    try {
      return (await credentials.has(machineCredentialReference(providerId, serial)))
        ? Object.freeze({ ...candidate, credential: 'saved' })
        : candidate;
    } catch (error) {
      report(error);
      return candidate;
    }
  };
  const completeBinding = async (bindingInput: CompleteNodeMachineBindingInput): Promise<MachineBindingOutcome> => {
    if (context.isClosed() || !context.runtime) {
      throw new Error('MACHINE_BINDING_UNAVAILABLE');
    }
    const ceremonyId = identity.parse(bindingInput.ceremonyId);
    const pending = ceremonies.get(ceremonyId);
    if (!pending) {
      throw new Error('MACHINE_BINDING_UNKNOWN_CEREMONY');
    }
    const connection = Object.freeze(
      connectionContextSchema.parse({
        secretRef: bindingInput.secretRef,
        serviceTrust: bindingInput.serviceTrust,
      }),
    );
    const definition = await definitionOf(pending.providerId);
    const abort = new AbortController();
    const session = await definition.connect(
      {
        candidate: pending.candidate,
        configuration: pending.configuration,
        connection,
        purpose: 'bind',
        signal: abort.signal,
      },
      context.runtime.connection(),
    );
    const lost = Promise.withResolvers<void>();
    let bound: MachineBindingRecord | undefined;
    try {
      const descriptor = await session.getDescriptor({ signal: abort.signal });
      if (pending.candidate.claimedIdentity.serial && pending.candidate.claimedIdentity.serial !== descriptor.id) {
        throw new Error('NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CHANGED');
      }
      // `machine.json` is written before the session attaches: a crash after this leaves a whole binding that
      // reconnects at the next start, never a live session the store does not know.
      // `created`: this ceremony made the binding, so a failed attach discards it; a confirmed existing one is kept.
      const { record: boundRecord, created } = await effectQueue.queueFor('bindings', async () => {
        if (context.isClosed()) {
          throw new Error('MACHINE_BINDING_UNAVAILABLE');
        }
        // Identity is `{ providerId, physicalId }` in each `machine.json`, never a directory name.
        const existing = [...machines.values()].find(
          ({ record }) => record.providerId === pending.providerId && record.physicalId === descriptor.id,
        );
        if (existing) {
          // A claimed identity is pinned to the endpoint it was bound at, and a machine the host stopped connecting
          // to waits for a person: either way this ceremony is the person confirming the same machine, at its new
          // endpoint or with its new certificate, so the binding keeps its id. Any other second binding is refused.
          if (
            providerSources.get(pending.providerId)?.manifest.connection.identity !== 'claimed' &&
            !(await asksRebind(existing.record.id))
          ) {
            throw new Error('NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CONFLICT');
          }
          return { record: existing.record, created: false };
        }
        const made = await store.createMachine({
          name: pending.name,
          providerId: pending.providerId,
          physicalId: descriptor.id,
          candidate: pending.candidate,
          configuration: pending.configuration,
          connection,
          // The first report writes the last-known identity, with the revision the host derives.
          boundAt: now(),
        });
        machines.set(made.record.id, {
          record: made.record,
          operations: { status: 'open', log: made.log },
        });
        return { record: made.record, created: true };
      });
      bound = boundRecord;
      const { id: machineId } = bound;
      const attach = async (): Promise<void> =>
        directory.attach({
          machineId,
          name: boundRecord.name,
          providerId: boundRecord.providerId,
          observations: providerSources.get(boundRecord.providerId)?.manifest.observations ?? [],
          qualifications: providerSources.get(boundRecord.providerId)?.manifest.qualifications ?? [],
          session,
          onLost() {
            sessionLost.emit(machineId);
            lost.resolve();
          },
        });
      if (created) {
        try {
          await attach();
        } catch (error) {
          machines.delete(machineId);
          await store.discardMachine(machineId).catch(report);
          throw error;
        }
      } else {
        // As supervision swaps a session: on the machine's queue, so it never changes under an in-flight transfer,
        // start or action. A job still waiting on the binding keeps it (its unproven transfer or start settles through
        // the new session), but a streamed run the live session is feeding refuses: replacing it would cut the run.
        // A live session it replaces is lost as any other is, so its holds end.
        bound = await effectQueue.queueFor(`machine:${machineId}`, async () => {
          const machine = machines.get(machineId);
          if (!machine || context.isClosed()) {
            throw new Error('MACHINE_BINDING_UNAVAILABLE');
          }
          const live = connectedSessions.get(machineId);
          if (
            live?.jobs.type === 'supported' &&
            live.jobs.delivery === 'streamed' &&
            [...jobs.values()].some((job) => job.machineId === machineId && job.run?.outcome === 'running')
          ) {
            throw new Error('MACHINE_BINDING_BUSY');
          }
          // The old reconnect loop ends once the new endpoint is durable, still on this queue, so an attempt it has in
          // flight (at the old endpoint) never attaches after this one. A failed write leaves it watching the live
          // session; once it has stopped, a failure hands the machine back to supervision on the backoff.
          let stopped = false;
          try {
            machine.record = await store.writeMachine({
              ...machine.record,
              candidate: pending.candidate,
              configuration: pending.configuration,
              connection,
            });
            supervisors.get(machineId)?.stop.abort();
            stopped = true;
            if (live) {
              connectedSessions.delete(machineId);
              sessionLost.emit(machineId);
            }
            await attach();
          } catch (error) {
            if (stopped) {
              supervise(machine.record, undefined);
            }
            throw error;
          }
          connectedSessions.set(machineId, session);
          return machine.record;
        });
      }
      connectedSessions.set(bound.id, session);
      // Binding again is the person remedy for a moved or reset-prone machine: its host alerts end here.
      await directory.update({ machineId, alerts: [] }).catch(report);
      supervise(bound, lost.promise);
      ceremonies.delete(ceremonyId);
      return Object.freeze({ status: 'bound', machineId: bound.id });
    } catch (error) {
      if (bound === undefined || connectedSessions.get(bound.id) !== session) {
        await session.close().catch(() => undefined);
      }
      throw error;
    }
  };
  // Unbind one machine and forget its credential once no other binding uses it. The directory entry goes first
  // (removing it closes the session the directory owns), then the machine's directory is moved aside: a crash between
  // the two leaves a whole binding that reconnects, never a listed machine without one.
  const removeBoundMachine = async (
    removal: RemoveNodeMachineBindingInput & Readonly<{ assertCurrent?(): void }>,
  ): Promise<MachineBindingRemoval> => {
    const machineId = identity.parse(removal.machineId);
    // Queued behind this machine's in-flight upload, start or control.
    return effectQueue.queueFor(`machine:${machineId}`, async () => {
      if (context.isClosed()) {
        throw new Error('MACHINE_BINDING_UNAVAILABLE');
      }
      removal.assertCurrent?.();
      const machine = machines.get(machineId);
      if (!machine) {
        throw new Error('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
      }
      // A machine whose journal is unreadable can never settle its jobs, so they do not hold it.
      if (
        machine.operations.status === 'open' &&
        [...jobs.values()].some((job) => job.machineId === machineId && bindingBusyStates.has(job.state))
      ) {
        throw new Error('MACHINE_BINDING_BUSY');
      }
      // Nothing reconnects a removed binding; an attempt in flight is abandoned.
      supervisors.get(machineId)?.stop.abort();
      supervisors.delete(machineId);
      // A retry after a refused move finds the directory entry already gone.
      const listed = await directory.snapshot();
      if (listed.entries.some((entry) => entry.machineId === machineId)) {
        await directory.remove({ machineId });
      }
      connectedSessions.delete(machineId);
      await store.removeMachine(machineId);
      machines.delete(machineId);
      stillCaptureTimes.delete(machineId);
      for (const [operationId, operation] of operations) {
        if (operation.planned.machineId === machineId) {
          operations.delete(operationId);
        }
      }
      for (const [preparedId, preparation] of preparations) {
        if (preparation.prepared.machineId === machineId) {
          preparations.delete(preparedId);
        }
      }
      for (const [jobId, job] of jobs) {
        if (job.machineId === machineId) {
          jobs.delete(jobId);
        }
      }
      const { secretRef } = machine.record.connection;
      if (
        secretRef !== 'none' &&
        ![...machines.values()].some(({ record }) => record.connection.secretRef === secretRef)
      ) {
        try {
          await context.runtime?.credentials?.forget(secretRef);
        } catch (error) {
          report(error);
        }
      }
      return Object.freeze({ status: 'removed', machineId });
    });
  };
  return {
    operations: {
      async *discover(operationInput) {
        const source = providerSources.get(operationInput.providerId);
        if (!source || !context.runtime || context.unavailableProviders.has(source.id)) {
          throw new Error('MACHINE_PROVIDER_UNAVAILABLE');
        }
        // Addressed discovery reaches the provider only in the transport it connects over.
        const parsedEndpoint =
          operationInput.endpoint === undefined ? undefined : machineEndpointSchema.safeParse(operationInput.endpoint);
        const endpoint = parsedEndpoint?.data;
        if (
          parsedEndpoint !== undefined &&
          (endpoint === undefined || endpoint.transport !== source.manifest.connection.transport)
        ) {
          throw new Error('MACHINE_DISCOVERY_ENDPOINT_INVALID');
        }
        const definition = await definitionOf(source.id);
        const result = await definition.bindingConfiguration.schema['~standard'].validate(operationInput.configuration);
        if (result.issues) {
          throw new Error('MACHINE_BINDING_CONFIGURATION_INVALID');
        }
        const configuration = cloneBoundedJson(result.value, {
          code: 'NODE_MACHINE_BINDING_CONFIGURATION',
          maximumDepth: 20,
          maximumNodes: 2048,
          maximumCharacters: 65_536,
        });
        for await (const raw of definition.discover(
          { configuration, ...(endpoint === undefined ? {} : { endpoint }), signal: operationInput.signal },
          context.runtime.discovery,
        )) {
          operationInput.signal.throwIfAborted();
          operationInput.admitted.assertCurrent();
          const event = Object.freeze(discoveryEventSchema.parse(cloneBoundedJson(raw, discoveryLimits)));
          const key = event.type === 'lost' ? event.candidateId : event.candidate.id;
          if (event.type === 'lost') {
            discovered.delete(key);
          } else {
            if (!discovered.has(key) && discovered.size >= 256) {
              throw new Error('MACHINE_DISCOVERY_CANDIDATE_LIMIT');
            }
            discovered.set(
              key,
              Object.freeze({
                providerId: source.id,
                configuration,
                candidate: event.candidate,
              }),
            );
          }
          yield event.type === 'lost'
            ? event
            : Object.freeze({
                ...event,
                candidate: await withCredentialFlag(source.id, event.candidate),
              });
        }
      },
      async beginBinding(operationInput) {
        if (!context.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const name = machineDisplayName(operationInput.name);
        if (name.length === 0 || name !== operationInput.name.trim() || !name.isWellFormed()) {
          throw new Error('MACHINE_BINDING_NAME_INVALID');
        }
        const selected = discovered.get(operationInput.candidate.id);
        if (
          !selected ||
          Date.parse(selected.candidate.expiresAt) <= Date.parse(context.runtime.discovery.clock.now()) ||
          // The saved-credential flag is this host's projection, not part of what the provider reported.
          JSON.stringify(selected.candidate) !==
            JSON.stringify({
              ...operationInput.candidate,
              credential: undefined,
            })
        ) {
          throw new Error('MACHINE_BINDING_CANDIDATE_EXPIRED');
        }
        const existing = [...machines.values()].find(
          ({ record }) => record.providerId === selected.providerId && record.candidate.id === selected.candidate.id,
        );
        // Bound already, unless the host asks a person to bind it again (same address, new certificate).
        if (existing && !(await asksRebind(existing.record.id))) {
          return Object.freeze({
            status: 'bound',
            machineId: existing.record.id,
          });
        }
        if (ceremonies.size >= 64) {
          throw new Error('MACHINE_BINDING_CEREMONY_LIMIT');
        }
        const ceremonyId = randomUUID();
        ceremonies.set(ceremonyId, Object.freeze({ ...selected, name }));
        return Object.freeze({
          status: 'operator-action-required',
          ceremonyId,
        });
      },
      async removeBinding(operationInput) {
        return removeBoundMachine({
          machineId: operationInput.machineId,
          assertCurrent() {
            operationInput.signal.throwIfAborted();
            operationInput.admitted.assertCurrent();
          },
        });
      },
    },
    completeBinding,
    describeBinding(ceremonyId) {
      const pending = ceremonies.get(ceremonyId);
      return pending
        ? Object.freeze({
            providerId: pending.providerId,
            candidate: pending.candidate,
          })
        : undefined;
    },
    removeBinding: removeBoundMachine,
    clear() {
      discovered.clear();
      ceremonies.clear();
    },
  };
};
