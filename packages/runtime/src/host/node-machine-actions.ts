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
  isReceiptOf,
  journalVersion,
  machineError,
  operationInputDigest,
  operationReceipt,
  operationRecord,
  parseJournalEvent,
  providerFailure,
} from '#host/node-machine-operations.js';
import type { NodeMachineOperationPlanned, NodeMachineOperationState } from '#host/node-machine-operations.js';
import type { AdmittedHostOperation, HostActor } from '#host/host-admission.js';
import { parseMachineOperationReceipt } from '#machines/machine-channel.js';
import type { MachineChannelHostOperations } from '#machines/machine-channel.js';
import type { MachineApplyActionInput } from '#machines/machine-client.js';
import type { MachineDirectoryEntry } from '#machines/machine-directory.js';
import type {
  MachineOperation,
  MachineOperationKind,
  MachineOperationReceipt,
  MachineReceipt,
  MachineRequester,
} from '#machines/machine-jobs.js';
import { machineActionDefinitionOf } from '#machines/machine.js';
import type { MachineCommandReceipt, MachineProviderHold, MachineSession } from '#machines/machine.js';

type Admitted = Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>;

/** What an admission decides: a refusal, or how to send. @internal */
export type NodeMachineAdmission =
  | Readonly<{ refusal: MachineFailure }>
  | Readonly<{
      /** `confirming`: accepted only once the machine's reports show it. `open`: the result comes later (a hold). */
      onAccepted?: 'accepted' | 'confirming' | 'open';
      action?: NodeMachineOperationPlanned['action'];
      send(): Promise<MachineCommandReceipt>;
    }>;

/** One operation to run once. @internal */
export type NodeMachineRunInput<Kind extends MachineOperationKind = MachineOperationKind> = Readonly<{
  machineId: string;
  kind: Kind;
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
    | 'applyAction'
    | 'approveAction'
    | 'stop'
    | 'beginHold'
    | 'renewHold'
    | 'endHold'
    | 'reconcileOperation'
    | 'setTesting'
  >;
  run<Kind extends MachineOperationKind>(input: NodeMachineRunInput<Kind>): Promise<MachineReceipt<Kind>>;
  /** Publish a machine's recent operations into its directory entry. */
  publish(machineId: string): Promise<void>;
  /** End every hold of a machine (or of every machine), telling the provider to release. */
  releaseHolds(machineId?: string): Promise<void>;
  close(): void;
}>;

const maximumRecent = 64;
/** How long a person's approval or denial waits for the agent's call, in milliseconds. */
const approvalLifetime = 10 * 60_000;
const authorityRank: Readonly<Record<MachineAuthority, number>> = { agent: 0, 'approved-agent': 1, person: 2 };
/** Each standard family's floor, by action id. */
const standardFamilies: ReadonlyMap<string, Readonly<{ authority: MachineAuthority; attended: boolean }>> = new Map(
  Object.entries(standardMachineActions),
);
const sameActor = (left: HostActor, right: HostActor): boolean => left.kind === right.kind && left.id === right.id;

const caller = (admitted: AdmittedHostOperation, requestedBy: MachineRequester): 'person' | 'agent' =>
  admitted.actor.kind === 'agent' || requestedBy.kind === 'agent' ? 'agent' : 'person';

/**
 * The floor the host admits a descriptor under: never below its standard family's, except where the host's own
 * low-risk list lets an agent act.
 * @param componentKind - The kind of the component the descriptor targets.
 * @param descriptor - The installed action or hold.
 * @returns The safety the host admits it under.
 */
const effectiveSafety = (
  componentKind: string,
  descriptor: MachineActionDescriptor | MachineHoldDescriptor,
): MachineActionSafety => {
  const family = standardFamilies.get(descriptor.id);
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

// The entry with every descriptor at the floor the host admits it under.
const admissionEntry = (entry: MachineDirectoryEntry): MachineDirectoryEntry => {
  const { capabilities } = entry.descriptor;
  const kindOf = (componentId: string): string =>
    capabilities.components.find((component) => component.id === componentId)?.kind ?? '';
  // Testing stays as reported: `checkMachineAction` refuses an agent a designed control whether or not it is on.
  return {
    ...entry,
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
      .map((operation) => operationRecord(operation));
    await directory.update({ machineId, operations: recent });
  };

  const record = async (
    operation: NodeMachineOperationState,
    result: Readonly<{
      state: 'accepted' | 'rejected' | 'confirming' | 'attention';
      receipt: MachineOperationReceipt;
      source: 'attempt' | 'confirmation' | 'reconciliation' | 'escalation';
    }>,
  ): Promise<void> => {
    const { state, receipt, source } = result;
    const { log } = context.usableMachine(operation.planned.machineId, 'MACHINE_UNAVAILABLE');
    const event = parseJournalEvent({
      version: journalVersion,
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

  const run = async <Kind extends MachineOperationKind>(
    input: NodeMachineRunInput<Kind>,
  ): Promise<MachineReceipt<Kind>> => {
    const operationId = identity.parse(input.operationId);
    const machineId = identity.parse(input.machineId);
    const inputDigest = await operationInputDigest({ machineId, kind: input.kind, intent: input.intent });
    const queues = input.machineQueue
      ? [`operation:${operationId}`, `machine:${machineId}`]
      : [`operation:${operationId}`];
    // A receipt the journal holds under this id is of this kind once the kind check above has passed.
    const ofKind = (receipt: MachineOperationReceipt): MachineReceipt<Kind> => {
      if (!isReceiptOf(receipt, input.kind)) {
        throw new Error('NODE_MACHINE_OPERATION_INVALID');
      }
      return receipt;
    };
    return effectQueue.queueForMany(queues, async (): Promise<MachineReceipt<Kind>> => {
      const existing = operations.get(operationId);
      if (
        existing &&
        (existing.planned.inputDigest !== inputDigest ||
          existing.planned.machineId !== machineId ||
          existing.planned.kind !== input.kind)
      ) {
        return ofKind(
          refusedReceipt(input, {
            code: 'MACHINE_OPERATION_ID_CONFLICT',
            message: 'This operation id was already used for something else.',
          }),
        );
      }
      if (existing?.receipt) {
        return ofKind(existing.receipt);
      }
      if (existing && existing.state !== 'planned') {
        throw new Error('MACHINE_OPERATION_UNRESOLVED');
      }
      const machine = machines.get(machineId);
      if (!machine) {
        return ofKind(
          refusedReceipt(input, { code: 'MACHINE_UNAVAILABLE', message: 'This machine is not bound here.' }),
        );
      }
      const { record: binding, log } = context.usableMachine(machineId, 'MACHINE_UNAVAILABLE');
      const admission = await input.admit();
      if ('refusal' in admission) {
        return ofKind(refusedReceipt(input, admission.refusal));
      }
      input.signal.throwIfAborted();
      input.admitted.assertCurrent();
      let operation = existing;
      if (!operation) {
        const planned = parseJournalEvent({
          version: journalVersion,
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
      await log.append({
        version: journalVersion,
        type: 'machine-operation-sending',
        operationId,
        observedAt: sendingAt,
      });
      operation.state = 'sending';
      operation.updatedAt = sendingAt;
      await publish(machineId);
      let receipt: MachineOperationReceipt;
      try {
        receipt = operationReceipt(operation.planned, await admission.send());
      } catch (error) {
        report(error);
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
        return ofKind(receipt);
      }
      await record(operation, {
        state:
          receipt.status === 'rejected'
            ? 'rejected'
            : receipt.status === 'unknown' || admission.onAccepted === 'confirming'
              ? 'confirming'
              : 'accepted',
        receipt,
        source: 'attempt',
      });
      return ofKind(receipt);
    });
  };

  // A stop is journaled as it is sent, never before: the planned and sending records, then the reply, each as far as
  // the journal takes them. A journal that refuses is reported; the machine was told to stop either way.
  const journalStop = async (
    input: Readonly<{ machineId: string; operationId: string; requestedBy: MachineRequester; sentAt: string }>,
    receipt: MachineReceipt<'stop'>,
  ): Promise<void> => {
    const { machineId, operationId } = input;
    if (machines.get(machineId)?.operations.status !== 'open') {
      return;
    }
    try {
      await effectQueue.queueFor(`operation:${operationId}`, async () => {
        const { record: binding, log } = context.usableMachine(machineId, 'MACHINE_UNAVAILABLE');
        let operation = operations.get(operationId);
        if (!operation) {
          const planned = parseJournalEvent({
            version: journalVersion,
            type: 'machine-operation-planned',
            machineId,
            providerId: binding.providerId,
            physicalMachineId: binding.physicalId,
            operationId,
            kind: 'stop',
            inputDigest: await operationInputDigest({ machineId, kind: 'stop', intent: {} }),
            intent: {},
            requestedBy: input.requestedBy,
            plannedAt: input.sentAt,
          });
          if (planned.type !== 'machine-operation-planned') {
            throw new Error('NODE_MACHINE_OPERATION_INVALID');
          }
          await log.append(planned);
          operation = { planned, state: 'planned', updatedAt: planned.plannedAt };
          operations.set(operationId, operation);
        }
        if (operation.state === 'planned') {
          await log.append({
            version: journalVersion,
            type: 'machine-operation-sending',
            operationId,
            observedAt: input.sentAt,
          });
          operation.state = 'sending';
          operation.updatedAt = input.sentAt;
        }
        if (operation.state === 'sending') {
          await record(operation, {
            state:
              receipt.status === 'rejected' ? 'rejected' : receipt.status === 'unknown' ? 'confirming' : 'accepted',
            receipt,
            source: 'attempt',
          });
        }
      });
    } catch (error) {
      report(error);
    }
  };

  // Settle one operation from what the machine has reported; nothing is ever sent. Escalates one left unproven. The
  // provider lookup (`reconcile`) runs only when asked: from the escalation clock and `reconcileOperation`, never per
  // report, so a chatty machine does not drive a lookup per report for every unproven operation.
  const settleNow = async (
    operation: NodeMachineOperationState,
    signal: AbortSignal,
    reconcile: boolean,
  ): Promise<void> => {
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
          expectedRunId: typeof intent['expectedRunId'] === 'string' ? intent['expectedRunId'] : null,
          parameters: intent['parameters'],
        });
        if (answer.status === 'confirmed') {
          await record(operation, {
            state: 'accepted',
            receipt: parseMachineOperationReceipt({
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
            source: 'confirmation',
          });
          return;
        }
        if (answer.status === 'refuted') {
          await record(operation, {
            state: 'rejected',
            receipt: refusedReceipt(planned, providerFailure(answer)),
            source: 'confirmation',
          });
          return;
        }
      }
    } else if (reconcile && session && operation.receipt?.status === 'unknown' && planned.kind !== 'hold') {
      let reply: MachineCommandReceipt | undefined;
      try {
        reply = await session.reconcile({
          operationId: planned.operationId,
          kind: planned.kind,
          ...(typeof intent['transferId'] === 'string' ? { transferId: intent['transferId'] } : {}),
          signal,
        });
      } catch (error) {
        report(error);
        reply = undefined;
      }
      if (reply !== undefined && reply.status !== 'unknown') {
        let receipt: MachineOperationReceipt | undefined;
        try {
          receipt = operationReceipt(planned, reply);
        } catch (error) {
          report(error);
          receipt = undefined;
        }
        if (receipt) {
          await record(operation, {
            state: receipt.status === 'rejected' ? 'rejected' : 'accepted',
            receipt,
            source: 'reconciliation',
          });
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
      await record(operation, { state: 'attention', receipt: operation.receipt, source: 'escalation' });
    }
  };

  /** The check running for each operation; one at a time per operation. */
  const settling = new Map<string, Promise<void>>();
  /** Operations a report reached while their check was running; each is checked once more when it finishes. */
  const reportedWhileSettling = new Set<string>();
  /** Operations the escalation clock asked to look up at the provider on their next check. */
  const reconcileWanted = new Set<string>();
  const settleOne = async (operationId: string): Promise<void> => {
    try {
      await effectQueue.queueFor(`operation:${operationId}`, async () => {
        const operation = operations.get(operationId);
        const reconcile = reconcileWanted.delete(operationId);
        if (operation && machines.get(operation.planned.machineId)?.operations.status === 'open') {
          await settleNow(operation, settlement.signal, reconcile);
        }
      });
    } catch (error) {
      report(error);
    } finally {
      settling.delete(operationId);
      if (reportedWhileSettling.delete(operationId)) {
        settleAll(false);
      }
    }
  };
  // ponytail: scans every operation on each report (several per second per machine); index the unsettled ones if a
  // store ever holds thousands.
  function settleAll(reconcile: boolean): void {
    for (const [operationId, operation] of operations) {
      if (context.isClosed() || (operation.state !== 'confirming' && operation.state !== 'attention')) {
        continue;
      }
      if (reconcile) {
        reconcileWanted.add(operationId);
      }
      if (settling.has(operationId)) {
        reportedWhileSettling.add(operationId);
        continue;
      }
      settling.set(operationId, settleOne(operationId));
    }
  }
  const stopSettling = context.commits.subscribe(() => {
    settleAll(false);
  });
  // A silent machine still escalates: reports drive the pure confirmation, and this clock drives the provider lookup
  // and the 180-second escalation.
  const escalation = setInterval(() => {
    settleAll(true);
  }, 5000);
  escalation.unref();

  // ───────────── Holds ─────────────

  type ActiveHold = {
    operation: NodeMachineOperationState;
    provider: MachineProviderHold;
    /** Who began it: the only actor whose renewals keep it. */
    actor: HostActor;
    /** Milliseconds. */
    lease: number;
    timer?: ReturnType<typeof setTimeout>;
  };
  const holds = new Map<string, ActiveHold>();
  const release = async (holdId: string, hold: ActiveHold): Promise<MachineOperationReceipt> => {
    let receipt: MachineOperationReceipt;
    try {
      receipt = operationReceipt(hold.operation.planned, await hold.provider.release());
    } catch (error) {
      report(error);
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
        record(hold.operation, {
          state: receipt.status === 'rejected' ? 'rejected' : receipt.status === 'unknown' ? 'confirming' : 'accepted',
          receipt,
          source: 'attempt',
        }),
      );
    } catch (error) {
      report(error);
    }
    return receipt;
  };
  /** Holds being released, so a caller who ends one already ending gets the same receipt. */
  const endings = new Map<string, Promise<MachineOperationReceipt>>();
  const endHold = async (holdId: string): Promise<MachineOperationReceipt | undefined> => {
    const ending = endings.get(holdId);
    if (ending) {
      return ending;
    }
    const hold = holds.get(holdId);
    if (!hold) {
      return undefined;
    }
    holds.delete(holdId);
    clearTimeout(hold.timer);
    const released = (async (): Promise<MachineOperationReceipt> => {
      try {
        return await release(holdId, hold);
      } finally {
        endings.delete(holdId);
      }
    })();
    endings.set(holdId, released);
    return released;
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
    expectedRunId: MachineApplyActionInput['expectedRunId'];
    parameters: unknown;
    requestedBy: MachineRequester;
    attended?: boolean;
    kind: 'action' | 'hold';
  }> &
    Admitted;
  type AdmittedAction = Readonly<{
    session: MachineSession;
    descriptor: MachineActionDescriptor | MachineHoldDescriptor;
    parameters: unknown;
    approvalRequired: boolean;
  }>;
  // ───────────── Approvals ─────────────

  /** A person's decision on one agent operation, by operation id: what it covers and until when. */
  type ActionApproval = Readonly<{ decision: 'approve' | 'deny'; inputDigest: string; expiresAt: number }>;
  // ponytail: in memory, pruned of expired records on each decision; a restart drops pending approvals (the person
  // approves again). Bounded by what people decide in ten minutes.
  const approvals = new Map<string, ActionApproval>();
  // What an approval covers: the journal's digest over the action as the person saw it. The run fence is not part of
  // it; admission checks the run when the action is sent.
  const approvalDigest = async (
    machineId: string,
    intent: Readonly<{ componentId: string; action: string; version: number; parameters: unknown }>,
  ): Promise<string> =>
    operationInputDigest({
      machineId,
      kind: 'action',
      intent: {
        componentId: intent.componentId,
        action: intent.action,
        version: intent.version,
        parameters: intent.parameters,
      },
    });
  // Consume the person's decision on this operation, once: an approval of exactly this request admits it; a denial is
  // returned to the agent; anything else still needs a person.
  const takeApproval = async (asked: Asked, label: string): Promise<MachineFailure | undefined> => {
    const record = approvals.get(asked.operationId);
    if (!record || record.expiresAt <= Date.parse(now())) {
      return { code: 'MACHINE_ACTION_APPROVAL_REQUIRED', message: `A person must approve “${label}” in Tau first.` };
    }
    const asking = await approvalDigest(asked.machineId, {
      componentId: asked.componentId,
      action: asked.id,
      version: asked.version,
      parameters: asked.parameters,
    });
    if (record.inputDigest !== asking) {
      return {
        code: 'MACHINE_ACTION_APPROVAL_REQUIRED',
        message: `The approval of “${label}” was for other values. Ask a person again.`,
      };
    }
    approvals.delete(asked.operationId);
    return record.decision === 'deny'
      ? { code: 'MACHINE_ACTION_APPROVAL_REQUIRED', message: `A person declined “${label}”.` }
      : undefined;
  };

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
      entry: admissionEntry(entry),
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
      // Only the host's own record counts: nothing in the request can claim a person's approval.
      const refusal = await takeApproval(asked, check.descriptor.label);
      if (refusal) {
        return { refusal };
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
        const asked: Asked = { ...input, id: input.action, kind: 'action' };
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
                  requestedBy: { kind: input.admitted.actor.kind },
                  signal: input.signal,
                }),
            };
          },
        });
      },
      async approveAction(input) {
        const machineId = identity.parse(input.machineId);
        const operationId = identity.parse(input.operationId);
        // An agent never approves, its own request or another's: only a person's session records a decision.
        if (input.admitted.actor.kind !== 'user') {
          return {
            status: 'refused',
            code: 'MACHINE_ACTION_PERSON_REQUIRED',
            message: 'Only a person can approve a machine action.',
          };
        }
        const entry = await currentEntry(machineId);
        if (!entry) {
          return { status: 'refused', code: 'MACHINE_UNAVAILABLE', message: 'This machine is not bound here.' };
        }
        const { intent } = input;
        if (
          !entry.descriptor.capabilities.actions.some(
            (action) => action.componentId === intent.componentId && action.id === intent.action,
          )
        ) {
          return {
            status: 'refused',
            code: 'MACHINE_ACTION_UNDECLARED',
            message: 'This machine does not declare this control.',
          };
        }
        const inputDigest = await approvalDigest(machineId, intent);
        const decidedAt = Date.parse(now());
        for (const [id, record] of approvals) {
          if (record.expiresAt <= decidedAt) {
            approvals.delete(id);
          }
        }
        const expiresAt = decidedAt + approvalLifetime;
        approvals.set(operationId, { decision: input.decision, inputDigest, expiresAt });
        return input.decision === 'approve'
          ? { status: 'approved', operationId, expiresAt: new Date(expiresAt).toISOString() }
          : { status: 'denied', operationId };
      },
      async stop(input) {
        const machineId = identity.parse(input.machineId);
        const operationId = identity.parse(input.operationId ?? randomUUID());
        const planned = { operationId, machineId, kind: 'stop' } as const;
        const ofStop = (receipt: MachineOperationReceipt): MachineReceipt<'stop'> => {
          if (!isReceiptOf(receipt, 'stop')) {
            throw new Error('NODE_MACHINE_OPERATION_INVALID');
          }
          return receipt;
        };
        const existing = operations.get(operationId);
        if (existing && (existing.planned.machineId !== machineId || existing.planned.kind !== 'stop')) {
          return ofStop(
            refusedReceipt(planned, {
              code: 'MACHINE_OPERATION_ID_CONFLICT',
              message: 'This operation id was already used for something else.',
            }),
          );
        }
        if (existing?.receipt) {
          return ofStop(existing.receipt);
        }
        const session = connectedSessions.get(machineId);
        let receipt: MachineReceipt<'stop'>;
        if (session) {
          // Nothing gates a stop and nothing queues ahead of it: it is sent first and journaled as far as the journal
          // allows, so a full disk or a lost writer lock never keeps the machine running.
          const sentAt = now();
          let reply: MachineCommandReceipt;
          try {
            reply = await session.stop({ operationId, signal: input.signal });
          } catch (error) {
            report(error);
            reply = {
              status: 'unknown',
              reason: 'The reply was lost after the command may have been sent.',
              observedAt: now(),
            };
          }
          receipt = ofStop(operationReceipt(planned, reply));
          await journalStop({ machineId, operationId, requestedBy: input.requestedBy, sentAt }, receipt);
        } else {
          receipt = ofStop(
            refusedReceipt(planned, {
              code: 'MACHINE_UNAVAILABLE',
              message: 'This machine is not connected, so nothing could be stopped.',
            }),
          );
        }
        await releaseHolds(machineId);
        return receipt;
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
                  requestedBy: { kind: input.admitted.actor.kind },
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
        const hold: ActiveHold = { operation, provider, actor: input.admitted.actor, lease };
        holds.set(input.operationId, hold);
        arm(input.operationId, hold);
        // The first segment goes out with the hold, not with the first renewal a lease later.
        try {
          await provider.extend();
        } catch (error) {
          report(error);
          await endHold(input.operationId);
          return {
            status: 'rejected',
            code: 'MACHINE_HOLD_ENDED',
            message: 'The machine did not take the first move, so the hold ended.',
          };
        }
        return holds.has(input.operationId)
          ? { status: 'held', holdId: input.operationId, lease }
          : { status: 'rejected', code: 'MACHINE_HOLD_ENDED', message: 'This hold has already ended.' };
      },
      async renewHold({ holdId, admitted }) {
        const hold = holds.get(holdId);
        // A hold is leased to the actor who began it: another session's renewal, or an agent's, keeps nothing.
        if (!hold || !sameActor(hold.actor, admitted.actor)) {
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
          await settleNow(operation, input.signal, true);
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
