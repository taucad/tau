/**
 * The operation journal at work: how an action, a stop, a hold, a transfer and a start are admitted, journaled,
 * sent once and then settled from the machine's own reports.
 *
 * Every operation is idempotent by its caller-retained id: the same id with the same input returns the operation's
 * receipt and sends nothing; a different input under the same id is refused with `MACHINE_OPERATION_ID_CONFLICT`.
 * Admission refusals send nothing and are not journaled. A sent operation is never resent: an unknown reply or an
 * action confirmed by observation stays `confirming` until the machine's reports (`confirm`) or a provider lookup
 * (`reconcile`) settle it, and after 180 seconds unproven it is `attention`, which later proof still settles.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';

import { checkMachineAction } from '#machines/machine-check.js';
import { isUnattendedAction, standardMachineActions } from '#machines/machine-actions.js';
import type {
  MachineActionDescriptor,
  MachineActionSafety,
  MachineAuthority,
  MachineFailure,
  MachineHoldDescriptor,
} from '#machines/machine-actions.js';
import { identity } from '#host/node-machine-context.js';
import type { NodeMachineHostContext } from '#host/node-machine-context.js';
import {
  applyOperationResult,
  confirmationWindow,
  machineError,
  operationInputDigest,
  operationReceipt,
  operationRecord,
  parseJournalEvent,
  providerFailure,
} from '#host/node-machine-operations.js';
import type { NodeMachineOperationPlanned, NodeMachineOperationState } from '#host/node-machine-operations.js';
import type { AdmittedHostOperation } from '#host/host-admission.js';
import { parseMachineOperationReceipt } from '#machines/machine-channel.js';
import type { MachineChannelHostOperations } from '#machines/machine-channel.js';
import type { MachineDirectoryEntry } from '#machines/machine-directory.js';
import type {
  MachineOperation,
  MachineOperationKind,
  MachineOperationReceipt,
  MachineRequester,
} from '#machines/machine-jobs.js';
import { machineActionDefinitionOf } from '#machines/machine.js';
import type { MachineCommandReceipt, MachineProviderHold, MachineSession } from '#machines/machine.js';

type Admitted = Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>;

/** What an admission decides: a refusal, or how to send. @internal */
export type NodeMachineAdmission =
  | Readonly<{ refusal: MachineFailure }>
  | Readonly<{
      send(): Promise<MachineCommandReceipt>;
      /** `confirming`: accepted only once the machine's reports show it. `open`: the result comes later (a hold). */
      onAccepted?: 'accepted' | 'confirming' | 'open';
      action?: NodeMachineOperationPlanned['action'];
    }>;

/** One operation to run once. @internal */
export type NodeMachineRunInput = Readonly<{
  machineId: string;
  kind: MachineOperationKind;
  operationId: string;
  /** What was asked; its digest makes the id idempotent. */
  intent: Readonly<Record<string, unknown>>;
  requestedBy?: MachineRequester;
  attended?: boolean;
  /** Queue behind the machine's other work; a stop never does. */
  machineQueue: boolean;
  admitted: AdmittedHostOperation;
  signal: AbortSignal;
  admit(): Promise<NodeMachineAdmission>;
}>;

/** What the operation journal serves. @internal */
export type NodeMachineOperations = Readonly<{
  operations: Pick<
    MachineChannelHostOperations,
    'applyAction' | 'stop' | 'beginHold' | 'renewHold' | 'endHold' | 'reconcileOperation' | 'setTesting'
  >;
  run(input: NodeMachineRunInput): Promise<MachineOperationReceipt>;
  /** Publish a machine's recent operations into its directory entry. */
  publish(machineId: string): Promise<void>;
  /** End every hold of a machine (or of every machine), telling the provider to release. */
  releaseHolds(machineId?: string): Promise<void>;
  close(): void;
}>;

const maximumRecent = 64;
const authorityRank: Readonly<Record<MachineAuthority, number>> = { agent: 0, 'approved-agent': 1, person: 2 };

const caller = (admitted: AdmittedHostOperation, requestedBy: MachineRequester): 'person' | 'agent' =>
  admitted.actor.kind === 'agent' || requestedBy.kind === 'agent' ? 'agent' : 'person';

/**
 * The floor the host admits a descriptor under: never below its standard family's, except where the host's own
 * low-risk list lets an agent act.
 */
const effectiveSafety = (
  componentKind: string,
  descriptor: MachineActionDescriptor | MachineHoldDescriptor,
): MachineActionSafety => {
  const family = (
    standardMachineActions as Readonly<Record<string, { authority: MachineAuthority; attended: boolean }>>
  )[descriptor.id];
  if (family === undefined || ('scope' in descriptor && isUnattendedAction(componentKind, descriptor))) {
    return descriptor.safety;
  }
  return {
    ...descriptor.safety,
    authority:
      authorityRank[family.authority] > authorityRank[descriptor.safety.authority]
        ? family.authority
        : descriptor.safety.authority,
    attended: descriptor.safety.attended || family.attended,
  };
};

// The entry with every descriptor at the floor the host admits it under, and testing only for a person.
const admissionEntry = (entry: MachineDirectoryEntry, who: 'person' | 'agent'): MachineDirectoryEntry => {
  const { capabilities } = entry.descriptor;
  const kindOf = (componentId: string): string =>
    capabilities.components.find((component) => component.id === componentId)?.kind ?? '';
  return {
    ...entry,
    testing: who === 'person' && entry.testing === true,
    descriptor: {
      ...entry.descriptor,
      capabilities: {
        ...capabilities,
        actions: capabilities.actions.map((action) => ({
          ...action,
          safety: effectiveSafety(kindOf(action.componentId), action),
        })),
        holds: capabilities.holds.map((hold) => ({ ...hold, safety: effectiveSafety(kindOf(hold.componentId), hold) })),
      },
    },
  };
};

const refuse = (code: MachineFailure['code'], message: string): NodeMachineAdmission => ({
  refusal: { code, message },
});

/**
 * Serve the operation journal over the host's shared state.
 * @internal
 * @param context - The host's shared state.
 * @param onResult - Told after every recorded result, so a job can follow its transfer and start.
 * @returns The journal's operations.
 */
export const createNodeMachineOperations = (
  context: NodeMachineHostContext,
  onResult: (operation: NodeMachineOperationState) => Promise<void>,
): NodeMachineOperations => {
  const { connectedSessions, currentEntry, definitionOf, directory, effectQueue, machines, now, operations, report } =
    context;
  const settlement = new AbortController();

  const publish = async (machineId: string): Promise<void> => {
    const recent: MachineOperation[] = [...operations.values()]
      .filter(({ planned }) => planned.machineId === machineId)
      .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, maximumRecent)
      .map(operationRecord);
    await directory.update({ machineId, operations: recent });
  };

  const record = async (
    operation: NodeMachineOperationState,
    state: 'accepted' | 'rejected' | 'confirming' | 'attention',
    receipt: MachineOperationReceipt,
    source: 'attempt' | 'confirmation' | 'reconciliation' | 'escalation',
  ): Promise<void> => {
    const { log } = context.usableMachine(operation.planned.machineId, 'MACHINE_UNAVAILABLE');
    const event = parseJournalEvent({
      type: 'machine-operation-result',
      operationId: operation.planned.operationId,
      source,
      state,
      receipt,
      observedAt: now(),
    });
    if (event.type !== 'machine-operation-result') {
      throw new Error('NODE_MACHINE_OPERATION_INVALID');
    }
    // Checked before it is written, so the journal never holds a result replay would refuse.
    const next = { ...operation };
    applyOperationResult(next, event);
    await log.append(event);
    Object.assign(operation, next);
    await publish(operation.planned.machineId);
    await onResult(operation);
  };

  const refusedReceipt = (
    input: Pick<NodeMachineRunInput, 'machineId' | 'kind' | 'operationId'>,
    failure: MachineFailure,
  ): MachineOperationReceipt =>
    parseMachineOperationReceipt({
      operationId: input.operationId,
      machineId: input.machineId,
      kind: input.kind,
      status: 'rejected',
      ...failure,
      observedAt: now(),
    });

  const run = async (input: NodeMachineRunInput): Promise<MachineOperationReceipt> => {
    const operationId = identity.parse(input.operationId);
    const machineId = identity.parse(input.machineId);
    const inputDigest = await operationInputDigest({ machineId, kind: input.kind, intent: input.intent });
    const queues = input.machineQueue
      ? [`operation:${operationId}`, `machine:${machineId}`]
      : [`operation:${operationId}`];
    return effectQueue.queueForMany(queues, async () => {
      const existing = operations.get(operationId);
      if (
        existing &&
        (existing.planned.inputDigest !== inputDigest ||
          existing.planned.machineId !== machineId ||
          existing.planned.kind !== input.kind)
      ) {
        return refusedReceipt(input, {
          code: 'MACHINE_OPERATION_ID_CONFLICT',
          message: 'This operation id was already used for something else.',
        });
      }
      if (existing?.receipt) {
        return existing.receipt;
      }
      if (existing && existing.state !== 'planned') {
        throw new Error('MACHINE_OPERATION_UNRESOLVED');
      }
      const machine = machines.get(machineId);
      if (!machine) {
        return refusedReceipt(input, { code: 'MACHINE_UNAVAILABLE', message: 'This machine is not bound here.' });
      }
      const { record: binding, log } = context.usableMachine(machineId, 'MACHINE_UNAVAILABLE');
      const admission = await input.admit();
      if ('refusal' in admission) {
        return refusedReceipt(input, admission.refusal);
      }
      input.signal.throwIfAborted();
      input.admitted.assertCurrent();
      let operation = existing;
      if (!operation) {
        const planned = parseJournalEvent({
          type: 'machine-operation-planned',
          machineId,
          providerId: binding.providerId,
          physicalMachineId: binding.physicalId,
          operationId,
          kind: input.kind,
          inputDigest,
          intent: input.intent,
          ...(input.requestedBy === undefined ? {} : { requestedBy: input.requestedBy }),
          ...(input.attended === undefined ? {} : { attended: input.attended }),
          ...(admission.action === undefined ? {} : { action: admission.action }),
          plannedAt: now(),
        });
        if (planned.type !== 'machine-operation-planned') {
          throw new Error('NODE_MACHINE_OPERATION_INVALID');
        }
        await log.append(planned);
        operation = { planned, state: 'planned', updatedAt: planned.plannedAt };
        operations.set(operationId, operation);
      }
      const sendingAt = now();
      await log.append({ type: 'machine-operation-sending', operationId, observedAt: sendingAt });
      operation.state = 'sending';
      operation.updatedAt = sendingAt;
      await publish(machineId);
      let receipt: MachineOperationReceipt;
      try {
        receipt = operationReceipt(operation.planned, await admission.send());
      } catch {
        receipt = parseMachineOperationReceipt({
          operationId,
          machineId,
          kind: input.kind,
          status: 'unknown',
          reason: 'The reply was lost after the command may have been sent.',
          observedAt: now(),
        });
      }
      if (receipt.status === 'accepted' && admission.onAccepted === 'open') {
        return receipt;
      }
      await record(
        operation,
        receipt.status === 'rejected'
          ? 'rejected'
          : receipt.status === 'unknown' || admission.onAccepted === 'confirming'
            ? 'confirming'
            : 'accepted',
        receipt,
        'attempt',
      );
      return receipt;
    });
  };

  // Settle one operation from what the machine has reported; nothing is ever sent. Escalates one left unproven.
  const settleNow = async (operation: NodeMachineOperationState, signal: AbortSignal): Promise<void> => {
    const { planned } = operation;
    if (operation.state !== 'confirming' && operation.state !== 'attention') {
      return;
    }
    const session = connectedSessions.get(planned.machineId);
    const intent = planned.intent as Readonly<Record<string, unknown>>;
    if (session && planned.kind === 'action' && planned.action?.confirms === 'observation') {
      if (session.actions.type === 'supported') {
        const answer = session.actions.confirm({
          operationId: planned.operationId,
          componentId: planned.action.componentId,
          action: planned.action.id,
          version: Number(intent['version']),
          expectedRunId: (intent['expectedRunId'] as string | null | undefined) ?? null,
          parameters: intent['parameters'],
        });
        if (answer.status === 'confirmed') {
          await record(
            operation,
            'accepted',
            parseMachineOperationReceipt({
              operationId: planned.operationId,
              machineId: planned.machineId,
              kind: 'action',
              status: 'accepted',
              ...(operation.receipt?.status === 'accepted' &&
              operation.receipt.kind === 'action' &&
              operation.receipt.activityId !== undefined
                ? { activityId: operation.receipt.activityId }
                : {}),
              observedAt: now(),
            }),
            'confirmation',
          );
          return;
        }
        if (answer.status === 'refuted') {
          await record(operation, 'rejected', refusedReceipt(planned, providerFailure(answer)), 'confirmation');
          return;
        }
      }
    } else if (session && operation.receipt?.status === 'unknown' && planned.kind !== 'hold') {
      let reply: MachineCommandReceipt | undefined;
      try {
        reply = await session.reconcile({
          operationId: planned.operationId,
          kind: planned.kind,
          ...(typeof intent['transferId'] === 'string' ? { transferId: intent['transferId'] } : {}),
          signal,
        });
      } catch {
        reply = undefined;
      }
      if (reply !== undefined && reply.status !== 'unknown') {
        let receipt: MachineOperationReceipt | undefined;
        try {
          receipt = operationReceipt(planned, reply);
        } catch {
          receipt = undefined;
        }
        if (receipt) {
          await record(operation, receipt.status === 'rejected' ? 'rejected' : 'accepted', receipt, 'reconciliation');
          return;
        }
      }
    }
    if (
      operation.state === 'confirming' &&
      operation.receipt &&
      operation.confirmingSince !== undefined &&
      Date.parse(now()) - Date.parse(operation.confirmingSince) >= confirmationWindow
    ) {
      await record(operation, 'attention', operation.receipt, 'escalation');
    }
  };

  /** The check running for each operation; one at a time per operation. */
  const settling = new Map<string, Promise<void>>();
  /** Operations a report reached while their check was running; each is checked once more when it finishes. */
  const reportedWhileSettling = new Set<string>();
  const settleOne = async (operationId: string): Promise<void> => {
    try {
      await effectQueue.queueFor(`operation:${operationId}`, async () => {
        const operation = operations.get(operationId);
        if (operation && machines.get(operation.planned.machineId)?.operations.status === 'open') {
          await settleNow(operation, settlement.signal);
        }
      });
    } catch (error) {
      report(error);
    } finally {
      settling.delete(operationId);
      if (reportedWhileSettling.delete(operationId)) {
        settleAll();
      }
    }
  };
  // ponytail: scans every operation on each report (several per second per machine); index the unsettled ones if a
  // store ever holds thousands.
  function settleAll(): void {
    for (const [operationId, operation] of operations) {
      if (context.isClosed() || (operation.state !== 'confirming' && operation.state !== 'attention')) {
        continue;
      }
      if (settling.has(operationId)) {
        reportedWhileSettling.add(operationId);
        continue;
      }
      settling.set(operationId, settleOne(operationId));
    }
  }
  const stopSettling = context.commits.subscribe(settleAll);
  // A silent machine still escalates: reports drive settling, and this clock drives the 180-second escalation.
  const escalation = setInterval(settleAll, 5000);
  escalation.unref?.();

  // ───────────── Holds ─────────────

  type ActiveHold = {
    operation: NodeMachineOperationState;
    provider: MachineProviderHold;
    lease: number;
    timer?: ReturnType<typeof setTimeout>;
  };
  const holds = new Map<string, ActiveHold>();
  const endHold = async (holdId: string): Promise<MachineOperationReceipt | undefined> => {
    const hold = holds.get(holdId);
    if (!hold) {
      return undefined;
    }
    holds.delete(holdId);
    clearTimeout(hold.timer);
    let receipt: MachineOperationReceipt;
    try {
      receipt = operationReceipt(hold.operation.planned, await hold.provider.release());
    } catch {
      receipt = parseMachineOperationReceipt({
        operationId: holdId,
        machineId: hold.operation.planned.machineId,
        kind: 'hold',
        status: 'unknown',
        reason: 'The release reply was lost; the machine stops by itself within its bound.',
        observedAt: now(),
      });
    }
    try {
      await effectQueue.queueFor(`operation:${holdId}`, async () =>
        record(
          hold.operation,
          receipt.status === 'rejected' ? 'rejected' : receipt.status === 'unknown' ? 'confirming' : 'accepted',
          receipt,
          'attempt',
        ),
      );
    } catch (error) {
      report(error);
    }
    return receipt;
  };
  const arm = (holdId: string, hold: ActiveHold): void => {
    clearTimeout(hold.timer);
    // A missed renewal ends the hold: the host tells the provider to release.
    hold.timer = setTimeout(() => {
      void endHold(holdId);
    }, hold.lease);
  };
  const releaseHolds = async (machineId?: string): Promise<void> => {
    await Promise.all(
      [...holds]
        .filter(([, hold]) => machineId === undefined || hold.operation.planned.machineId === machineId)
        .map(async ([holdId]) => endHold(holdId)),
    );
  };

  // ───────────── Admission ─────────────

  type Asked = Readonly<{
    machineId: string;
    componentId: string;
    capabilityRevision: string;
    operationId: string;
    id: string;
    version: number;
    expectedRunId: string | null;
    parameters: unknown;
    requestedBy: MachineRequester;
    attended?: boolean;
    approval?: Readonly<{ approvedBy: MachineRequester; operationId: string }>;
    kind: 'action' | 'hold';
  }> &
    Admitted;
  type AdmittedAction = Readonly<{
    session: MachineSession;
    descriptor: MachineActionDescriptor | MachineHoldDescriptor;
    parameters: unknown;
    approvalRequired: boolean;
  }>;
  // The host's admission: `checkMachineAction`'s order over the host's own facts, then what only the host can check.
  const admit = async (asked: Asked): Promise<Readonly<{ refusal: MachineFailure }> | AdmittedAction> => {
    const who = caller(asked.admitted, asked.requestedBy);
    if (who === 'agent' && asked.attended === true) {
      return {
        refusal: { code: 'MACHINE_ACTION_PERSON_REQUIRED', message: 'Only a person can say they are at the machine.' },
      };
    }
    const machine = machines.get(asked.machineId);
    const entry = await currentEntry(asked.machineId);
    const session = connectedSessions.get(asked.machineId);
    if (!machine || !entry || !session) {
      return { refusal: { code: 'MACHINE_UNAVAILABLE', message: 'This machine is not connected.' } };
    }
    if (entry.descriptor.capabilities.revision !== asked.capabilityRevision) {
      return {
        refusal: {
          code: 'MACHINE_ACTION_CAPABILITIES_CHANGED',
          message: 'What this machine has installed changed. Look again before you send this.',
        },
      };
    }
    const check = checkMachineAction({
      entry: admissionEntry(entry, who),
      componentId: asked.componentId,
      action: asked.id,
      kind: asked.kind,
      expectedRunId: asked.expectedRunId,
      caller: who,
      attended: asked.attended === true,
      now: Date.parse(now()),
    });
    if (check.status === 'unavailable') {
      const { code, message } = check;
      return { refusal: { code, message } };
    }
    if (check.descriptor.version !== asked.version) {
      return {
        refusal: {
          code: 'MACHINE_ACTION_VERSION_UNSUPPORTED',
          message: `${check.descriptor.label} is version ${String(check.descriptor.version)} on this machine.`,
        },
      };
    }
    const definition = await definitionOf(machine.record.providerId);
    const trusted = machineActionDefinitionOf(definition.manifest, {
      componentId: asked.componentId,
      id: asked.id,
      kind: asked.kind,
    });
    if (!trusted) {
      return { refusal: { code: 'MACHINE_ACTION_UNDECLARED', message: 'This machine does not declare this control.' } };
    }
    const validated = await trusted.schema['~standard'].validate(asked.parameters);
    if (validated.issues) {
      return {
        refusal: {
          code: 'MACHINE_ACTION_PARAMETERS_INVALID',
          message: 'Some values are not valid for this control.',
          issues: validated.issues.slice(0, 32).map((issue) => ({
            path: (issue.path ?? [])
              .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
              .join('.')
              .slice(0, 256),
            message: (issue.message || 'Invalid value.').slice(0, 1024),
          })),
        },
      };
    }
    if (check.status === 'approval-required') {
      const { approval } = asked;
      // An agent session cannot carry a person's approval: external agents use only the unattended list.
      if (
        asked.admitted.actor.kind === 'agent' ||
        approval?.operationId !== asked.operationId ||
        approval.approvedBy.kind !== 'user'
      ) {
        return {
          refusal: {
            code: 'MACHINE_ACTION_APPROVAL_REQUIRED',
            message: `A person must approve “${check.descriptor.label}” in Tau first.`,
          },
        };
      }
    }
    return {
      session,
      descriptor: check.descriptor,
      parameters: validated.value,
      approvalRequired: check.status === 'approval-required',
    };
  };

  const unavailable = (): Error => new Error('MACHINE_OPERATION_UNAVAILABLE');

  return {
    run,
    publish,
    releaseHolds,
    close() {
      stopSettling();
      clearInterval(escalation);
      settlement.abort();
      for (const hold of holds.values()) {
        clearTimeout(hold.timer);
      }
    },
    operations: {
      async applyAction(input) {
        if (!context.runtime) {
          throw unavailable();
        }
        const asked = { ...input, id: input.action, kind: 'action' as const };
        const who = caller(input.admitted, input.requestedBy);
        return run({
          machineId: input.machineId,
          kind: 'action',
          operationId: input.operationId,
          intent: {
            componentId: input.componentId,
            action: input.action,
            version: input.version,
            expectedRunId: input.expectedRunId,
            parameters: input.parameters,
          },
          requestedBy: input.requestedBy,
          ...(who === 'person' && input.attended === true ? { attended: true } : {}),
          machineQueue: true,
          admitted: input.admitted,
          signal: input.signal,
          async admit() {
            const admitted = await admit(asked);
            if ('refusal' in admitted) {
              return admitted;
            }
            const { session, descriptor, parameters } = admitted;
            const { actions } = session;
            if (actions.type === 'unsupported' || !('scope' in descriptor)) {
              return refuse('MACHINE_ACTION_UNSUPPORTED', 'This machine cannot apply actions.');
            }
            return {
              action: {
                componentId: descriptor.componentId,
                id: descriptor.id,
                label: descriptor.label,
                confirms: descriptor.confirms,
              },
              onAccepted: descriptor.confirms === 'observation' ? 'confirming' : 'accepted',
              send: async () =>
                actions.apply({
                  operationId: input.operationId,
                  componentId: input.componentId,
                  action: input.action,
                  version: input.version,
                  expectedRunId: input.expectedRunId,
                  parameters,
                  signal: input.signal,
                }),
            };
          },
        }) as Promise<Extract<MachineOperationReceipt, { kind: 'action' }>>;
      },
      async stop(input) {
        const machineId = identity.parse(input.machineId);
        const operationId = identity.parse(input.operationId ?? randomUUID());
        const session = connectedSessions.get(machineId);
        const send = async (): Promise<MachineCommandReceipt> => {
          if (!session) {
            throw new Error('MACHINE_UNAVAILABLE');
          }
          return session.stop({ operationId, signal: input.signal });
        };
        let receipt: MachineOperationReceipt;
        if (machines.get(machineId)?.operations.status === 'open') {
          receipt = await run({
            machineId,
            kind: 'stop',
            operationId,
            intent: {},
            requestedBy: input.requestedBy,
            machineQueue: false,
            admitted: input.admitted,
            signal: input.signal,
            async admit() {
              return session
                ? { send }
                : refuse('MACHINE_UNAVAILABLE', 'This machine is not connected, so nothing could be stopped.');
            },
          });
        } else {
          // Stop is never gated: a machine whose journal cannot be written is still told to stop.
          receipt = session
            ? operationReceipt({ operationId, machineId, kind: 'stop' }, await send())
            : refusedReceipt(
                { machineId, kind: 'stop', operationId },
                {
                  code: 'MACHINE_UNAVAILABLE',
                  message: 'This machine is not connected, so nothing could be stopped.',
                },
              );
        }
        await releaseHolds(machineId);
        return receipt as Extract<MachineOperationReceipt, { kind: 'stop' }>;
      },
      async beginHold(input) {
        if (!context.runtime) {
          throw unavailable();
        }
        if (caller(input.admitted, input.requestedBy) === 'agent') {
          return {
            status: 'rejected',
            code: 'MACHINE_ACTION_PERSON_REQUIRED',
            message: 'Only a person at the machine can hold a control.',
          };
        }
        let lease = 0;
        let provider: MachineProviderHold | undefined;
        const receipt = await run({
          machineId: input.machineId,
          kind: 'hold',
          operationId: input.operationId,
          intent: { componentId: input.componentId, hold: input.hold, parameters: input.parameters },
          requestedBy: input.requestedBy,
          attended: true,
          machineQueue: true,
          admitted: input.admitted,
          signal: input.signal,
          async admit() {
            const admitted = await admit({ ...input, id: input.hold, kind: 'hold', expectedRunId: null });
            if ('refusal' in admitted) {
              return admitted;
            }
            const { session, descriptor, parameters } = admitted;
            const { holds: facet } = session;
            if (facet.type === 'unsupported' || !('lease' in descriptor)) {
              return refuse('MACHINE_ACTION_UNSUPPORTED', 'This machine cannot hold a control.');
            }
            ({ lease } = descriptor);
            return {
              onAccepted: 'open',
              send: async () => {
                const held = await facet.begin({
                  operationId: input.operationId,
                  componentId: input.componentId,
                  hold: input.hold,
                  parameters,
                  signal: input.signal,
                });
                if ('code' in held) {
                  return { status: 'rejected', code: held.code, message: held.message, observedAt: now() };
                }
                provider = held;
                return { status: 'accepted', observedAt: now() };
              },
            };
          },
        });
        if (receipt.status === 'rejected') {
          const { code, message } = receipt;
          return { status: 'rejected', code, message };
        }
        const operation = operations.get(input.operationId);
        if (!provider || !operation) {
          return {
            status: 'rejected',
            code: 'MACHINE_HOLD_ENDED',
            message: 'This hold has already ended. Press again to hold it.',
          };
        }
        const hold: ActiveHold = { operation, provider, lease };
        holds.set(input.operationId, hold);
        arm(input.operationId, hold);
        return { status: 'held', holdId: input.operationId, lease };
      },
      async renewHold({ holdId }) {
        const hold = holds.get(holdId);
        if (!hold) {
          return { status: 'ended' };
        }
        arm(holdId, hold);
        try {
          await hold.provider.extend();
        } catch (error) {
          report(error);
          await endHold(holdId);
          return { status: 'ended' };
        }
        return { status: holds.has(holdId) ? 'held' : 'ended' };
      },
      async endHold({ holdId }) {
        const receipt = (await endHold(holdId)) ?? operations.get(holdId)?.receipt;
        if (receipt?.kind !== 'hold') {
          throw machineError({ code: 'MACHINE_HOLD_ENDED', message: 'This hold has already ended.' });
        }
        return receipt;
      },
      async reconcileOperation(input) {
        const machineId = identity.parse(input.machineId);
        const operationId = identity.parse(input.operationId);
        return effectQueue.queueFor(`operation:${operationId}`, async () => {
          input.signal.throwIfAborted();
          input.admitted.assertCurrent();
          const machine = machines.get(machineId);
          if (machine?.operations.status === 'corrupt') {
            throw new Error('MACHINE_OPERATIONS_LOG_CORRUPT', { cause: machine.operations.error });
          }
          const operation = operations.get(operationId);
          if (operation?.planned.machineId !== machineId) {
            throw new Error('MACHINE_OPERATION_UNKNOWN');
          }
          await settleNow(operation, input.signal);
          return operationRecord(operation);
        });
      },
      async setTesting(input) {
        if (caller(input.admitted, input.requestedBy) === 'agent') {
          throw machineError({
            code: 'MACHINE_ACTION_PERSON_REQUIRED',
            message: 'Only a person can let untested controls be tried.',
          });
        }
        const machineId = identity.parse(input.machineId);
        return effectQueue.queueFor(`machine:${machineId}`, async () => {
          input.signal.throwIfAborted();
          input.admitted.assertCurrent();
          const machine = machines.get(machineId);
          if (!machine) {
            throw new Error('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
          }
          const { testing: _testing, ...rest } = machine.record;
          machine.record = await context.store.writeMachine(input.enabled ? { ...rest, testing: true } : rest);
          await directory.update({ machineId, testing: input.enabled });
          const listed = await directory.snapshot();
          const entry = listed.entries.find((candidate) => candidate.machineId === machineId);
          if (!entry) {
            throw new Error('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
          }
          return entry;
        });
      },
    },
  };
};
