/**
 * The operation journal each machine keeps in its `journal.jsonl`: one record before anything is sent (`planned`),
 * one as the send begins (`sending`), then each result as it is learned: the reply, a confirmation from the machine's
 * own reports, a reconciliation, or the 180-second escalation to `attention`. Replay folds the journal back into each
 * operation's latest state, and any record that breaks the replay rules makes the whole journal untrustworthy. Every
 * record carries `version: 1`; a record of another version, or of a type this host does not know, is refused, which
 * marks the journal corrupt until a newer Tau reads it.
 *
 * @module
 */

import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { z } from 'zod';

import { cloneBoundedJson } from '@taucad/parameters/json';
import type { MachineEventLog } from '#host/node-machine-event-log.js';
import { machineFailureCodes } from '#machines/machine-actions.js';
import type { MachineFailure, MachineFailureCode } from '#machines/machine-actions.js';
import { parseMachineOperationReceipt } from '#machines/machine-channel.js';
import { machineRequesterSchema } from '#machines/machine-jobs.js';
import type {
  MachineOperation,
  MachineOperationKind,
  MachineOperationReceipt,
  MachineReceipt,
} from '#machines/machine-jobs.js';
import type { MachineCommandReceipt } from '#machines/machine.js';

/** A well-formed string of 1–256 characters: every id, name and code the host records. @internal */
export const identity = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());

/** A `sha256:` content digest. @internal */
export const digest = z.custom<ContentDigest>(
  (value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value),
);

/** The readable message a refusal carries. @internal */
export const receiptMessage = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => value.isWellFormed());

/**
 * How long an operation may go unproven before a person is asked to look. Milliseconds. The X1C proves a start only
 * through its status reports, 15–41 s after `project_file` on the 2026-10-03 send (blueprint x1c-start-confirmation,
 * F1–F2).
 * @internal
 */
export const confirmationWindow = 180_000;

/** The journal record version this host writes and reads; a newer version's reader also accepts this one. @internal */
export const journalVersion = 1;

const timestamp = z.iso.datetime({ offset: true });
const intentLimits = {
  code: 'NODE_MACHINE_OPERATION_INPUT',
  maximumDepth: 24,
  maximumNodes: 4096,
  maximumCharacters: 131_072,
};
const receiptSchema = z.unknown().transform((value) => parseMachineOperationReceipt(value));
const plannedSchema = z.strictObject({
  version: z.literal(journalVersion),
  type: z.literal('machine-operation-planned'),
  machineId: identity,
  providerId: identity,
  physicalMachineId: identity,
  operationId: identity,
  kind: z.enum(['action', 'stop', 'hold', 'transfer', 'start']),
  inputDigest: digest,
  /** What was asked, as digested; what a confirmation or reconciliation needs to ask the provider again. */
  intent: z.unknown().transform((value) => cloneBoundedJson(value, intentLimits)),
  requestedBy: machineRequesterSchema.optional(),
  attended: z.boolean().optional(),
  action: z
    .strictObject({
      componentId: identity,
      id: identity,
      label: identity,
      confirms: z.enum(['observation', 'acknowledgement', 'none']),
    })
    .optional(),
  plannedAt: timestamp,
});
const sendingSchema = z.strictObject({
  version: z.literal(journalVersion),
  type: z.literal('machine-operation-sending'),
  operationId: identity,
  observedAt: timestamp,
});
const resultSchema = z.strictObject({
  version: z.literal(journalVersion),
  type: z.literal('machine-operation-result'),
  operationId: identity,
  source: z.enum(['attempt', 'confirmation', 'reconciliation', 'escalation', 'recovery']),
  state: z.enum(['accepted', 'rejected', 'confirming', 'attention']),
  receipt: receiptSchema,
  observedAt: timestamp,
});
const journalEventSchema = z.discriminatedUnion('type', [plannedSchema, sendingSchema, resultSchema]);

/** One operation's first record. @internal */
export type NodeMachineOperationPlanned = Readonly<z.output<typeof plannedSchema>>;
/** One operation's result record. @internal */
export type NodeMachineOperationResult = Readonly<z.output<typeof resultSchema>>;
/** Any record of a machine's journal. @internal */
export type NodeMachineJournalEvent = Readonly<z.output<typeof journalEventSchema>>;

/** One recorded operation's latest state, as its journal leaves it. @internal */
export type NodeMachineOperationState = {
  planned: NodeMachineOperationPlanned;
  state: MachineOperation['state'];
  updatedAt: string;
  receipt?: MachineOperationReceipt;
  confirmingSince?: string;
};

const nextStates: Readonly<Record<MachineOperation['state'], ReadonlySet<string>>> = {
  planned: new Set(),
  sending: new Set(['accepted', 'rejected', 'confirming']),
  confirming: new Set(['accepted', 'rejected', 'attention']),
  attention: new Set(['accepted', 'rejected']),
  accepted: new Set(),
  rejected: new Set(),
};

/**
 * Parse one journal record.
 * @internal
 * @param candidate - An untrusted record.
 * @returns The frozen record.
 */
export const parseJournalEvent = (candidate: unknown): NodeMachineJournalEvent =>
  Object.freeze(journalEventSchema.parse(candidate));

/**
 * Apply one result to an operation's state, under the same rules replay enforces.
 * @internal
 * @param operation - The operation, changed in place.
 * @param result - The result record.
 */
export const applyOperationResult = (
  operation: NodeMachineOperationState,
  result: NodeMachineOperationResult,
): void => {
  const { receipt } = result;
  if (
    receipt.operationId !== operation.planned.operationId ||
    receipt.machineId !== operation.planned.machineId ||
    receipt.kind !== operation.planned.kind ||
    !nextStates[operation.state].has(result.state)
  ) {
    throw new Error('NODE_MACHINE_OPERATION_INVALID_RESULT');
  }
  operation.state = result.state;
  operation.updatedAt = result.observedAt;
  operation.receipt = receipt;
  if (result.state === 'confirming') {
    operation.confirmingSince ??= result.observedAt;
  }
};

/**
 * Fold one machine's journal under the replay rules. Any violation makes the whole journal unusable, since an
 * operation whose history cannot be trusted must never be sent again.
 * @internal
 * @param machineId - The machine whose directory holds the journal.
 * @param log - Its recovered journal.
 * @returns Each recorded operation's latest state, by operation id.
 */
export const replayJournal = async (
  machineId: string,
  log: MachineEventLog<NodeMachineJournalEvent>,
): Promise<Map<string, NodeMachineOperationState>> => {
  const replayed = new Map<string, NodeMachineOperationState>();
  for (let cursor = 0; ; ) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the journal folds in sequence.
    const page = await log.replay({ cursor, limit: 128 });
    for (const { event } of page.records) {
      if (event.type === 'machine-operation-planned') {
        if (replayed.has(event.operationId)) {
          throw new Error('NODE_MACHINE_OPERATION_DUPLICATE');
        }
        if (event.machineId !== machineId) {
          throw new Error('NODE_MACHINE_OPERATION_MACHINE_MISMATCH');
        }
        replayed.set(event.operationId, { planned: event, state: 'planned', updatedAt: event.plannedAt });
        continue;
      }
      const operation = replayed.get(event.operationId);
      if (!operation) {
        throw new Error('NODE_MACHINE_OPERATION_ORPHAN');
      }
      if (event.type === 'machine-operation-sending') {
        if (operation.state !== 'planned') {
          throw new Error('NODE_MACHINE_OPERATION_INVALID_SENDING');
        }
        operation.state = 'sending';
        operation.updatedAt = event.observedAt;
        continue;
      }
      applyOperationResult(operation, event);
    }
    if (page.records.length === 0 || page.nextCursor >= page.endCursor) {
      return replayed;
    }
    cursor = page.nextCursor;
  }
};

const encoder = new TextEncoder();

/**
 * The digest that makes an operation id idempotent: the same id with the same digest is the same operation.
 * @internal
 * @param input - The machine, the kind and the bounded intent.
 * @returns The digest.
 */
export const operationInputDigest = async (
  input: Readonly<{ machineId: string; kind: MachineOperationKind; intent: unknown }>,
): Promise<ContentDigest> =>
  digestContent({
    bytes: encoder.encode(
      canonicalizeCacheValue({ value: cloneBoundedJson({ ...input }, intentLimits) satisfies CacheValue }),
    ),
  });

const failureCodes: ReadonlySet<string> = new Set(machineFailureCodes);

/**
 * A provider's refusal as a structured failure: its own code when it is one of the host's, otherwise
 * `MACHINE_ACTION_PROVIDER_REJECTED` with the provider's code kept in the message.
 * @internal
 * @param refusal - The provider's code and message.
 * @returns The failure.
 */
export const providerFailure = (refusal: Readonly<{ code: string; message: string }>): MachineFailure => {
  const message = receiptMessage.safeParse(refusal.message).success ? refusal.message : 'The machine refused.';
  return failureCodes.has(refusal.code)
    ? { code: refusal.code as MachineFailureCode, message }
    : { code: 'MACHINE_ACTION_PROVIDER_REJECTED', message: `${message} (${refusal.code.slice(0, 64)})`.slice(0, 1024) };
};

/**
 * Whether a receipt is of one operation kind, narrowing it without an assertion.
 * @internal
 * @param receipt - Any receipt.
 * @param kind - The kind asked for.
 * @returns Whether the receipt is of that kind.
 */
export const isReceiptOf = <Kind extends MachineOperationKind>(
  receipt: MachineOperationReceipt,
  kind: Kind,
): receipt is MachineReceipt<Kind> => receipt.kind === kind;

/**
 * The public receipt of one operation from its provider's reply.
 * @internal
 * @param planned - The operation.
 * @param reply - The provider's reply.
 * @returns The validated receipt.
 */
export const operationReceipt = (
  planned: Pick<NodeMachineOperationPlanned, 'operationId' | 'machineId' | 'kind'>,
  reply: MachineCommandReceipt,
): MachineOperationReceipt => {
  const base = { operationId: planned.operationId, machineId: planned.machineId, kind: planned.kind };
  if (reply.status === 'rejected') {
    return parseMachineOperationReceipt({
      ...base,
      status: 'rejected',
      ...providerFailure(reply),
      observedAt: reply.observedAt,
    });
  }
  if (reply.status === 'unknown') {
    return parseMachineOperationReceipt({
      ...base,
      status: 'unknown',
      reason: reply.reason,
      observedAt: reply.observedAt,
    });
  }
  const evidence =
    planned.kind === 'action'
      ? reply.activityId === undefined
        ? {}
        : { activityId: reply.activityId }
      : planned.kind === 'transfer'
        ? { transferId: reply.transferId }
        : planned.kind === 'start'
          ? reply.runId === undefined
            ? {}
            : { runId: reply.runId }
          : {};
  return parseMachineOperationReceipt({ ...base, status: 'accepted', ...evidence, observedAt: reply.observedAt });
};

/**
 * The record a client reads of one operation.
 * @internal
 * @param operation - The operation's latest state.
 * @returns The frozen record.
 */
export const operationRecord = (operation: NodeMachineOperationState): MachineOperation => {
  const { planned } = operation;
  const activityId =
    operation.receipt?.status === 'accepted' && operation.receipt.kind === 'action'
      ? operation.receipt.activityId
      : undefined;
  return Object.freeze({
    operationId: planned.operationId,
    machineId: planned.machineId,
    kind: planned.kind,
    inputDigest: planned.inputDigest,
    state: operation.state,
    updatedAt: operation.updatedAt,
    ...(operation.receipt ? { receipt: operation.receipt } : {}),
    ...(operation.confirmingSince === undefined ? {} : { confirmingSince: operation.confirmingSince }),
    ...(planned.requestedBy === undefined ? {} : { requestedBy: planned.requestedBy }),
    ...(planned.attended === undefined ? {} : { attended: planned.attended }),
    ...(planned.action === undefined
      ? {}
      : {
          action: {
            componentId: planned.action.componentId,
            id: planned.action.id,
            label: planned.action.label,
            ...(activityId === undefined ? {} : { activityId }),
          },
        }),
  });
};

/**
 * A refusal a client can act on: its message is the sentence to show, its `code` the structured failure code.
 * @internal
 * @param failure - The failure.
 * @returns The error to throw.
 */
export const machineError = (failure: MachineFailure): Error =>
  Object.assign(new Error(failure.message, { cause: failure }), { code: failure.code });
